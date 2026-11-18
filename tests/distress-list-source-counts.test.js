'use strict';

const assert = require('node:assert/strict');
const { installRefuseLiveNetwork } = require('./helpers/refuse-live-network');
const network = installRefuseLiveNetwork();
const counts = require('../modules/sources/distress-list-source-counts');
const profiles = require('../modules/sources/distress-list-profiles');
const id = 'tn_shelby_tax_sale_scgpublic_s3_amazonaws_com';
const privateMarker = 'Synthetic private row evidence';
const summary = { source_id: id, source_kind: 'tax_sale', rows_found: 4, new_leads: 3, updated_leads: 1, owner: privateMarker };
const job = (date, outcome) => ({ updated_at: date, cards: [{ owner: privateMarker }],
  source_summary: { acquisition_core_adapter_results: [Object.assign({ source_id: id, status: 'available', distress_summary: summary,
    message: privateMarker, source_proof_rows: [privateMarker], distress_audit: [privateMarker] }, outcome)] } });
const find = snapshots => counts.buildSourceCounts(snapshots).sources.find(source => source.source_id === id);

try {
  const none = counts.buildSourceCounts([]);
  assert.equal(none.configured_source_count, profiles.PROFILES.length);
  assert.equal(none.observed_source_count, 0);
  assert.equal(none.collection_enabled, false);
  assert(none.sources.every(source => source.rows_found === null && source.unique_preview_rows === null));
  assert.equal(find([]).readiness, 'needs_corpus');
  assert(none.sources.some(source => source.manual_reason && source.reader === null));
  assert(none.sources.some(source => source.readiness === 'needs_corpus'));
  assert(none.sources.every(source => source.enabled === false && source.promotion_status === 'blocked_pending_validated_preview'));
  const input = [job('2026-11-16T12:00:00Z')];
  const before = JSON.stringify(input);
  const snapshots = counts.snapshotsFromJobs(input);
  assert.equal(snapshots.length, 1);
  assert(!JSON.stringify(snapshots).includes(privateMarker));
  const source = find(snapshots);
  assert.equal(source.rows_found, 4);
  assert.equal(source.unique_preview_rows, 3);
  assert.equal(source.updated_duplicate_rows, 1);
  assert.equal(source.snapshot_updated_at, '2026-11-16T12:00:00.000Z');
  assert.equal(source.observed_status, 'available');
  assert(!JSON.stringify(counts.buildSourceCounts(snapshots)).includes(privateMarker));
  assert.equal(JSON.stringify(input), before);

  const blocked = counts.snapshotsFromJobs(input.concat(job('2026-11-17T12:00:00Z', { status: 'blocked', http_status: 429 })));
  assert.equal(find(blocked).observed_status, 'blocked');
  assert.equal(find(blocked).rows_found, null, 'No stale successful count after a newer blocked outcome');
  const conflicting = snapshots.concat({ ...snapshots[0], rows_found: 5 });
  assert.equal(find(conflicting).observation_state, 'conflicting_saved_outcomes');
  assert.equal(find(conflicting).rows_found, null);
  assert.deepEqual(find(conflicting), find(conflicting.slice().reverse()), 'Tie conflicts are order-independent');
  assert.equal(find(snapshots.concat({ ...snapshots[0], ignored: privateMarker })).rows_found, 4, 'Ignored fields do not cause false conflicts');

  for (const bad of ['4', -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, null]) {
    const invalid = counts.snapshotsFromJobs([job('2026-11-16T12:00:00Z', { distress_summary: { ...summary, rows_found: bad } })]);
    assert.equal(find(invalid).rows_found, null);
    assert.equal(find(invalid).unique_preview_rows, null);
  }
  for (const bad of ['2026-02-30T12:00:00Z', 'yesterday', '', null]) assert.deepEqual(counts.snapshotsFromJobs([job(bad)]), []);
  for (const wrong of [{ source_id: 'other' }, { source_kind: 'probate' }, { new_leads: 5 }]) {
    assert.equal(find(counts.snapshotsFromJobs([job('2026-11-16T12:00:00Z', { distress_summary: { ...summary, ...wrong } })])).rows_found, null);
  }
  const inherited = Object.create(summary);
  assert.equal(find(counts.snapshotsFromJobs([job('2026-11-16T12:00:00Z', { distress_summary: inherited })])).rows_found, null);
  assert.deepEqual(counts.snapshotsFromJobs([job('2026-11-16T12:00:00Z', { source_id: privateMarker })]), []);
  assert.equal(find([{ ...snapshots[0], rows_found: privateMarker, observed_status: privateMarker }]).observed_status, 'unknown');
  assert(!JSON.stringify(find([{ ...snapshots[0], rows_found: privateMarker, observed_status: privateMarker }])).includes(privateMarker));
  assert.equal(counts.buildSourceCounts(snapshots).should_ingest, false);
  const now = Date.now;
  try { Date.now = () => { throw Error('Counts must not read a clock'); }; counts.buildSourceCounts(counts.snapshotsFromJobs(input)); }
  finally { Date.now = now; }
  assert.deepEqual(network.attempts, []);
  console.log('distress source counts: known sources, latest saved preview only, strict numeric/source/date evidence, blocked/tie unknowns, no row leakage/network/mutation PASS');
} finally { network.restore(); }
