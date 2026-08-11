'use strict';

// Free public comp hunter.
// Bounded search for public sold-comp evidence near an address-backed row.
// A comp is only "verified" when the public page shows full address, sold
// status, sold price, sold date, and a property-specific source URL - and it
// is not the subject property. Anything less stays a candidate with its
// missing fields listed. Blocked pages are reported, never bypassed.

const compResearchProvider = require('./comp-research-provider');
const searchProviderWorker = require('./search-provider-worker');

const DEFAULT_CAPS = Object.freeze({
  max_rows: 6,
  max_pages_per_row: 3,
  max_search_queries_per_row: 2,
  timeout_ms: 8000,
  total_budget_ms: 45000
});

const PROPERTY_SOLD_URL_RE = /zillow\.com\/homedetails\/|redfin\.com\/[^"']*\/home\/|realtor\.com\/realestateandhomes-detail\//i;
const BLOCKED_PAGE_RE = /\b(captcha|verify you are human|human verification|access denied|forbidden|login required|sign in to view|create an account|subscription required|paywall)\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeCaps(caps) {
  const merged = Object.assign({}, DEFAULT_CAPS, caps || {});
  merged.max_rows = Math.max(1, Math.min(Number(merged.max_rows) || DEFAULT_CAPS.max_rows, 6));
  merged.max_pages_per_row = Math.max(1, Math.min(Number(merged.max_pages_per_row) || DEFAULT_CAPS.max_pages_per_row, 5));
  merged.max_search_queries_per_row = Math.max(0, Math.min(Number(merged.max_search_queries_per_row) || DEFAULT_CAPS.max_search_queries_per_row, 4));
  merged.timeout_ms = Math.max(1000, Math.min(Number(merged.timeout_ms) || DEFAULT_CAPS.timeout_ms, 8000));
  return merged;
}

function addressKey(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function soldFactsFromPage(html, url) {
  const source = String(html || '');
  const facts = { comp_address: '', sold_status: '', sold_price: 0, sold_date: '', source_url: cleanText(url), evidence_text: '' };
  const jsonLdBlocks = source.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLdBlocks) {
    try {
      const body = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      const data = JSON.parse(body);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const addr = node && node.address;
        if (addr && addr.streetAddress) {
          facts.comp_address = cleanText([addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(', '));
        }
      }
    } catch (error) { /* ignore malformed json-ld */ }
  }
  const soldMatch = source.match(/\bsold\b[^<]{0,40}(?:on|:)?\s*((?:\d{1,2}\/\d{1,2}\/\d{2,4})|(?:[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}))/i);
  if (soldMatch) {
    facts.sold_status = 'sold';
    facts.sold_date = cleanText(soldMatch[1]);
    facts.evidence_text = cleanText(soldMatch[0]).slice(0, 200);
  }
  const priceMatch = source.match(/\bsold(?:\s+(?:for|price))?[^$]{0,60}\$\s?([\d,]{4,12})/i) || source.match(/"price"\s*:\s*"?\$?([\d,]{4,12})"?[^}]{0,80}"(?:sold|RecentlySold)"/i);
  if (priceMatch) {
    facts.sold_price = Number(cleanText(priceMatch[1]).replace(/,/g, '')) || 0;
    facts.evidence_text = cleanText(`${facts.evidence_text} ${priceMatch[0]}`).slice(0, 260);
  }
  return facts;
}

async function fetchPage(url, options, budget) {
  if (!budget.allow()) return { status: 'skipped_budget', text: '' };
  const fetchImpl = options.fetch_impl || global.fetch || require('node-fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout_ms || 8000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'text/html', 'User-Agent': 'WholesaleOS Free Public Lookup Preview/1.0' }
    });
    if (response.status === 403 || response.status === 429) return { status: 'blocked', blocked_reason: `http_${response.status}`, text: '' };
    if (!response.ok) return { status: 'failed', blocked_reason: `http_${response.status}`, text: '' };
    const text = await response.text();
    if (BLOCKED_PAGE_RE.test(text)) return { status: 'blocked', blocked_reason: 'captcha_or_login_wall', text: '' };
    return { status: 'parsed', text };
  } catch (error) {
    return { status: 'failed', blocked_reason: cleanText(error && error.message).slice(0, 60) || 'fetch_failed', text: '' };
  } finally {
    clearTimeout(timer);
  }
}

function compStatus(verifiedCount, searchesRun) {
  if (verifiedCount >= 3) return 'COMP_READY';
  if (verifiedCount >= 1) return 'COMP_PARTIAL';
  return searchesRun.length ? 'COMP_SEARCH_EXHAUSTED_FREE' : 'COMP_SEARCH_NOT_RUN';
}

function compAttemptForRow(row, result, nowIso) {
  const status = cleanText(result && result.free_comp_status);
  const blocked = Array.isArray(result && result.blocked_sources) && result.blocked_sources.length;
  const found = status === 'COMP_READY' || status === 'COMP_PARTIAL';
  return {
    lane: 'sold_comp',
    attempted_at: nowIso,
    outcome: found ? 'FOUND' : blocked ? 'BLOCKED' : 'NOT_FOUND',
    reason_code: found ? status : blocked ? 'FREE_COMP_SOURCE_BLOCKED' : 'NO_VERIFIED_FREE_SOLD_COMPS',
    reason_text: found
      ? `${Number(result && result.verified_comps && result.verified_comps.length || 0)} verified public sold comp candidate(s) found.`
      : blocked
        ? 'Free public comp source blocked or unavailable.'
        : 'No verified public sold comps found in the bounded free search.',
    source_url: cleanText(row && (row.source_document_url || row.source_url)),
    cost_usd: 0,
    next_eligible_at: ''
  };
}

