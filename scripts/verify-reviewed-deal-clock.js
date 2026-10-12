'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createFixtureApp } = require('./verify-marketplace-ui');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
async function prove({ screenshots = false } = {}) {
  const fixture = createFixtureApp(); const server = await new Promise(resolve => { const s = fixture.app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port; let browser; const errors = [], external = [], writes = [];
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const request = route.request(), url = request.url();
      if (!['GET', 'HEAD'].includes(request.method())) { writes.push(request.method()); return route.abort(); }
      if (url.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ contentType: 'text/css', body: '' });
      if (new URL(url).pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
      if (url.startsWith(base + '/')) return route.continue(); external.push(new URL(url).hostname); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    for (const width of [1366, 400, 412]) {
      await page.setViewportSize({ width, height: 915 }); await page.goto(base + '/dashboard/');
      await page.locator('.td-summary .wos-card-clock').waitFor();
      const clock = page.locator('.td-summary .wos-card-clock').first();
      for (const label of ['Added to WholesaleOS', 'Source captured', 'Days since added', 'Closing date', 'Time left', 'Last recorded action', 'Current stage', 'Next step']) assert.ok((await clock.innerText()).includes(label));
      assert.ok(!(await clock.innerText()).includes('T00:00:00.000Z')); assert.ok((await clock.innerText()).includes('recorded by fixture-admin'));
      await page.locator('[data-deal-open]').first().click();
      const detail = page.locator('.td-detail .wos-card-clock').first(); await detail.waitFor();
      const rect = await detail.evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, scroll: el.scrollWidth, width: el.clientWidth, children: [...el.querySelectorAll('dd')].map(child => ({ scroll: child.scrollWidth, width: child.clientWidth })) }; });
      assert.ok(rect.left >= 0 && rect.right <= width && rect.scroll <= rect.width + 1, JSON.stringify(rect)); assert.ok(rect.children.every(child => child.scroll <= child.width + 1));
      assert.ok((await page.locator('.td-detail').innerText()).includes('Captured '));
      assert.equal(await detail.locator('button,input,a').count(), 0, 'clock is not an action control');
      if (screenshots) { const dir = path.join(__dirname, '../docs/screens/2026-10-12-reviewed-deal-clocks'); fs.mkdirSync(dir, { recursive: true }); await detail.screenshot({ path: path.join(dir, 'synthetic-clock-' + width + '.png') }); }
      await page.locator('[data-deal-back]').click(); await page.locator('.td-summary .wos-card-clock').waitFor();
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(writes, []); fixture.assertUnchanged();
    console.log('Reviewed deal clocks real full index1366/400/412: summary/open-card/back render, owner-time labels, fitted text, no actions, zero writes/external calls and unchanged store passed.');
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
module.exports = { prove }; if (require.main === module) prove({ screenshots: process.argv.includes('--screenshots') }).catch(error => { console.error(error.stack); process.exitCode = 1; });
