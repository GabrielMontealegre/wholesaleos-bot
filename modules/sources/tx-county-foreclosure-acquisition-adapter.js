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

const propertyCandidate = require('../research/property-candidate');
const searchProviderWorker = require('../research/search-provider-worker');
const txTrusteeNoticeExtractor = require('../research/tx-trustee-notice-text-extractor');
const countyProfiles = require('./tx-county-foreclosure-source-profiles');

const MAX_DOCS_PER_COUNTY = 5;
const MAX_ROWS = 25;
const MAX_LINKS = 20;
const MAX_ARCHIVE_PAGES = 2;
const MAX_PDF_BYTES = 6 * 1024 * 1024;
// CivicPlus county sites carry "Sign In" navigation on every public page -
// only treat explicit gate language as blocked, never bare nav text.
const BLOCKED_PAGE_RE = /\b(captcha|verify you are human|human verification|access denied|login required|sign in to (?:view|continue|access)|must (?:log|sign) in|create an account to|incapsula|request unsuccessful|subscription required|paywall)\b/i;
const DOC_KEYWORD_RE = /\b(foreclos|trustee|notice|sale|auction|sheriff|tax)/i;
// Direct document URLs: plain PDFs plus CivicPlus DocumentCenter/Archive/
// ShowDocument patterns (they serve PDFs without a .pdf extension).
const DOC_URL_RE = /\.pdf(?:$|[?#])|\/DocumentCenter\/View\/\d+|Archive\.aspx\?[^"']*ADID=\d+|ShowDocument\?id=\d+/i;
const ARCHIVE_PAGE_RE = /Archive\.aspx\?[^"']*AMID=\d+/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function nowIso() {
  return new Date().toISOString();
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

async function fetchBounded(url, options, expectPdf) {
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
    if (contentType.includes('pdf') || /\.pdf(?:$|[?#])/i.test(url)) {
      if (declaredLength > MAX_PDF_BYTES) return { status: 'skipped', blocked_reason: `pdf_too_large_${Math.round(declaredLength / 1048576)}mb` };
      try {
        const pdfParse = require('pdf-parse');
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_PDF_BYTES) return { status: 'skipped', blocked_reason: 'pdf_too_large' };
        const parsed = await pdfParse(buffer);
        const text = String(parsed && parsed.text || '');
        if (cleanText(text).length < 100) {
          // Image-only scan: the document is real evidence but unreadable
          // without OCR - report it, do not guess.
          return { status: 'skipped', blocked_reason: 'pdf_scanned_no_text_layer' };
        }
        return { status: 'parsed', kind: 'pdf', text };
      } catch (error) {
        return { status: 'failed', blocked_reason: 'pdf_parse_failed' };
      }
    }
    const text = await response.text();
    if (BLOCKED_PAGE_RE.test(text)) return { status: 'blocked', blocked_reason: 'captcha_or_bot_wall' };
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
    links.push({ url, label, link_type: isDoc ? 'pdf_file' : isArchive ? 'archive_page' : 'official_page', keyword_hit: keywordHit });
  }
  return links
    .sort((a, b) => ((b.link_type === 'pdf_file' ? 2 : 0) + (b.keyword_hit || 0)) - ((a.link_type === 'pdf_file' ? 2 : 0) + (a.keyword_hit || 0)))
    .slice(0, MAX_LINKS);
}

async function searchOfficialDocuments(profile, options) {
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
  let rawRows = [];

  const archivePages = [];
  const page = await fetchBounded(profile.source_url, options, false);
  if (page.status === 'parsed') {
    for (const link of discoverOfficialLinks(page.text, profile.source_url, profile)) {
      discoveredLinks.push(link);
      if (link.link_type === 'pdf_file') documentUrlsFound.push(link.url);
      if (link.link_type === 'archive_page') archivePages.push(link.url);
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
      }
    }
  }

  for (const url of await searchOfficialDocuments(profile, options)) {
    if (DOC_URL_RE.test(url) && !documentUrlsFound.includes(url)) {
      documentUrlsFound.push(url);
      discoveredLinks.push({ url, label: 'Official document found by public search', link_type: 'pdf_file' });
    }
  }

  for (const url of documentUrlsFound.slice(0, MAX_DOCS_PER_COUNTY)) {
    const doc = await fetchBounded(url, options, true);
    if (doc.status === 'parsed' && doc.kind === 'pdf') {
      documentUrlsParsed.push(url);
      rawRows = rawRows.concat(txTrusteeNoticeExtractor.extractTrusteeNoticeRows(doc.text, {
        county: profile.county,
        state: profile.state,
        city_names: profile.city_names,
        max_rows: MAX_ROWS
      }, {
        source_url: profile.source_url,
        source_proof_url: url,
        source_reference: `official ${profile.county} County foreclosure notice document`
      }));
    } else {
      documentUrlsSkipped.push({ url, reason: doc.blocked_reason || doc.status });
      if (doc.status === 'blocked') blockedNotes.push({ source: 'official_document', url, reason: doc.blocked_reason });
    }
    if (rawRows.length >= MAX_ROWS) break;
  }

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
    diagnostics: {
      county: profile.county,
      official_page_status: page.status,
      document_urls_found_count: documentUrlsFound.length,
      document_urls_parsed_count: documentUrlsParsed.length,
      rows_extracted: rawRows.length,
      blocked_notes: blockedNotes,
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
  runTxCountyForeclosureAcquisitionAdapter
};
