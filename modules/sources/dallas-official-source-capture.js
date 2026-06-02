const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dallasSourceAgent = require('./dallas-source-agent');
const browserFileEvidenceAdapter = require('./dallas-browser-file-evidence-adapter');
const controlledBrowserCapture = require('./dallas-controlled-browser-capture');
const realFileParser = require('./dallas-real-file-parser');
const codeViolationsAdapter = require('./dallas-code-violations-adapter');
const foreclosureNoticeAdapter = require('./dallas-foreclosure-notice-adapter');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'dallas-source-candidates.json');
const MAX_RUN_CANDIDATES = 10;
const MAX_STORED_CANDIDATES = 200;
const PRIMARY_SOURCE_ID = 'tx_dallas_sheriff_tax_sales';
const SECONDARY_SOURCE_ID = 'tx_dallas_county_clerk_foreclosure_notices';
const CODE_VIOLATIONS_SOURCE_ID = 'tx_dallas_code_violations_socrata';
const CODE_VIOLATIONS_SOURCE_IDS = new Set([CODE_VIOLATIONS_SOURCE_ID, 'tx_dallas_code_violations']);

const EMPTY_STORE = {
  version: '1.0.0',
  market: { county: 'Dallas', state: 'TX' },
  updated_at: null,
  last_run: null,
  counts: emptyCounts(),
  candidates: []
};

