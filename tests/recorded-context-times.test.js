'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const records = require('../modules/records/record-activity');
const { view } = require('./ask-workspace.test');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const now = '2026-11-03T19:18:00.000Z', base = 'https://fixture.test';
const cases = [
  ['2026-10-30T19:18:00Z', 'Fri 12:18 PM'], ['2026-10-20T19:18:00Z', 'Oct 20'],
  ['2025-10-20T19:18:00Z', 'Oct 20, 2025'], ['2025-10-25', 'Oct 25, 2025'],
  ['10/20/2026', 'Time not confirmed'], ['2026-02-30T12:00:00Z', 'Time not confirmed'],
  ['2026-11-03T19:20:00Z', 'Time not confirmed'], ['2026-10-30T19:18:00+00:00', 'Time not confirmed'],
  ['', 'Time not confirmed'], ['2026-11-03T06:59:59.999Z', 'Mon 11:59 PM'],
  ['2026-11-03T07:00:00.000Z', 'Tue 12:00 AM'], ['2026-11-04T06:59:59.999Z', 'Time not confirmed'],
  ['2026-11-04T07:00:00.000Z', 'Time not confirmed']
];
const snapshot = structuredClone(view), person = snapshot.people[0];
snapshot.now = now; snapshot.today = '2026-11-03'; snapshot.yesterday = '2026-11-02';
snapshot.events = [cases[0], cases[1], cases[2], cases[5], cases[6]].map(([at], i) => ({ id: 'synthetic-event-' + i, title: 'Synthetic event ' + i,
  at, target: { kind: person.kind, id: person.id, ref: person.ref }, summary: 'Source prose 10/20/2026 <img src=x> remains literal.' }));
snapshot.conversations = [{ id: 'synthetic-conversation', person: 'Synthetic contact', refs: [person.ref], due_date: '2027-01-04',
  what_they_said: 'Reported source text <img src=x>.', next_step: 'Review the report.', source_kind: 'imported_report' }];
const activity = { total: cases.length, types: records.TYPES, items: cases.map(([ts], i) => ({ activity_id: 'synthetic-activity-' + i,
  type: 'interaction_reported', ts, who: 'Synthetic operator', channel: 'manual', attribution: 'imported_report', buyer_ref: person.ref,
  summary: 'Synthetic activity ' + i + ' / source prose 10/20/2026 <img src=x>.' })) };
