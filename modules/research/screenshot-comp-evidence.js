'use strict';

// Screenshot Comp Evidence Layer.
// Opens PUBLIC property/sold pages in a real (Playwright) browser, captures a
// screenshot + the rendered DOM text, and extracts candidate comps from what
// is actually VISIBLE. Candidates only become verified comps when the
// deterministic validator confirms full address, sold status, sold price,
// sold date, a property-specific source URL, and that the comp is not the
// subject - each with screenshot/text evidence attached.
//
// Hard rules:
// - public pages only; captcha/login/paywall/403/429 stop the page and are
//   reported as blocked, never bypassed
// - extractor output (AI/OCR or deterministic) is CANDIDATE data; validation
//   decides verified status - uncertain output stays candidate-only
// - screenshots live only in the git-ignored .cache directory
// - preview-only: no DB writes, nothing ingested

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const compResearchProvider = require('./comp-research-provider');

const DEFAULT_CAPS = Object.freeze({
  max_rows: 6,
  max_pages_per_row: 4,
  max_screenshots_per_row: 4,
  timeout_ms: 10000,
  total_budget_ms: 90000
});

const BLOCKED_TEXT_RE = /\b(captcha|verify you are human|human verification|access denied|denied access|forbidden|login required|sign in to view|create an account|subscription required|paywall|press & hold|are you a robot)\b/i;
const LIVE_STATE_PATTERNS = Object.freeze({
  TX: 'TX|Texas',
  CA: 'CA|California',
  MI: 'MI|Michigan'
});
const SOLD_DATE_PATTERN = '(?:\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})|(?:[A-Z][a-z]{2,8}\\.?\\s+\\d{1,2},?\\s+\\d{4})';
const ADDRESS_START_PATTERN = "\\d{1,7}\\s+[A-Za-z0-9 .'#-]{3,60}(?:,\\s*[A-Za-z .'-]{2,40})?,?\\s*";

function soldCardRegexes(state) {
  const stateCode = cleanText(state).toUpperCase();
  const statePattern = LIVE_STATE_PATTERNS[stateCode] || LIVE_STATE_PATTERNS.TX;
  const addressPattern = `${ADDRESS_START_PATTERN}(?:${statePattern})\\s*\\d{5}`;
  return {
    primary: new RegExp(`(\\$[\\d,]{4,12})[^]{0,120}?\\bsold\\b[^]{0,60}?(${SOLD_DATE_PATTERN})[^]{0,240}?(${addressPattern})`, 'gi'),
    alternate: new RegExp(`(${addressPattern})[^]{0,240}?\\bsold\\b[^]{0,80}?(${SOLD_DATE_PATTERN})[^]{0,120}?(\\$[\\d,]{4,12})`, 'gi')
  };
}

const SOLD_CARD_RE = soldCardRegexes('TX').primary;
const SOLD_CARD_ALT_RE = soldCardRegexes('TX').alternate;
const FACTS_RE = /(\d+)\s*(?:bd|beds?)\b[^]{0,30}?(\d+(?:\.\d+)?)\s*(?:ba|baths?)\b[^]{0,40}?([\d,]{3,6})\s*(?:sq\s?ft|sqft)/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeCaps(caps) {
  const merged = Object.assign({}, DEFAULT_CAPS, caps || {});
  merged.max_rows = Math.max(1, Math.min(Number(merged.max_rows) || DEFAULT_CAPS.max_rows, 6));
  merged.max_pages_per_row = Math.max(1, Math.min(Number(merged.max_pages_per_row) || DEFAULT_CAPS.max_pages_per_row, 4));
  merged.max_screenshots_per_row = Math.max(0, Math.min(Number(merged.max_screenshots_per_row) || DEFAULT_CAPS.max_screenshots_per_row, 4));
  merged.timeout_ms = Math.max(2000, Math.min(Number(merged.timeout_ms) || DEFAULT_CAPS.timeout_ms, 10000));
  return merged;
}

function screenshotDir(options) {
  return path.resolve(cleanText(options && options.screenshot_dir) || path.join(__dirname, '..', '..', '.cache', 'screenshot-comp-evidence'));
}

