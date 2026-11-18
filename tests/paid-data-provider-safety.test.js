'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const network = require('./helpers/refuse-live-network').installRefuseLiveNetwork();
const filename = require.resolve('../modules/providers/paid-data-provider');
const original = require(filename);
const shim = new Module(filename, module);
shim.filename = filename; shim.paths = Module._nodeModulePaths(path.dirname(filename));
shim._compile(fs.readFileSync(filename, 'utf8').replace(
  'cost_per_call_usd: Object.freeze({ comps: null, property_detail: null, skip_trace: null, lists: null })',
  'cost_per_call_usd: Object.freeze({ comps: 4, property_detail: 1, skip_trace: 0.5, lists: 1 })'), filename);
const core = shim.exports, NOW = '2026-11-18T02:00:00Z';
const environment = () => ({ WOS_PROVIDER_PROPERTYRADAR_ENABLED: 'true', WOS_PROVIDER_PROPERTYRADAR_KEY: 'synthetic-key-only', WOS_PROVIDER_PROPERTYRADAR_MONTHLY_CAP_USD: '10' });
function ledger(initial = []) {
  const rows = initial.slice(); let tail = Promise.resolve();
  return { all: rows, rows: async () => rows.slice(), append: async row => { rows.push({ ...row }); },
    runExclusive: work => { const result = tail.then(work); tail = result.catch(() => {}); return result; } };
}
const client = (book, transport, env = environment(), cache) => core.createProviderClient({ provider_id: 'propertyradar', env, ledger: book, transport, cache });
const call = (instance, request, now = NOW) => instance.call('comps', request, { now_iso: now });

