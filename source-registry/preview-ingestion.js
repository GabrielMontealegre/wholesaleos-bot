'use strict';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function firstValue() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i];
    if (value !== undefined && value !== null && cleanText(value) !== '') return value;
  }
  return '';
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = cleanText(value).replace(/,/g, '');
  const match = text.match(/-?\d+(?:\.\d{1,2})?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(value) {
  return cleanText(value).toLowerCase();
}

function normalizeReference(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, '');
}

function candidateApproved(input) {
  const decision = normalizeKey(firstValue(
    input && input.decision,
    input && input.review_decision,
    input && input.preview_decision,
    input && input.status
  ));
  return decision === 'approved' || decision === 'approve' || input && input.approved === true;
}

function repairFlags(candidate) {
  return Array.isArray(candidate && candidate.repair_flags) ? candidate.repair_flags.filter(Boolean) : [];
}

function isFixturePreview(candidate) {
  candidate = candidate || {};
  const raw = cleanText(firstValue(
    candidate.raw_text,
    candidate.raw_payload && candidate.raw_payload.raw_text,
    candidate.evidence && candidate.evidence.raw_text,
    candidate.address,
    candidate.owner_name
  )).toLowerCase();
  return /sample only|fixture only|not a production lead/.test(raw);
}

function sourceTruth(candidate) {
  return candidate && candidate.source_truth && typeof candidate.source_truth === 'object'
    ? candidate.source_truth
    : {};
}

function evidence(candidate) {
  return candidate && candidate.evidence && typeof candidate.evidence === 'object'
    ? candidate.evidence
    : {};
}

