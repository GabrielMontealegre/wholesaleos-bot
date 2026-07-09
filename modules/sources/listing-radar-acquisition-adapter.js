'use strict';

const propertyCandidate = require('../research/property-candidate');
const propertyIdentity = require('../research/property-identity');
const searchProviderWorker = require('../research/search-provider-worker');
const sourceEvidenceAdapter = require('../research/source-evidence-adapter');

const SOURCE_ID = 'tx_dallas_listing_radar';
const SOURCE_NAME = 'Dallas Listing Radar';
const SOURCE_FAMILY = 'public_listing_radar';
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_MAX_PAGE_FETCHES = 4;
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_PAGE_BYTES = 512 * 1024;
const BLOCKED_PUBLIC_SOURCE = 'BLOCKED_PUBLIC_SOURCE';

const PROPERTY_DETAIL_HOSTS = Object.freeze({
  zillow: /(?:^|\.)zillow\.com$/i,
  redfin: /(?:^|\.)redfin\.com$/i,
  realtor: /(?:^|\.)realtor\.com$/i,
  auction: /(?:^|\.)auction\.com$/i,
  realauction: /(?:^|\.)realauction\.com$/i
});

const GENERIC_OR_BLOCKED_PATH_RE = /\b(search|results|homes|for-sale|rentals?|apartments?|login|signin|sign-in|account|captcha|paywall|myaccount|savedhomes|category|city|state)\b/i;
const BLOCKED_TEXT_RE = /\b(captcha|verify you are human|human verification|access denied|forbidden|login required|sign in to view|subscription required|paywall|press & hold|are you a robot|too many requests)\b/i;
const STATUS_RE = /\b(for sale|active|price cut|price reduced|foreclosure|pre-foreclosure|auction|cash only|as-is|as is|fixer|needs tlc|pending|contingent)\b/i;
const MOTIVATION_RE = /\b(as-is|as is|fixer|needs tlc|cash only|foreclosure|pre-foreclosure|auction|price cut|price reduced|investor special)\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function boundedInt(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(Math.floor(number), maximum);
}

function nowIso() {
  return new Date().toISOString();
}

function parseUrl(value) {
  try {
    return new URL(cleanText(value));
  } catch (_) {
    return null;
  }
}

function hostOf(value) {
  const parsed = parseUrl(value);
  return parsed ? parsed.hostname.replace(/^www\./i, '').toLowerCase() : '';
}

