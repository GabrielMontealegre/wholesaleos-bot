'use strict';

// Free public contact hunter.
// Reusable, county-agnostic core: mines contact routes for address-backed
// deal rows from free public evidence only. County specifics come in via a
// profile object (see modules/sources/dallas-county-free-lookup-profile.js).
//
// Hard rules:
// - preview-only, no mutations, never contacts anyone
// - only visible evidence; every route carries source_url + evidence_text
// - trustee/attorney/servicer/agent contacts are never labeled as the owner
// - blocked sources (captcha/login/paywall/403/429) are reported, not bypassed

const searchProviderWorker = require('./search-provider-worker');

const DEFAULT_CAPS = Object.freeze({
  max_rows: 6,
  max_pages_per_row: 5,
  max_search_queries_per_row: 2,
  timeout_ms: 8000,
  total_budget_ms: 45000
});

const PHONE_RE = /\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b|\b1-8\d{2}-\d{3}-\d{4}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const BLOCKED_PAGE_RE = /\b(captcha|verify you are human|human verification|access denied|forbidden|login required|sign in to view|create an account|subscription required|paywall)\b/i;
const NON_OWNER_CONTEXT_RE = /\b(trustee|substitute trustee|attorney|law firm|servicer|mortgagee|reinstatement|pay ?off|sale information|auction|xome|servicelink|for information|clerk|county|appraisal)\b/i;
const LISTING_CONTEXT_RE = /\b(listing agent|listed by|realtor|broker|agent|contact agent|for sale by owner|fsbo|contact seller|reply to)\b/i;

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

function routeTypeForContext(context) {
  if (NON_OWNER_CONTEXT_RE.test(context)) return 'trustee_servicer_or_official';
  if (LISTING_CONTEXT_RE.test(context)) return 'listing_agent_or_poster';
  return 'unclassified_public_contact';
}

function riskFlagsForRoute(routeType) {
  const flags = ['verify_before_dialing'];
  if (routeType !== 'owner') flags.push('not_confirmed_owner_contact');
  if (routeType === 'trustee_servicer_or_official') flags.push('sale_information_line_not_seller');
  return flags;
}

function contextWindow(text, index, length) {
  const source = String(text || '');
  return cleanText(source.slice(Math.max(0, index - 120), index + length + 120));
}

