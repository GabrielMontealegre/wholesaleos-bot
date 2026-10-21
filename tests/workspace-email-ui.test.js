'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { probeProcessSpawn } = require('./helpers/process-capability');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
async function prove() {
  if (!(await probeProcessSpawn()).available) { console.log('ENVIRONMENT_SKIP: workspace-email-ui: process spawn not permitted'); return; }
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  const stamp = '2026-10-20T12:00:00Z', key = 'a'.repeat(64);
  const metadata = (id, patch = {}) => ({ id, source_kind: 'connected_mailbox', from: 'Synthetic Sender <sender@example.test>', sender_name: 'Synthetic Sender',
    subject: 'Synthetic conversation ' + 'long subject '.repeat(6), date: stamp, thread_key: key, direction: 'in', link_status: 'linked',
    conversation: { role: 'buyer', role_source_kind: 'operator_input', role_recorded_at: stamp }, ...patch });
  const rows = [metadata('first'), metadata('latest', { date: '2026-10-20T12:01:00Z' }), metadata('other', { thread_key: 'c'.repeat(64), sender_name: 'Another synthetic person' }), metadata('alert', { thread_key: 'b'.repeat(64), from: 'alerts@redfin.com', sender_name: 'Synthetic alert' })];
  const message = id => ({ ...rows.find(row => row.id === id), body: id === 'first' ? 'Earlier synthetic message' : 'LATEST SYNTHETIC TEXT\n' + 'Visible source text. '.repeat(250) + '\nFINAL SYNTHETIC LINE <img src=x onerror=attack()>' });
  try {
    for (const width of [1366, 400, 412]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1366 ? 768 : 915 } });
      let failBody = false, unauthorized = false, delay = null, bodyReads = 0;
      const writes = [], external = [], errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== 'https://fixture.test') { external.push(url.origin); return route.abort(); }
        if (req.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, role: 'admin' } });
        if (url.pathname === '/api/gmail/messages') return route.fulfill({ status: unauthorized ? 401 : 200, json: { ok: !unauthorized, messages: url.searchParams.get('folder') === 'sent' ? [] : rows } });
        if (url.pathname === '/api/gmail/thread' || url.pathname.startsWith('/api/gmail/message/')) {
          bodyReads++;
          if (delay) await delay.promise;
          const ids = url.searchParams.has('ids') ? JSON.parse(url.searchParams.get('ids')) : [decodeURIComponent(url.pathname.split('/').pop())];
          return route.fulfill({ status: failBody ? 503 : 200, json: failBody ? { code: 'email_message_stale' } : ids.length > 1 ? { messages: ids.map(message).reverse() } : message(ids[0]) });
        }
        if (url.pathname === '/app') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/workspace/index.html')) });
        const relative = url.pathname.slice('/dashboard/'.length);
        assert(url.pathname.startsWith('/dashboard/') && !relative.includes('..'));
        return route.fulfill({ contentType: relative.endsWith('.css') ? 'text/css' : relative.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../dashboard', relative)) });
      });
      await page.goto('https://fixture.test/app?preview=1&view=email');
      await page.locator('.ws-mail-row').first().waitFor();
      assert.equal(await page.locator('.ws-mail-row').count(), 2, 'People default excludes automated listing alert, not the real replies');
      assert.equal(bodyReads, 0, 'No message body fetched on load');
      assert.equal(await page.locator('#help').isVisible(), false, 'Email reserves no blank help strip');
      assert(await page.locator('#refresh').getAttribute('title'), 'Help remains available on the control');
      const listTop = await page.locator('.ws-mail-list').evaluate(el => el.getBoundingClientRect().top);
      assert(listTop <= (width === 1366 ? 132 : 180), 'Folder chrome must not push the list down: ' + listTop);
      await page.locator('#refresh').hover();
      assert.equal(await page.locator('.ws-mail-list').evaluate(el => el.getBoundingClientRect().top), listTop, 'Hover help cannot shift the list');
      await page.getByRole('tab', { name: 'Alerts', exact: true }).click();
      assert((await page.locator('.ws-mail-row').innerText()).includes('Synthetic alert'));
      await page.getByRole('tab', { name: 'Alerts', exact: true }).press('ArrowLeft');
      assert.equal(await page.getByRole('tab', { name: 'People', exact: true }).getAttribute('aria-selected'), 'true');
      await page.locator('.ws-mail-row').first().click();
      await page.getByText('LATEST SYNTHETIC TEXT', { exact: false }).waitFor();
      assert.equal(await page.locator('.ws-mail-earlier[open]').count(), 0);
      assert.equal(await page.locator('.ws-mail-body img').count(), 0, 'Source HTML is text only');
      const reading = await page.locator('.ws-mail-thread').evaluate(el => ({ height: el.clientHeight, ownScroll: getComputedStyle(el).overflowY, bodyOverflow: getComputedStyle(el.querySelector('.ws-mail-body')).overflowY }));
      assert(reading.height > 300, JSON.stringify(reading));
      assert(reading.height >= (width === 1366 ? 450 : 550), 'Long subjects must preserve reading height: ' + JSON.stringify(reading));
      const bodyTop = await page.locator('.ws-mail-message .ws-mail-body').evaluate(el => el.getBoundingClientRect().top);
      assert(bodyTop <= (width === 1366 ? 340 : 410), 'Message starts near the top even with a long subject: ' + bodyTop);
      assert.equal(await page.getByRole('button', { name: 'Back to messages', exact: true }).getAttribute('title'), 'Back to messages');
      assert(await page.getByRole('button', { name: 'Inbox', exact: true }).isVisible());
      assert(await page.getByLabel('Other email folders', { exact: true }).isVisible());
      if (width !== 1366) assert.equal(await page.getByRole('tab', { name: 'Alerts', exact: true }).isVisible(), false, 'Phone category tabs return with Back, not above the open message');
      assert.equal(reading.ownScroll, 'auto');
      assert(!['auto', 'scroll'].includes(reading.bodyOverflow), 'Message text has no nested scrollbox');
      assert(await page.locator('.ws-mail-reading-head .ws-role--buyer').isVisible());
      await page.keyboard.press('e');
      assert.equal(await page.locator('.ws-mail-earlier[open]').count(), 1);
      await page.locator('.ws-mail-thread').evaluate(el => { el.scrollTop = el.scrollHeight; });
      assert(await page.getByText('FINAL SYNTHETIC LINE', { exact: false }).isVisible(), 'Final source text stays accessible');
      assert(await page.locator('.ws-mail-thread').evaluate(el => { const bottom = el.querySelector('.ws-mail-message .ws-mail-body').getBoundingClientRect().bottom, pane = el.getBoundingClientRect(); return bottom <= pane.bottom + 1 && bottom > pane.top; }), 'The actual end of the source message scrolls into the pane');
      await page.keyboard.press('j');
      await page.locator('.ws-mail-row[data-mail-key="' + 'c'.repeat(64) + '"][aria-pressed="true"]').waitFor({ state: 'attached' });
      await page.locator('.ws-mail-body').waitFor();
      await page.keyboard.press('k');
      await page.locator('.ws-mail-row[data-mail-key="' + key + '"][aria-pressed="true"]').waitFor({ state: 'attached' });
      await page.locator('.ws-mail-message .ws-mail-body').waitFor();
      await page.keyboard.press('r');
      await page.getByLabel('Message', { exact: true }).fill('LOCAL ONLY REPLY');
      assert.equal(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), true, 'Leaving warns before discarding an unsaved local reply');
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
      assert.equal(await page.getByRole('link', { name: 'Open in Gmail', exact: false }).getAttribute('href'), 'https://mail.google.com/mail/u/0/#inbox');
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isVisible());
      const composing = await page.getByRole('button', { name: 'Send', exact: true }).evaluate(el => { const box = el.getBoundingClientRect(); return { sendFits: box.top >= 0 && box.bottom <= innerHeight, readingHeight: document.querySelector('.ws-mail-thread').clientHeight, overflow: document.documentElement.scrollWidth > innerWidth }; });
      assert(composing.sendFits && composing.readingHeight >= 180 && !composing.overflow, JSON.stringify(composing));
      assert((await page.getByLabel('Subject', { exact: true }).inputValue()).startsWith('Re: Synthetic conversation'));
      await page.getByRole('button', { name: 'Close reply', exact: true }).click();
      await page.getByRole('button', { name: 'Reply', exact: true }).click();
      assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'LOCAL ONLY REPLY');
      await page.getByRole('button', { name: 'Close reply', exact: true }).click();
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click();
      assert(await page.getByRole('tab', { name: 'Alerts', exact: true }).isVisible(), 'Back restores the phone category controls');
      failBody = true;
      await page.locator('.ws-mail-row').first().click();
      await page.getByText('This conversation could not be read. Your list is still available.', { exact: false }).waitFor();
      assert(await page.locator('.ws-mail-status').isVisible(), 'Compact reading mode never hides an error');
      assert.equal(await page.locator('.ws-mail-row').count(), 2);
      assert.equal(await page.locator('.ws-mail-body').count(), 0);
      await page.getByRole('button', { name: 'Sent', exact: true }).click();
      await page.getByRole('heading', { name: 'No conversations in this view', exact: true }).waitFor();
      failBody = false;
      await page.getByRole('button', { name: 'Inbox', exact: true }).click();
      await page.locator('.ws-mail-row').first().waitFor();
      delay = {}; delay.promise = new Promise(resolve => { delay.resolve = resolve; });
      await page.locator('.ws-mail-row').first().click();
      unauthorized = true;
      await page.getByRole('button', { name: 'Refresh email', exact: true }).click();
      await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
      const late = page.waitForResponse(response => response.url().includes('/api/gmail/thread'));
      delay.resolve(); delay = null;
      await (await late).finished();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
      assert(!(await page.locator('body').innerText()).includes('Synthetic Sender'));
      assert(!(await page.locator('body').innerText()).includes('LOCAL ONLY REPLY'));
      assert.equal(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), false, 'Session loss clears drafts and the unload warning');
      assert.deepEqual(writes, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('workspace-email-ui:1366/400/412 People/Alerts/folders, full reading pane/no nested body scroll, collapsed history, escaped content, local-only composer/Gmail, failure list retention and401 late-response clearing;zero writes/external calls passed');
  } finally { await browser.close(); }
}
prove().catch(error => { console.error(error.stack); process.exitCode = 1; });
