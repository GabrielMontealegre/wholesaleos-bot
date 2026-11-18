'use strict';

// B-24a: paid provider core. Synthetic fixtures; no vendor is ever called.
const assert = require('assert');
const { installRefuseLiveNetwork } = require('./helpers/refuse-live-network');

const liveNetwork = installRefuseLiveNetwork();
const provider = require('../modules/providers/paid-data-provider');

const NOW = '2026-11-17T12:00:00Z';
const ON = {
  WOS_PROVIDER_PROPERTYRADAR_ENABLED: 'true',
  WOS_PROVIDER_PROPERTYRADAR_KEY: 'test-key-not-real',
  WOS_PROVIDER_PROPERTYRADAR_MONTHLY_CAP_USD: '10'
};

function ledger(rows = []) {
  let tail = Promise.resolve();
  return { rows: () => rows.slice(), append: (row) => rows.push(row), all: rows,
    runExclusive: work => { const result = tail.then(work); tail = result.catch(() => {}); return result; } };
}

(async () => {
  // ---- Off by default and every gate ---------------------------------------------------
  for (const id of Object.keys(provider.PROVIDERS)) {
    for (const cap of provider.PROVIDERS[id].capabilities) {
      assert.strictEqual(provider.PROVIDERS[id].cost_per_call_usd[cap], null, 'no invented prices');
      assert.strictEqual(provider.providerStatus(id, cap, { env: {}, now_iso: NOW }).enabled, false);
    }
  }
  assert.strictEqual(provider.providerStatus('nope', 'comps', { env: ON, now_iso: NOW }).reason, 'Unknown provider.');
  assert.match(provider.providerStatus('batchdata', 'comps', { env: ON, now_iso: NOW }).reason, /does not offer/);
  assert.match(provider.providerStatus('propertyradar', 'comps', { env: Object.assign({}, ON, { WOS_PROVIDER_PROPERTYRADAR_ENABLED: 'TRUE ' }), now_iso: NOW }).reason, /Switched off/, 'switch must be exactly true');
  assert.match(provider.providerStatus('propertyradar', 'comps', { env: Object.assign({}, ON, { WOS_PROVIDER_PROPERTYRADAR_KEY: '' }), now_iso: NOW }).reason, /No key/);
  assert.match(provider.providerStatus('propertyradar', 'comps', { env: ON, now_iso: NOW }).reason, /Price per call not confirmed/, 'unpriced capability stays off even when switched on');
  assert.ok(!JSON.stringify(provider.providerStatus('propertyradar', 'comps', { env: ON, now_iso: NOW })).includes('test-key'), 'status never echoes the key');

  // Pricing is configured by changing the registry data; simulate a priced entry.
  const priced = Object.assign({}, provider.PROVIDERS.propertyradar, { cost_per_call_usd: { comps: 4, property_detail: 1, skip_trace: 0.5, lists: 1 } });
  const original = provider.PROVIDERS.propertyradar;
  assert.strictEqual(Object.isFrozen(provider.PROVIDERS), true);
  assert.throws(() => Object.defineProperty(provider.PROVIDERS, 'propertyradar', { value: priced }), TypeError);
  assert.strictEqual(provider.PROVIDERS.propertyradar, original, 'registry cannot be changed at runtime');
})().then(async () => {
  // Exercise the client with a priced copy through a local registry shim.
  const Module = require('module');
  const path = require.resolve('../modules/providers/paid-data-provider');
  delete require.cache[path];
  const source = require('fs').readFileSync(path, 'utf8')
    .replace("cost_per_call_usd: Object.freeze({ comps: null, property_detail: null, skip_trace: null, lists: null })",
      "cost_per_call_usd: Object.freeze({ comps: 4, property_detail: 1, skip_trace: 0.5, lists: 1 })");
  const shim = new Module(path, module);
  shim.filename = path;
  shim.paths = Module._nodeModulePaths(require('path').dirname(path));
  shim._compile(source, path);
  const pricedProvider = shim.exports;

  // ---- Switch off: the transport is never called (spy) ----------------------------------
  let transportCalls = 0;
  const transport = async ({ key }) => { transportCalls += 1; assert.strictEqual(key, 'test-key-not-real'); return { phones: [] }; };
  const offClient = pricedProvider.createProviderClient({ provider_id: 'propertyradar', env: {}, transport, ledger: ledger() });
  const off = await offClient.call('skip_trace', { name: 'Sample Owner', mailing: '1 Example St' }, { now_iso: NOW });
  assert.strictEqual(off.status, 'disabled');
  assert.strictEqual(transportCalls, 0, 'no call while the switch is off');

  // ---- On: one billed call, cached duplicate, cost cap ----------------------------------
  const book = ledger();
  const client = pricedProvider.createProviderClient({ provider_id: 'propertyradar', env: ON, transport, ledger: book });
  const first = await client.call('skip_trace', { name: 'Sample Owner', mailing: '1 Example St' }, { now_iso: NOW });
  assert.strictEqual(first.status, 'ok');
  assert.strictEqual(first.cost_usd, 0.5);
  const again = await client.call('skip_trace', { mailing: '1 Example St', name: 'Sample Owner' }, { now_iso: NOW });
  assert.strictEqual(again.status, 'cached', 'same input in another key order is not billed twice');
  assert.strictEqual(transportCalls, 1);
  assert.strictEqual(book.all.length, 1);
  const ledgerText = JSON.stringify(book.all);
  assert.ok(!ledgerText.includes('Sample Owner') && !ledgerText.includes('Example St') && !ledgerText.includes('test-key'), 'ledger holds cost and hash only');
  await client.call('comps', { address: '2 Example St' }, { now_iso: NOW });
  await client.call('comps', { address: '3 Example St' }, { now_iso: NOW });
  const capped = await client.call('comps', { address: '4 Example St' }, { now_iso: NOW });
  assert.strictEqual(capped.status, 'disabled');
  assert.match(capped.reason, /cap reached/, '$0.50 + $4 + $4 spent; next $4 would pass the $10 cap');
  const nextMonth = await client.call('comps', { address: '4 Example St' }, { now_iso: '2026-12-01T00:00:00Z' });
  assert.strictEqual(nextMonth.status, 'ok', 'the cap is per month');
  await assert.rejects(() => client.call('comps', { address: '5 Example St' }, {}), /now_iso/, 'no hidden clock');
  assert.throws(() => pricedProvider.createProviderClient({ provider_id: 'propertyradar', env: ON }), /injected/);
  // Changing the cap in Settings does not erase spend already logged.
  const lowCap = pricedProvider.createProviderClient({ provider_id: 'propertyradar', env: Object.assign({}, ON, { WOS_PROVIDER_PROPERTYRADAR_MONTHLY_CAP_USD: '1' }), transport, ledger: book });
  assert.strictEqual((await lowCap.call('lists', { kind: 'probate' }, { now_iso: NOW })).status, 'disabled');
  assert.strictEqual((await pricedProvider.createProviderClient({ provider_id: 'propertyradar', env: Object.assign({}, ON, { WOS_PROVIDER_PROPERTYRADAR_MONTHLY_CAP_USD: '' }), transport, ledger: ledger() })
    .call('lists', { kind: 'x' }, { now_iso: NOW })).reason, 'No monthly spending cap set.');

  // ---- Comps: closed sales only; non-disclosure and unknown states are estimates -------
  const rows = [
    { address: '10 Example St', sale_status: 'Sold', sale_price: 200000, sale_date: '2026-09-01', beds: 3, baths: 2, living_area_sqft: 1400, year_built: 1975, distance_miles: 0.4, value_kind: 'recorded_sale', source_label: 'County deed record', source_url: 'https://records.example.test/synthetic-sale/10', source_reference: 'synthetic deed row 10' },
    { address: '11 Example St', sale_status: 'Active', sale_price: 250000, sale_date: '2026-09-01', value_kind: 'list_price', source_label: 'MLS' },
    { address: '12 Example St', value_kind: 'avm', sale_price: 210000, source_label: 'Model' },
    { address: '13 Example St', sale_status: 'Sold', sale_price: 0, sale_date: '2026-09-01', value_kind: 'recorded_sale', source_label: 'Deed' },
    { address: '14 Example St', sale_status: 'Sold', sale_price: 190000, sale_date: '09/01/2026', value_kind: 'recorded_sale', source_label: 'Deed' },
    { address: '1 Subject Rd', sale_status: 'Sold', sale_price: 150000, sale_date: '2026-01-01', value_kind: 'recorded_sale', source_label: 'Deed' },
    { address: '', sale_status: 'Sold', sale_price: 150000, sale_date: '2026-01-01', value_kind: 'recorded_sale', source_label: 'Deed' },
    { address: '15 Example St', sale_status: 'Sold', sale_price: 180000, sale_date: '2026-08-01', value_kind: 'recorded_sale', source_label: '' }
  ];
  const nc = pricedProvider.normalizeProviderComps(rows, { subject_address: '1 Subject Rd', subject_state: 'NC', provider_id: 'propertyradar', captured_at: NOW });
  const ncDisclosure = require('../modules/research/state-rules').rulesForState('NC').disclosure;
  if (ncDisclosure && ncDisclosure.status === 'disclosure' && ncDisclosure.verification_status === 'verified') {
    assert.deepStrictEqual(nc.comps.map((c) => c.address), ['10 Example St']);
    assert.strictEqual(nc.comps[0].can_satisfy_comp_gate, true);
    assert.strictEqual(nc.comps[0].living_area_sqft, 1400);
  } else {
    assert.strictEqual(nc.comps.length, 0, 'unverified disclosure status never yields comps');
  }
  assert.deepStrictEqual(nc.rejected.map((r) => r.reason).sort(), [
    'missing_address', 'missing_or_unproven_sale_date', 'missing_sale_price', 'missing_source_label',
    'not_a_closed_sale:avm', 'not_a_closed_sale:list_price', 'subject_property'
  ].sort(), 'list prices, AVMs, the subject, missing fields and numeric dates are rejected');
  // Positive path with a verified disclosure rule (no state in the table is verified yet).
  const verified = () => ({ disclosure: { status: 'disclosure', verification_status: 'verified' } });
  const ok = pricedProvider.normalizeProviderComps(rows, { subject_address: '1 Subject Rd', subject_state: 'ZZ', provider_id: 'propertyradar', captured_at: NOW, rules_for_state: verified });
  assert.deepStrictEqual(ok.comps.map((c) => c.address), ['10 Example St']);
  assert.strictEqual(ok.comps[0].can_satisfy_comp_gate, true);
  assert.deepStrictEqual([ok.comps[0].beds, ok.comps[0].baths, ok.comps[0].living_area_sqft, ok.comps[0].year_built, ok.comps[0].distance_miles, ok.comps[0].source_label],
    [3, 2, 1400, 1975, 0.4, 'County deed record']);
  const unverified = () => ({ disclosure: { status: 'disclosure', verification_status: 'unverified' } });
  assert.strictEqual(pricedProvider.normalizeProviderComps(rows, { subject_state: 'ZZ', provider_id: 'p', captured_at: NOW, rules_for_state: unverified }).comps.length, 0, 'unverified disclosure gives estimates only');
  const tx = pricedProvider.normalizeProviderComps(rows, { subject_address: '1 Subject Rd', subject_state: 'TX', provider_id: 'propertyradar', captured_at: NOW });
  assert.strictEqual(tx.comps.length, 0, 'Texas provider values are never comps');
  assert.strictEqual(tx.estimates.length, 1);
  assert.strictEqual(tx.estimates[0].can_satisfy_comp_gate, false);
  assert.strictEqual(tx.estimates[0].label, pricedProvider.ESTIMATE_LABEL);
  assert.strictEqual(pricedProvider.normalizeProviderComps(rows, { subject_state: 'GA', provider_id: 'p', captured_at: NOW }).comps.length, 0, 'unknown disclosure status gives estimates only');
  const forged = pricedProvider.normalizeProviderComps([Object.assign({}, rows[0], { can_satisfy_comp_gate: true })], { subject_state: 'TX', provider_id: 'p', captured_at: NOW });
  assert.strictEqual(forged.estimates[0].can_satisfy_comp_gate, false, 'a forged gate flag in the vendor row is ignored');

  // ---- Skip trace: possible numbers with flags ------------------------------------------
  const trace = pricedProvider.normalizeSkipTrace({
    phones: [
      { number: '+1 (555) 010-0001', phone_type: 'mobile', dnc: false, litigator: false },
      { number: '555-010-0002', phone_type: 'landline', dnc: true, litigator: false },
      { number: '555-010-0003', phone_type: 'mobile', dnc: false, litigator: true },
      { number: '555-010-0004', phone_type: 'mobile' },
      { number: '555-010-0005', dnc: false, litigator: false, status: 'wrong' },
      { number: '12345', dnc: false, litigator: false }
    ],
    emails: [{ address: 'Owner@Example.com' }, { address: 'not-an-email' }]
  }, { provider_id: 'propertyradar', captured_at: NOW, request_hash: 'abc' });
  assert.deepStrictEqual(trace.phones.map((p) => p.counts_as_route), [true, false, false, false, false, false],
    'DNC, litigator, unknown DNC status, wrong numbers and malformed numbers never count as a route');
  assert.ok(trace.phones.every((p) => p.label === pricedProvider.POSSIBLE_NUMBER_LABEL && p.provider === 'propertyradar' && p.captured_at === NOW && p.source_kind === 'skip_trace'));
  assert.strictEqual(trace.phones[0].number, '5550100001');
  assert.strictEqual(trace.phones[3].dnc_known, false);
  assert.deepStrictEqual(trace.emails.map((e) => e.address), ['owner@example.com']);
  assert.deepStrictEqual(pricedProvider.normalizeSkipTrace(null, {}), { phones: [], emails: [] }, 'missing response yields nothing');

  // ---- No network, no keys in code ------------------------------------------------------
  const code = require('fs').readFileSync(path, 'utf8');
  assert.ok(!/require\(['"](https?|node-fetch|axios)['"]\)/.test(code), 'transport is injected; no network client in the core');
  assert.ok(!/process\.env/.test(code), 'environment is passed in, never read globally');
  assert.strictEqual(liveNetwork.attempts.length, 0);
  liveNetwork.restore();
  console.log('paid-data-provider: off by default, exact switch/key/price/cap gates, no key echo, frozen registry, spy shows no call when off, cached duplicate not billed, monthly cap, no hidden clock, PII-free ledger, closed-sale comps only, Texas/unknown states estimates only, forged gate flag ignored, possible numbers with DNC/litigator/unknown/wrong handling and no network passed');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
