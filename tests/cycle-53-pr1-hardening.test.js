'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const provenance = require('../modules/research/field-provenance');
const policy = require('../modules/research/market-comp-policy');
const parcel = require('../modules/sources/county-parcel-service');
const appraisalEvidence = require('../modules/research/county-appraisal-evidence-service');
const queueService = require('../modules/research/deal-board-queue-service');
const packetService = require('../modules/research/manual-evidence-packet-service');
const { normalizeSourceDate } = require('../modules/research/normalize-source-date');

const ROOT = path.resolve(__dirname, '..');
const secret = crypto.randomBytes(20).toString('hex');
const env = { WOS_PAID_COMP_PROVIDER_TX: 'fixture-provider', WOS_PAID_COMP_KEY_TX: secret,
  WOS_PAID_COMP_ENABLE_TX: 'true' };
const adapters = Object.freeze({ 'fixture-provider': true });
const subject = { normalized_address: '100 Main St, Dallas, TX 75201', state: 'TX' };
const paidComp = {
  comp_address: '110 Main St, Dallas, TX 75201', comp_state: 'TX', subject_state: 'TX',
  sold_price: 220000, sold_date: '2026-04-01', source_kind: 'paid_api',
  source_url: 'https://records.example.test/sale/1', evidence_text: 'Recorded closed sale',
  provider_name: 'fixture-provider', price_basis: 'mls_closed_sale'
};

assert(Object.isFrozen(policy.PAID_COMP_ADAPTERS));
assert.deepStrictEqual(Object.keys(policy.PAID_COMP_ADAPTERS), []);
assert.strictEqual(policy.compPolicyForMarket({ state: 'TX' }, { env }).paid_comp_enabled, false);
assert.strictEqual(provenance.compHasProvenance(paidComp, { subject, env }), false,
  'Q1: even all three TX environment values cannot activate the empty registry');
assert.strictEqual(provenance.compHasProvenance(paidComp), false);
const trusted = { subject, env, paid_comp_adapters: adapters };
assert.strictEqual(provenance.compHasProvenance(paidComp, trusted), true, 'Q2: test-only adapter with trusted TX subject');
assert.strictEqual(provenance.compHasProvenance(paidComp, { env, paid_comp_adapters: adapters }), false,
  'Q2: paid comps need a caller-supplied subject');
assert.strictEqual(provenance.compHasProvenance(paidComp, { subject: { state: 'NC' }, env,
  paid_comp_adapters: adapters }), false, 'Q2: comp and subject states differ');
assert.strictEqual(provenance.compHasProvenance({ ...paidComp, comp_state: 'NC' }, trusted), false,
  'Q2: declared comp state conflicts with its address');
assert.strictEqual(provenance.compHasProvenance({ ...paidComp, comp_address: '110 Main St, Charlotte, NC 28202',
  comp_state: 'NC' }, trusted), false, 'Q2: comp location differs from the subject');
for (const price_basis of ['estimated', 'avm', '']) {
  assert.strictEqual(provenance.compHasProvenance({ ...paidComp, price_basis }, trusted), false,
    `Q2: ${price_basis || 'missing'} is not a recorded sale`);
}
assert.strictEqual(provenance.compHasProvenance({ ...paidComp, source_kind: 'official_public_record' }), true,
  'Q2: unpaid comp behavior is unchanged');
const safePolicy = policy.compPolicyForMarket({ state: 'TX' }, { env, paid_comp_adapters: adapters });
assert.strictEqual(safePolicy.paid_comp_key_present, true);
assert(!JSON.stringify(safePolicy).includes(secret), 'Q3: key cannot enter a returned policy');
assert(!JSON.stringify(provenance.compHasProvenance(paidComp, trusted)).includes(secret),
  'Q3: key cannot enter a provenance result');

const profile = {
  county: 'Fixture', state: 'NC', state_code_property_types: {},
  arcgis_parcel_service: {
    host: 'services2.arcgis.com',
    service_path: '/FixtureOrg/arcgis/rest/services/Parcels/FeatureServer',
    layer_id: 0, out_sr: 4326, id_fields: { parcel_id: 'pin' },
    address_fields: { situs_number: 'number', situs_street: 'street', situs_suffix: 'suffix',
      situs_city: 'city', situs_state: 'state', situs_zip: 'zip' },
    field_map: { living_area: 'heatedarea', bedrooms: 'bedrooms', bathrooms: 'fullbaths',
      sale_date: 'dateofsale', sale_price: 'price' }
  }
};
const queryUrl = 'https://services2.arcgis.com/FixtureOrg/arcgis/rest/services/Parcels/FeatureServer/0/query';
const attributes = { pin: 'fixture-123', number: '101', street: 'MAIN', suffix: 'ST',
  city: 'CHARLOTTE', state: 'NC', zip: '28202', heatedarea: 1500,
  bedrooms: 3, fullbaths: 2, price: 200000, dateofsale: '10/06/2026' };
const recordFor = (dateofsale) => parcel.recordFromFeature({ attributes: { ...attributes, dateofsale } },
  profile, queryUrl);
const rawRecord = recordFor('10/06/2026');
const inputRow = { normalized_address: '101 Main St, Charlotte, NC 28202',
  county: 'Fixture', state: 'NC', preview_only: true, not_a_saved_lead: true };
