'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const load = Module._load;
Module._load = function(name, ...args) { return name === 'dotenv' ? { config: () => ({ parsed: {} }) } : load.call(this, name, ...args); };
const network = require('./helpers/refuse-live-network').installRefuseLiveNetwork();
const schema = require('../modules/sources/public-record-schema-profiles');
const registered = require('../modules/sources/public-parcel-api-profiles');
const engine = require('../modules/research/disclosure-state-comp-resolution');
Module._load = load;
const parcelFixture = require('./fixtures/public-record-schema/statewide-parcel.json');
const unavailable = require('./fixtures/public-record-schema/statewide-roll-unavailable.json');

async function main() {
  const parcel = schema.profileForId(parcelFixture.profile_id), roll = schema.profileForId(unavailable.profile_id);
  const before = JSON.stringify([parcelFixture, unavailable]);
  assert(schema.validateSchemaFixture(parcel.profile_id, parcelFixture));
  assert.equal(parcel.county, null); assert.equal(roll.county, null);
  assert.equal(parcel.field_map.owner_name, 'owner_name'); assert.equal(parcel.field_map.mailing_address, 'mail_addr');
  assert.equal(parcel.field_map.sale_price, null); assert.equal(parcel.field_map.sale_date, null);
  assert.equal(parcel.field_map.source_acquired_date, 'date_acq', 'Acquisition metadata never becomes sale date');
  assert.equal(parcel.field_map.reported_market_assessment, 'mkt_value', 'Assessment remains labeled separately');
  assert.equal(roll.field_map, null); assert.equal(roll.schema_fields, null); assert.equal(roll.captured_date, null);
  assert.equal(roll.metadata_outcome, 'http_401_via_read_only_web_tool');
  assert.equal(schema.validateSchemaFixture(roll.profile_id, unavailable), false);
  assert.equal(schema.validateSchemaFixture(roll.profile_id, { ...parcelFixture, profile_id: roll.profile_id, metadata_url: roll.metadata_url }), false);
  for (const profile of [parcel, roll]) {
    assert(Object.isFrozen(profile)); assert.equal(profile.enabled, false);
    for (const key of ['api_kind', 'service_url', 'layer', 'reader', 'disclosure_state', 'qualified_sale_codes', 'current_record_count', 'source_updated_at']) assert.equal(profile[key], null);
    assert(!registered.PROFILES.some(existing => existing.profile_id === profile.profile_id));
    assert.deepEqual(profile.future_row_evidence_required, ['source_file', 'row_reference', 'source_file_date', 'captured_at']);
    for (const county of ['County A', 'County B']) {
      const market = { state: profile.state, county, enabled: true, synthetic: true };
      assert(schema.schemaProfilesForMarket(market).some(item => item.profile_id === profile.profile_id && item.enabled === false));
      assert.deepEqual(schema.runtimeProfilesForMarket(market), []);
    }
  }
  for (const patch of [{ synthetic: false }, { captured_date: '2026-02-30' }, { metadata_url: 'https://wrong.example.test/metadata' }, { rows: [] }]) {
    assert.equal(schema.validateSchemaFixture(parcel.profile_id, { ...parcelFixture, ...patch }), false);
  }
  let fetches = 0; const now = Date.now;
  try {
    Date.now = () => { throw Error('No hidden clock'); };
    const result = await engine.resolveCompsForRow({}, { profiles: [parcel, roll], now_iso: '2026-11-18T00:00:00Z', fetch_impl: () => { fetches++; throw Error('No source fetch'); } });
    assert.equal(result.status, 'no_profile'); assert.deepEqual(result.verified_comps, []); assert.equal(fetches, 0);
    const candidate = engine.compFromAttributes({}, parcel, '', { row: {}, today_iso: '2026-11-18' });
    assert.equal(candidate.sold_date, ''); assert.equal(candidate.comp_address, '');
    assert.equal(engine.evaluateStrictCompGrid(candidate, {}, { now_iso: '2026-11-18T00:00:00Z' }).accepted, false);
  } finally { Date.now = now; }
  assert.equal(JSON.stringify([parcelFixture, unavailable]), before); assert.deepEqual(network.attempts, []);
  console.log('statewide schema OFF: official parcel metadata only, no assessment/acquisition-to-sale promotion, unsupported401 roll/unknown columns, exact synthetic schema provenance, no registration/fetch/clock/import PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => network.restore());
