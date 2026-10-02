'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const queue = require('../modules/research/deal-board-queue-service');
const orchestrator = require('../modules/research/source-acquisition-orchestrator');
const postSaleStore = require('../modules/research/post-sale-candidate-store');

const file = path.join(__dirname, '.tmp', 'b05c-snapshot.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.rmSync(file, { force: true });
const priorPath = process.env.DEAL_BOARD_SNAPSHOTS_PATH;
process.env.DEAL_BOARD_SNAPSHOTS_PATH = file;
const originalFetch = global.fetch;
const originalHttpGet = http.get;
const originalHttpsGet = https.get;
let requests = 0;
global.fetch = http.get = https.get = () => { requests++; throw new Error('network forbidden'); };

const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const candidate = {
  source_id: 'tx_dallas_county_clerk_foreclosure_notices',
  source_kind: 'trustee_sale_notice',
  source_url: 'https://www.dallascounty.org/notices/example.pdf',
  source_proof_text: 'Property Address: 101 Sample St, Dallas, TX 75201; Sale Date: 2026-05-05',
  source_row_reference: 'page 1 row 1',
  property_address: '101 Sample St, Dallas, TX 75201',
  sale_date: '2026-05-05',
  sale_outcome: 'OUTCOME_UNKNOWN',
  can_contact_original_owner: false,
  preview_only: true,
  should_ingest: false
};
const preview = (items) => ({
  free_public_deals: [],
  diagnostics: { source_adapter: { source_adapter_results: [
    { source_id: candidate.source_id, post_sale_candidates: items }
  ] } }
});

(async () => {
  const result = await orchestrator.runAcquisitionCore({
    city: 'Dallas', county: 'Dallas', state: 'TX',
    source_ids: [candidate.source_id]
  }, {
    source_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE\nProperty Address: 101 Sample St, Dallas, TX 75201\nSale Date: 05/05/2026\nCase Number: 1\nForeclosure sale notice.',
    source_document_url: 'https://www.dallascounty.org/notices/example.pdf',
    captured_at: '2026-10-01T12:00:00Z'
  });
  assert.ok(result.adapter_results.some((item) => item.post_sale_candidates.length === 1));
  assert.ok(!result.candidates.some((item) => /101 Sample/.test(item.property_address)));

  const options = { preview_impl: async () => preview([candidate]), enable_document_reextraction: false };
  const first = await queue.runDealBoardBatch({ market, enable_document_reextraction: false }, options);
  assert.strictEqual(first.post_sale_candidates.length, 1);
  assert.strictEqual(first.rows.length, 0);
  assert.strictEqual(first.batch.post_sale_candidate_count, 1);
  const key = first.post_sale_candidates[0].candidate_key;
  assert.match(key, /^[a-f0-9]{64}$/);
  await queue.runDealBoardBatch({ market, enable_document_reextraction: false }, options);
  assert.strictEqual(queue.latestDealBoardSnapshot({ market }).post_sale_candidates.length, 1);
  assert.strictEqual(queue.latestDealBoardSnapshot({ market }).post_sale_candidates[0].candidate_key, key);
  await queue.runDealBoardBatch({ market, enable_document_reextraction: false }, {
    preview_impl: async () => preview([]), enable_document_reextraction: false
  });
  assert.strictEqual(queue.latestDealBoardSnapshot({ market }).post_sale_candidates.length, 1);
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(stored.markets['dallas|dallas|tx'].post_sale_candidates.length, 1);
  assert.strictEqual(stored.markets['dallas|dallas|tx'].rows.length, 0);
  const forged = { ...candidate, can_contact_original_owner: true };
  await queue.runDealBoardBatch({ market, enable_document_reextraction: false }, {
    preview_impl: async () => preview([forged]), enable_document_reextraction: false
  });
  assert.strictEqual(queue.latestDealBoardSnapshot({ market }).post_sale_candidates.length, 1);
  assert.strictEqual(requests, 0);
  await queue.runDealBoardBatch({ market, enable_document_reextraction: false }, {
    preview_impl: async () => preview([{ ...candidate, source_url: 'https://untrusted.example/notice.pdf' }]),
    enable_document_reextraction: false
  });
  assert.strictEqual(queue.latestDealBoardSnapshot({ market }).post_sale_candidates.length, 1);
  const indexUrl = 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php';
  const noDocument = { ...candidate, source_url: indexUrl, source_document_url: '', source_row_reference: '' };
  assert.strictEqual(postSaleStore.rejectionReason(noDocument, candidate.source_id), 'generic_source_url');
  assert.strictEqual(postSaleStore.rejectionReason({ ...noDocument,
    source_proof_text: 'Foreclosure notices are posted monthly by the County Clerk.' }, candidate.source_id),
  'proof_not_property_specific');
  const rowReference = { ...noDocument, property_address: '88 Row St, Dallas, TX 75201',
    source_document_url: 'https://www.dallascounty.org/notices/monthly-list.pdf', source_proof_text: '' };
  assert.strictEqual(postSaleStore.rejectionReason({ ...rowReference, source_row_reference: 'page 1 row 2' },
    candidate.source_id), '');
  assert.strictEqual(postSaleStore.rejectionReason({ ...candidate,
    source_document_url: 'https://untrusted.example/notice.pdf' }, candidate.source_id), 'untrusted_source');
  assert.strictEqual(postSaleStore.rejectionReason({ ...candidate, source_row_reference: '',
    source_proof_text: 'Property Address: 101 Sample St, Dallas, TX 75201; Sale Date: 2026-06-06' },
  candidate.source_id), 'proof_not_property_specific');
  await queue.runDealBoardBatch({ market, enable_document_reextraction: false }, {
    preview_impl: async () => preview([noDocument, { ...noDocument,
      source_proof_text: 'Foreclosure notices are posted monthly by the County Clerk.' }]),
    enable_document_reextraction: false
  }).then((batch) => {
    assert.strictEqual(batch.batch.post_sale_rejected.generic_source_url, 1);
    assert.strictEqual(batch.batch.post_sale_rejected.proof_not_property_specific, 1);
  });
  assert.strictEqual(queue.latestDealBoardSnapshot({ market }).post_sale_candidate_total, 1);

  const duplicate = { ...candidate, source_row_reference: '',
    property_address: '77 Dup Ln, Dallas, TX 75201',
    source_url: 'https://www.dallascounty.org/notices/one.pdf',
    source_proof_text: 'Property Address: 77 Dup Ln, Dallas, TX 75201; Sale Date: 2026-05-05' };
  const duplicateSpelling = { ...duplicate, property_address: '77 Dup Lane, Dallas, TX 75201',
    source_url: 'https://www.dallascounty.org/notices/two.pdf',
    source_proof_text: 'Property Address: 77 Dup Lane, Dallas, TX 75201; Sale Date: 2026-05-05' };
  await queue.runDealBoardBatch({ market, enable_document_reextraction: false }, {
    preview_impl: async () => preview([duplicate, duplicateSpelling,
      { ...rowReference, source_row_reference: 'page 1 row 2' }]), enable_document_reextraction: false
  });
  const deduped = queue.latestDealBoardSnapshot({ market });
  assert.strictEqual(deduped.post_sale_candidate_total, 3);
  assert.strictEqual(deduped.post_sale_candidates.find((item) => item.property_address.includes('77 Dup')).source_urls.length, 2);

  const largeProof = ' additional source text'.repeat(200);
  const largeMarket = { city: 'Synthetic', county: 'Synthetic', state: 'TX' };
  const many = Array.from({ length: 3000 }, (_, index) => ({ ...candidate,
    property_address: `${1000 + index} Volume St, Dallas, TX 75201`, source_row_reference: '',
    source_proof_text: `Property Address: ${1000 + index} Volume St, Dallas, TX 75201; Sale Date: 2026-05-05.${largeProof}`
  }));
  const largeRun = await queue.runDealBoardBatch({ market: largeMarket, source_ids: [candidate.source_id],
    enable_document_reextraction: false }, {
    preview_impl: async () => preview(many), enable_document_reextraction: false
  });
  assert.strictEqual(largeRun.post_sale_candidate_total, 3000);
  assert.strictEqual(largeRun.post_sale_candidates.length, 20);
  assert.ok(Buffer.byteLength(JSON.stringify(largeRun)) < 100000);
  const latestPage = queue.latestDealBoardSnapshot({ market: largeMarket });
  assert.strictEqual(latestPage.post_sale_candidate_total, 3000);
  assert.strictEqual(latestPage.post_sale_candidates.length, 20);
  assert.ok(Buffer.byteLength(JSON.stringify(latestPage)) < 100000);
  const largeStore = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(largeStore.markets['synthetic|synthetic|tx'].post_sale_candidates.length, 3000);
  assert.ok(largeStore.markets['synthetic|synthetic|tx'].post_sale_candidates.every((item) =>
    !Object.hasOwn(item, 'source_proof_text') && item.source_proof_excerpt.length <= 1000 &&
    /^[a-f0-9]{64}$/.test(item.source_proof_sha256)));
  console.log('B-05c separate persistent post-sale snapshot lane passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  global.fetch = originalFetch;
  http.get = originalHttpGet;
  https.get = originalHttpsGet;
  if (priorPath === undefined) delete process.env.DEAL_BOARD_SNAPSHOTS_PATH;
  else process.env.DEAL_BOARD_SNAPSHOTS_PATH = priorPath;
});
