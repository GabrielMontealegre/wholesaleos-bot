'use strict';

const snippetEvidence = require('./search-snippet-evidence');
const leadEvidence = require('./lead-evidence');

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_RESULTS = 10;
const PROVIDERS = new Set(['serper', 'brave', 'google_cse', 'mock']);
const PROVIDER_DISPLAY = {
  serper: 'serper',
  brave: 'brave',
  google_cse: 'google',
  mock: 'mock'
};
const SERPER_QUERY_MODES = new Set(['free', 'advanced']);

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
  const raw = cleanText(env.SEARCH_PROVIDER || '').toLowerCase().replace(/[-\s]+/g, '_');
  if (raw === 'google' || raw === 'google_programmable_search') return 'google_cse';
  return raw;
}

function keyLengthBucket(value) {
  const length = cleanText(value).length;
  if (!length) return 'missing';
  return length >= 16 ? 'present_expected' : 'present_short';
}

function missingKeyForProvider(provider) {
  if (provider === 'serper') return 'SERPER_API_KEY';
  if (provider === 'brave') return 'BRAVE_SEARCH_API_KEY';
  if (provider === 'google_cse') return 'GOOGLE_CSE_API_KEY';
  return '';
}

function providerDisplayName(provider) {
  return PROVIDER_DISPLAY[provider] || 'unknown';
}

function serperQueryModeFrom(env) {
  const mode = cleanText(env && env.SERPER_QUERY_MODE).toLowerCase();
  return SERPER_QUERY_MODES.has(mode) ? mode : 'free';
}

function safeKeyState(value) {
  const bucket = keyLengthBucket(value);
  return {
    present: bucket !== 'missing',
    length_bucket: bucket
  };
}