function normalizePreviewCandidateToLead(candidate, options) {
  candidate = candidate || {};
  options = options || {};
  const truth = sourceTruth(candidate);
  const ev = evidence(candidate);
  const now = options.now || new Date().toISOString();
  const amount = asNumber(firstValue(candidate.amount_owed, candidate.tax_due, candidate.lien_amount, truth.amount));
  const parcel = cleanText(firstValue(candidate.parcel, candidate.apn, candidate.parcel_id, candidate.pin));
  const sourceReference = cleanText(firstValue(candidate.source_reference, truth.evidence_ref, ev.source_reference, candidate.preview_id, candidate.id));
  const sourceUrl = cleanText(firstValue(candidate.source_url, truth.source_url, ev.source_url));
  const recordUrl = cleanText(firstValue(candidate.source_record_url, truth.source_record_url, ev.source_record_url, sourceUrl));
  const verificationStatus = cleanText(firstValue(candidate.verification_status, truth.verification_status, 'needs_operator_verification'));
  const confidence = cleanText(firstValue(candidate.source_confidence, truth.confidence, truth.source_confidence_text, 'medium'));
  const flags = repairFlags(candidate);

  return {
    lead_type: 'raw',
    status: 'New Lead',
    source_preview_id: cleanText(firstValue(candidate.preview_id, candidate.id)),
    source_preview_ingested: true,
    source_preview_ingested_at: now,
    first_seen_at: cleanText(firstValue(candidate.first_seen_at, candidate.captured_at, ev.captured_at, now)),
    source_id: cleanText(firstValue(candidate.source_id, candidate.registry_source_id, truth.source_id)),
    registry_source_id: cleanText(firstValue(candidate.registry_source_id, candidate.source_id, truth.source_id)),
    source: cleanText(firstValue(candidate.source, candidate.source_name, truth.source_name)),
    source_name: cleanText(firstValue(candidate.source_name, truth.source_name)),
    source_type: cleanText(firstValue(candidate.source_type, truth.source_type, candidate.source_category, truth.source_category)),
    source_category: cleanText(firstValue(candidate.source_category, truth.source_category)),
    state: cleanText(firstValue(candidate.state, truth.state)),
    county: cleanText(firstValue(candidate.county, truth.county)),
    jurisdiction: cleanText(firstValue(candidate.jurisdiction, truth.jurisdiction, candidate.source_metadata && candidate.source_metadata.jurisdiction)),
    address: cleanText(candidate.address),
    city: cleanText(candidate.city),
    zip: cleanText(candidate.zip || candidate.postal_code),
    owner_name: cleanText(firstValue(candidate.owner_name, candidate.owner)) || null,
    parcel: parcel || null,
    apn: parcel || null,
    parcel_id: parcel || null,
    amount_owed: amount,
    tax_due: asNumber(firstValue(candidate.tax_due, amount)),
    lien_amount: asNumber(firstValue(candidate.lien_amount)),
    judgment_amount: asNumber(candidate.judgment_amount),
    minimum_bid_amount: asNumber(candidate.minimum_bid_amount),
    strike_off_amount: asNumber(candidate.strike_off_amount),
    dcad_value: asNumber(candidate.dcad_value),
    case_number: cleanText(candidate.case_number) || null,
    sale_date: cleanText(candidate.sale_date) || null,
    auction_date: cleanText(firstValue(candidate.auction_date, candidate.sale_date)) || null,
    source_url: sourceUrl,
    source_record_url: recordUrl,
    source_reference: sourceReference,
    source_row_id: sourceReference,
    evidence_ref: sourceReference,
    verification_status: verificationStatus,
    source_verification_status: verificationStatus,
    source_confidence: confidence,
    source_confidence_reason: candidate.source_confidence_reason || truth.source_confidence_reason || [],
    repair_flags: flags,
    parser_adapter: cleanText(firstValue(candidate.parser_adapter, truth.parser_adapter, candidate.source_metadata && candidate.source_metadata.parser_adapter)),
    acquisition_method: cleanText(firstValue(candidate.acquisition_method, truth.acquisition_method, candidate.source_metadata && candidate.source_metadata.acquisition_method)),
    motivation: cleanText(firstValue(candidate.motivation, 'tax_delinquent')),
    distress_types: Array.isArray(candidate.distress_types) ? candidate.distress_types : ['tax_delinquent', 'auction'],
    source_truth: truth,
    lead_source_truth: truth,
    lead_intelligence: candidate.lead_intelligence || null,
    lead_intelligence_brief: candidate.lead_intelligence_brief || null,
    evidence: Object.assign({}, ev, {
      source_url: sourceUrl || ev.source_url || null,
      source_record_url: recordUrl || ev.source_record_url || null,
      source_reference: sourceReference || ev.source_reference || null,
      ingested_from_preview: true
    }),
    source_details: Object.assign({}, candidate.source_details || {}, {
      source_id: cleanText(firstValue(candidate.source_id, truth.source_id)),
      source_name: cleanText(firstValue(candidate.source_name, truth.source_name)),
      source_type: cleanText(firstValue(candidate.source_type, candidate.source_category, truth.source_category)),
      source_category: cleanText(firstValue(candidate.source_category, truth.source_category)),
      county: cleanText(firstValue(candidate.county, truth.county)),
      state: cleanText(firstValue(candidate.state, truth.state)),
      jurisdiction: cleanText(firstValue(candidate.jurisdiction, truth.jurisdiction)),
      parser_adapter: cleanText(firstValue(candidate.parser_adapter, truth.parser_adapter)),
      acquisition_method: cleanText(firstValue(candidate.acquisition_method, truth.acquisition_method)),
      source_reference: sourceReference,
      source_url: sourceUrl,
      source_record_url: recordUrl
    }),
    raw_payload: candidate.raw_payload || null
  };
}

function findPreviewDuplicate(lead, leads, normalizeAddress) {
  const normAddress = normalizeAddress(lead.address || '');
  const county = normalizeKey(lead.county);
  const state = normalizeKey(lead.state);
  const parcel = normalizeReference(firstValue(lead.parcel, lead.apn, lead.parcel_id));
  const caseNumber = normalizeReference(lead.case_number);
  const sourceRef = normalizeReference(lead.source_reference || lead.evidence_ref || lead.source_row_id);
  const recordUrl = normalizeKey(lead.source_record_url);

  for (const existing of leads || []) {
    if (!existing || existing.archived) continue;
    const existingParcel = normalizeReference(firstValue(existing.parcel, existing.apn, existing.parcel_id, existing.pin));
    if (parcel && existingParcel && parcel === existingParcel) {
      return { reason: 'parcel_apn', lead: existing };
    }

    const existingCase = normalizeReference(existing.case_number);
    if (caseNumber && existingCase && caseNumber === existingCase && state && normalizeKey(existing.state) === state) {
      return { reason: 'case_number', lead: existing };
    }

    const existingRecordUrl = normalizeKey(existing.source_record_url);
    if (recordUrl && existingRecordUrl && recordUrl === existingRecordUrl) {
      return { reason: 'source_record_url', lead: existing };
    }

    const existingSourceRef = normalizeReference(existing.source_reference || existing.evidence_ref || existing.source_row_id);
    if (sourceRef && existingSourceRef && sourceRef === existingSourceRef && normalizeKey(existing.registry_source_id || existing.source_id) === normalizeKey(lead.registry_source_id || lead.source_id)) {
      return { reason: 'source_reference', lead: existing };
    }

    const existingNorm = normalizeAddress(existing.address || '');
    if (normAddress && existingNorm && normAddress === existingNorm && county && state &&
      normalizeKey(existing.county).indexOf(county) > -1 && normalizeKey(existing.state) === state) {
      return { reason: 'normalized_address_county_state', lead: existing };
    }
  }
  return null;
}

