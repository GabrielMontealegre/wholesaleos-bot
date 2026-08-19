'use strict';

const lifecycle = require('./lead-lifecycle-status');
const enrichmentLedger = require('./enrichment-ledger');

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function rowKey(row) {
  return cleanText(row && row.queue_key) ||
    cleanText(row && row.normalized_address).toLowerCase() ||
    cleanText(row && row.source_row_reference) ||
    cleanText(row && row.headline);
}

function laneAllowedByPolicy(lane, policy) {
  if (lane !== 'sold_comp') return true;
  return !policy || policy.comp_lane_enabled !== false;
}

function policyReasonCode(lane, policy) {
  if (lane !== 'sold_comp') return '';
  if (policy && policy.comp_lane_enabled === false) return cleanText(policy.arv_lock_reason_when_disabled);
  return cleanText(policy && policy.comp_lane_source) || 'COMP_LANE_ENABLED';
}

function firstAttemptAt(row, lane) {
  const attempts = enrichmentLedger.attemptsForLane(row, lane).filter((attempt) => !cleanText(attempt.outcome).startsWith('SKIPPED_'));
  if (!attempts.length) return '';
  return attempts.slice().sort((a, b) => cleanText(a.attempted_at).localeCompare(cleanText(b.attempted_at)))[0].attempted_at;
}

function latestAttemptAt(row, lane) {
  const attempts = enrichmentLedger.attemptsForLane(row, lane).filter((attempt) => !cleanText(attempt.outcome).startsWith('SKIPPED_'));
  if (!attempts.length) return '';
  return attempts.slice().sort((a, b) => cleanText(b.attempted_at).localeCompare(cleanText(a.attempted_at)))[0].attempted_at;
}

function lifecycleRank(status) {
  if (status === 'FRESH') return 0;
  if (status === 'AGING') return 1;
  return 9;
}

function marketThroughputRank(tier) {
  const text = cleanText(tier).toLowerCase();
  if (text === 'active') return 0;
  if (text === 'piloting') return 1;
  if (text === 'candidate') return 2;
  return 9;
}

function marketThroughputPlan(markets, options = {}) {
  const standingBudget = Math.max(0, Number(options.standing_budget) || 24);
  const pilotBudget = Math.max(0, Number(options.pilot_budget) || 6);
  const candidateBudget = Math.max(0, Number(options.candidate_budget) || 0);
  const items = (Array.isArray(markets) ? markets : []).map((market) => ({
    market_key: cleanText(market && market.market_key) || cleanText([market && market.city, market && market.county, market && market.state].filter(Boolean).join('|')).toLowerCase(),
    city: cleanText(market && market.city),
    county: cleanText(market && market.county),
    state: cleanText(market && market.state).toUpperCase(),
    tier: cleanText(market && market.tier || market && market.status || 'candidate').toLowerCase(),
    status: cleanText(market && market.status || ''),
    open_legs: Array.isArray(market && market.open_legs) ? market.open_legs.slice() : [],
    blocked_reason: cleanText(market && market.blocked_reason),
    row_count: Number(market && market.row_count || 0) || 0,
    backlog_count: Number(market && market.backlog_count || market && market.row_count || 0) || 0
  })).filter((market) => market.market_key);
  const active = items.filter((market) => market.tier === 'active').sort((a, b) => a.market_key.localeCompare(b.market_key));
  const piloting = items.filter((market) => market.tier === 'piloting').sort((a, b) => a.market_key.localeCompare(b.market_key));
  const candidate = items.filter((market) => market.tier === 'candidate').sort((a, b) => a.market_key.localeCompare(b.market_key));
  const allocations = [];
  function allocateRoundRobin(pool, budget, label) {
    if (!budget || !pool.length) return;
    let remaining = budget;
    let index = 0;
    while (remaining > 0 && pool.length) {
      const market = pool[index % pool.length];
      const existing = allocations.find((entry) => entry.market_key === market.market_key);
      if (existing) {
        existing.allocated_slots += 1;
      } else {
        allocations.push({
          market_key: market.market_key,
          city: market.city,
          county: market.county,
          state: market.state,
          tier: market.tier,
          status: market.status,
          allocated_slots: 1,
          budget_class: label
        });
      }
      remaining -= 1;
      index += 1;
      if (index >= pool.length && remaining > 0) index = 0;
      if (remaining > 0 && pool.length === 1 && allocations[allocations.length - 1].allocated_slots >= budget) break;
    }
  }
  allocateRoundRobin(active, standingBudget, 'standing');
  allocateRoundRobin(piloting, pilotBudget, 'pilot');
  allocateRoundRobin(candidate, candidateBudget, 'candidate');
  return {
    standing_budget: standingBudget,
    pilot_budget: pilotBudget,
    candidate_budget: candidateBudget,
    active_market_count: active.length,
    piloting_market_count: piloting.length,
    candidate_market_count: candidate.length,
    markets: items,
    allocations
  };
}

