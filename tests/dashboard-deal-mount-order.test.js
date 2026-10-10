'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { probeProcessSpawn } = require('./helpers/process-capability');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');

// Serve the unmodified dashboard document and all its scripts. Only data endpoints
// are synthetic: this exercises the competing mounts missed by component proofs.
async function proveDashboardOrder({ screenshots = false } = {}) {
  const root = path.resolve(__dirname, '..');
  const app = express();
  const writes = []; const errors = []; let leadReads = 0; let snapshotReads = 0;
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) { writes.push(req.method + ' ' + req.path); return res.status(405).json({ code: 'fixture_read_only' }); }
    next();
  });
  app.get('/api/auth/session', (_, res) => res.json({ authenticated: true, role: 'admin' }));
  app.get('/api/leads', (_, res) => { leadReads++; res.json({ leads: [], totalAll: 0, totalFiltered: 0 }); });
  app.get('/api/buyers', (_, res) => res.json({ buyers: [] }));
  app.get('/api/dashboard/todays-deals', (_, res) => res.json({ items: [], counts: { total: 0, shown: 0, vetted_today: 0, daily_target: 10, jv: 0 }, status_labels: {} }));
  app.get('/api/dashboard/research-queue/current', (_, res) => { snapshotReads++; res.json({ ok: true, market: { city: 'Fixture City', county: 'Fixture County', state: 'FL' }, rows: [], batches: [], auto_run: { enabled: false }, preview_only: true, not_a_saved_lead: true }); });
  app.get('/api/dashboard/market-demand-index', (_, res) => res.json({ counties: [], county_count: 0 }));
  app.get('/api/dashboard/buyers-found', (_, res) => res.json({ items: [], counts: { new_today: 0, total: 0, messaged_this_week: 0 } }));
  app.get('/api/*', (_, res) => res.json([]));
  app.get('/favicon.ico', (_, res) => res.status(204).end());
  app.use('/dashboard', express.static(path.join(root, 'dashboard')));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const request = route.request();
      if (request.url().startsWith(base + '/')) return route.continue();
      // Never touch a running local helper or any external source during proof.
      if (new URL(request.url()).pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
      return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const output = path.join(root, 'docs/screens/today-order-local');
    if (screenshots) fs.mkdirSync(output, { recursive: true });
    async function assertOrder(phase) {
      await page.waitForFunction(() => {
        const host = document.getElementById('content');
        return host && host.querySelector('#wos-todays-deals') && host.querySelector('#wos-public-deals');
      });
      const order = await page.locator('#content').evaluate(e => [...e.children].map(c => c.id));
      assert.strictEqual(order[0], 'wos-conversations', phase + ': D-050 reminders precede Today');
      assert.strictEqual(order[1], 'wos-todays-deals', phase + ': Today follows reminders');
      assert.strictEqual(order[2], 'wos-public-deals', phase + ': public source desk follows Today');
      assert.strictEqual(await page.locator('#wos-todays-deals').count(), 1);
      assert.strictEqual(await page.locator('#wos-public-deals').count(), 1);
    }
    for (const width of [1366, 400, 412]) {
      await page.setViewportSize({ width, height: width === 412 ? 915 : 900 }); await page.goto(base + '/dashboard/');
      if(width<901)await page.getByRole('button',{name:'Open navigation menu',exact:true}).click();
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      if(width<901)await page.getByRole('button',{name:'Close navigation menu',exact:true}).click();
      await assertOrder('real init at ' + width);
      const beforeHydrate = leadReads;
      await page.evaluate(async () => { await loadLeadsFromAPI({ background: true }); });
      assert.ok(leadReads > beforeHydrate, 'real hydration reaches the fixture endpoint');
      await assertOrder('hydration at ' + width);
      await page.evaluate(() => render());
      await assertOrder('content re-render at ' + width);
      await page.waitForTimeout(3200);
      await assertOrder('real mount timer at ' + width);
      assert.ok(snapshotReads > 0, 'real source panel read its data');
      assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'home has no page overflow');
      if (screenshots) await page.screenshot({ path: path.join(output, 'dashboard-' + width + '.png'), fullPage: true });
      await page.evaluate(() => navigate('findme_scout', null));
      await page.waitForFunction(() => document.getElementById('wos-public-deals')?.dataset.wosTarget === 'findme_scout');
      assert.strictEqual(await page.locator('#content').evaluate(e => e.firstElementChild.id), 'wos-public-deals', 'Deal Finder order unchanged');
      assert.strictEqual(await page.locator('#wos-todays-deals').count(), 0);
      await page.evaluate(() => navigate('todays_deals', null));
      await page.locator('#wos-todays-deals').waitFor();
      assert.strictEqual(await page.locator('#wos-public-deals').count(), 0, 'no old desk on the standalone Today tab');
      if (screenshots) await page.screenshot({ path: path.join(output, 'today-' + width + '.png'), fullPage: true });
      await page.evaluate(() => navigate('jv', null));
      await page.getByRole('heading', { name: /JV/ }).waitFor();
      assert.strictEqual(await page.locator('.td-card').count(), 0, 'no invented JV deal in empty inventory');
      if (screenshots) await page.screenshot({ path: path.join(output, 'jv-' + width + '.png'), fullPage: true });
      await page.evaluate(() => navigate('dashboard', null));
      await assertOrder('return to Dashboard at ' + width);
    }
    assert.deepStrictEqual(writes, [], 'no production-style write attempted');
    assert.deepStrictEqual(errors, [], 'real dashboard scripts have no page errors');
    console.log('Dashboard mount order: real init, hydration, re-render, timer and return at 1366/400/412; Deal Finder unchanged; zero writes/external source requests.');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

module.exports = { proveDashboardOrder };
if (require.main === module) (async () => {
  if (!(await probeProcessSpawn()).available) { console.log('SKIPPED: full-dashboard browser proof requires process spawn'); return; }
  await proveDashboardOrder({ screenshots: process.argv.includes('--screenshots') });
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
