'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const db = require('../../db');
const aiDealAnalyzerJobs = require('./ai-deal-analyzer-jobs');
const geminiScoutDiscoveryProvider = require('./gemini-scout-discovery-provider');
const searchProviderWorker = require('./search-provider-worker');
const sourceQualityAuditor = require('./source-quality-auditor');
const manualReviewQueue = require('./manual-review-queue');
const dallasOfficialSourceCapture = require('../sources/dallas-official-source-capture');
const leadEvidence = require('./lead-evidence');
const propertyIdentity = require('./property-identity');
const sourceEvidenceAdapter = require('./source-evidence-adapter');

const DB_PATH = process.env.DB_PATH || './data/db.json';
const DB_FILE = path.resolve(DB_PATH);
const STORE_FILE = path.resolve(
  process.env.FINDME_SCOUT_JOBS_PATH ||
  path.join(path.dirname(DB_FILE), 'findme-scout-jobs.json')
);
const DEAL_CALL_DOSSIERS_FILE = path.resolve(
  process.env.DEAL_CALL_DOSSIERS_PATH ||
  path.join(path.dirname(DB_FILE), 'deal-call-dossiers.json')
);

const MAX_JOBS = 100;
const MAX_BATCH_SIZE = 50;
const FRESH_BATCH_QUANTITIES = new Set([5, 10, 20, 30, 50]);
const FRESH_BATCH_DEFAULT_BOUNDS = {
  max_provider_calls: 3,
  max_candidate_urls: 80,
  max_source_verifications: 40,
  provider_timeout_ms: 45000,
  hard_timeout_ms: 180000
};
const STATUSES = new Set([
  'New',
  'Call Today',
  'Called',
  'Interested',
  'Follow-Up',
  'Offer Later',
  'Dead',
  'Sent to Analyzer'
]);

const STRATEGY_LABELS = {
  fixer: 'ugly/as-is/fixer',
  ugly: 'ugly/as-is/fixer',
  as_is: 'ugly/as-is/fixer',
  pre_foreclosure: 'pre-foreclosure',
  foreclosure_notice: 'foreclosure/trustee notice',
  trustee_notice: 'foreclosure/trustee notice',
  tax_foreclosure: 'tax foreclosure/tax sale',
  tax_sale: 'tax foreclosure/tax sale',
  tax_delinquent: 'tax delinquent/tax lien',
  tax_lien: 'tax delinquent/tax lien',
  price_cut: 'price cut',
  long_dom: 'long DOM / stale listing',
  stale_listing: 'long DOM / stale listing',
  code_violation: 'code violation',
  auction_soon: 'auction soon',
  auction_public: 'auction/public auction listings',
  public_auction: 'auction/public auction listings',
  investor_special: 'investor special',
  cash_only: 'cash only',
  fsbo: 'FSBO',
  failed_listing: 'failed listing / relisted',
  relisted: 'failed listing / relisted',
  back_on_market: 'back on market',
  bank_owned: 'bank-owned / REO',
  reo: 'bank-owned / REO',
  vacant_absentee: 'vacant/absentee if evidence exists',
  vacant: 'vacant/absentee if evidence exists',
  absentee: 'vacant/absentee if evidence exists'
};

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function safeLower(value) {
  return cleanText(value).toLowerCase();
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
    if (cursor !== undefined && cursor !== null && cleanText(cursor)) return cursor;
  }
  return '';
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function sourceDomain(value) {
  try {
    return new URL(cleanText(value)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (error) {
    return '';
  }
}

function isRejectedVisibleSource(record, sourceUrl) {
  const domain = sourceDomain(sourceUrl);
  const broadText = `${recordText(record)} ${cleanText(sourceUrl)}`.toLowerCase();
  const signalText = `${exclusionSignalText(record)} ${cleanText(sourceUrl)}`.toLowerCase();
  if (!isHttpUrl(sourceUrl)) return true;
  if (/foreclosure\.com$/i.test(domain)) return true;
  if (/(dallasopendata|opendata|socrata|arcgis)\b/i.test(broadText)) return true;
  if (/\b(archive|archived|dataset|about this dataset|open data|data portal)\b/i.test(broadText)) return true;
  if (/\b(code violation|code compliance|violations dataset|public records dataset)\b/i.test(signalText)) return true;
  if (/\b(bank owned|bank-owned|reo|real estate owned)\b/i.test(signalText)) return true;
  return false;
}

function hasCurrentListingPortalSource(sourceUrl) {
  const domain = sourceDomain(sourceUrl);
  return /(redfin|realtor|zillow|har|fsbo|homes)\.com$/i.test(domain) && isPropertySpecificSourceUrl(sourceUrl);
}

function hasAllowedPropertySpecificSource(record, sourceUrl) {
  if (!isHttpUrl(sourceUrl) || isGenericSourceUrl(sourceUrl) || isRejectedVisibleSource(record, sourceUrl)) return false;
  if (hasCurrentListingPortalSource(sourceUrl)) return true;
  if (isPropertySpecificSourceUrl(sourceUrl)) {
    const domain = sourceDomain(sourceUrl);
    if (/(auction|realauction|hubzu)\.com$/i.test(domain)) return true;
    if (/\.gov$|county|clerk|sheriff|tax/i.test(domain)) return true;
  }
  return false;
}

function visibleDealFinderGate(record, card, sourceUrl, signals) {
  const address = cleanText(card && (card.address_or_source_text || card.display_address));
  const source = cleanText(sourceUrl || card && (card.open_source_url || card.source_url || card.canonical_source_url));
  const sourceOk = hasAllowedPropertySpecificSource(record, source);
  const addressOk = addressQualityFromText(address, recordText(record)) === 'valid';
  const criteriaOk = hasSourceBackedWholesaleCriterion(record, card, signals);
  const currentOk = isCurrentAcquisitionOpportunity(record, card);
  return {
    ok: sourceOk && addressOk && criteriaOk && currentOk,
    sourceOk,
    addressOk,
    criteriaOk,
    currentOk
  };
}

function criterionEvidenceText(record, card) {
  const pieces = [
    pick(record, ['description', 'listing_description', 'property_description', 'public_remarks', 'remarks', 'source_text', 'source_excerpt', 'source_snippet', 'evidence_snippet', 'why_included', 'comp_research_summary', 'raw_summary']),
    pick(record, ['source_details.description', 'source_details.remarks', 'source_details.source_text']),
    pick(record, ['scout_context.scout_reason', 'scout_context.why_card_exists']),
    card && card.signal_summary,
    card && card.why_it_matters,
    card && card.why_this_might_be_a_deal
  ];
  return pieces.map(cleanText).filter(Boolean).join(' ').toLowerCase();
}

function hasSourceBackedWholesaleCriterion(record, card, signals) {
  if (!Array.isArray(signals) || !signals.length) return false;
  const text = criterionEvidenceText(record, card);
  if (!text) return false;
  if (/source evidence exists|verified sold comps are still needed|public source result|gemini returned a source url/i.test(text) &&
      !/\b(as.?is|as is sale|fixer|needs\s+(tlc|work|repair)|investor special|investor opportunity|cash only|price (cut|reduced|drop|reduction)|long dom|days on market|back on market|relisted|fsbo|for sale by owner|pre.?foreclos|code violation|tax delinquent)\b/i.test(text)) {
    return false;
  }
  return /\b(as.?is|as is sale|fixer|needs\s+(tlc|work|repair)|rehab|investor special|investor opportunity|cash only|price (cut|reduced|drop|reduction)|long dom|days on market|back on market|relisted|fsbo|for sale by owner|pre.?foreclos|notice of default|code violation|tax delinquent)\b/i.test(text);
}

function isCurrentAcquisitionOpportunity(record, card) {
  const text = [recordText(record), criterionEvidenceText(record, card)].join(' ');
  const statusText = text.replace(/\b(verified sold comps?|candidate sold comps?|sold comps?)\b/ig, ' ');
  const hasSoldOrClosed = /\b(sold|closed|off.?market|auction ended|sale completed)\b/i.test(statusText);
  const hasCurrentSignal = /\b(active|for sale|listed|pending|contingent|back on market|relisted|price reduced|price cut)\b/i.test(statusText);
  if (hasSoldOrClosed && !hasCurrentSignal) return false;
  return true;
}

function isGenericSourceUrl(value) {
  const text = cleanText(value);
  if (!isHttpUrl(text)) return false;
  try {
    const parsed = new URL(text);
    const pathText = decodeURIComponent(parsed.pathname || '').toLowerCase();
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (/google\./i.test(host)) return true;
    if (/\/(search|results|category|for-sale|homes-for-sale|foreclosure-bank-owned-auctions|county|departments|government)\b/i.test(pathText)) return true;
    if (/\/(foreclosures|sheriff-sales|tax|recording)\.php$/i.test(pathText)) return true;
    return false;
  } catch (error) {
    return false;
  }
}

function isPropertySpecificSourceUrl(value) {
  const text = cleanText(value);
  if (!isHttpUrl(text) || isGenericSourceUrl(text)) return false;
  try {
    const parsed = new URL(text);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const pathText = decodeURIComponent(parsed.pathname || '');
    if (/realtor\.com$/i.test(host) && /\/realestateandhomes-detail\//i.test(pathText)) return true;
    if (/redfin\.com$/i.test(host) && /\/home\/\d+/i.test(pathText)) return true;
    if (/zillow\.com$/i.test(host) && /\/homedetails\//i.test(pathText)) return true;
    if (/har\.com$/i.test(host) && /\/homedetail\//i.test(pathText)) return true;
    if (/auction\.com$|realauction\.com$|hubzu\.com$/i.test(host) && /\/(details|detail|property|auction)\//i.test(pathText)) return true;
    return /\b\d{2,7}\b/.test(pathText) && /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b/i.test(pathText);
  } catch (error) {
    return false;
  }
}

function storeDir(filePath = STORE_FILE) {
  return path.dirname(filePath);
}

function ensureStoreDir(filePath = STORE_FILE) {
  fs.mkdirSync(storeDir(filePath), { recursive: true });
}

function atomicWriteJson(filePath, payload) {
  ensureStoreDir(filePath);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, filePath);
}

function safeParseStore(filePath = STORE_FILE) {
  ensureStoreDir(filePath);
  if (!fs.existsSync(filePath)) return { version: 1, updated_at: null, jobs: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: 1,
      updated_at: parsed && parsed.updated_at || null,
      jobs: Array.isArray(parsed && parsed.jobs) ? parsed.jobs : []
    };
  } catch (error) {
    return { version: 1, updated_at: null, jobs: [] };
  }
}

function normalizeJobs(jobs) {
  const seen = new Set();
  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => job && job.job_id && !seen.has(job.job_id) && seen.add(job.job_id))
    .sort((a, b) => cleanText(b.updated_at || b.created_at).localeCompare(cleanText(a.updated_at || a.created_at)))
    .slice(0, MAX_JOBS);
}

function writeStore(jobs, filePath = STORE_FILE) {
  const payload = {
    version: 1,
    updated_at: nowIso(),
    jobs: normalizeJobs(jobs)
  };
  atomicWriteJson(filePath, payload);
  return payload.jobs;
}

function readJobs(filePath = STORE_FILE) {
  return normalizeJobs(safeParseStore(filePath).jobs);
}

function makeId(prefix) {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function hashId(prefix, value) {
  const seed = cleanText(value) || `${Date.now()}_${Math.random()}`;
  return `${prefix}_${crypto.createHash('sha1').update(seed).digest('hex').slice(0, 16)}`;
}

function normalizeStrategies(input) {
  const raw = Array.isArray(input)
    ? input
    : cleanText(input).split(',').map((item) => item.trim()).filter(Boolean);
  const normalized = raw.map((item) => {
    const key = safeLower(item).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return STRATEGY_LABELS[key] ? key : key;
  }).filter(Boolean);
  return Array.from(new Set(normalized));
}

function strategyLabel(strategy) {
  return STRATEGY_LABELS[strategy] || cleanText(strategy).replace(/_/g, ' ');
}

function boolValue(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true || value === false) return value;
  const text = safeLower(value);
  if (text === 'true' || text === '1' || text === 'yes' || text === 'on') return true;
  if (text === 'false' || text === '0' || text === 'no' || text === 'off') return false;
  return defaultValue;
}

function normalizeArrayInput(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return cleanText(value).split(',').map(cleanText).filter(Boolean);
}

function isFreshBatchRequest(body) {
  body = body || {};
  return body.fresh_batch === true ||
    body.freshLeadBatch === true ||
    body.fresh_lead_batch === true ||
    body.discovery_mode === 'fresh_batch' ||
    body.discoveryMode === 'fresh_batch' ||
    body.quantity !== undefined ||
    body.requested_quantity !== undefined;
}

function normalizeFreshBatchBounds(body) {
  body = body || {};
  return {
    max_provider_calls: Math.min(Math.max(parseInt(body.max_provider_calls || body.maxProviderCalls || FRESH_BATCH_DEFAULT_BOUNDS.max_provider_calls, 10) || FRESH_BATCH_DEFAULT_BOUNDS.max_provider_calls, 0), FRESH_BATCH_DEFAULT_BOUNDS.max_provider_calls),
    max_candidate_urls: Math.min(Math.max(parseInt(body.max_candidate_urls || body.maxCandidateUrls || FRESH_BATCH_DEFAULT_BOUNDS.max_candidate_urls, 10) || FRESH_BATCH_DEFAULT_BOUNDS.max_candidate_urls, 1), FRESH_BATCH_DEFAULT_BOUNDS.max_candidate_urls),
    max_source_verifications: Math.min(Math.max(parseInt(body.max_source_verifications || body.maxSourceVerifications || FRESH_BATCH_DEFAULT_BOUNDS.max_source_verifications, 10) || FRESH_BATCH_DEFAULT_BOUNDS.max_source_verifications, 0), FRESH_BATCH_DEFAULT_BOUNDS.max_source_verifications),
    provider_timeout_ms: Math.min(Math.max(parseInt(body.provider_timeout_ms || body.providerTimeoutMs || FRESH_BATCH_DEFAULT_BOUNDS.provider_timeout_ms, 10) || FRESH_BATCH_DEFAULT_BOUNDS.provider_timeout_ms, 50), FRESH_BATCH_DEFAULT_BOUNDS.provider_timeout_ms),
    hard_timeout_ms: Math.min(Math.max(parseInt(body.hard_timeout_ms || body.hardTimeoutMs || FRESH_BATCH_DEFAULT_BOUNDS.hard_timeout_ms, 10) || FRESH_BATCH_DEFAULT_BOUNDS.hard_timeout_ms, 50), FRESH_BATCH_DEFAULT_BOUNDS.hard_timeout_ms)
  };
}

function defaultJobInput(body) {
  body = body || {};
  const freshBatch = isFreshBatchRequest(body);
  const requested = Number(body.quantity || body.requested_quantity || body.requestedQuantity || body.batch_size || body.batchSize || 10);
  const safeBatch = freshBatch
    ? requested
    : requested === 50 ? 50 : requested === 30 ? 30 : requested === 20 ? 20 : requested === 5 ? 5 : 10;
  if (freshBatch && !FRESH_BATCH_QUANTITIES.has(safeBatch)) {
    const err = new Error('Fresh Lead Batch quantity must be 5, 10, 20, 30, or 50.');
    err.status = 400;
    throw err;
  }
  const state = cleanText(body.state || body.market_state || '');
  const county = cleanText(body.county || body.market_county || '');
  const cities = normalizeArrayInput(body.cities || body.city || body.market_city || '');
  const zips = normalizeArrayInput(body.zips || body.zip || body.postal_code || '');
  const city = cities[0] || '';
  const zip = zips[0] || '';
  const locationParts = [city, county, state || cleanText(body.market), zip].filter(Boolean);
  const location = cleanText(body.location || locationParts.join(', ') || '');
  const bounds = normalizeFreshBatchBounds(body);
  return {
    fresh_batch: freshBatch,
    market: cleanText(body.market || state || city || 'Dallas') || 'Dallas',
    location,
    state,
    county,
    city,
    zip,
    cities,
    zips,
    include_research: body.include_research !== false,
    include_auction: body.include_auction === true || body.includeAuction === true,
    include_pre_foreclosure: boolValue(body.include_pre_foreclosure !== undefined ? body.include_pre_foreclosure : body.includePreForeclosure, true),
    exclude_reo: boolValue(body.exclude_reo !== undefined ? body.exclude_reo : body.excludeReo, true),
    exclude_sold: boolValue(body.exclude_sold !== undefined ? body.exclude_sold : body.excludeSold, true),
    include_previous_results: boolValue(body.include_previous_results !== undefined ? body.include_previous_results : body.includePreviousResults, false),
    refresh_changed_properties: boolValue(body.refresh_changed_properties !== undefined ? body.refresh_changed_properties : body.refreshChangedProperties, true),
    max_source_age_hours: Math.min(Math.max(parseInt(body.max_source_age_hours || body.maxSourceAgeHours || 72, 10) || 72, 1), 168),
    property_types: normalizeArrayInput(body.property_types || body.propertyTypes || ''),
    source_preferences: normalizeArrayInput(body.source_preferences || body.sourcePreferences || ''),
    price_min: cleanText(body.price_min || body.min_asking_price || body.minAskingPrice || ''),
    price_max: cleanText(body.price_max || body.max_asking_price || body.maxAskingPrice || ''),
    operator_request_id: cleanText(body.operator_request_id || body.operatorRequestId || makeId('opr')),
    market_timezone: cleanText(body.market_timezone || body.marketTimezone || 'America/Chicago'),
    max_provider_calls: freshBatch ? bounds.max_provider_calls : Math.min(Math.max(parseInt(body.max_provider_calls || body.maxProviderCalls || 1, 10) || 1, 1), 3),
    max_candidate_urls: bounds.max_candidate_urls,
    max_source_verifications: bounds.max_source_verifications,
    provider_timeout_ms: bounds.provider_timeout_ms,
    hard_timeout_ms: bounds.hard_timeout_ms,
    max_comp_attempts: Math.min(Math.max(parseInt(body.max_comp_attempts || body.maxCompAttempts || 0, 10) || 0, 0), 5),
    strategies: normalizeStrategies(body.wholesale_criteria || body.wholesaleCriteria || body.strategies || body.strategy || ['fixer', 'as_is', 'investor_special', 'cash_only', 'price_cut', 'long_dom', 'failed_listing', 'relisted', 'back_on_market', 'fsbo', 'pre_foreclosure']),
    batch_size: safeBatch
  };
}

function freshBatchKey(input) {
  if (!input || !input.fresh_batch) return '';
  return [
    cleanText(input.operator_request_id || 'default').toLowerCase(),
    cleanText(input.state).toLowerCase(),
    cleanText(input.county).toLowerCase(),
    cleanText(input.city).toLowerCase(),
    cleanText(input.zip).toLowerCase()
  ].join('|');
}

function batchRequestFromInput(input) {
  return {
    state: input.state,
    county: input.county,
    cities: input.cities,
    zips: input.zips,
    quantity: input.batch_size,
    property_types: input.property_types,
    min_asking_price: input.price_min,
    max_asking_price: input.price_max,
    wholesale_criteria: input.strategies,
    source_preferences: input.source_preferences,
    max_source_age_hours: input.max_source_age_hours,
    include_auction: input.include_auction,
    include_pre_foreclosure: input.include_pre_foreclosure,
    exclude_reo: input.exclude_reo,
    exclude_sold: input.exclude_sold,
    include_previous_results: input.include_previous_results,
    refresh_changed_properties: input.refresh_changed_properties,
    operator_request_id: input.operator_request_id,
    market_timezone: input.market_timezone
  };
}

function emptyBatchAudit(requested) {
  return {
    requested: Number(requested || 0) || 0,
    valid_new_leads: 0,
    strong_leads: 0,
    needs_comps: 0,
    research_reference: 0,
    rejected: 0,
    duplicates_rejected: 0,
    previous_property_rejections: 0,
    sold_stale_rejected: 0,
    generic_incomplete_rejected: 0,
    source_blocked: 0,
    provider_attempts: 0,
    provider_unavailable: '',
    discovery_urls_found: 0,
    structured_candidates_parsed: 0,
    url_only_candidates: 0,
    evidence_enrichment_attempts: 0,
    evidence_enriched_candidates: 0,
    exact_phrases_verified: 0,
    source_refresh_blocked: 0,
    duration_ms: 0,
    batch_status: 'queued',
    warnings: []
  };
}

function createJob(body, options = {}) {
  const input = defaultJobInput(body);
  const created = nowIso();
  const jobs = readJobs(options.storePath);
  const activeBatchKey = freshBatchKey(input);
  if (input.fresh_batch) {
    const conflict = jobs.find((candidate) => candidate && candidate.fresh_batch === true && activeBatchKey && candidate.active_batch_key === activeBatchKey && /^(queued|running|continuing)$/i.test(cleanText(candidate.status)));
    if (conflict) {
      const err = new Error('A Fresh Lead Batch is already active for this operator and market. Continue or cancel the existing batch.');
      err.status = 409;
      err.existing_job_id = conflict.job_id;
      throw err;
    }
  }
  const discoveryBatchId = makeId('flb');
  const job = {
    job_id: makeId('fms'),
    discovery_batch_id: discoveryBatchId,
    discovery_request_id: input.operator_request_id,
    fresh_batch: input.fresh_batch,
    active_batch_key: activeBatchKey,
    created_at: created,
    updated_at: created,
    status: 'queued',
    market: input.market,
    location: input.location,
    state: input.state,
    county: input.county,
    city: input.city,
    zip: input.zip,
    cities: input.cities,
    zips: input.zips,
    include_research: input.include_research,
    include_auction: input.include_auction,
    include_pre_foreclosure: input.include_pre_foreclosure,
    exclude_reo: input.exclude_reo,
    exclude_sold: input.exclude_sold,
    include_previous_results: input.include_previous_results,
    refresh_changed_properties: input.refresh_changed_properties,
    max_source_age_hours: input.max_source_age_hours,
    property_types: input.property_types,
    source_preferences: input.source_preferences,
    price_min: input.price_min,
    price_max: input.price_max,
    operator_request_id: input.operator_request_id,
    market_timezone: input.market_timezone,
    max_provider_calls: input.max_provider_calls,
    max_candidate_urls: input.max_candidate_urls,
    max_source_verifications: input.max_source_verifications,
    provider_timeout_ms: input.provider_timeout_ms,
    hard_timeout_ms: input.hard_timeout_ms,
    max_comp_attempts: input.max_comp_attempts,
    strategies: input.strategies,
    strategy_labels: input.strategies.map(strategyLabel),
    batch_size: input.batch_size,
    requested_quantity: input.batch_size,
    batch_request: batchRequestFromInput(input),
    batch_progress: {
      started_at: '',
      finished_at: '',
      duration_ms: 0,
      cancellation_requested: false,
      provider_attempts_completed: [],
      provider_attempts_failed: [],
      provider_attempts_skipped: []
    },
    batch_status: input.fresh_batch ? 'queued' : '',
    batch_audit: emptyBatchAudit(input.batch_size),
    cards: [],
    counts: emptyCounts(),
    provider_status: 'not_configured',
    provider_message: 'Gemini Live Discovery is optional and disabled unless configured.',
    provider_summary: {
      saved_leads_mode: 'Available',
      gemini_live_discovery: 'Not configured',
      source_urls_found_count: 0,
      candidates_found: 0,
      grounding_urls_found: 0,
      urls_harvested: 0,
      property_specific_urls: 0,
      generic_urls_filtered: 0,
      cards_from_grounding_urls: 0,
      provider_output_format: '',
      provider_output_repaired: false,
      evidence_sources_merged: 0,
      grounding_support_count: 0,
      url_only_candidate_count: 0,
      candidates_needing_enrichment: 0,
      evidence_enrichment_attempts: 0,
      evidence_enriched_count: 0,
      source_refresh_blocked_count: 0,
      exact_phrases_verified: 0,
      provider_attempts: [],
      research_ready_count: 0,
      needs_source_proof_count: 0,
      needs_address_repair_count: 0,
      manual_review_rows_added: 0,
      manual_review_queue_count: 0,
      no_auto_ingestion_status: input.fresh_batch ? 'passed' : '',
      batch_persisted_scope: input.fresh_batch ? 'batch_only' : '',
      warnings: []
    },
    safety: 'operator-created Deal Finder job only; no autonomous ingestion, no production lead mutation',
    persist_scope: input.fresh_batch ? 'batch_only' : '',
    no_auto_ingestion_status: input.fresh_batch ? 'passed' : '',
    error: ''
  };
  writeStore([job].concat(jobs), options.storePath);
  return publicJob(job);
}

function listJobs(limit, options = {}) {
  const max = Math.max(1, Math.min(Number(limit || 25) || 25, 100));
  return readJobs(options.storePath).slice(0, max).map(publicJob);
}

function getJob(jobId, options = {}) {
  const job = readJobs(options.storePath).find((candidate) => cleanText(candidate.job_id) === cleanText(jobId));
  return job ? publicJob(job) : null;
}

function upsertJob(job, options = {}) {
  const jobs = readJobs(options.storePath);
  const idx = jobs.findIndex((candidate) => candidate.job_id === job.job_id);
  if (idx >= 0) jobs[idx] = job;
  else jobs.unshift(job);
  writeStore(jobs, options.storePath);
  return job;
}

function emptyCounts() {
  return {
    total_cards: 0,
    call_ready: 0,
    research_ready: 0,
    needs_address_repair: 0,
    needs_source_proof: 0,
    support_signal_only: 0,
    junk_archive: 0,
    sent_to_analyzer: 0
  };
}

function summarizeCards(cards) {
  const counts = emptyCounts();
  const list = Array.isArray(cards) ? cards : [];
  counts.total_cards = list.length;
  list.forEach((card) => {
    if (card.status === 'Call Ready') counts.call_ready += 1;
    if (card.status === 'Research Ready') counts.research_ready += 1;
    if (card.status === 'Needs Address Repair') counts.needs_address_repair += 1;
    if (card.status === 'Needs Source Proof') counts.needs_source_proof += 1;
    if (card.status === 'Support Signal Only') counts.support_signal_only += 1;
    if (card.status === 'Junk/Archive') counts.junk_archive += 1;
    if (card.pipeline_status === 'Sent to Analyzer') counts.sent_to_analyzer += 1;
  });
  return counts;
}

function parseDateMs(value) {
  const text = cleanText(value);
  if (!text) return 0;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : 0;
}

function freshnessStatusFor(evidence, maxAgeHours) {
  const checkedAt = cleanText(evidence && (evidence.last_source_checked_at || evidence.source_checked_at));
  const checkedMs = parseDateMs(checkedAt);
  if (!checkedMs) return 'unknown';
  const ageHours = Math.max(0, (Date.now() - checkedMs) / 3600000);
  if (ageHours <= 24) return 'fresh';
  if (ageHours <= (Number(maxAgeHours || 72) || 72)) return 'reusable';
  return 'stale';
}

function sourceBlocked(card) {
  const sourceUrl = cleanText(card && (card.canonical_source_url || card.source_url || card.open_source_url || card.lead_evidence && card.lead_evidence.canonical_source_url));
  const text = `${recordText(card)} ${sourceUrl}`.toLowerCase();
  if (!sourceUrl || isGenericSourceUrl(sourceUrl)) return true;
  if (/\b(blocked|captcha|login required|paywall|robots|forbidden|access denied)\b/i.test(text)) return true;
  return false;
}

function excludedByDefault(card, job) {
  const text = exclusionSignalText(card);
  if (job && job.exclude_reo !== false && /\b(bank[- ]?owned|reo|real estate owned)\b/i.test(text)) return 'REO/bank-owned excluded';
  if (job && job.include_auction !== true && /\b(auction\.com|realauction|hubzu|completed auction|auction ended|sale completed)\b/i.test(text)) return 'auction/completed sale excluded';
  if (job && job.exclude_sold !== false) {
    const statusText = text.replace(/\b(verified sold comps?|candidate sold comps?|sold comps?)\b/ig, ' ');
    if (/\b(sold|closed|off[- ]?market|sale completed)\b/i.test(statusText) && !/\b(active|for sale|listed|pending|contingent|back on market|relisted|price reduced|price cut)\b/i.test(statusText)) {
      return 'sold/closed source excluded';
    }
  }
  return '';
}

function freshCardKey(card) {
  const identityKey = propertyIdentity.canonicalPropertyKey(cardIdentityInput(card));
  const sourceKey = propertyIdentity.canonicalSourceUrlKey(card && (card.canonical_source_url || card.source_url || card.open_source_url || card.lead_evidence && card.lead_evidence.canonical_source_url));
  return identityKey || sourceKey || cleanText(card && card.card_id);
}

function readDossierRows(filePath = DEAL_CALL_DOSSIERS_FILE) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed && parsed.dossiers) ? parsed.dossiers : [];
  } catch (error) {
    return [];
  }
}

