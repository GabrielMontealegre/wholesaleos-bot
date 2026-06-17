'use strict';

const crypto = require('crypto');

const geminiProvider = require('./gemini-scout-discovery-provider');
const leadEvidence = require('./lead-evidence');
const propertyIdentity = require('./property-identity');

const WHOLESALE_PHRASE_RE = leadEvidence.WHOLESALE_PHRASE_RE;
const CURRENT_RE = /\b(active|for sale|house for sale|home for sale|homes for sale|listed|available|back on (?:the )?market|relisted|price (?:reduced|cut|drop|reduction)|new listing|auction date|foreclosure sale)\b/i;
const CLOSED_RE = /\b(sold|closed|off[- ]?market|auction ended|sale completed)\b/i;
const LISTING_CONTEXT_RE = /\b(listing|listed|property|home|house|for sale|redfin|realtor|zillow|har)\b/i;

const PHRASE_FAMILIES = [
  { family: 'as_is', patterns: [/\b(as[- ]?is|as is sale|sold as[- ]?is)\b/i] },
  { family: 'cash_only', patterns: [/\b(cash only|cash offers only)\b/i] },
  { family: 'investor_special', patterns: [/\b(investor special|investor opportunity|handyman special)\b/i] },
  { family: 'fixer_upper', patterns: [/\b(fixer[- ]?upper|fixer)\b/i] },
  { family: 'needs_tlc', patterns: [/\bneeds\s+tlc\b/i] },
  { family: 'needs_work', patterns: [/\bneeds\s+(?:work|repairs?)\b/i] },
  { family: 'handyman_special', patterns: [/\bhandyman special\b/i] },
  { family: 'distressed', patterns: [/\bdistressed\b/i] },
  { family: 'foreclosure', patterns: [/\bforeclosure\b/i, /\bpre[- ]?foreclosure\b/i] },
  { family: 'auction', patterns: [/\bauction\b/i] },
  { family: 'price_reduced', patterns: [/\bprice (?:reduced|cut|drop|reduction)\b/i] },
  { family: 'motivated_seller', patterns: [/\bmotivated seller\b/i] },
  { family: 'estate_sale', patterns: [/\bestate sale\b/i] },
  { family: 'probate', patterns: [/\bprobate\b/i] },
  { family: 'vacant', patterns: [/\bvacant\b/i] },
  { family: 'fire_damage', patterns: [/\bfire damage\b/i] },
  { family: 'foundation_issue', patterns: [/\bfoundation issue\b/i] },
  { family: 'tenant_occupied', patterns: [/\btenant occupied\b/i] },
  { family: 'no_repairs', patterns: [/\bno repairs\b/i] },
  { family: 'bring_all_offers', patterns: [/\bbring all offers\b/i] }
];
const STATUS_PROMOTABLE_FAMILIES = [
  { family: 'active', label: 'active', patterns: [/\bactive\b/i] },
  { family: 'for_sale', label: 'for sale', patterns: [/\bfor sale\b/i, /\bhouses? for sale\b/i, /\bhomes? for sale\b/i] },
  { family: 'listed', label: 'listed', patterns: [/\blisted\b/i] },
  { family: 'available', label: 'available', patterns: [/\bavailable\b/i] },
  { family: 'new_listing', label: 'new listing', patterns: [/\bnew listing\b/i] },
  { family: 'price_cut', label: 'price cut', patterns: [/\bprice cut\b/i] },
  { family: 'price_reduced', label: 'price reduced', patterns: [/\bprice reduced\b/i] },
  { family: 'auction_date', label: 'auction date', patterns: [/\bauction date\b/i] },
  { family: 'foreclosure_sale', label: 'foreclosure sale', patterns: [/\bforeclosure sale\b/i] },
  { family: 'back_on_market', label: 'back on market', patterns: [/\bback on (?:the )?market\b/i] },
  { family: 'relisted', label: 'relisted', patterns: [/\brelisted\b/i] }
];
const STATUS_NON_PROMOTABLE_FAMILIES = [
  { family: 'coming_soon', label: 'coming soon', patterns: [/\bcoming soon\b/i], rejected_reason: 'coming soon is not promotable callable evidence' },
  { family: 'pending', label: 'pending', patterns: [/\bpending\b/i], rejected_reason: 'pending is not promotable callable evidence' },
  { family: 'contingent', label: 'contingent', patterns: [/\bcontingent\b/i], rejected_reason: 'contingent is not promotable callable evidence' },
  { family: 'under_contract', label: 'under contract', patterns: [/\bunder contract\b/i], rejected_reason: 'under contract is not promotable callable evidence' },
  { family: 'sold', label: 'sold', patterns: [/\bsold\b/i], rejected_reason: 'sold is not promotable callable evidence' },
  { family: 'closed', label: 'closed', patterns: [/\bclosed\b/i], rejected_reason: 'closed is not promotable callable evidence' },
  { family: 'off_market', label: 'off market', patterns: [/\boff[- ]?market\b/i], rejected_reason: 'off market is not promotable callable evidence' },
  { family: 'historical', label: 'historical', patterns: [/\bhistorical\b/i], rejected_reason: 'historical is not promotable callable evidence' }
];

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

