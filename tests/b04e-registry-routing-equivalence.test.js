'use strict';

const assert = require('assert');
const legacyProfiles = require('../modules/sources/tx-county-foreclosure-source-profiles').PROFILES;
const profiles = require('../modules/sources/county-source-profile-registry');
const catalog = require('../modules/sources/source-catalog');
const adapters = require('../modules/sources/source-adapter-registry');
const countyAdapter = require('../modules/sources/tx-county-foreclosure-acquisition-adapter');
const queue = require('../modules/research/deal-board-queue-service');
const candidate = require('../modules/research/property-candidate');
const board = require('../modules/research/free-public-deal-board');

const groups = [
  ['dallas', { county: 'Dallas', state: 'TX', city: 'Dallas' }, queue.DALLAS_TX_COUNTY_FORECLOSURE_SOURCE_IDS],
  ['houston', { county: 'Harris', state: 'TX', city: 'Houston' }, queue.HOUSTON_TX_COUNTY_FORECLOSURE_SOURCE_IDS],
  ['san_antonio', { county: 'Bexar', state: 'TX', city: 'San Antonio' }, queue.SAN_ANTONIO_TX_COUNTY_FORECLOSURE_SOURCE_IDS],
  ['austin', { county: 'Travis', state: 'TX', city: 'Austin' }, queue.AUSTIN_TX_COUNTY_FORECLOSURE_SOURCE_IDS]
];
for (const [group, market, queueIds] of groups) {
  const before = legacyProfiles.filter((profile) => (profile.market_group || 'dallas') === group);
  const after = profiles.regionalProfilesForGroup(group);
  assert.deepStrictEqual(after.map((profile) => profile.source_id), before.map((profile) => profile.source_id));
  assert.deepStrictEqual(queueIds, before.map((profile) => profile.source_id));
  const marketSources = catalog.buildSourceCatalog(market).filter((source) =>
    before.some((profile) => profile.source_id === source.source_id));
  assert.deepStrictEqual(marketSources.map((source) => source.source_id), before.map((profile) => profile.source_id));
  for (const [index, old] of before.entries()) {
    const source = marketSources[index];
    assert.strictEqual(source.source_name, old.source_name);
    assert.strictEqual(source.source_url, old.source_url);
    assert.strictEqual(source.priority_score, 88 - index);
    assert.strictEqual(source.preview_only, true);
    assert.strictEqual(source.should_ingest, false);
    const adapter = adapters.adapterForSourceId(old.source_id);
    assert.strictEqual(adapter.run, countyAdapter.runTxCountyForeclosureAcquisitionAdapter);
    assert.strictEqual(adapter.source_name, old.source_name);
  }
}
assert.deepStrictEqual(profiles.regionalProfilesForGroup('unconfigured'), []);
assert.strictEqual(adapters.adapterForSourceId('unconfigured'), null);
assert.strictEqual(profiles.profileForSourceId('tx_dallas_county_clerk_foreclosure_notices').catalog_group, 'primary');

for (const [source_id, source_url, market] of [
  ['tx_dallas_county_clerk_foreclosure_notices', 'https://www.dallascounty.org/notice.pdf',
    { county: 'Dallas', state: 'TX', city: 'Dallas' }],
  ['tx_ellis_county_foreclosure_notices', 'https://co.ellis.tx.us/notice.pdf',
    { county: 'Ellis', state: 'TX', city: 'Ennis' }]
]) {
  const record = { source_id, source_url, source_family: 'preforeclosure_trustee_notice',
    normalized_address: '123 Test St, Dallas, TX 75201', event_date: 'October 6, 2026',
    event_date_origin: 'sale_date' };
  const normalized = candidate.normalizePropertyCandidate(record, market);
  const card = candidate.candidateToFindMeCard(normalized, market);
  const deal = board.dealFromRecord(record, { market });
  const row = queue.projectRowForQueue(deal, source_id, '2026-09-30T12:00:00Z');
  assert.strictEqual(normalized.event_date, 'October 6, 2026');
  assert.strictEqual(card.sale_date_or_event_date, 'October 6, 2026');
  assert.strictEqual(deal.sale_date_or_event_date, 'October 6, 2026');
  assert.strictEqual(row.sale_date_or_event_date, 'October 6, 2026');
  assert.strictEqual(row.sale_date_iso, '2026-10-06');
  assert.strictEqual(row.sale_date_or_event_date_origin, 'sale_date');
  assert.strictEqual(row.source_adapter_id, source_id);
  assert.strictEqual(row.row_state, 'LOCKED', 'address and contact proof are still required');
}
console.log('B-04e regional routing and transport equivalence passed');
