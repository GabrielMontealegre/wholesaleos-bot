'use strict';

// Generic TX county foreclosure acquisition adapter.
// Driven entirely by a county profile (tx-county-foreclosure-source-profiles):
// 1. fetch the county's official foreclosure page (public, no login)
// 2. discover official-host document links on the page
// 3. bounded public search for direct official notice PDFs
// 4. fetch + parse county-host PDFs with the TX trustee notice extractor
// 5. emit candidates/cards plus discovered links for source-proof rows;
//    gated portals are reported as blocked notes, never bypassed.
//
// Preview-only: no ingestion, no saved leads, no global mutation.

const crypto = require('crypto');
const path = require('path');

const propertyCandidate = require('../research/property-candidate');
const searchProviderWorker = require('../research/search-provider-worker');
const txTrusteeNoticeExtractor = require('../research/tx-trustee-notice-text-extractor');
const countyProfiles = require('./tx-county-foreclosure-source-profiles');

const MAX_DOCS_PER_COUNTY = 5;
const MAX_ROWS = 25;
const MAX_LINKS = 20;
const MAX_ARCHIVE_PAGES = 2;
const MAX_PDF_BYTES = 6 * 1024 * 1024;
const DOC_LEDGER_FILE_NAME = 'deal-board-doc-ledger.json';
// CivicPlus county sites carry "Sign In" navigation on every public page -
// only treat explicit gate language as blocked, never bare nav text.
const BLOCKED_PAGE_RE = /\b(captcha|verify you are human|human verification|access denied|login required|sign in to (?:view|continue|access)|must (?:log|sign) in|create an account to|incapsula|request unsuccessful|subscription required|paywall)\b/i;
const DOC_KEYWORD_RE = /\b(foreclos|trustee|notice|sale|auction|sheriff|tax)/i;
// Direct document URLs: plain PDFs plus CivicPlus DocumentCenter/Archive/
// ShowDocument patterns (they serve PDFs without a .pdf extension).
const DOC_URL_RE = /\.pdf(?:$|[?#])|\/DocumentCenter\/View\/\d+|Archive\.aspx\?[^"']*ADID=\d+|ShowDocument\?id=\d+|showdoc\.asp\?[^"']*docName=[^"']+\.pdf/i;
const ARCHIVE_PAGE_RE = /Archive\.aspx\?[^"']*AMID=\d+|listDocs-new\.asp\?[^"']*year=\d{4}/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function startOfDayMs(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parseLinkDate(value) {
  const text = cleanText(value);
  let match = /\b(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})\b/.exec(text);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  match = /\b(\d{1,2})[-_/](\d{1,2})[-_/](20\d{2})\b/.exec(text);
  if (match) {
    const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function datePriority(value) {
  const date = parseLinkDate(value);
  if (!date) return 0;
  const today = startOfDayMs(new Date());
  const diffDays = Math.round((startOfDayMs(date) - today) / 86400000);
  if (diffDays >= 0) return 100000 - diffDays;
  return -10000 + diffDays;
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(cleanText(value)).digest('hex').slice(0, 16)}`;
}

function hostOf(url) {
  try {
    return new URL(cleanText(url)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (error) {
    return '';
  }
}

function isOfficialHost(url, profile) {
  const host = hostOf(url);
  return !!host && (profile.official_hosts || []).some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function urlPathLooksPdf(url) {
  try {
    return /\.pdf$/i.test(new URL(cleanText(url)).pathname);
  } catch (error) {
    return /\.pdf(?:$|[?#])/i.test(cleanText(url));
  }
}

function embeddedPdfUrlFromHtml(html, baseUrl) {
  const source = String(html || '');
  const patterns = [
    /<(?:object|embed|iframe)\b[^>]*(?:data|src)=["']([^"']+\.pdf(?:[^"']*)?)["'][^>]*>/i,
    /<a\b[^>]*href=["']([^"']+\.pdf(?:[^"']*)?)["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match || !cleanText(match[1])) continue;
    try {
      return new URL(cleanText(match[1]), baseUrl).toString();
    } catch (error) {
      return '';
    }
  }
  return '';
}

function snapshotLedgerDir() {
  const snapshotPath = cleanText(process.env.DEAL_BOARD_SNAPSHOTS_PATH) ||
    path.join(path.dirname(path.resolve(process.env.DB_PATH || './data/db.json')), 'deal-board-snapshots.json');
  return path.dirname(path.resolve(snapshotPath));
}

function slugForLedger(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function marketKeyForLedger(options = {}, profile = {}) {
  const explicit = cleanText(options.market_key || options.marketKey);
  if (explicit) return explicit;
  const market = options.market && typeof options.market === 'object' ? options.market : {};
  const city = cleanText(market.city || options.city || 'unknown').toLowerCase() || 'unknown';
  const county = cleanText(market.county || options.county || profile.county).toLowerCase();
  const state = cleanText(market.state || options.state || profile.state).toLowerCase();
  return [city, county, state].join('|');
}

function scopedLedgerFilePath(baseFile, marketKey) {
  const slug = slugForLedger(marketKey);
  if (!slug) return baseFile;
  const parsed = path.parse(baseFile);
  return path.join(parsed.dir, `${parsed.name}-${slug}${parsed.ext || '.json'}`);
}

function documentLedgerFilePath(options = {}, profile = {}) {
  const explicitPath = cleanText(process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH);
  const baseFile = path.resolve(explicitPath || path.join(snapshotLedgerDir(), DOC_LEDGER_FILE_NAME));
  const marketKey = marketKeyForLedger(options, profile);
  return scopedLedgerFilePath(baseFile, marketKey);
}

function readDocumentLedger(options = {}, profile = {}) {
  const file = documentLedgerFilePath(options, profile);
  try {
    const data = JSON.parse(require('fs').readFileSync(file, 'utf8'));
    if (data && typeof data === 'object' && data.documents && typeof data.documents === 'object') return data;
  } catch (error) { /* first run or unreadable - start fresh */ }
  return { version: 1, store_kind: 'deal_board_document_ledger_not_saved_leads', updated_at: null, documents: {} };
}

function retainedLedgerMonthFloor(now = new Date()) {
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
}

function pruneDocumentLedger(store, now = new Date()) {
  const floor = retainedLedgerMonthFloor(now);
  const documents = store && store.documents && typeof store.documents === 'object' ? store.documents : {};
  for (const key of Object.keys(documents)) {
    const entry = documents[key] || {};
    const postingMonth = cleanText(entry.posting_month || key.split('|')[0]).slice(0, 7);
    if (/^20\d{2}-\d{2}$/.test(postingMonth) && postingMonth < floor) delete documents[key];
  }
  if (store) store.documents = documents;
  return store;
}

function writeDocumentLedger(store, now = new Date(), options = {}, profile = {}) {
  const file = documentLedgerFilePath(options, profile);
  require('fs').mkdirSync(path.dirname(file), { recursive: true });
  pruneDocumentLedger(store, now);
  store.updated_at = nowIso();
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  require('fs').writeFileSync(tempFile, JSON.stringify(store, null, 2));
  try {
    require('fs').renameSync(tempFile, file);
  } catch (error) {
    try { require('fs').rmSync(file, { force: true }); } catch (removeError) { /* ignore */ }
    require('fs').renameSync(tempFile, file);
  }
}

function monthNumberFromName(name) {
  const value = cleanText(name).toLowerCase();
  const names = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };
  for (const key of Object.keys(names)) {
    if (value.startsWith(key)) return names[key];
  }
  return 0;
}

function postingMonthFromText(text, fallbackDate = new Date()) {
  const source = cleanText(text);
  let match = /\b(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})\b/.exec(source);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
  match = /\b(20\d{2})[-_/](\d{1,2})\b/.exec(source);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
  const monthMatch = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.exec(source);
  if (monthMatch) {
    const month = monthNumberFromName(monthMatch[1]);
    const yearMatch = /\b(20\d{2})\b/.exec(source);
    const year = yearMatch ? Number(yearMatch[1]) : fallbackDate.getFullYear();
    if (month) return `${year}-${String(month).padStart(2, '0')}`;
  }
  const year = fallbackDate.getFullYear();
  const month = fallbackDate.getMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function documentLedgerKey(documentUrl, postingMonth) {
  return `${cleanText(postingMonth).slice(0, 7)}|${cleanText(documentUrl).toLowerCase()}`;
}

function documentLedgerEntry(store, documentUrl, postingMonth) {
  if (!store || !store.documents) return null;
  return store.documents[documentLedgerKey(documentUrl, postingMonth)] || null;
}

function documentAlreadyRead(store, documentUrl, postingMonth) {
  const entry = documentLedgerEntry(store, documentUrl, postingMonth);
  return !!(entry && (entry.last_status === 'done' || entry.last_status === 'hard_failed'));
}

function recordDocumentLedgerAttempt(store, documentUrl, postingMonth, status) {
  if (!store || !documentUrl || !postingMonth) return store;
  const key = documentLedgerKey(documentUrl, postingMonth);
  const normalizedStatus = String(status || '').toLowerCase() === 'done' ? 'done' : 'hard_failed';
  const previous = store.documents && store.documents[key] ? store.documents[key] : {
    document_url: cleanText(documentUrl),
    posting_month: cleanText(postingMonth).slice(0, 7),
    first_attempt_at: nowIso()
  };
  const attempts = Array.isArray(previous.attempts) ? previous.attempts.slice(0, 9) : [];
  attempts.push({ status: normalizedStatus, timestamp: nowIso() });
  store.documents = store.documents || {};
  store.documents[key] = Object.assign({}, previous, {
    document_url: cleanText(documentUrl),
    posting_month: cleanText(postingMonth).slice(0, 7),
    last_status: normalizedStatus,
    last_attempt_at: nowIso(),
    attempts
  });
  return store;
}

async function fetchBounded(url, options, expectPdf, depth = 0) {
  const fetchImpl = options.fetch_impl || global.fetch || require('node-fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout_ms || 10000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: expectPdf ? 'application/pdf,*/*' : 'text/html,application/pdf,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    });
    if (response.status === 403 || response.status === 429) return { status: 'blocked', blocked_reason: `http_${response.status}` };
    if (!response.ok) return { status: 'failed', blocked_reason: `http_${response.status}` };
    const contentType = cleanText(response.headers && response.headers.get && response.headers.get('content-type')).toLowerCase();
    const declaredLength = Number(response.headers && response.headers.get && response.headers.get('content-length')) || 0;
    if (contentType.includes('pdf') || urlPathLooksPdf(url)) {
      if (declaredLength > MAX_PDF_BYTES) return { status: 'skipped', blocked_reason: `pdf_too_large_${Math.round(declaredLength / 1048576)}mb` };
      try {
        const pdfParse = require('pdf-parse');
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_PDF_BYTES) return { status: 'skipped', blocked_reason: 'pdf_too_large' };
        const parsed = await pdfParse(buffer);
        const text = String(parsed && parsed.text || '');
        if (cleanText(text).length < 100) {
          // Image-only scan: real evidence but unreadable without OCR.
          // Hand the buffer back so the bounded OCR lane can try.
          return { status: 'skipped', blocked_reason: 'pdf_scanned_no_text_layer', buffer };
        }
        return { status: 'parsed', kind: 'pdf', text };
      } catch (error) {
        return { status: 'failed', blocked_reason: 'pdf_parse_failed' };
      }
    }
    const text = await response.text();
    if (BLOCKED_PAGE_RE.test(text)) return { status: 'blocked', blocked_reason: 'captcha_or_bot_wall' };
    if (expectPdf && depth < 1) {
      const embeddedPdfUrl = embeddedPdfUrlFromHtml(text, url);
      if (embeddedPdfUrl) {
        const embedded = await fetchBounded(embeddedPdfUrl, options, true, depth + 1);
        if (embedded && (embedded.status === 'parsed' || embedded.status === 'skipped')) {
          embedded.final_pdf_url = embeddedPdfUrl;
          embedded.wrapper_url = url;
        }
        return embedded;
      }
    }
    return { status: 'parsed', kind: 'html', text };
  } catch (error) {
    return { status: 'failed', blocked_reason: cleanText(error && error.message).slice(0, 60) || 'fetch_failed' };
  } finally {
    clearTimeout(timer);
  }
}

function discoverOfficialLinks(html, baseUrl, profile) {
  const links = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    const href = cleanText(match[1]);
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue;
    let url;
    try { url = new URL(href, baseUrl).toString(); } catch (error) { continue; }
    if (!isOfficialHost(url, profile)) continue;
    const label = cleanText(String(match[2]).replace(/<[^>]+>/g, ' ')).slice(0, 120);
    const isDoc = DOC_URL_RE.test(url);
    const isArchive = ARCHIVE_PAGE_RE.test(url);
    // Document/archive-pattern URLs on an official county foreclosure page
    // are documents by construction - their labels are often bare dates.
    if (!isDoc && !isArchive && !DOC_KEYWORD_RE.test(`${url} ${label}`)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const keywordHit = DOC_KEYWORD_RE.test(`${url} ${label}`) ? 1 : 0;
    links.push({
      url,
      label,
      link_type: isDoc ? 'pdf_file' : isArchive ? 'archive_page' : 'official_page',
      keyword_hit: keywordHit,
      date_priority: datePriority(`${url} ${label}`)
    });
  }
  return links
    .sort((a, b) => (b.date_priority || 0) - (a.date_priority || 0) || ((b.link_type === 'pdf_file' ? 2 : 0) + (b.keyword_hit || 0)) - ((a.link_type === 'pdf_file' ? 2 : 0) + (a.keyword_hit || 0)))
    .slice(0, MAX_LINKS);
}

async function searchOfficialDocuments(profile, options) {
  if (!Array.isArray(profile.search_hints) || !profile.search_hints.length) return [];
  if (Array.isArray(options.mock_search_results)) {
    return options.mock_search_results
      .map((item) => cleanText(item && (item.url || item.source_url)))
      .filter((url) => url && isOfficialHost(url, profile));
  }
  try {
    const result = await searchProviderWorker.runSearchProvider({
      market: profile.county,
      search_mode: 'source_document_discovery'
    }, {
      query_groups: (profile.search_hints || []).slice(0, 2).map((query, index) => ({
        query,
        query_group: `county_foreclosure_docs_${profile.county.toLowerCase()}_${index}`,
        provider_family: 'tx_county_foreclosure',
        purpose: 'source_document_discovery',
        priority: index + 1,
        max_results: 6
      })),
      env: options.env,
      fetch_impl: options.fetch_impl,
      max_results: 6
    });
    return (Array.isArray(result && result.results) ? result.results : [])
      .map((item) => cleanText(item && (item.url || item.source_url)))
      .filter((url) => isOfficialHost(url, profile));
  } catch (error) {
    return [];
  }
}

async function runTxCountyForeclosureAcquisitionAdapter(options = {}) {
  const profile = options.profile || countyProfiles.profileForSourceId(options.source_id);
  if (!profile) {
    return {
      source_id: cleanText(options.source_id), status: 'not_configured', attempted: false,
      candidates: [], cards: [], discovered_links: [], preview_only: true, should_ingest: false
    };
  }
  const capturedAt = cleanText(options.captured_at) || nowIso();
  const runId = cleanText(options.acquisition_run_id || options.discovery_batch_id) || hashId('txc', `${profile.source_id}|${capturedAt}`);
  const discoveredLinks = [
    { url: profile.source_url, label: `${profile.source_name} (official page)`, link_type: 'official_page' },
    { url: profile.human_portal_url, label: `${profile.county} County records portal (open manually - automated access gated)`, link_type: 'portal_preview_only' }
  ];
  const documentUrlsFound = [];
  const documentUrlsParsed = [];
  const documentUrlsSkipped = [];
  const blockedNotes = [];
  const documentLinkMeta = new Map();
  let rawRows = [];

  const archivePages = [];
  const page = await fetchBounded(profile.source_url, options, false);
  if (page.status === 'parsed') {
    for (const link of discoverOfficialLinks(page.text, profile.source_url, profile)) {
      discoveredLinks.push(link);
      if (link.link_type === 'pdf_file') documentUrlsFound.push(link.url);
      if (link.link_type === 'archive_page') archivePages.push(link.url);
      if (link.link_type === 'pdf_file' && link.url) documentLinkMeta.set(link.url, link);
    }
  } else {
    blockedNotes.push({ source: 'official_page', url: profile.source_url, reason: page.blocked_reason || page.status });
  }

  // CivicPlus archive month pages (Archive.aspx?AMID=...) hold the actual
  // document list on some counties - follow a bounded number of them.
  for (const extraPage of (profile.extra_document_pages || []).concat(archivePages).slice(0, MAX_ARCHIVE_PAGES)) {
    const archive = await fetchBounded(extraPage, options, false);
    if (archive.status !== 'parsed') {
      blockedNotes.push({ source: 'archive_page', url: extraPage, reason: archive.blocked_reason || archive.status });
      continue;
    }
    for (const link of discoverOfficialLinks(archive.text, extraPage, profile)) {
      if (link.link_type === 'pdf_file' && !documentUrlsFound.includes(link.url)) {
        documentUrlsFound.push(link.url);
        discoveredLinks.push(link);
        if (link.url) documentLinkMeta.set(link.url, link);
      }
    }
  }

  for (const url of await searchOfficialDocuments(profile, options)) {
    if (DOC_URL_RE.test(url) && !documentUrlsFound.includes(url)) {
      documentUrlsFound.push(url);
      discoveredLinks.push({ url, label: 'Official document found by public search', link_type: 'pdf_file' });
      documentLinkMeta.set(url, { url, label: 'Official document found by public search', link_type: 'pdf_file' });
    }
  }

  const documentLedger = readDocumentLedger(options, profile);
  const documentDocsDiscovered = documentUrlsFound.length;
  const documentSelection = documentUrlsFound
    .map((url) => {
      const meta = documentLinkMeta.get(url) || {};
      const label = cleanText(meta.label);
      const postingMonth = postingMonthFromText(`${url} ${label} ${profile.source_name} ${profile.county}`, new Date());
      return { url, label, postingMonth, meta };
    })
    .filter((item) => !documentAlreadyRead(documentLedger, item.url, item.postingMonth));
  const selectedDocumentUrls = documentSelection.slice(0, MAX_DOCS_PER_COUNTY);
  const documentUrlsLedgerSkipped = documentDocsDiscovered - documentSelection.length;
  const scannedDocs = [];
  for (const selected of selectedDocumentUrls) {
    const url = selected.url;
    const doc = await fetchBounded(url, options, true);
    const proofUrl = cleanText(doc.final_pdf_url) || url;
    if (doc.final_pdf_url && !isOfficialHost(proofUrl, profile)) {
      documentUrlsSkipped.push({ url: proofUrl, wrapper_url: cleanText(doc.wrapper_url), reason: 'embedded_pdf_official_host_mismatch' });
      recordDocumentLedgerAttempt(documentLedger, url, selected.postingMonth, 'hard_failed');
      continue;
    }
    if (doc.status === 'parsed' && doc.kind === 'pdf') {
      documentUrlsParsed.push(proofUrl);
      rawRows = rawRows.concat(txTrusteeNoticeExtractor.extractTrusteeNoticeRows(doc.text, {
        county: profile.county,
        state: profile.state,
        city_names: profile.city_names,
        excluded_address_pattern: profile.excluded_address_pattern,
        max_rows: MAX_ROWS
      }, {
        source_url: profile.source_url,
        source_proof_url: proofUrl,
        source_reference: `official ${profile.county} County foreclosure notice document`
      }));
      recordDocumentLedgerAttempt(documentLedger, url, selected.postingMonth, 'done');
    } else {
      documentUrlsSkipped.push({ url: proofUrl, wrapper_url: cleanText(doc.wrapper_url), reason: doc.blocked_reason || doc.status });
      if (doc.status === 'blocked') blockedNotes.push({ source: 'official_document', url: proofUrl, reason: doc.blocked_reason });
      if (doc.blocked_reason === 'pdf_scanned_no_text_layer' && doc.buffer) {
        scannedDocs.push({ url: proofUrl, document_url: proofUrl, wrapper_url: cleanText(doc.wrapper_url), buffer: doc.buffer, profile, source_url: profile.source_url, posting_month: selected.postingMonth });
      }
      recordDocumentLedgerAttempt(documentLedger, proofUrl, selected.postingMonth, doc.status === 'parsed' || doc.status === 'skipped' ? 'done' : 'hard_failed');
    }
    if (rawRows.length >= MAX_ROWS) break;
  }

  // Bounded OCR lane for open official scans (profile can opt out).
  let ocrDiagnostics = null;
  if (scannedDocs.length && options.enable_ocr !== false && profile.allow_ocr !== false) {
    try {
      const ocrImpl = typeof options.ocr_extraction_impl === 'function'
        ? options.ocr_extraction_impl
        : require('../research/ocr-notice-extraction').runOcrNoticeExtraction;
      const ocrOut = await ocrImpl({
        documents: scannedDocs,
        caps: options.ocr_caps
      }, {
        playwright_impl: options.playwright_impl,
        render_impl: options.ocr_render_impl,
        ocr_impl: options.ocr_impl
      });
      ocrDiagnostics = ocrOut.diagnostics;
      for (const row of ocrOut.rows || []) {
        if (rawRows.length >= MAX_ROWS) break;
        rawRows.push(row);
      }
      for (const attempt of ocrOut.attempts || []) {
        if (attempt.status === 'ocr_done') documentUrlsParsed.push(`${attempt.url} (ocr)`);
      }
      for (const doc of scannedDocs) {
        const ocrAttempt = (ocrOut.attempts || []).find((attempt) => cleanText(attempt.url) === cleanText(doc.url));
        recordDocumentLedgerAttempt(documentLedger, doc.document_url || doc.url, doc.posting_month || postingMonthFromText(`${doc.url} ${doc.wrapper_url} ${doc.source_url}`, new Date()), ocrAttempt && ocrAttempt.status === 'ocr_done' ? 'done' : 'hard_failed');
      }
    } catch (error) {
      ocrDiagnostics = { ocr_failures: scannedDocs.length, ocr_error: cleanText(error && error.message).slice(0, 80) };
      for (const doc of scannedDocs) {
        recordDocumentLedgerAttempt(documentLedger, doc.document_url || doc.url, doc.posting_month || postingMonthFromText(`${doc.url} ${doc.wrapper_url} ${doc.source_url}`, new Date()), 'hard_failed');
      }
    }
  }
  if (scannedDocs.length && (!ocrDiagnostics || !ocrDiagnostics.ocr_failures)) {
    // No OCR run, or OCR succeeded but a doc never got matched explicitly.
    for (const doc of scannedDocs) {
      if (!documentAlreadyRead(documentLedger, doc.document_url || doc.url, doc.posting_month || postingMonthFromText(`${doc.url} ${doc.wrapper_url} ${doc.source_url}`, new Date()))) {
        recordDocumentLedgerAttempt(documentLedger, doc.document_url || doc.url, doc.posting_month || postingMonthFromText(`${doc.url} ${doc.wrapper_url} ${doc.source_url}`, new Date()), 'hard_failed');
      }
    }
  }
  writeDocumentLedger(documentLedger, new Date(), options, profile);

  const context = { acquisition_run_id: runId, city: '', state: profile.state };
  const candidates = rawRows.slice(0, MAX_ROWS).map((row) => propertyCandidate.normalizePropertyCandidate(Object.assign({}, row, {
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: 'preforeclosure_trustee_notice',
    motivation_type: 'preforeclosure_trustee_notice',
    motivation_evidence_text: row.source_proof_text,
    status_evidence_text: row.sale_date ? `Sale Date: ${row.sale_date}` : ''
  }), context));
  const cards = candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, {
    acquisition_run_id: runId,
    city: candidate.city || '',
    state: profile.state
  }));

  const blockedReason = candidates.length ? '' : (blockedNotes[0] && blockedNotes[0].reason) || (documentUrlsFound.length ? 'no_property_rows_from_official_documents' : 'official_documents_gated_see_portal_note');
  return {
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: 'preforeclosure_trustee_notice',
    county: profile.county,
    state: profile.state,
    source_url: profile.source_url,
    status: candidates.length ? 'available' : 'needs_manual_review',
    attempted: true,
    message: candidates.length
      ? `${candidates.length} notice rows from official ${profile.county} County documents.`
      : `${profile.blocked_note}`,
    blocked_reason: blockedReason,
    candidates,
    cards,
    candidate_count: candidates.length,
    discovered_links: discoveredLinks,
    document_urls_found: documentUrlsFound,
    document_urls_parsed: documentUrlsParsed,
    document_urls_skipped: documentUrlsSkipped,
    blocked_notes: blockedNotes,
    ocr: ocrDiagnostics,
    diagnostics: {
      county: profile.county,
      official_page_status: page.status,
      document_urls_found_count: documentUrlsFound.length,
      document_urls_parsed_count: documentUrlsParsed.length,
      document_urls_discovered_count: documentDocsDiscovered,
      document_urls_processed_count: selectedDocumentUrls.length,
      document_urls_ledger_skipped_count: documentUrlsLedgerSkipped,
      docs_discovered: documentDocsDiscovered,
      docs_processed: selectedDocumentUrls.length,
      docs_ledger_skipped: documentUrlsLedgerSkipped,
      rows_extracted: rawRows.length,
      blocked_notes: blockedNotes,
      ocr: ocrDiagnostics,
      portal_note: profile.blocked_note
    },
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    captured_at: capturedAt
  };
}

module.exports = {
  MAX_DOCS_PER_COUNTY,
  documentLedgerFilePath,
  marketKeyForLedger,
  readDocumentLedger,
  writeDocumentLedger,
  documentAlreadyRead,
  recordDocumentLedgerAttempt,
  pruneDocumentLedger,
  runTxCountyForeclosureAcquisitionAdapter
};