const frozen = JSON.stringify({ snapshot, activity });
const input = { kind: 'interaction', ts: cases[6][0], who: 'Synthetic operator', channel: 'manual', dir: 'note', with: 'Synthetic party', ref: person.ref, summary: 'Reported note.' };
assert.equal(records.validateInteraction(input, now).ts, '2026-11-03T19:20:00.000Z', 'Existing five-minute import tolerance stays intact');
assert.throws(() => records.validateInteraction({ ...input, ts: '2026-11-03T19:24:00Z' }, now), /date_invalid/);
let phase = 'startup';
async function main() {
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  try {
    for (const width of [1366, 400, 412]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1366 ? 768 : 915 }, timezoneId: 'Asia/Tokyo' });
      const page = await context.newPage(), errors = [], external = [], nonGET = [], activityQueries = []; let askReads = 0;
      page.setDefaultTimeout(10000);
      await page.addInitScript(value => { const Original = Date; window.Date = class extends Original { constructor(...args) { super(...(args.length ? args : [value])); } static now() { return value; } }; }, Date.parse(now));
      page.on('pageerror', error => errors.push(error.name));
      await page.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (req.method() !== 'GET') { nonGET.push(url.pathname); return route.abort(); }
        if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
        if (url.pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
        if (url.origin !== base) { external.push(url.hostname); return route.abort(); }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, role: 'admin', user: { id: 'synthetic-owner', role: 'admin', name: 'Synthetic operator' } } });
        if (url.pathname === '/api/dashboard/ask-workspace') { askReads++; return route.fulfill({ json: snapshot }); }
        if (url.pathname === '/api/dashboard/record-activity') {
          const query = Object.fromEntries(url.searchParams); activityQueries.push(query);
          return route.fulfill({ json: query.from_ts || query.to_ts ? { ...records.listActivity({ activities: activity.items }, { fromTs: query.from_ts, toTs: query.to_ts, limit: 100 }), types: records.TYPES } : activity });
        }
        if (url.pathname === '/api/dashboard/record-refs') return route.fulfill({ json: { missing: { leads: 0, buyers: 0, deals: 0, matches: 0 }, deal_reserve: { reserved: 1, namespaces: 1, minimum: 1030 } } });
        if (url.pathname === '/api/dashboard/today-workspace') return route.fulfill({ json: { source_kind: 'derived_workflow', now, today: '2026-11-03', counts: {}, actions: [], best_deals: [], last_24h: [] } });
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] });
        if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
        const relative = url.pathname === '/dashboard/' ? 'index.html' : url.pathname.startsWith('/dashboard/') ? url.pathname.slice(11) : null;
        assert(relative && !relative.includes('..'));
        return route.fulfill({ contentType: relative.endsWith('.html') ? 'text/html' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../dashboard', relative)) });
      });
      async function proof(name) {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (process.env.WOS_RECORDED_TIMES_PROOF_DIR) {
          fs.mkdirSync(process.env.WOS_RECORDED_TIMES_PROOF_DIR, { recursive: true }); await page.mouse.move(0, 0);
          await page.screenshot({ path: path.join(process.env.WOS_RECORDED_TIMES_PROOF_DIR, name + '-' + width + '.png') });
        }
      }
      try {
        phase = width + ':ask'; await page.goto(base + '/dashboard/');
        const entry = page.getByRole('button', { name: 'Open Ask WholesaleOS', exact: true }); await entry.waitFor();
        assert.equal(askReads, 0, 'Opening the dashboard does not fetch a snapshot');
        await entry.click(); await page.getByText('Recorded snapshot loaded. Nothing changed.', { exact: true }).waitFor();
        await page.locator('[data-ask-query]').fill(person.ref); await page.locator('[data-ask-form] button[type=submit]').click();
        await page.locator('.ask-context').waitFor();
        const text = await page.locator('.ask-context').innerText();
        for (const label of ['Fri 12:18 PM', 'Oct 20', 'Oct 20, 2025', 'Due: Jan 4, 2027', 'Time not confirmed', person.ref, snapshot.events[0].summary]) assert(text.includes(label), label);
        assert.equal((text.match(/Time not confirmed/g) || []).length, 2, 'Both invalid calendar and future event retain unknown time');
        assert.equal(await page.locator('.ask-context > ul > li').count(), 5, 'Unknown timestamps do not remove source rows');
        assert.equal(await page.locator('#wos-ask-panel img[src=x]').count(), 0);
        assert.equal(askReads, 1, 'Local questions do not fetch again');
        await page.locator('.ask-context > ul > li').first().scrollIntoViewIfNeeded();
        assert(await page.locator('#wos-ask-panel').evaluate(panel => { const r = panel.getBoundingClientRect(); return panel.open && r.width > 250 && r.height > 250 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; }), 'Positive dialog proof remains in viewport');
        await proof('ask');
        await page.locator('[data-ask-close]').click(); await page.locator('#wos-ask-panel').waitFor({ state: 'detached' });
        phase = width + ':activity'; await page.evaluate(() => navigate('record_activity', null));
        await page.getByText('Showing ' + cases.length + ' of ' + cases.length + ' events', { exact: true }).waitFor();
        const rows = page.locator('#wos-record-activity > ul > li'); assert.equal(await rows.count(), cases.length);
        for (let i = 0; i < cases.length; i++) {
          const text = await rows.nth(i).innerText(); assert(text.includes(cases[i][1]), 'Explicit time label case ' + i);
          assert(text.includes(person.ref)); assert(text.includes('Imported report')); assert(text.includes('source prose 10/20/2026 <img src=x>'));
        }
        assert.equal(await page.locator('#wos-record-activity img[src=x]').count(), 0);
        await rows.first().scrollIntoViewIfNeeded(); await proof('activity');
        phase = width + ':filters';
        for (const key of ['from', 'to']) { const field = page.locator('[data-activity-filter="' + key + '"]'); await field.fill('2026-11-03'); await field.dispatchEvent('change'); }
        const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/dashboard/record-activity' && new URL(value.url()).searchParams.has('from_ts'));
        await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await response;
        assert.equal(activityQueries.at(-1).from_ts, '2026-11-03T07:00:00.000Z');
        assert.equal(activityQueries.at(-1).to_ts, '2026-11-04T06:59:59.999Z');
        await page.getByText('Showing 3 of 3 events', { exact: true }).waitFor();
        const filtered = await page.locator('#wos-record-activity > ul').innerText();
        for (const i of [6, 10, 11]) assert(filtered.includes(activity.items[i].summary));
        for (const i of [9, 12]) assert(!filtered.includes(activity.items[i].summary), 'Outside owner day is excluded');
        const beforeInvalid = activityQueries.length, from = page.locator('[data-activity-filter="from"]');
        await from.fill('2026-11-04'); await from.dispatchEvent('change'); await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
        await page.getByText('Choose a valid date range.', { exact: true }).waitFor();
        assert.equal(activityQueries.length, beforeInvalid, 'Invalid range cannot fetch or show stale prior rows');
        assert.equal(await page.locator('#wos-record-activity > ul > li').filter({ hasText: 'Synthetic activity' }).count(), 0);
        assert.equal(await page.getByText('No recorded activity.', { exact: true }).count(), 0, 'Unloaded is not measured zero');
        await page.getByText('Activity not loaded.', { exact: true }).waitFor();
        for (const key of ['from', 'to']) { const field = page.locator('[data-activity-filter="' + key + '"]'); await field.fill('2027-01-01'); await field.dispatchEvent('change'); }
        await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await page.getByText('Showing 0 of 0 events', { exact: true }).waitFor();
        await page.getByText('No recorded activity.', { exact: true }).waitFor();
        assert.deepEqual(nonGET, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    assert.equal(JSON.stringify({ snapshot, activity }), frozen);
  } finally { await browser.close(); }
  console.log('recorded-context-times: actual Ask/Activity3width UTC7 despite Tokyo,recent/old/year/day/strict unknown,row/source/ref retention,unchanged import tolerance and GET-only/no mutation passed');
}
main().catch(error => { console.error(JSON.stringify({ test: 'recorded-context-times', phase, message: error.message, location: String(error.stack).match(/recorded-context-times\.test\.js:\d+:\d+/)?.[0] || null })); process.exitCode = 1; });
