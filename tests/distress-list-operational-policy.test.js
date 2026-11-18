'use strict';

const assert = require('node:assert/strict');
const { installRefuseLiveNetwork } = require('./helpers/refuse-live-network');
const network = installRefuseLiveNetwork();
const policy = require('../modules/sources/distress-list-operational-policy');
const technical = require('../modules/sources/distress-list-profiles');
const adapter = require('../modules/sources/distress-list-acquisition-adapter');
const registry = require('../modules/sources/source-adapter-registry');
const catalog = require('../modules/sources/source-catalog');
const pipeline = require('../modules/research/source-acquisition-orchestrator');
const counts = require('../modules/sources/distress-list-source-counts');
const mapper = require('../modules/sources/distress-list-lead-mapper');
const legacy = require('../modules/sources/mi-detroit-land-bank-source-profiles');
const id = 'nc_guilford_tax_sale_gcgis_guilfordcountync_gov';

async function main() {
  const originalCatalog = catalog.buildSourceCatalog, originalDiscover = registry.discoverSource;
  try {
    assert.equal(policy.PROFILES.length, technical.PROFILES.length);
    assert(policy.PROFILES.every(profile => Object.isFrozen(profile) && profile.enabled === false && profile.runnable === false &&
      profile.promotion_status === 'blocked_pending_validated_preview' && (profile.reader === null || profile.fixture_kind === 'synthetic')));
    for (const profile of technical.PROFILES.filter(profile => registry.adapterIdForSourceId(profile.source_id) === 'distress_list_acquisition_adapter')) {
      const entry = catalog.buildSourceCatalog({ state: profile.state, county: profile.county }).find(source => source.source_id === profile.source_id);
      assert(entry && entry.enabled === false && entry.auto_select === false, 'Every registered distress source is catalogued OFF');
    }
    const report = counts.buildSourceCounts([]);
    assert(report.sources.every(source => source.enabled === false && ['not enabled', 'needs sample data'].includes(source.status_label)));
    assert(report.sources.filter(source => source.readiness === 'needs_corpus').every(source => source.reader === null));
    assert.equal(report.collection_enabled, false);
    let calls = 0;
    registry.discoverSource = async () => { calls++; throw Error('Disabled source must not reach any adapter'); };
    const disabled = await pipeline.runAcquisitionCore({ job_id: 'synthetic-off', state: 'NC', county: 'Guilford', source_ids: [id],
      enabled: true, promotion_status: 'promoted', fixture_mode: true }, { fetch_impl: () => { throw Error('No fetch allowed'); } });
    assert.equal(calls, 0); assert.equal(disabled.attempted, false); assert.equal(disabled.status, 'not_enabled');
    assert.deepEqual(disabled.source_ids_attempted, []);
    assert.equal(disabled.disabled_sources[0].status_label, 'not enabled');
    assert.equal(disabled.diagnostics.disabled_sources[0].status, 'not_enabled');
    const persistedControl = counts.snapshotsFromJobs([{ updated_at: '2026-11-18T02:00:00Z',
      source_summary: { acquisition_core_diagnostics: disabled.diagnostics } }]);
    assert.equal(persistedControl[0].observed_status, 'not_enabled');
    assert.equal(persistedControl[0].rows_found, null, 'Disabled daily control is not a zero-row source fetch');
    catalog.buildSourceCatalog = () => [{ ...policy.profileForSourceId(id), source_name: 'Dallas County Clerk Foreclosure Notices' }];
    const fallback = await pipeline.runAcquisitionCore({ job_id: 'synthetic-disabled-fallback' });
    assert.equal(calls, 0); assert.equal(fallback.attempted, false); assert.deepEqual(fallback.source_ids_attempted, []);
    catalog.buildSourceCatalog = originalCatalog; registry.discoverSource = originalDiscover;

    // Synthetic simulation of a future trusted real-preview receipt; no source is enabled.
    const profile = policy.profileForSourceId(id), captured = '2026-11-18T02:00:00Z';
    const sourceUrl = profile.source_url + '/query?f=json&where=1%3D1';
    const receipt = { source_id: id, kind: 'real_source_preview', synthetic: false, metadata_only: false, count_only: false,
      captured_at: captured, source_url: sourceUrl,
      validation: { status: 'validated', validator: 'allowlisted_row_preview_v1', source_id: id, source_url: sourceUrl,
        source_captured_at: captured, validated_at: '2026-11-18T02:01:00Z' },
      rows: [{ source_id: id, source_url: sourceUrl, captured_at: captured, synthetic: false,
        row_reference: 'feature OBJECTID=41', raw_fields: { OBJECTID: 41, LOCATION_ADDR: '100 Example St', AuctionDate: '2026-12-01' } }] };
    const before = JSON.stringify(receipt);
    assert.equal(policy.canPromoteSource(profile, receipt), true, 'Only receipt eligibility is simulated, not owner approval or activation');
    assert.equal(profile.enabled, false); assert.equal(JSON.stringify(receipt), before);
    const clone = () => JSON.parse(before);
    const negatives = [
      value => value.metadata_only = true, value => value.count_only = true, value => value.synthetic = true,
      value => value.synthetic = 'false', value => delete value.metadata_only,
      value => value.kind = 'schema_metadata', value => value.validation = { validated: true },
      value => value.captured_at = '11/18/2026',
      value => value.validation.source_captured_at = '2026-11-16T02:00:00Z',
      value => value.validation.validated_at = '2026-02-30T02:01:00Z',
      value => value.rows[0].row_reference = 'feature OBJECTID=999',
      value => value.rows[0].raw_fields = {}, value => value.rows.push({ ...value.rows[0] }),
      value => value.rows = new Array(1), value => delete value.rows[0],
      value => value.rows[0].source_id = 'wrong-source', value => value.rows[0].captured_at = '2026-11-16T02:00:00Z'
    ];
    for (const change of negatives) { const value = clone(); change(value); assert.equal(policy.canPromoteSource(profile, value), false); }
    for (const url of ['https://evil.example/query', profile.source_url + '?f=json', sourceUrl + '&returnCountOnly=true',
      sourceUrl.replace('gcgis.guilfordcountync.gov', 'gcgis.guilfordcountync.gov:444'), sourceUrl.replace('https:', 'http:')]) {
      const value = clone(); value.source_url = value.validation.source_url = value.rows[0].source_url = url;
      assert.equal(policy.canPromoteSource(profile, value), false);
    }
    const stale = clone(); stale.captured_at = stale.validation.source_captured_at = stale.rows[0].captured_at = '2026-11-16T02:00:00Z';
    assert.equal(policy.canPromoteSource(profile, stale), false, 'Preview older than the reviewed schema is stale');
    const inherited = clone(); delete inherited.synthetic; Object.setPrototypeOf(inherited, { synthetic: false });
    assert.equal(policy.canPromoteSource(profile, inherited), false);
    assert.equal(policy.canPromoteSource({ ...profile, enabled: true }, receipt), false);
    assert.equal(policy.canPromoteSource(profile, { validated: true, row_count: 1 }), false);
    const ambiguous = mapper.mapRowToLead({ row_reference: 'feature OBJECTID=41', fields: {
      OBJECTID: 41, LOCATION_ADDR: '100 Example St', AuctionDate: '05/06/2026'
    } }, technical.profileForSourceId(id), { today: '2026-11-18', captured_at: captured });
    assert.equal(ambiguous.sale_date_status, 'AMBIGUOUS'); assert.equal(ambiguous.sale_date, '');
    const now = Date.now;
    try { Date.now = () => { throw Error('Pure policy must not read clock'); }; policy.canPromoteSource(profile, receipt); policy.catalogForMarket({}); }
    finally { Date.now = now; }

    const successorId = 'mi_wayne_land_bank_services2_arcgis_com', successor = policy.profileForSourceId(successorId);
    assert.equal(successor.related_source_id, legacy.PROFILE.source_id); assert.equal(successor.relation, 'candidate_successor');
    assert.notEqual(successor.source_id, legacy.PROFILE.source_id);
    assert.equal(legacy.PROFILE.api_url, 'https://buildingdetroit.org/properties');
    assert.notEqual(registry.adapterIdForSourceId(successorId), registry.adapterIdForSourceId(legacy.PROFILE.source_id));
    assert.equal(successor.reader, null); assert.equal(successor.status, 'needs_corpus');
    const codec = technical.profileForSourceId(successorId);
    const mapped = mapper.mapRowToLead({ row_reference: 'feature ObjectId=1', fields: { ObjectId: 1, address: '200 Example St', parcel_id: 'P-1' } },
      codec, { today: '2026-11-18', captured_at: captured });
    const candidate = adapter.candidateFromLead(mapped, codec, { captured_at: captured });
    assert.equal(candidate.owner_name_candidate, ''); assert.equal(candidate.asking_price, ''); assert.equal(candidate.zip || '', '');
    assert.equal(candidate.amount_listed, ''); assert.equal(candidate.source_structured_address_verified, false);
    assert.deepEqual(network.attempts, []);
    console.log('distress operational policy: all OFF/needs corpus, disabled normal/fallback paths never dispatch, exact receipt/host/reference/capture eligibility, separate legacy ID and no network/clock/import PASS');
  } finally { catalog.buildSourceCatalog = originalCatalog; registry.discoverSource = originalDiscover; network.restore(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
