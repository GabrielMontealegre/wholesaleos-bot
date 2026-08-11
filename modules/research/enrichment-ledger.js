'use strict';

const MAX_ATTEMPTS_PER_ROW = 20;

const LANES = Object.freeze([
  'row_source_document',
  'county_appraisal',
  'public_search',
  'official_browser_lookup',
  'sold_comp',
  'paid_fallback'
]);

const OUTCOMES = Object.freeze([
  'FOUND',
  'NOT_FOUND',
  'BLOCKED',
  'SKIPPED_POLICY',
  'SKIPPED_BUDGET',
  'FAILED'
]);

const COOLDOWN_MS = Object.freeze({
  FOUND: 7 * 86400000,
  NOT_FOUND: 48 * 3600000,
  BLOCKED: 24 * 3600000,
  FAILED: 6 * 3600000
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function rowLedger(row) {
  return row && typeof row === 'object' && row.enrichment_ledger && typeof row.enrichment_ledger === 'object'
    ? row.enrichment_ledger
    : { attempts: [], dropped_count: 0 };
}

function normalizeAttempt(attempt) {
  const lane = cleanText(attempt && attempt.lane);
  const outcome = cleanText(attempt && attempt.outcome);
  if (!LANES.includes(lane)) throw new Error(`invalid_enrichment_lane:${lane || 'missing'}`);
  if (!OUTCOMES.includes(outcome)) throw new Error(`invalid_enrichment_outcome:${outcome || 'missing'}`);
  const attemptedAt = cleanText(attempt && attempt.attempted_at);
  const reasonCode = cleanText(attempt && attempt.reason_code);
  const reasonText = cleanText(attempt && attempt.reason_text);
  if (!attemptedAt || !reasonCode || !reasonText) throw new Error('invalid_enrichment_attempt_missing_required_field');
  const cost = Number(attempt && attempt.cost_usd);
  return {
    lane,
    attempted_at: attemptedAt,
    outcome,
    reason_code: reasonCode,
    reason_text: reasonText,
    source_url: cleanText(attempt && attempt.source_url),
    cost_usd: Number.isFinite(cost) && cost >= 0 ? cost : 0,
    next_eligible_at: cleanText(attempt && attempt.next_eligible_at)
  };
}

function nextEligibleAt(outcome, attemptedAt) {
  if (outcome === 'SKIPPED_POLICY') return 'PERMANENT_UNTIL_POLICY_CHANGE';
  if (outcome === 'SKIPPED_BUDGET') return cleanText(attemptedAt);
  const cooldown = COOLDOWN_MS[outcome] || 0;
  if (!cooldown) return cleanText(attemptedAt);
  return new Date(Date.parse(attemptedAt) + cooldown).toISOString();
}

function appendAttempt(row, attempt) {
  if (!row || typeof row !== 'object') throw new Error('row_required');
  const normalized = normalizeAttempt(Object.assign({}, attempt, {
    cost_usd: attempt && Object.prototype.hasOwnProperty.call(attempt, 'cost_usd') ? attempt.cost_usd : 0,
    next_eligible_at: cleanText(attempt && attempt.next_eligible_at) ||
      nextEligibleAt(cleanText(attempt && attempt.outcome), cleanText(attempt && attempt.attempted_at))
  }));
  const ledger = Object.assign({ attempts: [], dropped_count: 0 }, rowLedger(row));
  ledger.attempts = Array.isArray(ledger.attempts) ? ledger.attempts.slice() : [];
  if (normalized.outcome === 'SKIPPED_POLICY') {
    const existingPolicy = ledger.attempts.find((item) =>
      cleanText(item && item.lane) === normalized.lane &&
      cleanText(item && item.outcome) === 'SKIPPED_POLICY' &&
      cleanText(item && item.reason_code) === normalized.reason_code);
    if (existingPolicy) {
      row.enrichment_ledger = ledger;
      return ledger;
    }
  }
  ledger.attempts.push(normalized);
  if (ledger.attempts.length > MAX_ATTEMPTS_PER_ROW) {
    const dropCount = ledger.attempts.length - MAX_ATTEMPTS_PER_ROW;
    ledger.attempts = ledger.attempts.slice(dropCount);
    ledger.dropped_count = (Number(ledger.dropped_count) || 0) + dropCount;
  }
  row.enrichment_ledger = ledger;
  return ledger;
}

function attemptsForLane(row, lane) {
  const targetLane = cleanText(lane);
  return (Array.isArray(rowLedger(row).attempts) ? rowLedger(row).attempts : [])
    .filter((attempt) => cleanText(attempt && attempt.lane) === targetLane);
}

function latestAttempt(row, lane) {
  return attemptsForLane(row, lane).slice().sort((a, b) => cleanText(b.attempted_at).localeCompare(cleanText(a.attempted_at)))[0] || null;
}

function isLaneEligible(row, lane, nowIso) {
  const laneAttempts = attemptsForLane(row, lane);
  if (laneAttempts.some((attempt) =>
    cleanText(attempt && attempt.outcome) === 'SKIPPED_POLICY' ||
    cleanText(attempt && attempt.next_eligible_at) === 'PERMANENT_UNTIL_POLICY_CHANGE')) return false;
  const latest = laneAttempts
    .filter((attempt) => !cleanText(attempt && attempt.outcome).startsWith('SKIPPED_'))
    .slice()
    .sort((a, b) => cleanText(b.attempted_at).localeCompare(cleanText(a.attempted_at)))[0] || null;
  if (!latest) return true;
  const nowMs = Date.parse(nowIso);
  const nextMs = Date.parse(latest.next_eligible_at);
  if (!Number.isFinite(nextMs) || !Number.isFinite(nowMs)) return true;
  return nextMs <= nowMs;
}

function ledgerSummary(row) {
  const ledger = rowLedger(row);
  const attempts = Array.isArray(ledger.attempts) ? ledger.attempts : [];
  const byLane = {};
  for (const lane of LANES) {
    const laneAttempts = attempts.filter((attempt) => attempt.lane === lane);
    if (!laneAttempts.length) continue;
    const latest = laneAttempts.slice().sort((a, b) => b.attempted_at.localeCompare(a.attempted_at))[0];
    byLane[lane] = {
      attempts: laneAttempts.length,
      latest_outcome: latest.outcome,
      latest_reason_code: latest.reason_code,
      next_eligible_at: latest.next_eligible_at,
      total_cost_usd: laneAttempts.reduce((sum, attempt) => sum + (Number(attempt.cost_usd) || 0), 0)
    };
  }
  return {
    attempt_count: attempts.length,
    dropped_count: Number(ledger.dropped_count) || 0,
    total_cost_usd: attempts.reduce((sum, attempt) => sum + (Number(attempt.cost_usd) || 0), 0),
    by_lane: byLane
  };
}

function mergeLedgers(left, right) {
  const row = { enrichment_ledger: { attempts: [], dropped_count: 0 } };
  const attempts = []
    .concat(Array.isArray(rowLedger(left).attempts) ? rowLedger(left).attempts : [])
    .concat(Array.isArray(rowLedger(right).attempts) ? rowLedger(right).attempts : [])
    .map((attempt) => {
      try { return normalizeAttempt(attempt); } catch (error) { return null; }
    })
    .filter(Boolean);
  const seen = new Set();
  for (const attempt of attempts.sort((a, b) => a.attempted_at.localeCompare(b.attempted_at))) {
    const key = [attempt.lane, attempt.attempted_at, attempt.outcome, attempt.reason_code, attempt.source_url].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    appendAttempt(row, attempt);
  }
  row.enrichment_ledger.dropped_count = Math.max(
    Number(row.enrichment_ledger.dropped_count) || 0,
    Number(rowLedger(left).dropped_count) || 0,
    Number(rowLedger(right).dropped_count) || 0
  );
  return row.enrichment_ledger;
}

module.exports = {
  LANES,
  OUTCOMES,
  MAX_ATTEMPTS_PER_ROW,
  appendAttempt,
  attemptsForLane,
  isLaneEligible,
  ledgerSummary,
  mergeLedgers,
  nextEligibleAt
};
