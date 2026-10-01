'use strict';

const assert = require('assert');
const http = require('http');
const https = require('https');
const adapter = require('../modules/sources/dallas-foreclosure-acquisition-adapter');

const originalFetch = global.fetch;
const originalHttpGet = http.get;
const originalHttpsGet = https.get;
let requests = 0;
global.fetch = () => { requests++; throw new Error('network forbidden'); };
http.get = https.get = () => { requests++; throw new Error('network forbidden'); };

const notice = (address, date, reference) => [
  'NOTICE OF SUBSTITUTE TRUSTEE SALE',
  `Property Address: ${address}`,
  'Borrower: Test Borrower',
  date ? `Sale Date: ${date}` : '',
  `Case Number: ${reference}`,
  'Foreclosure sale notice.'
].filter(Boolean).join('\n');

(async () => {
  const sourceText = [
    notice('101 Sample St, Dallas, TX 75201', '05/05/2026', 'past-1'),
    notice('102 Sample St, Dallas, TX 75201', '08/09/2026', 'past-2'),
    notice('103 Sample St, Dallas, TX 75201', '10/06/2026', 'future-1'),
    notice('105 Sample St, Dallas, TX 75201', '', 'undated-1')
  ].join('\n\n');
  const base = {
    source_text: sourceText,
    captured_at: '2026-10-01T12:00:00.000Z',
    source_document_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures/sample.pdf'
  };
  const result = await adapter.runDallasForeclosureAcquisitionAdapter(base);
  assert.strictEqual(result.post_sale_candidates.length, 2);
  const past = result.post_sale_candidates[0];
  assert.strictEqual(past.sale_date, '05/05/2026');
  assert.strictEqual(past.stale_basis, 'resolved_date_past');
  assert.strictEqual(result.post_sale_candidates[1].stale_basis, 'all_readings_past');
  assert.strictEqual(result.post_sale_candidates[1].sale_date_resolution, null);
  assert.strictEqual(past.sale_outcome, 'OUTCOME_UNKNOWN');
  assert.strictEqual(past.source_kind, 'trustee_sale_notice');
  assert.strictEqual(past.source_proof_url, past.source_url);
  assert.strictEqual(past.captured_at, base.captured_at);
  assert.strictEqual(past.can_contact_original_owner, false);
  assert.strictEqual(past.preview_only, true);
  assert.strictEqual(past.should_ingest, false);
  assert.ok(past.source_url.startsWith('https://www.dallascounty.org/'));
  assert.ok(past.source_proof_text.includes('Sale Date: 05/05/2026'));
  assert.ok(!result.candidates.some((candidate) => /101 Sample/i.test(candidate.property_address)));
  assert.ok(!result.cards.some((card) => /101 Sample/i.test(card.address_or_source_text)));
  assert.strictEqual(result.source_preview.stale_sale_date_count, 2);
  assert.ok(!result.post_sale_candidates.some((candidate) => /103 Sample|105 Sample/.test(candidate.property_address)));

  const wrongOrigin = await adapter.runDallasForeclosureAcquisitionAdapter({
    ...base,
    source_document_url: 'https://untrusted.example/notice.pdf'
  });
  assert.deepStrictEqual(wrongOrigin.post_sale_candidates, []);
  assert.strictEqual(requests, 0);
  console.log('B-05a past-notice segregation passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  global.fetch = originalFetch;
  http.get = originalHttpGet;
  https.get = originalHttpsGet;
});
