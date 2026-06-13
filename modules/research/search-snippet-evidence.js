'use strict';

const crypto = require('crypto');

const geminiProvider = require('./gemini-scout-discovery-provider');
const leadEvidence = require('./lead-evidence');

const WHOLESALE_PHRASE_RE = leadEvidence.WHOLESALE_PHRASE_RE;
const CURRENT_RE = /\b(active|for sale|listed|available|back on (?:the )?market|relisted|price (?:reduced|cut|drop|reduction)|new listing|pending|contingent)\b/i;
const CLOSED_RE = /\b(sold|closed|off[- ]?market|auction ended|sale completed)\b/i;

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

function listingStatusFromSnippet(title, snippet) {
  const text = `${cleanText(title)} ${cleanText(snippet)}`;
  if (CLOSED_RE.test(text) && !CURRENT_RE.test(text)) return 'Sold/closed or historical';
  if (CURRENT_RE.test(text) || WHOLESALE_PHRASE_RE.test(text)) return 'Current or plausibly current';
  return 'Manual Verification Needed';
}

function resultAddress(result, context) {
  const direct = cleanText(result && (result.possible_address || result.address || result.property_address));
  if (direct) return direct;
  const identity = geminiProvider.extractAddressFromSourceText(
    result && result.title,
    result && result.snippet,
    result && result.url,
    context && context.city,
    context && context.state
  );
  return cleanText(identity && identity.normalized_address);
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
  const propertySpecific = geminiProvider.isPropertySpecificSourceUrl(sourceUrl);
  const phrase = phraseFromVisibleText(title, snippet);
  const address = resultAddress(result, context);
  const missing = []
    .concat(Array.isArray(result.missing_evidence) ? result.missing_evidence : [])
    .concat(!propertySpecific ? ['property-specific source URL'] : [])
    .concat(!address ? ['complete canonical address'] : [])
    .concat(!phrase.exact_source_phrase ? ['exact source-backed wholesale phrase'] : []);
  const status = listingStatusFromSnippet(title, snippet);
  const candidate = {
    card_id: hashId('fmc', `search|${sourceUrl}|${title}|${address}`),
    candidate_id: hashId('spf', `${sourceUrl}|${title}|${address}`),
    source_kind: 'search_provider_result',
    provider: cleanText(context.provider || result.provider || 'search_provider'),
    search_provider: cleanText(context.provider || result.provider || 'search_provider'),
    provider_query: cleanText(context.query || result.query),
    provider_result_rank: Number(result.rank || context.rank || 0) || 0,
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
    exact_source_phrase: phrase.exact_source_phrase,
    matched_source_phrase: phrase.exact_source_phrase,
    exact_source_phrase_source_url: phrase.exact_source_phrase ? sourceUrl : '',
    exact_source_phrase_source_type: phrase.exact_source_phrase_source_type,
    exact_source_phrase_checked_at: phrase.exact_source_phrase ? retrievedAt : '',
    exact_source_phrase_verbatim: phrase.exact_source_phrase_verbatim,
    possible_exact_phrase: phrase.exact_source_phrase,
    phrase_provenance: phrase.exact_source_phrase ? phrase.exact_source_phrase_source_type : '',
    source_type: geminiProvider.classifySourceType(sourceUrl),
    source_classification: sourceClassification,
    property_specific_source: propertySpecific,
    listing_status: cleanText(result.listing_status) || status,
    public_contact_route: cleanText(result.public_contact_route),
    asking_price: cleanText(result.asking_price || result.price),
    beds: cleanText(result.beds),
    baths: cleanText(result.baths),
    sqft: cleanText(result.sqft),
    missing_evidence: Array.from(new Set(missing.map(cleanText).filter(Boolean))),
    risk_flags: propertySpecific ? [] : ['generic search result'],
    confidence: phrase.exact_source_phrase && propertySpecific ? 'medium' : 'low',
    can_send_to_analyzer: propertySpecific && !!phrase.exact_source_phrase,
    preview_only: true,
    should_ingest: false
  };
  candidate.lead_evidence = leadEvidence.normalizeLeadEvidence(candidate, {
    exact_source_phrase_verbatim: phrase.exact_source_phrase_verbatim === true,
    exact_source_phrase_source_type: phrase.exact_source_phrase_source_type,
    exact_source_phrase_source_url: phrase.exact_source_phrase ? sourceUrl : '',
    exact_source_phrase_checked_at: phrase.exact_source_phrase ? retrievedAt : '',
    listing_status: candidate.listing_status,
    source_checked_at: retrievedAt
  });
  return candidate;
}

function normalizeSearchResults(results, context) {
  return (Array.isArray(results) ? results : []).map((result, index) => normalizeSearchResult(Object.assign({ rank: index + 1 }, result), context));
}

module.exports = {
  WHOLESALE_PHRASE_RE,
  phraseFromVisibleText,
  normalizeSearchResult,
  normalizeSearchResults,
  listingStatusFromSnippet
};
