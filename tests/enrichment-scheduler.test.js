'use strict';

const assert = require('assert');
const scheduler = require('../modules/research/enrichment-scheduler');
const ledger = require('../modules/research/enrichment-ledger');

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({
    queue_key: `row-${String(index).padStart(2, '0')}`,
    normalized_address: `${1000 + index} Test St, San Antonio, TX 78201`,
    source_document_url: 'https://bexar.org/doc.pdf',
    first_seen_at: `2026-08-${String(1 + (index % 9)).padStart(2, '0')}T00:00:00Z`,
    last_seen_at: '2026-08-10T00:00:00Z'
  }));
}

function recordBoardSkipRollup(row, lane, reason, nowIso) {
  const existing = row.enrichment_skip_rollups || {};
  const previous = existing[lane] || {};
  row.enrichment_skip_rollups = Object.assign({}, existing, {
    [lane]: {
      last_skipped_at: nowIso,
      skipped_count: (Number(previous.skipped_count) || 0) + 1,
      last_skip_reason: reason
    }
  });
}

(() => {
  const queueRows = rows(61);
  const touched = new Set();
  let slotsSpentRehuntingBeforeSweep = 0;
  let zeroSelectionAfterSweep = false;
  const now = '2026-08-11T00:00:00Z';

  for (let batch = 0; batch < 24; batch += 1) {
    const out = scheduler.selectRowsForEnrichment(queueRows, {
      lane: 'public_search',
      limit: 6,
      now_iso: now,
      market_policy: {}
    });
    assert.ok(out.skipped.every((skip) => skip.skip_reason));
    if (touched.size < queueRows.length) {
      for (const row of out.selected) {
        if (touched.has(row.queue_key)) slotsSpentRehuntingBeforeSweep += 1;
        assert.ok(!touched.has(row.queue_key), 'no row should be re-hunted before untouched rows exist');
      }
    } else if (!out.selected.length) {
      zeroSelectionAfterSweep = true;
    }
    for (const row of out.selected) {
      touched.add(row.queue_key);
      ledger.appendAttempt(row, {
        lane: 'public_search',
        attempted_at: now,
        outcome: 'FOUND',
        reason_code: 'VISIBLE_PUBLIC_ROUTE_FOUND',
        reason_text: 'Visible public route found.',
        source_url: row.source_document_url,
        cost_usd: 0,
        next_eligible_at: ''
      });
    }
    for (const skip of out.skipped) {
      const row = queueRows.find((candidate) => candidate.queue_key === skip.queue_key);
      if (row) recordBoardSkipRollup(row, 'public_search', skip.skip_reason, now);
    }
  }

  assert.strictEqual(touched.size, 61, 'all rows should be attempted across the daily sweep');
  assert.strictEqual(slotsSpentRehuntingBeforeSweep, 0, 'no daily slots should re-hunt while untouched rows remain');
  assert.strictEqual(zeroSelectionAfterSweep, true, 'after every row has FOUND, later batches should select zero rows while cooldown holds');
  assert.ok(queueRows.every((row) => (row.enrichment_ledger.attempts || []).length === 1));
  assert.ok(queueRows.every((row) => (Number(row.enrichment_ledger.dropped_count) || 0) === 0));

  const legacyNoise = rows(1)[0];
  ledger.appendAttempt(legacyNoise, {
    lane: 'public_search',
    attempted_at: now,
    outcome: 'FOUND',
    reason_code: 'VISIBLE_PUBLIC_ROUTE_FOUND',
    reason_text: 'Visible public route found.',
    source_url: legacyNoise.source_document_url,
    cost_usd: 0,
    next_eligible_at: ''
  });
  ledger.appendAttempt(legacyNoise, {
    lane: 'public_search',
    attempted_at: '2026-08-11T00:01:00Z',
    outcome: 'SKIPPED_BUDGET',
    reason_code: 'batch_limit_not_selected',
    reason_text: 'Historical skip noise from the old board path.',
    source_url: legacyNoise.source_document_url,
    cost_usd: 0,
    next_eligible_at: '2026-08-11T00:01:00Z'
  });
  assert.strictEqual(scheduler.selectRowsForEnrichment([legacyNoise], {
    lane: 'public_search',
    limit: 1,
    now_iso: '2026-08-11T00:02:00Z',
    market_policy: {}
  }).selected.length, 0, 'legacy SKIPPED_BUDGET must not erase FOUND cooldown');

  const markets = Array.from({ length: 20 }, (_, index) => ({
    market_key: `market-${index}`,
    city: `City ${index}`,
    county: `County ${index}`,
    state: 'TX',
    tier: index < 8 ? 'active' : index < 14 ? 'piloting' : 'candidate',
    status: index < 8 ? 'live' : index < 14 ? 'survey' : 'candidate',
    row_count: 1 + index,
    backlog_count: 2 + index
  }));
  const plan = scheduler.marketThroughputPlan(markets, {
    standing_budget: 24,
    pilot_budget: 6,
    candidate_budget: 6
  });
  assert.strictEqual(plan.active_market_count, 8);
  assert.strictEqual(plan.piloting_market_count, 6);
  assert.strictEqual(plan.candidate_market_count, 6);
  assert.strictEqual(plan.allocations.reduce((sum, allocation) => sum + Number(allocation.allocated_slots || 0), 0), 36);
  assert.strictEqual(plan.allocations.filter((allocation) => allocation.budget_class === 'standing').length, 8);
  assert.strictEqual(plan.allocations.filter((allocation) => allocation.budget_class === 'pilot').length, 6);
  assert.strictEqual(plan.allocations.filter((allocation) => allocation.budget_class === 'candidate').length, 6);
  assert.ok(plan.allocations.filter((allocation) => allocation.budget_class === 'standing').every((allocation) => allocation.allocated_slots === 3));
  assert.ok(plan.allocations.filter((allocation) => allocation.budget_class === 'pilot').every((allocation) => allocation.allocated_slots === 1));
  assert.ok(plan.allocations.filter((allocation) => allocation.budget_class === 'candidate').every((allocation) => allocation.allocated_slots === 1));

  console.log('enrichment scheduler tests passed');
})();