const JUNK_TEXT_RE = /\b(public information request|phone directory|contact us|page not found|error 404|privacy policy|terms of use|directory|newsletter|calendar)\b/i;
const STREET_RE = /\b\d{1,6}\s+[A-Za-z0-9.'# -]{2,}\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pkwy|parkway|pl|place|trl|trail|way|loop|ter|terrace|hwy|highway)\b/i;

function nowIso() {
  return new Date().toISOString();
}

function emptyCounts() {
  return {
    total_candidates: 0,
    research_ready: 0,
    source_repair_needed: 0,
    invalid_junk: 0,
    missing_address: 0,
    with_sale_date: 0,
    with_amount: 0,
    with_parcel: 0,
    with_source_url: 0,
    evidence_links_found: 0,
    files_pages_checked: 0,
    candidates_extracted: 0,
    browser_capture_attempted: false,
    browser_pages_checked: 0,
    browser_links_followed: 0,
    visible_tables_found: 0,
    visible_text_blocks_checked: 0,
    file_parser_attempted: false,
    files_detected: 0,
    pdf_files_detected: 0,
    csv_files_detected: 0,
    xlsx_files_detected: 0,
    files_parsed: 0,
    files_blocked: 0,
    file_text_blocks_checked: 0,
    file_rows_checked: 0,
    code_violations_attempted: false,
    code_violation_rows_checked: 0,
    code_violation_candidates_extracted: 0,
    code_violation_active_rows_checked: 0,
    code_violation_recent_rows_checked: 0,
    code_violation_research_ready: 0,
    code_violation_source_repair_needed: 0,
    code_violation_closed_old_count: 0,
    code_violation_fallback_used: false,
    foreclosure_notices_attempted: false,
    foreclosure_notice_rows_checked: 0,
    foreclosure_notice_candidates_extracted: 0,
    foreclosure_notice_research_ready: 0,
    foreclosure_notice_source_repair_needed: 0,
    foreclosure_notice_blocked: 0,
    foreclosure_notice_files_checked: 0
  };
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function firstValue() {
  for (const value of arguments) {
    if (value === 0) return value;
    if (value !== undefined && value !== null && cleanText(value)) return value;
  }
  return '';
}

function asNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function countNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeId(value) {
  return crypto.createHash('sha1').update(cleanText(value) || crypto.randomUUID()).digest('hex').slice(0, 16);
}

function ensureStoreDir(storePath = STORE_PATH) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
}

function atomicWriteJson(filePath, payload) {
  ensureStoreDir(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
}

function readStore(storePath = STORE_PATH) {
  try {
    if (!fs.existsSync(storePath)) return Object.assign({}, EMPTY_STORE, { counts: emptyCounts(), candidates: [] });
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    return Object.assign({}, EMPTY_STORE, parsed || {}, {
      market: Object.assign({}, EMPTY_STORE.market, parsed && parsed.market),
      counts: Object.assign(emptyCounts(), parsed && parsed.counts),
      candidates: Array.isArray(parsed && parsed.candidates) ? parsed.candidates : []
    });
  } catch (error) {
    return Object.assign({}, EMPTY_STORE, {
      counts: emptyCounts(),
      candidates: [],
      read_error: error.message
    });
  }
}

function writeStore(store, storePath = STORE_PATH) {
  const normalized = Object.assign({}, EMPTY_STORE, store || {}, {
    market: { county: 'Dallas', state: 'TX' },
    updated_at: nowIso(),
    counts: summarizeCandidates(Array.isArray(store && store.candidates) ? store.candidates : []),
    candidates: Array.isArray(store && store.candidates) ? store.candidates.slice(0, MAX_STORED_CANDIDATES) : []
  });
  atomicWriteJson(storePath, normalized);
  return normalized;
}

function classifyAddressQuality(candidate) {
  const text = cleanText(firstValue(candidate.property_address, candidate.address, candidate.source_proof_text, candidate.source_reference));
  const city = cleanText(candidate.city);
  const state = cleanText(candidate.state || 'TX');
  const county = cleanText(candidate.county || 'Dallas');
  if (!text) return 'missing';
  if (JUNK_TEXT_RE.test(text)) return 'junk';
  if (!STREET_RE.test(text)) return 'partial';
  if (!/^(tx|texas)$/i.test(state)) return 'partial';
  if (!/dallas/i.test(`${city} ${text}`) && !/\b75[23]\d{2}\b/.test(text)) return 'partial';
  return 'valid';
}

function sourceEvidenceStatus(candidate) {
  const sourceUrl = cleanText(firstValue(candidate.source_proof_url, candidate.source_record_url, candidate.source_url));
  const proofText = cleanText(firstValue(candidate.source_proof_text, candidate.source_reference, candidate.case_number, candidate.parcel_id));
  if (!sourceUrl) return 'missing';
  if (!proofText || proofText === sourceUrl) return 'needs_repair';
  return 'found';
}

function propertyIdentityStatus(addressQuality, sourceStatus) {
  if (addressQuality === 'junk') return 'junk_address_blocked';
  if (addressQuality === 'missing') return 'unresolved';
  if (addressQuality === 'partial') return sourceStatus === 'found' ? 'partial' : 'needs_source_repair';
  return sourceStatus === 'found' ? 'resolved' : 'partial';
}

function workflowStatus(addressQuality, sourceStatus, identityStatus) {
  if (addressQuality === 'junk') return 'Invalid/Junk';
  if (addressQuality === 'missing') return 'Source Repair Needed';
  if (addressQuality === 'partial' || identityStatus === 'needs_source_repair') return 'Source Repair Needed';
  if (sourceStatus !== 'found') return 'Source Repair Needed';
  return 'Research Ready';
}

function nextActionFor(status, addressQuality, sourceStatus) {
  if (status === 'Research Ready') return 'Review source proof, then send to AI Deal Analyzer for source and comp research.';
  if (status === 'Invalid/Junk') return 'Block from comps. Use the source page only if it helps repair a real property identity.';
  if (addressQuality === 'missing') return 'Find the property address from the official source before comps.';
  if (addressQuality === 'partial') return 'Add Dallas city/state or repair the address from the source record before comps.';
  if (sourceStatus === 'missing') return 'Open the official source and save source proof before outreach.';
  return 'Repair source/property identity before comps.';
}

function sourceTypeFor(source) {
  const category = cleanText(source.source_category).toLowerCase();
  if (/foreclosure/.test(category)) return 'foreclosure_notice';
  if (/code_violation|code violation/.test(category)) return 'code_violation';
  if (/sheriff|tax_sale|tax sale/.test(`${source.source_id} ${category}`)) return 'sheriff_sale';
  if (/tax/.test(category)) return 'tax_foreclosure';
  return category || 'official_source';
}

function categoryFor(source) {
  const category = cleanText(source.source_category).toLowerCase();
  if (/foreclosure/.test(category)) return 'foreclosure_notice';
  if (/code_violation|code violation/.test(category)) return 'code_violation';
  if (/tax_sale|tax sale|sheriff/.test(`${source.source_id} ${category}`)) return 'sheriff_sale';
  if (/tax/.test(category)) return 'tax_foreclosure';
  return category || 'official_source';
}

function missingEvidence(candidate) {
  const missing = [];
  if (!cleanText(candidate.property_address)) missing.push('property address');
  if (!cleanText(candidate.source_proof_url)) missing.push('source proof URL');
  if (!cleanText(candidate.source_proof_text)) missing.push('source proof text');
  if (!cleanText(candidate.event_type)) missing.push('event type');
  if (!cleanText(firstValue(candidate.sale_date, candidate.auction_date, candidate.opened_date))) missing.push('sale or event date');
  if (!cleanText(firstValue(candidate.parcel_id, candidate.case_number, candidate.record_id))) missing.push('parcel, case, or record id');
  return Array.from(new Set(missing));
}

function normalizeCandidate(rawCandidate, source, index, capturedAt) {
  const evidence = rawCandidate && rawCandidate.evidence ? rawCandidate.evidence : {};
  const truth = rawCandidate && rawCandidate.source_truth ? rawCandidate.source_truth : {};
  const propertyAddress = cleanText(firstValue(rawCandidate.property_address, rawCandidate.address, rawCandidate.normalized_address));
  const sourceUrl = cleanText(firstValue(evidence.source_url, truth.source_url, rawCandidate.source_url, source.source_url));
  const proofUrl = cleanText(firstValue(evidence.source_record_url, truth.source_record_url, rawCandidate.source_record_url, sourceUrl));
  const sourceProofText = cleanText(firstValue(
    rawCandidate.source_proof_text,
    rawCandidate.source_reference,
    evidence.source_reference,
    truth.evidence_ref,
    rawCandidate.raw_text,
    rawCandidate.source_file_reference,
    rawCandidate.row_or_card_reference
  ));
  const amount = asNumber(firstValue(rawCandidate.opening_bid, rawCandidate.minimum_bid_amount, rawCandidate.tax_amount, rawCandidate.tax_due, rawCandidate.judgment_amount, rawCandidate.amount_owed));
  const normalized = {
    candidate_id: cleanText(rawCandidate.id || rawCandidate.preview_id || `DAL-${safeId(`${source.source_id}|${propertyAddress}|${proofUrl}|${index}`)}`),
    source_key: cleanText(source.source_id),
    source_name: cleanText(source.source_name),
    source_url: sourceUrl || null,
    source_type: sourceTypeFor(source),
    county: 'Dallas',
    state: 'TX',
    category: categoryFor(source),
    property_address: propertyAddress || null,
    city: cleanText(rawCandidate.city) || null,
    zip: cleanText(rawCandidate.zip) || null,
    parcel_id: cleanText(firstValue(rawCandidate.parcel_id, rawCandidate.parcel, rawCandidate.apn)) || null,
    case_number: cleanText(firstValue(rawCandidate.case_number, rawCandidate.cause_number)) || null,
    record_id: cleanText(rawCandidate.record_id) || null,
    owner_name: cleanText(rawCandidate.owner_name) || null,
    event_type: cleanText(firstValue(rawCandidate.event_type, categoryFor(source))) || null,
    violation_type: cleanText(rawCandidate.violation_type) || null,
    violation_status: cleanText(rawCandidate.violation_status) || null,
    opened_date: cleanText(rawCandidate.opened_date) || null,
    closed_date: cleanText(rawCandidate.closed_date) || null,
    sale_date: cleanText(rawCandidate.sale_date) || null,
    auction_date: cleanText(firstValue(rawCandidate.auction_date, rawCandidate.sale_date)) || null,
    opening_bid: asNumber(firstValue(rawCandidate.opening_bid, rawCandidate.minimum_bid_amount)) || null,
    tax_amount: asNumber(firstValue(rawCandidate.tax_amount, rawCandidate.tax_due, rawCandidate.amount_owed)) || null,
    judgment_amount: asNumber(rawCandidate.judgment_amount) || null,
    source_proof_text: sourceProofText || null,
    source_proof_url: proofUrl || sourceUrl || null,
    captured_at: cleanText(firstValue(rawCandidate.captured_at, evidence.captured_at, capturedAt)) || capturedAt,
    confidence: cleanText(firstValue(rawCandidate.extraction_confidence, rawCandidate.source_confidence, truth.confidence, rawCandidate.actionability_status, 'Low')),
    candidate_priority_score: rawCandidate.candidate_priority_score == null ? null : Number(rawCandidate.candidate_priority_score),
    recency_score: rawCandidate.recency_score == null ? null : Number(rawCandidate.recency_score),
    status_score: rawCandidate.status_score == null ? null : Number(rawCandidate.status_score),
    distress_signal_strength: cleanText(rawCandidate.distress_signal_strength) || null,
    is_active_or_open: rawCandidate.is_active_or_open === true,
    is_recent: rawCandidate.is_recent === true,
    is_closed_old: rawCandidate.is_closed_old === true,
    should_ingest: false,
    preview_only: true,
    missing_evidence: [],
    next_action: ''
  };
  const addressQuality = classifyAddressQuality(normalized);
  const sourceStatus = sourceEvidenceStatus(normalized);
  let identityStatus = propertyIdentityStatus(addressQuality, sourceStatus);
  let status = workflowStatus(addressQuality, sourceStatus, identityStatus);
  const rawWorkflowStatus = cleanText(rawCandidate.workflow_status);
  if (rawWorkflowStatus === 'Invalid/Junk' || rawWorkflowStatus === 'Source Repair Needed') {
    status = rawWorkflowStatus;
  }
  const rawIdentityStatus = cleanText(rawCandidate.property_identity_status);
  if (rawIdentityStatus === 'junk_address_blocked' || rawIdentityStatus === 'needs_source_repair' || rawIdentityStatus === 'partial') {
    identityStatus = rawIdentityStatus;
  }
  normalized.address_quality = addressQuality;
  normalized.source_evidence_status = sourceStatus;
  normalized.property_identity_status = identityStatus;
  normalized.workflow_status = status;
  normalized.comps_status = status === 'Research Ready' ? 'Comps Blocked until verified sold comps exist' : 'Comps Blocked';
  normalized.next_action = nextActionFor(status, addressQuality, sourceStatus);
  normalized.missing_evidence = missingEvidence(normalized);
  normalized.source_agent_status = rawCandidate.actionability_status || null;
  normalized.source_agent_score = rawCandidate.actionability_score || rawCandidate.source_agent_actionability_score || null;
  normalized.source_agent_queue = rawCandidate.source_agent_queue || null;
  normalized.raw_preview_id = rawCandidate.preview_id || rawCandidate.id || null;
  if (!amount) return normalized;
  if (!normalized.opening_bid && /bid/i.test(cleanText(firstValue(rawCandidate.minimum_bid_amount, rawCandidate.opening_bid)))) normalized.opening_bid = amount;
  return normalized;
}

function dedupeKey(candidate) {
  return [
    cleanText(candidate.property_address).toLowerCase(),
    cleanText(candidate.source_proof_url || candidate.source_url).toLowerCase(),
    cleanText(firstValue(candidate.sale_date, candidate.auction_date)).toLowerCase(),
    cleanText(firstValue(candidate.case_number, candidate.parcel_id, candidate.record_id)).toLowerCase()
  ].filter(Boolean).join('|') || candidate.candidate_id;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    const key = dedupeKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function summarizeCandidates(candidates) {
  const counts = emptyCounts();
  const list = Array.isArray(candidates) ? candidates : [];
  counts.total_candidates = list.length;
  for (const candidate of list) {
    if (candidate.workflow_status === 'Research Ready') counts.research_ready += 1;
    if (candidate.workflow_status === 'Source Repair Needed') counts.source_repair_needed += 1;
    if (candidate.workflow_status === 'Invalid/Junk') counts.invalid_junk += 1;
    if (candidate.address_quality === 'missing') counts.missing_address += 1;
    if (cleanText(firstValue(candidate.sale_date, candidate.auction_date))) counts.with_sale_date += 1;
    if (candidate.opening_bid || candidate.tax_amount || candidate.judgment_amount) counts.with_amount += 1;
    if (cleanText(candidate.parcel_id)) counts.with_parcel += 1;
    if (cleanText(firstValue(candidate.source_proof_url, candidate.source_url))) counts.with_source_url += 1;
  }
  return counts;
}

function summarizeRunEvidence(lastRun) {
  const summary = emptyCounts();
  const results = Array.isArray(lastRun && lastRun.results) ? lastRun.results : [];
  for (const result of results) {
    summary.evidence_links_found += countNumber(result.evidence_links_found);
    summary.files_pages_checked += countNumber(result.files_pages_checked || result.files_pages_attempted);
    const extractedCandidates = countNumber(result.adapter_candidate_count) + countNumber(result.file_parser_candidate_count) + countNumber(result.browser_candidate_count);
    summary.candidates_extracted += extractedCandidates || countNumber(result.candidate_count);
    if (result.browser_capture_attempted === true) summary.browser_capture_attempted = true;
    summary.browser_pages_checked += countNumber(result.browser_pages_checked);
    summary.browser_links_followed += countNumber(result.browser_links_followed);
    summary.visible_tables_found += countNumber(result.visible_tables_found);
    summary.visible_text_blocks_checked += countNumber(result.visible_text_blocks_checked);
    if (result.file_parser_attempted === true) summary.file_parser_attempted = true;
    summary.files_detected += countNumber(result.files_detected);
    summary.pdf_files_detected += countNumber(result.pdf_files_detected);
    summary.csv_files_detected += countNumber(result.csv_files_detected);
    summary.xlsx_files_detected += countNumber(result.xlsx_files_detected);
    summary.files_parsed += countNumber(result.files_parsed);
    summary.files_blocked += countNumber(result.files_blocked);
    summary.file_text_blocks_checked += countNumber(result.file_text_blocks_checked);
    summary.file_rows_checked += countNumber(result.file_rows_checked);
    if (result.code_violations_attempted === true) summary.code_violations_attempted = true;
    summary.code_violation_rows_checked += countNumber(result.code_violation_rows_checked);
    summary.code_violation_candidates_extracted += countNumber(result.code_violation_candidates_extracted);
    summary.code_violation_active_rows_checked += countNumber(result.code_violation_active_rows_checked);
    summary.code_violation_recent_rows_checked += countNumber(result.code_violation_recent_rows_checked);
    summary.code_violation_research_ready += countNumber(result.code_violation_research_ready);
    summary.code_violation_source_repair_needed += countNumber(result.code_violation_source_repair_needed);
    summary.code_violation_closed_old_count += countNumber(result.code_violation_closed_old_count);
    if (result.code_violation_fallback_used === true) summary.code_violation_fallback_used = true;
    if (result.foreclosure_notices_attempted === true) summary.foreclosure_notices_attempted = true;
    summary.foreclosure_notice_rows_checked += countNumber(result.foreclosure_notice_rows_checked);
    summary.foreclosure_notice_candidates_extracted += countNumber(result.foreclosure_notice_candidates_extracted);
    summary.foreclosure_notice_research_ready += countNumber(result.foreclosure_notice_research_ready);
    summary.foreclosure_notice_source_repair_needed += countNumber(result.foreclosure_notice_source_repair_needed);
    summary.foreclosure_notice_blocked += countNumber(result.foreclosure_notice_blocked);
    summary.foreclosure_notice_files_checked += countNumber(result.foreclosure_notice_files_checked);
  }
  return summary;
}

function combineCandidateAndRunCounts(candidateCounts, runCounts) {
  const candidate = Object.assign(emptyCounts(), candidateCounts || {});
  const run = Object.assign(emptyCounts(), runCounts || {});
  return Object.assign(emptyCounts(), candidate, run, {
    total_candidates: candidate.total_candidates,
    research_ready: candidate.research_ready,
    source_repair_needed: candidate.source_repair_needed,
    invalid_junk: candidate.invalid_junk,
    missing_address: candidate.missing_address,
    with_sale_date: candidate.with_sale_date,
    with_amount: candidate.with_amount,
    with_parcel: candidate.with_parcel,
    with_source_url: candidate.with_source_url
  });
}

function sourceIdsFromOptions(options = {}) {
  if (Array.isArray(options.source_ids) && options.source_ids.length) return options.source_ids.map(cleanText).filter(Boolean);
  if (options.source_id || options.sourceId) return [cleanText(options.source_id || options.sourceId)];
  const ids = [PRIMARY_SOURCE_ID];
  if (options.include_secondary === true || options.includeSecondary === true) ids.push(SECONDARY_SOURCE_ID);
  if (options.include_foreclosure_notices === true || options.includeForeclosureNotices === true) ids.push(SECONDARY_SOURCE_ID);
  if (options.include_code_violations === true || options.includeCodeViolations === true) ids.push(CODE_VIOLATIONS_SOURCE_ID);
  return Array.from(new Set(ids));
}

async function runOfficialSourceCapture(options = {}) {
  const capturedAt = nowIso();
  const maxCandidates = Math.max(1, Math.min(Number(options.max_candidates || options.maxCandidates || MAX_RUN_CANDIDATES) || MAX_RUN_CANDIDATES, MAX_RUN_CANDIDATES));
  const sourceIds = sourceIdsFromOptions(options).filter((sourceId) => sourceId === PRIMARY_SOURCE_ID || sourceId === SECONDARY_SOURCE_ID || CODE_VIOLATIONS_SOURCE_IDS.has(sourceId));
  const warnings = [];
  const errors = [];
  const runResults = [];
  let normalizedCandidates = [];
  let totalEvidenceLinksFound = 0;
  let totalFilesPagesChecked = 0;
  let totalAdapterCandidates = 0;
  let fileParserAttempted = false;
  let totalFilesDetected = 0;
  let totalPdfFilesDetected = 0;
  let totalCsvFilesDetected = 0;
  let totalXlsxFilesDetected = 0;
  let totalFilesParsed = 0;
  let totalFilesBlocked = 0;
  let totalFileTextBlocksChecked = 0;
  let totalFileRowsChecked = 0;
  let browserCaptureAttempted = false;
  let totalBrowserPagesChecked = 0;
  let totalBrowserLinksFollowed = 0;
  let totalVisibleTablesFound = 0;
  let totalVisibleTextBlocksChecked = 0;
  let codeViolationsAttempted = false;
  let totalCodeViolationRowsChecked = 0;
  let totalCodeViolationCandidatesExtracted = 0;
  let totalCodeViolationActiveRowsChecked = 0;
  let totalCodeViolationRecentRowsChecked = 0;
  let totalCodeViolationResearchReady = 0;
  let totalCodeViolationSourceRepairNeeded = 0;
  let totalCodeViolationClosedOldCount = 0;
  let codeViolationFallbackUsed = false;
  let foreclosureNoticesAttempted = false;
  let totalForeclosureNoticeRowsChecked = 0;
  let totalForeclosureNoticeCandidatesExtracted = 0;
  let totalForeclosureNoticeResearchReady = 0;
  let totalForeclosureNoticeSourceRepairNeeded = 0;
  let totalForeclosureNoticeBlocked = 0;
  let totalForeclosureNoticeFilesChecked = 0;

  for (const sourceId of sourceIds.length ? sourceIds : [PRIMARY_SOURCE_ID]) {
    const source = dallasSourceAgent.findSource(sourceId);
    if (!source) {
      errors.push({ source_id: sourceId, message: 'Dallas official source is not registered.' });
      continue;
    }
    try {
      if (CODE_VIOLATIONS_SOURCE_IDS.has(sourceId)) {
        const codeResult = await codeViolationsAdapter.runDallasCodeViolationsAdapter({
          source,
          source_url: source.source_url,
          max_rows: options.max_code_violation_rows || options.maxCodeViolationRows || options.max_candidates || options.maxCandidates || 25,
          timeout_ms: options.timeout_ms || options.timeout || 10000,
          captured_at: capturedAt
        });
        const codeCandidates = codeResult && Array.isArray(codeResult.candidates) ? codeResult.candidates : [];
        codeViolationsAttempted = true;
        totalCodeViolationRowsChecked += countNumber(codeResult && codeResult.code_violation_rows_checked);
        totalCodeViolationCandidatesExtracted += codeCandidates.length;
        totalCodeViolationActiveRowsChecked += countNumber(codeResult && codeResult.code_violation_active_rows_checked);
        totalCodeViolationRecentRowsChecked += countNumber(codeResult && codeResult.code_violation_recent_rows_checked);
        totalCodeViolationResearchReady += countNumber(codeResult && codeResult.code_violation_research_ready);
        totalCodeViolationSourceRepairNeeded += countNumber(codeResult && codeResult.code_violation_source_repair_needed);
        totalCodeViolationClosedOldCount += countNumber(codeResult && codeResult.code_violation_closed_old_count);
        if (codeResult && codeResult.code_violation_fallback_used === true) codeViolationFallbackUsed = true;
        totalAdapterCandidates += codeCandidates.length;
        normalizedCandidates = normalizedCandidates.concat(codeCandidates.map((candidate, index) => normalizeCandidate(candidate, source, index, capturedAt)));
        if (!codeCandidates.length) {
          warnings.push({
            source_id: sourceId,
            message: (codeResult && codeResult.blocked_reason) || 'No Dallas OpenData code violation candidates found in the capped sample.'
          });
        }
        runResults.push({
          source_id: sourceId,
          source_name: source.source_name,
          status: codeResult && codeResult.status || 'unknown',
          reason: codeResult && codeResult.blocked_reason || '',
          candidate_count: codeCandidates.length,
          adapter_candidate_count: codeCandidates.length,
          code_violations_attempted: true,
          code_violation_rows_checked: countNumber(codeResult && codeResult.code_violation_rows_checked),
          code_violation_candidates_extracted: codeCandidates.length,
          code_violation_active_rows_checked: countNumber(codeResult && codeResult.code_violation_active_rows_checked),
          code_violation_recent_rows_checked: countNumber(codeResult && codeResult.code_violation_recent_rows_checked),
          code_violation_research_ready: countNumber(codeResult && codeResult.code_violation_research_ready),
          code_violation_source_repair_needed: countNumber(codeResult && codeResult.code_violation_source_repair_needed),
          code_violation_closed_old_count: countNumber(codeResult && codeResult.code_violation_closed_old_count),
          code_violation_fallback_used: codeResult && codeResult.code_violation_fallback_used === true,
          source_url: source.source_url,
          manual_required: false
        });
        continue;
      }
      if (sourceId === SECONDARY_SOURCE_ID && (options.include_foreclosure_notices === true || options.includeForeclosureNotices === true || options.include_secondary === true || options.includeSecondary === true || cleanText(options.source_id || options.sourceId) === SECONDARY_SOURCE_ID || (Array.isArray(options.source_ids) && options.source_ids.includes(SECONDARY_SOURCE_ID)))) {
        const foreclosureResult = await foreclosureNoticeAdapter.runDallasForeclosureNoticeAdapter({
          source,
          source_url: source.source_url,
          max_rows: options.max_foreclosure_notice_rows || options.maxForeclosureNoticeRows || options.max_candidates || options.maxCandidates || 25,
          max_files: options.max_foreclosure_files || options.maxForeclosureFiles || options.max_files || options.maxFiles || 6,
          timeout_ms: options.timeout_ms || options.timeout || 10000,
          captured_at: capturedAt
        });
        const foreclosureCandidates = foreclosureResult && Array.isArray(foreclosureResult.candidates) ? foreclosureResult.candidates : [];
        foreclosureNoticesAttempted = true;
        totalForeclosureNoticeRowsChecked += countNumber(foreclosureResult && foreclosureResult.foreclosure_notice_rows_checked);
        totalForeclosureNoticeCandidatesExtracted += foreclosureCandidates.length;
        totalForeclosureNoticeResearchReady += countNumber(foreclosureResult && foreclosureResult.foreclosure_notice_research_ready);
        totalForeclosureNoticeSourceRepairNeeded += countNumber(foreclosureResult && foreclosureResult.foreclosure_notice_source_repair_needed);
        totalForeclosureNoticeBlocked += countNumber(foreclosureResult && foreclosureResult.foreclosure_notice_blocked);
        totalForeclosureNoticeFilesChecked += countNumber(foreclosureResult && foreclosureResult.foreclosure_notice_files_checked);
        totalEvidenceLinksFound += countNumber(foreclosureResult && foreclosureResult.evidence_links_found);
        totalFilesDetected += countNumber(foreclosureResult && foreclosureResult.files_detected);
        totalFilesParsed += countNumber(foreclosureResult && foreclosureResult.files_parsed);
        totalFilesBlocked += countNumber(foreclosureResult && foreclosureResult.files_blocked);
        totalFileRowsChecked += countNumber(foreclosureResult && foreclosureResult.file_rows_checked);
        totalAdapterCandidates += foreclosureCandidates.length;
        normalizedCandidates = normalizedCandidates.concat(foreclosureCandidates.map((candidate, index) => normalizeCandidate(candidate, source, index, capturedAt)));
        if (!foreclosureCandidates.length) {
          warnings.push({
            source_id: sourceId,
            message: (foreclosureResult && foreclosureResult.blocked_reason) || 'No Dallas County Clerk foreclosure notice candidates found in the capped check.'
          });
        }
        runResults.push({
          source_id: sourceId,
          source_name: source.source_name,
          status: foreclosureResult && foreclosureResult.status || 'unknown',
          reason: foreclosureResult && foreclosureResult.blocked_reason || '',
          candidate_count: foreclosureCandidates.length,
          adapter_candidate_count: foreclosureCandidates.length,
          foreclosure_notices_attempted: true,
          foreclosure_notice_rows_checked: countNumber(foreclosureResult && foreclosureResult.foreclosure_notice_rows_checked),
          foreclosure_notice_candidates_extracted: foreclosureCandidates.length,
          foreclosure_notice_research_ready: countNumber(foreclosureResult && foreclosureResult.foreclosure_notice_research_ready),
          foreclosure_notice_source_repair_needed: countNumber(foreclosureResult && foreclosureResult.foreclosure_notice_source_repair_needed),
          foreclosure_notice_blocked: countNumber(foreclosureResult && foreclosureResult.foreclosure_notice_blocked),
          foreclosure_notice_files_checked: countNumber(foreclosureResult && foreclosureResult.foreclosure_notice_files_checked),
          evidence_links_found: countNumber(foreclosureResult && foreclosureResult.evidence_links_found),
          files_detected: countNumber(foreclosureResult && foreclosureResult.files_detected),
          files_parsed: countNumber(foreclosureResult && foreclosureResult.files_parsed),
          files_blocked: countNumber(foreclosureResult && foreclosureResult.files_blocked),
          file_rows_checked: countNumber(foreclosureResult && foreclosureResult.file_rows_checked),
          source_url: source.source_url,
          manual_required: !foreclosureCandidates.length
        });
        continue;
      }
      const result = await dallasSourceAgent.runDallasSourceAgent({
        source_id: sourceId,
        max_candidates: maxCandidates,
        timeout_ms: options.timeout_ms || options.timeout || 10000,
        preview_only: true,
        dry_run: true,
        operator_triggered_only: true,
        no_loop: true,
        captured_at: capturedAt
      });
      const candidates = result && result.batch && Array.isArray(result.batch.candidates) ? result.batch.candidates : [];
      const evidenceLinks = result && result.batch && result.batch.source_agent && Array.isArray(result.batch.source_agent.evidence_links)
        ? result.batch.source_agent.evidence_links
        : [];
      let adapterResult = null;
      if (!candidates.length || evidenceLinks.length) {
        adapterResult = await browserFileEvidenceAdapter.runDallasBrowserFileEvidenceAdapter({
          source,
          source_url: source.source_url,
          evidence_links: evidenceLinks,
          max_candidates: maxCandidates,
          timeout_ms: options.timeout_ms || options.timeout || 10000,
          captured_at: capturedAt
        });
      }
      const adapterCandidates = adapterResult && Array.isArray(adapterResult.candidates) ? adapterResult.candidates : [];
      const parserLinks = [].concat(evidenceLinks, adapterResult && Array.isArray(adapterResult.discovered_links) ? adapterResult.discovered_links : []);
      let fileParserResult = null;
      if (!candidates.length && parserLinks.length) {
        fileParserResult = await realFileParser.runDallasRealFileParser({
          source,
          source_url: source.source_url,
          evidence_links: parserLinks,
          max_candidates: maxCandidates,
          max_files: options.max_files || options.maxFiles || 8,
          timeout_ms: options.timeout_ms || options.timeout || 10000,
          captured_at: capturedAt
        });
      }
      const fileParserCandidates = fileParserResult && Array.isArray(fileParserResult.candidates) ? fileParserResult.candidates : [];
      let browserResult = null;
      if (!candidates.length && !adapterCandidates.length && !fileParserCandidates.length) {
        browserResult = await controlledBrowserCapture.runDallasControlledBrowserCapture({
          source,
          source_url: source.source_url,
          evidence_links: evidenceLinks,
          max_candidates: maxCandidates,
          max_pages: options.max_browser_pages || options.maxBrowserPages || 8,
          timeout_ms: options.timeout_ms || options.timeout || 10000,
          captured_at: capturedAt
        });
      }
      const browserCandidates = browserResult && Array.isArray(browserResult.candidates) ? browserResult.candidates : [];
      if (browserResult) browserCaptureAttempted = true;
      if (fileParserResult) fileParserAttempted = true;
      totalEvidenceLinksFound += Number(adapterResult && adapterResult.evidence_links_found || evidenceLinks.length || 0);
      totalFilesPagesChecked += Number(adapterResult && adapterResult.files_pages_attempted || 0);
      totalAdapterCandidates += adapterCandidates.length + fileParserCandidates.length + browserCandidates.length;
      totalFilesDetected += Number(fileParserResult && fileParserResult.files_detected || 0);
      totalPdfFilesDetected += Number(fileParserResult && fileParserResult.pdf_files_detected || 0);
      totalCsvFilesDetected += Number(fileParserResult && fileParserResult.csv_files_detected || 0);
      totalXlsxFilesDetected += Number(fileParserResult && fileParserResult.xlsx_files_detected || 0);
      totalFilesParsed += Number(fileParserResult && fileParserResult.files_parsed || 0);
      totalFilesBlocked += Number(fileParserResult && fileParserResult.files_blocked || 0);
      totalFileTextBlocksChecked += Number(fileParserResult && fileParserResult.file_text_blocks_checked || 0);
      totalFileRowsChecked += Number(fileParserResult && fileParserResult.file_rows_checked || 0);
      totalBrowserPagesChecked += Number(browserResult && browserResult.browser_pages_checked || 0);
      totalBrowserLinksFollowed += Number(browserResult && browserResult.browser_links_followed || 0);
      totalVisibleTablesFound += Number(browserResult && browserResult.visible_tables_found || 0);
      totalVisibleTextBlocksChecked += Number(browserResult && browserResult.visible_text_blocks_checked || 0);
      normalizedCandidates = normalizedCandidates.concat(candidates.map((candidate, index) => normalizeCandidate(candidate, source, index, capturedAt)));
      normalizedCandidates = normalizedCandidates.concat(adapterCandidates.map((candidate, index) => normalizeCandidate(candidate, source, candidates.length + index, capturedAt)));
      normalizedCandidates = normalizedCandidates.concat(fileParserCandidates.map((candidate, index) => normalizeCandidate(candidate, source, candidates.length + adapterCandidates.length + index, capturedAt)));
      normalizedCandidates = normalizedCandidates.concat(browserCandidates.map((candidate, index) => normalizeCandidate(candidate, source, candidates.length + adapterCandidates.length + fileParserCandidates.length + index, capturedAt)));
      if (!candidates.length && !adapterCandidates.length && !fileParserCandidates.length && !browserCandidates.length) {
        warnings.push({
          source_id: sourceId,
          message: (fileParserResult && fileParserResult.blocked_reason) || (browserResult && browserResult.blocked_reason) || (adapterResult && adapterResult.blocked_reason) || result.reason || 'No property-level candidates found. Source may need browser-assisted review.'
        });
      }
      runResults.push({
        source_id: sourceId,
        source_name: source.source_name,
        status: result.status || 'unknown',
        reason: result.reason || '',
        candidate_count: candidates.length + adapterCandidates.length + fileParserCandidates.length + browserCandidates.length,
        static_candidate_count: candidates.length,
        adapter_candidate_count: adapterCandidates.length,
        file_parser_candidate_count: fileParserCandidates.length,
        browser_candidate_count: browserCandidates.length,
        evidence_links_found: Number(adapterResult && adapterResult.evidence_links_found || evidenceLinks.length || 0),
        files_pages_checked: Number(adapterResult && adapterResult.files_pages_attempted || 0),
        adapter_status: adapterResult && adapterResult.status || '',
        adapter_blocked_reason: adapterResult && adapterResult.blocked_reason || '',
        file_parser_attempted: !!fileParserResult,
        files_detected: Number(fileParserResult && fileParserResult.files_detected || 0),
        pdf_files_detected: Number(fileParserResult && fileParserResult.pdf_files_detected || 0),
        csv_files_detected: Number(fileParserResult && fileParserResult.csv_files_detected || 0),
        xlsx_files_detected: Number(fileParserResult && fileParserResult.xlsx_files_detected || 0),
        files_parsed: Number(fileParserResult && fileParserResult.files_parsed || 0),
        files_blocked: Number(fileParserResult && fileParserResult.files_blocked || 0),
        file_text_blocks_checked: Number(fileParserResult && fileParserResult.file_text_blocks_checked || 0),
        file_rows_checked: Number(fileParserResult && fileParserResult.file_rows_checked || 0),
        file_parser_status: fileParserResult && fileParserResult.status || '',
        file_parser_blocked_reason: fileParserResult && fileParserResult.blocked_reason || '',
        browser_capture_attempted: !!browserResult,
        browser_pages_checked: Number(browserResult && browserResult.browser_pages_checked || 0),
        browser_links_followed: Number(browserResult && browserResult.browser_links_followed || 0),
        visible_tables_found: Number(browserResult && browserResult.visible_tables_found || 0),
        visible_text_blocks_checked: Number(browserResult && browserResult.visible_text_blocks_checked || 0),
        browser_status: browserResult && browserResult.status || '',
        browser_blocked_reason: browserResult && browserResult.blocked_reason || '',
        manual_required: result.manual_required === true,
        source_url: source.source_url
      });
    } catch (error) {
      errors.push({ source_id: sourceId, message: error.message || 'Source capture failed.' });
    }
  }

  const existingStore = readStore(options.storePath || STORE_PATH);
  const mergedCandidates = dedupeCandidates(normalizedCandidates.concat(existingStore.candidates || [])).slice(0, MAX_STORED_CANDIDATES);
  const lastRun = {
    run_id: `dallas-official-${safeId(capturedAt)}`,
    captured_at: capturedAt,
    source_ids: sourceIds,
    source_scope: 'Dallas County, TX official sources only',
    operator_triggered_only: true,
    preview_only: true,
    should_ingest: false,
    status: errors.length && !normalizedCandidates.length ? 'blocked_or_failed' : (normalizedCandidates.length ? 'candidates_found' : 'needs_browser_assist'),
    evidence_links_found: totalEvidenceLinksFound,
    files_pages_checked: totalFilesPagesChecked,
    candidates_extracted: totalAdapterCandidates,
    file_parser_attempted: fileParserAttempted,
    files_detected: totalFilesDetected,
    pdf_files_detected: totalPdfFilesDetected,
    csv_files_detected: totalCsvFilesDetected,
    xlsx_files_detected: totalXlsxFilesDetected,
    files_parsed: totalFilesParsed,
    files_blocked: totalFilesBlocked,
    file_text_blocks_checked: totalFileTextBlocksChecked,
    file_rows_checked: totalFileRowsChecked,
    browser_capture_attempted: browserCaptureAttempted,
    browser_pages_checked: totalBrowserPagesChecked,
    browser_links_followed: totalBrowserLinksFollowed,
    visible_tables_found: totalVisibleTablesFound,
    visible_text_blocks_checked: totalVisibleTextBlocksChecked,
    code_violations_attempted: codeViolationsAttempted,
    code_violation_rows_checked: totalCodeViolationRowsChecked,
    code_violation_candidates_extracted: totalCodeViolationCandidatesExtracted,
    code_violation_active_rows_checked: totalCodeViolationActiveRowsChecked,
    code_violation_recent_rows_checked: totalCodeViolationRecentRowsChecked,
    code_violation_research_ready: totalCodeViolationResearchReady,
    code_violation_source_repair_needed: totalCodeViolationSourceRepairNeeded,
    code_violation_closed_old_count: totalCodeViolationClosedOldCount,
    code_violation_fallback_used: codeViolationFallbackUsed,
    foreclosure_notices_attempted: foreclosureNoticesAttempted,
    foreclosure_notice_rows_checked: totalForeclosureNoticeRowsChecked,
    foreclosure_notice_candidates_extracted: totalForeclosureNoticeCandidatesExtracted,
    foreclosure_notice_research_ready: totalForeclosureNoticeResearchReady,
    foreclosure_notice_source_repair_needed: totalForeclosureNoticeSourceRepairNeeded,
    foreclosure_notice_blocked: totalForeclosureNoticeBlocked,
    foreclosure_notice_files_checked: totalForeclosureNoticeFilesChecked,
    warnings,
    errors,
    results: runResults
  };
  const store = writeStore(Object.assign({}, existingStore, {
    last_run: lastRun,
    candidates: mergedCandidates
  }), options.storePath || STORE_PATH);
  return {
    ok: true,
    preview_only: true,
    should_ingest: false,
    dry_run: true,
    last_run: store.last_run,
    counts: combineCandidateAndRunCounts(store.counts, summarizeRunEvidence(store.last_run)),
    candidates: normalizedCandidates,
    stored_candidate_count: store.candidates.length,
    evidence_links_found: totalEvidenceLinksFound,
    files_pages_checked: totalFilesPagesChecked,
    candidates_extracted: totalAdapterCandidates,
    file_parser_attempted: fileParserAttempted,
    files_detected: totalFilesDetected,
    pdf_files_detected: totalPdfFilesDetected,
    csv_files_detected: totalCsvFilesDetected,
    xlsx_files_detected: totalXlsxFilesDetected,
    files_parsed: totalFilesParsed,
    files_blocked: totalFilesBlocked,
    file_text_blocks_checked: totalFileTextBlocksChecked,
    file_rows_checked: totalFileRowsChecked,
    browser_capture_attempted: browserCaptureAttempted,
    browser_pages_checked: totalBrowserPagesChecked,
    browser_links_followed: totalBrowserLinksFollowed,
    visible_tables_found: totalVisibleTablesFound,
    visible_text_blocks_checked: totalVisibleTextBlocksChecked,
    code_violations_attempted: codeViolationsAttempted,
    code_violation_rows_checked: totalCodeViolationRowsChecked,
    code_violation_candidates_extracted: totalCodeViolationCandidatesExtracted,
    code_violation_active_rows_checked: totalCodeViolationActiveRowsChecked,
    code_violation_recent_rows_checked: totalCodeViolationRecentRowsChecked,
    code_violation_research_ready: totalCodeViolationResearchReady,
    code_violation_source_repair_needed: totalCodeViolationSourceRepairNeeded,
    code_violation_closed_old_count: totalCodeViolationClosedOldCount,
    code_violation_fallback_used: codeViolationFallbackUsed,
    foreclosure_notices_attempted: foreclosureNoticesAttempted,
    foreclosure_notice_rows_checked: totalForeclosureNoticeRowsChecked,
    foreclosure_notice_candidates_extracted: totalForeclosureNoticeCandidatesExtracted,
    foreclosure_notice_research_ready: totalForeclosureNoticeResearchReady,
    foreclosure_notice_source_repair_needed: totalForeclosureNoticeSourceRepairNeeded,
    foreclosure_notice_blocked: totalForeclosureNoticeBlocked,
    foreclosure_notice_files_checked: totalForeclosureNoticeFilesChecked,
    warnings,
    errors
  };
}

function getOfficialSourceCaptureStatus(options = {}) {
  const store = readStore(options.storePath || STORE_PATH);
  return {
    ok: true,
    preview_only: true,
    should_ingest: false,
    market: store.market || { county: 'Dallas', state: 'TX' },
    updated_at: store.updated_at || null,
    last_run: store.last_run || null,
    counts: combineCandidateAndRunCounts(store.counts || summarizeCandidates(store.candidates || []), summarizeRunEvidence(store.last_run)),
    candidate_count: Array.isArray(store.candidates) ? store.candidates.length : 0
  };
}

function listOfficialSourceCandidates(options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 50) || 50, 100));
  const status = cleanText(options.status || options.workflow_status);
  const store = readStore(options.storePath || STORE_PATH);
  let candidates = Array.isArray(store.candidates) ? store.candidates : [];
  if (status) candidates = candidates.filter((candidate) => cleanText(candidate.workflow_status).toLowerCase() === status.toLowerCase());
  return {
    ok: true,
    preview_only: true,
    should_ingest: false,
    counts: combineCandidateAndRunCounts(store.counts || summarizeCandidates(store.candidates || []), summarizeRunEvidence(store.last_run)),
    candidates: candidates.slice(0, limit),
    candidate_count: candidates.length,
    last_run: store.last_run || null
  };
}

module.exports = {
  STORE_PATH,
  PRIMARY_SOURCE_ID,
  SECONDARY_SOURCE_ID,
  CODE_VIOLATIONS_SOURCE_ID,
  classifyAddressQuality,
  normalizeCandidate,
  summarizeCandidates,
  runOfficialSourceCapture,
  getOfficialSourceCaptureStatus,
  listOfficialSourceCandidates
};
