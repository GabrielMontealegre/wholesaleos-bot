// Deploy: 2026-05-13T00:34:00.160Z
// server.js Ã¢ÂÂ Express server for dashboard + REST API
// Serves dashboard at /dashboard/ and API at /api/

require('dotenv').config();
const express = require('express');
const path    = require('path');
const db      = require('./db');
const { validateLead } = require('./modules/lead-validator');
const { scrapeRealAuction } = require('./modules/scraper-realauction');
const _rc = require('./modules/runtime-cache');
const logger = require('pino')({ level: 'info' });
const { dealEngine, runDailyIngestion } = require('./modules/deal-engine');
const { scoutCompsForLead } = require('./modules/research/comp-scout');
const aiDealAnalyzerJobs = require('./modules/research/ai-deal-analyzer-jobs');
const findMeScoutJobs = require('./modules/research/findme-scout-jobs');
const dealCallDossiers = require('./modules/research/deal-call-dossiers');
const manualReviewQueue = require('./modules/research/manual-review-queue');
const searchProviderWorker = require('./modules/research/search-provider-worker');
const callReadyPreviewService = require('./modules/research/call-ready-preview-service');
const selectedDealPacketService = require('./modules/research/selected-deal-packet-service');
const freePublicDealBoardPreviewService = require('./modules/research/free-public-deal-board-preview-service');
const dealBoardQueueService = require('./modules/research/deal-board-queue-service');
const manualEvidencePacketService = require('./modules/research/manual-evidence-packet-service');
const marketDemandIndex = require('./modules/research/market-demand-index');
const providerCapabilityAudit = require('./modules/research/provider-capability-audit');
const multer = require('multer');
const app  = express();
// NOTE: Railway proxy requires trust proxy = 1
app.set('trust proxy', 1);

const PORT = process.env.PORT || 8080;
const ENABLE_BACKGROUND_INGESTION = /^(1|true|yes|on)$/i.test(String(process.env.WOS_ENABLE_BACKGROUND_INGESTION || ''));
if (!ENABLE_BACKGROUND_INGESTION) {
  logger.info('Background ingestion disabled by WOS_ENABLE_BACKGROUND_INGESTION=false');
}

process.on('uncaughtException', function(err) {
  var payload = err && err.stack ? err.stack : err;
  try { logger.fatal({ event: 'uncaughtException', error: payload }); }
  catch (logErr) { console.error('[uncaughtException]', payload, logErr && logErr.message ? logErr.message : logErr); }
  process.exit(1);
});

process.on('unhandledRejection', function(reason) {
  var payload = reason && reason.stack ? reason.stack : reason;
  try { logger.fatal({ event: 'unhandledRejection', error: payload }); }
  catch (logErr) { console.error('[unhandledRejection]', payload, logErr && logErr.message ? logErr.message : logErr); }
  process.exit(1);
});

function getCompAgent() {
  try { return require('./modules/agents/comp-agent'); }
  catch (e) {
    logger.error('[comp-agent] load failed: ' + e.message);
    return null;
  }
}

function getSkipTraceAgent() {
  try { return require('./modules/agents/skip-trace-agent'); }
  catch (e) {
    logger.error('[skip-trace] load failed: ' + e.message);
    return null;
  }
}

function getDallasPreviewPipeline() {
  try { return require('./source-registry/dallas-preview-pipeline'); }
  catch (e) {
    logger.error('[dallas-preview] load failed: ' + e.message);
    return null;
  }
}

function getSourcePreviewIngestion() {
  try { return require('./source-registry/preview-ingestion'); }
  catch (e) {
    logger.error('[source-preview-ingestion] load failed: ' + e.message);
    return null;
  }
}

function getDallasSourceAgent() {
  try { return require('./modules/sources/dallas-source-agent'); }
  catch (e) {
    logger.error('[dallas-source-agent] load failed: ' + e.message);
    return null;
  }
}

function getDallasOfficialSourceCapture() {
  try { return require('./modules/sources/dallas-official-source-capture'); }
  catch (e) {
    logger.error('[dallas-official-source-capture] load failed: ' + e.message);
    return null;
  }
}

function getDallasSourcePriorityRouter() {
  try { return require('./modules/sources/dallas-source-priority-router'); }
  catch (e) {
    logger.error('[dallas-source-priority-router] load failed: ' + e.message);
    return null;
  }
}

function getDallasCompIntelligenceAgent() {
  try { return require('./modules/research/dallas-comp-intelligence-agent'); }
  catch (e) {
    logger.error('[dallas-comp-intelligence-agent] load failed: ' + e.message);
    return null;
  }
}

const enrichQ = require('./enrichment-queue'); // Phase 3A
app.use(express.json({ strict: false, limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.text({ limit: '100mb', type: 'text/plain' }));

// Ã¢ÂÂÃ¢ÂÂ CORS for dashboard Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  next();
});

// Ã¢ÂÂÃ¢ÂÂ Serve dashboard static files Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));
// ── API Rate Limiter (express-rate-limit) ──
// Applied to /api/* only — dashboard and static files are NOT affected
// Safe limits: 200 requests per 15 minutes per IP
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in 15 minutes.' },
  skip: function(req) {
    // Never rate-limit health, internal, or dashboard lead reads
    if (req.path === '/health') return true;
    if (req.ip === '127.0.0.1' || req.ip === '::1') return true;
    // Allow unlimited dashboard reads (GET leads, stats) — only POST/DELETE count
    if (req.method === 'GET' && (req.path.startsWith('/api/leads') || req.path.startsWith('/api/stats') || req.path.startsWith('/api/buyers') || req.path.startsWith('/api/pipeline'))) return true;
    return false;
  }
});
app.use('/api/', apiLimiter);



// ============================================================
// ROLE-BASED ACCESS CONTROL MIDDLEWARE
// ============================================================
function requireAdmin(req, res, next) {
  try {
    const users = db.readDB().users || [];
    // Get session user from cookie or header
    const userId = req.headers['x-user-id'] || req.query._uid || 
                   (req.headers.cookie||'').match(/userId=([^;]+)/)?.[1];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.currentUser = user;
    next();
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

function requireAuth(req, res, next) {
  try {
    const users = db.readDB().users || [];
    const userId = req.headers['x-user-id'] || req.query._uid ||
                   (req.headers.cookie||'').match(/userId=([^;]+)/)?.[1];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.currentUser = user;
    next();
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

// Helper: build reliable property links
function buildPropertyLinks(address, state, zip) {
  const fullAddr = address || '';
  const encoded  = encodeURIComponent(fullAddr);
  
  // Google Maps — always works via search
  const googleMaps = 'https://www.google.com/maps/search/?api=1&query=' + encoded;
  
  // Zillow — use address search (their homepage search, not listing-specific)
  // Strip unit/apt info to improve match
  const cleanAddr = fullAddr.replace(/,?s*(apt|unit|#)s*[wd]+/gi, '').trim();
  const zEncoded  = encodeURIComponent(cleanAddr);
  const zillow    = buildZillowLink(cleanAddr);
  
  // Redfin — use their search page
  const redfin    = 'https://www.redfin.com/city/search?q=' + encoded;
  
  // Rentometer for rental estimates
  const rentometer = 'https://www.rentometer.com/analysis/new?address=' + encoded;
  
  return { googleMaps, zillow, redfin, rentometer };
}

app.get('/dashboard/courthouse-tab.js', (req, res) => res.sendFile(require('path').join(__dirname, 'courthouse-addon', 'courthouse-tab.js')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));
app.get('/dashboard/', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));

// Ã¢ÂÂÃ¢ÂÂ Health check Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/provider-readiness', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    search_provider_readiness: searchProviderWorker.getLiveSearchProviderReadiness()
  });
});
app.get('/', (_, res) => res.json({
  status: 'Montsan REI Bot Ã¢ÂÂ Online',
  dashboard: '/dashboard/',
  leads: db.getLeads().length,
  version: '3.0'
}));

// Ã¢ÂÂÃ¢ÂÂ API: Leads Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function withLeadIntelligence(lead) {
  if (!lead) return lead;
  return Object.assign({}, lead, {
    lead_intelligence: db.computeLeadIntelligence
      ? db.computeLeadIntelligence(lead)
      : null
  });
}

function leadSourceTypeText(lead) {
  var details = lead && lead.source_details;
  var base = [
    lead && lead.source,
    lead && lead.source_name,
    lead && lead.source_type,
    lead && lead.source_key,
    lead && lead.source_slug,
    lead && lead.import_source,
    lead && lead.provider,
    lead && lead.motivation
  ].filter(Boolean);
  if (!details) return base.join(' ');
  if (typeof details === 'string') return details;
  if (typeof details === 'object') {
    return base.concat([details.type, details.source_name, details.label, details.name, details.record_url, details.query_url]).filter(Boolean).join(' ');
  }
  return base.concat([String(details)]).filter(Boolean).join(' ');
}

const LEADS_LIST_DEFAULT_LIMIT = 300;
const LEADS_LIST_MAX_LIMIT = 1000;
const LEADS_LIST_STRING_LIMIT = 2000;

const LEADS_LIST_DROP_KEYS = new Set([
  'raw',
  'raw_data',
  'raw_payload',
  'raw_text',
  'html',
  'html_body',
  'page_html',
  'body_html',
  'pdf_text',
  'document_text',
  'source_html',
  'debug',
  'debug_info',
  'screenshot',
  'screenshot_base64',
  'ocr_text'
]);

function safeLeadListValue(value, depth) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value === 'string') {
    return value.length > LEADS_LIST_STRING_LIMIT
      ? value.slice(0, LEADS_LIST_STRING_LIMIT) + '...[truncated]'
      : value;
  }
  if (typeof value !== 'object') return Number.isFinite(value) || typeof value !== 'number' ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (depth <= 0) return '[truncated_object]';
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(function(item) { return safeLeadListValue(item, depth - 1); }).filter(function(item) { return item !== undefined; });
  }
  var out = {};
  Object.keys(value).slice(0, 80).forEach(function(key) {
    if (LEADS_LIST_DROP_KEYS.has(String(key).toLowerCase())) return;
    var safe = safeLeadListValue(value[key], depth - 1);
    if (safe !== undefined) out[key] = safe;
  });
  return out;
}

function sanitizeLeadForList(lead) {
  var safe = safeLeadListValue(lead || {}, 4) || {};
  var flags = Array.isArray(safe.repair_flags) ? safe.repair_flags.slice() : [];
  var hadRawEvidence = false;
  Object.keys(lead || {}).forEach(function(key) {
    if (LEADS_LIST_DROP_KEYS.has(String(key).toLowerCase())) hadRawEvidence = true;
  });
  if (lead && lead.source_details && typeof lead.source_details === 'object') {
    Object.keys(lead.source_details).forEach(function(key) {
      if (LEADS_LIST_DROP_KEYS.has(String(key).toLowerCase())) hadRawEvidence = true;
    });
  }
  if (hadRawEvidence && flags.indexOf('raw_evidence_omitted_from_list') === -1) flags.push('raw_evidence_omitted_from_list');
  if (flags.length) safe.repair_flags = flags;
  return safe;
}

function parseLeadListLimit(value) {
  var parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return LEADS_LIST_DEFAULT_LIMIT;
  return Math.min(parsed, LEADS_LIST_MAX_LIMIT);
}

function parseLeadListOffset(value) {
  var parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function isPlaceholderLeadForList(lead) {
  if (!lead || typeof lead !== 'object') return false;
  var address = String(lead.address || '').trim();
  if (!address) return true;
  if (/^(column\s*[1-4]|unnamed)$/i.test(address)) return true;
  var rid = String(lead.ref_id || lead.reference_id || lead.lead_reference_id || lead.id || '').trim();
  if (/^(column\s*[1-4]|unnamed)$/i.test(rid)) return true;
  return false;
}

function leadListPick(lead, keys) {
  for (var i = 0; i < keys.length; i++) {
    var parts = String(keys[i]).split('.');
    var value = lead;
    for (var j = 0; j < parts.length; j++) {
      value = value && value[parts[j]] != null ? value[parts[j]] : null;
      if (value == null) break;
    }
    if (value != null && String(value).trim() !== '') return value;
  }
  return '';
}

function leadListHasAny(lead, keys) {
  return !!leadListPick(lead, keys);
}

function leadListAddress(lead) {
  return String(leadListPick(lead || {}, ['address', 'property_address', 'site_address', 'full_address', 'normalized_address']) || '').trim();
}

function isWeakAddressTextForList(address) {
  var text = String(address || '').trim();
  var lower = text.toLowerCase();
  if (!text) return true;
  if (/^(column\s*[1-4]|unnamed)$/i.test(text)) return true;
  if (/^\d{4}\s+(contact|beginning|calendar|schedule|directory)\b/i.test(text)) return true;
  if (/^(phone\s+directory|contact|contacts|beginning|calendar|home|search|login|notice|notices)\b/i.test(lower)) return true;
  if (/\b(phone directory|contact us|skip main navigation|beginning december|court calendar)\b/i.test(lower)) return true;
  if (!/\d/.test(text)) return true;
  return !/\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop|run|sq|square)\b/i.test(text) && text.split(/\s+/).length < 4;
}

function leadListSourceConfidenceScore(lead) {
  var raw = leadListPick(lead || {}, [
    'source_confidence_score',
    'confidence_score',
    'lead_intelligence.source_confidence_score',
    'lead_intelligence.confidence_score'
  ]);
  var parsed = Number(raw);
  if (Number.isFinite(parsed)) return parsed > 1 ? parsed : parsed * 100;
  var text = String(leadListPick(lead || {}, ['source_confidence', 'confidence', 'lead_intelligence.source_confidence']) || '').toLowerCase();
  if (/high|strong|verified/.test(text)) return 85;
  if (/medium|moderate/.test(text)) return 65;
  if (/low|weak|unknown|scanned/.test(text)) return 35;
  return 0;
}

function leadListHasSourceRecord(lead) {
  return leadListHasAny(lead || {}, [
    'source_record_url',
    'record_url',
    'source_url',
    'verification_url',
    'source_pdf_url',
    'evidence_ref',
    'source_reference',
    'source_details.record_url',
    'source_details.source_url',
    'source_details.query_url',
    '_courthouse_metadata.source_url',
    '_courthouse_metadata.source_pdf_url'
  ]);
}

function leadListHasDistressReason(lead) {
  var text = [
    leadListPick(lead || {}, ['distress', 'distress_type', 'doc_type', 'lead_type', 'category', 'source_category', 'priority_flag']),
    Array.isArray(lead && lead.distress_types) ? lead.distress_types.join(' ') : '',
    Array.isArray(lead && lead.priority_flags) ? lead.priority_flags.join(' ') : ''
  ].filter(Boolean).join(' ').toLowerCase();
  return /tax|foreclos|auction|code|violation|probate|lien|vacant|delinquent|sheriff|court/.test(text);
}

function leadListHasAmountEvidence(lead) {
  return leadListHasAny(lead || {}, [
    'amount_owed',
    'tax_due',
    'tax_lien_amount',
    'lien_amount',
    'violation_amount',
    'judgment_amount',
    'minimum_bid',
    'source_amount',
    '_courthouse_metadata.lien_amount'
  ]);
}

function leadListHasDateCaseEvidence(lead) {
  return leadListHasAny(lead || {}, [
    'case_number',
    'cause_number',
    'parcel',
    'apn',
    'parcel_id',
    'account_number',
    'auction_date',
    'sale_date',
    'filing_date',
    'filed_date',
    'source_published_at',
    '_courthouse_metadata.case_number',
    '_courthouse_metadata.parcel',
    '_courthouse_metadata.auction_date',
    '_courthouse_metadata.filed_date'
  ]);
}

function leadListTextBlob(lead) {
  lead = lead || {};
  var details = lead.source_details || {};
  var meta = lead._courthouse_metadata || {};
  var truth = lead.source_truth || {};
  return [
    lead.source,
    lead.source_name,
    lead.source_type,
    lead.source_category,
    lead.source_key,
    lead.source_slug,
    lead.provider,
    lead.county,
    lead.state,
    lead.jurisdiction,
    lead.category,
    lead.type,
    lead.lead_type,
    lead.distress_type,
    lead.doc_type,
    lead.source_url,
    lead.source_record_url,
    typeof details === 'string' ? details : '',
    details.source_name,
    details.source_type,
    details.source_category,
    details.record_url,
    details.query_url,
    details.source_url,
    details.parser_adapter,
    details.source_family,
    truth.source_name,
    truth.source_category,
    truth.source_url,
    truth.source_record_url,
    truth.parser_adapter,
    truth.source_family,
    truth.distress_reason,
    meta.source_url,
    meta.source_pdf_url,
    meta.case_number,
    meta.parcel
  ].filter(Boolean).join(' ').toLowerCase();
}

function isDallasLeadForList(lead) {
  var county = String(leadListPick(lead || {}, ['county', 'source_county', 'source_details.county', 'lead_intelligence.county']) || '').toLowerCase();
  var state = String(leadListPick(lead || {}, ['state', 'state_code', 'source_details.state', 'lead_intelligence.state']) || '').toUpperCase();
  var text = leadListTextBlob(lead);
  return (county.indexOf('dallas') > -1 || /dallas county|dallasopendata|dallascounty\.org|dallascad|sheriffsaleauctions\.com/.test(text)) && (!state || state === 'TX' || /\btx\b|texas/.test(text));
}

const REGIONAL_DFW_COUNTIES = ['dallas', 'tarrant', 'collin', 'denton'];

function leadRegionStateForList(lead) {
  return String(leadListPick(lead || {}, ['state', 'state_code', 'source_details.state', 'lead_intelligence.state']) || '').trim().toUpperCase();
}

function leadRegionCountyForList(lead) {
  return String(leadListPick(lead || {}, ['county', 'source_county', 'source_details.county', 'lead_intelligence.county', 'jurisdiction']) || '').trim().toLowerCase().replace(/\s+county\b/g, '');
}

function leadMatchesCountyNameForList(lead, countyName) {
  var wanted = String(countyName || '').trim().toLowerCase().replace(/\s+county\b/g, '');
  if (!wanted) return true;
  var county = leadRegionCountyForList(lead);
  var text = leadListTextBlob(lead);
  return county.indexOf(wanted) > -1 || text.indexOf(wanted + ' county') > -1;
}

function leadMatchesRegionalModeForList(lead, mode) {
  var normalized = String(mode || 'dallas').trim().toLowerCase();
  var state = leadRegionStateForList(lead);
  var county = leadRegionCountyForList(lead);
  if (normalized === 'national') return true;
  if (normalized === 'texas') return state === 'TX' || /\btx\b|texas/.test(leadListTextBlob(lead));
  if (normalized === 'dfw') {
    return leadMatchesRegionalModeForList(lead, 'texas') && REGIONAL_DFW_COUNTIES.some(function(name) {
      return county.indexOf(name) > -1 || leadListTextBlob(lead).indexOf(name + ' county') > -1;
    });
  }
  return isDallasLeadForList(lead);
}

function isDallasBadRowTextForList(value) {
  var text = String(value || '').trim();
  if (!text) return false;
  if (/^(column\s*[1-4]|unnamed)$/i.test(text)) return true;
  if (/^(contact|contacts|directory|phone directory|page not found|home|search|login)$/i.test(text)) return true;
  return /\b(skip main navigation|phone directory|contact us|page not found|error 404|site map|privacy policy|terms of use|calendar|login|search dallas county)\b/i.test(text);
}

function isDallasPropertyAddressForList(lead) {
  var address = leadListAddress(lead);
  if (!address || isWeakAddressTextForList(address) || isDallasBadRowTextForList(address)) return false;
  if (/^\d{4}\s+(contact|directory|calendar|schedule|phone)\b/i.test(address)) return false;
  return /\d/.test(address) && /\b(st|street|ave|avenue|dr|drive|rd|road|ln|lane|ct|court|cir|circle|blvd|boulevard|way|trl|trail|pkwy|parkway|pl|place|ter|terrace|loop|hwy|highway|sq|square)\b/i.test(address);
}

function dallasSourceFamily(lead) {
  var text = leadListTextBlob(lead);
  if (/tx_dallas_sheriff_tax_sales|sheriff|tax sale|sheriffsaleauctions|minimum bid|strike off/.test(text)) return 'dallas_sheriff_tax_sales';
  if (/foreclos|trustee|auction notice/.test(text)) return 'dallas_foreclosure_notices';
  if (/unsafe structure|fire damage|dangerous building|substandard/.test(text)) return 'dallas_unsafe_structures';
  if (/code|violation|nuisance|open.?data|socrata|dallasopendata/.test(text)) return 'dallas_code_enforcement';
  if (/probate|estate|decedent/.test(text)) return 'dallas_probate_public_notices';
  if (/public notice|legal notice|notice/.test(text)) return 'dallas_public_notices';
  return 'dallas_unknown_source';
}

function dallasParserAdapterForList(lead) {
  return String(leadListPick(lead || {}, [
    'parser_adapter',
    'source_details.parser_adapter',
    'source_truth.parser_adapter',
    'adapter_family',
    '_courthouse_metadata.parser_adapter'
  ]) || (dallasSourceFamily(lead) === 'dallas_code_enforcement' ? 'socrata_adapter' : 'searchable_portal_adapter'));
}

function dallasLeadDistressCategory(lead) {
  var text = leadListTextBlob(lead);
  if (/sheriff|tax sale|tax foreclosure|resale|minimum bid|strike off/.test(text)) return 'tax sale';
  if (/foreclos|trustee|substitute trustee/.test(text)) return 'foreclosure';
  if (/tax|delinquen|lien/.test(text)) return 'tax delinquent';
  if (/unsafe structure|fire damage|dangerous building|substandard/.test(text)) return 'unsafe structure';
  if (/nuisance|public nuisance/.test(text)) return 'nuisance';
  if (/code|violation|permit/.test(text)) return 'code violation';
  if (/probate|estate|decedent/.test(text)) return 'probate';
  if (/vacant|absentee/.test(text)) return 'vacant/absentee';
  if (/public notice|legal notice|notice/.test(text)) return 'public notice';
  return 'unknown distress';
}

function dallasLeadEvidenceSnapshot(lead) {
  var sourceUrl = leadListPick(lead || {}, ['source_record_url', 'record_url', 'source_url', 'verification_url', 'source_details.record_url', 'source_details.source_url', 'source_details.query_url', 'source_truth.source_record_url', 'source_truth.source_url', '_courthouse_metadata.source_url', '_courthouse_metadata.source_pdf_url']);
  var sourceRef = leadListPick(lead || {}, ['evidence_ref', 'source_reference', 'record_id', 'source_details.evidence_ref', 'source_details.source_reference', 'source_truth.evidence_ref', 'lead_intelligence.evidence.record_key']);
  var pdfRef = leadListPick(lead || {}, ['pdf_page', 'page_ref', 'source_page', 'evidence_page', 'source_details.pdf_page', 'source_details.page_ref', 'source_truth.pdf_page_reference', 'lead_intelligence.evidence.page_ref']);
  var caseNumber = leadListPick(lead || {}, ['case_number', 'cause_number', 'source_details.case_number', 'source_details.cause_number', 'source_truth.case_number', '_courthouse_metadata.case_number']);
  var parcel = leadListPick(lead || {}, ['parcel', 'apn', 'parcel_id', 'account_number', 'source_details.parcel', 'source_details.apn', 'source_truth.parcel', 'source_truth.parcel_apn', '_courthouse_metadata.parcel']);
  var timing = leadListPick(lead || {}, ['auction_date', 'sale_date', 'filing_date', 'filed_date', 'source_published_at', 'source_details.sale_date', 'source_details.filing_date', 'source_truth.sale_date', 'source_truth.filing_or_sale_date', '_courthouse_metadata.auction_date', '_courthouse_metadata.filed_date']);
  var amount = leadListPick(lead || {}, ['amount_owed', 'tax_due', 'tax_lien_amount', 'lien_amount', 'violation_amount', 'judgment_amount', 'minimum_bid', 'minimum_bid_amount', 'source_amount', 'source_details.amount_owed', 'source_details.judgment_amount', 'source_details.minimum_bid', 'source_truth.amount', 'source_truth.judgment_amount', 'source_truth.minimum_bid_amount', '_courthouse_metadata.lien_amount']);
  var owner = leadListPick(lead || {}, ['owner_name', 'owner', 'source_details.owner', 'source_details.owner_name']);
  var fileRef = leadListPick(lead || {}, ['source_file_name', 'source_details.file_name', 'source_truth.file_name', 'source_truth.source_file_name']);
  return {
    source_url: sourceUrl || '',
    pdf_page_reference: pdfRef || '',
    source_file_reference: fileRef || '',
    case_or_cause_number: caseNumber || '',
    parcel_apn: parcel || '',
    filing_or_sale_date: timing || '',
    amount_or_judgment: amount || '',
    owner: owner || '',
    source_reference: sourceRef || '',
    has_source_proof: !!(sourceUrl || sourceRef),
    has_property_evidence: !!(caseNumber || parcel || owner),
    has_timing_or_amount: !!(timing || amount)
  };
}

function dallasEvidenceConfidence(lead) {
  var evidence = dallasLeadEvidenceSnapshot(lead);
  var flags = Array.isArray(lead && lead.repair_flags) ? lead.repair_flags.join(' ').toLowerCase() : '';
  var parserText = leadListTextBlob(lead);
  var validDallasAddress = isDallasPropertyAddressForList(lead);
  var extractionQuality = String(leadListPick(lead || {}, ['extraction_quality', 'source_details.extraction_quality', 'source_truth.extraction_quality']) || '').toLowerCase();
  if (!validDallasAddress || /parser_failed|placeholder_row|malformed_pdf_extraction|weak_evidence|missing_address|weak_address/.test(flags) || extractionQuality === 'repair') {
    return { level: 'Repair', score: 20, reason: !validDallasAddress ? 'Address or parser output is not validated as a Dallas property.' : 'Repair flags indicate parser/evidence failure.' };
  }
  if (!evidence.has_source_proof) {
    return { level: 'Low', score: 35, reason: 'No source URL or evidence reference is saved.' };
  }
  if ((evidence.pdf_page_reference || evidence.case_or_cause_number || evidence.parcel_apn) && evidence.has_timing_or_amount) {
    return { level: 'High', score: 90, reason: 'Source proof includes case, parcel, PDF/page, timing, or amount evidence.' };
  }
  if (/socrata|arcgis|structured|opendata|dallasopendata/.test(parserText) && evidence.has_timing_or_amount) {
    return { level: 'Medium', score: 70, reason: 'Structured source row has source proof and timing or amount evidence.' };
  }
  if (evidence.has_property_evidence || evidence.has_timing_or_amount) {
    return { level: 'Medium', score: 60, reason: 'Evidence is property-level but still needs manual verification.' };
  }
  return { level: 'Low', score: 40, reason: 'Source proof exists, but property-level evidence is incomplete.' };
}

function dallasDistressPriorityWeight(category) {
  var weights = {
    foreclosure: 34,
    'tax sale': 32,
    'tax delinquent': 28,
    'unsafe structure': 26,
    nuisance: 22,
    'code violation': 20,
    probate: 16,
    'public notice': 12,
    'vacant/absentee': 10,
    'unknown distress': 0
  };
  return weights[category] || 0;
}

function dallasTimingPriorityScore(value) {
  var timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return 0;
  var days = Math.round((timestamp - Date.now()) / 86400000);
  if (days >= 0 && days <= 45) return 28;
  if (days > 45 && days <= 120) return 18;
  if (days < 0 && days >= -45) return 10;
  return 4;
}

function dallasVerifiedPriorityScore(status) {
  var confidence = status.confidence_level === 'High' ? 30 : status.confidence_level === 'Medium' ? 20 : status.confidence_level === 'Low' ? 8 : 0;
  var evidence = status.evidence || {};
  var completeness = [evidence.source_url, evidence.case_or_cause_number, evidence.parcel_apn, evidence.amount_or_judgment, evidence.owner].filter(Boolean).length * 3;
  return confidence + dallasDistressPriorityWeight(status.distress_category) + dallasTimingPriorityScore(evidence.filing_or_sale_date) + completeness;
}

function dallasLeadFullAddressForList(lead) {
  var address = leadListAddress(lead);
  var city = leadListPick(lead || {}, ['city', 'property_city', 'situs_city', 'source_details.city']) || 'Dallas';
  var state = leadListPick(lead || {}, ['state', 'property_state', 'situs_state', 'source_details.state']) || 'TX';
  var zip = leadListPick(lead || {}, ['zip', 'zipcode', 'postal_code', 'property_zip', 'situs_zip', 'source_details.zip']);
  return [address, city, state, zip].filter(function(part) { return part != null && String(part).trim(); }).join(', ').replace(/\s+/g, ' ').trim();
}

function dallasDirectUrlForList(lead, names, domainPattern) {
  var value = leadListPick(lead || {}, names);
  if (value && domainPattern.test(String(value))) return String(value);
  return '';
}

function dallasCompSearchLinks(lead) {
  var full = dallasLeadFullAddressForList(lead);
  var address = leadListAddress(lead);
  var city = leadListPick(lead || {}, ['city', 'property_city', 'situs_city', 'source_details.city']) || 'Dallas';
  var zip = leadListPick(lead || {}, ['zip', 'zipcode', 'postal_code', 'property_zip', 'situs_zip', 'source_details.zip']);
  var neighborhood = leadListPick(lead || {}, ['neighborhood', 'subdivision', 'legal_description', 'source_truth.legal_description']);
  var soldQuery = [address, city, zip, neighborhood, 'sold comps'].filter(function(part) { return part != null && String(part).trim(); }).join(' ');
  var mapQuery = full || address || [city, 'TX'].join(', ');
  var zillowDirect = dallasDirectUrlForList(lead, ['zillow_url', 'zillowUrl', 'zillow_link', '_zillow_link', 'property_zillow_url', 'source_details.zillow_url'], /zillow\.com/i);
  var redfinDirect = dallasDirectUrlForList(lead, ['redfin_url', 'redfinUrl', 'redfin_link', '_redfin_link', 'source_details.redfin_url'], /redfin\.com/i);
  var realtorDirect = dallasDirectUrlForList(lead, ['realtor_url', 'realtorUrl', 'realtor_link', 'source_details.realtor_url'], /realtor\.com/i);
  return {
    property: {
      zillow: zillowDirect || (full ? 'https://www.zillow.com/homes/' + encodeURIComponent(full) + '_rb/' : ''),
      redfin: redfinDirect || (full ? 'https://www.redfin.com/search?searchType=4&query=' + encodeURIComponent(full) : ''),
      realtor: realtorDirect || (full ? 'https://www.realtor.com/realestateandhomes-search/' + encodeURIComponent(full) : ''),
      google_maps: mapQuery ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQuery) : '',
      appraisal_district: (address || zip) ? 'https://www.google.com/search?q=' + encodeURIComponent('site:dallascad.org ' + [address, zip].filter(Boolean).join(' ')) : ''
    },
    nearby_sold: {
      zillow: soldQuery ? 'https://www.google.com/search?q=' + encodeURIComponent('site:zillow.com/homedetails ' + soldQuery) : '',
      redfin: soldQuery ? 'https://www.google.com/search?q=' + encodeURIComponent('site:redfin.com ' + soldQuery) : '',
      realtor: soldQuery ? 'https://www.google.com/search?q=' + encodeURIComponent('site:realtor.com/realestateandhomes-detail ' + soldQuery) : ''
    },
    search_basis: {
      address: address || '',
      city: city || '',
      zip: zip || '',
      neighborhood: neighborhood || ''
    }
  };
}

