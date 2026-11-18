'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const load = Module._load;
Module._load = function(name, ...args) { return name === 'dotenv' ? { config: () => ({ parsed: {} }) } : load.call(this, name, ...args); };
const network = require('./helpers/refuse-live-network').installRefuseLiveNetwork();
const matcher = require('../modules/buyers/sourced-match-index');
Module._load = load;
const NOW = '2026-11-18T02:00:00Z', CAPTURED = '2026-11-17T02:00:00Z';
function buyer(id, type = 'house') {
  return { id, record_ref: id === 'house' ? 'BUY-0001' : 'BUY-0002', name: 'Fixture Investor ' + id,
    source_url: 'https://buyers.example.test/wants/' + id,
    assistant_find: { name: 'Fixture Investor ' + id, platform: 'manual', source_url: 'https://buyers.example.test/wants/' + id,
      what_they_buy: 'Fixture reported criteria for ' + type, deal_type: type === 'land' ? 'land' : 'house', states: ['FL'], areas: ['Tampa'],
      captured_at: CAPTURED, approval: 'approved', classification: 'end_buyer',
      buy_box: { types: [type], price_max: 200000 },
      history: [{ kind: 'approval', to: 'approved', at: NOW, operator_id: 'operator' }] } };
}
function deal(id, type = 'house') {
  return { id, record_ref: id === 'house' ? 'WOS-FL-1001' : 'WOS-FL-1002', kind: 'deal', deal_kind: 'own', platform: 'own-lead',
    source_url: 'https://records.example.test/property/' + id, address: '100 Example St, Tampa, FL 33602',
    city: 'Tampa', county: 'Hillsborough', state: 'FL', zip: '33602', property_type: type, asking_price: 150000,
    captured_at: CAPTURED, comps: [], approval: 'pending', status: 'found', claimed_arv: 999999, arv_tier: 'Verified' };
}
function fixture() { return { users: [{ id: 'operator', name: 'Fixture Operator' }], buyers: [buyer('house'), buyer('land', 'land')], reviewed_deals: [deal('house'), deal('land', 'land')] }; }
function run(store) { return matcher.build(store, { now: NOW }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

try {
  const store = fixture(), before = JSON.stringify(store), result = run(store);
  assert.deepEqual(result.by_deal.map(row => [row.deal_id, row.matches.map(match => match.buyer_id)]), [['house', ['house']], ['land', ['land']]]);
  assert.deepEqual(result.by_buyer.map(row => [row.buyer_id, row.matches.map(match => match.deal_id)]), [['house', ['house']], ['land', ['land']]]);
  assert(result.by_deal.every(row => row.value_label === 'Value not verified'), 'Claimed value flags never establish value');
  assert(result.by_deal.flatMap(row => row.matches).every(match => match.criteria.length > 0 && match.criteria.every(criterion =>
    criterion.source.source_kind === 'assistant_report' && criterion.source.source_url.startsWith('https://buyers.example.test/wants/') &&
    criterion.source.captured_at === '2026-11-17T02:00:00.000Z' && criterion.source.evidence_text)));
  assert.equal(result.coverage.deed_purchases, 'not_integrated'); assert.equal(result.coverage.signups, 'not_integrated');
  assert(!JSON.stringify(result).includes('score')); assert.equal(JSON.stringify(store), before);
  const reversed = clone(store); reversed.buyers.reverse(); reversed.reviewed_deals.reverse();
  assert.deepEqual(run(reversed), result, 'Stable output regardless of canonical collection order');
  const batch = { users: store.users, buyers: [], reviewed_deals: [] };
  for (let index = 0; index < 50; index++) {
    const type = index % 2 ? 'land' : 'house';
    batch.buyers.push({ ...buyer('buyer-' + index, type), record_ref: 'BUY-' + (1000 + index) });
    batch.reviewed_deals.push({ ...deal('deal-' + index, type), record_ref: 'WOS-FL-' + (2000 + index) });
  }
  const batchResult = run(batch);
  assert.equal(batchResult.by_deal.length, 50); assert.equal(batchResult.by_buyer.length, 50);
  assert.equal(batchResult.by_deal.reduce((sum, row) => sum + row.matches.length, 0), 1250, 'Whole-batch index is not a silent top-N cap');
  for (const change of [
    b => b.test = true, b => b.synthetic_test_data = true,
    b => b.assistant_find.approval = 'pending', b => b.assistant_find.approval = true,
    b => b.assistant_find.source_url = 'http://buyers.example.test/wants/house',
    b => b.assistant_find.captured_at = '2026-02-30T02:00:00Z', b => b.assistant_find.captured_at = '2026-11-19T02:00:00Z',
    b => b.assistant_find.captured_at = '2026-07-01T02:00:00Z', b => b.assistant_find.what_they_buy = '',
    b => b.assistant_find.history = [], b => b.assistant_find.history[0].operator_id = 'forged',
    b => b.assistant_find.history[0].at = '2026-11-19T02:00:00Z',
    b => b.assistant_find.history.push({ ...b.assistant_find.history[0], to: 'rejected' }),
    b => b.assistant_find.classification = 'unknown', b => b.assistant_find.buy_box.types = [],
    b => b.source_url = 'https://different.example.test/wants/house', b => b.name = 'Different Investor'
  ]) {
    const bad = fixture(); bad.buyers = [bad.buyers[0]]; change(bad.buyers[0]);
    assert.equal(run(bad).by_deal.flatMap(row => row.matches).length, 0, 'Malformed or unsupported evidence must not match');
  }
  const inherited = fixture(); inherited.buyers = [inherited.buyers[0]];
  delete inherited.buyers[0].assistant_find.approval; Object.setPrototypeOf(inherited.buyers[0].assistant_find, { approval: 'approved' });
  assert.equal(run(inherited).by_buyer.length, 0);
  for (const patch of [{ state: 'NY' }, { city: 'Orlando' }, { property_type: 'condo' }, { asking_price: 250000 }, { asking_price: null }, { asking_price: null, starting_bid: 100000 }]) {
    const mismatch = fixture(); mismatch.buyers = [mismatch.buyers[0]]; mismatch.reviewed_deals = [{ ...mismatch.reviewed_deals[0], ...patch }];
    assert.equal(run(mismatch).by_deal.flatMap(row => row.matches).length, 0);
  }
  const duplicates = fixture(); duplicates.buyers.push(clone(duplicates.buyers[0]));
  assert.equal(run(duplicates).by_buyer.some(row => row.buyer_id === 'house'), false);
  const wrongReview = fixture(); Object.assign(wrongReview.reviewed_deals[0], { evidence_reviewed_by: 'forged', evidence_reviewed_at: NOW, arv_tier: 'Verified' });
  assert.equal(run(wrongReview).by_deal[0].value_label, 'Value not verified');
  const valued = fixture(), valuedDeal = valued.reviewed_deals[0];
  Object.assign(valuedDeal, { beds: 2, baths: 1, sqft: 1000, year_built: 1980, lot_size: 5000, latitude: 27.95, longitude: -82.45,
    evidence_reviewed_at: NOW, evidence_reviewed_by: 'operator', comps: [1, 2, 3].map(n => ({
      comp_address: (100 + n) + ' Example St, Tampa, FL 33602', source_url: 'https://records.example.test/property/' + n,
      sold_date: '2026-09-20', sold_status: 'sold', sold_price: 250000 + n * 1000, evidence_text: 'Source sale record fixture',
      beds: 2, baths: 1, sqft: 1000, year_built: 1980, lot_size: 5000, property_type: 'house', latitude: 27.95 + n * 0.001, longitude: -82.45
    })) });
  assert.equal(run(valued).by_deal[0].value_label, 'Verified value');
  valuedDeal.comps.pop(); assert.equal(run(valued).by_deal[0].value_label, 'Preliminary value');
  valuedDeal.comps.pop(); assert.equal(run(valued).by_deal[0].value_label, 'Value not verified');
  for (const now of [undefined, '2026-02-30T02:00:00Z', '11/18/2026']) assert.throws(() => matcher.build(store, { now }), /injected now/);
  for (const invalid of [null, {}, { ...store, users: null }]) assert.throws(() => run(invalid), /stored collections/);
  const oldNow = Date.now, oldWrite = fs.writeFileSync, oldWriteAsync = fs.writeFile, oldFetch = global.fetch;
  try {
    Date.now = fs.writeFileSync = fs.writeFile = global.fetch = () => { throw Error('Ambient effect forbidden'); };
    assert.deepEqual(run(store), result);
  } finally { Date.now = oldNow; fs.writeFileSync = oldWrite; fs.writeFile = oldWriteAsync; global.fetch = oldFetch; }
  assert.deepEqual(network.attempts, []);
  console.log('sourced match index: canonical approved reports, own provenance, stale/future/forged/missing/duplicate rejection, house/land, strict type/area/price, honest unknown value, deterministic dual index and no network/clock/write PASS');
} finally { network.restore(); }
