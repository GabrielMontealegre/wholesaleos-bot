'use strict';

const crypto = require('crypto');

const DEFAULT_MAX_ROWS = 25;
const MAX_ROWS_PER_RUN = 100;
const OFFICIAL_HOST = 'www.dallasopendata.com';
const DATASET_URL = 'https://www.dallasopendata.com/dataset/Code-Violations/x9pz-kdq9';
const RESOURCE_URL = 'https://www.dallasopendata.com/resource/x9pz-kdq9.json';
const ALLOWED_SOURCE_IDS = new Set([
  'tx_dallas_code_violations_socrata',
  'tx_dallas_code_violations'
]);

const JUNK_TEXT_RE = /\b(contact|phone directory|public information request|open records|privacy policy|terms of use|login|sign in|footer|header|site map|dataset|api endpoint)\b/i;
const STREET_RE = /\b\d{1,6}\s+[A-Za-z0-9.'# -]{2,}\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pkwy|parkway|pl|place|trl|trail|way|loop|ter|terrace|hwy|highway|expy|expressway)\b/i;
const ACTIVE_STATUS_RE = /\b(open|active|pending|new|in progress|investigation|unresolved|created|issued|notice)\b/i;
const CLOSED_STATUS_RE = /\b(closed|complete|completed|resolved|cancelled|canceled|void|inactive)\b/i;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function firstValue() {
  for (const value of arguments) {
    if (value === 0) return value;
    const text = cleanText(value);
    if (text) return value;
  }
  return '';
}

function boundedInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(n), max));
}

function safeId(value) {
  return crypto.createHash('sha1').update(cleanText(value) || crypto.randomUUID()).digest('hex').slice(0, 16);
}

function isOfficialDallasOpenDataUrl(value) {
  try {
    const url = new URL(cleanText(value));
    return url.protocol === 'https:' && url.hostname.toLowerCase() === OFFICIAL_HOST;
  } catch (error) {
    return false;
  }
}

function socrataApiUrl(sourceUrl) {
  const value = cleanText(sourceUrl || DATASET_URL);
  if (!isOfficialDallasOpenDataUrl(value)) return '';
  if (/\/resource\/[^/?#]+\.json/i.test(value)) return value;
  const match = value.match(/\/(?:dataset|d)\/[^/]+\/([a-z0-9-]+)/i) || value.match(/\/([a-z0-9]{4}-[a-z0-9]{4})(?:[/?#]|$)/i);
  if (!match) return RESOURCE_URL;
  return `https://${OFFICIAL_HOST}/resource/${match[1]}.json`;
}

function rowField(row, names) {
  if (!row || typeof row !== 'object') return '';
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      const value = row[name];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.human_address) {
          try {
            const human = typeof value.human_address === 'string' ? JSON.parse(value.human_address) : value.human_address;
            const text = cleanText([human.address, human.city, human.state, human.zip].filter(Boolean).join(', '));
            if (text) return text;
          } catch (error) {
            if (cleanText(value.human_address)) return value.human_address;
          }
        }
        const text = cleanText(value.address || value.street_address || value.description);
        if (text) return text;
      }
      if (cleanText(value)) return value;
    }
  }
  const lowerMap = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = lowerMap.get(String(name).toLowerCase());
    if (key && cleanText(row[key])) return row[key];
  }
  return '';
}

function locationParts(row) {
  const location = row && typeof row.location === 'object' ? row.location : null;
  if (!location || !location.human_address) return {};
  try {
    const human = typeof location.human_address === 'string' ? JSON.parse(location.human_address) : location.human_address;
    return {
      address: cleanText(human.address),
      city: cleanText(human.city),
      state: cleanText(human.state),
      zip: cleanText(human.zip)
    };
  } catch (error) {
    return {};
  }
}