function addressKey(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function moneyToNumber(value) {
  return Number(cleanText(value).replace(/[^0-9]/g, '')) || 0;
}

// Deterministic extractor: reads visible sold cards out of rendered page text.
// This is the default "vision" - an AI/OCR adapter can be injected via
// options.extractor_impl and its output goes through the SAME validation.
function extractCompCandidatesFromVisibleText(pageText, context = {}) {
  const source = String(pageText || '');
  const candidates = [];
  const seen = new Set();
  const patterns = soldCardRegexes(context.state);
  const push = (address, soldDate, price, matchText) => {
    const key = addressKey(address);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const facts = source.match(FACTS_RE);
    candidates.push({
      address: cleanText(address),
      comp_address: cleanText(address),
      sold_status: 'sold',
      sold_price: moneyToNumber(price),
      sold_date: cleanText(soldDate),
      beds: facts ? Number(facts[1]) || null : null,
      baths: facts ? Number(facts[2]) || null : null,
      sqft: facts ? Number(cleanText(facts[3]).replace(/,/g, '')) || null : null,
      source_url: cleanText(context.source_url),
      evidence_text: cleanText(matchText).slice(0, 300),
      confidence: 'Medium',
      risk_flags: ['visible_page_text_extraction']
    });
  };
  let match;
  patterns.primary.lastIndex = 0;
  while ((match = patterns.primary.exec(source)) && candidates.length < 8) push(match[3], match[2], match[1], match[0]);
  patterns.alternate.lastIndex = 0;
  while ((match = patterns.alternate.exec(source)) && candidates.length < 8) push(match[1], match[2], match[3], match[0]);
  return candidates;
}

function validateScreenshotComp(candidate, subjectAddress) {
  const normalized = {
    comp_address: cleanText(candidate.comp_address || candidate.address),
    sold_status: cleanText(candidate.sold_status),
    sold_price: Number(candidate.sold_price) || 0,
    sold_date: cleanText(candidate.sold_date),
    source_url: cleanText(candidate.source_url)
  };
  const validation = compResearchProvider.validateVerifiedCompCandidate(normalized);
  const missing = validation.missing_fields.slice();
  const hasEvidence = !!(cleanText(candidate.evidence_text) || cleanText(candidate.screenshot_path) || cleanText(candidate.evidence_id));
  if (!hasEvidence) missing.push('Visible screenshot/text evidence');
  const isSubject = addressKey(normalized.comp_address) && addressKey(normalized.comp_address) === addressKey(subjectAddress);
  if (isSubject) missing.push('Different property than subject');
  const uncertain = /low|uncertain/i.test(cleanText(candidate.confidence));
  if (uncertain) missing.push('Confident extraction (uncertain AI/OCR output stays candidate-only)');
  return { verified: missing.length === 0, missing_fields: missing, is_subject: isSubject };
}

function targetsForRow(row, cap) {
  const urls = [
    row.zillow_url, row.redfin_url, row.realtor_url, row.auction_url,
    row.official_property_record_url
  ].concat((Array.isArray(row.comp_candidates) ? row.comp_candidates : []).map((item) => item && item.source_url));
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    const clean = cleanText(url);
    if (!/^https?:/i.test(clean) || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(clean);
    if (out.length >= cap) break;
  }
  return out;
}

function statusFor(verified, candidates, blocked, pagesVisited) {
  if (verified.length >= 3) return 'COMP_READY';
  if (verified.length >= 1) return 'COMP_PARTIAL';
  if (candidates.length) return 'COMP_CANDIDATES_ONLY';
  if (blocked.length) return 'COMP_BLOCKED_PUBLIC_SOURCE';
  return pagesVisited ? 'COMP_NOT_FOUND' : 'COMP_NOT_FOUND';
}

function nextActionFor(status) {
  if (status === 'COMP_READY') return 'REVIEW_VERIFIED_COMPS_AND_CALCULATE_ARV';
  if (status === 'COMP_PARTIAL') return 'FIND_REMAINING_VERIFIED_COMPS';
  if (status === 'COMP_CANDIDATES_ONLY') return 'MANUALLY_CONFIRM_COMP_CANDIDATES_ON_SOURCE_PAGES';
  if (status === 'COMP_BLOCKED_PUBLIC_SOURCE') return 'OPEN_BLOCKED_COMP_SOURCES_MANUALLY_IN_BROWSER';
  return 'DECIDE_PAID_COMP_DATA_OR_MANUAL_COMP_PULL';
}

async function evaluatePage(page, url, row, caps, options, evidenceDir, shotsUsed) {
  const out = { candidates: [], blocked: null, screenshot_path: '', source_url: url };
  let response = null;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: caps.timeout_ms });
  } catch (error) {
    out.blocked = { source: 'public_page', url, reason: `nav_failed:${cleanText(error && error.message).slice(0, 50)}` };
    return out;
  }
  const status = response ? response.status() : 0;
  if (status === 403 || status === 429) {
    out.blocked = { source: 'public_page', url, reason: `http_${status}` };
    return out;
  }
  const pageText = cleanText(await page.textContent('body').catch(() => ''));
  if (BLOCKED_TEXT_RE.test(pageText)) {
    out.blocked = { source: 'public_page', url, reason: 'captcha_or_login_wall' };
    return out;
  }
  if (shotsUsed.count < caps.max_screenshots_per_row) {
    try {
      const name = `comp-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)}-${Date.now()}.png`;
      out.screenshot_path = path.join(evidenceDir, name);
      await page.screenshot({ path: out.screenshot_path });
      shotsUsed.count += 1;
    } catch (error) {
      out.screenshot_path = '';
    }
  }
  const extractor = typeof options.extractor_impl === 'function' ? options.extractor_impl : null;
  const raw = extractor
    ? await extractor({ page_text: pageText, screenshot_path: out.screenshot_path, source_url: url, subject_address: row.normalized_address })
    : extractCompCandidatesFromVisibleText(pageText, { source_url: url });
  out.candidates = (Array.isArray(raw) ? raw : []).map((candidate) => Object.assign({}, candidate, {
    source_url: cleanText(candidate.source_url) || url,
    screenshot_path: cleanText(candidate.screenshot_path) || out.screenshot_path
  }));
  return out;
}

