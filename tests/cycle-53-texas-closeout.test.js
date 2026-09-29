'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const provenance = require('../modules/research/field-provenance');
const policy = require('../modules/research/market-comp-policy');
const parcel = require('../modules/sources/county-parcel-service');
const { normalizeSourceDate } = require('../modules/research/normalize-source-date');
const comps = require('../modules/research/disclosure-state-comp-resolution');
const explainer = require('../modules/research/deal-fit-explainer');
const dossierModule = require('../modules/research/property-leverage-dossier');

const ROOT = path.resolve(__dirname, '..');
const subject = {
  normalized_address: '100 Main St, Detroit, MI 48201', state: 'MI', property_kind: 'single family',
  sqft: 1500, beds: 3, baths: 2, year_built: 1995, lot_size: 6000,
  latitude: 42.391, longitude: -83.281
};
const paidComp = {
  comp_address: '110 Main St, Detroit, MI 48201', sold_status: 'sold', sold_price: 220000,
  sold_date: '2026-02-01', source_kind: 'paid_api', source_url: 'https://records.example.test/110-main',
  evidence_text: 'Recorded closed sale', similarity_basis: 'same property class',
  property_kind: 'single family', sqft: 1500, beds: 3, baths: 2, year_built: 1998,
  lot_size: 6200, latitude: 42.392, longitude: -83.280,
  subject_state: 'MI', provider_name: 'fixture-provider', price_basis: 'recorded_sale'
};

const providerVar = 'WOS_PAID_COMP_PROVIDER_MI';
const keyVar = 'WOS_PAID_COMP_KEY_MI';
const enableVar = 'WOS_PAID_COMP_ENABLE_MI';
const oldProvider = process.env[providerVar];
const oldKey = process.env[keyVar];
const oldEnable = process.env[enableVar];
try {
  delete process.env[providerVar];
  delete process.env[keyVar];
  delete process.env[enableVar];
  for (const basis of ['estimated', 'avm', '']) {
    assert.strictEqual(provenance.compHasProvenance(Object.assign({}, paidComp, { price_basis: basis })), false);
  }
  assert.strictEqual(provenance.compHasProvenance(paidComp), false);
  assert.strictEqual(comps.evaluateStrictCompGrid(paidComp, subject, { today_iso: '2026-08-25' }).accepted, false);
  process.env[providerVar] = 'fixture-provider';
  assert.strictEqual(provenance.compHasProvenance(paidComp), false, 'provider alone cannot authorize a paid comp');
  process.env[keyVar] = crypto.randomBytes(16).toString('hex');
  assert.strictEqual(provenance.compHasProvenance(paidComp), false, 'the explicit switch is required');
  process.env[enableVar] = 'true';
  for (const basis of ['estimated', 'avm', '']) {
    assert.strictEqual(provenance.compHasProvenance(Object.assign({}, paidComp, { price_basis: basis })), false);
  }
  assert.strictEqual(provenance.compHasProvenance(paidComp, { subject }), false,
    'an environment switch cannot activate an unregistered provider');
  const testOptions = { subject, paid_comp_adapters: { 'fixture-provider': true } };
  assert.strictEqual(provenance.compHasProvenance(paidComp, testOptions), true);
  assert.strictEqual(comps.evaluateStrictCompGrid(paidComp, subject, { today_iso: '2026-08-25' }).accepted, false,
    'the existing grid caller supplies no trusted subject and keeps paid comps rejected');
  const sourcedComp = Object.assign({}, paidComp, { source_kind: 'official_public_record' });
  assert.strictEqual(comps.evaluateStrictCompGrid(sourcedComp, subject, { today_iso: '2026-08-25' }).accepted, true);
  assert.strictEqual(comps.evaluateStrictCompGrid(Object.assign({}, sourcedComp, { latitude: 43 }), subject,
    { today_iso: '2026-08-25' }).accepted, false);
  const safePolicy = policy.compPolicyForMarket({ state: 'MI', county: 'Wayne', city: 'Detroit' });
  assert.strictEqual(safePolicy.paid_provider_name, 'fixture-provider');
  assert.strictEqual(safePolicy.paid_comp_key_present, true);
  assert.strictEqual(safePolicy.paid_comp_enabled, false);
  assert.strictEqual(policy.compPolicyForMarket({ state: 'MI' }, testOptions).paid_comp_enabled, true);
  assert(!JSON.stringify(safePolicy).includes(process.env[keyVar]));
} finally {
  if (oldProvider === undefined) delete process.env[providerVar]; else process.env[providerVar] = oldProvider;
  if (oldKey === undefined) delete process.env[keyVar]; else process.env[keyVar] = oldKey;
  if (oldEnable === undefined) delete process.env[enableVar]; else process.env[enableVar] = oldEnable;
}

