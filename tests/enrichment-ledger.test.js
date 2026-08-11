'use strict';

const assert = require('assert');
const ledger = require('../modules/research/enrichment-ledger');

(() => {
  const row = {};
  ledger.appendAttempt(row, {
    lane: 'public_search',
    attempted_at: '2026-08-11T00:00:00Z',
    outcome: 'NOT_FOUND',
    reason_code: 'NO_VISIBLE_ROUTE',
    reason_text: 'No visible route.',
    source_url: 'https://example.test',
    cost_usd: 0,
    next_eligible_at: ''
  });
  assert.strictEqual(row.enrichment_ledger.attempts[0].cost_usd, 0);
  assert.strictEqual(row.enrichment_ledger.attempts[0].next_eligible_at, '2026-08-13T00:00:00.000Z');
  assert.strictEqual(ledger.isLaneEligible(row, 'public_search', '2026-08-12T00:00:00Z'), false);
  assert.strictEqual(ledger.isLaneEligible(row, 'public_search', '2026-08-13T00:00:01Z'), true);

  const blocked = {};
  ledger.appendAttempt(blocked, {
    lane: 'official_browser_lookup',
    attempted_at: '2026-08-11T00:00:00Z',
    outcome: 'BLOCKED',
    reason_code: 'HTTP_403',
    reason_text: 'Blocked.',
    source_url: '',
    cost_usd: 0,
    next_eligible_at: ''
  });
  assert.strictEqual(blocked.enrichment_ledger.attempts[0].next_eligible_at, '2026-08-12T00:00:00.000Z');

  const failed = {};
  ledger.appendAttempt(failed, {
    lane: 'row_source_document',
    attempted_at: '2026-08-11T00:00:00Z',
    outcome: 'FAILED',
    reason_code: 'TIMEOUT',
    reason_text: 'Timeout.',
    source_url: '',
    cost_usd: 0,
    next_eligible_at: ''
  });
  assert.strictEqual(failed.enrichment_ledger.attempts[0].next_eligible_at, '2026-08-11T06:00:00.000Z');

  const policy = {};
  ledger.appendAttempt(policy, {
    lane: 'sold_comp',
    attempted_at: '2026-08-11T00:00:00Z',
    outcome: 'SKIPPED_POLICY',
    reason_code: 'TX_NON_DISCLOSURE',
    reason_text: 'Policy.',
    source_url: '',
    cost_usd: 0,
    next_eligible_at: ''
  });
  assert.strictEqual(ledger.isLaneEligible(policy, 'sold_comp', '2027-01-01T00:00:00Z'), false);
  ledger.appendAttempt(policy, {
    lane: 'sold_comp',
    attempted_at: '2026-08-11T00:01:00Z',
    outcome: 'SKIPPED_POLICY',
    reason_code: 'TX_NON_DISCLOSURE',
    reason_text: 'Policy.',
    source_url: '',
    cost_usd: 0,
    next_eligible_at: ''
  });
  assert.strictEqual(policy.enrichment_ledger.attempts.length, 1, 'same policy value is recorded once per lane');

  const foundWithSkipNoise = {};
  ledger.appendAttempt(foundWithSkipNoise, {
    lane: 'public_search',
    attempted_at: '2026-08-11T00:00:00Z',
    outcome: 'FOUND',
    reason_code: 'OWNER_ROUTE_FOUND',
    reason_text: 'Found route.',
    source_url: 'https://example.test/owner',
    cost_usd: 0,
    next_eligible_at: ''
  });
  ledger.appendAttempt(foundWithSkipNoise, {
    lane: 'public_search',
    attempted_at: '2026-08-11T00:01:00Z',
    outcome: 'SKIPPED_BUDGET',
    reason_code: 'batch_limit_not_selected',
    reason_text: 'Not selected this batch.',
    source_url: '',
    cost_usd: 0,
    next_eligible_at: '2026-08-11T00:01:00Z'
  });
  assert.strictEqual(ledger.isLaneEligible(foundWithSkipNoise, 'public_search', '2026-08-11T00:02:00Z'), false, 'skip noise must not erase FOUND cooldown');

  const capped = {};
  for (let i = 0; i < 25; i += 1) {
    ledger.appendAttempt(capped, {
      lane: 'public_search',
      attempted_at: `2026-08-11T00:${String(i).padStart(2, '0')}:00Z`,
      outcome: 'NOT_FOUND',
      reason_code: `NO_${i}`,
      reason_text: 'No.',
      source_url: '',
      cost_usd: 0,
      next_eligible_at: ''
    });
  }
  assert.strictEqual(capped.enrichment_ledger.attempts.length, 20);
  assert.strictEqual(capped.enrichment_ledger.dropped_count, 5);
  assert.strictEqual(ledger.ledgerSummary(capped).attempt_count, 20);

  const merged = ledger.mergeLedgers(
    { enrichment_ledger: { attempts: capped.enrichment_ledger.attempts.slice(), dropped_count: 5 } },
    { enrichment_ledger: { attempts: capped.enrichment_ledger.attempts.slice(), dropped_count: 5 } }
  );
  assert.strictEqual(merged.dropped_count, 5, 'shared ledger history should not double-count drops');
  console.log('enrichment ledger tests passed');
})();
