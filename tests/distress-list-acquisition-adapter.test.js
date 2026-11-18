'use strict';

// B-23b: generic distress list adapter. Synthetic bodies only; live network refused.
const assert = require('assert');
const { installRefuseLiveNetwork } = require('./helpers/refuse-live-network');

const liveNetwork = installRefuseLiveNetwork();
const adapter = require('../modules/sources/distress-list-acquisition-adapter');
const profiles = require('../modules/sources/distress-list-profiles');
const registry = require('../modules/sources/source-adapter-registry');
const sourceCatalog = require('../modules/sources/source-catalog');

const CSV_SOURCE = 'tn_shelby_tax_sale_scgpublic_s3_amazonaws_com';
const ARCGIS_SOURCE = 'nc_guilford_tax_sale_gcgis_guilfordcountync_gov';

function fakeFetch(responses, calls) {
  return async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift() || { status: 200, body: '' };
    return {
      status: next.status,
      headers: { get: (name) => (next.headers || {})[name.toLowerCase()] || '' },
      arrayBuffer: async () => Buffer.from(next.body || '')
    };
  };
}

function runOptions(responses, calls) {
  let now = 5000;
  return {
    fetch_impl: fakeFetch(responses, calls),
    sleep: async (ms) => { now += ms; },
    now_ms: () => now,
    today: '2026-11-16',
    captured_at: '2026-11-16T15:00:00Z',
    acquisition_run_id: 'test-run'
  };
}