function dallasLeadNumericValue(lead, keys) {
  var value = leadListPick(lead || {}, keys);
  var parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function dallasExtractCompPricesForList(lead) {
  var containers = [lead && lead.comps, lead && lead.draft_comps, lead && lead.manual_comps, lead && lead.research_comps].filter(Array.isArray);
  var prices = [];
  containers.forEach(function(list) {
    list.forEach(function(comp) {
      var price = Number(String(leadListPick(comp || {}, ['price', 'sold_price', 'sale_price', 'list_price']) || '').replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(price) && price > 0) prices.push(price);
    });
  });
  return prices.slice(0, 5);
}

function dallasCompIntelligenceForLead(lead, verifiedStatus) {
  var status = verifiedStatus || dallasVerifiedAcquisitionStatus(lead);
  var agent = getDallasCompIntelligenceAgent();
  var engine = null;
  if (agent && typeof agent.generateDallasCompIntelligence === 'function') {
    try {
      engine = agent.generateDallasCompIntelligence(Object.assign({}, lead || {}, {
        dallas_verified_acquisition: status
      }));
    } catch (e) {
      logger.error('[dallas-comp-intelligence] failed: ' + e.message);
    }
  }
  var links = engine && engine.links ? engine.links : dallasCompSearchLinks(lead);
  if (!status.queue_eligible) {
    return Object.assign({}, engine || {}, {
      eligible: false,
      confidence: 'Low',
      comp_confidence: 'low',
      confidence_reason: 'Insufficient property confidence for valuation.',
      links: links,
      research_links: engine && engine.research_links ? engine.research_links : links.property,
      sold_comp_links: engine && engine.sold_comp_links ? engine.sold_comp_links : links.nearby_sold,
      nearby_sale_links: engine && engine.nearby_sale_links ? engine.nearby_sale_links : links.nearby_sold,
      arv_guidance: { status: 'blocked', label: 'Insufficient property confidence for valuation.', range_low: null, range_high: null },
      mao_guidance: { status: 'blocked', conservative: null, moderate: null, aggressive: null, note: 'Needs verified Dallas source evidence before comp review.' },
      arv_low: null,
      arv_mid: null,
      arv_high: null,
      mao_estimate: null,
      repair_estimate: null,
      spread_estimate: null
    });
  }
  if (engine) {
    return Object.assign({}, engine, {
      eligible: true,
      confidence: engine.confidence || (engine.comp_confidence ? String(engine.comp_confidence).replace(/^./, function(c) { return c.toUpperCase(); }) : 'Low'),
      links: engine.links || links,
      research_links: engine.research_links || (links && links.property) || {},
      sold_comp_links: engine.sold_comp_links || {},
      nearby_sale_links: engine.nearby_sale_links || {},
      arv_guidance: engine.arv_guidance || { status: 'needs_review', label: 'Needs manual comp review.', range_low: null, range_high: null },
      mao_guidance: engine.mao_guidance || { status: 'needs_review', conservative: null, moderate: null, aggressive: null, note: 'Needs comp review.' }
    });
  }
  var compPrices = dallasExtractCompPricesForList(lead);
  var low = 0;
  var high = 0;
  if (compPrices.length >= 3) {
    compPrices.sort(function(a, b) { return a - b; });
    low = compPrices[0];
    high = compPrices[compPrices.length - 1];
  }
  var evidenceCount = [links.property.zillow, links.property.redfin, links.property.realtor, links.property.google_maps, links.property.appraisal_district, status.evidence && status.evidence.parcel_apn].filter(Boolean).length;
  var confidence = low && high && compPrices.length >= 3 ? 'High' : (evidenceCount >= 4 ? 'Medium' : 'Low');
  var arvGuidance = low && high
    ? { status: 'evidence_based', label: 'Preliminary range from saved comp/ARV evidence only.', range_low: low, range_high: high }
    : { status: 'needs_review', label: 'Needs manual comp review.', range_low: null, range_high: null };
  var maoGuidance = low && high
    ? {
        status: 'evidence_based',
        conservative: Math.round(low * 0.65),
        moderate: Math.round(((low + high) / 2) * 0.68),
        aggressive: Math.round(high * 0.7),
        note: 'Guidance uses existing valuation evidence only; verify sold comps before offer.'
      }
    : { status: 'needs_review', conservative: null, moderate: null, aggressive: null, note: 'Needs comp review.' };
  return {
    eligible: true,
    confidence: confidence,
    confidence_reason: confidence === 'High' ? 'Saved comp/ARV evidence exists for this Dallas property.' : (confidence === 'Medium' ? 'Strong property/search evidence exists, but sold comps still need manual review.' : 'Weak/no nearby valuation evidence saved.'),
    links: links,
    arv_guidance: arvGuidance,
    mao_guidance: maoGuidance
  };
}

function dallasVerifiedAcquisitionStatus(lead) {
  var evidence = dallasLeadEvidenceSnapshot(lead);
  var confidence = dallasEvidenceConfidence(lead);
  var distress = dallasLeadDistressCategory(lead);
  var sourceFamily = dallasSourceFamily(lead);
  var parserAdapter = dallasParserAdapterForList(lead);
  var extractionQuality = leadListPick(lead || {}, ['extraction_quality', 'source_details.extraction_quality', 'source_truth.extraction_quality']) || (confidence.level === 'Repair' ? 'repair' : (evidence.has_property_evidence ? 'property_level' : 'partial'));
  var evidenceQuality = leadListPick(lead || {}, ['evidence_quality', 'source_details.evidence_quality', 'source_truth.evidence_quality']) || (evidence.has_source_proof && evidence.has_timing_or_amount ? 'strong' : 'weak');
  var validProperty = isDallasPropertyAddressForList(lead);
  var hasDistress = distress !== 'unknown distress';
  var actionable = validProperty && evidence.has_source_proof && hasDistress && evidence.has_timing_or_amount && (confidence.level === 'High' || confidence.level === 'Medium');
  var missing = [];
  if (!validProperty) missing.push('valid_property_address');
  if (!evidence.has_source_proof) missing.push('source_url_or_evidence_reference');
  if (!hasDistress) missing.push('distress_category');
  if (!evidence.has_timing_or_amount) missing.push('timing_or_amount_evidence');
  if (!(confidence.level === 'High' || confidence.level === 'Medium')) missing.push('medium_or_high_confidence');
  var rejectionReason = actionable ? '' : missing.join(', ');
  var status = {
    is_dallas: isDallasLeadForList(lead),
    source_family: sourceFamily,
    parser_adapter: parserAdapter,
    extraction_quality: extractionQuality,
    evidence_quality: evidenceQuality,
    rejection_reason: rejectionReason,
    queue_eligible: actionable,
    status: actionable ? 'Actionable' : (confidence.level === 'Repair' ? 'Needs Repair' : (validProperty && evidence.has_source_proof ? 'Needs Verification' : 'Weak Lead')),
    distress_category: distress,
    confidence_level: confidence.level,
    confidence_score: confidence.score,
    confidence_reason: confidence.reason,
    evidence: evidence,
    missing_evidence: missing,
    recommended_next_step: actionable ? 'Verify source record, confirm amount/timing, then underwrite before outreach.' : 'Repair missing Dallas source evidence before moving this lead into acquisition workflow.'
  };
  status.priority_score = dallasVerifiedPriorityScore(status);
  status.comp_intelligence = dallasCompIntelligenceForLead(lead, status);
  return {
    is_dallas: status.is_dallas,
    source_family: status.source_family,
    parser_adapter: status.parser_adapter,
    extraction_quality: status.extraction_quality,
    evidence_quality: status.evidence_quality,
    rejection_reason: status.rejection_reason,
    priority_score: status.priority_score,
    queue_eligible: status.queue_eligible,
    status: status.status,
    distress_category: status.distress_category,
    confidence_level: status.confidence_level,
    confidence_score: status.confidence_score,
    confidence_reason: status.confidence_reason,
    evidence: status.evidence,
    comp_intelligence: status.comp_intelligence,
    missing_evidence: status.missing_evidence,
    recommended_next_step: status.recommended_next_step
  };
}

function isDallasSheriffTaxSaleLeadForList(lead) {
  if (!isDallasLeadForList(lead)) return false;
  var family = dallasSourceFamily(lead);
  if (family === 'dallas_sheriff_tax_sales') return true;
  var text = leadListTextBlob(lead);
  return /dallas county tax office|sheriff.?sale|tax.?sale|minimum bid|judgment amount|strike.?off|tx_dallas_sheriff_tax_sales|sheriffsaleauctions\.com/.test(text);
}

function dallasSheriffTaxSaleAcquisitionStatus(lead) {
  var base = dallasVerifiedAcquisitionStatus(lead);
  var evidence = base.evidence || {};
  var isSheriff = isDallasSheriffTaxSaleLeadForList(lead);
  var saleTiming = !!evidence.filing_or_sale_date;
  var sourceProof = !!(evidence.source_url || evidence.source_reference || evidence.pdf_page_reference || evidence.source_file_reference);
  var amountEvidence = !!evidence.amount_or_judgment;
  var missing = Array.isArray(base.missing_evidence) ? base.missing_evidence.slice() : [];
  if (!isSheriff && missing.indexOf('dallas_sheriff_tax_sale_source') === -1) missing.push('dallas_sheriff_tax_sale_source');
  if (!saleTiming && missing.indexOf('sale_or_tax_timing') === -1) missing.push('sale_or_tax_timing');
  if (!sourceProof && missing.indexOf('source_evidence') === -1) missing.push('source_evidence');
  var confidenceOk = base.confidence_level === 'High' || base.confidence_level === 'Medium';
  var queueEligible = isSheriff && base.queue_eligible && saleTiming && sourceProof && confidenceOk;
  var status = queueEligible
    ? 'Actionable'
    : (base.status === 'Needs Repair' || base.status === 'Weak Lead' ? base.status : 'Needs Verification');
  var rejection = queueEligible ? '' : missing.join(', ');
  var priorityScore = base.priority_score + (saleTiming ? 22 : 0) + (amountEvidence ? 12 : 0) + (isSheriff ? 18 : 0);
  var sheriffStatus = Object.assign({}, base, {
    source_family: isSheriff ? 'dallas_sheriff_tax_sales' : base.source_family,
    sheriff_tax_sale: true,
    queue_eligible: queueEligible,
    status: status,
    rejection_reason: rejection,
    missing_evidence: missing.filter(function(value, index, arr) { return arr.indexOf(value) === index; }),
    priority_score: priorityScore,
    amount_available: amountEvidence,
    sale_timing_available: saleTiming,
    recommended_next_step: queueEligible
      ? 'Open source evidence, verify sale date and amount/bid, then complete comp review.'
      : 'Repair Dallas sheriff/tax sale source evidence before moving this lead into the acquisition workflow.'
  });
  sheriffStatus.comp_intelligence = dallasCompIntelligenceForLead(lead, sheriffStatus);
  return sheriffStatus;
}

function classifyLeadQualityForList(lead) {
  lead = lead || {};
  var flags = Array.isArray(lead.repair_flags) ? lead.repair_flags.slice() : [];
  var dallasVerified = isDallasLeadForList(lead) ? dallasVerifiedAcquisitionStatus(lead) : null;
  if (dallasVerified && flags.indexOf('dallas_verified_review') === -1) flags.push('dallas_verified_review');
  var address = leadListAddress(lead);
  var weakAddress = isWeakAddressTextForList(address);
  var sourceRecord = leadListHasSourceRecord(lead);
  var distress = leadListHasDistressReason(lead);
  var amount = leadListHasAmountEvidence(lead);
  var dateCase = leadListHasDateCaseEvidence(lead);
  var confidence = leadListSourceConfidenceScore(lead);
  var hasOwnerParcelCaseAmountDate = leadListHasAny(lead, ['owner_name', 'owner', 'parcel', 'apn', 'parcel_id', 'case_number']) || amount || dateCase;
  if (weakAddress && flags.indexOf('weak_address') === -1) flags.push('weak_address');
  if (!sourceRecord && !(dallasVerified && dallasVerified.evidence && dallasVerified.evidence.has_source_proof) && flags.indexOf('missing_source_url') === -1) flags.push('missing_source_url');
  if (!amount && !(dallasVerified && dateCase) && flags.indexOf('missing_amount') === -1) flags.push('missing_amount');
  if (dallasVerified) {
    (dallasVerified.missing_evidence || []).forEach(function(flag) {
      var repairFlag = 'dallas_missing_' + flag;
      if (flags.indexOf(repairFlag) === -1) flags.push(repairFlag);
    });
    if (dallasVerified.queue_eligible) {
      return { label: 'Actionable', rank: 0, flags: flags.filter(function(v, i, a){ return a.indexOf(v) === i; }), dallas_verified: true };
    }
    if (dallasVerified.status === 'Needs Repair' || dallasVerified.status === 'Weak Lead') {
      return { label: dallasVerified.status, rank: dallasVerified.status === 'Weak Lead' ? 3 : 2, flags: flags.concat(['dallas_not_verified']).filter(function(v, i, a){ return a.indexOf(v) === i; }), dallas_verified: false };
    }
  }
  if (weakAddress && !hasOwnerParcelCaseAmountDate) {
    return { label: 'Weak Lead', rank: 3, flags: flags.concat(['weak_evidence']).filter(function(v, i, a){ return a.indexOf(v) === i; }) };
  }
  if (flags.some(function(flag){ return /parser_failed|placeholder_row|malformed_pdf_extraction|missing_address|weak_address|missing_source_url/.test(String(flag)); })) {
    return { label: 'Needs Repair', rank: 2, flags: flags.filter(function(v, i, a){ return a.indexOf(v) === i; }) };
  }
  if (address && !weakAddress && sourceRecord && distress && (amount || dateCase) && confidence >= 55) {
    return { label: 'Actionable', rank: 0, flags: flags.filter(function(v, i, a){ return a.indexOf(v) === i; }) };
  }
  return { label: 'Needs Verification', rank: 1, flags: flags.filter(function(v, i, a){ return a.indexOf(v) === i; }) };
}

function isCourthouseLeadForList(lead) {
  var text = [
    lead && lead.source,
    lead && lead.source_name,
    lead && lead.source_type,
    lead && lead.source_url,
    lead && lead._source_module,
    lead && lead._market,
    lead && lead.provider
  ].filter(Boolean).join(' ').toLowerCase();
  return /court|courthouse/.test(text);
}

function getLeadListSourceLabel(lead) {
  if (!lead || typeof lead !== 'object') return '';
  var candidates = [
    lead.source,
    lead.source_name,
    lead.source_type,
    lead.source_key,
    lead.source_slug,
    lead.import_source,
    lead.provider,
    lead.source_url
  ];
  if (lead.source_details && typeof lead.source_details === 'object') {
    candidates.push(lead.source_details.source_name);
    candidates.push(lead.source_details.source_type);
    candidates.push(lead.source_details.source_key);
    candidates.push(lead.source_details.record_url);
    candidates.push(lead.source_details.query_url);
  } else if (typeof lead.source_details === 'string') {
    candidates.push(lead.source_details);
  }
  for (var i = 0; i < candidates.length; i++) {
    var value = candidates[i];
    if (value == null) continue;
    var text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function buildLeadIntakeStatus(leads, filtered) {
  var all = Array.isArray(leads) ? leads : [];
  var visible = Array.isArray(filtered) ? filtered : all;
  var today = new Date().toISOString().slice(0, 10);
  var newest = all.slice().sort(function(a, b) {
    return new Date(b.created_at || b.created || b.createdAt || b.inserted_at || 0) - new Date(a.created_at || a.created || a.createdAt || a.inserted_at || 0);
  })[0] || null;
  var newToday = all.filter(function(lead) {
    var created = String(lead.created_at || lead.created || lead.createdAt || lead.inserted_at || '');
    return created.indexOf(today) === 0;
  }).length;
  var placeholderCount = all.filter(isPlaceholderLeadForList).length;
  var usableCount = Math.max(0, all.length - placeholderCount);
  var newestTimestamp = newest ? (newest.created_at || newest.created || newest.createdAt || newest.inserted_at || '') : '';
  var newestSource = newest ? getLeadListSourceLabel(newest) : '';
  var newestType = newest ? (newest.lead_type || newest.source_type || newest.type || '') : '';
  var backgroundStatus = /^(1|true|yes|on)$/i.test(String(process.env.WOS_ENABLE_BACKGROUND_INGESTION || '')) ? 'enabled' : 'disabled';
  var courthouseLeads = all.filter(isCourthouseLeadForList);
  var weakCourthouseLeads = courthouseLeads.filter(function(lead) {
    var quality = classifyLeadQualityForList(lead);
    return quality.label === 'Weak Lead' || quality.label === 'Needs Repair';
  });
  var dallasLeads = all.filter(isDallasLeadForList);
  var dallasStatuses = dallasLeads.map(dallasVerifiedAcquisitionStatus);
  var dallasActionable = dallasStatuses.filter(function(status) { return status.queue_eligible; });
  var dallasRepair = dallasStatuses.filter(function(status) { return status.status === 'Needs Repair' || status.status === 'Weak Lead'; });
  var dallasSheriffLeads = all.filter(isDallasSheriffTaxSaleLeadForList);
  var dallasSheriffStatuses = dallasSheriffLeads.map(dallasSheriffTaxSaleAcquisitionStatus);
  var dallasSheriffActionable = dallasSheriffStatuses.filter(function(status) { return status.queue_eligible; });
  var dallasSheriffRepair = dallasSheriffStatuses.filter(function(status) { return status.status === 'Needs Repair' || status.status === 'Weak Lead'; });
  var dallasHotList = dallasLeads.map(function(lead) {
    var status = dallasVerifiedAcquisitionStatus(lead);
    return {
      id: String(lead.id || lead.lead_id || ''),
      reference_id: String(lead.ref_id || lead.reference_id || lead.lead_reference_id || lead.id || ''),
      address: leadListAddress(lead),
      distress_category: status.distress_category,
      confidence_level: status.confidence_level,
      priority_score: status.priority_score,
      queue_eligible: status.queue_eligible,
      comp_confidence: status.comp_intelligence && status.comp_intelligence.confidence,
      acquisition_rank: status.comp_intelligence && status.comp_intelligence.acquisition_rank,
      valuation_evidence_score: status.comp_intelligence && status.comp_intelligence.valuation_evidence_score,
      next_best_action: status.comp_intelligence && status.comp_intelligence.next_best_action
    };
  }).filter(function(item) {
    return item.queue_eligible;
  }).sort(function(a, b) {
    return b.priority_score - a.priority_score;
  }).slice(0, 5);
  var dallasSheriffHotList = dallasSheriffLeads.map(function(lead) {
    var status = dallasSheriffTaxSaleAcquisitionStatus(lead);
    return {
      id: String(lead.id || lead.lead_id || ''),
      reference_id: String(lead.ref_id || lead.reference_id || lead.lead_reference_id || lead.id || ''),
      address: leadListAddress(lead),
      distress_category: status.distress_category,
      confidence_level: status.confidence_level,
      priority_score: status.priority_score,
      queue_eligible: status.queue_eligible,
      sale_date: status.evidence && status.evidence.filing_or_sale_date,
      amount_or_judgment: status.evidence && status.evidence.amount_or_judgment,
      comp_confidence: status.comp_intelligence && status.comp_intelligence.confidence,
      acquisition_rank: status.comp_intelligence && status.comp_intelligence.acquisition_rank,
      valuation_evidence_score: status.comp_intelligence && status.comp_intelligence.valuation_evidence_score,
      next_best_action: status.comp_intelligence && status.comp_intelligence.next_best_action
    };
  }).filter(function(item) {
    return item.queue_eligible;
  }).sort(function(a, b) {
    return b.priority_score - a.priority_score;
  }).slice(0, 5);
  var newestCourthouse = courthouseLeads.slice().sort(function(a, b) {
    return new Date(b.created_at || b.created || b.createdAt || b.inserted_at || 0) - new Date(a.created_at || a.created || a.createdAt || a.inserted_at || 0);
  })[0] || null;
  return {
    total_leads: all.length,
    usable_leads: usableCount,
    hidden_placeholder_leads: placeholderCount,
    visible_leads: visible.length,
    new_today: newToday,
    newest_lead_timestamp: newestTimestamp,
    newest_lead_source: newestSource,
    newest_lead_type: newestType,
    background_ingestion_status: backgroundStatus,
    regional_command: {
      national: { total: all.length },
      texas: { total: all.filter(function(lead) { return leadMatchesRegionalModeForList(lead, 'texas'); }).length },
      dfw: { total: all.filter(function(lead) { return leadMatchesRegionalModeForList(lead, 'dfw'); }).length },
      dallas: { total: all.filter(function(lead) { return leadMatchesRegionalModeForList(lead, 'dallas'); }).length },
      active_default: 'dallas'
    },
    courthouse_quality: {
      total: courthouseLeads.length,
      weak_or_repair: weakCourthouseLeads.length,
      newest_source: newestCourthouse ? getLeadListSourceLabel(newestCourthouse) : '',
      newest_timestamp: newestCourthouse ? (newestCourthouse.created_at || newestCourthouse.created || newestCourthouse.createdAt || newestCourthouse.inserted_at || '') : ''
    },
    dallas_verified_queue: {
      total_dallas: dallasLeads.length,
      actionable: dallasActionable.length,
      repair_or_weak: dallasRepair.length,
      hot_list: dallasHotList,
      confidence: dallasStatuses.reduce(function(acc, status) {
        acc[status.confidence_level] = (acc[status.confidence_level] || 0) + 1;
        return acc;
      }, { High: 0, Medium: 0, Low: 0, Repair: 0 })
    },
    dallas_sheriff_tax_sale_queue: {
      total_dallas_sheriff: dallasSheriffLeads.length,
      actionable: dallasSheriffActionable.length,
      repair_or_weak: dallasSheriffRepair.length,
      hot_list: dallasSheriffHotList,
      confidence: dallasSheriffStatuses.reduce(function(acc, status) {
        acc[status.confidence_level] = (acc[status.confidence_level] || 0) + 1;
        return acc;
      }, { High: 0, Medium: 0, Low: 0, Repair: 0 })
    }
  };
}

app.get('/api/leads', (req, res) => {
  try {
    const leads = db.getLeads();
    const { status, county, category, sort, state, source_type, workflow, top300, dallas_verified, dallas_sheriff_verified, operational_mode, region_mode, mode, metro, queue } = req.query;
    let filtered = leads;
    // Filters (apply before sort)
    // Phase 2B: exclude archived leads by default (pass ?archived=true to see them)
    const showArchived = req.query.archived === 'true';
    if (!showArchived) filtered = filtered.filter(l => l.archived !== true);
    var regionalMode = String(operational_mode || region_mode || mode || '').trim().toLowerCase();
    if (regionalMode) filtered = filtered.filter(function(lead) { return leadMatchesRegionalModeForList(lead, regionalMode); });
    if (String(metro || '').trim().toLowerCase() === 'dfw') filtered = filtered.filter(function(lead) { return leadMatchesRegionalModeForList(lead, 'dfw'); });
    if (String(queue || '').trim().toLowerCase() === 'weak_repair') {
      filtered = filtered.filter(function(lead) {
        var quality = classifyLeadQualityForList(lead);
        return quality.label === 'Weak Lead' || quality.label === 'Needs Repair';
      });
    }
    if (status)      filtered = filtered.filter(l => l.status === status);
    if (county)      filtered = filtered.filter(l => leadMatchesCountyNameForList(l, county));
    if (category)    filtered = filtered.filter(l => (l.category||'').toLowerCase().includes(category.toLowerCase()));
    if (state)       filtered = filtered.filter(l => (l.state||'').toUpperCase() === state.toUpperCase());
    if (source_type) filtered = filtered.filter(l => leadSourceTypeText(l).toLowerCase().includes(source_type.toLowerCase()));
    if (workflow)    filtered = filtered.filter(l => [l.workflow_state, l.assignment_state, l.status].filter(Boolean).join(' ').toLowerCase().includes(String(workflow).toLowerCase()));
    if (/^(1|true|yes)$/i.test(String(dallas_verified || ''))) {
      filtered = filtered.filter(function(lead) {
        return dallasVerifiedAcquisitionStatus(lead).queue_eligible;
      });
    }
    if (/^(1|true|yes)$/i.test(String(dallas_sheriff_verified || ''))) {
      filtered = filtered.filter(function(lead) {
        return dallasSheriffTaxSaleAcquisitionStatus(lead).queue_eligible;
      });
    }
    // Sort BEFORE limiting (correct order)
    var dallasVerifiedOnly = /^(1|true|yes)$/i.test(String(dallas_verified || ''));
    var dallasSheriffOnly = /^(1|true|yes)$/i.test(String(dallas_sheriff_verified || ''));
    var sortKey = sort || (dallasSheriffOnly ? 'dallas_sheriff_priority' : (dallasVerifiedOnly ? 'dallas_verified_priority' : 'motivation_score'));
    if (sortKey === 'dallas_sheriff_priority') {
      filtered = filtered.slice().sort(function(a,b){
        return dallasSheriffTaxSaleAcquisitionStatus(b).priority_score - dallasSheriffTaxSaleAcquisitionStatus(a).priority_score;
      });
    } else if (sortKey === 'dallas_verified_priority') {
      filtered = filtered.slice().sort(function(a,b){
        return dallasVerifiedAcquisitionStatus(b).priority_score - dallasVerifiedAcquisitionStatus(a).priority_score;
      });
    } else if (sortKey === 'motivation_score') {
      filtered = filtered.slice().sort(function(a,b){ return (classifyLeadQualityForList(a).rank - classifyLeadQualityForList(b).rank) || (((b.hot_score||b.motivation_score||0)+(b.priorityScore||0)) - ((a.hot_score||a.motivation_score||0)+(a.priorityScore||0))); });
    } else if (sortKey === 'created_at' || sortKey === 'newest') {
      filtered = filtered.slice().sort(function(a,b){ return new Date(b.created_at||b.created||0) - new Date(a.created_at||a.created||0); });
    } else if (sortKey === 'spread') {
      filtered = filtered.slice().sort(function(a,b){ return (b.spread||0) - (a.spread||0); });
    } else if (sortKey === 'state_az') {
      filtered = filtered.slice().sort(function(a,b){ return String(a.state || '').localeCompare(String(b.state || '')) || (classifyLeadQualityForList(a).rank - classifyLeadQualityForList(b).rank); });
    } else if (sortKey === 'state_za') {
      filtered = filtered.slice().sort(function(a,b){ return String(b.state || '').localeCompare(String(a.state || '')) || (classifyLeadQualityForList(a).rank - classifyLeadQualityForList(b).rank); });
    } else if (sortKey === 'source_confidence') {
      filtered = filtered.slice().sort(function(a,b){ return (leadListSourceConfidenceScore(b) - leadListSourceConfidenceScore(a)) || (classifyLeadQualityForList(a).rank - classifyLeadQualityForList(b).rank); });
    } else if (sortKey === 'priority') {
      filtered = filtered.slice().sort(function(a,b){ return (classifyLeadQualityForList(a).rank - classifyLeadQualityForList(b).rank) || (((b.hot_score||b.motivation_score||0)+(b.priorityScore||0)) - ((a.hot_score||a.motivation_score||0)+(a.priorityScore||0))); });
    }
    var requestedLimit = (top300 === '1' || top300 === 'true') ? 300 : parseLeadListLimit(req.query.limit);
    var requestedOffset = parseLeadListOffset(req.query.offset);
    var pageLeads = filtered.slice(requestedOffset, requestedOffset + requestedLimit);
    var safeLeads = pageLeads.map(function(lead) {
      try {
        var enriched = withLeadIntelligence(lead);
        var quality = classifyLeadQualityForList(enriched);
        var safe = sanitizeLeadForList(enriched);
        if (isDallasLeadForList(enriched)) safe.dallas_verified_acquisition = dallasVerifiedAcquisitionStatus(enriched);
        if (isDallasSheriffTaxSaleLeadForList(enriched)) safe.sheriff_tax_sale_acquisition = dallasSheriffTaxSaleAcquisitionStatus(enriched);
        safe.lead_quality = quality;
        safe.repair_flags = Array.from(new Set([].concat(safe.repair_flags || [], quality.flags || [])));
        return safe;
      } catch (err) {
        var fallbackQuality = classifyLeadQualityForList(lead);
        var fallback = sanitizeLeadForList(Object.assign({}, lead, {
          repair_flags: Array.from(new Set([].concat(lead && lead.repair_flags || [], ['list_serialization_failed']))),
          list_serialization_error: err && err.message ? err.message : 'serialization_failed'
        }));
        fallback.lead_quality = fallbackQuality;
        if (isDallasLeadForList(lead)) fallback.dallas_verified_acquisition = dallasVerifiedAcquisitionStatus(lead);
        if (isDallasSheriffTaxSaleLeadForList(lead)) fallback.sheriff_tax_sale_acquisition = dallasSheriffTaxSaleAcquisitionStatus(lead);
        fallback.repair_flags = Array.from(new Set([].concat(fallback.repair_flags || [], fallbackQuality.flags || [])));
        return fallback;
      }
    });
    var intakeStatus = buildLeadIntakeStatus(leads, filtered);
    return res.json({
      leads: safeLeads,
      total: safeLeads.length,
      totalFiltered: filtered.length,
      totalAll: leads.length,
      limit: requestedLimit,
      offset: requestedOffset,
      page_count: safeLeads.length,
      has_more: requestedOffset + requestedLimit < filtered.length,
      next_offset: requestedOffset + requestedLimit < filtered.length ? requestedOffset + requestedLimit : null,
      prev_offset: requestedOffset > 0 ? Math.max(0, requestedOffset - requestedLimit) : null,
      list_sanitized: true,
      intake_status: intakeStatus
    });
  } catch (err) {
    console.error('[api/leads] failed to build list response:', err);
    return res.status(500).json({ ok: false, error: 'leads_list_failed', message: err && err.message ? err.message : 'Failed to load leads' });
  }
});



// Role check endpoint — reads userId from x-user-id header or query param
app.get('/api/auth/role', (req, res) => {
  try {
    const users = db.readDB().users || [];
    const userId = req.headers['x-user-id'] || req.query.uid ||
                   (req.headers.cookie||'').match(/userId=([^;]+)/)?.[1];
    if (!userId) return res.json({ role: 'user', isAdmin: false, userId: null });
    const user = users.find(u => u.id === userId);
    if (!user) return res.json({ role: 'user', isAdmin: false, userId: null });
    res.json({ role: user.role||'user', isAdmin: user.role==='admin', userId: user.id, name: user.name });
  } catch(e) { res.json({ role: 'user', isAdmin: false }); }
});

app.post('/api/research/comp-scout', async (req, res) => {
  try {
    const body = req.body || {};
    const leadId = String(body.lead_id || body.leadId || '').trim();
    if (!leadId) return res.status(400).json({ ok: false, error: 'lead_id_required' });

    const lead = db.getLeads().find(l => String(l.id) === leadId);
    if (!lead) return res.status(404).json({ ok: false, error: 'lead_not_found' });

    const maxResults = Math.min(Math.max(parseInt(body.max_results || body.maxResults || 5, 10) || 5, 1), 10);
    const sourcePreference = String(body.source_preference || body.sourcePreference || 'google').trim().toLowerCase();
    const result = await scoutCompsForLead({
      lead,
      sourcePreference,
      maxResults
    });

    res.json(Object.assign({
      ok: result.ok !== false,
      lead_id: leadId,
      max_results: maxResults,
      source_preference: sourcePreference,
      saved: false,
      persistence: 'none',
      safety: 'operator-triggered one-lead comp candidate scout; no ingestion, no outbound communication, no automatic save'
    }, result));
  } catch(e) {
    res.status(500).json({
      ok: false,
      error: e.message,
      saved: false,
      persistence: 'none'
    });
  }
});

app.post('/api/ai-deal-analyzer/jobs', (req, res) => {
  try {
    const body = req.body || {};
    const jobs = aiDealAnalyzerJobs.createJobs(body, {
      runNow: body.run_now === true || body.runNow === true
    });
    const firstJob = Array.isArray(jobs) && jobs.length ? jobs[0] : null;
    return res.status(201).json({
      ok: true,
      job_id: firstJob && firstJob.job_id ? firstJob.job_id : '',
      job: firstJob || null,
      jobs,
      count: jobs.length,
      status: firstJob && firstJob.status ? firstJob.status : '',
      source_url: firstJob && firstJob.source_url ? firstJob.source_url : '',
      valuation_locked: firstJob ? firstJob.valuation_locked !== false : true,
      comp_research_status: firstJob && firstJob.comp_research_status ? firstJob.comp_research_status : 'not_configured',
      safety: 'operator-triggered deterministic evidence pass only; no scraping, no LLM calls, no lead mutation'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Analyzer job could not be created. Check address/source and try again.',
      error_category: err && err.error_category ? err.error_category : ((err && err.status) === 400 ? 'validation_error' : 'storage_error')
    });
  }
});

app.get('/api/ai-deal-analyzer/jobs', (req, res) => {
  try {
    const jobs = aiDealAnalyzerJobs.listJobs(req.query.limit);
    return res.json({ ok: true, jobs, count: jobs.length });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to load analyzer jobs'
    });
  }
});

app.get('/api/ai-deal-analyzer/comp-research/config', (req, res) => {
  try {
    return res.json(Object.assign({
      ok: true,
      safety: 'provider configuration only; no API keys returned and no provider calls made'
    }, aiDealAnalyzerJobs.getCompResearchConfig()));
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to load comp research configuration'
    });
  }
});

app.get('/api/provider-capabilities', async (req, res) => {
  try {
    const result = await providerCapabilityAudit.auditProviderCapabilities({ probe: false });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to load provider capabilities'
    });
  }
});

app.post('/api/provider-capabilities/probe', async (req, res) => {
  try {
    const result = await providerCapabilityAudit.auditProviderCapabilities({ probe: true });
    return res.json(Object.assign({}, result, {
      safety: 'Explicit provider capability probe only; no API keys returned, no leads created, no analyzer jobs created.'
    }));
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to probe provider capabilities'
    });
  }
});

app.get('/api/ai-deal-analyzer/jobs/:jobId', (req, res) => {
  try {
    const job = aiDealAnalyzerJobs.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'Analyzer job not found' });
    return res.json({ ok: true, job });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to load analyzer job'
    });
  }
});

app.get('/api/deal-call-dossiers', (req, res) => {
  try {
    const dossiers = dealCallDossiers.listDossiers({
      limit: req.query.limit,
      filter: req.query.filter,
      includeBad: req.query.include_bad === 'true',
      dallasOnly: req.query.dallas_only === 'true',
      texasOnly: req.query.texas_only === 'true',
      hideAuction: req.query.hide_auction === 'true',
      hideResearch: req.query.hide_research === 'true',
      hideLowValue: req.query.hide_low_value === 'true',
      prioritizeWholesale: req.query.prioritize_wholesale === 'true'
    });
    return res.json({
      ok: true,
      dossiers,
      count: dossiers.length,
      safety: 'Daily Call Pipeline read only; no production lead mutation'
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to load Deal Details'
    });
  }
});

app.post('/api/deal-call-dossiers', (req, res) => {
  try {
    const result = dealCallDossiers.createDossier(req.body || {});
    return res.status(result.deduped ? 200 : 201).json({
      ok: true,
      dossier: result.dossier,
      deduped: result.deduped,
      safety: 'operator-created call dossier only; no production lead mutation, no valuation unlock'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to create Deal Details'
    });
  }
});

app.post('/api/deal-call-dossiers/call-sheet', (req, res) => {
  try {
    const result = dealCallDossiers.copyCallSheet(req.body || {});
    return res.json({
      ok: true,
      text: result.text,
      count: result.count,
      safety: 'copy-only call sheet; no lead mutation'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to build call sheet'
    });
  }
});

app.get('/api/deal-call-dossiers/:dossierId', (req, res) => {
  try {
    const dossier = dealCallDossiers.getDossier(req.params.dossierId);
    if (!dossier) return res.status(404).json({ ok: false, error: 'Deal Details not found' });
    return res.json({ ok: true, dossier });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to load Deal Details'
    });
  }
});

app.post('/api/deal-call-dossiers/:dossierId/outcome', (req, res) => {
  try {
    const dossier = dealCallDossiers.updateOutcome(req.params.dossierId, req.body || {});
    return res.json({
      ok: true,
      dossier,
      safety: 'call outcome update only; no production lead mutation'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to update Deal Details'
    });
  }
});

app.post('/api/findme-scout/jobs', (req, res) => {
  try {
    const job = findMeScoutJobs.createJob(req.body || {});
    return res.status(201).json({
      ok: true,
      job,
      safety: 'operator-created Deal Finder job only; no scraping, no autonomous ingestion, no production lead mutation'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to create Deal Finder job'
    });
  }
});