const enriched = appraisalEvidence.enrich(inputRow, rawRecord, '2026-09-28T00:00:00Z');
assert.strictEqual(enriched.bedrooms, 3, 'Q4: mapped bedroom count reaches the row');
assert.strictEqual(enriched.bathrooms, 2, 'Q4: mapped bathroom count reaches the row');
assert.strictEqual(enriched.county_appraisal_field_provenance.beds.source_kind, 'official_public_record');
assert.strictEqual(enriched.county_appraisal_field_provenance.baths.source_kind, 'official_public_record');
assert.strictEqual(rawRecord.last_recorded_sale_date, null, 'Q5: ambiguous parcel sale has no ISO date');
assert.strictEqual(rawRecord.last_recorded_sale_date_raw, '10/06/2026');
assert.strictEqual(recordFor(Date.UTC(2026, 9, 6)).last_recorded_sale_date, '2026-10-06');
assert.strictEqual(recordFor('2026-10-06').last_recorded_sale_date, '2026-10-06');
assert.strictEqual(rawRecord.last_recorded_sale_price, 200000);
for (const key of ['sale_date', 'sale_date_or_event_date', 'auction_date', 'event_date', 'sale_date_iso']) {
  assert.strictEqual(enriched[key], undefined, `Q5: parcel sale must not become lifecycle event ${key}`);
}

for (const value of ['October 6, 2026', 'Oct 6, 2026', 'October 06, 2026']) {
  assert.strictEqual(normalizeSourceDate(value).iso, '2026-10-06', `Q6: ${value}`);
}
for (const value of ['10/06/2026', '06/10/2026', '10-06-2026']) {
  assert.strictEqual(normalizeSourceDate(value).reason, 'ambiguous_numeric_order', `Q6: ${value}`);
}
const eventRow = {
  queue_key: 'cycle53|event',
  normalized_address: '100 Main St, Dallas, TX 75201', address_state: 'complete_source_address',
  source_structured_address_verified: true, source_document_url: 'https://county.example.test/notice/1',
  source_proof_text: 'Property address: 100 Main St, Dallas, TX 75201',
  source_family: 'tx_foreclosure_notice', county: 'Dallas', state: 'TX', city: 'Dallas',
  sale_date_or_event_date: '10/06/2026', sale_date_iso: '2026-10-06'
};
const quarantined = queueService.lifecycleStatusWithNormalizedDates(eventRow, '2026-09-28T00:00:00Z');
assert.strictEqual(quarantined.reason_code, 'NO_SOURCE_DATE_EVIDENCE',
  'Q6: an injected ISO cannot override ambiguous raw text');
assert.strictEqual(quarantined.quarantined, true);

const staleProjection = queueService.projectManualValueEvidence([{
  ...eventRow, original_loan_amount: '$300,000',
  original_loan_amount_evidence_text: 'Original loan amount in official notice: $300,000',
  equity_estimate: { status: 'CLUE', estimated_debt: 300000, equity_estimate: 200000,
    room_to_offer: 'LIKELY' }, room_to_offer: 'LIKELY'
}], { city: 'Dallas', county: 'Dallas', state: 'TX' }, { packet_store: { version: 1, markets: {} } })[0];
assert.strictEqual(staleProjection.equity_estimate.status, 'UNKNOWN', 'Q7: stale equity is overwritten');
assert.strictEqual(staleProjection.equity_estimate.estimated_debt, null);
assert.strictEqual(staleProjection.equity_estimate.equity_estimate, null);
assert.strictEqual(staleProjection.room_to_offer, 'UNKNOWN', 'Q7: stale room-to-offer is overwritten');
const sample = packetService.latestManualEvidenceSnapshot({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
  rows: [{ ...eventRow, equity_estimate: { status: 'CLUE', equity_estimate: 200000 },
    room_to_offer: 'LIKELY' }], packet_store: { version: 1, markets: {} } });
assert.strictEqual(sample.items.length, 1, 'Q7: saved row is included in the sample');
assert(sample.items.every((item) => item.room_to_offer === 'UNKNOWN' &&
  item.equity_estimate.equity_estimate === null), 'Q7: standalone sample cannot leak saved equity');
const uiSource = fs.readFileSync(path.join(ROOT, 'dashboard/wos-public-deals.js'), 'utf8');
const uiContext = { window: {}, document: { readyState: 'loading', addEventListener() {} },
  MutationObserver: function () {}, setInterval() {}, setTimeout() {},
  fetch() { throw new Error('network_forbidden'); } };
vm.runInNewContext(uiSource, uiContext);
const rendered = uiContext.window.__wosPublicDealsTestHooks.leverageDossierHtml(staleProjection);
assert(rendered.includes('Original loan amount - not the current payoff.'), 'Q7: loan clue is labeled');
assert(rendered.includes('UNKNOWN') && !rendered.includes('$200,000'), 'Q7: stale equity cannot render');

const gridHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,
  'modules/research/strict-comp-grid-config.js'))).digest('hex');
assert.strictEqual(gridHash, 'b27912bf48aab12117898a19ff70d2c814b802e86e75ef27aecd2a3f36f9358e',
  'Q8: strict comp grid must be byte-identical to main');

console.log('cycle-53 PR1 hardening: Q1-Q8 PASS');
