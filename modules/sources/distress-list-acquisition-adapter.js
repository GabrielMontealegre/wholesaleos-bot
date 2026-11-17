'use strict';

// B-23b: one generic adapter for every public distress list profile (D-066). The profile says
// where and what; the platform convention (ArcGIS layer, Socrata resource, CKAN datastore,
// plain CSV/XLSX file) says how to ask for rows. Sources that need per-source reader settings
// (HTML search pages, PDF row patterns, unknown JSON) report "needs reader settings" instead
// of guessing. Output is preview-only, like every other acquisition adapter: nothing is saved
// here. Rows without a street address are kept and counted as source-proof rows, never dropped.

const distressProfiles = require('./distress-list-profiles');
const readers = require('./distress-list-readers');
const mapper = require('./distress-list-lead-mapper');
const { createPoliteFetcher } = require('./polite-public-fetcher');
const propertyCandidate = require('../research/property-candidate');

const MAX_ROWS = 1000; // Remote request page size, not a limit on rows already read.
const AUTO_READERS = Object.freeze(['arcgis_json', 'socrata_json', 'json_rows', 'csv', 'xlsx']);

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

// Returns { url, reader_options } or { reason } when the platform convention does not apply.
function requestPlanForProfile(profile) {
  if (!profile || !profile.source_url) return { reason: 'No source address.' };
  let url;
  try { url = new URL(profile.source_url); } catch (_) { return { reason: 'Source address is not valid.' }; }
  const path = url.pathname.replace(/\/+$/, '');
  if (profile.reader === 'arcgis_json') {
    if (!/\/(?:Feature|Map)Server\/\d+$/i.test(path)) return { reason: 'Map service has no single layer chosen yet.' };
    const query = new URL(`${url.origin}${path}/query`);
    query.search = new URLSearchParams({
      where: '1=1', outFields: '*', returnGeometry: 'false', f: 'json',
      resultOffset: '0', resultRecordCount: String(MAX_ROWS)
    }).toString();
    return { url: query.href, reader_options: {} };
  }
  if (profile.reader === 'socrata_json') {
    if (!/\/resource\/[a-z0-9]{4}-[a-z0-9]{4}\.json$/i.test(path)) return { reason: 'Open data resource address not confirmed.' };
    return { url: `${url.origin}${path}?$limit=${MAX_ROWS}`, reader_options: {} };
  }
  if (profile.reader === 'json_rows') {
    if (!/\/api\/3\/action\/datastore_search$/i.test(path) || !url.searchParams.get('resource_id')) {
      return { reason: 'JSON source needs reader settings.' };
    }
    const query = new URL(`${url.origin}${path}`);
    query.search = new URLSearchParams({ resource_id: url.searchParams.get('resource_id'), limit: String(MAX_ROWS) }).toString();
    return { url: query.href, reader_options: { rows_path: 'result.records', id_field: '_id' } };
  }
  if (profile.reader === 'csv' || profile.reader === 'xlsx') return { url: url.href, reader_options: {} };
  return { reason: 'This format needs per-source reader settings (page layout or row pattern).' };
}

function addressLine(lead) {
  if (!lead.address_as_written) return '';
  const tail = [lead.state, lead.zip].filter(Boolean).join(' ');
  return [lead.address_as_written, lead.city, tail].filter(Boolean).join(', ');
}

function candidateFromLead(lead, profile, context) {
  const address = addressLine(lead);
  const evidence = [`${profile.source_name}`, lead.evidence_text].filter(Boolean).join(' | ');
  const candidate = propertyCandidate.normalizePropertyCandidate({
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: lead.source_kind,
    source_type: 'public_distress_list',
    source_classification: 'official_source_record',
    official_source: true,
    source_url: lead.source_url,
    source_document_url: lead.source_url,
    source_row_reference: lead.source_row_reference,
    normalized_address: address,
    property_address: address,
    raw_address_text: lead.address_as_written,
    source_structured_address_verified: false,
    city: lead.city,
    county: profile.county,
    state: profile.state,
    zip: lead.zip,
    motivation_type: lead.source_kind,
    motivation_phrase: profile.source_name,
    motivation_evidence_text: evidence,
    source_proof_text: evidence,
    status_evidence_text: lead.source_status ? `Source status: ${lead.source_status}` : '',
    event_date: lead.sale_date,
    risk_flags: [lead.amount_listed ? 'LISTED_AMOUNT_NOT_PRICE_ARV_OR_PAYOFF' : '',
      lead.sale_date_status === 'AMBIGUOUS' || lead.sale_date_status === 'INVALID' ? 'SALE_DATE_NOT_CONFIRMED' : ''].filter(Boolean),
    retrieved_at: context.captured_at,
    preview_only: true,
    should_ingest: false
  }, { acquisition_run_id: context.acquisition_run_id, state: profile.state });
  // Keep the B-23 provenance and lane alongside the shared candidate fields.
  return Object.assign(candidate, {
    distress_lead_key: lead.lead_key,
    distress_source_kind: lead.source_kind,
    document_number: lead.document_number,
    sale_date_status: lead.sale_date_status,
    sale_date_raw: lead.sale_date_raw,
    sale_date_origin: lead.sale_date_origin,
    recorded_date: lead.recorded_date,
    recorded_date_status: lead.recorded_date_status,
    recorded_date_raw: lead.recorded_date_raw,
    recorded_date_origin: lead.recorded_date_origin,
    address_origin: lead.address_origin,
    amount_listed: lead.amount_listed,
    amount_listed_label: lead.amount_listed_label,
    lane: lead.lane,
    lane_reason: lead.lane_reason,
    not_a_saved_lead: true
  });
}

