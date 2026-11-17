'use strict';

// B-23: turn one source row from a public distress list into a lead candidate that keeps its
// provenance (source kind, url, row reference, document number, captured date, evidence) and
// lands in exactly one lane with a reason. Rows are never dropped (D-009).
// Pure: `today` and `captured_at` are injected; no network, no clock, no writes.

const { normalizeSourceDate } = require('../research/normalize-source-date');
const { resolveSourceSaleDate } = require('../research/resolve-source-sale-date');

const GENERIC_FIELDS = Object.freeze({
  address: ['address', 'property address', 'property_address', 'situs', 'situs address', 'site address', 'site_address', 'location', 'street address', 'full_address', 'propaddr'],
  city: ['city', 'situs city', 'property city'],
  zip: ['zip', 'zip code', 'zipcode', 'postal code', 'situs zip'],
  owner: ['owner', 'owner name', 'owner_name', 'grantor', 'defendant', 'taxpayer', 'decedent'],
  document_number: ['document number', 'document_number', 'doc number', 'instrument number', 'instrument', 'case number', 'case_number', 'case no', 'casenumber', 'file number', 'parcel id', 'parcel_id', 'pin', 'account number'],
  sale_date: ['sale date', 'sale_date', 'auction date', 'auction_date', 'date of sale', 'trustee sale date'],
  recorded_date: ['recorded date', 'recorded_date', 'filed date', 'filing date', 'file date', 'date filed', 'opened date', 'open date'],
  amount_due: ['amount due', 'amount_due', 'total due', 'taxes due', 'delinquent amount', 'judgment amount', 'minimum bid', 'opening bid'],
  status: ['status', 'case status', 'case_status']
});
const SALE_EVENT_KINDS = Object.freeze(['foreclosure_notice', 'trustee_sale', 'tax_sale']);
const LANES = Object.freeze({ working: 'working', after_sale: 'after_sale', needs_data: 'needs_data', blocked: 'blocked' });
const AMOUNT_LABEL = 'Amount listed by the source. Not a price, value or loan payoff.';

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function keyOf(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isoDay(value, name) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text.slice(0, 10)) || !normalizeSourceDate(text.slice(0, 10)).iso) {
    throw new TypeError(`${name} must be an injected YYYY-MM-DD date`);
  }
  return text.slice(0, 10);
}

// Picks a value for each generic field. An explicit profile field_map wins; otherwise a
// column whose name matches a known label is used. The column name travels as the origin.
function pickField(fields, generic, fieldMap) {
  const mapped = clean(fieldMap && fieldMap[generic]);
  if (mapped) {
    return Object.prototype.hasOwnProperty.call(fields, mapped) ? { value: fields[mapped], origin: mapped } : { value: '', origin: '' };
  }
  const wanted = GENERIC_FIELDS[generic].map(keyOf);
  for (const column of Object.keys(fields)) {
    if (wanted.includes(keyOf(column)) && clean(fields[column]) !== '') return { value: fields[column], origin: column };
  }
  return { value: '', origin: '' };
}

// Dates as written. A numeric day/month date only resolves through the shared resolver;
// anything it cannot prove stays quarantined with the raw text kept.
function readDate(picked, profile, sourceLine) {
  const raw = picked.value;
  if (raw === '' || raw == null) return { iso: '', status: 'MISSING', raw: '', origin: '' };
  if (typeof raw === 'number' && Number.isFinite(raw) && Math.abs(raw) > 1e11) {
    // ArcGIS date fields are epoch milliseconds: one reading only.
    return { iso: new Date(raw).toISOString().slice(0, 10), status: 'RESOLVED', raw: String(raw), origin: picked.origin, rule: 'epoch_milliseconds' };
  }
  const text = clean(raw);
  const isoLike = text.match(/^(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]+Z?)?$/);
  const direct = normalizeSourceDate(isoLike ? isoLike[1] : text);
  if (direct.iso) return { iso: direct.iso, status: 'RESOLVED', raw: text, origin: picked.origin, rule: direct.format || 'named_or_iso' };
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text)) {
    const resolution = resolveSourceSaleDate({
      raw_text: text, raw_field: picked.origin, source_adapter_id: profile.source_id,
      source_kind: profile.source_kind, source_url: profile.source_url, document_text: sourceLine || ''
    });
    if (resolution.status === 'RESOLVED') {
      return { iso: resolution.resolved_iso, status: 'RESOLVED', raw: text, origin: picked.origin, rule: resolution.rule_ids.join(',') };
    }
    return { iso: '', status: resolution.status, raw: text, origin: picked.origin, reason: resolution.reason };
  }
  return { iso: '', status: 'INVALID', raw: text, origin: picked.origin, reason: direct.reason || 'unrecognised_format' };
}

function laneFor(lead, today) {
  if (!lead.address_as_written) {
    return { lane: LANES.needs_data, reason: 'The source row has no street address yet. Kept with its row reference.' };
  }
  if (SALE_EVENT_KINDS.includes(lead.source_kind) && lead.sale_date_status === 'RESOLVED' && lead.sale_date < today) {
    return { lane: LANES.after_sale, reason: 'Sale date passed. Confirm ownership first.' };
  }
  if (lead.sale_date_status === 'AMBIGUOUS' || lead.sale_date_status === 'INVALID') {
    return { lane: LANES.working, reason: 'Sale date not confirmed. Ask on the call.' };
  }
  return { lane: LANES.working, reason: 'On a current public distress list.' };
}

