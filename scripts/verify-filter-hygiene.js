'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createFixtureApp} = require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser} = require('../modules/research/playwright-browser-resolver');
async function prove({screenshots = false} = {}) {
  const fixture = createFixtureApp();
  const server = await new Promise(resolve => {const s = fixture.app.listen(0, '127.0.0.1', () => resolve(s));});
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser, measured = false;
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
      if (url.pathname === '/api/dashboard/todays-deals') {
        const response = await route.fetch(), payload = await response.json();
        payload.counts = {total: payload.counts.total, shown: payload.counts.shown, ...(measured ? {vetted_today: 0, jv: 0} : {})};
        return route.fulfill({response, json: payload});
      }
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const dir = path.join(__dirname, '../docs/screens/2026-10-15-filter-hygiene');
    if (screenshots) fs.mkdirSync(dir, {recursive: true});
    for (const width of [1366, 1920, 400, 412]) {
      measured = false;
      await page.setViewportSize({width, height: width === 1366 ? 768 : width === 1920 ? 1080 : 915});
      await page.goto(base + '/dashboard/');
      for (const tab of ['todays_deals', 'jv']) {
        await page.evaluate(tab => navigate(tab, null), tab);
        await page.locator('.td-summary').first().waitFor();
        assert.ok(!(await page.locator('.td-counts').innerText()).includes('Not measured'));
        assert.equal(await page.locator('.td-counts').getByText('Checked today:', {exact: false}).count(), 0);
        assert.equal(await page.locator('.td-counts').getByText('Eligible JV:', {exact: false}).count(), 0);
        assert.equal(await page.locator('.td-filter-bar [data-open-deal-import],.td-filter-bar [data-open-glossary]').count(), 0);
        assert.equal(await page.locator('.td-page-tools button').count(), 2);
        assert.ok(await page.locator('.td-page-tools [data-open-deal-import]').isVisible());
        if (width <= 412) {
          assert.equal(await page.locator('.td-filter-bar').evaluate(e => e.open), false);
          await page.locator('.td-filter-bar>summary').click();
          assert.ok(await page.locator('[data-list-filter="state"]').isVisible());
          await page.locator('.td-filter-bar>summary').click();
        }
        const bounds = await page.locator('.td-page-tools').evaluate(e => ({left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, overflow: e.scrollWidth > e.clientWidth + 1}));
        assert.ok(bounds.left >= 0 && bounds.right <= width && !bounds.overflow);
        if (screenshots) {
          await page.mouse.move(0, 0); await page.keyboard.press('Escape');
          await page.screenshot({path: path.join(dir, 'synthetic-' + tab + '-' + width + '.png')});
        }
      }
      await page.locator('[data-open-glossary]').click();
      await page.getByRole('heading', {name: 'Glossary', exact: true}).waitFor();
      await page.evaluate(() => navigate('todays_deals', null)); await page.locator('.td-summary').first().waitFor();
      await page.locator('[data-open-deal-import]').click();
      await page.locator('.bf-card').first().waitFor();
      measured = true;
      await page.evaluate(() => navigate('todays_deals', null)); await page.locator('.td-summary').first().waitFor();
      if (!(await page.locator('.td-filter-bar').evaluate(e => e.open))) await page.locator('.td-filter-bar summary').click();
      await page.locator('[data-deal-reload]').click();
      await page.waitForFunction(() => document.querySelector('.td-counts')?.textContent.includes('Checked today: 0 of 10'));
      assert.ok(!(await page.locator('.td-counts').innerText()).includes('Eligible JV:'), 'Owner455.8 removes the jargon count, not the underlying eligibility gate');
    }
    fixture.assertUnchanged(); assert.deepEqual(writes, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log('Filter hygiene1366/1920/400/412: absent metrics hidden, measured0 retained, phone collapsed/openable, tools outside filters and normal navigation, no overflow/writes/external requests.');
  } finally {if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
}
module.exports = {prove};
if (require.main === module) prove({screenshots: process.argv.includes('--screenshots')}).catch(error => {console.error(error.stack); process.exitCode = 1;});
