'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const fields = require('../modules/research/notice-field-evidence');
const store = require('../modules/research/post-sale-candidate-store');

const originalFetch = global.fetch;
const originalHttpGet = http.get;
const originalHttpsGet = https.get;
let requests = 0;
global.fetch = http.get = https.get = () => { requests++; throw new Error('network forbidden'); };

const sourceId = 'tx_dallas_county_clerk_foreclosure_notices';
const base = {
  source_id: sourceId, source_kind: 'trustee_sale_notice',
  source_url: 'https://www.dallascounty.org/notices/record.pdf',
  source_document_url: 'https://www.dallascounty.org/notices/record.pdf',
  property_address: "101 N O'Connor Rd, Dallas, TX 75201",
  property_address_origin: 'property_address_label',
  sale_date: 'May 5, 2026',
  sale_date_origin: 'labeled_sale_date',
  source_proof_text: "NOTICE OF SUBSTITUTE TRUSTEE SALE\nProperty Address: 101 N O'Connor Rd, Dallas, TX 75201\nSale Date: May 5, 2026",
  sale_outcome: 'OUTCOME_UNKNOWN', can_contact_original_owner: false,
  preview_only: true, should_ingest: false
};

try {
  assert.strictEqual(fields.propertyAddressOrigin(base.source_proof_text, base.property_address), 'property_address_label');
  assert.deepStrictEqual(fields.labeledSaleDate(base.source_proof_text),
    { date: 'May 5, 2026', origin: 'labeled_sale_date' });
  assert.strictEqual(store.rejectionReason(base, sourceId), '');
  assert.strictEqual(store.rejectionReason({ ...base, sale_date_origin: '' }, sourceId),
    'sale_date_not_labeled');
  const sourced = store.mergeCandidates([], [base], '2026-10-03T00:00:00Z')[0];
  assert.strictEqual(sourced.sale_date_origin, 'labeled_sale_date');
  assert.strictEqual(sourced.property_address_origin, 'property_address_label');
  assert.strictEqual(store.rejectionReason({ ...base, sale_date_origin: 'sale_section_date' }, sourceId),
    'sale_date_not_labeled');
  assert.strictEqual(store.rejectionReason({ ...base, property_address_origin: 'commonly_known_as' }, sourceId),
    'address_not_property_field');
  assert.strictEqual(store.rejectionReason({ ...base, sale_date: 'July 28, 2026' }, sourceId),
    'sale_date_differs_from_proof');
  assert.strictEqual(store.rejectionReason({ ...base, source_proof_text:
    "Property Address: 101 N O'Connor Rd, Dallas, TX 75201; Deed of Trust dated May 5, 2026" }, sourceId),
  'sale_date_not_labeled');
  assert.strictEqual(store.rejectionReason({ ...base, source_proof_text:
    'Sale Date: May 5, 2026; Mortgage servicer whose address is 3900 Capital City Blvd, Lansing, MI 48906',
  property_address: '3900 Capital City Blvd, Lansing, MI 48906' }, sourceId),
  'address_not_property_field');
  assert.strictEqual(store.rejectionReason({ ...base, source_proof_text: '' , source_row_reference: 'page 1 row 2' }, sourceId),
    'address_not_property_field');

  const lateAddress = `${'Foreclosure notice preamble. '.repeat(40)}\n${base.source_proof_text}`;
  assert.ok(lateAddress.indexOf('Property Address:') > 650);
  assert.strictEqual(fields.propertyAddressOrigin(lateAddress, base.property_address), 'property_address_label');

  const legacy = { ...base, sale_date: 'July 28, 2026', property_address: '3900 Capital City Blvd, Lansing, MI 48906',
    sale_date_origin: '', property_address_origin: '',
    source_proof_text: '', source_proof_excerpt:
      'Property Address: 101 N O\'Connor Rd, Dallas, TX 75201; Deed of Trust dated July 28, 2026; Mortgage servicer whose address is 3900 Capital City Blvd, Lansing, MI 48906' };
  const stored = store.mergeCandidates([legacy], [], '2026-10-03T00:00:00Z');
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(stored[0].lane_status, 'superseded_invalid');
  assert.deepStrictEqual(stored[0].invalidated_fields, [
    { field: 'property_address', old_value: legacy.property_address },
    { field: 'sale_date', old_value: legacy.sale_date }
  ]);
  assert.strictEqual(store.responsePage(stored).post_sale_candidate_total, 0);
  assert.strictEqual(store.responsePage(stored).post_sale_invalidated, 1);
  assert.strictEqual(store.responsePage([legacy]).post_sale_candidate_total, 0);
  const legacySynthetic = { ...base, sale_date_origin: '', property_address_origin: '',
    source_proof_text: '', source_proof_excerpt: base.source_proof_text };
  assert.strictEqual(store.responsePage([legacySynthetic]).post_sale_candidate_total, 0);
  const repaired = store.mergeCandidates(stored, [{ ...base, ...{
    property_address: legacy.property_address, sale_date: legacy.sale_date,
    source_proof_text: 'Property Address: 3900 Capital City Blvd, Lansing, MI 48906; Sale Date: July 28, 2026'
  } }], '2026-10-04T00:00:00Z');
  assert.strictEqual(repaired[0].lane_status, '');
  assert.strictEqual(repaired[0].previous_invalidation_reason, stored[0].invalidation_reason);
  assert.deepStrictEqual(repaired[0].invalidated_fields, stored[0].invalidated_fields);
  const resolved = { ...base, property_address: "102 N O'Connor Rd, Dallas, TX 75201",
    sale_date: '2026-05-06',
    source_proof_text: "Property Address: 102 N O'Connor Rd, Dallas, TX 75201; Sale Date: 2026-05-06" };
  const unresolved = { ...base, property_address: "103 N O'Connor Rd, Dallas, TX 75201",
    sale_date: '05/07/2026',
    source_proof_text: "Property Address: 103 N O'Connor Rd, Dallas, TX 75201; Sale Date: 05/07/2026" };
  assert.deepStrictEqual(store.responsePage([unresolved, resolved]).post_sale_candidates.map((item) => item.property_address),
    [resolved.property_address, unresolved.property_address]);

  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cycle-18-notices.json'), 'utf8'));
  assert.ok(corpus.documents.length >= 3);
  const forbiddenDates = ['02/09/2022', '07/28/2026', '1/31/2002', '7/29/2025'];
  const before = { any_date: 0, any_street: 0 };
  const after = { labeled_date: 0, labeled_property: 0 };
  for (const document of corpus.documents) {
    const text = document.text;
    if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/.test(text)) before.any_date++;
    if (/\b\d{3,6}\s+[A-Za-z]+\s+(?:street|blvd|road)\b/i.test(text)) before.any_street++;
    const sale = fields.labeledSaleDate(text);
    if (sale.date) after.labeled_date++;
    const address = fields.sourcePropertyAddress(text);
    if (address) after.labeled_property++;
    for (const falseDate of forbiddenDates) {
      if (text.includes(falseDate)) assert.notStrictEqual(sale.date, falseDate);
    }
    if (text.includes('3900 Capital City Blvd'))
      assert.strictEqual(fields.propertyAddressOrigin(text, '3900 Capital City Blvd'), '');
    if (text.includes('2507 Lee Street'))
      assert.strictEqual(fields.propertyAddressOrigin(text, '2507 Lee Street'), '');
  }
  assert.strictEqual(requests, 0);
  console.log(`after-sale origin proof passed; frozen documents=${corpus.documents.length}; before=${JSON.stringify(before)}; after=${JSON.stringify(after)}`);
} finally {
  global.fetch = originalFetch;
  http.get = originalHttpGet;
  https.get = originalHttpsGet;
}
