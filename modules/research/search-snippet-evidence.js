'use strict';

const crypto = require('crypto');

const geminiProvider = require('./gemini-scout-discovery-provider');
const leadEvidence = require('./lead-evidence');
const propertyIdentity = require('./property-identity');

const WHOLESALE_PHRASE_RE = leadEvidence.WHOLESALE_PHRASE_RE;
const CURRENT_RE = /\b(active|for sale|house for sale|home for sale|homes for sale|listed|available|back on (?:the )?market|relisted|price (?:reduced|cut|drop|reduction)|new listing|pending|contingent)\b/i;
const CLOSED_RE = /\b(sold|closed|off[- ]?market|auction ended|sale completed)\b/i;
const LISTING_CONTEXT_RE = /\b(listing|listed|property|home|house|for sale|redfin|realtor|zillow|har)\b/i;

function cleanText(value) {
  return leadEvidence.cleanText(value);
}

function isHttpUrl(value) {
  return leadEvidence.isHttpUrl(value);
}

function sourceDomain(value) {
  return leadEvidence.sourceDomain(value);
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16)}`;
}

function phraseFromVisibleText(title, snippet) {
  const fields = [
    { type: 'search_title', text: cleanText(title) },
    { type: 'search_snippet', text: cleanText(snippet) }
  ];
  for (const field of fields) {
    const match = field.text.match(WHOLESALE_PHRASE_RE);
    if (match) {
      const sentence = field.text.match(new RegExp(`[^.!?]*\\b${match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^.!?]*[.!?]?`, 'i'));
      return {
        exact_source_phrase: cleanText(sentence ? sentence[0] : match[0]),
        exact_source_phrase_source_type: field.type,
        exact_source_phrase_verbatim: true
      };
    }
  }
  return {
    exact_source_phrase: '',
    exact_source_phrase_source_type: '',
    exact_source_phrase_verbatim: false
  };
}

function listingStatusFromSnippet(title, snippet, options) {
  options = options || {};
  const text = `${cleanText(title)} ${cleanText(snippet)}`;
  if (CLOSED_RE.test(text) && !CURRENT_RE.test(text)) return 'Sold/closed or historical';
  if (CURRENT_RE.test(text)) return 'plausibly_current_from_search_snippet';
  if (options.propertySpecific === true && LISTING_CONTEXT_RE.test(text) && /\b(cash only|investor special)\b/i.test(text)) {
    return 'plausibly_current_from_search_snippet';
  }
  return 'Manual Verification Needed';
}

function resultAddressInfo(result, context, sourceUrl, title, snippet) {
  const direct = cleanText(result && (result.possible_address || result.address || result.property_address));
  const displayed = cleanText(result && result.displayed_url);
  const directCanonical = direct ? propertyIdentity.canonicalAddress(Object.assign({}, result || {}, {
    address_or_source_text: direct,
    source_url: sourceUrl,
    source_title: title,
    source_snippet: snippet
  }, context || {})) : '';
  if (directCanonical) {
    return {
      address: directCanonical,
      full: propertyIdentity.isCompleteAddress(directCanonical),
      basis: 'search_result_address'
    };
  }
  const urlCanonical = propertyIdentity.canonicalAddress(Object.assign({}, result || {}, context || {}, {
    source_url: sourceUrl,
    canonical_source_url: sourceUrl,
    source_title: title
  }));
  if (urlCanonical && propertyIdentity.isCompleteAddress(urlCanonical)) {
    return {
      address: urlCanonical,
      full: true,
      basis: 'property_url'
    };
  }
  const identity = geminiProvider.extractAddressFromSourceText(
    title,
    snippet,
    displayed,
    sourceUrl,
    context && context.city,
    context && context.state
  );
  const textAddress = cleanText(identity && identity.normalized_address);
  if (textAddress) {
    const canonical = propertyIdentity.canonicalAddress(Object.assign({}, result || {}, context || {}, {
      address_or_source_text: textAddress,
      source_url: sourceUrl,
      source_title: title
    }));
    return {
      address: canonical || textAddress,
      full: propertyIdentity.isCompleteAddress(canonical || textAddress),
      basis: 'visible_text'
    };
  }
  return {
    address: '',
    full: false,
    basis: ''
  };
}

function isPropertySpecificSearchUrl(sourceUrl, title, snippet) {
  if (!isHttpUrl(sourceUrl)) return false;
  const classification = geminiProvider.classifySourceUrl(sourceUrl, title, snippet);
  if (geminiProvider.sourceClassificationIsGeneric && geminiProvider.sourceClassificationIsGeneric(classification)) return false;
  if (geminiProvider.isPropertySpecificSourceUrl(sourceUrl)) return true;
  try {
    const parsed = new URL(cleanText(sourceUrl));
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const pathText = decodeURIComponent(parsed.pathname || '');
    if (/\b\d{2,7}\b/.test(pathText) &&
        /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b/i.test(pathText) &&
        /\b(listing|details?|property|homes?|house|real-estate|realestate)\b/i.test(pathText) &&
        !/\b(search|query|results|lookup|find|city|county|category|blog|article|archive)\b/i.test(pathText) &&
        !/google\./i.test(host)) {
      return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

function isBroadSourceResult(result) {
  const sourceUrl = cleanText(result && (result.url || result.link || result.source_url));
  const title = cleanText(result && result.title);
  const snippet = cleanText(result && (result.snippet || result.description));
  const displayedUrl = cleanText(result && (result.displayed_url || result.displayedLink));
  const text = `${title} ${snippet} ${displayedUrl} ${sourceUrl}`.toLowerCase();
  const classification = cleanText(result && result.source_classification) || geminiProvider.classifySourceUrl(sourceUrl, title, snippet);
  if (geminiProvider.sourceClassificationIsGeneric && geminiProvider.sourceClassificationIsGeneric(classification)) return true;
  if (/(facebook|instagram|tiktok|youtube|linkedin|pinterest|x\.com|twitter|reddit)\./i.test(sourceUrl)) return true;
  if (/\b(blog|article|news|learn|resource|guides?)\b/i.test(text)) return true;
  if (/\b(search|results|search-results|realestateandhomes-search|homes-for-sale|city|county|category)\b/i.test(text)) return true;
  if (/\b(cash[- ]?buyer|cashbuyer|we buy houses|we buy cash|buy houses|buying houses|investor network|wholesale)\b/i.test(text)) return true;
  return false;
}

function resultRankScore(result) {
  const sourceUrl = cleanText(result && (result.url || result.link || result.source_url));
  const title = cleanText(result && result.title);
  const snippet = cleanText(result && (result.snippet || result.description));
  const classification = cleanText(result && result.source_classification) || geminiProvider.classifySourceUrl(sourceUrl, title, snippet);
  const propertySpecific = isPropertySpecificSearchUrl(sourceUrl, title, snippet);
  const broad = isBroadSourceResult(result);
  const addressMatch = !!cleanText(result && (result.address || result.possible_address || result.property_address || result.display_address));
  let score = 120;
  if (propertySpecific && /listing_property_page|exact_property_page|auction_property_page|official_property_notice/i.test(classification)) score = 0;
  else if (propertySpecific) score = 10;
  else if (addressMatch) score = 30;
  else if (broad) score = 1000;
  return {
    score,
    classification,
    propertySpecific,
    broad,
    quality_bucket: score <= 10 ? 'property_detail_url' : score <= 30 ? 'address_like_text' : 'broad_source',
    demotion_reason: score <= 10 ? '' : broad ? 'generic_source' : 'broad_source'
  };
}

function rankSearchProviderResults(results) {
  return (Array.isArray(results) ? results : [])
    .map((result, index) => {
      const rankInfo = resultRankScore(result);
      return Object.assign({}, result, {
        original_rank: Number(result && (result.rank || result.position)) || index + 1,
        result_rank_score: rankInfo.score,
        search_result_quality_bucket: rankInfo.quality_bucket,
        search_result_demotion_reason: rankInfo.demotion_reason,
        search_result_classification: rankInfo.classification,
        search_result_property_specific: rankInfo.propertySpecific === true,
        search_result_broad: rankInfo.broad === true
      });
    })
    .sort((a, b) => {
      const scoreDiff = Number(a.result_rank_score || 0) - Number(b.result_rank_score || 0);
      if (scoreDiff) return scoreDiff;
      const rankDiff = Number(a.original_rank || 0) - Number(b.original_rank || 0);
      if (rankDiff) return rankDiff;
      return cleanText(a.title).localeCompare(cleanText(b.title));
    })
    .map((result, index) => Object.assign({}, result, { result_rank: index + 1 }));
}

function summarizeSearchResultDemotions(cards) {
  const out = {
    property_detail_url: 0,
    address_like_text: 0,
    broad_source: 0,
    generic_source: 0
  };
  for (const card of Array.isArray(cards) ? cards : []) {
    const bucket = cleanText(card && card.search_result_quality_bucket) || 'broad_source';
    if (Object.prototype.hasOwnProperty.call(out, bucket)) out[bucket] += 1;
    else out.broad_source += 1;
    if (cleanText(card && card.search_result_demotion_reason) === 'generic_source') out.generic_source += 1;
  }
  return out;
}

function summarizeRejectedUrlClasses(cards) {
  const out = {};
  for (const card of Array.isArray(cards) ? cards : []) {
    if (card && card.search_result_property_specific === true) continue;
    const classification = cleanText(card && card.search_result_classification) || 'unknown_source';
    out[classification] = (out[classification] || 0) + 1;
  }
  return out;
}

function isCurrentStatus(status) {
  const text = cleanText(status);
  return !!text && !/^Manual Verification Needed$/i.test(text) && !CLOSED_RE.test(text);
}

function conversionTrace(input) {
  const phraseFound = !!cleanText(input.possiblePhrase);
  const propertySpecific = input.propertySpecific === true;
  const fullAddress = input.fullAddress === true;
  const currentStatus = input.currentStatus === true;
  const promoted = input.promoted === true;
  const reasons = [];
  if (phraseFound && !promoted) reasons.push('phrase_extracted_but_not_verified');
  if (phraseFound && propertySpecific && !fullAddress) reasons.push('phrase_verified_but_missing_address');
  if (phraseFound && propertySpecific && fullAddress && !currentStatus) reasons.push('phrase_verified_but_missing_status');
  if (propertySpecific && !currentStatus) reasons.push('property_url_but_missing_status');
  if (!propertySpecific) reasons.push('missing_property_url');
  if (!propertySpecific && input.hasUrl) reasons.push('generic_url_rejected');
  if (!fullAddress) reasons.push('missing_address');
  if (!currentStatus) reasons.push('missing_status');
  if (phraseFound && !promoted) reasons.push('source_phrase_dropped');
  return {
    candidate_url: cleanText(input.sourceUrl),
    source_domain: sourceDomain(input.sourceUrl),
    title_present: !!cleanText(input.title),
    snippet_present: !!cleanText(input.snippet),
    possible_phrase_extracted: phraseFound,
    possible_phrase_text: cleanText(input.possiblePhrase),
    phrase_provenance: cleanText(input.phraseProvenance),
    exact_source_phrase_assigned: promoted,
    exact_source_phrase_verbatim: promoted,
    full_address_found: fullAddress,
    property_specific_url: propertySpecific,
    current_status_found: currentStatus,
    contact_route_found: !!cleanText(input.publicContactRoute),
    final_bucket: promoted && fullAddress && propertySpecific && currentStatus ? 'Valid Leads - Needs Comps' : 'Research / Reference',
    rejection_reason: reasons.join(', '),
    reason_codes: Array.from(new Set(reasons))
  };
}

function emptyEvidenceConversionDiagnostics() {
  return {
    phrase_extracted_but_not_verified: 0,
    phrase_verified_but_missing_address: 0,
    phrase_verified_but_missing_status: 0,
    property_url_but_missing_status: 0,
    generic_url_rejected: 0,
    missing_address: 0,
    missing_status: 0,
    missing_property_url: 0,
    source_phrase_dropped: 0,
    snippet_phrases_found: 0,
    exact_phrases_promoted: 0
  };
}

function summarizeEvidenceConversion(cards) {
  const out = emptyEvidenceConversionDiagnostics();
  for (const card of Array.isArray(cards) ? cards : []) {
    const trace = card && card.evidence_conversion_trace || {};
    if (trace.possible_phrase_extracted) out.snippet_phrases_found += 1;
    if (trace.exact_source_phrase_assigned) out.exact_phrases_promoted += 1;
    for (const reason of Array.isArray(trace.reason_codes) ? trace.reason_codes : []) {
      if (Object.prototype.hasOwnProperty.call(out, reason)) out[reason] += 1;
    }
  }
  return out;
}

function withoutUnpromotedPhraseFallback(card) {
  if (!card || card.suppress_exact_phrase_fallback !== true) return card;
  return Object.assign({}, card, {
    exact_source_phrase: '',
    matched_source_phrase: '',
    source_excerpt: '',
    description_excerpt: '',
    source_snippet: '',
    search_result_snippet: '',
    evidence_snippet: ''
  });
}

function normalizeSearchResult(result, context) {
  result = result || {};
  context = context || {};
  const retrievedAt = cleanText(result.retrieved_at) || new Date().toISOString();
  const urlInfo = geminiProvider.canonicalizeSourceUrl(result.url || result.link || result.source_url);
  const sourceUrl = cleanText(urlInfo.canonical_url || result.url || result.link || result.source_url);
  const title = cleanText(result.title);
  const snippet = cleanText(result.snippet || result.description);
  const domain = cleanText(result.source_domain || result.displayed_url && sourceDomain(result.displayed_url) || sourceDomain(sourceUrl));
  const sourceClassification = geminiProvider.classifySourceUrl(sourceUrl, title, snippet);
  const propertySpecific = isPropertySpecificSearchUrl(sourceUrl, title, snippet);
  const phrase = phraseFromVisibleText(title, snippet);
  const addressInfo = resultAddressInfo(result, context, sourceUrl, title, snippet);
  const address = cleanText(addressInfo.address);
  const fullAddress = addressInfo.full === true;
  const status = cleanText(result.listing_status) || listingStatusFromSnippet(title, snippet, { propertySpecific });
  const currentStatus = isCurrentStatus(status);
  const promotedPhrase = phrase.exact_source_phrase && propertySpecific && fullAddress && currentStatus ? phrase.exact_source_phrase : '';
  const trace = conversionTrace({
    sourceUrl,
    title,
    snippet,
    possiblePhrase: phrase.exact_source_phrase,
    phraseProvenance: phrase.exact_source_phrase_source_type,
    promoted: !!promotedPhrase,
    propertySpecific,
    fullAddress,
    currentStatus,
    hasUrl: !!sourceUrl,
    publicContactRoute: result.public_contact_route
  });
  const missing = []
    .concat(Array.isArray(result.missing_evidence) ? result.missing_evidence : [])
    .concat(!propertySpecific ? ['property-specific source URL'] : [])
    .concat(!fullAddress ? ['complete canonical address'] : [])
    .concat(!promotedPhrase ? ['exact source-backed wholesale phrase'] : [])
    .concat(!currentStatus ? ['current listing status'] : []);
  const candidate = {
    card_id: hashId('fmc', `search|${sourceUrl}|${title}|${address}`),
    candidate_id: hashId('spf', `${sourceUrl}|${title}|${address}`),
    source_kind: 'search_provider_result',
    provider: cleanText(context.provider || result.provider || 'search_provider'),
    search_provider: cleanText(context.provider || result.provider || 'search_provider'),
    provider_query: cleanText(context.query || result.query),
    provider_result_rank: Number(result.rank || context.rank || 0) || 0,
    original_rank: Number(result.original_rank || result.rank || context.rank || 0) || 0,
    result_rank_score: Number(result.result_rank_score || 0) || 0,
    search_result_quality_bucket: cleanText(result.search_result_quality_bucket) || 'broad_source',
    search_result_demotion_reason: cleanText(result.search_result_demotion_reason),
    search_result_classification: cleanText(result.search_result_classification || sourceClassification),
    search_result_property_specific: result.search_result_property_specific === true || propertySpecific,
    search_result_broad: result.search_result_broad === true || isBroadSourceResult(result),
    retrieved_at: retrievedAt,
    display_address: address || title || sourceUrl,
    address_or_source_text: address || title || sourceUrl,
    address,
    city: cleanText(result.city || context.city),
    state: cleanText(result.state || context.state),
    county: cleanText(result.county || context.county),
    zip: cleanText(result.zip),
    source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
    canonical_source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
    displayed_url: cleanText(result.displayed_url),
    source_domain: domain,
    source_title: title,
    title,
    source_snippet: snippet,
    search_result_snippet: snippet,
    evidence_snippet: snippet || title,
    exact_source_phrase: promotedPhrase,
    matched_source_phrase: promotedPhrase,
    exact_source_phrase_source_url: promotedPhrase ? sourceUrl : '',
    exact_source_phrase_source_type: promotedPhrase ? phrase.exact_source_phrase_source_type : '',
    exact_source_phrase_checked_at: promotedPhrase ? retrievedAt : '',
    exact_source_phrase_verbatim: !!promotedPhrase,
    possible_exact_phrase: phrase.exact_source_phrase,
    phrase_provenance: phrase.exact_source_phrase ? phrase.exact_source_phrase_source_type : '',
    exact_source_phrase_candidate: phrase.exact_source_phrase,
    exact_source_phrase_verbatim_candidate: phrase.exact_source_phrase_verbatim === true,
    source_type: geminiProvider.classifySourceType(sourceUrl),
    source_classification: sourceClassification,
    property_specific_source: propertySpecific,
    listing_status: status,
    address_recovery_basis: addressInfo.basis,
    public_contact_route: cleanText(result.public_contact_route),
    asking_price: cleanText(result.asking_price || result.price),
    beds: cleanText(result.beds),
    baths: cleanText(result.baths),
    sqft: cleanText(result.sqft),
    missing_evidence: Array.from(new Set(missing.map(cleanText).filter(Boolean))),
    risk_flags: propertySpecific ? [] : ['generic search result'],
    confidence: promotedPhrase && propertySpecific ? 'medium' : 'low',
    can_send_to_analyzer: propertySpecific && !!promotedPhrase,
    suppress_exact_phrase_fallback: !promotedPhrase,
    evidence_conversion_trace: trace,
    evidence_conversion_reason_codes: trace.reason_codes,
    preview_only: true,
    should_ingest: false
  };
  candidate.lead_evidence = leadEvidence.normalizeLeadEvidence(withoutUnpromotedPhraseFallback(candidate), {
    exact_source_phrase: promotedPhrase,
    exact_source_phrase_verbatim: !!promotedPhrase,
    exact_source_phrase_source_type: promotedPhrase ? phrase.exact_source_phrase_source_type : '',
    exact_source_phrase_source_url: promotedPhrase ? sourceUrl : '',
    exact_source_phrase_checked_at: promotedPhrase ? retrievedAt : '',
    listing_status: candidate.listing_status,
    source_checked_at: retrievedAt
  });
  return candidate;
}

function normalizeSearchResults(results, context) {
  return rankSearchProviderResults(results).map((result, index) => normalizeSearchResult(Object.assign({ rank: index + 1 }, result), context));
}

module.exports = {
  WHOLESALE_PHRASE_RE,
  phraseFromVisibleText,
  normalizeSearchResult,
  normalizeSearchResults,
  listingStatusFromSnippet,
  summarizeEvidenceConversion,
  isPropertySpecificSearchUrl,
  isBroadSourceResult,
  rankSearchProviderResults,
  summarizeSearchResultDemotions,
  summarizeRejectedUrlClasses
};
