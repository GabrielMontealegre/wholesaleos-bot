'use strict';
const assert = require('assert');
const fs = require('fs');
const deals = require('../modules/deals/reviewed-deals');
const imports = require('../modules/buyers/buyer-find-import');
const now = '2026-10-07T12:00:00.000Z';
function fixture() { return { kind: 'deal', deal_kind: 'jv', platform: 'facebook-wholesaler', source_url: 'https://www.facebook.com/groups/123/posts/456/',
  address: '100 Example St, Tampa, FL 33602', city: 'Tampa', county: 'Hillsborough', state: 'FL', zip: '33602', beds: 2, baths: 1, sqft: 1000, year_built: 1980, lot_size: 5000, property_type: 'single family', latitude: 27.95, longitude: -82.45,
  asking_price: 155000, claimed_arv: 350000, repair_estimate: 20000, jv_split: 0.5, posted_at: '2026-10-06T12:00:00Z', captured_at: now, closing_date: 'October 20, 2026', holder_contact: {},
  comps: [1, 2, 3].map(n => ({ comp_address: (100 + n) + ' Example St, Tampa, FL 33602', source_url: 'https://records.example.test/property/' + n, sold_date: 'September 20, 2026', sold_status: 'sold', sold_price: 250000 + n * 1000, evidence_text: 'Source sale record fixture', beds: 2, baths: 1, sqft: 1000, year_built: 1980, lot_size: 5000, property_type: 'single family', latitude: 27.95 + n * 0.001, longitude: -82.45 })) }; }
