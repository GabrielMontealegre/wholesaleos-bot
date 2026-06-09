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
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, JOB_STORE_FILE);
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {}
    const err = new Error('Analyzer job store could not be updated.');
    err.status = 500;
    err.error_category = 'storage_error';
    throw err;
  }
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
    city_candidate: pack.city_candidate,
    state_candidate: pack.state_candidate,
    zip_candidate: pack.zip_candidate,
    source_url_address_candidate: pack.source_url_address_candidate,
    address_extracted_from_source_url: pack.address_extracted_from_source_url,
    property_identity_basis: pack.property_identity_basis,
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

function collectCompEvidence(lead, subjectAddress) {
  if (!lead) {
    return { verified_sold_comps: [], subject_sale_evidence: [] };
  }
  const subjectKey = compResearchProvider.addressConflictKey
    ? compResearchProvider.addressConflictKey(subjectAddress)
    : (compResearchProvider.normalizeAddressKey ? compResearchProvider.normalizeAddressKey(subjectAddress) : '');
  const containers = [
    lead.verified_comps,
    lead.comps,
    lead.manual_comps,
    lead.research_comps,
    lead.comp_evidence
  ].filter(Array.isArray);
  const verifiedSoldComps = [];
  const subjectSaleEvidence = [];
  containers.forEach((list) => {
    list.forEach((comp) => {
      const addressKey = compResearchProvider.addressConflictKey
        ? compResearchProvider.addressConflictKey(compAddress(comp))
        : (compResearchProvider.normalizeAddressKey ? compResearchProvider.normalizeAddressKey(compAddress(comp)) : cleanText(compAddress(comp)).toLowerCase());
      const isSubject = !!(subjectKey && addressKey && addressKey === subjectKey);
      if (isSubject) {
        subjectSaleEvidence.push({
          type: 'subject_sale_evidence',
          address: compAddress(comp),
          sold_price: compPrice(comp),
          sold_date: compSoldDate(comp),
          beds: pick(comp, ['beds', 'bedrooms']) || null,
          baths: pick(comp, ['baths', 'bathrooms']) || null,
          sqft: pick(comp, ['sqft', 'square_feet']) || null,
          distance: pick(comp, ['distance', 'distance_miles']) || null,
          source_url: compSourceUrl(comp),
          source_title: cleanText(pick(comp, ['source_title', 'title'])),
          source_type: cleanText(pick(comp, ['source_type', 'record_type', 'source_kind'])),
          verification_status: 'subject_sale_evidence',
          comp_classification: 'Subject Sale Evidence',
          comp_group: 'subject_sale_evidence',
          notes: ['This is the subject property\'s own sale/listing evidence, not a comparable sale.']
        });
        return;
      }
      if (!isVerifiedSoldComp(comp)) return;
      verifiedSoldComps.push({
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
  return {
    verified_sold_comps: verifiedSoldComps.slice(0, 20),
    subject_sale_evidence: subjectSaleEvidence.slice(0, 20)
  };
}

function mergeCompResearchState(job, state) {
  state = state || {};
  const verifiedSoldComps = Array.isArray(state.verified_sold_comps) ? state.verified_sold_comps : [];
  const candidateSoldComps = Array.isArray(state.candidate_sold_comps) ? state.candidate_sold_comps : [];
  const marketSupport = Array.isArray(state.market_support) ? state.market_support : [];
  const notUsable = Array.isArray(state.not_usable_comp_results) ? state.not_usable_comp_results : [];
  const subjectSaleEvidence = Array.isArray(state.subject_sale_evidence)
    ? state.subject_sale_evidence
    : Array.isArray(job && job.subject_sale_evidence)
      ? job.subject_sale_evidence
      : [];
  const providerArv = state.arv_range || null;
  const providerMao = state.mao_range || null;
  return Object.assign({}, job, {
    comp_research_status: state.provider_status,
    comp_research_provider: state.provider,
    comp_research_provider_label: state.provider_label || job.comp_research_provider_label,
    comp_candidates: state.candidates,
    verified_sold_comps: verifiedSoldComps,
    subject_sale_evidence: subjectSaleEvidence,
    candidate_sold_comps: candidateSoldComps,
    market_support: marketSupport,
    not_usable_comp_results: notUsable,
    verified_comp_count: Math.max(
      Array.isArray(job && job.comp_evidence) ? job.comp_evidence.length : 0,
      state.verified_comp_count || 0
    ),
    subject_sale_evidence_count: state.subject_sale_evidence_count || subjectSaleEvidence.length,
    candidate_comp_count: state.candidate_comp_count || candidateSoldComps.length,
    market_support_count: state.market_support_count || marketSupport.length,
    not_usable_comp_count: state.not_usable_comp_count || notUsable.length,
    comp_missing_evidence: state.missing_evidence,
    comp_next_action: state.next_action,
    comp_research_property_evidence: state.property_evidence || [],
    comp_research_source_evidence: state.source_evidence || [],
    comp_research_warnings: state.warnings || [],
    comp_research_citations: state.citations || [],
    comp_research_summary: state.raw_summary || '',
    comp_research_started_at: cleanText(state.started_at || job.comp_research_started_at),
    comp_search_strategy: cleanText(state.comp_search_strategy),
    comp_missing_evidence_summary: cleanText(state.missing_evidence_summary),
    comp_provider_next_action: cleanText(state.provider_next_action),
    comp_research_error_category: cleanText(state.error_category || job.comp_research_error_category),
    comp_research_updated_at: state.updated_at,
    normalized_from_text: state.normalized_from_text === true,
    normalization_note: cleanText(state.normalization_note),
    valuation_locked: providerArv ? false : job.valuation_locked,
    arv_range: providerArv || job.arv_range || null,
    mao_range: providerMao || job.mao_range || null
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

function currentCompProviderInfo(env) {
  const providers = compResearchProvider.getConfiguredCompProviders(env);
  const provider = providers.find((candidate) => candidate && candidate.implemented === true) || providers[0] || null;
  return {
    provider,
    provider_id: provider ? cleanText(provider.id) : 'none',
    provider_label: provider ? cleanText(provider.label || provider.id) : 'Not configured'
  };
}

function compResearchErrorCategory(error) {
  const status = cleanText(error && error.provider_status);
  if (status && status !== 'failed') return status;
  if (status === 'failed') return 'provider_error';
  const message = cleanText(error && error.message ? error.message : '');
  if (/\b(high demand|try again later|temporarily unavailable|busy|overloaded)\b/i.test(message)) return 'temporarily_unavailable';
  if (/\b(timeout|timed out|aborted|abort)\b/i.test(message)) return 'timed_out';
  if (/\b(auth|unauthorized|forbidden|api key not valid|permission)\b/i.test(message)) return 'auth_error';
  if (/\b(quota|rate limit|too many requests|resource exhausted)\b/i.test(message)) return 'quota_or_rate_limited';
  return 'provider_error';
}

function normalizeResolvedCompResearchFailure(job, providerInfo, resolved, startedAt) {
  resolved = resolved || {};
  const category = compResearchErrorCategory({
    provider_status: cleanText(resolved.comp_research_status),
    message: cleanText(resolved.comp_next_action || (Array.isArray(resolved.comp_research_warnings) ? resolved.comp_research_warnings[0] : '') || '')
  });
  const nextAction = category === 'temporarily_unavailable' || category === 'quota_or_rate_limited'
    ? 'Gemini is temporarily unavailable/high demand. Try again later.'
    : category === 'timed_out'
      ? 'Comp research timed out. Try again later.'
      : category === 'auth_error'
        ? 'Gemini is configured but authentication or permission failed. Verify the Gemini API key and model access.'
        : 'Provider error. No valuation was generated.';
  return persistCompResearchJobState(job, {
    provider_status: category === 'provider_error' ? 'failed_cleanly' : category,
    provider: providerInfo && providerInfo.provider_id ? providerInfo.provider_id : cleanText(resolved.comp_research_provider) || 'none',
    provider_label: providerInfo && providerInfo.provider_label ? providerInfo.provider_label : cleanText(resolved.comp_research_provider_label) || 'Not configured',
    started_at: cleanText(startedAt || resolved.comp_research_started_at),
    error_category: category,
    candidates: [],
    message: nextAction,
    missing_fields: ['Public research result'],
    warnings: Array.isArray(resolved.comp_research_warnings) && resolved.comp_research_warnings.length
      ? resolved.comp_research_warnings
      : [cleanText(resolved.comp_next_action || 'Provider error.')],
    property_evidence: [],
    source_evidence: [],
    citations: [],
    raw_summary: '',
    normalized_from_text: false,
    normalization_note: '',
    comp_search_strategy: cleanText(resolved.comp_search_strategy),
    missing_evidence_summary: cleanText(resolved.comp_missing_evidence_summary),
    next_action: nextAction,
    arv_range: null,
    mao_range: null
  });
}

function persistCompResearchJobState(job, state) {
  const merged = mergeCompResearchState(job, state);
  merged.updated_at = nowIso();
  upsertJob(merged);
  return publicJob(merged);
}

function publicJob(job) {
  const sourcePack = sourcePackFromEvidence(job && job.source_evidence);
  return Object.assign({}, job, {
    future_adapters: Object.keys(FUTURE_ADAPTERS).reduce((acc, key) => {
      acc[key] = { enabled: FUTURE_ADAPTERS[key].enabled === true };
      return acc;
    }, {}),
    normalized_from_text: job.normalized_from_text === true,
    normalization_note: cleanText(job.normalization_note),
    source_evidence_summary: sourcePack ? {
      source_status: cleanText(sourcePack.source_status),
      source_url_type: cleanText(sourcePack.source_url_type),
      property_identity_status: cleanText(sourcePack.property_identity_status),
      address_candidate: cleanText(sourcePack.address_candidate),
      next_action: cleanText(sourcePack.next_action)
    } : null
  });
}

function validateCreateJobItem(item) {
  item = item || {};
  const inputType = classifyInput(item);
  const leadId = cleanText(item.lead_id || item.leadId || item.id || (item.lead && item.lead.id));
  const sourceUrlRaw = cleanText(item.source_url || item.sourceUrl || item.source_proof_url || item.sourceProofUrl);
  const inputValue = cleanText(
    item.input_value ||
    item.inputValue ||
    item.value ||
    item.url ||
    item.address ||
    ''
  );
  if (sourceUrlRaw && !isHttpUrl(sourceUrlRaw)) {
    const err = new Error('Source URL must be a valid public http(s) link.');
    err.status = 400;
    err.error_category = 'validation_error';
    throw err;
  }
  if (inputType === 'selected_lead' && !leadId && !(item.lead && item.lead.id)) {
    const err = new Error('Selected lead id is required.');
    err.status = 400;
    err.error_category = 'validation_error';
    throw err;
  }
  if (!inputValue && !sourceUrlRaw && inputType !== 'selected_lead') {
    const err = new Error('Address or property link is required.');
    err.status = 400;
    err.error_category = 'validation_error';
    throw err;
  }
}

function createJob(item) {
  item = item || {};
  validateCreateJobItem(item);
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
  const sourceUrl = isHttpUrl(item.source_url || item.sourceUrl || item.source_proof_url || item.sourceProofUrl)
    ? cleanText(item.source_url || item.sourceUrl || item.source_proof_url || item.sourceProofUrl)
    : '';
  const created = nowIso();
  const job = {
    job_id: jobId(),
    created_at: created,
    updated_at: created,
    status: 'queued',
    input_type: inputType,
    input_value: inputValue,
    normalized_address: '',
    lead_id: lead ? lead.id : leadId,
    lead_ref: cleanText(item.lead_ref || item.leadRef || (lead && (lead.ref_id || lead.reference_id || lead.ref || lead.id))),
    source_url: sourceUrl,
    source_type: cleanText(item.source_type || item.sourceType || item.lead_source_type || item.leadSourceType || item.source || ''),
    scout_context: item.scout_context && typeof item.scout_context === 'object' ? {
      scout_job_id: cleanText(item.scout_context.scout_job_id),
      scout_card_id: cleanText(item.scout_context.scout_card_id),
      source_kind: cleanText(item.scout_context.source_kind),
      original_ref: cleanText(item.scout_context.original_ref),
      source_type: cleanText(item.scout_context.source_type),
      source_url: cleanText(item.scout_context.source_url),
      source_url_original: cleanText(item.scout_context.source_url_original),
      canonical_source_url: cleanText(item.scout_context.canonical_source_url),
      source_url_canonicalized: item.scout_context.source_url_canonicalized === true,
      source_url_canonicalization_note: cleanText(item.scout_context.source_url_canonicalization_note),
      source_title: cleanText(item.scout_context.source_title),
      source_quality: cleanText(item.scout_context.source_quality),
      source_classification: cleanText(item.scout_context.source_classification),
      source_classification_label: cleanText(item.scout_context.source_classification_label),
      why_card_exists: cleanText(item.scout_context.why_card_exists),
      created_from_grounding_url: item.scout_context.created_from_grounding_url === true,
      address_extracted_from_source_url: item.scout_context.address_extracted_from_source_url === true,
      property_identity_status: cleanText(item.scout_context.property_identity_status),
      property_identity_label: cleanText(item.scout_context.property_identity_label),
      property_identity_basis: cleanText(item.scout_context.property_identity_basis),
      source_evidence_status: cleanText(item.scout_context.source_evidence_status),
      source_evidence_label: cleanText(item.scout_context.source_evidence_label),
      property_specific_source: item.scout_context.property_specific_source === true,
      market_match: cleanText(item.scout_context.market_match),
      market_match_basis: cleanText(item.scout_context.market_match_basis),
      strategy_tags: Array.isArray(item.scout_context.strategy_tags) ? item.scout_context.strategy_tags.map(cleanText).filter(Boolean) : [],
      provider: cleanText(item.scout_context.provider),
      provider_grounding_present: item.scout_context.provider_grounding_present === true,
      provider_source_urls: Array.isArray(item.scout_context.provider_source_urls) ? item.scout_context.provider_source_urls.map(cleanText).filter(isHttpUrl).slice(0, 20) : [],
      scout_status: cleanText(item.scout_context.scout_status),
      scout_reason: cleanText(item.scout_context.scout_reason),
      distress_signals: Array.isArray(item.scout_context.distress_signals) ? item.scout_context.distress_signals.map(cleanText).filter(Boolean) : [],
      missing_evidence: Array.isArray(item.scout_context.missing_evidence) ? item.scout_context.missing_evidence.map(cleanText).filter(Boolean) : [],
      call_angle: cleanText(item.scout_context.call_angle)
    } : null,
    source_evidence: [],
    comp_evidence: [],
    subject_sale_evidence: [],
    comp_research_status: 'not_configured',
    comp_research_provider: 'none',
    comp_research_provider_label: 'Not configured',
    comp_candidates: [],
    verified_sold_comps: [],
    subject_sale_evidence_count: 0,
    candidate_sold_comps: [],
    market_support: [],
    not_usable_comp_results: [],
    verified_comp_count: 0,
    candidate_comp_count: 0,
    market_support_count: 0,
    not_usable_comp_count: 0,
    comp_missing_evidence: ['3 verified sold comps'],
    comp_next_action: 'Comp provider not configured yet.',
    comp_research_property_evidence: [],
    comp_research_source_evidence: [],
    comp_research_warnings: [],
    comp_research_citations: [],
    comp_research_summary: '',
    comp_research_started_at: '',
    comp_search_strategy: '',
    comp_missing_evidence_summary: '',
    comp_provider_next_action: '',
    comp_research_error_category: '',
    comp_research_updated_at: '',
    normalized_from_text: false,
    normalization_note: '',
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
  const quality = lead
    ? addressQuality(lead)
    : inputType === 'property_link'
      ? { status: 'partial', label: 'Needs Address Review', normalized_address: '', message: 'Add the property address to analyze this link.' }
      : addressQuality(inputValue);
  job.normalized_address = cleanText(quality && quality.normalized_address);
  try {
    job.source_evidence = collectSourceEvidence(lead, job);
  } catch (_) {
    job.source_evidence = [];
  }
  const pack = sourcePackFromEvidence(job.source_evidence);
  if (pack && cleanText(pack.next_action)) {
    job.result_summary = cleanText(pack.next_action);
    job.next_best_action = cleanText(pack.next_action);
  } else if (quality && cleanText(quality.message)) {
    job.result_summary = cleanText(quality.message);
    job.next_best_action = cleanText(quality.message);
  }
  return job;
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
    const compCollection = collectCompEvidence(lead, normalized || fullLeadAddress(lead) || leadAddress(lead) || job.input_value);
    const compEvidence = compCollection.verified_sold_comps;
    const subjectSaleEvidence = compCollection.subject_sale_evidence;
    const valuation = valuationFromComps(compEvidence, lead);
    const status = statusForEvidence(quality, sourceEvidence, compEvidence);
    const missing = missingEvidenceFor(quality, sourceEvidence, compEvidence, valuation);
    if (compEvidence.length === 0 && subjectSaleEvidence.length) {
      missing.push('Subject property sale evidence excluded from verified comp count');
    }
    job = Object.assign({}, job, {
      updated_at: nowIso(),
      status,
      normalized_address: normalized,
      source_evidence: sourceEvidence,
      comp_evidence: compEvidence,
      subject_sale_evidence: subjectSaleEvidence,
      subject_sale_evidence_count: subjectSaleEvidence.length,
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
  options = options || {};
  let job = getJob(jobIdValue);
  if (!job) {
    const err = new Error('Analyzer job not found.');
    err.status = 404;
    throw err;
  }
  if (job.status === 'queued' || !Array.isArray(job.source_evidence) || !job.source_evidence.length) {
    job = runJob(jobIdValue);
  }
  job = getJob(jobIdValue) || job;
  const providerInfo = currentCompProviderInfo(options.env);
  const validation = compResearchProvider.validateCompResearchInput(job);
  if (!validation.ok) {
    return persistCompResearchJobState(job, {
      provider_status: cleanText(validation.provider_status) || 'failed_cleanly',
      provider: providerInfo.provider_id,
      provider_label: providerInfo.provider_label,
      error_category: cleanText(validation.provider_status) || 'failed_cleanly',
      candidates: Array.isArray(job.comp_candidates) ? job.comp_candidates : [],
      message: cleanText(validation.message),
      missing_fields: Array.isArray(validation.missing_fields) ? validation.missing_fields : [],
      warnings: [],
      property_evidence: Array.isArray(job.comp_research_property_evidence) ? job.comp_research_property_evidence : [],
      source_evidence: Array.isArray(job.comp_research_source_evidence) ? job.comp_research_source_evidence : []
    });
  }
  if (!providerInfo.provider) {
    return persistCompResearchJobState(job, {
      provider_status: 'provider_not_configured',
      provider: 'none',
      provider_label: 'Not configured',
      error_category: 'provider_not_configured',
      candidates: Array.isArray(job.comp_candidates) ? job.comp_candidates : [],
      message: 'Comp provider not configured yet.',
      missing_fields: ['Configured comp research provider']
    });
  }
  const startedAt = nowIso();
  job = Object.assign({}, job, {
    comp_research_status: 'researching',
    comp_research_provider: providerInfo.provider_id,
    comp_research_provider_label: providerInfo.provider_label,
    comp_research_started_at: startedAt,
    comp_research_error_category: '',
    comp_next_action: 'Comp research is running.',
    comp_research_updated_at: startedAt,
    updated_at: startedAt
  });
  upsertJob(job);
  try {
    const resolved = await applyCompResearchState(job, Object.assign({}, options, {
      executeProvider: true,
      timeoutMs: options.timeoutMs || options.timeout_ms || 25000
    }));
    if (resolved && (resolved.comp_research_status === 'failed' || resolved.comp_research_status === 'provider_error' || resolved.comp_research_status === 'failed_cleanly')) {
      return normalizeResolvedCompResearchFailure(job, providerInfo, resolved, startedAt);
    }
    resolved.comp_research_started_at = startedAt;
    resolved.comp_research_error_category = cleanText(
      resolved.comp_research_status === 'temporarily_unavailable' ||
      resolved.comp_research_status === 'provider_temporarily_unavailable' ||
      resolved.comp_research_status === 'timed_out' ||
      resolved.comp_research_status === 'auth_error' ||
      resolved.comp_research_status === 'quota_or_rate_limited'
        ? resolved.comp_research_status
        : ''
    );
    resolved.comp_research_updated_at = nowIso();
    resolved.updated_at = resolved.comp_research_updated_at;
    upsertJob(resolved);
    return publicJob(resolved);
  } catch (error) {
    const category = compResearchErrorCategory(error);
    return persistCompResearchJobState(job, {
      provider_status: category === 'provider_error' ? 'failed_cleanly' : category,
      provider: providerInfo.provider_id,
      provider_label: providerInfo.provider_label,
      error_category: category,
      candidates: [],
      message: category === 'temporarily_unavailable' || category === 'quota_or_rate_limited'
        ? 'Gemini is temporarily unavailable/high demand. Try again later.'
        : category === 'timed_out'
          ? 'Comp research timed out. Try again later.'
          : category === 'auth_error'
            ? 'Gemini is configured but authentication or permission failed. Verify the Gemini API key and model access.'
            : 'Provider error. No valuation was generated.',
      missing_fields: ['Public research result'],
      warnings: [cleanText(error && (error.provider_raw_message || error.message) ? (error.provider_raw_message || error.message) : 'Provider error.')],
      property_evidence: Array.isArray(job.comp_research_property_evidence) ? job.comp_research_property_evidence : [],
      source_evidence: Array.isArray(job.comp_research_source_evidence) ? job.comp_research_source_evidence : []
    });
  }
}

function getCompCandidates(jobIdValue) {
  const job = getJob(jobIdValue);
  if (!job) {
    const err = new Error('Analyzer job not found.');
    err.status = 404;
    throw err;
  }
  return {
    candidates: Array.isArray(job.comp_candidates) ? job.comp_candidates : [],
    verified_sold_comps: Array.isArray(job.verified_sold_comps) ? job.verified_sold_comps : [],
    subject_sale_evidence: Array.isArray(job.subject_sale_evidence) ? job.subject_sale_evidence : [],
    candidate_sold_comps: Array.isArray(job.candidate_sold_comps) ? job.candidate_sold_comps : [],
    market_support: Array.isArray(job.market_support) ? job.market_support : [],
    not_usable_comp_results: Array.isArray(job.not_usable_comp_results) ? job.not_usable_comp_results : [],
    verified_comp_count: Number(job.verified_comp_count || 0) || 0,
    subject_sale_evidence_count: Number(job.subject_sale_evidence_count || 0) || 0,
    candidate_comp_count: Number(job.candidate_comp_count || 0) || 0,
    market_support_count: Number(job.market_support_count || 0) || 0,
    not_usable_comp_count: Number(job.not_usable_comp_count || 0) || 0,
    valuation_locked: job.valuation_locked !== false,
    arv_range: job.arv_range || null,
    mao_range: job.mao_range || null
  };
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
