'use strict';

const crypto = require('crypto');

const compResearchProvider = require('./comp-research-provider');
const propertyIdentity = require('./property-identity');
const searchProviderWorker = require('./search-provider-worker');
const sourceEvidenceAdapter = require('./source-evidence-adapter');
const sourceCatalog = require('../sources/source-catalog');

const DEFAULT_CAPS = Object.freeze({
  output_deals: 25,
  source_pages: 8,
  documents: 4,
  property_link_searches: 20,
  property_pages_fetched: 12,
  timeout_ms: 8000,
  retries: 0
});

const PROPERTY_HOSTS = Object.freeze({
  zillow: /(?:^|\.)zillow\.com$/i,
  redfin: /(?:^|\.)redfin\.com$/i,
  realtor: /(?:^|\.)realtor\.com$/i,
  auction: /(?:^|\.)auction\.com$/i
});

const MOTIVATION_PATTERNS = [
  { type: 'foreclosure', pattern: /\b(foreclosure|trustee sale|substitute trustee|notice of sale)\b/i },
  { type: 'tax_sale', pattern: /\b(tax sale|tax resale|tax delinquent|struck off|sheriff sale)\b/i },
  { type: 'auction', pattern: /\b(auction|opening bid|bid starts|sale date)\b/i },
  { type: 'as_is', pattern: /\b(as-?is|no repairs|cash only)\b/i },
  { type: 'fixer', pattern: /\b(fixer|needs work|needs tlc|rehab|handyman)\b/i },
  { type: 'owner_post', pattern: /\b(for sale by owner|owner selling|craigslist reply|public reply)\b/i }
];

const STATUS_PATTERNS = [
  /\b(active|for sale|listed|new listing)\b/i,
  /\b(sale date|auction date|trustee sale|foreclosure sale)\b/i,
  /\b(price cut|price reduced)\b/i
];

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function numberValue(value) {
  const number = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function boundedInt(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), maximum));
}

