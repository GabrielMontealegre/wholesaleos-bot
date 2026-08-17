'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const pass = require('../modules/research/document-reextraction-pass');
const enrichmentLedger = require('../modules/research/enrichment-ledger');
const enrichmentScheduler = require('../modules/research/enrichment-scheduler');

const PDF_URL = 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/May/Dallas_1.pdf';

function sourceProofRow(overrides) {
  return Object.assign({
    queue_key: 'proof-1',
    headline: 'Dallas County source proof only',
    normalized_address: '',
    partial_address: '',
    quality_bucket: 'SOURCE_PROOF_ONLY',
    source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
    source_document_url: PDF_URL,
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX',
    risk_flags: [],
    missing_fields: ['complete property address'],
    enrichment_ledger: { attempts: [], dropped_count: 0 },
    preview_only: true,
    not_a_saved_lead: true
  }, overrides || {});
}

function fetchImpl() {
  return Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: async () => Buffer.from('%PDF test')
  });
}

function pdfParseText(text) {
  return async () => ({ text });
}

function noticeText(address, saleDate) {
  return [
    'NOTICE OF SUBSTITUTE TRUSTEE SALE',
    `Property Address: ${address}`,
    `Sale Date: ${saleDate}`,
    'Case No. 2026-12345'
  ].join('\n');
}