function buildLiveSearchProviderReadiness(env) {
  env = env || {};
  const enableRaw = env.ENABLE_SEARCH_PROVIDER;
  const providerRaw = env.SEARCH_PROVIDER;
  const enablePresent = enableRaw !== undefined && enableRaw !== null && cleanText(enableRaw) !== '';
  const providerPresent = providerRaw !== undefined && providerRaw !== null && cleanText(providerRaw) !== '';
  const enabled = boolEnabled(enableRaw);
  const provider = providerNameFrom(env);
  const providerNormalized = providerDisplayName(provider);
  const timeoutMs = positiveInt(env.SEARCH_PROVIDER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxResults = Math.min(positiveInt(env.SEARCH_PROVIDER_MAX_RESULTS, DEFAULT_MAX_RESULTS), 20);
  const missing = [];
  let readiness = 'not_configured';
  if (!enablePresent) {
    missing.push('ENABLE_SEARCH_PROVIDER');
  } else if (!enabled) {
    readiness = 'disabled';
  } else if (!providerPresent) {
    missing.push('SEARCH_PROVIDER');
  } else if (!PROVIDERS.has(provider)) {
    readiness = 'invalid_provider';
    missing.push('SEARCH_PROVIDER');
  } else if (provider === 'serper') {
    if (keyLengthBucket(env.SERPER_API_KEY) === 'present_expected') readiness = 'ready';
    else {
      readiness = 'missing_key';
      missing.push('SERPER_API_KEY');
    }
  } else if (provider === 'brave') {
    if (keyLengthBucket(env.BRAVE_SEARCH_API_KEY) === 'present_expected') readiness = 'ready';
    else {
      readiness = 'missing_key';
      missing.push('BRAVE_SEARCH_API_KEY');
    }
  } else if (provider === 'google_cse') {
    const googleKeyReady = keyLengthBucket(env.GOOGLE_CSE_API_KEY) === 'present_expected';
    const googleCxReady = keyLengthBucket(env.GOOGLE_CSE_CX) === 'present_expected';
    if (!googleKeyReady) {
      readiness = 'missing_key';
      missing.push('GOOGLE_CSE_API_KEY');
    } else if (!googleCxReady) {
      readiness = 'missing_google_cx';
      missing.push('GOOGLE_CSE_CX');
    } else {
      readiness = 'ready';
    }
  } else if (provider === 'mock') {
    readiness = cleanText(env.NODE_ENV) === 'production' ? 'invalid_provider' : 'ready';
    if (readiness === 'invalid_provider') missing.push('SEARCH_PROVIDER');
  }
  return {
    checked_at: nowIso(),
    enable_search_provider: {
      present: enablePresent,
      enabled,
      normalized: enabled ? 'true' : 'false'
    },
    search_provider: {
      present: providerPresent,
      normalized: providerNormalized
    },
    keys: {
      serper: safeKeyState(env.SERPER_API_KEY),
      brave: safeKeyState(env.BRAVE_SEARCH_API_KEY),
      google_cse_api_key: safeKeyState(env.GOOGLE_CSE_API_KEY),
      google_cse_cx: safeKeyState(env.GOOGLE_CSE_CX)
    },
    effective: {
      timeout_ms: timeoutMs,
      max_results: maxResults
    },
    serper_query_mode: serperQueryModeFrom(env),
    readiness,
    missing_config: missing,
    selected_provider_ready: readiness === 'ready'
  };
}

function getLiveSearchProviderReadiness() {
  return buildLiveSearchProviderReadiness(process.env);
}

function searchProviderEnvDiagnostics(env = process.env) {
  const enableRaw = env.ENABLE_SEARCH_PROVIDER;
  const providerRaw = env.SEARCH_PROVIDER;
  const enabled = boolEnabled(enableRaw);
  const provider = providerNameFrom(env);
  const timeoutMs = positiveInt(env.SEARCH_PROVIDER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxResults = Math.min(positiveInt(env.SEARCH_PROVIDER_MAX_RESULTS, DEFAULT_MAX_RESULTS), 20);
  const missing = [];
  let readiness = 'not_configured';
  let nextAction = 'Set ENABLE_SEARCH_PROVIDER=true and SEARCH_PROVIDER to serper, brave, google, or mock.';
  if (enableRaw !== undefined && enableRaw !== null && !enabled) {
    readiness = 'disabled';
    nextAction = 'Set ENABLE_SEARCH_PROVIDER=true to enable search fallback.';
  } else if (enabled && !cleanText(providerRaw)) {
    readiness = 'not_configured';
    missing.push('SEARCH_PROVIDER');
    nextAction = 'Set SEARCH_PROVIDER to serper, brave, google, or mock.';
  } else if (enabled && !PROVIDERS.has(provider)) {
    readiness = 'invalid_provider';
    nextAction = 'Set SEARCH_PROVIDER to serper, brave, google, or mock.';
  } else if (enabled) {
    if (provider === 'serper' && !cleanText(env.SERPER_API_KEY)) missing.push('SERPER_API_KEY');
    if (provider === 'brave' && !cleanText(env.BRAVE_SEARCH_API_KEY)) missing.push('BRAVE_SEARCH_API_KEY');
    if (provider === 'google_cse') {
      if (!cleanText(env.GOOGLE_CSE_API_KEY)) missing.push('GOOGLE_CSE_API_KEY');
      if (!cleanText(env.GOOGLE_CSE_CX)) missing.push('GOOGLE_CSE_CX');
    }
    if (missing.includes('GOOGLE_CSE_CX')) {
      readiness = 'missing_google_cx';
      nextAction = 'Set GOOGLE_CSE_CX for Google Programmable Search.';
    } else if (missing.length) {
      readiness = 'missing_key';
      nextAction = `Set ${missingKeyForProvider(provider) || missing[0]} for ${PROVIDER_DISPLAY[provider] || 'search provider'}.`;
    } else {
      readiness = 'ready';
      nextAction = '';
    }
  }
  return {
    enable_search_provider_present: enableRaw !== undefined && enableRaw !== null && cleanText(enableRaw) !== '',
    enable_search_provider_enabled: enabled,
    search_provider_present: providerRaw !== undefined && providerRaw !== null && cleanText(providerRaw) !== '',
    search_provider_normalized: PROVIDER_DISPLAY[provider] || 'unknown',
    serper_api_key_present: !!cleanText(env.SERPER_API_KEY),
    serper_api_key_length_bucket: keyLengthBucket(env.SERPER_API_KEY),
    brave_search_api_key_present: !!cleanText(env.BRAVE_SEARCH_API_KEY),
    google_cse_api_key_present: !!cleanText(env.GOOGLE_CSE_API_KEY),
    google_cse_cx_present: !!cleanText(env.GOOGLE_CSE_CX),
    timeout_ms: timeoutMs,
    max_results: maxResults,
    serper_query_mode: serperQueryModeFrom(env),
    readiness,
    missing_config: missing,
    next_action: nextAction
  };
}

function searchProviderConfig(env = process.env) {
  const diagnostics = searchProviderEnvDiagnostics(env);
  const enabled = boolEnabled(env.ENABLE_SEARCH_PROVIDER);
  const provider = providerNameFrom(env);
  const timeoutMs = positiveInt(env.SEARCH_PROVIDER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxResults = Math.min(positiveInt(env.SEARCH_PROVIDER_MAX_RESULTS, DEFAULT_MAX_RESULTS), 20);
  const serperQueryMode = serperQueryModeFrom(env);
  const missing = [];
  if (!enabled) {
    return { enabled: false, provider: provider || 'unknown', display_provider: diagnostics.search_provider_normalized, configured: false, status: 'provider_not_configured', readiness: diagnostics.readiness, missing: diagnostics.missing_config, timeout_ms: timeoutMs, max_results: maxResults, serper_query_mode: serperQueryMode, diagnostics };
  }
  if (!cleanText(env.SEARCH_PROVIDER)) {
    return { enabled, provider: 'unknown', display_provider: 'unknown', configured: false, status: 'provider_not_configured', readiness: diagnostics.readiness, missing: diagnostics.missing_config, timeout_ms: timeoutMs, max_results: maxResults, serper_query_mode: serperQueryMode, diagnostics };
  }
  if (!PROVIDERS.has(provider)) {
    return { enabled, provider: 'unknown', display_provider: 'unknown', configured: false, status: 'invalid_provider', readiness: diagnostics.readiness, missing: diagnostics.missing_config, timeout_ms: timeoutMs, max_results: maxResults, serper_query_mode: serperQueryMode, warning: 'Search provider is unsupported.', diagnostics };
  }
  if (provider === 'serper' && !cleanText(env.SERPER_API_KEY)) missing.push('SERPER_API_KEY');
  if (provider === 'brave' && !cleanText(env.BRAVE_SEARCH_API_KEY)) missing.push('BRAVE_SEARCH_API_KEY');
  if (provider === 'google_cse') {
    if (!cleanText(env.GOOGLE_CSE_API_KEY)) missing.push('GOOGLE_CSE_API_KEY');
    if (!cleanText(env.GOOGLE_CSE_CX)) missing.push('GOOGLE_CSE_CX');
  }
  if (missing.length) {
    return { enabled, provider, display_provider: diagnostics.search_provider_normalized, configured: false, status: 'provider_not_configured', readiness: diagnostics.readiness, missing, timeout_ms: timeoutMs, max_results: maxResults, serper_query_mode: serperQueryMode, diagnostics };
  }
  return { enabled, provider, display_provider: diagnostics.search_provider_normalized, configured: true, status: 'provider_configured', readiness: diagnostics.readiness, missing, timeout_ms: timeoutMs, max_results: maxResults, serper_query_mode: serperQueryMode, diagnostics };
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

function sourceBrandFromQuery(query) {
  const text = cleanText(query).toLowerCase();
  const site = (text.match(/\bsite:([^\s)]+)/i) || [])[1] || text;
  if (/redfin/i.test(site)) return 'Redfin';
  if (/realtor/i.test(site)) return 'Realtor';
  if (/zillow/i.test(site)) return 'Zillow';
  if (/\bhar\b|har\.com/i.test(site)) return 'HAR';
  if (/fsbo/i.test(site)) return 'FSBO';
  return '';
}

function marketFromQuery(query, input = {}) {
  const parts = [];
  const city = cleanText(input.city || input.market_city || input.market);
  const county = cleanText(input.county || input.market_county);
  const state = cleanText(input.state || input.market_state);
  if (city) parts.push(city);
  else if (/\bdallas\b/i.test(query)) parts.push('Dallas');
  else if (county) parts.push(county);
  if (state) parts.push(state.toUpperCase() === 'TEXAS' ? 'TX' : state.toUpperCase());
  else if (/\btx\b|\btexas\b/i.test(query)) parts.push('TX');
  return parts.join(' ');
}

function criterionFromQuery(query) {
  const text = cleanText(query);
  const quoted = [];
  text.replace(/"([^"]+)"/g, (_, phrase) => {
    const cleaned = cleanText(phrase);
    if (cleaned && !/^(dallas|tx|texas)$/i.test(cleaned)) quoted.push(cleaned);
    return '';
  });
  const known = [
    'investor special',
    'cash only',
    'as-is',
    'as is',
    'fixer',
    'needs work',
    'needs TLC',
    'back on market',
    'price reduction',
    'price reduced',
    'estate sale',
    'FSBO',
    'hard money only',
    'traditional financing unavailable'
  ];
  const found = [];
  for (const term of known) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(text)) found.push(term);
  }
  return Array.from(new Set([].concat(quoted, found))).slice(0, 4).join(' ');
}

