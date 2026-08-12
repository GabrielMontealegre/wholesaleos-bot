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

function selectRowsForEnrichment(rows, options = {}) {
  const lane = cleanText(options.lane);
  const limit = Math.max(0, Number(options.limit) || 0);
  const nowIso = cleanText(options.now_iso) || new Date().toISOString();
  const marketPolicy = options.market_policy || {};
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
      policy_reason_code: policyReasonCode(lane, marketPolicy)
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
};