(async () => {
  const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
  const completeRow = sourceProofRow({ queue_key: 'complete-1' });
  const complete = await pass.runDocumentReextractionPass([completeRow], { market, now_iso: '2026-08-17T10:00:00.000Z' }, {
    fetch_impl: fetchImpl,
    pdf_parse_impl: pdfParseText(noticeText('1234 Elm St Dallas TX 75201', '09/01/2026'))
  });
  assert.strictEqual(complete.selected_count, 1);
  assert.strictEqual(complete.complete_address_recovered_count, 1);
  assert.strictEqual(complete.needs_zip_review_recovered_count, 0);
  assert.strictEqual(completeRow.normalized_address, '1234 Elm St, Dallas, TX 75201');
  assert.strictEqual(completeRow.quality_bucket, 'INSPECT_NOW');
  assert.strictEqual(completeRow.document_reextraction_status, 'complete_address_recovered');
  assert.ok(completeRow.document_reextraction_evidence_text.includes('Property Address: 1234 Elm St Dallas TX 75201'));
  assert.ok(completeRow.document_reextraction_evidence_text.includes(PDF_URL));
  assert.ok(completeRow.risk_flags.includes('DOCUMENT_REEXTRACTED_FROM_STORED_SOURCE'));
  assert.ok(completeRow.enrichment_ledger.attempts.some((attempt) => attempt.lane === 'document_reextraction' && attempt.outcome === 'FOUND'));

  const ocrReviewRow = sourceProofRow({
    queue_key: 'ocr-1',
    city: 'Greenville',
    county: 'Hunt',
    source_url: 'https://apps.huntcounty.net/foreclosures/listDocs-new.asp?year=2026',
    source_document_url: 'https://apps.huntcounty.net/foreclosures/LinkedDir/2026/2026-08-04-foreclosure-01.pdf',
    risk_flags: ['OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED']
  });
  const ocrReview = await pass.runDocumentReextractionPass([ocrReviewRow], { market: { city: 'Greenville', county: 'Hunt', state: 'TX' }, now_iso: '2026-08-17T10:05:00.000Z' }, {
    fetch_impl: fetchImpl,
    pdf_parse_impl: pdfParseText(noticeText('116 Comanc He Dr Greenville TX 75402', '09/01/2026'))
  });
  assert.strictEqual(ocrReview.complete_address_recovered_count, 0);
  assert.strictEqual(ocrReview.needs_zip_review_recovered_count, 1);
  assert.strictEqual(ocrReviewRow.quality_bucket, 'NEEDS_ZIP_REVIEW');
  assert.strictEqual(ocrReviewRow.normalized_address, '', 'OCR review rows must never become precise complete-address rows');
  assert.strictEqual(ocrReviewRow.partial_address, '116 Comanc He Dr, Greenville, TX 75402');
  assert.strictEqual(ocrReviewRow.maps_url, null);
  assert.strictEqual(ocrReviewRow.next_best_action, 'VERIFY_ADDRESS_FROM_SOURCE_DOCUMENT');
  assert.ok(ocrReviewRow.risk_flags.includes('OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED'));

  const noRecoveryRow = sourceProofRow({ queue_key: 'no-recovery-1' });
  const noRecovery = await pass.runDocumentReextractionPass([noRecoveryRow], { market, now_iso: '2026-08-17T10:10:00.000Z' }, {
    fetch_impl: fetchImpl,
    pdf_parse_impl: pdfParseText('NOTICE OF TRUSTEE SALE\nNo property address is visible in this fixture.')
  });
  assert.strictEqual(noRecovery.no_recovery_count, 1);
  assert.strictEqual(noRecoveryRow.quality_bucket, 'SOURCE_PROOF_ONLY');
  assert.strictEqual(noRecoveryRow.normalized_address, '');
  assert.ok(noRecoveryRow.enrichment_ledger.attempts.some((attempt) => attempt.lane === 'document_reextraction' && attempt.outcome === 'NOT_FOUND'));

  const dualFailureRow = sourceProofRow({ queue_key: 'dual-failure-1' });
  const dualFailure = await pass.runDocumentReextractionPass([dualFailureRow], { market, now_iso: '2026-08-17T10:12:00.000Z' }, {
    fetch_impl: fetchImpl,
    pdf_parse_impl: async () => { throw new Error('pdf text exploded'); },
    ocr_notice_extraction_impl: async () => []
  });
  assert.strictEqual(dualFailure.failed_count, 1);
  assert.strictEqual(dualFailure.reason_counts.pdf_text_and_ocr_both_recovered_nothing, 1);
  assert.strictEqual(dualFailureRow.enrichment_ledger.attempts[0].reason_code, 'pdf_text_and_ocr_both_recovered_nothing');
  assert.ok(String(dualFailureRow.enrichment_ledger.attempts[0].next_eligible_at).startsWith('2026-08-17T16:12:00'));

  const terminalFailureRow = sourceProofRow({ queue_key: 'terminal-failure-1', source_document_url: `${PDF_URL}?terminal=1` });
  const failingOptions = {
    fetch_impl: fetchImpl,
    pdf_parse_impl: async () => { throw new Error('pdf text exploded'); },
    ocr_notice_extraction_impl: async () => []
  };
  await pass.runDocumentReextractionPass([terminalFailureRow], { market, now_iso: '2026-08-17T11:00:00.000Z' }, failingOptions);
  await pass.runDocumentReextractionPass([terminalFailureRow], { market, now_iso: '2026-08-17T18:30:00.000Z' }, failingOptions);
  await pass.runDocumentReextractionPass([terminalFailureRow], { market, now_iso: '2026-08-18T20:00:00.000Z' }, failingOptions);
  const terminalLatest = enrichmentLedger.attemptsForLane(terminalFailureRow, 'document_reextraction')
    .slice()
    .sort((a, b) => String(b.attempted_at).localeCompare(String(a.attempted_at)))[0];
  assert.ok(String(terminalLatest.next_eligible_at).startsWith('PERMANENT_UNTIL_DOCUMENT_REVIEW'));
  const terminalSelection = enrichmentScheduler.selectRowsForEnrichment([terminalFailureRow], {
    lane: 'document_reextraction',
    limit: 5,
    now_iso: '2026-08-19T20:00:00.000Z',
    market_policy: {}
  });
  assert.strictEqual(terminalSelection.selected.length, 0);

  const rows = Array.from({ length: 6 }, (_, index) => sourceProofRow({
    queue_key: `rotation-${index}`,
    source_document_url: `${PDF_URL}?row=${index}`
  }));
  const rotated = await pass.runDocumentReextractionPass(rows, { market, now_iso: '2026-08-17T10:15:00.000Z' }, {
    fetch_impl: fetchImpl,
    pdf_parse_impl: pdfParseText('NOTICE OF TRUSTEE SALE\nNo property address is visible in this fixture.')
  });
  assert.strictEqual(rotated.selected_count, 5, 'document re-extraction must stay capped at five stored rows per batch');
  assert.strictEqual(rows.filter((row) => row.enrichment_ledger.attempts.length).length, 5);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-doc-reextract-'));
  process.env.DB_PATH = path.join(tmpDir, 'db.json');
  process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'deal-board-snapshots.json');
  fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));
  fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify({
    version: 1,
    store_kind: 'deal_board_snapshots_not_saved_leads',
    markets: {
      'dallas|dallas|tx': {
        market,
        rows: [sourceProofRow({ queue_key: 'stored-doc-1' })],
        batches: []
      }
    }
  }, null, 2));
  const queueService = require('../modules/research/deal-board-queue-service');
  const run = await queueService.runDealBoardBatch({ market }, {
    preview_impl: async () => ({
      free_public_deals: [],
      rejected_generic_count: 0,
      browser_runtime_available: false,
      official_lookup_blocked_count: 0,
      diagnostics: { source_adapter: { source_adapter_results: [] } }
    }),
    fetch_impl: fetchImpl,
    pdf_parse_impl: pdfParseText(noticeText('4321 Cedar Ln Dallas TX 75202', '10/01/2026'))
  });
  assert.strictEqual(run.batch.document_reextraction.complete_address_recovered_count, 1);
  assert.strictEqual(run.rows[0].normalized_address, '4321 Cedar Ln, Dallas, TX 75202');
  assert.strictEqual(run.rows[0].quality_bucket, 'INSPECT_NOW');

  console.log('document re-extraction pass tests passed');
})();