function normalizeDate(value) {
  const text = cleanText(value);
  if (!text) return '';
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

function buildProofText(fields) {
  return [
    fields.caseNumber ? `Case ${fields.caseNumber}` : '',
    fields.recordId ? `Record ${fields.recordId}` : '',
    fields.violationType || '',
    fields.violationStatus ? `Status ${fields.violationStatus}` : '',
    fields.openedDate ? `Opened ${fields.openedDate}` : '',
    fields.closedDate ? `Closed ${fields.closedDate}` : '',
    fields.propertyAddress || ''
  ].filter(Boolean).join(' | ');
}

function classifyAddressQuality(address, city, zip) {
  const text = cleanText(address);
  if (!text) return 'missing';
  if (JUNK_TEXT_RE.test(text)) return 'junk';
  if (!STREET_RE.test(text)) return 'partial';
  if (!/dallas/i.test(`${city} ${text}`) && !/\b75[23]\d{2}\b/.test(`${zip} ${text}`)) return 'partial';
  return 'valid';
}

function classifyWorkflow(addressQuality, violationStatus, openedDate, closedDate) {
  if (addressQuality === 'junk') return 'Invalid/Junk';
  if (addressQuality === 'missing' || addressQuality === 'partial') return 'Source Repair Needed';
  const statusText = cleanText(violationStatus);
  if (CLOSED_STATUS_RE.test(statusText)) return 'Source Repair Needed';
  if (closedDate) return 'Source Repair Needed';
  if (ACTIVE_STATUS_RE.test(statusText) || openedDate) return 'Research Ready';
  return 'Source Repair Needed';
}

function nextActionFor(workflowStatus, addressQuality, violationStatus) {
  if (workflowStatus === 'Research Ready') return 'Review the code violation source proof, then send the address to AI Deal Analyzer.';
  if (workflowStatus === 'Invalid/Junk') return 'Block from lead creation. This row does not show a usable property address.';
  if (addressQuality === 'missing') return 'Find the property address in the official Dallas OpenData row before comps.';
  if (addressQuality === 'partial') return 'Repair the Dallas property address before comp research.';
  if (CLOSED_STATUS_RE.test(cleanText(violationStatus))) return 'Closed or old code case. Keep as source-repair evidence, not a ready lead.';
  return 'Confirm the source row and property identity before comp research.';
}

function missingEvidenceFor(fields, addressQuality) {
  const missing = [];
  if (!fields.propertyAddress) missing.push('property address');
  if (addressQuality !== 'valid') missing.push('verified Dallas property address');
  if (!fields.recordId && !fields.caseNumber) missing.push('case or record id');
  if (!fields.violationType) missing.push('violation type');
  if (!fields.violationStatus) missing.push('violation status');
  if (!fields.sourceProofUrl) missing.push('source proof URL');
  return Array.from(new Set(missing));
}

function sourceProofUrlFor(apiUrl, row, recordId) {
  const rowUrl = cleanText(row && row.url);
  if (isOfficialDallasOpenDataUrl(rowUrl)) return rowUrl;
  const sourceUrl = apiUrl && apiUrl.includes('/resource/') ? apiUrl.replace(/\/resource\/([^/?#]+)\.json.*/i, '/dataset/Code-Violations/$1') : DATASET_URL;
  return isOfficialDallasOpenDataUrl(sourceUrl) ? sourceUrl : DATASET_URL;
}

function normalizeCodeViolationRow(row, source, options = {}) {
  const capturedAt = cleanText(options.captured_at || options.capturedAt) || nowIso();
  const apiUrl = cleanText(options.api_url || options.apiUrl || source && source.source_url) || DATASET_URL;
  const location = locationParts(row || {});
  const propertyAddress = cleanText(firstValue(
    rowField(row, ['address', 'property_address', 'street_address', 'site_address', 'full_address', 'case_address', 'violation_address', 'location_address']),
    location.address
  ));
  const city = cleanText(firstValue(rowField(row, ['city', 'municipality']), location.city, propertyAddress && /dallas/i.test(propertyAddress) ? 'Dallas' : ''));
  const zip = cleanText(firstValue(rowField(row, ['zip', 'zipcode', 'zip_code', 'postal_code']), location.zip));
  const caseNumber = cleanText(rowField(row, ['case_number', 'case_no', 'caseid', 'case_id', 'case_num', 'case']));
  const recordId = cleanText(rowField(row, ['record_id', 'service_request', 'service_request_id', 'sr_number', 'id', ':id', 'objectid']));
  const violationType = cleanText(rowField(row, ['violation_type', 'violation', 'violation_code', 'violation_description', 'code_section', 'case_type', 'type', 'description', 'complaint_type']));
  const violationStatus = cleanText(rowField(row, ['violation_status', 'case_status', 'status', 'case_status_description', 'current_status']));
  const openedDate = normalizeDate(rowField(row, ['opened_date', 'date_opened', 'created_date', 'case_date', 'created_at', 'opened']));
  const closedDate = normalizeDate(rowField(row, ['closed_date', 'date_closed', 'closed_at', 'closed']));
  const sourceProofUrl = sourceProofUrlFor(apiUrl, row, recordId || caseNumber);
  const fields = { propertyAddress, city, zip, caseNumber, recordId, violationType, violationStatus, openedDate, closedDate, sourceProofUrl };
  const proofText = buildProofText(fields);
  const addressQuality = classifyAddressQuality(propertyAddress, city, zip);
  if (addressQuality === 'missing') return null;
  const workflowStatus = classifyWorkflow(addressQuality, violationStatus, openedDate, closedDate);
  const identityStatus = addressQuality === 'valid' ? 'resolved' : addressQuality === 'junk' ? 'junk_address_blocked' : 'partial';
  return {
    id: `DAL-CODE-${safeId(`${propertyAddress}|${recordId}|${caseNumber}|${violationType}|${openedDate}`)}`,
    source_key: cleanText(source && source.source_id) || 'tx_dallas_code_violations_socrata',
    source_name: cleanText(source && source.source_name) || 'Dallas OpenData Code Violations',
    source_url: cleanText(source && source.source_url) || DATASET_URL,
    source_type: 'code_violation',
    county: 'Dallas',
    state: 'TX',
    category: 'code_violation',
    property_address: propertyAddress || null,
    city: city || null,
    zip: zip || null,
    case_number: caseNumber || null,
    record_id: recordId || null,
    event_type: 'code_violation',
    violation_type: violationType || null,
    violation_status: violationStatus || null,
    opened_date: openedDate || null,
    closed_date: closedDate || null,
    source_proof_text: proofText || null,
    source_proof_url: sourceProofUrl,
    captured_at: capturedAt,
    confidence: workflowStatus === 'Research Ready' ? 'Medium' : 'Low',
    address_quality: addressQuality,
    source_evidence_status: sourceProofUrl && proofText ? 'found' : 'needs_repair',
    property_identity_status: identityStatus,
    workflow_status: workflowStatus,
    missing_evidence: missingEvidenceFor(fields, addressQuality),
    next_action: nextActionFor(workflowStatus, addressQuality, violationStatus),
    preview_only: true,
    should_ingest: false,
    raw_preview_id: recordId || caseNumber || null
  };
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = [
      cleanText(candidate.property_address).toLowerCase(),
      cleanText(candidate.case_number || candidate.record_id).toLowerCase(),
      cleanText(candidate.violation_type).toLowerCase(),
      cleanText(candidate.opened_date).toLowerCase(),
      cleanText(candidate.source_proof_url).toLowerCase()
    ].filter(Boolean).join('|') || candidate.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function summarizeCandidates(candidates, rowsChecked, attempted) {
  const list = Array.isArray(candidates) ? candidates : [];
  return {
    code_violations_attempted: attempted === true,
    code_violation_rows_checked: Number(rowsChecked) || 0,
    code_violation_candidates_extracted: list.length,
    research_ready: list.filter((candidate) => candidate.workflow_status === 'Research Ready').length,
    source_repair_needed: list.filter((candidate) => candidate.workflow_status === 'Source Repair Needed').length,
    invalid_junk: list.filter((candidate) => candidate.workflow_status === 'Invalid/Junk').length,
    missing_address: list.filter((candidate) => candidate.address_quality === 'missing').length
  };
}

function getFetch(fetchImpl) {
  if (fetchImpl) return fetchImpl;
  if (typeof fetch === 'function') return fetch;
  return require('node-fetch');
}

async function runDallasCodeViolationsAdapter(options = {}) {
  const source = options.source || {};
  const sourceId = cleanText(source.source_id || options.source_id || options.sourceId || 'tx_dallas_code_violations_socrata');
  if (!ALLOWED_SOURCE_IDS.has(sourceId)) {
    return {
      ok: false,
      status: 'blocked_wrong_source',
      blocked_reason: 'Dallas code violations adapter only runs for registered Dallas code violation sources.',
      preview_only: true,
      should_ingest: false,
      code_violations_attempted: false,
      code_violation_rows_checked: 0,
      code_violation_candidates_extracted: 0,
      candidates: []
    };
  }
  const sourceUrl = cleanText(source.source_url || options.source_url || DATASET_URL);
  if (!isOfficialDallasOpenDataUrl(sourceUrl)) {
    return {
      ok: false,
      status: 'blocked_unofficial_source',
      blocked_reason: 'Only official Dallas OpenData URLs are allowed for code violations.',
      preview_only: true,
      should_ingest: false,
      code_violations_attempted: false,
      code_violation_rows_checked: 0,
      code_violation_candidates_extracted: 0,
      candidates: []
    };
  }
  const apiUrl = socrataApiUrl(sourceUrl);
  const maxRows = boundedInt(options.max_rows || options.maxRows || options.max_code_violation_rows || options.maxCodeViolationRows, DEFAULT_MAX_ROWS, MAX_ROWS_PER_RUN);
  const url = new URL(apiUrl);
  url.searchParams.set('$limit', String(maxRows));
  const fetchImpl = getFetch(options.fetch_impl || options.fetchImpl);
  try {
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      timeout: options.timeout_ms || options.timeout || 10000
    });
    if (!response || response.ok === false) {
      const status = response && response.status ? `HTTP ${response.status}` : 'fetch failed';
      throw new Error(status);
    }
    const rows = await response.json();
    const rowList = Array.isArray(rows) ? rows.slice(0, maxRows) : [];
    const candidates = dedupeCandidates(rowList.map((row) => normalizeCodeViolationRow(row, source, {
      captured_at: options.captured_at || options.capturedAt,
      api_url: apiUrl
    })).filter(Boolean));
    const summary = summarizeCandidates(candidates, rowList.length, true);
    return Object.assign({
      ok: true,
      status: candidates.length ? 'candidates_found' : 'no_code_violation_candidates_found',
      provider: 'dallas_code_violations_adapter',
      source_id: sourceId,
      source_url: sourceUrl,
      api_url: apiUrl,
      preview_only: true,
      should_ingest: false,
      candidates,
      blocked_reason: candidates.length ? '' : 'Dallas OpenData returned rows, but no usable property-level code violation candidates were found in the capped sample.'
    }, summary);
  } catch (error) {
    return Object.assign({
      ok: false,
      status: 'blocked_or_failed',
      provider: 'dallas_code_violations_adapter',
      source_id: sourceId,
      source_url: sourceUrl,
      api_url: apiUrl,
      preview_only: true,
      should_ingest: false,
      candidates: [],
      blocked_reason: `Dallas OpenData code violations fetch failed: ${error.message || error}`
    }, summarizeCandidates([], 0, true));
  }
}

module.exports = {
  DATASET_URL,
  RESOURCE_URL,
  MAX_ROWS_PER_RUN,
  isOfficialDallasOpenDataUrl,
  socrataApiUrl,
  normalizeCodeViolationRow,
  dedupeCandidates,
  runDallasCodeViolationsAdapter
};