function mineContactRoutesFromText(text, sourceUrl, sourceLabel) {
  const source = String(text || '');
  const routes = [];
  const seen = new Set();
  let match;
  PHONE_RE.lastIndex = 0;
  while ((match = PHONE_RE.exec(source))) {
    const value = cleanText(match[0]);
    const key = `phone|${value.replace(/\D/g, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const context = contextWindow(source, match.index, value.length);
    const routeType = routeTypeForContext(context);
    routes.push({
      route_kind: 'phone',
      value,
      route_type: routeType,
      source_url: cleanText(sourceUrl),
      source_label: cleanText(sourceLabel),
      evidence_text: context.slice(0, 260),
      confidence: routeType === 'unclassified_public_contact' ? 'Low' : 'Medium',
      risk_flags: riskFlagsForRoute(routeType)
    });
    if (routes.length >= 8) break;
  }
  EMAIL_RE.lastIndex = 0;
  while ((match = EMAIL_RE.exec(source))) {
    const value = cleanText(match[0]);
    if (/\.(png|jpg|gif|css|js)$/i.test(value)) continue;
    const key = `email|${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const context = contextWindow(source, match.index, value.length);
    const routeType = routeTypeForContext(context);
    routes.push({
      route_kind: 'email',
      value,
      route_type: routeType,
      source_url: cleanText(sourceUrl),
      source_label: cleanText(sourceLabel),
      evidence_text: context.slice(0, 260),
      confidence: routeType === 'unclassified_public_contact' ? 'Low' : 'Medium',
      risk_flags: riskFlagsForRoute(routeType)
    });
    if (routes.length >= 12) break;
  }
  return routes;
}

function ownerCluesFromRow(row) {
  const clues = [];
  const owner = cleanText(row && (row.owner_name_if_visible || row.owner_name_candidate || row.owner_name || row.borrower_name));
  if (owner) {
    clues.push({
      clue_kind: 'owner_or_borrower_name',
      value: owner,
      source_url: cleanText(row.source_document_url || row.source_url),
      evidence_text: 'Name visible on the source record for this property.',
      confidence: 'Medium',
      risk_flags: ['confirm_identity_before_calling']
    });
  }
  return clues;
}

function ownerCluesFromText(text, sourceUrl) {
  const clues = [];
  const source = String(text || '');
  const patterns = [
    // "Borrower: JANE DOE" style (label before name)
    /(?:borrower|mortgagor|debtor)s?\s*[:#-]\s*([A-Z][A-Za-z ,.'-]{4,70}?)(?:\s*[|;\n(]|$)/gim,
    // "executed by JOHN DOE AND JANE DOE," style (name before label)
    /(?:executed\s+by|deed\s+of\s+trust\s+.{0,40}?\bwith)\s+([A-Z][A-Za-z ,.'&-]{4,80}?),?\s*(?:\(|,)?\s*(?:and\s+wife|grantor|securing|mortgagor)/gim,
    // "JOHN DOE, grantor(s)" style
    /\b([A-Z][A-Z .,'&-]{4,80}?),?\s*\(?\s*grantor/gm
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(source))) {
      const value = cleanText(match[1]).replace(/[,.]$/, '');
      if (!value || value.length < 5 || /\b(mers|mortgage|bank|electronic|registration|systems|servicer|llc|n\.?a\.?)\b/i.test(value)) continue;
      clues.push({
        clue_kind: 'borrower_name_in_notice',
        value,
        source_url: cleanText(sourceUrl),
        evidence_text: cleanText(match[0]).slice(0, 200),
        confidence: 'Medium',
        risk_flags: ['confirm_identity_before_calling']
      });
      if (clues.length >= 3) return clues;
    }
  }
  return clues;
}

async function fetchTextBounded(url, options, budget) {
  if (!budget.allow()) return { status: 'skipped_budget', text: '' };
  const fetchImpl = options.fetch_impl || global.fetch || require('node-fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout_ms || 8000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'text/html,application/pdf,text/plain,*/*', 'User-Agent': 'WholesaleOS Free Public Lookup Preview/1.0' }
    });
    const contentType = cleanText(response.headers && response.headers.get && response.headers.get('content-type')).toLowerCase();
    if (response.status === 403 || response.status === 429) {
      return { status: 'blocked', blocked_reason: `http_${response.status}`, text: '' };
    }
    if (!response.ok) return { status: 'failed', blocked_reason: `http_${response.status}`, text: '' };
    if (contentType.includes('pdf') || /\.pdf(?:$|[?#])/i.test(url)) {
      try {
        const pdfParse = require('pdf-parse');
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 6 * 1024 * 1024) return { status: 'skipped', blocked_reason: 'pdf_too_large', text: '' };
        const parsed = await pdfParse(buffer);
        return { status: 'parsed', text: String(parsed && parsed.text || '') };
      } catch (error) {
        return { status: 'failed', blocked_reason: 'pdf_parse_failed', text: '' };
      }
    }
    const text = await response.text();
    if (BLOCKED_PAGE_RE.test(text)) return { status: 'blocked', blocked_reason: 'captcha_or_login_wall', text: '' };
    return { status: 'parsed', text };
  } catch (error) {
    return { status: 'failed', blocked_reason: cleanText(error && error.message).slice(0, 60) || 'fetch_failed', text: '' };
  } finally {
    clearTimeout(timer);
  }
}

function addressParts(address) {
  const match = cleanText(address).match(/^(\d{1,7})\s+(.+?),/);
  return {
    street_number: match ? match[1] : '',
    street_name: match ? match[2] : ''
  };
}

function contactStatusFromRoutes(routes, mailingRoute, searchesRun) {
  if (routes.some((route) => route.route_kind === 'phone')) return 'CALL_READY';
  if (routes.some((route) => route.route_kind === 'email' || route.route_kind === 'form' || route.route_kind === 'reply_link')) return 'OUTREACH_READY';
  if (mailingRoute && mailingRoute.value) return 'MAIL_READY';
  return searchesRun.length ? 'CONTACT_SEARCH_EXHAUSTED_FREE' : 'CONTACT_SEARCH_NOT_RUN';
}

function nextFreeAction(status, blockedSources) {
  if (status === 'CALL_READY') return 'CALL_VISIBLE_ROUTE_AND_ASK_FOR_OWNER_PATH';
  if (status === 'OUTREACH_READY') return 'SEND_OUTREACH_VIA_VISIBLE_ROUTE';
  if (status === 'MAIL_READY') return 'SEND_LETTER_TO_OWNER_MAILING_ADDRESS';
  if (blockedSources.length) return 'RETRY_BLOCKED_SOURCES_MANUALLY_IN_BROWSER';
  return 'DECIDE_PAID_SKIP_TRACE';
}

async function huntContactForRow(row, options, caps, budget, cache) {
  const address = cleanText(row && row.normalized_address);
  const searchesRun = [];
  const blockedSources = [];
  let routes = [];
  let clues = ownerCluesFromRow(row);
  let mailingRoute = null;
  let pagesUsed = 0;

  // Step 1: re-read the row's own source document (already-trusted evidence).
  const documentUrl = cleanText(row && (row.source_document_url || row.source_url));
  if (documentUrl && pagesUsed < caps.max_pages_per_row) {
    searchesRun.push({ source: 'row_source_document', target: documentUrl });
    const cached = cache.get(documentUrl);
    const fetched = cached || await fetchTextBounded(documentUrl, options, budget);
    if (!cached) { cache.set(documentUrl, fetched); pagesUsed += 1; }
    if (fetched.status === 'parsed') {
      routes = routes.concat(mineContactRoutesFromText(fetched.text, documentUrl, 'official source document'));
      clues = clues.concat(ownerCluesFromText(fetched.text, documentUrl));
    } else if (fetched.status === 'blocked') {
      blockedSources.push({ source: 'row_source_document', url: documentUrl, reason: fetched.blocked_reason });
    }
  }

  // Step 2: county appraisal profile lookup (owner + mailing route).
  const profile = options.county_profile;
  if (profile && typeof profile.appraisalLookup === 'function' && address && pagesUsed < caps.max_pages_per_row && budget.allow()) {
    searchesRun.push({ source: 'county_appraisal_search', target: profile.appraisal_source_url || profile.appraisal_source_name || 'county appraisal search' });
    pagesUsed += 1;
    const lookup = await profile.appraisalLookup(addressParts(address), { fetch_impl: options.fetch_impl, timeout_ms: caps.timeout_ms });
    if (lookup && lookup.status === 'owner_found') {
      clues.push({
        clue_kind: 'appraisal_owner_of_record',
        value: cleanText(lookup.owner_name),
        source_url: cleanText(lookup.source_url),
        evidence_text: cleanText(lookup.evidence_text).slice(0, 260),
        confidence: 'High',
        risk_flags: ['owner_of_record_may_differ_from_occupant']
      });
      if (cleanText(lookup.mailing_address)) {
        mailingRoute = {
          route_kind: 'mailing_address',
          value: cleanText(lookup.mailing_address),
          source_url: cleanText(lookup.source_url),
          evidence_text: 'Owner mailing address on county appraisal record.',
          confidence: 'High',
          risk_flags: ['mail_only_route']
        };
      }
    } else if (lookup && (lookup.status === 'blocked' || lookup.status === 'failed')) {
      blockedSources.push({ source: 'county_appraisal_search', url: cleanText(lookup.source_url), reason: cleanText(lookup.blocked_reason) || lookup.status });
    }
  }

  // Step 3: bounded public search for the address / owner clue.
  const queries = [];
  if (address) queries.push({ query: `"${address}" owner contact phone`, query_group: 'free_contact_address' });
  const ownerClue = clues.find((clue) => cleanText(clue.value));
  if (ownerClue && address) queries.push({ query: `"${ownerClue.value}" "${cleanText(row.city || address.split(',')[1])}" phone`, query_group: 'free_contact_owner_name' });
  const boundedQueries = queries.slice(0, caps.max_search_queries_per_row);
  if (boundedQueries.length && budget.allow()) {
    try {
      const searchResult = Array.isArray(options.mock_search_results)
        ? { results: options.mock_search_results }
        : await searchProviderWorker.runSearchProvider({
          market: cleanText(row.city || ''),
          search_mode: 'contact_route_lookup'
        }, {
          query_groups: boundedQueries.map((item, index) => ({
            query: item.query,
            query_group: item.query_group,
            provider_family: 'free_contact_hunter',
            purpose: 'free_contact_route_lookup',
            priority: index + 1,
            max_results: 5
          })),
          env: options.env,
          fetch_impl: options.fetch_impl,
          max_results: 5
        });
      for (const item of boundedQueries) searchesRun.push({ source: 'public_search', target: item.query });
      const results = Array.isArray(searchResult && searchResult.results) ? searchResult.results : [];
      for (const result of results.slice(0, 4)) {
        const snippet = cleanText(`${result && result.title} ${result && result.snippet}`);
        const snippetRoutes = mineContactRoutesFromText(snippet, cleanText(result && (result.url || result.source_url)), 'public search snippet');
        routes = routes.concat(snippetRoutes.map((route) => Object.assign({}, route, { confidence: 'Low', risk_flags: route.risk_flags.concat('search_snippet_only_verify_on_page') })));
      }
      const fetchable = results
        .map((result) => cleanText(result && (result.url || result.source_url)))
        .filter((url) => /^https?:/i.test(url))
        .slice(0, Math.max(0, caps.max_pages_per_row - pagesUsed));
      for (const url of fetchable) {
        if (!budget.allow() || pagesUsed >= caps.max_pages_per_row) break;
        const cached = cache.get(url);
        const fetched = cached || await fetchTextBounded(url, options, budget);
        if (!cached) { cache.set(url, fetched); pagesUsed += 1; }
        searchesRun.push({ source: 'public_page', target: url });
        if (fetched.status === 'parsed') {
          routes = routes.concat(mineContactRoutesFromText(fetched.text, url, 'public web page'));
        } else if (fetched.status === 'blocked') {
          blockedSources.push({ source: 'public_page', url, reason: fetched.blocked_reason });
        }
      }
    } catch (error) {
      blockedSources.push({ source: 'public_search', url: '', reason: cleanText(error && error.message).slice(0, 80) || 'search_failed' });
    }
  }

  routes = routes.slice(0, 10);
  const status = contactStatusFromRoutes(routes, mailingRoute, searchesRun);
  return {
    free_contact_status: status,
    free_contact_routes: routes,
    owner_or_entity_clues: clues.slice(0, 5),
    mailing_route: mailingRoute,
    free_searches_run: searchesRun,
    blocked_sources: blockedSources,
    next_free_action: nextFreeAction(status, blockedSources),
    why_call_ready_or_blocked: status === 'CALL_READY'
      ? `Visible ${routes.find((route) => route.route_kind === 'phone').route_type.replace(/_/g, ' ')} phone found with source evidence; it is not confirmed as the owner.`
      : status === 'MAIL_READY'
        ? 'Owner mailing route visible on county record; no public phone/email found.'
        : blockedSources.length
          ? `Free sources blocked: ${blockedSources.map((item) => item.reason).slice(0, 3).join(', ')}.`
          : 'No visible public contact route found on searched free sources.',
    preview_only: true
  };
}

async function runFreePublicContactHunter(input = {}, options = {}) {
  const caps = normalizeCaps(input.caps || options.caps);
  const started = Date.now();
  const budget = {
    allow: () => Date.now() - started < (Number(caps.total_budget_ms) || DEFAULT_CAPS.total_budget_ms)
  };
  const cache = new Map();
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
  const results = new Map();
  for (const row of distinct) {
    results.set(cleanText(row.normalized_address).toLowerCase(), await huntContactForRow(row, options, caps, budget, cache));
  }
  return {
    results,
    rows_hunted: distinct.length,
    budget_exhausted: !budget.allow(),
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  DEFAULT_CAPS,
  runFreePublicContactHunter,
  mineContactRoutesFromText,
  ownerCluesFromText
};