assert.strictEqual(policy.compPolicyForMarket({ state: 'TX' }).comp_lane_enabled, false);
assert.strictEqual(policy.compPolicyForMarket({ state: 'NC' }).comp_lane_source, 'comp_lane_pending_source');
assert.strictEqual(policy.compPolicyForMarket({ state: 'MI', city: 'Detroit', county: 'Wayne' }).comp_lane_enabled, true);
assert.strictEqual(policy.compPolicyForMarket({ state: 'AL' }).comp_lane_source, 'comp_lane_pending_source');

const onlineProfile = {
  county: 'Mecklenburg', state: 'NC', state_code_property_types: {},
  arcgis_parcel_service: {
    host: 'services2.arcgis.com',
    service_path: '/ExampleOrg/arcgis/rest/services/PublicParcels/FeatureServer',
    layer_id: 0, out_sr: 4326, id_fields: { parcel_id: 'pin' },
    address_fields: { situs_number: 'number', situs_street: 'street', situs_suffix: 'suffix',
      situs_city: 'city', situs_state: 'state', situs_zip: 'zip' },
    field_map: { living_area: 'heatedarea', bedrooms: 'bedrooms', bathrooms: 'fullbaths',
      sale_price: 'price', sale_date: 'dateofsale' }
  }
};
assert.match(parcel.layerUrl(onlineProfile), /FeatureServer\/0\/query$/);
assert.throws(() => parcel.layerUrl(Object.assign({}, onlineProfile, { arcgis_parcel_service:
  Object.assign({}, onlineProfile.arcgis_parcel_service, { host: 'bad.example.com/path' }) })), /county_parcel_profile_invalid/);
assert.throws(() => parcel.layerUrl(Object.assign({}, onlineProfile, { arcgis_parcel_service:
  Object.assign({}, onlineProfile.arcgis_parcel_service, { service_path: '/not-allowlisted/FeatureServer' }) })), /county_parcel_profile_invalid/);
const mapped = parcel.recordFromFeature({ attributes: {
  pin: '123', number: '101', street: 'MAIN', suffix: 'ST', city: 'CHARLOTTE', state: 'NC', zip: '28202',
  heatedarea: 1500, bedrooms: 3, fullbaths: 2, price: 200000, dateofsale: '2026-04-01'
} }, onlineProfile, 'https://services2.arcgis.com/ExampleOrg/arcgis/rest/services/PublicParcels/FeatureServer/0/query');
assert.strictEqual(mapped.living_area, 1500);
assert.strictEqual(mapped.beds, 3);
assert.strictEqual(mapped.baths, 2);
assert.strictEqual(mapped.last_recorded_sale_price, 200000);
assert.strictEqual(mapped.last_recorded_sale_date, '2026-04-01');

assert.strictEqual(normalizeSourceDate('October 6, 2026').iso, '2026-10-06');
assert.strictEqual(normalizeSourceDate('10/06/2026').reason, 'ambiguous_numeric_order');
assert.strictEqual(normalizeSourceDate('February 30, 2026').iso, '');
assert.strictEqual(normalizeSourceDate('garbage').iso, '');

function saleEvidence(date) {
  return { status: 'VERIFIED', value: date, provenance: {
    source_url: 'https://county.example.test/sale/1', evidence_text: `Recorded sale ${date}`
  } };
}
const recent = {
  normalized_address: '100 Main St, Dallas, TX 75201', state: 'TX', foreclosure_type: 'pre-foreclosure',
  source_document_url: 'https://county.example.test/notice/1', property_story: {
    last_sale_seller_kind: 'builder', source_url: 'https://county.example.test/sale/1',
    evidence_text: 'Builder seller on recorded sale'
  }, leverage_dossier: { ownership: { prior_sale_date: saleEvidence('2024-09-01') } },
  lifecycle_status: { status: 'FRESH', quarantined: false }, sale_date_iso: '2026-10-06',
  confirmed_strict_comp_count: 0
};
const recentFits = explainer.dealFits(recent, { today_iso: '2026-09-26' });
assert.strictEqual(explainer.explainRow(recent, { today_iso: '2026-09-26' }).priority.band, 'WORK_NOW');
assert.strictEqual(explainer.explainRow(Object.assign({}, recent, { lifecycle_status: null }),
  { today_iso: '2026-09-26' }).priority.band, 'WORTH_A_LOOK',
  'a date without a fresh lifecycle result cannot claim urgent priority');
