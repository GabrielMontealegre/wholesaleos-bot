'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const queue = require('../modules/research/deal-board-queue-service');
const orchestrator = require('../modules/research/source-acquisition-orchestrator');

const file = path.join(__dirname, '.tmp', 'b05c-snapshot.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
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
