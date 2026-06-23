'use strict';

const crypto = require('crypto');

const callReadyDealPacket = require('../research/call-ready-deal-packet');
const propertyCandidate = require('../research/property-candidate');
const propertyIdentity = require('../research/property-identity');
const searchSnippetEvidence = require('../research/search-snippet-evidence');

const SOURCE_ID = 'tx_dallas_craigslist_owner_posts';
const SOURCE_NAME = 'Dallas Craigslist owner real-estate posts';
const SOURCE_FAMILY = 'craigslist_owner_fsbo';
const BASE_SEARCH_URL = 'https://dallas.craigslist.org/search/rea';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 8000;
const MAX_SEARCH_PAGES = 4;
const MAX_DISCOVERED_URLS = 40;
const MAX_POST_FETCHES = 8;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_POST_AGE_DAYS = 14;
const STALE_RISK_AGE_DAYS = 7;
const QUERY_TERMS = Object.freeze([
  { query_group: 'craigslist_motivated_seller', query: 'motivated seller' },
  { query_group: 'craigslist_as_is', query: 'as is' },
  { query_group: 'craigslist_fixer', query: 'fixer' },
  { query_group: 'craigslist_needs_rehab', query: 'needs rehab' }
]);

const COMPLETE_ADDRESS_RE = /\b\d{1,7}\s+[A-Za-z0-9][A-Za-z0-9 .#'/-]{1,80}?\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b(?:\s+(?:apt|unit|#)\s*[A-Za-z0-9-]+)?\s*,\s*[A-Za-z][A-Za-z .'-]{1,40}\s*,\s*(?:TX|Texas)\s+\d{5}(?:-\d{4})?\b/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const POSSIBLE_WHOLESALER_RE = /\b(assignment(?:\s+of\s+contract)?|assignable|contract for sale|wholesale(?:r| deal)?|jv(?:\s+deal)?|cash buyers?|investor seller|buyer fee|off[- ]market deal)\b/i;
const EXPLICIT_OWNER_RE = /\b(for sale by owner|owner selling|owner posted|property owner|homeowner)\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function nowIso() {
  return new Date().toISOString();
}

function uniqueText(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function boundedInt(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(Math.floor(number), maximum);
}

function hashText(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex');
}

function decodeHtml(value) {
  return cleanText(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
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

function resolveUrl(value, baseUrl) {
  try {
    return new URL(decodeHtml(value), baseUrl).toString();
  } catch (_) {
    return '';
  }
}

function sourceHost(value) {
  try {
    return new URL(cleanText(value)).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function isCraigslistHost(value) {
  const host = sourceHost(value);
  return host === 'craigslist.org' || host.endsWith('.craigslist.org');
}

function isCraigslistOwnerSearchUrl(value) {
  try {
    const parsed = new URL(cleanText(value));
    return parsed.hostname.toLowerCase() === 'dallas.craigslist.org' &&
      /^\/search\/rea\/?$/i.test(parsed.pathname) &&
      parsed.searchParams.get('purveyor') === 'owner';
  } catch (_) {
    return false;
  }
}

function isCraigslistOwnerPostUrl(value) {
  try {
    const parsed = new URL(cleanText(value));
    if (!isCraigslistHost(parsed.toString())) return false;
    const path = decodeURIComponent(parsed.pathname || '');
    return /^\/(?:[^/]+\/)?reo\/d\/[^/]+\/\d{7,12}\.html$/i.test(path);
  } catch (_) {
    return false;
  }
}

function craigslistPostId(value) {
  if (!isCraigslistOwnerPostUrl(value)) return '';
  try {
    const match = new URL(cleanText(value)).pathname.match(/\/(\d{7,12})\.html$/i);
    return cleanText(match && match[1]);
  } catch (_) {
    return '';
  }
}

function buildCraigslistOwnerSearchQueries(input = {}) {
  const city = cleanText(input.city) || 'Dallas';
  return QUERY_TERMS.slice(0, MAX_SEARCH_PAGES).map((item, index) => {
    const url = new URL(BASE_SEARCH_URL);
    url.searchParams.set('purveyor', 'owner');
    url.searchParams.set('sort', 'date');
    url.searchParams.set('query', item.query);
    return {
      query_group: item.query_group,
      query: item.query,
      purpose: 'craigslist_owner_acquisition',
      provider_family: 'craigslist_direct',
      priority: index + 1,
      market: city,
      source_url: url.toString()
    };
  });
}

function extractCraigslistPostUrls(html, searchUrl) {
  const urls = [];
  const seen = new Set();
  const source = String(html || '');
  const hrefRe = /\bhref\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRe.exec(source)) !== null && urls.length < MAX_DISCOVERED_URLS) {
    const url = resolveUrl(match[1], searchUrl);
    const postId = craigslistPostId(url);
    if (!postId || seen.has(postId)) continue;
    seen.add(postId);
    urls.push(url);
  }
  return urls;
}

function pageTitle(html) {
  return decodeHtml((String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
    .replace(/\s*-\s*craigslist\s*$/i, '');
}

function postingBody(html) {
  const source = String(html || '');
  const section = source.match(/<(?:section|div)\b[^>]*id=["']postingbody["'][^>]*>([\s\S]*?)<\/(?:section|div)>/i);
  return stripHtml(section && section[1] || source).replace(/^QR Code Link to This Post\s*/i, '');
}

function structuredAddressFromHtml(html) {
  const source = String(html || '');
  const field = (name) => {
    const match = source.match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`, 'i'));
    return decodeHtml(match && match[1]);
  };
  const street = field('streetAddress');
  const city = field('addressLocality');
  const state = field('addressRegion');
  const zip = field('postalCode');
  if (!street || !city || !state || !zip) return '';
  const address = `${street}, ${city}, ${state} ${zip}`;
  return propertyIdentity.isCompleteAddress(address) ? propertyIdentity.canonicalAddress(address) : '';
}

function extractCompleteAddress(html, title, body) {
  const structured = structuredAddressFromHtml(html);
  if (structured) return { address: structured, evidence: structured, basis: 'structured_page_metadata' };
  const mapAddress = stripHtml((String(html || '').match(/<[^>]+class=["'][^"']*\bmapaddress\b[^"']*["'][^>]*>([\s\S]*?)<\//i) || [])[1] || '');
  const visible = cleanText([mapAddress, title, body].filter(Boolean).join(' | '));
  const match = visible.match(COMPLETE_ADDRESS_RE);
  const address = cleanText(match && match[0]);
  if (!propertyIdentity.isCompleteAddress(address)) return { address: '', evidence: '', basis: '' };
  return {
    address: propertyIdentity.canonicalAddress(address),
    evidence: address,
    basis: mapAddress && mapAddress.includes(address) ? 'map_address' : 'visible_page_text'
  };
}

function postingDates(html) {
  const source = String(html || '');
  const dates = [];
  const timeRe = /<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = timeRe.exec(source)) !== null) {
    const timestamp = Date.parse(cleanText(match[1]));
    if (Number.isFinite(timestamp)) dates.push(new Date(timestamp).toISOString());
  }
  const jsonDate = source.match(/"datePosted"\s*:\s*"([^"]+)"/i);
  if (jsonDate && Number.isFinite(Date.parse(jsonDate[1]))) dates.push(new Date(Date.parse(jsonDate[1])).toISOString());
  return uniqueText(dates);
}

function postAgeDays(postedAt, nowValue) {
  const posted = Date.parse(cleanText(postedAt));
  const now = Date.parse(cleanText(nowValue)) || Date.now();
  if (!Number.isFinite(posted)) return null;
  return Math.floor((now - posted) / 86400000);
}

function evidenceWindow(text, matchText) {
  const source = cleanText(text);
  const needle = cleanText(matchText);
  if (!source || !needle) return '';
  const index = source.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return needle;
  return cleanText(source.slice(Math.max(0, index - 80), Math.min(source.length, index + needle.length + 100)));
}

function normalizePhone(value) {
  const digits = cleanText(value).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (digits.length !== 10) return '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function extractReplyUrl(html, sourceUrl) {
  const source = String(html || '');
  const matches = [
    source.match(/\bhref=["']([^"']*\/reply\/[^"']+)["']/i),
    source.match(/\bdata-href=["']([^"']*\/reply\/[^"']+)["']/i),
    source.match(/\bdata-url=["']([^"']*\/reply\/[^"']+)["']/i)
  ];
  for (const match of matches) {
    if (!match || !cleanText(match[1])) continue;
    const url = resolveUrl(match[1], sourceUrl);
    if (url && isCraigslistHost(url)) return url;
  }
  return '';
}

function extractCraigslistContactEvidence(input = {}) {
  const sourceUrl = cleanText(input.source_url);
  const visibleText = cleanText([input.title, input.body, input.visible_text].filter(Boolean).join(' '));
  const phoneMatches = visibleText.match(PHONE_RE) || [];
  for (const rawPhone of phoneMatches) {
    const evidence = evidenceWindow(visibleText, rawPhone);
    if (!/\b(call|text|phone|tel)\b/i.test(evidence)) continue;
    if (/\b(support|customer service|craigslist help)\b/i.test(evidence)) continue;
    const phone = normalizePhone(rawPhone);
    if (!phone) continue;
    return {
      contact_route: 'Direct Phone',
      contact_role: EXPLICIT_OWNER_RE.test(visibleText) ? 'Self-described owner poster' : 'Craigslist poster',
      contact_name: 'Craigslist poster',
      contact_phone: phone,
      contact_email: '',
      contact_source_url: sourceUrl,
      contact_evidence_text: evidence,
      contact_verification_status: 'verified_visible_source',
      contact_verified: true
    };
  }
  const emails = visibleText.match(EMAIL_RE) || [];
  for (const rawEmail of emails) {
    const email = cleanText(rawEmail).toLowerCase();
    const evidence = evidenceWindow(visibleText, email);
    if (!/\b(email|contact|reply|message)\b/i.test(evidence)) continue;
    return {
      contact_route: 'Direct Email',
      contact_role: EXPLICIT_OWNER_RE.test(visibleText) ? 'Self-described owner poster' : 'Craigslist poster',
      contact_name: 'Craigslist poster',
      contact_phone: '',
      contact_email: email,
      contact_source_url: sourceUrl,
      contact_evidence_text: evidence,
      contact_verification_status: 'verified_visible_source',
      contact_verified: true
    };
  }
  const replyUrl = extractReplyUrl(input.html, sourceUrl);
  if (replyUrl) {
    return {
      contact_route: 'Public Reply',
      contact_role: EXPLICIT_OWNER_RE.test(visibleText) ? 'Self-described owner poster' : 'Craigslist poster',
      contact_name: 'Craigslist poster',
      contact_phone: '',
      contact_email: '',
      contact_source_url: replyUrl,
      contact_evidence_text: 'Public reply link visible on Craigslist property post.',
      contact_verification_status: 'verified_visible_source',
      contact_verified: true
    };
  }
  return {
    contact_route: 'Manual Lookup Needed',
    contact_role: EXPLICIT_OWNER_RE.test(visibleText) ? 'Self-described owner poster' : 'Craigslist poster',
    contact_name: 'Craigslist poster',
    contact_phone: '',
    contact_email: '',
    contact_source_url: '',
    contact_evidence_text: '',
    contact_verification_status: 'not_verified',
    contact_verified: false
  };
}

function extractAskingPrice(html, visibleText) {
  const htmlMatch = String(html || '').match(/<[^>]+class=["'][^"']*\bprice\b[^"']*["'][^>]*>\s*(\$[\d,]+)\s*</i);
  const visibleMatch = cleanText(visibleText).match(/\$\d{2,3}(?:,\d{3})+/);
  return cleanText(htmlMatch && htmlMatch[1] || visibleMatch && visibleMatch[0]);
}

function riskFlagsForPost(visibleText, ageDays) {
  const risks = ['POSTER_ROLE_UNVERIFIED'];
  if (POSSIBLE_WHOLESALER_RE.test(cleanText(visibleText))) risks.push('POSSIBLE_WHOLESALER');
  if (Number.isFinite(ageDays) && ageDays > STALE_RISK_AGE_DAYS) risks.push('CRAIGSLIST_STALE_RISK');
  return uniqueText(risks);
}

function candidateFromCraigslistPost(input = {}, context = {}) {
  const sourceUrl = cleanText(input.source_url);
  const html = String(input.html || '');
  const title = cleanText(input.title || pageTitle(html));
  const body = cleanText(input.body || postingBody(html));
  const visibleText = cleanText([title, body].filter(Boolean).join(' '));
  const addressResult = extractCompleteAddress(html, title, body);
  const phrase = searchSnippetEvidence.extractVisiblePhraseCandidate(title, body, {
    source_title: title,
    source_snippet: body,
    source_domain: sourceHost(sourceUrl)
  });
  const statusCandidate = searchSnippetEvidence.extractVisibleStatusCandidate(title, body, {
    source_title: title,
    source_snippet: body,
    source_domain: sourceHost(sourceUrl)
  });
  const dates = postingDates(html);
  const postedAt = cleanText(input.posted_at || dates[0]);
  const ageDays = postAgeDays(postedAt, context.now || nowIso());
  const categoryStatus = isCraigslistOwnerPostUrl(sourceUrl) && Number.isFinite(ageDays) && ageDays >= -1 && ageDays <= MAX_POST_AGE_DAYS
    ? {
      text: 'for sale',
      evidence: `Craigslist /reo/ real-estate-for-sale post dated ${postedAt}.`
    }
    : { text: '', evidence: '' };
  const currentStatus = statusCandidate.promoted ? statusCandidate.text : categoryStatus.text;
  const statusEvidence = statusCandidate.promoted
    ? `${statusCandidate.provenance}: ${statusCandidate.provenance_match || statusCandidate.text}; posted ${postedAt}`
    : categoryStatus.evidence;
  const contact = extractCraigslistContactEvidence({
    source_url: sourceUrl,
    title,
    body,
    visible_text: visibleText,
    html
  });
  const risks = riskFlagsForPost(visibleText, ageDays);
  const sourceProofText = cleanText([
    addressResult.evidence ? `Address: ${addressResult.evidence}` : '',
    phrase.visible ? phrase.text : '',
    statusEvidence,
    contact.contact_evidence_text
  ].filter(Boolean).join(' | '));
  const candidate = propertyCandidate.normalizePropertyCandidate({
    source_id: SOURCE_ID,
    source_name: SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    candidate_origin: 'dallas_craigslist_owner_adapter',
    source_url: sourceUrl,
    source_classification: 'exact_property_record',
    source_type: 'public individual Craigslist real-estate-for-sale post',
    source_row_reference: craigslistPostId(sourceUrl),
    normalized_address: addressResult.address,
    motivation_type: phrase.family || 'Craigslist owner post',
    motivation_phrase: phrase.visible ? phrase.text : '',
    motivation_evidence_text: phrase.visible ? phrase.text : '',
    current_status: currentStatus,
    status_evidence_text: statusEvidence,
    status_verified_visible: !!currentStatus && !!statusEvidence,
    source_text: visibleText,
    source_excerpt: cleanText([title, body.slice(0, 500)].join(' | ')),
    source_page_text: visibleText,
    source_proof_text: sourceProofText,
    contact_route: contact.contact_route,
    contact_role: contact.contact_role,
    contact_name: contact.contact_name,
    contact_phone: contact.contact_phone,
    contact_email: contact.contact_email,
    contact_source_url: contact.contact_source_url,
    contact_evidence_text: contact.contact_evidence_text,
    contact_verification_status: contact.contact_verification_status,
    contact_verified: contact.contact_verified,
    asking_price: extractAskingPrice(html, visibleText),
    retrieved_at: context.retrieved_at || nowIso(),
    risk_flags: risks,
    missing_evidence: []
      .concat(!propertyIdentity.isCompleteAddress(addressResult.address) ? ['complete canonical address'] : [])
      .concat(!phrase.visible ? ['verbatim source-backed motivation'] : [])
      .concat(!currentStatus || !statusEvidence ? ['visible current post status/date'] : [])
      .concat(!contact.contact_verified ? ['verified public contact route'] : [])
  }, {
    acquisition_run_id: context.acquisition_run_id,
    city: context.city || 'Dallas',
    state: context.state || 'TX'
  });
  return Object.assign({}, candidate, {
    craigslist_post_id: craigslistPostId(sourceUrl),
    craigslist_posted_at: postedAt,
    craigslist_post_age_days: ageDays,
    body_hash: hashText(visibleText),
    status_verified_visible: !!currentStatus && !!statusEvidence,
    risk_flags: risks
  });
}

async function fetchCraigslistPage(url, options = {}) {
  const targetUrl = cleanText(url);
  const fetchImpl = options.fetch_impl || options.fetchImpl || global.fetch;
  const kind = cleanText(options.kind);
  const allowed = kind === 'search'
    ? isCraigslistOwnerSearchUrl(targetUrl)
    : isCraigslistOwnerPostUrl(targetUrl);
  if (!allowed) return { status: 'unsafe_or_unsupported_url', source_url: targetUrl, stop: false };
  if (typeof fetchImpl !== 'function') return { status: 'fetch_unavailable', source_url: targetUrl, stop: true };
  const timeoutMs = boundedInt(options.timeout_ms, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
        'User-Agent': 'WholesaleOS public-source-preview/1.0'
      },
      signal: controller ? controller.signal : undefined
    });
    const finalUrl = cleanText(response && response.url) || targetUrl;
    const finalAllowed = kind === 'search'
      ? isCraigslistOwnerSearchUrl(finalUrl)
      : isCraigslistOwnerPostUrl(finalUrl);
    if (!finalAllowed) {
      return { status: 'unsafe_redirect_rejected', source_url: targetUrl, final_source_url: finalUrl, stop: false };
    }
    const statusCode = Number(response && response.status || 0) || 0;
    if (statusCode === 403 || statusCode === 429) {
      return {
        status: statusCode === 403 ? 'source_forbidden' : 'source_rate_limited',
        http_status: statusCode,
        source_url: targetUrl,
        final_source_url: finalUrl,
        stop: true
      };
    }
    if (!response || !response.ok) {
      return {
        status: `http_${statusCode}`,
        http_status: statusCode,
        source_url: targetUrl,
        final_source_url: finalUrl,
        stop: false
      };
    }
    const contentLength = Number(response.headers && response.headers.get && response.headers.get('content-length') || 0) || 0;
    if (contentLength > MAX_PAGE_BYTES) {
      return { status: 'oversize_rejected', source_url: targetUrl, final_source_url: finalUrl, stop: false };
    }
    const html = String(await response.text() || '');
    if (Buffer.byteLength(html) > MAX_PAGE_BYTES) {
      return { status: 'oversize_rejected', source_url: targetUrl, final_source_url: finalUrl, stop: false };
    }
    return {
      status: 'fetched',
      http_status: statusCode,
      source_url: targetUrl,
      final_source_url: finalUrl,
      html,
      stop: false
    };
  } catch (error) {
    return {
      status: /abort|timeout/i.test(cleanText(error && error.message)) ? 'timed_out' : 'fetch_failed',
      source_url: targetUrl,
      error: cleanText(error && error.message).slice(0, 160),
      stop: false
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function duplicateReason(candidate, seen) {
  const postId = cleanText(candidate.craigslist_post_id);
  const address = cleanText(candidate.normalized_address).toLowerCase();
  const phone = cleanText(candidate.contact_phone).replace(/\D/g, '');
  const bodyHash = cleanText(candidate.body_hash);
  if (postId && seen.postIds.has(postId)) return 'duplicate_post_id';
  if (address && propertyIdentity.isCompleteAddress(candidate.normalized_address) && seen.addresses.has(address)) return 'duplicate_address';
  if (phone && seen.phones.has(phone)) return 'duplicate_phone';
  if (bodyHash && seen.bodyHashes.has(bodyHash)) return 'duplicate_body_hash';
  if (postId) seen.postIds.add(postId);
  if (address && propertyIdentity.isCompleteAddress(candidate.normalized_address)) seen.addresses.add(address);
  if (phone) seen.phones.add(phone);
  if (bodyHash) seen.bodyHashes.add(bodyHash);
  return '';
}

function addressMatchesMarket(address, context = {}) {
  if (!propertyIdentity.isCompleteAddress(address)) return true;
  const parsed = propertyIdentity.parseAddress(address);
  const city = cleanText(context.city);
  const state = cleanText(context.state).toUpperCase();
  if (city && cleanText(parsed.city).toLowerCase() !== city.toLowerCase()) return false;
  if (state && cleanText(parsed.state).toUpperCase() !== state) return false;
  return true;
}

function reasonCounts(items) {
  return (Array.isArray(items) ? items : []).reduce((out, item) => {
    const reason = cleanText(item && item.reason) || 'unknown';
    out[reason] = (out[reason] || 0) + 1;
    return out;
  }, {});
}

async function runDallasCraigslistOwnerAcquisitionAdapter(options = {}) {
  const context = {
    acquisition_run_id: cleanText(options.acquisition_run_id),
    city: cleanText(options.city) || 'Dallas',
    county: cleanText(options.county) || 'Dallas',
    state: cleanText(options.state) || 'TX',
    now: cleanText(options.now) || nowIso(),
    retrieved_at: cleanText(options.captured_at) || nowIso()
  };
  const maxSearchPages = boundedInt(options.max_search_pages, MAX_SEARCH_PAGES, MAX_SEARCH_PAGES);
  const maxDiscoveredUrls = boundedInt(options.max_discovered_urls, MAX_DISCOVERED_URLS, MAX_DISCOVERED_URLS);
  const maxPostFetches = boundedInt(
    options.max_post_fetches == null ? options.max_page_fetches : options.max_post_fetches,
    MAX_POST_FETCHES,
    MAX_POST_FETCHES
  );
  const timeoutMs = boundedInt(options.timeout_ms, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const fetchImpl = options.page_fetch_impl || options.pageFetchImpl || options.fetch_impl || options.fetchImpl;
  const queryGroups = buildCraigslistOwnerSearchQueries(context).slice(0, maxSearchPages);
  const searchPages = [];
  const discoveredUrls = [];
  const discoveredIds = new Set();
  const rejected = [];
  let stoppedBySource = false;

  for (const group of queryGroups) {
    const page = await fetchCraigslistPage(group.source_url, {
      fetch_impl: fetchImpl,
      timeout_ms: timeoutMs,
      kind: 'search'
    });
    searchPages.push({
      query_group: group.query_group,
      query: group.query,
      source_url: group.source_url,
      status: page.status,
      http_status: page.http_status || null
    });
    if (page.stop) {
      stoppedBySource = true;
      break;
    }
    if (page.status !== 'fetched') continue;
    for (const postUrl of extractCraigslistPostUrls(page.html, page.final_source_url || group.source_url)) {
      if (discoveredUrls.length >= maxDiscoveredUrls) break;
      const postId = craigslistPostId(postUrl);
      if (!postId || discoveredIds.has(postId)) continue;
      discoveredIds.add(postId);
      discoveredUrls.push(postUrl);
    }
    if (discoveredUrls.length >= maxDiscoveredUrls) break;
  }

  const candidates = [];
  const postFetches = [];
  const seen = {
    postIds: new Set(),
    addresses: new Set(),
    phones: new Set(),
    bodyHashes: new Set()
  };
  for (const sourceUrl of discoveredUrls.slice(0, maxPostFetches)) {
    const page = await fetchCraigslistPage(sourceUrl, {
      fetch_impl: fetchImpl,
      timeout_ms: timeoutMs,
      kind: 'post'
    });
    postFetches.push({
      source_url: sourceUrl,
      status: page.status,
      http_status: page.http_status || null
    });
    if (page.stop) {
      stoppedBySource = true;
      break;
    }
    if (page.status !== 'fetched') {
      rejected.push({ source_url: sourceUrl, reason: page.status });
      continue;
    }
    const candidate = candidateFromCraigslistPost({
      source_url: page.final_source_url || sourceUrl,
      html: page.html
    }, context);
    if (!candidate.craigslist_posted_at) {
      rejected.push({ source_url: sourceUrl, reason: 'missing_post_date' });
      continue;
    }
    if (candidate.craigslist_post_age_days > MAX_POST_AGE_DAYS) {
      rejected.push({ source_url: sourceUrl, reason: 'stale_post_over_14_days' });
      continue;
    }
    if (candidate.craigslist_post_age_days < -1) {
      rejected.push({ source_url: sourceUrl, reason: 'future_post_date' });
      continue;
    }
    if (!addressMatchesMarket(candidate.normalized_address, context)) {
      rejected.push({ source_url: sourceUrl, reason: 'wrong_market_address' });
      continue;
    }
    const duplicate = duplicateReason(candidate, seen);
    if (duplicate) {
      rejected.push({ source_url: sourceUrl, reason: duplicate });
      continue;
    }
    candidates.push(candidate);
  }

  const cards = candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, context));
  const packets = candidates.map((candidate) => callReadyDealPacket.buildCallReadyDealPacket(candidate, { context }));
  const packetStatusCounts = packets.reduce((out, packet) => {
    const status = cleanText(packet && packet.packet_status) || 'UNKNOWN';
    out[status] = (out[status] || 0) + 1;
    return out;
  }, {});
  const diagnostics = {
    adapter: 'dallas_craigslist_owner_acquisition_adapter',
    provider: 'craigslist_direct',
    provider_calls_made: 0,
    query_groups_planned: queryGroups.map((group) => group.query_group),
    query_groups_used: searchPages.map((page) => page.query_group),
    search_pages_cap: maxSearchPages,
    search_pages_hard_cap: MAX_SEARCH_PAGES,
    search_pages_used: searchPages.length,
    discovered_url_cap: maxDiscoveredUrls,
    discovered_url_hard_cap: MAX_DISCOVERED_URLS,
    discovered_url_count: discoveredUrls.length,
    post_fetch_cap: maxPostFetches,
    post_fetch_hard_cap: MAX_POST_FETCHES,
    post_fetches_used: postFetches.length,
    max_page_bytes: MAX_PAGE_BYTES,
    timeout_ms: timeoutMs,
    retries: 0,
    search_pages: searchPages,
    discovered_urls: discoveredUrls,
    post_fetches: postFetches,
    rejected_results: rejected,
    rejected_reason_counts: reasonCounts(rejected),
    packet_status_counts: packetStatusCounts,
    call_ready_count: Number(packetStatusCounts.CALL_READY || 0) || 0,
    outreach_ready_count: Number(packetStatusCounts.OUTREACH_READY || 0) || 0,
    stopped_by_403_or_429: stoppedBySource,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
  return {
    source_id: SOURCE_ID,
    source_name: SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    status: candidates.length ? 'available' : stoppedBySource ? 'source_blocked' : 'no_candidates',
    attempted: searchPages.length > 0,
    candidates,
    cards,
    packets,
    diagnostics,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  SOURCE_ID,
  SOURCE_NAME,
  SOURCE_FAMILY,
  BASE_SEARCH_URL,
  QUERY_TERMS,
  MAX_SEARCH_PAGES,
  MAX_DISCOVERED_URLS,
  MAX_POST_FETCHES,
  MAX_PAGE_BYTES,
  MAX_POST_AGE_DAYS,
  buildCraigslistOwnerSearchQueries,
  isCraigslistOwnerSearchUrl,
  isCraigslistOwnerPostUrl,
  craigslistPostId,
  extractCraigslistPostUrls,
  extractCompleteAddress,
  extractCraigslistContactEvidence,
  candidateFromCraigslistPost,
  addressMatchesMarket,
  fetchCraigslistPage,
  runDallasCraigslistOwnerAcquisitionAdapter
};
