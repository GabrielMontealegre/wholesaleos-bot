'use strict';

const assert = require('assert');
const lifecycle = require('../modules/research/lead-lifecycle-status');

(() => {
  const now = '2026-08-11T12:00:00Z';
  assert.strictEqual(lifecycle.computeLifecycleStatus({ normalized_address: '1 Main St, Dallas, TX 75201', sale_date_iso: '2026-08-20' }, now).status, 'FRESH');
  assert.strictEqual(lifecycle.computeLifecycleStatus({ normalized_address: '1 Main St, Dallas, TX 75201', last_seen_at: '2026-08-09T01:00:00Z' }, now).status, 'FRESH');
  assert.strictEqual(lifecycle.computeLifecycleStatus({ normalized_address: '1 Main St, Dallas, TX 75201', last_seen_at: '2026-07-25T01:00:00Z' }, now).status, 'AGING');
  assert.strictEqual(lifecycle.computeLifecycleStatus({ normalized_address: '1 Main St, Dallas, TX 75201' }, now).reason_code, 'NO_DATE_EVIDENCE');
  const passed = lifecycle.computeLifecycleStatus({ normalized_address: '1 Main St, Dallas, TX 75201', sale_date_iso: '2026-08-01' }, now);
  assert.strictEqual(passed.status, 'SALE_PASSED');
  assert.strictEqual(passed.quarantined, true);
  const duplicate = lifecycle.computeLifecycleStatus({
    queue_key: 'a',
    normalized_address: '1 Main St, Dallas, TX 75201',
    census_matched_address: '1 MAIN ST, DALLAS, TX, 75201',
    evidence_score: 1,
    duplicate_candidates: [{ queue_key: 'b', census_matched_address: '1 MAIN ST, DALLAS, TX, 75201', evidence_score: 2 }]
  }, now);
  assert.strictEqual(duplicate.status, 'SUPERSEDED_DUPLICATE');
  assert.strictEqual(duplicate.quarantined, true);
  const unverifiable = lifecycle.computeLifecycleStatus({ headline: 'empty' }, now);
  assert.strictEqual(unverifiable.status, 'UNVERIFIABLE');
  assert.strictEqual(unverifiable.quarantined, true);
  console.log('lead lifecycle status tests passed');
})();
