'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');
const { profileForCounty } = require('../sources/county-appraisal-profiles');
const { applyMatchedRecord, ingestBulkFile, matchRow } = require('../sources/county-appraisal-adapter');
const { compareCandidates } = require('../../scripts/cycle-44-select-test-property');
const propertyIdentityGrouping = require('./property-identity-grouping');

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
  const matchKeys = { addresses: new Set(), parcels: new Set(), geos: new Set(), audit_targets: [] };
  for (const item of current.rows) {
    const row = item.row;
    if (clean(row.county).toUpperCase() !== 'ELLIS' || clean(row.state).toUpperCase() !== 'TX') continue;
    if (completeAddress(row)) {
      const parts = canonicalizeAddress(row.normalized_address);
      matchKeys.addresses.add(parts.canonical_string);
      matchKeys.audit_targets.push({ key: rowKey(item.market_key, row), parts });
    }
    const parcel = clean(row.parcel_id || row.apn || row.owner_record && row.owner_record.parcel_id);
    if (parcel) matchKeys.parcels.add(parcel);
    if (clean(row.geo_id)) matchKeys.geos.add(clean(row.geo_id));
  }
  const index = await ingestBulkFile({ profile, file_path: filePath, operator_id: operatorId, match_keys: matchKeys });
  if (input.file_name) index.provenance.file_name = path.basename(input.file_name);
  const stage = { version: 1, snapshot_hash: current.hash, ellis_scope_hash: ellisScopeHash(current.rows), provenance: index.provenance,
    records: selectedRecords(current.rows, index),
    audit: { version: 1, raw_by_record: Object.fromEntries(index.audit_raw),
      near_by_row: Object.fromEntries(index.audit_near) } };
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
const ADDRESS_COMPONENTS = ['number', 'directional', 'street', 'suffix', 'unit', 'city', 'state', 'zip'];
function addressComparison(left, right) {
  return ADDRESS_COMPONENTS.map((component) => ({ component,
    row_value: clean(left && left[component]), county_value: clean(right && right[component]),
    result: clean(left && left[component]) === clean(right && right[component]) ? 'MATCH' : 'DIFFER' }));
}
function differingComponent(left, right) {
  const different = addressComparison(left, right).find((item) => item.result === 'DIFFER');
  if (!different) return '';
  if (different.component === 'unit' && Boolean(different.row_value) !== Boolean(different.county_value)) return 'unit_present_one_side';
  return ({ number: 'street_number_mismatch', directional: 'directional_mismatch', street: 'street_name_mismatch',
    suffix: 'suffix_mismatch', unit: 'unit_mismatch', city: 'city_mismatch', state: 'state_mismatch',
    zip: 'zip_mismatch' })[different.component];
}
function rawFieldEcho(record, raw) {
  const parsedNames = { latest_deed_date: 'latest_deed_date', latest_deed_instrument: 'latest_deed_instrument',
    improvement_actual_year: 'improvement_actual_year', assessed_value: 'assessed_value', acreage: 'lot_size_acres' };
  return Object.fromEntries(Object.entries(parsedNames).map(([field, parsedName]) => {
    const source = raw && raw.diagnostic_fields && raw.diagnostic_fields[field] || {};
    const parsed = record && record[parsedName] == null ? null : record && record[parsedName];
    const status = source.raw == null ? 'field_missing' : !clean(source.raw) ? 'empty'
      : parsed == null || parsed === '' ? 'unparsable' : 'parsed';
    return [field, { field_name: source.field_name || '', raw: source.raw == null ? null : source.raw,
      parsed, parse_status: status }];
  }));
}
function equityAuditReason(record, echo) {
  const deed = echo.latest_deed_date;
  if (!deed.field_name) return 'deed_date_field_not_mapped';
  if (deed.parse_status === 'field_missing') return 'deed_date_field_missing';
  if (deed.parse_status === 'empty') return 'deed_date_present_but_field_empty';
  if (deed.parse_status === 'unparsable') return 'deed_date_unparsable';
  if (!Array.isArray(record && record.deed_history) || !record.deed_history.length) return 'insufficient_history';
  return record.equity_signal === 'UNKNOWN' ? 'current_owner_deed_not_established' : 'tenure_clue_available';
}
function mailAudit(row, record, enriched) {
  const fieldProvenance = require('./field-provenance');
  const state = require('./lead-operations-state');
  const priorRoute = row.mailing_route;
  if (priorRoute && clean(priorRoute.value) && fieldProvenance.routeHasProvenance(priorRoute)) {
    return { would_change: false, reason_code: 'already_has_mailing_route' };
  }
  if (!clean(record.mailing_address)) return { would_change: false, reason_code: 'county_mailing_address_missing' };
  const projectedRoute = enriched.mailing_route;
  if (!projectedRoute || !fieldProvenance.routeHasProvenance(projectedRoute)) {
    return { would_change: false, reason_code: 'mailing_address_missing_provenance' };
  }
  const before = state.contactStateForDeal(row).contact_state;
  const after = enriched.contact_state;
  if (before !== 'MAIL_READY' && after === 'MAIL_READY') return { would_change: true, reason_code: 'new_proven_mailing_route' };
  if (row.lifecycle_status && row.lifecycle_status.quarantined === true) {
    return { would_change: false, reason_code: 'lifecycle_quarantined' };
  }
  if (after === 'CALL_READY' || after === 'OUTREACH_READY') {
    return { would_change: false, reason_code: 'higher_priority_contact_route' };
  }
  if (after === 'CONTACT_COMPLETE') return { would_change: false, reason_code: 'contact_workflow_complete' };
  return { would_change: false, reason_code: 'contact_state_not_mail_ready' };
}
function auditRow(item, index, stage, nowIso, detail) {
  const row = item.row;
  const isEllis = clean(row.county).toUpperCase() === 'ELLIS' && clean(row.state).toUpperCase() === 'TX';
  const rowParts = canonicalizeAddress(row.normalized_address);
  const key = rowKey(item.market_key, row);
  const near = stage.audit.near_by_row[key] || { count: 0, candidates: [] };
  let match = null;
  let verdict = 'NOT_APPLICABLE_WRONG_COUNTY';
  let reason = 'county_or_state_mismatch';
  if (isEllis) {
    if (!completeAddress(row)) { verdict = 'NO_MATCH'; reason = 'row_address_incomplete'; }
    else {
      match = matchRow(row, index);
      verdict = match.status === 'matched' ? 'EXACT' : match.status === 'ambiguous' ? 'AMBIGUOUS' : 'NO_MATCH';
      reason = verdict === 'EXACT' ? 'exact_canonical_match' : verdict === 'AMBIGUOUS'
        ? 'multiple_exact_county_records' : match.reason === 'parcel_or_geo_conflicts_with_address'
          ? 'parcel_or_geo_conflict' : (near.candidates[0] && differingComponent(rowParts, near.candidates[0].parts)) || 'no_candidate_in_index';
    }
  }
  const record = match && match.status === 'matched' ? match.record : null;
  const raw = record && stage.audit.raw_by_record[`${record.parcel_id}|${record.address_key}`];
  const echo = rawFieldEcho(record, raw);
  const enriched = record ? enrich(row, record, nowIso, '', '') : null;
  const mail = record ? mailAudit(row, record, enriched) : { would_change: false, reason_code: 'no_matched_county_record' };
  const equity = record ? enriched.county_appraisal_record.equity_signal : 'UNKNOWN';
  const diagnostics = propertyIdentityGrouping.rowDiagnostics(row, nowIso);
  const reasonTexts = { exact_canonical_match: 'The complete sourced property address matches one county parcel.',
    multiple_exact_county_records: 'More than one county parcel has this exact property address.',
    county_or_state_mismatch: 'This row is outside Ellis County, Texas.',
    row_address_incomplete: 'The sourced property address is incomplete, so this audit did not consult county candidates.',
    no_candidate_in_index: 'No staged county candidate shares enough address components to explain the miss.',
    parcel_or_geo_conflict: 'The address matched, but the stored parcel or geographic identifier conflicts.',
    suffix_mismatch: 'The street suffix differs from the closest county candidate.',
    street_number_mismatch: 'The street number differs from the closest county candidate.',
    unit_present_one_side: 'A unit appears on only one side of the address comparison.' };
  const summary = { queue_key: clean(row.queue_key), county: clean(row.county), state: clean(row.state),
    row_address_canonical: rowParts.canonical_string, match_verdict: verdict, match_reason_code: reason,
    match_reason_text: reasonTexts[reason] || `The closest county candidate differs: ${reason.replace(/_/g, ' ')}.`,
    parcel_id: clean(record && record.parcel_id || row.parcel_id), geo_id: clean(record && record.geo_id || row.geo_id),
    mail_ready_would_change: mail.would_change, mail_ready_block_reason_code: mail.would_change ? null : mail.reason_code,
    equity_clue: equity, equity_clue_reason_code: record ? equityAuditReason(enriched.county_appraisal_record, echo) : 'no_matched_county_record',
    conflict_count: enriched ? enriched.appraisal_conflicts.length : 0, near_miss_count: near.count || 0,
    quarantine_reason_code: diagnostics.quarantine_reason_code || null,
    queue_key_address_mismatch: diagnostics.queue_key_address_mismatch,
    queue_key_contaminated_by: diagnostics.queue_key_contaminated_by };
  if (!detail) return summary;
  const countyParts = record ? canonicalizeAddress(record.normalized_address) : null;
  const nearMisses = (near.candidates || []).map((candidate) => ({ parcel_id: candidate.parcel_id,
    geo_id: candidate.geo_id, canonical: candidate.parts, differing_component: differingComponent(rowParts, candidate.parts) }));
  const changedFields = enriched ? Object.keys(enriched).filter((field) =>
    JSON.stringify(enriched[field]) !== JSON.stringify(row[field])).map((field) => ({ field,
      stored_value: row[field] === undefined ? null : row[field], would_be: enriched[field] })) : [];
  return Object.assign({}, summary, diagnostics, {
    row_side: { sourced_address: clean(row.normalized_address), canonical: rowParts,
      source_document_url: clean(row.document_reextraction_source_url || row.source_document_url || row.source_url),
      address_state: clean(row.address_state), address_state_display: diagnostics.address_state_display,
      address_state_reason_code: diagnostics.address_state_reason_code,
      complete_source_address: clean(row.address_state) === 'complete_source_address' && completeAddress(row) },
    county_side: record ? { canonical: countyParts, mapped_situs_fields: raw && raw.situs_fields || null,
      parcel_id: record.parcel_id, geo_id: record.geo_id, legal_description: record.legal_description,
      acreage: record.lot_size_acres, state_code: record.state_code, property_type: record.property_type } : null,
    comparison: record ? addressComparison(rowParts, countyParts) : [],
    raw_field_echo: record ? echo : null,
    near_misses: nearMisses,
    provenance: record ? { source_kind: 'official_public_record', county: record.county,
      parcel_id: record.parcel_id, source_url: record.source_url || record.bulk_source_url,
      bulk_file_name: stage.provenance.file_name, file_hash: stage.provenance.file_hash,
      record_count: stage.provenance.record_count, ingested_at: stage.provenance.ingested_at,
      operator_id: stage.provenance.operator_id } : null,
    conflicts: enriched ? enriched.appraisal_conflicts : [],
    would_apply_preview: { not_applied: true, label: 'Not applied', fields: changedFields },
    owner_of_record: record ? record.owner_of_record : null,
    mailing_address: record ? record.mailing_address : null
  });
}
function audit(input) {
  if (clean(input.county).toUpperCase() !== 'ELLIS' || clean(input.state).toUpperCase() !== 'TX') {
    throw error('county_appraisal_audit_county_not_supported', 400);
  }
  const current = snapshot(input.snapshot_file);
  const stage = readJson(files(input.snapshot_file).stage, null);
  if (!stage || !stage.audit || stage.audit.version !== 1 ||
      stage.ellis_scope_hash !== ellisScopeHash(current.rows)) {
    throw error('county_appraisal_audit_restaging_required', 409);
  }
  const index = indexForStage(stage);
  const nowIso = input.now_iso || new Date().toISOString();
  const queueKey = clean(input.queue_key);
  if (queueKey) {
    const matches = current.rows.filter((item) => clean(item.row.queue_key) === queueKey);
    if (!matches.length) throw error('county_appraisal_audit_row_not_found', 404);
    if (matches.length > 1) throw error('county_appraisal_audit_queue_key_ambiguous', 409);
    return { ok: true, preview_only: true, not_a_saved_lead: true, not_applied: true,
      detail: auditRow(matches[0], index, stage, nowIso, true) };
  }
  const ellisItems = current.rows.filter((item) => clean(item.row.county).toUpperCase() === 'ELLIS' &&
    clean(item.row.state).toUpperCase() === 'TX');
  const rows = ellisItems.map((item) => auditRow(item, index, stage, nowIso, false));
  return { ok: true, preview_only: true, not_a_saved_lead: true, not_applied: true,
    county: 'Ellis', state: 'TX', row_count: rows.length,
    identity_counts: propertyIdentityGrouping.groupRows(ellisItems.map((item) => item.row), nowIso).counts,
    rows };
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
    source_reference_url: record.source_reference_url || null, source_date: record.source_date || null,
    applied_at: appliedAt || null, applied_by: appliedBy || null };
  const fieldNames = ['owner_of_record', 'mailing_address', 'parcel_id', 'geo_id', 'legal_description',
    'property_type', 'lot_size_acres', 'year_built', 'latitude', 'longitude', 'coordinate_source',
    'assessed_value', 'latest_deed_date', 'latest_deed_instrument'];
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

module.exports = { apply, audit, completeAddress, enrich, files, joinRow, prepareEvidence, preview, readEvidence, stageFile };
