'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'pdf-parse') return async () => ({ text: '' });
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-mi-land-bank-'));
process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH = path.join(tmpDir, 'deal-board-doc-ledger.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'deal-board-snapshots.json');

const adapter = require('../modules/sources/mi-land-bank-acquisition-adapter');
const registry = require('../modules/sources/source-adapter-registry');
const sourceCatalog = require('../modules/sources/source-catalog');
const freePublicDealBoard = require('../modules/research/free-public-deal-board');
const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');
const queueService = require('../modules/research/deal-board-queue-service');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'https://buildingdetroit.org/properties',
    async text() { return typeof payload === 'string' ? payload : JSON.stringify(payload); }
  };
}

function sourceListing(index, overrides = {}) {
  return Object.assign({
    property_name: `${13000 + index} Test Street`,
    property_id: String(1000 + index),
    property_identifier: `${13000 + index}-test-street`,
    address: `${13000 + index} Test Street, Detroit, MI 48227`,
    city: 'Detroit',
    state: 'MI',
    zipcode: '48227',
    price: '1000.00',
    name: 'Own It Now',
    category_type: 'Own It Now',
    sale_date: '2026-07-13',
    offer_deadline: '',
    auction_closing_time: '',
    marketable_feature: 'Residential structure',
    bedrooms: '3',
    bathrooms: '1',
    area: '1200'
  }, overrides);
}

function fixtureFetch(totalPages, calls) {
  return async (url, options) => {
    assert.strictEqual(String(url), 'https://buildingdetroit.org/properties');
    assert.strictEqual(options.method, 'POST');
    const body = new URLSearchParams(options.body);
    assert.strictEqual(body.get('isJson'), '1');
    assert.strictEqual(body.get('limit'), '5');
    const page = Number(body.get('page'));
    calls.push(page);
    const listings = Array.from({ length: 5 }, (_, offset) => sourceListing((page - 1) * 5 + offset + 1));
    if (page === 1) listings[0] = sourceListing(1, {
      property_name: '7000 Vacant Lot Ave',
      property_identifier: '7000-vacant-lot-ave',
      address: '7000 Vacant Lot Ave, Detroit, MI 48210',
      zipcode: '48210',
      price: '250.00',
      name: 'Auction',
      category_type: 'Auction',
      sale_date: '',
      offer_deadline: '07/31/2026',
      auction_closing_time: '2026-07-30 17:00:00',
      marketable_feature: 'Vacant Land',
      bedrooms: '', bathrooms: '', area: ''
    });
    return jsonResponse({
      pagination: { last_page: totalPages, total: totalPages * 5 },
      listings
    });
  };
}