async function main() {
  for (const provider of Object.values(original.PROVIDERS)) assert(Object.values(provider.cost_per_call_usd).every(cost => cost === null));
  assert.equal(original.PROVIDERS.propertyradar.credential_env, 'WOS_PROVIDER_PROPERTYRADAR_KEY');
  assert.equal(original.PROVIDERS.batchdata.credential_env, 'WOS_PROVIDER_BATCHDATA_KEY');
  for (const id of ['__proto__', 'constructor', 'toString']) assert.equal(core.providerStatus(id, 'comps').enabled, false);
  const status = (env, rows = []) => core.providerStatus('propertyradar', 'comps', { env, ledger_rows: rows, now_iso: NOW });
  assert.equal(status(Object.create(environment())).enabled, false);
  for (const cap of ['Infinity', Infinity, -1, true, '10x']) assert.equal(status({ ...environment(), WOS_PROVIDER_PROPERTYRADAR_MONTHLY_CAP_USD: cap }).enabled, false);
  for (const cost of [-4, NaN, Infinity, '4', null]) assert.equal(status(environment(), [{ provider_id: 'propertyradar', at: NOW, cost_usd: cost }]).enabled, false);
  assert.equal(status(environment(), [{ provider_id: 'propertyradar', at: '2026-02-30', cost_usd: 0 }]).enabled, false);
  assert.throws(() => client({ rows() {}, append() {} }, async () => null), /atomic ledger/);
  assert.notEqual(core.requestHash('p', 'c', { filter: { city: 'A' } }), core.requestHash('p', 'c', { filter: { city: 'B' } }));
  assert.equal(core.requestHash('p', 'c', { z: [{ a: 1, b: 2 }], a: 3 }), core.requestHash('p', 'c', { a: 3, z: [{ b: 2, a: 1 }] }));
  assert.notEqual(core.requestHash('p', 'c', [1, 2]), core.requestHash('p', 'c', [2, 1]));
  const cycle = {}; cycle.self = cycle;
  let getters = 0; const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() { getters++; return 1; } });
  for (const value of [cycle, NaN, { nested: undefined }, new Array(1), accessor]) assert.throws(() => core.requestHash('p', 'c', value), TypeError);
  assert.equal(getters, 0);

  const book = ledger(); let transports = 0;
  const concurrent = client(book, async () => { transports++; assert.equal(book.all.length, transports, 'Reservation must precede transport'); return null; });
  const batch = await Promise.all([1, 2, 3].map(id => call(concurrent, { id })));
  assert.deepEqual(batch.map(result => result.status), ['ok', 'ok', 'disabled']);
  assert.equal(transports, 2); assert.equal(book.all.reduce((sum, row) => sum + row.cost_usd, 0), 8);
  assert.equal((await call(concurrent, { id: 1 })).status, 'cached', 'Null responses cache without billing again');
  assert(!JSON.stringify(book.all).includes('synthetic-key'));
  const duplicateBook = ledger(); let duplicateCalls = 0;
  const duplicate = client(duplicateBook, async () => { duplicateCalls++; return false; });
  assert.deepEqual((await Promise.all([call(duplicate, { id: 1 }), call(duplicate, { id: 1 })])).map(result => result.status), ['ok', 'cached']);
  assert.equal(duplicateCalls, 1);

  const env = environment(), sharedCache = new Map(), cacheBook = ledger(); let cacheCalls = 0;
  const cached = client(cacheBook, async () => { cacheCalls++; return { nested: { value: 1 } }; }, env, sharedCache);
  const first = await call(cached, { id: 1 }); first.response.nested.value = 999;
  const again = await call(cached, { id: 1 }, '2026-11-19T02:00:00Z');
  assert.equal(again.response.nested.value, 1); assert.equal(again.captured_at, NOW);
  env.WOS_PROVIDER_PROPERTYRADAR_ENABLED = 'false'; assert.equal((await call(cached, { id: 1 })).status, 'disabled');
  env.WOS_PROVIDER_PROPERTYRADAR_ENABLED = 'true'; env.WOS_PROVIDER_PROPERTYRADAR_KEY = 'rotated-synthetic-key';
  assert.equal((await call(cached, { id: 1 })).status, 'review_required'); assert.equal(cacheCalls, 1);
  const isolated = client(ledger(), async () => { cacheCalls++; return 'fresh synthetic response'; }, environment(), sharedCache);
  assert.equal((await call(isolated, { id: 1 })).status, 'ok', 'Injected caches never cross client authorization scope');
  const failedBook = ledger(); let failedCalls = 0;
  const failed = client(failedBook, async () => { failedCalls++; throw Error('synthetic transport uncertainty'); });
  assert.equal((await call(failed, { id: 1 })).status, 'review_required');
  assert.equal((await call(failed, { id: 1 })).status, 'review_required'); assert.equal(failedCalls, 1); assert.equal(failedBook.all[0].cost_usd, 4);
  let persistedCalls = 0;
  const broken = client({ ...ledger(), append: async () => { throw Error('synthetic ledger failure'); } }, async () => { persistedCalls++; return {}; });
  await assert.rejects(call(broken, { id: 1 }), /ledger failure/); assert.equal(persistedCalls, 0);
  const malformed = client({ ...ledger(), rows: async () => null }, async () => { throw Error('must not run'); });
  assert.equal((await call(malformed, {})).status, 'disabled');
  let unreservedCalls = 0;
  const nonPersisting = client({ ...ledger(), append: async () => {} }, async () => { unreservedCalls++; return {}; });
  assert.equal((await call(nonPersisting, {})).status, 'review_required'); assert.equal(unreservedCalls, 0);
  const changingCap = environment(), changingBook = ledger();
  const capChanged = client({ ...changingBook, append: async row => { await changingBook.append(row); changingCap.WOS_PROVIDER_PROPERTYRADAR_MONTHLY_CAP_USD = '1'; } },
    async () => { throw Error('Lowered cap must stop transport'); }, changingCap);
  assert.equal((await call(capChanged, {})).status, 'review_required');
  const switched = environment(); const switching = client(ledger(), async () => { switched.WOS_PROVIDER_PROPERTYRADAR_ENABLED = 'false'; return {}; }, switched);
  assert.equal((await call(switching, {})).status, 'review_required');
  const request = { nested: { id: 1 } }; const snapshot = client(ledger(), async ({ request: sent }) => { assert.equal(sent.nested.id, 1); return {}; });
  const pending = call(snapshot, request); request.nested.id = 99; await pending;
  for (const now of ['2026-02-30', '2026-13-01', '2026-11-18T25:00:00Z', '11/18/2026']) await assert.rejects(call(snapshot, {}, now), /now_iso/);

  const row = { address: '10 Example St', sale_status: 'sold', sale_price: 200000, sale_date: '2026-09-01', value_kind: 'recorded_sale', source_label: 'Synthetic deed', source_url: 'https://records.example.test/sale/10', source_reference: 'synthetic row 10' };
  const context = { subject_address: '1 Subject Rd', subject_state: 'ZZ', provider_id: 'synthetic', captured_at: NOW, rules_for_state: () => ({ disclosure: { status: 'disclosure', verification_status: 'verified' } }) };
  assert.equal(core.normalizeProviderComps([row], context).comps.length, 1);
  for (const patch of [{ sale_price: Infinity }, { sale_price: true }, { sale_date: '2026-02-30' }, { sale_date: '2026-12-01' }, { sale_date: '09/01/2026' }, { source_reference: '' }, { source_url: 'https://user:pass@records.example.test/sale/10' }, { source_url: '' }]) assert.equal(core.normalizeProviderComps([{ ...row, ...patch }], context).comps.length, 0);
  for (const patch of [{ captured_at: '' }, { captured_at: '2026-02-30T00:00:00Z' }, { subject_address: '' }]) assert.equal(core.normalizeProviderComps([row], { ...context, ...patch }).comps.length, 0);
  assert.equal(core.normalizeProviderComps([{ ...row, beds: Infinity, baths: true }], context).comps[0].beds, null);
  const inherited = Object.assign(Object.create({ dnc: false, litigator: false }), { number: '5550100001' });
  const traceContext = { provider_id: 'synthetic', captured_at: NOW, request_hash: 'synthetic-request' };
  const phones = [{ number: '5550100001', dnc: false }, inherited, { number: '5550100001', dnc: 'false', litigator: false }, { number: '5550100001', dnc: false, litigator: false }];
  assert.deepEqual(core.normalizeSkipTrace({ phones }, traceContext).phones.map(phone => phone.counts_as_route), [false, false, false, true]);
  assert.equal(core.normalizeSkipTrace({ phones: [phones[3]] }, {}).phones[0].counts_as_route, false);
  const now = Date.now;
  try { Date.now = () => { throw Error('No hidden clock'); }; core.normalizeProviderComps([row], context); core.normalizeSkipTrace({ phones }, traceContext); status(environment()); }
  finally { Date.now = now; }
  assert.deepEqual(network.attempts, []);
  console.log('paid provider safety: atomic reserve/cap, nested canonical requests, scoped OFF-aware immutable cache, uncertainty no retry, strict dates/price/provenance and exact own contact flags; synthetic-only no vendor/network PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => network.restore());
