'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createFixture } = require('./helpers/remembered-device-server.cjs');
const { discoverInstalledChromiumExecutables } = require('../modules/research/playwright-browser-resolver');
const playwright = require('playwright');
let phase = 'startup';
const diagnostic = { routed: 0, completed: 0, mainStatus: null, redirectRelative: null, networkCode: null };
async function run() {
  const fixture = await createFixture(), origin = 'https://device.example.test';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-device-browser-'));
  let context, errors = [], external = [], unrelatedWrites = [], denied = false, held = null;
  const proof = process.env.WOS_REMEMBER_DEVICE_PROOF_DIR;
  async function screenshot(page, name) {
    if (!proof) return;
    fs.mkdirSync(proof, { recursive: true });
    await page.screenshot({ path: path.join(proof, name + '.png'), mask: [page.locator('input:not([type=checkbox]),textarea'), page.locator('.sidebar-footer,.sidebar-stats,#user-role-label,.form-group')] });
  }
  const executable = fs.existsSync(playwright.chromium.executablePath()) ? playwright.chromium.executablePath() : discoverInstalledChromiumExecutables()[0];
  async function launch(viewport) {
    context = await playwright.chromium.launchPersistentContext(profile, { executablePath: executable, headless: true, viewport, serviceWorkers: 'block' });
    let contextClosed = false; context.on('close', () => { contextClosed = true; });
    await context.route('**/*', async route => {
      diagnostic.routed++;
      const req = route.request(), url = new URL(req.url());
      if (req.method() === 'GET' && url.hostname === '127.0.0.1' && ['8801', '8797'].includes(url.port) && url.pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
      if (url.origin !== origin) { if (!['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) { external.push(url.hostname); diagnostic.externalHosts = [...new Set(external)]; } return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); }
      if (!['GET', 'HEAD'].includes(req.method()) && !/^\/api\/(auth\/(login|logout|devices\/[a-f0-9]{32}\/revoke)|dashboard\/assistant-upload-keys(?:\/[a-f0-9]{32}\/revoke)?)$/.test(url.pathname)) { unrelatedWrites.push(url.pathname); return route.fulfill({ status: 405, body: '{}' }); }
      if (denied && url.pathname === '/api/auth/devices') return route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
      if (held && url.pathname === '/api/auth/devices') { await held; }
      const headers = { ...req.headers(), host: new URL(origin).host, 'x-forwarded-proto': 'https' };
      delete headers['content-length'];
      try {
        const response = await route.fetch({ url: fixture.base + url.pathname + url.search, headers, maxRedirects: 0 });
        diagnostic.completed++;
        if (req.isNavigationRequest()) { diagnostic.mainStatus = response.status(); diagnostic.redirectRelative = String(response.headers().location || '').startsWith('/'); }
        await route.fulfill({ response });
      } catch {
        if (!contextClosed && !req.failure()?.errorText.includes('ERR_ABORTED')) errors.push('local_route_transport');
        await route.abort().catch(() => {});
      }
    });
    context.on('page', page => page.on('pageerror', error => errors.push(error.name)));
    const page = context.pages()[0]; page.on('pageerror', error => errors.push(error.name)); page.setDefaultTimeout(15000); return page;
  }
  async function layout(page, selector) {
    const controls = await page.locator(selector).all(); assert(controls.length > 0);
    for (const control of controls) { const bounds = await control.boundingBox(); assert(bounds && bounds.width > 20 && bounds.height >= 44); assert(bounds.x >= 0 && bounds.y >= 0); assert(bounds.x + bounds.width <= page.viewportSize().width + 1); assert(bounds.y + bounds.height <= page.viewportSize().height + 1); }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  async function settings(page) { await page.evaluate(() => navigate('settings', null)); await page.waitForFunction(() => document.querySelector('#remembered-device-settings') && !document.querySelector('#remembered-device-settings').textContent.includes('Loading remembered')); }
  try {
    await fixture.start();
    let page = await launch({ width: 1366, height: 768 });
    for (const size of [{ width: 1366, height: 768 }, { width: 400, height: 915 }, { width: 412, height: 915 }, { width: 1038, height: 503 }]) {
      phase = 'login-layout-' + size.width; await page.setViewportSize(size);
      for (const entry of ['/dashboard/', '/app?preview=1&view=today']) {
        phase = 'login-layout-' + size.width + (entry === '/dashboard/' ? '-classic' : '-native') + '-navigation';
        const response = await page.goto(origin + entry); assert.equal(response.status(), 200);
        phase = phase.replace('-navigation', '-checkbox'); await page.locator('#remember-device').waitFor(); assert.equal(await page.locator('#remember-device').isChecked(), false); await layout(page, '.wos-remember-choice');
        await screenshot(page, (entry === '/dashboard/' ? 'classic-login-' : 'native-login-') + size.width);
      }
    }
    phase = 'remember-login'; await page.goto(origin + '/dashboard/'); await page.locator('#remember-device').check();
    await page.locator('#pin').fill(fixture.pin); await page.locator('#unlock').click();
    await page.waitForFunction(() => window.APP?.unlocked === true);
    const cookies = await context.cookies(); const remembered = cookies.find(c => c.name === 'wos_session'); assert(remembered && remembered.httpOnly && remembered.secure && remembered.sameSite === 'Strict'); assert(remembered.expires * 1000 > Date.now() + 29 * 86400000);
    assert.equal(fixture.read().remembered_devices.length, 1);
    await context.close(); context = null;
    phase = 'browser-restart'; page = await launch({ width: 400, height: 915 }); await page.goto(origin + '/dashboard/'); await page.waitForFunction(() => window.APP?.unlocked === true);
    assert.equal(fixture.read().remembered_devices.length, 1);
    const second = await fixture.request('POST', '/api/auth/login', { pin: fixture.pin, remember_device: true }, { Origin: fixture.base, 'X-WOS-Device-Action': '1', 'X-WOS-Remember-Request': '99999999-9999-4999-8999-999999999999' }); assert.equal(second.status, 200);
    for (const size of [{ width: 1366, height: 768 }, { width: 400, height: 915 }, { width: 412, height: 915 }]) {
      phase = 'settings-layout-' + size.width; await page.setViewportSize(size); await settings(page); await page.waitForFunction(() => document.querySelectorAll('#remembered-device-settings li').length === 2); await layout(page, '[data-device-refresh]'); await layout(page, '[data-device-forget]'); assert.equal(await page.locator('#remembered-device-settings').getByText('This device', { exact: true }).count(), 1);
      await page.waitForFunction(() => [...document.querySelectorAll('#remembered-device-settings img')].every(img => img.complete && img.naturalWidth > 0));
      await screenshot(page, 'settings-' + size.width);
    }
    phase = 'key-dialog-preserved'; await page.waitForFunction(() => document.querySelector('[data-key-create]') && !document.querySelector('[data-key-create]').disabled); await page.locator('[data-key-create]').click(); await page.locator('#assistant-key-reveal[open]').waitFor();
    // Programmatic activation exercises background component ownership while a modal owns focus.
    await page.evaluate(() => { const rows = [...document.querySelectorAll('#remembered-device-settings li')]; rows.find(r => !r.textContent.includes('This device')).querySelector('button').click(); });
    await page.waitForFunction(() => document.querySelector('#remembered-device-settings').textContent.includes('Forgotten'));
    assert(await page.locator('#assistant-key-reveal').evaluate(node => node.open)); assert(await page.locator('[data-assistant-key-value]').evaluate(node => node.value.length > 0)); await page.keyboard.press('Escape');
    phase = 'denied-and-late'; denied = true; await page.locator('[data-device-refresh]').click(); await page.locator('#pin-screen').waitFor({ state: 'visible' }); assert.equal(await page.locator('#remembered-device-settings li').count(), 0); assert.equal(await page.locator('[data-assistant-key-value]').count(), 0); assert.equal(await page.locator('#assistant-key-reveal[open]').count(), 0); denied = false;
    // Existing remembered cookie restores only after an explicit new page, never from stale DOM.
    await page.reload(); await page.waitForFunction(() => window.APP?.unlocked === true); await settings(page);
    let release; held = new Promise(resolve => { release = resolve; }); await page.locator('[data-device-refresh]').click(); await page.evaluate(() => navigate('dashboard', null)); held = null; release(); await page.waitForTimeout(150); assert.equal(await page.locator('#remembered-device-settings').count(), 0);
    phase = 'current-forget'; await settings(page); await page.locator('#remembered-device-settings li').filter({ hasText: 'This device' }).locator('button').click(); await page.locator('#pin-screen').waitFor({ state: 'visible' }); assert.equal(await page.locator('#remembered-device-settings li').count(), 0);
    await page.reload(); await page.locator('#remember-device').waitFor(); assert.equal(await page.evaluate(() => APP.unlocked), false);
    phase = 'native-login-and-signout'; await page.goto(origin + '/app?preview=1&view=today'); await page.locator('#remember-device').check(); await page.locator('#pin').fill(fixture.pin); await page.locator('#unlock').click(); await page.locator('#account-open').waitFor(); assert.equal(fixture.read().remembered_devices.length, 3); await page.locator('#account-open').click(); await page.locator('#signout').click(); await page.locator('#remember-device').waitFor(); assert(fixture.read().remembered_devices.every(row => row.revoked_at !== null));
    phase = 'external-requests'; assert.deepEqual(external, []); phase = 'unrelated-writes'; assert.deepEqual(unrelatedWrites, []); phase = 'runtime-errors'; diagnostic.errorNames = [...new Set(errors)]; assert.deepEqual(errors, []);
    assert(!fixture.logsContain([fixture.secret, remembered.value]));
    console.log('remembered-device-ui: actual signed-server PIN3size+shortdesktop/browser-profile restart/own Settings/other+current forget/key-dialog ownership/401+late privacy/zero external or unrelated writes passed');
  } finally {
    if (context) await context.close(); await fixture.close(); const resolved = path.resolve(profile); if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('wos-device-browser-')) throw Error('profile_cleanup_boundary'); fs.rmSync(resolved, { recursive: true, force: true });
  }
}
run().catch(error => { diagnostic.networkCode = String(error.message).match(/net::[A-Z_]+/)?.[0] || error.name; console.error('remembered-device-ui failed ' + phase + ' ' + (String(error.stack).match(/remembered-device-ui\.test\.js:\d+:\d+/)?.[0] || error.name) + ';synthetic credentials withheld'); console.error('device-harness-diagnostic ' + JSON.stringify(diagnostic)); process.exitCode = 1; });
