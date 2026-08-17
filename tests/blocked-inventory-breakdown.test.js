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

const breakdown = require('../modules/research/blocked-inventory-breakdown');

function row(overrides) {
  return Object.assign({
    queue_key: 'row-default',
    normalized_address: '1 Main St, Dallas, TX 75201',
    row_state: 'LOCKED',
    row_state_reason: 'The property is identified, but owner or taxpayer identity is not yet sourced.',
    quality_bucket: 'INSPECT_NOW',
    lifecycle_status: { status: 'AGING', quarantined: false },
    source_document_url: 'https://county.example/notice.pdf'
  }, overrides || {});
}

function store(rows) {
  return {
    version: 1,
    store_kind: 'deal_board_snapshots_not_saved_leads',
    markets: {
      'dallas|dallas|tx': {
        market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
        rows
      }
    }
  };
}

function subreasonTotal(counts) {
  return Object.values(counts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

(async () => {
  const rows = [
    row({
      queue_key: 'research-1',
      normalized_address: '',
      quality_bucket: 'SOURCE_PROOF_ONLY',
      lifecycle_status: { status: 'SALE_PASSED', quarantined: true }
    }),
    row({
      queue_key: 'duplicate-1',
      normalized_address: '',
      lifecycle_status: { status: 'SUPERSEDED_DUPLICATE', quarantined: true }
    }),
    row({
      queue_key: 'unverifiable-1',
      normalized_address: '',
      lifecycle_status: { status: 'UNVERIFIABLE', quarantined: true }
    }),
    row({
      queue_key: 'sale-passed-1',
      normalized_address: '',
      lifecycle_status: { status: 'SALE_PASSED', quarantined: true },
      sale_date_iso: '2026-08-01',
      times_seen: 3,
      filing_period: '2026-07'
    }),
    row({
      queue_key: 'missing-address-1',
      normalized_address: '',
      lifecycle_status: { status: 'AGING', quarantined: false }
    }),
    row({
      queue_key: 'missing-identity-1',
      normalized_address: '2 Main St, Dallas, TX 75201',
      lifecycle_status: { status: 'AGING', quarantined: false }
    }),
    row({
      queue_key: 'locked-other-1',
      normalized_address: '3 Main St, Dallas, TX 75201',
      row_state_reason: 'Manual engineering review required.',
      owner_record: { owner_name: 'Public Owner LLC', source_kind: 'official_public_record' },
      lifecycle_status: { status: 'AGING', quarantined: false }
    }),
    row({
      queue_key: 'call-ready-not-inventory',
      row_state: 'CALL_READY',
      row_state_reason: 'A source-linked public phone route is visible.',
      free_contact_routes: [{ route_kind: 'phone', value: '555-0100', source_kind: 'public_source_document' }],
      lifecycle_status: { status: 'FRESH', quarantined: false }
    }),
    row({
      queue_key: 'call-ready-prose-only',
      row_state: 'CALL_READY',
      quality_bucket: 'INSPECT_NOW',
      contact_status: 'CALL_READY',
      next_best_action: 'Research 3 verified sold comps before evaluating an offer.',
      source_status: 'VISIBLE',
      lifecycle_status: { status: 'FRESH', quarantined: false }
    }),
    row({
      queue_key: 'call-ready-source-proof-only',
      row_state: 'CALL_READY',
      quality_bucket: 'SOURCE_PROOF_ONLY',
      contact_status: 'CALL_READY',
      lifecycle_status: { status: 'FRESH', quarantined: false }
    })
  ];

  const direct = rows.map((item) => [item.queue_key, breakdown.classifyInventoryRow(item)]);
  assert.deepStrictEqual(direct, [
    ['research-1', 'RESEARCH_REFERENCE_BAD_SKIPPED'],
    ['duplicate-1', 'SUPERSEDED_DUPLICATE'],
    ['unverifiable-1', 'UNVERIFIABLE'],
    ['sale-passed-1', 'SALE_PASSED'],
    ['missing-address-1', 'LOCKED_NO_COMPLETE_ADDRESS'],
    ['missing-identity-1', 'LOCKED_NO_SOURCED_IDENTITY'],
    ['locked-other-1', 'LOCKED_OTHER'],
    ['call-ready-not-inventory', null],
    ['call-ready-prose-only', null],
    ['call-ready-source-proof-only', null]
  ]);

  const result = breakdown.buildBlockedInventoryBreakdownFromStore(store(rows));
  const market = result.markets[0];
  assert.strictEqual(market.total_inventory, 7);
  assert.strictEqual(subreasonTotal(market.counts), market.total_inventory);
  assert.strictEqual(result.total.total_inventory, 7);
  assert.strictEqual(subreasonTotal(result.total.counts), result.total.total_inventory);
  assert.strictEqual(market.counts.SALE_PASSED, 1);
  assert.strictEqual(market.counts.LOCKED_NO_COMPLETE_ADDRESS, 1);
  assert.deepStrictEqual(market.sale_passed.times_seen_distribution, { 3: 1 });
  assert.deepStrictEqual(market.sale_passed.filing_period_distribution, { '2026-07': 1 });
  assert.deepStrictEqual(market.locked_other_reason_samples, ['Manual engineering review required.']);

  const mixedRows = [
    row({
      queue_key: 'blocked-source-proof',
      normalized_address: '',
      quality_bucket: 'SOURCE_PROOF_ONLY',
      lifecycle_status: { status: 'SALE_PASSED', quarantined: true }
    }),
    row({
      queue_key: 'blocked-missing-address',
      normalized_address: '',
      lifecycle_status: { status: 'AGING', quarantined: false }
    }),
    row({
      queue_key: 'call-ready-prose-only',
      row_state: 'CALL_READY',
      quality_bucket: 'INSPECT_NOW',
      contact_status: 'CALL_READY',
      next_best_action: 'Research 3 verified sold comps before evaluating an offer.',
      lifecycle_status: { status: 'FRESH', quarantined: false }
    }),
    row({
      queue_key: 'call-ready-source-proof-only',
      row_state: 'CALL_READY',
      quality_bucket: 'SOURCE_PROOF_ONLY',
      contact_status: 'CALL_READY',
      lifecycle_status: { status: 'FRESH', quarantined: false }
    })
  ];
  const mixedDirect = mixedRows.map((item) => [item.queue_key, breakdown.classifyInventoryRow(item)]);
  assert.deepStrictEqual(mixedDirect, [
    ['blocked-source-proof', 'RESEARCH_REFERENCE_BAD_SKIPPED'],
    ['blocked-missing-address', 'LOCKED_NO_COMPLETE_ADDRESS'],
    ['call-ready-prose-only', null],
    ['call-ready-source-proof-only', null]
  ]);
  const mixedResult = breakdown.buildBlockedInventoryBreakdownFromStore(store(mixedRows));
  const mixedMarket = mixedResult.markets[0];
  assert.strictEqual(mixedMarket.total_inventory, 2);
  assert.strictEqual(subreasonTotal(mixedMarket.counts), mixedMarket.total_inventory);
  assert.deepStrictEqual(
    Object.values(mixedMarket.example_queue_keys).flat().sort(),
    ['blocked-missing-address', 'blocked-source-proof']
  );

  const healthy = breakdown.buildBlockedInventoryBreakdownFromStore(store(rows.filter((item) => item.queue_key !== 'locked-other-1')));
  assert.strictEqual(healthy.markets[0].counts.LOCKED_OTHER, 0);
  assert.deepStrictEqual(healthy.markets[0].locked_other_reason_samples, []);

  const serialized = JSON.stringify(result);
  for (const forbidden of ['normalized_address', 'owner_name', 'taxpayer_name', 'mailing_address', 'free_contact_routes']) {
    assert.ok(!serialized.includes(forbidden), `breakdown payload must not include ${forbidden}`);
  }

  const payloadSafetyRows = [
    row({
      queue_key: 'payload-safety-1',
      normalized_address: '123 Oak St, Detroit, MI 48201',
      owner_name: 'WELLS FARGO BANK NA TAX SERVICE ESCROW DEPT',
      taxpayer_name: 'WELLS FARGO BANK NA',
      mailing_address: 'PO BOX 1629 MINNEAPOLIS MN 55480',
      free_contact_routes: [{ route_kind: 'phone', value: '313-555-0100', source_kind: 'public_source_document' }],
      lifecycle_status: { status: 'AGING', quarantined: false }
    })
  ];
  const payloadSafetyResult = breakdown.buildBlockedInventoryBreakdownFromStore(store(payloadSafetyRows));
  const payloadSafetySerialized = JSON.stringify(payloadSafetyResult);
  for (const forbidden of [
    '123 Oak St, Detroit, MI 48201',
    'WELLS FARGO BANK NA TAX SERVICE ESCROW DEPT',
    'WELLS FARGO BANK NA',
    'PO BOX 1629 MINNEAPOLIS MN 55480',
    '313-555-0100'
  ]) {
    assert.ok(!payloadSafetySerialized.includes(forbidden), `breakdown payload must not include ${forbidden}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-blocked-breakdown-'));
  process.env.DB_PATH = path.join(tmpDir, 'db.json');
  process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'deal-board-snapshots.json');
  fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));
  fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify(store([
    row({ queue_key: 'cache-a', normalized_address: '', lifecycle_status: { status: 'AGING', quarantined: false } })
  ]), null, 2));
  const queueService = require('../modules/research/deal-board-queue-service');
  const beforeBytes = fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8');
  const first = queueService.latestDealBoardSnapshot({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' } });
  const second = queueService.latestDealBoardSnapshot({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' } });
  const afterBytes = fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8');
  assert.strictEqual(afterBytes, beforeBytes, 'latest breakdown computation must not mutate the snapshot file');
  assert.strictEqual(
    first.blocked_inventory_breakdown.generated_at,
    second.blocked_inventory_breakdown.generated_at,
    'unchanged snapshot mtime should reuse the cached breakdown'
  );
  assert.strictEqual(first.blocked_inventory_breakdown.total.counts.LOCKED_NO_COMPLETE_ADDRESS, 1);

  fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify(store([
    row({ queue_key: 'cache-a', normalized_address: '', lifecycle_status: { status: 'AGING', quarantined: false } }),
    row({ queue_key: 'cache-b', normalized_address: '', lifecycle_status: { status: 'AGING', quarantined: false } })
  ]), null, 2));
  const future = new Date(Date.now() + 2000);
  fs.utimesSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, future, future);
  const third = queueService.latestDealBoardSnapshot({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' } });
  assert.strictEqual(third.blocked_inventory_breakdown.total.counts.LOCKED_NO_COMPLETE_ADDRESS, 2);

  console.log('blocked inventory breakdown tests passed');
})();
