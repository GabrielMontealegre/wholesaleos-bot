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
    source_row_reference: 'subject-1',
    land_use: 'Residential'
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
      land_use: 'class'
    }
  };
  let socrataUrl = '';
  const socrata = await compResolution.resolveCompsForRow({
    normalized_address: '500 Example Ave, Chicago, IL 60601',
    city: 'Chicago',
    county: 'Cook',
    state: 'IL',
    parcel_id: '14-01-100-001-0000',
    land_use: 'Residential'
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
            { pin: '14-01-100-001-0000', sale_price: '400000', sale_date: '2026-01-10', class: 'Residential' },
            { pin: '14-01-100-002-0000', sale_price: '210000', sale_date: '2026-02-15', class: 'Residential' },
            { pin: '14-01-100-003-0000', sale_price: '220000', sale_date: '2026-03-15', class: 'Residential' },
            { pin: '14-01-100-004-0000', sale_price: '230000', sale_date: '2026-04-15', class: 'Residential' }
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
      { address: '14101 Sussex St, Detroit, MI 48227', parcel_id: 'old1', amt_sale_price: 6500, sale_date: '2011-04-12', property_class_description: 'Residential', zip_code: '48227' },
      { address: '14111 Sussex St, Detroit, MI 48227', parcel_id: 'old2', amt_sale_price: 5200, sale_date: '2012-09-03', property_class_description: 'Residential', zip_code: '48227' },
      { address: '14121 Sussex St, Detroit, MI 48227', parcel_id: 'old3', amt_sale_price: 8000, sale_date: '2013-02-20', property_class_description: 'Residential', zip_code: '48227' }
    ]
  });
  assert.strictEqual(oldWouldHaveUnlocked.status, 'COMP_PARTIAL', 'dry-run comparison: at the older comparison date, only the 2013 sale remains inside the active window');

  console.log('disclosure state comp resolution tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
