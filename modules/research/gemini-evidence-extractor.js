'use strict';

const leadEvidence = require('./lead-evidence');

const WHOLESALE_PHRASE_RE = leadEvidence.WHOLESALE_PHRASE_RE;
const CURRENT_RE = /\b(active|for sale|listed|available|in stock|back on (?:the )?market|relisted|price (?:reduced|cut|drop|reduction)|new listing|pending|contingent)\b/i;
const CLOSED_RE = /\b(sold|closed|off[- ]?market|auction ended|sale completed)\b/i;

function cleanText(value) {
  return leadEvidence.cleanText(value);
}

function sentenceWithPhrase(value) {
  const text = cleanText(value);
  if (!WHOLESALE_PHRASE_RE.test(text)) return '';
  const match = text.match(/[^.!?;|]*\b(?:as[- ]?is|as is sale|investor special|investor opportunity|cash only|fixer[- ]?upper|fixer|needs\s+(?:tlc|work|repair|repairs)|rehab|back on (?:the )?market|relisted|price (?:cut|reduced|drop|reduction)|estate sale|fsbo|for sale by owner|hard money only|traditional financing unavailable)\b[^.!?;|]*[.!?]?/i);
  return cleanText(match && match[0] || text);
}

function visibleEvidenceSources(candidate) {
  candidate = candidate || {};
  const page = candidate.page_metadata || {};
  return [
    { type: 'grounding_support', value: candidate.grounding_support_text },
    { type: 'grounding_support', value: candidate.evidence_source_type === 'grounding_support' ? candidate.evidence_snippet : '' },
    { type: 'page_metadata', value: page.meta_description },
    { type: 'page_metadata', value: page.og_description },
    { type: 'page_metadata', value: page.title },
    { type: 'source_snippet', value: candidate.source_snippet },
    { type: 'source_snippet', value: candidate.search_result_snippet },
    { type: cleanText(candidate.evidence_source_type) || 'source_snippet', value: candidate.evidence_snippet },
    { type: 'source_title', value: candidate.source_title || candidate.title || candidate.candidate_title }
  ].filter((source) => cleanText(source.value));
}

function extractPhraseEvidence(candidate, options = {}) {
  const sourceUrl = cleanText(options.source_url || candidate && (candidate.canonical_source_url || candidate.source_url || candidate.url));
  const checkedAt = cleanText(candidate && (candidate.source_checked_at || candidate.provider_timestamp)) || new Date().toISOString();
  for (const source of visibleEvidenceSources(candidate)) {
    const phrase = sentenceWithPhrase(source.value);
    if (!phrase) continue;
    return {
      exact_source_phrase: phrase,
      exact_source_phrase_source_url: sourceUrl,
      exact_source_phrase_source_type: source.type,
      exact_source_phrase_checked_at: checkedAt,
      exact_source_phrase_verbatim: true,
      phrase_provenance: source.type
    };
  }
  return {
    exact_source_phrase: '',
    exact_source_phrase_source_url: '',
    exact_source_phrase_source_type: '',
    exact_source_phrase_checked_at: '',
    exact_source_phrase_verbatim: false,
    phrase_provenance: ''
  };
}

function listingStatusFromVisibleEvidence(candidate) {
  const text = visibleEvidenceSources(candidate).map((source) => cleanText(source.value)).join(' ');
  if (CLOSED_RE.test(text) && !CURRENT_RE.test(text)) return 'Sold/closed or historical';
  if (CURRENT_RE.test(text)) return 'Current or plausibly current';
  return cleanText(candidate && candidate.listing_status);
}

function extractGeminiEvidence(candidate, options = {}) {
  candidate = candidate || {};
  const phrase = extractPhraseEvidence(candidate, options);
  return {
    canonical_address: cleanText(candidate.address || candidate.property_address || candidate.display_address || candidate.normalized_address),
    canonical_source_url: cleanText(options.source_url || candidate.canonical_source_url || candidate.source_url || candidate.url),
    source_domain: leadEvidence.sourceDomain(options.source_url || candidate.canonical_source_url || candidate.source_url || candidate.url),
    listing_status: listingStatusFromVisibleEvidence(candidate),
    asking_price: cleanText(candidate.asking_price || candidate.visible_price_or_bid || candidate.price),
    beds: cleanText(candidate.beds),
    baths: cleanText(candidate.baths),
    sqft: cleanText(candidate.sqft),
    year_built: cleanText(candidate.year_built || candidate.year),
    public_contact_route: cleanText(candidate.public_contact_route),
    missing_evidence: Array.isArray(candidate.missing_evidence) ? candidate.missing_evidence.map(cleanText).filter(Boolean) : [],
    phrase_evidence: phrase
  };
}

module.exports = {
  visibleEvidenceSources,
  extractPhraseEvidence,
  extractGeminiEvidence,
  sentenceWithPhrase
};