function addSeenRecord(index, record, reason) {
  const identityKey = propertyIdentity.canonicalPropertyKey(record || {});
  const sourceKey = propertyIdentity.canonicalSourceUrlKey(record && (record.canonical_source_url || record.source_url || record.open_source_url || record.source_url_original || record.lead_evidence && record.lead_evidence.canonical_source_url));
  const item = {
    reason,
    address: cleanText(record && (record.normalized_address || record.address_or_source_text || record.display_address || record.address || record.property && record.property.full_address || record.lead_evidence && record.lead_evidence.normalized_address)),
    source_url: cleanText(record && (record.canonical_source_url || record.source_url || record.open_source_url || record.lead_evidence && record.lead_evidence.canonical_source_url || record.property && (record.property.source_url || record.property.canonical_source_url))),
    asking_price: cleanText(record && (record.asking_price || record.lead_evidence && record.lead_evidence.asking_price)),
    listing_status: cleanText(record && (record.listing_status || record.status || record.lead_evidence && record.lead_evidence.listing_status)),
    exact_source_phrase: cleanText(record && (record.exact_source_phrase || record.matched_source_phrase || record.lead_evidence && record.lead_evidence.exact_source_phrase)),
    public_contact_route: cleanText(record && (record.public_contact_route || record.lead_evidence && record.lead_evidence.public_contact_route))
  };
  [identityKey, sourceKey].filter(Boolean).forEach((key) => {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  });
}

