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
      property_kind: 'property_kind',
      living_area: 'sqft',
      bedrooms: 'beds',
      bathrooms: 'baths',
      year_built: 'year_built',
      lot_size: 'lot_size',
      latitude: 'latitude',
      longitude: 'longitude',
      zip: 'zip_code'
    }
  };
  const row = {
    normalized_address: '13905 Sussex St, Detroit, MI 48227',
    city: 'Detroit',
    county: 'Wayne',
    state: 'MI',
    source_row_reference: 'subject-1',
    land_use: 'Residential',
    property_kind: 'single family',
    sqft: 1500,
    beds: 3,
    baths: 2,
    year_built: 1995,
    lot_size: 6000,
    latitude: 42.391,
    longitude: -83.281
  };
  function gridAttrs(attributes, index) {
    return Object.assign({
      property_kind: 'single family', sqft: 1500, beds: 3, baths: 2,
      year_built: 1998, lot_size: 6200,
      latitude: 42.391 + Number(index || 0) * 0.001,
      longitude: -83.281 + Number(index || 0) * 0.001
    }, attributes);
  }
  const features = [
    gridAttrs({ address: '13905 Sussex St, Detroit, MI 48227', parcel_id: 'subject-1', amt_sale_price: 200000, sale_date: '2026-02-01', property_class_description: 'Residential', zip_code: '48227' }, 0),
    gridAttrs({ address: '14001 Sussex St, Detroit, MI 48227', parcel_id: 'c1', amt_sale_price: 210000, sale_date: '2026-01-15', property_class_description: 'Residential', zip_code: '48227' }, 1),
    gridAttrs({ address: '14011 Sussex St, Detroit, MI 48227', parcel_id: 'c2', amt_sale_price: 220000, sale_date: '2026-03-15', property_class_description: 'Residential', zip_code: '48227' }, 2),
    gridAttrs({ address: '14021 Sussex St, Detroit, MI 48227', parcel_id: 'c3', amt_sale_price: 230000, sale_date: '2026-04-15', property_class_description: 'Residential', zip_code: '48227' }, 3),
    gridAttrs({ address: '14031 Sussex St, Detroit, MI 48227', parcel_id: 'gift', amt_sale_price: 1, sale_date: '2026-05-01', property_class_description: 'Quitclaim', zip_code: '48227' }, 4)
  ];
  const ready = await compResolution.resolveCompsForRow(row, {
    profiles: [profile],
    mock_comp_features: features,
    now_iso: '2026-08-11T00:00:00Z'
  });
  assert.strictEqual(ready.status, 'COMP_READY');
  assert.strictEqual(ready.verified_comps.length, 3);
  assert.ok(ready.verified_comps.every((comp) => comp.source_kind === 'official_public_record'));
  assert.ok(ready.verified_comps.every((comp) => Number(comp.sold_price) >= 5000));
  assert.ok(ready.verified_comps.every((comp) => /Comp window: 2025-08-11 to 2026-08-11/.test(comp.evidence_text)));
  assert.ok(ready.verified_comps.every((comp) => /Similarity: land_use:residential/.test(comp.evidence_text)));
  assert.ok(!ready.verified_comps.some((comp) => comp.parcel_id === 'subject-1'));
  assert.ok(ready.verified_comps.every((comp) => comp.comp_identity_kind === 'street_address'), 'Detroit address-bearing comps must keep street-address identity');

  const partial = await compResolution.resolveCompsForRow(row, {
    profiles: [profile],
    mock_comp_features: features.slice(0, 3),
    now_iso: '2026-08-11T00:00:00Z'
  });
  assert.strictEqual(partial.status, 'COMP_PARTIAL');
  assert.strictEqual(partial.verified_comps.length, 2);

  const run = await compResolution.runDisclosureStateCompResolution({
    rows: [row],
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' }
  }, {
    profiles: [profile],
    mock_comp_features: features,
    now_iso: '2026-08-11T00:00:00Z'
  });
  const result = run.results.get(row.normalized_address.toLowerCase());
  assert.strictEqual(result.free_comp_status, 'COMP_READY');
  assert.strictEqual(run.attempt_records[0].lane, 'sold_comp');
  assert.strictEqual(run.attempt_records[0].outcome, 'FOUND');

  const staleOldAndNominal = await compResolution.resolveCompsForRow(row, {
    profiles: [profile],
    now_iso: '2026-08-11T00:00:00Z',
    mock_comp_features: [
      { address: '14101 Sussex St, Detroit, MI 48227', parcel_id: 'old1', amt_sale_price: 6500, sale_date: '2011-04-12', property_class_description: 'Residential', zip_code: '48227' },
      { address: '14111 Sussex St, Detroit, MI 48227', parcel_id: 'old2', amt_sale_price: 4200, sale_date: '2012-09-03', property_class_description: 'Residential', zip_code: '48227' },
      { address: '14121 Sussex St, Detroit, MI 48227', parcel_id: 'old3', amt_sale_price: 8000, sale_date: '2013-02-20', property_class_description: 'Residential', zip_code: '48227' },
      { address: '14131 Sussex St, Detroit, MI 48227', parcel_id: 'stale14', amt_sale_price: 215000, sale_date: '2025-06-11', property_class_description: 'Residential', zip_code: '48227' },
      { address: '14141 Sussex St, Detroit, MI 48227', parcel_id: 'nominal', amt_sale_price: 250, sale_date: '2026-01-20', property_class_description: 'Residential', zip_code: '48227' }
    ]
  });
  assert.strictEqual(staleOldAndNominal.status, 'COMP_SEARCH_EXHAUSTED_FREE');
  assert.strictEqual(staleOldAndNominal.verified_comps.length, 0);
  assert.ok(staleOldAndNominal.rejected_comp_candidates.some((comp) => comp.parcel_id === 'old1' && comp.rejected_reason === 'sale_outside_comp_window'));
  assert.ok(staleOldAndNominal.rejected_comp_candidates.some((comp) => comp.parcel_id === 'stale14' && comp.rejected_reason === 'stale_comp'));
  assert.ok(staleOldAndNominal.rejected_comp_candidates.some((comp) => comp.parcel_id === 'nominal' && comp.rejected_reason === 'nominal_or_non_market_sale_price'));

  const sameZipOnly = await compResolution.resolveCompsForRow({
    normalized_address: '13905 Sussex St, Detroit, MI 48227',
    city: 'Detroit',
    county: 'Wayne',
    state: 'MI'
  }, {
    profiles: [profile],
    now_iso: '2026-08-11T00:00:00Z',
    mock_comp_features: [
      { address: '14201 Sussex St, Detroit, MI 48227', parcel_id: 'z1', amt_sale_price: 210000, sale_date: '2026-01-15', property_class_description: 'Residential', zip_code: '48227' },
      { address: '14211 Sussex St, Detroit, MI 48227', parcel_id: 'z2', amt_sale_price: 220000, sale_date: '2026-02-15', property_class_description: 'Residential', zip_code: '48227' },
      { address: '14221 Sussex St, Detroit, MI 48227', parcel_id: 'z3', amt_sale_price: 230000, sale_date: '2026-03-15', property_class_description: 'Residential', zip_code: '48227' }
    ]
  });
  assert.strictEqual(sameZipOnly.status, 'COMP_SEARCH_EXHAUSTED_FREE');
  assert.strictEqual(sameZipOnly.verified_comps.length, 0);
  assert.ok(sameZipOnly.rejected_comp_candidates.every((comp) => comp.rejected_reason === 'missing_similarity_basis'));

  const arcgisError = await compResolution.resolveCompsForRow(row, {
    profiles: [profile],
    fetch_impl: async () => ({
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ error: { code: 400, message: 'Invalid field' } }); }
    })
  });
  assert.strictEqual(arcgisError.status, 'failed');
  assert.match(arcgisError.blocked_reason, /^arcgis_error_400: Invalid field/);
  const arcgisRun = await compResolution.runDisclosureStateCompResolution({
    rows: [row],
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' }
  }, {
    profiles: [profile],
    fetch_impl: async () => ({
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ error: { code: 400, message: 'Invalid field' } }); }
    })
  });
  assert.strictEqual(arcgisRun.attempt_records[0].outcome, 'FAILED');
  assert.match(arcgisRun.attempt_records[0].reason_code, /^ARCGIS_ERROR_400/);

  const socrataProfile = {
    api_kind: 'socrata',
    service_url: 'https://datacatalog.example.gov/resource/sales.json',
    disclosure_state: true,
    field_map: {
      situs_address: '',
      parcel_id: 'pin',
      sale_price: 'sale_price',
      sale_date: 'sale_date',
      land_use: 'class',
      property_kind: 'property_kind',
      living_area: 'sqft',
      bedrooms: 'beds',
      bathrooms: 'baths',
      year_built: 'year_built',
      lot_size: 'lot_size',
      latitude: 'latitude',
      longitude: 'longitude'
    }
  };
  let socrataUrl = '';
  const socrata = await compResolution.resolveCompsForRow({
    normalized_address: '500 Example Ave, Chicago, IL 60601',
    city: 'Chicago',
    county: 'Cook',
    state: 'IL',
    parcel_id: '14-01-100-001-0000',
    land_use: 'Residential', property_kind: 'single family', sqft: 1500, beds: 3, baths: 2,
    year_built: 1995, lot_size: 6000, latitude: 41.884, longitude: -87.632
  }, {
    profiles: [socrataProfile],
    now_iso: '2026-08-11T00:00:00Z',
    fetch_impl: async (url) => {
      socrataUrl = url;
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify([
            { pin: '14-01-100-001-0000', sale_price: '400000', sale_date: '2026-01-10', class: 'Residential', property_kind: 'single family', sqft: 1500, beds: 3, baths: 2, year_built: 1998, lot_size: 6200, latitude: 41.884, longitude: -87.632 },
            { pin: '14-01-100-002-0000', sale_price: '210000', sale_date: '2026-02-15', class: 'Residential', property_kind: 'single family', sqft: 1450, beds: 3, baths: 2, year_built: 1998, lot_size: 6200, latitude: 41.885, longitude: -87.632 },
            { pin: '14-01-100-003-0000', sale_price: '220000', sale_date: '2026-03-15', class: 'Residential', property_kind: 'single family', sqft: 1550, beds: 4, baths: 2, year_built: 1992, lot_size: 5900, latitude: 41.886, longitude: -87.633 },
            { pin: '14-01-100-004-0000', sale_price: '230000', sale_date: '2026-04-15', class: 'Residential', property_kind: 'single family', sqft: 1600, beds: 3, baths: 3, year_built: 2000, lot_size: 6500, latitude: 41.887, longitude: -87.634 }
          ]);
        }
      };
    }
  });
  assert.strictEqual(socrata.status, 'COMP_READY');
  assert.strictEqual(socrata.verified_comps.length, 3);
  assert.ok(!socrata.verified_comps.some((comp) => comp.parcel_id === '14-01-100-001-0000'), 'subject PIN must never become its own comp');
  assert.ok(socrata.rejected_comp_candidates.some((comp) => comp.parcel_id === '14-01-100-001-0000' && comp.rejected_reason === 'subject_parcel_not_a_comp'));
  assert.ok(socrata.verified_comps.every((comp) => comp.comp_identity_kind === 'parcel_id_only'));
  assert.ok(socrataUrl.includes('datacatalog.example.gov/resource/sales.json?'));
  assert.ok(socrataUrl.includes('%24where='));
  assert.ok(socrata.verified_comps.every((comp) => comp.source_kind === 'official_public_record'));
  assert.ok(socrata.verified_comps.every((comp) => /Similarity: land_use:residential/.test(comp.evidence_text)));

  const unsafeParcelOnly = await compResolution.resolveCompsForRow({
    normalized_address: '500 Example Ave, Chicago, IL 60601',
    city: 'Chicago',
    county: 'Cook',
    state: 'IL',
    land_use: 'Residential'
  }, {
    profiles: [socrataProfile],
    now_iso: '2026-08-11T00:00:00Z',
    mock_comp_features: [
      { pin: '14-01-100-001-0000', sale_price: '400000', sale_date: '2026-01-10', class: 'Residential' },
      { pin: '14-01-100-002-0000', sale_price: '210000', sale_date: '2026-02-15', class: 'Residential' },
      { pin: '14-01-100-003-0000', sale_price: '220000', sale_date: '2026-03-15', class: 'Residential' }
    ]
  });
  assert.strictEqual(unsafeParcelOnly.status, 'COMP_SEARCH_EXHAUSTED_FREE');
  assert.strictEqual(unsafeParcelOnly.verified_comps.length, 0);
  assert.ok(unsafeParcelOnly.rejected_comp_candidates.every((comp) => comp.rejected_reason === 'parcel_only_comp_without_subject_parcel_id'));

  const oldWouldHaveUnlocked = await compResolution.resolveCompsForRow(row, {
    profiles: [profile],
    now_iso: '2013-08-11T00:00:00Z',
    mock_comp_features: [
      gridAttrs({ address: '14101 Sussex St, Detroit, MI 48227', parcel_id: 'old1', amt_sale_price: 6500, sale_date: '2011-04-12', property_class_description: 'Residential', zip_code: '48227' }, 1),
      gridAttrs({ address: '14111 Sussex St, Detroit, MI 48227', parcel_id: 'old2', amt_sale_price: 5200, sale_date: '2012-09-03', property_class_description: 'Residential', zip_code: '48227' }, 2),
      gridAttrs({ address: '14121 Sussex St, Detroit, MI 48227', parcel_id: 'old3', amt_sale_price: 8000, sale_date: '2013-02-20', property_class_description: 'Residential', zip_code: '48227' }, 3)
    ]
  });
  assert.strictEqual(oldWouldHaveUnlocked.status, 'COMP_PARTIAL', 'dry-run comparison: at the older comparison date, only the 2013 sale remains inside the active window');

  const baseComp = gridAttrs({
    comp_address: '14001 Sussex St, Detroit, MI 48227', sold_status: 'sold', sold_price: 220000,
    sold_date: '2026-02-01', source_kind: 'official_public_record', source_url: 'https://example.gov/comp',
    evidence_text: 'Recorded sale', similarity_basis: 'land_use:residential', land_use: 'Residential'
  }, 1);
  const gridOptions = { today_iso: '2026-08-25' };
  const acceptedGrid = compResolution.evaluateStrictCompGrid(baseComp, row, gridOptions);
  assert.strictEqual(acceptedGrid.accepted, true);
  assert.ok(acceptedGrid.criteria.some((item) => item.criterion === 'sold_recency' && item.status === 'APPLIED_PASS'));
  assert.ok(acceptedGrid.criteria.some((item) => item.criterion === 'market_sale_price' && item.status === 'APPLIED_PASS'));
  assert.ok(acceptedGrid.criteria.some((item) => item.criterion === 'similarity_basis' && item.status === 'APPLIED_PASS'));
  assert.ok(acceptedGrid.criteria.some((item) => item.criterion === 'provenance' && item.status === 'APPLIED_PASS'));
  assert.ok(acceptedGrid.criteria.some((item) => item.criterion === 'year_built' && item.status === 'APPLIED_PASS'));
  assert.ok(acceptedGrid.criteria.some((item) => item.criterion === 'lot_size' && item.status === 'APPLIED_PASS'));

  const rejectionMatrix = [
    ['nominal_or_non_market_sale_price', Object.assign({}, baseComp, { sold_price: 250 }), row],
    ['missing_sold_date', Object.assign({}, baseComp, { sold_date: '' }), row],
    ['sale_outside_comp_window', Object.assign({}, baseComp, { sold_date: '2024-01-01' }), row],
    ['stale_comp', Object.assign({}, baseComp, { sold_date: '2025-02-01' }), row],
    ['missing_similarity_basis', Object.assign({}, baseComp, { similarity_basis: '' }), row],
    ['missing_comp_provenance', Object.assign({}, baseComp, { source_url: '' }), row],
    ['strict_grid_distance_not_applied', Object.assign({}, baseComp, { latitude: '', longitude: '' }), row],
    ['rural_exception_requires_operator_review', Object.assign({}, baseComp, { latitude: 42.43, longitude: -83.281 }), row],
    ['comp_outside_one_mile', Object.assign({}, baseComp, { latitude: 42.5, longitude: -83.281 }), row],
    ['property_type_mismatch', Object.assign({}, baseComp, { property_kind: 'condominium' }), row],
    ['living_area_outside_20_percent', Object.assign({}, baseComp, { sqft: 2000 }), row],
    ['bedrooms_outside_range', Object.assign({}, baseComp, { beds: 5 }), row],
    ['bathrooms_outside_range', Object.assign({}, baseComp, { baths: 4 }), row],
    ['year_built_not_similar', Object.assign({}, baseComp, { year_built: 1960 }), row],
    ['lot_size_not_similar', Object.assign({}, baseComp, { lot_size: 10000 }), row]
  ];
  rejectionMatrix.forEach(([reason, candidate, subject]) => {
    assert.strictEqual(compResolution.evaluateStrictCompGrid(candidate, subject, gridOptions).rejected_reason, reason);
  });
  const missingFacts = compResolution.evaluateStrictCompGrid(Object.assign({}, baseComp, { sqft: '', beds: '', baths: '' }), row, gridOptions);
  assert.strictEqual(missingFacts.accepted, false);
  assert.ok(missingFacts.criteria.filter((item) => ['living_area', 'bedrooms', 'bathrooms'].includes(item.criterion)).every((item) => item.status === 'NOT_APPLIED'));
  const ruralApproved = compResolution.evaluateStrictCompGrid(Object.assign({}, baseComp, { latitude: 42.43, longitude: -83.281 }), row, {
    today_iso: '2026-08-25',
    rural_exception_review: { approved: true, reviewed_by: 'admin', reviewed_at: '2026-08-25T12:00:00Z' }
  });
  assert.strictEqual(ruralApproved.accepted, true);
  assert.match(ruralApproved.rural_exception_warning, /Rural comp exception approved/);

  console.log('disclosure state comp resolution tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
