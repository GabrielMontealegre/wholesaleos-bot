'use strict';

const fetchDefault = require('node-fetch');

const DEFAULT_LIMIT_PER_CATALOG = 8;
const MAX_LIMIT_PER_CATALOG = 20;
const PROPERTY_SIGNAL_RE = /\b(foreclos|trustee sale|sheriff sale|tax sale|tax delinquen|probate|estate|lien|code violation|code enforcement|nuisance|vacan|abandon|parcel|assessor|property sale|deed|land bank)\b/i;
const MACHINE_FORMAT_RE = /^(?:api|csv|geojson|json|kml|shp|xml)$/i;
const BLOCKED_TEXT_RE = /\b(?:captcha|verify you are human|access denied|login required|sign in|subscription required|paywall)\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function boundedInt(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(number)));
}

function normalizedMarket(input = {}) {
  const county = cleanText(input.county).replace(/\s+County$/i, '');
  const state = cleanText(input.state).toUpperCase();
  const city = cleanText(input.city || input.metro);
  if (!county || !/^[A-Z]{2}$/.test(state)) {
    const error = new Error('county_and_two_letter_state_required');
    error.code = 'county_and_two_letter_state_required';
    throw error;
  }
  return { county, state, city };
}

function searchPhrase(market) {
  return `${market.county} County ${market.state} foreclosure tax sale probate lien code violation parcel assessor property sale`;
}

function jurisdictionMatches(text, market) {
  const haystack = cleanText(text).toLowerCase();
  const county = market.county.toLowerCase();
  const city = market.city.toLowerCase();
  const state = market.state.toLowerCase();
  return haystack.includes(county) && (haystack.includes(state) || (city && haystack.includes(city)));
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetch_impl || options.fetchImpl || fetchDefault;
  const timeoutMs = boundedInt(options.timeout_ms || options.timeoutMs, 15000, 60000);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'application/json,text/plain;q=0.8,*/*;q=0.2',
        'User-Agent': 'WholesaleOS Government Catalog Discovery/1.0',
        ...(options.headers || {})
      },
      signal: controller ? controller.signal : undefined
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      reason: error && error.name === 'AbortError' ? 'timeout' : cleanText(error && error.message) || 'fetch_failed',
      data: null
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
  const text = await response.text();
  if ([401, 403, 429].includes(response.status)) {
    return { ok: false, status: response.status, reason: `http_${response.status}`, data: null };
  }
  if (!response.ok) return { ok: false, status: response.status, reason: `http_${response.status}`, data: null };
  if (BLOCKED_TEXT_RE.test(text)) return { ok: false, status: response.status, reason: 'access_interstitial', data: null };
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(text)) {
    return { ok: false, status: response.status, reason: 'html_not_machine_readable_catalog', data: null };
  }
  try {
    const data = JSON.parse(text);
    if (data && data.error) {
      const code = cleanText(data.error.code || 'unknown');
      const message = cleanText(data.error.message || data.error.__type || 'catalog_error');
      return { ok: false, status: response.status, reason: `catalog_error_${code}:${message}`, data: null };
    }
    return { ok: true, status: response.status, reason: '', data };
  } catch (error) {
    return { ok: false, status: response.status, reason: 'json_parse_failed', data: null };
  }
}

function candidateBase(kind, market, item = {}) {
  const title = cleanText(item.title || item.name);
  const description = cleanText(item.description);
  const publisher = cleanText(item.publisher || item.owner || item.organization);
  const keywords = (Array.isArray(item.keywords) ? item.keywords : [])
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 20);
  const relevanceText = [title, description, publisher, keywords.join(' '), item.source_url, item.machine_url].join(' ');
  const jurisdictionMatch = jurisdictionMatches(relevanceText, market);
  const propertySignalMatch = PROPERTY_SIGNAL_RE.test(relevanceText);
  const machineUrl = cleanText(item.machine_url);
  const machineReadable = /^https:\/\//i.test(machineUrl);
  let rejectionReason = '';
  if (!jurisdictionMatch) rejectionReason = 'catalog_result_not_jurisdiction_relevant';
  else if (!propertySignalMatch) rejectionReason = 'catalog_result_not_property_signal_relevant';
  else if (!machineReadable) rejectionReason = 'catalog_result_missing_machine_readable_url';
  return {
    catalog_kind: kind,
    market,
    title,
    description,
    publisher,
    keywords,
    source_url: cleanText(item.source_url),
    machine_url: machineUrl,
    updated_at: cleanText(item.updated_at),
    jurisdiction_match: jurisdictionMatch,
    property_signal_match: propertySignalMatch,
    machine_readable: machineReadable,
    discovery_status: rejectionReason ? 'rejected' : 'candidate_unverified',
    blocked_reason: rejectionReason,
    preview_only: true,
    not_lead_evidence: true,
    should_ingest: false
  };
}

