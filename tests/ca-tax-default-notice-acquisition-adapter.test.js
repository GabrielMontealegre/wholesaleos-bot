'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'pdf-parse') return async () => ({ page_texts: [] });
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-ca-tax-default-'));
process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH = path.join(tmpDir, 'deal-board-doc-ledger.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'deal-board-snapshots.json');

const adapter = require('../modules/sources/ca-tax-default-notice-acquisition-adapter');
const registry = require('../modules/sources/source-adapter-registry');
const sourceCatalog = require('../modules/sources/source-catalog');
const freePublicDealBoard = require('../modules/research/free-public-deal-board');
const queueService = require('../modules/research/deal-board-queue-service');

const FIXTURE_PAGE = `
FALLBROOK
ASSESSOR'S
PARCEL NO. ASSESSEE'S NAME
PROPERTY
STREET ADDRESS
TOTAL AMOUNT
TO REDEEM BY
JUNE 30, 2026
105-093-26-00 FIGUEROA RICARDO M et al 01639 HILLCREST LN $3,716.72
597-241-11-00 VELASQUEZ GRACIELA EST OF 00000 CUPENO CT $54,819.90
187-540-52-27 KENNEDY DARLA 01299#27DEER SPRINGS RD $21,925.52
`;

function pageWithRow(pageNumber) {
  return `
FALLBROOK
105-093-2${pageNumber}-00 OWNER ${pageNumber} 0163${pageNumber} HILLCREST LN $${pageNumber},000.00
`;
}

function responseForBuffer(buffer) {
  return {
    ok: true,
    status: 200,
    url: adapter.profileForSourceId(adapter.SOURCE_ID).document_url,
    headers: { get: (name) => String(name).toLowerCase() === 'content-length' ? String(buffer.length) : 'application/pdf' },
    async arrayBuffer() { return buffer; }
  };
}

function fakeFetch(calls) {
  return async (url) => {
    calls.push(String(url));
    assert.strictEqual(String(url), adapter.profileForSourceId(adapter.SOURCE_ID).document_url);
    return responseForBuffer(Buffer.from('%PDF-fixture'));
  };
}

function fakePdfParse(pageTexts) {
  return async () => ({ page_texts: pageTexts, numpages: pageTexts.length, text: pageTexts.join('\n') });
}

(async () => {
  const profile = adapter.profileForSourceId(adapter.SOURCE_ID);
  assert.ok(profile);

  const parsed = adapter.parseTaxDefaultNoticeRowsFromText(FIXTURE_PAGE, profile);
  assert.strictEqual(parsed.length, 3);
  assert.deepStrictEqual(parsed[0], {
    apn: '105-093-26-00',
    owner_name: 'FIGUEROA RICARDO M et al',
    street_address: '01639 HILLCREST LN',
    city: 'Fallbrook',
    amount_to_redeem: '$3,716.72',
    source_text: '105-093-26-00 FIGUEROA RICARDO M et al 01639 HILLCREST LN $3,716.72'
  });
  assert.strictEqual(parsed[1].street_address, '00000 CUPENO CT');
  assert.strictEqual(parsed[2].street_address, '01299#27DEER SPRINGS RD', 'timeshare/# suffix street text must stay verbatim');

  const realStreetCandidate = adapter.candidateFromNoticeRow(parsed[0], profile, { captured_at: '2026-07-23T12:00:00.000Z' });
  assert.strictEqual(realStreetCandidate.normalized_address, '');
  assert.strictEqual(realStreetCandidate.property_address, '01639 HILLCREST LN, Fallbrook, CA');
  assert.strictEqual(realStreetCandidate.owner_name_candidate, 'FIGUEROA RICARDO M et al');
  assert.strictEqual(realStreetCandidate.parcel_or_account, '105-093-26-00');
  assert.strictEqual(realStreetCandidate.delinquent_redemption_amount, '$3,716.72');
  assert.ok(realStreetCandidate.risk_flags.includes('REDEMPTION_AMOUNT_NOT_PRICE_OR_ARV'));
  assert.strictEqual(realStreetCandidate.preview_only, true);
  assert.strictEqual(realStreetCandidate.should_ingest, false);
  assert.strictEqual(realStreetCandidate.not_a_saved_lead, true);

  const zeroStreetCandidate = adapter.candidateFromNoticeRow(parsed[1], profile, { captured_at: '2026-07-23T12:00:00.000Z' });
  assert.strictEqual(zeroStreetCandidate.normalized_address, '');
  assert.strictEqual(zeroStreetCandidate.property_address, '', '00000 street rows must stay APN-only');
  assert.strictEqual(zeroStreetCandidate.raw_address_text, '00000 CUPENO CT');
  assert.strictEqual(zeroStreetCandidate.parcel_or_account, '597-241-11-00');

  const board = await freePublicDealBoard.runFreePublicDealBoardPreview({
    market: { city: 'San Diego', county: 'San Diego', state: 'CA' },
    mock_source_adapter_results: [{
      source_id: adapter.SOURCE_ID,
      source_name: profile.source_name,
      source_family: profile.source_family,
      county: profile.county,
      state: profile.state,
      status: 'available',
      candidates: [realStreetCandidate, zeroStreetCandidate]
    }],
    enable_free_public_hunters: false,
    enable_official_browser_lookup: false,
    enable_screenshot_comp_evidence: false,
    enable_census_zip_resolution: false
  });
  assert.strictEqual(board.free_public_deals.length, 2);
  const reviewRow = board.free_public_deals.find((deal) => deal.source_row_reference === '105-093-26-00');
  assert.ok(reviewRow);
  assert.strictEqual(reviewRow.quality_bucket, 'NEEDS_ZIP_REVIEW');
  assert.strictEqual(reviewRow.partial_address, '01639 HILLCREST LN, Fallbrook, CA');
  assert.strictEqual(reviewRow.delinquent_redemption_amount, '$3,716.72');
  assert.ok(reviewRow.risk_flags.includes('REDEMPTION_AMOUNT_NOT_PRICE_OR_ARV'));
  assert.strictEqual(reviewRow.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
  assert.strictEqual(reviewRow.MAO_lock_state, 'MAO_LOCKED_NO_ARV');
  const apnOnlyRow = board.free_public_deals.find((deal) => deal.source_row_reference === '597-241-11-00');
  assert.ok(apnOnlyRow);
  assert.strictEqual(apnOnlyRow.quality_bucket, 'SOURCE_PROOF_ONLY');
  assert.strictEqual(apnOnlyRow.normalized_address, '');
  assert.strictEqual(apnOnlyRow.partial_address, '');

  const queued = await queueService.runDealBoardBatch({
    market: { city: 'San Diego', county: 'San Diego', state: 'CA' },
    limit: 25
  }, { preview_impl: async () => board });
  assert.deepStrictEqual(queued.rows.map((row) => row.source_row_reference).sort(), ['105-093-26-00', '597-241-11-00']);
  const queuedReview = queued.rows.find((row) => row.source_row_reference === '105-093-26-00');
  assert.strictEqual(queuedReview.delinquent_redemption_amount, '$3,716.72');
  assert.strictEqual(queuedReview.delinquent_redemption_amount_evidence_text, 'Delinquent redemption amount shown by San Diego TTC notice: $3,716.72');
  assert.strictEqual(queuedReview.owner_clue, 'FIGUEROA RICARDO M et al');

  const calls1 = [];
  const pageTexts = [FIXTURE_PAGE, pageWithRow(2), pageWithRow(3), pageWithRow(4), pageWithRow(5), pageWithRow(6)];
  const first = await adapter.runCaTaxDefaultNoticeAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'San Diego', county: 'San Diego', state: 'CA' },
    now: new Date('2026-07-23T12:00:00.000Z'),
    fetch_impl: fakeFetch(calls1),
    pdf_parse_impl: fakePdfParse(pageTexts)
  });
  assert.strictEqual(calls1.length, 1);
  assert.strictEqual(first.status, 'available');
  assert.strictEqual(first.diagnostics.pages_processed, 5);
  assert.strictEqual(first.diagnostics.pages_discovered, 6);
  assert.strictEqual(first.diagnostics.docs_processed, 5);
  assert.ok(first.candidates.length >= 5);

  const calls2 = [];
  const second = await adapter.runCaTaxDefaultNoticeAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'San Diego', county: 'San Diego', state: 'CA' },
    now: new Date('2026-07-23T12:20:00.000Z'),
    fetch_impl: fakeFetch(calls2),
    pdf_parse_impl: fakePdfParse(pageTexts)
  });
  assert.strictEqual(second.diagnostics.pages_processed, 1);
  assert.strictEqual(second.diagnostics.pages_ledger_skipped, 5);
  assert.strictEqual(second.candidates.length, 1);

  const calls3 = [];
  const third = await adapter.runCaTaxDefaultNoticeAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'San Diego', county: 'San Diego', state: 'CA' },
    now: new Date('2026-07-23T12:40:00.000Z'),
    fetch_impl: fakeFetch(calls3),
    pdf_parse_impl: fakePdfParse(pageTexts)
  });
  assert.strictEqual(third.diagnostics.inventory_rotation_reset_count, 1);
  assert.strictEqual(third.diagnostics.pages_processed, 5);

  const blocked = await adapter.runCaTaxDefaultNoticeAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'San Diego', county: 'San Diego', state: 'CA' },
    now: new Date('2026-08-01T12:00:00.000Z'),
    fetch_impl: async () => ({ ok: false, status: 403, url: profile.document_url, headers: { get: () => '0' }, async arrayBuffer() { return Buffer.from(''); } }),
    pdf_parse_impl: fakePdfParse(pageTexts)
  });
  assert.strictEqual(blocked.status, 'needs_manual_review');
  assert.strictEqual(blocked.blocked_reason, 'http_403');
  assert.strictEqual(blocked.candidate_count, 0);

  const registered = registry.adapterForSourceId(adapter.SOURCE_ID);
  assert.ok(registered);
  assert.strictEqual(registered.adapter_id, 'ca_tax_default_notice_acquisition_adapter');
  assert.deepStrictEqual(
    sourceCatalog.buildSourceCatalog({ city: 'San Diego', county: 'San Diego', state: 'CA' }).map((source) => source.source_id),
    [adapter.SOURCE_ID]
  );
  assert.deepStrictEqual(queueService.defaultQueueSourceIdsForMarket({ city: 'San Diego', county: 'San Diego', state: 'CA' }), [adapter.SOURCE_ID]);
  assert.deepStrictEqual(queueService.defaultQueueSourceIdsForMarket({ city: 'Cleveland', county: 'Cuyahoga', state: 'OH' }), []);
  assert.deepStrictEqual(queueService.defaultQueueSourceIdsForMarket({ city: 'Detroit', county: 'Wayne', state: 'MI' }), ['mi_wayne_detroit_land_bank_listings']);
  assert.ok(queueService.defaultQueueSourceIdsForMarket({ city: 'Dallas', county: 'Dallas', state: 'TX' }).includes('tx_dallas_county_clerk_foreclosure_notices'));

  console.log('ca-tax-default-notice-acquisition-adapter.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