function sanitizeSerperFreeQuery(query, input = {}) {
  const market = marketFromQuery(query, input);
  const brand = sourceBrandFromQuery(query);
  const criterion = criterionFromQuery(query);
  const fallback = cleanText(query)
    .replace(/\bsite:[^\s)]+/ig, ' ')
    .replace(/(^|\s)[+-](?=\S)/g, '$1')
    .replace(/["'()]/g, ' ')
    .replace(/\b(AND|OR|NOT)\b/ig, ' ')
    .replace(/\s+/g, ' ');
  const core = [market, brand, criterion || fallback, 'house for sale']
    .map(cleanText)
    .filter(Boolean)
    .join(' ');
  return cleanText(core)
    .replace(/\b(AND|OR|NOT)\b/ig, ' ')
    .replace(/\bsite:[^\s]+/ig, ' ')
    .replace(/(^|\s)[+-](?=\S)/g, '$1')
    .replace(/["'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 180)
    .trim();
}

function safeWarning(message) {
  return cleanText(message).replace(/[A-Za-z0-9_\-]{24,}/g, '[redacted]').slice(0, 240);
}

function urlHost(value) {
  try {
    return new URL(cleanText(value)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function payloadKeys(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? Object.keys(payload).filter(Boolean).slice(0, 12)
    : [];
}

function payloadResultCount(provider, payload) {
  if (!payload) return 0;
  if (provider === 'serper') return Array.isArray(payload.organic) ? payload.organic.length : 0;
  if (provider === 'brave') return payload.web && Array.isArray(payload.web.results) ? payload.web.results.length : 0;
  if (provider === 'google_cse') return Array.isArray(payload.items) ? payload.items.length : 0;
  return Array.isArray(payload.results) ? payload.results.length : 0;
}

function responseShape(provider, payload) {
  const shape = {
    top_level_keys: payloadKeys(payload),
    result_count: payloadResultCount(provider, payload)
  };
  if (provider === 'serper') {
    shape.has_organic = Array.isArray(payload && payload.organic);
    shape.organic_count = shape.has_organic ? payload.organic.length : 0;
    shape.has_places = Array.isArray(payload && payload.places);
    shape.places_count = shape.has_places ? payload.places.length : 0;
  } else if (provider === 'brave') {
    shape.has_web_results = !!(payload && payload.web && Array.isArray(payload.web.results));
  } else if (provider === 'google_cse') {
    shape.has_items = Array.isArray(payload && payload.items);
  }
  return shape;
}

function safePayloadMessage(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const fields = [
    payload.message,
    payload.error,
    payload.errorMessage,
    payload.error_message,
    payload.status
  ];
  if (payload.error && typeof payload.error === 'object') {
    fields.push(payload.error.message, payload.error.code, payload.error.status);
  }
  return fields.map((field) => {
    if (typeof field === 'string') return safeWarning(field);
    if (typeof field === 'number') return String(field);
    return '';
  }).filter(Boolean)[0] || '';
}

function providerNextAction(status) {
  if (status === 'provider_auth_failed') return 'Verify provider API key permissions and billing status.';
  if (status === 'provider_rate_limited') return 'Wait for provider quota reset or reduce batch size.';
  if (status === 'provider_timed_out') return 'Increase SEARCH_PROVIDER_TIMEOUT_MS to 15000 or run a smaller batch.';
  if (status === 'provider_bad_response') return 'Check provider response format and adapter mapping.';
  if (status === 'provider_query_not_allowed') return 'Use SERPER_QUERY_MODE=free or simplify the provider query.';
  if (status === 'provider_network_error') return 'Retry later after checking Railway outbound network health.';
  return '';
}

function endpointForProvider(provider) {
  if (provider === 'serper') return 'https://google.serper.dev/search';
  if (provider === 'brave') return 'https://api.search.brave.com/res/v1/web/search';
  if (provider === 'google_cse') return 'https://www.googleapis.com/customsearch/v1';
  if (provider === 'mock') return 'mock://search';
  return `${provider || 'unknown'}://search`;
}

function providerDiagnostics(meta, response, payload, extra) {
  const httpStatus = Number(response && response.status || 0) || 0;
  const finishedMs = Date.now();
  const shape = responseShape(meta.provider, payload);
  const errorCategory = (extra && extra.error_category) || '';
  const safeSummary = safeWarning((extra && extra.safe_error_summary) || safePayloadMessage(payload) || '');
  return {
    provider: meta.provider,
    method: meta.method,
    endpoint_host: meta.endpoint_host,
    original_query: cleanText((extra && extra.original_query) || meta.original_query),
    sanitized_query: cleanText((extra && extra.sanitized_query) || meta.sanitized_query),
    query: cleanText((extra && extra.query) || meta.query),
    query_mode: cleanText((extra && extra.query_mode) || meta.query_mode),
    query_pattern_rejected: !!(extra && extra.query_pattern_rejected),
    retry_used: !!(extra && extra.retry_used),
    retry_reason: cleanText(extra && extra.retry_reason),
    timeout_ms: meta.timeout_ms,
    max_results: meta.max_results,
    request_started_at: meta.request_started_at,
    request_finished_at: nowIso(),
    duration_ms: Math.max(0, finishedMs - meta.started_ms),
    http_status: httpStatus || null,
    final_http_status: httpStatus || null,
    response_shape: shape,
    safe_error_summary: safeSummary,
    final_safe_error_summary: safeSummary,
    error_category: errorCategory,
    final_error_category: errorCategory,
    result_count: shape.result_count || 0,
    organic_count: shape.organic_count || 0,
    next_action: providerNextAction(errorCategory)
  };
}

function normalizeRawResults(provider, payload, context = {}) {
  if (!payload) return [];
  if (provider === 'serper') {
    return (Array.isArray(payload.organic) ? payload.organic : []).map((item, index) => ({
      title: item.title,
      snippet: item.snippet || item.description,
      url: item.link || item.url,
      displayed_url: item.displayedLink || item.displayed_url,
      source_domain: urlHost(item.link || item.url),
      rank: Number(item.position || item.rank || index + 1) || index + 1,
      provider: 'serper',
      query: context.query || '',
      retrieved_at: context.retrieved_at || nowIso()
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
    let parse_error = false;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_) {
      parse_error = true;
      payload = null;
    }
    return { response, payload, parse_error };
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
  function meta(method, endpoint, extra) {
    extra = extra || {};
    return {
      provider,
      method,
      endpoint_host: urlHost(endpoint),
      original_query: extra.original_query || '',
      sanitized_query: extra.sanitized_query || '',
      query: extra.query || '',
      query_mode: extra.query_mode || '',
      timeout_ms: cfg.timeout_ms,
      max_results: cfg.max_results,
      request_started_at: nowIso(),
      started_ms: Date.now()
    };
  }
  function withDiagnostics(metaInfo, called, extra) {
    const classified = classifyHttpResult(provider, called.response, called.payload, called.parse_error);
    classified.diagnostics = providerDiagnostics(metaInfo, called.response, called.payload, Object.assign({}, extra || {}, {
      error_category: classified.status
    }));
    return classified;
  }
  if (provider === 'mock') {
    if (cleanText(options.mock_status)) return { status: cleanText(options.mock_status), payload: { results: [] }, warnings: options.mock_warning ? [safeWarning(options.mock_warning)] : [], diagnostics: providerDiagnostics(meta('MOCK', 'mock://search'), null, { results: [] }, { error_category: cleanText(options.mock_status) }) };
    const mockResults = Array.isArray(options.mock_results)
      ? options.mock_results
      : Array.isArray(input.mock_results)
        ? input.mock_results
        : (() => {
          try { return JSON.parse(cleanText(env.SEARCH_PROVIDER_MOCK_RESULTS_JSON) || '[]'); } catch (_) { return []; }
        })();
    const status = mockResults.length ? 'provider_available' : 'provider_no_results';
    return { status, payload: { results: mockResults }, diagnostics: providerDiagnostics(meta('MOCK', 'mock://search'), null, { results: mockResults }, { error_category: status }) };
  }
  if (!fetchImpl) return { status: 'provider_unavailable', payload: null, warnings: ['Fetch API is unavailable for search provider.'], diagnostics: providerDiagnostics(meta('UNKNOWN', `${provider}://search`), null, null, { error_category: 'provider_unavailable', safe_error_summary: 'Fetch API unavailable.' }) };
  if (provider === 'serper') {
    const endpoint = 'https://google.serper.dev/search';
    const queryMode = cfg.serper_query_mode || 'free';
    const sanitizedQuery = sanitizeSerperFreeQuery(query, input);
    const requestQuery = queryMode === 'advanced' ? query : sanitizedQuery;
    const metaInfo = meta('POST', endpoint, {
      original_query: query,
      sanitized_query: sanitizedQuery,
      query: requestQuery,
      query_mode: queryMode
    });
    const called = await fetchJson(fetchImpl, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': env.SERPER_API_KEY },
      body: JSON.stringify({ q: requestQuery, num: cfg.max_results })
    }, cfg.timeout_ms);
    const first = withDiagnostics(metaInfo, called, {
      original_query: query,
      sanitized_query: sanitizedQuery,
      query: requestQuery,
      query_mode: queryMode
    });
    if (first.status === 'provider_query_not_allowed' && requestQuery !== sanitizedQuery) {
      const retryMeta = meta('POST', endpoint, {
        original_query: query,
        sanitized_query: sanitizedQuery,
        query: sanitizedQuery,
        query_mode: queryMode
      });
      const retry = await fetchJson(fetchImpl, endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': env.SERPER_API_KEY },
        body: JSON.stringify({ q: sanitizedQuery, num: cfg.max_results })
      }, cfg.timeout_ms);
      const second = withDiagnostics(retryMeta, retry, {
        original_query: query,
        sanitized_query: sanitizedQuery,
        query: sanitizedQuery,
        query_mode: queryMode,
        query_pattern_rejected: true,
        retry_used: true,
        retry_reason: 'query_pattern_not_allowed'
      });
      second.diagnostics.query_attempts = [first.diagnostics, second.diagnostics].map((attempt) => Object.assign({}, attempt, {
        query_attempts: undefined
      }));
      second.diagnostics.query_pattern_rejected = true;
      second.diagnostics.retry_used = true;
      second.diagnostics.retry_reason = 'query_pattern_not_allowed';
      return second;
    }
    first.diagnostics.query_pattern_rejected = first.status === 'provider_query_not_allowed';
    return first;
  }
  if (provider === 'brave') {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${encodeURIComponent(String(cfg.max_results))}`;
    const metaInfo = meta('GET', url);
    const called = await fetchJson(fetchImpl, url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY }
    }, cfg.timeout_ms);
    return withDiagnostics(metaInfo, called);
  }
  if (provider === 'google_cse') {
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&num=${encodeURIComponent(String(Math.min(cfg.max_results, 10)))}&key=${encodeURIComponent(env.GOOGLE_CSE_API_KEY)}&cx=${encodeURIComponent(env.GOOGLE_CSE_CX)}`;
    const metaInfo = meta('GET', url);
    const called = await fetchJson(fetchImpl, url, {}, cfg.timeout_ms);
    return withDiagnostics(metaInfo, called);
  }
  return { status: 'provider_unavailable', payload: null, warnings: ['Search provider is unsupported.'], diagnostics: providerDiagnostics(meta('UNKNOWN', `${provider}://search`), null, null, { error_category: 'provider_unavailable', safe_error_summary: 'Unsupported search provider.' }) };
}

function classifyHttpResult(provider, response, payload, parseError) {
  const statusCode = Number(response && response.status || 0) || 0;
  if (parseError) return { status: 'provider_bad_response', payload, warnings: ['Search provider returned malformed JSON.'] };
  if (statusCode === 401 || statusCode === 403) return { status: 'provider_auth_failed', payload, warnings: ['Search provider authentication failed. Check key permissions.'] };
  if (provider === 'serper' && statusCode === 400 && /query pattern not allowed/i.test(safePayloadMessage(payload))) {
    return { status: 'provider_query_not_allowed', payload, warnings: ['Search provider rejected the query pattern.'] };
  }
  if (statusCode === 400) return { status: 'provider_bad_response', payload, warnings: ['Search provider rejected the request shape.'] };
  if (statusCode === 429) return { status: 'provider_rate_limited', payload, warnings: ['Search provider rate limit or quota reached.'] };
  if (statusCode >= 500) return { status: 'provider_unavailable', payload, warnings: ['Search provider returned a temporary server error.'] };
  if (!response || !response.ok) return { status: 'provider_unavailable', payload, warnings: ['Search provider request failed.'] };
  if (provider === 'serper') {
    if (Array.isArray(payload && payload.organic)) return { status: payload.organic.length ? 'provider_available' : 'provider_no_results', payload, warnings: [] };
    if (Array.isArray(payload && payload.places) && payload.places.length) return { status: 'provider_bad_response', payload, warnings: ['Serper response had places results but no organic web results.'] };
    return { status: 'provider_no_results', payload, warnings: [] };
  }
  return { status: 'provider_available', payload, warnings: [] };
}

async function runSearchProvider(input = {}, options = {}) {
  const cfg = searchProviderConfig(options.env || process.env);
  const startedAt = nowIso();
  const query = cleanText(options.query) || buildSearchQueries(input)[0] || '';
  const base = {
    provider: cfg.display_provider || cfg.provider,
    provider_adapter: cfg.provider,
    status: cfg.status,
    configured: cfg.configured === true,
    readiness: cfg.readiness || (cfg.configured ? 'ready' : 'not_configured'),
    missing_config: Array.isArray(cfg.missing) ? cfg.missing : [],
    next_action: cfg.diagnostics && cfg.diagnostics.next_action || '',
    env_diagnostics: cfg.diagnostics || {},
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
    base.message = cfg.status === 'provider_not_configured' ? 'Search provider not configured. Fresh batch continued without fallback.' : cfg.status === 'invalid_provider' ? 'Search provider is invalid. Fresh batch continued without fallback.' : 'Search provider unavailable before request.';
    base.provider_attempts = [attemptFrom(base, input, 'search_fallback')];
    return base;
  }
  try {
    const called = await callProvider(cfg.provider, query, input, cfg, options);
    const executedQuery = cleanText(called && called.diagnostics && called.diagnostics.query) || query;
    const rawResults = normalizeRawResults(cfg.provider, called.payload, {
      query: executedQuery,
      retrieved_at: nowIso()
    }).slice(0, cfg.max_results);
    const status = called.status === 'provider_available' && !rawResults.length ? 'provider_no_results' : called.status;
    const cards = snippetEvidence.normalizeSearchResults(rawResults, Object.assign({}, input, {
      provider: cfg.provider,
      query: executedQuery
    }));
    const evidenceConversionDiagnostics = snippetEvidence.summarizeEvidenceConversion(cards);
    const results = cards.map((card) => ({
      title: card.source_title,
      snippet: card.source_snippet,
      url: card.source_url,
      displayed_url: card.displayed_url,
      source_domain: card.source_domain,
      rank: card.provider_result_rank,
      retrieved_at: card.retrieved_at,
      possible_address: card.address || card.display_address,
      possible_exact_phrase: card.exact_source_phrase_candidate || card.possible_exact_phrase || card.exact_source_phrase,
      phrase_provenance: card.phrase_provenance || card.exact_source_phrase_source_type,
      exact_source_phrase_candidate: card.exact_source_phrase_candidate || '',
      exact_source_phrase_verbatim_candidate: card.exact_source_phrase_verbatim_candidate === true,
      confidence: card.confidence,
      missing_evidence: card.missing_evidence,
      evidence_conversion_reason_codes: card.evidence_conversion_reason_codes || []
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
      provider_execution_diagnostics: called.diagnostics || {},
      next_action: providerNextAction(status) || base.next_action,
      source_urls_found_count: cards.filter((card) => card.source_url).length,
      candidates_found: cards.length,
      snippet_phrases_verified: evidenceConversionDiagnostics.snippet_phrases_found,
      exact_phrases_verified: evidenceConversionDiagnostics.exact_phrases_promoted,
      weak_snippets_count: cards.filter((card) => !card.exact_source_phrase || card.property_specific_source !== true).length,
      evidence_conversion_diagnostics: evidenceConversionDiagnostics,
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
    const status = error && error.code === 'provider_timed_out' ? 'provider_timed_out' : 'provider_network_error';
    const finishedAt = nowIso();
    const diagnostics = {
      provider: cfg.provider,
      method: cfg.provider === 'serper' ? 'POST' : 'GET',
      endpoint_host: urlHost(endpointForProvider(cfg.provider)),
      timeout_ms: cfg.timeout_ms,
      max_results: cfg.max_results,
      request_started_at: startedAt,
      request_finished_at: finishedAt,
      duration_ms: 0,
      http_status: null,
      response_shape: responseShape(cfg.provider, null),
      safe_error_summary: safeWarning(error && error.message || 'Search provider failed.'),
      error_category: status,
      next_action: providerNextAction(status)
    };
    const out = Object.assign({}, base, {
      status,
      finished_at: finishedAt,
      warnings: [status === 'provider_timed_out' ? 'Search provider timed out.' : safeWarning(error && error.message || 'Search provider network error.')],
      error_category: status,
      provider_execution_diagnostics: diagnostics,
      next_action: diagnostics.next_action,
      message: status === 'provider_timed_out' ? 'Search fallback timed out.' : 'Search fallback network error.'
    });
    out.provider_attempts = [attemptFrom(out, input, 'search_fallback')];
    return out;
  }
}

function attemptFrom(result, input, purpose) {
  const diagnostics = result.provider_execution_diagnostics || {};
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
    warning_message: (result.warnings || []).map(safeWarning).filter(Boolean)[0] || '',
    method: diagnostics.method || '',
    endpoint_host: diagnostics.endpoint_host || '',
    timeout_ms: diagnostics.timeout_ms || null,
    max_results: diagnostics.max_results || null,
    request_started_at: diagnostics.request_started_at || '',
    request_finished_at: diagnostics.request_finished_at || '',
    duration_ms: diagnostics.duration_ms || 0,
    http_status: diagnostics.http_status || null,
      response_shape: diagnostics.response_shape || {},
      safe_error_summary: diagnostics.safe_error_summary || '',
    next_action: diagnostics.next_action || '',
    original_query: diagnostics.original_query || '',
    sanitized_query: diagnostics.sanitized_query || '',
    query_mode: diagnostics.query_mode || '',
    query_pattern_rejected: diagnostics.query_pattern_rejected === true,
    retry_used: diagnostics.retry_used === true,
    retry_reason: diagnostics.retry_reason || '',
    final_http_status: diagnostics.final_http_status || diagnostics.http_status || null,
    final_error_category: diagnostics.final_error_category || diagnostics.error_category || '',
    final_safe_error_summary: diagnostics.final_safe_error_summary || diagnostics.safe_error_summary || '',
    organic_count: Number(diagnostics.organic_count || 0) || 0,
    query_attempts: Array.isArray(diagnostics.query_attempts) ? diagnostics.query_attempts.map((attempt) => ({
      query: attempt.query || '',
      query_mode: attempt.query_mode || '',
      http_status: attempt.http_status || null,
      error_category: attempt.error_category || '',
      safe_error_summary: attempt.safe_error_summary || '',
      result_count: Number(attempt.result_count || 0) || 0,
      organic_count: Number(attempt.organic_count || 0) || 0
    })) : []
  };
}

module.exports = {
  getLiveSearchProviderReadiness,
  buildLiveSearchProviderReadiness,
  searchProviderEnvDiagnostics,
  searchProviderConfig,
  buildSearchQueries,
  sanitizeSerperFreeQuery,
  runSearchProvider
};
