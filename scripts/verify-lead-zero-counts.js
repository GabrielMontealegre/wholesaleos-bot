'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createFixtureApp} = require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser} = require('../modules/research/playwright-browser-resolver');
async function prove({screenshots = false} = {}) {
  const fixture = createFixtureApp({seedLead: true});
  const server = await new Promise(resolve => {const s = fixture.app.listen(0, '127.0.0.1', () => resolve(s));});
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser, empty = false;
  const writes = [], external = [], errors = [];
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), {headless: true})).browser;
    const context = await browser.newContext();
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (!['GET', 'HEAD'].includes(req.method())) {writes.push(req.method()); return route.abort();}
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({contentType: 'text/css', body: ''});
      if (url.pathname === '/helper/status') return route.fulfill({json: {paired: false}});
      if (url.origin !== base) {external.push(url.hostname); return route.abort();}
      if (url.pathname === '/api/leads') {
        if (empty) return route.fulfill({json: {leads: [], totalAll: 12039, totalFiltered: 0}});
        const response = await route.fetch();
        return route.fulfill({response, json: {...await response.json(), totalAll: 12039, totalFiltered: 1}});
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const dir = path.join(__dirname, '../docs/screens/2026-10-15-lead-zero-counts');
    if (screenshots) fs.mkdirSync(dir, {recursive: true});
    for (const width of [1366, 1920, 400, 412]) {
      empty = false;
      await page.setViewportSize({width, height: width === 1366 ? 768 : width === 1920 ? 1080 : 915});
      await page.goto(base + '/dashboard/');
      await page.evaluate(() => navigate('leads', null));
      await page.waitForFunction(() => APP._leadsTotalFiltered === 1 && APP.leads.length === 1);
      empty = true;
      await page.evaluate(() => loadLeadsFromAPI({resetPage: true}));
      await page.waitForFunction(() => APP._leadsTotalFiltered === 0 && APP.leads.length === 0);
      assert.equal(await page.evaluate(() => APP._leadsTotalAll), 12039);
      assert.equal(await page.evaluate(() => APP.filtered.length), 0);
      assert.ok((await page.locator('#content').innerText()).includes('No leads'));
      assert.ok(!(await page.locator('#content').innerText()).includes('Filtered pool 12,039'));
      if (screenshots) await page.screenshot({path: path.join(dir, 'synthetic-zero-results-' + width + '.png')});
      empty = false;
      await page.evaluate(() => loadLeadsFromAPI({resetPage: true}));
      await page.waitForFunction(() => APP._leadsTotalFiltered === 1 && APP.leads.length === 1);
    }
    fixture.assertUnchanged();
    assert.deepEqual(writes, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log('Leads zero-result hydration and recovery passed at1366/1920/400/412; total12039 stays separate from filtered0; zero writes/external calls.');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
module.exports = {prove};
if (require.main === module) prove({screenshots: process.argv.includes('--screenshots')}).catch(e => {console.error(e.stack); process.exitCode = 1;});
