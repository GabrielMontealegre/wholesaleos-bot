'use strict';

const snippetEvidence = require('./search-snippet-evidence');
const leadEvidence = require('./lead-evidence');

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_RESULTS = 10;
const PROVIDERS = new Set(['serper', 'brave', 'google_cse', 'mock']);

function cleanText(value) {
  return leadEvidence.cleanText(value);
}

function boolEnabled(value) {
  return /^(1|true|yes|on)$/i.test(cleanText(value));
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function providerNameFrom(env) {
  const raw = cleanText(env.SEARCH_PROVIDER || 'mock').toLowerCase().replace(/[-\s]+/g, '_');
  if (raw === 'google' || raw === 'google_programmable_search') return 'google_cse';
  return raw;
}

function searchProviderConfig(env = process.env) {
  const enabled = boolEnabled(env.ENABLE_SEARCH_PROVIDER);
  const provider = providerNameFrom(env);
  const timeoutMs = positiveInt(env.SEARCH_PROVIDER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxResults = Math.min(positiveInt(env.SEARCH_PROVIDER_MAX_RESULTS, DEFAULT_MAX_RESULTS), 20);
  const missing = [];
  if (!enabled) {
    return { enabled: false, provider, configured: false, status: 'provider_not_configured', missing, timeout_ms: timeoutMs, max_results: maxResults };
  }
  if (!PROVIDERS.has(provider)) {
    return { enabled, provider, configured: false, status: 'provider_unavailable', missing, timeout_ms: timeoutMs, max_results: maxResults, warning: 'Search provider is unsupported.' };
  }
  if (provider === 'serper' && !cleanText(env.SERPER_API_KEY)) missing.push('SERPER_API_KEY');
  if (provider === 'brave' && !cleanText(env.BRAVE_SEARCH_API_KEY)) missing.push('BRAVE_SEARCH_API_KEY');
  if (provider === 'google_cse') {
    if (!cleanText(env.GOOGLE_CSE_API_KEY)) missing.push('GOOGLE_CSE_API_KEY');
    if (!cleanText(env.GOOGLE_CSE_CX)) missing.push('GOOGLE_CSE_CX');
  }
  if (missing.length) {
    return { enabled, provider, configured: false, status: 'provider_not_configured', missing, timeout_ms: timeoutMs, max_results: maxResults };
  }
  return { enabled, provider, configured: true, status: 'provider_configured', missing, timeout_ms: timeoutMs, max_results: maxResults };
}

function criteriaTerms(criteria) {
  const list = Array.isArray(criteria) ? criteria : [];
  const terms = list.map(cleanText).filter(Boolean);
  if (terms.length) return terms.slice(0, 8);
  return ['as-is', 'investor special', 'cash only', 'fixer', 'needs TLC', 'back on market', 'price reduced', 'estate sale', 'FSBO'];
}

function sourceSites(sourcePreferences) {
  const prefs = Array.isArray(sourcePreferences) ? sourcePreferences.map(cleanText).filter(Boolean) : [];
  if (prefs.length) return prefs.slice(0, 4);
  return ['redfin.com', 'realtor.com', 'zillow.com', 'har.com'];
}

function buildSearchQueries(input) {
  input = input || {};
  const city = cleanText(input.city) || cleanText(input.market) || 'Dallas';
  const state = cleanText(input.state) || 'TX';
  const terms = criteriaTerms(input.criteria);
  const sites = sourceSites(input.source_preferences);
  const exclusions = ['-sold', '-closed', '-reo', '-bank-owned', '-auction ended'];
  const queries = [];
  for (const site of sites) {
    queries.push(`site:${site} "${city}" "${state}" (${terms.slice(0, 5).join(' OR ')}) ${exclusions.join(' ')}`);
  }
  queries.push(`"${city}" "${state}" "${terms.slice(0, 6).join('" OR "')}" real estate listing ${exclusions.join(' ')}`);
  return queries.map(cleanText).filter(Boolean).slice(0, 6);
}

function safeWarning(message) {
  return cleanText(message).replace(/[A-Za-z0-9_\-]{24,}/g, '[redacted]').slice(0, 240);
}

function normalizeRawResults(provider, payload) {
  if (!payload) return [];
  if (provider === 'serper') {
    return [].concat(payload.organic || [], payload.places || []).map((item) => ({
      title: item.title,
      snippet: item.snippet || item.description,
      url: item.link || item.url,
      displayed_url: item.displayedLink || item.displayed_url
    }));
  }
  if (provider === 'brave') {
    const web = payload.web && Array.isArray(payload.web.results) ? payload.web.results : [];
    return web.map((item) => ({
      title: item.title,
      snippet: item.description,
      url: item.url,
      displayed_url: item.profile && item.profile.long_name
    }));
  }
  if (provider === 'google_cse') {
    return (Array.isArray(payload.items) ? payload.items : []).map((item) => ({
      title: item.title,
      snippet: item.snippet,
      url: item.link,
      displayed_url: item.displayLink
    }));
  }
  return Array.isArray(payload.results) ? payload.results : [];
}

async function fetchJson(fetchImpl, url, init, timeoutMs) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, Object.assign({}, init || {}, controller ? { signal: controller.signal } : {}));
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_) {
      payload = null;
    }
    return { response, payload };
  } catch (error) {
    if (error && (error.name === 'AbortError' || /timeout|aborted/i.test(error.message))) {
      const err = new Error('Search provider timed out.');
      err.code = 'provider_timed_out';
      throw err;
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callProvider(provider, query, input, cfg, options) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || global.fetch;
  if (provider === 'mock') {
    if (cleanText(options.mock_status)) return { status: cleanText(options.mock_status), payload: { results: [] }, warnings: options.mock_warning ? [safeWarning(options.mock_warning)] : [] };
    const mockResults = Array.isArray(options.mock_results)
      ? options.mock_results
      : Array.isArray(input.mock_results)
        ? input.mock_results
        : (() => {
          try { return JSON.parse(cleanText(env.SEARCH_PROVIDER_MOCK_RESULTS_JSON) || '[]'); } catch (_) { return []; }
        })();
    return { status: mockResults.length ? 'provider_available' : 'provider_no_results', payload: { results: mockResults } };
  }
  if (!fetchImpl) return { status: 'provider_unavailable', payload: null, warnings: ['Fetch API is unavailable for search provider.'] };
  if (provider === 'serper') {
    const { response, payload } = await fetchJson(fetchImpl, 'https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': env.SERPER_API_KEY },
      body: JSON.stringify({ q: query, num: cfg.max_results })
    }, cfg.timeout_ms);
    return classifyHttpResult(response, payload);
  }
  if (provider === 'brave') {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${encodeURIComponent(String(cfg.max_results))}`;
    const { response, payload } = await fetchJson(fetchImpl, url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY }
    }, cfg.timeout_ms);
    return classifyHttpResult(response, payload);
  }
  if (provider === 'google_cse') {
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&num=${encodeURIComponent(String(Math.min(cfg.max_results, 10)))}&key=${encodeURIComponent(env.GOOGLE_CSE_API_KEY)}&cx=${encodeURIComponent(env.GOOGLE_CSE_CX)}`;
    const { response, payload } = await fetchJson(fetchImpl, url, {}, cfg.timeout_ms);
    return classifyHttpResult(response, payload);
  }
  return { status: 'provider_unavailable', payload: null, warnings: ['Search provider is unsupported.'] };
}

