'use strict';
const assert = require('node:assert/strict'), express = require('express'), fs = require('node:fs'), path = require('node:path');
const { createFixtureApp } = require('../scripts/verify-marketplace-ui');
const { registerAssistantUploadKeyRoutes, noStore, requireKeyPayload } = require('../modules/records/assistant-upload-key-routes');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
let phase = 'startup';
async function run() {
  const app = express(), route = '/api/dashboard/assistant-upload-keys', now = '2026-10-27T12:00:00Z';
  let store = {}, denyRead = false, writes = 0;
  function admin(req, res, next) { if (denyRead && req.method === 'GET') return res.status(401).json({ ok: false }); req.currentUser = { id: 'synthetic-owner', role: 'admin' }; next(); }
  app.use(route, noStore, admin, requireKeyPayload);
  registerAssistantUploadKeyRoutes(app, { requireAdmin: admin, now: () => now, randomBytes: () => Buffer.alloc(32, 7), db: { readDBStrict: () => store, writeDB: value => { store = value; writes++; } } });
  app.use(createFixtureApp().app);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }), base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    for (const width of [1366, 400, 412]) {
      store = {}; denyRead = false; writes = 0;
      const context = await browser.newContext({ viewport: { width, height: width === 1366 ? 768 : 915 } });
      const errors = [], external = [], unrelatedWrites = []; let downloads = 0;
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('download', () => downloads++);
      page.setDefaultTimeout(10000); phase = width + ':load';
      await page.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
        if (url.pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
        if (url.origin !== base) { external.push(url.hostname); return route.abort(); }
        if (req.method() !== 'GET' && !url.pathname.startsWith('/api/dashboard/assistant-upload-keys')) { unrelatedWrites.push(url.pathname); return route.abort(); }
        return route.continue();
      });
      await page.goto(base + '/dashboard/?workspace=settings');
      await page.locator('[data-key-create]').waitFor();
      await page.waitForFunction(() => !document.querySelector('[data-key-create]').disabled);
      phase = width + ':images';
      await page.waitForFunction(() => [...document.querySelectorAll('#assistant-upload-settings img')].every(img => img.complete && img.naturalWidth > 0));
      assert.equal(await page.locator('[data-key-create]').innerText(), 'Create assistant upload key');
      assert(await page.locator('#assistant-upload-settings img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const proof = process.env.WOS_ASSISTANT_KEY_PROOF_DIR;
      if (proof) { fs.mkdirSync(proof, { recursive: true }); await page.screenshot({ path: path.join(proof, 'settings-' + width + '.png'), mask: [page.locator('#content > :not(#assistant-upload-settings)'), page.locator('.sidebar,.topbar')], maskColor: '#151719' }); }
      await page.locator('[data-key-create]').click();
      phase = width + ':reveal';
      await page.locator('#assistant-key-reveal[open]').waitFor();
      assert.equal(await page.locator('#assistant-key-reveal [data-panel-dismiss]').count(), 1, 'One owned close control,not a duplicate shared-helper button');
      assert(await page.locator('[data-assistant-key-value]').evaluate(e => /^wosai_[a-f0-9]{32}_[a-f0-9]{64}$/.test(e.value)));
      assert(await page.locator('#assistant-key-reveal button, #assistant-key-reveal textarea').evaluateAll(nodes => nodes.every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })));
      assert(await page.evaluate(() => !JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).includes('wosai_')));
      if (proof) await page.screenshot({ path: path.join(proof, 'key-dialog-' + width + '.png'), mask: [page.locator('#content > :not(#assistant-upload-settings)'), page.locator('.sidebar,.topbar'), page.locator('[data-assistant-key-value]')], maskColor: '#151719' });
      if (proof) await page.locator('#assistant-key-reveal').screenshot({ path: path.join(proof, 'key-dialog-detail-' + width + '.png'), mask: [page.locator('[data-assistant-key-value]')], maskColor: '#151719' });
      const download = page.waitForEvent('download'); await page.locator('[data-key-save]').click(); assert.equal((await download).suggestedFilename(), 'assistant-upload-key.json');
      phase = width + ':revoke';
      assert.equal(await page.locator('[data-assistant-key-value]').inputValue(), ''); assert.equal(await page.locator('#assistant-key-reveal[open]').count(), 0);
      assert(await page.locator('[data-key-create]').evaluate(node => document.activeElement === node));
      await page.locator('[data-key-revoke]').first().click(); await page.getByText('Key revoked.', { exact: true }).waitFor();
      assert.equal(store.assistant_upload_keys[0].revoked_at, now.replace('Z', '.000Z'));
      await page.locator('[data-key-create]').click(); await page.locator('#assistant-key-reveal[open]').waitFor(); await page.locator('[data-key-close]').press('Escape');
      phase = width + ':session';
      await page.waitForFunction(() => !document.querySelector('#assistant-key-reveal').open && document.querySelector('[data-assistant-key-value]').value === '' && document.activeElement === document.querySelector('[data-key-create]'));
      assert.equal(await page.locator('[data-assistant-key-value]').inputValue(), '');
      assert(await page.locator('[data-key-create]').evaluate(node => document.activeElement === node));
      denyRead = true; await page.locator('[data-key-refresh]').click();
      await page.waitForFunction(() => APP.unlocked === false && !document.querySelector('[data-key-create]') && !document.querySelector('[data-assistant-key-value]'));
      assert.equal(await page.locator('#assistant-upload-settings li').count(), 0); assert(await page.locator('#pin-screen').isVisible());
      denyRead = false; await page.reload(); await page.waitForFunction(() => document.querySelector('[data-key-create]') && !document.querySelector('[data-key-create]').disabled);
      let release, began; const held = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { began = resolve; });
      phase = width + ':late';
      await page.route('**/api/dashboard/assistant-upload-keys', async route => { if (route.request().method() !== 'POST') return route.continue(); const response = await route.fetch(); began(); await held; try { await route.fulfill({ response }); } catch (_) {} });
      await page.locator('[data-key-create]').click(); await started; await page.evaluate(() => navigate('dashboard', null)); release();
      await page.waitForFunction(() => !document.querySelector('#assistant-upload-settings'));
      assert.equal(await page.locator('#assistant-key-reveal').count(), 0); assert.equal(downloads, 1);
      await page.evaluate(() => { APP.currentUser.role = 'user'; navigate('settings', null); });
      phase = width + ':final';
      assert.equal(await page.locator('#assistant-upload-settings').count(), 0);
      assert.deepEqual(unrelatedWrites, []); assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.equal(writes, 4);
      await context.close();
    }
    console.log('assistant-upload-settings: actual classic Settings/controller3size,once-only synthetic save/revoke/Escape/session/late response/nonadmin/images/zero unrelated writes passed');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error('assistant-upload-settings failed '+phase+' '+(String(error.stack).match(/assistant-upload-settings-ui\.test\.js:\d+:\d+/)?.[0]||error.name)+';private fixture details withheld'); process.exitCode = 1; });
