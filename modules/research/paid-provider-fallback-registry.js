'use strict';

const enrichmentLedger = require('./enrichment-ledger');

const FALLBACKS = Object.freeze([
  {
    provider: 'databatch',
    lane: 'paid_fallback',
    enabled: false,
    est_cost_usd_per_row: null,
    max_cost_usd_per_row: null,
    max_cost_usd_per_day: 25,
    unverified_placeholder: true,
    unit_cost_source: 'PLACEHOLDER_REQUIRES_VENDOR_QUOTE',
    requires_env_opt_in: 'ENABLE_DATABATCH_PAID_FALLBACK',
    requires_gabriel_budget_decision: true
  },
  {
    provider: 'promptstream',
    lane: 'paid_fallback',
    enabled: false,
    est_cost_usd_per_row: null,
    max_cost_usd_per_row: null,
    max_cost_usd_per_day: 15,
    unverified_placeholder: true,
    unit_cost_source: 'PLACEHOLDER_REQUIRES_VENDOR_QUOTE',
    requires_env_opt_in: 'ENABLE_PROMPTSTREAM_PAID_FALLBACK',
    requires_gabriel_budget_decision: true
  }
]);

function freeLanesExhausted(row) {
  const summary = enrichmentLedger.ledgerSummary(row);
  return ['row_source_document', 'county_appraisal', 'public_search', 'official_browser_lookup', 'sold_comp']
    .every((lane) => summary.by_lane[lane]);
}

function availableFallbacksForRow(row) {
  if (!freeLanesExhausted(row)) return [];
  return FALLBACKS.map((entry) => Object.assign({}, entry));
}

function assertPaidFallbackMayRun(entry, env = {}, spentToday = 0) {
  if (!entry || entry.enabled !== true) throw new Error('paid_fallback_disabled');
  if (!entry.requires_env_opt_in || env[entry.requires_env_opt_in] !== 'true') throw new Error('paid_fallback_env_opt_in_missing');
  const maxCost = Number(entry.max_cost_usd_per_row);
  if (!Number.isFinite(maxCost) || maxCost <= 0 || entry.unverified_placeholder === true) throw new Error('paid_fallback_vendor_quote_required');
  if (Number(spentToday) + maxCost > Number(entry.max_cost_usd_per_day || 0)) {
    throw new Error('paid_fallback_daily_cap_exceeded');
  }
  if (entry.requires_gabriel_budget_decision !== true) throw new Error('paid_fallback_budget_decision_missing');
  return true;
}

module.exports = {
  FALLBACKS,
  availableFallbacksForRow,
  assertPaidFallbackMayRun
};
