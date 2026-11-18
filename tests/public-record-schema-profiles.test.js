'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const load = Module._load;
Module._load = function(name, ...args) { return name === 'dotenv' ? { config: () => ({ parsed: {} }) } : load.call(this, name, ...args); };
const network = require('./helpers/refuse-live-network').installRefuseLiveNetwork();
const schemas = require('../modules/sources/public-record-schema-profiles');
const registered = require('../modules/sources/public-parcel-api-profiles');
const engine = require('../modules/research/disclosure-state-comp-resolution');
Module._load = load;
const fixture = require('./fixtures/public-record-schema/mecklenburg-cama.json');

async function main() {
  const id = fixture.profile_id, profile = schemas.profileForId(id), before = JSON.stringify(fixture);
  assert.equal(schemas.validateSchemaFixture(id, fixture), true);
  assert(Object.isFrozen(profile) && Object.isFrozen(profile.field_map.bathrooms_parts));
  assert.equal(profile.field_map.sale_price, 'saleprice'); assert.equal(profile.field_map.sale_date, 'saledate');
  assert.equal(profile.field_map.sale_qualification, 'validsale');
  for (const row of schemas.PROFILES) {
    assert.equal(row.enabled, false);
    for (const key of ['api_kind', 'service_url', 'layer', 'reader', 'disclosure_state', 'qualified_sale_codes']) assert.equal(row[key], null);
    assert(!registered.PROFILES.some(existing => existing.profile_id === row.profile_id), 'No operational registry promotion');
  }
  const market = { state: 'NC', county: 'Mecklenburg', enabled: true, disclosure_state: true };
  assert.equal(schemas.schemaProfilesForMarket(market)[0].enabled, false);
  assert.deepEqual(schemas.runtimeProfilesForMarket(market), []);
  assert.deepEqual(registered.compProfilesForMarket(market), []);
  assert.equal(schemas.profileForId('nc_wake_extract_schema_unsupported').schema_fields, null);
  assert.equal(schemas.validateSchemaFixture('nc_wake_extract_schema_unsupported', fixture), false);
  for (const patch of [{ synthetic: 'true' }, { synthetic: false }, { kind: 'validated_rows' }, { fields: new Array(fixture.fields.length) },
    { metadata_url: 'https://wrong.example.test/schema' }, { captured_date: '2026-02-30' }, { captured_date: '2026-11-17' }, { rows: [] }]) {
    assert.equal(schemas.validateSchemaFixture(id, { ...fixture, ...patch }), false);
  }
  const duplicate = JSON.parse(before); duplicate.fields[1] = duplicate.fields[0]; assert.equal(schemas.validateSchemaFixture(id, duplicate), false);
  const wrongField = JSON.parse(before); wrongField.fields[0] = { name: 'UNVERIFIED_COLUMN' }; assert.equal(schemas.validateSchemaFixture(id, wrongField), false);
  const inherited = { ...fixture }; delete inherited.synthetic; Object.setPrototypeOf(inherited, { synthetic: true }); assert.equal(schemas.validateSchemaFixture(id, inherited), false);
  const now = Date.now;
  try {
    Date.now = () => { throw Error('No hidden clock'); };
    assert(schemas.validateSchemaFixture(id, fixture));
    let requests = 0;
    const result = await engine.resolveCompsForRow({}, { now_iso: '2026-11-18T00:00:00Z', profiles: [profile], fetch_impl: () => { requests++; throw Error('No source fetch'); } });
    assert.equal(result.status, 'no_profile'); assert.equal(requests, 0); assert.deepEqual(result.verified_comps, []);
    // Numeric unit inputs only: no property identity, sale amounts or source rows.
    const context = { row: {}, today_iso: '2026-11-18' };
    const candidate = engine.compFromAttributes({ fullbath: 2, halfbath: 1 }, profile, '', context);
    assert.equal(candidate.bathrooms, 2.5);
    assert.deepEqual(candidate.bathrooms_derivation, { kind: 'derived', formula: 'full + half * 0.5', fields: ['fullbath', 'halfbath'] });
    assert.equal(candidate.comp_address, ''); assert.equal(candidate.sold_date, '');
    assert.equal(engine.evaluateStrictCompGrid(candidate, {}, { now_iso: '2026-11-18T00:00:00Z' }).accepted, false);
    for (const attrs of [{ fullbath: 2 }, { fullbath: true, halfbath: 1 }, { fullbath: Infinity, halfbath: 1 },
      { fullbath: -1, halfbath: 1 }, { fullbath: 1.5, halfbath: 1 }, Object.assign(Object.create({ fullbath: 2 }), { halfbath: 1 })]) {
      assert.equal(engine.compFromAttributes(attrs, profile, '', context).bathrooms, null);
    }
    const legacy = { field_map: { bathrooms: 'published_baths' } };
    assert.equal(engine.compFromAttributes({ published_baths: 2 }, legacy, '', context).bathrooms, 2, 'Existing direct map unchanged');
  } finally { Date.now = now; }
  assert.equal(JSON.stringify(fixture), before); assert.deepEqual(network.attempts, []);
  console.log('public record schema: official metadata/synthetic schema-only, OFF/no registry activation, unsupported unknowns, immutable/pure validation, existing comp normalizer/grid reuse and zero fetch PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => network.restore());
