'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const express = require('express');
const { probeProcessSpawn } = require('./helpers/process-capability');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const { registerWorkspacePreview } = require('../modules/ui/workspace-preview');
const { createFixtureApp } = require('../scripts/verify-marketplace-ui');

async function prove() {
  if (!(await probeProcessSpawn()).available) { console.log('ENVIRONMENT_SKIP: workspace-navigation-ui: process spawn not permitted'); return; }
  const fixture = createFixtureApp({ seedLead: true }), app = express();
  app.get('/api/gmail/messages', (_, res) => res.json({ ok: true, messages: [{ id: 'fixture-message', source_kind: 'connected_mailbox', sender_name: 'Synthetic sender', from: 'sender@example.test', subject: 'Synthetic reply', date: '2026-10-20T12:00:00Z', thread_key: 'a'.repeat(64), direction: 'in', link_status: 'unlinked' }] }));
  registerWorkspacePreview(app); app.use(fixture.app);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const out = process.env.WOS_NAV_PROOF_DIR, report = [];
  let browser;
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    if (out) fs.mkdirSync(out, { recursive: true });
    for (const width of [1366, 400, 412]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1366 ? 768 : 915 } });
      const external = [], writes = [], errors = [];
      await context.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (req.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
        if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
        if (url.pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
        if (url.origin !== base) { external.push(url.hostname); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      let navigations = 0;
      page.on('request', req => { if (req.isNavigationRequest() && req.frame() === page.mainFrame()) navigations++; });
      await page.goto(base + '/app');
      await page.locator('.ws-classic-frame').waitFor();
      assert.equal(new URL(page.url()).pathname, '/dashboard/');
      const shell = await page.locator('.ws-shell').elementHandle();
      async function choose(key) {
        if (width !== 1366) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await page.locator((width === 1366 ? '.ws-sidebar ' : '#mobile-nav ') + 'a[href="/dashboard/?workspace=' + key + '"]').click();
      }
      async function shot(name) { if (out) await page.screenshot({ path: path.join(out, name + '-' + width + '.png') }); }
      await page.frameLocator('.ws-classic-frame').locator('.topbar').waitFor({ state: 'hidden' });
      const paint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime);
      assert(paint > 0 && paint < 2000, 'Synthetic shell first contentful paint <2s');
      await shot('home');
      const initialNavigations = navigations;
      await choose('deals');
      await page.frameLocator('.ws-classic-frame').locator('.td-card').first().waitFor();
      assert(await page.getByRole('heading', { name: 'Deals - classic view', exact: true }).isVisible());
      assert.equal(await page.frameLocator('.ws-classic-frame').locator('.sidebar').isVisible(), false);
      await shot('deals');
      await choose('email');
      await page.locator('.ws-mail-row').first().waitFor();
      await shot('email');
      await choose('deals');
      await page.frameLocator('.ws-classic-frame').locator('.td-card').first().waitFor();
      await shot('deals-return');
      assert.equal(navigations, initialNavigations, 'Navigation never replaces the top-level document');
      assert(await shell.evaluate(el => el.isConnected), 'Same shell node survives every tab');
      await page.goBack();
      await page.locator('.ws-mail-row').first().waitFor();
      assert.equal(new URL(page.url()).searchParams.get('workspace'), 'email');
      await page.goForward();
      await page.locator('.ws-classic-frame').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('workspace'), 'deals');
      await page.frameLocator('.ws-classic-frame').locator('.td-card').first().waitFor();
      await page.frames().find(frame => frame.url().includes('embedded=1')).evaluate(() => navigate('calendar', null));
      await page.waitForURL('**/dashboard/?workspace=calendar');
      assert(await shell.evaluate(el => el.isConnected), 'Legacy in-content navigation returns through the same shell');
      for (const key of ['today', 'leads', 'buyers', 'calendar', 'pipeline', 'approvals']) {
        await choose(key); await page.locator('.ws-classic-frame').waitFor();
        assert(await shell.evaluate(el => el.isConnected));
        assert.equal(new URL(page.url()).searchParams.get('workspace'), key);
        assert.equal(new URL(await page.locator('.ws-classic-frame').getAttribute('src'), base).searchParams.get('embedded'), '1');
      }
      await page.locator('.ws-topbar a[aria-label="Settings"]').click();
      assert.equal(new URL(page.url()).searchParams.get('workspace'), 'settings');
      const beforeForgery = page.url();
      await page.evaluate(() => {
        window.postMessage({ type: 'wos-workspace-navigation', key: 'email' }, location.origin);
        dispatchEvent(new MessageEvent('message', { data: { type: 'wos-workspace-navigation', key: 'email' }, origin: 'https://evil.test', source: document.querySelector('iframe').contentWindow }));
        dispatchEvent(new MessageEvent('message', { data: { type: 'wos-workspace-navigation', key: '__proto__', ref: '//evil.test' }, origin: location.origin, source: document.querySelector('iframe').contentWindow }));
      });
      assert.equal(page.url(), beforeForgery, 'Wrong-source, wrong-origin and forged routes are ignored');
      await page.goto(base + '/app?preview=1&view=email');
      await page.locator('.ws-mail-row').first().waitFor();
      await choose('deals');
      await page.locator('.ws-classic-frame').waitFor();
      await page.goBack();
      await page.locator('.ws-mail-row').first().waitFor();
      assert.equal(new URL(page.url()).pathname, '/app', 'Old preview links also restore their screen on Back');
      await page.goto(base + '/dashboard/?record_ref=WOS-FL-1040');
      await page.frameLocator('.ws-classic-frame').locator('#modal-overlay').waitFor({ state: 'visible' });
      assert((await page.frameLocator('.ws-classic-frame').locator('#modal-content').innerText()).includes('100 Example St'));
      assert.equal(await page.locator('.ws-shell').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.route('**/api/auth/session', r => r.fulfill({ json: { authenticated: false } }));
      await page.goto(base + '/dashboard/');
      await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
      assert.equal(await page.locator('iframe').count(), 0, 'Locked shell never loads business content');
      await page.route('**/api/auth/session', r => r.fulfill({ json: { authenticated: true, role: 'user' } }));
      await page.goto(base + '/dashboard/');
      await page.waitForURL('**/dashboard/?workspace=today&embedded=1');
      await page.locator('body[data-wos-design="marketplace"]').waitFor();
      assert.equal(await page.locator('.ws-shell').count(), 0, 'Existing non-admin classic entry stays available without widening any API permission');
      assert.deepEqual(writes, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
      report.push({ width, first_contentful_paint_ms: paint, same_shell: true, top_level_tab_reloads: 0, back_forward: true, exact_record: true, zero_writes: true });
      await context.close();
    }
    fixture.assertUnchanged();
    if (out) fs.writeFileSync(path.join(out, 'synthetic-proof.json'), JSON.stringify({ synthetic_only: true, results: report }, null, 2) + '\n');
    console.log('workspace-navigation-ui: Home/Deals/Email/Deals; all nav; same shell, Back/Forward, exact record, forged messages, locked loads;1366/400/412; no writes/external requests passed');
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
prove().catch(e => { console.error(e.stack); process.exitCode = 1; });
