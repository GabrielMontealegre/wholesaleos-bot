'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const express = require('express');
const deals = require('../modules/deals/reviewed-deals'); const { registerReviewedDealRoutes } = require('../modules/deals/reviewed-deal-routes');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const { fixture, buyer, now } = require('../tests/reviewed-deals.test');
const root = path.resolve(__dirname, '..'); const output = path.join(root, 'docs/screens/todays-deals-local');
let store = deals.ingest({ buyers: [buyer], leads: [] }, [deals.validate(fixture(), now)], { now, operatorId: 'fixture-admin', createId: () => 'fixture-deal' }).store;
for (const input of [{ action: 'approve', reviewed_comps: true }, { action: 'status', status: 'vetted' }, { action: 'status', status: 'holder_confirmed', evidence_url: fixture().source_url, checks: { still_available: true } }]) store = deals.update(store, 'fixture-deal', input, { now, operatorId: 'fixture-admin' });
const saved = JSON.stringify(store); let writes = 0;
const app = express(); app.use(express.json());
app.get('/dashboard/glossary.json', (_, res) => setTimeout(() => res.sendFile(path.join(root, 'dashboard/glossary.json')), 250));
app.use('/dashboard', express.static(path.join(root, 'dashboard')));
app.get('/', (_, res) => res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNTHETIC DEAL PROOF</title><style>body{background:#080f1e;color:#e2e8f0;margin:0;padding:16px;font:14px Arial}*{box-sizing:border-box}</style><main id="content"></main><script>var APP={page:"todays_deals"};function renderDashboard(){return "<h2>Dashboard</h2>"};function navigate(page){APP.page=page;document.getElementById("content").innerHTML=page==="jv"?renderJV():page==="glossary"?renderGlossary():renderTodaysDeals()}</script><script src="/base-theme.js"></script><script src="/dashboard/wos-theme-a1.js"></script><script src="/dashboard/wos-help.js"></script><script src="/dashboard/wos-todays-deals.js"></script><script>navigate("todays_deals")</script>'));
app.get('/base-theme.js', (_, res) => { const s = fs.readFileSync(path.join(root, 'dashboard/wos-features.js'), 'utf8'); const start = s.indexOf('(function injectA1Theme(){'); const end = s.indexOf('})();', start); assert.ok(start >= 0 && end > start); res.type('js').send(s.slice(start, end + 5)); });
app.get('/favicon.ico', (_, res) => res.status(204).end());
registerReviewedDealRoutes(app, { db: { readDBStrict: () => store, writeDB: s => { store = s; writes++; } }, requireAdmin: (req, res, next) => { req.currentUser = { id: 'fixture-admin' }; next(); }, now: () => now });
(async () => {
  fs.mkdirSync(output, { recursive: true }); const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); }); let browser;
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext(); const base = 'http://127.0.0.1:' + server.address().port; const external = []; const errors = [];
    await context.route('**/*', r => { if (r.request().url().startsWith(base + '/')) return r.continue(); external.push(r.request().url()); return r.abort(); });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    for (const width of [1366, 400, 412]) {
      await page.setViewportSize({ width, height: width === 412 ? 915 : 900 }); await page.goto(base);
      await page.locator('.td-card').waitFor(); await page.getByRole('button', { name: 'Explain ARV', exact: true }).first().waitFor();
      await page.getByText('Open complete deal card', { exact: true }).click();
      assert.strictEqual(await page.locator('.td-card tbody tr').count(), 3); assert.ok((await page.locator('.td-card').innerText()).includes('$168,250'));
      await page.getByText('Open buyer: Fixture Investor - $168,250', { exact: true }).click();
      assert.ok((await page.locator('.td-card').innerText()).includes('No buyer introduction'));
      const help = page.getByRole('button', { name: 'Explain ARV', exact: true }).first(); await help.focus();
      assert.strictEqual(await help.getAttribute('aria-describedby') != null, true); assert.strictEqual(await page.locator('#' + await help.getAttribute('aria-describedby')).isVisible(), true);
      await help.press('Escape'); await help.click(); assert.strictEqual(await help.getAttribute('aria-expanded'), 'true'); await help.click();
      const terms = await page.locator('[data-help-term]').evaluateAll(els => els.map(e => e.dataset.helpTerm)); const glossary = JSON.parse(fs.readFileSync(path.join(root, 'dashboard/glossary.json'))); assert.ok(terms.every(t => glossary[t]));
      assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const contrast = await page.locator('.td-card h3').evaluate(e => ({ color: getComputedStyle(e).color, background: getComputedStyle(e.closest('.td-card')).backgroundColor }));
      assert.strictEqual(contrast.background, 'rgb(12, 20, 34)');
      assert.strictEqual(await page.locator('.td-filters label').first().evaluate(e => getComputedStyle(e).color), 'rgb(226, 232, 240)');
      await page.getByRole('heading', { name: /Today's Deals/ }).click();
      await page.screenshot({ path: path.join(output, 'synthetic-deal-' + width + '.png'), fullPage: true });
      await page.evaluate(() => navigate('jv')); await page.locator('.td-card').waitFor(); assert.strictEqual(await page.locator('.td-card').count(), 1);
      await page.screenshot({ path: path.join(output, 'synthetic-jv-' + width + '.png'), fullPage: true });
      await page.getByRole('button', { name: 'Glossary', exact: true }).click(); await page.getByRole('heading', { name: 'Glossary', exact: true }).waitFor();
      assert.strictEqual(await page.locator('.wos-glossary h3').count(), Object.keys(glossary).length); assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, 'synthetic-glossary-' + width + '.png'), fullPage: true });
    }
    assert.strictEqual(writes, 0); assert.strictEqual(JSON.stringify(store), saved); assert.deepStrictEqual(errors, []); assert.deepStrictEqual(external, []);
    console.log('Actual-theme UI: Today/JV/card/Glossary at 1366/400/412, late glossary, keyboard and tap tooltips, no overflow, errors, writes or external requests.');
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