function decodeHtml(value) {
  return cleanText(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function titleCase(value) {
  return cleanText(value).toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function isZip(value) {
  return /^\d{5}(?:-\d{4})?$/.test(cleanText(value));
}

function isState(value) {
  return /^[A-Z]{2}$/i.test(cleanText(value));
}

function isStreetSuffix(value) {
  return /^(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)$/i.test(cleanText(value).replace(/\.$/, ''));
}

function normalizeStreetToken(value) {
  return cleanText(value).replace(/-/g, ' ').replace(/\b(Us|Tx)\b/g, (token) => token.toUpperCase());
}

function finalizeAddressParts(street, city, state, zip) {
  const streetText = titleCase(normalizeStreetToken(street));
  const cityText = titleCase(cleanText(city).replace(/-/g, ' '));
  const stateText = cleanText(state).toUpperCase();
  const zipText = cleanText(zip);
  if (!streetText || !cityText || !stateText || !zipText) return {
    normalized_address: '',
    raw_address_text: '',
    city: cityText,
    state: stateText,
    zip: zipText,
    address_provenance: ''
  };
  const full = `${streetText}, ${cityText}, ${stateText} ${zipText}`;
  return {
    normalized_address: full,
    raw_address_text: full,
    city: cityText,
    state: stateText,
    zip: zipText,
    address_provenance: 'ADDRESS_FROM_LISTING_URL_SLUG'
  };
}

function parseTokenAddress(value) {
  const tokens = cleanText(value)
    .replace(/[_]+/g, '-')
    .split('-')
    .map(cleanText)
    .filter(Boolean)
    .filter((part) => !/^\d+_(?:zpid|m\d*)$/i.test(part));
  if (tokens.length < 5) return finalizeAddressParts('', '', '', '');
  while (tokens.length && /^(?:zpid|pid|mls|m\d+|\d{6,})$/i.test(tokens[tokens.length - 1]) && !isZip(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  let zip = '';
  let state = '';
  if (tokens.length && isZip(tokens[tokens.length - 1])) zip = tokens.pop();
  if (tokens.length && isState(tokens[tokens.length - 1])) state = tokens.pop();
  if (!zip || !state || tokens.length < 3) return finalizeAddressParts('', '', state, zip);
  const cityParts = [];
  while (tokens.length > 2 && !/^\d/.test(tokens[tokens.length - 1]) && !isStreetSuffix(tokens[tokens.length - 1])) {
    cityParts.unshift(tokens.pop());
    if (cityParts.length >= 3) break;
  }
  const city = cityParts.join(' ');
  const street = tokens.join(' ');
  return finalizeAddressParts(street, city, state, zip);
}

function extractAddressFromListingUrl(sourceUrl) {
  const parsed = parseUrl(sourceUrl);
  if (!parsed) return finalizeAddressParts('', '', '', '');
  const host = hostOf(sourceUrl);
  const path = decodeURIComponent(parsed.pathname || '');

  const sourceIdentity = sourceEvidenceAdapter.extractPropertyIdentityFromSourceUrl(sourceUrl);
  if (sourceIdentity &&
      sourceIdentity.address_extracted_from_source_url &&
      cleanText(sourceIdentity.address_candidate) &&
      cleanText(sourceIdentity.city_candidate) &&
      cleanText(sourceIdentity.state_candidate) &&
      cleanText(sourceIdentity.zip_candidate)) {
    if (propertyIdentity.isCompleteAddress(sourceIdentity.address_candidate)) {
      const full = cleanText(sourceIdentity.address_candidate);
      return {
        normalized_address: full,
        raw_address_text: full,
        city: titleCase(sourceIdentity.city_candidate),
        state: cleanText(sourceIdentity.state_candidate).toUpperCase(),
        zip: cleanText(sourceIdentity.zip_candidate),
        address_provenance: 'ADDRESS_FROM_LISTING_URL_SLUG'
      };
    }
    return finalizeAddressParts(
      sourceIdentity.address_candidate,
      sourceIdentity.city_candidate,
      sourceIdentity.state_candidate,
      sourceIdentity.zip_candidate
    );
  }

  if (PROPERTY_DETAIL_HOSTS.zillow.test(host)) {
    const match = path.match(/\/homedetails\/([^/?#]+)/i);
    if (match) return parseTokenAddress(match[1].replace(/_\d+_zpid$/i, ''));
  }
  if (PROPERTY_DETAIL_HOSTS.realtor.test(host)) {
    const match = path.match(/\/realestateandhomes-detail\/([^/?#]+)/i);
    if (match) return parseTokenAddress(match[1].replace(/_M\d+$/i, ''));
  }
  if (PROPERTY_DETAIL_HOSTS.auction.test(host)) {
    const match = path.match(/\/details\/([^/?#]+)/i);
    if (match) return parseTokenAddress(match[1]);
  }
  return finalizeAddressParts('', '', '', '');
}

function classifyListingUrl(sourceUrl) {
  const parsed = parseUrl(sourceUrl);
  if (!parsed || !/^https?:$/i.test(parsed.protocol)) return { accepted: false, reason: 'invalid_url' };
  const host = hostOf(sourceUrl);
  const path = decodeURIComponent(parsed.pathname || '');
  const probe = `${host} ${path} ${parsed.search}`.toLowerCase();
  if (/(localhost|127\.|0\.0\.0\.0|\[?::1\]?)/i.test(host)) return { accepted: false, reason: 'unsafe_host' };
  if (/login|signin|sign-in|captcha|paywall|account/i.test(probe)) return { accepted: false, reason: 'login_or_paywall_url' };
  if (PROPERTY_DETAIL_HOSTS.zillow.test(host)) {
    return /\/homedetails\//i.test(path) && !GENERIC_OR_BLOCKED_PATH_RE.test(path.replace('/homedetails/', ''))
      ? { accepted: true, source_kind: 'zillow' }
      : { accepted: false, reason: 'generic_zillow_url' };
  }
  if (PROPERTY_DETAIL_HOSTS.redfin.test(host)) {
    return /\/[A-Z]{2}\/[^/]+\/[^/]+\/home\/\d+/i.test(path)
      ? { accepted: true, source_kind: 'redfin' }
      : { accepted: false, reason: 'generic_redfin_url' };
  }
  if (PROPERTY_DETAIL_HOSTS.realtor.test(host)) {
    return /\/realestateandhomes-detail\//i.test(path)
      ? { accepted: true, source_kind: 'realtor' }
      : { accepted: false, reason: 'generic_realtor_url' };
  }
  if (PROPERTY_DETAIL_HOSTS.auction.test(host)) {
    return /\/details\//i.test(path)
      ? { accepted: true, source_kind: 'auction' }
      : { accepted: false, reason: 'generic_auction_url' };
  }
  if (PROPERTY_DETAIL_HOSTS.realauction.test(host)) {
    return /zmethod=details|\/details\/|auctiondetails/i.test(`${path} ${parsed.search}`)
      ? { accepted: true, source_kind: 'realauction' }
      : { accepted: false, reason: 'generic_realauction_url' };
  }
  return { accepted: false, reason: 'unsupported_listing_host' };
}

function isAcceptedListingUrl(sourceUrl) {
  return classifyListingUrl(sourceUrl).accepted === true;
}

function buildListingRadarQueryGroups(input = {}) {
  const city = cleanText(input.city) || 'Dallas';
  const state = cleanText(input.state || 'TX').toUpperCase();
  const market = `${city} ${state}`;
  return [
    {
      query_group: 'listing_radar_zillow_distress',
      provider_family: SOURCE_FAMILY,
      purpose: 'listing_radar',
      query: `site:zillow.com/homedetails ${market} fixer cash only as-is`,
      expected_url_pattern: 'zillow.com/homedetails',
      max_results: 2
    },
    {
      query_group: 'listing_radar_zillow_foreclosure_price_cut',
      provider_family: SOURCE_FAMILY,
      purpose: 'listing_radar',
      query: `site:zillow.com/homedetails ${market} foreclosure price cut`,
      expected_url_pattern: 'zillow.com/homedetails',
      max_results: 2
    },
    {
      query_group: 'listing_radar_redfin_distress',
      provider_family: SOURCE_FAMILY,
      purpose: 'listing_radar',
      query: `site:redfin.com/TX/${city} ${market} fixer needs TLC price cut`,
      expected_url_pattern: 'redfin.com/*/home/',
      max_results: 2
    },
    {
      query_group: 'listing_radar_realtor_distress',
      provider_family: SOURCE_FAMILY,
      purpose: 'listing_radar',
      query: `site:realtor.com/realestateandhomes-detail ${market} foreclosure auction cash only`,
      expected_url_pattern: 'realtor.com/realestateandhomes-detail',
      max_results: 2
    },
    {
      query_group: 'listing_radar_auction_detail',
      provider_family: SOURCE_FAMILY,
      purpose: 'listing_radar',
      query: `site:auction.com/details ${market} foreclosure auction property`,
      expected_url_pattern: 'auction.com/details',
      max_results: 2
    },
    {
      query_group: 'listing_radar_realauction_detail',
      provider_family: SOURCE_FAMILY,
      purpose: 'listing_radar',
      query: `site:realauction.com ${market} foreclosure auction details`,
      expected_url_pattern: 'realauction.com details',
      max_results: 2
    }
  ];
}

function evidenceWindow(text, matchText) {
  const value = cleanText(text);
  const match = cleanText(matchText);
  if (!value || !match) return '';
  const sentence = value
    .split(/(?<=[.!?;|])\s+/)
    .map(cleanText)
    .find((part) => part.toLowerCase().includes(match.toLowerCase()));
  if (sentence) return sentence.slice(0, 260);
  const index = value.toLowerCase().indexOf(match.toLowerCase());
  if (index < 0) return match;
  return cleanText(value.slice(Math.max(0, index - 80), Math.min(value.length, index + match.length + 120)));
}

function visibleListingFacts(text) {
  const value = cleanText(text);
  const statusMatch = value.match(STATUS_RE);
  const motivationMatch = value.match(MOTIVATION_RE);
  const priceMatch = value.match(/\$[\d,]{4,12}/);
  const factsMatch = value.match(/\b(\d+)\s*(?:bd|beds?)\b[^]{0,30}?(\d+(?:\.\d+)?)\s*(?:ba|baths?)\b[^]{0,40}?([\d,]{3,6})\s*(?:sq\s?ft|sqft)\b/i);
  const agentMatch = value.match(/\b(?:listing agent|listed by|agent)\s*:?\s*([A-Z][A-Za-z .'-]{2,60})\b/);
  return {
    status_evidence_text: statusMatch ? evidenceWindow(value, statusMatch[0]) : '',
    motivation_evidence_text: motivationMatch ? evidenceWindow(value, motivationMatch[0]) : '',
    asking_price: priceMatch ? priceMatch[0] : '',
    beds: factsMatch ? Number(factsMatch[1]) || null : null,
    baths: factsMatch ? Number(factsMatch[2]) || null : null,
    sqft: factsMatch ? Number(cleanText(factsMatch[3]).replace(/,/g, '')) || null : null,
    listing_agent_if_visible: agentMatch ? cleanText(agentMatch[1]) : ''
  };
}

async function inspectViaFetch(url, fetchImpl, options) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), boundedInt(options.timeout_ms, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)) : null;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1' },
      signal: controller ? controller.signal : undefined
    });
    const finalUrl = cleanText(response && response.url) || url;
    const status = Number(response && response.status || 0) || 0;
    const length = Number(response && response.headers && response.headers.get && response.headers.get('content-length') || 0) || 0;
    if (length > MAX_PAGE_BYTES) return { status: 'oversize_rejected', final_source_url: finalUrl, http_status: status, blocked: true, blocked_reason: 'oversize_rejected' };
    if (!response || !response.ok) return { status: `http_${status}`, final_source_url: finalUrl, http_status: status, blocked: status === 403 || status === 429, blocked_reason: status === 403 || status === 429 ? `http_${status}` : `http_${status}` };
    const html = String(await response.text() || '').slice(0, MAX_PAGE_BYTES);
    const title = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const text = stripHtml(html).slice(0, 12000);
    if (BLOCKED_TEXT_RE.test(text)) return { status: BLOCKED_PUBLIC_SOURCE, final_source_url: finalUrl, http_status: status, blocked: true, blocked_reason: 'captcha_login_or_paywall', page_title: title, page_visible_text: text };
    return Object.assign({ status: 'fetched', final_source_url: finalUrl, http_status: status, page_title: title, page_visible_text: text }, visibleListingFacts(`${title} ${text}`));
  } catch (error) {
    const reason = /abort|timeout/i.test(cleanText(error && error.message)) ? 'timed_out' : 'fetch_failed';
    return { status: reason, final_source_url: url, blocked: false, blocked_reason: reason, error: cleanText(error && error.message).slice(0, 120) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function inspectViaPlaywright(url, options) {
  let playwright = options.playwright_impl;
  if (!playwright) {
    try { playwright = require('playwright'); } catch (_) { playwright = null; }
  }
  if (!playwright) return { status: BLOCKED_PUBLIC_SOURCE, final_source_url: url, blocked: true, blocked_reason: 'browser_runtime_unavailable' };
  let browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(boundedInt(options.timeout_ms, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS));
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: boundedInt(options.timeout_ms, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS) }).catch((error) => ({ __navError: error }));
    if (response && response.__navError) {
      return { status: 'navigation_failed', final_source_url: url, blocked: false, blocked_reason: `navigation_failed:${cleanText(response.__navError.message).slice(0, 50)}` };
    }
    const status = response && typeof response.status === 'function' ? response.status() : 0;
    const finalUrl = cleanText(page.url && page.url()) || url;
    if (status === 403 || status === 429) return { status: BLOCKED_PUBLIC_SOURCE, final_source_url: finalUrl, http_status: status, blocked: true, blocked_reason: `http_${status}` };
    const title = cleanText(await page.title().catch(() => ''));
    const text = cleanText(await page.textContent('body').catch(() => '')).slice(0, 12000);
    if (BLOCKED_TEXT_RE.test(text)) return { status: BLOCKED_PUBLIC_SOURCE, final_source_url: finalUrl, http_status: status, blocked: true, blocked_reason: 'captcha_login_or_paywall', page_title: title, page_visible_text: text };
    return Object.assign({ status: 'fetched', final_source_url: finalUrl, http_status: status, page_title: title, page_visible_text: text }, visibleListingFacts(`${title} ${text}`));
  } catch (error) {
    return { status: BLOCKED_PUBLIC_SOURCE, final_source_url: url, blocked: true, blocked_reason: `browser_error:${cleanText(error && error.message).slice(0, 60)}` };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function fetchListingPageEvidence(sourceUrl, options = {}) {
  const url = cleanText(sourceUrl);
  const classification = classifyListingUrl(url);
  if (!classification.accepted) return { status: 'rejected', source_url: url, final_source_url: url, rejected_reason: classification.reason, blocked: false };
  if (typeof options.page_fetch_impl === 'function') {
    const response = await inspectViaFetch(url, options.page_fetch_impl, options);
    return Object.assign({ source_url: url, source_kind: classification.source_kind }, response);
  }
  if (typeof options.fetch_impl === 'function' && options.use_fetch_for_listing_pages === true) {
    const response = await inspectViaFetch(url, options.fetch_impl, options);
    return Object.assign({ source_url: url, source_kind: classification.source_kind }, response);
  }
  const response = await inspectViaPlaywright(url, options);
  return Object.assign({ source_url: url, source_kind: classification.source_kind }, response);
}

function candidateFromListingCard(card, pageEvidence, context = {}) {
  card = card || {};
  pageEvidence = pageEvidence || {};
  const sourceUrl = cleanText(pageEvidence.final_source_url || card.canonical_source_url || card.source_url || card.url);
  const classification = classifyListingUrl(sourceUrl);
  const urlAddress = extractAddressFromListingUrl(sourceUrl);
  const title = cleanText(card.source_title || card.title || pageEvidence.page_title);
  const snippet = cleanText(card.source_snippet || card.snippet || '');
  const pageText = cleanText(pageEvidence.page_visible_text || '');
  const factBundle = visibleListingFacts([title, snippet, pageText].filter(Boolean).join(' '));
  const statusEvidence = cleanText(pageEvidence.status_evidence_text || factBundle.status_evidence_text);
  const motivationEvidence = cleanText(pageEvidence.motivation_evidence_text || factBundle.motivation_evidence_text || snippet || title);
  const blocked = pageEvidence.blocked === true || pageEvidence.status === BLOCKED_PUBLIC_SOURCE;
  const blockedReason = cleanText(pageEvidence.blocked_reason || (blocked ? pageEvidence.status : ''));
  const candidate = propertyCandidate.normalizePropertyCandidate({
    source_id: SOURCE_ID,
    source_name: SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    candidate_origin: 'listing_radar_adapter',
    source_url: sourceUrl,
    source_classification: classification.accepted ? 'exact_property_record' : sourceEvidenceAdapter.classifySourceUrl(sourceUrl),
    source_type: 'property-specific public listing page',
    normalized_address: urlAddress.normalized_address,
    property_address: urlAddress.normalized_address,
    raw_address_text: urlAddress.raw_address_text,
    city: urlAddress.city || context.city || 'Dallas',
    county: context.county || 'Dallas',
    state: urlAddress.state || context.state || 'TX',
    zip: urlAddress.zip,
    motivation_type: /auction|foreclosure/i.test(motivationEvidence) ? 'public_listing_foreclosure_or_auction' : 'public_listing_distress_signal',
    motivation_phrase: motivationEvidence,
    motivation_evidence_text: motivationEvidence,
    current_status: statusEvidence,
    status_evidence_text: statusEvidence,
    source_proof_text: cleanText([title, snippet, statusEvidence, motivationEvidence].filter(Boolean).join(' | ')),
    source_excerpt: cleanText([title, snippet].filter(Boolean).join(' | ')),
    asking_price: pageEvidence.asking_price || factBundle.asking_price,
    beds: pageEvidence.beds || factBundle.beds,
    baths: pageEvidence.baths || factBundle.baths,
    sqft: pageEvidence.sqft || factBundle.sqft,
    agent_name: pageEvidence.listing_agent_if_visible || factBundle.listing_agent_if_visible,
    retrieved_at: card.retrieved_at || nowIso(),
    missing_evidence: []
      .concat(!classification.accepted ? ['property-specific listing URL'] : [])
      .concat(!propertyIdentity.isCompleteAddress(urlAddress.normalized_address) ? ['complete address from listing URL or visible page'] : [])
      .concat(!statusEvidence ? ['visible listing status evidence'] : [])
      .concat(blocked ? ['listing page blocked; open manually'] : [])
      .concat(['visible owner contact route'])
  }, {
    acquisition_run_id: context.acquisition_run_id,
    city: context.city || 'Dallas',
    state: context.state || 'TX'
  });
  if (propertyIdentity.isCompleteAddress(urlAddress.normalized_address)) {
    candidate.normalized_address = urlAddress.normalized_address;
    candidate.property_address = urlAddress.normalized_address;
    candidate.raw_address_text = urlAddress.raw_address_text;
    candidate.city = urlAddress.city || candidate.city;
    candidate.state = urlAddress.state || candidate.state;
    candidate.zip = urlAddress.zip || candidate.zip;
    candidate.property_key = propertyIdentity.canonicalPropertyKey({
      normalized_address: urlAddress.normalized_address,
      source_url: sourceUrl
    });
  }
  candidate.address_provenance = urlAddress.address_provenance;
  candidate.listing_radar_status = blocked ? BLOCKED_PUBLIC_SOURCE : cleanText(pageEvidence.status || 'LISTING_SOURCE_CHECKED');
  candidate.blocked_sources = blocked
    ? [{ source: 'public_listing_page', url: sourceUrl, reason: blockedReason || BLOCKED_PUBLIC_SOURCE }]
    : [];
  candidate.contact_route = '';
  candidate.public_contact_route = '';
  candidate.contact_verified = false;
  candidate.contact_verification_status = 'not_verified';
  candidate.risk_flags = Array.from(new Set([].concat(candidate.risk_flags || [], blocked ? ['BLOCKED_PUBLIC_SOURCE'] : [], ['LISTING_RADAR_LINK_ONLY_VERIFY_MANUALLY'])));
  return candidate;
}

function statusCounts(packets) {
  return (Array.isArray(packets) ? packets : []).reduce((out, packet) => {
    const status = cleanText(packet && packet.packet_status) || 'UNKNOWN';
    out[status] = (out[status] || 0) + 1;
    return out;
  }, {});
}

async function runListingRadarAcquisitionAdapter(options = {}) {
  const maxResults = boundedInt(options.max_results, DEFAULT_MAX_RESULTS, DEFAULT_MAX_RESULTS);
  const maxPageFetches = boundedInt(options.max_page_fetches, DEFAULT_MAX_PAGE_FETCHES, DEFAULT_MAX_PAGE_FETCHES);
  const context = {
    acquisition_run_id: cleanText(options.acquisition_run_id),
    city: cleanText(options.city) || 'Dallas',
    county: cleanText(options.county) || 'Dallas',
    state: cleanText(options.state) || 'TX'
  };
  const queryGroups = Array.isArray(options.query_groups) && options.query_groups.length
    ? options.query_groups.slice(0, 6)
    : buildListingRadarQueryGroups(context);
  const searchResult = await searchProviderWorker.runSearchProvider({
    market: context.city,
    city: context.city,
    county: context.county,
    state: context.state,
    search_mode: 'listing_radar'
  }, {
    query_groups: queryGroups,
    env: options.env,
    fetchImpl: options.search_fetch_impl || options.searchFetchImpl,
    mock_results: options.mock_search_results,
    max_results: maxResults
  });
  const reviewedCards = Array.isArray(searchResult.cards) ? searchResult.cards.slice(0, maxResults) : [];
  const candidates = [];
  const accepted = [];
  const rejected = [];
  const pageFetches = [];
  let pageFetchCount = 0;

  for (const card of reviewedCards) {
    const sourceUrl = cleanText(card && (card.canonical_source_url || card.source_url || card.url));
    const classified = classifyListingUrl(sourceUrl);
    if (!classified.accepted) {
      rejected.push({ source_url: sourceUrl, reason: classified.reason });
      continue;
    }
    accepted.push({ source_url: sourceUrl, source_kind: classified.source_kind });
    let pageEvidence = {
      status: 'not_fetched',
      source_url: sourceUrl,
      final_source_url: sourceUrl,
      blocked: false
    };
    if (pageFetchCount < maxPageFetches) {
      pageFetchCount += 1;
      pageEvidence = await fetchListingPageEvidence(sourceUrl, {
        page_fetch_impl: options.page_fetch_impl || options.pageFetchImpl,
        fetch_impl: options.fetch_impl || options.fetchImpl,
        playwright_impl: options.playwright_impl || options.playwrightImpl,
        timeout_ms: options.timeout_ms
      });
      pageFetches.push({
        source_url: sourceUrl,
        status: pageEvidence.status,
        http_status: pageEvidence.http_status || null,
        blocked_reason: cleanText(pageEvidence.blocked_reason),
        blocked: pageEvidence.blocked === true
      });
    } else {
      pageFetches.push({ source_url: sourceUrl, status: 'skipped_max_page_fetches', blocked: false });
    }
    candidates.push(candidateFromListingCard(card, pageEvidence, context));
  }

  const cards = candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, context));
  const blockedCount = candidates.filter((candidate) => candidate.listing_radar_status === BLOCKED_PUBLIC_SOURCE).length;
  const diagnostics = {
    query_groups_planned: queryGroups.map((group) => group.query_group),
    query_groups_used: Array.isArray(searchResult.query_groups_used) ? searchResult.query_groups_used : [],
    query_group_count: Number(searchResult.query_group_count || 0) || 0,
    provider: cleanText(searchResult.provider),
    provider_status: cleanText(searchResult.status),
    provider_readiness: cleanText(searchResult.readiness),
    source_results_reviewed: reviewedCards.length,
    property_specific_results_reviewed: accepted.length,
    listing_radar_accepted_count: accepted.length,
    listing_radar_blocked_count: blockedCount,
    listing_radar_page_fetch_cap: maxPageFetches,
    listing_radar_page_fetches_used: pageFetchCount,
    page_fetches: pageFetches,
    rejected_results: rejected,
    rejected_reason_counts: rejected.reduce((out, item) => {
      out[item.reason] = (out[item.reason] || 0) + 1;
      return out;
    }, {}),
    accepted_results: accepted,
    packet_status_counts: statusCounts([]),
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
  return {
    source_id: SOURCE_ID,
    source_name: SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    status: candidates.length ? 'available' : cleanText(searchResult.status) || 'no_candidates',
    attempted: searchResult.attempted === true,
    candidates,
    cards,
    packets: [],
    diagnostics,
    blocked_reason: !candidates.length && rejected.length ? 'no_property_specific_listing_urls' : '',
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  SOURCE_ID,
  SOURCE_NAME,
  SOURCE_FAMILY,
  BLOCKED_PUBLIC_SOURCE,
  buildListingRadarQueryGroups,
  classifyListingUrl,
  isAcceptedListingUrl,
  extractAddressFromListingUrl,
  visibleListingFacts,
  fetchListingPageEvidence,
  candidateFromListingCard,
  runListingRadarAcquisitionAdapter
};
