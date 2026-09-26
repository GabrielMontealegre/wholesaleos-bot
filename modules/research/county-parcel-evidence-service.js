'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');
const { profileForCounty } = require('../sources/county-appraisal-profiles');
const parcelService = require('../sources/county-parcel-service');
const appraisalEvidence = require('./county-appraisal-evidence-service');
const { manualValueSummaryForRow, readPacketStore } = require('./manual-evidence-packet-service');
let syncInFlight = false;

function clean(value) { return String(value == null ? '' : value).trim(); }
function storePath(snapshotFile) {
  return path.join(path.dirname(path.resolve(snapshotFile)), 'county-parcel-evidence.json');
}
function readStore(snapshotFile) {
  try { return JSON.parse(fs.readFileSync(storePath(snapshotFile), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function snapshot(snapshotFile) {
  const bytes = fs.readFileSync(snapshotFile);
  const data = JSON.parse(bytes.toString('utf8'));
  const entries = Object.entries(data.markets || {});
  return { hash: crypto.createHash('sha256').update(bytes).digest('hex'),
    rows: entries.flatMap(([, bucket]) => Array.isArray(bucket.rows) ? bucket.rows : []),
    row_markets: entries.flatMap(([key, bucket]) => {
      const market = bucket.market || Object.fromEntries(['city', 'county', 'state'].map((field, index) =>
        [field, key.split('|')[index] || '']));
      return Array.isArray(bucket.rows) ? bucket.rows.map(() => market) : [];
    }) };
}
function completeAddress(row) {
  const parts = canonicalizeAddress(row && row.normalized_address);
  return ['number', 'street', 'suffix', 'city', 'state', 'zip'].every((field) => parts[field]) ? parts.canonical_string : '';
}
function indexRecords(records, profile) {
  const byParcel = new Map();
  const byAddress = new Map();
  for (const entry of records || []) {
    const record = entry.record || entry;
    if (record.county !== profile.county || record.state !== profile.state) continue;
    for (const [index, key] of [[byParcel, clean(record.parcel_id)], [byAddress, clean(record.address_key)]]) {
      if (!key) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(entry);
    }
  }
  return { profile, by_parcel: byParcel, by_address: byAddress };
}
function matchRow(row, index) {
  if (!row || clean(row.county).toUpperCase() !== index.profile.county.toUpperCase() ||
      clean(row.state).toUpperCase() !== index.profile.state.toUpperCase()) return { status: 'no_match', reason: 'wrong_county' };
  const parcel = clean(row.parcel_id || row.apn || row.owner_record && row.owner_record.parcel_id);
  const address = completeAddress(row);
  const candidates = parcel ? index.by_parcel.get(parcel) || [] : address ? index.by_address.get(address) || [] : [];
  if (candidates.length > 1) return { status: 'ambiguous', reason: 'multiple_exact_county_records' };
  if (!candidates.length) return { status: 'no_match', reason: 'no_exact_county_record' };
  const entry = candidates[0];
  const record = entry.record || entry;
  if (address && address !== record.address_key) return { status: 'no_match', reason: 'parcel_address_conflict' };
  return { status: 'matched', record, entry, match_basis: parcel ? 'parcel_id' : 'exact_address' };
}
function prepareEvidence(snapshotFile) {
  const store = readStore(snapshotFile);
  if (!store || !Array.isArray(store.records) || !store.records.length) return null;
  const profile = profileForCounty(store.county, store.state);
  return profile ? { store, index: indexRecords(store.records, profile) } : null;
}
function joinRow(row, evidence, nowIso = new Date().toISOString()) {
  if (!evidence) return row;
  const match = matchRow(row, evidence.index);
  if (match.status !== 'matched') return row;
  return appraisalEvidence.enrich(row, match.record, nowIso, match.entry.applied_at, match.entry.applied_by);
}
function writeStore(snapshotFile, value) {
  const file = storePath(snapshotFile);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    try { fs.unlinkSync(temp); } catch (_) { /* renamed or best-effort cleanup */ }
  }
}
function histogram(rows, rowMarkets, packetStore) {
  const missing = {};
  let ready = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const result = manualValueSummaryForRow(rows[index], rowMarkets[index], { packet_store: packetStore }).subject_grid_readiness;
    if (result.ready) ready += 1;
    for (const attribute of result.missing) missing[attribute] = (missing[attribute] || 0) + 1;
  }
  return { rows_total: rows.length, ready_count: ready, missing };
}
function samePublishedFacts(left, right) {
  if (!left || !right) return false;
  const withoutQueryUrl = (record) => Object.fromEntries(Object.entries(record)
    .filter(([field]) => field !== 'source_url'));
  return JSON.stringify(withoutQueryUrl(left)) === JSON.stringify(withoutQueryUrl(right));
}
async function syncOnce(input, options = {}) {
  const profile = profileForCounty(input.county, input.state);
  if (!profile || !profile.arcgis_parcel_service) {
    return { ok: false, status: 'unsupported_county', reason: 'county_parcel_profile_missing' };
  }
  const before = snapshot(input.snapshot_file);
  const packetStore = options.packet_store || readPacketStore();
  const existing = readStore(input.snapshot_file);
  const bulk = appraisalEvidence.prepareEvidence(input.snapshot_file);
  const priorParcels = prepareEvidence(input.snapshot_file);
  const baselineRows = before.rows.map((row) => joinRow(appraisalEvidence.joinRow(row, bulk), priorParcels));
  const countyRows = baselineRows.filter((row) => clean(row.county).toUpperCase() === profile.county.toUpperCase() &&
    clean(row.state).toUpperCase() === profile.state.toUpperCase());
  const fetched = await parcelService.fetchCandidates(countyRows, profile, options);
  if (fetched.status !== 'ok') return { ok: false, status: fetched.status, reason: fetched.reason,
    request_count: fetched.request_count, block_events: fetched.status === 'blocked' ? [fetched.reason] : [] };
  if (snapshot(input.snapshot_file).hash !== before.hash) {
    return { ok: false, status: 'snapshot_changed', reason: 'snapshot_changed_during_county_read',
      request_count: fetched.request_count };
  }
  const index = indexRecords(fetched.records, profile);
  const priorByKey = new Map((existing && existing.records || []).map((entry) =>
    [`${entry.record.parcel_id}|${entry.record.address_key}`, entry]));
  const matches = new Map();
  const matchCounts = { matched: 0, ambiguous: 0, no_match: 0 };
  const gained = { year_built: 0, lot_size: 0, property_kind: 0, coordinates: 0,
    owner_of_record: 0, mailing_address: 0, mail_ready: 0 };
  const afterRows = [];
  const appliedAt = input.now_iso || new Date().toISOString();
  for (const row of baselineRows) {
    if (clean(row.county).toUpperCase() !== profile.county.toUpperCase() ||
        clean(row.state).toUpperCase() !== profile.state.toUpperCase()) { afterRows.push(row); continue; }
    const match = matchRow(row, index);
    if (match.status !== 'matched') {
      matchCounts[match.status] += 1;
      afterRows.push(row);
      continue;
    }
    matchCounts.matched += 1;
    const record = match.record;
    const key = `${record.parcel_id}|${record.address_key}`;
    matches.set(key, record);
    const updated = appraisalEvidence.enrich(row, record, appliedAt, appliedAt, clean(input.operator_id));
    for (const field of ['year_built', 'lot_size', 'property_kind']) {
      if (!clean(row[field]) && clean(updated[field])) gained[field] += 1;
    }
    if ((!clean(row.latitude) || !clean(row.longitude)) && clean(updated.latitude) && clean(updated.longitude)) gained.coordinates += 1;
    if (!clean(row.owner_record && row.owner_record.owner_name) && clean(updated.owner_record && updated.owner_record.owner_name)) gained.owner_of_record += 1;
    if (!clean(row.mailing_route && row.mailing_route.value) && clean(updated.mailing_route && updated.mailing_route.value)) gained.mailing_address += 1;
    if (row.contact_state !== 'MAIL_READY' && updated.contact_state === 'MAIL_READY') gained.mail_ready += 1;
    afterRows.push(updated);
  }
  const updates = [];
  for (const [key, record] of matches) {
    const prior = priorByKey.get(key);
    if (prior && samePublishedFacts(prior.record, record)) continue;
    updates.push(key);
    priorByKey.set(key, { record, applied_at: appliedAt, applied_by: clean(input.operator_id) });
  }
  const result = { ok: true, status: 'applied', request_count: fetched.request_count,
    candidate_count: fetched.records.length, ...matchCounts, records_applied: updates.length,
    idempotent: updates.length === 0, gained,
    before: histogram(baselineRows, before.row_markets, packetStore),
    after: histogram(afterRows, before.row_markets, packetStore),
    block_events: [] };
  if (updates.length) writeStore(input.snapshot_file, {
    version: 1, county: profile.county, state: profile.state, applied_at: appliedAt,
    records: [...priorByKey.values()], write_log: [...(existing && existing.write_log || []), {
      applied_at: appliedAt, applied_by: clean(input.operator_id), records_applied: updates.length,
      rows_matched: matchCounts.matched, request_count: fetched.request_count
    }]
  });
  return result;
}

async function sync(input, options = {}) {
  if (syncInFlight) return { ok: false, status: 'busy', reason: 'county_parcel_sync_already_running' };
  syncInFlight = true;
  try { return await syncOnce(input, options); }
  finally { syncInFlight = false; }
}

module.exports = { histogram, indexRecords, joinRow, matchRow, prepareEvidence, readStore, storePath, sync };