function uniqueText(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function hostOf(value) {
  try {
    return new URL(cleanText(value)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(cleanText(value)).digest('hex').slice(0, 16)}`;
}

function marketFrom(input = {}) {
  const market = input.market && typeof input.market === 'object' ? input.market : input;
  return {
    city: cleanText(market.city) || 'Dallas',
    county: cleanText(market.county) || 'Dallas',
    state: cleanText(market.state).toUpperCase() || 'TX'
  };
}

function capsFrom(input = {}) {
  const source = input.caps && typeof input.caps === 'object' ? input.caps : input;
  return {
    output_deals: boundedInt(source.output_deals || source.limit, DEFAULT_CAPS.output_deals, DEFAULT_CAPS.output_deals),
    source_pages: boundedInt(source.source_pages, DEFAULT_CAPS.source_pages, DEFAULT_CAPS.source_pages),
    documents: boundedInt(source.documents || source.pdfs, DEFAULT_CAPS.documents, DEFAULT_CAPS.documents),
    property_link_searches: boundedInt(source.property_link_searches, DEFAULT_CAPS.property_link_searches, DEFAULT_CAPS.property_link_searches),
    property_pages_fetched: boundedInt(source.property_pages_fetched, DEFAULT_CAPS.property_pages_fetched, DEFAULT_CAPS.property_pages_fetched),
    timeout_ms: boundedInt(source.timeout_ms, DEFAULT_CAPS.timeout_ms, DEFAULT_CAPS.timeout_ms),
    retries: 0
  };
}

function buildFreePublicDealBoardQueries(input = {}) {
  const market = marketFrom(input);
  const place = [market.county, market.state].filter(Boolean).join(' ');
  return [
    {
      query_group: 'official_foreclosure_trustee_notices',
      provider_family: 'official_foreclosure',
      purpose: 'free_public_deal_board',
      expected_url_pattern: 'official county foreclosure trustee notice page or document',
      query: `${place} foreclosure trustee sale notice public record`
    },
    {
      query_group: 'tax_sale_sheriff_resale',
      provider_family: 'tax_sale',
      purpose: 'free_public_deal_board',
      expected_url_pattern: 'official tax resale sheriff sale struck off page or document',
      query: `${place} tax sale sheriff sale resale struck off property`
    },
    {
      query_group: 'auction_public_property_pages',
      provider_family: 'auction',
      purpose: 'free_public_deal_board',
      expected_url_pattern: 'auction.com/details property page',
      query: `site:auction.com/details ${market.city} ${market.state} foreclosure auction property`
    },
    {
      query_group: 'zillow_property_pages',
      provider_family: 'zillow',
      purpose: 'free_public_deal_board',
      expected_url_pattern: 'zillow.com/homedetails property page',
      query: `site:zillow.com/homedetails ${market.city} ${market.state} cash only fixer as-is`
    },
    {
      query_group: 'redfin_property_pages',
      provider_family: 'redfin',
      purpose: 'free_public_deal_board',
      expected_url_pattern: 'redfin.com/.../home/<id> property page',
      query: `site:redfin.com ${market.city} ${market.state} cash only fixer price reduced`
    },
    {
      query_group: 'realtor_property_pages',
      provider_family: 'realtor',
      purpose: 'free_public_deal_board',
      expected_url_pattern: 'realtor.com/realestateandhomes-detail property page',
      query: `site:realtor.com/realestateandhomes-detail ${market.city} ${market.state} cash only fixer`
    },
    {
      query_group: 'craigslist_owner_posts',
      provider_family: 'craigslist_owner',
      purpose: 'free_public_deal_board',
      expected_url_pattern: 'dallas.craigslist.org/.../reo/d/.../<post-id>.html',
      query: `site:dallas.craigslist.org/dal/reo/d ${market.city} owner fixer as-is`
    }
  ];
}

function textBundle(record) {
  return cleanText([
    record && record.headline,
    record && record.title,
    record && record.source_title,
    record && record.snippet,
    record && record.source_snippet,
    record && record.motivation_evidence_text,
    record && record.status_evidence_text,
    record && record.body,
    record && record.description
  ].filter(Boolean).join(' | '));
}

function completeAddressFromText(value) {
  const text = cleanText(value);
  const match = text.match(/\b\d{1,7}\s+[A-Za-z0-9][A-Za-z0-9 .#'/-]{1,80}?\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b(?:\s+(?:apt|unit|#)\s*[A-Za-z0-9-]+)?\s*,\s*[A-Za-z][A-Za-z .'-]{1,40}\s*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i);
  const address = cleanText(match && match[0]);
  return propertyIdentity.isCompleteAddress(address) ? propertyIdentity.canonicalAddress(address) : '';
}

function addressFromAuctionUrl(sourceUrl) {
  const url = cleanText(sourceUrl);
  if (!isHttpUrl(url) || !PROPERTY_HOSTS.auction.test(hostOf(url))) return '';
  try {
    const parsed = new URL(url);
    const match = decodeURIComponent(parsed.pathname || '').match(/\/details\/([^/?#]+)/i);
    const slug = cleanText(match && match[1]).replace(/[_-]+/g, ' ');
    if (!slug) return '';
    const address = completeAddressFromText(slug);
    if (address) return address;
    const parts = slug.split(/\s+/).filter(Boolean);
    if (parts.length < 5) return '';
    if (parts.length >= 2 && /^\d{5}(?:-\d{4})?$/.test(parts[parts.length - 1]) && /^\d{5}(?:-\d{4})?$/.test(parts[parts.length - 2])) {
      parts.pop();
    }
    const zip = /^\d{5}(?:-\d{4})?$/.test(parts[parts.length - 1]) ? parts.pop() : '';
    const state = /^[A-Za-z]{2}$/.test(parts[parts.length - 1] || '') ? parts.pop().toUpperCase() : '';
    const city = parts.length ? parts.pop() : '';
    const street = parts.join(' ');
    const formatted = propertyIdentity.parseAddress([street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '));
    return formatted.complete ? formatted.full_address : '';
  } catch (_) {
    return '';
  }
}

function addressFromRecord(record) {
  const explicit = cleanText(record && (
    record.normalized_address ||
    record.property_address ||
    record.address ||
    record.raw_address_text ||
    record.display_address
  ));
  if (propertyIdentity.isCompleteAddress(explicit)) return propertyIdentity.canonicalAddress(explicit);

  const sourceUrl = cleanText(record && (record.source_url || record.url || record.zillow_url || record.redfin_url || record.realtor_url || record.auction_url));
  const title = cleanText(record && (record.title || record.source_title || record.headline));
  const fromUrl = propertyIdentity.addressFromPropertyUrl(sourceUrl, title);
  if (fromUrl && fromUrl.complete) return fromUrl.full_address;

  const fromAuction = addressFromAuctionUrl(sourceUrl);
  if (fromAuction) return fromAuction;

  return completeAddressFromText(textBundle(record));
}

function parseAddressParts(address, market) {
  const parsed = propertyIdentity.parseAddress(address);
  return {
    normalized_address: parsed.complete ? parsed.full_address : '',
    raw_address_text: cleanText(address),
    city: cleanText(parsed.city) || market.city,
    county: market.county,
    state: cleanText(parsed.state) || market.state,
    zip: cleanText(parsed.zip)
  };
}

function mapsUrl(address, market) {
  const query = cleanText(address || [market.city, market.state].filter(Boolean).join(', '));
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

function sourceFamily(record) {
  const explicit = cleanText(record && (record.source_family || record.provider_family));
  if (explicit) return explicit;
  const url = cleanText(record && (record.source_url || record.url || ''));
  const host = hostOf(url);
  if (/craigslist/.test(host)) return 'craigslist_owner';
  if (/auction\.com/.test(host)) return 'auction';
  if (/zillow/.test(host)) return 'zillow';
  if (/redfin/.test(host)) return 'redfin';
  if (/realtor/.test(host)) return 'realtor';
  if (/county|clerk|sheriff|tax|gov/.test(`${host} ${url}`)) return 'official_public_source';
  return 'public_source';
}

function sourceName(record, family) {
  return cleanText(record && (record.source_name || record.source || record.provider_name)) || ({
    official_public_source: 'Official public source',
    auction: 'Auction.com',
    zillow: 'Zillow',
    redfin: 'Redfin',
    realtor: 'Realtor',
    craigslist_owner: 'Craigslist owner post',
    tax_sale: 'Tax sale source'
  })[family] || 'Public source';
}

function motivationFromRecord(record) {
  const explicit = cleanText(record && (record.motivation_type || record.distress_type));
  const evidence = cleanText(record && (record.motivation_evidence_text || record.motivation_evidence || record.why_this_might_be_a_deal));
  if (explicit || evidence) {
    return {
      motivation_type: explicit || 'source_evidence',
      motivation_evidence_text: evidence || explicit
    };
  }
  const text = textBundle(record);
  for (const item of MOTIVATION_PATTERNS) {
    const match = text.match(item.pattern);
    if (match) {
      return {
        motivation_type: item.type,
        motivation_evidence_text: cleanText(match[0])
      };
    }
  }
  return { motivation_type: '', motivation_evidence_text: '' };
}

function statusEvidenceFromRecord(record) {
  const explicit = cleanText(record && (record.status_evidence_text || record.current_status || record.listing_status));
  if (explicit) return explicit;
  const text = textBundle(record);
  for (const pattern of STATUS_PATTERNS) {
    const match = text.match(pattern);
    if (match) return cleanText(match[0]);
  }
  return '';
}

function eventDateFromRecord(record) {
  return cleanText(record && (
    record.sale_date_or_event_date ||
    record.event_date ||
    record.sale_date ||
    record.auction_date ||
    record.posted_at ||
    record.date
  ));
}

function propertySpecificUrl(value) {
  const url = cleanText(value);
  if (!isHttpUrl(url)) return '';
  return sourceEvidenceAdapter.classifySourceUrl(url) === 'exact_property_record' ? url : '';
}

function propertyLinkSet(record) {
  const candidates = [
    cleanText(record && record.source_url),
    cleanText(record && record.url),
    cleanText(record && record.zillow_url),
    cleanText(record && record.redfin_url),
    cleanText(record && record.realtor_url),
    cleanText(record && record.auction_url)
  ].filter(Boolean);
  const links = { zillow_url: '', redfin_url: '', realtor_url: '', auction_url: '' };
  const rejected = [];
  for (const url of uniqueText(candidates)) {
    const host = hostOf(url);
    const exact = propertySpecificUrl(url);
    if (PROPERTY_HOSTS.zillow.test(host)) {
      if (exact) links.zillow_url = exact;
      else rejected.push({ url, reason: 'generic_zillow_link_rejected' });
    } else if (PROPERTY_HOSTS.redfin.test(host)) {
      if (exact) links.redfin_url = exact;
      else rejected.push({ url, reason: 'generic_redfin_link_rejected' });
    } else if (PROPERTY_HOSTS.realtor.test(host)) {
      if (exact) links.realtor_url = exact;
      else rejected.push({ url, reason: 'generic_realtor_link_rejected' });
    } else if (PROPERTY_HOSTS.auction.test(host)) {
      if (exact) links.auction_url = exact;
      else rejected.push({ url, reason: 'generic_auction_link_rejected' });
    }
  }
  return Object.assign(links, { rejected_property_links: rejected });
}

function firstClickLink(deal) {
  return cleanText(
    deal.source_document_url ||
    deal.source_url ||
    deal.auction_url ||
    deal.zillow_url ||
    deal.redfin_url ||
    deal.realtor_url ||
    deal.maps_url
  );
}

function validateCompRecords(record, normalizedAddress) {
  const rawComps = []
    .concat(Array.isArray(record && record.possible_comps) ? record.possible_comps : [])
    .concat(Array.isArray(record && record.comp_candidates) ? record.comp_candidates : []);
  const job = {
    normalized_address: normalizedAddress,
    source_evidence: [{ type: 'source_evidence_pack', source_url: cleanText(record && record.source_url), address_candidate: normalizedAddress }]
  };
  const seen = new Set();
  const verified = [];
  const rejected = [];
  for (const raw of rawComps) {
    const normalized = compResearchProvider.normalizeCompCandidate(raw, { id: 'free_public_deal_board' });
    const classified = compResearchProvider.classifyCompCandidate(normalized, job, seen);
    if (classified.verification_status === 'verified_sold_comp' || classified.verification_status === 'verified') verified.push(classified);
    else rejected.push({
      comp_address: classified.comp_address,
      source_url: classified.source_url,
      missing_fields: classified.missing_fields,
      verification_status: classified.verification_status
    });
  }
  return {
    verified_sold_comps: verified.slice(0, 3),
    rejected_comp_candidates: rejected,
    verified_count: verified.length,
    comp_status: verified.length >= 3 ? 'verified_sold_comps_ready' : verified.length > 0 ? 'partial_verified_sold_comps' : 'missing_verified_sold_comps',
    ARV_lock_state: verified.length >= 3 ? 'ARV_UNLOCKED_VERIFIED_COMPS' : 'ARV_LOCKED_NO_VERIFIED_COMPS'
  };
}

function confidenceScore(deal) {
  let score = 0;
  if (deal.normalized_address) score += 28;
  if (deal.source_url || deal.source_document_url) score += 16;
  if (deal.source_family && /official|foreclosure|tax|sheriff/i.test(deal.source_family)) score += 18;
  if (deal.motivation_evidence_text) score += 16;
  if (deal.status_evidence_text || deal.sale_date_or_event_date) score += 12;
  if (deal.contact_route_if_visible) score += 6;
  if (deal.zillow_url || deal.redfin_url || deal.realtor_url || deal.auction_url) score += 4;
  return Math.max(0, Math.min(100, score));
}

function missingFields(deal) {
  return []
    .concat(!deal.normalized_address ? ['complete property address'] : [])
    .concat(!(deal.source_url || deal.source_document_url) ? ['source proof URL'] : [])
    .concat(!deal.motivation_evidence_text ? ['motivation evidence'] : [])
    .concat(!(deal.status_evidence_text || deal.sale_date_or_event_date) ? ['current status or event date evidence'] : [])
    .concat(!deal.contact_route_if_visible ? ['visible contact route'] : [])
    .concat(deal.comp_status !== 'verified_sold_comps_ready' ? ['3 verified sold comps'] : []);
}

function nextBestAction(deal) {
  if (!deal.normalized_address) return 'VERIFY_PROPERTY_IDENTITY';
  if (!(deal.source_url || deal.source_document_url)) return 'VERIFY_SOURCE_PROOF';
  if (!deal.motivation_evidence_text) return 'VERIFY_MOTIVATION_SOURCE';
  if (!deal.contact_route_if_visible) return 'FIND_CONTACT_ROUTE';
  if (deal.comp_status !== 'verified_sold_comps_ready') return 'RUN_COMP_RESEARCH';
  return 'REVIEW_DEAL_PACKET';
}

function whyNotReady(deal) {
  const missing = deal.missing_fields || [];
  if (!missing.length) return '';
  return `Missing ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', more' : ''}.`;
}

function rankDeal(deal) {
  let rank = confidenceScore(deal);
  if (/official|foreclosure|tax|sheriff/i.test(deal.source_family)) rank += 25;
  if (deal.normalized_address) rank += 20;
  if (deal.sale_date_or_event_date || deal.status_evidence_text) rank += 10;
  if (deal.contact_route_if_visible) rank += 8;
  if (deal.auction_url || deal.zillow_url || deal.redfin_url || deal.realtor_url) rank += 5;
  return rank;
}

function dealFromRecord(record, context) {
  const market = context.market;
  const address = addressFromRecord(record);
  const parts = parseAddressParts(address || cleanText(record && (record.raw_address_text || record.address || record.display_address)), market);
  const family = sourceFamily(record);
  const motivation = motivationFromRecord(record);
  const sourceUrl = cleanText(record && (record.source_url || record.url));
  const sourceDocumentUrl = cleanText(record && record.source_document_url);
  const links = propertyLinkSet(record);
  const compState = validateCompRecords(record, parts.normalized_address);
  const deal = {
    deal_id: hashId('fpd', [
      parts.normalized_address,
      sourceUrl,
      sourceDocumentUrl,
      cleanText(record && (record.source_row_reference || record.source_title || record.title))
    ].join('|')),
    headline: cleanText(record && record.headline) || cleanText([parts.normalized_address || 'Public distressed opportunity', motivation.motivation_type].filter(Boolean).join(' - ')),
    normalized_address: parts.normalized_address,
    raw_address_text: parts.raw_address_text,
    city: parts.city,
    county: parts.county,
    state: parts.state,
    zip: parts.zip,
    source_family: family,
    source_name: sourceName(record, family),
    source_url: sourceUrl,
    source_document_url: sourceDocumentUrl,
    zillow_url: links.zillow_url,
    redfin_url: links.redfin_url,
    realtor_url: links.realtor_url,
    auction_url: links.auction_url,
    maps_url: mapsUrl(parts.normalized_address || parts.raw_address_text, market),
    motivation_type: motivation.motivation_type,
    motivation_evidence_text: motivation.motivation_evidence_text,
    status_evidence_text: statusEvidenceFromRecord(record),
    sale_date_or_event_date: eventDateFromRecord(record),
    owner_name_if_visible: cleanText(record && (record.owner_name_if_visible || record.owner_name_candidate || record.owner_name)),
    contact_route_if_visible: cleanText(record && (record.contact_route_if_visible || record.contact_route || record.reply_url || record.phone || record.email)),
    confidence_score: 0,
    missing_fields: [],
    next_best_action: '',
    why_this_might_be_a_deal: cleanText(record && record.why_this_might_be_a_deal) || cleanText([
      motivation.motivation_evidence_text,
      statusEvidenceFromRecord(record),
      eventDateFromRecord(record)
    ].filter(Boolean).join(' | ')),
    why_not_ready: '',
    best_link_to_click_first: '',
    ARV_lock_state: compState.ARV_lock_state,
    comp_status: compState.comp_status,
    verified_sold_comp_count: compState.verified_count,
    verified_sold_comps: compState.verified_sold_comps,
    rejected_comp_candidates: compState.rejected_comp_candidates,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    rejected_property_links: links.rejected_property_links,
    source_url_status: 'not_checked',
    source_document_url_status: 'not_checked',
    link_validation: []
  };
  deal.confidence_score = confidenceScore(deal);
  deal.missing_fields = missingFields(deal);
  deal.next_best_action = nextBestAction(deal);
  deal.why_not_ready = whyNotReady(deal);
  deal.best_link_to_click_first = firstClickLink(deal);
  deal.rank_score = rankDeal(deal);
  return deal;
}

function recordFromCard(card, query) {
  return {
    headline: cleanText(card && (card.source_title || card.title)),
    source_title: cleanText(card && (card.source_title || card.title)),
    source_snippet: cleanText(card && (card.source_snippet || card.snippet)),
    source_url: cleanText(card && (card.source_url || card.url)),
    normalized_address: cleanText(card && (card.address || card.display_address || card.possible_address)),
    motivation_evidence_text: cleanText(card && (card.exact_source_phrase || card.exact_source_phrase_candidate || card.possible_exact_phrase)),
    status_evidence_text: cleanText(card && (card.current_status || card.listing_status || card.status_candidate_text)),
    source_family: cleanText(query && query.provider_family),
    source_name: cleanText(query && query.query_group),
    why_this_might_be_a_deal: cleanText(card && (card.source_snippet || card.snippet))
  };
}

async function collectProviderRecords(input, options, context) {
  if (input.enable_provider_search !== true && options.enable_provider_search !== true) {
    return { records: [], query_groups: [], provider_attempts: [] };
  }
  const queries = buildFreePublicDealBoardQueries(input).slice(0, context.caps.property_link_searches);
  const records = [];
  const providerAttempts = [];
  for (const query of queries) {
    const mockResultsByGroup = options.mock_results_by_query_group || input.mock_results_by_query_group || {};
    const mockResults = Array.isArray(mockResultsByGroup[query.query_group])
      ? mockResultsByGroup[query.query_group]
      : Array.isArray(input.search_mock_results)
        ? input.search_mock_results
        : Array.isArray(options.search_mock_results)
          ? options.search_mock_results
          : undefined;
    const result = await searchProviderWorker.runSearchProvider(Object.assign({}, input, {
      query: query.query,
      purpose: query.purpose,
      query_group: query.query_group,
      provider_family: query.provider_family,
      expected_url_pattern: query.expected_url_pattern,
      mock_results: mockResults
    }), {
      env: options.env || process.env,
      fetchImpl: options.fetch_impl || options.fetchImpl,
      max_results: 10,
      mock_results: mockResults
    });
    providerAttempts.push({
      query_group: query.query_group,
      status: cleanText(result && result.status),
      result_count: Number(result && result.result_count || 0) || 0
    });
    const cards = Array.isArray(result && result.cards) ? result.cards : [];
    records.push(...cards.map((card) => recordFromCard(card, query)));
  }
  return {
    records,
    query_groups: queries.map((query) => query.query_group),
    provider_attempts: providerAttempts
  };
}

function normalizeInputRecords(input, providerRecords) {
  return []
    .concat(Array.isArray(input.source_records) ? input.source_records : [])
    .concat(Array.isArray(input.records) ? input.records : [])
    .concat(Array.isArray(input.deals) ? input.deals : [])
    .concat(providerRecords || []);
}

async function validateDealLinks(deals, options, context) {
  const fetchImpl = options.fetch_impl || options.fetchImpl;
  const diagnostics = {
    source_pages_checked: 0,
    documents_checked: 0,
    property_pages_checked: 0,
    broken_link_count: 0,
    rejected_property_links: []
  };
  if (!fetchImpl) return diagnostics;
  async function check(url, type) {
    if (!isHttpUrl(url)) return { url, type, status: 'missing', http_status: null, broken: false };
    if (type === 'document' && diagnostics.documents_checked >= context.caps.documents) return { url, type, status: 'skipped_cap', http_status: null, broken: false };
    if (type === 'property' && diagnostics.property_pages_checked >= context.caps.property_pages_fetched) return { url, type, status: 'skipped_cap', http_status: null, broken: false };
    if (type === 'source' && diagnostics.source_pages_checked >= context.caps.source_pages) return { url, type, status: 'skipped_cap', http_status: null, broken: false };
    try {
      if (type === 'document') diagnostics.documents_checked += 1;
      else if (type === 'property') diagnostics.property_pages_checked += 1;
      else diagnostics.source_pages_checked += 1;
      const response = await fetchImpl(url, { method: 'GET', timeout_ms: context.caps.timeout_ms });
      const statusCode = Number(response && response.status || 0) || 0;
      const broken = statusCode >= 400 || statusCode === 0;
      if (broken) diagnostics.broken_link_count += 1;
      return { url, type, status: broken ? 'broken' : 'ok', http_status: statusCode || null, broken };
    } catch (error) {
      diagnostics.broken_link_count += 1;
      return { url, type, status: 'fetch_error', http_status: null, broken: true };
    }
  }
  for (const deal of deals) {
    for (const rejected of deal.rejected_property_links || []) diagnostics.rejected_property_links.push(rejected);
    const validations = [];
    if (deal.source_url) validations.push(await check(deal.source_url, 'source'));
    if (deal.source_document_url) validations.push(await check(deal.source_document_url, 'document'));
    for (const url of uniqueText([deal.zillow_url, deal.redfin_url, deal.realtor_url, deal.auction_url])) {
      validations.push(await check(url, 'property'));
    }
    deal.link_validation = validations;
    const sourceStatus = validations.find((item) => item.url === deal.source_url);
    const docStatus = validations.find((item) => item.url === deal.source_document_url);
    if (sourceStatus) deal.source_url_status = sourceStatus.status;
    if (docStatus) deal.source_document_url_status = docStatus.status;
  }
  return diagnostics;
}

function dashboardSummary(deals, linkDiagnostics, context) {
  const sourceCounts = {};
  const motivationCounts = {};
  for (const deal of deals) {
    sourceCounts[deal.source_family || 'unknown'] = (sourceCounts[deal.source_family || 'unknown'] || 0) + 1;
    motivationCounts[deal.motivation_type || 'unknown'] = (motivationCounts[deal.motivation_type || 'unknown'] || 0) + 1;
  }
  const propertySpecificLinkCount = deals.filter((deal) => deal.zillow_url || deal.redfin_url || deal.realtor_url || deal.auction_url).length;
  return {
    top_deals: deals.slice(0, Math.min(10, deals.length)),
    deal_board_count: deals.length,
    source_counts: sourceCounts,
    motivation_counts: motivationCounts,
    broken_link_count: Number(linkDiagnostics.broken_link_count || 0) || 0,
    property_specific_link_count: propertySpecificLinkCount,
    operator_summary: deals.length
      ? `${deals.length} preview-only public deals found for ${context.market.city}. Start with ${deals[0].best_link_to_click_first || 'source proof'}.`
      : `No preview-only public deals found for ${context.market.city}.`,
    recommended_dashboard_section_name: 'Best Public Deals'
  };
}

function catalogSummary(market) {
  return sourceCatalog.buildSourceCatalog(market).map((source) => ({
    source_id: source.source_id,
    source_name: source.source_name,
    source_family: source.source_family,
    readiness: source.readiness,
    preview_only: true
  }));
}

async function runFreePublicDealBoardPreview(input = {}, options = {}) {
  const market = marketFrom(input);
  const caps = capsFrom(input);
  const context = { market, caps };
  const provider = await collectProviderRecords(input, options, context);
  const rawRecords = normalizeInputRecords(input, provider.records).slice(0, caps.output_deals * 4);
  const map = new Map();
  for (const record of rawRecords) {
    const deal = dealFromRecord(record, context);
    const key = cleanText([deal.normalized_address, deal.source_url, deal.source_document_url].filter(Boolean).join('|')).toLowerCase() || deal.deal_id;
    const existing = map.get(key);
    if (!existing || deal.rank_score > existing.rank_score) map.set(key, deal);
  }
  const deals = Array.from(map.values())
    .sort((a, b) => b.rank_score - a.rank_score || b.confidence_score - a.confidence_score || a.headline.localeCompare(b.headline))
    .slice(0, caps.output_deals);
  const linkDiagnostics = await validateDealLinks(deals, options, context);
  const dashboard = dashboardSummary(deals, linkDiagnostics, context);
  return Object.assign({
    ok: true,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    market,
    caps,
    sources_considered: catalogSummary(market),
    query_groups_used: provider.query_groups,
    provider_attempts: provider.provider_attempts,
    free_public_deals: deals
  }, dashboard, {
    diagnostics: {
      link_validation: linkDiagnostics,
      input_record_count: rawRecords.length,
      output_deal_count: deals.length,
      caps,
      legacy_comp_agent_invoked: false,
      legacy_skip_trace_agent_invoked: false,
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    }
  });
}

module.exports = {
  DEFAULT_CAPS,
  buildFreePublicDealBoardQueries,
  runFreePublicDealBoardPreview,
  dealFromRecord,
  propertySpecificUrl,
  validateCompRecords,
  mapsUrl
};
