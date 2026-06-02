'use strict';

const crypto = require('crypto');

const fileEvidenceAdapter = require('./dallas-browser-file-evidence-adapter');

const MAX_BROWSER_PAGES = 8;
const MAX_BROWSER_LINKS = 8;
const MAX_CANDIDATES = 10;
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TEXT_BLOCKS = 40;

const SAFE_HOSTS = new Set([
  'www.dallascounty.org',
  'dallascounty.org',
  'dallas.texas.sheriffsaleauctions.com'
]);

const BLOCKED_PAGE_RE = /\b(captcha|human verification|verify you are human|access denied|forbidden|login required|sign in|register to bid|create an account)\b/i;
const BLOCKED_LINK_RE = /\b(login|sign in|register|captcha|facebook|twitter|x\.com|instagram|youtube|linkedin|privacy|terms|contact us|directory|calendar)\b/i;
const PROPERTY_HINT_RE = /\b(property|address|parcel|account|case|cause|suit|tax|sheriff|sale|auction|bid|judgment|foreclosure|resale|notice)\b/i;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeId(value) {
  return crypto.createHash('sha1').update(cleanText(value) || crypto.randomUUID()).digest('hex').slice(0, 16);
}

function isSafeDallasOfficialUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    return SAFE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (error) {
    return false;
  }
}

function shouldBlockLink(link) {
  const text = cleanText(`${link && link.url} ${link && link.label}`).toLowerCase();
  if (!text || BLOCKED_LINK_RE.test(text)) return true;
  return false;
}

function normalizeLink(link, baseUrl) {
  const rawUrl = cleanText(link && link.url ? link.url : link);
  if (!rawUrl || /^javascript:/i.test(rawUrl) || rawUrl.charAt(0) === '#') return null;
  let url;
  try {
    url = new URL(rawUrl, baseUrl).toString();
  } catch (error) {
    return null;
  }
  const normalized = {
    url,
    label: cleanText(link && link.label).slice(0, 160),
    link_type: fileEvidenceAdapter.classifyEvidenceLink({ url, label: link && link.label })
  };
  if (!isSafeDallasOfficialUrl(url) || shouldBlockLink(normalized)) return null;
  const haystack = cleanText(`${normalized.url} ${normalized.label}`);
  if (normalized.link_type === 'unknown' && !PROPERTY_HINT_RE.test(haystack)) return null;
  return normalized;
}

function dedupeLinks(links, baseUrl) {
  const seen = new Set();
  const out = [];
  for (const link of Array.isArray(links) ? links : []) {
    const normalized = normalizeLink(link, baseUrl);
    if (!normalized) continue;
    const key = normalized.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= MAX_BROWSER_LINKS) break;
  }
  return out;
}

function pageSnapshotFromHtml(html, url) {
  const links = fileEvidenceAdapter.discoverEvidenceLinksFromHtml(html, url);
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:tr|p|div|li|h\d|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    url,
    title: '',
    visible_text: text,
    tables: [],
    links
  };
}

