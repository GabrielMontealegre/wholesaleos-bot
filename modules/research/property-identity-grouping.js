'use strict';

const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');
const propertyAddressEvidence = require('./property-address-evidence');
const leadLifecycleStatus = require('./lead-lifecycle-status');

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function completeCanonical(value) {
  const parts = canonicalizeAddress(clean(value));
  return ['number', 'street', 'suffix', 'city', 'state', 'zip'].every((field) => parts[field])
    ? parts.canonical_string : '';
}

function sourcedAddressKey(row) {
  const canonical = completeCanonical(row && row.normalized_address);
  if (!canonical || !propertyAddressEvidence.isSourceSupportedSubjectAddress(row)) return '';
  if (!clean(row.source_document_url || row.source_url || row.source_proof_text) &&
      !(Array.isArray(row.source_document_urls) && row.source_document_urls.some(clean))) return '';
  return canonical;
}

function appliedParcelKey(row) {
  const record = row && row.county_appraisal_record;
  const parcel = clean(record && record.parcel_id);
  if (!record || !parcel || !clean(record.applied_at) ||
      clean(record.source_kind) !== 'official_public_record' ||
      clean(record.county).toUpperCase() !== clean(row.county).toUpperCase() ||
      clean(record.state).toUpperCase() !== clean(row.state).toUpperCase()) return '';
  const state = clean(row.state).toUpperCase();
  const county = clean(row.county).toUpperCase();
  return state && county ? `parcel|${state}|${county}|${parcel.toUpperCase()}` : '';
}

const CLEAR_ACTIONS = Object.freeze({
  NO_ADDRESS_OR_SOURCE_DOCUMENT: 'Restore a sourced property address or an official source document or URL.',
  RICHER_CENSUS_MATCH_EXISTS: 'Resolve the richer census-match duplicate using source evidence.',
  ABSENT_FROM_LATEST_MONTHLY_LIST: 'Verify that the row is present in a newer official source list.',
  SALE_DATE_BEFORE_TODAY: 'Find a newer dated official repost with its evidence text and source URL.',
  NO_SOURCE_DATE_EVIDENCE: 'Find a usable dated source event or publication record.'
});

function quarantineExplanation(row, nowIso) {
  const lifecycle = leadLifecycleStatus.computeLifecycleStatus(row, nowIso);
  if (!lifecycle.quarantined) return {};
  const recordedReason = clean(row && (row.quarantine_reason_code ||
    row.lifecycle_status && row.lifecycle_status.reason_code));
  const recordedAt = recordedReason === lifecycle.reason_code
    ? clean(row && (row.quarantined_at || row.lifecycle_status && row.lifecycle_status.quarantined_at)) : '';
  return {
    quarantine_reason_code: lifecycle.reason_code,
    quarantine_reason_text: lifecycle.reason_text,
    quarantined_at: recordedAt || null,
    quarantined_by_rule: `lead-lifecycle-status:${lifecycle.reason_code}`,
    what_would_clear_it: CLEAR_ACTIONS[lifecycle.reason_code] || 'Review the source and resolve the stated lifecycle rule with verified evidence.'
  };
}

function addressStateDisplay(row) {
  const stored = clean(row && row.address_state);
  if (stored) return { address_state_display: stored, address_state_reason_code: 'stored_state' };
  const history = clean(row && row.address_state_history);
  return {
    address_state_display: 'not recorded',
    address_state_reason_code: history === 'cleared_by_refresh' ? 'cleared_by_refresh'
      : history === 'never_set' ? 'never_set' : 'prior_state_history_unknown'
  };
}

function rowDiagnostics(row, nowIso) {
  const sourcedAddress = sourcedAddressKey(row);
  const parcelKey = appliedParcelKey(row);
  const key = parcelKey || (sourcedAddress ? `address|${sourcedAddress}` : null);
  const queueKey = clean(row && row.queue_key);
  const prefix = /^(addr|census)\|/i.exec(queueKey);
  const embeddedAddress = prefix ? queueKey.slice(prefix[0].length) : '';
  const embeddedCanonical = embeddedAddress ? completeCanonical(embeddedAddress) : '';
  const mismatch = Boolean(sourcedAddress && embeddedCanonical && sourcedAddress !== embeddedCanonical);
  const venueText = [row && row.sale_venue_evidence_text, row && row.source_proof_text,
    row && row.source_text, row && row.source_excerpt].map(clean).filter(Boolean).join(' | ');
  const detectedVenue = mismatch && venueText &&
    propertyAddressEvidence.roleForAddressInText(embeddedAddress, venueText) === 'sale_venue';
  return Object.assign({
    property_identity_key: key,
    identity_unresolved: !key,
    queue_key_address_mismatch: mismatch,
    queue_key_embedded_address: mismatch ? embeddedAddress : null,
    queue_key_mismatch_reason: mismatch ? 'The address inside the internal queue key differs from the sourced property address.' : null,
    queue_key_contaminated_by: detectedVenue ? 'sale_venue' : null
  }, addressStateDisplay(row), quarantineExplanation(row, nowIso));
}

