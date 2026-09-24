'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');
const { profileForCounty } = require('../sources/county-appraisal-profiles');
const { applyMatchedRecord, ingestBulkFile, matchRow } = require('../sources/county-appraisal-adapter');
const { compareCandidates } = require('../../scripts/cycle-44-select-test-property');

function clean(value) { return String(value == null ? '' : value).trim(); }
function error(code, statusCode) {
  const result = new Error(code);
  result.code = code;
  result.status_code = statusCode;
  return result;
}
function files(snapshotFile) {
  const directory = path.dirname(path.resolve(snapshotFile));
  return {
    snapshot: path.resolve(snapshotFile),
    stage: path.join(directory, 'county-appraisal-stage.json'),
    evidence: path.join(directory, 'county-appraisal-evidence.json')
  };
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (caught) {
    if (caught.code === 'ENOENT') return fallback;
    throw caught;
  }
}
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    try { fs.unlinkSync(temp); } catch (_) { /* renamed or best-effort cleanup */ }
  }
}
function snapshot(file) {
  let bytes;
  try { bytes = fs.readFileSync(file); }
  catch (caught) {
    if (caught.code === 'ENOENT') return { hash: '', rows: [], markets: [] };
    throw caught;
  }
  const data = JSON.parse(bytes.toString('utf8'));
  const rows = [];
  const markets = [];
  for (const [key, bucket] of Object.entries(data.markets || {})) {
    const stored = Array.isArray(bucket.rows) ? bucket.rows : [];
    markets.push({ market_key: key, rows_total: stored.length });
    for (const row of stored) rows.push({ market_key: key, row });
  }
  return { hash: crypto.createHash('sha256').update(bytes).digest('hex'), rows, markets };
}
function countyKey(row) {
  const county = clean(row && row.county);
  const state = clean(row && row.state).toUpperCase();
  return county ? `${county} County, ${state || 'state unknown'}` : 'unknown/unset county';
}
function completeAddress(row) {
  if (!clean(row && row.normalized_address)) return false;
  const parsed = canonicalizeAddress(row.normalized_address);
  return ['number', 'street', 'suffix', 'city', 'state', 'zip'].every((field) => Boolean(parsed[field]));
}
function rowIdentity(row) {
  return [clean(row && row.county).toUpperCase(), clean(row && row.state).toUpperCase(),
    clean(row && row.normalized_address).toUpperCase(), clean(row && row.parcel_id), clean(row && row.geo_id)].join('|');
}
function rowKey(marketKey, row) { return `${marketKey}|${clean(row && row.queue_key)}`; }
function ellisScopeHash(rows) {
  const identities = rows.filter((item) => clean(item.row.county).toUpperCase() === 'ELLIS' &&
    clean(item.row.state).toUpperCase() === 'TX')
    .map((item) => `${rowKey(item.market_key, item.row)}|${rowIdentity(item.row)}`).sort();
  return crypto.createHash('sha256').update(JSON.stringify(identities)).digest('hex');
}
function indexForStage(stage) {
  const byAddress = new Map();
  const byParcel = new Map();
  const byGeo = new Map();
  for (const record of stage.records || []) {
    for (const [map, key] of [[byAddress, record.address_key], [byParcel, record.parcel_id], [byGeo, record.geo_id]]) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(record);
    }
  }
  return { profile: profileForCounty(stage.provenance.county, stage.provenance.state),
    by_address: byAddress, by_parcel: byParcel, by_geo: byGeo };
}
function selectedRecords(rows, index) {
  const seen = new Map();
  for (const item of rows) {
    if (clean(item.row.county).toUpperCase() !== clean(index.profile.county).toUpperCase() ||
        clean(item.row.state).toUpperCase() !== clean(index.profile.state).toUpperCase()) continue;
    const row = item.row;
    const address = completeAddress(row) ? canonicalizeAddress(row.normalized_address).canonical_string : '';
    const parcel = clean(row.parcel_id || row.apn || row.owner_record && row.owner_record.parcel_id);
    const geo = clean(row.geo_id);
    for (const record of [...(index.by_address.get(address) || []), ...(index.by_parcel.get(parcel) || []),
      ...(index.by_geo.get(geo) || [])]) {
      seen.set(`${record.parcel_id}|${record.address_key}`, record);
    }
  }
  return [...seen.values()];
}
async function stageFile(input) {
  const { snapshot_file: snapshotFile, file_path: filePath, county, state, operator_id: operatorId } = input;
  const profile = profileForCounty(county, state);
  if (!profile) throw error('county_appraisal_profile_missing', 400);
  const current = snapshot(snapshotFile);
  const matchKeys = { addresses: new Set(), parcels: new Set(), geos: new Set() };
  for (const item of current.rows) {
    const row = item.row;
    if (clean(row.county).toUpperCase() !== 'ELLIS' || clean(row.state).toUpperCase() !== 'TX') continue;
    if (completeAddress(row)) matchKeys.addresses.add(canonicalizeAddress(row.normalized_address).canonical_string);
    const parcel = clean(row.parcel_id || row.apn || row.owner_record && row.owner_record.parcel_id);
    if (parcel) matchKeys.parcels.add(parcel);
    if (clean(row.geo_id)) matchKeys.geos.add(clean(row.geo_id));
  }
  const index = await ingestBulkFile({ profile, file_path: filePath, operator_id: operatorId, match_keys: matchKeys });
  if (input.file_name) index.provenance.file_name = path.basename(input.file_name);
  const stage = { version: 1, snapshot_hash: current.hash, ellis_scope_hash: ellisScopeHash(current.rows), provenance: index.provenance,
    records: selectedRecords(current.rows, index) };
  atomicJson(files(snapshotFile).stage, stage);
  return { ok: true, preview_only: true, provenance: stage.provenance,
    indexed_snapshot_records: stage.records.length, snapshot_rows_total: current.rows.length };
}
function eligibleCandidate(row, nowIso) {
  const record = row.county_appraisal_record || {};
  const event = clean(row.source_event_date || row.sale_date_iso || row.sale_date_or_event_date).slice(0, 10);
  return record.equity_signal === 'LIKELY_EQUITY' && Number(row.year_built) > 0 && Number(row.year_built) <= 2010 &&
    Number(record.years_held) >= 8 && (record.owner_occupied === false || record.homestead_exemption === false) &&
    clean(row.address_state) === 'complete_source_address' && /^\d{4}-\d{2}-\d{2}$/.test(event) && event >= nowIso.slice(0, 10);
}
function candidate(row) {
  const record = row.county_appraisal_record;
  return { queue_key: row.queue_key, address: row.normalized_address,
    source_event_date: row.source_event_date || row.sale_date_iso || row.sale_date_or_event_date,
    owner_of_record: record.owner_of_record, mailing_address: record.mailing_address,
    parcel_id: record.parcel_id, year_built: row.year_built, years_held: record.years_held,
    owner_occupied: record.owner_occupied, homestead_exemption: record.homestead_exemption,
    assessed_value_clue: record.assessed_value, equity_signal: record.equity_signal,
    source_url: record.source_url, source_kind: record.source_kind };
}
function preview(input) {
  const snapshotFile = input.snapshot_file;
  const current = snapshot(snapshotFile);
  const stage = readJson(files(snapshotFile).stage, null);
  const usable = Boolean(stage && stage.provenance && stage.provenance.county === 'Ellis' &&
    stage.provenance.state === 'TX' && stage.ellis_scope_hash === ellisScopeHash(current.rows));
  const index = usable ? indexForStage(stage) : null;
  const districts = {};
  const byMarket = {};
  const equity = { LIKELY_EQUITY: 0, LIKELY_THIN: 0, LIKELY_NONE: 0, UNKNOWN: 0 };
  const conflicts = [];
  const candidates = [];
  const yieldCounts = { owner_of_record: 0, mailing_address: 0, mail_ready: 0 };
  const nowIso = input.now_iso || new Date().toISOString();
  for (const item of current.rows) {
    const row = item.row;
    const county = countyKey(row);
    const counts = districts[county] ||= { rows_total: 0, rows_with_complete_address: 0,
      exact_match: 0, ambiguous_match: 0, no_match: 0, not_applicable_wrong_county: 0 };
    counts.rows_total += 1;
    if (completeAddress(row)) counts.rows_with_complete_address += 1;
    const market = byMarket[item.market_key] ||= { rows_total: 0, county_distribution: {} };
    market.rows_total += 1;
    market.county_distribution[county] = (market.county_distribution[county] || 0) + 1;
    if (clean(row.county).toUpperCase() !== 'ELLIS' || clean(row.state).toUpperCase() !== 'TX') {
      counts.not_applicable_wrong_county += 1;
      continue;
    }
    if (!index) continue;
    const match = matchRow(row, index);
    if (match.status === 'ambiguous') { counts.ambiguous_match += 1; continue; }
    if (match.status !== 'matched') { counts.no_match += 1; continue; }
    counts.exact_match += 1;
    const enriched = enrich(row, match.record, nowIso, '', '');
    const before = require('./lead-operations-state').contactStateForDeal(row);
    if (!clean(row.owner_record && row.owner_record.owner_name) && clean(enriched.owner_record && enriched.owner_record.owner_name)) yieldCounts.owner_of_record += 1;
    if (!clean(row.mailing_route && row.mailing_route.value) && clean(enriched.mailing_route && enriched.mailing_route.value)) yieldCounts.mailing_address += 1;
    if (before.contact_state !== 'MAIL_READY' && enriched.contact_state === 'MAIL_READY') yieldCounts.mail_ready += 1;
    equity[enriched.county_appraisal_record.equity_signal] += 1;
    for (const conflict of enriched.appraisal_conflicts || []) {
      conflicts.push(Object.assign({ queue_key: row.queue_key, county: 'Ellis' }, conflict));
    }
    if (eligibleCandidate(enriched, nowIso)) candidates.push(enriched);
  }
  candidates.sort((a, b) => compareCandidates(a, b, nowIso));
  const ellis = districts['Ellis County, TX'] || { rows_total: 0, rows_with_complete_address: 0,
    exact_match: 0, ambiguous_match: 0, no_match: 0, not_applicable_wrong_county: 0 };
  return { ok: true, preview_only: true, not_a_saved_lead: true,
    state: !stage ? 'no county file ingested' : usable ? 'ready_for_explicit_apply' : 'county file staged for a different snapshot; restage required',
    total_rows: current.rows.length, county_distribution: districts, markets: byMarket,
    ellis: Object.assign({}, ellis, { yield: usable ? yieldCounts : null, equity_clue_distribution: usable ? equity : null,
      conflicts: usable ? conflicts : null, ranked_candidates: usable ? candidates.slice(0, 5).map(candidate) : null,
      qualifying_candidate_count: usable ? candidates.length : null,
      ranking_note: usable ? `${Math.min(candidates.length, 5)} of ${candidates.length} qualifying properties shown; no padding.` : 'Not measured without a current county file.' }),
    ingest_provenance: stage ? Object.assign({}, stage.provenance, { bulk_export_page_url: stage.provenance.source_page_url }) : null };
}
function conflictAudit(items) {
  return (items || []).map((item) => Object.assign({}, item, {
    source_won: 'official_public_record', reason: 'County official value wins for the same field; prior value retained for audit.'
  }));
}
function appendConflict(items, field, previous, official, priorSourceUrl, officialSourceUrl) {
  if (!clean(previous) || !clean(official) || clean(previous) === clean(official)) return;
  if (items.some((item) => item.field === field && clean(item.prior_value) === clean(previous))) return;
  items.push({ field, prior_value: previous, official_value: official,
    prior_source_url: clean(priorSourceUrl), official_source_url: clean(officialSourceUrl) });
}
function enrich(row, record, nowIso, appliedAt, appliedBy) {
  const updated = applyMatchedRecord(row, record, nowIso);
  const extraConflicts = [];
  const sourceUrl = record.source_url || record.bulk_source_url;
  appendConflict(extraConflicts, 'mailing_route.value', row.mailing_route && row.mailing_route.value,
    record.mailing_address, row.mailing_route && row.mailing_route.source_url, sourceUrl);
  appendConflict(extraConflicts, 'property_story.assessed_value', row.property_story && row.property_story.assessed_value,
    record.assessed_value, row.property_story && row.property_story.source_url, sourceUrl);
  updated.county_appraisal_record = Object.assign({}, updated.county_appraisal_record, {
    applied_at: appliedAt || null, applied_by: appliedBy || null
  });
  updated.appraisal_conflicts = conflictAudit([...(updated.appraisal_conflicts || []), ...extraConflicts]);
  const source = { source_kind: 'official_public_record', county: record.county,
    property_id: record.parcel_id, source_url: sourceUrl,
    applied_at: appliedAt || null, applied_by: appliedBy || null };
  const fieldNames = ['owner_of_record', 'mailing_address', 'parcel_id', 'geo_id', 'legal_description',
    'property_type', 'lot_size_acres', 'assessed_value', 'latest_deed_date'];
  updated.county_appraisal_field_provenance = Object.fromEntries(fieldNames.filter((field) =>
    record[field] !== null && record[field] !== undefined && clean(record[field]) !== '').map((field) => [field, source]));
  return updated;
}
function joinRow(row, evidence, nowIso = new Date().toISOString()) {
  if (!evidence || !evidence.index) return row;
  const index = evidence.index;
  const parcel = clean(row && (row.parcel_id || row.apn || row.owner_record && row.owner_record.parcel_id));
  let match;
  if (parcel && clean(row.county).toUpperCase() === 'ELLIS' && clean(row.state).toUpperCase() === 'TX') {
    const options = index.by_parcel.get(parcel) || [];
    if (options.length > 1) return row;
    if (options.length === 1) {
      const address = completeAddress(row) ? canonicalizeAddress(row.normalized_address).canonical_string : '';
      if (address && address !== options[0].address_key) return row;
      match = { status: 'matched', record: options[0] };
    }
  }
  if (!match) match = matchRow(row, index);
  if (match.status !== 'matched') return row;
  const entry = evidence.store.records.find((candidate) => candidate.record.parcel_id === match.record.parcel_id &&
    candidate.record.address_key === match.record.address_key);
  return entry ? enrich(row, entry.record, nowIso, entry.applied_at, entry.applied_by) : row;
}
function readEvidence(snapshotFile) { return readJson(files(snapshotFile).evidence, null); }
function prepareEvidence(snapshotFile) {
  const store = readEvidence(snapshotFile);
  if (!store || !Array.isArray(store.records) || !store.records.length) return null;
  return { store, index: indexForStage({ provenance: store.provenance, records: store.records.map((entry) => entry.record) }) };
}
function apply(input) {
  const snapshotFile = input.snapshot_file;
  if (clean(input.county).toUpperCase() !== 'ELLIS' || clean(input.state).toUpperCase() !== 'TX') throw error('county_appraisal_county_not_supported', 400);
  if (!/^[0-9a-f]{64}$/i.test(clean(input.file_hash))) throw error('county_appraisal_file_hash_required', 400);
  const paths = files(snapshotFile);
  const stage = readJson(paths.stage, null);
  if (!stage || !stage.provenance || clean(stage.provenance.file_hash) !== clean(input.file_hash)) throw error('county_appraisal_file_hash_mismatch', 409);
  const prior = readEvidence(snapshotFile);
  const current = snapshot(snapshotFile);
  if (stage.ellis_scope_hash !== ellisScopeHash(current.rows)) throw error('county_appraisal_snapshot_changed_restaging_required', 409);
  const sameFile = Boolean(prior && prior.provenance.file_hash === stage.provenance.file_hash);
  const existingRecords = sameFile ? prior.records : [];
  const existingKeys = new Set(existingRecords.map((entry) => `${entry.record.parcel_id}|${entry.record.address_key}`));
  if (sameFile && stage.records.every((record) => existingKeys.has(`${record.parcel_id}|${record.address_key}`))) {
    return { ok: true, idempotent: true, applied_at: prior.applied_at,
      rows_applied: prior.write_log[prior.write_log.length - 1].rows_applied };
  }
  const index = indexForStage(stage);
  const records = [];
  let fieldsWritten = 0;
  let conflictsRecorded = 0;
  let matchedRows = 0;
  const appliedAt = input.now_iso || new Date().toISOString();
  for (const item of current.rows) {
    const match = matchRow(item.row, index);
    if (match.status !== 'matched') continue;
    matchedRows += 1;
    if (existingKeys.has(`${match.record.parcel_id}|${match.record.address_key}`)) continue;
    const enriched = enrich(item.row, match.record, appliedAt, clean(input.operator_id));
    fieldsWritten += Object.keys(enriched.county_appraisal_field_provenance).length;
    conflictsRecorded += enriched.appraisal_conflicts.length;
    records.push({ record: match.record, applied_at: appliedAt, applied_by: clean(input.operator_id),
      row_key_at_apply: rowKey(item.market_key, item.row), row_identity_at_apply: rowIdentity(item.row) });
  }
  const unique = new Map([...existingRecords, ...records].map((entry) => [`${entry.record.parcel_id}|${entry.record.address_key}`, entry]));
  const next = { version: 1, provenance: stage.provenance, applied_at: appliedAt,
    records: [...unique.values()], write_log: [...(prior && prior.write_log || []), {
      who: clean(input.operator_id), when: appliedAt, county: 'Ellis', file_hash: stage.provenance.file_hash,
      rows_matched: matchedRows, rows_applied: records.length, fields_written: fieldsWritten,
      conflicts_recorded: conflictsRecorded }] };
  atomicJson(paths.evidence, next);
  return { ok: true, idempotent: false, applied_at: appliedAt, rows_applied: records.length,
    fields_written: fieldsWritten, conflicts_recorded: conflictsRecorded };
}

module.exports = { apply, completeAddress, enrich, files, joinRow, prepareEvidence, preview, readEvidence, stageFile };