function catalogFailure(kind, market, endpoint, fetched) {
  return {
    catalog_kind: kind,
    market,
    endpoint,
    status: 'failed',
    http_status: fetched.status,
    blocked_reason: fetched.reason,
    candidates: []
  };
}

async function queryArcgisCatalog(market, options = {}) {
  const limit = boundedInt(options.limit_per_catalog, DEFAULT_LIMIT_PER_CATALOG, MAX_LIMIT_PER_CATALOG);
  const endpoint = `https://www.arcgis.com/sharing/rest/search?f=json&num=${limit}&q=${encodeURIComponent(searchPhrase(market))}`;
  const fetched = await fetchJson(endpoint, options);
  if (!fetched.ok) return catalogFailure('arcgis', market, endpoint, fetched);
  const results = Array.isArray(fetched.data && fetched.data.results) ? fetched.data.results : [];
  const candidates = results.slice(0, limit).map((item) => candidateBase('arcgis', market, {
    title: item.title,
    description: item.description || item.snippet,
    owner: item.owner,
    keywords: item.tags,
    source_url: item.id ? `https://www.arcgis.com/home/item.html?id=${encodeURIComponent(item.id)}` : '',
    machine_url: cleanText(item.url) || (item.id ? `https://www.arcgis.com/sharing/rest/content/items/${encodeURIComponent(item.id)}?f=json` : ''),
    updated_at: item.modified ? new Date(Number(item.modified)).toISOString() : ''
  }));
  return { catalog_kind: 'arcgis', market, endpoint, status: 'ok', http_status: fetched.status, blocked_reason: '', candidates };
}

async function querySocrataCatalog(market, options = {}) {
  const limit = boundedInt(options.limit_per_catalog, DEFAULT_LIMIT_PER_CATALOG, MAX_LIMIT_PER_CATALOG);
  const endpoint = `https://api.us.socrata.com/api/catalog/v1?limit=${limit}&q=${encodeURIComponent(searchPhrase(market))}`;
  const fetched = await fetchJson(endpoint, options);
  if (!fetched.ok) return catalogFailure('socrata', market, endpoint, fetched);
  const results = Array.isArray(fetched.data && fetched.data.results) ? fetched.data.results : [];
  const candidates = results.slice(0, limit).map((item) => {
    const resource = item && item.resource || {};
    const metadata = item && item.metadata || {};
    const domain = cleanText(resource.domain || metadata.domain);
    const id = cleanText(resource.id);
    return candidateBase('socrata', market, {
      title: resource.name || metadata.name,
      description: resource.description || metadata.description,
      publisher: metadata.domain,
      keywords: resource.tags,
      source_url: domain && id ? `https://${domain}/d/${id}` : '',
      machine_url: domain && id ? `https://${domain}/resource/${id}.json` : '',
      updated_at: resource.updatedAt || resource.updated_at
    });
  });
  return { catalog_kind: 'socrata', market, endpoint, status: 'ok', http_status: fetched.status, blocked_reason: '', candidates };
}

async function queryDataGovCatalog(market, options = {}) {
  const limit = boundedInt(options.limit_per_catalog, DEFAULT_LIMIT_PER_CATALOG, MAX_LIMIT_PER_CATALOG);
  const endpoint = `https://api.gsa.gov/technology/datagov/v4/search?per_page=${limit}&q=${encodeURIComponent(searchPhrase(market))}`;
  const apiKey = cleanText(options.data_gov_api_key || process.env.DATA_GOV_API_KEY || 'DEMO_KEY');
  const fetched = await fetchJson(endpoint, {
    ...options,
    headers: { ...(options.headers || {}), 'X-Api-Key': apiKey }
  });
  if (!fetched.ok) return catalogFailure('data_gov', market, endpoint, fetched);
  const results = Array.isArray(fetched.data && fetched.data.results) ? fetched.data.results : [];
  const candidates = results.slice(0, limit).map((item) => {
    const dcat = item.dcat || {};
    const distribution = dataJsonMachineDistribution(dcat.distribution);
    const publisher = dcat.publisher || item.publisher || {};
    return candidateBase('data_gov', market, {
      title: item.title || dcat.title,
      description: item.description || dcat.description,
      publisher: typeof publisher === 'string' ? publisher : publisher.name,
      keywords: item.keyword || dcat.keyword,
      source_url: item.slug ? `https://catalog.data.gov/dataset/${encodeURIComponent(item.slug)}` : dcat.landingPage,
      machine_url: distribution && (distribution.accessURL || distribution.downloadURL),
      updated_at: dcat.modified || item.last_harvested_date
    });
  });
  return { catalog_kind: 'data_gov', market, endpoint, status: 'ok', http_status: fetched.status, blocked_reason: '', candidates };
}

