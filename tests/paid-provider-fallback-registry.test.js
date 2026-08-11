'use strict';

const assert = require('assert');
const registry = require('../modules/research/paid-provider-fallback-registry');
const ledger = require('../modules/research/enrichment-ledger');

(() => {
  assert.ok(registry.FALLBACKS.every((entry) => entry.enabled === false));
  assert.ok(registry.FALLBACKS.every((entry) => entry.requires_gabriel_budget_decision === true));
  assert.throws(() => registry.assertPaidFallbackMayRun(registry.FALLBACKS[0], {}, 0), /paid_fallback_disabled/);

  const row = {};
  for (const lane of ['row_source_document', 'county_appraisal', 'public_search', 'official_browser_lookup', 'sold_comp']) {
    ledger.appendAttempt(row, {
      lane,
      attempted_at: '2026-08-11T00:00:00Z',
      outcome: 'NOT_FOUND',
      reason_code: 'FREE_EXHAUSTED',
      reason_text: 'Free lane exhausted.',
      source_url: '',
      cost_usd: 0,
      next_eligible_at: ''
    });
  }
  assert.strictEqual(registry.availableFallbacksForRow({}).length, 0);
  assert.ok(registry.availableFallbacksForRow(row).length >= 1);
  const enabled = Object.assign({}, registry.FALLBACKS[0], { enabled: true });
  assert.throws(() => registry.assertPaidFallbackMayRun(enabled, {}, 0), /env_opt_in_missing/);
  assert.throws(() => registry.assertPaidFallbackMayRun(enabled, { ENABLE_DATABATCH_PAID_FALLBACK: 'true' }, 999), /daily_cap_exceeded/);
  console.log('paid provider fallback registry tests passed');
})();