const verdict = (fits, name) => fits.find((entry) => entry.path === name).verdict;
assert.strictEqual(verdict(recentFits, 'Cash wholesale'), 'UNLIKELY');
assert.match(recentFits[0].why, /builder/);
assert.strictEqual(verdict(recentFits, 'Subject-to'), 'LIKELY');
assert.strictEqual(verdict(recentFits, 'Short sale'), 'POSSIBLE');
const held = Object.assign({}, recent, {
  foreclosure_type: '', source_family: '', property_story: {},
  leverage_dossier: { ownership: { prior_sale_date: saleEvidence('2008-09-01') } },
  owner_record: { source_kind: 'official_public_record' },
  mailing_route: { source_kind: 'official_public_record', value: '500 Elm St, Dallas, TX 75201' }
});
const heldFits = explainer.dealFits(held, { today_iso: '2026-09-26' });
assert.strictEqual(verdict(heldFits, 'Cash wholesale'), 'LIKELY');
assert.strictEqual(verdict(heldFits, 'Seller financing'), 'POSSIBLE');
assert.match(heldFits.find((entry) => entry.path === 'Seller financing').seller_question, /free and clear/);
const rentalComp = Object.assign({}, paidComp, { source_kind: 'official_public_record',
  sold_price: 120000, comp_grid: { accepted: true } });
const repeatedCompFits = explainer.dealFits(Object.assign({}, held, {
  verified_comps: [rentalComp, rentalComp, rentalComp]
}));
assert.strictEqual(verdict(repeatedCompFits, 'Rental / Section 8'), 'UNKNOWN',
  'one sold property repeated three times cannot establish a three-comp value');
const distinctCompFits = explainer.dealFits(Object.assign({}, held, {
  verified_comps: [rentalComp,
    Object.assign({}, rentalComp, { comp_address: '120 Main St, Detroit, MI 48201' }),
    Object.assign({}, rentalComp, { comp_address: '130 Main St, Detroit, MI 48201' })]
}));
assert.strictEqual(verdict(distinctCompFits, 'Rental / Section 8'), 'POSSIBLE');
assert(recentFits.filter((entry) => /equity|loan|debt/i.test(entry.path + entry.why))
  .every((entry) => entry.why.endsWith('Loan balance unknown - ask the owner.')));
assert(!JSON.stringify(explainer.explainRow(recent)).match(/payoff\s*:\s*\d|loan_balance\s*:\s*\d/i));
const loanClueOnly = dossierModule.equityEstimate({ debt: { original_loan_amount: {
  status: 'VERIFIED', value: 300000, provenance: { source_url: 'https://county.example.test/deed/1',
    evidence_text: 'Original principal 300000' }
} }, valuation: { verified_arv: { status: 'VERIFIED', value: 500000,
  provenance: { source_url: 'https://county.example.test/comps/1', evidence_text: 'Verified value 500000' } } } });
assert.strictEqual(loanClueOnly.estimated_debt, null);
assert.strictEqual(loanClueOnly.equity_estimate, null);
assert.strictEqual(loanClueOnly.room_to_offer, 'UNKNOWN');
assert(!explainer.explainRow(recent, { today_iso: '2026-09-26' }).priority.why.includes('_'));

const originalFetch = global.fetch;
const originalWrite = fs.writeFileSync;
global.fetch = () => { throw new Error('network forbidden'); };
fs.writeFileSync = () => { throw new Error('write forbidden'); };
try { assert.strictEqual(explainer.explainRow(held).fits.length >= 5, true); }
finally { global.fetch = originalFetch; fs.writeFileSync = originalWrite; }

const gridHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,
  'modules/research/strict-comp-grid-config.js'))).digest('hex');
assert.strictEqual(gridHash, 'b27912bf48aab12117898a19ff70d2c814b802e86e75ef27aecd2a3f36f9358e');

console.log('cycle-53 texas closeout: P1-P6 and P8-P13 PASS; P7 waived, numeric dates remain quarantined');