function buildGlobalSeenIndex(currentJob, allJobs, options = {}) {
  const index = new Map();
  (Array.isArray(allJobs) ? allJobs : []).forEach((job) => {
    if (!job || job.job_id === currentJob.job_id) return;
    (Array.isArray(job.cards) ? job.cards : []).forEach((card) => {
      const pipelineStatus = cleanText(card && card.pipeline_status);
      const reason = /bad|dead|junk|archive/i.test(`${pipelineStatus} ${card && card.status || ''}`) ? 'previously rejected' : 'previously shown';
      addSeenRecord(index, card, reason);
    });
  });
  try {
    const analyzerJobs = aiDealAnalyzerJobs.listJobs ? aiDealAnalyzerJobs.listJobs(250) : [];
    (Array.isArray(analyzerJobs) ? analyzerJobs : []).forEach((job) => addSeenRecord(index, job, 'already in Analyzer'));
  } catch (error) {}
  readDossierRows(options.dossierStorePath).forEach((dossier) => {
    const record = Object.assign({}, dossier.property || {}, dossier.lead_evidence || {}, {
      normalized_address: dossier.lead_evidence && dossier.lead_evidence.normalized_address || dossier.property && dossier.property.full_address,
      source_url: dossier.lead_evidence && dossier.lead_evidence.canonical_source_url || dossier.property && (dossier.property.source_url || dossier.property.canonical_source_url),
      canonical_source_url: dossier.lead_evidence && dossier.lead_evidence.canonical_source_url
    });
    addSeenRecord(index, record, 'already in Daily Call Pipeline');
  });
  try {
    const leads = db.getLeads ? db.getLeads() : [];
    (Array.isArray(leads) ? leads : []).forEach((lead) => addSeenRecord(index, lead, 'already in saved leads'));
  } catch (error) {}
  return index;
}

function materialChangeFrom(prior, card, evidence) {
  prior = prior || {};
  const changes = [];
  const price = cleanText(evidence && evidence.asking_price || card && card.asking_price);
  const status = cleanText(evidence && evidence.listing_status || card && card.listing_status);
  const phrase = cleanText(evidence && evidence.exact_source_phrase || card && (card.exact_source_phrase || card.matched_source_phrase));
  const contact = cleanText(evidence && evidence.public_contact_route || card && card.public_contact_route);
  if (price && prior.asking_price && price !== prior.asking_price) changes.push(`asking price changed from ${prior.asking_price} to ${price}`);
  if (status && prior.listing_status && status !== prior.listing_status) changes.push(`status changed from ${prior.listing_status} to ${status}`);
  if (phrase && prior.exact_source_phrase && phrase !== prior.exact_source_phrase) changes.push('new exact source-backed wholesale phrase');
  if (contact && prior.public_contact_route && contact !== prior.public_contact_route) changes.push(`contact route changed from ${prior.public_contact_route} to ${contact}`);
  return changes;
}

function qualityGateCard(card, job, context) {
  const evidence = leadEvidence.normalizeLeadEvidence(card || {}, {
    discovery_batch_id: job.discovery_batch_id || job.job_id,
    discovery_request_id: job.discovery_request_id || job.operator_request_id,
    first_discovered_at: cleanText(card && card.first_discovered_at || card && card.created_at || job.created_at),
    last_discovered_at: nowIso(),
    last_source_checked_at: cleanText(card && (card.last_source_checked_at || card.source_checked_at || card.updated_at || card.created_at)) || nowIso(),
    provider_attempts: context.providerAttempts,
    batch_status: job.batch_status || 'running'
  });
  const sourceUrl = evidence.canonical_source_url || cleanText(card && (card.canonical_source_url || card.source_url || card.open_source_url));
  const sourceType = sourceEvidenceAdapter.classifySourceUrl(sourceUrl);
  const fullAddress = propertyIdentity.isCompleteAddress(evidence.normalized_address);
  const freshness = freshnessStatusFor(evidence, job.max_source_age_hours || 72);
  const exclusion = excludedByDefault(card, job);
  const blockers = [];
  const pass = [];
  const priorHits = context.seenIndex.get(freshCardKey(card)) || context.seenIndex.get(propertyIdentity.canonicalSourceUrlKey(sourceUrl)) || [];
  const prior = priorHits[0] || null;
  const changes = prior ? materialChangeFrom(prior, card, evidence) : [];
  const previouslySeen = !!prior;
  const allowPrevious = job.include_previous_results === true || changes.length > 0;

  if (fullAddress) pass.push('complete canonical address'); else blockers.push('complete canonical address');
  if (sourceType === 'exact_property_record' && isPropertySpecificSourceUrl(sourceUrl)) pass.push('exact property-detail source URL'); else blockers.push('exact property-detail source URL');
  if (evidence.exact_source_phrase && evidence.exact_source_phrase_verbatim === true) pass.push('exact source-backed wholesale phrase'); else blockers.push('exact source-backed wholesale phrase');
  if (leadEvidence.isCurrentOpportunity(evidence) && freshness !== 'stale' && !/^Manual Verification Needed$/i.test(evidence.listing_status)) pass.push('current/plausibly current listing evidence'); else blockers.push(freshness === 'stale' ? 'stale source evidence' : 'current listing status');
  if (sourceBlocked(card)) blockers.push('source blocked or generic');
  if (exclusion) blockers.push(exclusion);
  if (previouslySeen && !allowPrevious) blockers.push(prior.reason || 'previously shown');

  let batchGroup = 'Research / Reference';
  let rejectionReason = '';
  if (blockers.find((item) => /previously|duplicate|already/i.test(item))) {
    batchGroup = 'Rejected';
    rejectionReason = blockers.find((item) => /previously|duplicate|already/i.test(item));
  } else if (blockers.find((item) => /sold|closed|REO|auction|generic|blocked|stale|complete canonical address|source URL|source-backed|current listing/i.test(item))) {
    batchGroup = 'Research / Reference';
  } else if (evidence.public_contact_route !== 'Manual Lookup Needed') {
    batchGroup = 'Strong Leads';
  } else {
    batchGroup = 'Valid Leads - Needs Comps';
  }

  if (batchGroup !== 'Rejected' && context.currentSeen.has(freshCardKey(card))) {
    batchGroup = 'Rejected';
    rejectionReason = 'duplicate in current batch';
    blockers.push(rejectionReason);
  }
  context.currentSeen.add(freshCardKey(card));

  const status = batchGroup === 'Strong Leads' || batchGroup === 'Valid Leads - Needs Comps'
    ? 'Research Ready'
    : batchGroup === 'Rejected'
      ? 'Junk/Archive'
      : cleanText(card && card.status) || 'Needs Source Proof';
  const finalEvidence = leadEvidence.normalizeLeadEvidence(Object.assign({}, card || {}, evidence), {
    discovery_batch_id: job.discovery_batch_id || job.job_id,
    discovery_request_id: job.discovery_request_id || job.operator_request_id,
    first_discovered_at: evidence.first_discovered_at,
    last_discovered_at: evidence.last_discovered_at,
    last_source_checked_at: evidence.last_source_checked_at,
    times_seen: previouslySeen ? priorHits.length + 1 : 1,
    previously_seen: previouslySeen,
    material_change_type: changes.length ? 'source_evidence_changed' : '',
    material_change_details: changes.join('; '),
    freshness_status: freshness,
    rejection_reason: rejectionReason || (batchGroup === 'Research / Reference' ? blockers.join(', ') : ''),
    provider_attempts: context.providerAttempts,
    batch_status: job.batch_status || 'running'
  });

  return Object.assign({}, card, {
    status,
    acquisition_bucket: batchGroup === 'Rejected' ? 'Bad / Skipped' : batchGroup,
    lead_bucket: batchGroup === 'Rejected' ? 'Bad / Skipped' : batchGroup,
    batch_group: batchGroup,
    batch_pass_reasons: pass,
    batch_blockers: Array.from(new Set(blockers.map(cleanText).filter(Boolean))),
    batch_next_action: batchGroup === 'Rejected'
      ? 'Do not use in this fresh batch.'
      : batchGroup === 'Research / Reference'
        ? 'Review source evidence manually before calling.'
        : 'Review source, then send selected lead to Analyzer or Daily Call Pipeline.',
    previously_seen: previouslySeen,
    material_change_type: changes.length ? 'source_evidence_changed' : '',
    material_change_details: changes.join('; '),
    freshness_status: freshness,
    rejection_reason: rejectionReason || '',
    lead_evidence: finalEvidence,
    source_checked_at: finalEvidence.source_checked_at,
    last_source_checked_at: finalEvidence.last_source_checked_at,
    can_send_to_analyzer: (batchGroup === 'Strong Leads' || batchGroup === 'Valid Leads - Needs Comps') && card.can_send_to_analyzer !== false,
    preview_only: true,
    should_ingest: false
  });
}

function auditBatchCards(cards, job, providerSummary) {
  const audit = emptyBatchAudit(job.requested_quantity || job.batch_size);
  const list = Array.isArray(cards) ? cards : [];
  audit.strong_leads = list.filter((card) => card.batch_group === 'Strong Leads').length;
  audit.needs_comps = list.filter((card) => card.batch_group === 'Valid Leads - Needs Comps').length;
  audit.research_reference = list.filter((card) => card.batch_group === 'Research / Reference').length;
  audit.rejected = list.filter((card) => card.batch_group === 'Rejected').length;
  audit.valid_new_leads = audit.strong_leads + audit.needs_comps;
  audit.duplicates_rejected = list.filter((card) => /duplicate/i.test((card.batch_blockers || []).join(' ') || card.rejection_reason)).length;
  audit.previous_property_rejections = list.filter((card) => /previously|already/i.test((card.batch_blockers || []).join(' ') || card.rejection_reason)).length;
  audit.sold_stale_rejected = list.filter((card) => /sold|closed|stale/i.test((card.batch_blockers || []).join(' '))).length;
  audit.generic_incomplete_rejected = list.filter((card) => /generic|complete canonical address|source URL|source-backed|current listing/i.test((card.batch_blockers || []).join(' '))).length;
  audit.source_blocked = list.filter((card) => /blocked/i.test((card.batch_blockers || []).join(' '))).length;
  audit.discovery_urls_found = Number(providerSummary && providerSummary.source_urls_found_count || 0) || 0;
  audit.structured_candidates_parsed = Number(providerSummary && providerSummary.candidates_found || 0) || 0;
  audit.url_only_candidates = Number(providerSummary && providerSummary.url_only_candidate_count || 0) || 0;
  audit.evidence_enrichment_attempts = Number(providerSummary && providerSummary.evidence_enrichment_attempts || 0) || 0;
  audit.evidence_enriched_candidates = Number(providerSummary && providerSummary.evidence_enriched_count || 0) || 0;
  audit.exact_phrases_verified = Number(providerSummary && providerSummary.exact_phrases_verified || 0) || 0;
  audit.search_results_found = Number(providerSummary && providerSummary.search_results_found || 0) || 0;
  audit.snippet_phrases_verified = Number(providerSummary && providerSummary.snippet_phrases_verified || 0) || 0;
  audit.weak_snippets_count = Number(providerSummary && providerSummary.weak_snippets_count || 0) || 0;
  audit.source_refresh_blocked = Number(providerSummary && providerSummary.source_refresh_blocked_count || 0) || 0;
  audit.provider_attempts = Math.max(
    Number(providerSummary && providerSummary.attempted ? 1 : 0) || 0,
    (Array.isArray(job && job.batch_progress && job.batch_progress.provider_attempts_completed) ? job.batch_progress.provider_attempts_completed.length : 0) +
      (Array.isArray(job && job.batch_progress && job.batch_progress.provider_attempts_failed) ? job.batch_progress.provider_attempts_failed.length : 0)
  );
  audit.provider_unavailable = providerSummary && /Temporarily unavailable|Timed out|Failed|Not configured/i.test(providerSummary.gemini_live_discovery || '') ? providerSummary.gemini_live_discovery : '';
  audit.batch_status = job.batch_status || (audit.valid_new_leads >= audit.requested ? 'completed' : 'partial_success');
  if (audit.valid_new_leads !== audit.strong_leads + audit.needs_comps) audit.warnings.push('valid count mismatch');
  if (audit.valid_new_leads < audit.requested && audit.batch_status === 'completed') audit.batch_status = 'partial_success';
  return audit;
}

function addressQualityFromText(address, sourceText) {
  const text = cleanText(address);
  const probe = `${text} ${cleanText(sourceText)}`.toLowerCase();
  const hasNumber = /\b\d{1,7}\b/.test(text);
  const hasStreetWord = /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop|run|sq|square|plaza|expy|fwy|freeway)\b/i.test(text);
  if (!text) return 'missing';
  if (/\b(public information request|phone directory|page not found|contact us|search results|skip main navigation|calendar|directory|login)\b/i.test(probe)) return 'junk';
  if (!hasNumber || !hasStreetWord) return 'partial';
  return 'valid';
}

function leadAddress(lead) {
  return cleanText(pick(lead, ['address', 'property_address', 'situs_address', 'site_address', 'normalized_address']));
}

function leadLocation(lead) {
  return [pick(lead, ['city', 'property_city', 'situs_city']), pick(lead, ['county', 'property_county', 'situs_county']), pick(lead, ['state', 'property_state', 'situs_state']), pick(lead, ['zip', 'zipcode', 'postal_code'])].map(cleanText).filter(Boolean).join(', ');
}

function leadSourceUrl(lead) {
  return cleanText(pick(lead, [
    'source_record_url',
    'record_url',
    'verification_url',
    'source_pdf_url',
    'source_url',
    'source_details.record_url',
    'source_details.source_url',
    'source_details.query_url',
    'source_truth.source_record_url',
    'source_truth.source_url',
    '_courthouse_metadata.source_url',
    '_courthouse_metadata.source_pdf_url'
  ]));
}

function candidateLocation(candidate) {
  return [candidate.city, candidate.county, candidate.state, candidate.zip].map(cleanText).filter(Boolean).join(', ');
}

function sourceProofUrl(item) {
  return cleanText(pick(item, ['source_proof_url', 'source_record_url', 'source_url', 'record_url', 'verification_url']));
}

function recordText(record) {
  try {
    return JSON.stringify(record || {}).toLowerCase();
  } catch (error) {
    return '';
  }
}

function exclusionSignalText(record) {
  record = record || {};
  return [
    record.source_title,
    record.title,
    record.source_snippet,
    record.search_result_snippet,
    record.evidence_snippet,
    record.listing_status,
    record.source_status,
    record.status_label,
    record.source_type,
    record.source_classification,
    record.source_quality,
    record.why_this_might_be_a_deal,
    record.why_it_matters,
    record.signal_summary,
    Array.isArray(record.risk_flags) ? record.risk_flags.join(' ') : '',
    Array.isArray(record.distress_motivation_signals) ? record.distress_motivation_signals.join(' ') : '',
    Array.isArray(record.strategy_tags) ? record.strategy_tags.join(' ') : '',
    record.lead_evidence && record.lead_evidence.listing_status
  ].map(cleanText).filter(Boolean).join(' ').toLowerCase();
}

function marketMatches(record, market, location) {
  const text = recordText(record);
  const marketText = safeLower(market);
  const loc = safeLower(location);
  const state = safeLower(record && (record.market_state || record.state || record.property_state || record.situs_state));
  const county = safeLower(record && (record.market_county || record.county || record.property_county || record.situs_county));
  const city = safeLower(record && (record.market_city || record.city || record.property_city || record.situs_city));
  const zip = safeLower(record && (record.zip || record.zipcode || record.postal_code));
  const recordLocationText = [text, state, county, city, zip].join(' ');
  if (marketText === 'dallas') {
    if (!/\bdallas\b|tx\b|texas\b|75[23]\d{2}/.test(text)) return false;
  } else if (marketText === 'texas') {
    if (!/\btx\b|texas\b|75[0-9]\d{2}/.test(text)) return false;
  }
  if (!loc) return true;
  const locTokens = loc.split(/[,|]+/).map(cleanText).map((item) => item.toLowerCase()).filter(Boolean);
  if (!locTokens.length) return true;
  return locTokens.every((token) => {
    if (/^\d{5}$/.test(token)) return recordLocationText.indexOf(token) >= 0;
    if (/^(tx|texas)$/i.test(token)) return /\btx\b|\btexas\b/.test(recordLocationText);
    if (/county$/i.test(token)) {
      const countyToken = token.replace(/\s+county$/i, '');
      return recordLocationText.indexOf(countyToken) >= 0;
    }
    return recordLocationText.indexOf(token) >= 0;
  });
}

