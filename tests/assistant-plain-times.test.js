'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { fixture: v1 } = require('./helpers/assistant-snapshot-fixture');
const { fixture: v2 } = require('./helpers/assistant-snapshot-v2-fixture');
const { appendSnapshot, latestSnapshot } = require('../modules/records/assistant-snapshot');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const now = '2026-11-03T19:18:00.000Z';
let phase = 'contract';
function contract() {
  class PureDate extends Date { constructor(...args) { assert(args.length, 'No implicit clock'); super(...args); } static now() { throw Error('No clock'); } }
  const scope = { module: { exports: {} }, Date: PureDate, Intl, fetch() { throw Error('No network'); }, require() { throw Error('No filesystem'); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dashboard/wos-card-clock.js'), 'utf8'), scope);
  const clock = scope.module.exports;
  assert.equal(clock.formatScheduledTime('2026-11-04T15:00:00Z', now), 'Nov 4, 8:00 AM');
  assert.equal(clock.formatScheduledTime('2027-01-04T15:00:00Z', now), 'Jan 4, 2027, 8:00 AM');
  assert.equal(clock.formatScheduledTime('2026-11-04T06:30:00Z', now), 'Nov 3, 11:30 PM');
  assert.equal(clock.formatScheduledTime('2026-10-30T19:18:00Z', now), 'Fri 12:18 PM');
  assert.equal(clock.formatScheduledTime('2025-10-30T19:18:00Z', now), 'Oct 30, 2025');
  assert.equal(clock.formatTime('2026-11-04T15:00:00Z', now), 'Unknown', 'Scheduling never relaxes recorded-activity future rejection');
  for (const bad of [null, undefined, 0, {}, [], new String(now), '11/04/2026', '2026-11-04', '2026-02-30T15:00:00Z', '2026-11-04T15:00:00+00:00', '2026-11-04T15:00:00', '<img src=x>']) {
    assert.equal(clock.formatScheduledTime(bad, now), 'Unknown');
    assert.equal(clock.formatScheduledTime(now, bad), 'Unknown');
  }
}
function snapshot(version) {
  const data = version === 1 ? v1() : v2();
  data.generated_at = '2026-11-03T12:00:00Z';
  data.buyers[0].last_reply_at = '2026-10-30T19:18:00Z';
  data.buyers[0].last_contact = '2025-10-25';
  data.texts[0].drafted_at = '2025-10-25';
  data.deals[0].log = [{ at: '2025-10-25T19:18:00Z', text: 'Synthetic older event.' }];
  if (version === 2) {
    data.open_items[0].due = '2027-01-04';
    data.open_items[0].happened = [{ at: '2025-10-25T19:18:00Z', text: 'Synthetic older decision event.' }];
    data.open_items[0].walk_plan = { rung: 'agent_video', status: 'scheduled', scheduled_at: '2027-01-04T15:00:00Z' };
    data.agents[0].last_touch = '2026-10-30T19:18:00Z';
    data.outreach[0].follow_up_on = '2027-01-04';
  }
  return data;
}
async function ui() {
  let version = 1;
  const stores = [1, 2].map(value => appendSnapshot({}, Buffer.from(JSON.stringify(snapshot(value))), { now, operatorId: 'synthetic-owner', filename: 'synthetic.json' }));
  const before = JSON.stringify(stores);
  const keys = { ok: true, keys: [
    { id: 'a'.repeat(32), created_at: '2026-10-30T19:18:00.000Z', revoked_at: null },
    { id: 'b'.repeat(32), created_at: '2026-10-20T19:18:00.000Z', revoked_at: null },
    { id: 'c'.repeat(32), created_at: '2025-10-20T19:18:00.000Z', revoked_at: null }
  ] };
  const base = 'https://fixture.test';
  let browser;
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    for (const width of [1366, 400, 412]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1366 ? 768 : 915 }, timezoneId: 'Asia/Tokyo' });
      const page = await context.newPage(), errors = [], external = [], nonGET = [];
      await page.addInitScript(value => { const Original = Date; window.Date = class extends Original { constructor(...args) { super(...(args.length ? args : [value])); } static now() { return value; } }; }, Date.parse(now));
      page.on('pageerror', error => errors.push(error.name));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (req.method() !== 'GET') { nonGET.push(url.pathname); return route.abort(); }
        if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
        if (url.pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
        if (url.origin !== base) { external.push(url.hostname); return route.abort(); }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, role: 'admin' } });
        if (url.pathname === '/api/dashboard/today-workspace') return route.fulfill({ json: { source_kind: 'derived_workflow', now, today: '2026-11-03', counts: {}, actions: [], best_deals: [], last_24h: [], capabilities: { assistant_snapshot_import: true } } });
        if (url.pathname === '/api/dashboard/assistant-snapshots') return route.fulfill({ json: { ok: true,
          latest: latestSnapshot(stores[version - 1], { now, operatorId: 'synthetic-owner' }), viewer_scope: 'd'.repeat(64),
          capabilities: { can_import: true, schema: 'wos-assistant-snapshot', version: 1, supported_versions: [1, 2], max_bytes: 1048576 } } });
        if (url.pathname === '/api/dashboard/assistant-snapshot-answers') return route.fulfill({ json: { ok: true, now, items: [], next_after: null } });
        if (url.pathname === '/api/dashboard/assistant-upload-keys') return route.fulfill({ json: keys });
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] });
        if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
        const relative = url.pathname === '/app' ? 'workspace/index.html' : url.pathname === '/dashboard/' ? 'index.html' : url.pathname.startsWith('/dashboard/') ? url.pathname.slice(11) : null;
        assert(relative && !relative.includes('..'));
        return route.fulfill({ contentType: relative.endsWith('.html') ? 'text/html' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../dashboard', relative)) });
      });
      async function proof(name) {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (process.env.WOS_ASSISTANT_TIMES_PROOF_DIR) {
          fs.mkdirSync(process.env.WOS_ASSISTANT_TIMES_PROOF_DIR, { recursive: true });
          await page.mouse.move(0, 0);
          await page.screenshot({ path: path.join(process.env.WOS_ASSISTANT_TIMES_PROOF_DIR, name + '-' + width + '.png'),
            ...(name === 'settings' ? { mask: [page.locator('#content > :not(#assistant-upload-settings)'), page.locator('.sidebar,.topbar')], maskColor: '#151719' } : {}) });
        }
      }
      try {
        phase = width + ':sheet'; version = 1;
        await page.goto(base + '/app?preview=1');
        await page.getByText('Updated Tue 5:00 AM by the assistant', { exact: true }).waitFor();
        assert((await page.locator('#assistant-slot').innerText()).includes('Drafted Oct 25, 2025'));
        await page.getByRole('button', { name: 'All reported buyers', exact: true }).click();
        const buyers = await page.locator('#assistant-buyers').innerText();
        assert(buyers.includes('Reply reported: Fri 12:18 PM')); assert(buyers.includes('Last contact: Oct 25, 2025'));
        await page.keyboard.press('Escape');
        await proof('sheet');
        await page.locator('.ws-assistant-deal').first().click();
        assert((await page.locator('#assistant-detail').innerText()).includes('Oct 25, 2025'));
        await page.keyboard.press('Escape');
        phase = width + ':desk'; version = 2; await page.reload();
        await page.getByRole('heading', { name: 'Decision Desk', exact: true }).waitFor();
        const card = await page.locator('[data-decision-card]').first().innerText();
        assert(card.includes('Due Jan 4, 2027')); assert(card.includes('Oct 25, 2025'));
        assert(card.includes('Walk: agent video call, scheduled · Jan 4, 2027, 8:00 AM'), 'Future reported walk retains date, year and UTC-7 time');
        await proof('desk');
        await page.getByRole('tab', { name: 'Agents', exact: true }).click();
        assert((await page.locator('#decision-panel-agents').innerText()).includes('Last touch: Fri 12:18 PM'));
        await page.getByRole('tab', { name: 'Outreach', exact: true }).click();
        assert((await page.locator('#decision-panel-outreach').innerText()).includes('Follow-up: Jan 4, 2027'));
        phase = width + ':settings';
        await page.goto(base + '/dashboard/?workspace=settings');
        await page.waitForFunction(() => document.querySelectorAll('#assistant-upload-settings li').length === 3);
        assert.deepEqual(await page.locator('#assistant-upload-settings li strong').allTextContents(), ['Fri 12:18 PM', 'Oct 20', 'Oct 20, 2025']);
        assert.equal(await page.locator('#assistant-key-reveal[open]').count(), 0);
        await proof('settings');
        assert.deepEqual(nonGET, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    assert.equal(JSON.stringify(stores), before);
  } finally { if (browser) await browser.close(); }
}
contract();
ui().then(() => console.log('assistant-plain-times: strict pure schedule/activity separation, actual sheet/Desk/Settings3width UTC7/date-year/GET-only/no mutation passed'))
  .catch(error => { console.error(JSON.stringify({ test: 'assistant-plain-times', phase, error: error.name, message: error.message, location: String(error.stack).match(/assistant-plain-times\.test\.js:\d+:\d+/)?.[0] || null })); process.exitCode = 1; });
