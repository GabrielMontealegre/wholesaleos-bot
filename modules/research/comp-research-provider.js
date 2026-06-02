'use strict';

const crypto = require('crypto');
const researchProviderRouter = require('./free-research-provider-router');

const PROVIDER_STATUSES = new Set([
  'not_configured',
  'blocked_needs_address',
  'blocked_needs_source_evidence',
  'ready_to_research',
  'researching',
  'candidates_found',
  'no_candidates_found',
  'failed'
]);

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function envEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function numberValue(value) {
  const n = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
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

function candidateId() {
  if (crypto.randomUUID) return `compcand_${crypto.randomUUID()}`;
  return `compcand_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getConfiguredCompProviders(env) {
  env = env || process.env;
  return researchProviderRouter.getConfiguredResearchProviders(env).map((provider) => ({
    id: provider.id,
    label: provider.label,
    enabled: provider.enabled === true,
    implemented: provider.implemented === true,
    source: provider.source || '',
    model: provider.model || ''
  }));
}

function providerLabel(id) {
  return ({
    gemini_web_research: 'Gemini',
    groq_research: 'Groq',
    openrouter_research: 'OpenRouter',
    openai_web_research: 'OpenAI',
    deterministic_fallback: 'Fallback',
    attom: 'ATTOM',
    batchdata: 'BatchData',
    propstream: 'PropStream',
    datatree: 'DataTree'
  })[String(id || '').toLowerCase()] || cleanText(id || 'Comp provider');
}

function isCompResearchConfigured(options) {
  return getConfiguredCompProviders(options && options.env).length > 0;
}

function sourcePackFromJob(job) {
  const sourceEvidence = Array.isArray(job && job.source_evidence) ? job.source_evidence : [];
  return sourceEvidence.find((item) => item && item.type === 'source_evidence_pack') || null;
}

function hasUsableAddress(job, pack) {
  const address = cleanText((job && job.normalized_address) || (pack && pack.address_candidate) || '');
  if (!address) return false;
  if (/\b(public information request|phone directory|page not found|contact us|contact|search results|court calendar)\b/i.test(address)) return false;
  return /\b\d{1,7}\b/.test(address) &&
    /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop|sq|square)\b/i.test(address);
}

function buildCompResearchRequest(job) {
  job = job || {};
  const pack = sourcePackFromJob(job);
  return {
    subject_job_id: job.job_id || '',
    input_type: job.input_type || '',
    input_value: job.input_value || '',
    normalized_address: cleanText(job.normalized_address || (pack && pack.address_candidate) || ''),
    source_url: cleanText((pack && pack.source_url) || ''),
    source_url_type: cleanText((pack && pack.source_url_type) || ''),
    property_identity_status: cleanText((pack && pack.property_identity_status) || ''),
    source_evidence_role: cleanText((pack && pack.evidence_role) || ''),
    source_status: cleanText((pack && pack.source_status) || ''),
    lead_id: cleanText(job.lead_id || ''),
    lead_ref: cleanText(job.lead_ref || '')
  };
}

function validateCompResearchInput(job) {
  const request = buildCompResearchRequest(job);
  const pack = sourcePackFromJob(job);
  const identityStatus = request.property_identity_status;
  if (!hasUsableAddress(job, pack) || identityStatus === 'junk_address_blocked' || identityStatus === 'needs_source_repair') {
    return {
      ok: false,
      provider_status: 'blocked_needs_address',
      message: request.source_url
        ? 'Source may be useful, but property identity must be repaired before comp research.'
        : 'Repair property identity before comps.',
      missing_fields: ['Usable property address']
    };
  }
  if (!request.source_url || identityStatus === 'unresolved' || !request.source_evidence_role || request.source_evidence_role !== 'source_proof') {
    return {
      ok: false,
      provider_status: 'blocked_needs_source_evidence',
      message: request.source_url
        ? 'Source repair needed before comps.'
        : 'Needs source/property evidence before comp research.',
      missing_fields: ['Source/property evidence']
    };
  }
  return {
    ok: true,
    provider_status: 'ready_to_research',
    message: 'Ready to research comps when a provider is configured.',
    missing_fields: []
  };
}

function normalizeCompCandidate(rawCandidate, provider) {
  rawCandidate = rawCandidate || {};
  provider = provider || {};
  const candidate = {
    candidate_id: cleanText(rawCandidate.candidate_id) || candidateId(),
    provider: cleanText(rawCandidate.provider || provider.id || provider.label || 'unknown'),
    subject_job_id: cleanText(rawCandidate.subject_job_id || rawCandidate.job_id),
    comp_address: cleanText(pick(rawCandidate, ['comp_address', 'address', 'property_address'])),
    sold_status: cleanText(pick(rawCandidate, ['sold_status', 'status', 'sale_status'])).toLowerCase(),
    sold_price: numberValue(pick(rawCandidate, ['sold_price', 'sale_price', 'price', 'closed_price'])),
    sold_date: cleanText(pick(rawCandidate, ['sold_date', 'sale_date', 'closed_date', 'date'])),
    beds: pick(rawCandidate, ['beds', 'bedrooms']) || null,
    baths: pick(rawCandidate, ['baths', 'bathrooms']) || null,
    sqft: pick(rawCandidate, ['sqft', 'square_feet']) || null,
    distance_miles: pick(rawCandidate, ['distance_miles', 'distance']) || null,
    source_url: cleanText(pick(rawCandidate, ['source_url', 'url', 'record_url'])),
    source_label: cleanText(rawCandidate.source_label || rawCandidate.source || provider.label || ''),
    confidence: numberValue(rawCandidate.confidence),
    verification_status: cleanText(rawCandidate.verification_status || 'candidate').toLowerCase(),
    missing_fields: [],
    notes: Array.isArray(rawCandidate.notes) ? rawCandidate.notes.map(cleanText).filter(Boolean) : [],
    created_at: cleanText(rawCandidate.created_at) || new Date().toISOString()
  };
  const validation = validateVerifiedCompCandidate(candidate);
  candidate.missing_fields = validation.missing_fields;
  if (candidate.verification_status === 'verified' && !validation.verified) {
    candidate.verification_status = 'candidate';
    candidate.notes.push('Candidate does not meet verified sold comp requirements yet.');
  }
  return candidate;
}

function validateVerifiedCompCandidate(candidate) {
  candidate = candidate || {};
  const missing = [];
  if (!cleanText(candidate.comp_address)) missing.push('Comp address');
  if (cleanText(candidate.sold_status).toLowerCase() !== 'sold') missing.push('Sold status');
  if (!(numberValue(candidate.sold_price) > 0)) missing.push('Sold price');
  if (!cleanText(candidate.sold_date)) missing.push('Sold date');
  if (!isHttpUrl(candidate.source_url)) missing.push('Source URL');
  return {
    verified: missing.length === 0,
    missing_fields: missing
  };
}

function verifiedCompCount(candidates) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    return cleanText(candidate.verification_status).toLowerCase() === 'verified' &&
      validateVerifiedCompCandidate(candidate).verified;
  }).length;
}

function runCompResearch(job, options) {
  options = options || {};
  const validation = validateCompResearchInput(job);
  const providers = getConfiguredCompProviders(options.env);
  const existingCandidates = Array.isArray(job && job.comp_candidates) ? job.comp_candidates : [];
  if (!validation.ok) {
    return summarizeCompResearchState(job, {
      provider_status: validation.provider_status,
      provider: '',
      candidates: existingCandidates,
      message: validation.message,
      missing_fields: validation.missing_fields
    });
  }
  if (!providers.length) {
    return summarizeCompResearchState(job, {
      provider_status: 'not_configured',
      provider: 'none',
      candidates: existingCandidates,
      message: 'Comp provider not configured yet.',
      missing_fields: ['Configured comp research provider']
    });
  }
  const provider = providers[0];
  if (provider.implemented) {
    if (!options.executeProvider) {
      return summarizeCompResearchState(job, {
        provider_status: 'ready_to_research',
        provider: provider.id,
        candidates: existingCandidates,
        message: `${provider.label} research is ready. Click Research Comps to gather public evidence.`,
        missing_fields: []
      });
    }
    return researchProviderRouter.runResearchProvider(job, options)
      .then((result) => summarizeRouterResearchState(job, provider, result))
      .catch((error) => summarizeCompResearchState(job, {
        provider_status: 'failed',
        provider: provider.id,
        candidates: existingCandidates,
        message: 'Comp research needs review.',
        missing_fields: ['Public research result'],
        warnings: [error && error.message ? error.message : 'Public research failed.']
      }));
  }
  return summarizeCompResearchState(job, {
    provider_status: 'ready_to_research',
    provider: provider.id,
    candidates: existingCandidates,
    message: 'Comp research provider is configured but not implemented yet.',
    missing_fields: []
  });
}

function researchResultMessage(result) {
  result = result || {};
  if (result.status === 'failed') return 'Comp research needs review.';
  if (Array.isArray(result.comp_candidates) && result.comp_candidates.length) return 'Candidate comps found - review evidence.';
  return 'Not enough public comp evidence found.';
}

function summarizeRouterResearchState(job, provider, result) {
  result = result || {};
  const hasCandidates = Array.isArray(result.comp_candidates) && result.comp_candidates.length > 0;
  const status = result.status === 'failed'
    ? 'failed'
    : hasCandidates
      ? 'candidates_found'
      : 'no_candidates_found';
  return summarizeCompResearchState(job, {
    provider_status: status,
    provider: provider.id,
    candidates: result.comp_candidates || [],
    message: researchResultMessage(result),
    missing_fields: result.missing_evidence || [],
    property_evidence: result.property_evidence || [],
    source_evidence: result.source_evidence || [],
    warnings: result.warnings || [],
    citations: result.citations || [],
    raw_summary: result.raw_summary || ''
  });
}

function summarizeCompResearchState(job, result) {
  result = result || {};
  const candidates = (Array.isArray(result.candidates) ? result.candidates : [])
    .map((candidate) => normalizeCompCandidate(candidate, { id: result.provider || 'unknown' }));
  const status = PROVIDER_STATUSES.has(result.provider_status) ? result.provider_status : 'failed';
  const verifiedCount = verifiedCompCount(candidates);
  const missing = Array.isArray(result.missing_fields) ? result.missing_fields.slice() : [];
  if (verifiedCount < 3 && missing.indexOf('3 verified sold comps') === -1) missing.push('3 verified sold comps');
  return {
    provider_status: status,
    provider: cleanText(result.provider || 'none'),
    provider_label: result.provider && result.provider !== 'none' ? providerLabel(result.provider) : 'Not configured',
    candidates,
    verified_comp_count: verifiedCount,
    missing_evidence: missing,
    next_action: cleanText(result.message) || 'Comp research needs review.',
    property_evidence: Array.isArray(result.property_evidence) ? result.property_evidence : [],
    source_evidence: Array.isArray(result.source_evidence) ? result.source_evidence : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.map(cleanText).filter(Boolean) : [],
    citations: Array.isArray(result.citations) ? result.citations : [],
    raw_summary: cleanText(result.raw_summary),
    updated_at: new Date().toISOString()
  };
}

module.exports = {
  PROVIDER_STATUSES,
  getConfiguredCompProviders,
  isCompResearchConfigured,
  buildCompResearchRequest,
  validateCompResearchInput,
  runCompResearch,
  normalizeCompCandidate,
  validateVerifiedCompCandidate,
  summarizeCompResearchState
};