async function runScreenshotCompEvidence(input = {}, options = {}) {
  const caps = normalizeCaps(input.caps || options.caps);
  const rows = (Array.isArray(input.rows) ? input.rows : []).filter((row) => cleanText(row && row.normalized_address));
  const distinct = [];
  const seen = new Set();
  for (const row of rows) {
    const key = cleanText(row.normalized_address).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(row);
    if (distinct.length >= caps.max_rows) break;
  }
  const base = { rows_processed: distinct.length, preview_only: true, should_ingest: false, no_global_mutation: true };
  const results = new Map();
  if (!distinct.length) return Object.assign({ results, browser_runtime_available: false }, base);

  let playwright = options.playwright_impl;
  if (!playwright) {
    try { playwright = require('playwright'); } catch (error) { playwright = null; }
  }
  if (!playwright) {
    for (const row of distinct) {
      results.set(cleanText(row.normalized_address).toLowerCase(), {
        screenshot_comp_status: 'COMP_BLOCKED_PUBLIC_SOURCE',
        verified_comps: [],
        screenshot_comp_candidates: [],
        comp_evidence_links: [],
        blocked_sources: [{ source: 'browser_runtime', url: '', reason: 'browser_runtime_unavailable' }],
        next_comp_action: 'INSTALL_BROWSER_RUNTIME_OR_RETRY_MANUALLY',
        preview_only: true
      });
    }
    return Object.assign({ results, browser_runtime_available: false }, base);
  }

  const evidenceDir = screenshotDir(options);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const started = Date.now();
  let browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    });
    for (const row of distinct) {
      const key = cleanText(row.normalized_address).toLowerCase();
      if (Date.now() - started > (Number(caps.total_budget_ms) || DEFAULT_CAPS.total_budget_ms)) {
        results.set(key, {
          screenshot_comp_status: 'COMP_BLOCKED_PUBLIC_SOURCE',
          verified_comps: [], screenshot_comp_candidates: [], comp_evidence_links: [],
          blocked_sources: [{ source: 'budget', url: '', reason: 'screenshot_budget_exhausted' }],
          next_comp_action: 'OPEN_BLOCKED_COMP_SOURCES_MANUALLY_IN_BROWSER',
          preview_only: true
        });
        continue;
      }
      const targets = targetsForRow(row, caps.max_pages_per_row);
      const verified = [];
      const candidatesOnly = [];
      const blocked = [];
      const evidenceLinks = [];
      const shotsUsed = { count: 0 };
      const page = await context.newPage();
      page.setDefaultTimeout(caps.timeout_ms);
      try {
        for (const url of targets) {
          if (Date.now() - started > (Number(caps.total_budget_ms) || DEFAULT_CAPS.total_budget_ms)) break;
          const evaluated = await evaluatePage(page, url, row, caps, options, evidenceDir, shotsUsed);
          if (evaluated.blocked) { blocked.push(evaluated.blocked); continue; }
          if (evaluated.screenshot_path) evidenceLinks.push({ source_url: url, screenshot_path: evaluated.screenshot_path });
          for (const candidate of evaluated.candidates) {
            const verdict = validateScreenshotComp(candidate, row.normalized_address);
            if (verdict.is_subject) continue;
            if (verdict.verified && verified.length < 3) verified.push(candidate);
            else if (!verdict.verified) candidatesOnly.push(Object.assign({}, candidate, { missing_fields: verdict.missing_fields }));
          }
        }
      } finally {
        await page.close().catch(() => {});
      }
      const status = statusFor(verified, candidatesOnly, blocked, targets.length);
      results.set(key, {
        screenshot_comp_status: status,
        verified_comps: verified,
        screenshot_comp_candidates: candidatesOnly.slice(0, 6),
        comp_evidence_links: evidenceLinks,
        blocked_sources: blocked,
        next_comp_action: nextActionFor(status),
        preview_only: true
      });
    }
  } catch (error) {
    for (const row of distinct) {
      const key = cleanText(row.normalized_address).toLowerCase();
      if (results.has(key)) continue;
      results.set(key, {
        screenshot_comp_status: 'COMP_BLOCKED_PUBLIC_SOURCE',
        verified_comps: [], screenshot_comp_candidates: [], comp_evidence_links: [],
        blocked_sources: [{ source: 'browser_runtime', url: '', reason: `browser_launch_failed:${cleanText(error && error.message).slice(0, 50)}` }],
        next_comp_action: 'INSTALL_BROWSER_RUNTIME_OR_RETRY_MANUALLY',
        preview_only: true
      });
    }
    return Object.assign({ results, browser_runtime_available: false }, base);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return Object.assign({ results, browser_runtime_available: true }, base);
}

module.exports = {
  DEFAULT_CAPS,
  screenshotDir,
  addressKey,
  moneyToNumber,
  SOLD_CARD_RE,
  SOLD_CARD_ALT_RE,
  soldCardRegexes,
  extractCompCandidatesFromVisibleText,
  validateScreenshotComp,
  runScreenshotCompEvidence
};
