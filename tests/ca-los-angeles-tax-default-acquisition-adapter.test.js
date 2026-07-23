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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-ca-la-'));
process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH = path.join(tmpDir, 'deal-board-doc-ledger.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'deal-board-snapshots.json');

const adapter = require('../modules/sources/ca-los-angeles-tax-default-acquisition-adapter');
const registry = require('../modules/sources/source-adapter-registry');
const sourceCatalog = require('../modules/sources/source-catalog');
const freePublicDealBoard = require('../modules/research/free-public-deal-board');
const queueService = require('../modules/research/deal-board-queue-service');

const FIXTURE_PAGE = [
  '2026A RESOLUTION LIST',
  'ONLINE AUCTION SALE',
  'ITEM AIN MIN BID IMP NSB# LEGAL DESCRIPTION LOCATION PROPERTY ADDRESS',
  '1 2006-010-026 $3,083 539 LICENSED SURVEYOR\'S MAP AS PER BK 25 PG 28 OF L S LOT 26 BLK O COUNTY OF LOS ANGELES VACANT LOT',
  '6 2020-019-012 $14,276 Y 539 TRACT NO 26315 LOT 16 CITY-LOS ANGELES 8210 BOBBYBOYAR AVE LOS ANGELES CA 91304-3507',
  '8 2023-013-005 $40,183 Y 537 TRACT # 8197 LOT 53 CITY-LOS ANGELES 22138 RUNNYMEDE ST LOS ANGELES CA 91303-1112',
  '17 2048-013-089 $38,911 Y 537 *TR=35020 CONDOMINIUM*UNIT 190 CITY-AGOURA HILL 28915 THOUSAND OAKS BLVD AGOURA HILLS CA 91301-2108',
  '18 2049-016-027 $235,258 Y 537 LOT COM AT MOST W COR OF LOT 6 L A C A MAP NO 69 TH N 33 10\'04" E 317.98 FT TH N 62 08\'54" E 61.93 FT TH N 33 10\'04" E 40.42 FT TO MOST S COR OF LOT 9 SD TR TH W TO MOST N COR OF LAND DESC AS PAR 1 IN OR 43018-266 TO LEO B GORCEY TH SE ON NE LINE OF SD LAND 323.65 FT TO BEG PART OF LOT 8 L A CO ASSESSOR MAP NO 69 AND PART OF LOT 43 RECORD OF SURVEY AS PER BK 65 P 28 OF R S COUNTY OF LOS ANGELES 23760 OAKFIELD RD HIDDEN HILLS CA 91302-2412'
].join('\n');

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
  assert.strictEqual(profile.county, 'Los Angeles');
  assert.strictEqual(profile.state, 'CA');

  const parsed = adapter.parseAuctionBookRowsFromText(FIXTURE_PAGE, profile);
  assert.strictEqual(parsed.length, 5);
  assert.strictEqual(parsed[0].apn, '2006-010-026');
  assert.strictEqual(parsed[0].property_address, '');
  assert.strictEqual(parsed[0].city, '');
  assert.ok(parsed[0].source_text.includes('VACANT LOT'));
  assert.strictEqual(parsed[1].property_address, '8210 Bobbyboyar Ave, Los Angeles, CA 91304');
  assert.strictEqual(parsed[2].property_address, '22138 Runnymede St, Los Angeles, CA 91303');
  assert.strictEqual(parsed[3].property_address, '28915 Thousand Oaks Blvd, Agoura Hills, CA 91301');
  assert.strictEqual(parsed[4].property_address, '');
  assert.strictEqual(parsed[4].apn, '2049-016-027');

  const addressCandidate = adapter.candidateFromAuctionRow(parsed[1], profile, { captured_at: '2026-07-23T12:00:00.000Z' });
  assert.strictEqual(addressCandidate.normalized_address, '8210 Bobbyboyar Ave, Los Angeles, CA 91304');
  assert.strictEqual(addressCandidate.property_address, '8210 Bobbyboyar Ave, Los Angeles, CA 91304');
  assert.strictEqual(addressCandidate.listed_price, '$14,276');
  assert.strictEqual(addressCandidate.listed_price_evidence_text, 'Displayed minimum bid shown in auction book: $14,276');
  assert.ok(addressCandidate.risk_flags.includes('LISTED_PRICE_NOT_ARV_OR_MAO'));
  assert.strictEqual(addressCandidate.preview_only, true);
  assert.strictEqual(addressCandidate.should_ingest, false);
  assert.strictEqual(addressCandidate.not_a_saved_lead, true);

  const apnOnlyCandidate = adapter.candidateFromAuctionRow(parsed[0], profile, { captured_at: '2026-07-23T12:00:00.000Z' });
  assert.strictEqual(apnOnlyCandidate.normalized_address, '');
  assert.strictEqual(apnOnlyCandidate.property_address, '');
  assert.strictEqual(apnOnlyCandidate.raw_address_text.includes('VACANT LOT'), true);
  assert.strictEqual(apnOnlyCandidate.parcel_or_account, '2006-010-026');
  assert.strictEqual(apnOnlyCandidate.not_a_saved_lead, true);

  const board = await freePublicDealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
    mock_source_adapter_results: [{
      source_id: adapter.SOURCE_ID,
      source_name: profile.source_name,
      source_family: profile.source_family,
      county: profile.county,
      state: profile.state,
      status: 'available',
      candidates: [addressCandidate, apnOnlyCandidate]
    }],
    enable_free_public_hunters: false,
    enable_official_browser_lookup: false,
    enable_screenshot_comp_evidence: false,
    enable_census_zip_resolution: false
  });
  assert.strictEqual(board.free_public_deals.length, 2);
  const reviewRow = board.free_public_deals.find((deal) => deal.source_row_reference === '2006-010-026');
  assert.ok(reviewRow);
  assert.strictEqual(reviewRow.quality_bucket, 'SOURCE_PROOF_ONLY');
  const addressRow = board.free_public_deals.find((deal) => deal.source_row_reference === '2020-019-012');
  assert.ok(addressRow);
  assert.strictEqual(addressRow.quality_bucket, 'INSPECT_NOW');
  assert.strictEqual(addressRow.listed_price, '$14,276');
  assert.strictEqual(addressRow.program, '2026A Online Auction');
  assert.strictEqual(addressRow.source_document_url, profile.document_url);
  assert.strictEqual(addressRow.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
  assert.strictEqual(addressRow.MAO_lock_state, 'MAO_LOCKED_NO_ARV');

  const queued = await queueService.runDealBoardBatch({
    market: { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
    limit: 25
  }, { preview_impl: async () => board });
  assert.strictEqual(queued.rows.length, 2);
  assert.strictEqual(queued.rows[0].source_document_url, profile.document_url);
  assert.strictEqual(queued.rows[0].listed_price, '$14,276');
  assert.strictEqual(queued.rows[0].listed_price_evidence_text, 'Displayed minimum bid shown in auction book: $14,276');
  assert.strictEqual(queued.rows[0].program, '2026A Online Auction');
  assert.strictEqual(queued.rows[0].preview_only, true);
  assert.strictEqual(queued.rows[0].not_a_saved_lead, true);

  const mainLedgerPath = process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH;
  process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH = path.join(tmpDir, 'orchestrator-ledger.json');
  const acquisitionCalls = [];
  const acquisition = await require('../modules/research/source-acquisition-orchestrator').runAcquisitionCore({
    city: 'Los Angeles', county: 'Los Angeles', state: 'CA',
    market: { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
    source_ids: [adapter.SOURCE_ID],
    discovery_batch_id: 'los-angeles-normalization-integration'
  }, {
    now: new Date('2026-07-23T12:00:00.000Z'),
    fetch_impl: fakeFetch(acquisitionCalls),
    pdf_parse_impl: fakePdfParse([FIXTURE_PAGE, FIXTURE_PAGE, FIXTURE_PAGE, FIXTURE_PAGE, FIXTURE_PAGE, FIXTURE_PAGE, FIXTURE_PAGE])
  });
  process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH = mainLedgerPath;
  assert.deepStrictEqual(acquisitionCalls, [profile.document_url]);
  assert.ok(acquisition.candidates.length > 0);
  assert.ok(acquisition.candidates.every((item) => item.not_a_saved_lead === true), 'orchestrator candidates must retain the marker after both normalization passes');
  assert.ok(acquisition.cards.every((card) => card.not_a_saved_lead === true && card.property_candidate.not_a_saved_lead === true));

  const calls1 = [];
  const first = await adapter.runCaLosAngelesTaxDefaultAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
    now: new Date('2026-07-23T12:00:00.000Z'),
    fetch_impl: fakeFetch(calls1),
    pdf_parse_impl: fakePdfParse([
      FIXTURE_PAGE,
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-013'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-014'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-015'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-016'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-017'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-018')
    ])
  });
  assert.strictEqual(first.status, 'available');
  assert.strictEqual(first.candidate_count > 0, true);
  assert.deepStrictEqual(calls1, [profile.document_url], 'the adapter fetches the single public PDF once');
  assert.strictEqual(first.diagnostics.pages_processed, 5);
  assert.strictEqual(first.diagnostics.pages_discovered, 7);
  assert.strictEqual(first.diagnostics.docs_processed, 5);

  const calls2 = [];
  const second = await adapter.runCaLosAngelesTaxDefaultAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
    now: new Date('2026-07-23T12:20:00.000Z'),
    fetch_impl: fakeFetch(calls2),
    pdf_parse_impl: fakePdfParse([
      FIXTURE_PAGE,
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-013'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-014'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-015'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-016'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-017'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-018')
    ])
  });
  assert.strictEqual(second.diagnostics.pages_processed, 2);
  assert.strictEqual(second.diagnostics.pages_ledger_skipped, 5);

  const calls3 = [];
  const third = await adapter.runCaLosAngelesTaxDefaultAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
    now: new Date('2026-07-23T12:40:00.000Z'),
    fetch_impl: fakeFetch(calls3),
    pdf_parse_impl: fakePdfParse([
      FIXTURE_PAGE,
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-013'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-014'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-015'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-016'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-017'),
      FIXTURE_PAGE.replace(/2020-019-012/g, '2020-019-018')
    ])
  });
  assert.strictEqual(third.diagnostics.inventory_rotation_reset_count, 1);
  assert.strictEqual(third.diagnostics.pages_processed, 5);

  const blocked = await adapter.runCaLosAngelesTaxDefaultAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
    now: new Date('2026-08-01T12:00:00.000Z'),
    fetch_impl: async () => ({ ok: false, status: 403, url: profile.document_url, headers: { get: () => '0' }, async arrayBuffer() { return Buffer.from(''); } }),
    pdf_parse_impl: fakePdfParse([FIXTURE_PAGE])
  });
  assert.strictEqual(blocked.status, 'needs_manual_review');
  assert.strictEqual(blocked.blocked_reason, 'http_403');
  assert.strictEqual(blocked.candidate_count, 0);

  const timedOut = await adapter.runCaLosAngelesTaxDefaultAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
    now: new Date('2026-09-01T12:00:00.000Z'),
    fetch_impl: async () => {
      const error = new Error('timed out');
      error.name = 'AbortError';
      throw error;
    }
  });
  assert.strictEqual(timedOut.status, 'needs_manual_review');
  assert.strictEqual(timedOut.blocked_reason, 'fetch_timeout');

  const registered = registry.adapterForSourceId(adapter.SOURCE_ID);
  assert.ok(registered);
  assert.strictEqual(registered.adapter_id, 'ca_los_angeles_tax_default_acquisition_adapter');
  const laCatalog = sourceCatalog.buildSourceCatalog({ city: 'Los Angeles', county: 'Los Angeles', state: 'CA' });
  assert.deepStrictEqual(laCatalog.map((item) => item.source_id), [adapter.SOURCE_ID]);
  assert.strictEqual(laCatalog[0].official_source, true);
  assert.deepStrictEqual(sourceCatalog.buildSourceCatalog({ city: 'Cleveland', county: 'Cuyahoga', state: 'OH' }), []);
  assert.deepStrictEqual(queueService.defaultQueueSourceIdsForMarket({ city: 'Los Angeles', county: 'Los Angeles', state: 'CA' }), [adapter.SOURCE_ID]);
  assert.deepStrictEqual(queueService.defaultQueueSourceIdsForMarket({ city: 'Detroit', county: 'Wayne', state: 'MI' }), ['mi_wayne_detroit_land_bank_listings']);
  assert.ok(queueService.defaultQueueSourceIdsForMarket({ city: 'Dallas', county: 'Dallas', state: 'TX' }).includes('tx_dallas_county_clerk_foreclosure_notices'));

  console.log('ca-los-angeles-tax-default-acquisition-adapter.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
