'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-b05d-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'snapshots.json');
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [], users: [] }));

const { runFreePublicDealBoardPreview } = require('../modules/research/free-public-deal-board');
const queue = require('../modules/research/deal-board-queue-service');
const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const pastDocumentUrl = 'https://www.dallascounty.org/notices/past-only.pdf';
const activeDocumentUrl = 'https://www.dallascounty.org/notices/active-only.pdf';
const pastNotice = {
  source_id: 'tx_dallas_county_clerk_foreclosure_notices',
  source_kind: 'trustee_sale_notice',
  source_url: pastDocumentUrl,
  source_document_url: pastDocumentUrl,
  source_proof_text: 'Property Address: 101 Sample St, Dallas, TX 75201; Sale Date: May 5, 2026',
  source_row_reference: 'page 1 row 1',
  sale_date: 'May 5, 2026',
  sale_date_origin: 'labeled_sale_date',
  property_address: '101 Sample St, Dallas, TX 75201',
  property_address_origin: 'property_address_label',
  sale_outcome: 'OUTCOME_UNKNOWN',
  can_contact_original_owner: false,
  preview_only: true,
  should_ingest: false
};
const adapterResult = {
  source_id: pastNotice.source_id,
  source_name: 'County foreclosure notices',
  source_family: 'preforeclosure_trustee_notice',
  post_sale_candidates: [pastNotice],
  document_urls_parsed: [pastDocumentUrl]
};
const options = {
  fetch_impl: async () => ({ ok: false, status: 404, headers: { get: () => '' }, text: async () => '' })
};

async function preview(result) {
  return runFreePublicDealBoardPreview({
    market,
    mock_source_adapter_results: [result],
    enable_provider_search: false
  }, options);
}

(async () => {
  try {
    const pastOnly = await preview(adapterResult);
    assert.strictEqual(pastOnly.diagnostics.source_adapter.source_adapter_proof_record_count, 0);
    assert.strictEqual(pastOnly.diagnostics.source_adapter_records_count, 0);
    assert.strictEqual(pastOnly.free_public_deals.length, 0);
    const stored = await queue.runDealBoardBatch({ market, enable_document_reextraction: false }, {
      preview_impl: async () => pastOnly,
      enable_document_reextraction: false
    });
    assert.strictEqual(stored.rows.length, 0);
    assert.strictEqual(stored.post_sale_candidates.length, 1, JSON.stringify(stored.batch));
    assert.strictEqual(stored.post_sale_candidates[0].source_document_url, pastDocumentUrl);

    const mixed = await preview({
      ...adapterResult,
      candidates: [{
        normalized_address: '100 Current St, Dallas, TX 75201',
        source_document_url: pastDocumentUrl,
        source_url: pastDocumentUrl,
        source_family: 'preforeclosure_trustee_notice',
        sale_date: 'November 3, 2026'
      }]
    });
    assert.strictEqual(mixed.diagnostics.source_adapter.source_adapter_candidate_count, 1);
    assert.strictEqual(mixed.diagnostics.source_adapter.source_adapter_proof_record_count, 0);
    assert.strictEqual(mixed.free_public_deals.length, 1);
    assert.strictEqual(mixed.free_public_deals[0].normalized_address, '100 Current St, Dallas, TX 75201');

    const unrelated = await preview({
      ...adapterResult,
      document_urls_parsed: [pastDocumentUrl, activeDocumentUrl]
    });
    assert.strictEqual(unrelated.diagnostics.source_adapter.source_adapter_proof_record_count, 1);
    assert.strictEqual(unrelated.free_public_deals[0].source_document_url, activeDocumentUrl);

    const invalidCandidate = await preview({
      ...adapterResult,
      post_sale_candidates: [{ ...pastNotice, preview_only: false }]
    });
    assert.strictEqual(invalidCandidate.diagnostics.source_adapter.source_adapter_proof_record_count, 1);
    assert.strictEqual(invalidCandidate.free_public_deals[0].source_document_url, pastDocumentUrl);
    console.log('past-only proof row tests passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