function selectRowsForEnrichment(rows, options = {}) {
  const lane = cleanText(options.lane);
  const limit = Math.max(0, Number(options.limit) || 0);
  const nowIso = cleanText(options.now_iso) || new Date().toISOString();
  const marketPolicy = options.market_policy || {};
  const terminalSourceUrlForRow = typeof options.terminal_source_url_for_row === 'function'
    ? options.terminal_source_url_for_row
    : null;
  const selected = [];
  const skipped = [];
  const candidates = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = rowKey(row);
    const state = lifecycle.computeLifecycleStatus(row, nowIso);
    if (state.quarantined) {
      skipped.push({ queue_key: key, skip_reason: `lifecycle_${state.status.toLowerCase()}` });
      continue;
    }
    if (!laneAllowedByPolicy(lane, marketPolicy)) {
      skipped.push({ queue_key: key, skip_reason: 'lane_disabled_by_market_policy' });
      continue;
    }
    if (!enrichmentLedger.isLaneEligible(row, lane, nowIso, {
      policy_reason_code: policyReasonCode(lane, marketPolicy),
      terminal_source_url: terminalSourceUrlForRow ? terminalSourceUrlForRow(row) : ''
    })) {
      skipped.push({ queue_key: key, skip_reason: 'lane_cooldown_active' });
      continue;
    }
    const attempts = enrichmentLedger.attemptsForLane(row, lane).filter((attempt) => !cleanText(attempt.outcome).startsWith('SKIPPED_'));
    candidates.push({
      row,
      queue_key: key,
      lifecycle_status: state.status,
      never_attempted: attempts.length === 0,
      first_seen_at: cleanText(row && row.first_seen_at),
      first_attempted_at: firstAttemptAt(row, lane),
      latest_attempted_at: latestAttemptAt(row, lane)
    });
  }

  candidates.sort((a, b) => {
    if (a.never_attempted !== b.never_attempted) return a.never_attempted ? -1 : 1;
    if (a.never_attempted) {
      const rankDiff = lifecycleRank(a.lifecycle_status) - lifecycleRank(b.lifecycle_status);
      if (rankDiff) return rankDiff;
      const seenDiff = cleanText(a.first_seen_at).localeCompare(cleanText(b.first_seen_at));
      if (seenDiff) return seenDiff;
    } else {
      const attemptDiff = cleanText(a.latest_attempted_at).localeCompare(cleanText(b.latest_attempted_at));
      if (attemptDiff) return attemptDiff;
    }
    return cleanText(a.queue_key).localeCompare(cleanText(b.queue_key));
  });

  for (const item of candidates) {
    if (selected.length < limit) selected.push(item.row);
    else skipped.push({ queue_key: item.queue_key, skip_reason: 'batch_limit_not_selected' });
  }
  return { selected, skipped };
}

module.exports = {
  selectRowsForEnrichment
  ,
  marketThroughputPlan
};