function dataJsonMachineDistribution(distributions) {
  const list = Array.isArray(distributions) ? distributions : [];
  return list.find((distribution) => {
    const format = cleanText(distribution && (distribution.format || distribution.mediaType));
    const url = cleanText(distribution && (distribution.accessURL || distribution.downloadURL));
    return /^https:\/\//i.test(url) && (MACHINE_FORMAT_RE.test(format) || /\.(?:csv|geojson|json|xml)(?:$|[?#])/i.test(url));
  }) || null;
}

async function queryDataJsonCatalog(market, dataJsonUrl, options = {}) {
  const endpoint = cleanText(dataJsonUrl);
  if (!/^https:\/\//i.test(endpoint)) {
    return { catalog_kind: 'data_json', market, endpoint, status: 'failed', http_status: 0, blocked_reason: 'https_data_json_url_required', candidates: [] };
  }
  const limit = boundedInt(options.limit_per_catalog, DEFAULT_LIMIT_PER_CATALOG, MAX_LIMIT_PER_CATALOG);
  const fetched = await fetchJson(endpoint, options);
  if (!fetched.ok) return catalogFailure('data_json', market, endpoint, fetched);
  const datasets = Array.isArray(fetched.data && fetched.data.dataset)
    ? fetched.data.dataset
    : Array.isArray(fetched.data && fetched.data.datasets) ? fetched.data.datasets : [];
  const candidates = datasets.slice(0, limit).map((item) => {
    const distribution = dataJsonMachineDistribution(item.distribution);
    const publisher = item.publisher || {};
    return candidateBase('data_json', market, {
      title: item.title,
      description: item.description,
      publisher: typeof publisher === 'string' ? publisher : publisher.name,
      keywords: Array.isArray(item.keyword) ? item.keyword : cleanText(item.keyword).split(',').filter(Boolean),
      source_url: item.landingPage || endpoint,
      machine_url: distribution && (distribution.accessURL || distribution.downloadURL),
      updated_at: item.modified || item.issued
    });
  });
  return { catalog_kind: 'data_json', market, endpoint, status: 'ok', http_status: fetched.status, blocked_reason: '', candidates };
}

async function discoverGovernmentCatalogs(input = {}, options = {}) {
  const market = normalizedMarket(input.market || input);
  const catalogs = [];
  if (options.arcgis !== false) catalogs.push(await queryArcgisCatalog(market, options));
  if (options.socrata !== false) catalogs.push(await querySocrataCatalog(market, options));
  if (options.data_gov !== false && options.ckan !== false) catalogs.push(await queryDataGovCatalog(market, options));
  for (const url of (Array.isArray(options.data_json_urls) ? options.data_json_urls : []).slice(0, 4)) {
    catalogs.push(await queryDataJsonCatalog(market, url, options));
  }
  const candidates = catalogs.flatMap((catalog) => catalog.candidates || []);
  return {
    generated_at: new Date(options.now || Date.now()).toISOString(),
    market,
    status: catalogs.some((catalog) => catalog.status === 'ok') ? 'complete' : 'blocked',
    catalog_count: catalogs.length,
    candidate_count: candidates.filter((candidate) => candidate.discovery_status === 'candidate_unverified').length,
    rejected_count: candidates.filter((candidate) => candidate.discovery_status === 'rejected').length,
    catalogs,
    candidates,
    preview_only: true,
    not_lead_evidence: true,
    should_ingest: false,
    source_activation_requires_separate_verification: true
  };
}

module.exports = {
  DEFAULT_LIMIT_PER_CATALOG,
  MAX_LIMIT_PER_CATALOG,
  candidateBase,
  discoverGovernmentCatalogs,
  fetchJson,
  normalizedMarket,
  queryArcgisCatalog,
  queryDataGovCatalog,
  queryDataJsonCatalog,
  querySocrataCatalog
};