(async () => {
  // ---- Request plans by platform convention -------------------------------------------
  const plan = (overrides) => adapter.requestPlanForProfile(Object.assign({ reader: 'csv', source_url: 'https://records.example.gov/a.csv' }, overrides));
  const arc = plan({ reader: 'arcgis_json', source_url: 'https://gis.example.gov/arcgis/rest/services/X/FeatureServer/3' });
  assert.ok(arc.url.startsWith('https://gis.example.gov/arcgis/rest/services/X/FeatureServer/3/query?'));
  assert.ok(arc.url.includes('outFields=*') && arc.url.includes('f=json') && arc.url.includes('returnGeometry=false'));
  assert.match(plan({ reader: 'arcgis_json', source_url: 'https://gis.example.gov/arcgis/rest/services/X/MapServer' }).reason, /no single layer/);
  assert.strictEqual(plan({ reader: 'socrata_json', source_url: 'https://data.example.gov/resource/abcd-1234.json?$limit=1' }).url,
    'https://data.example.gov/resource/abcd-1234.json?$limit=1000', 'sample limit replaced, not trusted');
  assert.match(plan({ reader: 'socrata_json', source_url: 'https://data.example.gov/d/abcd-1234' }).reason, /not confirmed/);
  const ckan = plan({ reader: 'json_rows', source_url: 'https://data.example.gov/api/3/action/datastore_search?resource_id=r-1&limit=1' });
  assert.strictEqual(ckan.url, 'https://data.example.gov/api/3/action/datastore_search?resource_id=r-1&limit=1000');
  assert.deepStrictEqual(ckan.reader_options, { rows_path: 'result.records', id_field: '_id' });
  assert.match(plan({ reader: 'json_rows', source_url: 'https://data.example.gov/properties' }).reason, /reader settings/);
  assert.match(plan({ reader: 'html_table' }).reason, /per-source reader settings/);
  assert.match(plan({ reader: 'pdf_text' }).reason, /per-source reader settings/);
  assert.strictEqual(plan({ source_url: '' }).reason, 'No source address.');

  // ---- Registration does not schedule anything ----------------------------------------
  const autoIds = adapter.autoRunnableProfiles().map((p) => p.source_id);
  assert.ok(autoIds.length >= 7);
  for (const id of autoIds) {
    const entry = registry.adapterForSourceId(id);
    assert.ok(entry, `${id} registered`);
    assert.strictEqual(entry.listing_egress, 'none');
  }
  assert.strictEqual(registry.adapterIdForSourceId('tx_dallas_foreclosure_notice_dallas_tx_publicsearch_us'), '', 'settings-needed source is not registered');
  assert.strictEqual(registry.adapterIdForSourceId('tx_dallas_lis_pendens_dallas_tx_publicsearch_us'), '', 'manual source is not registered');
  for (const job of [{}, { market: { city: 'Charlotte', state: 'NC' } }, { market: { city: 'Memphis', state: 'TN' } }]) {
    const catalogIds = sourceCatalog.buildSourceCatalog(job).map((source) => source.source_id);
    assert.ok(!catalogIds.some((id) => autoIds.includes(id)), 'no distress source joins an automatic run until the catalog lists it');
  }

  // ---- A full run on a synthetic CSV ---------------------------------------------------
  const calls = [];
  const csv = 'Parcel ID,Property Address,Sale Date,Amount Due,Owner\n'
    + 'A-1,100 Example St,2026-12-01,$900.00,Sample Owner One\n'
    + 'A-2,,2026-12-01,$50.00,Sample Owner Two\n'
    + 'A-1,100 Example St,2026-12-01,$900.00,Sample Owner One\n'
    + 'A-3,200 Example Ave,05/06/2026,$75.00,Sample Owner Three\n';
  const result = await adapter.runDistressListAcquisitionAdapter(Object.assign({ source_id: CSV_SOURCE }, runOptions([{ status: 200, body: csv }], calls)));
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, profiles.profileForSourceId(CSV_SOURCE).source_url);
  assert.strictEqual(result.status, 'available');
  assert.strictEqual(result.preview_only, true);
  assert.strictEqual(result.should_ingest, false);
  assert.strictEqual(result.diagnostics.rows_found, 4);
  assert.strictEqual(result.diagnostics.duplicate_rows_merged, 1, 'duplicate row merged, not double counted');
  assert.strictEqual(result.candidates.length, 2);
  assert.strictEqual(result.source_proof_rows.length, 1, 'row without an address is kept as source proof');
  assert.strictEqual(result.source_proof_rows[0].lane, 'needs_data');
  const first = result.candidates.find((c) => c.document_number === 'A-1');
  assert.strictEqual(first.source_row_reference, 'row 3 (line 4)', 'the later duplicate row is the current evidence');
  assert.strictEqual(first.source_structured_address_verified, false, 'list address is not a verified address');
  assert.strictEqual(first.not_a_saved_lead, true);
  assert.strictEqual(first.address_origin, 'Property Address');
  assert.ok(first.risk_flags.includes('LISTED_AMOUNT_NOT_PRICE_ARV_OR_PAYOFF'));
  const ambiguous = result.candidates.find((c) => c.document_number === 'A-3');
  assert.strictEqual(ambiguous.sale_date_status, 'AMBIGUOUS');
  assert.strictEqual(ambiguous.sale_date_raw, '05/06/2026');
  assert.ok(ambiguous.risk_flags.includes('SALE_DATE_NOT_CONFIRMED'));
  assert.ok(!ambiguous.event_date, 'ambiguous date never becomes the event date');
  assert.strictEqual(result.cards.length, 2);
  const summaryText = JSON.stringify(result.distress_summary);
  assert.ok(!summaryText.includes('Sample Owner') && !summaryText.includes('Example St'), 'summary is counts only');
  assert.strictEqual(result.distress_summary.rows_found, 4);
  assert.ok(!JSON.stringify(result.source_proof_rows).includes('Sample Owner'), 'proof rows carry no owner names');

  // ---- ArcGIS layer with epoch dates ---------------------------------------------------
  const arcCalls = [];
  const arcBody = JSON.stringify({ objectIdFieldName: 'OBJECTID', features: [{ attributes: { OBJECTID: 4, LOCATION_ADDR: '300 Example Rd', AuctionDate: Date.UTC(2026, 11, 3) } }] });
  const arcResult = await adapter.runDistressListAcquisitionAdapter(Object.assign({ source_id: ARCGIS_SOURCE }, runOptions([{ status: 200, body: arcBody }], arcCalls)));
  assert.ok(arcCalls[0].url.includes('/query?'));
  assert.strictEqual(arcResult.candidates[0].source_row_reference, 'feature OBJECTID=4');
  assert.strictEqual(arcResult.candidates[0].event_date, '2026-12-03');

  // ---- Negative paths ------------------------------------------------------------------
  const blockedCalls = [];
  const blocked = await adapter.runDistressListAcquisitionAdapter(Object.assign({ source_id: CSV_SOURCE }, runOptions([{ status: 429 }], blockedCalls)));
  assert.strictEqual(blocked.status, 'blocked');
  assert.strictEqual(blocked.http_status, 429);
  assert.deepStrictEqual(blocked.candidates, []);
  const redirect = await adapter.runDistressListAcquisitionAdapter(Object.assign({ source_id: CSV_SOURCE },
    runOptions([{ status: 302, headers: { location: 'https://scgpublic.s3.amazonaws.com/../other-tenant/x.csv' } }], [])));
  assert.strictEqual(redirect.status, 'needs_manual_review', 'redirect off the allowlisted path refused');
  const broken = await adapter.runDistressListAcquisitionAdapter(Object.assign({ source_id: ARCGIS_SOURCE }, runOptions([{ status: 200, body: '<html>not json</html>' }], [])));
  assert.strictEqual(broken.status, 'needs_manual_review');
  const arcError = await adapter.runDistressListAcquisitionAdapter(Object.assign({ source_id: ARCGIS_SOURCE }, runOptions([{ status: 200, body: '{"error":{"code":499}}' }], [])));
  assert.strictEqual(arcError.candidates.length, 0);
  assert.deepStrictEqual(arcError.diagnostics.reader_warnings, ['arcgis_error:499']);
  const noCalls = [];
  const manual = await adapter.runDistressListAcquisitionAdapter(Object.assign({ source_id: 'tx_dallas_lis_pendens_dallas_tx_publicsearch_us' }, runOptions([], noCalls)));
  assert.strictEqual(manual.status, 'manual_only');
  const settings = await adapter.runDistressListAcquisitionAdapter(Object.assign({ source_id: 'tx_bexar_foreclosure_notice_www_bexar_org' }, runOptions([], noCalls)));
  assert.strictEqual(settings.status, 'needs_reader_settings');
  const unknown = await adapter.runDistressListAcquisitionAdapter(Object.assign({ source_id: 'forged_source' }, runOptions([], noCalls)));
  assert.strictEqual(unknown.status, 'not_configured');
  assert.strictEqual(noCalls.length, 0, 'manual, settings-needed and unknown sources make no request');

  assert.strictEqual(liveNetwork.attempts.length, 0, 'no live network');
  liveNetwork.restore();
  console.log('distress-list-acquisition-adapter: ArcGIS/Socrata/CKAN/file request plans, registered-not-scheduled, CSV run with merge/proof rows/ambiguous date/unverified address/count-only summary, ArcGIS epoch dates, 429/redirect/bad body/ArcGIS error, manual/settings/unknown no-request and no live network passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