function extractBlocksFromSnapshot(snapshot) {
  const blocks = [];
  const tables = Array.isArray(snapshot && snapshot.tables) ? snapshot.tables : [];
  for (const table of tables) {
    const rows = Array.isArray(table && table.rows) ? table.rows : [];
    const headers = Array.isArray(rows[0]) ? rows[0].map(cleanText) : [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const text = Array.isArray(row) ? row.map(cleanText).filter(Boolean).join(' | ') : cleanText(row);
      if (!text) continue;
      if (index > 0 && headers.length && Array.isArray(row)) {
        const labeled = row.map((cell, cellIndex) => {
          const label = headers[cellIndex] || '';
          const value = cleanText(cell);
          return label && value ? `${label}: ${value}` : value;
        }).filter(Boolean).join(' | ');
        if (labeled) {
          blocks.push(labeled);
          continue;
        }
      }
      blocks.push(text);
    }
  }
  const visibleText = cleanText(snapshot && (snapshot.visible_text || snapshot.text));
  if (visibleText) {
    const chunks = visibleText
      .split(/\n+|(?=\b\d{1,6}\s+[A-Za-z0-9.'# -]{2,80}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pkwy|parkway|pl|place|trl|trail|way|loop|ter|terrace|hwy|highway)\b)/i)
      .map(cleanText)
      .filter(Boolean)
      .slice(0, MAX_TEXT_BLOCKS);
    blocks.push(...chunks);
  }
  return {
    text: blocks.join('\n'),
    visible_tables_found: tables.filter((table) => Array.isArray(table && table.rows) && table.rows.length).length,
    visible_text_blocks_checked: blocks.length
  };
}

function extractCandidatesFromSnapshot(snapshot, context = {}) {
  const blocks = extractBlocksFromSnapshot(snapshot);
  const sourceProofUrl = cleanText(snapshot && snapshot.url) || cleanText(context.source_proof_url || context.source_url);
  const candidates = fileEvidenceAdapter.extractCandidateRowsFromText(blocks.text, {
    source_url: cleanText(context.source_url) || sourceProofUrl,
    source_proof_url: sourceProofUrl,
    source_reference: cleanText(snapshot && snapshot.title) || 'visible official source page',
    max_candidates: context.max_candidates || MAX_CANDIDATES
  });
  return {
    candidates,
    visible_tables_found: blocks.visible_tables_found,
    visible_text_blocks_checked: blocks.visible_text_blocks_checked
  };
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = cleanText([
      candidate.address,
      candidate.case_number,
      candidate.parcel || candidate.apn,
      candidate.sale_date || candidate.auction_date,
      candidate.source_record_url
    ].filter(Boolean).join('|')).toLowerCase() || safeId(JSON.stringify(candidate));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

async function createBrowser(options = {}) {
  if (options.browser) return { browser: options.browser, close: false };
  if (typeof options.browser_factory === 'function') {
    const browser = await options.browser_factory();
    return { browser, close: true };
  }
  let playwright;
  try {
    playwright = require('playwright');
  } catch (error) {
    return { browser: null, close: false, blocked_reason: 'playwright_not_available' };
  }
  try {
    const browser = await playwright.chromium.launch({
      headless: options.headless !== false,
      timeout: Math.min(Number(options.timeout_ms || DEFAULT_TIMEOUT_MS), DEFAULT_TIMEOUT_MS)
    });
    return { browser, close: true };
  } catch (error) {
    return { browser: null, close: false, blocked_reason: error.message || 'browser_unavailable' };
  }
}

async function snapshotPage(page, url, options = {}) {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: Math.min(Number(options.timeout_ms || DEFAULT_TIMEOUT_MS), DEFAULT_TIMEOUT_MS)
  });
  await page.waitForTimeout(Math.min(Number(options.settle_ms || 750), 1500));
  return page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    const tables = Array.from(document.querySelectorAll('table')).slice(0, 12).map((table) => ({
      caption: table.caption ? table.caption.innerText : '',
      rows: Array.from(table.querySelectorAll('tr')).slice(0, 80).map((tr) => (
        Array.from(tr.querySelectorAll('th,td')).map((cell) => cell.innerText)
      ))
    }));
    const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 150).map((a) => ({
      url: a.href,
      label: a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || ''
    }));
    return {
      url: location.href,
      title: document.title || '',
      visible_text: text,
      tables,
      links
    };
  });
}

async function runSnapshots(options, initialLinks) {
  const source = options.source || {};
  const maxPages = Math.max(1, Math.min(Number(options.max_pages || MAX_BROWSER_PAGES) || MAX_BROWSER_PAGES, MAX_BROWSER_PAGES));
  const maxCandidates = Math.max(1, Math.min(Number(options.max_candidates || MAX_CANDIDATES) || MAX_CANDIDATES, MAX_CANDIDATES));
  const queue = initialLinks.slice(0, maxPages);
  const queued = new Set(queue.map((link) => link.url.toLowerCase()));
  const pages = [];
  const candidates = [];
  let browserLinksFollowed = 0;
  let visibleTablesFound = 0;
  let visibleTextBlocksChecked = 0;
  let blockedReason = '';
  const browserHandle = await createBrowser(options);
  if (!browserHandle.browser) {
    return {
      pages,
      candidates,
      browser_links_followed: 0,
      visible_tables_found: 0,
      visible_text_blocks_checked: 0,
      blocked_reason: browserHandle.blocked_reason || 'browser_unavailable'
    };
  }
  const browser = browserHandle.browser;
  let page = null;
  try {
    page = await browser.newPage();
    while (queue.length && pages.length < maxPages && candidates.length < maxCandidates) {
      const link = queue.shift();
      if (!isSafeDallasOfficialUrl(link.url) || shouldBlockLink(link)) continue;
      const snapshot = await snapshotPage(page, link.url, options);
      const pageText = cleanText(snapshot.visible_text);
      if (BLOCKED_PAGE_RE.test(pageText)) {
        pages.push({ url: link.url, status: 'blocked', blocked_reason: 'source_requires_login_or_human_review' });
        blockedReason = blockedReason || 'source_requires_login_or_human_review';
        continue;
      }
      browserLinksFollowed += link.url === cleanText(options.source_url || source.source_url) ? 0 : 1;
      const extracted = extractCandidatesFromSnapshot(snapshot, {
        source_url: cleanText(options.source_url || source.source_url || link.url),
        max_candidates: maxCandidates - candidates.length
      });
      visibleTablesFound += extracted.visible_tables_found;
      visibleTextBlocksChecked += extracted.visible_text_blocks_checked;
      candidates.push(...extracted.candidates);
      pages.push({
        url: snapshot.url || link.url,
        title: cleanText(snapshot.title),
        status: 'checked',
        candidates_found: extracted.candidates.length,
        visible_tables_found: extracted.visible_tables_found,
        visible_text_blocks_checked: extracted.visible_text_blocks_checked
      });
      const discovered = dedupeLinks(snapshot.links, snapshot.url || link.url);
      for (const found of discovered) {
        const key = found.url.toLowerCase();
        if (queued.has(key)) continue;
        queued.add(key);
        if (queue.length + pages.length < maxPages) queue.push(found);
      }
    }
  } catch (error) {
    blockedReason = error.message || 'browser_capture_failed';
  } finally {
    if (page && typeof page.close === 'function') {
      try { await page.close(); } catch (error) {}
    }
    if (browserHandle.close && browser && typeof browser.close === 'function') {
      try { await browser.close(); } catch (error) {}
    }
  }
  return {
    pages,
    candidates: dedupeCandidates(candidates).slice(0, maxCandidates),
    browser_links_followed: browserLinksFollowed,
    visible_tables_found: visibleTablesFound,
    visible_text_blocks_checked: visibleTextBlocksChecked,
    blocked_reason: blockedReason
  };
}

