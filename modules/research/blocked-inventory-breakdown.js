'use strict';

const leadOperationsQueue = require('./lead-operations-queue');
const leadOperationsState = require('./lead-operations-state');

const SUBREASONS = Object.freeze([
  'SALE_PASSED',
  'SUPERSEDED_DUPLICATE',
  'UNVERIFIABLE',
  'LOCKED_NO_COMPLETE_ADDRESS',
  'LOCKED_NO_SOURCED_IDENTITY',
  'RESEARCH_REFERENCE_BAD_SKIPPED',
  'LOCKED_OTHER'
]);

const PRECEDENCE = Object.freeze([
  'RESEARCH_REFERENCE_BAD_SKIPPED',
  'SUPERSEDED_DUPLICATE',
  'UNVERIFIABLE',
  'SALE_PASSED',
  'LOCKED_NO_COMPLETE_ADDRESS',
  'LOCKED_NO_SOURCED_IDENTITY',
  'LOCKED_OTHER'
]);

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function emptyCounts() {
  return Object.fromEntries(SUBREASONS.map((key) => [key, 0]));
}

function emptyExamples() {
  return Object.fromEntries(SUBREASONS.map((key) => [key, []]));
}

function incrementDistribution(target, value) {
  const key = cleanText(value) || 'unknown';
  target[key] = (Number(target[key]) || 0) + 1;
}

function pushExample(examples, reason, row) {
  if (!examples[reason] || examples[reason].length >= 5) return;
  const queueKey = cleanText(row && row.queue_key);
  if (queueKey && !examples[reason].includes(queueKey)) examples[reason].push(queueKey);
}

function pushLockedOtherReason(target, row) {
  if (!target || target.length >= 5) return;
  const reason = cleanText(row && (row.row_state_reason || row.lifecycle_status && row.lifecycle_status.reason_text));
  if (reason && !target.includes(reason)) target.push(reason);
}

function researchReferenceBadSkipped(row) {
  const bucket = cleanText(row && row.quality_bucket).toUpperCase();
  return bucket === 'REJECTED_GENERIC' || bucket === 'SOURCE_PROOF_ONLY';
}

function lifecycleStatus(row) {
  return cleanText(row && row.lifecycle_status && row.lifecycle_status.status).toUpperCase();
}

function classifyInventoryRow(row) {
  const lifecycle = lifecycleStatus(row);
  const segment = leadOperationsQueue.segmentKey(row);
  if (segment !== 'BLOCKED') return null;

  for (const reason of PRECEDENCE) {
    if (reason === 'RESEARCH_REFERENCE_BAD_SKIPPED' && researchReferenceBadSkipped(row)) return reason;
    if (reason === 'SUPERSEDED_DUPLICATE' && lifecycle === 'SUPERSEDED_DUPLICATE') return reason;
    if (reason === 'UNVERIFIABLE' && lifecycle === 'UNVERIFIABLE') return reason;
    if (reason === 'SALE_PASSED' && lifecycle === 'SALE_PASSED') return reason;
    if (reason === 'LOCKED_NO_COMPLETE_ADDRESS' && !cleanText(row && row.normalized_address)) return reason;
    if (reason === 'LOCKED_NO_SOURCED_IDENTITY' &&
        cleanText(row && row.normalized_address) &&
        !leadOperationsState.identityKnown(row)) return reason;
  }
  return 'LOCKED_OTHER';
}

function emptySummary() {
  return {
    subreason_order: SUBREASONS.slice(),
    total_rows_considered: 0,
    total_inventory: 0,
    counts: emptyCounts(),
    example_queue_keys: emptyExamples(),
    locked_other_reason_samples: [],
    sale_passed: {
      times_seen_distribution: {},
      filing_period_distribution: {}
    }
  };
}

function applyRow(summary, row) {
  summary.total_rows_considered += 1;
  const reason = classifyInventoryRow(row);
  if (!reason) return;
  summary.total_inventory += 1;
  summary.counts[reason] += 1;
  pushExample(summary.example_queue_keys, reason, row);
  if (reason === 'LOCKED_OTHER') pushLockedOtherReason(summary.locked_other_reason_samples, row);
  if (reason === 'SALE_PASSED') {
    incrementDistribution(summary.sale_passed.times_seen_distribution, row && row.times_seen);
    incrementDistribution(summary.sale_passed.filing_period_distribution, row && row.filing_period);
  }
}

function compactMarket(marketKey, bucket) {
  return {
    market_key: marketKey,
    market: Object.assign({}, bucket && bucket.market || {}),
    total_rows_considered: 0,
    total_inventory: 0,
    counts: emptyCounts(),
    example_queue_keys: emptyExamples(),
    locked_other_reason_samples: [],
    sale_passed: {
      times_seen_distribution: {},
      filing_period_distribution: {}
    }
  };
}

function mergeDistribution(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (Number(target[key]) || 0) + Number(value || 0);
  }
}

function mergeMarketIntoTotal(total, market) {
  total.total_rows_considered += market.total_rows_considered;
  total.total_inventory += market.total_inventory;
  for (const key of SUBREASONS) {
    total.counts[key] += Number(market.counts[key] || 0);
    for (const example of market.example_queue_keys[key] || []) {
      if (total.example_queue_keys[key].length < 5 && !total.example_queue_keys[key].includes(example)) {
        total.example_queue_keys[key].push(example);
      }
    }
  }
  for (const reason of market.locked_other_reason_samples || []) {
    if (total.locked_other_reason_samples.length < 5 && !total.locked_other_reason_samples.includes(reason)) {
      total.locked_other_reason_samples.push(reason);
    }
  }
  mergeDistribution(total.sale_passed.times_seen_distribution, market.sale_passed.times_seen_distribution);
  mergeDistribution(total.sale_passed.filing_period_distribution, market.sale_passed.filing_period_distribution);
}

function buildBlockedInventoryBreakdownFromStore(store) {
  const total = emptySummary();
  const markets = [];
  const marketEntries = Object.entries(store && store.markets || {});
  for (const [marketKey, bucket] of marketEntries) {
    const marketSummary = compactMarket(marketKey, bucket);
    for (const row of Array.isArray(bucket && bucket.rows) ? bucket.rows : []) {
      applyRow(marketSummary, row);
    }
    mergeMarketIntoTotal(total, marketSummary);
    markets.push(marketSummary);
  }
  return {
    store_kind: 'blocked_inventory_breakdown_not_saved_leads',
    generated_at: new Date().toISOString(),
    subreason_order: SUBREASONS.slice(),
    total,
    markets
  };
}

module.exports = {
  SUBREASONS,
  PRECEDENCE,
  classifyInventoryRow,
  buildBlockedInventoryBreakdownFromStore
};