function sourceEvidenceCount(row) {
  const fields = ['source_document_url', 'source_url', 'source_proof_text', 'source_excerpt',
    'status_evidence_text', 'motivation_evidence_text', 'source_row_reference'];
  const urls = new Set((Array.isArray(row.source_document_urls) ? row.source_document_urls : []).map(clean).filter(Boolean));
  return fields.filter((field) => clean(row[field])).length + urls.size;
}

function firstSeen(row) {
  return clean(row && row.first_seen_at) || '9999-12-31';
}

function eventDate(row) {
  const value = clean(row && (row.sale_date_iso || row.sale_date_or_event_date || row.source_event_date));
  const date = value.match(/^\d{4}-\d{2}-\d{2}(?=T|$)/);
  return date ? date[0] : '';
}

function primaryReason(primary, members) {
  if (members.length === 1) return 'Only source row for this property.';
  if (sourcedAddressKey(primary) && members.some((member) => !sourcedAddressKey(member))) {
    return 'Selected the row with a complete sourced property address.';
  }
  if (members.some((member) => sourceEvidenceCount(member) < sourceEvidenceCount(primary))) {
    return 'Selected the row with the most source evidence.';
  }
  return 'Selected the earliest source row; ties use the internal key for a stable order.';
}

function groupRows(inputRows, nowIso) {
  const rows = (Array.isArray(inputRows) ? inputRows : []).map((row) =>
    Object.assign({}, row, rowDiagnostics(row, nowIso)));
  const byIdentity = new Map();
  for (const [index, row] of rows.entries()) {
    const identity = row.property_identity_key || `unresolved|${index}|${clean(row.queue_key)}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, []);
    byIdentity.get(identity).push(row);
  }
  const groups = Array.from(byIdentity.entries()).map(([groupId, members]) => {
    const ranked = members.slice().sort((a, b) =>
      Number(Boolean(sourcedAddressKey(b))) - Number(Boolean(sourcedAddressKey(a))) ||
      sourceEvidenceCount(b) - sourceEvidenceCount(a) ||
      firstSeen(a).localeCompare(firstSeen(b)) ||
      clean(a.queue_key).localeCompare(clean(b.queue_key)));
    const primary = ranked[0];
    const dates = members.map(eventDate).filter(Boolean).sort();
    const seen = members.map((row) => clean(row.first_seen_at)).filter(Boolean).sort();
    return {
      group_id: groupId,
      property_identity_key: primary.property_identity_key,
      member_queue_keys: members.map((row) => clean(row.queue_key)),
      member_count: members.length,
      primary_member: clean(primary.queue_key),
      primary_selection_reason: primaryReason(primary, members),
      source_families: Array.from(new Set(members.map((row) => clean(row.source_family)).filter(Boolean))).sort(),
      earliest_first_seen: seen[0] || null,
      soonest_sale_or_event_date: dates[0] || null
    };
  });
  return {
    rows,
    groups,
    counts: {
      rows_total: rows.length,
      properties_total: groups.length,
      identity_unresolved: rows.filter((row) => row.identity_unresolved).length,
      duplicate_collapse_count: rows.length - groups.length,
      duplicate_collapse_ratio: rows.length ? (rows.length - groups.length) / rows.length : 0,
      queue_key_address_mismatch: rows.filter((row) => row.queue_key_address_mismatch).length,
      sale_venue_contaminated: rows.filter((row) => row.queue_key_contaminated_by === 'sale_venue').length
    }
  };
}

module.exports = { addressStateDisplay, appliedParcelKey, groupRows, quarantineExplanation, rowDiagnostics, sourcedAddressKey };
