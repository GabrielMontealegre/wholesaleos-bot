'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const db = require('../../db');
const aiDealAnalyzerJobs = require('./ai-deal-analyzer-jobs');
const geminiScoutDiscoveryProvider = require('./gemini-scout-discovery-provider');
const manualReviewQueue = require('./manual-review-queue');
const dallasOfficialSourceCapture = require('../sources/dallas-official-source-capture');
const leadEvidence = require('./lead-evidence');

const DB_PATH = process.env.DB_PATH || './data/db.json';
const DB_FILE = path.resolve(DB_PATH);
const STORE_FILE = path.resolve(
  process.env.FINDME_SCOUT_JOBS_PATH ||
  path.join(path.dirname(DB_FILE), 'findme-scout-jobs.json')
);

const MAX_JOBS = 100;
const MAX_BATCH_SIZE = 50;
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
  const text = `${recordText(record)} ${cleanText(sourceUrl)}`.toLowerCase();
  if (!isHttpUrl(sourceUrl)) return true;
  if (/foreclosure\.com$/i.test(domain)) return true;
  if (/(dallasopendata|opendata|socrata|arcgis)\b/i.test(text)) return true;
  if (/\b(archive|archived|dataset|about this dataset|open data|data portal)\b/i.test(text)) return true;
  if (/\b(code violation|code compliance|violations dataset|public records dataset)\b/i.test(text)) return true;
  if (/\b(bank owned|bank-owned|reo|real estate owned)\b/i.test(text)) return true;
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

function defaultJobInput(body) {
  body = body || {};
  const batch = Number(body.batch_size || body.batchSize || 10);
  const safeBatch = batch === 50 ? 50 : batch === 30 ? 30 : batch === 20 ? 20 : 10;
  const state = cleanText(body.state || body.market_state || '');
  const county = cleanText(body.county || body.market_county || '');
  const city = cleanText(body.city || body.market_city || '');
  const zip = cleanText(body.zip || body.postal_code || '');
  const locationParts = [city, county, state || cleanText(body.market), zip].filter(Boolean);
  const location = cleanText(body.location || locationParts.join(', ') || '');
  return {
    market: cleanText(body.market || state || city || 'Dallas') || 'Dallas',
    location,
    state,
    county,
    city,
    zip,
    include_research: body.include_research !== false,
    include_auction: body.include_auction === true || body.includeAuction === true,
    max_provider_calls: Math.min(Math.max(parseInt(body.max_provider_calls || body.maxProviderCalls || 1, 10) || 1, 1), 3),
    max_comp_attempts: Math.min(Math.max(parseInt(body.max_comp_attempts || body.maxCompAttempts || 0, 10) || 0, 0), 5),
    strategies: normalizeStrategies(body.strategies || body.strategy || ['fixer', 'as_is', 'investor_special', 'cash_only', 'price_cut', 'long_dom', 'failed_listing', 'relisted', 'back_on_market', 'fsbo', 'pre_foreclosure']),
    batch_size: safeBatch
  };
}

function createJob(body, options = {}) {
  const input = defaultJobInput(body);
  const created = nowIso();
  const job = {
    job_id: makeId('fms'),
    created_at: created,
    updated_at: created,
    status: 'queued',
    market: input.market,
    location: input.location,
    state: input.state,
    county: input.county,
    city: input.city,
    zip: input.zip,
    include_research: input.include_research,
    include_auction: input.include_auction,
    max_provider_calls: input.max_provider_calls,
    max_comp_attempts: input.max_comp_attempts,
    strategies: input.strategies,
    strategy_labels: input.strategies.map(strategyLabel),
    batch_size: input.batch_size,
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
      research_ready_count: 0,
      needs_source_proof_count: 0,
      needs_address_repair_count: 0,
      manual_review_rows_added: 0,
      manual_review_queue_count: 0,
      warnings: []
    },
    safety: 'operator-created Deal Finder job only; no autonomous ingestion, no production lead mutation',
    error: ''
  };
  const jobs = readJobs(options.storePath);
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

