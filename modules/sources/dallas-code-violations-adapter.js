'use strict';

const crypto = require('crypto');

const DEFAULT_MAX_ROWS = 25;
const MAX_ROWS_PER_RUN = 100;
const RECENT_DAYS = 180;
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
const SERIOUS_SIGNAL_RE = /\b(unsafe|substandard|structure|vacant|nuisance|dilapidated|board|demolition|high weeds|junk motor|trash|litter|illegal dumping|secur|danger|fire|habitability)\b/i;

const FIELD_ALIASES = {
  address: ['address', 'property_address', 'street_address', 'site_address', 'full_address', 'case_address', 'violation_address', 'location_address'],
  city: ['city', 'municipality'],
  zip: ['zip', 'zipcode', 'zip_code', 'postal_code', 'zone'],
  caseNumber: ['case_number', 'case_no', 'caseid', 'case_id', 'case_num', 'case'],
  recordId: ['record_id', 'service_request', 'service_request_id', 'sr_number', 'id', ':id', 'objectid'],
  violationType: ['violation_type', 'violation', 'violation_code', 'violation_description', 'code_section', 'case_type', 'type', 'description', 'complaint_type', 'nuisance'],
  violationStatus: ['violation_status', 'case_status', 'status', 'case_status_description', 'current_status'],
  openedDate: ['opened_date', 'date_opened', 'created_date', 'case_date', 'created_at', 'opened', 'created', 'updated'],
  closedDate: ['closed_date', 'date_closed', 'closed_at', 'closed', 'completed_date'],
  location: ['location']
};

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