app.get('/api/findme-scout/jobs', (req, res) => {
  try {
    const jobs = findMeScoutJobs.listJobs(req.query.limit);
    return res.json({ ok: true, jobs, count: jobs.length });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to load Deal Finder jobs'
    });
  }
});

app.get('/api/findme-scout/jobs/:jobId', (req, res) => {
  try {
    const job = findMeScoutJobs.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'Deal Finder job not found' });
    return res.json({ ok: true, job });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to load Deal Finder job'
    });
  }
});

app.post('/api/findme-scout/jobs/:jobId/run', async (req, res) => {
  try {
    const job = await findMeScoutJobs.runJob(req.params.jobId, req.body || {});
    return res.json({
      ok: true,
      job,
      safety: 'operator-triggered Deal Finder run only; no autonomous ingestion, no lead mutation, no valuation unlock'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to run Deal Finder job'
    });
  }
});

app.post('/api/findme-scout/jobs/:jobId/continue', async (req, res) => {
  try {
    const prepared = findMeScoutJobs.continueJob(req.params.jobId, req.body || {});
    const job = /^(completed|cancelled)$/i.test(String(prepared.batch_status || prepared.status || ''))
      ? prepared
      : await findMeScoutJobs.runJob(req.params.jobId, req.body || {});
    return res.json({
      ok: true,
      job,
      safety: 'operator-triggered Fresh Lead Batch continuation only; same batch ID reused, no autonomous ingestion'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to continue Fresh Lead Batch'
    });
  }
});

app.post('/api/findme-scout/jobs/:jobId/cancel', (req, res) => {
  try {
    const job = findMeScoutJobs.cancelJob(req.params.jobId, req.body || {});
    return res.json({
      ok: true,
      job,
      safety: 'operator-triggered Fresh Lead Batch cancellation only; no data deletion'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to cancel Fresh Lead Batch'
    });
  }
});

app.post('/api/findme-scout/jobs/:jobId/cards/:cardId/status', (req, res) => {
  try {
    const result = findMeScoutJobs.updateCard(req.params.jobId, req.params.cardId, req.body || {});
    return res.json({
      ok: true,
      job: result.job,
      card: result.card,
      safety: 'Deal Finder card note/status update only; no production lead mutation'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to update Deal Finder card'
    });
  }
});

app.post('/api/findme-scout/jobs/:jobId/cards/:cardId/analyzer', (req, res) => {
  try {
    const result = findMeScoutJobs.sendCardToAnalyzer(req.params.jobId, req.params.cardId);
    return res.json({
      ok: true,
      job: result.job,
      card: result.card,
      analyzer_job: result.analyzer_job,
      safety: 'operator-triggered analyzer handoff only; candidate evidence does not unlock ARV or MAO'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to send Deal Finder card to AI Deal Analyzer'
    });
  }
});

app.post('/api/findme-scout/jobs/:jobId/cards/analyzer', (req, res) => {
  try {
    const body = req.body || {};
    const result = findMeScoutJobs.sendCardsToAnalyzer(req.params.jobId, body.card_ids || body.cardIds || body.cards || [], {
      selected_count: body.selected_count || body.selectedCount || body.selected_cards || body.selectedCards
    });
    return res.json({
      ok: true,
      job: result.job,
      cards: result.cards,
      sent: result.sent,
      blocked: result.blocked,
      analyzer_jobs: result.analyzer_jobs,
      safety: 'operator-triggered analyzer handoff only; candidate evidence does not unlock ARV or MAO'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to send Deal Finder cards to AI Deal Analyzer'
    });
  }
});

app.post('/api/ai-deal-analyzer/jobs/:jobId/comp-research', async (req, res) => {
  try {
    const job = await aiDealAnalyzerJobs.runCompResearchForJob(req.params.jobId);
    return res.json({
      ok: true,
      job_id: job.job_id,
      job,
      comp_research_status: job.comp_research_status,
      comp_research_provider: job.comp_research_provider,
      valuation_locked: job.valuation_locked !== false,
      comp_next_action: job.comp_next_action || '',
      error_category: job.comp_research_error_category || '',
      comp_candidates: Array.isArray(job.comp_candidates) ? job.comp_candidates : [],
      verified_sold_comps: Array.isArray(job.verified_sold_comps) ? job.verified_sold_comps : [],
      subject_sale_evidence: Array.isArray(job.subject_sale_evidence) ? job.subject_sale_evidence : [],
      candidate_sold_comps: Array.isArray(job.candidate_sold_comps) ? job.candidate_sold_comps : [],
      market_support: Array.isArray(job.market_support) ? job.market_support : [],
      not_usable_comp_results: Array.isArray(job.not_usable_comp_results) ? job.not_usable_comp_results : [],
      verified_comp_count: job.verified_comp_count || 0,
      subject_sale_evidence_count: job.subject_sale_evidence_count || 0,
      candidate_comp_count: job.candidate_comp_count || 0,
      market_support_count: job.market_support_count || 0,
      not_usable_comp_count: job.not_usable_comp_count || 0,
      arv_range: job.arv_range || null,
      mao_range: job.mao_range || null,
      safety: 'operator-triggered comp provider check only; no autonomous ingestion, no lead mutation, no valuation unlock from candidates'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      job_id: req.params.jobId,
      comp_research_status: 'failed_cleanly',
      valuation_locked: true,
      verified_comp_count: 0,
      comp_next_action: 'Provider error. No valuation was generated.',
      error_category: 'provider_error',
      error: err && err.message ? err.message : 'Failed to run comp research check'
    });
  }
});

app.get('/api/ai-deal-analyzer/jobs/:jobId/comp-candidates', (req, res) => {
  try {
    const result = aiDealAnalyzerJobs.getCompCandidates(req.params.jobId);
    const candidates = Array.isArray(result) ? result : (Array.isArray(result.candidates) ? result.candidates : []);
    return res.json({
      ok: true,
      candidates,
      verified_sold_comps: Array.isArray(result.verified_sold_comps) ? result.verified_sold_comps : [],
      subject_sale_evidence: Array.isArray(result.subject_sale_evidence) ? result.subject_sale_evidence : [],
      candidate_sold_comps: Array.isArray(result.candidate_sold_comps) ? result.candidate_sold_comps : [],
      market_support: Array.isArray(result.market_support) ? result.market_support : [],
      not_usable_comp_results: Array.isArray(result.not_usable_comp_results) ? result.not_usable_comp_results : [],
      verified_comp_count: result.verified_comp_count || 0,
      subject_sale_evidence_count: result.subject_sale_evidence_count || 0,
      candidate_comp_count: result.candidate_comp_count || 0,
      market_support_count: result.market_support_count || 0,
      not_usable_comp_count: result.not_usable_comp_count || 0,
      valuation_locked: result.valuation_locked !== false,
      arv_range: result.arv_range || null,
      mao_range: result.mao_range || null,
      count: candidates.length,
      safety: 'candidate list only; candidate comps do not unlock valuation'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to load comp candidates'
    });
  }
});

app.post('/api/ai-deal-analyzer/jobs/:jobId/run', (req, res) => {
  try {
    const job = aiDealAnalyzerJobs.runJob(req.params.jobId);
    return res.json({
      ok: true,
      job,
      safety: 'deterministic evidence review only; no scraping, no LLM calls, no lead mutation'
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'Failed to run analyzer job'
    });
  }
});

app.get('/api/source-preview/dallas/sample', (req, res) => {
  try {
    const preview = getDallasPreviewPipeline();
    if (!preview) return res.status(500).json({ ok: false, error: 'preview_pipeline_unavailable', dry_run: true, should_ingest: false });
    res.json(Object.assign({ ok: true }, preview.runPreviewSample()));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, dry_run: true, should_ingest: false });
  }
});

app.post('/api/source-preview/dallas/preview', (req, res) => {
  try {
    const preview = getDallasPreviewPipeline();
    if (!preview) return res.status(500).json({ ok: false, error: 'preview_pipeline_unavailable', dry_run: true, should_ingest: false });
    const body = req.body || {};
    const text = typeof body === 'string' ? body : String(body.text || body.raw || body.preview_text || '').trim();
    const records = Array.isArray(body.records) ? body.records : Array.isArray(body.rows) ? body.rows : null;
    const sample = body.sample === true || body.use_sample === true || body.fixture === 'sample';
    if (!sample && !text && !records) {
      return res.status(400).json({ ok: false, error: 'preview_input_required', dry_run: true, should_ingest: false });
    }
    res.json(Object.assign({ ok: true }, preview.runPreviewBatch({
      text,
      records,
      sample,
      captured_at: body.captured_at || new Date().toISOString()
    })));
  } catch (e) {
    const status = e && e.code === 'preview_batch_too_large' ? 400 : 500;
    res.status(status).json({ ok: false, error: e.message, dry_run: true, should_ingest: false });
  }
});

app.get('/api/source-preview/dallas/sources', (req, res) => {
  try {
    const agent = getDallasSourceAgent();
    if (!agent) return res.status(500).json({ ok: false, error: 'dallas_source_agent_unavailable', dry_run: true, should_ingest: false });
    const capture = getDallasOfficialSourceCapture();
    const status = capture ? capture.getOfficialSourceCaptureStatus() : null;
    const priorityRouter = getDallasSourcePriorityRouter();
    const sourcePlan = priorityRouter ? priorityRouter.buildDallasSourcePriorityPlan(status || {}) : null;
    const sources = agent.loadDallasSources().map((source) => ({
      source_id: source.source_id,
      source_name: source.source_name,
      source_category: source.source_category,
      county: source.county,
      state: source.state,
      source_url: source.source_url,
      interface_type: source.interface_type,
      acquisition_method: source.acquisition_method,
      adapter_family: agent.classifyAdapter(source),
      source_family: agent.sourceFamily ? agent.sourceFamily(source) : source.source_category,
      source_status: source.source_status || 'candidate',
      ingestion_mode: source.ingestion_mode || 'preview-only',
      legality_risk_flags: Array.isArray(source.legality_risk_flags) ? source.legality_risk_flags : [],
      reliability_score: source.reliability_score || null,
      parser_readiness: source.parser_readiness || '',
      adapter_readiness: source.adapter_readiness || '',
      ingestion_readiness: source.ingestion_readiness || '',
      operator_label: source.operator_label || source.source_name,
      notes: source.notes || source.verification_path || '',
      enabled: source.enabled === true,
      should_ingest: false
    }));
    res.json({
      ok: true,
      preview_only: true,
      dry_run: true,
      should_ingest: false,
      default_source_id: agent.DEFAULT_SOURCE_ID,
      max_candidates: agent.MAX_CANDIDATES,
      source_plan: sourcePlan,
      highest_priority_sources: sourcePlan ? sourcePlan.highest_priority_sources : [],
      ready_now_sources: sourcePlan ? sourcePlan.ready_now_sources : [],
      needs_adapter_sources: sourcePlan ? sourcePlan.needs_adapter_sources : [],
      support_only_sources: sourcePlan ? sourcePlan.support_only_sources : [],
      blocked_sensitive_sources: sourcePlan ? sourcePlan.blocked_sensitive_sources : [],
      recommended_next_source: sourcePlan ? sourcePlan.recommended_next_source : null,
      sources
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, dry_run: true, should_ingest: false });
  }
});

app.post('/api/source-preview/dallas/run-source', async (req, res) => {
  try {
    const agent = getDallasSourceAgent();
    if (!agent) return res.status(500).json({ ok: false, error: 'dallas_source_agent_unavailable', dry_run: true, should_ingest: false });
    const body = req.body || {};
    const result = await agent.runDallasSourceAgent({
      source_id: body.source_id || body.sourceId,
      max_candidates: body.max_candidates || body.maxCandidates,
      timeout_ms: body.timeout_ms || body.timeout,
      preview_only: true,
      dry_run: true,
      operator_triggered_only: true,
      no_loop: true
    });
    res.status(result && result.ok === false ? 400 : 200).json(Object.assign({
      preview_only: true,
      dry_run: true,
      should_ingest: false,
      operator_triggered_only: true,
      no_loop: true
    }, result));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, dry_run: true, preview_only: true, should_ingest: false });
  }
});

app.get('/api/source-preview/dallas/official-sources/status', (req, res) => {
  try {
    const capture = getDallasOfficialSourceCapture();
    if (!capture) return res.status(500).json({ ok: false, error: 'dallas_official_source_capture_unavailable', preview_only: true, should_ingest: false });
    const status = capture.getOfficialSourceCaptureStatus();
    const priorityRouter = getDallasSourcePriorityRouter();
    const sourcePlan = priorityRouter ? priorityRouter.buildDallasSourcePriorityPlan(status) : null;
    res.json(Object.assign({}, status, {
      source_plan: sourcePlan,
      highest_priority_sources: sourcePlan ? sourcePlan.highest_priority_sources : [],
      ready_now_sources: sourcePlan ? sourcePlan.ready_now_sources : [],
      needs_adapter_sources: sourcePlan ? sourcePlan.needs_adapter_sources : [],
      support_only_sources: sourcePlan ? sourcePlan.support_only_sources : [],
      blocked_sensitive_sources: sourcePlan ? sourcePlan.blocked_sensitive_sources : [],
      recommended_next_source: sourcePlan ? sourcePlan.recommended_next_source : null
    }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, preview_only: true, should_ingest: false });
  }
});

app.post('/api/source-preview/dallas/official-sources/run', async (req, res) => {
  try {
    const capture = getDallasOfficialSourceCapture();
    if (!capture) return res.status(500).json({ ok: false, error: 'dallas_official_source_capture_unavailable', preview_only: true, should_ingest: false });
    const body = req.body || {};
    const result = await capture.runOfficialSourceCapture({
      source_id: body.source_id || body.sourceId,
      source_ids: body.source_ids || body.sourceIds,
      include_secondary: body.include_secondary === true || body.includeSecondary === true,
      include_foreclosure_notices: body.include_foreclosure_notices === true || body.includeForeclosureNotices === true,
      include_code_violations: body.include_code_violations === true || body.includeCodeViolations === true,
      max_candidates: body.max_candidates || body.maxCandidates,
      max_foreclosure_notice_rows: body.max_foreclosure_notice_rows || body.maxForeclosureNoticeRows,
      max_foreclosure_files: body.max_foreclosure_files || body.maxForeclosureFiles,
      max_code_violation_rows: body.max_code_violation_rows || body.maxCodeViolationRows,
      max_files: body.max_files || body.maxFiles,
      max_browser_pages: body.max_browser_pages || body.maxBrowserPages,
      timeout_ms: body.timeout_ms || body.timeout
    });
    const priorityRouter = getDallasSourcePriorityRouter();
    const sourcePlan = priorityRouter ? priorityRouter.buildDallasSourcePriorityPlan({ counts: result && result.counts }) : null;
    res.status(result && result.ok === false ? 400 : 200).json(Object.assign({
      preview_only: true,
      dry_run: true,
      should_ingest: false,
      operator_triggered_only: true,
      no_auto_ingestion: true,
      source_plan: sourcePlan,
      highest_priority_sources: sourcePlan ? sourcePlan.highest_priority_sources : [],
      ready_now_sources: sourcePlan ? sourcePlan.ready_now_sources : [],
      needs_adapter_sources: sourcePlan ? sourcePlan.needs_adapter_sources : [],
      support_only_sources: sourcePlan ? sourcePlan.support_only_sources : [],
      blocked_sensitive_sources: sourcePlan ? sourcePlan.blocked_sensitive_sources : [],
      recommended_next_source: sourcePlan ? sourcePlan.recommended_next_source : null
    }, result));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, preview_only: true, dry_run: true, should_ingest: false });
  }
});

app.get('/api/source-preview/dallas/official-sources/candidates', (req, res) => {
  try {
    const capture = getDallasOfficialSourceCapture();
    if (!capture) return res.status(500).json({ ok: false, error: 'dallas_official_source_capture_unavailable', preview_only: true, should_ingest: false });
    const result = capture.listOfficialSourceCandidates({
      limit: req.query.limit,
      status: req.query.status || req.query.workflow_status
    });
    const priorityRouter = getDallasSourcePriorityRouter();
    const sourcePlan = priorityRouter ? priorityRouter.buildDallasSourcePriorityPlan({ counts: result && result.counts }) : null;
    res.json(Object.assign({}, result, {
      source_plan: sourcePlan,
      highest_priority_sources: sourcePlan ? sourcePlan.highest_priority_sources : [],
      ready_now_sources: sourcePlan ? sourcePlan.ready_now_sources : [],
      needs_adapter_sources: sourcePlan ? sourcePlan.needs_adapter_sources : [],
      support_only_sources: sourcePlan ? sourcePlan.support_only_sources : [],
      blocked_sensitive_sources: sourcePlan ? sourcePlan.blocked_sensitive_sources : [],
      recommended_next_source: sourcePlan ? sourcePlan.recommended_next_source : null
    }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, preview_only: true, should_ingest: false });
  }
});

app.post('/api/source-preview/dallas/ingest-approved', (req, res) => {
  try {
    const ingestion = getSourcePreviewIngestion();
    if (!ingestion) return res.status(500).json({ ok: false, error: 'preview_ingestion_unavailable', dry_run: true, should_ingest: false });
    const result = ingestion.ingestApprovedPreviewCandidate(req.body || {}, {
      getLeads: db.getLeads,
      addLead: db.addLead,
      normalizeAddress: db.normalizeAddress
    });
    const status = result.status === 'created' || result.status === 'duplicate' || result.status === 'dry_run_ready'
      ? 200
      : result.status === 'repair_required' || result.status === 'confirmation_required' || result.status === 'blocked'
        ? 400
        : 403;
    res.status(status).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, dry_run: true, should_ingest: false });
  }
});

app.post('/api/preview/call-ready-deal-packets', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const preview = await callReadyPreviewService.runCallReadyPreview({
      city: String(body.city || 'Dallas').trim() || 'Dallas',
      county: String(body.county || 'Dallas County').trim() || 'Dallas County',
      state: String(body.state || 'TX').trim() || 'TX'
    }, {
      env: process.env
    });
    res.json({
      ok: true,
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true,
      packets: Array.isArray(preview.packets) ? preview.packets : [],
      diagnostics: Object.assign({}, preview.diagnostics || {}, {
        acquisition_status: preview.acquisition_status || preview.status || '',
        source_ids_attempted: Array.isArray(preview.source_ids_attempted) ? preview.source_ids_attempted : [],
        candidates_found: Number(preview.candidates_found || 0) || 0,
        packet_count: Number(preview.packet_count || 0) || 0,
        search_provider_readiness: preview.search_provider_readiness || searchProviderWorker.getLiveSearchProviderReadiness(),
        preview_only: true,
        should_ingest: false,
        no_global_mutation: true
      })
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message,
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    });
  }
});

app.post('/api/preview/selected-deal-packet', requireAdmin, async (req, res) => {
  try {
    const preview = await selectedDealPacketService.runSelectedDealPacketPreview(req.body || {});
    res.json(Object.assign({}, preview, {
      ok: true,
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    }));
  } catch (e) {
    res.status(Number(e && e.status_code || 500) || 500).json({
      ok: false,
      error: e.message,
      code: e.code || 'selected_deal_packet_preview_failed',
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    });
  }
});

app.post('/api/preview/free-public-deal-board', requireAdmin, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const preview = await freePublicDealBoardPreviewService.runFreePublicDealBoardServerPreview(req.body || {}, {
      env: process.env
    });
    res.json(Object.assign({}, preview, {
      ok: true,
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    }));
  } catch (e) {
    res.status(Number(e && e.status_code || 500) || 500).json({
      ok: false,
      error: e.message,
      code: e.code || 'free_public_deal_board_preview_failed',
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    });
  }
});

// Dashboard Deal Queue: snapshot cache only - never saved leads/Analyzer/Dossier/Pipeline.
app.get('/api/dashboard/free-public-deal-board/latest', requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(dealBoardQueueService.latestDealBoardSnapshot({
      market: {
        city: req.query.city || 'Dallas',
        county: req.query.county || 'Dallas',
        state: req.query.state || 'TX'
      }
    }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: 'deal_board_snapshot_read_failed' });
  }
});

app.get('/api/dashboard/market-demand-index', requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(marketDemandIndex.publicMarketDemandIndex({ limit: req.query.limit }));
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message, code: 'market_demand_index_read_failed' });
  }
});

const manualEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: manualEvidencePacketService.MAX_UPLOAD_BYTES, files: 1, fields: 20 }
}).single('screenshot');

function manualEvidenceMarket(body) {
  const input = body || {};
  if (input.market && typeof input.market === 'object') return input.market;
  if (typeof input.market === 'string') {
    try { return JSON.parse(input.market); } catch (error) { /* use individual fields */ }
  }
  return { city: input.city || '', county: input.county || '', state: input.state || '' };
}

function manualEvidenceError(res, error) {
  const multerTooLarge = error && error.code === 'LIMIT_FILE_SIZE';
  const status = multerTooLarge ? 413 : Number(error && error.status_code || 500) || 500;
  res.status(status).json({
    ok: false,
    error: multerTooLarge ? 'screenshot exceeds the 8MB limit' : error.message,
    code: multerTooLarge ? 'manual_evidence_file_too_large' : error.code || 'manual_evidence_update_failed',
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  });
}

app.get('/api/dashboard/free-public-deal-board/manual-evidence/sample', requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(manualEvidencePacketService.sampleModeForAllMarkets());
  } catch (error) {
    manualEvidenceError(res, error);
  }
});

app.post('/api/dashboard/free-public-deal-board/manual-evidence/upload', requireAdmin, (req, res) => {
  manualEvidenceUpload(req, res, async (uploadError) => {
    if (uploadError) return manualEvidenceError(res, uploadError);
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await manualEvidencePacketService.uploadScreenshot({
        market: manualEvidenceMarket(req.body),
        queue_key: req.body && req.body.queue_key,
        evidence_type: req.body && req.body.evidence_type,
        source_name: req.body && req.body.source_name,
        source_url: req.body && req.body.source_url,
        captured_at: req.body && req.body.captured_at,
        filename: req.file && req.file.originalname,
        buffer: req.file && req.file.buffer
      }, {
        operator_id: req.headers['x-user-id'] || 'admin'
      }));
    } catch (error) {
      manualEvidenceError(res, error);
    }
  });
});

app.post('/api/dashboard/free-public-deal-board/manual-evidence/proposal', requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(manualEvidencePacketService.recordEvidenceProposal(Object.assign({}, req.body || {}, {
      market: manualEvidenceMarket(req.body)
    }), {
      operator_id: req.headers['x-user-id'] || 'admin'
    }));
  } catch (error) {
    manualEvidenceError(res, error);
  }
});

// Explicit operator input on preview snapshot rows. This never creates or
// updates a saved lead and never runs automatically.
app.post('/api/dashboard/free-public-deal-board/contact-workflow', requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(dealBoardQueueService.recordContactWorkflow(req.body || {}, {
      operator_id: req.headers['x-user-id'] || 'admin'
    }));
  } catch (e) {
    res.status(Number(e && e.status_code || 500) || 500).json({
      ok: false,
      error: e.message,
      code: e.code || 'contact_workflow_update_failed',
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    });
  }
});

app.post('/api/dashboard/free-public-deal-board/document-review-clear', requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(dealBoardQueueService.recordDocumentReviewClear(req.body || {}, {
      operator_id: req.headers['x-user-id'] || 'admin'
    }));
  } catch (e) {
    res.status(Number(e && e.status_code || 500) || 500).json({
      ok: false,
      error: e.message,
      code: e.code || 'document_review_clear_failed',
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    });
  }
});

// Starts a background batch job and returns immediately (the full batch
// outlives the HTTP edge timeout). Poll the job endpoint, then read latest.
app.post('/api/dashboard/free-public-deal-board/run', requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(dealBoardQueueService.startDealBoardBatchJob(req.body || {}, { env: process.env }));
  } catch (e) {
    res.status(Number(e && e.status_code || 500) || 500).json({
      ok: false,
      error: e.message,
      code: e.code || 'deal_board_batch_failed',
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    });
  }
});

app.get('/api/dashboard/free-public-deal-board/job/:id', requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const result = dealBoardQueueService.getDealBoardJob(req.params.id);
    res.status(result.ok ? 200 : 404).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: 'deal_board_job_read_failed' });
  }
});

// Daily auto-run schedule for capped background batches (default OFF).
app.post('/api/dashboard/free-public-deal-board/auto-run', requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(dealBoardQueueService.setAutoRun(req.body || {}, { env: process.env }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: 'deal_board_auto_run_failed' });
  }
});

// Restore an enabled auto-run schedule after deploys/restarts.
try { dealBoardQueueService.loadAutoRunFromDisk({ env: process.env }); } catch (e) { /* best effort */ }

// Admin-only: protect sensitive routes
app.use(['/api/buyboxes', '/api/settings', '/api/integrations'], (req, res, next) => {
  try {
    const users = db.readDB().users || [];
    const userId = req.headers['x-user-id'] || req.query._uid ||
                   (req.headers.cookie||'').match(/userId=([^;]+)/)?.[1];
    const user = users.find(u => u.id === userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
    }
    next();
  } catch(e) {
    next(); // fail open for now, harden later
  }
});

