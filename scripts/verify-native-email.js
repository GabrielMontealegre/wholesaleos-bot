'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), express = require('express');
const { pathToFileURL } = require('node:url');
const { createFixtureApp } = require('./verify-marketplace-ui');
const { registerWorkspacePreview } = require('../modules/ui/workspace-preview');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
async function prove({ screenshots = false, lighthousePath, reply = false, layout: readingLayout = false } = {}) {
  const fixture = createFixtureApp(), app = express();
  let baseline = false;
  if (reply || readingLayout) {
    const { execFileSync } = require('node:child_process');
    const files = new Map(['index.html', 'components.js', 'email-screen.js', 'design-system.css', 'app.js'].map(file => [file, execFileSync('git', ['show', '32c0c2acb31770c9dfb72d454ff306eb8ba69a4d:dashboard/workspace/' + file], { cwd: path.resolve(__dirname, '..') })]));
    app.use((req, res, next) => {
      const file = req.path === '/app' ? 'index.html' : req.path.startsWith('/dashboard/workspace/') ? req.path.slice('/dashboard/workspace/'.length) : '';
      if (baseline && files.has(file)) return res.type(file.endsWith('.html') ? 'html' : file.endsWith('.css') ? 'css' : 'js').send(files.get(file));
      next();
    });
  }
  if (readingLayout && !reply) app.get('/api/dashboard/email/thread-replies/status', (req, res) => res.json({ enabled: false, configured: true }));
  if (reply) {
    app.use(express.json());
    app.get('/api/dashboard/email/thread-replies/status', (req, res) => res.json({ enabled: true, configured: true }));
    app.get('/api/dashboard/email/thread-replies/context', (req, res) => res.json({ message_ids: ['earlier', 'latest'], thread_key: 'a'.repeat(64), to: ['person@example.test'], cc: [], participants: ['person@example.test'], subject: 'Re: Property details and next steps' }));
    app.post('/api/dashboard/email/thread-replies/preview', (req, res) => res.json({ ...req.body, message_ids: req.body.message_ids.slice().sort(), id: '00000000-0000-4000-8000-000000000001', version: 'c'.repeat(64), created_at: new Date().toISOString(), status: 'preview', reviewed: false, enabled: true, configured: true }));
  }
  const at = '2026-10-20T12:00:00Z', thread = 'a'.repeat(64);
  const row = (id, patch = {}) => ({ id, date: at, source_kind: 'connected_mailbox', thread_key: thread, from: 'Synthetic Person <person@example.test>', sender_name: 'Synthetic Person', subject: 'Property details and next steps', direction: 'in', link_status: 'linked', conversation: { role: 'buyer', role_source_kind: 'operator_input', role_recorded_at: at }, ...patch });
  const messages = [row('earlier'), row('latest', { date: '2026-10-20T12:01:00Z' }), row('alert', { from: 'alerts@redfin.com', sender_name: 'Synthetic listing alert', thread_key: 'b'.repeat(64), subject: 'New listing alert', conversation: null, link_status: 'unlinked' })];
  const full = id => ({ ...messages.find(m => m.id === id), body: id === 'earlier' ? 'Earlier source text. Please send the recorded property information.' : 'Thanks for the update.\n\nI am reviewing the property details.\n\n' + 'Source text continues in the full-height reading pane. '.repeat(60) + '\n\nFINAL SOURCE LINE - not clipped.' });
  app.get('/api/gmail/messages', (req, res) => res.json({ ok: true, messages: req.query.folder === 'sent' ? [] : messages }));
  app.get('/api/gmail/thread', (req, res) => res.json({ ok: true, messages: JSON.parse(req.query.ids).map(full) }));
  app.get('/api/gmail/message/:id', (req, res) => res.json(full(req.params.id)));
  registerWorkspacePreview(app); app.use(fixture.app);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port, dir = process.env.WOS_EMAIL_PROOF_DIR ? path.resolve(process.env.WOS_EMAIL_PROOF_DIR) : path.resolve(__dirname, reply ? '../docs/screens/2026-10-21-reply-composer' : '../docs/screens/2026-10-20-native-email');
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
      if (r.method() !== 'GET') { writes.push(u.pathname); if (reply && u.pathname === '/api/dashboard/email/thread-replies/preview') return route.continue(); return route.abort(); }
      return route.continue(); });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    if (screenshots) fs.mkdirSync(dir, { recursive: true });
    for (const width of [1366, 400, 412]) {
      await page.setViewportSize({ width, height: width === 1366 ? 768 : 915 });
      baseline = reply || readingLayout;
      await page.goto(base + (baseline ? '/app?preview=1&view=email' : '/dashboard/?workspace=email'));
      await page.locator(baseline ? '.ws-mail-row' : '[data-email-message]').first().waitFor();
      await page.locator(baseline ? '.ws-mail-row' : '[data-email-message]').first().click(); await page.locator(baseline ? '.ws-mail-message .ws-mail-body' : '[data-email-body]').first().waitFor();
      if (reply) await page.getByRole('button', { name: 'Reply', exact: true }).click();
      if (screenshots) await page.screenshot({ path: path.join(dir, 'before-reader-' + width + '.png') });
      baseline = false;
      await page.goto(base + '/app?preview=1&view=email'); await page.locator('#today-content[aria-busy="false"]').waitFor();
      await page.getByRole('tab', { name: 'Buyers', exact: true }).click(); await page.locator('.ws-mail-row').first().waitFor();
      if (readingLayout) assert.equal(await page.locator('.ws-composer').count(), 0);
      const paint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || null);
      assert(paint !== null && paint < 2000);
      if (screenshots) await page.screenshot({ path: path.join(dir, 'after-list-' + width + '.png') });
      await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-message .ws-mail-body').waitFor();
      if (readingLayout) {
        assert.equal(await page.locator('.ws-mail-list').isVisible(), false);
        assert.equal(await page.locator('.ws-composer').count(), 0);
        assert(await page.locator('.ws-mail-reading').evaluate(el => el.getBoundingClientRect().width >= el.parentElement.getBoundingClientRect().width - 1));
      }
      const reader = await page.locator('.ws-mail-thread').evaluate(el => ({ reading_height: el.clientHeight, reading_top: el.getBoundingClientRect().top, body_top: el.querySelector('.ws-mail-message .ws-mail-body').getBoundingClientRect().top }));
      if (screenshots) await page.screenshot({ path: path.join(dir, 'after-reader-' + width + '.png') });
      await page.getByRole('button', { name: 'Reply', exact: true }).click();
      if (reply) {
        await page.locator('#mail-preview:enabled').waitFor();
        await page.getByLabel('Message', { exact: true }).fill('Thank you. I will review the recorded property details and follow up.');
        await page.getByRole('button', { name: 'Preview reply', exact: true }).click();
        await page.getByRole('checkbox', { name: 'I reviewed this message' }).check();
      }
      if (screenshots) await page.screenshot({ path: path.join(dir, 'after-composer-' + width + '.png') });
      const layout = await page.getByRole('button', { name: 'Send', exact: true }).evaluate(el => { const r = el.getBoundingClientRect(); return { sendFits: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, overflow: document.documentElement.scrollWidth > innerWidth }; });
      assert.deepEqual(layout, { sendFits: true, overflow: false });
      if (reply) {
        const status = await page.locator('[data-reply-status]').evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, viewport: innerHeight }; });
        assert(status.top >= 0 && status.bottom <= status.viewport, 'Reply outcome text must fit at ' + width + ': ' + JSON.stringify(status));
      }
      report.widths.push({ width, first_contentful_paint_ms: paint, ...reader, ...layout });
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
    fixture.assertUnchanged(); assert.deepEqual(errors, []); assert.deepEqual(writes, reply ? Array(3).fill('/api/dashboard/email/thread-replies/preview') : []); assert.deepEqual(external, []);
    if (screenshots) fs.writeFileSync(path.join(dir, 'synthetic-proof.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
module.exports = { prove };
if (require.main === module) prove({ screenshots: process.argv.includes('--screenshots'), reply: process.argv.includes('--reply'), layout: process.argv.includes('--layout'), lighthousePath: process.env.WOS_LIGHTHOUSE_PATH }).catch(e => { console.error(e.stack); process.exitCode = 1; });
