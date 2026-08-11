'use strict';

const assert = require('assert');
const compResolution = require('../modules/research/disclosure-state-comp-resolution');

(async () => {
  const profile = {
    api_kind: 'arcgis',
    service_url: 'https://services.example.gov/arcgis/rest/services/sales/FeatureServer',
    layer: 0,
    disclosure_state: true,
    field_map: {
      situs_address: 'address',
      parcel_id: 'parcel_id',
      sale_price: 'amt_sale_price',
      sale_date: 'sale_date',
      land_use: 'property_class_description',
      zip: 'zip_code'
    }
  };
  const row = {
    normalized_address: '13905 Sussex St, Detroit, MI 48227',
    city: 'Detroit',
    county: 'Wayne',
    state: 'MI',
    source_row_reference: 'subject-1'
  };
  const features = [
    { address: '13905 Sussex St, Detroit, MI 48227', parcel_id: 'subject-1', amt_sale_price: 200000, sale_date: '2026-02-01', property_class_description: 'Residential', zip_code: '48227' },
    { address: '14001 Sussex St, Detroit, MI 48227', parcel_id: 'c1', amt_sale_price: 210000, sale_date: '2026-01-15', property_class_description: 'Residential', zip_code: '48227' },
    { address: '14011 Sussex St, Detroit, MI 48227', parcel_id: 'c2', amt_sale_price: 220000, sale_date: '2026-03-15', property_class_description: 'Residential', zip_code: '48227' },
    { address: '14021 Sussex St, Detroit, MI 48227', parcel_id: 'c3', amt_sale_price: 230000, sale_date: '2026-04-15', property_class_description: 'Residential', zip_code: '48227' },
    { address: '14031 Sussex St, Detroit, MI 48227', parcel_id: 'gift', amt_sale_price: 1, sale_date: '2026-05-01', property_class_description: 'Quitclaim', zip_code: '48227' }
  ];
  const ready = await compResolution.resolveCompsForRow(row, {
    profiles: [profile],
    mock_comp_features: features
  });
  assert.strictEqual(ready.status, 'COMP_READY');
  assert.strictEqual(ready.verified_comps.length, 3);
  assert.ok(ready.verified_comps.every((comp) => comp.source_kind === 'official_public_record'));
  assert.ok(ready.verified_comps.every((comp) => Number(comp.sold_price) > 1));
  assert.ok(!ready.verified_comps.some((comp) => comp.parcel_id === 'subject-1'));

  const partial = await compResolution.resolveCompsForRow(row, {
    profiles: [profile],
    mock_comp_features: features.slice(0, 3)
  });
  assert.strictEqual(partial.status, 'COMP_PARTIAL');
  assert.strictEqual(partial.verified_comps.length, 2);

  const run = await compResolution.runDisclosureStateCompResolution({
    rows: [row],
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' }
  }, {
    profiles: [profile],
    mock_comp_features: features
  });
  const result = run.results.get(row.normalized_address.toLowerCase());
  assert.strictEqual(result.free_comp_status, 'COMP_READY');
  assert.strictEqual(run.attempt_records[0].lane, 'sold_comp');
  assert.strictEqual(run.attempt_records[0].outcome, 'FOUND');

  console.log('disclosure state comp resolution tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
