'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { probeProcessSpawn } = require('./helpers/process-capability');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function prove() {
  if (!(await probeProcessSpawn()).available) { console.log('ENVIRONMENT_SKIP: workspace-email-loading: process spawn not permitted'); return; }
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  const row = (id, patch = {}) => ({ id, source_kind: 'connected_mailbox', from: 'Synthetic Reader <reader@example.test>', sender_name: 'Synthetic Reader', subject: 'Synthetic source message', date: '2026-10-20T12:00:00Z', thread_key: id.repeat(64), ...patch });
  const inbox = [row('a'), row('b', { from: 'alerts@redfin.com', sender_name: 'Synthetic alert' })], sent = [row('c', { sender_name: 'Synthetic sent thread' })];
  try {
    for (const width of [1366, 400, 412]) for (const scenario of ['category', 'folder', 'empty', 'failure', 'unauthorized']) {
      const page = await browser.newPage({ viewport: { width, height: width === 1366 ? 768 : 915 } });
      const gate = deferred(), requested = deferred(), reads = [], forbidden = [], errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== 'https://fixture.test' || req.method() !== 'GET') { forbidden.push(req.method() + ' ' + url.origin); return route.abort(); }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, role: 'admin' } });
        if (url.pathname === '/api/gmail/messages') {
          const folder = url.searchParams.get('folder'); reads.push(folder);
          if (folder === 'inbox') { requested.resolve(); await gate.promise; }
          const status = scenario === 'unauthorized' ? 401 : scenario === 'failure' ? 503 : 200;
          return route.fulfill({ status, json: { ok: status === 200, messages: scenario === 'empty' ? [] : folder === 'sent' ? sent : inbox } });
        }
        if (url.pathname === '/app') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/workspace/index.html')) });
        assert(url.pathname.startsWith('/dashboard/'), 'No body fetch or unrelated API on load');
        const relative = url.pathname.slice('/dashboard/'.length); assert(!relative.includes('..'));
        return route.fulfill({ contentType: relative.endsWith('.css') ? 'text/css' : relative.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../dashboard', relative)) });
      });
      await page.goto('https://fixture.test/app?preview=1&view=email');
      await requested.promise;
      await page.getByRole('tab', { name: 'Alerts', exact: true }).click();
      assert.equal(await page.locator('#today-content').getAttribute('aria-busy'), 'true', 'Changing category must not pretend the outstanding folder read completed');
      if (scenario === 'folder') {
        await page.getByRole('button', { name: 'Sent', exact: true }).click();
        await page.getByText('Synthetic sent thread', { exact: true }).waitFor();
      }
      const late = page.waitForResponse(response => response.url().includes('/api/gmail/messages?folder=inbox'));
      gate.resolve(); await (await late).finished();
      if (scenario === 'unauthorized') {
        await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
        assert.equal(await page.locator('.ws-mail').count(), 0);
      } else {
        await page.locator('#today-content[aria-busy="false"]').waitFor();
        if (scenario === 'category') {
          await page.getByText('Synthetic alert', { exact: true }).waitFor();
          assert.equal(await page.locator('.ws-mail-row').count(), 1);
          assert.equal(await page.locator('.ws-mail-status').innerText(), 'Latest 2 messages in this folder');
          assert.equal(await page.getByRole('tab', { name: 'Alerts', exact: true }).getAttribute('aria-selected'), 'true');
          assert.deepEqual(reads, ['inbox'], 'Category changes must reuse the outstanding metadata request');
        } else if (scenario === 'folder') {
          await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
          assert.equal(await page.locator('.ws-mail-row').count(), 1);
          assert((await page.locator('.ws-mail-row').innerText()).includes('Synthetic sent thread'));
          assert(!(await page.locator('body').innerText()).includes('Synthetic alert'));
          assert.deepEqual(reads, ['inbox', 'sent']);
        } else if (scenario === 'empty') {
          assert.equal(await page.locator('.ws-mail-status').innerText(), 'Latest 0 messages in this folder');
          assert.equal(await page.locator('.ws-mail-row').count(), 0);
        } else {
          assert.equal(await page.locator('.ws-mail-status').innerText(), 'Email could not be loaded.');
          assert.equal(await page.locator('.ws-mail-row').count(), 0);
        }
      }
      assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('workspace-email-loading:1366/400/412 delayed metadata/category switch, obsolete folder isolation, empty/failure/401; no duplicate reads, bodies, writes or external calls passed');
  } finally { await browser.close(); }
}
prove().catch(error => { console.error(error.stack); process.exitCode = 1; });
