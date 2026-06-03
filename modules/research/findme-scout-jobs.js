'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const db = require('../../db');
const aiDealAnalyzerJobs = require('./ai-deal-analyzer-jobs');
const geminiScoutDiscoveryProvider = require('./gemini-scout-discovery-provider');
const dallasOfficialSourceCapture = require('../sources/dallas-official-source-capture');

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
  const safeBatch = batch === 50 ? 50 : batch === 20 ? 20 : 10;
  return {
    market: cleanText(body.market || 'Dallas') || 'Dallas',
    location: cleanText(body.location || body.county || body.city || body.zip || ''),
    strategies: normalizeStrategies(body.strategies || body.strategy || ['foreclosure_notice', 'tax_foreclosure', 'code_violation']),
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
      warnings: []
    },
    safety: 'operator-created Scout job only; no autonomous ingestion, no production lead mutation',
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
  if (marketText === 'dallas') {
    if (!/\bdallas\b|tx\b|texas\b|75[23]\d{2}/.test(text)) return false;
  } else if (marketText === 'texas') {
    if (!/\btx\b|texas\b|75[0-9]\d{2}/.test(text)) return false;
  }
  return !loc || text.indexOf(loc) >= 0;
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
    if (strategy === 'code_violation' && /\b(code violation|code compliance|violation|unsafe structure|nuisance)\b/.test(text)) add(strategy);
    if (strategy === 'auction_soon' && /\b(auction|sale date|auction date|opening bid)\b/.test(text)) add(strategy);
    if ((strategy === 'auction_public' || strategy === 'public_auction') && /\b(auction\.com|public auction|auction|opening bid|bid starts|sale date)\b/.test(text)) add(strategy);
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
  return {
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
  };
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
  const status = statusFor(candidate, normalizedAddressQuality, isHttpUrl(sourceUrl), signals);
  const missing = Array.from(new Set([].concat(candidate.missing_evidence || [], missingEvidenceFor(normalizedAddressQuality, sourceUrl, signals, sourceType)).filter(Boolean)));
  return {
    card_id: hashId('fmc', `candidate|${candidate.candidate_id || candidate.id}|${address}|${sourceUrl}`),
    source_kind: 'dallas_preview_candidate',
    candidate_id: cleanText(candidate.candidate_id || candidate.id),
    address_or_source_text: address || cleanText(candidate.source_proof_text) || 'Source candidate needs review',
    location: candidateLocation(candidate),
    source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
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
    can_send_to_analyzer: status === 'Call Ready' || status === 'Research Ready',
    preview_only: true,
    should_ingest: false,
    created_from: 'Dallas preview/source candidate'
  };
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
  return {
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
  };
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
    const err = new Error('Scout job not found.');
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
        needs_address_repair_count: providerSummary.needs_address_repair_count
      },
    provider_status: geminiDiscovery.result && geminiDiscovery.result.status || 'not_configured',
      provider_message: providerSummary.message || 'Scout used saved leads mode only.',
      provider_summary: providerSummary,
      error: ''
    });
    jobs[idx] = job;
    writeStore(jobs, options.storePath);
    return publicJob(job);
  } catch (error) {
    job = Object.assign({}, job, {
      updated_at: nowIso(),
      status: 'failed',
      error: error && error.message ? error.message : 'Scout job failed.',
      cards: [],
      counts: emptyCounts(),
      provider_summary: Object.assign(providerSummaryFrom({ status: 'failed', message: 'Scout job failed before provider discovery.' }), {
        warnings: [error && error.message ? error.message : 'Scout job failed.']
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
    const err = new Error('Scout card not found.');
    err.status = 404;
    throw err;
  }
  return card;
}

function buildAnalyzerItem(job, card) {
  return {
    input_type: 'pasted_address',
    input_value: card.address_or_source_text,
    address: card.address_or_source_text,
    source_url: card.source_url,
    source_type: card.lead_source_type,
    source: 'FindMe Scout',
    lead_ref: card.lead_id || card.candidate_id || card.card_id,
    scout_context: {
      scout_job_id: job.job_id,
      scout_card_id: card.card_id,
      source_kind: card.source_kind || '',
      original_ref: card.lead_id || card.candidate_id || card.analyzer_job_id || card.card_id,
      source_type: card.lead_source_type || '',
      source_url: card.source_url || '',
      source_title: card.source_title || '',
      source_quality: card.source_quality || '',
      source_classification: card.source_classification || '',
      source_classification_label: card.source_classification_label || '',
      why_card_exists: card.why_card_exists || '',
      created_from_grounding_url: card.created_from_grounding_url === true,
      property_specific_source: card.property_specific_source === true,
      market_match: card.market_match || '',
      strategy_tags: Array.isArray(card.strategy_tags) ? card.strategy_tags : [],
      provider: card.provider || '',
      provider_grounding_present: card.provider_grounding_present === true,
      provider_source_urls: Array.isArray(card.provider_source_urls) ? card.provider_source_urls : [],
      scout_status: card.status || '',
      scout_reason: card.why_this_might_be_a_deal || '',
      distress_signals: Array.isArray(card.distress_motivation_signals) ? card.distress_motivation_signals : [],
      missing_evidence: Array.isArray(card.missing_evidence) ? card.missing_evidence : [],
      call_angle: card.call_angle || ''
    }
  };
}

function updateCard(jobId, cardId, body, options = {}) {
  const jobs = readJobs(options.storePath);
  const idx = jobs.findIndex((candidate) => candidate.job_id === jobId);
  if (idx < 0) {
    const err = new Error('Scout job not found.');
    err.status = 404;
    throw err;
  }
  const job = jobs[idx];
  const card = findCard(job, cardId);
  const status = cleanText(body && (body.pipeline_status || body.pipelineStatus || body.status));
  if (status && !STATUSES.has(status)) {
    const err = new Error('Invalid Scout status.');
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
    const err = new Error('Scout job not found.');
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
    const err = new Error('Scout job not found.');
    err.status = 404;
    throw err;
  }
  const job = jobs[idx];
  const requestedIds = Array.isArray(cardIds) ? Array.from(new Set(cardIds.map(cleanText).filter(Boolean))) : [];
  const selectedCount = Math.max(parseInt(options.selected_count || options.selectedCount || requestedIds.length, 10) || requestedIds.length, requestedIds.length);
  if (!requestedIds.length) {
    const err = new Error('Select Scout cards first.');
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
    const err = new Error('Repair address/source evidence before sending Scout cards to AI Deal Analyzer.');
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
  dirtyLeadCategory
};
