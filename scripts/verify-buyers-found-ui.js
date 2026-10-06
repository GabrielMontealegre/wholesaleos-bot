'use strict';

// Local fixtures only. No production data, social requests, or message sending.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const finds = require('../modules/buyers/assistant-finds');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/screens/buyers-found-local');
const now = '2026-10-06T12:00:00.000Z';
const items = finds.validateItems({ items: [{
  name: 'SYNTHETIC BUYER', platform: 'facebook', group_name: 'SYNTHETIC GROUP', group_id: '123',
  profile_url: 'https://www.facebook.com/groups/123/user/456/',
  source_url: 'https://www.facebook.com/groups/123/search/?q=buy%20box',
  what_they_buy: 'Synthetic fixture: houses in the stated metro.', deal_type: 'house',
  states: ['TX'], areas: ['Example metro'], drafted_message: 'Synthetic draft only. Nothing is sent.', captured_at: now,
  classification: 'end_buyer', buy_box: { state: 'TX', areas: ['Example metro'], types: ['house'], price_max: 200000 }
}] }, now);
let store = finds.ingest({ buyers: [], leads: [{ state: 'TX', city: 'Example metro', property_type: 'house', price: 150000 }] }, items, { now, operatorId: 'synthetic', createId: () => 'fixture' }).store;
let writes = 0;
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNTHETIC UI PROOF</title><style>body{margin:0;padding:16px;font:14px Arial;background:#fafafa}h1{font-size:20px}*{box-sizing:border-box}</style><h1>Buyers found - SYNTHETIC TEST ONLY</h1><main></main><script src="/ui.js"></script><script>document.querySelector("main").innerHTML=renderBuyersFound();</script>'));
app.get('/ui.js', (req, res) => res.sendFile(path.join(root, 'dashboard/wos-buyers-found.js')));
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/api/dashboard/buyers-found', (req, res) => res.json(finds.listFinds(store, { now })));
app.patch('/api/dashboard/buyers-found/:id', (req, res) => {
  store = finds.update(store, req.params.id, req.body, { now, operatorId: 'synthetic' });
  writes++;
  res.json({ ok: true });
});

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext();
    const external = [];
    await context.route('**/*', (route) => {
      if (route.request().url().startsWith(base + '/')) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    for (const width of [1366, 400]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base);
      await page.locator('.bf-card').waitFor();
      assert.strictEqual(writes, 0, 'loading must not write');
      assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, 'synthetic-' + width + '.png'), fullPage: true });
    }
    await page.locator('textarea').fill('Edited synthetic draft.');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Draft saved.' }).waitFor();
    assert.strictEqual(await page.getByRole('button', { name: 'Mark messaged', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Approval saved.' }).waitFor();
    await page.getByText('Leads that fit this buy box: 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Mark messaged', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Status saved.' }).waitFor();
    await page.reload();
    await page.locator('.bf-card').waitFor();
    assert.strictEqual(await page.locator('textarea').inputValue(), 'Edited synthetic draft.');
    assert.strictEqual(await page.getByRole('button', { name: 'Mark messaged', exact: true }).isDisabled(), true);
    await page.locator('[data-filter=status]').selectOption('new');
    await page.getByText('No buyers match these filters.').waitFor();
    await page.locator('[data-filter=status]').selectOption('');
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Approval saved.' }).waitFor();
    assert.strictEqual(await page.locator('.bf-card').count(), 0);
    await page.locator('[data-filter=approval]').selectOption('rejected');
    await page.locator('.bf-card').waitFor();
    assert.strictEqual(writes, 4);
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(external, []);
    console.log('UI proof: 1366px/400px; no overflow; 0 browser errors; 0 external requests; local draft/status persisted.');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
