'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const express = require('express');
const { createFixtureApp } = require('./verify-marketplace-ui');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
async function prove() {
  const fixture = createFixtureApp({ seedLead: true }), app = express();
  const baseRef = '7b36ed2d76e4a55069020df0c0cafe1921f37fae';
  const root = path.resolve(__dirname, '..'), dir = path.join(root, 'docs/screens/2026-10-22-navigation/before');
  const files = new Map(['index.html', 'app.js', 'navigation.js', 'design-system.css'].map(file => [file, execFileSync('git', ['show', baseRef + ':dashboard/workspace/' + file], { cwd: root })]));
  app.get('/app', (_, res) => res.type('html').send(files.get('index.html')));
  app.use('/dashboard/workspace', (req, res, next) => { const file = req.path.slice(1); if (!files.has(file)) return next(); res.type(file.endsWith('.css') ? 'css' : 'js').send(files.get(file)); });
  app.use(fixture.app);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    fs.mkdirSync(dir, { recursive: true });
    for (const width of [1366, 400, 412]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1366 ? 768 : 915 } });
      const external = [], writes = [];
      await page.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (req.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
        if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
        if (url.pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
        if (url.origin !== base) { external.push(url.hostname); return route.abort(); }
        return route.continue();
      });
      await page.goto(base + '/app?preview=1');
      await page.locator('.ws-shell').waitFor();
      await page.screenshot({ path: path.join(dir, 'home-' + width + '.png') });
      if (width !== 1366) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.locator((width === 1366 ? '.ws-sidebar ' : '#mobile-nav ') + 'a[href="/dashboard/?workspace=deals"]').click();
      await page.locator('.td-card').first().waitFor();
      assert.equal(await page.locator('.ws-shell').count(), 0, 'Reproduces the old shell jump');
      await page.screenshot({ path: path.join(dir, 'deals-' + width + '.png') });
      await page.evaluate(() => navigate('gmail', null));
      await page.locator('[data-email-message]').first().waitFor();
      await page.screenshot({ path: path.join(dir, 'email-' + width + '.png') });
      await page.evaluate(() => navigate('todays_deals', null));
      await page.locator('.td-card').first().waitFor();
      await page.screenshot({ path: path.join(dir, 'deals-return-' + width + '.png') });
      assert.deepEqual(external, []); assert.deepEqual(writes, []);
      await page.close();
    }
    fixture.assertUnchanged();
    console.log('Synthetic navigation BEFORE proof: exact baseline' + baseRef + '; three widths; no writes/external requests');
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
prove().catch(e => { console.error(e.stack); process.exitCode = 1; });