function strategySignals(record, strategies) {
  const text = recordText(record);
  const signals = [];
  function add(strategy, label) {
    if (!signals.find((item) => item.strategy === strategy)) signals.push({ strategy, label: label || strategyLabel(strategy) });
  }
  (strategies || []).forEach((strategy) => {
    if ((strategy === 'fixer' || strategy === 'ugly' || strategy === 'as_is') && /\b(as.?is|fixer|needs repairs|rehab|ugly|damage|distressed)\b/.test(text)) add(strategy);
    if ((strategy === 'pre_foreclosure') && /\b(pre.?foreclos|notice of default|lis pendens)\b/.test(text)) add(strategy);
    if ((strategy === 'foreclosure_notice' || strategy === 'trustee_notice') && /\b(foreclos|trustee|notice of sale|substitute trustee)\b/.test(text)) add(strategy);
    if ((strategy === 'tax_foreclosure' || strategy === 'tax_sale') && /\b(tax sale|tax foreclosure|sheriff sale|resale)\b/.test(text)) add(strategy);
    if ((strategy === 'tax_delinquent' || strategy === 'tax_lien') && /\b(tax delin|tax lien|delinquent tax|struck.?off)\b/.test(text)) add(strategy);
    if (strategy === 'price_cut' && /\b(price cut|price reduced|price drop|reduction)\b/.test(text)) add(strategy);
    if ((strategy === 'long_dom' || strategy === 'stale_listing') && /\b(days on market|dom|stale listing|expired listing|failed listing)\b/.test(text)) add(strategy);
    if (strategy === 'investor_special' && /\b(investor special|investor opportunity|handyman special)\b/.test(text)) add(strategy);
    if (strategy === 'cash_only' && /\b(cash only|cash buyer|cash offer)\b/.test(text)) add(strategy);
    if (strategy === 'fsbo' && /\b(fsbo|for sale by owner)\b/.test(text)) add(strategy);
    if ((strategy === 'failed_listing' || strategy === 'relisted' || strategy === 'back_on_market') && /\b(failed listing|expired listing|relisted|back on market)\b/.test(text)) add(strategy);
    if (strategy === 'code_violation' && /\b(code violation|code compliance|violation|unsafe structure|nuisance)\b/.test(text)) add(strategy);
    if (strategy === 'auction_soon' && /\b(auction|sale date|auction date|opening bid)\b/.test(text)) add(strategy);
    if ((strategy === 'auction_public' || strategy === 'public_auction') && /\b(auction\.com|realauction\.com|realauction|public auction|auction|opening bid|bid starts|sale date)\b/.test(text)) add(strategy);
    if ((strategy === 'bank_owned' || strategy === 'reo') && /\b(bank owned|bank-owned|reo|real estate owned)\b/.test(text)) add(strategy);
    if ((strategy === 'vacant_absentee' || strategy === 'vacant' || strategy === 'absentee') && /\b(vacant|abandoned|absentee|non.?owner|out.?of.?state)\b/.test(text)) add(strategy);
  });
  if (!signals.length) {
    if (/\b(foreclos|trustee|tax sale|sheriff sale|auction)\b/.test(text)) add('foreclosure_notice', 'foreclosure/trustee/tax sale evidence');
    else if (/\b(code violation|violation)\b/.test(text)) add('code_violation', 'code violation');
  }
  return signals;
}

function sourceTypeFrom(record, fallback) {
  return cleanText(pick(record, ['source_type', 'category', 'lead_type', 'event_type', 'motivation', 'source_category'])) || fallback || 'saved lead';
}

function missingEvidenceFor(addressQuality, sourceUrl, signals, sourceType) {
  const missing = [];
  if (addressQuality !== 'valid') missing.push('usable property address');
  if (!isHttpUrl(sourceUrl)) missing.push('source proof URL');
  if (!signals.length) missing.push('clear distress signal');
  if (/\bforeclos|trustee|auction|tax sale/i.test(sourceType) && !signals.find((signal) => /foreclos|trustee|auction|tax/i.test(signal.label))) {
    missing.push('foreclosure/tax sale timing');
  }
  return Array.from(new Set(missing));
}

function foundBecause(signals, fallback) {
  const labels = (Array.isArray(signals) ? signals : []).map((signal) => cleanText(signal.label)).filter(Boolean);
  if (labels.length) return `Matched requested criteria: ${labels.join(', ')}.`;
  return cleanText(fallback) || 'No requested acquisition criteria matched yet.';
}

function sourceBackedWholesalePhrase(record, card) {
  const text = criterionEvidenceText(record, card);
  const exact = cleanText(pick(record || {}, [
    'matched_source_phrase',
    'source_excerpt',
    'description_excerpt',
    'source_snippet',
    'evidence_snippet'
  ]) || card && (card.matched_source_phrase || card.source_excerpt || card.description_excerpt || card.source_snippet || card.evidence_snippet));
  if (exact && /\b(as.?is|fixer|needs\s+(tlc|work|repair)|investor special|investor opportunity|cash only|price (cut|reduced|drop|reduction)|long dom|days on market|back on market|relisted|fsbo|for sale by owner|pre.?foreclos|code violation|tax delinquent)\b/i.test(exact)) {
    return exact;
  }
  const sentenceMatch = cleanText(text).match(/(?:[^.!?]*\b(?:as.?is|fixer|needs\s+(?:tlc|work|repair)|investor special|investor opportunity|cash only|price (?:cut|reduced|drop|reduction)|long dom|days on market|back on market|relisted|fsbo|for sale by owner|pre.?foreclos|code violation|tax delinquent)\b[^.!?]*[.!?]?)/i);
  return sentenceMatch ? cleanText(sentenceMatch[0]) : '';
}

function compStatusFor(record) {
  const verified = Number(record && (record.verified_comp_count || record.verified_sold_comps_count) || 0) || 0;
  const candidate = Number(record && (record.candidate_comp_count || record.candidate_sold_comps_count) || 0) || 0;
  if (verified >= 3) return '3+ verified sold comps present';
  if (verified > 0) return `${verified} verified sold comp${verified === 1 ? '' : 's'}; ARV still locked until 3.`;
  if (candidate > 0) return `${candidate} candidate sold comp${candidate === 1 ? '' : 's'} with source; ARV/MAO still locked.`;
  return 'Comps missing; ARV/MAO locked.';
}

function contactStatusFor(record) {
  const text = recordText(record);
  if (/\b(contact not verified|manual lookup)\b/i.test(text)) return 'Contact not verified. Manual lookup needed.';
  if (/\b(agent_phone|listing_agent_phone|contact_phone|phone|email|contact_email)\b/i.test(text)) return 'Possible contact field present; verify source before use.';
  return 'Contact not verified. Manual lookup needed.';
}

function acquisitionBucketFor(status, record, card, signals, sourceUrl) {
  const visibleGate = visibleDealFinderGate(record, card || {}, sourceUrl || card && card.source_url, signals || []);
  const evidence = leadEvidence.normalizeLeadEvidence(Object.assign({}, record || {}, card || {}), {
    normalized_address: card && (card.address_or_source_text || card.display_address),
    canonical_source_url: sourceUrl || card && (card.canonical_source_url || card.source_url),
    exact_source_phrase: sourceBackedWholesalePhrase(record, card),
    matched_criterion: (Array.isArray(signals) ? signals : []).map((signal) => signal.label).filter(Boolean)[0] || ''
  });
  const group = leadEvidence.dealFinderGroup(evidence);
  if ((status === 'Call Ready' || status === 'Research Ready') && visibleGate.ok && group === 'Strong Leads') return 'Strong Leads';
  if ((status === 'Call Ready' || status === 'Research Ready') && visibleGate.ok && group === 'Valid Leads - Needs Comps') return 'Valid Leads - Needs Comps';
  if ((status === 'Call Ready' || status === 'Research Ready') && !visibleGate.ok) return 'Research / Reference';
  if (status === 'Needs Source Proof' || status === 'Needs Address Repair' || status === 'Support Signal Only') return 'Research / Reference';
  return 'Skip / Bad Lead';
}

function wholesalePriorityFor(status, record, card, signals, sourceUrl) {
  const bucket = acquisitionBucketFor(status, record, card, signals, sourceUrl);
  if (bucket === 'Strong Leads') return 'A';
  if (bucket === 'Valid Leads - Needs Comps') return 'B';
  if (status === 'Research Ready') return 'C';
  if (bucket === 'Research / Reference') return 'D';
  return 'F';
}

function topFactsFor(record, sourceType, signals) {
  const facts = [];
  if (sourceType) facts.push(`Source type: ${sourceType}`);
  (Array.isArray(signals) ? signals : []).slice(0, 3).forEach((signal) => {
    if (signal && signal.label) facts.push(`Criteria: ${signal.label}`);
  });
  const text = recordText(record);
  if (/\b(as.?is|fixer|needs tlc|cash only|investor special)\b/i.test(text)) facts.push('Visible as-is/fixer language.');
  if (/\b(price cut|price reduced|price drop|reduction)\b/i.test(text)) facts.push('Visible price-reduction language.');
  if (/\b(auction|reo|bank.?owned)\b/i.test(text)) facts.push('Auction/REO candidate only.');
  return facts.slice(0, 5);
}

function decorateAcquisitionCard(card, record, signals, sourceUrl, sourceType) {
  const status = card.status;
  const visibleGate = visibleDealFinderGate(record, card, sourceUrl, signals);
  const bucket = acquisitionBucketFor(status, record, card, signals, sourceUrl);
  const exactPhrase = sourceBackedWholesalePhrase(record, card);
  const evidence = leadEvidence.normalizeLeadEvidence(Object.assign({}, record || {}, card || {}), {
    normalized_address: card.address_or_source_text || card.display_address,
    canonical_source_url: sourceUrl || card.canonical_source_url || card.source_url,
    exact_source_phrase: exactPhrase,
    matched_criterion: (Array.isArray(signals) ? signals : []).map((signal) => signal.label).filter(Boolean)[0] || '',
    comp_status: compStatusFor(record)
  });
  const sourceRepairReasons = []
    .concat(visibleGate.sourceOk ? [] : ['current property-specific listing/source URL'])
    .concat(visibleGate.addressOk ? [] : ['full usable property address'])
    .concat(visibleGate.criteriaOk ? [] : ['source-backed wholesale listing criteria'])
    .concat(visibleGate.currentOk ? [] : ['current or plausibly current sale opportunity']);
  return Object.assign(card, {
    acquisition_bucket: bucket,
    lead_bucket: bucket,
    visible_in_deal_finder_main: visibleGate.ok,
    filtered_from_main_reason: visibleGate.ok ? '' : sourceRepairReasons.join(', '),
    wholesale_priority: wholesalePriorityFor(status, record, card, signals, sourceUrl),
    found_because: exactPhrase
      ? `Found because source text says: ${exactPhrase}`
      : (visibleGate.criteriaOk ? foundBecause(signals, card.why_this_might_be_a_deal) : 'Exact source phrase was not preserved on this historical record. Open Source to verify.'),
    matched_source_phrase: exactPhrase,
    source_excerpt: exactPhrase || card.source_excerpt || '',
    matched_criteria: (Array.isArray(signals) ? signals : []).map((signal) => signal.label).filter(Boolean),
    top_facts: topFactsFor(record, sourceType, signals),
    comp_status: compStatusFor(record),
    contact_status: evidence.public_contact_route === 'Manual Lookup Needed' ? contactStatusFor(record) : evidence.public_contact_route,
    public_contact_route: evidence.public_contact_route,
    contact_verification_status: evidence.contact_verification_status,
    listing_status: evidence.listing_status,
    asking_price: evidence.asking_price,
    beds: evidence.beds,
    baths: evidence.baths,
    sqft: evidence.sqft,
    year_built: evidence.year_built,
    exact_source_phrase: evidence.exact_source_phrase,
    lead_evidence: evidence,
    source_domain: sourceDomain(sourceUrl),
    source_classification: card.source_classification || (isGenericSourceUrl(sourceUrl) ? 'generic_search_source' : isPropertySpecificSourceUrl(sourceUrl) ? 'exact_property_source' : ''),
    source_quality: card.source_quality || (isPropertySpecificSourceUrl(sourceUrl) ? 'Property-specific public source' : isGenericSourceUrl(sourceUrl) ? 'Generic/list source; needs property proof' : ''),
    property_specific_source: card.property_specific_source === true || isPropertySpecificSourceUrl(sourceUrl),
    next_action: card.next_action || card.next_best_action,
    open_source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
    can_send_to_analyzer: card.can_send_to_analyzer === true && visibleGate.ok
  });
}

function statusFor(record, addressQuality, hasSource, signals) {
  const text = recordText(record);
  const hasStrongSignal = signals.some((signal) => /\bforeclos|trustee|tax sale|auction|tax delinquent|tax lien|probate\b/i.test(signal.label));
  const isClosedOld = /\bclosed\b/.test(text) && !/\bopen|active|unresolved\b/.test(text);
  if (addressQuality === 'junk') return hasSource ? 'Needs Address Repair' : 'Junk/Archive';
  if (addressQuality === 'missing' || addressQuality === 'partial') return 'Needs Address Repair';
  if (!hasSource) return 'Needs Source Proof';
  if (isClosedOld || (signals.length && !hasStrongSignal && /\bcode violation\b/i.test(signals.map((s) => s.label).join(' ')))) return 'Support Signal Only';
  return hasStrongSignal ? 'Call Ready' : 'Research Ready';
}

function confidenceFor(status, addressQuality, hasSource, signals) {
  if (status === 'Call Ready') return 'High';
  if (status === 'Research Ready') return 'Medium';
  if (status === 'Support Signal Only') return 'Low';
  if (addressQuality === 'junk') return 'Blocked';
  if (hasSource || signals.length) return 'Repair';
  return 'Low';
}

function nextActionFor(status) {
  if (status === 'Call Ready') return 'Open the source, verify the timing, then call today.';
  if (status === 'Research Ready') return 'Send to AI Deal Analyzer for evidence and comp research.';
  if (status === 'Needs Address Repair') return 'Repair the property address from source proof before comps.';
  if (status === 'Needs Source Proof') return 'Attach a source proof URL before outreach.';
  if (status === 'Support Signal Only') return 'Use as support evidence with a stronger money source.';
  return 'Archive or keep only for source repair.';
}

function callAngleFor(status, signals) {
  const label = signals && signals.length ? signals[0].label : 'public record';
  if (status === 'Call Ready') return `Ask if they want a fast as-is option before the ${label} timeline becomes harder.`;
  if (status === 'Research Ready') return `Verify the ${label} evidence, then ask about their preferred timeline and condition.`;
  if (status === 'Support Signal Only') return 'Use the support signal carefully. Lead with property condition and timing, not sensitive details.';
  if (status === 'Needs Address Repair') return 'Repair the address before any outreach.';
  return 'Get source proof before calling.';
}

