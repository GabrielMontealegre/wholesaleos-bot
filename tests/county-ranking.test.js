'use strict';
const assert = require('node:assert/strict');
const {parseStateResponse, rankCatalog, buyerCoverage, METHOD} = require('../modules/records/county-ranking');
const {refresh} = require('../scripts/refresh-county-acs');
const response = () => ({release: {id: 'acs2024_5yr'}, tables: {B01003: {}, B25077: {}},
  geography: {'05000US12057': {name: 'Hillsborough County'}}, data: {'05000US12057': {
    B01003: {estimate: {B01003001: 1500000}}, B25077: {estimate: {B25077001: 300000}}}}});
const context = {stateFips: '12', sourceUrl: 'https://api.censusreporter.org/example', retrievedAt: '2026-10-15T00:00:00Z'};
const rows = parseStateResponse(response(), context);
assert.equal(rows[0].acs_population, 1500000); assert.equal(rows[0].acs_vintage, '2024 5-year');
assert.equal(rows[0].source_url, context.sourceUrl);
assert.throws(() => parseStateResponse({...response(), release: {id: 'acs2024_1yr'}}, context), /vintage_mismatch/);
assert.throws(() => parseStateResponse(response(), {...context, stateFips: '48'}), /wrong_state/);
assert.throws(() => parseStateResponse({}, context), /vintage_mismatch/);
const missing = response(); missing.data['05000US12057'].B25077.estimate.B25077001 = -666666666;
assert.equal(parseStateResponse(missing, context)[0].median_home_value, null);
const catalog = {counties: [
  {...rows[0], state: 'FL', name: 'Hillsborough County'},
  {...rows[0], fips: '12103', state: 'FL', name: 'Pinellas County', acs_population: 75000},
  {...rows[0], fips: '12001', state: 'FL', name: 'Alachua County', median_home_value: null}
]};
const rules = () => ({disclosure: {status: 'disclosure', verification_status: 'verified', citation: 'https://example.test/law'},
  foreclosure: {type: 'judicial', citation: 'https://example.test/law'}});
assert.equal(Object.values(METHOD).reduce((a, b) => a + b), 100);
const before = JSON.stringify(catalog);
const ranked = rankCatalog(catalog, {buyers: [], rules});
assert.equal(ranked.counties[0].name, 'Hillsborough County'); assert.equal(ranked.counties[0].score, 75);
assert.equal(ranked.counties[1].rank, 2); assert.equal(ranked.counties[2].score, null);
assert.ok(ranked.counties[2].missing_components.includes('median_value'));
assert.equal(JSON.stringify(catalog), before);
assert.ok(rankCatalog(catalog, {rules}).counties.every(c => c.score === null), 'Missing private buyer store is not zero');
assert.ok(rankCatalog(catalog, {buyers: [], rules: () => null}).counties.every(c => c.rank === null), 'No invented legal rules');
const buyers = [{id: 'one', approval: 'approved', state: 'FL', counties: ['Hillsborough County'], verified: true,
  verified_by: 'fixture-operator', verified_at: context.retrievedAt, source_url: 'https://records.example.test/buyer'},
  {id: 'two', approval: 'pending', state: 'FL', counties: ['Hillsborough County']},
  {id: 'three', approval: 'approved', state: 'TX', counties: ['Hillsborough County']},
  {id: 'four', approval: 'approved', state: 'FL', counties: ['Tampa']}];
assert.equal(buyerCoverage(catalog.counties, buyers).get('12057'), 1);
assert.equal(buyerCoverage(catalog.counties, [...buyers, buyers[0]]).get('12057'), 1);

async function proveRefresh() {
  let calls = 0, waits = [];
  const fetched = await refresh({catalog: {counties: [{fips: '12057'}]}, fetchImpl: async () => {calls++; return {ok: true, json: async () => response()};}, pause: async ms => waits.push(ms), now: () => context.retrievedAt});
  assert.equal(calls, 1); assert.equal(fetched.counties.length, 1); assert.deepEqual(waits, []);
  calls = 0;
  await assert.rejects(refresh({catalog: {counties: [{fips: '12057'}, {fips: '48001'}]}, fetchImpl: async () => {calls++; return {ok: false, status: 429};}}), /http_429.*stopped_after_1/);
  assert.equal(calls, 1, 'Stop immediately, no retry or second state');
  console.log('County ranking: ACS vintage/table/FIPS/provenance/null checks; deterministic within-state ranking, missing unranked, explicit approved county buyers, immutable inputs, rate/error stop passed.');
}
proveRefresh().catch(error => {console.error(error.stack); process.exitCode = 1;});