function classifyHttpResult(response, payload) {
  const statusCode = Number(response && response.status || 0) || 0;
  if (statusCode === 401 || statusCode === 403 || statusCode === 400) return { status: 'provider_unavailable', payload, warnings: ['Search provider rejected the request. Check configuration.'] };
  if (statusCode === 429) return { status: 'provider_rate_limited', payload, warnings: ['Search provider rate limit or quota reached.'] };
  if (statusCode >= 500) return { status: 'provider_unavailable', payload, warnings: ['Search provider returned a temporary server error.'] };
  if (!response || !response.ok) return { status: 'provider_unavailable', payload, warnings: ['Search provider request failed.'] };
  return { status: 'provider_available', payload, warnings: [] };
}

async function runSearchProvider(input = {}, options = {}) {
  const cfg = searchProviderConfig(options.env || process.env);
  const startedAt = nowIso();
  const query = cleanText(options.query) || buildSearchQueries(input)[0] || '';
  const base = {
    provider: cfg.provider,
    status: cfg.status,
    query,
    started_at: startedAt,
    finished_at: '',
    result_count: 0,
    results: [],
    cards: [],
    warnings: [],
    error_category: cfg.status === 'provider_configured' ? '' : cfg.status,
    attempted: cfg.enabled === true,
    model: cfg.provider,
    source_urls_found_count: 0,
    candidates_found: 0,
    snippet_phrases_verified: 0,
    weak_snippets_count: 0,
    search_results_found: 0,
    provider_attempts: []
  };
  if (!cfg.configured) {
    base.finished_at = nowIso();
    base.warnings = cfg.warning ? [cfg.warning] : [];
    base.message = cfg.status === 'provider_not_configured' ? 'Search provider not configured. Fresh batch continued without fallback.' : 'Search provider unavailable before request.';
    base.provider_attempts = [attemptFrom(base, input, 'search_fallback')];
    return base;
  }
  try {
    const called = await callProvider(cfg.provider, query, input, cfg, options);
    const rawResults = normalizeRawResults(cfg.provider, called.payload).slice(0, cfg.max_results);
    const status = called.status === 'provider_available' && !rawResults.length ? 'provider_no_results' : called.status;
    const cards = snippetEvidence.normalizeSearchResults(rawResults, Object.assign({}, input, {
      provider: cfg.provider,
      query
    }));
    const results = cards.map((card) => ({
      title: card.source_title,
      snippet: card.source_snippet,
      url: card.source_url,
      displayed_url: card.displayed_url,
      source_domain: card.source_domain,
      rank: card.provider_result_rank,
      retrieved_at: card.retrieved_at,
      possible_address: card.address || card.display_address,
      possible_exact_phrase: card.exact_source_phrase,
      phrase_provenance: card.exact_source_phrase_source_type,
      confidence: card.confidence,
      missing_evidence: card.missing_evidence
    }));
    const finishedAt = nowIso();
    const out = Object.assign({}, base, {
      status,
      finished_at: finishedAt,
      result_count: results.length,
      results,
      cards,
      warnings: (called.warnings || []).map(safeWarning).filter(Boolean),
      error_category: status === 'provider_available' || status === 'provider_no_results' ? '' : status,
      source_urls_found_count: cards.filter((card) => card.source_url).length,
      candidates_found: cards.length,
      snippet_phrases_verified: cards.filter((card) => card.exact_source_phrase && card.exact_source_phrase_verbatim === true).length,
      weak_snippets_count: cards.filter((card) => !card.exact_source_phrase || card.property_specific_source !== true).length,
      search_results_found: results.length,
      source_urls: cards.map((card) => card.source_url).filter(Boolean).slice(0, 20),
      message: status === 'provider_available'
        ? `Search fallback returned ${results.length} result${results.length === 1 ? '' : 's'}.`
        : status === 'provider_no_results'
          ? 'Search fallback returned no public results.'
          : 'Search fallback did not return usable results.'
    });
    out.provider_attempts = [attemptFrom(out, input, 'search_fallback')];
    return out;
  } catch (error) {
    const status = error && error.code === 'provider_timed_out' ? 'provider_timed_out' : 'provider_unavailable';
    const out = Object.assign({}, base, {
      status,
      finished_at: nowIso(),
      warnings: [status === 'provider_timed_out' ? 'Search provider timed out.' : safeWarning(error && error.message || 'Search provider failed.')],
      error_category: status,
      message: status === 'provider_timed_out' ? 'Search fallback timed out.' : 'Search fallback unavailable.'
    });
    out.provider_attempts = [attemptFrom(out, input, 'search_fallback')];
    return out;
  }
}

function attemptFrom(result, input, purpose) {
  return {
    provider: result.provider,
    purpose,
    query_group: cleanText(input && input.query_group) || 'search_provider_fallback',
    query: result.query,
    model: result.provider,
    started_at: result.started_at,
    finished_at: result.finished_at,
    status: result.status,
    result_count: Number(result.result_count || 0) || 0,
    candidate_count: Number(result.candidates_found || 0) || 0,
    grounded_url_count: Number(result.source_urls_found_count || 0) || 0,
    snippet_phrase_count: Number(result.snippet_phrases_verified || 0) || 0,
    evidence_enriched_count: 0,
    error_category: result.error_category || '',
    warning_message: (result.warnings || []).map(safeWarning).filter(Boolean)[0] || ''
  };
}

module.exports = {
  searchProviderConfig,
  buildSearchQueries,
  runSearchProvider
};