function cardFromLead(lead, job) {
  const address = leadAddress(lead);
  const sourceUrl = leadSourceUrl(lead);
  const signals = strategySignals(lead, job.strategies);
  const addressQuality = addressQualityFromText(address, recordText(lead));
  const sourceType = sourceTypeFrom(lead, 'saved lead');
  const status = statusFor(lead, addressQuality, isHttpUrl(sourceUrl), signals);
  const missing = missingEvidenceFor(addressQuality, sourceUrl, signals, sourceType);
  return decorateAcquisitionCard({
    card_id: hashId('fmc', `lead|${lead.id}|${address}|${sourceUrl}`),
    source_kind: 'saved_lead',
    lead_id: cleanText(lead.id),
    address_or_source_text: address || cleanText(pick(lead, ['source', 'source_text', 'notes'])) || 'Saved lead needs review',
    location: leadLocation(lead),
    source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
    lead_source_type: sourceType,
    why_this_might_be_a_deal: signals.length ? `Matched ${signals.map((signal) => signal.label).join(', ')} from saved lead evidence.` : 'Saved lead with limited distress evidence.',
    distress_motivation_signals: signals.map((signal) => signal.label),
    missing_evidence: missing,
    confidence_level: confidenceFor(status, addressQuality, isHttpUrl(sourceUrl), signals),
    next_best_action: nextActionFor(status),
    call_angle: callAngleFor(status, signals),
    status,
    dirty_lead_category: dirtyLeadCategory(status),
    pipeline_status: 'New',
    note: '',
    can_send_to_analyzer: status === 'Call Ready' || status === 'Research Ready',
    preview_only: true,
    should_ingest: false,
    created_from: 'existing saved lead'
  }, lead, signals, sourceUrl, sourceType);
}

function candidateHasPropertySpecificProof(candidate, sourceUrl) {
  if (!isHttpUrl(sourceUrl)) return false;
  if (isPropertySpecificSourceUrl(sourceUrl)) return true;
  if (isGenericSourceUrl(sourceUrl)) return false;
  if (isHttpUrl(pick(candidate, ['source_record_url', 'record_url', 'verification_url', 'source_proof_url']))) return true;
  if (isHttpUrl(pick(candidate, ['source_pdf_url'])) && cleanText(pick(candidate, ['file_reference', 'file_name', 'page_number', 'row_number']))) return true;
  if (cleanText(pick(candidate, ['source_record_id', 'source_row_id', 'case_number', 'parcel_id'])) && !/foreclosures\.php|sheriff-sales\.php/i.test(sourceUrl)) return true;
  return false;
}

function cardFromCandidate(candidate, job) {
  const address = cleanText(candidate.property_address || candidate.address);
  const sourceUrl = sourceProofUrl(candidate);
  const signals = strategySignals(candidate, job.strategies);
  const addressQuality = cleanText(candidate.address_quality) || addressQualityFromText(address, candidate.source_proof_text);
  const normalizedAddressQuality = addressQuality === 'valid' || addressQuality === 'junk' || addressQuality === 'missing' || addressQuality === 'partial'
    ? addressQuality
    : addressQualityFromText(address, candidate.source_proof_text);
  const sourceType = sourceTypeFrom(candidate, 'source candidate');
  const hasPropertyProof = candidateHasPropertySpecificProof(candidate, sourceUrl);
  const status = statusFor(candidate, normalizedAddressQuality, hasPropertyProof, signals);
  const missing = Array.from(new Set([]
    .concat(candidate.missing_evidence || [])
    .concat(missingEvidenceFor(normalizedAddressQuality, sourceUrl, signals, sourceType))
    .concat(hasPropertyProof ? [] : ['property-specific source proof'])
    .filter(Boolean)));
  return decorateAcquisitionCard({
    card_id: hashId('fmc', `candidate|${candidate.candidate_id || candidate.id}|${address}|${sourceUrl}`),
    source_kind: 'dallas_preview_candidate',
    candidate_id: cleanText(candidate.candidate_id || candidate.id),
    address_or_source_text: address || cleanText(candidate.source_proof_text) || 'Source candidate needs review',
    location: candidateLocation(candidate),
    source_url: hasPropertyProof && isHttpUrl(sourceUrl) ? sourceUrl : (isHttpUrl(sourceUrl) ? sourceUrl : ''),
    lead_source_type: sourceType,
    why_this_might_be_a_deal: signals.length ? `Official source candidate matched ${signals.map((signal) => signal.label).join(', ')}.` : 'Official Dallas preview candidate with evidence to review.',
    distress_motivation_signals: signals.map((signal) => signal.label),
    missing_evidence: missing,
    confidence_level: confidenceFor(status, normalizedAddressQuality, isHttpUrl(sourceUrl), signals),
    next_best_action: nextActionFor(status),
    call_angle: callAngleFor(status, signals),
    status,
    dirty_lead_category: dirtyLeadCategory(status),
    pipeline_status: 'New',
    note: '',
    can_send_to_analyzer: hasPropertyProof && (status === 'Call Ready' || status === 'Research Ready'),
    source_evidence_status: hasPropertyProof ? 'property-specific source proof present' : 'needs property-specific source proof',
    source_evidence_label: hasPropertyProof ? 'Property-specific source proof' : 'Generic/list source only',
    property_specific_source: hasPropertyProof,
    source_classification: hasPropertyProof ? 'exact_property_source' : 'generic_search_source',
    source_quality: hasPropertyProof ? 'Property-specific public source' : 'Generic/list source; needs property proof',
    quality_explanations: hasPropertyProof ? ['Property-specific public source found'] : ['Generic listing/search page, not exact property proof'],
    preview_only: true,
    should_ingest: false,
    created_from: 'Dallas preview/source candidate'
  }, candidate, signals, sourceUrl, sourceType);
}

function cardFromAnalyzerJob(analyzerJob, job) {
  const address = cleanText(analyzerJob.normalized_address || analyzerJob.input_value);
  const sourceEvidence = Array.isArray(analyzerJob.source_evidence) ? analyzerJob.source_evidence : [];
  const sourceUrl = cleanText((sourceEvidence.find((item) => item && isHttpUrl(item.source_url)) || {}).source_url);
  const probe = Object.assign({}, analyzerJob, {
    source_evidence_text: sourceEvidence.map((item) => `${item.label || ''} ${item.value || ''} ${item.source_url || ''}`).join(' ')
  });
  const signals = strategySignals(probe, job.strategies);
  const addressQuality = addressQualityFromText(address, analyzerJob.input_value);
  const status = statusFor(probe, addressQuality, isHttpUrl(sourceUrl), signals);
  const missing = Array.from(new Set([].concat(analyzerJob.missing_evidence || [], missingEvidenceFor(addressQuality, sourceUrl, signals, analyzerJob.input_type || 'analyzer evidence')).filter(Boolean)));
  return decorateAcquisitionCard({
    card_id: hashId('fmc', `analyzer|${analyzerJob.job_id}|${address}|${sourceUrl}`),
    source_kind: 'ai_deal_analyzer_job',
    analyzer_job_id: cleanText(analyzerJob.job_id),
    lead_id: cleanText(analyzerJob.lead_id),
    address_or_source_text: address || cleanText(analyzerJob.input_value) || 'Analyzer job needs review',
    location: '',
    source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
    lead_source_type: 'analyzer evidence',
    why_this_might_be_a_deal: signals.length ? `Analyzer evidence matched ${signals.map((signal) => signal.label).join(', ')}.` : cleanText(analyzerJob.result_summary || 'Analyzer evidence needs review.'),
    distress_motivation_signals: signals.map((signal) => signal.label),
    missing_evidence: missing,
    confidence_level: confidenceFor(status, addressQuality, isHttpUrl(sourceUrl), signals),
    next_best_action: nextActionFor(status),
    call_angle: callAngleFor(status, signals),
    status,
    dirty_lead_category: dirtyLeadCategory(status),
    pipeline_status: 'New',
    note: '',
    can_send_to_analyzer: false,
    preview_only: true,
    should_ingest: false,
    created_from: 'existing AI Deal Analyzer evidence'
  }, analyzerJob, signals, sourceUrl, 'analyzer evidence');
}

function dirtyLeadCategory(status) {
  if (status === 'Call Ready' || status === 'Research Ready') return 'Research Ready';
  if (status === 'Needs Address Repair') return 'Needs Address Repair';
  if (status === 'Needs Source Proof') return 'Source Repair Needed';
  if (status === 'Support Signal Only') return 'Support Signal Only';
  return 'Junk / Archive Candidate';
}

function cardRank(card) {
  const statusScore = {
    'Call Ready': 100,
    'Research Ready': 80,
    'Needs Source Proof': 45,
    'Support Signal Only': 35,
    'Needs Address Repair': 25,
    'Junk/Archive': 0
  }[card.status] || 0;
  const signalScore = (card.distress_motivation_signals || []).length * 8;
  const sourceScore = card.source_url ? 10 : 0;
  const scoutPriority = Number(card.scout_priority_score || 0) || 0;
  return statusScore + signalScore + sourceScore + scoutPriority;
}

function dedupeCards(cards) {
  const seen = new Set();
  const out = [];
  for (const card of cards) {
    const key = [safeLower(card.address_or_source_text), safeLower(card.source_url), safeLower(card.lead_id || card.candidate_id)].filter(Boolean).join('|') || card.card_id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
  }
  return out;
}

function cardIdentityInput(card) {
  card = card || {};
  const evidence = card.lead_evidence || {};
  return Object.assign({}, card, evidence, {
    normalized_address: cleanText(evidence.normalized_address || card.display_address || card.address_or_source_text),
    address: cleanText(evidence.normalized_address || card.display_address || card.address_or_source_text),
    source_url: cleanText(card.canonical_source_url || card.source_url || card.open_source_url || evidence.canonical_source_url),
    canonical_source_url: cleanText(card.canonical_source_url || evidence.canonical_source_url),
    source_title: cleanText(card.source_title)
  });
}

function cardReadScore(card) {
  const evidence = card && card.lead_evidence || {};
  let score = card && card.address_identity_status === 'canonical' ? 500 : 0;
  if (card && card.property_specific_source) score += 120;
  if (isPropertySpecificSourceUrl(card && (card.canonical_source_url || card.source_url || card.open_source_url))) score += 120;
  if (cleanText(evidence.exact_source_phrase || card && card.exact_source_phrase || card && card.matched_source_phrase)) score += 80;
  if (cleanText(evidence.public_contact_route || card && card.public_contact_route) && cleanText(evidence.public_contact_route || card && card.public_contact_route) !== 'Manual Lookup Needed') score += 40;
  if (cleanText(evidence.analyzer_job_id || card && card.analyzer_job_id)) score += 30;
  if (cleanText(evidence.dossier_id || card && card.dossier_id)) score += 30;
  score += Number(card && card.scout_priority_score || 0) || 0;
  return score;
}

function canonicalizeCardForRead(card, job) {
  const sourceUrl = cleanText(card && (card.canonical_source_url || card.source_url || card.open_source_url || card.lead_evidence && card.lead_evidence.canonical_source_url));
  const readAddress = propertyIdentity.canonicalAddressForRead(cardIdentityInput(card), {
    source_url: sourceUrl,
    source_title: cleanText(card && card.source_title),
    city: cleanText(card && (card.city || job && job.city)),
    state: cleanText(card && (card.state || job && job.state)),
    zip: cleanText(card && (card.zip || job && job.zip))
  });
  const exactPhrase = cleanText(card && (card.exact_source_phrase || card.matched_source_phrase || card.lead_evidence && card.lead_evidence.exact_source_phrase));
  const evidence = leadEvidence.normalizeLeadEvidence(Object.assign({}, card || {}, {
    normalized_address: readAddress.normalized_address,
    source_url: sourceUrl,
    exact_source_phrase: exactPhrase
  }), {
    normalized_address: readAddress.normalized_address,
    canonical_source_url: sourceUrl,
    exact_source_phrase: exactPhrase,
    public_contact_route: cleanText(card && (card.public_contact_route || card.lead_evidence && card.lead_evidence.public_contact_route)),
    comp_status: cleanText(card && (card.comp_status || card.lead_evidence && card.lead_evidence.comp_status))
  });
  const missing = Array.from(new Set([]
    .concat(Array.isArray(card && card.missing_evidence) ? card.missing_evidence : [])
    .concat(Array.isArray(evidence.missing_evidence) ? evidence.missing_evidence : [])
    .concat(readAddress.complete ? [] : [readAddress.address_warning])
    .filter(Boolean)));
  return Object.assign({}, card, {
    address_or_source_text: readAddress.normalized_address,
    display_address: readAddress.normalized_address,
    normalized_address: readAddress.normalized_address,
    city: readAddress.city || cleanText(card && card.city),
    state: readAddress.state || cleanText(card && card.state),
    zip: readAddress.zip || cleanText(card && card.zip),
    address_identity_status: readAddress.address_status,
    address_warning: readAddress.address_warning,
    lead_evidence: evidence,
    missing_evidence: missing,
    preview_only: true,
    should_ingest: false
  });
}

function mergeCardForRead(primary, duplicate) {
  const merged = Object.assign({}, duplicate, primary);
  const primaryEvidence = primary.lead_evidence || {};
  const duplicateEvidence = duplicate.lead_evidence || {};
  merged.lead_evidence = leadEvidence.normalizeLeadEvidence(Object.assign({}, duplicateEvidence, primaryEvidence, merged), {
    normalized_address: primary.lead_evidence && primary.lead_evidence.normalized_address || primary.display_address || primary.address_or_source_text,
    canonical_source_url: cleanText(primaryEvidence.canonical_source_url || primary.canonical_source_url || primary.source_url || duplicateEvidence.canonical_source_url || duplicate.canonical_source_url || duplicate.source_url),
    exact_source_phrase: cleanText(primaryEvidence.exact_source_phrase || duplicateEvidence.exact_source_phrase),
    public_contact_route: cleanText(primaryEvidence.public_contact_route || duplicateEvidence.public_contact_route),
    analyzer_job_id: cleanText(primaryEvidence.analyzer_job_id || duplicateEvidence.analyzer_job_id || primary.analyzer_job_id || duplicate.analyzer_job_id),
    dossier_id: cleanText(primaryEvidence.dossier_id || duplicateEvidence.dossier_id || primary.dossier_id || duplicate.dossier_id),
    comp_status: cleanText(primaryEvidence.comp_status || duplicateEvidence.comp_status)
  });
  merged.exact_source_phrase = cleanText(primary.exact_source_phrase || duplicate.exact_source_phrase || merged.lead_evidence.exact_source_phrase);
  merged.matched_source_phrase = cleanText(primary.matched_source_phrase || duplicate.matched_source_phrase || merged.lead_evidence.exact_source_phrase);
  merged.public_contact_route = cleanText(primary.public_contact_route || duplicate.public_contact_route || merged.lead_evidence.public_contact_route);
  merged.analyzer_job_id = cleanText(primary.analyzer_job_id || duplicate.analyzer_job_id || merged.lead_evidence.analyzer_job_id);
  merged.dossier_id = cleanText(primary.dossier_id || duplicate.dossier_id || merged.lead_evidence.dossier_id);
  merged.legacy_duplicate_card_ids = Array.from(new Set([]
    .concat(primary.legacy_duplicate_card_ids || [])
    .concat(duplicate.legacy_duplicate_card_ids || [])
    .concat(duplicate.card_id ? [duplicate.card_id] : [])
    .filter(Boolean)));
  return merged;
}

function canonicalizeCardsForRead(cards, job) {
  const groups = new Map();
  (Array.isArray(cards) ? cards : []).map((card) => canonicalizeCardForRead(card, job)).forEach((card) => {
    const sourceKey = propertyIdentity.canonicalSourceUrlKey(card.canonical_source_url || card.source_url || card.open_source_url);
    const identityKey = propertyIdentity.canonicalPropertyKey(cardIdentityInput(card));
    const key = card.address_identity_status === 'canonical'
      ? identityKey
      : sourceKey || cleanText(card.card_id);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  });
  return Array.from(groups.values()).map((group) => {
    const sorted = group.slice().sort((a, b) => cardReadScore(b) - cardReadScore(a) || cleanText(b.updated_at || b.created_at).localeCompare(cleanText(a.updated_at || a.created_at)));
    return sorted.slice(1).reduce((primary, duplicate) => mergeCardForRead(primary, duplicate), sorted[0]);
  });
}

