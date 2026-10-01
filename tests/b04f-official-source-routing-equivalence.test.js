'use strict';

const assert = require('assert');
const profiles = require('../modules/sources/county-source-profile-registry');
const catalog = require('../modules/sources/source-catalog');
const adapters = require('../modules/sources/source-adapter-registry');
const queue = require('../modules/research/deal-board-queue-service');
const { RULES } = require('../modules/research/state-rules');

assert.strictEqual(RULES.TX.post_sale.mortgage_trustee.redemption, 'none');
assert.strictEqual(RULES.TX.post_sale.mortgage_trustee.verification_status, 'verified');
assert.ok(RULES.TX.post_sale.mortgage_trustee.citation.includes('texasbar.com'));
for (const state of ['TX', 'NC', 'MI']) assert.ok(RULES[state].foreclosure.citation.startsWith('https://'));

const cases = [
  { county: 'San Diego', state: 'CA', kind: 'tax_sale',
    legacy: require('../modules/sources/ca-san-diego-tax-default-source-profiles').PROFILES,
    listed: catalog.CA_SAN_DIEGO_TAX_DEFAULT_SOURCES,
    queued: queue.defaultQueueSourceIdsForMarket({ county: 'San Diego', city: 'San Diego', state: 'CA' }),
    run: require('../modules/sources/ca-tax-default-notice-acquisition-adapter').runCaTaxDefaultNoticeAcquisitionAdapter },
  { county: 'Los Angeles', state: 'CA', kind: 'tax_sale',
    legacy: require('../modules/sources/ca-los-angeles-tax-default-source-profiles').PROFILES,
    listed: catalog.LOS_ANGELES_TAX_DEFAULT_SOURCES, queued: queue.CA_LOS_ANGELES_SOURCE_IDS,
    run: require('../modules/sources/ca-los-angeles-tax-default-acquisition-adapter').runCaLosAngelesTaxDefaultAcquisitionAdapter },
  { county: 'Wayne', state: 'MI', kind: 'public_inventory',
    legacy: require('../modules/sources/mi-detroit-land-bank-source-profiles').PROFILES,
    listed: catalog.DETROIT_LAND_BANK_SOURCES, queued: queue.MI_DETROIT_SOURCE_IDS,
    run: require('../modules/sources/mi-land-bank-acquisition-adapter').runMiLandBankAcquisitionAdapter }
];

for (const item of cases) {
  const registered = profiles.profilesForCountyKind(item.county, item.state, item.kind);
  assert.deepStrictEqual(registered.map((profile) => profile.source_id), item.legacy.map((profile) => profile.source_id));
  assert.deepStrictEqual(item.queued, item.legacy.map((profile) => profile.source_id));
  assert.deepStrictEqual(item.listed.map((source) => source.source_id), item.queued);
  for (const [index, old] of item.legacy.entries()) {
    const current = registered[index];
    const listed = item.listed[index];
    assert.strictEqual(current.source_name, old.source_name);
    assert.strictEqual(current.source_family, old.source_family);
    assert.strictEqual(current.source_url, old.source_url);
    assert.strictEqual(listed.source_url, old.source_url);
    assert.strictEqual(listed.source_name, old.source_name);
    assert.strictEqual(listed.preview_only, true);
    assert.strictEqual(listed.should_ingest, false);
    assert.strictEqual(adapters.adapterForSourceId(old.source_id).run, item.run);
    if (item.kind === 'tax_sale') {
      assert.strictEqual(current.document_url, old.document_url);
      assert.strictEqual(listed.source_document_url, old.document_url);
      assert.strictEqual(current.evidence_stage, 'notice_only');
    } else {
      assert.strictEqual(current.evidence_stage, 'listing_only');
      assert.strictEqual(current.parser_options.api_url, old.api_url);
    }
  }
}
assert.deepStrictEqual(profiles.profilesForCountyKind('Wayne', 'CA', 'public_inventory'), []);
assert.deepStrictEqual(profiles.profilesForCountyKind('San Diego', 'MI', 'tax_sale'), []);
console.log('B-04f official-source routing equivalence passed');