function visibleCandidateFields(title, snippet, metadata) {
  metadata = metadata && typeof metadata === 'object' ? metadata : {};
  const page = metadata.page_metadata && typeof metadata.page_metadata === 'object' ? metadata.page_metadata : {};
  return [
    { type: 'title', text: cleanText(title) },
    { type: 'snippet', text: cleanText(snippet) },
    { type: 'source_title', text: cleanText(metadata.source_title) },
    { type: 'source_snippet', text: cleanText(metadata.source_snippet) },
    { type: 'search_result_snippet', text: cleanText(metadata.search_result_snippet) },
    { type: 'evidence_snippet', text: cleanText(metadata.evidence_snippet) },
    { type: 'displayed_url', text: cleanText(metadata.displayed_url || metadata.displayedLink) },
    { type: 'displayed_domain', text: cleanText(metadata.displayed_domain) },
    { type: 'source_domain', text: cleanText(metadata.source_domain) },
    { type: 'listing_status', text: cleanText(metadata.listing_status) },
    { type: 'status', text: cleanText(metadata.status) },
    { type: 'source_status', text: cleanText(metadata.source_status) },
    { type: 'page_title', text: cleanText(page.title) },
    { type: 'page_description', text: cleanText(page.meta_description || page.og_description) }
  ].filter((field) => field.text);
}

function sentenceContainingMatch(text, matchText) {
  const source = cleanText(text);
  const match = cleanText(matchText);
  if (!source || !match) return '';
  const escaped = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sentence = source.match(new RegExp(`[^.!?;|]*\\b${escaped}\\b[^.!?;|]*[.!?;|]?`, 'i'));
  return cleanText(sentence && sentence[0] || match);
}

function matchCandidateFamily(text, families, options) {
  const value = cleanText(text);
  if (!value) return null;
  const captureSentence = options && options.captureSentence === true;
  for (const family of Array.isArray(families) ? families : []) {
    for (const pattern of family.patterns || []) {
      const match = value.match(pattern);
      if (!match) continue;
      const raw = cleanText(match[0]);
      return {
        family: family.family,
        text: captureSentence ? sentenceContainingMatch(value, raw) : (family.label || raw),
        visible: true,
        promoted: family.promoted !== false,
        rejected_reason: cleanText(family.rejected_reason || ''),
        provenance_match: raw
      };
    }
  }
  return null;
}

function extractVisiblePhraseCandidate(title, snippet, metadata) {
  for (const field of visibleCandidateFields(title, snippet, metadata)) {
    const match = matchCandidateFamily(field.text, PHRASE_FAMILIES, { captureSentence: true });
    if (match) {
      return {
        text: cleanText(match.text),
        family: cleanText(match.family),
        provenance: field.type,
        visible: true,
        promoted: true,
        rejected_reason: '',
        provenance_match: cleanText(match.provenance_match)
      };
    }
  }
  return {
    text: '',
    family: '',
    provenance: '',
    visible: false,
    promoted: false,
    rejected_reason: 'no_visible_exact_phrase',
    provenance_match: ''
  };
}