function collectLeadCards(job) {
  const leads = db.getLeads ? db.getLeads() : [];
  return (Array.isArray(leads) ? leads : [])
    .filter((lead) => marketMatches(lead, job.market, job.location))
    .map((lead) => cardFromLead(lead, job));
}

function collectCandidateCards(job) {
  if (safeLower(job.market) !== 'dallas' && safeLower(job.market) !== 'texas') return [];
  try {
    const result = dallasOfficialSourceCapture.listOfficialSourceCandidates({ limit: 100 });
    return (Array.isArray(result && result.candidates) ? result.candidates : [])
      .filter((candidate) => marketMatches(candidate, job.market, job.location))
      .map((candidate) => cardFromCandidate(candidate, job));
  } catch (error) {
    return [];
  }
}

function collectAnalyzerCards(job) {
  try {
    const jobs = aiDealAnalyzerJobs.listJobs ? aiDealAnalyzerJobs.listJobs(100) : [];
    return (Array.isArray(jobs) ? jobs : [])
      .filter((analyzerJob) => marketMatches(analyzerJob, job.market, job.location))
      .map((analyzerJob) => cardFromAnalyzerJob(analyzerJob, job));
  } catch (error) {
    return [];
  }
}

async function collectGeminiDiscoveryCards(job, options = {}) {
  const result = await geminiScoutDiscoveryProvider.runGeminiScoutDiscovery(job, options);
  return {
    result,
    cards: Array.isArray(result && result.cards) ? result.cards : []
  };
}

async function collectSearchProviderCards(job, options = {}) {
  const input = {
    market: job.market,
    state: job.state || job.market_state,
    county: job.county || job.market_county,
    city: job.city || job.market_city,
    zips: job.zips || job.zip_codes,
    quantity_target: job.requested_quantity || job.batch_size,
    criteria: job.strategy_labels || job.strategies,
    source_preferences: ['redfin.com', 'realtor.com', 'zillow.com', 'har.com'],
    exclusions: ['bank-owned', 'REO', 'completed auction', 'sold/history-only', 'OpenData archive'],
    max_results: job.max_candidate_urls || FRESH_BATCH_DEFAULT_BOUNDS.max_candidate_urls,
    timeout_ms: options.timeout_ms,
    query_group: options.query_group || 'search_provider_fallback',
    mock_results: options.mock_search_results || options.mock_results
  };
  const result = await searchProviderWorker.runSearchProvider(input, options);
  return {
    result,
    cards: Array.isArray(result && result.cards) ? result.cards : []
  };
}

function withTimeout(promise, timeoutMs, fallbackFactory) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallbackFactory()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function providerAttemptKey(stage, job) {
  return [
    cleanText(stage && stage.provider) || 'gemini',
    cleanText(stage && stage.purpose) || 'discovery_primary',
    cleanText(stage && stage.query_group) || 'default',
    cleanText(job && (job.market || job.location || job.city || job.county || job.state)) || 'market'
  ].join('|').toLowerCase();
}

function hasWeakFreshBatchOutput(cards, providerResults) {
  const list = Array.isArray(cards) ? cards : [];
  if (!list.length) return true;
  const validish = list.filter((card) => card.batch_group === 'Strong Leads' || card.batch_group === 'Valid Leads - Needs Comps');
  const urlOnly = (Array.isArray(providerResults) ? providerResults : []).reduce((total, result) => total + (Number(result && result.url_only_candidate_count || 0) || 0), 0);
  const missingPhrase = list.filter((card) => !(card.lead_evidence && card.lead_evidence.exact_source_phrase && card.lead_evidence.exact_source_phrase_verbatim === true)).length;
  return !validish.length || urlOnly > 0 || missingPhrase >= Math.ceil(list.length / 2);
}

function providerSummaryFrom(result) {
  result = result || {};
  const rawStatus = cleanText(result.status);
  const status = rawStatus === 'available' || rawStatus === 'provider_available'
    ? 'Available'
    : rawStatus === 'temporarily_unavailable'
      ? 'Temporarily unavailable'
    : rawStatus === 'timed_out' || rawStatus === 'provider_timed_out'
      ? 'Timed out'
    : rawStatus === 'failed' || rawStatus === 'provider_unavailable'
      ? 'Failed'
    : rawStatus === 'provider_rate_limited'
      ? 'Rate limited'
    : rawStatus === 'provider_no_results'
      ? 'No results'
    : rawStatus === 'invalid_provider'
      ? 'Invalid provider'
      : 'Not configured';
  const providerName = cleanText(result.provider) || (/^provider_/i.test(rawStatus) ? 'Search' : 'Gemini');
  const envDiagnostics = result.env_diagnostics && typeof result.env_diagnostics === 'object' ? result.env_diagnostics : {};
  const missingConfig = Array.isArray(result.missing_config) ? result.missing_config.map(cleanText).filter(Boolean) : Array.isArray(envDiagnostics.missing_config) ? envDiagnostics.missing_config.map(cleanText).filter(Boolean) : [];
  const readiness = cleanText(result.readiness || envDiagnostics.readiness);
  return {
    saved_leads_mode: 'Available',
    gemini_live_discovery: providerName === 'Gemini' ? status : '',
    search_fallback_status: providerName === 'Gemini' ? '' : status,
    search_provider_status: rawStatus,
    search_provider_configured: providerName !== 'Gemini' ? result.configured === true || readiness === 'ready' : false,
    search_provider_readiness: readiness,
    search_provider_normalized: cleanText(envDiagnostics.search_provider_normalized || providerName),
    search_provider_missing_config: missingConfig,
    search_provider_next_action: cleanText(result.next_action || envDiagnostics.next_action),
    search_provider_env: {
      enable_search_provider_present: envDiagnostics.enable_search_provider_present === true,
      enable_search_provider_enabled: envDiagnostics.enable_search_provider_enabled === true,
      search_provider_present: envDiagnostics.search_provider_present === true,
      search_provider_normalized: cleanText(envDiagnostics.search_provider_normalized),
      serper_api_key_present: envDiagnostics.serper_api_key_present === true,
      serper_api_key_length_bucket: cleanText(envDiagnostics.serper_api_key_length_bucket),
      brave_search_api_key_present: envDiagnostics.brave_search_api_key_present === true,
      google_cse_api_key_present: envDiagnostics.google_cse_api_key_present === true,
      google_cse_cx_present: envDiagnostics.google_cse_cx_present === true,
      timeout_ms: Number(envDiagnostics.timeout_ms || 0) || 0,
      max_results: Number(envDiagnostics.max_results || 0) || 0,
      readiness,
      missing_config: missingConfig,
      next_action: cleanText(result.next_action || envDiagnostics.next_action)
    },
    provider: providerName,
    model: cleanText(result.model),
    attempted: result.attempted === true,
    grounding_present: result.grounding_present === true,
    source_urls_found_count: Number(result.source_urls_found_count || 0) || 0,
    candidates_found: Number(result.candidates_found || 0) || 0,
    grounding_urls_found: Number(result.grounding_urls_found || 0) || 0,
    urls_harvested: Number(result.urls_harvested || 0) || 0,
    property_specific_urls: Number(result.property_specific_urls || 0) || 0,
    generic_urls_filtered: Number(result.generic_urls_filtered || 0) || 0,
    cards_from_grounding_urls: Number(result.cards_from_grounding_urls || 0) || 0,
    provider_output_format: cleanText(result.provider_output_format),
    provider_output_repaired: result.provider_output_repaired === true,
    gemini_query_groups_used: Array.isArray(result.gemini_query_groups_used) ? result.gemini_query_groups_used.map(cleanText).filter(Boolean).slice(0, 20) : [],
    gemini_query_group_count: Number(result.gemini_query_group_count || 0) || 0,
    gemini_output_valid_json: result.gemini_output_valid_json === true,
    gemini_output_repaired: result.gemini_output_repaired === true || result.provider_output_repaired === true,
    gemini_grounding_urls_count: Number(result.gemini_grounding_urls_count || result.grounding_urls_found || 0) || 0,
    gemini_grounding_support_count: Number(result.gemini_grounding_support_count || result.grounding_support_count || 0) || 0,
    gemini_candidates_recovered_count: Number(result.gemini_candidates_recovered_count || 0) || 0,
    gemini_url_only_count: Number(result.gemini_url_only_count || result.url_only_candidate_count || 0) || 0,
    gemini_unusable_output_reason: cleanText(result.gemini_unusable_output_reason),
    gemini_failure_reason: cleanText(result.gemini_failure_reason),
    gemini_recommended_next_action: cleanText(result.gemini_recommended_next_action),
    gemini_failure_buckets: result.gemini_failure_buckets || {},
    gemini_self_audit_rejected_count: Number(result.gemini_self_audit_rejected_count || 0) || 0,
    evidence_sources_merged: Number(result.evidence_sources_merged || 0) || 0,
    grounding_support_count: Number(result.grounding_support_count || 0) || 0,
    url_only_candidate_count: Number(result.url_only_candidate_count || 0) || 0,
    candidates_needing_enrichment: Number(result.candidates_needing_enrichment || 0) || 0,
    evidence_enrichment_attempts: Number(result.evidence_enrichment_attempts || 0) || 0,
    evidence_enriched_count: Number(result.evidence_enriched_count || 0) || 0,
    source_refresh_blocked_count: Number(result.source_refresh_blocked_count || 0) || 0,
    exact_phrases_verified: Number(result.exact_phrases_verified || 0) || 0,
    search_results_found: Number(result.search_results_found || result.result_count || 0) || 0,
    snippet_phrases_verified: Number(result.snippet_phrases_verified || 0) || 0,
    weak_snippets_count: Number(result.weak_snippets_count || 0) || 0,
    provider_attempts: Array.isArray(result.provider_attempts) ? result.provider_attempts : [],
    research_ready_count: Number(result.research_ready_count || 0) || 0,
    needs_source_proof_count: Number(result.needs_source_proof_count || 0) || 0,
    needs_address_repair_count: Number(result.needs_address_repair_count || 0) || 0,
    source_urls: Array.isArray(result.source_urls) ? result.source_urls.filter(isHttpUrl).slice(0, 20) : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.map(cleanText).filter(Boolean).slice(0, 10) : [],
    message: cleanText(result.message)
  };
}

function noAutoIngestionStatus(job, cards) {
  const checked = Array.isArray(cards) ? cards.length : 0;
  return {
    added: 0,
    deduped: 0,
    checked,
    queued: 0,
    queue_count: 0,
    rows: [],
    status: 'passed',
    persist_scope: 'batch_only',
    message: job && job.fresh_batch
      ? 'Fresh Lead Batch persisted only batch cards and diagnostics; manual review queue write skipped.'
      : 'No automatic ingestion requested.'
  };
}

