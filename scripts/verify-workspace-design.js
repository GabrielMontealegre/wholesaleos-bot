'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const { createFixtureApp } = require('./verify-marketplace-ui');
const { registerWorkspacePreview } = require('../modules/ui/workspace-preview');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function prove({ lighthousePath, screenshots = false } = {}) {
  const fixture = createFixtureApp({ todayProof: true, seedLead: true });
  registerWorkspacePreview(fixture.app);
  const server = await new Promise(resolve => { const s = fixture.app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const dir = path.resolve(__dirname, '../docs/screens/2026-10-20-workspace-design');
  const report = { synthetic_only: true, widths: [], accessibility: [] };
  let browser;
  try {
    const port = await freePort();
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true, args: ['--remote-debugging-port=' + port] })).browser;
    const context = await browser.newContext();
    const external = [], writes = [], errors = [];
    await context.route('**/*', route => {
      const request = route.request(), url = request.url();
      if (url.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ contentType: 'text/css', body: '' });
      if (new URL(url).pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
      if (!url.startsWith(base + '/')) { external.push(new URL(url).hostname); return route.abort(); }
      if (request.method() !== 'GET') { writes.push(new URL(url).pathname); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    if (screenshots) fs.mkdirSync(dir, { recursive: true });
    for (const width of [1366, 400, 412]) {
      await page.setViewportSize({ width, height: width === 1366 ? 768 : 915 });
      await page.goto(base + '/dashboard/');
      await page.locator('[data-today-action]').first().waitFor();
      if (screenshots) await page.screenshot({ path: path.join(dir, 'before-classic-' + width + '.png') });
      await page.goto(base + '/app?preview=1');
      await page.locator('[data-row]').first().waitFor();
      const paint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || null);
      assert(paint !== null && paint < 2000, 'Native shell first contentful paint <2s');
      for (const tab of ['Actions', 'Best deals', 'Last 24 hours']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
        if (screenshots) await page.screenshot({ path: path.join(dir, 'after-' + tab.toLowerCase().replace(/ /g, '-') + '-' + width + '.png') });
      }
      await page.getByRole('button', { name: 'Account', exact: true }).click();
      assert(await page.getByRole('dialog', { name: 'Account', exact: true }).isVisible());
      if (screenshots) await page.screenshot({ path: path.join(dir, 'after-account-' + width + '.png') });
      await page.keyboard.press('Escape');
      if (width !== 1366) {
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        if (screenshots) await page.screenshot({ path: path.join(dir, 'after-navigation-' + width + '.png') });
        await page.getByRole('button', { name: 'Close Navigation', exact: true }).click();
      }
      const fitting = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        brokenIcons: Array.from(document.querySelectorAll('.ws-icon')).filter(img => !img.complete || !img.naturalWidth).length,
        controlOverflow: Array.from(document.querySelectorAll('button,a')).filter(el => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1);
        }).length
      }));
      assert.deepEqual(fitting, { horizontalOverflow: false, brokenIcons: 0, controlOverflow: 0 });
      report.widths.push({ width, first_contentful_paint_ms: paint, ...fitting });
    }
    await page.goto(base + '/dashboard/?workspace=email');
    await page.waitForFunction(() => window.APP && window.APP.page === 'gmail');
    fixture.assertUnchanged();
    assert.deepEqual(external, []);
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);

    if (lighthousePath) {
      const lighthouse = (await import(pathToFileURL(path.resolve(lighthousePath)).href)).default;
      for (const width of [1366, 412]) {
        const result = await lighthouse(base + '/app?preview=1', { port, logLevel: 'error', onlyCategories: ['accessibility'],
          formFactor: width === 1366 ? 'desktop' : 'mobile', throttlingMethod: 'provided',
          screenEmulation: { mobile: width !== 1366, width, height: width === 1366 ? 768 : 915, deviceScaleFactor: 1, disabled: false } });
        const score = Math.round(result.lhr.categories.accessibility.score * 100);
        const failed = Object.values(result.lhr.audits).filter(a => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'notApplicable').map(a => ({ id: a.id, title: a.title, score: a.score }));
        report.accessibility.push({ width, lighthouse_version: result.lhr.lighthouseVersion, score, failed });
        assert(score >= 90, JSON.stringify(report.accessibility));
      }
    }
    if (screenshots) fs.writeFileSync(path.join(dir, 'synthetic-proof.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
    return report;
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

module.exports = { prove };
if (require.main === module) prove({ screenshots: process.argv.includes('--screenshots'), lighthousePath: process.env.WOS_LIGHTHOUSE_PATH }).catch(error => { console.error(error.stack); process.exitCode = 1; });
