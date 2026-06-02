'use strict';

const crypto = require('crypto');

const realFileParser = require('./dallas-real-file-parser');
const browserFileEvidenceAdapter = require('./dallas-browser-file-evidence-adapter');

const SOURCE_ID = 'tx_dallas_county_clerk_foreclosure_notices';
const SOURCE_URL = 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php';
const PUBLIC_SEARCH_URL = 'https://dallas.tx.publicsearch.us/';
const MAX_ROWS = 25;
const MAX_FILES = 6;
const MAX_TEXT_BLOCKS = 500;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const SAFE_HOSTS = new Set([
  'www.dallascounty.org',
  'dallascounty.org',
  'dallas.tx.publicsearch.us'
]);

const STREET_RE = /\b\d{1,6}\s+[A-Za-z0-9.'# -]{2,80}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pkwy|parkway|pl|place|trl|trail|way|loop|ter|terrace|hwy|highway|expy|expressway)\b(?:[\s,]*(?:dallas|tx|texas|\d{5})){0,6}/i;
const PARTIAL_ADDRESS_RE = /\b(?:property\s+address|situs\s+address|address)\s*[:#-]\s*([^|;\n]{2,120})/i;
const FORECLOSURE_HINT_RE = /\b(foreclosure|trustee|substitute trustee|trustee'?s sale|notice of sale|deed of trust|public sale|sale date|auction)\b/i;
const BLOCKED_PAGE_RE = /\b(captcha|human verification|verify you are human|access denied|forbidden|login required|sign in|register to bid|create an account)\b/i;
const JUNK_RE = /\b(contact us|phone directory|public information request|privacy policy|terms of use|site map|newsletter|department directory|office hours|recording division)\b/i;
const NON_PROPERTY_NOTICE_TEXT_RE = /\b(foreclosure postings and sales will take place|take place on the north side|george allen courts building|facing commerce street|public sale location|all foreclosure postings)\b/i;
const OFFICIAL_OFFICE_ADDRESS_RE = /\b(500\s+elm\s+street|1201\s+elm\s+street|133\s+n\.?\s+riverfront\s+boulevard)\b/i;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeId(value) {
  return crypto.createHash('sha1').update(cleanText(value) || crypto.randomUUID()).digest('hex').slice(0, 16);
}

function boundedInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(n), max));
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function textFromHtml(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:tr|p|div|li|h\d|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function isSafeDallasForeclosureUrl(value) {
  try {
    const url = new URL(cleanText(value));
    if (!/^https?:$/i.test(url.protocol)) return false;
    return SAFE_HOSTS.has(url.hostname.toLowerCase());
  } catch (error) {
    return false;
  }
}

function normalizeDate(value) {
  const text = cleanText(value);
  const match = text.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i);
  return match ? cleanText(match[0]) : '';
}

function fieldValue(text, labelPattern) {
  const re = new RegExp('(?:' + labelPattern + ')\\s*[:#-]?\\s*([^|;\\n]{1,160})', 'i');
  const match = cleanText(text).match(re);
  if (!match) return '';
  return cleanText(match[1])
    .replace(/\b(?:borrower|grantor|trustor|mortgagor|trustee|substitute trustee|lender|beneficiary|mortgagee|document|instrument|case|sale|date|address|property|legal description)\b\s*[:#-]?.*$/i, '')
    .trim();
}

function normalizeAddress(value) {
  const text = cleanText(value);
  const full = text.match(STREET_RE);
  if (full) {
    const candidate = cleanText(full[0]).replace(/\s+,/g, ',');
    if (NON_PROPERTY_NOTICE_TEXT_RE.test(candidate) || /\b(foreclosure|postings|sales will|take place|courts building)\b/i.test(candidate)) return '';
    return candidate;
  }
  const partial = text.match(PARTIAL_ADDRESS_RE);
  return partial ? cleanText(partial[1]) : '';
}

function classifyAddressQuality(address, text) {
  const value = cleanText(address);
  if (!value) return 'missing';
  if (JUNK_RE.test(value) || OFFICIAL_OFFICE_ADDRESS_RE.test(value) || NON_PROPERTY_NOTICE_TEXT_RE.test(value)) return 'junk';
  if (!STREET_RE.test(value)) return 'partial';
  if (!/dallas/i.test(`${value} ${text}`) && !/\b75[23]\d{2}\b/.test(`${value} ${text}`)) return 'partial';
  return 'valid';
}

function extractProofBlocks(text) {
  const raw = String(text || '');
  const fullText = cleanText(textFromHtml(raw));
  const blocks = raw
    .replace(/\r/g, '\n')
    .split(/\n{1,}|(?=\bNOTICE\b)|(?=\bNotice\b)|(?=\b\d{1,6}\s+[A-Za-z0-9.'# -]{2,80}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pkwy|parkway|pl|place|trl|trail|way|loop|ter|terrace|hwy|highway|expy|expressway)\b)|(?=\bProperty\s+Address\b)|(?=\bAddress\s*:)/i)
    .map((block) => cleanText(textFromHtml(block)))
    .filter(Boolean)
    .slice(0, MAX_TEXT_BLOCKS);
  if (FORECLOSURE_HINT_RE.test(fullText) && (STREET_RE.test(fullText) || PARTIAL_ADDRESS_RE.test(fullText))) {
    blocks.unshift(fullText);
  }
  return blocks;
}

function parseMoney(value) {
  const match = cleanText(value).match(/\$?\s*([0-9]+(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function candidateFromBlock(block, context = {}) {
  const text = cleanText(block);
  if (!text || BLOCKED_PAGE_RE.test(text)) return null;
  if (JUNK_RE.test(text) && !FORECLOSURE_HINT_RE.test(text) && !STREET_RE.test(text)) return null;
  if (!FORECLOSURE_HINT_RE.test(text) && !STREET_RE.test(text)) return null;

  const address = normalizeAddress(text);
  const addressQuality = classifyAddressQuality(address, text);
  if (addressQuality === 'missing') return null;
  if (addressQuality === 'junk') return null;

  const saleDate = normalizeDate(fieldValue(text, 'sale date|date of sale|trustee sale date|foreclosure sale date') || text);
  const noticeDate = normalizeDate(fieldValue(text, 'notice date|posted date|filed date|recorded date|date recorded'));
  const filingDate = normalizeDate(fieldValue(text, 'filing date|file date|recording date|recorded'));
  const borrower = fieldValue(text, 'borrower|grantor|trustor|mortgagor|debtor');
  const trustee = fieldValue(text, 'substitute trustee|trustee');
  const lender = fieldValue(text, 'lender|mortgagee|beneficiary');
  const caseNumber = fieldValue(text, 'case|cause|suit');
  const instrument = fieldValue(text, 'instrument|document|doc|recording|file');
  const parcel = fieldValue(text, 'parcel|apn|account|property id');
  const openingBid = parseMoney(fieldValue(text, 'opening bid|minimum bid|bid amount'));
  const debtAmount = parseMoney(fieldValue(text, 'debt|amount due|amount owed|unpaid balance'));
  const zip = (address.match(/\b75[23]\d{2}\b/) || text.match(/\b75[23]\d{2}\b/) || [])[0] || '';
  const proofUrl = cleanText(context.source_proof_url || context.source_url || SOURCE_URL);
  const missing = [];
  if (addressQuality !== 'valid') missing.push('complete Dallas property address');
  if (!saleDate) missing.push('sale date');
  if (!proofUrl) missing.push('source proof URL');
  if (!instrument && !caseNumber && !parcel) missing.push('instrument, case, or parcel reference');
  const workflowStatus = addressQuality === 'valid' && saleDate && proofUrl ? 'Research Ready' : 'Source Repair Needed';

  return {
    id: `DAL-FC-${safeId(`${proofUrl}|${address}|${saleDate}|${instrument}|${caseNumber}|${parcel}`)}`,
    property_address: address,
    address,
    city: /dallas/i.test(`${address} ${text}`) || zip ? 'Dallas' : '',
    state: 'TX',
    county: 'Dallas',
    zip,
    parcel_id: parcel,
    case_number: caseNumber || instrument,
    record_id: instrument,
    owner_name: borrower,
    borrower_name: borrower,
    trustee_name: trustee,
    lender_name: lender,
    event_type: /trustee/i.test(text) ? 'trustee_notice' : 'foreclosure_notice',
    sale_date: saleDate,
    auction_date: saleDate,
    notice_date: noticeDate,
    filing_date: filingDate,
    opening_bid: openingBid,
    judgment_amount: debtAmount,
    source_url: context.source_url || SOURCE_URL,
    source_record_url: proofUrl,
    source_proof_url: proofUrl,
    source_reference: context.source_reference || 'Dallas County Clerk foreclosure notice evidence',
    source_proof_text: text.slice(0, 650),
    raw_text: text.slice(0, 1200),
    captured_at: context.captured_at || nowIso(),
    extraction_confidence: workflowStatus === 'Research Ready' ? 'Medium' : 'Low',
    workflow_status: workflowStatus,
    property_identity_status: workflowStatus === 'Research Ready' ? 'resolved' : 'needs_source_repair',
    missing_evidence: missing,
    next_action: workflowStatus === 'Research Ready'
      ? 'Review foreclosure notice proof, then send to AI Deal Analyzer for comps.'
      : 'Repair foreclosure notice address/timing from official proof before comps.',
    preview_only: true,
    should_ingest: false
  };
}

function dedupeCandidates(candidates) {
  const byKey = new Map();
  function rank(candidate) {
    if (candidate.workflow_status === 'Research Ready') return 3;
    if (candidate.workflow_status === 'Source Repair Needed') return 2;
    if (candidate.workflow_status === 'Invalid/Junk') return 1;
    return 0;
  }
  function keyFor(candidate) {
    return cleanText([
      candidate.property_address || candidate.address,
      candidate.source_proof_url || candidate.source_record_url || candidate.source_url
    ].filter(Boolean).join('|')).toLowerCase() || candidate.id;
  }
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = keyFor(candidate);
    const existing = byKey.get(key);
    if (!existing || rank(candidate) > rank(existing) || (rank(candidate) === rank(existing) && cleanText(candidate.source_proof_text).length > cleanText(existing.source_proof_text).length)) {
      byKey.set(key, candidate);
    }
  }
  const out = [];
  for (const candidate of byKey.values()) out.push(candidate);
  return out;
}

function extractForeclosureNoticeCandidatesFromText(text, context = {}) {
  const candidates = [];
  for (const block of extractProofBlocks(text)) {
    if (candidates.length >= (context.max_rows || context.max_candidates || MAX_ROWS)) break;
    const candidate = candidateFromBlock(block, context);
    if (!candidate) continue;
    candidates.push(candidate);
  }
  return dedupeCandidates(candidates).slice(0, context.max_rows || context.max_candidates || MAX_ROWS);
}

function isForeclosureEvidenceLink(link) {
  const text = cleanText(`${link && link.url ? link.url : link} ${link && link.label}`).toLowerCase();
  if (!text) return false;
  return /\b(foreclosure|trustee|notice|sale|recording|publicsearch|pdf)\b/.test(text);
}

function discoverForeclosureEvidenceLinksFromHtml(html, baseUrl) {
  const links = browserFileEvidenceAdapter.discoverEvidenceLinksFromHtml(html, baseUrl)
    .filter((link) => isSafeDallasForeclosureUrl(link.url) && isForeclosureEvidenceLink(link));
  if (!links.some((link) => String(link.url).toLowerCase() === PUBLIC_SEARCH_URL.toLowerCase())) {
    links.push({ url: PUBLIC_SEARCH_URL, label: 'Dallas County official public records search', link_type: 'document_link' });
  }
  return links.slice(0, MAX_FILES);
}

async function fetchText(url, options = {}) {
  const fetchImpl = options.fetch_impl || global.fetch || require('node-fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout_ms || 10000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,text/plain,*/*',
        'User-Agent': 'WholesaleOS Dallas Foreclosure Notice Adapter Preview/1.0'
      }
    });
    const text = await response.text();
    if (text.length > MAX_TEXT_BYTES) {
      return { ok: false, status: response.status, text: '', blocked_reason: 'source_page_too_large_for_preview' };
    }
    return { ok: response.ok, status: response.status, text, content_type: cleanText(response.headers && response.headers.get && response.headers.get('content-type')) };
  } finally {
    clearTimeout(timer);
  }
}

async function parseLinksWithRealFileParser(source, links, options) {
  if (!links.length) {
    return {
      candidates: [],
      files_detected: 0,
      files_parsed: 0,
      files_blocked: 0,
      file_rows_checked: 0,
      status: 'needs_manual_review',
      blocked_reason: 'no_foreclosure_notice_links_found'
    };
  }
  const result = await realFileParser.runDallasRealFileParser({
    source,
    source_url: source.source_url || SOURCE_URL,
    evidence_links: links,
    max_candidates: options.max_rows || MAX_ROWS,
    max_files: options.max_files || MAX_FILES,
    timeout_ms: options.timeout_ms || 10000,
    captured_at: options.captured_at || nowIso(),
    fetch_impl: options.fetch_impl
  });
  return result || { candidates: [], status: 'needs_file_adapter', blocked_reason: 'file_parser_unavailable' };
}

function recastParserCandidate(candidate, context) {
  if (!candidate) return null;
  const proofText = cleanText(candidate.source_proof_text || candidate.raw_text || candidate.source_reference);
  const sourceProofUrl = cleanText(candidate.source_proof_url || candidate.source_record_url || context.source_proof_url || context.source_url);
  const sourceText = proofText || [
    candidate.address || candidate.property_address,
    candidate.case_number,
    candidate.sale_date || candidate.auction_date
  ].filter(Boolean).join(' | ');
  return candidateFromBlock(sourceText, Object.assign({}, context, { source_proof_url: sourceProofUrl })) || Object.assign({}, candidate, {
    id: candidate.id || `DAL-FC-${safeId(`${sourceProofUrl}|${candidate.address}|${candidate.sale_date}`)}`,
    event_type: candidate.event_type || 'foreclosure_notice',
    workflow_status: candidate.sale_date || candidate.auction_date ? candidate.workflow_status : 'Source Repair Needed',
    preview_only: true,
    should_ingest: false
  });
}

async function runDallasForeclosureNoticeAdapter(options = {}) {
  const source = Object.assign({
    source_id: SOURCE_ID,
    source_name: 'Dallas County Clerk Foreclosure Notices',
    source_url: SOURCE_URL,
    source_category: 'foreclosure'
  }, options.source || {});
  const sourceUrl = cleanText(options.source_url || source.source_url || SOURCE_URL);
  const capturedAt = cleanText(options.captured_at) || nowIso();
  const maxRows = boundedInt(options.max_rows || options.maxForeclosureNoticeRows || options.max_candidates, MAX_ROWS, MAX_ROWS);
  const maxFiles = boundedInt(options.max_files || options.maxForeclosureFiles, MAX_FILES, MAX_FILES);
  const counts = {
    foreclosure_notices_attempted: true,
    foreclosure_notice_rows_checked: 0,
    foreclosure_notice_candidates_extracted: 0,
    foreclosure_notice_research_ready: 0,
    foreclosure_notice_source_repair_needed: 0,
    foreclosure_notice_blocked: 0,
    foreclosure_notice_files_checked: 0
  };

  if (!isSafeDallasForeclosureUrl(sourceUrl)) {
    return Object.assign({}, counts, {
      ok: false,
      status: 'blocked',
      blocked_reason: 'unofficial_or_unsafe_foreclosure_source_url',
      candidates: [],
      preview_only: true,
      should_ingest: false
    });
  }

  const page = options.source_html || options.source_text
    ? { ok: true, text: String(options.source_html || options.source_text), status: 200 }
    : await fetchText(sourceUrl, options);
  if (!page.ok || BLOCKED_PAGE_RE.test(page.text)) {
    return Object.assign({}, counts, {
      ok: true,
      status: 'needs_manual_review',
      blocked_reason: page.blocked_reason || 'official_foreclosure_source_page_blocked_or_unavailable',
      candidates: [],
      preview_only: true,
      should_ingest: false
    });
  }

  const pageText = textFromHtml(page.text);
  const pageCandidates = extractForeclosureNoticeCandidatesFromText(pageText, {
    source_url: sourceUrl,
    source_proof_url: sourceUrl,
    source_reference: 'Dallas County Clerk foreclosure notice page',
    max_rows: maxRows,
    captured_at: capturedAt
  });
  counts.foreclosure_notice_rows_checked += extractProofBlocks(pageText).length;

  const links = Array.isArray(options.evidence_links) && options.evidence_links.length
    ? options.evidence_links.filter((link) => isSafeDallasForeclosureUrl(link.url || link) && isForeclosureEvidenceLink(link)).slice(0, maxFiles)
    : discoverForeclosureEvidenceLinksFromHtml(page.text, sourceUrl).slice(0, maxFiles);

  let fileResult = null;
  let fileCandidates = [];
  if (links.length && pageCandidates.length < maxRows) {
    fileResult = await parseLinksWithRealFileParser(source, links, {
      max_rows: maxRows - pageCandidates.length,
      max_files: maxFiles,
      timeout_ms: options.timeout_ms || options.timeout,
      captured_at: capturedAt,
      fetch_impl: options.fetch_impl
    });
    counts.foreclosure_notice_files_checked += Number(fileResult.files_parsed || fileResult.files_blocked || fileResult.files_detected || 0);
    counts.foreclosure_notice_rows_checked += Number(fileResult.file_rows_checked || 0);
    const rawFileCandidates = Array.isArray(fileResult.candidates) ? fileResult.candidates : [];
    fileCandidates = rawFileCandidates
      .map((candidate) => recastParserCandidate(candidate, {
        source_url: sourceUrl,
        source_proof_url: candidate && (candidate.source_proof_url || candidate.source_record_url) || sourceUrl,
        source_reference: 'Dallas County Clerk foreclosure notice file',
        captured_at: capturedAt
      }))
      .filter(Boolean);
  }

  const candidates = dedupeCandidates(pageCandidates.concat(fileCandidates)).slice(0, maxRows);
  counts.foreclosure_notice_candidates_extracted = candidates.length;
  for (const candidate of candidates) {
    if (candidate.workflow_status === 'Research Ready') counts.foreclosure_notice_research_ready += 1;
    if (candidate.workflow_status === 'Source Repair Needed') counts.foreclosure_notice_source_repair_needed += 1;
    if (candidate.workflow_status === 'Invalid/Junk') counts.foreclosure_notice_blocked += 1;
  }
  const blockedReason = !candidates.length
    ? (fileResult && fileResult.blocked_reason) || (links.length ? 'needs_file_adapter_or_notice_specific_review' : 'no_foreclosure_notice_rows_found')
    : '';
  return Object.assign({}, counts, {
    ok: true,
    status: candidates.length ? 'candidates_found' : 'needs_manual_review',
    blocked_reason: blockedReason,
    source_url: sourceUrl,
    evidence_links_found: links.length,
    files_detected: fileResult ? Number(fileResult.files_detected || 0) : 0,
    files_parsed: fileResult ? Number(fileResult.files_parsed || 0) : 0,
    files_blocked: fileResult ? Number(fileResult.files_blocked || 0) : 0,
    file_rows_checked: fileResult ? Number(fileResult.file_rows_checked || 0) : 0,
    candidates,
    preview_only: true,
    should_ingest: false
  });
}

module.exports = {
  SOURCE_ID,
  SOURCE_URL,
  isSafeDallasForeclosureUrl,
  discoverForeclosureEvidenceLinksFromHtml,
  extractForeclosureNoticeCandidatesFromText,
  runDallasForeclosureNoticeAdapter
};