function extractVisibleStatusCandidate(title, snippet, metadata) {
  for (const field of visibleCandidateFields(title, snippet, metadata)) {
    const promotable = matchCandidateFamily(field.text, STATUS_PROMOTABLE_FAMILIES, { captureSentence: false });
    if (promotable) {
      return {
        text: cleanText(promotable.text),
        family: cleanText(promotable.family),
        provenance: field.type,
        visible: true,
        promoted: true,
        rejected_reason: '',
        provenance_match: cleanText(promotable.provenance_match)
      };
    }
    const blocked = matchCandidateFamily(field.text, STATUS_NON_PROMOTABLE_FAMILIES, { captureSentence: false });
    if (blocked) {
      return {
        text: cleanText(blocked.text),
        family: cleanText(blocked.family),
        provenance: field.type,
        visible: true,
        promoted: false,
        rejected_reason: cleanText(blocked.rejected_reason || `${blocked.family} is not promotable callable evidence`),
        provenance_match: cleanText(blocked.provenance_match)
      };
    }
  }
  return {
    text: '',
    family: '',
    provenance: '',
    visible: false,
    promoted: false,
    rejected_reason: 'no_visible_status',
    provenance_match: ''
  };
}

function evaluateVisibleEvidenceForPromotion(input) {
  input = input || {};
  const phraseCandidate = input.phraseCandidate || {};
  const statusCandidate = input.statusCandidate || {};
  const fullAddress = input.fullAddress === true;
  const propertySpecific = input.propertySpecific === true;
  const sourceClassification = cleanText(input.sourceClassification);
  const phraseSeen = phraseCandidate.visible === true;
  const statusSeen = statusCandidate.visible === true;
  const phrasePromotable = phraseSeen && phraseCandidate.promoted === true && !!cleanText(phraseCandidate.text);
  const statusPromotable = statusSeen && statusCandidate.promoted === true && !!cleanText(statusCandidate.text);
  const promoted = !!(fullAddress && propertySpecific && phrasePromotable && statusPromotable);
  const reasons = [];

  if (phraseSeen) reasons.push('phrase_candidate_seen');
  if (statusSeen) reasons.push('status_candidate_seen');
  if (phraseSeen && !phrasePromotable) reasons.push('phrase_candidate_rejected_reason');
  if (statusSeen && !statusPromotable) reasons.push('status_candidate_rejected_reason');
  if (propertySpecific && !phrasePromotable) reasons.push('property_url_but_missing_phrase');
  if (propertySpecific && !statusPromotable) reasons.push('property_url_but_missing_status');
  if (!propertySpecific) reasons.push('missing_property_url');
  if (!fullAddress) reasons.push('missing_address');
  if (sourceClassification && /exact_property_page|listing_property_page|auction_property_page|official_property_notice/i.test(sourceClassification) && !promoted) {
    reasons.push('exact_property_page_rejected_reason');
  }
  if (phraseSeen && !promoted) reasons.push('source_phrase_dropped');
  if (!statusSeen && propertySpecific) reasons.push('property_url_but_missing_status');
  if (!phraseSeen && propertySpecific) reasons.push('property_url_but_missing_phrase');

  return {
    promoted,
    exact_source_phrase: promoted ? cleanText(phraseCandidate.text) : '',
    exact_source_phrase_source_type: promoted ? cleanText(phraseCandidate.provenance) : '',
    exact_source_phrase_verbatim: promoted,
    listing_status: statusSeen ? cleanText(statusCandidate.text) : 'Manual Verification Needed',
    current_status_promoted: statusPromotable,
    phrase_candidate_seen: phraseSeen,
    phrase_candidate_rejected_reason: phraseSeen && !phrasePromotable ? cleanText(phraseCandidate.rejected_reason || 'phrase candidate not promotable') : '',
    status_candidate_seen: statusSeen,
    status_candidate_rejected_reason: statusSeen && !statusPromotable ? cleanText(statusCandidate.rejected_reason || 'status candidate not promotable') : '',
    property_url_but_missing_phrase: propertySpecific && !phrasePromotable,
    property_url_but_missing_status: propertySpecific && !statusPromotable,
    exact_property_page_rejected_reason: propertySpecific && !promoted ? reasons.join(', ') : '',
    reason_codes: Array.from(new Set(reasons.filter(Boolean)))
  };
}

