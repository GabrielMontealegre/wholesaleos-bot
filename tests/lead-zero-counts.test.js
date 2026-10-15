'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../dashboard/index.html'), 'utf8');
const helper = source.match(/function leadCountOrFallback\(\) \{[\s\S]*?\n\}/)[0];
const context = vm.createContext({});
vm.runInContext(helper, context);
const count = context.leadCountOrFallback;
assert.equal(count(0, 12039), 0);
assert.equal(count('0', 12039), 0);
assert.equal(count(undefined, null, '', ' ', false, -1, NaN, Infinity, {}, [], 'bad', 1.5, 7), 7);
assert.equal(count(undefined), 0);
assert.equal(count('23', 1), 23);

// Execute every committed writer, not a second implementation of the fallback.
const assignments = source.split(/\r?\n/).filter(line => /^\s*APP\._leadsTotal(?:All|Filtered)\s*=/.test(line));
assert.equal(assignments.length, 8, 'All four hydration paths must preserve both counts');
for (let i = 0; i < assignments.length; i += 2) {
  for (const fixture of [
    {payload: {totalAll: 12039, totalFiltered: 0}, loaded: 0, all: 12039, filtered: 0},
    {payload: {totalAll: 0, totalFiltered: 0}, loaded: 3, all: 0, filtered: 0},
    {payload: {totalFiltered: 0}, loaded: 3, all: 0, filtered: 0},
    {payload: {totalAll: 23}, loaded: 3, all: 23, filtered: 23},
    {payload: {}, loaded: 3, all: 3, filtered: 3},
    {payload: [], loaded: 3, all: 3, filtered: 3},
    {payload: {totalAll: null, totalFiltered: '0'}, loaded: 3, all: 0, filtered: 0},
    {payload: {totalAll: 'bad', totalFiltered: -1}, loaded: 3, all: 3, filtered: 3}
  ]) {
    const run = vm.createContext({APP: {_leadsTotalAll: 999, _leadsTotalFiltered: 999}, data: fixture.payload,
      ld: fixture.payload, res: [null, fixture.payload], leads: Array(fixture.loaded), ls: Array(fixture.loaded)});
    vm.runInContext(helper + '\n' + assignments.slice(i, i + 2).join('\n'), run);
    assert.equal(run.APP._leadsTotalAll, fixture.all);
    assert.equal(run.APP._leadsTotalFiltered, fixture.filtered);
  }
}
const readers = source.split(/\r?\n/).filter(line => /^\s*var safe(?:Total|Filtered) =/.test(line)).join('\n');
const read = vm.createContext({APP: {_leadsTotalAll: 12039, _leadsTotalFiltered: 0}, baseTotal: 3, total: 3});
vm.runInContext(helper + '\n' + readers, read);
assert.equal(read.safeTotal, 12039);
assert.equal(read.safeFiltered, 0);
assert.ok(!/APP\._leadsTotal(?:All|Filtered)\s*\|\|/.test(source), 'No remaining truthy count readers');
console.log('Lead zero counts: all four actual hydration writers and summary readers preserve explicit zero; missing/legacy/malformed counts fall back; no requests or writes.');

async function proveLoader() {
  const start = source.indexOf('loadLeadsFromAPI=async function(options)');
  const end = source.indexOf('\n};', start) + 3;
  assert.ok(start > 0 && end > start);
  const pending = [];
  const run = vm.createContext({APP: {leads: [], page: 'leads'}, window: {},
    console: {error() {}}, buildLeadApiUrl: () => '/api/leads',
    updateLeadsBadge() {}, leadQueueRenderWhenStable() {},
    fetch(url) {
      if (url === '/api/buyers') return Promise.resolve({ok: true, json: async () => ({buyers: []})});
      return new Promise(resolve => pending.push(resolve));
    }});
  vm.runInContext(helper + '\n' + source.slice(start, end), run);
  const older = run.loadLeadsFromAPI({});
  const newer = run.loadLeadsFromAPI({});
  pending[1]({ok: true, json: async () => ({leads: [], totalAll: 12039, totalFiltered: 0})});
  await newer;
  pending[0]({ok: true, json: async () => ({leads: [{id: 'stale'}], totalAll: 5, totalFiltered: 5})});
  await older;
  assert.equal(run.APP._leadsTotalAll, 12039);
  assert.equal(run.APP._leadsTotalFiltered, 0);
  assert.equal(run.APP.leads.length, 0, 'Stale response cannot replace newer zero result');
  const reload = run.loadLeadsFromAPI({});
  pending[2]({ok: true, json: async () => [{id: 'legacy'}]});
  await reload;
  assert.equal(run.APP._leadsTotalAll, 1);
  assert.equal(run.APP._leadsTotalFiltered, 1);
  console.log('Actual active loader: stale response ignored; zero result preserved; legacy array reload recovers.');
}
proveLoader().catch(error => {console.error(error.stack); process.exitCode = 1;});
