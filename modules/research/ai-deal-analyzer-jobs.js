'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const sourceEvidenceAdapter = require('./source-evidence-adapter');
const compResearchProvider = require('./comp-research-provider');

const JOB_STATUSES = new Set([
  'queued',
  'analyzing',
  'needs_address_review',
  'needs_source_evidence',
  'needs_comps',
  'ready_for_review',
  'failed'
]);

const MAX_BATCH_SIZE = 10;
const DB_PATH = process.env.DB_PATH || './data/db.json';
const DB_FILE = path.resolve(DB_PATH);
const JOB_STORE_FILE = path.resolve(
  process.env.AI_DEAL_ANALYZER_JOBS_PATH ||
  path.join(path.dirname(DB_FILE), 'ai-deal-analyzer-jobs.json')
);

const FUTURE_ADAPTERS = {
  openai_research: {
    enabled: /^(1|true|yes|on)$/i.test(String(process.env.AI_DEAL_ANALYZER_OPENAI_RESEARCH_ENABLED || '')),
    purpose: 'Future Responses API web_search evidence collection'
  },
  firecrawl: {
    enabled: /^(1|true|yes|on)$/i.test(String(process.env.AI_DEAL_ANALYZER_FIRECRAWL_ENABLED || '')),
    purpose: 'Future public source page extraction'
  },
  playwright_source: {
    enabled: /^(1|true|yes|on)$/i.test(String(process.env.AI_DEAL_ANALYZER_PLAYWRIGHT_ENABLED || '')),
    purpose: 'Future operator-approved browser source adapter'
  },
  county_source: {
    enabled: /^(1|true|yes|on)$/i.test(String(process.env.AI_DEAL_ANALYZER_COUNTY_SOURCE_ENABLED || '')),
    purpose: 'Future county-specific public record adapter'
  },
  address_normalization: {
    enabled: /^(1|true|yes|on)$/i.test(String(process.env.AI_DEAL_ANALYZER_ADDRESS_NORMALIZATION_ENABLED || '')),
    purpose: 'Future geocoding/address normalization adapter'
  }
};

function nowIso() {
  return new Date().toISOString();
}