function ingestApprovedPreviewCandidate(input, dbApi) {
  input = input || {};
  const candidate = input.candidate || input.preview_candidate || {};
  const dryRun = input.dry_run !== false;
  const overrideRepair = input.override_repair === true;
  const confirmCreate = input.confirm_create === true || input.confirm === true;
  const now = new Date().toISOString();

  if (!candidateApproved(input)) {
    return { ok: false, status: 'rejected', error: 'candidate_not_approved', message: 'Only explicitly approved preview candidates can be ingested.', dry_run: dryRun, should_ingest: false };
  }

  const lead = normalizePreviewCandidateToLead(candidate, { now });
  const flags = repairFlags(candidate);
  if (flags.length && !overrideRepair) {
    return { ok: false, status: 'repair_required', error: 'repair_flags_require_override', repair_flags: flags, lead_preview: lead, dry_run: dryRun, should_ingest: false };
  }

  if (!dryRun && isFixturePreview(candidate)) {
    return { ok: false, status: 'blocked', error: 'fixture_preview_not_ingestable', lead_preview: lead, dry_run: false, should_ingest: false };
  }

  if (!lead.address) {
    return { ok: false, status: 'blocked', error: 'missing_address', repair_flags: Array.from(new Set(flags.concat(['missing_address']))), lead_preview: lead, dry_run: dryRun, should_ingest: false };
  }

  const duplicate = findPreviewDuplicate(lead, dbApi.getLeads(), dbApi.normalizeAddress);
  if (duplicate) {
    return {
      ok: true,
      status: 'duplicate',
      duplicate: true,
      duplicate_reason: duplicate.reason,
      existing_lead: {
        id: duplicate.lead.id,
        reference_id: duplicate.lead.reference_id || duplicate.lead.lead_reference_id || null,
        address: duplicate.lead.address || null
      },
      lead_preview: lead,
      dry_run: dryRun,
      should_ingest: false
    };
  }

  if (dryRun) {
    return { ok: true, status: 'dry_run_ready', duplicate: false, lead_preview: lead, dry_run: true, should_ingest: false };
  }

  if (!confirmCreate) {
    return { ok: false, status: 'confirmation_required', error: 'explicit_confirmation_required', lead_preview: lead, dry_run: false, should_ingest: false };
  }

  const created = dbApi.addLead(lead);
  if (created && created.skipped) {
    return { ok: false, status: 'blocked', error: created.reason || 'lead_skipped', lead_preview: lead, dry_run: false, should_ingest: false };
  }
  if (created && created.merged) {
    return { ok: true, status: 'duplicate', duplicate: true, duplicate_reason: 'db_addLead_merge_guard', existing_lead: { id: created.id }, dry_run: false, should_ingest: false };
  }

  return {
    ok: true,
    status: 'created',
    created: true,
    lead: {
      id: created.id,
      lead_id: created.id,
      reference_id: created.reference_id || created.lead_reference_id || null,
      address: created.address || null,
      source_name: created.source_name || created.source || null,
      source_category: created.source_category || null,
      repair_flags: created.repair_flags || []
    },
    dry_run: false,
    should_ingest: true
  };
}

module.exports = {
  normalizePreviewCandidateToLead,
  findPreviewDuplicate,
  ingestApprovedPreviewCandidate
};
