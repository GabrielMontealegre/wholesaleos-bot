'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const finds = require('../modules/buyers/assistant-finds');
const deals = require('../modules/deals/reviewed-deals');
const records = require('../modules/records/record-activity');
const { fixture, now } = require('../tests/reviewed-deals.test');
const root = path.resolve(__dirname, '..');
const pages = ['dashboard','todays_deals','jv','findme_scout','buyers_found','leads','pipeline','gmail','settings','record_activity'];
function createFixtureApp({wider=false}={}) {
  const context = { now, operatorId: 'fixture-admin' };
  let store = { users: [{ id: 'fixture-admin', name: 'SYNTHETIC ADMIN' }], leads: [], buyers: [], activities: [] };
  const buyer = finds.validateItems({ items: [{ name: 'Fixture buyer', platform: 'manual', source_url: 'https://records.example.test/buyer', profile_url: 'https://records.example.test/buyer', what_they_buy: 'Fixture houses', deal_type: 'house', states: ['FL'], areas: ['Tampa'], classification: 'end_buyer', captured_at: now, buy_box: { types: ['house'], pct_arv: '75%', price_max: 200000 } }] }, now)[0];
  store = finds.ingest(store, [buyer], { ...context, createId: () => 'fixture-buyer' }).store;
  store = finds.update(store, 'fixture-buyer', { approval: 'approved' }, context);
  const proposal=fixture();
  if(wider){proposal.comps[1].latitude=proposal.latitude+0.022;proposal.comps[2].latitude=proposal.latitude+0.032;}
  store = deals.ingest(store, [deals.validate(proposal, now)], { ...context, createId: () => 'fixture-deal' }).store;
  for (const input of [{ action: 'approve', reviewed_comps: true }, { action: 'status', status: 'vetted' }, { action: 'status', status: 'holder_confirmed', evidence_url: fixture().source_url, checks: { still_available: true } }]) store = deals.update(store, 'fixture-deal', input, context);
  const frozen = JSON.stringify(store); let writes = 0;
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { if (!['GET','HEAD'].includes(req.method)) { writes++; return res.status(405).json({ code: 'fixture_read_only' }); } next(); });
  app.get('/api/auth/session', (_, res) => res.json({ authenticated: true, role: 'admin' }));
  app.get('/api/leads', (_, res) => res.json({ leads: [], totalAll: 0, totalFiltered: 0 }));
  app.get('/api/buyers', (_, res) => res.json({ buyers: store.buyers }));
  app.get('/api/dashboard/buyers-found', (_, res) => res.json(finds.listFinds(store, { now })));
  app.get('/api/dashboard/todays-deals', (req, res) => res.json(deals.list(store, { now, ...req.query })));
  app.get('/api/dashboard/record-activity', (_, res) => res.json({ ...records.listActivity(store), types: records.TYPES }));
  app.get('/api/dashboard/record-refs', (_, res) => res.json({ missing: { leads: 0, buyers: 0, deals: 0, matches: 0 }, deal_reserve: records.sequenceFloorStatus(store) }));
  app.get('/api/dashboard/research-queue/current', (_, res) => res.json({ ok: true, market: { city: 'Fixture city', county: 'Fixture county', state: 'FL' }, rows: [], batches: [], auto_run: { enabled: false }, preview_only: true, not_a_saved_lead: true, manual_evidence_packet: { items: [{ queue_key: 'fixture-packet', address: '100 Example St, Example City, FL 00000', address_state: 'needs_source_proof', subject_address_verified_for_research: false, preview_only: true, not_a_saved_lead: true, packet: {}, discovery: { call_ready: false, call_blocked_reason: 'Synthetic research-only fixture', gap_ledger: [], questions: [{ field: 'condition_detail', wording: 'What condition is the property in?', why: 'Fixture question', useful_answer: 'Recorded answer only', follow_up: 'Fixture follow-up' }] } }] } }));
  app.get('/api/gmail/inbox', (_, res) => res.json({ messages: [], connected: false, error: 'Fixture email is not connected' }));
  app.get('/api/gmail/test',(_,res)=>res.json({ok:true,mode:'app_password',status:'Connected (App Password)'}));
  app.get('/api/gmail/messages',(_,res)=>res.json({ok:true,mode:'app_password',status:'Connected (App Password)',messages:[{id:'fixture-message',subject:'Fixture reply <img src=x onerror=alert(1)>',from:'fixture@example.test',date:now,unread:true}]}));
  app.get('/api/gmail/message/:id',(_,res)=>res.json({id:'fixture-message',subject:'Fixture reply',body:'Fixture text <script>alert(1)</script>',date:now,from:'fixture@example.test'}));
  app.get('/api/*', (_, res) => res.json([]));
  app.get('/favicon.ico', (_, res) => res.status(204).end());
  app.get('/dashboard/', (_, res) => res.type('html').send(fs.readFileSync(path.join(root, 'dashboard/index.html'), 'utf8').replace('<title>Montsan REI', '<title>SYNTHETIC LOCAL FIXTURE - Montsan REI').replace('<body data-wos-design="marketplace">','<body data-wos-design="marketplace"><div style="position:fixed;bottom:0;right:0;padding:4px 8px;background:var(--primary);color:var(--primary-ink);font:12px Arial;z-index:10001;pointer-events:none;">LOCAL TEST DATA</div>')));
  app.use('/dashboard', express.static(path.join(root, 'dashboard')));
  return { app, assertUnchanged() { assert.strictEqual(writes, 0); assert.strictEqual(JSON.stringify(store), frozen); } };
}
async function prove({ screenshots = false,wider=false } = {}) {
  const fixtureApp = createFixtureApp({wider});
  const server = await new Promise(resolve => { const s = fixtureApp.app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser; const report = []; const errors = []; const external = [];
  const output = path.join(root, 'docs/screens/marketplace-local');
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36' });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.startsWith(base + '/')) return route.continue();
      if (new URL(url).pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
      external.push(new URL(url).hostname); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    if (screenshots) fs.mkdirSync(output, { recursive: true });
    for (const width of [360,393,400,412,1366,1920]) {
      await page.setViewportSize({ width, height: width <= 412 ? 915 : 900 }); await page.goto(base + '/dashboard/');
      await page.locator('.marketplace-topnav').waitFor({ state: 'attached' });
      assert.strictEqual(await page.locator('#wosA1Theme,#wos-theme-a1').count(), 0, 'retired theme writers must not run');
      if (width < 901) {
        await page.getByRole('button',{name:'Open navigation menu',exact:true}).click();
        await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
        assert.ok(await page.getByRole('button',{name:'Close navigation menu',exact:true}).evaluate(element=>element===document.activeElement));
        await page.getByRole('button',{name:'Close navigation menu',exact:true}).press('Escape');
        assert.ok(!await page.locator('.sidebar').isVisible());
        await page.getByRole('button', { name: 'Search references, cities and ZIP codes', exact: true }).click();
        assert.ok(await page.locator('#global-search').isVisible());
        assert.ok((await page.locator('#global-search').boundingBox()).width >= width - 32);
        await page.locator('#global-search').press('Escape');
      }
      for (const name of pages) {
        await page.evaluate(name => navigate(name, null), name);
        if (['dashboard','todays_deals','jv'].includes(name)) await page.locator('.td-card').first().waitFor();
        if (name === 'buyers_found') await page.locator('.bf-card').first().waitFor();
        if (name === 'record_activity') await page.locator('[data-reference-reserve]').waitFor({ state: 'attached' });
        if (name === 'gmail') {
          await page.locator('[data-email-message]').waitFor();
          await page.locator('[data-email-test]').click();
          await page.locator('[data-email-status]').filter({hasText:'Connected (App Password)'}).waitFor();
          assert.strictEqual(await page.locator('#email-reader img').count(),0,'mail subject HTML cannot execute');
          await page.locator('[data-email-message]').click();
          await page.getByText('Fixture text <script>alert(1)</script>',{exact:true}).waitFor();
          assert.strictEqual(await page.locator('#email-reader script').count(),0,'message body is text only');
          await page.locator('[data-email-back]').click();
        }
        if (name === 'dashboard') {
          await page.locator('.wos-discovery-value').waitFor({state:'attached'});
          await page.locator('.wos-discovery-value').scrollIntoViewIfNeeded();
        }
        if (name === 'todays_deals') {
          assert.strictEqual(await page.locator('.td-summary button:not(.wos-help-button)').count(),1,'help icons are read-only, not workflow commands');
          assert.ok(!(await page.locator('.td-summary').innerText()).includes(fixture().address),'unsigned JV address must not leak on the compact card');
          await page.locator('[data-deal-open]').click();
          assert.ok(await page.locator('.td-open-view .td-detail').isVisible());
          assert.strictEqual(await page.locator('.td-card tbody tr').count(),3);
          if(wider){assert.strictEqual(await page.locator('[data-wider-comp]').count(),2);assert.ok((await page.locator('[data-wider-area-label]').innerText()).includes('up to 2.5 miles'));assert.ok((await page.locator('.td-math').innerText()).includes('Preliminary'));}
          await page.locator('[data-deal-action="exclude_comp"]').first().click();
          assert.ok((await page.locator('[data-deal-error]').innerText()).includes('written reason'),'an empty exclusion must not send a request');
          await page.locator('[data-deal-action="approve"]').click();
          assert.ok((await page.locator('[data-deal-error]').innerText()).includes('Nothing was saved.'),'unchecked review must show an inline error without a request');
          await page.locator('[data-deal-action="terms"]').click();
          assert.ok((await page.locator('[data-deal-error]').innerText()).includes('holder'),'terms require a source and verbatim operator note');
          await page.locator('[data-deal-back]').click();
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const measured = await page.evaluate(() => {
          const bad = []; const small = [];
          const controls = document.querySelectorAll('#content button,#content input,#content select,#content textarea,.topbar button,.topbar input');
          for (const element of controls) {
            const hitArea = element.type === 'checkbox' && element.closest('label') || element;
            const r = hitArea.getBoundingClientRect(); const css = getComputedStyle(element);
            if (!r.width || !r.height || css.visibility === 'hidden' || css.display === 'none' || element.closest('details:not([open])')) continue;
            if (r.top < 0 || r.top >= innerHeight || r.bottom <= 0) continue;
            if (r.left < -1 || r.right > innerWidth + 1) bad.push({ tag: element.tagName, id: element.id, left: r.left, right: r.right });
            if (r.height < 43.5 || r.width < 43.5) small.push({ tag: element.tagName, id: element.id, width: r.width, height: r.height });
          }
          return { width: innerWidth, bodyWidth: document.documentElement.scrollWidth, bad, small, background: getComputedStyle(document.body).backgroundColor };
        });
        report.push({ page: name, ...measured });
        assert.strictEqual(measured.background, 'rgb(247, 248, 250)');
        assert.ok(measured.bodyWidth <= width, name + ' page overflow at ' + width);
        assert.deepStrictEqual(measured.bad, [], name + ' controls outside viewport at ' + width);
        assert.deepStrictEqual(measured.small, [], name + ' controls below 44px at ' + width);
        if (screenshots && [400,412,1366].includes(width)) await page.screenshot({ path: path.join(output, name + '-' + width + '.png'), fullPage: true });
      }
    }
    fixtureApp.assertUnchanged(); assert.deepStrictEqual(errors, []); assert.deepStrictEqual(external, []);
    if (screenshots) fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(report, null, 2));
    console.log('Marketplace shell: 10 pages, six widths, real controls/forms, theme writer isolation, search, no writes/external requests/errors.');
    return report;
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
module.exports = { prove, createFixtureApp };
if (require.main === module) {
  if (process.argv.includes('--serve')) createFixtureApp().app.listen(32194, '127.0.0.1', () => console.log('Read-only synthetic preview: http://127.0.0.1:32194/dashboard/'));
  else prove({ screenshots: true }).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