async function runJob(jobId, options = {}) {
  const jobs = readJobs(options.storePath);
  const idx = jobs.findIndex((candidate) => candidate.job_id === jobId);
  if (idx < 0) {
    const err = new Error('Deal Finder job not found.');
    err.status = 404;
    throw err;
  }
  let job = jobs[idx];
  let providerSummary = providerSummaryFrom({ status: 'not_configured', message: 'Deal Finder used saved leads mode only.' });
  try {
    if (job.batch_progress && job.batch_progress.cancellation_requested === true) {
      job = Object.assign({}, job, {
        updated_at: nowIso(),
        status: 'cancelled',
        batch_status: 'cancelled',
        batch_audit: Object.assign(emptyBatchAudit(job.requested_quantity || job.batch_size), job.batch_audit || {}, { batch_status: 'cancelled' })
      });
      jobs[idx] = job;
      writeStore(jobs, options.storePath);
      return publicJob(job);
    }
    const runStarted = Date.now();
    const startedAt = cleanText(job && job.batch_progress && job.batch_progress.started_at) || nowIso();
    const progress = Object.assign({
      started_at: startedAt,
      finished_at: '',
      duration_ms: 0,
      cancellation_requested: false,
      provider_attempts_completed: [],
      provider_attempts_failed: [],
      provider_attempts_skipped: [],
      provider_attempts: [],
      current_stage: 'starting',
      candidates_discovered: 0,
      candidates_verified: 0,
      valid_count: 0,
      last_progress_at: startedAt
    }, job.batch_progress || {}, {
      started_at: startedAt,
      finished_at: '',
      duration_ms: 0,
      current_stage: 'starting',
      provider_attempts: Array.isArray(job && job.batch_progress && job.batch_progress.provider_attempts) ? job.batch_progress.provider_attempts : [],
      last_progress_at: nowIso()
    });
    job = Object.assign({}, job, {
      started_at: startedAt,
      status: job.fresh_batch ? 'running' : job.status,
      batch_status: job.fresh_batch ? 'running' : job.batch_status,
      batch_progress: progress
    });
    jobs[idx] = job;
    writeStore(jobs, options.storePath);
    const leadCards = collectLeadCards(job).slice(0, job.max_candidate_urls || FRESH_BATCH_DEFAULT_BOUNDS.max_candidate_urls);
    const candidateCards = collectCandidateCards(job).slice(0, job.max_candidate_urls || FRESH_BATCH_DEFAULT_BOUNDS.max_candidate_urls);
    const analyzerCards = collectAnalyzerCards(job).slice(0, job.max_candidate_urls || FRESH_BATCH_DEFAULT_BOUNDS.max_candidate_urls);
    const geminiCards = [];
    const providerResults = [];
    const maxProviderCalls = job.fresh_batch ? Number(job.max_provider_calls || FRESH_BATCH_DEFAULT_BOUNDS.max_provider_calls) || FRESH_BATCH_DEFAULT_BOUNDS.max_provider_calls : 1;
    const stagePlans = job.fresh_batch
      ? [
        { provider: 'gemini', purpose: 'discovery_primary', query_group: 'redfin_realtor_priority' },
        { provider: 'search', purpose: 'search_fallback', query_group: 'search_provider_fallback' },
        { provider: 'gemini', purpose: 'evidence_enrichment', query_group: 'grouped_property_source_enrichment' }
      ]
      : [{ provider: 'gemini', purpose: 'discovery_primary', query_group: 'default' }];
    const completedStageKeys = new Set([].concat(progress.provider_attempts_completed || [], progress.provider_attempts_failed || []));
    for (const stage of stagePlans) {
      if (providerResults.length >= maxProviderCalls) break;
      const stageKey = providerAttemptKey(stage, job);
      if (completedStageKeys.has(stageKey) || completedStageKeys.has(stage.purpose)) {
        progress.provider_attempts_skipped = Array.from(new Set([].concat(progress.provider_attempts_skipped || [], [stageKey])));
        continue;
      }
      if (progress.cancellation_requested === true) break;
      const elapsed = Date.now() - runStarted;
      if (elapsed >= (job.hard_timeout_ms || FRESH_BATCH_DEFAULT_BOUNDS.hard_timeout_ms)) break;
      const currentCards = dedupeCards([].concat(leadCards, candidateCards, analyzerCards, geminiCards));
      const currentClassified = job.fresh_batch ? canonicalizeCardsForRead(currentCards, job).map((card) => qualityGateCard(card, job, {
        seenIndex: buildGlobalSeenIndex(job, jobs, options),
        currentSeen: new Set(),
        providerAttempts: providerResults.length
      })) : currentCards;
      const currentValidCount = currentClassified.filter((card) => card.batch_group === 'Strong Leads' || card.batch_group === 'Valid Leads - Needs Comps').length;
      progress.valid_count = currentValidCount;
      if (job.fresh_batch && currentValidCount >= (job.requested_quantity || job.batch_size || 0)) break;
      if (stage.provider === 'search' && !hasWeakFreshBatchOutput(currentClassified, providerResults)) {
        progress.provider_attempts_skipped = Array.from(new Set([].concat(progress.provider_attempts_skipped || [], [stageKey])));
        continue;
      }
      if (stage.purpose === 'evidence_enrichment') {
        const enrichable = currentClassified
          .filter((card) => isPropertySpecificSourceUrl(card.canonical_source_url || card.source_url) && !(card.lead_evidence && card.lead_evidence.exact_source_phrase && card.lead_evidence.exact_source_phrase_verbatim === true))
          .slice(0, 10);
        if (!enrichable.length) {
          progress.provider_attempts_skipped = Array.from(new Set([].concat(progress.provider_attempts_skipped || [], [stageKey])));
          continue;
        }
        stage.enrichment_candidates = enrichable;
      }
      const attemptStarted = nowIso();
      progress.current_stage = stage.purpose;
      progress.last_progress_at = attemptStarted;
      progress.provider_attempts = [].concat(progress.provider_attempts || [], [{
        provider: stage.provider || 'gemini',
        purpose: stage.purpose,
        query_group: stage.query_group,
        attempt_key: stageKey,
        model: '',
        started_at: attemptStarted,
        finished_at: '',
        status: 'running',
        result_count: 0,
        candidate_count: 0,
        grounded_url_count: 0,
        snippet_phrase_count: 0,
        evidence_enriched_count: 0,
        error_category: ''
      }]);
      job = Object.assign({}, job, { updated_at: nowIso(), batch_progress: progress });
      jobs[idx] = job;
      writeStore(jobs, options.storePath);
      const timeoutMs = Math.min(job.provider_timeout_ms || FRESH_BATCH_DEFAULT_BOUNDS.provider_timeout_ms, Math.max(1000, (job.hard_timeout_ms || FRESH_BATCH_DEFAULT_BOUNDS.hard_timeout_ms) - elapsed));
      const collector = stage.provider === 'search' ? collectSearchProviderCards : collectGeminiDiscoveryCards;
      const providerDiscovery = await withTimeout(
        collector(job, Object.assign({}, options, {
          timeout_ms: timeoutMs,
          max_candidate_urls: job.max_candidate_urls || FRESH_BATCH_DEFAULT_BOUNDS.max_candidate_urls,
          purpose: stage.purpose,
          query_group: stage.query_group,
          enrichment_candidates: stage.enrichment_candidates || []
        })),
        timeoutMs,
        () => ({
          result: {
            status: stage.provider === 'search' ? 'provider_timed_out' : 'timed_out',
            provider: stage.provider === 'search' ? 'Search' : 'Gemini',
            attempted: true,
            message: stage.provider === 'search' ? 'Search provider timed out before Fresh Lead Batch budget completed.' : 'Gemini provider timed out before Fresh Lead Batch budget completed.',
            warnings: ['Provider timeout reached. Partial results preserved.'],
            provider_attempts: [{
              provider: stage.provider || 'gemini',
              purpose: stage.purpose,
              query_group: stage.query_group,
              status: stage.provider === 'search' ? 'provider_timed_out' : 'timed_out',
              error_category: stage.provider === 'search' ? 'provider_timed_out' : 'timed_out'
            }]
          },
          cards: []
        })
      );
      const result = providerDiscovery.result || {};
      providerResults.push(result);
      geminiCards.push(...(Array.isArray(providerDiscovery.cards) ? providerDiscovery.cards : []));
      const latestAttempt = progress.provider_attempts[progress.provider_attempts.length - 1] || {};
      const attemptProvider = cleanText(result.provider) || (stage.provider === 'search' ? 'Search' : 'Gemini');
      Object.assign(latestAttempt, {
        provider: attemptProvider,
        model: cleanText(result.model),
        finished_at: nowIso(),
        status: result.status || 'not_configured',
        result_count: Number(result.result_count || result.search_results_found || 0) || 0,
        candidate_count: Number(result.candidates_found || 0) || 0,
        grounded_url_count: Number(result.source_urls_found_count || 0) || 0,
        snippet_phrase_count: Number(result.snippet_phrases_verified || 0) || 0,
        evidence_enriched_count: Number(result.evidence_enriched_count || 0) || 0,
        error_category: result.status === 'available' || result.status === 'provider_available' ? '' : cleanText(result.error_category || result.status),
        warning_message: Array.isArray(result.warnings) ? cleanText(result.warnings[0]) : ''
      });
      if (result.attempted === true) {
        if (result.status === 'available' || result.status === 'provider_available') progress.provider_attempts_completed = Array.from(new Set([].concat(progress.provider_attempts_completed || [], [stageKey])));
        else progress.provider_attempts_failed = Array.from(new Set([].concat(progress.provider_attempts_failed || [], [stageKey])));
      }
      progress.candidates_discovered = geminiCards.length;
      progress.candidates_verified = geminiCards.length;
      progress.last_progress_at = latestAttempt.finished_at;
    }
    providerSummary = aggregateProviderSummary(providerResults);
    const existingBatchCards = job.fresh_batch && Array.isArray(job.cards) ? job.cards : [];
    let cards = dedupeCards(existingBatchCards.concat(leadCards, candidateCards, analyzerCards, geminiCards))
      .sort((a, b) => cardRank(b) - cardRank(a))
      .slice(0, job.fresh_batch ? (job.max_candidate_urls || FRESH_BATCH_DEFAULT_BOUNDS.max_candidate_urls) : (job.batch_size || MAX_BATCH_SIZE));
    cards = canonicalizeCardsForRead(cards, job);
    if (job.fresh_batch) {
      const guardContext = {
        seenIndex: buildGlobalSeenIndex(job, jobs, options),
        currentSeen: new Set(),
        providerAttempts: providerResults.length
      };
      cards = cards.map((card) => qualityGateCard(card, job, guardContext))
        .sort((a, b) => cardRank(b) - cardRank(a));
    }
    const validCards = cards.filter((card) => card.batch_group === 'Strong Leads' || card.batch_group === 'Valid Leads - Needs Comps');
    const outputCards = job.fresh_batch
      ? validCards.slice(0, job.requested_quantity || job.batch_size).concat(cards.filter((card) => card.batch_group !== 'Strong Leads' && card.batch_group !== 'Valid Leads - Needs Comps'))
      : cards.slice(0, job.batch_size || MAX_BATCH_SIZE);
    const batchAudit = job.fresh_batch ? auditBatchCards(outputCards, job, providerSummary) : emptyBatchAudit(job.batch_size);
    const qualityAudit = job.fresh_batch ? sourceQualityAuditor.auditBatch({ cards: outputCards, batchAudit, providerSummary }) : {};
    const finishedAt = nowIso();
    const providerUnavailable = /Temporarily unavailable|Timed out|Failed|Not configured|Rate limited/i.test(`${providerSummary.gemini_live_discovery || ''} ${providerSummary.search_fallback_status || ''}`);
    const batchStatus = job.fresh_batch
      ? (batchAudit.valid_new_leads >= batchAudit.requested ? 'completed' : providerUnavailable && !validCards.length ? 'provider_unavailable' : 'partial_success')
      : '';
    if (job.fresh_batch) batchAudit.batch_status = batchStatus;
    const manualReview = job.fresh_batch
      ? noAutoIngestionStatus(job, cards)
      : manualReviewQueue.addScoutBlockers(job, cards);
    const eligibleCount = outputCards.filter((card) => card.status === 'Call Ready' || card.status === 'Research Ready').length;
    const businessPass = eligibleCount > 0;
    job = Object.assign({}, job, {
      updated_at: nowIso(),
      status: job.fresh_batch ? batchStatus : 'complete',
      batch_status: batchStatus,
      batch_progress: Object.assign({}, progress, {
        current_stage: batchStatus,
        valid_count: batchAudit.valid_new_leads,
        candidates_discovered: geminiCards.length,
        candidates_verified: outputCards.length,
        last_progress_at: finishedAt,
        finished_at: finishedAt,
        duration_ms: Date.now() - runStarted
      }),
      cards: outputCards,
      counts: summarizeCards(outputCards),
      batch_audit: Object.assign({}, batchAudit, qualityAudit, { duration_ms: Date.now() - runStarted }),
      source_summary: {
        existing_leads_checked: leadCards.length,
        dallas_preview_candidates_checked: candidateCards.length,
        analyzer_jobs_checked: analyzerCards.length,
        gemini_live_cards_checked: geminiCards.length,
        gemini_source_urls_found_count: providerSummary.source_urls_found_count,
        grounding_urls_found: providerSummary.grounding_urls_found,
        urls_harvested: providerSummary.urls_harvested,
        property_specific_urls: providerSummary.property_specific_urls,
        generic_urls_filtered: providerSummary.generic_urls_filtered,
        cards_from_grounding_urls: providerSummary.cards_from_grounding_urls,
        provider_output_format: providerSummary.provider_output_format,
        provider_output_repaired: providerSummary.provider_output_repaired,
        gemini_query_groups_used: providerSummary.gemini_query_groups_used,
        gemini_output_valid_json: providerSummary.gemini_output_valid_json,
        gemini_output_repaired: providerSummary.gemini_output_repaired,
        gemini_grounding_urls_count: providerSummary.gemini_grounding_urls_count,
        gemini_grounding_support_count: providerSummary.gemini_grounding_support_count,
        gemini_candidates_recovered_count: providerSummary.gemini_candidates_recovered_count,
        gemini_url_only_count: providerSummary.gemini_url_only_count,
        gemini_unusable_output_reason: providerSummary.gemini_unusable_output_reason,
        gemini_failure_reason: providerSummary.gemini_failure_reason,
        gemini_recommended_next_action: providerSummary.gemini_recommended_next_action,
        gemini_failure_buckets: providerSummary.gemini_failure_buckets,
        gemini_self_audit_rejected_count: providerSummary.gemini_self_audit_rejected_count,
        evidence_sources_merged: providerSummary.evidence_sources_merged,
        grounding_support_count: providerSummary.grounding_support_count,
        url_only_candidate_count: providerSummary.url_only_candidate_count,
        candidates_needing_enrichment: providerSummary.candidates_needing_enrichment,
        evidence_enrichment_attempts: providerSummary.evidence_enrichment_attempts,
        evidence_enriched_count: providerSummary.evidence_enriched_count,
        source_refresh_blocked_count: providerSummary.source_refresh_blocked_count,
        exact_phrases_verified: providerSummary.exact_phrases_verified,
        search_fallback_status: providerSummary.search_fallback_status,
        search_provider_status: providerSummary.search_provider_status,
        search_provider_configured: providerSummary.search_provider_configured === true,
        search_provider_readiness: providerSummary.search_provider_readiness,
        search_provider_normalized: providerSummary.search_provider_normalized,
        search_provider_missing_config: providerSummary.search_provider_missing_config,
        search_provider_next_action: providerSummary.search_provider_next_action,
        search_provider_env: providerSummary.search_provider_env,
        search_results_found: providerSummary.search_results_found,
        snippet_phrases_verified: providerSummary.snippet_phrases_verified,
        weak_snippets_count: providerSummary.weak_snippets_count,
        zero_callable_explanation: qualityAudit.zero_callable_explanation,
        zero_callable_next_action: qualityAudit.zero_callable_next_action,
        quality_buckets: qualityAudit.quality_buckets,
        research_ready_count: providerSummary.research_ready_count,
        needs_source_proof_count: providerSummary.needs_source_proof_count,
        needs_address_repair_count: providerSummary.needs_address_repair_count,
        manual_review_rows_added: manualReview.added,
        manual_review_rows_deduped: manualReview.deduped,
        manual_review_queue_count: manualReview.queue_count,
        no_auto_ingestion_status: manualReview.status || 'passed',
        batch_persisted_scope: manualReview.persist_scope || 'batch_only',
        no_auto_ingestion_message: manualReview.message || '',
        business_pass: businessPass,
        business_pass_label: businessPass ? 'Business PASS: usable candidates were produced.' : 'Business FAIL: no eligible candidates were produced; no downstream records were auto-created.'
      },
      provider_status: providerResults.length ? (providerResults[providerResults.length - 1].status || 'not_configured') : 'not_configured',
      provider_message: providerSummary.message || 'Deal Finder used saved leads mode only.',
      provider_summary: Object.assign({}, providerSummary, {
        zero_callable_explanation: qualityAudit.zero_callable_explanation,
        zero_callable_next_action: qualityAudit.zero_callable_next_action,
        quality_buckets: qualityAudit.quality_buckets,
        manual_review_rows_added: manualReview.added,
        manual_review_rows_deduped: manualReview.deduped,
        manual_review_queue_count: manualReview.queue_count,
        no_auto_ingestion_status: manualReview.status || 'passed',
        batch_persisted_scope: manualReview.persist_scope || 'batch_only',
        no_auto_ingestion_message: manualReview.message || '',
        business_pass: businessPass,
        business_pass_label: businessPass ? 'Business PASS: usable candidates were produced.' : 'Business FAIL: no eligible candidates were produced; no downstream records were auto-created.'
      }),
      business_pass: businessPass,
      business_pass_label: businessPass ? 'Business PASS: usable candidates were produced.' : 'Business FAIL: no eligible candidates were produced; no downstream records were auto-created.',
      no_auto_ingestion_status: manualReview.status || 'passed',
      persist_scope: manualReview.persist_scope || 'batch_only',
      error: ''
    });
    jobs[idx] = job;
    writeStore(jobs, options.storePath);
    return publicJob(job);
  } catch (error) {
    job = Object.assign({}, job, {
      updated_at: nowIso(),
      status: 'failed',
      batch_status: job.fresh_batch ? 'failed_cleanly' : job.batch_status,
      error: error && error.message ? error.message : 'Deal Finder job failed.',
      cards: [],
      counts: emptyCounts(),
      batch_audit: Object.assign(emptyBatchAudit(job.requested_quantity || job.batch_size), {
        batch_status: 'failed_cleanly',
        warnings: [error && error.message ? error.message : 'Deal Finder job failed.']
      }),
      provider_summary: Object.assign(providerSummary || providerSummaryFrom({ status: 'failed', message: 'Deal Finder job failed before provider discovery.' }), {
        warnings: [error && error.message ? error.message : 'Deal Finder job failed.']
      })
    });
    jobs[idx] = job;
    writeStore(jobs, options.storePath);
    return publicJob(job);
  }
}

function findCard(job, cardId) {
  const card = (Array.isArray(job && job.cards) ? job.cards : []).find((candidate) => candidate.card_id === cardId);
  if (!card) {
    const err = new Error('Deal Finder card not found.');
    err.status = 404;
    throw err;
  }
  return card;
}

