'use strict';

const assert = require('assert');
const http = require('http');
const https = require('https');
const registry = require('../modules/sources/county-source-profile-registry');
const queue = require('../modules/research/deal-board-queue-service');
const { RULES } = require('../modules/research/state-rules');
const { resolveSourceSaleDate } = require('../modules/research/resolve-source-sale-date');

const originalFetch = global.fetch;
const originalGet = [http.get, https.get];
let requests = 0;
global.fetch = () => { requests++; throw new Error('network forbidden'); };
http.get = https.get = () => { requests++; throw new Error('network forbidden'); };
try {
  assert.deepStrictEqual(registry.SOURCE_KINDS,
    ['trustee_sale_notice', 'tax_sale', 'code_case', 'parcel', 'recorded_sale']);
  for (const state of ['TX', 'NC', 'MI']) {
    assert.strictEqual(RULES[state].date_conventions.numeric_order, 'requires_source_proof');
  }
  const kinds = (county, state) => registry.profilesForCountyKind(county, state).map((profile) => profile.source_kind);
  assert.ok(kinds('Dallas', 'TX').includes('trustee_sale_notice'));
  assert.ok(kinds('Dallas', 'TX').includes('code_case'));
  assert.ok(kinds('Ellis', 'TX').includes('parcel'));
  assert.ok(kinds('San Diego', 'CA').includes('tax_sale'));
  assert.ok(kinds('San Diego', 'CA').includes('parcel'));
  assert.ok(kinds('Wayne', 'MI').includes('recorded_sale'));
  assert.ok(kinds('Wayne', 'MI').includes('parcel'));
  assert.ok(kinds('Cook', 'IL').includes('recorded_sale'));
  assert.deepStrictEqual(registry.profilesForCountyKind('Unknown', 'TX'), []);
  assert.deepStrictEqual(registry.profilesForCountyKind('Ellis', 'MI'), []);

  const notice = registry.profileForSourceId('ca_san_diego_tax_default_power_to_sell');
  assert.strictEqual(notice.evidence_stage, 'notice_only');
  assert.strictEqual(notice.source_kind, 'tax_sale');
  assert.strictEqual(notice.verification_status, 'configured_preview');
  assert.strictEqual(notice.refresh_cadence, null, 'unknown cadence must not be invented');
  assert.strictEqual(registry.sourceHostAllowed(notice, notice.source_url), true);
  assert.strictEqual(resolveSourceSaleDate({ raw_text: '10/06/2026', raw_field: 'sale_date',
    source_adapter_id: notice.source_id, source_url: notice.source_url,
    document_text: 'Date of Sale: 10/06/2026' }).status, 'AMBIGUOUS',
  'a tax notice cannot borrow a trustee-sale calendar rule');
  const unknownParcel = registry.profileForSourceId('tx_bexar_arcgis_parcels');
  assert.strictEqual(unknownParcel.verification_status, 'unverified_field_map_guess_discovery_timed_out');
  const sales = registry.profileForSourceId('mi_detroit_arcgis_property_sales');
  const parcels = registry.profileForSourceId('mi_detroit_arcgis_parcels_current');
  assert.notStrictEqual(sales.source_url, parcels.source_url);
  assert.strictEqual(sales.parser_options.field_map.sale_price, 'amt_sale_price');
  assert.strictEqual(parcels.parser_options.field_map.sale_price, '');
  assert.strictEqual(registry.sourceHostAllowed(parcels, 'https://example.org/parcel'), false);
  assert.strictEqual(registry.sourceHostAllowed(parcels, `http://${parcels.hosts[0]}/parcel`), false);
  assert.strictEqual(registry.sourceHostAllowed(parcels, `https://${parcels.hosts[0]}.example.org/parcel`), false);

  for (const [source_id, source_url] of [
    ['tx_dallas_county_clerk_foreclosure_notices', 'https://www.dallascounty.org/notice.pdf'],
    ['tx_ellis_county_foreclosure_notices', 'https://co.ellis.tx.us/notice.pdf']
  ]) {
    const row = { source_id, source_url, source_document_url: source_url,
      normalized_address: '123 Test St, Dallas, TX 75201', sale_date_or_event_date: '10/06/2026',
      sale_date_or_event_date_origin: 'sale_date', source_proof_text: 'Date of Sale: 10/06/2026' };
    const derived = queue.deriveSourceDates(row);
    assert.strictEqual(derived.sale_date_iso, '2026-10-06');
    assert.deepStrictEqual(derived.sale_date_resolution.rule_ids, ['tx_prop_code_51_002_sale_day']);
    const lifecycle = queue.lifecycleStatusWithNormalizedDates(row, '2026-09-30');
    assert.strictEqual(lifecycle.status, 'FRESH');
    assert.strictEqual(lifecycle.quarantined, false);
    const wrongHost = { ...row, source_url: 'https://example.org/notice.pdf',
      source_document_url: 'https://example.org/notice.pdf' };
    assert.strictEqual(queue.lifecycleStatusWithNormalizedDates(wrongHost, '2026-09-30').quarantined, true);
  }
  assert.strictEqual(requests, 0);
} finally {
  global.fetch = originalFetch;
  http.get = originalGet[0];
  https.get = originalGet[1];
}
console.log('B-04d source kinds and row equivalence passed');
