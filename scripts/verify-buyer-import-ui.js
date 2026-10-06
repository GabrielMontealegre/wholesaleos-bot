'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { registerAssistantFindRoutes } = require('../modules/buyers/assistant-find-routes');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/screens/buyer-import-local');
const now = '2026-10-06T12:00:00.000Z';
const item = { name: 'SYNTHETIC BUYER', platform: 'facebook', group_name: 'SYNTHETIC GROUP', group_id: '123',
  profile_url: 'https://www.facebook.com/groups/123/user/456/', source_url: 'https://www.facebook.com/groups/123/search/?q=buy',
  what_they_buy: 'Synthetic fixture only', deal_type: 'house', classification: 'end_buyer', captured_at: now };
const body = { items: [item, { ...item }, { ...item, source_url: '' },
  { ...item, name: 'SYNTHETIC PARTNER', profile_url: 'https://www.facebook.com/groups/123/user/789/', classification: 'middleman_jv' }] };
let store = { buyers: [], leads: [] }; let writes = 0;
const app = express(); app.use(express.json());
app.get('/', (req, res) => res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNTHETIC IMPORT PROOF</title><style>body{margin:0;padding:16px;font:14px Arial}*{box-sizing:border-box}h1{font-size:20px}</style><div id="app"><main id="content"><h1>Buyers found - SYNTHETIC TEST ONLY</h1><div id="view"></div></main></div><script src="/base-theme.js"></script><script src="/theme.js"></script><script src="/ui.js"></script><script>document.getElementById("view").innerHTML=renderBuyersFound();</script>'));
app.get('/ui.js', (req, res) => res.sendFile(path.join(root, 'dashboard/wos-buyers-found.js')));
app.get('/theme.js', (req, res) => res.sendFile(path.join(root, 'dashboard/wos-theme-a1.js')));
app.get('/base-theme.js', (req, res) => {
  const source = fs.readFileSync(path.join(root, 'dashboard/wos-features.js'), 'utf8');
  const start = source.indexOf('(function injectA1Theme(){');
  const end = source.indexOf('})();', start);
  assert.ok(start >= 0 && end > start, 'existing base-theme injection must be found');
  res.type('js').send(source.slice(start, end + 5));
});
app.get('/favicon.ico', (req, res) => res.status(204).end());
registerAssistantFindRoutes(app, { db: { readDBStrict: () => store, writeDB: value => { store = value; writes++; } },
  requireAdmin: (req, res, next) => { req.currentUser = { id: 'synthetic-admin' }; next(); }, now: () => now });
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext(); const external = [];
    await context.route('**/*', route => { if (route.request().url().startsWith(base + '/')) return route.continue(); external.push(route.request().url()); return route.abort(); });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    for (const width of [1366, 400]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(base);
      await page.getByRole('button', { name: 'Import buyers', exact: true }).click();
      await page.locator('[data-import-file]').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(body)) });
      await page.getByText('File loaded. Preview it before importing.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      await page.getByText('2 new | 1 duplicates | 1 invalid', { exact: true }).waitFor();
      assert.strictEqual(writes, 0);
      assert.strictEqual(await page.locator('[data-import-approve]').isChecked(), false);
      assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, 'synthetic-preview-' + width + '.png'), fullPage: true });
    }
    await page.locator('[data-import-json]').fill('{bad');
    assert.strictEqual(await page.locator('[data-import-action=commit]').count(), 0, 'editing invalidates preview');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByText('Invalid JSON. Check the file format.', { exact: true }).waitFor();
    await page.locator('[data-import-json]').fill(JSON.stringify(body));
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByText('2 new | 1 duplicates | 1 invalid', { exact: true }).waitFor();
    await page.locator('[data-import-approve]').check();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByText('Imported 2 new, 1 duplicates, 1 invalid, 1 approved.', { exact: true }).waitFor();
    assert.strictEqual(writes, 1);
    assert.strictEqual(store.buyers.length, 2);
    assert.strictEqual(store.buyers[0].assistant_find.approval, 'approved');
    assert.strictEqual(store.buyers[1].assistant_find.approval, 'pending');
    await page.reload(); await page.locator('.bf-card').first().waitFor();
    assert.strictEqual(await page.locator('.bf-card').count(), 2);
    assert.deepStrictEqual(errors, []); assert.deepStrictEqual(external, []);
    console.log('Import UI: 1366/400; file + paste; no-write preview; stale-edit invalidation; explicit import; 1 end buyer approved, partner pending; no overflow/errors/external requests.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