function mapRowToLead(row, profile, options = {}) {
  if (!profile || !profile.source_id) throw new TypeError('profile is required');
  const today = isoDay(options.today, 'today');
  const capturedAt = clean(options.captured_at);
  isoDay(capturedAt, 'captured_at');
  const fields = Object.assign({}, row && row.fields);
  const fieldMap = options.field_map || null;
  const sourceLine = clean(fields.source_line);
  const picked = {};
  for (const generic of Object.keys(GENERIC_FIELDS)) picked[generic] = pickField(fields, generic, fieldMap);
  const sale = readDate(picked.sale_date, profile, sourceLine);
  const recorded = readDate(picked.recorded_date, profile, sourceLine);
  const rowReference = clean(row && row.row_reference);
  const documentNumber = clean(picked.document_number.value);
  // Owner names stay on the lead only; they never go into evidence text, logs or summaries.
  const evidence = ['address', 'city', 'zip', 'document_number', 'sale_date', 'recorded_date', 'amount_due', 'status']
    .filter((generic) => clean(picked[generic].value) !== '')
    .map((generic) => `${picked[generic].origin}: ${clean(picked[generic].value)}`)
    .join(' | ')
    .slice(0, 300);
  const lead = {
    lead_key: `${profile.source_id}|${documentNumber ? `doc:${documentNumber.toLowerCase()}` : `ref:${rowReference.toLowerCase()}`}`,
    source_id: profile.source_id,
    source_kind: profile.source_kind,
    source_url: clean(options.source_url) || profile.source_url,
    source_row_reference: rowReference,
    document_number: documentNumber,
    document_number_origin: picked.document_number.origin,
    county: profile.county,
    state: profile.state,
    address_as_written: clean(picked.address.value),
    address_origin: picked.address.origin,
    address_verified: false,
    city: clean(picked.city.value),
    zip: clean(picked.zip.value),
    owner_clue: clean(picked.owner.value),
    owner_clue_origin: picked.owner.origin,
    sale_date: sale.iso,
    sale_date_status: sale.status,
    sale_date_raw: sale.raw,
    sale_date_origin: sale.origin,
    recorded_date: recorded.iso,
    recorded_date_status: recorded.status,
    recorded_date_raw: recorded.raw,
    amount_listed: clean(picked.amount_due.value),
    amount_listed_label: clean(picked.amount_due.value) ? AMOUNT_LABEL : '',
    source_status: clean(picked.status.value),
    evidence_text: evidence,
    captured_at: capturedAt,
    first_captured_at: capturedAt,
    provenance: {
      source_kind: 'public_distress_list', source_url: clean(options.source_url) || profile.source_url,
      evidence_text: evidence, captured_at: capturedAt, row_reference: rowReference
    }
  };
  const lane = laneFor(lead, today);
  lead.lane = lane.lane;
  lead.lane_reason = lane.reason;
  return lead;
}

const AUDITED_FIELDS = Object.freeze([
  'source_url', 'source_row_reference', 'address_as_written', 'address_origin', 'city', 'zip', 'owner_clue',
  'sale_date', 'sale_date_status', 'sale_date_raw', 'recorded_date', 'amount_listed', 'source_status',
  'evidence_text', 'lane', 'lane_reason'
]);

// Duplicate rows (same source and document number, or same row reference) merge. The current
// row wins; every value that actually differed is kept as {field, old_value} for audit.
function mergeLeads(existing, incoming) {
  const byKey = new Map();
  for (const lead of Array.isArray(existing) ? existing : []) byKey.set(lead.lead_key, lead);
  const audit = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const lead of Array.isArray(incoming) ? incoming : []) {
    const prior = byKey.get(lead.lead_key);
    if (!prior) { byKey.set(lead.lead_key, lead); created += 1; continue; }
    const changes = AUDITED_FIELDS
      .filter((field) => clean(prior[field]) !== clean(lead[field]))
      .map((field) => ({ field, old_value: prior[field] }));
    const merged = Object.assign({}, lead, {
      first_captured_at: prior.first_captured_at || prior.captured_at || lead.captured_at,
      change_history: (Array.isArray(prior.change_history) ? prior.change_history : [])
        .concat(changes.length ? [{ captured_at: lead.captured_at, changes }] : [])
    });
    byKey.set(lead.lead_key, merged);
    if (changes.length) { updated += 1; audit.push({ lead_key: lead.lead_key, changes }); } else unchanged += 1;
  }
  return { leads: Array.from(byKey.values()), audit, created, updated, unchanged };
}

// Per-source counts for the read-only check. No owner names, addresses or phone numbers.
function summarizeSource(profile, outcome = {}) {
  const leads = Array.isArray(outcome.leads) ? outcome.leads : [];
  const lanes = {};
  for (const lead of leads) lanes[lead.lane] = (lanes[lead.lane] || 0) + 1;
  return {
    source_id: profile.source_id,
    source_kind: profile.source_kind,
    county: profile.county,
    state: profile.state,
    status: clean(outcome.status) || 'not_run',
    reason: clean(outcome.reason),
    rows_found: Number(outcome.rows_found) || 0,
    new_leads: Number(outcome.created) || 0,
    updated_leads: Number(outcome.updated) || 0,
    lanes
  };
}

module.exports = { GENERIC_FIELDS, LANES, AMOUNT_LABEL, mapRowToLead, mergeLeads, summarizeSource };