async function runDallasControlledBrowserCapture(options = {}) {
  const source = options.source || {};
  const sourceUrl = cleanText(options.source_url || source.source_url);
  const maxCandidates = Math.max(1, Math.min(Number(options.max_candidates || MAX_CANDIDATES) || MAX_CANDIDATES, MAX_CANDIDATES));
  const initialLinks = dedupeLinks([].concat(
    sourceUrl ? [{ url: sourceUrl, label: source.source_name || 'Official Dallas source' }] : [],
    Array.isArray(options.evidence_links) ? options.evidence_links : []
  ), sourceUrl);
  const startedAt = Date.now();
  let snapshotResult;
  if (Array.isArray(options.page_snapshots)) {
    const pages = [];
    const candidates = [];
    let visibleTablesFound = 0;
    let visibleTextBlocksChecked = 0;
    for (const snapshot of options.page_snapshots.slice(0, MAX_BROWSER_PAGES)) {
      if (!isSafeDallasOfficialUrl(snapshot.url || sourceUrl)) continue;
      const text = cleanText(snapshot.visible_text || snapshot.text);
      if (BLOCKED_PAGE_RE.test(text)) {
        pages.push({ url: snapshot.url || sourceUrl, status: 'blocked', blocked_reason: 'source_requires_login_or_human_review' });
        continue;
      }
      const extracted = extractCandidatesFromSnapshot(snapshot, {
        source_url: sourceUrl || snapshot.url,
        max_candidates: maxCandidates - candidates.length
      });
      visibleTablesFound += extracted.visible_tables_found;
      visibleTextBlocksChecked += extracted.visible_text_blocks_checked;
      candidates.push(...extracted.candidates);
      pages.push({
        url: snapshot.url || sourceUrl,
        title: cleanText(snapshot.title),
        status: 'checked',
        candidates_found: extracted.candidates.length,
        visible_tables_found: extracted.visible_tables_found,
        visible_text_blocks_checked: extracted.visible_text_blocks_checked
      });
    }
    snapshotResult = {
      pages,
      candidates: dedupeCandidates(candidates).slice(0, maxCandidates),
      browser_links_followed: 0,
      visible_tables_found: visibleTablesFound,
      visible_text_blocks_checked: visibleTextBlocksChecked,
      blocked_reason: pages.some((page) => page.blocked_reason) ? 'source_requires_login_or_human_review' : ''
    };
  } else {
    snapshotResult = await runSnapshots(options, initialLinks);
  }
  const candidates = snapshotResult.candidates || [];
  const pages = snapshotResult.pages || [];
  const blockedReason = candidates.length
    ? ''
    : snapshotResult.blocked_reason || (pages.length || initialLinks.length ? 'needs_browser_assist' : 'no_official_links_found');
  return {
    ok: true,
    provider: 'dallas_controlled_browser_capture',
    status: candidates.length ? 'candidates_found' : blockedReason,
    browser_capture_attempted: true,
    browser_pages_checked: pages.length,
    browser_links_followed: snapshotResult.browser_links_followed || 0,
    visible_tables_found: snapshotResult.visible_tables_found || 0,
    visible_text_blocks_checked: snapshotResult.visible_text_blocks_checked || 0,
    evidence_links_found: initialLinks.length,
    candidates,
    candidates_extracted: candidates.length,
    pages,
    blocked_reason: blockedReason,
    runtime_ms: Date.now() - startedAt,
    captured_at: options.captured_at || nowIso(),
    preview_only: true,
    should_ingest: false
  };
}

module.exports = {
  isSafeDallasOfficialUrl,
  dedupeLinks,
  pageSnapshotFromHtml,
  extractCandidatesFromSnapshot,
  runDallasControlledBrowserCapture
};
