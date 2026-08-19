'use strict';

const assert = require('assert');
const registry = require('../modules/research/paid-provider-fallback-registry');
const paidCompProvider = require('../modules/research/paid-comp-provider');
const paidSkipTraceProvider = require('../modules/research/paid-skip-trace-provider');
const ledger = require('../modules/research/enrichment-ledger');

(async () => {
  assert.ok(registry.FALLBACKS.every((entry) => entry.enabled === false));
  assert.ok(registry.FALLBACKS.every((entry) => entry.requires_gabriel_budget_decision === true));
  assert.ok(registry.FALLBACKS.every((entry) => entry.unverified_placeholder === true));
  assert.ok(registry.FALLBACKS.every((entry) => entry.unit_cost_source === 'PLACEHOLDER_REQUIRES_VENDOR_QUOTE'));
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
  assert.throws(() => registry.assertPaidFallbackMayRun(enabled, { ENABLE_DATABATCH_PAID_FALLBACK: 'true' }, 0), /vendor_quote_required/);

  const compPlan = paidCompProvider.describePlan({
    normalized_address: '14001 Sussex St, Detroit, MI 48227',
    parcel_id: '123'
  });
  assert.strictEqual(compPlan.network_calls, 0);
  assert.strictEqual(compPlan.should_ingest, false);
  assert.ok(compPlan.providers.every((provider) => provider.quoted_cost.unverified_placeholder === true));
  await assert.rejects(() => paidCompProvider.execute(compPlan), /paid_comp_execute_disabled/);

  const skipPlan = paidSkipTraceProvider.describePlan({
    normalized_address: '14001 Sussex St, Detroit, MI 48227',
    owner_clue: 'Taxpayer of record: EXAMPLE LLC'
  });
  assert.strictEqual(skipPlan.network_calls, 0);
  assert.strictEqual(skipPlan.should_ingest, false);
  assert.ok(skipPlan.providers.every((provider) => provider.quoted_cost.unit_cost_source === 'PLACEHOLDER_REQUIRES_VENDOR_QUOTE'));
  await assert.rejects(() => paidSkipTraceProvider.execute(skipPlan), /paid_skip_trace_execute_disabled/);
  console.log('paid provider fallback registry tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
