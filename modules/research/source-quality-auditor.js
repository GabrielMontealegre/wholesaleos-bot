'use strict';

const leadEvidence = require('./lead-evidence');

function cleanText(value) {
  return leadEvidence.cleanText(value);
}

function countCards(cards, predicate) {
  return (Array.isArray(cards) ? cards : []).filter(predicate).length;
}

function cardText(card) {
  return [
    card && card.rejection_reason,
    card && Array.isArray(card.batch_blockers) ? card.batch_blockers.join(' ') : '',
    card && Array.isArray(card.missing_evidence) ? card.missing_evidence.join(' ') : '',
    card && card.lead_evidence && Array.isArray(card.lead_evidence.missing_evidence) ? card.lead_evidence.missing_evidence.join(' ') : ''
  ].map(cleanText).join(' ');
}

function auditBatch(input) {
  input = input || {};
  const cards = Array.isArray(input.cards) ? input.cards : [];
  const batchAudit = input.batchAudit || {};
  const providerSummary = input.providerSummary || {};
  const buckets = {
    no_exact_phrase: countCards(cards, (card) => !cleanText(card && (card.exact_source_phrase || card.matched_source_phrase || card.lead_evidence && card.lead_evidence.exact_source_phrase))),
    source_blocked: countCards(cards, (card) => /blocked/i.test(cardText(card))),
    generic_source: countCards(cards, (card) => /generic|property-specific source URL|source URL/i.test(cardText(card))),
    previously_seen: countCards(cards, (card) => /previously|already/i.test(cardText(card))),
    missing_status: countCards(cards, (card) => /current listing status|stale/i.test(cardText(card))),
    missing_address: countCards(cards, (card) => /complete canonical address|full address|usable property address/i.test(cardText(card))),
    sold_or_stale: countCards(cards, (card) => /sold|closed|stale/i.test(cardText(card))),
    weak_snippets: Number(providerSummary.weak_snippets_count || 0) || 0,
    enrichment_failed: Number(providerSummary.evidence_enrichment_attempts || 0) && !Number(providerSummary.evidence_enriched_count || 0) ? Number(providerSummary.evidence_enrichment_attempts || 0) : 0,
    provider_not_configured: /not configured/i.test(`${providerSummary.search_fallback_status || ''} ${providerSummary.search_provider_status || ''}`) ? 1 : 0,
    provider_unavailable: /unavailable|failed/i.test(`${providerSummary.search_fallback_status || ''} ${providerSummary.search_provider_status || ''}`) ? 1 : 0,
    provider_rate_limited: /rate/i.test(`${providerSummary.search_fallback_status || ''} ${providerSummary.search_provider_status || ''}`) ? 1 : 0,
    provider_timed_out: /timed/i.test(`${providerSummary.search_fallback_status || ''} ${providerSummary.search_provider_status || ''}`) ? 1 : 0
  };
  const valid = Number(batchAudit.valid_new_leads || 0) || 0;
  let explanation = '';
  let nextAction = '';
  if (valid > 0) {
    explanation = `${valid} callable candidate${valid === 1 ? '' : 's'} passed strict evidence gate.`;
    nextAction = 'Review source evidence and select leads for Analyzer or Daily Call Pipeline.';
  } else if (buckets.no_exact_phrase) {
    explanation = 'Zero callable leads: public sources did not provide verbatim wholesale phrases on property-specific records.';
    nextAction = 'Use stronger search provider snippets or manual source lookup; do not loosen evidence gate.';
  } else if (buckets.previously_seen) {
    explanation = 'Zero callable leads: candidates were previously shown without material source changes.';
    nextAction = 'Change market, criteria, or require material source changes.';
  } else if (buckets.provider_rate_limited) {
    explanation = 'Zero callable leads: search fallback was rate limited.';
    nextAction = 'Wait for quota reset or use another configured provider.';
  } else if (buckets.provider_timed_out) {
    explanation = 'Zero callable leads: search fallback timed out inside bounded provider budget.';
    nextAction = 'Try one bounded run later or lower max results.';
  } else if (buckets.provider_not_configured) {
    explanation = 'Zero callable leads: Gemini output was weak and search fallback is not configured.';
    nextAction = 'Configure one search provider or perform manual source lookup.';
  } else if (buckets.generic_source || buckets.missing_address || buckets.missing_status) {
    explanation = 'Zero callable leads: candidates lacked property-specific current listing evidence.';
    nextAction = 'Use property-detail source URLs with visible current status and exact source phrase.';
  } else {
    explanation = 'Zero callable leads: no candidate met the strict source-backed acquisition gate.';
    nextAction = 'Review Research / Reference blockers; keep gate unchanged.';
  }
  return {
    quality_buckets: buckets,
    zero_callable_explanation: explanation,
    recommended_action: nextAction,
    zero_callable_next_action: nextAction
  };
}

module.exports = {
  auditBatch
};
