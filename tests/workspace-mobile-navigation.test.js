'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), express = require('express');
const { createFixtureApp } = require('../scripts/verify-marketplace-ui');
const { registerWorkspacePreview } = require('../modules/ui/workspace-preview');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');

async function run() {
  const fixture = createFixtureApp({ seedLead: true }), app = express();
  let authenticated = true;
  app.get('/api/auth/session', (_, res) => res.json({ authenticated, role: 'admin' }));
  app.use('/api', (req, res, next) => authenticated ? next() : res.status(401).json({ code: 'SESSION_REQUIRED' }));
  app.get('/api/dashboard/assistant-snapshots', (_, res) => res.json({ ok: true, capabilities: { can_import: true, schema: 'wos-assistant-snapshot', version: 1, max_bytes: 1048576 }, viewer_scope: 'b'.repeat(64), latest: null }));
  const message = { id: 'fixture-menu', source_kind: 'connected_mailbox', sender_name: 'Synthetic sender', from: 'sender@example.test', subject: 'Synthetic mobile navigation', date: '2026-10-20T12:00:00Z', thread_key: 'a'.repeat(64), direction: 'in', link_status: 'unlinked' };
  app.get('/api/gmail/messages', (_, res) => res.json({ ok: true, messages: [message] }));
  app.get('/api/gmail/message/:id', (_, res) => res.json({ ...message, body: 'Synthetic source is preserved while the mobile menu opens.' }));
  registerWorkspacePreview(app); app.use(fixture.app);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser; const writes = [], external = [], errors = [], reads = [];
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
      if (url.origin !== base) { external.push(url.hostname); return route.abort(); }
      reads.push(url.pathname); return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.name));
    for (const size of [{ width: 400, height: 915 }, { width: 412, height: 915 }, { width: 400, height: 503 }]) {
      for (const view of ['today', 'email']) {
        await page.setViewportSize(size); await page.goto(base + '/app?view=' + view);
        await page.locator('.ws-topbar').waitFor();
        if (view === 'email') { await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-body').waitFor(); }
        await page.waitForLoadState('networkidle');
        const source = view === 'email' ? await page.locator('.ws-mail-body').innerText() : null;
        const before = reads.length, menu = page.locator('#mobile-nav');
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        const rect = await menu.boundingBox();
        assert(rect && rect.x === 0 && rect.y === 0 && Math.abs(rect.height - size.height) <= 1);
        assert(rect.width <= size.width - 48 && rect.width >= 280, 'Drawer leaves a genuine outside tap strip');
        assert.equal(await page.locator('dialog[open]').count(), 1);
        assert.deepEqual(await menu.locator('a').evaluateAll(xs => xs.map(x => x.getAttribute('href'))), ['/app?preview=1', '/app?preview=1&view=email']);
        for (const control of await menu.locator('a,button').all()) {
          const r = await control.boundingBox();
          assert(r && r.height >= 44 && r.height <= 52 && r.y >= 0 && r.y + r.height <= size.height && r.x + r.width <= rect.width);
        }
        await page.keyboard.press('Shift+Tab');
        assert(await menu.getByRole('button', { name: 'More', exact: true }).evaluate(x => document.activeElement === x));
        await page.keyboard.press('Tab');
        assert(await menu.getByRole('button', { name: 'Close Navigation', exact: true }).evaluate(x => document.activeElement === x));
        await page.mouse.click(rect.width / 2, size.height - 12);
        assert(await menu.evaluate(x => x.open), 'Blank space inside the full-height drawer is not backdrop');
        if (process.env.WOS_MOBILE_MENU_PROOF_DIR) {
          fs.mkdirSync(process.env.WOS_MOBILE_MENU_PROOF_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.WOS_MOBILE_MENU_PROOF_DIR, view + '-' + size.width + '-' + size.height + '.png') });
        }
        await page.mouse.click(size.width - 12, size.height - 12);
        assert.equal(await menu.evaluate(x => x.open), false, 'Outside tap closes navigation');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-open');
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click(); await page.keyboard.press('Escape');
        assert.equal(await menu.evaluate(x => x.open), false);
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await menu.getByRole('button', { name: 'Close Navigation', exact: true }).click();
        assert.equal(await menu.evaluate(x => x.open), false);
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await menu.getByRole('button', { name: 'More', exact: true }).click();
        assert.equal(await menu.evaluate(x => x.open), false);
        assert.equal(await page.locator('dialog[open]').count(), 1);
        assert.equal(await page.locator('#more-tools a').count(), 7);
        await page.keyboard.press('Escape');
        if (source !== null) assert.equal(await page.locator('.ws-mail-body').innerText(), source);
        assert.equal(reads.length, before, 'Navigation interaction performs no new reads');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
    }
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click(); authenticated = false;
    await page.evaluate(() => document.getElementById('refresh').click());
    await page.locator('#login').waitFor(); assert.equal(await page.locator('#mobile-nav').count(), 0);
    fixture.assertUnchanged(); assert.deepEqual(writes, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log('workspace-mobile-navigation: Today/Email400/412/shortphone full-height/44px/outside-vs-inside/X/Escape/focus/More/source/no extra reads/401/no writes passed');
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(JSON.stringify({ test: 'workspace-mobile-navigation', assertion: error.name === 'AssertionError', location: String(error.stack).match(/workspace-mobile-navigation\.test\.js:\d+:\d+/)?.[0] || null, messageCode: /Timeout/.test(error.name) ? 'fixture_timeout' : 'test_failed' })); process.exitCode = 1; });
