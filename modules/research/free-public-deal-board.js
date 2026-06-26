'use strict';

const crypto = require('crypto');

const compResearchProvider = require('./comp-research-provider');
const propertyIdentity = require('./property-identity');
const searchProviderWorker = require('./search-provider-worker');
const sourceEvidenceAdapter = require('./source-evidence-adapter');
const sourceAcquisitionOrchestrator = require('./source-acquisition-orchestrator');
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

const QUALITY_BUCKETS = Object.freeze({
  INSPECT_NOW: 'INSPECT_NOW',
  SOURCE_PROOF_ONLY: 'SOURCE_PROOF_ONLY',
  NEEDS_IDENTITY: 'NEEDS_IDENTITY',
  REJECTED_GENERIC: 'REJECTED_GENERIC'
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

const BAD_ADDRESS_PREFIX_RE = /^(?:[$][\d,.kKmM]+\s*)?(?:(?:\d+(?:,\d{3})?|\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft|square\s+feet|sqft|beds?|bedrooms?|baths?|bathrooms?|acres?|acre|lot\s+size)\b[\s,|:/-]*)+/i;

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
  const address = sanitizeAddressCandidate(cleanText(match && match[0])).address;
  return propertyIdentity.isCompleteAddress(address) ? propertyIdentity.canonicalAddress(address) : '';
}

function sanitizeAddressCandidate(value) {
  const original = cleanText(value);
  if (!original) return { address: '', rejected_reason: '' };
  const stripped = cleanText(original.replace(BAD_ADDRESS_PREFIX_RE, ''));
  if (stripped !== original) {
    if (propertyIdentity.isCompleteAddress(stripped)) {
      return { address: propertyIdentity.canonicalAddress(stripped), rejected_reason: '' };
    }
    return { address: '', rejected_reason: 'bad_address_metadata_prefix' };
  }
  if (/^\s*(?:[$]|\d+(?:,\d{3})?\s*(?:sq\.?\s*ft|square\s+feet|sqft|beds?|bedrooms?|baths?|bathrooms?|acres?|acre|lot\s+size)\b)/i.test(original)) {
    return { address: '', rejected_reason: 'bad_address_metadata_prefix' };
  }
  return {
    address: propertyIdentity.isCompleteAddress(original) ? propertyIdentity.canonicalAddress(original) : original,
    rejected_reason: ''
  };
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

function addressResolutionFromRecord(record) {
  const explicit = cleanText(record && (
    record.normalized_address ||
    record.property_address ||
    record.address ||
    record.raw_address_text ||
    record.display_address
  ));
  const sanitizedExplicit = sanitizeAddressCandidate(explicit);
  if (propertyIdentity.isCompleteAddress(sanitizedExplicit.address)) {
    return { address: propertyIdentity.canonicalAddress(sanitizedExplicit.address), bad_address_rejected: false, bad_address_rejected_reason: '' };
  }
  if (sanitizedExplicit.rejected_reason) {
    return { address: '', bad_address_rejected: true, bad_address_rejected_reason: sanitizedExplicit.rejected_reason };
  }

  const sourceUrl = cleanText(record && (record.source_url || record.url || record.zillow_url || record.redfin_url || record.realtor_url || record.auction_url));
  const title = cleanText(record && (record.title || record.source_title || record.headline));
  const fromUrl = propertyIdentity.addressFromPropertyUrl(sourceUrl, title);
  if (fromUrl && fromUrl.complete) return { address: fromUrl.full_address, bad_address_rejected: false, bad_address_rejected_reason: '' };

  const fromAuction = addressFromAuctionUrl(sourceUrl);
  if (fromAuction) return { address: fromAuction, bad_address_rejected: false, bad_address_rejected_reason: '' };

  const text = textBundle(record);
  const fromText = completeAddressFromText(text);
  if (fromText) return { address: fromText, bad_address_rejected: false, bad_address_rejected_reason: '' };
  if (BAD_ADDRESS_PREFIX_RE.test(text)) return { address: '', bad_address_rejected: true, bad_address_rejected_reason: 'bad_address_metadata_prefix' };
  return { address: '', bad_address_rejected: false, bad_address_rejected_reason: '' };
}

function addressFromRecord(record) {
  return addressResolutionFromRecord(record).address;
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
  const query = cleanText(address);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

function sourceUrlType(value) {
  return sourceEvidenceAdapter.classifySourceUrl(value);
}

function isOfficialPublicSourceUrl(value) {
  const url = cleanText(value);
  if (!isHttpUrl(url)) return false;
  const host = hostOf(url);
  return /\.gov$/i.test(host) ||
    /(?:^|\.)dallascounty\.org$/i.test(host) ||
    /(?:^|\.)publicsearch\.us$/i.test(host) ||
    /(?:^|\.)dallascad\.org$/i.test(host);
}

function isSocialOrForumUrl(value) {
  const host = hostOf(value);
  return /(?:^|\.)facebook\.com$/i.test(host) ||
    /(?:^|\.)reddit\.com$/i.test(host) ||
    /(?:^|\.)instagram\.com$/i.test(host) ||
    /(?:^|\.)tiktok\.com$/i.test(host) ||
    /(?:^|\.)youtube\.com$/i.test(host) ||
    /(?:^|\.)x\.com$/i.test(host) ||
    /(?:^|\.)twitter\.com$/i.test(host);
}

function isGenericPropertyPortalUrl(value) {
  const url = cleanText(value);
  if (!isHttpUrl(url)) return false;
  const host = hostOf(url);
  if (!(PROPERTY_HOSTS.zillow.test(host) || PROPERTY_HOSTS.redfin.test(host) || PROPERTY_HOSTS.realtor.test(host) || PROPERTY_HOSTS.auction.test(host) || /(?:^|\.)har\.com$/i.test(host))) {
    return false;
  }
  return !propertySpecificUrl(url);
}

function isHardRejectedPrimarySource(value) {
  const url = cleanText(value);
  if (!isHttpUrl(url)) return false;
  const host = hostOf(url);
  const path = (() => {
    try { return new URL(url).pathname.toLowerCase(); } catch (_) { return ''; }
  })();
  if (isSocialOrForumUrl(url)) return true;
  if (/^(?:har\.com)$/i.test(host) && (path === '/' || path === '')) return true;
  if (PROPERTY_HOSTS.redfin.test(host) && /\/(?:state|city)\/|\/amenity\//i.test(path)) return true;
  if (PROPERTY_HOSTS.zillow.test(host) && !/\/homedetails\//i.test(path)) return true;
  if (PROPERTY_HOSTS.realtor.test(host) && !/\/realestateandhomes-detail\//i.test(path)) return true;
  return false;
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
    deal.auction_url ||
    deal.zillow_url ||
    deal.redfin_url ||
    deal.realtor_url ||
    deal.source_url ||
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

function hasPropertySpecificLink(deal) {
  return !!(deal && (deal.zillow_url || deal.redfin_url || deal.realtor_url || deal.auction_url || propertySpecificUrl(deal.source_url)));
}

function hasOfficialProof(deal) {
  return !!(deal && (
    deal.source_document_url ||
    isOfficialPublicSourceUrl(deal.source_url) ||
    sourceUrlType(deal.source_url) === 'pdf_document'
  ));
}

function isOutOfMarket(deal, market) {
  if (!deal || !deal.normalized_address) return false;
  const targetState = cleanText(market && market.state).toUpperCase();
  const targetCity = cleanText(market && market.city).toLowerCase();
  const state = cleanText(deal.state).toUpperCase();
  const city = cleanText(deal.city).toLowerCase();
  if (targetState && state && state !== targetState) return true;
  return !!(targetCity && city && city !== targetCity);
}

function qualityForDeal(deal) {
  const completeAddress = !!cleanText(deal && deal.normalized_address);
  const propertySpecific = hasPropertySpecificLink(deal);
  const officialProof = hasOfficialProof(deal);
  const sourceType = sourceUrlType(deal && deal.source_url);
  const sourceUrl = cleanText(deal && deal.source_url);
  const socialOrForum = isSocialOrForumUrl(sourceUrl);
  const genericPropertyPortal = isGenericPropertyPortalUrl(sourceUrl);
  const hardRejectedPrimary = isHardRejectedPrimarySource(sourceUrl);

  if (deal && deal.bad_address_rejected) {
    return {
      quality_bucket: QUALITY_BUCKETS.REJECTED_GENERIC,
      usable_for_gabriel: false,
      rejected_reason: deal.bad_address_rejected_reason || 'bad_address_metadata_prefix'
    };
  }
  if (deal && deal.out_of_market === true && !officialProof) {
    return {
      quality_bucket: QUALITY_BUCKETS.REJECTED_GENERIC,
      usable_for_gabriel: false,
      rejected_reason: 'out_of_market_without_source_proof'
    };
  }
  if (hardRejectedPrimary && !propertySpecific && !officialProof && (!completeAddress || !socialOrForum)) {
    return {
      quality_bucket: QUALITY_BUCKETS.REJECTED_GENERIC,
      usable_for_gabriel: false,
      rejected_reason: socialOrForum ? 'social_or_forum_missing_complete_address' : 'generic_property_page_missing_identity'
    };
  }
  if (!completeAddress && socialOrForum) {
    return {
      quality_bucket: QUALITY_BUCKETS.REJECTED_GENERIC,
      usable_for_gabriel: false,
      rejected_reason: 'social_or_forum_missing_complete_address'
    };
  }
  if (!completeAddress && genericPropertyPortal) {
    return {
      quality_bucket: QUALITY_BUCKETS.REJECTED_GENERIC,
      usable_for_gabriel: false,
      rejected_reason: 'generic_property_page_missing_identity'
    };
  }
  if (!completeAddress && !propertySpecific && !officialProof) {
    return {
      quality_bucket: QUALITY_BUCKETS.REJECTED_GENERIC,
      usable_for_gabriel: false,
      rejected_reason: sourceType === 'generic_portal' || sourceType === 'list_page' || sourceType === 'unknown'
        ? 'generic_source_without_property_identity'
        : 'missing_property_identity'
    };
  }
  if (completeAddress && (propertySpecific || officialProof)) {
    return {
      quality_bucket: QUALITY_BUCKETS.INSPECT_NOW,
      usable_for_gabriel: true,
      rejected_reason: ''
    };
  }
  if (officialProof || propertySpecific) {
    return {
      quality_bucket: QUALITY_BUCKETS.SOURCE_PROOF_ONLY,
      usable_for_gabriel: true,
      rejected_reason: ''
    };
  }
  return {
    quality_bucket: QUALITY_BUCKETS.NEEDS_IDENTITY,
    usable_for_gabriel: true,
    rejected_reason: ''
  };
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
  if (deal.quality_bucket === QUALITY_BUCKETS.REJECTED_GENERIC) rank -= 1000;
  if (deal.quality_bucket === QUALITY_BUCKETS.INSPECT_NOW) rank += 50;
  if (deal.quality_bucket === QUALITY_BUCKETS.SOURCE_PROOF_ONLY) rank += 30;
  if (deal.quality_bucket === QUALITY_BUCKETS.NEEDS_IDENTITY) rank += 10;
  if (deal.record_origin === 'source_adapter') rank += 40;
  if (deal.record_origin === 'serper_primary') rank -= 40;
  if (deal.out_of_market === true) rank -= 70;
  if (/official|foreclosure|tax|sheriff/i.test(deal.source_family)) rank += 25;
  if (deal.normalized_address) rank += 20;
  if (deal.sale_date_or_event_date || deal.status_evidence_text) rank += 10;
  if (deal.contact_route_if_visible) rank += 8;
  if (deal.auction_url || deal.zillow_url || deal.redfin_url || deal.realtor_url) rank += 5;
  return rank;
}

function finalizeDeal(deal) {
  const quality = qualityForDeal(deal);
  deal.quality_bucket = quality.quality_bucket;
  deal.usable_for_gabriel = quality.usable_for_gabriel;
  deal.rejected_reason = quality.rejected_reason;
  deal.confidence_score = confidenceScore(deal);
  deal.missing_fields = missingFields(deal);
  deal.next_best_action = nextBestAction(deal);
  deal.why_not_ready = whyNotReady(deal);
  deal.best_link_to_click_first = firstClickLink(deal);
  deal.rank_score = rankDeal(deal);
  return deal;
}

function dealFromRecord(record, context) {
  const market = context.market;
  const addressResolution = addressResolutionFromRecord(record);
  const address = addressResolution.address;
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
    maps_url: mapsUrl(parts.normalized_address || parts.raw_address_text, market) || null,
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
    quality_bucket: '',
    usable_for_gabriel: false,
    rejected_reason: '',
    source_url_status: 'not_checked',
    source_document_url_status: 'not_checked',
    link_validation: []
  };
  deal.record_origin = cleanText(record && record.record_origin);
  deal.bad_address_rejected = addressResolution.bad_address_rejected === true;
  deal.bad_address_rejected_reason = cleanText(addressResolution.bad_address_rejected_reason);
  deal.out_of_market = isOutOfMarket(deal, market);
  return finalizeDeal(deal);
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
    record_origin: 'serper_primary',
    why_this_might_be_a_deal: cleanText(card && (card.source_snippet || card.snippet))
  };
}

function hasExplicitInputRecords(input = {}) {
  return Array.isArray(input.source_records) && input.source_records.length > 0 ||
    Array.isArray(input.records) && input.records.length > 0 ||
    Array.isArray(input.deals) && input.deals.length > 0;
}

function candidateRecord(candidate, source) {
  candidate = candidate || {};
  source = source || {};
  return {
    headline: cleanText(candidate.normalized_address || candidate.property_address || candidate.source_row_reference || source.source_name || 'Source adapter candidate'),
    normalized_address: cleanText(candidate.normalized_address || candidate.property_address),
    raw_address_text: cleanText(candidate.raw_address_text || candidate.property_address || candidate.normalized_address),
    source_family: cleanText(candidate.source_family || source.source_family),
    source_name: cleanText(candidate.source_name || source.source_name),
    source_url: cleanText(candidate.source_url || source.source_url),
    source_document_url: cleanText(candidate.source_document_url),
    motivation_type: cleanText(candidate.motivation_type || candidate.source_family || source.source_family),
    motivation_evidence_text: cleanText(candidate.motivation_evidence_text || candidate.source_proof_text || candidate.source_excerpt || candidate.motivation_phrase),
    status_evidence_text: cleanText(candidate.status_evidence_text || candidate.current_status),
    sale_date_or_event_date: cleanText(candidate.event_date || candidate.sale_date || candidate.auction_date),
    owner_name_if_visible: cleanText(candidate.owner_name_candidate || candidate.owner_name),
    contact_route_if_visible: cleanText(candidate.contact_route || candidate.public_contact_route || candidate.contact_phone || candidate.contact_email),
    source_row_reference: cleanText(candidate.source_row_reference || candidate.parcel_or_account),
    record_origin: 'source_adapter'
  };
}

function cardRecord(card, source) {
  const record = recordFromCard(card, {
    provider_family: cleanText(card && (card.source_family || card.lead_source_type)) || cleanText(source && source.source_family),
    query_group: cleanText(card && card.source_name) || cleanText(source && source.source_name)
  });
  record.normalized_address = cleanText(card && (card.display_address || card.address_or_source_text));
  record.contact_route_if_visible = cleanText(card && (card.public_contact_route || card.contact_phone || card.contact_email));
  record.record_origin = 'source_adapter';
  return record;
}

function sourceProofRecordsFromAdapterResult(result) {
  result = result || {};
  const summary = result.document_hunter_summary ||
    result.source_preview ||
    result.diagnostics && (result.diagnostics.document_hunter_summary || result.diagnostics.live_source_preview) ||
    {};
  const sourceNameText = cleanText(result.source_name || summary.source_name || 'Official public source');
  const sourceFamilyText = cleanText(result.source_family || summary.source_family || 'official_public_source');
  const sourceUrl = cleanText(summary.source_url_checked || result.source_url || summary.source_url || '');
  const rawUrls = []
    .concat(Array.isArray(summary.document_urls_parsed) ? summary.document_urls_parsed : [])
    .concat(Array.isArray(summary.document_urls_found) ? summary.document_urls_found : [])
    .concat(Array.isArray(result.document_urls_parsed) ? result.document_urls_parsed : [])
    .concat(Array.isArray(result.document_urls_found) ? result.document_urls_found : []);
  if (!rawUrls.length && isOfficialPublicSourceUrl(sourceUrl)) rawUrls.push(sourceUrl);

  return uniqueText(rawUrls.map((item) => cleanText(item && item.url ? item.url : item)))
    .filter((url) => isHttpUrl(url) && isOfficialPublicSourceUrl(url))
    .slice(0, 5)
    .map((url, index) => {
      const classification = sourceUrlType(url);
      const documentUrl = classification === 'pdf_document' || classification === 'exact_property_record' ? url : '';
      return {
        headline: `${sourceNameText} source proof ${index + 1}`,
        source_family: sourceFamilyText,
        source_name: sourceNameText,
        source_url: documentUrl ? sourceUrl : url,
        source_document_url: documentUrl,
        motivation_type: sourceFamilyText,
        motivation_evidence_text: `${sourceNameText} official source proof discovered.`,
        status_evidence_text: '',
        why_this_might_be_a_deal: 'Official source evidence is available, but property identity still needs extraction.',
        source_row_reference: url,
        record_origin: 'source_adapter'
      };
    });
}

async function collectSourceAdapterRecords(input, options, context) {
  if (input.enable_source_adapters === false || options.enable_source_adapters === false || hasExplicitInputRecords(input)) {
    return { records: [], diagnostics: { source_adapter_records_count: 0, source_adapter_candidate_count: 0, source_adapter_card_count: 0, source_adapter_results: [] } };
  }
  const mockedResults = Array.isArray(input.mock_source_adapter_results)
    ? input.mock_source_adapter_results
    : Array.isArray(options.mock_source_adapter_results)
      ? options.mock_source_adapter_results
      : null;
  if (mockedResults) {
    const proofRecords = mockedResults.flatMap(sourceProofRecordsFromAdapterResult);
    return {
      records: proofRecords,
      diagnostics: {
        source_adapter_records_count: proofRecords.length,
        source_adapter_candidate_count: 0,
        source_adapter_card_count: 0,
        source_adapter_proof_record_count: proofRecords.length,
        source_adapter_results: mockedResults
      }
    };
  }
  const mocked = Array.isArray(input.mock_source_adapter_records)
    ? input.mock_source_adapter_records
    : Array.isArray(options.mock_source_adapter_records)
      ? options.mock_source_adapter_records
      : null;
  if (mocked) {
    return {
      records: mocked.map((record) => Object.assign({ record_origin: 'source_adapter' }, record)),
      diagnostics: {
        source_adapter_records_count: mocked.length,
        source_adapter_candidate_count: mocked.length,
        source_adapter_card_count: 0,
        source_adapter_results: [{ source_id: 'mock_source_adapter_records', status: 'available', candidate_count: mocked.length }]
      }
    };
  }
  try {
    const acquisition = await sourceAcquisitionOrchestrator.runAcquisitionCore({
      market: context.market,
      city: context.market.city,
      county: context.market.county,
      state: context.market.state,
      source_ids: input.source_ids || input.sourceIds,
      source_families: input.source_families || input.sourceFamilies,
      discovery_batch_id: input.discovery_batch_id || 'free_public_deal_board_preview'
    }, {
      env: options.env || process.env,
      fetch_impl: options.fetch_impl || options.fetchImpl,
      fetchImpl: options.fetchImpl || options.fetch_impl,
      max_rows: context.caps.output_deals,
      max_candidates: context.caps.output_deals
    });
    const candidateRecords = (Array.isArray(acquisition.candidates) ? acquisition.candidates : []).map((candidate) => candidateRecord(candidate, {}));
    const cardRecords = (Array.isArray(acquisition.cards) ? acquisition.cards : []).map((card) => cardRecord(card, {}));
    const proofRecords = (Array.isArray(acquisition.adapter_results) ? acquisition.adapter_results : []).flatMap(sourceProofRecordsFromAdapterResult);
    const records = candidateRecords.concat(cardRecords, proofRecords);
    return {
      records,
      diagnostics: {
        source_adapter_records_count: records.length,
        source_adapter_candidate_count: candidateRecords.length,
        source_adapter_card_count: cardRecords.length,
        source_adapter_proof_record_count: proofRecords.length,
        source_adapter_results: Array.isArray(acquisition.adapter_results) ? acquisition.adapter_results : [],
        source_ids_attempted: Array.isArray(acquisition.source_ids_attempted) ? acquisition.source_ids_attempted : [],
        source_families_attempted: Array.isArray(acquisition.source_families_attempted) ? acquisition.source_families_attempted : []
      }
    };
  } catch (error) {
    return {
      records: [],
      diagnostics: {
        source_adapter_records_count: 0,
        source_adapter_candidate_count: 0,
        source_adapter_card_count: 0,
        source_adapter_results: [],
        source_adapter_error: cleanText(error && error.message)
      }
    };
  }
}

async function collectProviderRecords(input, options, context) {
  if (input.enable_provider_primary_rows !== true && options.enable_provider_primary_rows !== true) {
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
    provider_attempts: providerAttempts,
    query_count: queries.length
  };
}

function buildPropertyLinkRepairQueries(deal) {
  const address = cleanText(deal && deal.normalized_address);
  if (!address) return [];
  return [
    {
      query_group: 'repair_zillow_property_link',
      provider_family: 'zillow',
      expected_url_pattern: 'zillow.com/homedetails property page',
      query: `"${address}" Zillow homedetails`
    },
    {
      query_group: 'repair_redfin_property_link',
      provider_family: 'redfin',
      expected_url_pattern: 'redfin.com/.../home/<id> property page',
      query: `"${address}" Redfin home`
    },
    {
      query_group: 'repair_realtor_property_link',
      provider_family: 'realtor',
      expected_url_pattern: 'realtor.com/realestateandhomes-detail property page',
      query: `"${address}" Realtor realestateandhomes-detail`
    },
    {
      query_group: 'repair_auction_property_link',
      provider_family: 'auction',
      expected_url_pattern: 'auction.com/details property page',
      query: `"${address}" Auction.com details`
    }
  ];
}

function mergePropertyLinks(deal, record) {
  const repairedAddress = addressFromRecord(record || {});
  if (deal.normalized_address && repairedAddress && cleanText(repairedAddress).toLowerCase() !== cleanText(deal.normalized_address).toLowerCase()) {
    deal.rejected_property_links = (Array.isArray(deal.rejected_property_links) ? deal.rejected_property_links : []).concat([{
      url: cleanText(record && record.source_url),
      reason: 'property_link_address_mismatch'
    }]);
    return 0;
  }
  const links = propertyLinkSet(record || {});
  let repaired = 0;
  for (const key of ['zillow_url', 'redfin_url', 'realtor_url', 'auction_url']) {
    if (!deal[key] && links[key]) {
      deal[key] = links[key];
      repaired += 1;
    }
  }
  const rejected = []
    .concat(Array.isArray(deal.rejected_property_links) ? deal.rejected_property_links : [])
    .concat(Array.isArray(links.rejected_property_links) ? links.rejected_property_links : []);
  const seen = new Set();
  deal.rejected_property_links = rejected.filter((item) => {
    const key = `${cleanText(item && item.url)}|${cleanText(item && item.reason)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return repaired;
}

async function repairPropertyLinksForDeals(deals, input, options, context, usedProviderQueries) {
  const enabled = input.enable_provider_search === true || options.enable_provider_search === true;
  const diagnostics = {
    identity_repair_attempted_count: 0,
    property_link_repair_success_count: 0,
    property_link_repair_attempts: []
  };
  if (!enabled) return diagnostics;
  let remaining = Math.max(0, context.caps.property_link_searches - (Number(usedProviderQueries || 0) || 0));
  if (!remaining) return diagnostics;
  for (const deal of deals) {
    if (remaining <= 0) break;
    if (!deal || !deal.normalized_address || hasPropertySpecificLink(deal)) continue;
    const queries = buildPropertyLinkRepairQueries(deal);
    for (const query of queries) {
      if (remaining <= 0 || hasPropertySpecificLink(deal)) break;
      remaining -= 1;
      diagnostics.identity_repair_attempted_count += 1;
      const mockResultsByGroup = options.mock_repair_results_by_query_group || input.mock_repair_results_by_query_group || {};
      const mockResults = Array.isArray(mockResultsByGroup[query.query_group])
        ? mockResultsByGroup[query.query_group]
        : undefined;
      const result = await searchProviderWorker.runSearchProvider(Object.assign({}, input, {
        query: query.query,
        purpose: 'free_public_deal_board_property_link_repair',
        query_group: query.query_group,
        provider_family: query.provider_family,
        expected_url_pattern: query.expected_url_pattern,
        mock_results: mockResults
      }), {
        env: options.env || process.env,
        fetchImpl: options.fetch_impl || options.fetchImpl,
        max_results: 3,
        mock_results: mockResults,
        query: query.query,
        query_group: query.query_group,
        provider_family: query.provider_family,
        expected_url_pattern: query.expected_url_pattern,
        purpose: 'free_public_deal_board_property_link_repair'
      });
      let repaired = 0;
      const cards = Array.isArray(result && result.cards) ? result.cards : [];
      for (const card of cards) {
        repaired += mergePropertyLinks(deal, {
          source_url: cleanText(card && (card.source_url || card.url)),
          title: cleanText(card && (card.source_title || card.title)),
          source_title: cleanText(card && (card.source_title || card.title))
        });
        if (hasPropertySpecificLink(deal)) break;
      }
      if (repaired) diagnostics.property_link_repair_success_count += 1;
      diagnostics.property_link_repair_attempts.push({
        deal_id: deal.deal_id,
        query_group: query.query_group,
        status: cleanText(result && result.status),
        result_count: Number(result && result.result_count || 0) || 0,
        repaired: repaired > 0
      });
      finalizeDeal(deal);
    }
  }
  return diagnostics;
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

function qualityDiagnostics(allDeals, usableDeals) {
  const rejected = allDeals.filter((deal) => deal.quality_bucket === QUALITY_BUCKETS.REJECTED_GENERIC);
  return {
    total_rows_found: allDeals.length,
    usable_deal_count: usableDeals.length,
    rejected_generic_count: rejected.length,
    inspect_now_count: usableDeals.filter((deal) => deal.quality_bucket === QUALITY_BUCKETS.INSPECT_NOW).length,
    source_proof_only_count: usableDeals.filter((deal) => deal.quality_bucket === QUALITY_BUCKETS.SOURCE_PROOF_ONLY).length,
    needs_identity_count: usableDeals.filter((deal) => deal.quality_bucket === QUALITY_BUCKETS.NEEDS_IDENTITY).length,
    bad_address_rejected_count: allDeals.filter((deal) => deal.bad_address_rejected === true || deal.rejected_reason === 'bad_address_metadata_prefix').length,
    out_of_market_count: allDeals.filter((deal) => deal.out_of_market === true).length,
    official_source_rows_count: usableDeals.filter((deal) => hasOfficialProof(deal) || /official|foreclosure|tax|sheriff/i.test(deal.source_family)).length,
    serper_primary_rows_count: allDeals.filter((deal) => deal.record_origin === 'serper_primary' && deal.usable_for_gabriel === true).length,
    rows_without_maps_due_to_missing_address: allDeals.filter((deal) => !deal.normalized_address && !deal.maps_url).length,
    rejected_generic_samples: rejected.slice(0, 10).map((deal) => ({
      headline: deal.headline,
      source_url: deal.source_url,
      rejected_reason: deal.rejected_reason
    }))
  };
}

function dashboardSummary(deals, linkDiagnostics, context, quality) {
  const sourceCounts = {};
  const motivationCounts = {};
  for (const deal of deals) {
    sourceCounts[deal.source_family || 'unknown'] = (sourceCounts[deal.source_family || 'unknown'] || 0) + 1;
    motivationCounts[deal.motivation_type || 'unknown'] = (motivationCounts[deal.motivation_type || 'unknown'] || 0) + 1;
  }
  const propertySpecificLinkCount = deals.filter((deal) => deal.zillow_url || deal.redfin_url || deal.realtor_url || deal.auction_url).length;
  return {
    top_deals: deals.filter((deal) => deal.usable_for_gabriel === true && deal.quality_bucket !== QUALITY_BUCKETS.REJECTED_GENERIC).slice(0, Math.min(10, deals.length)),
    deal_board_count: deals.length,
    source_counts: sourceCounts,
    motivation_counts: motivationCounts,
    broken_link_count: Number(linkDiagnostics.broken_link_count || 0) || 0,
    property_specific_link_count: propertySpecificLinkCount,
    rejected_generic_count: Number(quality && quality.rejected_generic_count || 0) || 0,
    usable_deal_count: Number(quality && quality.usable_deal_count || 0) || 0,
    inspect_now_count: Number(quality && quality.inspect_now_count || 0) || 0,
    source_proof_only_count: Number(quality && quality.source_proof_only_count || 0) || 0,
    needs_identity_count: Number(quality && quality.needs_identity_count || 0) || 0,
    bad_address_rejected_count: Number(quality && quality.bad_address_rejected_count || 0) || 0,
    out_of_market_count: Number(quality && quality.out_of_market_count || 0) || 0,
    official_source_rows_count: Number(quality && quality.official_source_rows_count || 0) || 0,
    serper_primary_rows_count: Number(quality && quality.serper_primary_rows_count || 0) || 0,
    operator_summary: deals.length
      ? `${deals.length} usable preview-only public deals found for ${context.market.city}; ${Number(quality && quality.rejected_generic_count || 0) || 0} generic rows rejected. Start with ${deals[0].best_link_to_click_first || 'source proof'}.`
      : `No usable preview-only public deals found for ${context.market.city}; ${Number(quality && quality.rejected_generic_count || 0) || 0} generic rows rejected.`,
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
  const sourceAdapter = await collectSourceAdapterRecords(input, options, context);
  const provider = await collectProviderRecords(input, options, context);
  const rawRecords = normalizeInputRecords(input, sourceAdapter.records.concat(provider.records)).slice(0, caps.output_deals * 4);
  const map = new Map();
  for (const record of rawRecords) {
    const deal = dealFromRecord(record, context);
    const key = cleanText([deal.normalized_address, deal.source_url, deal.source_document_url].filter(Boolean).join('|')).toLowerCase() || deal.deal_id;
    const existing = map.get(key);
    if (!existing || deal.rank_score > existing.rank_score) map.set(key, deal);
  }
  const candidates = Array.from(map.values());
  const repairDiagnostics = await repairPropertyLinksForDeals(candidates, input, options, context, provider.query_count);
  const allDeals = candidates
    .map(finalizeDeal)
    .sort((a, b) => b.rank_score - a.rank_score || b.confidence_score - a.confidence_score || a.headline.localeCompare(b.headline));
  const deals = allDeals
    .filter((deal) => deal.usable_for_gabriel === true && deal.quality_bucket !== QUALITY_BUCKETS.REJECTED_GENERIC)
    .slice(0, caps.output_deals);
  const linkDiagnostics = await validateDealLinks(deals, options, context);
  const quality = qualityDiagnostics(allDeals, deals);
  const dashboard = dashboardSummary(deals, linkDiagnostics, context, quality);
  const boardBlockerSummary = deals.length
    ? ''
    : cleanText([
      quality.rejected_generic_count ? `${quality.rejected_generic_count} generic rows rejected` : '',
      quality.bad_address_rejected_count ? `${quality.bad_address_rejected_count} bad addresses rejected` : '',
      quality.out_of_market_count ? `${quality.out_of_market_count} out-of-market rows blocked` : '',
      sourceAdapter.diagnostics.source_adapter_records_count ? '' : 'no source adapter records'
    ].filter(Boolean).join('; '));
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
    free_public_deals: deals,
    source_adapter_records_count: sourceAdapter.diagnostics.source_adapter_records_count,
    serper_enrichment_attempts: repairDiagnostics.identity_repair_attempted_count,
    property_link_repair_success_count: repairDiagnostics.property_link_repair_success_count,
    bad_address_rejected_count: quality.bad_address_rejected_count,
    out_of_market_count: quality.out_of_market_count,
    official_source_rows_count: quality.official_source_rows_count,
    board_blocker_summary: boardBlockerSummary
  }, dashboard, {
    diagnostics: {
      link_validation: linkDiagnostics,
      input_record_count: rawRecords.length,
      output_deal_count: deals.length,
      quality,
      identity_repair: repairDiagnostics,
      rejected_generic_count: quality.rejected_generic_count,
      usable_deal_count: quality.usable_deal_count,
      inspect_now_count: quality.inspect_now_count,
      source_proof_only_count: quality.source_proof_only_count,
      needs_identity_count: quality.needs_identity_count,
      source_adapter_records_count: sourceAdapter.diagnostics.source_adapter_records_count,
      serper_primary_rows_count: quality.serper_primary_rows_count,
      serper_enrichment_attempts: repairDiagnostics.identity_repair_attempted_count,
      identity_repair_attempted_count: repairDiagnostics.identity_repair_attempted_count,
      property_link_repair_success_count: repairDiagnostics.property_link_repair_success_count,
      bad_address_rejected_count: quality.bad_address_rejected_count,
      out_of_market_count: quality.out_of_market_count,
      official_source_rows_count: quality.official_source_rows_count,
      rows_without_maps_due_to_missing_address: quality.rows_without_maps_due_to_missing_address,
      source_adapter: sourceAdapter.diagnostics,
      board_blocker_summary: boardBlockerSummary,
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
