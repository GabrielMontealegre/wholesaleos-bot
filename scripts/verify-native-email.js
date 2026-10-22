'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), express = require('express');
const { pathToFileURL } = require('node:url');
const { createFixtureApp } = require('./verify-marketplace-ui');
const { registerWorkspacePreview } = require('../modules/ui/workspace-preview');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
async function prove({ screenshots = false, lighthousePath } = {}) {
  const fixture = createFixtureApp(), app = express();
  const at = '2026-10-20T12:00:00Z', thread = 'a'.repeat(64);
  const row = (id, patch = {}) => ({ id, date: at, source_kind: 'connected_mailbox', thread_key: thread, from: 'Synthetic Person <person@example.test>', sender_name: 'Synthetic Person', subject: 'Property details and next steps', direction: 'in', link_status: 'linked', conversation: { role: 'buyer', role_source_kind: 'operator_input', role_recorded_at: at }, ...patch });
  const messages = [row('earlier'), row('latest', { date: '2026-10-20T12:01:00Z' }), row('alert', { from: 'alerts@redfin.com', sender_name: 'Synthetic listing alert', thread_key: 'b'.repeat(64), subject: 'New listing alert', conversation: null, link_status: 'unlinked' })];
  const full = id => ({ ...messages.find(m => m.id === id), body: id === 'earlier' ? 'Earlier source text. Please send the recorded property information.' : 'Thanks for the update.\n\nI am reviewing the property details.\n\n' + 'Source text continues in the full-height reading pane. '.repeat(60) + '\n\nFINAL SOURCE LINE - not clipped.' });
  app.get('/api/gmail/messages', (req, res) => res.json({ ok: true, messages: req.query.folder === 'sent' ? [] : messages }));
  app.get('/api/gmail/thread', (req, res) => res.json({ ok: true, messages: JSON.parse(req.query.ids).map(full) }));
  app.get('/api/gmail/message/:id', (req, res) => res.json(full(req.params.id)));
  registerWorkspacePreview(app); app.use(fixture.app);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port, dir = path.resolve(__dirname, '../docs/screens/2026-10-20-native-email');
  let browser; const report = { synthetic_only: true, widths: [], accessibility: [] };
  try {
    const portServer = require('node:net').createServer();
    await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
    const port = portServer.address().port;
    await new Promise(resolve => portServer.close(resolve));
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true, args: ['--remote-debugging-port=' + port] })).browser;
    const context = await browser.newContext(); const writes = [], errors = [], external = [];
    await context.route('**/*', route => { const r = route.request(), u = new URL(r.url());
      if (u.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (u.pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
      if (!r.url().startsWith(base + '/')) { external.push(u.hostname); return route.abort(); }
      if (r.method() !== 'GET') { writes.push(u.pathname); return route.abort(); }
      return route.continue(); });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    if (screenshots) fs.mkdirSync(dir, { recursive: true });
    for (const width of [1366, 400, 412]) {
      await page.setViewportSize({ width, height: width === 1366 ? 768 : 915 });
      await page.goto(base + '/dashboard/?workspace=email&embedded=1'); await page.locator('[data-email-message]').first().waitFor();
      await page.locator('[data-email-message]').first().click(); await page.locator('[data-email-body]').first().waitFor();
      if (screenshots) await page.screenshot({ path: path.join(dir, 'before-reader-' + width + '.png') });
      await page.goto(base + '/app?preview=1&view=email'); await page.locator('.ws-mail-row').first().waitFor();
      const paint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || null);
      assert(paint !== null && paint < 2000);
      if (screenshots) await page.screenshot({ path: path.join(dir, 'after-list-' + width + '.png') });
      await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-message .ws-mail-body').waitFor();
      if (screenshots) await page.screenshot({ path: path.join(dir, 'after-reader-' + width + '.png') });
      await page.getByRole('button', { name: 'Reply', exact: true }).click();
      if (screenshots) await page.screenshot({ path: path.join(dir, 'after-composer-' + width + '.png') });
      const layout = await page.getByRole('button', { name: 'Send', exact: true }).evaluate(el => { const r = el.getBoundingClientRect(); return { sendFits: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, overflow: document.documentElement.scrollWidth > innerWidth }; });
      assert.deepEqual(layout, { sendFits: true, overflow: false });
      report.widths.push({ width, first_contentful_paint_ms: paint, ...layout });
    }
    if (lighthousePath) {
      const lighthouse = (await import(pathToFileURL(path.resolve(lighthousePath)).href)).default;
      for (const width of [1366, 412]) {
        const result = await lighthouse(base + '/app?preview=1&view=email', { port, logLevel: 'error', onlyCategories: ['accessibility'], formFactor: width === 1366 ? 'desktop' : 'mobile', throttlingMethod: 'provided', screenEmulation: { mobile: width !== 1366, width, height: width === 1366 ? 768 : 915, deviceScaleFactor: 1, disabled: false } });
        const score = Math.round(result.lhr.categories.accessibility.score * 100);
        report.accessibility.push({ width, score, lighthouse_version: result.lhr.lighthouseVersion });
        assert(score >= 90);
      }
    }
    fixture.assertUnchanged(); assert.deepEqual(errors, []); assert.deepEqual(writes, []); assert.deepEqual(external, []);
    if (screenshots) fs.writeFileSync(path.join(dir, 'synthetic-proof.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
module.exports = { prove };
if (require.main === module) prove({ screenshots: process.argv.includes('--screenshots'), lighthousePath: process.env.WOS_LIGHTHOUSE_PATH }).catch(e => { console.error(e.stack); process.exitCode = 1; });