function ensureJobStoreDir() {
  const dir = path.dirname(JOB_STORE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeParseJobsFile() {
  ensureJobStoreDir();
  if (!fs.existsSync(JOB_STORE_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(JOB_STORE_FILE, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.jobs)) return parsed.jobs;
  } catch (error) {
    return [];
  }
  return [];
}

function readLegacyJobs() {
  try {
    const data = db.readDB();
    return Array.isArray(data.ai_deal_analyzer_jobs) ? data.ai_deal_analyzer_jobs : [];
  } catch (error) {
    return [];
  }
}

function normalizeJobList(jobs) {
  const seen = new Set();
  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => job && job.job_id && !seen.has(job.job_id) && seen.add(job.job_id))
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
    .slice(0, 250);
}

function writeJobsFile(jobs) {
  ensureJobStoreDir();
  const canonicalJobs = normalizeJobList(jobs);
  const payload = {
    version: 1,
    updated_at: nowIso(),
    jobs: canonicalJobs
  };
  const tmp = `${JOB_STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, JOB_STORE_FILE);
  return canonicalJobs;
}

function jobId() {
  if (crypto.randomUUID) return `aidj_${crypto.randomUUID()}`;
  return `aidj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function pick(obj, keys) {
  obj = obj || {};
  for (const key of keys) {
    const parts = String(key).split('.');
    let cursor = obj;
    for (const part of parts) {
      if (!cursor || typeof cursor !== 'object') {
        cursor = undefined;
        break;
      }
      cursor = cursor[part];
    }
    if (cursor !== undefined && cursor !== null && String(cursor).trim() !== '') return cursor;
  }
  return '';
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function leadAddress(lead) {
  return cleanText(pick(lead, ['address', 'property_address', 'situs_address', 'mailing_address', 'site_address']));
}

function leadCity(lead) {
  return cleanText(pick(lead, ['city', 'property_city', 'situs_city']));
}

function leadState(lead) {
  return cleanText(pick(lead, ['state', 'property_state', 'situs_state'])).toUpperCase();
}

function leadZip(lead) {
  return cleanText(pick(lead, ['zip', 'zipcode', 'postal_code', 'property_zip', 'situs_zip']));
}

function leadCounty(lead) {
  return cleanText(pick(lead, ['county', 'property_county', 'situs_county']));
}

function fullLeadAddress(lead) {
  const parts = [leadAddress(lead), leadCity(lead), leadState(lead), leadZip(lead)].filter(Boolean);
  return parts.join(', ');
}

function statePattern() {
  return '(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)';
}

function pseudoLeadFromAddress(input) {
  const original = cleanText(input);
  const lead = { address: original };
  const zipMatch = original.match(/\b\d{5}(?:-\d{4})?\b/);
  if (zipMatch) lead.zip = zipMatch[0];

  const parts = original.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    lead.address = parts[0];
    lead.city = parts[1];
    const stateZip = parts.slice(2).join(' ');
    const stateMatch = stateZip.match(new RegExp(`\\b${statePattern()}\\b`, 'i'));
    if (stateMatch) lead.state = stateMatch[1].toUpperCase();
    return lead;
  }

  let working = original;
  if (lead.zip) working = working.replace(lead.zip, '').trim();
  const stateMatch = working.match(new RegExp(`\\b${statePattern()}\\b\\.?$`, 'i'));
  if (stateMatch) {
    lead.state = stateMatch[1].toUpperCase();
    working = working.replace(new RegExp(`\\b${stateMatch[1]}\\b\\.?$`, 'i'), '').trim();
    const tokens = working.split(/\s+/).filter(Boolean);
    if (tokens.length > 3) {
      lead.city = tokens.pop();
      lead.address = tokens.join(' ');
    } else {
      lead.address = working;
    }
  }
  return lead;
}

function addressQuality(leadOrText) {
  const lead = typeof leadOrText === 'string' ? pseudoLeadFromAddress(leadOrText) : (leadOrText || {});
  const street = cleanText(leadAddress(lead));
  const city = leadCity(lead);
  const state = leadState(lead);
  const zip = leadZip(lead);
  const county = leadCounty(lead);
  const full = [street, city, state, zip].filter(Boolean).join(', ');
  const probe = [street, full, county].filter(Boolean).join(' ').toLowerCase();
  const hasNumber = /\b\d{1,7}\b/.test(street);
  const hasStreetWord = /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop|run|sq|square|plaza|expressway|expy|fwy|freeway)\b/i.test(street);
  const hasCityState = !!(city && state);
  const hasZip = /\b\d{5}(?:-\d{4})?\b/.test(zip || full);

  if (!street && !full) {
    return { status: 'missing', label: 'Needs Address Review', normalized_address: '', message: 'Address needs repair before research links.' };
  }
  if (/^(column\s*[1-4]|unnamed)$/i.test(street) ||
      /\b(public information request|phone directory|page not found|contact us|contact|search results|skip main navigation|court calendar|beginning december)\b/i.test(probe) ||
      /^\d{1,7}\s+(contact|beginning|calendar|schedule|directory|public information request)\b/i.test(street) ||
      /^(phone\s+directory|contact|contacts|beginning|calendar|home|search|login|notice|notices)\b/i.test(street)) {
    return { status: 'junk', label: 'Needs Address Review', normalized_address: full || street, message: 'Address needs repair before research links.' };
  }
  if (!hasNumber || !hasStreetWord) {
    return { status: 'junk', label: 'Needs Address Review', normalized_address: full || street, message: 'Address needs repair before research links.' };
  }
  if (!hasCityState && !hasZip) {
    return { status: 'partial', label: 'Needs Address Review', normalized_address: full || [street, county, state].filter(Boolean).join(', '), message: 'Address is incomplete. Add city/state or verify source record before comps.' };
  }
  return { status: 'valid', label: 'Research Ready', normalized_address: full || street, message: '' };
}

function classifyInput(item) {
  item = item || {};
  const rawType = cleanText(item.input_type || item.inputType || item.type).toLowerCase();
  const value = cleanText(item.input_value || item.inputValue || item.value || item.address || item.url || '');
  const leadId = cleanText(item.lead_id || item.leadId || item.id || (item.lead && item.lead.id));
  if (rawType === 'selected_lead' || leadId) return 'selected_lead';
  if (/^https?:\/\//i.test(value)) return 'property_link';
  return 'pasted_address';
}

function findLead(leadId) {
  if (!leadId) return null;
  return (db.getLeads() || []).find((lead) => String(lead.id) === String(leadId)) || null;
}

function collectSourceEvidence(lead, job) {
  const pack = sourceEvidenceAdapter.buildSourceEvidencePack(job || {}, lead || null);
  const proofLevel = sourceEvidenceAdapter.sourceEvidenceProofLevel(pack.source_url_type, pack.property_identity_status);
  const evidence = [{
    type: 'source_evidence_pack',
    label: `${pack.source_status}: ${pack.source_label}`,
    value: pack.source_url || pack.next_action,
    source_url: pack.source_url,
    status: pack.source_status,
    evidence_role: proofLevel,
    source_url_type: pack.source_url_type,
    source_url_label: pack.source_label,
    source_status: pack.source_status,
    property_identity_status: pack.property_identity_status,
    property_identity_label: pack.property_identity_label,
    address_candidate: pack.address_candidate,
    owner_candidate: pack.owner_candidate,
    amount_candidate: pack.amount_candidate,
    source_ref: pack.source_ref,
    event_type: pack.event_type,
    event_date: pack.event_date,
    county: pack.county,
    state: pack.state,
    confidence: pack.confidence,
    missing_fields: pack.missing_fields,
    next_action: pack.next_action,
    notes: pack.notes
  }];

  if (!lead) return evidence;
  const url = pick(lead, [
    'source_record_url',
    'record_url',
    'source_url',
    'verification_url',
    'source_pdf_url',
    'source_details.record_url',
    'source_details.source_url',
    'source_details.query_url',
    'source_truth.source_record_url',
    'source_truth.source_url',
    '_courthouse_metadata.source_url',
    '_courthouse_metadata.source_pdf_url'
  ]);
  if (isHttpUrl(url)) {
    evidence.push({
      type: 'source_record',
      label: 'Source record available',
      source_url: cleanText(url),
      status: 'available',
      evidence_role: proofLevel
    });
  }
  const caseNumber = pick(lead, ['case_number', 'cause_number', 'source_details.case_number', 'source_details.cause_number', 'source_truth.case_number', '_courthouse_metadata.case_number']);
  if (caseNumber) evidence.push({ type: 'case_reference', label: 'Case/reference found', value: cleanText(caseNumber), status: 'found' });
  const parcel = pick(lead, ['parcel', 'apn', 'parcel_id', 'account_number', 'source_details.parcel', 'source_details.apn', 'source_truth.parcel', 'source_truth.source_record_url', '_courthouse_metadata.parcel']);
  if (parcel) evidence.push({ type: 'parcel_reference', label: 'Parcel/account found', value: cleanText(parcel), status: 'found' });
  const amount = pick(lead, ['amount_owed', 'tax_due', 'tax_lien_amount', 'lien_amount', 'violation_amount', 'judgment_amount', 'minimum_bid', 'source_amount', 'source_details.amount_owed', 'source_truth.amount', '_courthouse_metadata.lien_amount']);
  if (amount) evidence.push({ type: 'amount_reference', label: 'Amount field present', value: cleanText(amount), status: 'needs_verification' });
  return evidence;
}

function sourceProofAvailable(sourceEvidence) {
  return (Array.isArray(sourceEvidence) ? sourceEvidence : []).some((item) => item && item.evidence_role === 'source_proof');
}

function sourcePackFromEvidence(sourceEvidence) {
  return (Array.isArray(sourceEvidence) ? sourceEvidence : []).find((item) => item && item.type === 'source_evidence_pack') || null;
}

function compPrice(comp) {
  const raw = pick(comp, ['sold_price', 'sale_price', 'price', 'closed_price']);
  const n = Number(String(raw || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function compSoldDate(comp) {
  return cleanText(pick(comp, ['sold_date', 'sale_date', 'closed_date', 'date']));
}

function compSourceUrl(comp) {
  return cleanText(pick(comp, ['source_url', 'url', 'sourceUrl', 'record_url']));
}

function compAddress(comp) {
  return cleanText(pick(comp, ['address', 'comp_address', 'property_address']));
}

function isVerifiedSoldComp(comp) {
  comp = comp || {};
  const status = cleanText(pick(comp, ['status', 'sale_list_status', 'type'])).toLowerCase();
  const verified = comp.verified === true || comp.is_verified === true || /verified/.test(status);
  const sold = /sold|closed/.test(status) || !!compSoldDate(comp);
  return verified && sold && compAddress(comp) && compPrice(comp) > 0 && compSoldDate(comp) && isHttpUrl(compSourceUrl(comp));
}

function collectCompEvidence(lead) {
  if (!lead) return [];
  const containers = [
    lead.verified_comps,
    lead.comps,
    lead.manual_comps,
    lead.research_comps,
    lead.comp_evidence
  ].filter(Array.isArray);
  const comps = [];
  containers.forEach((list) => {
    list.forEach((comp) => {
      if (!isVerifiedSoldComp(comp)) return;
      comps.push({
        type: 'verified_sold_comp',
        address: compAddress(comp),
        sold_price: compPrice(comp),
        sold_date: compSoldDate(comp),
        beds: pick(comp, ['beds', 'bedrooms']) || null,
        baths: pick(comp, ['baths', 'bathrooms']) || null,
        sqft: pick(comp, ['sqft', 'square_feet']) || null,
        distance: pick(comp, ['distance', 'distance_miles']) || null,
        source_url: compSourceUrl(comp),
        verification_status: 'verified'
      });
    });
  });
  return comps.slice(0, 20);
}

function mergeCompResearchState(job, state) {
  state = state || {};
  return Object.assign({}, job, {
    comp_research_status: state.provider_status,
    comp_research_provider: state.provider,
    comp_research_provider_label: state.provider_label,
    comp_candidates: state.candidates,
    verified_comp_count: Math.max(
      Array.isArray(job && job.comp_evidence) ? job.comp_evidence.length : 0,
      state.verified_comp_count || 0
    ),
    comp_missing_evidence: state.missing_evidence,
    comp_next_action: state.next_action,
    comp_research_property_evidence: state.property_evidence || [],
    comp_research_source_evidence: state.source_evidence || [],
    comp_research_warnings: state.warnings || [],
    comp_research_citations: state.citations || [],
    comp_research_summary: state.raw_summary || '',
    comp_research_updated_at: state.updated_at
  });
}

function applyCompResearchState(job, options) {
  const state = compResearchProvider.runCompResearch(job || {}, options || {});
  if (state && typeof state.then === 'function') {
    return state.then((resolvedState) => mergeCompResearchState(job, resolvedState));
  }
  return mergeCompResearchState(job, state);
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function valuationFromComps(compEvidence, lead) {
  const prices = compEvidence.map((comp) => Number(comp.sold_price)).filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length < 3) {
    return {
      valuation_locked: true,
      arv_range: null,
      mao_range: null,
      valuation_note: 'Insufficient verified comp evidence - valuation blocked.'
    };
  }
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const med = median(prices);
  const arvRange = {
    low,
    high,
    median: med,
    count: prices.length,
    basis: 'verified_sold_comps',
    label: 'Draft from verified sold comps - review before making an offer.'
  };
  const repairRaw = pick(lead || {}, ['repair_estimate', 'repairs', 'repair_cost', 'estimated_repairs']);
  const repairs = Number(String(repairRaw || '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(repairs) || repairs <= 0) {
    return {
      valuation_locked: false,
      arv_range: arvRange,
      mao_range: null,
      valuation_note: 'Draft ARV range is ready for review. Add repair estimate before MAO.'
    };
  }
  return {
    valuation_locked: false,
    arv_range: arvRange,
    mao_range: {
      low: Math.round(low * 0.7 - repairs),
      high: Math.round(high * 0.7 - repairs),
      repairs,
      basis: 'arv_x_70_percent_minus_manual_repairs',
      label: 'Draft MAO from verified comps and manual repair estimate - review before offer.'
    },
    valuation_note: 'Valuation ready for review.'
  };
}

function missingEvidenceFor(quality, sourceEvidence, compEvidence, valuation) {
  const missing = [];
  if (quality.status !== 'valid') missing.push('Verified property address');
  if (!sourceProofAvailable(sourceEvidence)) missing.push('Source/property evidence');
  const pack = sourcePackFromEvidence(sourceEvidence);
  if (pack && Array.isArray(pack.missing_fields)) {
    pack.missing_fields.forEach((field) => {
      if (field && !missing.includes(field)) missing.push(field);
    });
  }
  if (compEvidence.length < 3) missing.push('3 verified sold comps');
  if (valuation && valuation.arv_range && !valuation.mao_range) missing.push('Repair estimate for MAO');
  return missing;
}

function nextAction(status, missingEvidence, sourceEvidence) {
  const pack = sourcePackFromEvidence(sourceEvidence);
  if (status === 'needs_address_review') return pack && pack.next_action ? pack.next_action : 'Repair address first';
  if (status === 'needs_source_evidence') return pack && pack.next_action ? pack.next_action : 'Needs source/property evidence before outreach.';
  if (status === 'needs_comps') return 'Source evidence found. Comps needed next.';
  if (status === 'ready_for_review') return 'Ready for review';
  if (status === 'failed') return 'Review failed job';
  return missingEvidence && missingEvidence.length ? 'Needs research' : 'Ready to offer';
}

function resultSummary(status, quality, sourceEvidence, compEvidence, valuation) {
  const pack = sourcePackFromEvidence(sourceEvidence);
  if (status === 'needs_address_review') return quality.message || 'Address needs review before comps.';
  if (status === 'needs_source_evidence') return pack && pack.next_action ? pack.next_action : 'Property address is usable, but source/property evidence is missing.';
  if (status === 'needs_comps') return 'Source evidence exists. Verified sold comps are still needed before valuation.';
  if (status === 'ready_for_review') return valuation && valuation.valuation_note ? valuation.valuation_note : 'Evidence is ready for review.';
  return `Evidence found: ${sourceEvidence.length} source item(s), ${compEvidence.length} verified sold comp(s).`;
}

function statusForEvidence(quality, sourceEvidence, compEvidence) {
  if (quality.status !== 'valid') return 'needs_address_review';
  if (!sourceProofAvailable(sourceEvidence)) return 'needs_source_evidence';
  if (compEvidence.length < 3) return 'needs_comps';
  return 'ready_for_review';
}

function readJobs() {
  const storeJobs = safeParseJobsFile();
  if (storeJobs.length) return normalizeJobList(storeJobs);

  const legacyJobs = readLegacyJobs();
  if (legacyJobs.length) return writeJobsFile(legacyJobs);

  return [];
}

function writeJobs(jobs) {
  return writeJobsFile(jobs);
}

function upsertJob(job) {
  const jobs = readJobs();
  const idx = jobs.findIndex((existing) => existing.job_id === job.job_id);
  if (idx >= 0) jobs[idx] = job;
  else jobs.unshift(job);
  writeJobs(jobs);
  return job;
}

function publicJob(job) {
  return Object.assign({}, job, {
    future_adapters: Object.keys(FUTURE_ADAPTERS).reduce((acc, key) => {
      acc[key] = { enabled: FUTURE_ADAPTERS[key].enabled === true };
      return acc;
    }, {})
  });
}

function createJob(item) {
  item = item || {};
  const inputType = classifyInput(item);
  const leadId = cleanText(item.lead_id || item.leadId || item.id || (item.lead && item.lead.id));
  const lead = inputType === 'selected_lead' ? findLead(leadId) || item.lead || null : null;
  const inputValue = cleanText(
    item.input_value ||
    item.inputValue ||
    item.value ||
    item.url ||
    item.address ||
    (lead ? fullLeadAddress(lead) || leadAddress(lead) : '')
  );
  const created = nowIso();
  return {
    job_id: jobId(),
    created_at: created,
    updated_at: created,
    status: 'queued',
    input_type: inputType,
    input_value: inputValue,
    normalized_address: '',
    lead_id: lead ? lead.id : leadId,
    lead_ref: cleanText(item.lead_ref || item.leadRef || (lead && (lead.ref_id || lead.reference_id || lead.ref || lead.id))),
    source_url: isHttpUrl(item.source_url || item.sourceUrl || item.source_proof_url || item.sourceProofUrl)
      ? cleanText(item.source_url || item.sourceUrl || item.source_proof_url || item.sourceProofUrl)
      : '',
    source_evidence: [],
    comp_evidence: [],
    comp_research_status: 'not_configured',
    comp_research_provider: 'none',
    comp_research_provider_label: 'Not configured',
    comp_candidates: [],
    verified_comp_count: 0,
    comp_missing_evidence: ['3 verified sold comps'],
    comp_next_action: 'Comp provider not configured yet.',
    comp_research_property_evidence: [],
    comp_research_source_evidence: [],
    comp_research_warnings: [],
    comp_research_citations: [],
    comp_research_summary: '',
    comp_research_updated_at: '',
    missing_evidence: [],
    result_summary: 'Queued for evidence review.',
    next_best_action: 'Needs research',
    valuation_locked: true,
    arv_range: null,
    mao_range: null,
    error: '',
    adapter_status: Object.keys(FUTURE_ADAPTERS).reduce((acc, key) => {
      acc[key] = { enabled: FUTURE_ADAPTERS[key].enabled === true, purpose: FUTURE_ADAPTERS[key].purpose };
      return acc;
    }, {})
  };
}

function createJobs(body, options) {
  options = options || {};
  const rawItems = Array.isArray(body && body.items)
    ? body.items
    : Array.isArray(body && body.inputs)
      ? body.inputs
      : [];
  if (!rawItems.length) {
    const err = new Error('At least one property or selected lead is required.');
    err.status = 400;
    throw err;
  }
  if (rawItems.length > MAX_BATCH_SIZE) {
    const err = new Error('Analyze up to 10 properties at a time.');
    err.status = 400;
    throw err;
  }
  const jobs = rawItems.map(createJob);
  const existing = readJobs();
  writeJobs(jobs.concat(existing).slice(0, 250));
  if (options.runNow) {
    return jobs.map((job) => runJob(job.job_id));
  }
  return jobs.map(publicJob);
}

function listJobs(limit) {
  const max = Math.min(Math.max(parseInt(limit || 50, 10) || 50, 1), 100);
  return readJobs().slice(0, max).map(publicJob);
}

function getJob(jobIdValue) {
  const job = readJobs().find((candidate) => candidate.job_id === jobIdValue);
  return job ? publicJob(job) : null;
}

function runJob(jobIdValue) {
  const jobs = readJobs();
  const idx = jobs.findIndex((candidate) => candidate.job_id === jobIdValue);
  if (idx < 0) {
    const err = new Error('Analyzer job not found.');
    err.status = 404;
    throw err;
  }
  let job = jobs[idx];
  try {
    job = Object.assign({}, job, { status: 'analyzing', updated_at: nowIso(), error: '' });
    const lead = job.input_type === 'selected_lead' ? findLead(job.lead_id) : null;
    let quality;
    if (lead) {
      quality = addressQuality(lead);
    } else if (job.input_type === 'property_link') {
      quality = { status: 'partial', label: 'Needs Address Review', normalized_address: '', message: 'Add the property address to analyze this link.' };
    } else {
      quality = addressQuality(job.input_value);
    }
    const normalized = quality.normalized_address || (lead ? fullLeadAddress(lead) : '');
    const sourceEvidence = collectSourceEvidence(lead, job);
    const compEvidence = collectCompEvidence(lead);
    const valuation = valuationFromComps(compEvidence, lead);
    const status = statusForEvidence(quality, sourceEvidence, compEvidence);
    const missing = missingEvidenceFor(quality, sourceEvidence, compEvidence, valuation);
    job = Object.assign({}, job, {
      updated_at: nowIso(),
      status,
      normalized_address: normalized,
      source_evidence: sourceEvidence,
      comp_evidence: compEvidence,
      missing_evidence: missing,
      result_summary: resultSummary(status, quality, sourceEvidence, compEvidence, valuation),
      next_best_action: nextAction(status, missing, sourceEvidence),
      valuation_locked: valuation.valuation_locked,
      arv_range: valuation.arv_range,
      mao_range: valuation.mao_range,
      error: ''
    });
    job = applyCompResearchState(job);
    jobs[idx] = job;
    writeJobs(jobs);
    return publicJob(job);
  } catch (error) {
    job = Object.assign({}, job, {
      updated_at: nowIso(),
      status: 'failed',
      error: error && error.message ? error.message : 'Analyzer job failed.',
      result_summary: 'Analyzer job failed before evidence could be reviewed.',
      next_best_action: 'Review failed job',
      valuation_locked: true,
      arv_range: null,
      mao_range: null
    });
    jobs[idx] = job;
    writeJobs(jobs);
    return publicJob(job);
  }
}

async function runCompResearchForJob(jobIdValue, options) {
  let job = getJob(jobIdValue);
  if (!job) {
    const err = new Error('Analyzer job not found.');
    err.status = 404;
    throw err;
  }
  if (job.status === 'queued' || !Array.isArray(job.source_evidence) || !job.source_evidence.length) {
    runJob(jobIdValue);
  }
  const jobs = readJobs();
  const idx = jobs.findIndex((candidate) => candidate.job_id === jobIdValue);
  if (idx < 0) {
    const err = new Error('Analyzer job not found.');
    err.status = 404;
    throw err;
  }
  job = await applyCompResearchState(jobs[idx], Object.assign({}, options || {}, { executeProvider: true }));
  job.updated_at = nowIso();
  jobs[idx] = job;
  writeJobs(jobs);
  return publicJob(job);
}

function getCompCandidates(jobIdValue) {
  const job = getJob(jobIdValue);
  if (!job) {
    const err = new Error('Analyzer job not found.');
    err.status = 404;
    throw err;
  }
  return Array.isArray(job.comp_candidates) ? job.comp_candidates : [];
}

function getCompResearchConfig() {
  const providers = compResearchProvider.getConfiguredCompProviders();
  const implemented = providers.some((provider) => provider.implemented === true);
  return {
    provider_status: providers.length ? 'ready_to_research' : 'not_configured',
    configured: providers.length > 0,
    providers: providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled === true,
      implemented: provider.implemented === true,
      model: provider.model || ''
    })),
    message: providers.length
      ? implemented
        ? 'Comp research provider is configured.'
        : 'Comp research provider is configured but not implemented yet.'
      : 'Comp provider not configured yet.'
  };
}

module.exports = {
  JOB_STATUSES,
  MAX_BATCH_SIZE,
  FUTURE_ADAPTERS,
  createJobs,
  listJobs,
  getJob,
  runJob,
  runCompResearchForJob,
  getCompCandidates,
  getCompResearchConfig,
  addressQuality,
  classifyInput
};