function phraseFromVisibleText(title, snippet) {
  const candidate = extractVisiblePhraseCandidate(title, snippet, {});
  return {
    exact_source_phrase: candidate.visible ? candidate.text : '',
    exact_source_phrase_source_type: candidate.visible ? candidate.provenance : '',
    exact_source_phrase_verbatim: candidate.visible === true
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
  const phraseCandidateSeen = input.phrase_candidate_seen === true;
  const statusCandidateSeen = input.status_candidate_seen === true;
  const propertySpecific = input.propertySpecific === true;
  const fullAddress = input.fullAddress === true;
  const currentStatus = input.currentStatus === true;
  const promoted = input.promoted === true;
  const reasons = [];
  if (phraseFound && !promoted) reasons.push('phrase_extracted_but_not_verified');
  if (phraseCandidateSeen) reasons.push('phrase_candidate_seen');
  if (statusCandidateSeen) reasons.push('status_candidate_seen');
  if (cleanText(input.phrase_candidate_rejected_reason)) reasons.push('phrase_candidate_rejected_reason');
  if (cleanText(input.status_candidate_rejected_reason)) reasons.push('status_candidate_rejected_reason');
  if (phraseFound && propertySpecific && !fullAddress) reasons.push('phrase_verified_but_missing_address');
  if (phraseFound && propertySpecific && fullAddress && !currentStatus) reasons.push('phrase_verified_but_missing_status');
  if (propertySpecific && !currentStatus) reasons.push('property_url_but_missing_status');
  if (!propertySpecific) reasons.push('missing_property_url');
  if (!propertySpecific && input.hasUrl) reasons.push('generic_url_rejected');
  if (propertySpecific && !promoted && !cleanText(input.phrase_candidate_rejected_reason) && !cleanText(input.status_candidate_rejected_reason)) {
    reasons.push('exact_property_page_rejected_reason');
  }
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
    phrase_candidate_seen: phraseCandidateSeen,
    phrase_candidate_rejected_reason: cleanText(input.phrase_candidate_rejected_reason),
    status_candidate_seen: statusCandidateSeen,
    status_candidate_rejected_reason: cleanText(input.status_candidate_rejected_reason),
    exact_source_phrase_assigned: promoted,
    exact_source_phrase_verbatim: promoted,
    full_address_found: fullAddress,
    property_specific_url: propertySpecific,
    current_status_found: currentStatus,
    property_url_but_missing_phrase: !!input.property_url_but_missing_phrase,
    property_url_but_missing_status: !!input.property_url_but_missing_status,
    exact_property_page_rejected_reason: cleanText(input.exact_property_page_rejected_reason),
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
    property_url_but_missing_phrase: 0,
    property_url_but_missing_status: 0,
    generic_url_rejected: 0,
    missing_address: 0,
    missing_status: 0,
    missing_property_url: 0,
    source_phrase_dropped: 0,
    phrase_candidate_seen: 0,
    phrase_candidate_rejected_reason: 0,
    status_candidate_seen: 0,
    status_candidate_rejected_reason: 0,
    exact_property_page_rejected_reason: 0,
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
    if (trace.phrase_candidate_seen === true) out.phrase_candidate_seen += 1;
    if (cleanText(trace.phrase_candidate_rejected_reason)) out.phrase_candidate_rejected_reason += 1;
    if (trace.status_candidate_seen === true) out.status_candidate_seen += 1;
    if (cleanText(trace.status_candidate_rejected_reason)) out.status_candidate_rejected_reason += 1;
    if (trace.property_url_but_missing_phrase === true) out.property_url_but_missing_phrase += 1;
    if (trace.property_url_but_missing_status === true) out.property_url_but_missing_status += 1;
    if (cleanText(trace.exact_property_page_rejected_reason)) out.exact_property_page_rejected_reason += 1;
    for (const reason of Array.isArray(trace.reason_codes) ? trace.reason_codes : []) {
      if (/^(phrase_candidate_seen|phrase_candidate_rejected_reason|status_candidate_seen|status_candidate_rejected_reason|property_url_but_missing_phrase|property_url_but_missing_status|exact_property_page_rejected_reason)$/.test(reason)) continue;
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
  const visibleMetadata = Object.assign({}, result, {
    source_title: title,
    source_snippet: snippet,
    search_result_snippet: snippet,
    evidence_snippet: snippet || title,
    displayed_domain: domain,
    source_domain: domain,
    displayed_url: cleanText(result.displayed_url || result.displayedLink),
    source_classification: sourceClassification
  });
  const phrase = extractVisiblePhraseCandidate(title, snippet, visibleMetadata);
  const statusCandidate = extractVisibleStatusCandidate(title, snippet, visibleMetadata);
  const addressInfo = resultAddressInfo(result, context, sourceUrl, title, snippet);
  const address = cleanText(addressInfo.address);
  const fullAddress = addressInfo.full === true;
  const promotion = evaluateVisibleEvidenceForPromotion({
    phraseCandidate: phrase,
    statusCandidate,
    fullAddress,
    propertySpecific,
    sourceClassification
  });
  const promotedPhrase = promotion.exact_source_phrase;
  const status = cleanText(promotion.listing_status || statusCandidate.text || result.listing_status || 'Manual Verification Needed');
  const currentStatus = promotion.current_status_promoted === true;
  const trace = conversionTrace({
    sourceUrl,
    title,
    snippet,
    possiblePhrase: phrase.text,
    phraseProvenance: phrase.provenance,
    phrase_candidate_seen: promotion.phrase_candidate_seen,
    phrase_candidate_rejected_reason: promotion.phrase_candidate_rejected_reason,
    status_candidate_seen: promotion.status_candidate_seen,
    status_candidate_rejected_reason: promotion.status_candidate_rejected_reason,
    property_url_but_missing_phrase: promotion.property_url_but_missing_phrase,
    property_url_but_missing_status: promotion.property_url_but_missing_status,
    exact_property_page_rejected_reason: promotion.exact_property_page_rejected_reason,
    promoted: !!promotedPhrase,
    propertySpecific,
    fullAddress,
    currentStatus,
    hasUrl: !!sourceUrl,
    publicContactRoute: result.public_contact_route,
    sourceClassification
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
    possible_exact_phrase: phrase.text,
    phrase_provenance: phrase.provenance,
    exact_source_phrase_candidate: phrase.text,
    exact_source_phrase_verbatim_candidate: phrase.visible === true,
    phrase_candidate_seen: phrase.visible === true,
    phrase_candidate_text: phrase.text,
    phrase_candidate_family: phrase.family,
    phrase_candidate_provenance: phrase.provenance,
    phrase_candidate_promoted: phrase.promoted === true,
    phrase_candidate_rejected_reason: phrase.rejected_reason,
    status_candidate_seen: statusCandidate.visible === true,
    status_candidate_text: statusCandidate.text,
    status_candidate_family: statusCandidate.family,
    status_candidate_provenance: statusCandidate.provenance,
    status_candidate_promoted: statusCandidate.promoted === true,
    status_candidate_rejected_reason: statusCandidate.rejected_reason,
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
    exact_source_phrase_source_type: promotedPhrase ? phrase.provenance : '',
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
  extractVisiblePhraseCandidate,
  extractVisibleStatusCandidate,
  evaluateVisibleEvidenceForPromotion,
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