async function huntCompsForRow(row, options, caps, budget, cache) {
  const address = cleanText(row && row.normalized_address);
  const subjectKey = addressKey(address);
  const city = cleanText(row && row.city) || cleanText(address.split(',')[1]);
  const zip = (address.match(/\b\d{5}\b/) || [])[0] || '';
  const searchesRun = [];
  const blockedSources = [];
  const verified = [];
  const candidates = [];
  const streetName = cleanText((address.match(/^\d+\s+(.+?),/) || [])[1]);

  const queries = [];
  if (streetName && city) queries.push({ query: `"${streetName}" "${city}" sold site:zillow.com OR site:redfin.com OR site:realtor.com`, query_group: 'free_comp_street_sold' });
  if (zip && city) queries.push({ query: `recently sold homes ${zip} ${city}`, query_group: 'free_comp_zip_sold' });
  const boundedQueries = queries.slice(0, caps.max_search_queries_per_row);
  if (!boundedQueries.length || !budget.allow()) {
    return {
      free_comp_status: compStatus(0, searchesRun),
      verified_comps: [],
      comp_candidates: [],
      free_searches_run: searchesRun,
      blocked_sources: blockedSources,
      preview_only: true
    };
  }

  let pagesUsed = 0;
  try {
    const searchResult = Array.isArray(options.mock_search_results)
      ? { results: options.mock_search_results }
      : await searchProviderWorker.runSearchProvider({
        market: city,
        search_mode: 'sold_comp_lookup'
      }, {
        query_groups: boundedQueries.map((item, index) => ({
          query: item.query,
          query_group: item.query_group,
          provider_family: 'free_comp_hunter',
          purpose: 'free_sold_comp_lookup',
          priority: index + 1,
          max_results: 6
        })),
        env: options.env,
        fetch_impl: options.fetch_impl,
        max_results: 6
      });
    for (const item of boundedQueries) searchesRun.push({ source: 'public_search', target: item.query });
    const urls = (Array.isArray(searchResult && searchResult.results) ? searchResult.results : [])
      .map((result) => cleanText(result && (result.url || result.source_url)))
      .filter((url) => PROPERTY_SOLD_URL_RE.test(url));
    for (const url of urls) {
      if (pagesUsed >= caps.max_pages_per_row || !budget.allow()) break;
      const cached = cache.get(url);
      const fetched = cached || await fetchPage(url, options, budget);
      if (!cached) { cache.set(url, fetched); pagesUsed += 1; }
      searchesRun.push({ source: 'public_sold_page', target: url });
      if (fetched.status === 'blocked') {
        blockedSources.push({ source: 'public_sold_page', url, reason: fetched.blocked_reason });
        continue;
      }
      if (fetched.status !== 'parsed') continue;
      const facts = soldFactsFromPage(fetched.text, url);
      if (addressKey(facts.comp_address) && addressKey(facts.comp_address) === subjectKey) {
        candidates.push(Object.assign({}, facts, { rejected_reason: 'subject_property_not_a_comp' }));
        continue;
      }
      const candidate = {
        comp_address: facts.comp_address,
        sold_status: facts.sold_status,
        sold_price: facts.sold_price,
        sold_date: facts.sold_date,
        source_kind: 'public_web_page',
        source_url: facts.source_url,
        evidence_text: facts.evidence_text
      };
      const validation = compResearchProvider.validateVerifiedCompCandidate(candidate);
      if (validation.verified) verified.push(candidate);
      else candidates.push(Object.assign({}, candidate, { missing_fields: validation.missing_fields }));
    }
  } catch (error) {
    blockedSources.push({ source: 'public_search', url: '', reason: cleanText(error && error.message).slice(0, 80) || 'search_failed' });
  }

  return {
    free_comp_status: compStatus(verified.length, searchesRun),
    verified_comps: verified.slice(0, 3),
    comp_candidates: candidates.slice(0, 5),
    free_searches_run: searchesRun,
    blocked_sources: blockedSources,
    preview_only: true
  };
}

async function runFreePublicCompHunter(input = {}, options = {}) {
  const caps = normalizeCaps(input.caps || options.caps);
  const started = Date.now();
  const budget = { allow: () => Date.now() - started < (Number(caps.total_budget_ms) || DEFAULT_CAPS.total_budget_ms) };
  const cache = new Map();
  const rows = (Array.isArray(input.rows) ? input.rows : []).filter((row) => cleanText(row && row.normalized_address));
  const distinct = [];
  const seen = new Set();
  const preselected = input.preselected_rows === true;
  for (const row of rows) {
    const key = cleanText(row.normalized_address).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(row);
    if (!preselected && distinct.length >= caps.max_rows) break;
  }
  const results = new Map();
  const attempt_records = [];
  const attemptedAt = new Date().toISOString();
  for (const row of distinct) {
    const result = await huntCompsForRow(row, options, caps, budget, cache);
    results.set(cleanText(row.normalized_address).toLowerCase(), result);
    attempt_records.push(Object.assign({ row_key: cleanText(row.queue_key || row.normalized_address).toLowerCase() }, compAttemptForRow(row, result, attemptedAt)));
  }
  return {
    results,
    attempt_records,
    rows_hunted: distinct.length,
    budget_exhausted: !budget.allow(),
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  DEFAULT_CAPS,
  runFreePublicCompHunter,
  soldFactsFromPage
};
