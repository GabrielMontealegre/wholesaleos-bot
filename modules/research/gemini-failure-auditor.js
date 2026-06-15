'use strict';

const leadEvidence = require('./lead-evidence');

function cleanText(value) {
  return leadEvidence.cleanText(value);
}

function cardText(card) {
  return [
    card && card.rejection_reason,
    card && Array.isArray(card.batch_blockers) ? card.batch_blockers.join(' ') : '',
    card && Array.isArray(card.missing_evidence) ? card.missing_evidence.join(' ') : '',
    card && card.lead_evidence && Array.isArray(card.lead_evidence.missing_evidence) ? card.lead_evidence.missing_evidence.join(' ') : ''
  ].map(cleanText).join(' ');
}

function count(cards, predicate) {
  return (Array.isArray(cards) ? cards : []).filter(predicate).length;
}

function auditGeminiFailure(input = {}) {
  const cards = Array.isArray(input.cards) ? input.cards : [];
  const result = input.result || {};
  const buckets = {
    malformed_output: result.gemini_output_valid_json === false || /unparseable/i.test(cleanText(result.provider_output_format)) ? 1 : 0,
    weak_grounding: Number(result.grounding_urls_found || result.gemini_grounding_urls_count || 0) ? 0 : 1,
    url_only: Number(result.url_only_candidate_count || result.gemini_url_only_count || 0) || 0,
    no_exact_phrase: count(cards, (card) => !cleanText(card && (card.exact_source_phrase || card.lead_evidence && card.lead_evidence.exact_source_phrase))),
    missing_status: count(cards, (card) => /current listing status|missing_status|stale/i.test(cardText(card))),
    source_blocked: count(cards, (card) => /blocked|source blocked/i.test(cardText(card))),
    generic_source: count(cards, (card) => /generic|source URL|property-specific/i.test(cardText(card))),
    previous_seen: count(cards, (card) => /previously|already/i.test(cardText(card))),
    enrichment_failed: Number(result.evidence_enrichment_attempts || 0) && !Number(result.evidence_enriched_count || 0) ? Number(result.evidence_enrichment_attempts || 0) : 0
  };
  let reason = '';
  let nextAction = '';
  if (buckets.no_exact_phrase) {
    reason = 'Gemini did not provide verbatim source-backed wholesale phrases for enough property-specific records.';
    nextAction = 'Configure search provider or manually inspect Research / Reference.';
  } else if (buckets.malformed_output) {
    reason = 'Gemini output was malformed or only partially recoverable.';
    nextAction = 'Try smaller batch or rerun later.';
  } else if (buckets.url_only) {
    reason = 'Gemini returned URL-only candidates without enough source evidence.';
    nextAction = 'Configure search provider for stronger public snippets.';
  } else if (buckets.previous_seen) {
    reason = 'Gemini candidates were previously seen without material changes.';
    nextAction = 'Try another market or broaden criteria.';
  } else {
    reason = 'Gemini candidates did not meet the strict source-backed lead gate.';
    nextAction = 'Review Research / Reference blockers.';
  }
  return {
    gemini_failure_buckets: buckets,
    gemini_failure_reason: reason,
    gemini_recommended_next_action: nextAction
  };
}

module.exports = {
  auditGeminiFailure
};
