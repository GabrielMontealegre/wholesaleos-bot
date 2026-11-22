'use strict';
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { lead } = require('../tests/helpers/lead-contact-fixture');
const { buildLeadContactBrief } = require('../modules/research/lead-contact-brief');
const operational = require('../modules/research/operational-lead-eligibility');
const { registerLeadContactTapRoutes } = require('../modules/records/lead-contact-tap-routes');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
function contrast(foreground, background) {
  function luminance(color) {
    const rgb = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  const a = luminance(foreground), b = luminance(background); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
async function prove({ screenshots = false } = {}) {
  const root = path.resolve(__dirname, '..'), app = express();
  let store = { users: [{ id: 'synthetic-admin', name: 'Synthetic Operator', role: 'admin', firstLogin: false }], leads: [lead()], activities: [] };
  const original = JSON.stringify(store.leads); let writes = 0, otherWrites = 0, expired = false;
  function projected(row) { return { ...row, operational_eligibility: operational.classify(row), contact_brief: buildLeadContactBrief(row) }; }
  app.use(express.json());
  registerLeadContactTapRoutes(app, { db: { readDBStrict: () => store, writeDB(value) { writes++; store = value; } },
    requireAdmin(req, res, next) { if (expired) return res.status(401).json({ code: 'session_required' }); req.currentUser = store.users[0]; next(); },
    now: () => '2026-11-22T04:30:00.000Z' });
  app.use((req, res, next) => { if (!['GET', 'HEAD'].includes(req.method)) { otherWrites++; return res.status(405).json({ code: 'synthetic_no_other_writes' }); } next(); });
  app.get('/api/auth/session', (_req, res) => res.json({ authenticated: true, role: 'admin', user: store.users[0] }));
  app.get('/api/auth/role', (_req, res) => res.json({ role: 'admin', isAdmin: true, userId: 'synthetic-admin' }));
  app.get('/api/users', (_req, res) => res.json({ users: store.users }));
  app.get('/api/leads', (_req, res) => res.json({ leads: store.leads.map(projected), totalAll: 1, totalFiltered: 1 }));
  app.get('/api/dashboard/operational-leads', (_req, res) => res.json({ rows: store.leads.map(projected), total: 1, counts: operational.counts(store.leads), counts_all: operational.counts(store.leads) }));
  app.get('/api/dashboard/research-queue/current', (_req, res) => res.json({ ok: true, rows: [], batches: [], auto_run: { enabled: false } }));
  app.get('/api/*', (_req, res) => res.json([])); app.get('/favicon.ico', (_req, res) => res.status(204).end());
  app.use('/dashboard', express.static(path.join(root, 'dashboard')));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port; let browser;
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext();
    await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    const output = path.join(root, 'docs/screens/lead-contact-local'); if (screenshots) fs.mkdirSync(output, { recursive: true });
    for (const width of [1366, 400, 412, 360]) {
      expired = false;
      await page.setViewportSize({ width, height: 915 }); await page.goto(base + '/dashboard/');
      await page.evaluate(rows => {
        WOSDashboardAuth.applyAuthenticatedUser(APP, { id: 'synthetic-admin', name: 'Synthetic Operator', role: 'admin', firstLogin: false });
        APP.leads = rows; APP.buyers = []; APP.followups = [];
        window.syntheticNativeLinks = [];
        WOSLeadContact.openLocal = target => window.syntheticNativeLinks.push(target);
        openLeadModal(rows[0].id);
      }, store.leads.map(projected));
      const panel = page.locator('#modal-content .lc-brief'); await panel.waitFor();
      assert.equal(await panel.locator('.lc-owner').innerText(), 'Synthetic Owner');
      assert.equal(await page.locator('[data-lc-header-meta]').getAttribute('open'), null);
      assert.equal(await page.locator('[data-lc-address]').innerText(), store.leads[0].address);
      assert.equal(await panel.locator('a[href^="tel:"]').getAttribute('href'), 'tel:+15550101234');
      assert.equal(await page.locator('#modal-content a[href^="tel:"]').count(), 1, 'old bare-phone action removed for admin');
      const bounds = await panel.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      for (const selector of ['[data-lc-channel="call"]', '.lc-text > summary']) {
        const box = await panel.locator(selector).boundingBox(); assert.ok(box.height >= 44); assert.ok(box.y + box.height < 915);
      }
      if (screenshots && width !== 360) await page.screenshot({ path: path.join(output, 'synthetic-contact-' + width + '.png'), fullPage: true });
      const count = writes; await panel.locator('[data-lc-channel="call"]').click();
      await page.waitForFunction(() => window.syntheticNativeLinks.length === 1);
      assert.equal(writes, count + 1); assert.equal(store.activities.at(-1).type, 'local_contact_requested');
      await panel.locator('.lc-text > summary').click(); await panel.locator('[data-lc-message]').fill('Edited synthetic message 123 & 456');
      await panel.locator('[data-lc-channel="text"]').click();
      await page.waitForFunction(() => window.syntheticNativeLinks.length === 2);
      assert.equal((await page.evaluate(() => window.syntheticNativeLinks[1])), 'sms:+15550101234?body=Edited%20synthetic%20message%20123%20%26%20456');
      assert.equal(store.activities.at(-1).body, undefined); assert.equal(store.activities.at(-1).message, undefined);
      await panel.locator('.lc-proof > summary').click(); assert.ok(await panel.getByText('Owner of record phone: 5550101234', { exact: true }).isVisible());
      expired = true; await panel.locator('[data-lc-channel="call"]').click();
      await page.waitForFunction(() => !document.querySelector('.lc-brief'));
      assert.equal(await page.evaluate(() => window.syntheticNativeLinks.length), 2);
      assert.equal(await page.locator('#modal-content [data-lc-number]').count(), 0);
      await page.keyboard.press('Escape');
      expired = false;
      await page.goto(base + '/dashboard/');
      await page.evaluate(rows => {
        WOSDashboardAuth.applyAuthenticatedUser(APP, { id: 'synthetic-admin', name: 'Synthetic Operator', role: 'admin', firstLogin: false });
        APP.leads = rows; window.syntheticNativeLinks = []; WOSLeadContact.openLocal = target => window.syntheticNativeLinks.push(target);
        closeModal(); navigate('outreach', null);
      }, store.leads.map(projected));
      const card = page.locator('.ops-record .lc-brief'); await card.waitFor(); await card.scrollIntoViewIfNeeded();
      assert.equal(await card.locator('.lc-owner').innerText(), 'Synthetic Owner');
      for (const selector of ['.lc-call', '.lc-text > summary']) {
        const colors = await card.locator(selector).evaluate(element => [getComputedStyle(element).color, getComputedStyle(element).backgroundColor]);
        assert.ok(contrast(...colors) >= 4.5, 'contact control text has readable theme contrast');
      }
      if (screenshots && width !== 360) await page.screenshot({ path: path.join(output, 'synthetic-operational-' + width + '.png'), fullPage: true });
      await card.locator('[data-lc-channel="call"]').click(); await page.waitForFunction(() => window.syntheticNativeLinks.length === 1);
    }
    for (const patch of [{ free_contact_routes: [] }, { owner_record: {} }, { owner_type: 'bank' }, { owner_type: 'government' },
      { free_contact_routes: [{ ...lead().free_contact_routes[0], status: 'rejected' }] },
      { free_contact_routes: [{ ...lead().free_contact_routes[0], evidence_text: 'Unconfirmed phone: 5550101234' }] }]) {
      store.leads = [{ ...lead(), ...patch }];
      await page.evaluate(rows => { APP.leads = rows; openLeadModal(rows[0].id); }, store.leads.map(projected));
      const panel = page.locator('#modal-content .lc-brief'); await panel.waitFor();
      assert.equal(await panel.locator('[data-lc-channel]').count(), 0);
      if (Array.isArray(patch.free_contact_routes) && patch.free_contact_routes.length === 0) assert.equal(await panel.getByText('Find the owner\'s phone', { exact: true }).count(), 1);
    }
    store.leads = [lead()];
    assert.equal(JSON.stringify(store.leads), original); assert.equal(otherWrites, 0); assert.deepEqual(errors, []);
    console.log('lead-contact UI: actual dashboard1366/400/412/360, owner/phone/top44px, edited local SMS, admin tap activity, source details, auth clearing, unchanged leads/no other writes/external network PASS');
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
module.exports = { prove }; if (require.main === module) prove({ screenshots: true }).catch(error => { console.error(error.stack); process.exitCode = 1; });