const buyer = { id: 'buyer1', name: 'Fixture Investor', assistant_find: { approval: 'approved', classification: 'end_buyer', states: ['FL'], areas: ['Tampa'], buy_box: { types: ['house'], pct_arv: '75%', price_max: 200000 } } };
function build() { return deals.ingest({ buyers: [buyer], leads: [{ id: 'keep' }] }, [deals.validate(fixture(), now)], { now, operatorId: 'operator', createId: () => 'deal1' }).store; }
function action(store, input, time = now) { return deals.update(store, 'deal1', input, { now: time, operatorId: 'operator' }); }
const original = build(); const saved = JSON.stringify(original);
assert.strictEqual(deals.evaluate(original.reviewed_deals[0], [buyer], now).value.tier, 'Not established');
assert.strictEqual(deals.evaluate(original.reviewed_deals[0], [buyer], now).matches.length, 1, 'pending deals can show approved geographic buyer candidates (#304)');
assert.strictEqual(deals.evaluate(original.reviewed_deals[0], [buyer], now).jv_eligible, false, 'geographic matches do not approve a pending deal');
assert.throws(() => action(original, { action: 'approve' }), /review_required/);
let store = action(original, { action: 'approve', reviewed_comps: true });
let evaluation = deals.evaluate(store.reviewed_deals[0], [buyer], now);
assert.strictEqual(evaluation.value.tier, 'Verified'); assert.strictEqual(evaluation.matches[0].max_price, 168250); assert.strictEqual(evaluation.verdict, 'GOOD');
assert.strictEqual(evaluation.jv_eligible, false); assert.strictEqual(evaluation.introduction_allowed, false); assert.notStrictEqual(evaluation.ready_to_offer, 'YES');
assert.strictEqual(JSON.stringify(original), saved);
store = action(store, { action: 'status', status: 'vetted' });
assert.throws(() => action(store, { action: 'status', status: 'jv_signed' }), /transition_invalid/);
store = action(store, { action: 'status', status: 'holder_confirmed', evidence_url: fixture().source_url, checks: { still_available: true } });
evaluation = deals.evaluate(store.reviewed_deals[0], [buyer], now); assert.strictEqual(evaluation.jv_eligible, true); assert.strictEqual(evaluation.introduction_allowed, false);
assert.strictEqual(deals.list(store, { now, jv: true }).items.length, 1);
assert.strictEqual(deals.list(store, { now: '2026-10-08T12:00:00Z', jv: true }).items.length, 0, 'same-day availability cannot carry forward');
assert.throws(() => action(store, { action: 'availability', evidence_url: fixture().source_url, checks: { still_available: false } }), /checks_required/);
const renewed = action(store, { action: 'availability', evidence_url: fixture().source_url, checks: { still_available: true } }, '2026-10-08T12:00:00Z');
assert.strictEqual(deals.list(renewed, { now: '2026-10-08T12:00:00Z', jv: true }).items.length, 1);
assert.throws(() => action(store, { action: 'status', status: 'contract_verified', evidence_url: fixture().source_url, checks: { seller_signature: true } }), /checks_required/);
store = action(store, { action: 'status', status: 'contract_verified', evidence_url: fixture().source_url, checks: { seller_signature: true, assignable: true, closing_date: true, title_company: true, owner_record_matches: true } });
store = action(store, { action: 'status', status: 'jv_signed', evidence_url: fixture().source_url, checks: { signed: true, contract_interest: true, title_pays_fees: true } });
assert.strictEqual(deals.evaluate(store.reviewed_deals[0], [buyer], now).introduction_allowed, true);
store = action(store, { action: 'status', status: 'buyer_committed', evidence_url: fixture().source_url, checks: { emd_at_title: true } });
assert.strictEqual(store.reviewed_deals[0].history.length, 6); assert.ok(store.reviewed_deals[0].history.every(e => e.operator_id === 'operator' && e.at === now));
assert.deepStrictEqual(store.leads, original.leads);
const pendingBuyer = { ...buyer, assistant_find: { ...buyer.assistant_find, approval: 'pending' } };
assert.strictEqual(deals.evaluate(store.reviewed_deals[0], [pendingBuyer], now).matches.length, 0);
assert.strictEqual(deals.evaluate(store.reviewed_deals[0], [{ ...buyer, name: 'AI-generated buyer' }], now).matches.length, 0);
assert.strictEqual(deals.evaluate(store.reviewed_deals[0], [{ ...buyer, assistant_find: { ...buyer.assistant_find, states: ['NY'] } }], now).matches.length, 0);
assert.strictEqual(deals.evaluate(store.reviewed_deals[0], [{ ...buyer, assistant_find: { ...buyer.assistant_find, buy_box: { pct_arv: '75% plus unspecified conditions', price_max: 200000 } } }], now).matches.length, 0, 'unparsed rules cannot be silently ignored');
function altered(change) { const d = { ...store.reviewed_deals[0], ...change }; return deals.evaluate(d, [buyer], now); }
assert.strictEqual(altered({ comps: store.reviewed_deals[0].comps.slice(0, 2) }).value.tier, 'Preliminary');
assert.strictEqual(altered({ comps: [store.reviewed_deals[0].comps[0], store.reviewed_deals[0].comps[0]] }).value.tier, 'Not established');
assert.strictEqual(altered({ comps: store.reviewed_deals[0].comps.map(c => ({ ...c, latitude: 29 })) }).value.tier, 'Not established');
assert.strictEqual(altered({ comps: store.reviewed_deals[0].comps.map(c => ({ ...c, sold_date: '2025-10-01' })) }).value.tier, 'Not established');
assert.strictEqual(altered({ comps: store.reviewed_deals[0].comps.map(c => ({ ...c, comp_address: store.reviewed_deals[0].address })) }).value.tier, 'Not established');
assert.strictEqual(altered({ asking_price: null, starting_bid: null }).matches[0].estimated_spread, null);
assert.strictEqual(altered({ jv_split: null }).matches[0].estimated_spread, null);
const differentShares = [
  { ...store.reviewed_deals[0], id: 'smaller-share', asking_price: 150000, jv_split: 0.1 },
  { ...store.reviewed_deals[0], id: 'larger-share', asking_price: 155000, jv_split: 0.9 },
  { ...store.reviewed_deals[0], id: 'unknown-share', asking_price: 140000, jv_split: null }
];
assert.deepStrictEqual(deals.list({ ...store, reviewed_deals: differentShares }, { now }).items.map(d => d.id), ['larger-share', 'smaller-share', 'unknown-share'], 'ordering uses the actual estimated split, with unknown spread last');
assert.strictEqual(altered({ posted_at: '' }).jv_eligible, false);
assert.strictEqual(altered({ closing_date: '2026-10-12' }).jv_eligible, false);
assert.strictEqual(altered({ asking_price: 180000 }).verdict, 'POSSIBLE');
assert.strictEqual(altered({ asking_price: 200000 }).verdict, 'OVERPRICED');
const expired = { ...store.reviewed_deals[0], closing_date: '2026-10-01' }; const expiredStore = { ...store, reviewed_deals: [expired] };
assert.strictEqual(deals.list(expiredStore, { now }).items.length, 0); assert.strictEqual(deals.list(expiredStore, { now, includeHidden: true }).items[0].evaluation.status, 'expired');
assert.strictEqual(expired.status, 'buyer_committed', 'expiration is a pure read, not a hidden write');
const tx = { ...store.reviewed_deals[0], state: 'TX', address: '100 Example St, Austin, TX 78701', city: 'Austin', zip: '78701', comps: store.reviewed_deals[0].comps.map((c, n) => ({ ...c, comp_address: (101 + n) + ' Example St, Austin, TX 78701', price_basis: 'texas_last_list_price', last_list_price: c.sold_price })) };
assert.strictEqual(deals.evaluate(tx, [], now).value.tier, 'Texas list-price'); assert.notStrictEqual(deals.evaluate(tx, [], now).value.tier, 'Verified');
for (const patch of [{ kind: 'buyer' }, { status: 'closed' }, { comps: [{ ...fixture().comps[0], comp_grid: { accepted: true } }] }, { closing_date: '10/20/2026' }]) assert.throws(() => deals.validate({ ...fixture(), ...patch }, now));
const mixed = imports.prepareImport({ buyers: [], leads: [] }, { items: [fixture(), { ...fixture(), source_url: fixture().source_url }, { ...fixture(), kind: 'fake' }] }, { now });
assert.strictEqual(mixed.summary.counts.new_items, 1); assert.strictEqual(mixed.summary.counts.duplicates, 1); assert.strictEqual(mixed.summary.counts.rejected, 1);
assert.ok(!JSON.stringify(mixed.summary).includes(fixture().address));
const committed = imports.commitImport({ buyers: [], leads: [] }, mixed, { now, operatorId: 'operator', createId: () => 'deal1', bulkApprove: true });
assert.strictEqual(committed.store.reviewed_deals[0].approval, 'pending'); assert.strictEqual(committed.summary.approved, 0);
const savedFetch = global.fetch; const savedClock = Date.now; const savedWrite = fs.writeFileSync; let calls = 0;
try { const forbidden = () => { calls++; throw new Error('side effect'); }; global.fetch = forbidden; Date.now = forbidden; fs.writeFileSync = forbidden; deals.list(store, { now }); deals.validate(fixture(), now); action(store, { action: 'draft', drafted_message: 'fixture' }); } finally { global.fetch = savedFetch; Date.now = savedClock; fs.writeFileSync = savedWrite; }
assert.strictEqual(calls, 0);
module.exports = { fixture, buyer, now };
console.log('Reviewed deals: strict comps, pending/approved, ceilings/spread, JV rules, expiration/history, unsafe input and purity passed.');
