'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { pathToFileURL } = require('node:url');
const express = require('express');
const { createFixtureApp } = require('./verify-marketplace-ui');
const { registerWorkspacePreview } = require('../modules/ui/workspace-preview');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
async function prove() {
  if (!process.env.WOS_LIGHTHOUSE_PATH) throw Error('Set WOS_LIGHTHOUSE_PATH to the local audit tool; no application dependency is required');
  const fixture = createFixtureApp({ seedLead: true }), app = express();
  registerWorkspacePreview(app); app.use(fixture.app);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const portServer = net.createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  let browser;
  const results = [];
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true, args: ['--remote-debugging-port=' + port] })).browser;
    const lighthouse = (await import(pathToFileURL(path.resolve(process.env.WOS_LIGHTHOUSE_PATH)).href)).default;
    for (const width of [1366, 412]) {
      const result = await lighthouse(base + '/dashboard/', { port, logLevel: 'error', onlyCategories: ['accessibility'], formFactor: width === 1366 ? 'desktop' : 'mobile', throttlingMethod: 'provided', screenEmulation: { mobile: width !== 1366, width, height: width === 1366 ? 768 : 915, deviceScaleFactor: 1, disabled: false } });
      const score = Math.round(result.lhr.categories.accessibility.score * 100);
      const failed = Object.values(result.lhr.audits).filter(a => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'notApplicable').map(a => ({ id: a.id, title: a.title }));
      results.push({ width, score, failed, version: result.lhr.lighthouseVersion });
    }
    const dir = path.resolve(__dirname, '../docs/screens/2026-10-22-navigation/after'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'accessibility.json'), JSON.stringify({ synthetic_only: true, results }, null, 2) + '\n');
    console.log(JSON.stringify(results));
    assert(results.every(r => r.score >= 90), 'Navigation accessibility must be90+'); fixture.assertUnchanged();
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
prove().catch(e => { console.error(e.stack); process.exitCode = 1; });