function buildAnalyzerItem(job, card) {
  const evidence = leadEvidence.normalizeLeadEvidence(card || {}, {
    analyzer_job_id: '',
    dossier_id: ''
  });
  return {
    input_type: 'pasted_address',
    input_value: evidence.normalized_address || card.address_or_source_text,
    address: evidence.normalized_address || card.address_or_source_text,
    city: card.city || '',
    state: card.state || '',
    zip: card.zip || '',
    county: card.county || '',
    source_url: card.canonical_source_url || card.source_url,
    source_type: card.lead_source_type,
    source: 'Deal Finder',
    lead_ref: card.lead_id || card.candidate_id || card.card_id,
    lead_evidence: evidence,
    scout_context: {
      scout_job_id: job.job_id,
      scout_card_id: card.card_id,
      source_kind: card.source_kind || '',
      original_ref: card.lead_id || card.candidate_id || card.analyzer_job_id || card.card_id,
      source_type: card.lead_source_type || '',
      source_url: card.canonical_source_url || card.source_url || '',
      source_url_original: card.source_url_original || '',
      canonical_source_url: card.canonical_source_url || '',
      source_url_canonicalized: card.source_url_canonicalized === true,
      source_url_canonicalization_note: card.source_url_canonicalization_note || '',
      source_title: card.source_title || '',
      source_quality: card.source_quality || '',
      source_classification: card.source_classification || '',
      source_classification_label: card.source_classification_label || '',
      why_card_exists: card.why_card_exists || '',
      created_from_grounding_url: card.created_from_grounding_url === true,
      address_extracted_from_source_url: card.address_extracted_from_source_url === true,
      property_identity_status: card.property_identity_status || '',
      property_identity_label: card.property_identity_label || '',
      property_identity_basis: card.property_identity_basis || '',
      source_evidence_status: card.source_evidence_status || '',
      source_evidence_label: card.source_evidence_label || '',
      property_specific_source: card.property_specific_source === true,
      market_match: card.market_match || '',
      market_match_basis: card.market_match_basis || '',
      strategy_tags: Array.isArray(card.strategy_tags) ? card.strategy_tags : [],
      provider: card.provider || '',
      provider_grounding_present: card.provider_grounding_present === true,
      provider_source_urls: Array.isArray(card.provider_source_urls) ? card.provider_source_urls : [],
      scout_status: card.status || '',
      scout_reason: card.why_this_might_be_a_deal || '',
      distress_signals: Array.isArray(card.distress_motivation_signals) ? card.distress_motivation_signals : [],
      missing_evidence: Array.isArray(card.missing_evidence) ? card.missing_evidence : [],
      call_angle: card.call_angle || '',
      lead_evidence: evidence
    }
  };
}

function updateCard(jobId, cardId, body, options = {}) {
  const jobs = readJobs(options.storePath);
  const idx = jobs.findIndex((candidate) => candidate.job_id === jobId);
  if (idx < 0) {
    const err = new Error('Deal Finder job not found.');
    err.status = 404;
    throw err;
  }
  const job = jobs[idx];
  const card = findCard(job, cardId);
  const status = cleanText(body && (body.pipeline_status || body.pipelineStatus || body.status));
  if (status && !STATUSES.has(status)) {
    const err = new Error('Invalid Deal Finder status.');
    err.status = 400;
    throw err;
  }
  if (status) card.pipeline_status = status;
  if (body && body.note !== undefined) card.note = cleanText(body.note);
  card.updated_at = nowIso();
  job.updated_at = nowIso();
  job.counts = summarizeCards(job.cards);
  jobs[idx] = job;
  writeStore(jobs, options.storePath);
  return { job: publicJob(job), card };
}

function sendCardToAnalyzer(jobId, cardId, options = {}) {
  const jobs = readJobs(options.storePath);
  const idx = jobs.findIndex((candidate) => candidate.job_id === jobId);
  if (idx < 0) {
    const err = new Error('Deal Finder job not found.');
    err.status = 404;
    throw err;
  }
  const job = jobs[idx];
  const card = findCard(job, cardId);
  if (!card.can_send_to_analyzer) {
    const err = new Error('Repair address/source evidence before sending this card to AI Deal Analyzer.');
    err.status = 400;
    throw err;
  }
  const analyzerJobs = aiDealAnalyzerJobs.createJobs({ items: [buildAnalyzerItem(job, card)] }, { runNow: true });
  card.pipeline_status = 'Sent to Analyzer';
  card.sent_to_analyzer_at = nowIso();
  card.analyzer_job_id = analyzerJobs && analyzerJobs[0] && analyzerJobs[0].job_id || '';
  card.lead_evidence = leadEvidence.normalizeLeadEvidence(card, {
    analyzer_job_id: card.analyzer_job_id
  });
  job.updated_at = nowIso();
  job.counts = summarizeCards(job.cards);
  jobs[idx] = job;
  writeStore(jobs, options.storePath);
  return {
    job: publicJob(job),
    card,
    analyzer_job: analyzerJobs && analyzerJobs[0] || null
  };
}

function sendCardsToAnalyzer(jobId, cardIds, options = {}) {
  const jobs = readJobs(options.storePath);
  const idx = jobs.findIndex((candidate) => candidate.job_id === jobId);
  if (idx < 0) {
    const err = new Error('Deal Finder job not found.');
    err.status = 404;
    throw err;
  }
  const job = jobs[idx];
  const requestedIds = Array.isArray(cardIds) ? Array.from(new Set(cardIds.map(cleanText).filter(Boolean))) : [];
  const selectedCount = Math.max(parseInt(options.selected_count || options.selectedCount || requestedIds.length, 10) || requestedIds.length, requestedIds.length);
  if (!requestedIds.length) {
    const err = new Error('Select Deal Finder cards first.');
    err.status = 400;
    throw err;
  }
  if (selectedCount > 20 || requestedIds.length > 20) {
    const err = new Error('Send up to 20 to AI Deal Analyzer at a time.');
    err.status = 400;
    throw err;
  }
  const cards = requestedIds.map((cardId) => findCard(job, cardId));
  const eligible = cards.filter((card) => card.can_send_to_analyzer === true);
  if (!eligible.length) {
    const err = new Error('Repair address/source evidence before sending Deal Finder cards to AI Deal Analyzer.');
    err.status = 400;
    throw err;
  }
  const analyzerJobs = [];
  let latestResult = null;
  eligible.forEach((card) => {
    latestResult = sendCardToAnalyzer(jobId, card.card_id, options);
    analyzerJobs.push(latestResult.analyzer_job);
  });
  return {
    job: latestResult ? latestResult.job : publicJob(job),
    cards: eligible.map((card) => card.card_id),
    sent: eligible.length,
    blocked: cards.length - eligible.length,
    analyzer_jobs: analyzerJobs
  };
}

function aggregateProviderSummary(results) {
  const list = (Array.isArray(results) ? results : []).filter(Boolean);
  if (!list.length) return providerSummaryFrom({ status: 'not_configured', message: 'Deal Finder used saved leads mode only.' });
  const summaries = list.map(providerSummaryFrom);
  const anyAvailable = summaries.find((item) => item.gemini_live_discovery === 'Available');
  const searchSummary = summaries.find((item) => item.search_fallback_status);
  const last = summaries[summaries.length - 1] || summaries[0];
  const base = anyAvailable || last;
  const sum = (key) => summaries.reduce((total, item) => total + (Number(item[key] || 0) || 0), 0);
  return Object.assign({}, base, {
    attempted: summaries.some((item) => item.attempted === true),
    grounding_present: summaries.some((item) => item.grounding_present === true),
    source_urls_found_count: sum('source_urls_found_count'),
    candidates_found: sum('candidates_found'),
    grounding_urls_found: sum('grounding_urls_found'),
    urls_harvested: sum('urls_harvested'),
    property_specific_urls: sum('property_specific_urls'),
    generic_urls_filtered: sum('generic_urls_filtered'),
    cards_from_grounding_urls: sum('cards_from_grounding_urls'),
    gemini_query_groups_used: Array.from(new Set([].concat(...summaries.map((item) => item.gemini_query_groups_used || [])))).slice(0, 20),
    gemini_query_group_count: sum('gemini_query_group_count'),
    gemini_output_valid_json: summaries.some((item) => item.gemini_output_valid_json === true),
    gemini_output_repaired: summaries.some((item) => item.gemini_output_repaired === true),
    gemini_grounding_urls_count: sum('gemini_grounding_urls_count'),
    gemini_grounding_support_count: sum('gemini_grounding_support_count'),
    gemini_candidates_recovered_count: sum('gemini_candidates_recovered_count'),
    gemini_url_only_count: sum('gemini_url_only_count'),
    gemini_unusable_output_reason: cleanText((summaries.find((item) => item.gemini_unusable_output_reason) || {}).gemini_unusable_output_reason),
    gemini_failure_reason: cleanText((summaries.find((item) => item.gemini_failure_reason) || {}).gemini_failure_reason),
    gemini_recommended_next_action: cleanText((summaries.find((item) => item.gemini_recommended_next_action) || {}).gemini_recommended_next_action),
    gemini_failure_buckets: Object.assign({}, ...summaries.map((item) => item.gemini_failure_buckets || {})),
    gemini_self_audit_rejected_count: sum('gemini_self_audit_rejected_count'),
    evidence_sources_merged: sum('evidence_sources_merged'),
    grounding_support_count: sum('grounding_support_count'),
    url_only_candidate_count: sum('url_only_candidate_count'),
    candidates_needing_enrichment: sum('candidates_needing_enrichment'),
    evidence_enrichment_attempts: sum('evidence_enrichment_attempts'),
    evidence_enriched_count: sum('evidence_enriched_count'),
    source_refresh_blocked_count: sum('source_refresh_blocked_count'),
    exact_phrases_verified: sum('exact_phrases_verified'),
    search_fallback_status: searchSummary ? searchSummary.search_fallback_status : '',
    search_provider_status: searchSummary ? searchSummary.search_provider_status : '',
    search_provider_configured: searchSummary ? searchSummary.search_provider_configured === true : false,
    search_provider_readiness: searchSummary ? searchSummary.search_provider_readiness : '',
    search_provider_normalized: searchSummary ? searchSummary.search_provider_normalized : '',
    search_provider_missing_config: searchSummary ? searchSummary.search_provider_missing_config : [],
    search_provider_next_action: searchSummary ? searchSummary.search_provider_next_action : '',
    search_provider_env: searchSummary ? searchSummary.search_provider_env : {},
    search_results_found: sum('search_results_found'),
    snippet_phrases_verified: sum('snippet_phrases_verified'),
    weak_snippets_count: sum('weak_snippets_count'),
    research_ready_count: sum('research_ready_count'),
    needs_source_proof_count: sum('needs_source_proof_count'),
    needs_address_repair_count: sum('needs_address_repair_count'),
    source_urls: Array.from(new Set([].concat(...summaries.map((item) => item.source_urls || [])))).slice(0, 20),
    warnings: Array.from(new Set([].concat(...summaries.map((item) => item.warnings || [])))).slice(0, 10),
    provider_attempts: [].concat(...summaries.map((item) => item.provider_attempts || [])),
    message: cleanText((list[list.length - 1] && list[list.length - 1].message) || base.message)
  });
}

function continueJob(jobId, options = {}) {
  const jobs = readJobs(options.storePath);
  const idx = jobs.findIndex((candidate) => candidate.job_id === jobId);
  if (idx < 0) {
    const err = new Error('Deal Finder job not found.');
    err.status = 404;
    throw err;
  }
  const job = jobs[idx];
  if (!job.fresh_batch) {
    const err = new Error('Only Fresh Lead Batch jobs can be continued.');
    err.status = 400;
    throw err;
  }
  if (/^(completed|cancelled)$/i.test(cleanText(job.batch_status || job.status))) return publicJob(job);
  if (/^(running|continuing)$/i.test(cleanText(job.status))) {
    const err = new Error('Fresh Lead Batch is already active. Continue did not create a duplicate job.');
    err.status = 409;
    throw err;
  }
  job.status = 'continuing';
  job.batch_status = 'running';
  job.batch_progress = Object.assign({}, job.batch_progress || {}, {
    cancellation_requested: false,
    continued_at: nowIso()
  });
  jobs[idx] = job;
  writeStore(jobs, options.storePath);
  return publicJob(job);
}

function cancelJob(jobId, options = {}) {
  const jobs = readJobs(options.storePath);
  const idx = jobs.findIndex((candidate) => candidate.job_id === jobId);
  if (idx < 0) {
    const err = new Error('Deal Finder job not found.');
    err.status = 404;
    throw err;
  }
  const job = jobs[idx];
  job.status = 'cancelled';
  job.batch_status = 'cancelled';
  job.updated_at = nowIso();
  job.batch_progress = Object.assign({}, job.batch_progress || {}, {
    cancellation_requested: true,
    finished_at: nowIso()
  });
  job.batch_audit = Object.assign(emptyBatchAudit(job.requested_quantity || job.batch_size), job.batch_audit || {}, {
    batch_status: 'cancelled'
  });
  jobs[idx] = job;
  writeStore(jobs, options.storePath);
  return publicJob(job);
}

function publicJob(job) {
  const cards = canonicalizeCardsForRead(job && job.cards, job);
  const batchAudit = job && job.fresh_batch
    ? Object.assign(emptyBatchAudit(job.requested_quantity || job.batch_size), job.batch_audit || {}, {
      requested: job.requested_quantity || job.batch_size || 0,
      batch_status: job.batch_status || job.status
    })
    : job && job.batch_audit;
  return Object.assign({}, job, {
    cards,
    counts: summarizeCards(cards),
    batch_audit: batchAudit,
    batch_result: batchAudit ? {
      requested: batchAudit.requested,
      valid_new_leads: batchAudit.valid_new_leads,
      strong_leads: batchAudit.strong_leads,
      needs_comps: batchAudit.needs_comps,
      research_reference: batchAudit.research_reference,
      duplicates_rejected: batchAudit.duplicates_rejected,
      previous_property_rejections: batchAudit.previous_property_rejections,
      sold_stale_rejected: batchAudit.sold_stale_rejected,
      generic_incomplete_rejected: batchAudit.generic_incomplete_rejected,
      source_blocked: batchAudit.source_blocked,
      provider_attempts: batchAudit.provider_attempts,
      provider_unavailable: batchAudit.provider_unavailable,
      discovery_urls_found: batchAudit.discovery_urls_found,
      structured_candidates_parsed: batchAudit.structured_candidates_parsed,
      url_only_candidates: batchAudit.url_only_candidates,
      evidence_enrichment_attempts: batchAudit.evidence_enrichment_attempts,
      evidence_enriched_candidates: batchAudit.evidence_enriched_candidates,
      exact_phrases_verified: batchAudit.exact_phrases_verified,
      search_results_found: batchAudit.search_results_found,
      snippet_phrases_verified: batchAudit.snippet_phrases_verified,
      weak_snippets_count: batchAudit.weak_snippets_count,
      zero_callable_explanation: batchAudit.zero_callable_explanation,
      zero_callable_next_action: batchAudit.zero_callable_next_action,
      source_refresh_blocked: batchAudit.source_refresh_blocked,
      duration_ms: batchAudit.duration_ms,
      batch_status: batchAudit.batch_status,
      no_auto_ingestion_status: job.no_auto_ingestion_status || job.source_summary && job.source_summary.no_auto_ingestion_status || job.provider_summary && job.provider_summary.no_auto_ingestion_status || '',
      batch_persisted_scope: job.persist_scope || job.source_summary && job.source_summary.batch_persisted_scope || job.provider_summary && job.provider_summary.batch_persisted_scope || ''
    } : null,
    preview_only: true,
    should_ingest: false,
    persist_scope: job && job.persist_scope || (job && job.fresh_batch ? 'batch_only' : ''),
    no_auto_ingestion_status: job && job.no_auto_ingestion_status || (job && job.fresh_batch ? 'passed' : '')
  });
}

module.exports = {
  STORE_FILE,
  MAX_BATCH_SIZE,
  STATUSES,
  createJob,
  listJobs,
  getJob,
  runJob,
  continueJob,
  cancelJob,
  updateCard,
  sendCardToAnalyzer,
  sendCardsToAnalyzer,
  addressQualityFromText,
  strategySignals,
  dirtyLeadCategory,
  acquisitionBucketFor,
  hasAllowedPropertySpecificSource,
  visibleDealFinderGate
};
