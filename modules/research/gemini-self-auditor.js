'use strict';

const leadEvidence = require('./lead-evidence');
const sourceEvidenceAdapter = require('./source-evidence-adapter');

function cleanText(value) {
  return leadEvidence.cleanText(value);
}

function auditGeminiCandidate(card) {
  const evidence = leadEvidence.normalizeLeadEvidence(card || {});
  const sourceUrl = evidence.canonical_source_url || cleanText(card && (card.canonical_source_url || card.source_url));
  const sourceType = sourceEvidenceAdapter.classifySourceUrl(sourceUrl);
  const blockers = [];
  const pass = [];
  if (evidence.normalized_address) pass.push('full canonical address'); else blockers.push('missing_address');
  if (sourceType === 'exact_property_record') pass.push('exact property-specific URL'); else blockers.push('generic_source');
  if (leadEvidence.isCurrentOpportunity(evidence) && !/^Manual Verification Needed$/i.test(evidence.listing_status)) pass.push('current/plausibly-current status'); else blockers.push('missing_status');
  if (evidence.exact_source_phrase && evidence.exact_source_phrase_verbatim === true && evidence.exact_source_phrase_source_type) pass.push('verbatim source-backed phrase'); else blockers.push('no_exact_phrase');
  const text = [evidence.listing_status, evidence.exact_source_phrase, card && card.source_title, card && card.source_snippet].map(cleanText).join(' ');
  if (/\b(sold|closed|off[- ]?market|sale completed|completed auction|auction ended)\b/i.test(text) && !/\b(active|for sale|listed|pending|contingent|back on market|relisted|price reduced|price cut)\b/i.test(text)) blockers.push('sold_or_stale');
  if (/\b(bank[- ]?owned|reo|real estate owned)\b/i.test(text)) blockers.push('reo_or_bank_owned');
  return {
    valid_for_gate: blockers.length === 0,
    pass,
    blockers: Array.from(new Set(blockers)),
    recommended_group: blockers.length ? 'Research / Reference' : evidence.public_contact_route === 'Manual Lookup Needed' ? 'Valid Leads - Needs Comps' : 'Strong Leads'
  };
}

module.exports = {
  auditGeminiCandidate
};
