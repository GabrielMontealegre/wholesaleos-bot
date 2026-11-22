'use strict';
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { lead } = require('../tests/helpers/lead-contact-fixture');
const { buildLeadContactBrief } = require('../modules/research/lead-contact-brief');
const { createSourceContactTapHandler } = require('../modules/records/lead-contact-tap-routes');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
async function prove({ screenshots = false } = {}) {
  const root = path.resolve(__dirname, '..'), app = express();
  const canonical = { ...lead(), queue_key: 'synthetic-source-contact', normalized_address: lead().address,
    next_best_action: 'Review the source, then ask whether the owner would consider an offer.' };
  delete canonical.id; delete canonical.address;
  let rows = [canonical], store = { users: [{ id: 'synthetic-admin', role: 'admin', name: 'Synthetic Operator' }], leads: [], activities: [] };
  let writes = 0, unrelatedWrites = 0, expired = false;
  const original = JSON.stringify(rows);
  const handler = createSourceContactTapHandler({ db: { readDBStrict: () => store, writeDB(value) { writes++; store = value; } },
    readSnapshot: () => ({ rows }), now: () => '2026-11-22T08:00:00.000Z' });
  app.use(express.json());
  app.post('/api/dashboard/free-public-deal-board/contact-workflow', (req, res) => {
    if (expired) return res.status(401).json({ code: 'SYNTHETIC_EXPIRED' });
    req.currentUser = store.users[0]; return handler(req, res);
  });
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) { unrelatedWrites++; return res.status(405).end(); } next();
  });
  app.get('/api/auth/session', (_req, res) => res.json({ authenticated: true, role: 'admin', user: store.users[0] }));
  app.get('/api/auth/role', (_req, res) => res.json({ role: 'admin', isAdmin: true, userId: 'synthetic-admin' }));
  app.get('/api/users', (_req, res) => res.json({ users: store.users }));
  app.get('/api/*', (_req, res) => res.json([]));
  app.use('/dashboard', express.static(path.join(root, 'dashboard')));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port; let browser;
  function projected(row) { return { ...row, contact_summary_authorized: true, contact_brief: buildLeadContactBrief(row) }; }
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext();
    await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.name));
    async function render(row, admin = true) {
      await page.evaluate(({ row, admin }) => {
        WOSDashboardAuth.applyAuthenticatedUser(APP, { id: 'synthetic-admin', role: admin ? 'admin' : 'user', firstLogin: false });
        APP.page = 'synthetic-source-contact'; document.getElementById('app').style.display = 'flex';
        document.getElementById('pin-screen').style.display = 'none';
        document.getElementById('content').innerHTML = '<div id="synthetic-source-surface">' + __wosPublicDealsTestHooks.rowCard(row) + '</div>';
        window.syntheticSourceNative = []; WOSLeadContact.openLocal = target => window.syntheticSourceNative.push(target);
      }, { row, admin });
    }
    for (const width of [1366, 400, 412, 360]) {
      expired = false; rows = [canonical];
      await page.setViewportSize({ width, height: 915 }); await page.goto(base + '/dashboard/'); await render(projected(canonical));
      const card = page.locator('.lc-source-card'), brief = card.locator('.lc-brief'); await brief.waitFor();
      assert.equal(await brief.locator('.lc-owner').innerText(), 'Synthetic Owner');
      assert.equal(await card.locator('.lc-source-address').innerText(), lead().address);
      assert.equal(await card.locator('.lc-source-details').getAttribute('open'), null);
      assert.equal(await card.locator('.wos-seller-call').count(), 0);
      for (const selector of ['[data-lc-channel="call"]', '.lc-text>summary', '.lc-source-details>summary']) {
        const box = await card.locator(selector).boundingBox(); assert(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const callBox = await brief.locator('[data-lc-channel="call"]').boundingBox(); assert(callBox.y + callBox.height < 915);
      if (screenshots && width !== 360) {
        const dir = path.join(root, 'docs/screens/source-contact-local'); fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, 'synthetic-source-contact-' + width + '.png'), fullPage: true });
      }
      const before = writes;
      const tapResponse = page.waitForResponse(response => response.url().endsWith('/contact-workflow'));
      await brief.locator('[data-lc-channel="call"]').click();
      assert.equal((await tapResponse).status(), 200);
      await page.waitForFunction(() => syntheticSourceNative.length === 1); assert.equal(writes, before + 1);
      assert.equal(store.activities.at(-1).source_queue_key, canonical.queue_key);
      assert.deepEqual(store.activities.at(-1).source_market, { city: 'Dallas', county: 'Dallas', state: 'TX' });
      await brief.locator('.lc-text>summary').click(); await brief.locator('[data-lc-message]').fill('Synthetic edited local message');
      await brief.locator('[data-lc-channel="text"]').click(); await page.waitForFunction(() => syntheticSourceNative.length === 2);
      assert.equal(store.activities.at(-1).type, 'local_contact_requested'); assert.equal(store.activities.at(-1).message, undefined);
      assert.equal(await page.evaluate(() => syntheticSourceNative[1]), 'sms:+15550101234?body=Synthetic%20edited%20local%20message');
      await card.locator('.lc-source-details>summary').click(); assert(await card.locator('.lc-source-details').evaluate(node => node.open));
      rows = [{ ...canonical, do_not_call: true }];
      await brief.locator('[data-lc-channel="call"]').click(); await page.waitForFunction(() => document.querySelector('[data-lc-status]').textContent.includes('Could not'));
      assert.equal(writes, before + 2); assert.equal(await page.evaluate(() => syntheticSourceNative.length), 2);
      rows = [canonical]; expired = true; await brief.locator('[data-lc-channel="call"]').click();
      await page.waitForFunction(() => !document.querySelector('.lc-brief')); assert.equal(writes, before + 2);
    }
    expired = false;
    for (const patch of [{ free_contact_routes: [] }, { owner_record: {} }, { owner_type: 'bank' }, { owner_type: 'government' },
      { free_contact_routes: [{ ...canonical.free_contact_routes[0], status: 'rejected' }] },
      { free_contact_routes: [{ ...canonical.free_contact_routes[0], evidence_text: 'Unconfirmed phone 5550101234' }] }]) {
      await render(projected({ ...canonical, ...patch })); assert.equal(await page.locator('.lc-source-card [data-lc-channel]').count(), 0);
      if (Array.isArray(patch.free_contact_routes) && patch.free_contact_routes.length === 0) {
        const search = page.locator('.lc-source-card .lc-search'); await search.locator('summary').click();
        assert.equal(await search.locator('a').count(), 3);
        for (const href of await search.locator('a').evaluateAll(nodes => nodes.map(node => node.href))) assert.match(href, /^https:\/\//);
      }
    }
    await render(projected(canonical), false); assert.equal(await page.locator('.lc-source-card').count(), 0);
    await render({ ...projected(canonical), contact_summary_authorized: 'true' }); assert.equal(await page.locator('.lc-source-card').count(), 0);
    await render(projected({ ...canonical, posted_at: '2026-12-01', sale_date_source_field: 'posted_at', sale_date_iso: '2026-12-01', sale_date_parse_status: 'parsed' }));
    assert(await page.locator('.lc-source-card').getByText('Sale date not confirmed - ask on the call.', { exact: true }).isVisible());
    await render(projected({ ...canonical, sale_date: 'December 1, 2026', sale_date_source_field: 'sale_date', sale_date_iso: '2026-12-01', sale_date_parse_status: 'parsed' }));
    assert(await page.locator('.lc-source-card').getByText('Sale date from source: December 1, 2026', { exact: true }).isVisible());
    assert.deepEqual(errors, []); assert.equal(unrelatedWrites, 0); assert.deepEqual(store.leads, []);
    assert.equal(JSON.stringify([canonical]), original); assert.equal(JSON.stringify(store).includes('contact_brief'), false);
    console.log('source-contact UI: actual renderer/controller/intent handler1366/400/412/360,44px/in-screen/no overflow,collapsed details,edited SMS local only,canonical intent,stale409/session401/negative ownership and zero snapshots/leads/provider/native writes PASS');
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
module.exports = { prove };
if (require.main === module) prove({ screenshots: true }).catch(error => { console.error(error.stack); process.exitCode = 1; });