(async () => {
  const profile = adapter.profileForSourceId(adapter.SOURCE_ID);
  const candidate = adapter.candidateFromListing(sourceListing(1, {
    property_name: '13905 Sussex',
    property_identifier: '13905-sussex',
    address: '13905 Sussex Detroit MI 48227',
    name: 'Auction',
    category_type: 'Auction',
    sale_date: '2026-07-13',
    offer_deadline: '2026-07-15',
    auction_closing_time: '2026-07-16 00:15:05'
  }), profile, { captured_at: '2026-07-13T12:00:00.000Z' });
  assert.ok(candidate);
  assert.strictEqual(candidate.normalized_address, '13905 Sussex, Detroit, MI 48227');
  assert.strictEqual(candidate.listed_price, '$1,000.00');
  assert.strictEqual(candidate.program, 'Auction');
  assert.strictEqual(candidate.source_document_url, 'https://buildingdetroit.org/properties/13905-sussex');
  assert.strictEqual(candidate.event_date, '2026-07-16 00:15:05');
  assert.strictEqual(candidate.listing_date_if_visible, '2026-07-13');
  assert.strictEqual(candidate.offer_deadline_if_visible, '2026-07-15');
  assert.strictEqual(candidate.auction_closing_at_if_visible, '2026-07-16 00:15:05');
  assert.ok(candidate.risk_flags.includes('LISTED_PRICE_NOT_ARV_OR_MAO'));
  assert.strictEqual(candidate.preview_only, true);
  assert.strictEqual(candidate.should_ingest, false);
  assert.strictEqual(candidate.not_a_saved_lead, true);
  assert.strictEqual(candidate.source_structured_address_verified, true);

  const board = await freePublicDealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    mock_source_adapter_results: [{
      source_id: adapter.SOURCE_ID,
      source_name: profile.source_name,
      source_family: profile.source_family,
      status: 'available',
      candidates: [candidate]
    }],
    enable_free_public_hunters: false,
    enable_official_browser_lookup: false,
    enable_screenshot_comp_evidence: false,
    enable_census_zip_resolution: false
  });
  assert.strictEqual(board.free_public_deals.length, 1);
  assert.strictEqual(board.free_public_deals[0].quality_bucket, 'INSPECT_NOW');
  assert.strictEqual(board.free_public_deals[0].normalized_address, '13905 Sussex, Detroit, MI 48227');
  assert.strictEqual(board.free_public_deals[0].listed_price, '$1,000.00');
  assert.strictEqual(board.free_public_deals[0].program, 'Auction');
  assert.strictEqual(board.free_public_deals[0].sale_date_or_event_date, '2026-07-16 00:15:05');
  assert.strictEqual(board.free_public_deals[0].listing_date_if_visible, '2026-07-13');
  assert.strictEqual(board.free_public_deals[0].offer_deadline_if_visible, '2026-07-15');
  assert.strictEqual(board.free_public_deals[0].auction_closing_at_if_visible, '2026-07-16 00:15:05');
  assert.strictEqual(board.free_public_deals[0].property_kind_if_visible, 'structure');
  assert.strictEqual(board.free_public_deals[0].ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
  const queued = await queueService.runDealBoardBatch({
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    limit: 25
  }, { preview_impl: async () => board });
  assert.strictEqual(queued.rows[0].sale_date_or_event_date, '2026-07-16 00:15:05');
  assert.strictEqual(queued.rows[0].listing_date_if_visible, '2026-07-13');
  assert.strictEqual(queued.rows[0].offer_deadline_if_visible, '2026-07-15');
  assert.strictEqual(queued.rows[0].auction_closing_at_if_visible, '2026-07-16 00:15:05');

  const mainLedgerPath = process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH;
  process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH = path.join(tmpDir, 'orchestrator-ledger.json');
  const acquisitionCalls = [];
  const acquisition = await sourceAcquisitionOrchestrator.runAcquisitionCore({
    city: 'Detroit', county: 'Wayne', state: 'MI',
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    source_ids: [adapter.SOURCE_ID],
    discovery_batch_id: 'detroit-normalization-integration'
  }, {
    now: new Date('2026-07-13T12:00:00.000Z'),
    fetch_impl: fixtureFetch(1, acquisitionCalls)
  });
  process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH = mainLedgerPath;
  assert.deepStrictEqual(acquisitionCalls, [1]);
  assert.ok(acquisition.candidates.length > 0);
  assert.ok(acquisition.candidates.every((item) => item.not_a_saved_lead === true), 'orchestrator candidates must retain the marker after both normalization passes');
  assert.ok(acquisition.cards.every((card) => card.not_a_saved_lead === true && card.property_candidate.not_a_saved_lead === true));

  const pageOneLedgerUrl = `${profile.api_url}?page=1&limit=5`;
  const unrelatedCountyDocumentUrl = 'https://example.gov/foreclosure/notice-1.pdf';
  const mixedLedger = { documents: {} };
  const ledgerMonth = '2026-07';
  const doneEntry = (documentUrl) => ({ document_url: documentUrl, posting_month: ledgerMonth, last_status: 'done' });
  mixedLedger.documents[`${ledgerMonth}|${pageOneLedgerUrl.toLowerCase()}`] = doneEntry(pageOneLedgerUrl);
  mixedLedger.documents[`${ledgerMonth}|${unrelatedCountyDocumentUrl}`] = doneEntry(unrelatedCountyDocumentUrl);
  assert.strictEqual(adapter.resetCompletedInventoryCycle(mixedLedger, profile, 1, ledgerMonth), 1);
  assert.ok(mixedLedger.documents[`${ledgerMonth}|${unrelatedCountyDocumentUrl}`], 'inventory reset must not remove county document ledger entries');

  const calls1 = [];
  const first = await adapter.runMiLandBankAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    now: new Date('2026-07-13T12:00:00.000Z'),
    fetch_impl: fixtureFetch(7, calls1)
  });
  assert.strictEqual(first.status, 'available');
  assert.strictEqual(first.candidate_count, 25);
  assert.deepStrictEqual(calls1, [1, 2, 3, 4, 5]);
  assert.strictEqual(first.diagnostics.pages_processed, 5);
  assert.strictEqual(first.diagnostics.pages_discovered, 7);
  const vacant = first.candidates.find((item) => /7000 Vacant Lot Ave/.test(item.normalized_address));
  assert.ok(vacant);
  assert.strictEqual(vacant.vacant_lot_if_visible, true);
  assert.strictEqual(vacant.property_kind_if_visible, 'vacant_lot');
  assert.strictEqual(vacant.listed_price, '$250.00');
  assert.strictEqual(vacant.event_date, '2026-07-30 17:00:00');
  assert.strictEqual(vacant.offer_deadline_if_visible, '07/31/2026');
  assert.strictEqual(vacant.auction_closing_at_if_visible, '2026-07-30 17:00:00');

  const calls2 = [];
  const second = await adapter.runMiLandBankAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    now: new Date('2026-07-13T12:20:00.000Z'),
    fetch_impl: fixtureFetch(7, calls2)
  });
  assert.strictEqual(second.candidate_count, 10);
  assert.deepStrictEqual(calls2, [1, 6, 7], 'second batch must rotate to the remaining inventory pages');
  assert.strictEqual(second.diagnostics.pages_ledger_skipped, 5);
  assert.strictEqual(second.diagnostics.inventory_rotation_reset_count, 0);
  assert.ok(second.candidates.every((item) => !first.candidates.some((seen) => seen.source_document_url === item.source_document_url)));

  const calls3 = [];
  const third = await adapter.runMiLandBankAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    now: new Date('2026-07-13T12:40:00.000Z'),
    fetch_impl: fixtureFetch(7, calls3)
  });
  assert.strictEqual(third.candidate_count, 25);
  assert.deepStrictEqual(calls3, [1, 2, 3, 4, 5], 'third batch must begin a new bounded inventory cycle');
  assert.strictEqual(third.diagnostics.inventory_rotation_reset_count, 1);

  const blocked = await adapter.runMiLandBankAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    now: new Date('2026-08-01T12:00:00.000Z'),
    fetch_impl: async () => jsonResponse('<html>Verify you are human</html>', 403)
  });
  assert.strictEqual(blocked.status, 'needs_manual_review');
  assert.strictEqual(blocked.blocked_reason, 'challenge_or_access_gate');
  assert.strictEqual(blocked.candidate_count, 0);

  const timedOut = await adapter.runMiLandBankAcquisitionAdapter({
    source_id: adapter.SOURCE_ID,
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
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
  assert.strictEqual(registered.adapter_id, 'mi_land_bank_acquisition_adapter');
  const detroitCatalog = sourceCatalog.buildSourceCatalog({ city: 'Detroit', county: 'Wayne', state: 'MI' });
  assert.deepStrictEqual(detroitCatalog.map((item) => item.source_id), [adapter.SOURCE_ID]);
  assert.strictEqual(detroitCatalog[0].official_source, true);
  assert.deepStrictEqual(sourceCatalog.buildSourceCatalog({ city: 'Cleveland', county: 'Cuyahoga', state: 'OH' }), []);

  const ledgerFiles = fs.readdirSync(tmpDir).filter((name) => /deal-board-doc-ledger/.test(name));
  assert.ok(ledgerFiles.length >= 1, 'rotation must use the snapshot ledger directory');
  assert.ok(ledgerFiles.every((name) => !/lead/i.test(name)), 'ledger must never be a saved-lead store');
  console.log('mi-land-bank-acquisition-adapter.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
