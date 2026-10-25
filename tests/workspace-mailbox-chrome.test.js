'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const { annotate } = require('../modules/email/thread-view');
async function prove() {
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  const at = '2026-10-20T12:00:00Z';
  const row = (id, patch = {}) => ({ id, thread_key: id.repeat(64), source_kind: 'connected_mailbox', date: at,
    from: 'Synthetic Person <person@example.test>', sender_name: 'Fixture ' + id, subject: 'Source subject ' + id, snippet: 'Recorded source snippet', ...patch });
  const linked = role => ({ link_status: 'linked', conversation: { role, role_source_kind: 'operator_input', role_recorded_at: at, records: [] } });
  const linkedStore = {
    conversations: [{ id: 'fixture-conversation', role: 'buyer', refs: ['BUY-0001'], channels: ['email'], source_kind: 'operator_input', recorded_at: at, email_message_ids: ['<buyer@example.test>'] }],
    buyers: [{ id: 'fixture-buyer', record_ref: 'BUY-0001' }]
  };
  const buyer = annotate([row('b', { sender_name: 'Fixture needle-b', message_id: '<buyer@example.test>' })], linkedStore, { now: at })[0];
  assert.deepEqual(buyer.conversation.records, [{ kind: 'buyer', id: 'fixture-buyer', ref: 'BUY-0001' }]);
  assert.equal(buyer.conversation.refs, undefined, 'Actual mailbox view intentionally exposes records, not stored conversation refs');
  assert.deepEqual(annotate([buyer], { ...linkedStore, buyers: [...linkedStore.buyers, ...linkedStore.buyers] }, { now: at })[0].conversation.records, [], 'Ambiguous stored record identity does not create a context link');
  const rows = [row('a', { link_status: 'unlinked', conversation: { refs: ['BUY-9999'], records: [{ kind: 'buyer', id: 'forged', ref: 'BUY-9999' }], role: 'buyer' } }), buyer, row('c', linked('seller')), row('d', linked('agent')),
    row('e', { from: 'alerts@redfin.com' }), row('f', { labels: ['WOS/Reports'] }), row('1', linked('holder'))];
  try {
    const sizes = process.argv.includes('--compact-only') ? [{ width: 1038, height: 503 }] : [{ width: 1366, height: 768 }, { width: 400, height: 915 }, { width: 412, height: 915 }, { width: 1038, height: 503 }, { width: 1366, height: 600 }];
    for (const { width, height } of sizes) {
      const page = await browser.newPage({ viewport: { width, height } });
      const forbidden = [], errors = [], reads = []; let bodyReads = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (req.method() !== 'GET' || url.origin !== 'https://fixture.test') { forbidden.push(req.method() + ' ' + url.origin); return route.abort(); }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, role: 'admin' } });
        if (url.pathname === '/api/gmail/messages') { assert.equal(url.searchParams.get('limit'), '50'); reads.push(url.searchParams.get('folder')); return route.fulfill({ json: { ok: true, messages: rows } }); }
        if (url.pathname.startsWith('/api/gmail/message/')) { bodyReads++; const id = url.pathname.split('/').pop(); return route.fulfill({ json: { ...rows.find(row => row.id === id), body: 'Synthetic exact source text <img src=x onerror=attack()>' } }); }
        if (url.pathname.endsWith('/thread-replies/status')) return route.fulfill({ json: { enabled: false, configured: true } });
        if (url.pathname === '/app') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/workspace/index.html')) });
        assert(url.pathname.startsWith('/dashboard/') && !url.pathname.includes('..'));
        return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../dashboard', url.pathname.slice('/dashboard/'.length))) });
      });
      await page.goto('https://fixture.test/app?preview=1&view=email');
      await page.locator('#today-content[aria-busy="false"]').waitFor();
      assert.equal(await page.getByRole('tab').count(), 5);
      assert.equal(await page.locator('.ws-mail-row').count(), 2);
      assert.equal(bodyReads, 0);
      const rail = page.locator('.ws-mail-rail');
      if (await rail.isVisible()) {
        const containment = await rail.evaluate(el => ({ client: [el.clientWidth, el.clientHeight], scroll: [el.scrollWidth, el.scrollHeight], controls: [...el.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => { const r = b.getBoundingClientRect(), p = el.getBoundingClientRect(); return { label: b.getAttribute('aria-label') || b.textContent, width: r.width, height: r.height, inside: r.left >= p.left && r.right <= p.right && r.top >= p.top && r.bottom <= p.bottom }; }) }));
        assert(containment.scroll[0] <= containment.client[0], 'Folder rail must not horizontally scroll: ' + JSON.stringify(containment));
        assert(containment.scroll[1] <= containment.client[1], 'Folder rail must stay fixed, not hide filters in an inner scrollbox');
        assert(containment.controls.every(c => c.width >= 44 && c.height >= 44 && c.inside), 'Every visible rail command fits with a44px target');
      }
      for (const control of await page.locator('.ws-mail-unavailable').all()) {
        assert.equal(await control.getAttribute('title'), 'Not available yet: open in Gmail');
        assert(await control.locator('button').isDisabled());
      }
      await page.locator('.ws-mail-row').filter({ hasText: 'Fixture a' }).click();
      await page.locator('.ws-mail-body').waitFor();
      await page.getByRole('button', { name: 'Conversation context', exact: true }).click();
      assert.equal(await page.getByRole('complementary', { name: 'Conversation context', exact: true }).getByRole('link').count(), 0, 'Unlinked role/ref claims cannot create a record link');
      await page.getByRole('button', { name: 'Close conversation context', exact: true }).click();
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click();
      assert.equal(await page.locator('.ws-mail-range').innerText(), '1-2 of 2 loaded');
      assert(await page.getByRole('button', { name: 'Older mail unavailable', exact: true }).isDisabled());
      const search = page.getByRole('searchbox', { name: 'Search loaded mail', exact: true });
      await search.fill('ＦＩＸＴＵＲＥ');
      assert.equal(await page.locator('.ws-mail-row').count(), 2);
      await search.fill('needle-b');
      assert.equal(await page.locator('.ws-mail-row').count(), 0);
      await page.getByRole('tab', { name: 'Buyers', exact: true }).click();
      assert.equal(await page.locator('.ws-mail-row').count(), 1);
      assert.equal(await page.locator('.ws-mail-row').getAttribute('title'), 'Buyer');
      await search.press('Enter');
      assert.deepEqual(reads, ['inbox'], 'Search and categories only project loaded metadata');
      await page.getByRole('checkbox', { name: 'Select all loaded conversations', exact: true }).check();
      assert.equal(await page.locator('.ws-mail-selection').innerText(), '1 selected');
      await page.locator('[data-mail-select]').uncheck();
      assert.equal(await page.locator('.ws-mail-selection').innerText(), '');
      await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-body').waitFor();
      assert.equal(await page.locator('.ws-mail-body img').count(), 0);
      await page.getByRole('button', { name: 'Conversation context', exact: true }).click();
      const context = page.getByRole('complementary', { name: 'Conversation context', exact: true });
      assert(await context.isVisible());
      assert.equal(await context.getByRole('link', { name: 'Open linked record', exact: true }).getAttribute('href'), '/dashboard/?record_ref=BUY-0001');
      await context.getByRole('button', { name: 'Close conversation context', exact: true }).press('Escape');
      assert.equal(await context.isVisible(), false);
      const before = bodyReads;
      await page.getByRole('button', { name: 'Conversation context', exact: true }).click();
      await page.getByRole('button', { name: 'Reply', exact: true }).click();
      assert.equal(await context.isVisible(), false, 'Reply closes the optional context so it cannot cover the composer');
      await page.getByLabel('Message', { exact: true }).fill('LOCAL SYNTHETIC DRAFT');
      const composeFit = await page.locator('.ws-mail-composer').evaluate(el => [...el.querySelectorAll('input:not([type="checkbox"]),textarea,button,[data-reply-status]')].filter(e => e.getClientRects().length).map(e => { const r = e.getBoundingClientRect(); return { label: e.getAttribute('aria-label') || e.name || 'status', fits: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; }));
      assert(composeFit.every(c => c.fits), 'All composer fields,close,commands and status fit the real viewport: ' + JSON.stringify(composeFit));
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
      assert.equal(bodyReads, before, 'Context toggles do not refetch mail or create a preview');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Reply', exact: true }).click();
      assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'LOCAL SYNTHETIC DRAFT');
      await page.getByRole('button', { name: 'Close reply', exact: true }).click();
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click();
      await search.fill('.*');
      assert.equal(await page.locator('.ws-mail-row').count(), 0, 'Search never treats input as a regular expression');
      await search.fill('');
      await page.getByRole('tab', { name: 'Alerts', exact: true }).press('End');
      assert.equal(await page.getByRole('tab', { name: 'WOS reports', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('.ws-mail-row').count(), 1);
      await page.getByRole('tab', { name: 'WOS reports', exact: true }).press('Home');
      assert.equal(await page.getByRole('tab', { name: 'Primary', exact: true }).getAttribute('aria-selected'), 'true');
      if (width !== 1366) {
        await page.getByRole('button', { name: 'Mail folders', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Mail folders', exact: true });
        await dialog.getByRole('button', { name: 'Starred', exact: true }).click();
        assert.equal(await dialog.isVisible(), false);
      } else await page.locator('.ws-mail-rail').getByRole('button', { name: 'Starred', exact: true }).click();
      await page.locator('#today-content[aria-busy="false"]').waitFor();
      assert.deepEqual(reads, ['inbox', 'starred']);
      let labelScope = page.locator('.ws-mail-rail');
      if (!await labelScope.getByRole('button', { name: 'JV partners', exact: true }).isVisible()) {
        const labels = page.getByRole('button', { name: 'Mail labels', exact: true });
        await (await labels.isVisible() ? labels : page.getByRole('button', { name: 'Mail folders', exact: true })).click();
        labelScope = page.getByRole('dialog', { name: 'Mail folders', exact: true });
      }
      await labelScope.getByRole('button', { name: 'JV partners', exact: true }).click();
      assert.equal(await page.locator('.ws-mail-row').count(), 1);
      assert.equal(await page.locator('.ws-mail-row').getAttribute('title'), 'JV partner');
      await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-body').waitFor();
      await page.getByRole('button', { name: 'Conversation context', exact: true }).click();
      assert.equal(await page.getByRole('complementary', { name: 'Conversation context', exact: true }).getByRole('link').count(), 0, 'A validated role without a unique annotated record is not a record link');
      await page.getByRole('button', { name: 'Close conversation context', exact: true }).click();
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const toolbarFits = await page.locator('.ws-mail-list-tools').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
      assert(toolbarFits);
      assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('workspace-mailbox-chrome: required three sizes plus short-desktop containment, sourced search/labels/context,44px fixed rail, complete composer/status, draft/session safety and zero writes/external/errors passed');
  } finally { await browser.close(); }
}
prove().catch(error => { console.error(error.stack); process.exitCode = 1; });
