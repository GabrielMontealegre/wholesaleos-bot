'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { probeProcessSpawn } = require('./helpers/process-capability');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
async function prove() {
  if (!(await probeProcessSpawn()).available) { console.log('ENVIRONMENT_SKIP: workspace-email-reply: process spawn not permitted'); return; }
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  try {
    for (const width of [1366, 400, 412]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1366 ? 768 : 915 } });
      const key = 'a'.repeat(64), stamp = '2026-10-20T12:00:00Z';
      const source = { id: 'source1', thread_key: key, source_kind: 'connected_mailbox', direction: 'in', date: stamp, from: 'Synthetic Person <person@example.test>', sender_name: 'Synthetic Person', subject: 'Synthetic reply', body: 'Synthetic source message' };
      const context = { thread_key: key, message_ids: ['source1'], to: ['person@example.test'], cc: ['copy@example.test'], participants: ['person@example.test', 'copy@example.test'], subject: 'Re: Synthetic reply' };
      const posts = [], external = [], errors = [], countRequests = []; let mode = 'accepted', delay = null, previewMode = 'valid';
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== 'https://fixture.test') { external.push(url.origin); return route.abort(); }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, role: 'admin' } });
        if (url.pathname === '/api/gmail/messages') return route.fulfill({ json: { ok: true, messages: [source],folder_summary_available:true,folder_scope:{folder:'inbox',origin:'gmail_label_counts',scope_id:'INBOX',uid_validity:null} } });
        if(url.pathname==='/api/gmail/folder-summary')return new Promise(resolve=>countRequests.push(async()=>{await route.fulfill({json:{ok:true,summary:{folder:'inbox',origin:'gmail_label_counts',scope_id:'INBOX',uid_validity:null,scope:'messages',source_kind:'connected_mailbox',captured_at:new Date().toISOString(),total_messages:200,unread_messages:12}}});resolve();}));
        if (url.pathname.startsWith('/api/gmail/message/')) return route.fulfill({ json: source });
        if (url.pathname.endsWith('/thread-replies/status')) return route.fulfill({ json: { enabled: true, configured: true, automatic_send_allowed: false } });
        if (url.pathname.endsWith('/thread-replies/context')) return route.fulfill({ json: context });
        if (req.method() !== 'GET') {
          const input = req.postDataJSON(); posts.push({ path: url.pathname, input });
          assert.equal(req.headers()['x-wos-reply-request'], '1'); assert.equal(req.headers()['content-type'], 'application/json');
          if (url.pathname.endsWith('/preview')) return route.fulfill({ json: { ...input, body: previewMode === 'changed' ? input.body + 'unexpected' : input.body, message_ids: input.message_ids.slice().sort(), id: '00000000-0000-4000-8000-000000000001', version: crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'), status: 'preview', reviewed: false, enabled: true, configured: true, created_at: new Date(Date.now() - (previewMode === 'expired' ? 360000 : 0)).toISOString() } });
          assert(url.pathname.endsWith('/send'));
          assert.deepEqual(Object.keys(input).sort(), ['preview_id', 'reviewed', 'version']); assert.equal(input.reviewed, true);
          if (delay) await delay.promise;
          return route.fulfill({ status: mode === 'unknown' ? 502 : mode === 'unauthorized' ? 401 : 200, json: mode === 'accepted' ? { ...input, status: 'accepted', message_id: '<synthetic-reply@example.test>' } : { status: 'unknown', code: 'thread_reply_send_uncertain' } });
        }
        if (url.pathname === '/app') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/workspace/index.html')) });
        assert(url.pathname.startsWith('/dashboard/') && !url.pathname.includes('..'));
        return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../dashboard', url.pathname.slice('/dashboard/'.length))) });
      });
      async function compose() {
        await page.goto('https://fixture.test/app?preview=1&view=email');
        await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-body').waitFor();
        await page.getByRole('button', { name: 'Reply', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('#mail-preview').disabled);
        if(countRequests.length>1&&mode!=='unknown')await countRequests.at(-1)();
      }
      await compose(); assert.equal(posts.length, 0, 'Opening Reply is GET-only');
      assert.equal(await page.getByLabel('To', { exact: true }).inputValue(), 'person@example.test');
      assert.equal(await page.getByLabel('Cc', { exact: true }).inputValue(), 'copy@example.test');
      await page.getByLabel('Message', { exact: true }).fill('Exact synthetic reply. ');
      await page.getByRole('button', { name: 'Preview reply', exact: true }).click();
      await page.getByRole('checkbox', { name: 'I reviewed this message' }).waitFor();
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
      await page.getByRole('checkbox', { name: 'I reviewed this message' }).check();
      await page.locator('.ws-composer').evaluate(form=>{form.dataset.identity='reviewed-form';});
      await countRequests[0]();await page.waitForFunction(()=>document.querySelector('[data-mail-folder-count]').textContent.includes('200 messages'));
      assert.equal(await page.locator('.ws-composer').getAttribute('data-identity'),'reviewed-form');
      assert(await page.getByRole('checkbox',{name:'I reviewed this message'}).isChecked());
      assert(await page.getByRole('button',{name:'Send',exact:true}).isEnabled(),'Late counts preserve the exact reviewed preview');
      await page.getByRole('button', { name: 'Edit reply', exact: true }).click();
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
      await page.getByLabel('To', { exact: true }).fill('typed@example.test');
      await page.getByLabel('Message', { exact: true }).fill('Changed exact synthetic reply. ');
      await page.getByRole('button', { name: 'Preview reply', exact: true }).click();
      await page.getByRole('checkbox', { name: 'I reviewed this message' }).check();
      assert.deepEqual(posts.at(-1).input.added_recipients, ['typed@example.test']);
      assert.equal(posts.at(-1).input.body, 'Changed exact synthetic reply. ');
      const geometry = await page.getByRole('button', { name: 'Send', exact: true }).evaluate(el => { const b = el.getBoundingClientRect(); return { fits: b.top >= 0 && b.bottom <= innerHeight, overflow: document.documentElement.scrollWidth > innerWidth }; });
      assert(geometry.fits && !geometry.overflow, JSON.stringify({ width, geometry }));
      delay = {}; delay.promise = new Promise(resolve => { delay.resolve = resolve; });
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
      assert.equal(posts.filter(p => p.path.endsWith('/send')).length, 1);
      delay.resolve(); delay = null;
      await page.getByText('Accepted by the mail server. Delivery is not confirmed. Check Sent in Gmail.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Close reply', exact: true }).click(); await page.getByRole('button', { name: 'Reply', exact: true }).click();
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
      assert(await page.getByRole('button', { name: 'Preview reply', exact: true }).isDisabled());
      await page.getByRole('button', { name: 'Close reply', exact: true }).click();
      previewMode = 'changed'; await compose();
      await page.getByLabel('Message', { exact: true }).fill('Synthetic changed preview');
      await page.getByRole('button', { name: 'Preview reply', exact: true }).click();
      await page.getByText('Reply preview unavailable. Refresh the conversation or use Gmail.', { exact: true }).waitFor();
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
      assert.equal(posts.filter(p => p.path.endsWith('/send')).length, 1);
      previewMode = 'expired';
      await page.getByRole('button', { name: 'Preview reply', exact: true }).click(); await page.getByRole('checkbox', { name: 'I reviewed this message' }).check();
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByText('Reply changed or preview expired. Preview it again.', { exact: true }).waitFor();
      assert.equal(posts.filter(p => p.path.endsWith('/send')).length, 1, 'Expired preview never posts Send');
      await page.getByRole('button', { name: 'Close reply', exact: true }).click(); previewMode = 'valid';
      mode = 'unknown'; await compose();
      await page.getByLabel('Message', { exact: true }).fill('Synthetic uncertain attempt');
      await page.getByRole('button', { name: 'Preview reply', exact: true }).click(); await page.getByRole('checkbox', { name: 'I reviewed this message' }).check();
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByText('May have sent. Check Sent in Gmail; do not retry.', { exact: true }).waitFor();
      await page.locator('.ws-composer').evaluate(form=>{form.dataset.identity='uncertain-form';});
      await countRequests.at(-1)();await page.waitForFunction(()=>document.querySelector('[data-mail-folder-count]').textContent.includes('200 messages'));
      assert.equal(await page.locator('.ws-composer').getAttribute('data-identity'),'uncertain-form');
      assert(await page.getByText('May have sent. Check Sent in Gmail; do not retry.',{exact:true}).isVisible());
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
      await page.getByRole('button', { name: 'Close reply', exact: true }).click(); await page.getByRole('button', { name: 'Reply', exact: true }).click();
      assert(await page.getByRole('button', { name: 'Preview reply', exact: true }).isDisabled());
      await page.getByRole('button', { name: 'Close reply', exact: true }).click();
      mode = 'unauthorized'; await compose();
      await page.getByLabel('Message', { exact: true }).fill('Synthetic session-loss attempt');
      await page.getByRole('button', { name: 'Preview reply', exact: true }).click(); await page.getByRole('checkbox', { name: 'I reviewed this message' }).check();
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
      assert.equal(await page.locator('.ws-composer').count(), 0);
      assert.deepEqual(external, []); assert.deepEqual(errors, []);
      assert.equal(posts.filter(p => p.path.endsWith('/send')).length, 3, 'Only the three explicit synthetic Send clicks make send requests');
      await page.close();
    }
    console.log('workspace-email-reply:1366/400/412 GET-only open, source defaults, typed additions, exact preview/edit/review, explicit single send, acceptance/uncertainty terminal state and401 clearing; no real mail/external calls passed');
  } finally { await browser.close(); }
}
prove().catch(e => { console.error(e.stack); process.exitCode = 1; });