function escapeSoqlLiteral(value) {
  return cleanText(value).replace(/'/g, "''");
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

function socrataViewId(url) {
  const apiUrl = cleanText(url || RESOURCE_URL);
  const match = apiUrl.match(/\/resource\/([a-z0-9-]+)\.json/i) || apiUrl.match(/\/(?:dataset|d)\/[^/]+\/([a-z0-9-]+)/i);
  return match ? match[1] : '';
}

function socrataMetadataUrl(apiUrl) {
  const viewId = socrataViewId(apiUrl);
  return viewId ? `https://${OFFICIAL_HOST}/api/views/${viewId}` : '';
}

function fieldSetFromRow(row) {
  return new Set(Object.keys(row || {}).map((key) => key.toLowerCase()));
}

function pickField(availableFields, aliases) {
  const lower = new Map(Array.from(availableFields || []).map((field) => [String(field).toLowerCase(), field]));
  for (const alias of aliases || []) {
    const found = lower.get(String(alias).toLowerCase());
    if (found) return found;
  }
  return '';
}

async function fetchSocrataSchema(apiUrl, fetchImpl) {
  const metadataUrl = socrataMetadataUrl(apiUrl);
  if (!metadataUrl) return { columns: [], field_names: [], fields: {}, error: 'missing_metadata_url' };
  try {
    const response = await fetchImpl(metadataUrl, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!response || response.ok === false) throw new Error(response && response.status ? `HTTP ${response.status}` : 'fetch failed');
    const meta = await response.json();
    const columns = Array.isArray(meta && meta.columns) ? meta.columns.filter((column) => cleanText(column.fieldName)) : [];
    const fieldNames = columns.map((column) => column.fieldName);
    const available = new Set(fieldNames);
    return {
      columns: columns.map((column) => ({
        name: cleanText(column.name),
        fieldName: cleanText(column.fieldName),
        dataTypeName: cleanText(column.dataTypeName)
      })),
      field_names: fieldNames,
      fields: inferFields(available),
      error: ''
    };
  } catch (error) {
    return { columns: [], field_names: [], fields: {}, error: error.message || 'schema fetch failed' };
  }
}

function inferFields(availableFields) {
  const available = availableFields instanceof Set ? availableFields : new Set(Array.from(availableFields || []));
  return {
    address: pickField(available, FIELD_ALIASES.address),
    city: pickField(available, FIELD_ALIASES.city),
    zip: pickField(available, FIELD_ALIASES.zip),
    caseNumber: pickField(available, FIELD_ALIASES.caseNumber),
    recordId: pickField(available, FIELD_ALIASES.recordId),
    violationType: pickField(available, FIELD_ALIASES.violationType),
    violationStatus: pickField(available, FIELD_ALIASES.violationStatus),
    openedDate: pickField(available, FIELD_ALIASES.openedDate),
    closedDate: pickField(available, FIELD_ALIASES.closedDate),
    location: pickField(available, FIELD_ALIASES.location),
    streetNumber: pickField(available, ['str_num', 'street_number']),
    streetPrefix: pickField(available, ['str_prefix', 'street_prefix']),
    streetName: pickField(available, ['str_nam', 'str_name', 'street_name']),
    streetSuffix: pickField(available, ['str_suffix', 'street_suffix'])
  };
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

function streetPartsAddress(row) {
  return cleanText([
    rowField(row, ['str_num', 'street_number']),
    rowField(row, ['str_prefix', 'street_prefix']),
    rowField(row, ['str_nam', 'str_name', 'street_name']),
    rowField(row, ['str_suffix', 'street_suffix'])
  ].filter((part) => cleanText(part)).join(' '));
}

function normalizeDate(value) {
  const text = cleanText(value);
  if (!text) return '';
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

function dateAgeDays(value, nowValue) {
  const text = normalizeDate(value);
  if (!text) return null;
  const date = new Date(text);
  const now = nowValue ? new Date(nowValue) : new Date();
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

function isRecentDate(value, nowValue, recentDays = RECENT_DAYS) {
  const age = dateAgeDays(value, nowValue);
  return Number.isFinite(age) && age >= 0 && age <= recentDays;
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

function classifyWorkflow(addressQuality, violationStatus, openedDate, closedDate, options = {}) {
  if (addressQuality === 'junk') return 'Invalid/Junk';
  if (addressQuality === 'missing' || addressQuality === 'partial') return 'Source Repair Needed';
  const statusText = cleanText(violationStatus);
  if (CLOSED_STATUS_RE.test(statusText)) return 'Source Repair Needed';
  if (closedDate) return 'Source Repair Needed';
  if (ACTIVE_STATUS_RE.test(statusText)) return 'Research Ready';
  if (isRecentDate(openedDate, options.now || options.capturedAt, options.recentDays || RECENT_DAYS)) return 'Research Ready';
  return 'Source Repair Needed';
}

function scoreCandidate(addressQuality, violationStatus, openedDate, closedDate, violationType, options = {}) {
  const statusText = cleanText(violationStatus);
  const typeText = cleanText(violationType);
  const active = ACTIVE_STATUS_RE.test(statusText) && !CLOSED_STATUS_RE.test(statusText);
  const closed = CLOSED_STATUS_RE.test(statusText) || Boolean(cleanText(closedDate));
  const recent = isRecentDate(openedDate, options.now || options.capturedAt, options.recentDays || RECENT_DAYS);
  const serious = SERIOUS_SIGNAL_RE.test(`${typeText} ${options.nuisance || ''}`);
  const statusScore = active ? 45 : closed ? 0 : recent ? 25 : 10;
  const recencyScore = recent ? 25 : 0;
  const distressSignalStrength = serious ? 'high' : typeText ? 'medium' : 'low';
  const distressScore = serious ? 20 : typeText ? 10 : 0;
  const addressScore = addressQuality === 'valid' ? 10 : addressQuality === 'partial' ? 4 : 0;
  return {
    candidate_priority_score: Math.max(0, Math.min(100, statusScore + recencyScore + distressScore + addressScore)),
    recency_score: recencyScore,
    status_score: statusScore,
    distress_signal_strength: distressSignalStrength,
    is_active_or_open: active,
    is_recent: recent,
    is_closed_old: closed && !recent
  };
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
    location.address,
    streetPartsAddress(row || {})
  ));
  const city = cleanText(firstValue(rowField(row, ['city', 'municipality']), location.city, propertyAddress && /dallas/i.test(propertyAddress) ? 'Dallas' : ''));
  const zip = cleanText(firstValue(rowField(row, ['zip', 'zipcode', 'zip_code', 'postal_code']), location.zip));
  const caseNumber = cleanText(rowField(row, ['case_number', 'case_no', 'caseid', 'case_id', 'case_num', 'case']));
  const recordId = cleanText(rowField(row, ['record_id', 'service_request', 'service_request_id', 'sr_number', 'id', ':id', 'objectid']));
  const violationType = cleanText(firstValue(
    rowField(row, ['violation_type', 'violation', 'violation_code', 'violation_description', 'code_section', 'case_type', 'type', 'description', 'complaint_type']),
    rowField(row, ['nuisance'])
  ));
  const violationStatus = cleanText(rowField(row, ['violation_status', 'case_status', 'status', 'case_status_description', 'current_status']));
  const openedDate = normalizeDate(rowField(row, ['opened_date', 'date_opened', 'created_date', 'case_date', 'created_at', 'opened', 'created', 'updated']));
  const closedDate = normalizeDate(rowField(row, ['closed_date', 'date_closed', 'closed_at', 'closed', 'completed_date']));
  const sourceProofUrl = sourceProofUrlFor(apiUrl, row, recordId || caseNumber);
  const fields = { propertyAddress, city, zip, caseNumber, recordId, violationType, violationStatus, openedDate, closedDate, sourceProofUrl };
  const proofText = buildProofText(fields);
  const addressQuality = classifyAddressQuality(propertyAddress, city, zip);
  if (addressQuality === 'missing') return null;
  const scoring = scoreCandidate(addressQuality, violationStatus, openedDate, closedDate, violationType, {
    now: options.now || options.captured_at || options.capturedAt,
    recentDays: options.recent_days || options.recentDays || RECENT_DAYS,
    nuisance: rowField(row, ['nuisance'])
  });
  const workflowStatus = classifyWorkflow(addressQuality, violationStatus, openedDate, closedDate, {
    now: options.now || options.captured_at || options.capturedAt,
    recentDays: options.recent_days || options.recentDays || RECENT_DAYS
  });
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
    candidate_priority_score: scoring.candidate_priority_score,
    recency_score: scoring.recency_score,
    status_score: scoring.status_score,
    distress_signal_strength: scoring.distress_signal_strength,
    is_active_or_open: scoring.is_active_or_open,
    is_recent: scoring.is_recent,
    is_closed_old: scoring.is_closed_old,
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
    code_violation_research_ready: list.filter((candidate) => candidate.workflow_status === 'Research Ready').length,
    code_violation_source_repair_needed: list.filter((candidate) => candidate.workflow_status === 'Source Repair Needed').length,
    code_violation_closed_old_count: list.filter((candidate) => candidate.is_closed_old === true).length,
    research_ready: list.filter((candidate) => candidate.workflow_status === 'Research Ready').length,
    source_repair_needed: list.filter((candidate) => candidate.workflow_status === 'Source Repair Needed').length,
    invalid_junk: list.filter((candidate) => candidate.workflow_status === 'Invalid/Junk').length,
    missing_address: list.filter((candidate) => candidate.address_quality === 'missing').length
  };
}

function uniqueRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = cleanText(firstValue(
      rowField(row, FIELD_ALIASES.recordId),
      rowField(row, FIELD_ALIASES.caseNumber),
      `${rowField(row, FIELD_ALIASES.address)}|${rowField(row, FIELD_ALIASES.violationType)}|${rowField(row, FIELD_ALIASES.openedDate)}`,
      JSON.stringify(row)
    ));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function recentThresholdIso(nowValue, recentDays = RECENT_DAYS) {
  const now = nowValue ? new Date(nowValue) : new Date();
  if (Number.isNaN(now.getTime())) return '';
  return new Date(now.getTime() - (recentDays * 86400000)).toISOString().slice(0, 19);
}

function buildQueryStrategies(apiUrl, fields, maxRows, options = {}) {
  const strategies = [];
  const statusField = cleanText(fields.violationStatus);
  const openedField = cleanText(fields.openedDate);
  const typeField = cleanText(fields.violationType);
  if (statusField) {
    strategies.push({
      name: 'active_open',
      counter: 'active',
      params: {
        '$limit': String(maxRows),
        '$where': `${statusField} not in ('CLOSED','Closed','closed','COMPLETE','Complete','complete','COMPLETED','Completed','completed','RESOLVED','Resolved','resolved','CANCELLED','Cancelled','cancelled','CANCELED','Canceled','canceled')`
      }
    });
  }
  if (openedField) {
    strategies.push({
      name: 'recent',
      counter: 'recent',
      params: {
        '$limit': String(maxRows),
        '$where': `${openedField} >= '${recentThresholdIso(options.now || options.captured_at || options.capturedAt, options.recent_days || options.recentDays || RECENT_DAYS)}'`,
        '$order': `${openedField} DESC`
      }
    });
  }
  if (typeField) {
    strategies.push({
      name: 'high_signal',
      counter: 'high_signal',
      params: {
        '$limit': String(maxRows),
        '$where': `${typeField} in ('Nuisance','Structure','Substandard Structure','Vacant','High Weeds','Junk Motor Vehicle','Illegal Dumping')`
      }
    });
  }
  strategies.push({
    name: 'fallback',
    counter: 'fallback',
    params: Object.assign({ '$limit': String(maxRows) }, openedField ? { '$order': `${openedField} DESC` } : {})
  });
  return strategies;
}

async function fetchRows(apiUrl, params, fetchImpl, options = {}) {
  const url = new URL(apiUrl);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && cleanText(value)) url.searchParams.set(key, value);
  }
  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    timeout: options.timeout_ms || options.timeout || 10000
  });
  if (!response || response.ok === false) {
    const status = response && response.status ? `HTTP ${response.status}` : 'fetch failed';
    throw new Error(status);
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
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
  const fetchImpl = getFetch(options.fetch_impl || options.fetchImpl);
  try {
    const schema = await fetchSocrataSchema(apiUrl, fetchImpl);
    let fields = schema.fields || {};
    const strategies = buildQueryStrategies(apiUrl, fields, maxRows, options);
    const allRows = [];
    const queryAttempts = [];
    let activeRowsChecked = 0;
    let recentRowsChecked = 0;
    let fallbackUsed = false;
    for (const strategy of strategies) {
      let rows = [];
      try {
        rows = await fetchRows(apiUrl, strategy.params, fetchImpl, options);
        queryAttempts.push({ name: strategy.name, rows_checked: rows.length });
      } catch (error) {
        queryAttempts.push({ name: strategy.name, rows_checked: 0, error: error.message || 'query failed' });
        continue;
      }
      if (!Object.keys(fields).some((key) => cleanText(fields[key])) && rows[0]) {
        fields = inferFields(fieldSetFromRow(rows[0]));
      }
      if (strategy.counter === 'active') activeRowsChecked += rows.length;
      if (strategy.counter === 'recent') recentRowsChecked += rows.length;
      if (strategy.counter === 'fallback') fallbackUsed = true;
      allRows.push(...rows);
      const trialCandidates = dedupeCandidates(uniqueRows(allRows).map((row) => normalizeCodeViolationRow(row, source, {
        captured_at: options.captured_at || options.capturedAt,
        now: options.now,
        recent_days: options.recent_days || options.recentDays,
        api_url: apiUrl
      })).filter(Boolean));
      if (strategy.name !== 'fallback' && trialCandidates.some((candidate) => candidate.workflow_status === 'Research Ready')) break;
      if (strategy.name === 'fallback') break;
    }
    const rowList = uniqueRows(allRows).slice(0, maxRows);
    const candidates = dedupeCandidates(rowList.map((row) => normalizeCodeViolationRow(row, source, {
      captured_at: options.captured_at || options.capturedAt,
      now: options.now,
      recent_days: options.recent_days || options.recentDays,
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
      schema_fields: fields,
      query_attempts: queryAttempts,
      preview_only: true,
      should_ingest: false,
      candidates,
      blocked_reason: candidates.length ? '' : 'Dallas OpenData returned rows, but no usable property-level code violation candidates were found in the capped sample.'
    }, summary, {
      code_violation_active_rows_checked: activeRowsChecked,
      code_violation_recent_rows_checked: recentRowsChecked,
      code_violation_fallback_used: fallbackUsed
    });
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
    }, summarizeCandidates([], 0, true), {
      code_violation_active_rows_checked: 0,
      code_violation_recent_rows_checked: 0,
      code_violation_fallback_used: false
    });
  }
}

module.exports = {
  DATASET_URL,
  RESOURCE_URL,
  MAX_ROWS_PER_RUN,
  RECENT_DAYS,
  isOfficialDallasOpenDataUrl,
  socrataApiUrl,
  fetchSocrataSchema,
  inferFields,
  normalizeCodeViolationRow,
  dedupeCandidates,
  buildQueryStrategies,
  runDallasCodeViolationsAdapter
};