function providerSummaryFrom(result) {
  result = result || {};
  const status = result.status === 'available'
    ? 'Available'
    : result.status === 'temporarily_unavailable'
      ? 'Temporarily unavailable'
    : result.status === 'timed_out'
      ? 'Timed out'
    : result.status === 'failed'
      ? 'Failed'
      : 'Not configured';
  return {
    saved_leads_mode: 'Available',
    gemini_live_discovery: status,
    provider: 'Gemini',
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
    research_ready_count: Number(result.research_ready_count || 0) || 0,
    needs_source_proof_count: Number(result.needs_source_proof_count || 0) || 0,
    needs_address_repair_count: Number(result.needs_address_repair_count || 0) || 0,
    source_urls: Array.isArray(result.source_urls) ? result.source_urls.filter(isHttpUrl).slice(0, 20) : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.map(cleanText).filter(Boolean).slice(0, 10) : [],
    message: cleanText(result.message)
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
  try {
    const leadCards = collectLeadCards(job);
    const candidateCards = collectCandidateCards(job);
    const analyzerCards = collectAnalyzerCards(job);
    const geminiDiscovery = await collectGeminiDiscoveryCards(job, options);
    const geminiCards = Array.isArray(geminiDiscovery.cards) ? geminiDiscovery.cards : [];
    const providerSummary = providerSummaryFrom(geminiDiscovery.result);
    const cards = dedupeCards(leadCards.concat(candidateCards, analyzerCards, geminiCards))
      .sort((a, b) => cardRank(b) - cardRank(a))
      .slice(0, job.batch_size || MAX_BATCH_SIZE);
    const manualReview = manualReviewQueue.addScoutBlockers(job, cards);
    const eligibleCount = cards.filter((card) => card.status === 'Call Ready' || card.status === 'Research Ready').length;
    const businessPass = eligibleCount > 0 || Number(manualReview.added || 0) > 0 || Number(manualReview.deduped || 0) > 0;
    job = Object.assign({}, job, {
      updated_at: nowIso(),
    status: 'complete',
      cards,
      counts: summarizeCards(cards),
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
        research_ready_count: providerSummary.research_ready_count,
        needs_source_proof_count: providerSummary.needs_source_proof_count,
        needs_address_repair_count: providerSummary.needs_address_repair_count,
        manual_review_rows_added: manualReview.added,
        manual_review_rows_deduped: manualReview.deduped,
        manual_review_queue_count: manualReview.queue_count,
        business_pass: businessPass,
        business_pass_label: businessPass ? 'Business PASS: usable candidates or blocker rows were produced.' : 'Business FAIL: no eligible candidates and no manual review rows were produced.'
      },
    provider_status: geminiDiscovery.result && geminiDiscovery.result.status || 'not_configured',
      provider_message: providerSummary.message || 'Deal Finder used saved leads mode only.',
      provider_summary: Object.assign({}, providerSummary, {
        manual_review_rows_added: manualReview.added,
        manual_review_rows_deduped: manualReview.deduped,
        manual_review_queue_count: manualReview.queue_count,
        business_pass: businessPass,
        business_pass_label: businessPass ? 'Business PASS: usable candidates or blocker rows were produced.' : 'Business FAIL: no eligible candidates and no manual review rows were produced.'
      }),
      business_pass: businessPass,
      business_pass_label: businessPass ? 'Business PASS: usable candidates or blocker rows were produced.' : 'Business FAIL: no eligible candidates and no manual review rows were produced.',
      error: ''
    });
    jobs[idx] = job;
    writeStore(jobs, options.storePath);
    return publicJob(job);
  } catch (error) {
    job = Object.assign({}, job, {
      updated_at: nowIso(),
      status: 'failed',
      error: error && error.message ? error.message : 'Deal Finder job failed.',
      cards: [],
      counts: emptyCounts(),
      provider_summary: Object.assign(providerSummaryFrom({ status: 'failed', message: 'Deal Finder job failed before provider discovery.' }), {
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
    input_value: card.address_or_source_text,
    address: card.address_or_source_text,
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

function publicJob(job) {
  return Object.assign({}, job, {
    cards: Array.isArray(job.cards) ? job.cards.map((card) => Object.assign({}, card, {
      preview_only: true,
      should_ingest: false
    })) : [],
    preview_only: true,
    should_ingest: false
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
