'use strict';

const leadOperationsState = require('./lead-operations-state');

const SEGMENT_ORDER = Object.freeze([
  'CALL_READY',
  'OUTREACH_READY',
  'MAIL_READY',
  'NEEDS_CONTACT_SEARCH',
  'NEEDS_SKIP_TRACE',
  'NEEDS_COMPS',
  'TITLE_NEEDED',
  'CLOSED_NOT_INTERESTED',
  'BLOCKED'
]);

const SEGMENT_LABELS = Object.freeze({
  CALL_READY: 'Call Ready',
  OUTREACH_READY: 'Outreach Ready',
  MAIL_READY: 'Mail Ready',
  NEEDS_CONTACT_SEARCH: 'Needs Contact Search',
  NEEDS_SKIP_TRACE: 'Needs Skip Trace',
  NEEDS_COMPS: 'Needs Comps',
  TITLE_NEEDED: 'Title Needed',
  CLOSED_NOT_INTERESTED: 'Closed - Not Interested',
  BLOCKED: 'Blocked / Quarantined'
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function dateOnly(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function lifecycleRank(row) {
  const status = cleanText(row && row.lifecycle_status && row.lifecycle_status.status);
  if (status === 'FRESH') return 0;
  if (status === 'AGING') return 1;
  return 2;
}

function segmentKey(row) {
  if (row && row.lifecycle_status && row.lifecycle_status.quarantined === true) return 'BLOCKED';
  const state = cleanText(row && row.row_state) || leadOperationsState.rowStateForDeal(row).row_state;
  return SEGMENT_ORDER.includes(state) && state !== 'LOCKED' ? state : 'BLOCKED';
}

function compareRows(a, b, todayIso) {
  const aFollowUp = a && (a.contact_follow_up_requested === true || cleanText(a.contact_workflow_outcome) === 'follow_up');
  const bFollowUp = b && (b.contact_follow_up_requested === true || cleanText(b.contact_workflow_outcome) === 'follow_up');
  if (aFollowUp !== bFollowUp) return aFollowUp ? -1 : 1;
  if (aFollowUp && bFollowUp) {
    const followDiff = cleanText(b && b.contact_follow_up_at).localeCompare(cleanText(a && a.contact_follow_up_at));
    if (followDiff) return followDiff;
  }
  const today = dateOnly(todayIso) || new Date().toISOString().slice(0, 10);
  const aSale = dateOnly(a && a.sale_date_iso);
  const bSale = dateOnly(b && b.sale_date_iso);
  const aFuture = aSale && aSale >= today ? aSale : '';
  const bFuture = bSale && bSale >= today ? bSale : '';
  if (Boolean(aFuture) !== Boolean(bFuture)) return aFuture ? -1 : 1;
  if (aFuture && aFuture !== bFuture) return aFuture.localeCompare(bFuture);
  const lifecycleDiff = lifecycleRank(a) - lifecycleRank(b);
  if (lifecycleDiff) return lifecycleDiff;
  const seenDiff = cleanText(b && b.last_seen_at).localeCompare(cleanText(a && a.last_seen_at));
  if (seenDiff) return seenDiff;
  return cleanText(a && a.queue_key).localeCompare(cleanText(b && b.queue_key));
}

function buildLeadOperationsQueue(rows, options = {}) {
  const buckets = Object.fromEntries(SEGMENT_ORDER.map((key) => [key, []]));
  for (const original of Array.isArray(rows) ? rows : []) {
    const source = original || {};
    const state = leadOperationsState.rowStateForDeal(source);
    const row = Object.assign({}, source, {
      row_state: state.row_state,
      row_state_reason: state.row_state_reason,
      row_state_next_action: state.next_action
    });
    buckets[segmentKey(row)].push(row);
  }
  const segments = SEGMENT_ORDER.map((key) => ({
    key,
    label: SEGMENT_LABELS[key],
    count: buckets[key].length,
    rows: buckets[key].slice().sort((a, b) => compareRows(a, b, options.today_iso))
  }));
  return {
    segment_order: SEGMENT_ORDER.slice(),
    total_rows: segments.reduce((sum, segment) => sum + segment.count, 0),
    counts: Object.fromEntries(segments.map((segment) => [segment.key, segment.count])),
    segments
  };
}

function summarizeLeadOperationsQueue(queue) {
  queue = queue || buildLeadOperationsQueue([]);
  return {
    segment_order: Array.isArray(queue.segment_order) ? queue.segment_order.slice() : SEGMENT_ORDER.slice(),
    total_rows: Number(queue.total_rows) || 0,
    counts: Object.assign({}, queue.counts || {}),
    segments: (Array.isArray(queue.segments) ? queue.segments : []).map((segment) => ({
      key: cleanText(segment && segment.key),
      label: cleanText(segment && segment.label),
      count: Number(segment && segment.count) || 0,
      row_keys: (Array.isArray(segment && segment.rows) ? segment.rows : [])
        .map((row) => cleanText(row && row.queue_key))
        .filter(Boolean)
    }))
  };
}

module.exports = {
  SEGMENT_ORDER,
  SEGMENT_LABELS,
  buildLeadOperationsQueue,
  compareRows,
  segmentKey,
  summarizeLeadOperationsQueue
};
