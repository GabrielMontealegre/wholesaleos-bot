'use strict';

const profiles = require('./distress-list-profiles');
const adapter = require('./distress-list-acquisition-adapter');
const registry = require('./source-adapter-registry');
const byId = new Map(profiles.PROFILES.map(profile => [profile.source_id, profile]));
const statuses = new Set(['available', 'blocked', 'needs_manual_review', 'manual_only', 'needs_reader_settings', 'not_configured']);

function own(object, key) {
  return object && Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function snapshotInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')) ? time : null;
}

function count(object, key) {
  const value = own(object, key);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// Project before returning from the store reader: no card, proof, audit or free text leaves it.
function snapshotsFromJobs(jobs) {
  const snapshots = [];
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const time = snapshotInstant(own(job, 'updated_at'));
    if (time == null) continue;
    const outcomes = own(own(job, 'source_summary'), 'acquisition_core_adapter_results');
    for (const outcome of Array.isArray(outcomes) ? outcomes : []) {
      const profile = byId.get(own(outcome, 'source_id'));
      if (!profile) continue;
      const summary = own(outcome, 'distress_summary');
      let rows = null, unique = null, updates = null;
      if (summary && own(summary, 'source_id') === profile.source_id && own(summary, 'source_kind') === profile.source_kind) {
        rows = count(summary, 'rows_found'); unique = count(summary, 'new_leads'); updates = count(summary, 'updated_leads');
        if (rows == null || unique == null || updates == null || unique + updates > rows) rows = unique = updates = null;
      }
      const status = statuses.has(own(outcome, 'status')) ? outcome.status : 'unknown';
      if (!['available', 'needs_manual_review'].includes(status)) rows = unique = updates = null;
      snapshots.push({ source_id: profile.source_id, snapshot_updated_at: new Date(time).toISOString(),
        observed_status: status, rows_found: rows, unique_preview_rows: unique, updated_duplicate_rows: updates });
    }
  }
  return snapshots;
}

function buildSourceCounts(snapshots) {
  const latest = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const profile = byId.get(own(snapshot, 'source_id'));
    const time = snapshotInstant(own(snapshot, 'snapshot_updated_at'));
    if (!profile || time == null) continue;
    const status = statuses.has(own(snapshot, 'observed_status')) ? snapshot.observed_status : 'unknown';
    let rows = count(snapshot, 'rows_found'), unique = count(snapshot, 'unique_preview_rows'), updates = count(snapshot, 'updated_duplicate_rows');
    if (!['available', 'needs_manual_review'].includes(status) || rows == null || unique == null || updates == null || unique + updates > rows) rows = unique = updates = null;
    const safe = { source_id: profile.source_id, snapshot_updated_at: new Date(time).toISOString(), observed_status: status,
      rows_found: rows, unique_preview_rows: unique, updated_duplicate_rows: updates };
    const prior = latest.get(profile.source_id);
    if (!prior || time > prior.time) latest.set(profile.source_id, { time, snapshot: safe, conflict: false });
    else if (time === prior.time && JSON.stringify(safe) !== JSON.stringify(prior.snapshot)) prior.conflict = true;
  }
  const registeredIds = new Set(adapter.autoRunnableProfiles().map(profile => profile.source_id)
    .filter(id => registry.adapterIdForSourceId(id) === 'distress_list_acquisition_adapter'));
  const sources = profiles.PROFILES.map(profile => {
    const observed = latest.get(profile.source_id);
    const snapshot = observed && !observed.conflict ? observed.snapshot : null;
    return {
      source_id: profile.source_id, source_kind: profile.source_kind, county: profile.county, state: profile.state,
      readiness: !profile.runnable ? 'manual_only' : registeredIds.has(profile.source_id) ? 'ready_not_scheduled' : 'needs_reader_settings',
      manual_reason: profile.manual_reason,
      registered: registeredIds.has(profile.source_id),
      observation_state: observed && observed.conflict ? 'conflicting_saved_outcomes' : snapshot ? 'saved_preview_outcome' : 'no_valid_saved_outcome',
      snapshot_updated_at: snapshot ? snapshot.snapshot_updated_at : null,
      observed_status: snapshot ? snapshot.observed_status : null,
      rows_found: snapshot ? snapshot.rows_found : null,
      unique_preview_rows: snapshot ? snapshot.unique_preview_rows : null,
      updated_duplicate_rows: snapshot ? snapshot.updated_duplicate_rows : null
    };
  });
  return {
    schema_version: 1, report_kind: 'public_distress_preview_source_counts',
    scope: 'latest_saved_outcome_per_source_in_retained_scout_jobs',
    collection_enabled: false, preview_only: true, should_ingest: false,
    configured_source_count: sources.length,
    observed_source_count: sources.filter(source => source.observation_state === 'saved_preview_outcome').length,
    sources
  };
}

module.exports = { snapshotsFromJobs, buildSourceCounts };