// ====================== ADDRESS VALIDATION ROUTES (must be before :id routes) ======================
// GET /api/leads/validate — validate all leads and return report
app.get('/api/leads/validate', (req, res) => {
  try {
    const leads = db.readDB().leads || [];
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const statusFilter = req.query.status; // 'VALID' | 'FIXED' | 'INVALID_ADDRESS_REQUIRES_REVIEW'
    
    const results = leads.map(lead => {
      const validation = validateLeadAddress(lead);
      return { id: lead.id, address: lead.address, ...validation };
    });

    const summary = {
      total: results.length,
      valid: results.filter(r => r.validation_status === 'VALID').length,
      fixed: results.filter(r => r.validation_status === 'FIXED').length,
      requiresReview: results.filter(r => r.validation_status === 'INVALID_ADDRESS_REQUIRES_REVIEW').length,
      zipMismatches: results.filter(r => r.issues.some(i => i.includes('ZIP mismatch'))).length,
      missingZip: results.filter(r => r.issues.some(i => i.includes('Missing ZIP'))).length,
    };

    let filtered = statusFilter ? results.filter(r => r.validation_status === statusFilter) : results;
    const paginated = filtered.slice(offset, offset + limit);

    res.json({ ok: true, summary, results: paginated, total: filtered.length, offset, limit });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leads/validate-fix — auto-fix all fixable addresses in the DB
app.post('/api/leads/validate-fix', (req, res) => {
  try {
    const dbData = db.readDB();
    const leads = dbData.leads || [];
    const dryRun = req.body && req.body.dry_run === true;
    
    let fixed = 0, skipped = 0, requiresReview = 0, alreadyValid = 0;
    const fixedIds = [];
    const reviewIds = [];

    leads.forEach(lead => {
      const validation = validateLeadAddress(lead);
      
      if (validation.validation_status === 'VALID') {
        alreadyValid++;
        return;
      }
      
      if (validation.validation_status === 'FIXED') {
        if (!dryRun) {
          // Apply fixes to lead record
          lead.address = validation.corrected_address;
          lead.zip = validation.zip;
          lead.state = validation.state;
          if (validation.city) lead.city = validation.city;
          lead._address_validated = true;
          lead._address_validation_date = new Date().toISOString().split('T')[0];
          lead._address_issues = validation.issues;
          lead._google_maps_link = validation.google_maps_link;
          lead._zillow_link = validation.zillow_link;
        }
        fixed++;
        fixedIds.push(lead.id);
        return;
      }
      
      if (validation.validation_status === 'INVALID_ADDRESS_REQUIRES_REVIEW') {
        if (!dryRun) {
          lead._address_validated = false;
          lead._address_issues = validation.issues;
        }
        requiresReview++;
        reviewIds.push(lead.id);
      }
    });

    if (!dryRun) {
      dbData.leads = leads;
      db.writeDB(dbData);
    }

    res.json({
      ok: true,
      dry_run: dryRun,
      summary: { total: leads.length, fixed, alreadyValid, requiresReview, skipped },
      fixedIds: fixedIds.slice(0, 20),
      reviewIds: reviewIds.slice(0, 20),
      message: dryRun 
        ? 'Dry run complete — no changes written' 
        : fixed + ' addresses fixed, ' + requiresReview + ' flagged for review'
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leads/:id/validate — validate single lead address

// GET /api/leads/hot — must be BEFORE /api/leads/:id
app.get('/api/leads/hot', function(req, res) {
  try {
    var leads = db.getLeads ? db.getLeads() : [];
    var hot = leads.filter(function(l){ return l.hot_score >= 70 || l.hot_tier==='HOT'; })
      .sort(function(a,b){ return (b.hot_score||0)-(a.hot_score||0); })
      .slice(0, parseInt(req.query.limit)||100);
    res.json({ok:true,leads:hot,total:hot.length});
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});

app.get('/api/leads/:id/validate', (req, res) => {
  try {
    const leads = db.readDB().leads || [];
    const lead = leads.find(l => l.id === req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    const validation = validateLeadAddress(lead);
    res.json({ ok: true, lead_id: lead.id, ...validation });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/leads/:id/address — manually correct a single lead's address
app.get('/api/leads/:id/activities', (req, res) => {
  try {
    const lead = db.getLeads().find(l => l.id === req.params.id);
    if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found' });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const activities = db.getLeadActivities(req.params.id, { limit });
    res.json({ ok: true, lead_id: req.params.id, activities, count: activities.length });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/leads/:id/activities', (req, res) => {
  try {
    const activity = db.addLeadActivity(req.params.id, req.body || {});
    if (activity && activity.error) return res.status(activity.status || 400).json({ ok: false, error: activity.error });
    res.json({ ok: true, activity });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.patch('/api/leads/:id/assignment', (req, res) => {
  try {
    const lead = db.updateLeadAssignmentState(req.params.id, req.body || {});
    if (lead && lead.error) return res.status(lead.status || 400).json({ ok: false, error: lead.error });
    res.json({ ok: true, lead });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.patch('/api/leads/:id/address', (req, res) => {
  try {
    const dbData = db.readDB();
    const leads = dbData.leads || [];
    const lead = leads.find(l => l.id === req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { address, city, state, zip } = req.body;
    
    if (address) lead.address = address.trim();
    if (city) lead.city = city.trim();
    if (state) lead.state = state.trim().toUpperCase();
    if (zip) lead.zip = zip.trim();
    
    lead._address_manually_corrected = true;
    lead._address_corrected_date = new Date().toISOString().split('T')[0];

    // Re-validate after correction
    const validation = validateLeadAddress(lead);
    lead._google_maps_link = validation.google_maps_link;
    lead._zillow_link = validation.zillow_link;
    lead._address_validated = validation.validation_status !== 'INVALID_ADDRESS_REQUIRES_REVIEW';

    dbData.leads = leads;
    db.writeDB(dbData);

    res.json({ ok: true, lead, validation });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/leads/:id', (req, res) => {
  const lead = db.getLeads().find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(withLeadIntelligence(lead));
});

app.post('/api/leads', (req, res) => {
  const lead = db.addLead(req.body);
  res.json(lead);
});

app.put('/api/leads/:id', (req, res) => {
  const updated = db.updateLead(req.params.id, req.body);
  res.json(updated || { error: 'Not found' });
});

app.delete('/api/leads/:id', (req, res) => {
  const leads = db.getLeads().filter(l => l.id !== req.params.id);
  const dbData = db.readDB();
  dbData.leads = leads;
  db.writeDB(dbData);
  res.json({ ok: true });
});

// Ã¢ÂÂÃ¢ÂÂ API: Buyers Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/buyers', (req, res) => {
  try {
    let buyers = db.readDB().buyers || [];
    
    // State filter
    if (req.query.state) {
      const st = req.query.state.toUpperCase();
      buyers = buyers.filter(b => (b.state||'').toUpperCase() === st);
    }
    // County filter (optional)
    if (req.query.county) {
      const co = req.query.county.toLowerCase();
      buyers = buyers.filter(b => (b.counties||'').toLowerCase().includes(co));
    }
    // Type filter
    if (req.query.type) {
      const t = req.query.type.toLowerCase();
      buyers = buyers.filter(b => (b.buyTypes||[]).some(bt => bt.toLowerCase().includes(t)));
    }
    // Search filter
    if (req.query.search) {
      const s = req.query.search.toLowerCase();
      buyers = buyers.filter(b => 
        (b.name||'').toLowerCase().includes(s) || 
        (b.email||'').toLowerCase().includes(s) ||
        (b.counties||'').toLowerCase().includes(s)
      );
    }
    
    // Role check — users get limited buyer info (no full contact details)
    const userId = req.headers['x-user-id'] || req.query._uid ||
                   (req.headers.cookie||'').match(/userId=([^;]+)/)?.[1];
    const users  = db.readDB().users || [];
    const currentUser = users.find(u => u.id === userId);
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    if (!isAdmin) {
      // Non-admins: return limited buyer info only (no contact details)
      buyers = buyers.map(b => ({
        id: b.id, name: b.name, state: b.state,
        counties: b.counties, buyTypes: b.buyTypes,
        maxPrice: b.maxPrice, status: b.status
      }));
    }
    
    res.json({ buyers, total: buyers.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/buyers/:id', (req, res) => {
  const dbData = db.readDB();
  const idx = (dbData.buyers || []).findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Buyer not found' });
  dbData.buyers[idx] = { ...dbData.buyers[idx], ...req.body };
  db.writeDB(dbData);
  res.json(dbData.buyers[idx]);
});

// Ã¢ÂÂÃ¢ÂÂ API: Calendar Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/calendar', (req, res) => {
  const dbData = db.readDB();
  res.json({ events: dbData.calendar || [] });
});

app.post('/api/calendar', (req, res) => {
  const evt = db.addEvent(req.body);
  res.json(evt);
});

// Ã¢ÂÂÃ¢ÂÂ API: Follow-ups Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Read-only operational event inspection
app.get('/api/events', (req, res) => {
  const rawLimit = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 250) : 50;
  const filters = { limit };

  ['event_type', 'entity_type', 'entity_id'].forEach(function(key) {
    if (req.query[key]) filters[key] = String(req.query[key]);
  });

  const events = db.getEvents ? db.getEvents(filters) : [];
  res.json({
    success: true,
    count: events.length,
    filters: filters,
    events: events
  });
});

app.get('/api/followups', (req, res) => {
  const dbData = db.readDB();
  const today = new Date().toISOString().slice(0,10);
  const { due } = req.query;
  let fus = dbData.followups || [];
  if (due === 'true') fus = fus.filter(f => f.status === 'pending' && f.nextDate <= today);
  res.json({ followups: fus, count: fus.length });
});

app.put('/api/followups/:id', (req, res) => {
  const dbData = db.readDB();
  const fu = (dbData.followups || []).find(f => f.id === req.params.id);
  if (!fu) return res.status(404).json({ error: 'Not found' });
  Object.assign(fu, req.body);
  db.writeDB(dbData);
  res.json(fu);
});

// Ã¢ÂÂÃ¢ÂÂ API: Assignments Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/assignments', (req, res) => {
  const dbData = db.readDB();
  res.json({ assignments: dbData.assignments || [] });
});

app.post('/api/assignments', (req, res) => {
  const dbData = db.readDB();
  if (!dbData.assignments) dbData.assignments = [];
  const asgn = { id: 'A' + Date.now(), ...req.body, created: new Date().toISOString().slice(0,10) };
  dbData.assignments.push(asgn);
  db.writeDB(dbData);
  if (db.appendEvent) {
    try {
      var leadId = asgn.leadId || asgn.lead_id || null;
      db.appendEvent({
        event_type: 'assignment_created',
        category: 'assignment',
        entity: {
          type: 'assignment',
          id: asgn.id,
          lead_id: leadId
        },
        payload: {
          lead_id: leadId,
          buyer_id: asgn.buyerId || asgn.buyer_id || null,
          assignment_fee: asgn.fee || asgn.assignment_fee || null,
          status: asgn.status || null
        },
        source: {
          system: 'server',
          module: 'assignment-route',
          route: 'POST /api/assignments'
        },
        dedupe_key: 'assignment_created:' + asgn.id
      });
    } catch(eventError) {
      logger.warn({event:'assignment_created_event_append_failed',id:asgn.id,error:eventError.message});
    }
  }
  res.json(asgn);
});

// Ã¢ÂÂÃ¢ÂÂ API: Contracts Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/contracts/fill', async (req, res) => {
  try {
    const { fillContract } = require('./modules/contracts');
    const { leadId, sellerName, titleCompany, extraNotes } = req.body;
    const lead = db.getLeads().find(l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const result = await fillContract(lead, sellerName, titleCompany, extraNotes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ã¢ÂÂÃ¢ÂÂ API: Settings Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/settings', (req, res) => {
  const dbData = db.readDB();
  res.json(dbData.settings || {});
});

app.put('/api/settings', (req, res) => {
  const dbData = db.readDB();
  dbData.settings = { ...(dbData.settings || {}), ...req.body };
  db.writeDB(dbData);
  res.json(dbData.settings);
});

// Ã¢ÂÂÃ¢ÂÂ API: CSV Import Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/leads/import', (req, res) => {
  try {
    const { leads } = req.body;
    if (!leads || !Array.isArray(leads)) return res.status(400).json({ error: 'No leads array' });
    const existing = new Set(db.getLeads().map(l => l.address?.toLowerCase().trim()));
    let imported = 0;
      const rejected = [];
    for (const lead of leads) {
      if (!lead.address) continue;
      if (existing.has(lead.address.toLowerCase().trim())) continue;
      const _vr = validateLead(lead, seenAddresses);
      if (!_vr.valid) { rejected.push({ address: lead.address, reason: _vr.reason }); continue; }
      db.addLead({ ...lead, status: lead.status || 'New Lead', source: lead.source || 'CSV Import' });
      imported++;
    }
    res.json({ ok: true, imported, total: leads.length, skipped: leads.length - imported, rejected: rejected.length, rejectedLeads: rejected });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: PDF Lead Extraction Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/leads/extract-pdf', async (req, res) => {
  try {
    const { filename, base64preview } = req.body;
    const { ask } = require('./ai');
    const prompt = `You are a real estate data extraction AI. A PDF file named "${filename}" was uploaded containing wholesale real estate leads.

Based on the file name and typical wholesale lead list formats, generate realistic lead data in this exact JSON format.
The PDF likely contains properties similar to what a BatchLeads, PropStream, or MLS export would contain.

Return a JSON array of 20-50 lead objects, each with:
{
  "address": "full street address, city, state zip",
  "category": "Pre-FC|REO|Long DOM|FSBO|Probate",
  "list_price": "$XXX,XXX",
  "beds": number,
  "baths": number,
  "sqft": number,
  "year": number,
  "phone": "(XXX) XXX-XXXX",
  "county": "county name",
  "dom": number,
  "status": "New Lead",
  "source": "PDF Import"
}

Make addresses realistic for the market implied by the filename. Return ONLY the JSON array.`;

    const raw = await ask(prompt, '', 4000);
    const cleaned = raw.replace(/\`\`\`json|\`\`\`/g, '').trim();
    const leads = JSON.parse(cleaned);
    res.json({ leads: Array.isArray(leads) ? leads : [], filename });
  } catch (err) {
    res.json({ leads: [], error: err.message });
  }
});

// Ã¢ÂÂÃ¢ÂÂ API: AI Note generation Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/ai/note', async (req, res) => {
  try {
    const { type, title, date, context } = req.body;
    const { ask } = require('./ai');
    const prompt = `Generate a concise professional note for a real estate ${type} item.
Title: ${title}
Date: ${date || 'N/A'}
Context: ${context || 'No additional context'}
Write 1-2 sentences. Be specific and actionable. Return just the note text.`;
    const note = await ask(prompt, '', 200);
    res.json({ note });
  } catch (err) { res.json({ note: 'AI note generation unavailable.' }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: PDF Lead Import Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/leads/import-pdf', async (req, res) => {
  try {
    const { filename, base64, size } = req.body;
    const { ask } = require('./ai');

    // Use AI to extract lead data from PDF content description
    const prompt = `You are analyzing a real estate wholesale lead list PDF called "${filename}".
The file is ${Math.round((size||0)/1024)}KB.

Extract all property leads from this document. For each property found, return structured data.
If this appears to be a wholesale lead list, foreclosure list, or property database, extract every property.

Return a JSON array of leads. Each lead object:
{
  "address": "full address",
  "beds": number or 3,
  "baths": number or 2,
  "sqft": number or 1400,
  "year": number or 1980,
  "phone": "phone if available or empty",
  "category": "Pre-FC|REO|FSBO|Long DOM|Probate|Auction",
  "list_price": "price as string or empty",
  "dom": number or 60,
  "county": "county name",
  "arv": number or 0,
  "offer": number or 0,
  "fee_lo": number or 10000,
  "fee_hi": number or 20000
}

If you cannot extract specific leads, return: {"leads":[], "message":"Could not extract leads from this PDF type"}
Otherwise return: {"leads": [...array of leads...]}`;

    const result = await ask(prompt, 'You extract real estate data from documents. Return only valid JSON.', 3000);
    const cleaned = result.replace(/\`\`\`json|\`\`\`/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.leads && Array.isArray(parsed.leads) && parsed.leads.length > 0) {
      res.json({ leads: parsed.leads, count: parsed.leads.length });
    } else {
      res.json({ leads: [], message: parsed.message || 'No leads found in PDF' });
    }
  } catch (err) {
    res.json({ leads: [], message: 'PDF processing failed: ' + err.message });
  }
});

// Ã¢ÂÂÃ¢ÂÂ API: Leads by State/County hierarchy Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/leads/hierarchy', (req, res) => {
  try {
    const tree = db.getLeadsByStateCounty();
    res.json({ tree, total: db.getLeads().length });
  } catch(err) { res.json({ tree: {}, total: 0 }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: Stats with followups_due Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/stats', (req, res) => {
  const stats = db.getStats();
  const today = new Date().toISOString().slice(0,10);
  const dbData = db.readDB();
  stats.followups_due = (dbData.followups||[]).filter(f => f.status==='pending' && f.nextDate<=today).length;
  stats.backups = (dbData.backups||[]).slice(-7);
  res.json(stats);
});

// Ã¢ÂÂÃ¢ÂÂ API: Notifications Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/notifications', (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const notifs = db.getNotifications(unreadOnly);
  res.json({ notifications: notifs, unread: notifs.filter(n=>!n.read).length });
});

app.post('/api/notifications/read', (req, res) => {
  const { ids } = req.body;
  db.markNotificationsRead(ids||[]);
  res.json({ ok: true });
});

// Ã¢ÂÂÃ¢ÂÂ API: Markets Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/markets/best', (req, res) => {
  try {
    const { selectMarketsForWeek } = require('./markets');
    const scanned = db.getScannedMarkets();
    const markets = selectMarketsForWeek(12, scanned);
    res.json({ markets });
  } catch(err) { res.json({ markets: [] }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: Scan status Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/scan/status', (req, res) => {
  const dbData = db.readDB();
  res.json({
    scanned_markets: db.getScannedMarkets().length,
    last_backup: (dbData.backups||[]).slice(-1)[0] || null,
    total_leads: db.getLeads().length,
    total_buyers: db.getBuyers().length,
  });
});

// Ã¢ÂÂÃ¢ÂÂ API: Buy Boxes Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/buyboxes', (req, res) => {
  const { getBuyBoxes } = require('./modules/buybox');
  res.json({ buyboxes: getBuyBoxes() });
});

app.post('/api/buyboxes', (req, res) => {
  const { addBuyBox } = require('./modules/buybox');
  const box = addBuyBox(req.body);
  if (!box) return res.json({ ok: false, error: 'Duplicate buy box' });
  db.addNotification('buyer', 'New buy box added', `${req.body.name} Ã¢ÂÂ ${req.body.county||'Unknown'}, ${req.body.state||'TX'}`);
  res.json({ ok: true, buybox: box });
});

app.post('/api/buyboxes/extract', (req, res) => {
  const { extractFromBuyers } = require('./modules/buybox');
  const count = extractFromBuyers();
  if (count > 0) db.addNotification('buyer', `${count} buy boxes extracted`, 'Extracted from existing buyers database');
  res.json({ ok: true, extracted: count });
});

app.get('/api/buyboxes/recommendations', (req, res) => {
  const { getBuyBoxRecommendations } = require('./modules/buybox');
  res.json({ recommendations: getBuyBoxRecommendations() });
});

app.post('/api/buyboxes/match/:leadId', (req, res) => {
  const lead = db.getLeads().find(l => l.id === req.params.leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const { matchBuyBoxesToLead } = require('./modules/buybox');
  res.json({ matches: matchBuyBoxesToLead(lead) });
});

// Ã¢ÂÂÃ¢ÂÂ API: Outreach Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/outreach/:leadId', (req, res) => {
  const { getOutreachHistory } = require('./modules/outreach');
  res.json({ history: getOutreachHistory(req.params.leadId) });
});

app.post('/api/outreach/generate', (req, res) => {
  const { generateSellerSMS, generateSellerEmail, generateBuyerSMS, generateBuyerEmail, generateCallScript } = require('./modules/outreach');
  const { leadId, type } = req.body;
  const lead = db.getLeads().find(l => l.id === leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  let result = {};
  if (type === 'seller_sms') result = { message: generateSellerSMS(lead) };
  else if (type === 'seller_email') result = generateSellerEmail(lead);
  else if (type === 'call_script') result = { message: generateCallScript(lead) };
  else result = { seller_sms: generateSellerSMS(lead), seller_email: generateSellerEmail(lead), call_script: generateCallScript(lead) };
  res.json(result);
});

app.post('/api/outreach/save-edit', (req, res) => {
  const { saveToneEdit } = require('./modules/outreach');
  const { original, edited, context } = req.body;
  saveToneEdit(original, edited, context);
  res.json({ ok: true });
});

app.post('/api/outreach/record', (req, res) => {
  const { saveOutreachRecord } = require('./modules/outreach');
  const { leadId, type, message } = req.body;
  const record = saveOutreachRecord(leadId, type, message);
  res.json({ ok: true, record });
});

app.get('/api/outreach/tone-status', (req, res) => {
  const { getToneLearnings, getAutoSendEnabled } = require('./modules/outreach');
  const learnings = getToneLearnings();
  res.json({ edits: learnings.length, auto_send: getAutoSendEnabled(), ready: learnings.length >= 5 });
});

// Ã¢ÂÂÃ¢ÂÂ API: Contracts Library Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/contracts/templates', (req, res) => {
  const { getTemplates } = require('./modules/contract_templates');
  res.json({ templates: getTemplates() });
});

app.get('/api/contracts/templates/:id', (req, res) => {
  const { getTemplate } = require('./modules/contract_templates');
  const t = getTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json(t);
});

app.get('/api/contracts/custom', (req, res) => {
  const dbData = db.readDB();
  res.json({ contracts: dbData.custom_contracts || [] });
});

app.post('/api/contracts/custom', (req, res) => {
  const dbData = db.readDB();
  if (!dbData.custom_contracts) dbData.custom_contracts = [];
  const contract = { id: 'CC' + Date.now(), ...req.body, created: new Date().toISOString().slice(0,10), version: 1 };
  dbData.custom_contracts.push(contract);
  db.writeDB(dbData);
  res.json({ ok: true, contract });
});

app.put('/api/contracts/custom/:id', (req, res) => {
  const dbData = db.readDB();
  const idx = (dbData.custom_contracts||[]).findIndex(c => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  dbData.custom_contracts[idx] = { ...dbData.custom_contracts[idx], ...req.body, version: (dbData.custom_contracts[idx].version||1)+1, updated: new Date().toISOString().slice(0,10) };
  db.writeDB(dbData);
  res.json({ ok: true, contract: dbData.custom_contracts[idx] });
});

// Ã¢ÂÂÃ¢ÂÂ API: Automation Control Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/automation/scan', function(req, res) {
  res.status(410).json({ error: 'DISABLED - AI lead generation removed. Use real CSV imports.' });
});

app.post('/api/automation/extract-buyboxes', (req, res) => {
  const { extractFromBuyers, generateMarketBuyBoxes, addBuyBoxesBulk } = require('./modules/buybox');
  const fromBuyers = extractFromBuyers();
  db.addNotification('buyer', `${fromBuyers} buy boxes extracted`, 'Extracted from buyers database');
  res.json({ ok: true, extracted: fromBuyers });
});

// Ã¢ÂÂÃ¢ÂÂ API: Lead Quality Score Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/leads/:id/quality', (req, res) => {
  const lead = db.getLeads().find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  const { scoreLeadQuality } = require('./modules/outreach');
  res.json(scoreLeadQuality(lead));
});

// Ã¢ÂÂÃ¢ÂÂ API: Outreach generation Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/outreach/generate', (req, res) => {
  const { leadId, buyerId } = req.body;
  const lead = db.getLeads().find(l => l.id === leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const { scoreLeadQuality, generateSellerSMS, generateSellerEmail, generateCallScript, generateBuyerSMS, generateBuyerEmail } = require('./modules/outreach');
  const quality = scoreLeadQuality(lead);
  const result = {
    quality,
    seller_sms: generateSellerSMS(lead, quality),
    seller_email: generateSellerEmail(lead, quality),
    call_script: generateCallScript(lead, quality),
  };
  if (buyerId) {
    const buyer = db.getBuyers().find(b => b.id === buyerId);
    if (buyer) {
      result.buyer_sms = generateBuyerSMS(lead, buyer);
      result.buyer_email = generateBuyerEmail(lead, buyer);
    }
  }
  res.json(result);
});

app.post('/api/outreach/intro-email', (req, res) => {
  const { buyerId } = req.body;
  const buyer = db.getBuyers().find(b => b.id === buyerId);
  if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
  const { generateBuyerIntroEmail } = require('./modules/outreach');
  res.json(generateBuyerIntroEmail(buyer));
});

app.post('/api/outreach/save-edit', (req, res) => {
  const { original, edited, context } = req.body;
  const { saveToneEdit } = require('./modules/outreach');
  saveToneEdit(original, edited, context);
  res.json({ ok: true });
});

app.post('/api/outreach/record', (req, res) => {
  const { leadId, type, message } = req.body;
  const { saveOutreachRecord } = require('./modules/outreach');
  const record = saveOutreachRecord(leadId, type, message);
  res.json({ ok: true, record });
});

app.get('/api/outreach/:leadId', (req, res) => {
  const { getOutreachHistory } = require('./modules/outreach');
  res.json({ history: getOutreachHistory(req.params.leadId) });
});

app.get('/api/outreach/tone-status', (req, res) => {
  const { getToneLearnings, getAutoSendEnabled } = require('./modules/outreach');
  const learnings = getToneLearnings();
  res.json({ edits: learnings.length, auto_send: getAutoSendEnabled(), ready: learnings.length >= 5 });
});

// Ã¢ÂÂÃ¢ÂÂ API: Land deals Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/leads/land', async (req, res) => {
  try {
    const { county, state, count } = req.body;
    const { generateLandLeads } = require('./ai');
    const leads = generateLandLeads(county || 'Dallas', state || 'TX', count || 10);
    let added = 0;
    for (const lead of leads) {
      if (db.leadExists(lead.address)) continue;
      db.addLead(lead);
      added++;
    }
    db.addNotification('deal', `${added} land deals added`, `${county}, ${state} Ã¢ÂÂ land opportunities`);
    res.json({ ok: true, added, leads: leads.slice(0, added) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: Buyer intro email Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/buyers/:id/intro-email', (req, res) => {
  const buyer = db.getBuyers().find(b => b.id === req.params.id);
  if (!buyer) return res.status(404).json({ error: 'Not found' });
  const { generateBuyerIntroEmail } = require('./modules/outreach');
  res.json(generateBuyerIntroEmail(buyer));
});

// Ã¢ÂÂÃ¢ÂÂ API: Deal send (address-protected) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/deals/send', (req, res) => {
  try {
    const { leadId, buyerId } = req.body;
    const lead = db.getLeads().find(l => l.id === leadId);
    const buyer = db.getBuyers().find(b => b.id === buyerId);
    if (!lead || !buyer) return res.status(404).json({ error: 'Lead or buyer not found' });
    const { generateBuyerEmail } = require('./modules/outreach');
    const email = generateBuyerEmail(lead, buyer);
    // Log deal sent
    const dbData = db.readDB();
    if (!dbData.deals_sent) dbData.deals_sent = [];
    dbData.deals_sent.push({ leadId, buyerId, buyerName: buyer.name, sent: new Date().toISOString(), version: email.subject });
    db.writeDB(dbData);
    db.addNotification('match', `Deal sent to ${buyer.name}`, `${lead.address?.split(',')[0]} Ã¢ÂÂ city-only version sent`);
    res.json({ ok: true, email });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: Auth / Users Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  const user = db.getUserByPin(String(pin));
  if (!user) return res.status(401).json({ error: 'Invalid PIN' });
  res.json({ ok: true, user: { id: user.id, name: user.name, role: user.role, color: user.color, initials: user.initials, firstLogin: user.firstLogin } });
});

app.get('/api/users', (req, res) => {
  // Admin only endpoint
  const users = db.getUsers().map(u => ({ id:u.id, name:u.name, role:u.role, color:u.color, initials:u.initials, firstLogin:u.firstLogin, created:u.created }));
  res.json({ users });
});

app.put('/api/users/:id', (req, res) => {
  const result = db.updateUser(req.params.id, req.body);
  if (result?.error) return res.status(400).json(result);
  res.json({ ok: true, user: result });
});

app.post('/api/users', (req, res) => {
  const result = db.addUser(req.body);
  if (result?.error) return res.status(400).json(result);
  res.json({ ok: true, user: result });
});

// Ã¢ÂÂÃ¢ÂÂ API: User-scoped leads Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/leads/user/:userId', (req, res) => {
  const leads = db.getLeadsForUser(req.params.userId);
  res.json({ leads, total: leads.length });
});

app.get('/api/leads/hierarchy/:userId', (req, res) => {
  const tree = db.getLeadsByStateCountyForUser(req.params.userId);
  res.json({ tree, total: db.getLeadsForUser(req.params.userId).length });
});

app.get('/api/stats/:userId', (req, res) => {
  const stats = db.getStatsForUser(req.params.userId);
  const today = new Date().toISOString().slice(0,10);
  const dbData = db.readDB();
  stats.followups_due = (dbData.followups||[]).filter(f => f.status==='pending' && f.nextDate<=today).length;
  res.json(stats);
});

// Ã¢ÂÂÃ¢ÂÂ API: Dashboard search (no Telegram needed) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/search/leads', function(req, res) {
  res.status(410).json({ error: 'DISABLED - AI lead generation removed. Use real CSV imports.' });
});

// Ã¢ÂÂÃ¢ÂÂ API: State auto-populate Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/states/populate', function(req, res) {
  res.status(410).json({ error: 'DISABLED - AI lead generation removed. Use real CSV imports.' });
});

// Ã¢ÂÂÃ¢ÂÂ API: Pending buyers Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/buyers/pending', (req, res) => {
  res.json({ pending: db.getPendingBuyers() });
});

app.post('/api/buyers/pending', (req, res) => {
  const { buyer, userId } = req.body;
  const pending = db.addPendingBuyer(buyer, userId||'guest');
  res.json({ ok: true, pending });
});

app.post('/api/buyers/pending/:id/approve', (req, res) => {
  const buyer = db.approvePendingBuyer(req.params.id);
  if (!buyer) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, buyer });
});

app.post('/api/buyers/pending/:id/reject', (req, res) => {
  db.rejectPendingBuyer(req.params.id);
  res.json({ ok: true });
});

// Ã¢ÂÂÃ¢ÂÂ API: State/County data Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/states', (req, res) => {
  const { MARKETS } = require('./markets');
  const populated = db.readDB().populated_states || [];
  const states = Object.entries(MARKETS).map(([code, data]) => ({
    code, name: data.name,
    counties: Object.keys(data.counties||{}).map(c => c.replace(/_/g,' ')),
    populated: populated.includes(code),
    leadCount: db.getLeads().filter(l => l.state===code).length,
  })).sort((a,b) => a.name.localeCompare(b.name));
  res.json({ states });
});

// Ã¢ÂÂÃ¢ÂÂ API: Fix state/county data Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/leads/fix-states', (req, res) => {
  const dbData = db.readDB();
  const STATE_MAP = {
    'Wayne':'MI','Cuyahoga':'OH','Franklin':'OH','Hamilton':'OH','Cook':'IL',
    'Philadelphia':'PA','Allegheny':'PA','Kings':'NY','Bronx':'NY','Queens':'NY',
    'Multnomah':'OR','King':'WA','Clark':'NV','Maricopa':'AZ','Pima':'AZ',
    'Fulton':'GA','DeKalb':'GA','Gwinnett':'GA','Jefferson':'AL',
    'Hennepin':'MN','Ramsey':'MN','Milwaukee':'WI','Dane':'WI',
    'Shelby':'TN','Davidson':'TN','Orleans':'LA','Jefferson Parish':'LA',
    'Baltimore City':'MD','Prince Georges':'MD','Essex':'NJ','Hudson':'NJ',
    'Denver':'CO','Bernalillo':'NM','Salt Lake':'UT','Ada':'ID',
    'Hillsborough':'FL','Miami-Dade':'FL','Broward':'FL','Palm Beach':'FL',
    'Mecklenburg':'NC','Wake':'NC','Richland':'SC','Charleston':'SC',
    'Richmond City':'VA','Henrico':'VA','Harris':'TX','Bexar':'TX',
    'Travis':'TX','Dallas':'TX','Tarrant':'TX','Collin':'TX',
    'San Diego':'CA','Los Angeles':'CA','Riverside':'CA','Sacramento':'CA',
  };
  let fixed = 0;
  (dbData.leads||[]).forEach(lead => {
    const county = lead.county||'';
    // Fix "Detroit Michigan" style county names
    if (county.includes(' ')) {
      const parts = county.split(' ');
      const lastWord = parts[parts.length-1];
      const STATE_NAMES = {Michigan:'MI',Ohio:'OH',Illinois:'IL',Pennsylvania:'PA',New:'NY',California:'CA',Texas:'TX',Florida:'FL',Georgia:'GA',Arizona:'AZ',Nevada:'NV',Colorado:'CO',Oregon:'OR',Washington:'WA',Tennessee:'TN',Minnesota:'MN',Wisconsin:'WI'};
      if (STATE_NAMES[lastWord]) {
        lead.state = STATE_NAMES[lastWord];
        lead.county = parts.slice(0,-1).join(' ');
        fixed++;
      } else if (STATE_NAMES[parts[1]]) {
        lead.state = STATE_NAMES[parts[1]];
        lead.county = parts[0];
        fixed++;
      }
    }
    // Fix countyÃ¢ÂÂstate mapping
    const correctState = STATE_MAP[county];
    if (correctState && lead.state !== correctState) {
      lead.state = correctState;
      fixed++;
    }
  });
  if (fixed > 0) db.writeDB(dbData);
  res.json({ ok: true, fixed });
});


// Ã¢ÂÂÃ¢ÂÂ Gmail API endpoints Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

function getGmailTransport() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const user = process.env.GMAIL_USER;
  if (!clientId || !clientSecret || !refreshToken || !user) return null;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground');
  oauth2.setCredentials({ refresh_token: refreshToken });
  return { oauth2, user };
}

app.get('/api/gmail/test', async (req, res) => {
  const vars = { clientId: !!process.env.GMAIL_CLIENT_ID, clientSecret: !!process.env.GMAIL_CLIENT_SECRET, refreshToken: !!process.env.GMAIL_REFRESH_TOKEN, user: process.env.GMAIL_USER };
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.json({ ok: false, vars, error: 'Missing variables' });
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    res.json({ ok: true, email: profile.data.emailAddress, messagesTotal: profile.data.messagesTotal, vars });
  } catch(e) { res.json({ ok: false, error: e.message, vars }); }
});

app.get('/api/gmail/inbox', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.status(503).json({ error: 'Gmail not configured' });
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    const list = await gmail.users.messages.list({ userId: 'me', maxResults: 20, labelIds: ['INBOX'] });
    const messages = await Promise.all((list.data.messages||[]).map(async (m) => {
      const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From','Subject','Date'] });
      const headers = msg.data.payload.headers;
      const get = (name) => (headers.find(h=>h.name===name)||{value:''}).value;
      return { id: m.id, threadId: msg.data.threadId, from: get('From'), subject: get('Subject'), date: get('Date'), snippet: msg.data.snippet, unread: (msg.data.labelIds||[]).includes('UNREAD') };
    }));
    res.json({ messages });
  } catch(e) { res.status(503).json({ error: e.message }); }
});

app.get('/api/gmail/message/:id', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.status(503).json({ error: 'Gmail not configured' });
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    const msg = await gmail.users.messages.get({ userId: 'me', id: req.params.id, format: 'full' });
    const headers = msg.data.payload.headers;
    const get = (name) => (headers.find(h=>h.name===name)||{value:''}).value;

    // Recursively extract body from potentially nested multipart messages
    function extractBody(payload) {
      if (!payload) return '';
      // Direct body data (non-multipart)
      if (payload.body && payload.body.data) {
        const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        if (payload.mimeType === 'text/html') {
          // Strip HTML tags for plain text display
          return decoded.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<\/p>/gi, '\n\n')
                        .replace(/<\/div>/gi, '\n')
                        .replace(/<[^>]+>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/\n{3,}/g, '\n\n')
                        .trim();
        }
        return decoded;
      }
      // Multipart: recurse into parts, prefer text/plain
      if (payload.parts && payload.parts.length) {
        const plainPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (plainPart) return extractBody(plainPart);
        const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
        if (htmlPart) return extractBody(htmlPart);
        // Recurse into nested multipart (multipart/alternative, multipart/related, etc.)
        for (const part of payload.parts) {
          const result = extractBody(part);
          if (result) return result;
        }
      }
      return '';
    }

    const body = extractBody(msg.data.payload) || '(No readable content in this email)';
    res.json({ id: msg.data.id, threadId: msg.data.threadId, from: get('From'), subject: get('Subject'), date: get('Date'), body });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gmail/send', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.status(503).json({ error: 'Gmail not configured.' });
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'Missing to, subject, or body.' });
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    // Build RFC 2822 message
    const messageParts = [
      'From: ' + cfg.user,
      'To: ' + to,
      'Subject: ' + subject,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body
    ];
    const raw = Buffer.from(messageParts.join('\n')).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    db.addNotification('system', 'Email sent', 'To: ' + to + ' Ã¢ÂÂ ' + subject);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Delete Gmail messages (move to trash)
app.post('/api/gmail/delete-bulk', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.json({ ok: false, error: 'Gmail not configured' });
    const { ids } = req.body;
    if (!ids || !ids.length) return res.json({ ok: false, error: 'No message IDs provided' });
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    // Move each to trash (safer than permanent delete)
    let deleted = 0;
    for (const id of ids) {
      try {
        await gmail.users.messages.trash({ userId: 'me', id });
        deleted++;
      } catch(e) { logger.info('Trash error for', id, e.message); }
    }
    res.json({ ok: true, deleted });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Get messages list by folder
app.get('/api/gmail/messages', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.json({ messages: [], error: 'Gmail not configured' });
    const folder = req.query.folder || 'inbox';
    const limit = parseInt(req.query.limit) || 20;
    const labelMap = { inbox: 'INBOX', sent: 'SENT', drafts: 'DRAFT', starred: 'STARRED' };
    const label = labelMap[folder] || 'INBOX';
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    const listRes = await gmail.users.messages.list({ userId: 'me', labelIds: [label], maxResults: limit });
    const messages = listRes.data.messages || [];
    // Fetch metadata for each message
    const details = await Promise.all(messages.slice(0,limit).map(async m => {
      try {
        const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From','To','Subject','Date'] });
        const get = (name) => (msg.data.payload.headers.find(h=>h.name===name)||{value:''}).value;
        const isRead = !msg.data.labelIds.includes('UNREAD');
        return { id: m.id, from: get('From'), to: get('To'), subject: get('Subject'), date: get('Date'), snippet: msg.data.snippet, read: isRead };
      } catch(e) { return { id: m.id, subject: '(error loading)', snippet: e.message, read: true }; }
    }));
    res.json({ ok: true, messages: details });
  } catch(e) { res.json({ ok: false, messages: [], error: e.message }); }
});

app.post('/api/gmail/reply', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.status(503).json({ error: 'Gmail not configured.' });
    const { to, body, threadId, messageId } = req.body;
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    // Fetch original to get subject for Re: prefix
    let subject = 'Re: (your message)';
    try {
      const orig = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'metadata', metadataHeaders: ['Subject'] });
      const origSubject = (orig.data.payload.headers.find(h=>h.name==='Subject')||{value:''}).value;
      subject = origSubject.startsWith('Re:') ? origSubject : 'Re: ' + origSubject;
    } catch(e2) {}
    const messageParts = [
      'From: ' + cfg.user,
      'To: ' + to,
      'Subject: ' + subject,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body
    ];
    const raw = Buffer.from(messageParts.join('\n')).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId } });
    db.addNotification('system', 'Reply sent', 'To: ' + to);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Ã¢ÂÂÃ¢ÂÂ Property Intelligence Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/property/intel/:leadId', async (req, res) => {
  try {
    const lead = db.getLeads().find(l => l.id === req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const scraper = require('./scraper');
    const intel   = await scraper.fetchPropertyIntelligence(lead.address, lead.county, lead.state, lead.beds);
    const dbData  = db.readDB();
    const idx     = (dbData.leads||[]).findIndex(l => l.id === lead.id);
    if (idx >= 0) { dbData.leads[idx] = { ...dbData.leads[idx], ...intel, intel_fetched: new Date().toISOString() }; db.writeDB(dbData); }
    res.json({ ok: true, intel });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/outreach/deep', async (req, res) => {
  try {
    const { leadId } = req.body;
    const lead = db.getLeads().find(l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const ai = require('./ai');
    const intel = { avgCompPrice: lead.avgCompPrice, compSource: lead.compSource, comps: lead.comps, rentEstimate: lead.rent_estimate, lastSalePrice: lead.lastSalePrice, lastSaleYear: lead.lastSaleYear, zestimate: lead.zestimate };
    const result = await ai.generateDeepOutreach(lead, intel);
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/outreach/buyer-intro', async (req, res) => {
  try {
    const { buyerId } = req.body;
    const buyer = db.getBuyers().find(b => b.id === buyerId);
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
    const ai = require('./ai');
    const result = await ai.generateBuyerIntroOutreach(buyer);
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/review-queue', (req, res) => {
  try {
    const queue = manualReviewQueue.readQueue();
    res.json({ queue, count: queue.length, summary: manualReviewQueue.summary(queue) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/review-queue/action', (req, res) => {
  try {
    const { id, action } = req.body;
    const status = action === 'accept' || action === 'resolve' ? 'resolved'
      : action === 'reject' ? 'bad_source'
        : action === 'reviewed' ? 'reviewed'
          : 'open';
    const row = manualReviewQueue.updateStatus(id, status, { action_note: 'Manual review action from operator queue. No lead auto-promotion.' });
    const queue = manualReviewQueue.readQueue();
    res.json({ ok: true, action, row, remaining: queue.length, summary: manualReviewQueue.summary(queue), safety: 'Manual review queue does not auto-create production leads.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/scrape/buyers', async (req, res) => {
  try {
    const scraper = require('./scraper');
    res.json({ ok: true, message: 'Buyer scrape started in background' });
    scraper.runDailyBuyerScrape(db).then(added => {
      if (added > 0) db.addNotification('buyer', added+' new buyers scraped', 'Manual buyer scrape complete');
    }).catch(e => logger.error('Manual scrape error:', e.message));
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// Ã¢ÂÂÃ¢ÂÂ Google Drive API Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function getDriveClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground');
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

app.get('/api/drive/status', async (req, res) => {
  try {
    const drive = getDriveClient();
    if (!drive) return res.json({ connected: false, reason: 'GDRIVE_REFRESH_TOKEN not set in Railway Variables' });
    const about = await drive.about.get({ fields: 'user' });
    res.json({ connected: true, email: about.data.user.emailAddress });
  } catch(e) {
    // Common causes: token expired, wrong scope, revoked access
    const reason = e.message.includes('invalid_grant') ? 'Refresh token expired Ã¢ÂÂ regenerate at OAuth Playground' :
                   e.message.includes('insufficientPermissions') ? 'Token missing Drive scope Ã¢ÂÂ re-authorize with https://www.googleapis.com/auth/drive scope' :
                   e.message.includes('invalid_client') ? 'Invalid Client ID or Secret Ã¢ÂÂ check Railway Variables' :
                   e.message;
    res.json({ connected: false, reason });
  }
});

app.post('/api/drive/backup', async (req, res) => {
  try {
    const drive = getDriveClient();
    if (!drive) return res.json({ ok: false, error: 'Drive not configured. Add GDRIVE_REFRESH_TOKEN to Railway.' });
    const leads = db.getLeads();
    const today = new Date().toISOString().slice(0, 10);
    const headers = ['Address','County','State','Category','ARV','Offer','Repairs','Spread','Fee Lo','Fee Hi','Status','DOM','Phone','Email','Source','Deal Type','Created'];
    const rows = leads.map(l => [
      (l.address||'').replace(/,/g,' '),
      (l.county||'').replace(/,/g,' '),
      l.state||'',
      l.category||'',
      l.arv||0, l.offer||0, l.repairs||0, l.spread||0, l.fee_lo||0, l.fee_hi||0,
      l.status||'New Lead', l.dom||0,
      l.phone||'', l.email||'',
      l.source||'AI Generated', l.dealType||'',
      (l.created||'').slice(0,10),
    ].map(v => '"'+String(v).replace(/"/g,"'")+'"').join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    let folderId;
    const folderSearch = await drive.files.list({ q: "name='Montsan REI' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id,name)' });
    if (folderSearch.data.files.length > 0) { folderId = folderSearch.data.files[0].id; }
    else { const folder = await drive.files.create({ requestBody: { name: 'Montsan REI', mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' }); folderId = folder.data.id; }
    const { Readable } = require('stream');
    await drive.files.create({
      requestBody: { name: 'leads_backup_' + today + '.csv', parents: [folderId] },
      media: { mimeType: 'text/csv', body: Readable.from([csvContent]) }
    });
    db.addNotification('system', 'Google Drive backup complete', leads.length + ' leads exported to Montsan REI/');
    res.json({ ok: true, leads: leads.length, rows: rows.length, folder: 'Montsan REI' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: Search Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ results: [] });
  const lower = q.toLowerCase();
  const leads  = db.getLeads().filter(l => JSON.stringify(l).toLowerCase().includes(lower)).slice(0,10);
  const buyers = db.getBuyers().filter(b => JSON.stringify(b).toLowerCase().includes(lower)).slice(0,5);
  res.json({ results: [...leads.map(l=>({...l,_type:'lead'})), ...buyers.map(b=>({...b,_type:'buyer'}))] });
});


// Ã¢ÂÂÃ¢ÂÂ Scrape progress tracking Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const scrapeProgress = { buyers: null, deals: null };

app.get('/api/scraper/progress', (req, res) => {
  res.json({ buyers: scrapeProgress.buyers, deals: scrapeProgress.deals });
});
// Ã¢ÂÂÃ¢ÂÂ Scraper routes Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const scraper = require('./modules/scraper');

// Trigger buyer scrape manually
app.post('/api/scraper/buyers', async (req, res) => {
  try {
    // Accept custom markets array, fall back to hot markets or all states
    const customMarkets = req.body.markets;
    const markets = Array.isArray(customMarkets) && customMarkets.length > 0
      ? customMarkets
      : req.body.allStates ? scraper.ALL_STATE_MARKETS : scraper.HOT_MARKETS;
    res.json({ ok: true, message: `Buyer scrape started for ${markets.length} market${markets.length===1?'':'s'}` });
    scrapeProgress.buyers = { status: 'running', markets: markets.length, started: new Date().toISOString() };
    setImmediate(async () => {
      try {
        const buyers = await scraper.scrapeCraigslistBuyers(markets);
        let added = 0;
        const existing = db.getBuyers().map(b => `${b.phone||''}${b.email||''}`);
        for (const b of buyers) {
          const key = `${b.phone||''}${b.email||''}`;
          if (key.length > 3 && !existing.includes(key)) {
            b.id = require('uuid').v4();
            db.addBuyer(b);
            added++;
          }
        }
        scrapeProgress.buyers = { status: 'complete', found: added, markets: markets.length, time: new Date().toISOString() };
        db.addNotification('buyer', `${added} real buyers found`, `Craigslist scrape across ${markets.length} markets`);
        logger.info(`Buyer scrape complete: ${added} new buyers added`);
      } catch(e) { logger.error('Buyer scrape error:', e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Trigger deal scrape manually
app.post('/api/scraper/deals', async (req, res) => {
  try {
    const customMarkets = req.body.markets;
    const markets = Array.isArray(customMarkets) && customMarkets.length > 0
      ? customMarkets
      : req.body.allStates ? scraper.ALL_STATE_MARKETS : scraper.HOT_MARKETS;
    res.json({ ok: true, message: `Deal scrape started for ${markets.length} market${markets.length===1?'':'s'}` });
    setImmediate(async () => {
      try {
        const [clDeals, hudDeals, fsboDeals, landDeals] = await Promise.allSettled([
          scraper.scrapeCraigslistDeals(markets),
          scraper.scrapeHUDHomes(),
          scraper.scrapeFSBO(),
          scraper.scrapeLandWatch(),
        ]);
        const allDeals = [
          ...(clDeals.value||[]),
          ...(hudDeals.value||[]),
          ...(fsboDeals.value||[]),
          ...(landDeals.value||[]),
        ];
        // Store in review queue
        const dbData = db.readDB();
        if (!dbData.reviewQueue) dbData.reviewQueue = [];
        let added = 0;
        const existingUrls = new Set(dbData.reviewQueue.map(r => r.sourceUrl));
        for (const deal of allDeals) {
          if (!existingUrls.has(deal.sourceUrl)) {
            deal.id = require('uuid').v4();
            dbData.reviewQueue.push(deal);
            added++;
          }
        }
        db.writeDB(dbData);
        db.addNotification('deal', `${added} deals in Review Queue`, `From Craigslist, HUD, FSBO, Landwatch`);
        logger.info(`Deal scrape complete: ${added} new deals in review queue`);
      } catch(e) { logger.error('Deal scrape error:', e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Get review queue
app.get('/api/review-queue', (req, res) => {
  const queue = manualReviewQueue.readQueue();
  res.json({ queue, count: queue.length, summary: manualReviewQueue.summary(queue) });
});

// Accept a review queue item Ã¢ÂÂ validate + enrich Ã¢ÂÂ add as real lead
app.post('/api/review-queue/:id/accept', async (req, res) => {
  try {
    const row = manualReviewQueue.updateStatus(req.params.id, 'resolved', {
      action_note: 'Resolved from manual review. Create Deal Details separately only after source/address proof exists.'
    });
    res.json({ ok: true, row, safety: 'No production lead was created or mutated.' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Reject a review queue item
app.post('/api/review-queue/:id/reject', (req, res) => {
  try {
    const row = manualReviewQueue.updateStatus(req.params.id, 'bad_source', {
      action_note: 'Rejected as bad source. No lead auto-promotion.'
    });
    res.json({ ok: true, row });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Skip (keep in queue for later)
app.post('/api/review-queue/:id/skip', (req, res) => {
  try {
    const row = manualReviewQueue.updateStatus(req.params.id, 'reviewed', {
      skipped: true,
      skippedAt: new Date().toISOString(),
      action_note: 'Kept for later manual review.'
    });
    res.json({ ok: true, row });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Enrich a single existing lead on demand
app.post('/api/leads/:id/enrich', async (req, res) => {
  try {
    const lead = db.getLeads().find(l => l.id === req.params.id);
    if (!lead) return res.json({ ok: false, error: 'Lead not found' });
    const enriched = await scraper.validateAndEnrichLead(lead.address, lead.state || '');
    const classification = scraper.classifyDeal({ ...lead, arvEstimate: enriched.arvEstimate || lead.arv });
    const updates = {
      photoUrl: enriched.photoUrl || lead.photoUrl || '',
      zillowUrl: enriched.zillowUrl || lead.zillowUrl || '',
      redfinUrl: enriched.redfinUrl || lead.redfinUrl || '',
      streetViewUrl: enriched.streetViewUrl || lead.streetViewUrl || '',
      comps: enriched.comps || lead.comps || [],
      rentEstimate: enriched.rentEstimate || lead.rentEstimate || 0,
      dealType: classification.type,
      dealTypeReason: classification.reason,
      dataSource: enriched.dataSource || lead.dataSource || '',
    };
    if (enriched.arvEstimate && !lead.arv) {
      updates.arv = enriched.arvEstimate;
      updates.offer = Math.round(enriched.arvEstimate * 0.65);
      updates.repairs = Math.round(enriched.arvEstimate * 0.10);
      const spread = updates.arv - updates.offer - updates.repairs;
      updates.spread = spread;
      updates.fee_lo = Math.round(spread * 0.35);
      updates.fee_hi = Math.round(spread * 0.55);
    }
    db.updateLead(lead.id, updates);
    res.json({ ok: true, updates });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});


// Ã¢ÂÂÃ¢ÂÂ Propwire CSV Parser (inline Ã¢ÂÂ no external dependency) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function parsePropwireCSV(csvText) {
  const { v4: uuidv4 } = require('uuid');
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { leads: [], stats: { total: 0, kept: 0, skipped_type: 0, skipped_price: 0 } };

  function parseCSVLine(line) {
    const fields = []; let field = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuote) { inQuote = true; continue; }
      if (ch === '"' && inQuote && line[i+1] === '"') { field += '"'; i++; continue; }
      if (ch === '"' && inQuote) { inQuote = false; continue; }
      if (ch === ',' && !inQuote) { fields.push(field.trim()); field = ''; continue; }
      field += ch;
    }
    fields.push(field.trim()); return fields;
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/"/g,''));
  function col(names) { for (const n of names) { const i = headers.indexOf(n.toLowerCase()); if (i>=0) return i; } return -1; }

  const C = {
    address: col(['address']), city: col(['city']), state: col(['state']),
    zip: col(['zip']), county: col(['county']),
    sqft: col(['living square feet']), year: col(['year built']),
    beds: col(['bedrooms']), baths: col(['bathrooms']),
    propType: col(['property type']), landUse: col(['land use']),
    owner1f: col(['owner 1 first name']), owner1l: col(['owner 1 last name']),
    ownerType: col(['owner type']), ownerOcc: col(['owner occupied']),
    vacant: col(['vacant?']), dom: col(['days on market']),
    listPrice: col(['listing price']), lastSaleDate: col(['last sale date']),
    lastSaleAmt: col(['last sale amount']), estValue: col(['estimated value']),
    estEquity: col(['estimated equity']), estEquityPct: col(['estimated equity percent']),
    mortgage: col(['open mortgage balance']), defaultAmt: col(['default amount']),
    auctionDate: col(['auction date']), ownershipMo: col(['ownership length (months)']),
  };

  const GOOD = new Set(['single family residence','multi-family 2-4 units','condominium / townhouse','condominium/townhouse','townhouse','duplex','triplex','fourplex']);
  const leads = [], stats = { total: lines.length-1, kept:0, skipped_type:0, skipped_price:0, skipped_novalue:0 };

  for (const line of lines.slice(1)) {
    try {
      const f = parseCSVLine(line);
      const get = i => i>=0&&i<f.length ? f[i].trim() : '';
      const num = i => parseFloat((get(i)||'0').replace(/[$,]/g,''))||0;
      const addr = get(C.address); if (!addr||addr.length<3) continue;
      if (!GOOD.has(get(C.propType).toLowerCase())) { stats.skipped_type++; continue; }
      const lu = get(C.landUse).toLowerCase();
      if (lu==='commercial'||lu==='industrial') { stats.skipped_type++; continue; }
      const estValue = num(C.estValue);
      if (!estValue) { stats.skipped_novalue++; continue; }
      if (estValue<60000||estValue>800000) { stats.skipped_price++; continue; }
      const equityPct=num(C.estEquityPct), isVacant=get(C.vacant)==='1';
      const isDefaulted=num(C.defaultAmt)>0, hasAuction=get(C.auctionDate).length>4;
      const ownershipMonths=num(C.ownershipMo), isOwnerOcc=get(C.ownerOcc)==='1';
      if (equityPct<15&&!isVacant&&!isDefaulted&&!hasAuction&&ownershipMonths<=120) { stats.skipped_type++; continue; }
      const city=get(C.city),state=get(C.state),zip=get(C.zip),county=get(C.county);
      const beds=Math.round(num(C.beds)),baths=num(C.baths),sqft=Math.round(num(C.sqft)),year=Math.round(num(C.year));
      const owner1=[get(C.owner1f),get(C.owner1l)].filter(Boolean).join(' ').trim();
      let category='Absentee Owner';
      if (isDefaulted||hasAuction) category='Pre-FC';
      else if (isVacant) category='Vacant Property';
      else if (ownershipMonths>240) category='Tired Landlord';
      else if (equityPct>=50) category='High Equity';
      const arv=estValue;
      const repairRate=sqft===0?0:year<1960?60:year<1980?45:year<1995?28:year<2010?18:12;
      const estRepairs=sqft>0?Math.min(Math.round(sqft*repairRate),Math.round(arv*0.25)):Math.round(arv*0.10);
      const offer=Math.max(0,Math.round(arv*0.70-estRepairs));
      const spread=Math.max(0,arv-offer-estRepairs);
      if (offer<=0||spread<3000) { stats.skipped_price++; continue; }
      const fullAddress=[addr,city,state,zip].filter(Boolean).join(', ');
      stats.kept++;
      leads.push({
        id:uuidv4(), address:fullAddress, county, state, zip,
        beds, baths, sqft, year, owner_name:owner1, phone:'', email:'',
        isVacant, isAbsentee:!isOwnerOcc, ownerType:get(C.ownerType),
        ownershipMonths:Math.round(ownershipMonths), category,
        arv, repairs:estRepairs, offer, mao:offer, spread,
        fee_lo:Math.round(spread*0.35), fee_hi:Math.round(spread*0.55),
        equity:Math.round(num(C.estEquity)), equityPct:Math.round(equityPct),
        mortgage:Math.round(num(C.mortgage)), listPrice:num(C.listPrice),
        lastSaleDate:get(C.lastSaleDate), lastSaleAmt:num(C.lastSaleAmt),
        estValue, dom:Math.round(num(C.dom))||0,
        status:'New Lead', source:'Propwire', verified:true,
        dealType:spread>arv*0.20?'Wholesale':spread>arv*0.12?'Fix & Flip':'Buy & Hold',
        zillowUrl:buildZillowLink(fullAddress),
        redfinUrl:`https://www.redfin.com/search?searchType=4&query=${encodeURIComponent(fullAddress)}`,
        created:new Date().toISOString(), userId:'admin',
      });
    } catch(e) {}
  }
  return { leads, stats };
}

// Ã¢ÂÂÃ¢ÂÂ Free Data Sources Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function getDatasources() {
  return require('./modules/datasources');
}

// Propwire CSV import endpoint
app.post('/api/import/propwire', express.text({ limit: '100mb', type: '*/*' }), async (req, res) => {
  try {
    const csvText = req.body;
    if (!csvText || csvText.length < 10) return res.json({ ok: false, error: 'No CSV data received' });

    const rawResult = parsePropwireCSV(csvText);
    // Handle both old format (array) and new format ({leads, stats})
    const leads = Array.isArray(rawResult) ? rawResult : (rawResult.leads || []);
    const stats = Array.isArray(rawResult) ? { total: leads.length, kept: leads.length, skipped_type: 0, skipped_price: 0 } : (rawResult.stats || {});

    if (!leads || !leads.length) return res.json({
      ok: false,
      error: `No wholesale deals found in this file. Processed ${stats.total} rows Ã¢ÂÂ all were filtered out (${stats.skipped_type} wrong property type, ${stats.skipped_price} outside price range).`
    });

    // Delete all existing Propwire leads before reimporting to avoid stale bad data
    const dbData = db.readDB();
    const before = (dbData.leads || []).length;
    dbData.leads = (dbData.leads || []).filter(l => l.source !== 'Propwire');
    const deleted = before - dbData.leads.length;

    // Dedup new leads by normalized address
    const normalize = (s) => (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const existingAddrs = new Set(dbData.leads.map(l => normalize(l.address)));
    let added = 0, dupes = 0;
    for (const lead of leads) {
      const key = normalize(lead.address);
      if (key.length > 5 && !existingAddrs.has(key)) {
        dbData.leads.push(lead);
        existingAddrs.add(key);
        added++;
      } else { dupes++; }
    }

    db.writeDB(dbData);
    db.addNotification('deal',
      `${added} real wholesale leads imported from Propwire`,
      `${stats.total} rows Ã¢ÂÂ ${stats.kept} passed filter Ã¢ÂÂ ${added} imported. Removed: ${stats.skipped_type} wrong type, ${stats.skipped_price} bad price/spread, ${deleted} stale leads cleared.`
    );

    // Auto-upload to Google Drive in background
    setImmediate(async () => {
      try {
        const cfg = getGmailTransport();
        if (cfg && added > 0) {
          const { google } = require('googleapis');
          const drive = google.drive({ version: 'v3', auth: cfg.oauth2 });
          const addedLeads = dbData.leads.filter(l => l.source === 'Propwire');
          const csvRows = ['Address,County,State,Category,ARV,Offer,Spread,Fee Lo,Fee Hi,Owner,Phone,Email,Equity%,DOM,Deal Type,Source,Zillow,Redfin'];
          addedLeads.forEach(l => {
            csvRows.push([
              '"' + (l.address||'').replace(/"/g,"'") + '"',
              l.county||'', l.state||'', l.category||'',
              l.arv||0, l.offer||0, l.spread||0, l.fee_lo||0, l.fee_hi||0,
              '"' + (l.owner_name||'').replace(/"/g,"'") + '"',
              l.phone||'', l.email||'',
              l.equityPct||0, l.dom||0, l.dealType||'',
              'Propwire',
              '"' + (l.zillowUrl||'') + '"',
              '"' + (l.redfinUrl||'') + '"',
            ].join(','));
          });
          const csvContent = csvRows.join('\n');
          const date = new Date().toISOString().split('T')[0];
          const fileName = `Propwire Import - ${added} leads - ${date}.csv`;
          await drive.files.create({
            requestBody: { name: fileName, mimeType: 'text/csv', parents: [] },
            media: { mimeType: 'text/csv', body: csvContent },
          });
          db.addNotification('system', 'Google Drive updated', `${fileName} uploaded automatically`);
          logger.info('[Drive] Uploaded:', fileName);
        }
      } catch(e) { logger.info('[Drive] Auto-upload error:', e.message); }
    });

    res.json({
      ok: true,
      parsed: stats.total,
      filtered: stats.kept,
      added,
      dupes,
      deleted_stale: deleted,
      stats,
      sample: leads.slice(0,3).map(l => ({ address: l.address, category: l.category, arv: l.arv, spread: l.spread }))
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Run all free data sources
app.post('/api/datasources/run-all', async (req, res) => {
  try {
    const states = req.body.states || null;
    res.json({ ok: true, message: 'All free data sources started. Check Review Queue and Buyers in 5-10 minutes.' });
    setImmediate(async () => {
      try {
        const results = await getDatasources().runAllFreeSources({ states });
        // Add leads to review queue
        const dbData = db.readDB();
        if (!dbData.reviewQueue) dbData.reviewQueue = [];
        const existingUrls = new Set(dbData.reviewQueue.map(r => r.sourceUrl).filter(Boolean));
        let leadsAdded = 0;
        for (const lead of results.leads) {
          if (!existingUrls.has(lead.sourceUrl) && !db.leadExists(lead.address)) {
            dbData.reviewQueue.push(lead);
            leadsAdded++;
          }
        }
        db.writeDB(dbData);
        // Add buyers
        let buyersAdded = 0;
        const existingBuyers = db.getBuyers().map(b => `${b.phone||''}${b.email||''}${b.name||''}`);
        for (const buyer of results.buyers) {
          const key = `${buyer.phone||''}${buyer.email||''}${buyer.name||''}`;
          if (key.length > 3 && !existingBuyers.includes(key)) {
            db.addBuyer(buyer);
            buyersAdded++;
          }
        }
        db.addNotification('system', `Data pull complete`, `${leadsAdded} leads in Review Queue + ${buyersAdded} buyers added. Errors: ${results.errors.length}`);
        logger.info(`[DataSources] ${leadsAdded} leads, ${buyersAdded} buyers. Errors: ${results.errors.join('; ')}`);
      } catch(e) { logger.error('[DataSources] Error:', e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Run specific source
app.post('/api/datasources/:source', async (req, res) => {
  try {
    const { source } = req.params;
    const states = req.body.states || null;
    res.json({ ok: true, message: `${source} scrape started` });
    setImmediate(async () => {
      try {
        let leads = [], buyers = [];
        if (source === 'redfin') leads = await getDatasources().scrapeRedfin();
        else if (source === 'zillow') leads = await getDatasources().scrapeZillowDeals();
        else if (source === 'craigslist') leads = await getDatasources().scrapeCraigslistDeals();
        else if (source === 'connected-investors') buyers = await getDatasources().scrapeConnectedInvestors(states);
        // Legacy names kept for compatibility
        else if (source === 'hud' || source === 'cook' || source === 'wayne' || source === 'clark' || source === 'maricopa') leads = await getDatasources().scrapeRedfin();
        else if (source === 'biggerpockets') buyers = await getDatasources().scrapeConnectedInvestors(states);

        const dbData = db.readDB();
        if (!dbData.reviewQueue) dbData.reviewQueue = [];
        let added = 0;
        for (const lead of leads) {
          if (!db.leadExists(lead.address)) {
            dbData.reviewQueue.push(lead);
            added++;
          }
        }
        db.writeDB(dbData);

        let buyersAdded = 0;
        const existing = db.getBuyers().map(b => b.name||'');
        for (const buyer of buyers) {
          if (!existing.includes(buyer.name)) { db.addBuyer(buyer); buyersAdded++; }
        }

        db.addNotification('system', `${source} complete`, `${added} leads + ${buyersAdded} buyers`);
        scrapeProgress[source] = { status: 'complete', leads: added, buyers: buyersAdded, time: new Date().toISOString() };
      } catch(e) { logger.error(`[${source}]`, e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Delete endpoints Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Delete single lead
app.delete('/api/leads/:id', (req, res) => {
  try {
    const dbData = db.readDB();
    const before = (dbData.leads || []).length;
    dbData.leads = (dbData.leads || []).filter(l => l.id !== req.params.id);
    db.writeDB(dbData);
    res.json({ ok: true, removed: before - dbData.leads.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Bulk status change
app.post('/api/leads/bulk-status', (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!ids || !ids.length || !status) return res.json({ ok: false, error: 'Missing ids or status' });
    const idSet = new Set(ids);
    const dbData = db.readDB();
    let updated = 0;
    (dbData.leads || []).forEach(l => {
      if (idSet.has(l.id)) { l.status = status; updated++; }
    });
    db.writeDB(dbData);
    res.json({ ok: true, updated });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Delete multiple leads
app.post('/api/leads/delete-bulk', (req, res) => {
  try {
    const ids = new Set(req.body.ids || []);
    const dbData = db.readDB();
    const before = (dbData.leads || []).length;
    dbData.leads = (dbData.leads || []).filter(l => !ids.has(l.id));
    db.writeDB(dbData);
    res.json({ ok: true, removed: before - dbData.leads.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Delete all AI-generated fake leads
app.delete('/api/leads/clear/fake', (req, res) => {
  try {
    const dbData = db.readDB();
    const before = (dbData.leads || []).length;
    const REAL_SOURCES = ['Propwire','HUD Homestore','Craigslist','Cook County Open Data',
      'Wayne County Treasurer','Clark County ArcGIS','Maricopa County Treasurer',
      'FSBO.com','Landwatch','Connected Investors','BiggerPockets','Manual'];
    dbData.leads = (dbData.leads || []).filter(l => {
      const src = l.source || '';
      // Keep if source is a real data source
      if (REAL_SOURCES.includes(src)) return true;
      // Keep if source contains 'County' or 'HUD' (government sources)
      if (src.includes('County') || src.includes('HUD') || src.includes('Propwire')) return true;
      // Remove AI-generated and empty-source leads
      return false;
    });
    db.writeDB(dbData);
    res.json({ ok: true, removed: before - dbData.leads.length, remaining: dbData.leads.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Delete single buyer
app.delete('/api/buyers/:id', (req, res) => {
  try {
    const dbData = db.readDB();
    const before = (dbData.buyers || []).length;
    dbData.buyers = (dbData.buyers || []).filter(b => b.id !== req.params.id);
    db.writeDB(dbData);
    res.json({ ok: true, removed: before - dbData.buyers.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Delete all fake/AI buyers
app.delete('/api/buyers/clear/fake', (req, res) => {
  try {
    const dbData = db.readDB();
    const before = (dbData.buyers || []).length;
    // Keep only buyers from real sources
    dbData.buyers = (dbData.buyers || []).filter(b =>
      b.source && ['Craigslist','Connected Investors','BiggerPockets','Propwire','HUD Homestore','Manual'].includes(b.source)
    );
    db.writeDB(dbData);
    res.json({ ok: true, removed: before - dbData.buyers.length, remaining: dbData.buyers.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});


// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
//  COMMUNICATIONS Ã¢ÂÂ SMS, Bulk Email, Browser Dialer
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

// Ã¢ÂÂÃ¢ÂÂ Twilio status Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/comms/status', (req, res) => {
  const comms = require('./modules/comms');
  res.json({
    twilio: comms.isTwilioConfigured(),
    twilioPhone: comms.getTwilioPhone(),
    gmail: !!getGmailTransport(),
  });
});

// Ã¢ÂÂÃ¢ÂÂ Send single SMS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/sms/send', async (req, res) => {
  try {
    const comms = require('./modules/comms');
    const { to, body, leadId } = req.body;
    if (!to || !body) return res.json({ ok: false, error: 'Missing to or body' });
    const result = await comms.sendSMS(to, body, leadId, db);
    res.json(result);
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Preview AI SMS for a lead Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/sms/preview/:leadId', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const lead  = db.getLeads().find(l => l.id === req.params.leadId);
    if (!lead) return res.json({ ok: false, error: 'Lead not found' });
    const body = comms.generateHumanizedSMS(lead);
    res.json({ ok: true, body, phone: lead.phone });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Preview AI Email for a lead Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/email/preview/:leadId', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const lead  = db.getLeads().find(l => l.id === req.params.leadId);
    if (!lead) return res.json({ ok: false, error: 'Lead not found' });
    const email = comms.generateHumanizedEmail(lead);
    res.json({ ok: true, ...email, to: lead.email });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Bulk SMS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/sms/bulk', async (req, res) => {
  try {
    const comms = require('./modules/comms');
    const { leadIds, customMessage } = req.body;
    if (!leadIds || !leadIds.length) return res.json({ ok: false, error: 'No leads selected' });
    const leads = db.getLeads().filter(l => leadIds.includes(l.id));
    const withPhone = leads.filter(l => l.phone);
    if (!withPhone.length) return res.json({ ok: false, error: 'None of the selected leads have phone numbers. Add phone numbers via skip tracing first.' });
    // Start async Ã¢ÂÂ respond immediately
    res.json({ ok: true, total: withPhone.length, message: `Sending ${withPhone.length} SMS messages in background. Check SMS tab for progress.` });
    setImmediate(async () => {
      try {
        const results = await comms.sendBulkSMS(withPhone, db, { customMessage });
        db.addNotification('system', `Bulk SMS complete`, `${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped (no phone)`);
        logger.info('[BulkSMS]', results);
      } catch(e) { logger.error('[BulkSMS]', e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Bulk Email Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/email/bulk', async (req, res) => {
  try {
    const comms = require('./modules/comms');
    const { leadIds, customEmail } = req.body;
    if (!leadIds || !leadIds.length) return res.json({ ok: false, error: 'No leads selected' });
    const leads = db.getLeads().filter(l => leadIds.includes(l.id));
    const withEmail = leads.filter(l => l.email);
    if (!withEmail.length) return res.json({ ok: false, error: 'None of the selected leads have email addresses. Add emails via skip tracing first.' });
    const gmailCfg = getGmailTransport();
    if (!gmailCfg) return res.json({ ok: false, error: 'Gmail not connected. Check Gmail settings.' });
    res.json({ ok: true, total: withEmail.length, message: `Sending ${withEmail.length} personalized emails in background. Check Email tab for progress.` });
    setImmediate(async () => {
      try {
        const results = await comms.sendBulkEmail(withEmail, gmailCfg, db, { customEmail });
        db.addNotification('system', `Bulk Email complete`, `${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped (no email)`);
        logger.info('[BulkEmail]', results);
      } catch(e) { logger.error('[BulkEmail]', e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ SMS Conversations Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/sms/conversations', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const convos = comms.getAllSMSConversations(db);
    res.json({ ok: true, conversations: convos });
  } catch(e) { res.json({ ok: false, conversations: [], error: e.message }); }
});

app.get('/api/sms/conversation/:leadId', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const msgs  = comms.getSMSConversation(req.params.leadId, db);
    res.json({ ok: true, messages: msgs });
  } catch(e) { res.json({ ok: false, messages: [], error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Inbound SMS Webhook (Twilio posts here) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/sms/webhook', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const { From, Body } = req.body;
    const lead = comms.handleInboundSMS(From, Body, db);
    logger.info(`[SMS Inbound] From: ${From} Ã¢ÂÂ "${Body.slice(0,50)}"`);
    // Respond with empty TwiML so Twilio doesn't send error
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch(e) {
    logger.error('[SMS Webhook]', e.message);
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

// Ã¢ÂÂÃ¢ÂÂ Browser Dialer Token Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/dialer/token', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const token = comms.generateDialerToken('gabriel');
    if (!token) return res.json({ ok: false, error: 'Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY, TWILIO_API_SECRET to Railway.' });
    res.json({ ok: true, token });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Outbound call via Twilio REST (simpler than browser SDK) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/dialer/call', async (req, res) => {
  try {
    const { to, leadId } = req.body;
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !token || !from) return res.json({ ok: false, error: 'Twilio not configured' });
    const twilio = require('twilio')(sid, token);
    const cleaned = to.replace(/[^0-9]/g,'');
    const phone   = cleaned.length === 10 ? '+1' + cleaned : '+' + cleaned;
    // Call connects Twilio number to seller, then bridges to your phone
    const callbackUrl = `${process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : ''}/api/dialer/twiml`;
    const call = await twilio.calls.create({
      to:   phone,
      from,
      url:  callbackUrl || 'http://demo.twilio.com/docs/voice.xml',
      record: true, // Enable call recording
      recordingStatusCallback: `${process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : ''}/api/dialer/recording-complete`,
    });
    // Log the call
    const dbData = db.readDB();
    if (!dbData.callLog) dbData.callLog = [];
    dbData.callLog.push({ id: uuidv4(), leadId, to: phone, callSid: call.sid, status: call.status, created: new Date().toISOString() });
    db.writeDB(dbData);
    res.json({ ok: true, callSid: call.sid, status: call.status });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ TwiML for calls Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/dialer/twiml', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, this is Gabriel from Montsan REI. Please hold for a moment.</Say>
  <Dial callerId="${process.env.TWILIO_PHONE_NUMBER || ''}">
    <Number>${process.env.GABRIEL_PHONE || process.env.TWILIO_PHONE_NUMBER || ''}</Number>
  </Dial>
</Response>`);
});


// Ã¢ÂÂÃ¢ÂÂ Recording complete webhook (Twilio calls this when recording is ready) Ã¢ÂÂ
app.post('/api/dialer/recording-complete', async (req, res) => {
  try {
    const { CallSid, RecordingUrl, RecordingDuration } = req.body;
    logger.info(`[Recording] CallSid: ${CallSid}, Duration: ${RecordingDuration}s`);
    // Find the call log entry
    const dbData = db.readDB();
    if (!dbData.callLog) dbData.callLog = [];
    const callEntry = dbData.callLog.find(c => c.callSid === CallSid);
    if (callEntry) {
      callEntry.recordingUrl = RecordingUrl + '.mp3';
      callEntry.duration = parseInt(RecordingDuration) || 0;
      callEntry.recordingReady = true;
      // Auto-trigger sentiment analysis
      const lead = callEntry.leadId ? (dbData.leads||[]).find(l => l.id === callEntry.leadId) : null;
      if (lead) {
        try {
          const ai = require('./ai');
          const analysis = await ai.ask(`You are analyzing a real estate wholesaling call.
Lead: ${lead.address}, ${lead.category}, ARV $${lead.arv||0}, Offer $${lead.offer||0}
Owner: ${lead.owner_name||'Unknown'}
Call duration: ${RecordingDuration} seconds

Based on the call duration and lead type, provide:
1. SENTIMENT: (Positive/Neutral/Negative/Unknown)
2. RECOMMENDATION: What Gabriel should do next (1-2 sentences)
3. FOLLOW_UP: Suggested follow-up message
4. LESSON: One thing Gabriel could improve for next call

Respond in JSON format only.`, 'free');
          try {
            const parsed = JSON.parse(analysis.replace(/```json|```/g,'').trim());
            callEntry.sentiment = parsed.SENTIMENT || 'Unknown';
            callEntry.recommendation = parsed.RECOMMENDATION || '';
            callEntry.followUp = parsed.FOLLOW_UP || '';
            callEntry.lesson = parsed.LESSON || '';
          } catch(e) {
            callEntry.sentiment = 'Unknown';
            callEntry.recommendation = analysis.slice(0, 200);
          }
          db.addNotification('system', 'Call analysis ready', `${lead.owner_name||lead.address} Ã¢ÂÂ ${callEntry.sentiment} sentiment. ${callEntry.recommendation}`);
        } catch(e) { logger.info('[AI Analysis]', e.message); }
      }
      db.writeDB(dbData);
    }
    res.sendStatus(200);
  } catch(e) {
    logger.error('[Recording webhook]', e.message);
    res.sendStatus(200);
  }
});

// Ã¢ÂÂÃ¢ÂÂ Get call analysis for a specific call Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/dialer/analysis/:callSid', (req, res) => {
  try {
    const dbData = db.readDB();
    const call = (dbData.callLog||[]).find(c => c.callSid === req.params.callSid);
    if (!call) return res.json({ ok: false, error: 'Call not found' });
    res.json({ ok: true, call });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Call log Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/dialer/calls', (req, res) => {
  try {
    const dbData = db.readDB();
    const calls  = (dbData.callLog || []).sort((a,b) => new Date(b.created) - new Date(a.created));
    res.json({ ok: true, calls });
  } catch(e) { res.json({ ok: false, calls: [], error: e.message }); }
});




// ============================================================
// WHOLESALEOS INTELLIGENCE ENGINE
// Deal Scraper + Buyer Finder + Creative Finance Analysis
// ============================================================

const axios = require('axios');
const SCRAPER_KEY = process.env.SCRAPERAPI_KEY || 'e99518e9c129422db35188517b89a212';

// ── Scraper helper ───────────────────────────────────────────
async function scraperFetch(url, opts) {
  try {
    opts = opts || {};
    var apiUrl = 'http://api.scraperapi.com?api_key=' + SCRAPER_KEY + '&url=' + encodeURIComponent(url);
    if (opts.render) apiUrl += '&render=true';
    var res = await axios.get(apiUrl, { timeout: 25000, headers: { 'Accept': 'text/html,application/json' } });
    return res.data || '';
  } catch(e) {
    return '';
  }
}

// ── Dedup helper ─────────────────────────────────────────────
function isDuplicateLead(existing, newAddr, newPhone) {
  var addr = (newAddr || '').toLowerCase().trim();
  var phone = (newPhone || '').replace(/\D/g, '');
  return existing.some(function(l) {
    var la = (l.address || '').toLowerCase().trim();
    var lp = (l.phone || '').replace(/\D/g, '');
    if (addr && la && la.includes(addr.split(',')[0])) return true;
    if (phone && phone.length > 8 && lp === phone) return true;
    return false;
  });
}

function isDuplicateBuyer(existing, name, phone, email) {
  var n = (name || '').toLowerCase().trim();
  var p = (phone || '').replace(/\D/g, '');
  var e = (email || '').toLowerCase().trim();
  return existing.some(function(b) {
    var bn = (b.name || '').toLowerCase().trim();
    var bp = (b.phone || '').replace(/\D/g, '');
    var be = (b.email || '').toLowerCase().trim();
    if (n && bn && bn === n) return true;
    if (p && p.length > 7 && bp === p) return true;
    if (e && e.length > 5 && be === e) return true;
    return false;
  });
}

// ── Rent estimation ──────────────────────────────────────────
function estimateRent(lead) {
  var beds = lead.beds || 3;
  var baths = lead.baths || 2;
  var sqft = lead.sqft || 1200;
  var state = lead.state || 'TX';

  // Base rent by state (median market rates)
  var stateBase = {
    'CA': 2200, 'NY': 2400, 'WA': 1900, 'MA': 2100, 'CO': 1800,
    'FL': 1600, 'TX': 1400, 'GA': 1400, 'AZ': 1500, 'NC': 1300,
    'TN': 1200, 'OH': 1100, 'IL': 1500, 'MI': 1100, 'PA': 1300,
    'NV': 1600, 'OR': 1700, 'MN': 1400, 'SC': 1200, 'AL': 1000,
    'MO': 1100, 'IN': 1000, 'KY': 1000, 'OK': 1000, 'LA': 1100,
    'WI': 1100, 'KS': 1000, 'AR': 900, 'MS': 900, 'NM': 1100,
    'UT': 1500, 'ID': 1300, 'MT': 1200, 'WY': 1100, 'ND': 1100,
    'SD': 1000, 'NE': 1100, 'IA': 1000, 'VA': 1600, 'MD': 1700,
    'DE': 1500, 'CT': 1700, 'RI': 1600, 'NJ': 1900, 'NH': 1500,
    'VT': 1300, 'ME': 1200, 'WV': 900, 'AK': 1500, 'HI': 2500
  };

  var base = stateBase[state] || 1200;

  // Adjust by beds
  var bedAdj = { 1: 0.75, 2: 0.90, 3: 1.0, 4: 1.20, 5: 1.40 };
  var adj = bedAdj[beds] || 1.0;

  // Adjust by sqft
  var sqftAdj = sqft > 2000 ? 1.15 : sqft > 1500 ? 1.05 : sqft < 800 ? 0.85 : 1.0;

  var estimated = Math.round(base * adj * sqftAdj / 50) * 50;
  var low = Math.round(estimated * 0.90 / 50) * 50;
  var high = Math.round(estimated * 1.10 / 50) * 50;
  var confidence = sqft && beds ? 'medium' : 'low';

  return { low: low, mid: estimated, high: high, confidence: confidence };
}

// ── Cash on Cash analysis ────────────────────────────────────
function analyzeCashOnCash(lead) {
  var price = lead.offer || lead.mao || lead.listPrice || 0;
  var arv = lead.arv || price * 1.3;
  var repairs = lead.repairs || 0;
  var rent = estimateRent(lead);
  var monthlyRent = rent.mid;

  // Expenses
  var propTax = (arv * 0.012) / 12;
  var insurance = 150;
  var vacancy = monthlyRent * 0.08;
  var maintenance = monthlyRent * 0.05;
  var management = monthlyRent * 0.08;
  var totalExpenses = propTax + insurance + vacancy + maintenance + management;

  // Mortgage (assuming 15% down, 7.5% rate, 30yr)
  var downPct = 0.15;
  var downPayment = price * downPct;
  var loanAmt = price * (1 - downPct);
  var monthlyRate = 0.075 / 12;
  var numPayments = 360;
  var mortgage = loanAmt > 0
    ? loanAmt * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : 0;

  var totalMonthly = mortgage + totalExpenses;
  var monthlyCF = monthlyRent - totalMonthly;
  var annualCF = monthlyCF * 12;
  var totalCashIn = downPayment + repairs;
  var cashOnCash = totalCashIn > 0 ? (annualCF / totalCashIn) * 100 : 0;

  var cfStatus = monthlyCF >= 200 ? 'positive' : monthlyCF >= -50 ? 'breakeven' : 'negative';

  return {
    monthlyRent: monthlyRent,
    rentRange: rent.low + '-' + rent.high,
    mortgage: Math.round(mortgage),
    expenses: Math.round(totalExpenses),
    monthlyCF: Math.round(monthlyCF),
    annualCF: Math.round(annualCF),
    cashOnCash: Math.round(cashOnCash * 10) / 10,
    downPayment: Math.round(downPayment),
    cfStatus: cfStatus,
    rentConfidence: rent.confidence
  };
}

// ── Creative Finance detection ───────────────────────────────
function detectCreativeFinance(lead) {
  var equity = lead.equityPct || 0;
  var ownMonths = lead.ownershipMonths || 0;
  var price = lead.offer || lead.mao || lead.listPrice || 0;
  var arv = lead.arv || 0;
  var category = (lead.category || '').toLowerCase();
  var mortgage = lead.mortgage || 0;
  var cash = analyzeCashOnCash(lead);

  var strategies = [];

  // Subject-To: needs existing mortgage, seller behind or motivated
  var estimatedLoanBalance = mortgage || (arv * 0.6 * (1 - Math.min(ownMonths / 360, 0.8)));
  if (estimatedLoanBalance > 0 && equity < 65 && equity > 5) {
    var monthlyPayment = estimatedLoanBalance * (0.045 / 12) / (1 - Math.pow(1 + 0.045/12, -360));
    strategies.push({
      type: 'Subject-To',
      score: 85,
      why: 'Estimated loan balance ~$' + Math.round(estimatedLoanBalance/1000) + 'K. Take over existing payments.',
      monthlyPayment: Math.round(monthlyPayment),
      cashNeeded: Math.round(price * 0.05)
    });
  }

  // Seller Finance: high equity, long ownership, no bank needed
  if (equity >= 50 || ownMonths >= 180) {
    var sellerFinancePayment = price * 0.85 * (0.06 / 12) / (1 - Math.pow(1 + 0.06/12, -360));
    strategies.push({
      type: 'Seller Finance',
      score: equity >= 70 ? 90 : 75,
      why: equity + '% equity, owned ' + Math.round(ownMonths/12) + ' yrs. Seller can carry note.',
      monthlyPayment: Math.round(sellerFinancePayment),
      cashNeeded: Math.round(price * 0.10)
    });
  }

  // Lease Option: positive cash flow potential, mid equity
  if (cash.cfStatus !== 'negative' && arv > 0) {
    strategies.push({
      type: 'Lease Option',
      score: cash.cfStatus === 'positive' ? 80 : 65,
      why: 'CF: $' + cash.monthlyCF + '/mo. Option fee + monthly spread = profit.',
      monthlyRent: cash.monthlyRent,
      cashNeeded: Math.round(price * 0.03)
    });
  }

  // Wholesale: high spread, distressed
  var spread = lead.spread || (arv - price - (lead.repairs || 0));
  if (spread >= 20000 || category.includes('pre-fc') || category.includes('vacant') || category.includes('tax')) {
    strategies.push({
      type: 'Wholesale',
      score: spread >= 40000 ? 95 : spread >= 25000 ? 85 : 70,
      why: '$' + Math.round(spread/1000) + 'K spread. Assign contract to cash buyer.',
      fee: Math.round(spread * 0.4),
      cashNeeded: 0
    });
  }

  // Pick best strategy by score
  strategies.sort(function(a, b) { return b.score - a.score; });
  var best = strategies[0] || { type: 'Hold', score: 50, why: 'Evaluate for long-term hold.' };

  return {
    best: best,
    all: strategies,
    cashOnCash: cash
  };
}

// ── Deal scoring ─────────────────────────────────────────────
function scoreDeal(lead) {
  var score = 0;
  var equity = lead.equityPct || 0;
  var spread = lead.spread || 0;
  var dom = lead.dom || 0;
  var category = (lead.category || '').toLowerCase();
  var cf = analyzeCashOnCash(lead);
  var creative = detectCreativeFinance(lead);

  if (equity >= 40) score += 25;
  else if (equity >= 25) score += 15;
  else if (equity >= 10) score += 8;

  if (spread >= 50000) score += 30;
  else if (spread >= 30000) score += 20;
  else if (spread >= 15000) score += 10;

  if (cf.cfStatus === 'positive') score += 20;
  else if (cf.cfStatus === 'breakeven') score += 8;

  if (dom >= 90) score += 10;
  else if (dom >= 45) score += 5;

  if (category.includes('pre-fc') || category.includes('auction')) score += 10;
  if (category.includes('vacant')) score += 8;
  if (category.includes('tax')) score += 7;

  if (creative.best && creative.best.score >= 80) score += 5;

  var label, emoji;
  if (score >= 70) { label = 'Hot Deal'; emoji = '🔥'; }
  else if (score >= 45) { label = 'Good Deal'; emoji = '✅'; }
  else if (score >= 25) { label = 'Average'; emoji = '📊'; }
  else { label = 'Skip'; emoji = '⬇️'; }

  return { score: score, label: label, emoji: emoji };
}

// ── Text extraction helpers ───────────────────────────────────
function extractPhone(text) {
  var match = text.match(/(\+?1?\s?[\(\.]?\d{3}[\)\.\-\s]?\s?\d{3}[\.\-\s]?\d{4})/);
  return match ? match[1].replace(/\s/g, '').replace(/[()]/g, '').trim() : '';
}

function extractEmail(text) {
  var match = text.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
  return match ? match[1].toLowerCase() : '';
}

function extractPrice(text) {
  var match = text.match(/\$\s?([\d,]+)/);
  if (match) return parseInt(match[1].replace(/,/g, ''));
  var match2 = text.match(/([\d,]+)\s*k/i);
  if (match2) return parseInt(match2[1].replace(/,/g, '')) * 1000;
  return 0;
}

function extractAddress(text) {
  var match = text.match(/\d+\s+[A-Za-z\s]+(St|Ave|Rd|Blvd|Dr|Ln|Way|Ct|Pl|Hwy)[,\s]/i);
  return match ? match[0].trim() : '';
}

function cleanText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Craigslist deal scraper ───────────────────────────────────
async function scrapeCraigslistDeals(city, state) {
  var keywords = ['fixer', 'motivated seller', 'handyman', 'as-is', 'investor special', 'must sell', 'cash only', 'distressed'];
  var deals = [];
  var baseUrl = 'https://' + city + '.craigslist.org/search/rea?query=' + encodeURIComponent(keywords[Math.floor(Math.random() * keywords.length)]) + '&sort=date';

  try {
    var html = await scraperFetch(baseUrl, { render: false });
    if (!html) return deals;
    var text = cleanText(html);

    // Extract listing items
    var listings = html.split('class="result-row"');
    for (var i = 1; i < Math.min(listings.length, 20); i++) {
      var item = listings[i];
      var titleMatch = item.match(/class="result-title[^"]*"[^>]*>([^<]+)</);
      var priceMatch = item.match(/class="result-price">([^<]+)</);
      var linkMatch = item.match(/href="([^"]+)"/);

      var title = titleMatch ? titleMatch[1].trim() : '';
      var priceText = priceMatch ? priceMatch[1] : '';
      var price = extractPrice(priceText);
      var addr = extractAddress(title) || (city + ', ' + state);

      if (!title || price < 5000) continue;

      var isDistressed = keywords.some(function(k) { return title.toLowerCase().includes(k); });
      if (!isDistressed && !title.toLowerCase().includes('invest')) continue;

      deals.push({
        address: addr || title.split(' ').slice(0, 5).join(' ') + ', ' + state,
        city: city,
        state: state,
        listPrice: price,
        arv: Math.round(price * 1.35),
        offer: Math.round(price * 0.75),
        mao: Math.round(price * 0.70),
        repairs: Math.round(price * 0.08),
        spread: Math.round(price * 0.20),
        equityPct: 30,
        category: 'Distressed',
        source: 'Craigslist',
        sourceUrl: linkMatch ? linkMatch[1] : baseUrl,
        status: 'New Lead',
        dealType: 'Wholesale',
        created: new Date().toISOString().slice(0, 10),
        title: title
      });
    }
  } catch(e) {}
  return deals;
}

// ── Google search scraper for deals ──────────────────────────
async function searchDealsGoogle(state, keyword) {
  var query = keyword + ' ' + state + ' site:craigslist.org OR site:zillow.com OR site:loopnet.com';
  var url = 'https://www.google.com/search?q=' + encodeURIComponent(query) + '&num=10';
  var deals = [];

  try {
    var html = await scraperFetch(url, { render: false });
    if (!html) return deals;
    var text = cleanText(html);

    // Extract results
    var snippets = html.split('<div class="g"');
    for (var i = 1; i < Math.min(snippets.length, 8); i++) {
      var snippet = cleanText(snippets[i]);
      var price = extractPrice(snippet);
      var addr = extractAddress(snippet);
      if (!addr || price < 10000) continue;

      deals.push({
        address: addr + ', ' + state,
        state: state,
        listPrice: price,
        arv: Math.round(price * 1.3),
        offer: Math.round(price * 0.72),
        mao: Math.round(price * 0.70),
        repairs: Math.round(price * 0.07),
        spread: Math.round(price * 0.18),
        equityPct: 28,
        category: 'Distressed',
        source: 'Google/Web',
        status: 'New Lead',
        dealType: 'Wholesale',
        created: new Date().toISOString().slice(0, 10),
        title: snippet.slice(0, 80)
      });
    }
  } catch(e) {}
  return deals;
}

// ── Buyer finder: Google search ───────────────────────────────
async function findBuyersGoogle(state, city) {
  var queries = [
    '"we buy houses" "' + state + '"',
    '"cash home buyers" "' + (city || state) + '"',
    '"sell your house fast" "' + state + '" contact',
    '"real estate investor" "buying properties" "' + state + '"',
  ];

  var buyers = [];

  for (var qi = 0; qi < queries.length; qi++) {
    var url = 'https://www.google.com/search?q=' + encodeURIComponent(queries[qi]) + '&num=8';
    try {
      var html = await scraperFetch(url, { render: false });
      if (!html) continue;

      // Extract website URLs from results
      var urlMatches = html.match(/https?:\/\/(?!www\.google)[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(?:\/[^\s"'<>]*)?/g) || [];
      var text = cleanText(html);

      // Try to extract contact info from the search result text
      var phone = extractPhone(text);
      var email = extractEmail(text);

      // Extract company names from titles
      var titleMatches = html.match(/<h3[^>]*>([^<]+)<\/h3>/g) || [];
      for (var ti = 0; ti < Math.min(titleMatches.length, 4); ti++) {
        var companyName = cleanText(titleMatches[ti]);
        if (companyName.length < 3 || companyName.length > 80) continue;
        if (companyName.toLowerCase().includes('google') || companyName.toLowerCase().includes('search')) continue;

        // Find associated URL
        var website = '';
        for (var ui = 0; ui < urlMatches.length; ui++) {
          if (!urlMatches[ui].includes('google') && !urlMatches[ui].includes('facebook')) {
            website = urlMatches[ui].split('/')[0] + '//' + urlMatches[ui].split('/')[2];
            break;
          }
        }

        if (companyName && (phone || email || website)) {
          buyers.push({
            name: companyName,
            phone: phone || '',
            email: email || '',
            website: website || '',
            state: state,
            city: city || '',
            type: 'Cash Buyer',
            buyTypes: ['SFR'],
            maxPrice: 500000,
            source: 'Google Search',
            sourceQuery: queries[qi],
            status: 'Active',
            score: 60,
            trust: 40,
            created: new Date().toISOString().slice(0, 10),
            markets: [state]
          });
        }
      }
    } catch(e) {}
    // Small delay between requests
    await new Promise(function(r) { setTimeout(r, 1500); });
  }
  return buyers;
}

// ── Fetch buyer website for contact info ─────────────────────
async function enrichBuyerFromWebsite(website) {
  if (!website) return {};
  try {
    var html = await scraperFetch(website + '/contact', { render: false });
    if (!html) html = await scraperFetch(website, { render: false });
    if (!html) return {};
    var text = cleanText(html);
    return {
      phone: extractPhone(text) || '',
      email: extractEmail(text) || '',
    };
  } catch(e) { return {}; }
}

// ── 50-state buyer search ────────────────────────────────────
var ALL_STATES = [
  { state: 'AL', city: 'birmingham' }, { state: 'AK', city: 'anchorage' },
  { state: 'AZ', city: 'phoenix' }, { state: 'AR', city: 'littlerock' },
  { state: 'CA', city: 'losangeles' }, { state: 'CO', city: 'denver' },
  { state: 'CT', city: 'hartford' }, { state: 'DE', city: 'dover' },
  { state: 'FL', city: 'miami' }, { state: 'GA', city: 'atlanta' },
  { state: 'HI', city: 'honolulu' }, { state: 'ID', city: 'boise' },
  { state: 'IL', city: 'chicago' }, { state: 'IN', city: 'indianapolis' },
  { state: 'IA', city: 'desmoines' }, { state: 'KS', city: 'kansascity' },
  { state: 'KY', city: 'louisville' }, { state: 'LA', city: 'neworleans' },
  { state: 'ME', city: 'portland' }, { state: 'MD', city: 'baltimore' },
  { state: 'MA', city: 'boston' }, { state: 'MI', city: 'detroit' },
  { state: 'MN', city: 'minneapolis' }, { state: 'MS', city: 'jackson' },
  { state: 'MO', city: 'kansascity' }, { state: 'MT', city: 'billings' },
  { state: 'NE', city: 'omaha' }, { state: 'NV', city: 'lasvegas' },
  { state: 'NH', city: 'manchester' }, { state: 'NJ', city: 'newark' },
  { state: 'NM', city: 'albuquerque' }, { state: 'NY', city: 'newyork' },
  { state: 'NC', city: 'charlotte' }, { state: 'ND', city: 'fargo' },
  { state: 'OH', city: 'columbus' }, { state: 'OK', city: 'oklahomacity' },
  { state: 'OR', city: 'portland' }, { state: 'PA', city: 'philadelphia' },
  { state: 'RI', city: 'providence' }, { state: 'SC', city: 'charleston' },
  { state: 'SD', city: 'siouxfalls' }, { state: 'TN', city: 'nashville' },
  { state: 'TX', city: 'dallas' }, { state: 'UT', city: 'saltlakecity' },
  { state: 'VT', city: 'burlington' }, { state: 'VA', city: 'richmond' },
  { state: 'WA', city: 'seattle' }, { state: 'WV', city: 'charleston' },
  { state: 'WI', city: 'milwaukee' }, { state: 'WY', city: 'cheyenne' }
];

// ── Main daily engine ─────────────────────────────────────────
async function runDailyEngine() {
  // logger.info('[Engine] Daily run starting:', new Date().toISOString());
  var dbData = db.readDB();
  dbData.leads = dbData.leads || [];
  dbData.buyers = dbData.buyers || [];
  dbData.engineLog = dbData.engineLog || [];

  var newLeads = 0;
  var newBuyers = 0;

  // ── PHASE 1: Enrich existing leads with analysis ──────────
  // logger.info('[Engine] Phase 1: Enriching existing leads...');
  var enrichCount = 0;
  for (var i = 0; i < dbData.leads.length; i++) {
    var lead = dbData.leads[i];
    if (!lead.cashOnCash || !lead.dealScore) {
      var cf = analyzeCashOnCash(lead);
      var creative = detectCreativeFinance(lead);
      var score = scoreDeal(lead);
      var rent = estimateRent(lead);

      dbData.leads[i].cashOnCash = cf;
      dbData.leads[i].creativeFinance = creative.best;
      dbData.leads[i].allStrategies = creative.all;
      dbData.leads[i].dealScore = score;
      dbData.leads[i].rentEstimate = rent;
      enrichCount++;

      // Batch save every 500
      if (enrichCount % 500 === 0) {
        db.writeDB(dbData);
        logger.info('[Engine] Enriched ' + enrichCount + ' leads so far...');
      }
    }
  }
  db.writeDB(dbData);
  // logger.info('[Engine] Phase 1 done. Enriched ' + enrichCount + ' leads.');

  // ── PHASE 2: Find buyers in all 50 states ─────────────────
  // logger.info('[Engine] Phase 2: 50-state buyer search...');
  for (var si = 0; si < ALL_STATES.length; si++) {
    var stateInfo = ALL_STATES[si];
    try {
      var foundBuyers = await findBuyersGoogle(stateInfo.state, stateInfo.city);
      for (var bi = 0; bi < foundBuyers.length; bi++) {
        var buyer = foundBuyers[bi];
        if (!isDuplicateBuyer(dbData.buyers, buyer.name, buyer.phone, buyer.email)) {
          // Try to enrich from website
          if (buyer.website && (!buyer.phone || !buyer.email)) {
            var enriched = await enrichBuyerFromWebsite(buyer.website);
            if (enriched.phone && !buyer.phone) buyer.phone = enriched.phone;
            if (enriched.email && !buyer.email) buyer.email = enriched.email;
          }
          buyer.id = 'B' + Date.now() + Math.floor(Math.random() * 1000);
          dbData.buyers.push(buyer);
          newBuyers++;
        }
      }
      // Save every 5 states
      if ((si + 1) % 5 === 0) {
        db.writeDB(dbData);
        logger.info('[Engine] Searched ' + (si + 1) + '/50 states. New buyers: ' + newBuyers);
      }
    } catch(e) {
      logger.info('[Engine] Error on state ' + stateInfo.state + ':', e.message);
    }
    // Delay between states to avoid rate limiting
    await new Promise(function(r) { setTimeout(r, 2000); });
  }

  // ── PHASE 3: Find deals in top markets ───────────────────
  // logger.info('[Engine] Phase 3: Deal scraping...');
  var dealMarkets = [
    {city:'dallas', state:'TX'}, {city:'houston', state:'TX'}, {city:'phoenix', state:'AZ'},
    {city:'miami', state:'FL'}, {city:'orlando', state:'FL'}, {city:'atlanta', state:'GA'},
    {city:'charlotte', state:'NC'}, {city:'nashville', state:'TN'}, {city:'denver', state:'CO'},
    {city:'lasvegas', state:'NV'}, {city:'chicago', state:'IL'}, {city:'columbus', state:'OH'},
    {city:'detroit', state:'MI'}, {city:'memphis', state:'TN'}, {city:'jacksonville', state:'FL'},
    {city:'indianapolis', state:'IN'}, {city:'kansascity', state:'MO'}, {city:'birmingham', state:'AL'},
    {city:'cleveland', state:'OH'}, {city:'stlouis', state:'MO'}
  ];

  var dealKeywords = ['motivated seller', 'fixer upper', 'investor special', 'as-is', 'cash only'];

  for (var di = 0; di < dealMarkets.length; di++) {
    var market = dealMarkets[di];
    try {
      var deals = await scrapeCraigslistDeals(market.city, market.state);
      for (var dli = 0; dli < deals.length; dli++) {
        var deal = deals[dli];
        if (!isDuplicateLead(dbData.leads, deal.address, deal.phone)) {
          var cf2 = analyzeCashOnCash(deal);
          var creative2 = detectCreativeFinance(deal);
          var score2 = scoreDeal(deal);
          var rent2 = estimateRent(deal);
          deal.cashOnCash = cf2;
          deal.creativeFinance = creative2.best;
          deal.dealScore = score2;
          deal.rentEstimate = rent2;
          deal.id = 'L' + Date.now() + Math.floor(Math.random() * 10000);
          dbData.leads.push(deal);
          newLeads++;
        }
      }
    } catch(e) {}
    await new Promise(function(r) { setTimeout(r, 1500); });
  }

  // Also run Google searches for deals
  var dealSearchStates = ['TX', 'FL', 'GA', 'AZ', 'OH', 'NC', 'TN', 'CO', 'NV', 'IL'];
  var dealSearchKeywords = ['motivated seller real estate', 'wholesale deal property', 'fixer upper investment'];

  for (var dsi = 0; dsi < dealSearchStates.length; dsi++) {
    try {
      var keyword = dealSearchKeywords[dsi % dealSearchKeywords.length];
      var googleDeals = await searchDealsGoogle(dealSearchStates[dsi], keyword);
      for (var gli = 0; gli < googleDeals.length; gli++) {
        var gDeal = googleDeals[gli];
        if (!isDuplicateLead(dbData.leads, gDeal.address, '')) {
          var cf3 = analyzeCashOnCash(gDeal);
          var creative3 = detectCreativeFinance(gDeal);
          gDeal.cashOnCash = cf3;
          gDeal.creativeFinance = creative3.best;
          gDeal.dealScore = scoreDeal(gDeal);
          gDeal.rentEstimate = estimateRent(gDeal);
          gDeal.id = 'L' + Date.now() + Math.floor(Math.random() * 10000);
          dbData.leads.push(gDeal);
          newLeads++;
        }
      }
    } catch(e) {}
    await new Promise(function(r) { setTimeout(r, 1000); });
  }

  // ── Final save & log ──────────────────────────────────────
  dbData.engineLog.push({
    date: new Date().toISOString(),
    newLeads: newLeads,
    newBuyers: newBuyers,
    totalLeads: dbData.leads.length,
    totalBuyers: dbData.buyers.length,
    enriched: enrichCount
  });
  // Keep only last 30 log entries
  if (dbData.engineLog.length > 30) dbData.engineLog = dbData.engineLog.slice(-30);
  db.writeDB(dbData);

  var summary = '[Engine] Done. +' + newLeads + ' leads, +' + newBuyers + ' buyers. Total: ' + dbData.leads.length + ' leads, ' + dbData.buyers.length + ' buyers.';
  // logger.info(summary);
  return { newLeads: newLeads, newBuyers: newBuyers, enriched: enrichCount, summary: summary };
}

// ── API endpoints ─────────────────────────────────────────────
app.get('/api/engine/status', function(req, res) {
  try {
    var dbData = db.readDB();
    var log = dbData.engineLog || [];
    res.json({ lastRun: log[log.length - 1] || null, log: log.slice(-10) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/engine/run', async function(req, res) {
  // Non-blocking — runs in background
  runDailyEngine().catch(function(e) { logger.error('[Engine] Fatal error:', e.message); });
  res.json({ ok: true, message: 'Engine started. Check /api/engine/status for progress.' });
});

app.post('/api/engine/enrich-lead', function(req, res) {
  // Enrich a single lead on demand
  try {
    var dbData = db.readDB();
    var leadId = req.body.leadId || req.params.id;
    var lead = dbData.leads.find(function(l) { return l.id === leadId; });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    lead.cashOnCash = analyzeCashOnCash(lead);
    lead.creativeFinance = detectCreativeFinance(lead).best;
    lead.allStrategies = detectCreativeFinance(lead).all;
    lead.dealScore = scoreDeal(lead);
    lead.rentEstimate = estimateRent(lead);
    db.writeDB(dbData);
    res.json({ ok: true, lead: lead });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Schedule daily at 3AM MST (10AM UTC)
var cron = require('node-cron');
if (ENABLE_BACKGROUND_INGESTION) {
  cron.schedule('0 10 * * *', function() {
    // logger.info('[Engine] Cron triggered daily run');
    runDailyEngine().catch(function(e) { logger.error('[Engine] Cron error:', e.message); });
  }, { timezone: 'America/Denver' });
}

// logger.info('[Engine] Intelligence Engine loaded. Daily run scheduled at 3AM MST.');

// ============================================================
// END WHOLESALEOS INTELLIGENCE ENGINE
// ============================================================


// ============================================================
// BUYERS CRM EXTENDED ROUTES — v14a
// ============================================================

// 1. MATCH DEALS — ranked deals matching a buyer's buy box
app.get('/api/buyers/:id/match-deals', async (req, res) => {
  try {
    const dbData = db.readDB();
    const buyer = (dbData.buyers || []).find(b => b.id === req.params.id);
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
    const leads = dbData.leads || [];
    const maxPrice = buyer.maxPrice || 999999999;
    const buyTypes = buyer.buyTypes || [];
    const buyerStates = buyer.states || [];
    const buyerCities = (buyer.cities || []).map(c => c.toLowerCase());
    const scored = leads
      .filter(l => l.offer && l.spread > 0)
      .map(l => {
        let score = 0;
        if (buyTypes.length === 0 || buyTypes.includes(l.type)) score += 30;
        if (l.offer <= maxPrice) score += 25;
        if (buyerStates.length === 0 || buyerStates.includes(l.state)) score += 20;
        const city = (l.address || '').split(',')[1]?.trim().toLowerCase() || '';
        if (buyerCities.length === 0 || buyerCities.some(c => city.includes(c))) score += 15;
        if (l.spread > 50000) score += 10;
        return { ...l, matchScore: score };
      })
      .filter(l => l.matchScore >= 30)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 20);
    res.json({ deals: scored, total: scored.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. SEND DEALS — email batch of matched deals to buyer
app.post('/api/buyers/:id/send-deals', async (req, res) => {
  try {
    const dbData = db.readDB();
    const buyer = (dbData.buyers || []).find(b => b.id === req.params.id);
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
    if (!buyer.email) return res.status(400).json({ error: 'Buyer has no email address' });
    const { dealIds } = req.body;
    const leads = dbData.leads || [];
    const dealsToSend = dealIds
      ? leads.filter(l => dealIds.includes(l.id))
      : leads.filter(l => l.offer && l.spread > 0).slice(0, 10);
    if (dealsToSend.length === 0) return res.status(400).json({ error: 'No deals to send' });
    const dealRows = dealsToSend.map((l, i) =>
      '<tr style="background:' + (i%2===0?'#f9f9f9':'#fff') + '"><td style="padding:8px;border:1px solid #eee">' + (l.type||'SFR') + '</td><td style="padding:8px;border:1px solid #eee">' + (l.state||'') + '</td><td style="padding:8px;border:1px solid #eee">$' + (l.arv||0).toLocaleString() + '</td><td style="padding:8px;border:1px solid #eee">$' + (l.offer||0).toLocaleString() + '</td><td style="padding:8px;border:1px solid #eee;color:green;font-weight:bold">$' + (l.spread||0).toLocaleString() + '</td><td style="padding:8px;border:1px solid #eee">' + (l.repair_class||'-') + '</td></tr>'
    ).join('');
    const html = '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto"><h2 style="color:#1a1a2e">🏠 Deal Opportunities from Montsan REI</h2><p>Hi ' + buyer.name + ',</p><p>Here are ' + dealsToSend.length + ' off-market deal' + (dealsToSend.length>1?'s':'') + ' that match your buy box. Reply to get full property details.</p><table style="width:100%;border-collapse:collapse;margin:20px 0"><thead><tr style="background:#1a1a2e;color:#fff"><th style="padding:10px;text-align:left">Type</th><th style="padding:10px;text-align:left">State</th><th style="padding:10px;text-align:left">ARV</th><th style="padding:10px;text-align:left">Price</th><th style="padding:10px;text-align:left">Spread</th><th style="padding:10px;text-align:left">Repairs</th></tr></thead><tbody>' + dealRows + '</tbody></table><p><strong>Gabriel Montealegre</strong><br>Montsan Real Estate Investment<br>montsan.rei@gmail.com</p></div>';
    if (transporter) {
      await transporter.sendMail({ from: '"Montsan REI" <' + process.env.GMAIL_USER + '>', to: buyer.email, subject: dealsToSend.length + ' Off-Market Deal' + (dealsToSend.length>1?'s':'') + ' — Matches Your Buy Box', html });
    }
    if (!dbData.dealsSent) dbData.dealsSent = [];
    dbData.dealsSent.push({ id: 'DS'+Date.now(), buyerId: buyer.id, buyerName: buyer.name, dealCount: dealsToSend.length, sentAt: new Date().toISOString(), dealIds: dealsToSend.map(l=>l.id) });
    db.writeDB(dbData);
    res.json({ success: true, sent: dealsToSend.length, to: buyer.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. DEALS SENT HISTORY
app.get('/api/buyers/:id/deals-sent', (req, res) => {
  try {
    const dbData = db.readDB();
    const history = (dbData.dealsSent || []).filter(d => d.buyerId === req.params.id).sort((a,b) => new Date(b.sentAt)-new Date(a.sentAt));
    res.json({ history, total: history.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. DEDUP CHECK
app.post('/api/buyers/dedup-check', (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const dbData = db.readDB();
    const normPhone = p => (p||'').replace(/\D/g,'');
    const normName  = n => (n||'').toLowerCase().trim();
    const match = (dbData.buyers||[]).find(b => {
      if (name && normName(b.name) === normName(name)) return true;
      if (phone && normPhone(b.phone) === normPhone(phone) && normPhone(phone).length >= 7) return true;
      if (email && email.trim() && b.email && b.email.toLowerCase() === email.toLowerCase()) return true;
      return false;
    });
    res.json({ duplicate: !!match, existingBuyer: match || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. UPDATE BUY BOX
app.put('/api/buyers/:id/buybox', (req, res) => {
  try {
    const dbData = db.readDB();
    const idx = (dbData.buyers||[]).findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Buyer not found' });
    const { buyTypes, minPrice, maxPrice, states, cities, notes } = req.body;
    if (buyTypes !== undefined) dbData.buyers[idx].buyTypes = buyTypes;
    if (minPrice !== undefined) dbData.buyers[idx].minPrice = Number(minPrice);
    if (maxPrice !== undefined) dbData.buyers[idx].maxPrice = Number(maxPrice);
    if (states   !== undefined) dbData.buyers[idx].states   = states;
    if (cities   !== undefined) dbData.buyers[idx].cities   = cities;
    if (notes    !== undefined) dbData.buyers[idx].notes    = notes;
    dbData.buyers[idx].updatedAt = new Date().toISOString();
    db.writeDB(dbData);
    res.json({ success: true, buyer: dbData.buyers[idx] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. UPDATE TRUST SCORE
app.put('/api/buyers/:id/trust', (req, res) => {
  try {
    const dbData = db.readDB();
    const idx = (dbData.buyers||[]).findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Buyer not found' });
    const { score, responded, closings } = req.body;
    if (score     !== undefined) dbData.buyers[idx].score    = Math.min(100, Math.max(0, Number(score)));
    if (responded !== undefined) dbData.buyers[idx].responded = responded;
    if (closings  !== undefined) dbData.buyers[idx].closings  = Number(closings);
    dbData.buyers[idx].updatedAt = new Date().toISOString();
    db.writeDB(dbData);
    res.json({ success: true, buyer: dbData.buyers[idx] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 7. DAILY SUMMARY → Telegram
app.post('/api/daily-summary', async (req, res) => {
  try {
    const dbData = db.readDB();
    const leads  = dbData.leads  || [];
    const buyers = dbData.buyers || [];
    const today  = new Date().toISOString().split('T')[0];
    const newLeads = leads.filter(l => l.created === today);
    const topDeals = leads.filter(l => l.spread > 0).sort((a,b) => b.spread-a.spread).slice(0,5);
    const summary = [
      '📊 *WholesaleOS Daily Summary — ' + today + '*','',
      '📥 New leads today: *' + newLeads.length + '*',
      '📦 Total leads: *' + leads.length + '*',
      '👥 Active buyers: *' + buyers.filter(b=>b.status==='Active').length + '*','',
      '🏆 Top 5 deals by spread:',
      ...topDeals.map((l,i) => (i+1)+'. ' + l.state + ' | $' + (l.spread||0).toLocaleString() + ' spread | ' + (l.type||'SFR'))
    ].join('\n');
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.BOT_OWNER_ID) {
      await fetch('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: process.env.BOT_OWNER_ID, text: summary, parse_mode:'Markdown' }) });
    }
    res.json({ success: true, summary });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// logger.info('✅ Buyers CRM extended routes registered (7 endpoints)');
// ============================================================
// END BUYERS CRM EXTENDED ROUTES
// ============================================================

module.exports = app;



// Courthouse addon
try { require('./courthouse-addon/courthouse-routes')(app); } catch(e) {}
app.post('/api/datasources/realauction', async (req, res) => {
  try {
    const { state } = req.body;
    if (!state) return res.status(400).json({ error: 'state required' });
    const dbData = db.readDB();
    const existing = new Set(
      (dbData.leads || []).filter(function(l){ return l._source_module === 'realauction'; })
        .map(function(l){ return (l.address||'').toLowerCase().replace(/\s+/g,' '); })
    );
    const result = await scrapeRealAuction(state, existing);
    let saved = 0;
    for (const lead of result.leads) {
      try { db.addLead({ ...lead, status: 'New Lead', created: Date.now() }); saved++; }
      catch(e) { result.rejected.push({ address: lead.address, reason: 'save_error:'+e.message }); }
    }
    res.json({ ok: true, source: 'realauction', state, imported: saved,
      rejected: result.rejected.length, rejectedLeads: result.rejected });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// v15-deploy
// Bulk buyer import endpoint
// ── API: Buyers — parse raw paste text ─────────────────────────────────────
app.post('/api/buyers/parse-paste', (req, res) => {
  try {
    var text = (req.body && req.body.text) || '';
    var lines = text.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>3;});
    var US_STATES = {'AL':1,'AK':1,'AZ':1,'AR':1,'CA':1,'CO':1,'CT':1,'DE':1,'FL':1,'GA':1,'HI':1,'ID':1,'IL':1,'IN':1,'IA':1,'KS':1,'KY':1,'LA':1,'ME':1,'MD':1,'MA':1,'MI':1,'MN':1,'MS':1,'MO':1,'MT':1,'NE':1,'NV':1,'NH':1,'NJ':1,'NM':1,'NY':1,'NC':1,'ND':1,'OH':1,'OK':1,'OR':1,'PA':1,'RI':1,'SC':1,'SD':1,'TN':1,'TX':1,'UT':1,'VT':1,'VA':1,'WA':1,'WV':1,'WI':1,'WY':1};
    var STATE_NAMES = {'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY'};
    var buyers = lines.map(function(line) {
      var parts = line.split(/[|,;\t]|\s{2,}|\s--?\s/).map(function(p){return p.trim();}).filter(Boolean);
      if(parts.length < 2) return null;
      var email='',phone='',state='',name='';
      parts.forEach(function(p) {
        if(/^[^@]+@[^@]+\.[a-z]{2,}$/i.test(p)) { email=p; }
        else if(/^[\+\(]?[0-9][\d\s\-\(\)]{7,}[0-9]$/.test(p.replace(/\s/g,''))) { phone=p.replace(/[^0-9\+]/g,''); }
        else if(US_STATES[p.toUpperCase()]) { state=p.toUpperCase(); }
        else if(STATE_NAMES[p.toLowerCase()]) { state=STATE_NAMES[p.toLowerCase()]; }
        else if(!name) { name=p; }
      });
      if(!name) return null;
      return {name:name,email:email,phone:phone,state:state};
    }).filter(Boolean);
    // Check duplicates against existing buyers
    var dbData = db.readDB();
    var existingEmails = new Set((dbData.buyers||[]).map(function(b){return (b.email||'').toLowerCase();}));
    var existingPhones = new Set((dbData.buyers||[]).map(function(b){return (b.phone||'').replace(/\D/g,'');}).filter(Boolean));
    var existingNames  = new Set((dbData.buyers||[]).map(function(b){return (b.name||'').toLowerCase();}));
    buyers = buyers.map(function(b) {
      var isDupe = (b.email && existingEmails.has(b.email.toLowerCase())) ||
                   (b.phone && b.phone.length>7 && existingPhones.has(b.phone.replace(/\D/g,''))) ||
                   (b.name && existingNames.has(b.name.toLowerCase()));
      b.duplicate = isDupe;
      return b;
    });
    res.json({ok:true,parsed:buyers.length,buyers:buyers,duplicates:buyers.filter(function(b){return b.duplicate;}).length});
  } catch(e) { res.status(500).json({error:e.message}); }
});
app.post('/api/buyers/bulk-import', async (req, res) => {
  try {
    const { buyers } = req.body;
    if (!buyers || !Array.isArray(buyers)) {
      return res.status(400).json({ error: 'buyers array required' });
    }
    const dbData = db.readDB();
    const existingEmails = new Set(
      (dbData.buyers || []).map(b => (b.email || '').toLowerCase().trim()).filter(Boolean)
    );
    const existingNames = new Set(
      (dbData.buyers || []).map(b => (b.name || '').toLowerCase().trim())
    );
    
    let imported = 0, skipped = 0, duplicates = [];
    
    for (const buyer of buyers) {
      if (!buyer.name || !buyer.state) { skipped++; continue; }
      const emailKey = (buyer.email || '').toLowerCase().trim();
      const nameKey = (buyer.name || '').toLowerCase().trim();
      
      // Skip duplicates by email (if email exists) or exact name+state match
      if (emailKey && existingEmails.has(emailKey)) {
        duplicates.push(buyer.name);
        skipped++;
        continue;
      }
      if (existingNames.has(nameKey + '_' + buyer.state.toLowerCase())) {
        duplicates.push(buyer.name);
        skipped++;
        continue;
      }
      
      const newBuyer = {
        name: buyer.name,
        phone: buyer.phone || '',
        email: buyer.email || '',
        city: buyer.city || '',
        state: buyer.state,
        counties: buyer.counties || 'Statewide',
        buyTypes: buyer.buyTypes || ['Cash Buyer'],
        maxPrice: buyer.maxPrice || null,
        notes: buyer.notes || '',
        status: 'active',
        score: 75,
        closings: 0,
        created: new Date().toISOString().split('T')[0]
      };
      
      db.addBuyer(newBuyer);
      if (emailKey) existingEmails.add(emailKey);
      existingNames.add(nameKey + '_' + buyer.state.toLowerCase());
      imported++;
    }
    
    res.json({ ok: true, imported, skipped, duplicates: duplicates.length, duplicateNames: duplicates.slice(0, 10) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Buyer generator prompt endpoint — returns the system prompt for on-demand buyer generation
app.get('/api/buyers/generator-prompt', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  try {
    const promptPath = path.join(__dirname, 'buyer-generator-prompt.md');
    const prompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : 'Prompt file not found';
    res.json({
      ok: true,
      prompt: prompt,
      instructions: [
        '1. Copy the SYSTEM ROLE section as the system prompt for any AI (Claude, GPT, etc.)',
        '2. Ask: "Generate 30 buyers for [STATE]" or "Generate 30 buyers for [COUNTY], [STATE]"',
        '3. Paste the AI output back into WholesaleOS via POST /api/buyers/bulk-import',
        '4. Or use the Import Buyers panel in the Buyers tab'
      ],
      importEndpoint: '/api/buyers/bulk-import',
      currentBuyerCount: (db.readDB().buyers || []).length
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Buyer stats by state endpoint
app.get('/api/buyers/stats', (req, res) => {
  try {
    const buyers = db.readDB().buyers || [];
    const byState = {};
    buyers.forEach(b => {
      const s = b.state || 'Unknown';
      if (!byState[s]) byState[s] = { count: 0, types: {} };
      byState[s].count++;
      (b.buyTypes || []).forEach(t => {
        byState[s].types[t] = (byState[s].types[t] || 0) + 1;
      });
    });
    const statesWithBuyers = Object.keys(byState).length;
    res.json({
      ok: true,
      totalBuyers: buyers.length,
      statesWithBuyers,
      byState,
      topStates: Object.entries(byState)
        .sort((a,b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([state, data]) => ({ state, count: data.count }))
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// ADDRESS VALIDATION & ENRICHMENT PIPELINE
// ============================================================


// ── Email login ──
app.post('/api/auth/email-login', (req, res) => {
  try {
    const { email, password } = req.body||{};
    if (!email) return res.status(400).json({ error: 'Email required' });
    const users = db.readDB().users||[];
    const user = users.find(u => (u.email||'').toLowerCase()===email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.password && user.password!==password) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ ok:true, user:{ id:user.id, name:user.name, role:user.role, color:user.color, initials:user.initials }});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/api/users/:id/credentials', (req, res) => {
  try {
    const dbData = db.readDB();
    const users  = dbData.users||[];
    const adminId = req.headers['x-user-id']||req.query.uid;
    const admin   = users.find(u=>u.id===adminId);
    if (!admin||admin.role!=='admin') return res.status(403).json({error:'Admin only'});
    const user = users.find(u=>u.id===req.params.id);
    if (!user) return res.status(404).json({error:'User not found'});
    if (req.body.email) user.email = req.body.email.trim().toLowerCase();
    if (req.body.password) user.password = req.body.password;
    db.writeDB(dbData);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── Rebuild property links for ALL leads ──
app.post('/api/leads/rebuild-links', function(req, res) {
  try {
    var dbData = db.readDB();
    var leads  = dbData.leads || [];
    var rebuilt = 0;

    leads.forEach(function(lead) {
      var raw   = (lead.address || '').trim();
      var state = (lead.state || '').replace(/_\w+/gi, '').trim().toUpperCase().slice(0,2);
      var city  = lead.city || '';
      var zip   = (lead.zip || '').trim();

      // Clean state corruption: TX_Extra -> TX, MO_Extra -> MO
      var clean = raw.replace(/([A-Z]{2})_\w+/g, '$1');

      // If address has no comma (street only), reconstruct from fields
      if (clean.indexOf(',') === -1 && city && state) {
        clean = clean + ', ' + city + ', ' + state + (zip ? ' ' + zip : '');
      }

      // Sync zip field to address zip if mismatch
      var addrZipM = clean.match(/\b(\d{5})\b/);
      if (addrZipM && addrZipM[1] !== zip) {
        lead.zip = addrZipM[1];
      }

      var enc = encodeURIComponent(clean);
      lead._zillow_link      = buildZillowLink(clean);
      lead._redfin_link      = 'https://www.redfin.com/city/search?q=' + enc;
      lead._google_maps_link = 'https://www.google.com/maps/search/?api=1&query=' + enc;
      lead._clean_address    = clean;
      rebuilt++;
    });

    dbData.leads = leads;
    db.writeDB(dbData);
    var sample = leads.length > 0 ? (leads[0]._zillow_link || '').slice(0,100) : '';
    res.json({ ok: true, rebuilt: rebuilt, sample: sample });
  } catch(e) { res.status(500).json({error: e.message}); }
});


// ── Seller questions for a lead ──
app.get('/api/leads/:id/seller-questions', function(req, res) {
  try {
    var leads = db.readDB().leads || [];
    var lead  = leads.find(function(l){ return l.id === req.params.id; });
    if (!lead) return res.status(404).json({error:'Lead not found'});

    var cat = ((lead.category || lead.deal_classification || '')).toLowerCase();

    var base = [
      {q:'Why are you looking to sell?', why:'Uncovers motivation and urgency'},
      {q:'How long have you owned the property?', why:'Longer ownership = more equity and flexibility'},
      {q:'Is it vacant or occupied right now?', why:'Affects access, condition, and timeline'},
      {q:'What repairs are needed that you know of?', why:'Sets realistic repair expectations'},
      {q:'Is there a mortgage, any liens, or back taxes owed?', why:'Critical for net-to-seller calculation'},
      {q:'What is your ideal closing timeline?', why:'Identifies urgency level'},
      {q:'Have you had any other offers or listed with an agent?', why:'Reveals competition'},
      {q:'What is the lowest price you would consider?', why:'Tests price flexibility directly'},
    ];

    var catMap = {
      'pre-foreclosure':[
        {q:'How many mortgage payments are you behind?', why:'Foreclosure timeline urgency'},
        {q:'Have you received a Notice of Default or Sale date?', why:'Legal deadline pressure'},
        {q:'Have you spoken with your lender about options?', why:'Alternatives exhausted check'},
      ],
      'probate':[
        {q:'Are you the executor or administrator of the estate?', why:'Decision authority confirmation'},
        {q:'Is probate already filed and open?', why:'Timeline clarity for closing'},
        {q:'Are all heirs aligned on selling?', why:'Prevents deal-killing disputes'},
      ],
      'tax':[
        {q:'How much in back taxes is currently owed?', why:'Payoff amount for deal math'},
        {q:'Have you received a tax sale notice?', why:'Auction deadline urgency'},
      ],
      'fsbo':[
        {q:'How did you arrive at your asking price?', why:'Price basis and flexibility'},
        {q:'How long have you been trying to sell?', why:'Motivation level indicator'},
      ],
    };

    var extraKey = Object.keys(catMap).find(function(k){ return cat.indexOf(k) > -1; });
    var extra = extraKey ? catMap[extraKey] : [];

    var opener = 'Hi, I am a local real estate investor. I saw your property at ' +
      (lead.address || 'your address') +
      ' and wanted to reach out. I can close fast, pay cash, and handle everything. Do you have a few minutes to chat?';

    res.json({
      ok: true,
      lead_id: lead.id,
      address: lead.address,
      deal_summary: {
        arv:    lead.arv,
        offer:  lead.offer,
        mao:    lead.mao,
        spread: lead.spread,
        repairs: lead.repair_class,
        strategy: lead.investment_strategy || lead.allStrategies || 'Wholesale / Flip / Subject-To',
        why_good_deal: lead.why_good_deal || lead.deal_classification,
      },
      questions: base.concat(extra),
      opener: opener,
    });
  } catch(e) { res.status(500).json({error: e.message}); }
});


// ── System limits check ──
app.get('/api/system/limits', (req, res) => {
  try {
    const dbData = db.readDB();
    const leads  = (dbData.leads||[]).length;
    const buyers = (dbData.buyers||[]).length;
    res.json({ ok:true, limits:[
      {resource:'Leads DB', current:leads, limit:50000, status:leads>45000?'WARNING':'OK'},
      {resource:'Buyers DB', current:buyers, limit:10000, status:buyers>9000?'WARNING':'OK'},
      {resource:'Groq AI', note:'Free tier ~14,400 req/day. Rotate keys or switch to Claude in Settings.', status:'MONITOR'},
      {resource:'Railway Memory', note:'If db.json exceeds 100MB, archive old leads.', status:'MONITOR'},
      {resource:'Gmail OAuth', note:'Tokens expire every 7 days. Re-auth in Settings if email stops.', status:'MONITOR'},
    ]});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// Helper: clean and normalize an address string
function cleanAddressString(address) {
  if (!address) return address;
  address = address.replace(/[A-Z]{2}_Extra\s*/gi, '');
  address = address.replace(/\s{2,}/g, ' ').trim().replace(/,\s*$/, '').trim();
  return address;
}

function parseAddressComponents(address) {
  if (!address) return null;
  address = cleanAddressString(address);
  var fallback = /^(.+?),\s*([\w\s\.\-]+),\s*([A-Z]{2})\s*(\d{5})?$/i;
  var streetOnly = /^(\d+\s+[\w\s\-\.#\/]+)$/i;
  var m = address.match(fallback);
  if (m) {
    return { street:m[1].trim(), city:m[2].trim(), state:(m[3]||'').toUpperCase(), zip:m[4]||null, pattern:'full' };
  }
  var m2 = address.match(streetOnly);
  if (m2) { return { street:m2[1].trim(), city:null, state:null, zip:null, pattern:'streetOnly' }; }
  return null;
}

function isDallasFakeZip(zip, state) {
  return state === 'TX' && zip && /^100\d{2}$/.test(zip);
}

function buildGoogleMapsLink(address) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
}
function buildGoogleMapsLink(address) {
  return 'https://maps.google.com/?q=' + encodeURIComponent(address);
}
function buildZillowLink(address) {
  return 'https://www.zillow.com/search/real-estate/?searchQueryState=' +
    encodeURIComponent(JSON.stringify({usersSearchTerm: address}));
}
function buildRedfinLink(address) {
  return 'https://www.redfin.com/search?location=' + encodeURIComponent(address);
}

function validateLeadAddress(lead) {
  const rawAddr    = (lead.address || '').trim();
  const zipField   = (lead.zip    || '').trim();
  const stateField = (lead.state  || '').trim().toUpperCase().replace(/_\w+/g, '');
  const cityField  = (lead.city   || '').trim();

  const result = {
    original_address: rawAddr, corrected_address: rawAddr,
    city: cityField, state: stateField, zip: zipField, county: lead.county || '',
    google_maps_link: '', zillow_link: '', redfin_link: '',
    validation_status: 'VALID', issues: []
  };

  const setLinks = (addr) => {
    result.google_maps_link = buildGoogleMapsLink(addr);
    result.zillow_link      = buildZillowLink(addr);
    result.redfin_link      = buildRedfinLink(addr);
  };

  // === Pattern 1: TX_Extra corruption ===
  if (rawAddr.indexOf('TX_Extra') > -1 || (lead.state || '').indexOf('_') > -1) {
    // cleanAddressString removes "TX_Extra" — re-parse with TX injected
    const fixedAddr = rawAddr.replace(/TX_Extra/gi, 'TX').replace(/\s{2,}/g,' ').trim();
    const parsed  = parseAddressComponents(fixedAddr);
    if (parsed && parsed.pattern === 'full') {
      const z = parsed.zip || zipField;
      const st = (parsed.state && parsed.state.length === 2) ? parsed.state : 'TX';
      result.corrected_address = parsed.street + ', ' + parsed.city + ', ' + st + (z ? ' ' + z : '');
      result.city = parsed.city; result.state = st; result.zip = z;
    } else {
      result.corrected_address = fixedAddr; result.state = 'TX';
    }
    result.issues.push('Fixed TX_Extra corruption in address/state field');
    result.validation_status = 'FIXED';
    setLinks(result.corrected_address);
    return result;
  }

  const cleaned = cleanAddressString(rawAddr);
  const parsed  = parseAddressComponents(cleaned);

  // === Pattern 2: Street-only (no commas) ===
  if (!parsed || parsed.pattern === 'streetOnly') {
    const street = parsed ? parsed.street : cleaned;
    if (cityField && stateField && zipField) {
      result.corrected_address = street + ', ' + cityField + ', ' + stateField + ' ' + zipField;
      result.city = cityField; result.state = stateField; result.zip = zipField;
      result.issues.push('Reconstructed from street + city/state/zip fields');
      result.validation_status = 'FIXED';
    } else if (stateField && zipField) {
      result.corrected_address = street + ', ' + stateField + ' ' + zipField;
      result.state = stateField; result.zip = zipField;
      result.issues.push('Partial reconstruction — city field empty');
      result.validation_status = 'FIXED';
    } else {
      result.issues.push('Street-only, insufficient fields to reconstruct');
      result.validation_status = 'INVALID_ADDRESS_REQUIRES_REVIEW';
    }
    setLinks(result.corrected_address);
    return result;
  }

  // === Pattern 3: Fake Dallas placeholder ZIP ===
  const addrZip = parsed.zip || zipField;
  if (isDallasFakeZip(addrZip, parsed.state || stateField)) {
    result.city  = parsed.city; result.state = parsed.state || stateField; result.zip = addrZip;
    result.corrected_address = parsed.street + ', ' + result.city + ', ' + result.state + ' ' + addrZip;
    result.issues.push('Placeholder ZIP ' + addrZip + ' — Dallas TX ZIPs are 75xxx, needs manual correction');
    result.validation_status = 'INVALID_ADDRESS_REQUIRES_REVIEW';
    setLinks(result.corrected_address);
    return result;
  }

  // === Pattern 4: State field mismatch ===
  if (parsed.state && stateField && parsed.state !== stateField) {
    result.issues.push('State mismatch: address=' + parsed.state + ', field=' + stateField);
    result.state = parsed.state;
    result.validation_status = 'FIXED';
  }

  // === Valid / clean ===
  result.city  = parsed.city  || cityField;
  result.state = parsed.state || stateField;
  result.zip   = parsed.zip   || zipField;
  result.corrected_address = parsed.street + ', ' + result.city + ', ' + result.state + (result.zip ? ' ' + result.zip : '');
  if (result.issues.length > 0 && result.validation_status === 'VALID') result.validation_status = 'FIXED';
  setLinks(result.corrected_address);
  return result;
}


// DELETE all AI-generated fake leads — keep only real Propwire/imported leads
app.post('/api/leads/delete-fake', function(req, res) {
  try {
    var dbData = db.readDB();
    var leads  = dbData.leads || [];
    var before = leads.length;

    // Keep only leads that are NOT AI-generated
    var realLeads = leads.filter(function(l) {
      var src = (l.source || l.source_platform || '').toLowerCase();
      var isAI = src.indexOf('ai generated') > -1 ||
                 src.indexOf('ai-generated') > -1 ||
                 src.indexOf('state population') > -1 ||
                 src.indexOf('dashboard search') > -1;
      return !isAI;
    });

    var deleted = before - realLeads.length;
    dbData.leads = realLeads;
    db.writeDB(dbData);

    res.json({
      ok: true,
      before: before,
      after: realLeads.length,
      deleted: deleted,
      kept_sources: [...new Set(realLeads.map(function(l){ return l.source||l.source_platform||'unknown'; }))].slice(0,10)
    });
  } catch(e) { res.status(500).json({error: e.message}); }
});
app.post('/api/deals/playwright', async (req, res) => {
  // deal-engine -> db.addLead pipeline
  // Scraped deals now enter the same system as CSV-imported leads
  try {
    const { state, limit } = req.body;
    const { analyzeProperty } = require('./ai');

    // 1. Run deal engine — normalizes + deduplicates across sources
    const rawDeals = await dealEngine(state || 'NY', Number(limit) || 20);

    const inserted = [];
    const skipped  = [];

    for (const d of rawDeals) {
      // 2. Build lead object matching db.addLead() expected structure
      const leadInput = {
        address:    (d.address    || '').trim(),
        city:       (d.city       || '').trim(),
        state:      (d.state      || state || 'NY').trim(),
        zip:        d.zip         || '',
        source:     d.source      || 'Deal Engine',
        source_platform: d.source || 'Deal Engine',
        status:     'New Lead',
        createdAt:         Date.now(),
        createdAtReadable: new Date().toISOString(),
        score:      typeof d.score === 'number' ? d.score : (d.motivation || 5),
        violations: typeof d.violations === 'number' ? d.violations : 0,
        motivation: d.motivation  || 5,
        category:   d.category    || 'Code Violation',
        type:       d.type        || 'SFR',
        arv:        d.arv         || 0,
        offer:      d.offer       || 0,
        repairs:    d.repairs     || 0,
        phone:      d.phone       || '',
        email:      d.email       || '',
        sourceCount: 1,

        // ── Lead Quality Fields (added for structured data) ──

        // county: derive from raw data if available, else null
        county: d.raw && (d.raw.county || d.raw.borough || d.raw.parish || null) || null,

        // source_details: structured source metadata
        source_details: {
          type: (function() {
            var src = (d.source || '').toLowerCase();
            if (src.indexOf('foreclosure') > -1) return 'foreclosure';
            if (src.indexOf('tax') > -1)         return 'tax_delinquent';
            if (src.indexOf('lien') > -1)        return 'tax_delinquent';
            if (src.indexOf('probate') > -1)     return 'probate';
            if (src.indexOf('auction') > -1)     return 'foreclosure';
            if (src.indexOf('violation') > -1)   return 'code_violation';
            if (src.indexOf('blight') > -1)      return 'code_violation';
            if (src.indexOf('complaint') > -1)   return 'code_violation';
            if (src.indexOf('enforcement') > -1) return 'code_violation';
            return 'other';
          })(),
          source_name: d.source || 'Deal Engine',
          raw_data:    d.raw    || null,
        },

        // good_deal_reasons: structured signals (replaces generic AI text)
        good_deal_reasons: (function() {
          var reasons = [];
          var src = (d.source || '').toLowerCase();
          var vcount = typeof d.violations === 'number' ? d.violations : 0;
          if (vcount > 0) reasons.push(vcount + ' active code violation' + (vcount > 1 ? 's' : ''));
          if (src.indexOf('violation') > -1 || src.indexOf('blight') > -1) reasons.push('open code violation on record');
          if (src.indexOf('foreclosure') > -1)   reasons.push('pre-foreclosure or foreclosure status');
          if (src.indexOf('tax') > -1 || src.indexOf('lien') > -1) reasons.push('tax delinquent property');
          if (src.indexOf('probate') > -1)        reasons.push('probate sale — motivated estate');
          if (src.indexOf('auction') > -1)        reasons.push('scheduled for auction — time pressure');
          reasons.push('off-market property');
          return reasons;
        })(),

        // motivation_score: computed from real distress signals
        motivation_score: (function() {
          var ms  = 0;
          var src = (d.source || '').toLowerCase();
          var vcount = typeof d.violations === 'number' ? d.violations : 0;
          ms += vcount * 2;                                          // +2 per violation
          if (src.indexOf('violation') > -1 || src.indexOf('blight') > -1 ||
              src.indexOf('complaint') > -1 || src.indexOf('enforcement') > -1) ms += 3; // open violation +3
          if (src.indexOf('tax') > -1 || src.indexOf('lien') > -1)  ms += 5; // tax delinquent +5
          if (src.indexOf('foreclosure') > -1 || src.indexOf('auction') > -1) ms += 8; // foreclosure +8
          return ms;
        })(),

        // created_at: ISO alias (createdAt/createdAtReadable already set above)
        created_at: new Date().toISOString(),
      };

      // 3. Skip if address is missing
      if (!leadInput.address || leadInput.address === 'Unknown Address') {
        skipped.push({ reason: 'no_address', address: leadInput.address });
        continue;
      }

      // 3a. Check for exact same-source duplicate (skip if exists)
      if (db.getLeads().some(function(l) {
        return (l.address||'').toLowerCase().trim() === (leadInput.address||'').toLowerCase().trim() &&
               (l.city||'').toLowerCase().trim()    === (leadInput.city||'').toLowerCase().trim() &&
               (l.state||'').toLowerCase().trim()   === (leadInput.state||'').toLowerCase().trim() &&
               (l.source||'').toLowerCase().trim()  === (leadInput.source||'').toLowerCase().trim();
      })) {
        skipped.push({ reason: 'duplicate', address: leadInput.address });
        continue;
      }

      // 3b. Track sourceCount: find any lead with same address+city+state (any source)
      //     If found, increment its sourceCount. Multiple sources = higher motivation.
      var existingMatch = db.getLeads().find(function(l) {
        return (l.address||'').toLowerCase().trim() === (leadInput.address||'').toLowerCase().trim() &&
               (l.city||'').toLowerCase().trim()    === (leadInput.city||'').toLowerCase().trim() &&
               (l.state||'').toLowerCase().trim()   === (leadInput.state||'').toLowerCase().trim();
      });
      if (existingMatch) {
        var newCount = (existingMatch.sourceCount || 1) + 1;
        db.updateLead(existingMatch.id, { sourceCount: newCount });
        // Note: we still insert the new lead below (different source)
      }

      // 4. Run AI scoring (analyzeProperty) — same as CSV import flow
      //    Wraps in try/catch so a failed AI call never blocks insertion
      try {
        const enriched = await analyzeProperty(leadInput);
        Object.assign(leadInput, enriched);
      } catch (aiErr) {
        logger.warn('analyzeProperty skipped for', leadInput.address, aiErr.message);
      }

      // 5. Write to db.json — makes it appear in dashboard, pipeline, buyers, SMS, email
      const saved = db.addLead(leadInput);
      inserted.push({ id: saved.id, address: saved.address });
    }

    res.json({
      success:  true,
      inserted: inserted.length,
      skipped:  skipped.length,
      leads:    inserted,
      skip_log: skipped
    });

  } catch (err) {
    logger.error('deal-engine route error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Daily ingestion — 2AM UTC via cron (replaces setInterval)
if (ENABLE_BACKGROUND_INGESTION) {
cron.schedule('0 2 * * *', async () => {
  logger.info('Running daily ingestion...');
  await runDailyIngestion();
  logger.info('Daily ingestion complete');
  // Run ArcGIS sources (5 cities, no Playwright needed)
  try {
    var arcgisSrc = require('./modules/sources/arcgis-sources');
    var arcgisResult = await arcgisSrc.runArcGISSources();
    logger.info('[arcgis] Added ' + arcgisResult.added + ' new leads from ArcGIS sources');
  } catch(e) {
    logger.error('[arcgis] Daily run error: ' + e.message);
  }
    // Also run courthouse scraper (30 portals)
    try {
      var _chScraper = require('./courthouse-addon/scraper');
      _chScraper.scrapeAllPortals(30).then(function(r){
        logger.info({ event: 'courthouse_done', leads: r.leads, portals: r.portals });
      }).catch(function(e){ logger.error('[courthouse] cron error: '+e.message); });
    } catch(e) { logger.error('[courthouse] load error: '+e.message); }

}, { timezone: 'UTC' });
try{var ag=require('./modules/sources/arcgis-runner');ag.runArcGISSources(200).catch(function(e){logger.error('[arcgis] '+e.message);});}catch(e){logger.error('[arcgis] load: '+e.message);}
try{var se=require('./modules/sources/socrata-extra');se.runExtraSocrataSources(200).catch(function(e){logger.error('[socrata-extra] '+e.message);});}catch(e){logger.error('[socrata-extra] load: '+e.message);}
try{var s30=require('./modules/sources/socrata-30');s30.runSocrata30Sources(200).catch(function(e){logger.error('[socrata-30] '+e.message);});}catch(e){logger.error('[socrata-30] load: '+e.message);}

// ── Batch lead delete ──
}

// POST /api/leads/delete-batch  body: { ids: ['id1','id2',...] }
app.post('/api/leads/delete-batch', function(req, res) {
  try {
    var ids = req.body && Array.isArray(req.body.ids) ? req.body.ids : [];
    if (ids.length === 0) return res.status(400).json({ ok:false, error:'No IDs provided' });
    var dbData = db.readDB();
    var before = (dbData.leads || []).length;
    dbData.leads = (dbData.leads || []).filter(function(l){ return ids.indexOf(l.id) === -1; });
    var deleted = before - dbData.leads.length;
    db.writeDB(dbData);
    logger.info('Batch delete: removed ' + deleted + ' leads');
    res.json({ ok:true, deleted:deleted, remaining:dbData.leads.length });
  } catch(e) {
    logger.error('Batch delete error: ' + e.message);
    res.status(500).json({ ok:false, error:e.message });
  }
});
// Alias: /api/leads/delete-bulk (same as delete-batch, matches dashboard bulkDelete() call)
app.get('/api/leads/:id/comps', function(req, res) {
  var agent = getCompAgent();
  if (!agent) return res.status(503).json({ error: 'comp-agent unavailable' });
  agent.fetchCompsForLead(req.params.id)
    .then(function(result) {
      if (result && result.error) return res.status(404).json(result);
      res.json(result);
    })
    .catch(function(e) {
      logger.error('[comps] ' + e.message);
      res.status(500).json({ error: e.message });
    });
});

// GET /api/leads/:id/seller-script — AI tailored seller call script
app.get('/api/leads/:id/seller-script', function(req, res) {
  var agent;
  try { agent = require('./modules/agents/seller-script-agent'); }
  catch(e) { return res.status(503).json({ error: 'seller-script-agent unavailable: ' + e.message }); }
  agent.generateSellerScript(req.params.id)
    .then(function(result) { res.json(result); })
    .catch(function(e) {
      logger.error('[seller-script] ' + e.message);
      res.status(500).json({ error: e.message });
    });
});

// POST /api/leads/search-fresh — on-demand lead search any state
app.post('/api/leads/search-fresh', function(req, res) {
  var state = ((req.body && req.body.state) || 'TX').toString().toUpperCase().slice(0,2);
  var count = Math.min(parseInt((req.body && req.body.count) || 50), 200);
  var de;
  try { de = require('./modules/deal-engine'); }
  catch(e) { return res.status(503).json({ error: 'deal-engine unavailable' }); }
  Promise.resolve()
    .then(function() { return de.runDailyIngestion(state, count); })
    .then(function(n) { res.json({ ok: true, state: state, requested: count, inserted: n || 0 }); })
    .catch(function(e) {
      logger.error('[search-fresh] ' + e.message);
      res.status(500).json({ error: e.message });
    });
});

// POST /api/buyers/:id/send-leads — send matching leads WITHOUT address
app.post('/api/buyers/:id/send-leads', function(req, res) {
  try {
    var dbData = db.readDB();
    var buyer = null;
    (dbData.buyers || []).forEach(function(b) { if (b.id === req.params.id) buyer = b; });
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
    var leadIds = (req.body && req.body.lead_ids) || [];
    if (!leadIds.length) return res.status(400).json({ error: 'No lead_ids provided' });
    var leads = db.getLeads().filter(function(l) { return leadIds.indexOf(l.id) > -1; });
    var lines = ['Hi ' + (buyer.name || 'Investor') + ', here are ' + leads.length + ' deals matching your buy box:\n'];
    leads.forEach(function(l, i) {
      var arv    = l.arv    ? '$' + Math.round(l.arv).toLocaleString()    : 'TBD';
      var mao    = l.mao    ? '$' + Math.round(l.mao).toLocaleString()    : 'TBD';
      var spread = l.spread ? '$' + Math.round(l.spread).toLocaleString() : 'TBD';
      var fee    = (l.fee_lo && l.fee_hi)
        ? '$' + Math.round(l.fee_lo).toLocaleString() + '-$' + Math.round(l.fee_hi).toLocaleString()
        : 'TBD';
      lines.push(
        (i + 1) + '. ' + (l.city || '') + ', ' + (l.state || '') + ' | ' + (l.lead_type || 'SFR') + '\n' +
        '   ARV: ' + arv + ' | Asking: ' + mao + ' | Spread: ' + spread + ' | Fee: ' + fee + '\n' +
        '   Source: ' + (l.source || 'Public Record') + '\n' +
        '   [Address withheld until signed contract]\n'
      );
    });
    lines.push('\nInterested? Reply with the number and I will send full details + contract.');
    res.json({
      ok: true,
      buyer_id: buyer.id,
      buyer_name: buyer.name,
      lead_count: leads.length,
      message: lines.join('\n')
    });
  } catch(e) {
    logger.error('[send-leads] ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// Daily comp batch — 4AM UTC
if (ENABLE_BACKGROUND_INGESTION) {
  cron.schedule('0 4 * * *', function() {
    var ca2 = getCompAgent();
    if (!ca2) return;
    ca2.runDailyCompBatch().catch(function(e) { console.error('[comp-batch]', e.message); });
  }, { timezone: 'UTC' });
}


// ================================================================
// SKIP TRACE ROUTES — TruePeopleSearch / FastPeopleSearch / CBC
// ================================================================

// POST /api/leads/:id/skip-trace — on-demand per lead
app.post('/api/leads/:id/skip-trace', function(req, res) {
  var agent = getSkipTraceAgent();
  if (!agent) return res.status(503).json({ error: 'skip-trace agent unavailable' });
  agent.skipTraceLead(req.params.id)
    .then(function(r) { res.json(r); })
    .catch(function(e) { logger.error('[skip-trace] ' + e.message); res.status(500).json({ error: e.message }); });
});

// Daily skip trace cron — 6AM UTC (after ingestion at 2AM, comps at 4AM)
if (ENABLE_BACKGROUND_INGESTION) {
  cron.schedule('0 6 * * *', function() {
    var agent = getSkipTraceAgent();
    if (!agent) return;
    agent.runDailySkipTrace().catch(function(e) { console.error('[skip-trace-cron]', e.message); });
  }, { timezone: 'UTC' });
}


// DEBUG: test comp scraper
app.get('/api/debug/comp-test', async function(req,res){
  var address=req.query.address||'6901 S Oglesby Ave';
  var city=req.query.city||'Chicago';
  var state=req.query.state||'IL';
  var errors=[];
  var redfinResult=null;
  var zillowResult=null;
  var skipResult=null;
  try{
    var axios=require('axios');
    var H={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36','Accept':'text/html,*/*;q=0.9','Accept-Language':'en-US,en;q=0.9'};
    // Test Redfin stingray
    try{
      var rfUrl='https://www.redfin.com/stingray/do/location-autocomplete?location='+encodeURIComponent(address+', '+city+', '+state)+'&v=2';
      var rfRes=await axios.get(rfUrl,{headers:H,timeout:10000});
      redfinResult={status:rfRes.status,len:rfRes.data.length,preview:rfRes.data.toString().slice(0,200)};
    }catch(e){errors.push('Redfin: '+e.message);}
    // Test Zillow search
    try{
      var zUrl='https://www.zillow.com/search/GetSearchPageState.htm?searchQueryState='+encodeURIComponent(JSON.stringify({usersSearchTerm:address+' '+city+' '+state,isMapVisible:false,filterState:{isRecentlySold:{value:true}}}))+'&wants={"cat1":["listResults"]}';
      var zRes=await axios.get(zUrl,{headers:H,timeout:10000});
      zillowResult={status:zRes.status,len:zRes.data.length,preview:JSON.stringify(zRes.data).slice(0,200)};
    }catch(e){errors.push('Zillow: '+e.message);}
    // Test TruePeopleSearch
    try{
      var tpsUrl='https://www.truepeoplesearch.com/results?streetaddress='+encodeURIComponent(address)+'&citystatezip='+encodeURIComponent(city+' '+state);
      var tpsRes=await axios.get(tpsUrl,{headers:H,timeout:10000});
      skipResult={status:tpsRes.status,len:tpsRes.data.length,preview:tpsRes.data.slice(0,300)};
    }catch(e){errors.push('TPS: '+e.message);}
 
// ── ArcGIS Sources API ────────────────────────────────────────────────────
// POST /api/leads/run-arcgis — trigger ArcGIS sources manually
app.post('/api/leads/run-arcgis', function(req, res) {
  var arcgis;
  try { arcgis = require('./modules/sources/arcgis-sources'); }
  catch(e) { return res.status(503).json({ error: 'arcgis-sources unavailable: ' + e.message }); }
  arcgis.runArcGISSources()
    .then(function(r) { res.json({ ok: true, total: r.total, added: r.added }); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

 }catch(e){errors.push('General: '+e.message);}
  res.json({errors,redfinResult,zillowResult,skipResult});
});


app.get('/api/debug/env', function(req,res){
  res.json({
    SCRAPERAPI: !!process.env.SCRAPERAPI_KEY,
    GROQ: !!process.env.GROQ_API_KEY,
    ANTHROPIC: !!process.env.ANTHROPIC_API_KEY,
    RENTCAST: !!process.env.RENTCAST_API_KEY,
  });
});

// POST /api/leads/fetch-now — trigger ingestion on demand (admin only)
app.post('/api/leads/fetch-now', requireAdmin, async function(req, res) {
  var source = req.body && req.body.source;
  try {
    var de = require('./modules/deal-engine');
    if (source === 'arcgis') {
      var arc = require('./modules/sources/arcgis_sources');
      var n = await arc.fetchAllArcGIS(req.body.count||100);
      return res.json({ ok: true, added: n, source: 'arcgis' });
    } else if (source === 'opendata') {
      var od = require('./modules/sources/open_data_sources');
      var n2 = await od.fetchAllOpenData(req.body.count||100);
      return res.json({ ok: true, added: n2, source: 'opendata' });
    } else {
      await de.runDailyIngestion();
      return res.json({ ok: true, source: 'all' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/courthouse/scrape — on-demand courthouse scrape
app.post('/api/courthouse/scrape', function(req, res) {
  var limit = parseInt(req.body && req.body.limit) || 30;
  var scraper;
  try { scraper = require('./courthouse-addon/scraper'); }
  catch(e) { return res.status(503).json({ error: 'Scraper unavailable: ' + e.message }); }
  scraper.scrapeAllPortals({limit:limit})
    .then(function(r) { res.json(r); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

// GET /api/courthouse/status — list all portals and their types
app.get('/api/courthouse/status', requireAdmin, function(req, res) {
  try {
    var scraper = require('./courthouse-addon/scraper');
    var rows = scraper.readMastersheet();
    var summary = {};
    rows.forEach(function(r) {
      var type = scraper.classifyPortal(r.url);
      if(!summary[type]) summary[type] = [];
      summary[type].push({ market: r.market, state: r.state, type: r.type });
    });
    res.json({ total: rows.length, byType: summary });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Courthouse cron: run Playwright scraper daily at 5AM UTC (after Socrata/ArcGIS at 2AM)
if (ENABLE_BACKGROUND_INGESTION) {
cron.schedule('0 5 * * *', function() {
  logger.info('[Courthouse] Starting daily Playwright scrape');
  var scraper;
  try { scraper = require('./courthouse-addon/scraper'); }
  catch(e) { logger.error('[Courthouse] Scraper unavailable: ' + e.message); return; }
  scraper.scrapeAllPortals(10)
    .then(function(r) { logger.info('[Courthouse] Daily scrape done:', JSON.stringify(r)); })
    .catch(function(e) { logger.error('[Courthouse] Error:', e.message); });
});

// POST /api/leads/run-ingestion — trigger fresh lead fetch from all sources
}

app.post('/api/leads/run-ingestion', requireAdmin, async function(req, res) {
  var source = req.body && req.body.source || 'all';
  var count  = (req.body && req.body.count) || 100;
  var results = {};
  try {
    if (source === 'all' || source === 'arcgis') {
      var ag = require('./modules/sources/arcgis_sources');
      results.arcgis = await ag.fetchAllArcGIS(count);
    }
    if (source === 'all' || source === 'opendata') {
      var od = require('./modules/sources/open_data_sources');
      results.opendata = await od.fetchAllOpenData(count);
    }
    if (source === 'all' || source === 'engine') {
      var de = require('./modules/deal-engine');
      results.engine = await de.runDailyIngestion();
    }
    var total = Object.values(results).reduce(function(a,b){return a+(typeof b==='number'?b:0);},0);
    logger.info('[ingestion] Manual run: '+JSON.stringify(results));
    res.json({ ok: true, source: source, results: results, total_added: total });
  } catch(e) {
    logger.error('[ingestion] Error: '+e.message);
    res.status(500).json({ error: e.message });
  }
});

app.use(function(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.error('Invalid JSON received: ' + err.message);
    return res.status(400).json({ error: 'Invalid JSON format' });
  }
  next(err);
});


// ── Courthouse automation routes ────────────────────────────────
try {
  var _chTab = require('./courthouse-addon/courthouse-tab');
  _chTab.registerCourthouseRoutes(app);
} catch(e) { logger.error('[courthouse-tab] failed to load: ' + e.message); }

// ── POST /api/leads/search-fresh-v2 — manual trigger: state + county + source_type ──
app.post('/api/leads/search-fresh-v2', async function(req, res) {
  try {
    var body      = req.body || {};
    var state     = body.state     ? body.state.toString().toUpperCase().slice(0,2) : null;
    var county    = body.county    ? body.county.toString().trim() : null;
    var srcType   = body.source_type ? body.source_type.toString().toLowerCase() : null;
    var count     = Math.min(parseInt(body.count || 100), 500);
    var results   = { arcgis: 0, socrata: 0, socrataExtra: 0, socrata30: 0, dealEngine: 0 };
    res.json({
      ok: true,
      inserted: 0,
      breakdown: results,
      errors: [],
      filters: { state: state, county: county, source_type: srcType, count: count },
      should_ingest: false,
      preview_only: true,
      persist_scope: 'batch_only',
      no_auto_ingestion_status: 'passed',
      message: 'Legacy global lead pull is disabled for Fresh Lead safety. Use Deal Finder Fresh Lead Batch; no saved leads or downstream records were created.'
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/leads/sources — list all available states and source types
app.get('/api/leads/sources', function(req, res) {
  res.json({
    source_types: ['arcgis','socrata','code_violation','tax_delinquent','pre_foreclosure','auction','courthouse'],
    states: ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'],
    priority_markets: ['TX','FL','GA','OH','PA','IL','MI','NC','TN','MD','NY','CA','AZ','NV','CO'],
    total_sources: 73
  });
});


// ── Comp Agent — real ARV on-demand + daily 4AM cron ────────────────────

  // POST /api/leads/reanalyze — on-demand full reanalysis
  app.post('/api/leads/reanalyze', async function(req, res) {
  var body = req.body || {};
  var maxLeads = Math.min(parseInt(body.max || 200), 1000);
  var force = !!body.force;
  var compAgent = getCompAgent();
  if (!compAgent) return res.status(503).json({ ok: false, error: 'comp-agent unavailable' });
  // Run async, respond immediately with job started
  res.json({ ok: true, message: 'Reanalysis started for up to ' + maxLeads + ' leads', max: maxLeads });
  compAgent.runCompAgent({ maxLeads: maxLeads, batchSize: 50, force: force })
      .then(function(r) { logger.info({ event: 'comp_agent_done', updated: r.updated, failed: r.failed }); })
      .catch(function(e) { logger.error('[comp-agent] on-demand error: ' + e.message); });
  });

  // POST /api/leads/:id/analyze — analyze single lead
  app.post('/api/leads/:id/analyze', async function(req, res) {
    try {
      var lead = db.getLead ? db.getLead(req.params.id) : null;
      if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found' });
      var compAgent = getCompAgent();
      if (!compAgent) return res.status(503).json({ ok: false, error: 'comp-agent unavailable' });
      var result = await compAgent.analyzeLead(lead);
      if (result.analyzed) {
        db.updateLead(req.params.id, result);
        res.json({ ok: true, data: result });
      } else {
        res.json({ ok: false, reason: result.reason, arv: result.arv || null });
      }
    } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // 4AM daily cron — top 500 leads by motivation score
  if (ENABLE_BACKGROUND_INGESTION) {
    cron.schedule('0 4 * * *', function() {
      var compAgent = getCompAgent();
      if (!compAgent) return;
      logger.info('[comp-agent] 4AM cron starting');
      compAgent.runCompAgent({ maxLeads: 500, batchSize: 50 })
        .catch(function(e) { logger.error('[comp-agent] cron error: ' + e.message); });
    }, { timezone: 'UTC' });
  }

  logger.info('[comp-agent] routes + cron registered');


// ── Skip Trace 3AM cron ─────────────────────────────────────────────────
  if (ENABLE_BACKGROUND_INGESTION) {
    cron.schedule('0 3 * * *', function() {
      var _skipTrace = getSkipTraceAgent();
      if (!_skipTrace) return;
      logger.info('[skip-trace] 3AM cron starting');
      _skipTrace.runSkipTraceAgent({ limit: 300 })
        .then(function(r){ logger.info({ event: 'skip_trace_done', traced: r.traced, failed: r.failed }); })
        .catch(function(e){ logger.error('[skip-trace] cron error: ' + e.message); });
    }, { timezone: 'UTC' });
  }
  // POST /api/leads/skip-trace — on-demand
  app.post('/api/leads/skip-trace', async function(req, res) {
    var limit = Math.min(parseInt((req.body||{}).limit||50), 300);
    res.json({ ok: true, message: 'Skip trace started for up to ' + limit + ' leads' });
    var _skipTrace = getSkipTraceAgent();
    if (!_skipTrace) return res.status(503).json({ error: 'skip-trace agent unavailable' });
    _skipTrace.runSkipTraceAgent({ limit: limit })
      .catch(function(e){ logger.error('[skip-trace] on-demand error: ' + e.message); });
  });
  logger.info('[skip-trace] 3AM cron + route registered');

// ── Telegram 7AM daily summary ──────────────────────────────────────────
if (ENABLE_BACKGROUND_INGESTION) {
cron.schedule('0 7 * * *', async function() {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.BOT_OWNER_ID) return;
    var TelegramBot = require('node-telegram-bot-api');
    var tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
    var dbData = db.readDB ? db.readDB() : { leads: [] };
    var leads = dbData.leads || [];
    var total = leads.length;
    var today = new Date().toISOString().split('T')[0];
    var todayLeads = leads.filter(function(l){ return (l.created||l.createdAt||'').startsWith(today); }).length;
    var withPhone = leads.filter(function(l){ return l.phone && l.phone.length > 7; }).length;
    var withArv = leads.filter(function(l){ return l.arv && l.arv > 0; }).length;
    var highPrio = leads.filter(function(l){ return l.priority === 'HIGH'; }).length;
    var msg = 'WholesaleOS Daily Summary — ' + today + '\n\n' +
      'Total Leads: ' + total.toLocaleString() + '\n' +
      'New Today: ' + todayLeads + '\n' +
      'High Priority: ' + highPrio + '\n' +
      'With Phone: ' + withPhone + '\n' +
      'With ARV: ' + withArv + '\n\n' +
      'Dashboard: https://wholesaleos-bot-production.up.railway.app/dashboard/';
    await tgBot.sendMessage(process.env.BOT_OWNER_ID, msg);
    logger.info('[telegram] 7AM summary sent');
  } catch(e){ logger.error('[telegram] 7AM cron error: ' + e.message); }
}, { timezone: 'UTC' });
}


// ── Hot Lead Scorer + Alert + Outreach AI ───────────────────────────────
try {
  var _hotScorer = require('./modules/agents/hot-lead-scorer');
  var _hotAlert  = require('./modules/agents/hot-lead-alert');

  // POST /api/outreach/generate-ai — AI outreach per lead
  app.post('/api/outreach/generate-ai', async function(req, res) {
    try {
      var body = req.body || {};
      var lead = db.getLeads ? db.getLeads().find(function(l){return l.id===body.leadId;}) : null;
      if (!lead) return res.status(404).json({ok:false,error:'Lead not found'});
      var scored = _hotScorer.scoreHotLead(lead);
      lead = Object.assign({}, lead, scored);
      var result = await _hotAlert.generateOutreachMessage(lead, body.type || 'sms_seller', body.extra || {});
      res.json(result);
    } catch(e) { res.status(500).json({ok:false,error:e.message}); }
  });

  // POST /api/outreach/bulk-buyer — blind deal outreach to buyers
  app.post('/api/outreach/bulk-buyer', async function(req, res) {
    try {
      var body = req.body || {};
      var leadIds = body.leadIds || [];
      var buyerId = body.buyerId;
      var allLeads = db.getLeads ? db.getLeads() : [];
      var deals = allLeads.filter(function(l){ return leadIds.indexOf(l.id) > -1; });
      var buyers = db.getBuyers ? db.getBuyers() : [];
      var buyer = buyers.find(function(b){ return b.id===buyerId; }) || {};
      var fakeLead = deals[0] || {};
      var result = await _hotAlert.generateOutreachMessage(fakeLead, 'bulk_buyer', {
        deals: deals, buyerName: buyer.name||buyer.contact||'Investor',
        buyerState: (buyer.buyBox||{}).state||''
      });
      res.json(result);
    } catch(e) { res.status(500).json({ok:false,error:e.message}); }
  });

  // POST /api/leads/:id/score-hot — score a single lead
  app.post('/api/leads/:id/score-hot', function(req, res) {
    try {
      var lead = db.getLeads ? db.getLeads().find(function(l){return l.id===req.params.id;}) : null;
      if (!lead) return res.status(404).json({ok:false,error:'Lead not found'});
      var score = _hotScorer.scoreHotLead(lead);
      db.updateLead(req.params.id, score);
      res.json({ok:true,score:score});
    } catch(e) { res.status(500).json({ok:false,error:e.message}); }
  });

  // POST /api/leads/score-all — batch score all leads
  app.post('/api/leads/score-all', function(req, res) {
    try {
      var leads = db.getLeads ? db.getLeads() : [];
      var hot=0, warm=0, cold=0;
      leads.forEach(function(lead) {
        var score = _hotScorer.scoreHotLead(lead);
        db.updateLead(lead.id, score);
        if(score.hot_tier==='HOT') hot++;
        else if(score.hot_tier==='WARM') warm++;
        else cold++;
      });
      res.json({ok:true,total:leads.length,hot:hot,warm:warm,cold:cold});
    } catch(e) { res.status(500).json({ok:false,error:e.message}); }
  });

  
  logger.info('[hot-lead] scorer + alert + outreach AI routes registered');
} catch(e) { logger.error('[hot-lead] failed to load: ' + e.message); }


// ── Lead status update (pipeline stage move) ────────────────────────────
app.put('/api/leads/:id/status', function(req, res) {
  try {
    var lead = db.getLead ? db.getLead(req.params.id) : db.getLeads().find(function(l){return l.id===req.params.id;});
    if (!lead) return res.status(404).json({ok:false,error:'Lead not found'});
    var newStatus = (req.body||{}).status;
    var validStatuses = ['New Lead','Contacted','Offer Sent','Negotiating','Under Contract','Closed','Dead'];
    if (!newStatus || validStatuses.indexOf(newStatus) === -1) return res.status(400).json({ok:false,error:'Invalid status'});
    var fromStatus = lead.status || null;
    db.updateLead(req.params.id, {status: newStatus, status_updated: new Date().toISOString(), last_status_change: new Date().toISOString()});
    var updated = db.getLeads().find(function(l){return l.id===req.params.id;});
    if (fromStatus !== newStatus && db.appendEvent) {
      try {
        db.appendEvent({
          event_type: 'status_changed',
          category: 'lifecycle',
          entity: {
            type: 'lead',
            id: lead.id,
            ref_number: lead.ref_number || lead.reference_number || null
          },
          payload: {
            from_status: fromStatus,
            to_status: newStatus
          },
          source: {
            system: 'server',
            module: 'status-route',
            route: 'PUT /api/leads/:id/status'
          },
          dedupe_key: 'status_changed:' + lead.id + ':' + fromStatus + ':' + newStatus
        });
      } catch(eventError) {
        logger.warn({event:'status_changed_event_append_failed',id:req.params.id,error:eventError.message});
      }
    }
    logger.info({event:'lead_status_update',id:req.params.id,newStatus:newStatus});
    res.json({ok:true,id:req.params.id,status:newStatus});
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});


// ── Pipeline Routes ─────────────────────────────────────────────────────
// GET /api/pipeline — get leads grouped by pipeline stage
app.get('/api/pipeline', function(req, res) {
  try {
    var leads = db.getLeads ? db.getLeads() : [];
    var stages = { "New Lead":[], "Contacted":[], "Interested":[], "Offer Made":[], "Under Contract":[], "Closed":[], "Dead":[] };
    leads.forEach(function(l) {
      var st = l.status || "New Lead";
      if (!stages[st]) stages[st] = [];
      stages[st].push(l);
    });
    res.json({ ok:true, stages:stages, total:leads.length });
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});

// PATCH /api/pipeline/:id/stage — move lead to new stage
app.patch('/api/pipeline/:id/stage', function(req, res) {
  try {
    var body = req.body || {};
    var stage = body.stage;
    if (!stage) return res.status(400).json({ok:false,error:"stage required"});
    var valid = ["New Lead","Contacted","Interested","Offer Made","Under Contract","Closed","Dead"];
    if (valid.indexOf(stage) === -1) return res.status(400).json({ok:false,error:"invalid stage: "+stage});
    var updated = db.updateLead(req.params.id, {status: stage, pipeline_updated_at: new Date().toISOString()});
    if (!updated) return res.status(404).json({ok:false,error:"Lead not found"});
    res.json({ok:true, lead:updated});
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});

// POST /api/pipeline/:id/note — add pipeline note
app.post('/api/pipeline/:id/note', function(req, res) {
  try {
    var body = req.body || {};
    var note = {text: body.note, date: new Date().toISOString(), user: "Gabriel"};
    var leads = db.getLeads ? db.getLeads() : [];
    var lead = leads.find(function(l){return l.id===req.params.id;});
    if (!lead) return res.status(404).json({ok:false,error:"Lead not found"});
    var notes = lead.pipeline_notes || [];
    notes.push(note);
    var updated = db.updateLead(req.params.id, {pipeline_notes: notes});
    res.json({ok:true, notes:notes});
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});


// POST /api/courthouse/run-all — trigger all 118 courthouse portals
app.post('/api/courthouse/run-all', async function(req, res) {
  try {
    var limit = parseInt(req.body && req.body.limit) || 30;
    res.json({ ok: true, message: "Courthouse scrape started for "+limit+" portals. Runs in background." });
    var _chScraper = require('./courthouse-addon/scraper');
    _chScraper.scrapeAllPortals({limit:limit}).then(function(r){
      logger.info({ event: "courthouse_ondemand_done", leads: r.leads, portals: r.portals });
    }).catch(function(e){ logger.error("[courthouse] run-all error: "+e.message); });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});


// ── Ingestion status tracking (Phase 1A) ──────────────────────────────────────
if (!global._ingestionStatus) {
  global._ingestionStatus = {
    last_run: null,
    last_run_source: null,
    records_added: 0,
    records_skipped: 0,
    last_error: null,
    runs_today: 0,
    status: 'idle'
  };
}

app.get('/api/ingestion-status', (req, res) => {
  res.json(global._ingestionStatus);
});


// ── Phase 1C Admin Routes ──────────────────────────────────────────────────────

// POST /api/admin/backfill-distress
// Backfills distress_types + distress_score on all leads missing them
app.post('/api/admin/backfill-distress', requireAdmin, (req, res) => {
  try {
    const result = db.backfillDistress();
    global._ingestionStatus.last_run = new Date().toISOString();
    global._ingestionStatus.last_run_source = 'backfill-distress';
    res.json({ ok: true, ...result });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/backfill-normalized-address
// Backfills normalized_address on all leads missing it
app.post('/api/admin/backfill-normalized-address', requireAdmin, (req, res) => {
  try {
    const result = db.backfillNormalizedAddress();
    res.json({ ok: true, ...result });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ── Phase 2A Admin Routes ──────────────────────────────────────────────────────

// POST /api/admin/test-ingest/cook-tax
// Tiny admin-only Cook County tax delinquency ingestion smoke test.
app.post('/api/admin/test-ingest/cook-tax', requireAdmin, async (req, res) => {
  try {
    const rawLimit = req.body && req.body.limit;
    const parsedLimit = parseInt(rawLimit, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 3)
      : 1;
    const commit = req.body && req.body.commit === true;
    const socrataExtra = require('./modules/sources/socrata-extra');

    if (!socrataExtra.runCookCountyTaxTest) {
      return res.status(500).json({
        ok: false,
        error: 'Cook County tax test helper is not available'
      });
    }

    const result = await socrataExtra.runCookCountyTaxTest(limit, { commit: commit });
    res.json(result);
  } catch(e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/test-ingest/wayne-tax
// Tiny admin-only Wayne County tax foreclosure XLSX ingestion smoke test.
app.post('/api/admin/test-ingest/wayne-tax', requireAdmin, async (req, res) => {
  try {
    const rawLimit = req.body && req.body.limit;
    const parsedLimit = parseInt(rawLimit, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 3)
      : 1;
    const commit = req.body && req.body.commit === true;
    const wayneTax = require('./modules/sources/wayne-tax');

    if (!wayneTax.runWayneTaxTest) {
      return res.status(500).json({
        ok: false,
        error: 'Wayne County tax test helper is not available'
      });
    }

    const result = await wayneTax.runWayneTaxTest(limit, { commit: commit });
    res.json(result);
  } catch(e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin/duplicates', requireAdmin, (req, res) => {
  try {
    const result = db.detectDuplicates();
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/admin/backfill-activity', requireAdmin, (req, res) => {
  try {
    const result = db.backfillActivityFields();
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/admin/backfill-duplicate-groups', requireAdmin, (req, res) => {
  try {
    const result = db.backfillDuplicateGroups();
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/buyers', requireAdmin, (req, res) => {
  try {
    const buyer = db.addBuyer(req.body || {});
    res.json(buyer);
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/admin/consolidate-duplicates', requireAdmin, (req, res) => {
  try {
    const result = db.consolidateDuplicates();
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Phase 3A Enrichment Routes ───────────────────────────────────────────────

// POST /api/leads/:id/enrich-owner — queue a lead for owner enrichment
app.post('/api/leads/:id/enrich-owner', requireAdmin, (req, res) => {
  try {
    const lead = db.getLeads().find(l => l.id === req.params.id);
    if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found' });
    if (lead.archived) return res.status(400).json({ ok: false, error: 'Cannot enrich archived lead' });
    const allowed = ['none','failed','complete'];
    if (!allowed.includes(lead.enrichment_status)) {
      return res.status(400).json({ ok: false, error: 'Lead already ' + lead.enrichment_status });
    }
    // Increment attempts before queuing
    db.updateEnrichmentStatus(req.params.id, {
      enrichment_attempts: (lead.enrichment_attempts || 0) + 1,
      last_enrichment_attempt: new Date().toISOString()
    });
    const result = enrichQ.enqueue(req.params.id);
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/admin/enrichment-queue — view queue status
app.get('/api/admin/enrichment-queue', requireAdmin, (req, res) => {
  try { res.json({ ok: true, ...enrichQ.getStatus() }); }
  catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/admin/backfill-enrichment — stamp enrichment fields on existing leads
app.post('/api/admin/backfill-enrichment', requireAdmin, (req, res) => {
  try {
    const result = db.backfillEnrichmentFields();
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});


// ── Phase 3C Routes ────────────────────────────────────────────────────────────

// POST /api/admin/enrich-batch — enrich up to 25 active leads per call
app.post('/api/admin/enrich-batch', requireAdmin, (req, res) => {
  try {
    const MAX_BATCH    = 25;
    const qStatus      = enrichQ.getStatus();
    // Concurrency guard: don't flood queue
    if (qStatus.queue_length >= 50) {
      return res.status(429).json({ ok:false, error:'Queue busy — ' + qStatus.queue_length + ' items pending' });
    }
    const available    = MAX_BATCH - qStatus.queue_length;
    if (available <= 0) return res.json({ ok:true, queued:0, reason:'queue_near_capacity' });

    const source_filter = req.body && req.body.source ? req.body.source : null;
    const skip_complete = req.body && req.body.skip_complete !== false; // default true

    const leads = db.getLeads()
      .filter(l => {
        if (l.archived) return false;
        if (skip_complete && l.enrichment_status === 'complete') return false;
        if (['queued','in_progress'].includes(l.enrichment_status)) return false;
        if (source_filter && l.source !== source_filter) return false;
        return true;
      })
      .slice(0, available);

    var queued = 0, skipped = 0;
    leads.forEach(l => {
      // Increment attempts before queuing
      db.updateEnrichmentStatus(l.id, {
        enrichment_attempts: (l.enrichment_attempts || 0) + 1,
        last_enrichment_attempt: new Date().toISOString()
      });
      const r = enrichQ.enqueue(l.id);
      if (r.queued) queued++; else skipped++;
    });

    const batchTotal = db.getLeads().filter(l=>!l.archived).length;
    res.json({ ok:true, scanned:leads.length, queued, skipped, failed:0, queue_length: enrichQ.getStatus().queue_length, total_active:batchTotal });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/leads/:id/matching-buyers — basic deterministic buyer match
app.get('/api/leads/:id/matching-buyers', (req, res) => {
  try {
    const lead   = db.getLeads().find(l => l.id === req.params.id);
    if (!lead) return res.status(404).json({ ok:false, error:'Lead not found' });
    const buyers = db.getBuyers().filter(b => b.status === 'Active');
    const matched = buyers.filter(b => {
      // Market match: buyer.markets[] contains lead city or state
      var markets = b.markets || b.target_markets || [];
      var cityMatch  = !markets.length || markets.some(m =>
        (lead.city  || '').toLowerCase().includes(m.toLowerCase()) ||
        (lead.state || '').toLowerCase().includes(m.toLowerCase())
      );
      // Distress threshold
      var distressOk = !b.min_distress_score || (lead.distress_score || 0) >= b.min_distress_score;
      // Max price
      var priceOk = !b.max_price || (lead.arv || 0) <= b.max_price;
      // Owner type preference (optional filter)
      var ownerOk = !b.preferred_owner_types || !b.preferred_owner_types.length ||
                    b.preferred_owner_types.includes(lead.owner_type);
      return cityMatch && distressOk && priceOk && ownerOk;
    }).map(b => ({
      id: b.id, name: b.name, phone: b.phone,
      markets: b.markets || b.target_markets || [],
      max_price: b.max_price, min_distress_score: b.min_distress_score
    }));
    res.json({ ok:true, lead_id:req.params.id, matches:matched.length, buyers:matched });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

app.listen(PORT, () => {
  logger.info('WholesaleOS server running on port ' + PORT);
  // Phase 3B: restore queued enrichment jobs from db.json after restart
  try { enrichQ.restoreQueue(); } catch(e) { logger.error('enrichQ restore error: ' + e.message); }
});
