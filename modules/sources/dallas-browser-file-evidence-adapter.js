'use strict';

const crypto = require('crypto');

const MAX_EVIDENCE_LINKS = 10;
const MAX_ATTEMPTS = 5;
const MAX_CANDIDATES = 10;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const SAFE_HOSTS = new Set([
  'www.dallascounty.org',
  'dallascounty.org',
  'dallas.texas.sheriffsaleauctions.com'
]);

const STREET_RE = /\b\d{1,6}\s+[A-Za-z0-9.'# -]{2,80}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pkwy|parkway|pl|place|trl|trail|way|loop|ter|terrace|hwy|highway)\b(?:[\s,]*(?:dallas|tx|texas|\d{5})){0,6}/i;
const JUNK_RE = /\b(public information request|phone directory|contact us|page not found|error 404|privacy policy|terms of use|site map|login|sign in)\b/i;
const BLOCKED_RE = /\b(captcha|human verification|verify you are human|access denied|forbidden|login required|sign in|register to bid|create an account)\b/i;
const DALLAS_OFFICIAL_OFFICE_ADDRESS_RE = /\b(500\s+elm\s+street|133\s+n\.?\s+riverfront\s+boulevard|1201\s+elm\s+street)\b/i;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeId(value) {
  return crypto.createHash('sha1').update(cleanText(value) || crypto.randomUUID()).digest('hex').slice(0, 16);
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

function parseMoney(value) {
  const match = cleanText(value).match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDate(value) {
  const text = cleanText(value);
  const match = text.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i);
  return match ? cleanText(match[0]) : '';
}

function fieldValue(text, labelPattern) {
  const re = new RegExp('(?:' + labelPattern + ')\\s*[:#-]?\\s*([^|;\\n]{1,120})', 'i');
  const match = cleanText(text).match(re);
  if (!match) return '';
  return cleanText(match[1])
    .replace(/\b(?:owner|defendant|taxpayer|case|cause|suit|parcel|account|acct|sale|auction|date|opening|minimum|judgment|tax)\b\s*[:#-]?.*$/i, '')
    .trim();
}

function classifyEvidenceLink(input) {
  const url = cleanText(typeof input === 'string' ? input : input && input.url);
  const label = cleanText(input && input.label);
  const contentType = cleanText(input && input.content_type).toLowerCase();
  const value = cleanText(`${url} ${label} ${contentType}`).toLowerCase();
  if (/\.pdf(?:$|[\s?#])|application\/pdf/.test(value)) return 'pdf_file';
  if (/\.csv(?:$|[\s?#])|text\/csv/.test(value)) return 'csv_file';
  if (/\.xlsx?(?:$|[\s?#])|spreadsheet|excel/.test(value)) return 'xlsx_file';
  if (/text\/html|\.html?(?:$|[\s?#])|\/(?:\s|$)/.test(value)) return 'html_page';
  if (/\b(document|notice|foreclosure|sheriff|tax|sale|auction|resale)\b/.test(value)) return 'document_link';
  return 'unknown';
}

function isSafeDallasEvidenceUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    return SAFE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (error) {
    return false;
  }
}

function discoverEvidenceLinksFromHtml(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    const href = cleanText(match[1]);
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue;
    let url;
    try {
      url = new URL(href, baseUrl).toString();
    } catch (error) {
      continue;
    }
    if (!isSafeDallasEvidenceUrl(url)) continue;
    const label = cleanText(textFromHtml(match[2])).slice(0, 160);
    const type = classifyEvidenceLink({ url, label });
    const search = `${url} ${label}`.toLowerCase();
    if (type === 'unknown' && !/\b(foreclosure|sheriff|tax|sale|auction|notice|resale|property|struck|bid)\b/.test(search)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ url, label, link_type: type });
    if (links.length >= MAX_EVIDENCE_LINKS) break;
  }
  return links;
}

function normalizeAddress(value) {
  const match = cleanText(value).match(STREET_RE);
  if (!match) return '';
  return cleanText(match[0]).replace(/\s+,/g, ',');
}

function candidateFromBlock(block, context) {
  const text = cleanText(block);
  const sourceUrl = cleanText(context.source_proof_url || context.source_url);
  if (!text) return null;

  const address = normalizeAddress(text);
  if (address && DALLAS_OFFICIAL_OFFICE_ADDRESS_RE.test(address)) return null;
  if (!address && context.include_junk_candidate === true && JUNK_RE.test(text)) {
    return {
      id: `DAL-FILE-${safeId(`${sourceUrl}|${text}`)}`,
      address: (text.match(JUNK_RE) || ['Invalid/Junk'])[0],
      raw_text: text.slice(0, 500),
      source_reference: context.source_reference || 'blocked non-property source text',
      source_url: context.source_url,
      source_record_url: sourceUrl,
      repair_flags: ['junk_source_text', 'missing_address'],
      extraction_confidence: 'Repair',
      preview_only: true,
      should_ingest: false
    };
  }
  if (!address) return null;

  const ownerName = fieldValue(text, 'owner|owner name|defendant|taxpayer');
  const parcel = fieldValue(text, 'parcel|parcel id|parcel no|account|account no|acct|tax account|apn');
  const caseNumber = fieldValue(text, 'case|case no|cause|cause no|suit|suit no');
  const saleDate = normalizeDate(fieldValue(text, 'sale date|auction date|date') || text);
  const openingBid = parseMoney(fieldValue(text, 'opening bid|minimum bid|min bid|bid amount'));
  const taxAmount = parseMoney(fieldValue(text, 'tax amount|tax due|taxes due|amount due'));
  const judgmentAmount = parseMoney(fieldValue(text, 'judgment|judgement|judgment amount'));
  if (!parcel && !caseNumber && !saleDate && !openingBid && !taxAmount && !judgmentAmount) return null;
  const zip = (address.match(/\b75[23]\d{2}\b/) || text.match(/\b75[23]\d{2}\b/) || [])[0] || '';
  const hasDallas = /\bdallas\b/i.test(`${address} ${text}`);
  const missing = [];
  if (!saleDate) missing.push('sale or auction date');
  if (!parcel && !caseNumber) missing.push('parcel or case number');
  if (!sourceUrl) missing.push('source proof URL');

  return {
    id: `DAL-FILE-${safeId(`${sourceUrl}|${address}|${caseNumber}|${parcel}|${saleDate}`)}`,
    address,
    city: hasDallas ? 'Dallas' : '',
    state: 'TX',
    county: 'Dallas',
    zip,
    parcel,
    apn: parcel,
    case_number: caseNumber,
    owner_name: ownerName,
    sale_date: saleDate,
    auction_date: saleDate,
    opening_bid: openingBid,
    tax_amount: taxAmount,
    judgment_amount: judgmentAmount,
    source_reference: context.source_reference || 'official evidence text',
    source_url: context.source_url,
    source_record_url: sourceUrl,
    source_proof_text: text.slice(0, 500),
    raw_text: text.slice(0, 1000),
    missing_evidence: missing,
    extraction_method: 'dallas_browser_file_evidence_adapter',
    extraction_confidence: missing.length ? 'Low' : 'Medium',
    preview_only: true,
    should_ingest: false
  };
}

function extractCandidateRowsFromText(text, context = {}) {
  const raw = String(text || '');
  const blocks = raw
    .replace(/\r/g, '\n')
    .split(/\n{1,}|(?=<tr\b)|(?=Property\s+Address\b)|(?=Address\s*:)|(?=\b\d{1,6}\s+[A-Za-z0-9.'# -]{2,80}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pkwy|parkway|pl|place|trl|trail|way|loop|ter|terrace|hwy|highway)\b)/i)
    .map((block) => cleanText(textFromHtml(block)))
    .filter(Boolean);
  const seen = new Set();
  const candidates = [];
  for (const block of blocks) {
    if (candidates.length >= (context.max_candidates || MAX_CANDIDATES)) break;
    const candidate = candidateFromBlock(block, context);
    if (!candidate) continue;
    const key = cleanText(`${candidate.address}|${candidate.case_number}|${candidate.parcel}|${candidate.sale_date}|${candidate.source_record_url}`).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}

async function fetchWithTimeout(url, options = {}) {
  const fetchImpl = global.fetch || require('node-fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout_ms || 10000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,text/plain,text/csv,application/pdf,*/*',
        'User-Agent': 'WholesaleOS Dallas Evidence Adapter Preview/1.0'
      }
    });
    const contentType = cleanText(response.headers && response.headers.get ? response.headers.get('content-type') : '');
    const contentLength = Number(response.headers && response.headers.get ? response.headers.get('content-length') : 0);
    if (contentLength > MAX_TEXT_BYTES) {
      return { ok: false, status: response.status, content_type: contentType, blocked_reason: 'evidence_file_too_large_for_preview' };
    }
    const type = classifyEvidenceLink({ url, content_type: contentType });
    if (type === 'pdf_file' || type === 'xlsx_file') {
      return { ok: response.ok, status: response.status, content_type: contentType, link_type: type, text: '', blocked_reason: 'needs_file_adapter' };
    }
    const text = await response.text();
    if (text.length > MAX_TEXT_BYTES) {
      return { ok: false, status: response.status, content_type: contentType, link_type: type, blocked_reason: 'evidence_file_too_large_for_preview' };
    }
    return { ok: response.ok, status: response.status, content_type: contentType, link_type: type, text };
  } finally {
    clearTimeout(timer);
  }
}

async function inspectEvidenceUrl(link, source, options = {}) {
  const url = cleanText(link && link.url ? link.url : link);
  const linkType = classifyEvidenceLink(link);
  const attempt = {
    url,
    label: cleanText(link && link.label),
    link_type: linkType,
    status: 'not_attempted',
    candidates_found: 0,
    blocked_reason: ''
  };
  if (!isSafeDallasEvidenceUrl(url)) {
    attempt.status = 'blocked';
    attempt.blocked_reason = 'not_dallas_official_or_linked_source';
    return { attempt, candidates: [], discovered_links: [] };
  }
  if (linkType === 'pdf_file' || linkType === 'xlsx_file') {
    attempt.status = 'blocked';
    attempt.blocked_reason = 'needs_file_adapter';
    return { attempt, candidates: [], discovered_links: [] };
  }
  let fetched;
  try {
    fetched = await fetchWithTimeout(url, options);
  } catch (error) {
    attempt.status = 'failed';
    attempt.blocked_reason = error && error.name === 'AbortError' ? 'timeout' : (error.message || 'fetch_failed');
    return { attempt, candidates: [], discovered_links: [] };
  }
  attempt.status = fetched.ok ? 'checked' : 'failed';
  attempt.http_status = fetched.status;
  attempt.content_type = fetched.content_type;
  attempt.link_type = fetched.link_type || linkType;
  if (fetched.blocked_reason) {
    attempt.blocked_reason = fetched.blocked_reason;
    return { attempt, candidates: [], discovered_links: [] };
  }
  const visibleText = /html/i.test(fetched.content_type) || attempt.link_type === 'html_page'
    ? textFromHtml(fetched.text)
    : fetched.text;
  if (BLOCKED_RE.test(visibleText)) {
    attempt.status = 'blocked';
    attempt.blocked_reason = 'source_requires_login_or_human_review';
    return { attempt, candidates: [], discovered_links: [] };
  }
  const discoveredLinks = /html/i.test(fetched.content_type) || attempt.link_type === 'html_page'
    ? discoverEvidenceLinksFromHtml(fetched.text, url)
    : [];
  if (link && link.discover_only === true) {
    attempt.status = 'checked';
    attempt.blocked_reason = discoveredLinks.length ? '' : 'no_evidence_links_found';
    return { attempt, candidates: [], discovered_links: discoveredLinks };
  }
  const candidates = extractCandidateRowsFromText(visibleText, {
    source_url: source.source_url || url,
    source_proof_url: url,
    source_reference: cleanText(link && link.label) || `official evidence ${attempt.link_type}`,
    max_candidates: options.max_candidates || MAX_CANDIDATES,
    include_junk_candidate: options.include_junk_candidate === true
  });
  attempt.candidates_found = candidates.length;
  return { attempt, candidates, discovered_links: discoveredLinks };
}

async function runDallasBrowserFileEvidenceAdapter(options = {}) {
  const source = options.source || {};
  const sourceUrl = cleanText(options.source_url || source.source_url);
  const maxCandidates = Math.max(1, Math.min(Number(options.max_candidates || MAX_CANDIDATES) || MAX_CANDIDATES, MAX_CANDIDATES));
  const evidenceLinks = Array.isArray(options.evidence_links) ? options.evidence_links : [];
  const linkMap = new Map();
  if (sourceUrl) linkMap.set(sourceUrl, { url: sourceUrl, label: source.source_name || 'Official source page', link_type: 'html_page', discover_only: true });
  for (const link of evidenceLinks) {
    const url = cleanText(link && link.url ? link.url : link);
    if (!url || linkMap.has(url)) continue;
    linkMap.set(url, Object.assign({}, link, { link_type: classifyEvidenceLink(link) }));
  }

  const attempts = [];
  const discovered = [];
  let candidates = [];
  const queue = Array.from(linkMap.values()).slice(0, MAX_EVIDENCE_LINKS);
  const queued = new Set(queue.map((link) => link.url));

  while (queue.length && attempts.length < MAX_ATTEMPTS && candidates.length < maxCandidates) {
    const link = queue.shift();
    const result = await inspectEvidenceUrl(link, source, {
      timeout_ms: options.timeout_ms || 10000,
      max_candidates: maxCandidates - candidates.length
    });
    attempts.push(result.attempt);
    candidates = candidates.concat(result.candidates);
    for (const found of result.discovered_links) {
      if (!found.url || queued.has(found.url) || discovered.some((item) => item.url === found.url)) continue;
      discovered.push(found);
      queued.add(found.url);
      if (queue.length + attempts.length < MAX_ATTEMPTS) queue.push(found);
    }
  }

  const blockedReasons = attempts.map((attempt) => attempt.blocked_reason).filter(Boolean);
  const status = candidates.length
    ? 'candidates_found'
    : blockedReasons.includes('needs_file_adapter')
      ? 'needs_file_adapter'
      : discovered.length || evidenceLinks.length
        ? 'needs_browser_assist'
        : 'no_property_rows_found';

  return {
    ok: true,
    provider: 'dallas_browser_file_evidence_adapter',
    status,
    source_url: sourceUrl || null,
    evidence_links_found: Array.from(new Set([].concat(evidenceLinks, discovered).map((link) => cleanText(link && link.url ? link.url : link)).filter(Boolean))).length,
    files_pages_attempted: attempts.length,
    candidates,
    candidates_extracted: candidates.length,
    attempts,
    discovered_links: discovered.slice(0, MAX_EVIDENCE_LINKS),
    blocked_reason: candidates.length ? '' : (blockedReasons[0] || status),
    captured_at: options.captured_at || nowIso(),
    preview_only: true,
    should_ingest: false
  };
}

module.exports = {
  classifyEvidenceLink,
  discoverEvidenceLinksFromHtml,
  extractCandidateRowsFromText,
  runDallasBrowserFileEvidenceAdapter
};