function emptyResult(profile, status, reason, extra = {}) {
  return Object.assign({
    source_id: profile ? profile.source_id : '',
    source_name: profile ? profile.source_name : '',
    source_family: profile ? profile.source_kind : '',
    source_url: profile ? profile.source_url : '',
    county: profile ? profile.county : '',
    state: profile ? profile.state : '',
    status,
    attempted: false,
    blocked_reason: reason,
    message: reason,
    candidates: [], cards: [], source_proof_rows: [], distress_audit: [], candidate_count: 0,
    diagnostics: { rows_found: 0 },
    preview_only: true, should_ingest: false, no_global_mutation: true
  }, extra);
}

async function runDistressListAcquisitionAdapter(options = {}) {
  const profile = distressProfiles.profileForSourceId(options.source_id);
  if (!profile) return emptyResult(null, 'not_configured', 'Unknown distress list source.');
  if (!profile.runnable) return emptyResult(profile, 'manual_only', profile.manual_reason);
  const plan = requestPlanForProfile(profile);
  if (!plan.url) return emptyResult(profile, 'needs_reader_settings', plan.reason);

  const nowMs = typeof options.now_ms === 'function' ? options.now_ms : () => Date.now();
  const capturedAt = clean(options.captured_at) || new Date(nowMs()).toISOString();
  const today = clean(options.today) || capturedAt.slice(0, 10);
  const fetcher = options.fetcher || createPoliteFetcher({
    fetch_impl: options.fetch_impl || global.fetch,
    sleep: options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    now: nowMs
  });
  let response;
  try {
    response = await fetcher.fetchForProfile(profile, plan.url, { accept: profile.reader === 'xlsx' || profile.reader === 'csv' ? '*/*' : 'application/json' });
  } catch (error) {
    return emptyResult(profile, 'needs_manual_review', 'The source could not be reached.', { attempted: true });
  }
  if (response.status !== 'ok') {
    return emptyResult(profile, response.status === 'blocked' ? 'blocked' : 'needs_manual_review', response.reason,
      { attempted: response.status !== 'manual', http_status: response.http_status || 0 });
  }
  let read;
  try {
    const body = profile.reader === 'xlsx' ? response.buffer : response.text();
    read = readers.readWithProfile(profile, body, plan.reader_options);
  } catch (error) {
    return emptyResult(profile, 'needs_manual_review', 'The source answered with data the reader could not read.', { attempted: true });
  }
  const context = { captured_at: capturedAt, acquisition_run_id: clean(options.acquisition_run_id) };
  const leads = read.rows.map((row) => mapper.mapRowToLead(row, profile, {
    today, captured_at: capturedAt, source_url: plan.url, field_map: options.field_map
  }));
  const merged = mapper.mergeLeads([], leads);
  const withAddress = merged.leads.filter((lead) => lead.address_as_written);
  const proofOnly = merged.leads.filter((lead) => !lead.address_as_written);
  const candidates = withAddress.map((lead) => candidateFromLead(lead, profile, context));
  const cards = candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, {
    acquisition_run_id: context.acquisition_run_id, state: profile.state
  }));
  const summary = mapper.summarizeSource(profile, {
    status: 'ok', rows_found: read.rows.length, created: merged.created, leads: merged.leads
  });
  return {
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: profile.source_kind,
    source_url: profile.source_url,
    county: profile.county,
    state: profile.state,
    status: candidates.length ? 'available' : 'needs_manual_review',
    attempted: true,
    message: `${read.rows.length} rows read; ${candidates.length} with a street address; ${proofOnly.length} kept as source proof only.`,
    blocked_reason: candidates.length ? '' : (read.rows.length ? 'no_street_address_in_rows' : 'no_rows'),
    candidates,
    cards,
    source_proof_rows: proofOnly.map((lead) => ({
      lead_key: lead.lead_key, source_row_reference: lead.source_row_reference, document_number: lead.document_number,
      lane: lead.lane, lane_reason: lead.lane_reason, evidence_text: lead.evidence_text, source_url: lead.source_url,
      source_kind: lead.source_kind, captured_at: lead.captured_at,
      sale_date: lead.sale_date, sale_date_status: lead.sale_date_status,
      sale_date_raw: lead.sale_date_raw, sale_date_origin: lead.sale_date_origin,
      recorded_date: lead.recorded_date, recorded_date_status: lead.recorded_date_status,
      recorded_date_raw: lead.recorded_date_raw, recorded_date_origin: lead.recorded_date_origin
    })),
    candidate_count: candidates.length,
    distress_audit: merged.audit,
    distress_summary: summary,
    diagnostics: {
      rows_found: read.rows.length,
      rows_capped: 0,
      skipped_empty_rows: read.skipped_empty,
      reader: read.reader,
      reader_warnings: read.warnings,
      duplicate_rows_merged: leads.length - merged.leads.length
    },
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    captured_at: capturedAt
  };
}

// Profiles this adapter can run without per-source settings. Registration does not add a
// source to any automatic run: a source runs only when the source catalog lists it.
function autoRunnableProfiles() {
  return distressProfiles.PROFILES.filter((profile) => profile.runnable &&
    AUTO_READERS.includes(profile.reader) && Boolean(requestPlanForProfile(profile).url));
}

module.exports = {
  MAX_ROWS, AUTO_READERS, requestPlanForProfile, candidateFromLead, autoRunnableProfiles,
  runDistressListAcquisitionAdapter
};
