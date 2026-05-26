'use strict';

const { generateDallasPropertyIntelligence } = require('./dallas-property-intelligence-agent');

const REQUIRED_EVIDENCE = Object.freeze([
  'property_address',
  'source_truth',
  'verified_comps',
  'repair_estimate',
  'dom_or_listing_status',
  'operator_confirmed_arv'
]);

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function createInstantDealAnalysisRequest(input = {}) {
  const address = cleanText(input.address || input.property_address);
  const city = cleanText(input.city);
  const state = cleanText(input.state || 'TX');
  const county = cleanText(input.county || 'Dallas');
  const missing = [];
  if (!address) missing.push('property_address');
  if (!input.source_truth) missing.push('source_truth');
  if (!Array.isArray(input.comps) || input.comps.length < 3) missing.push('verified_comps');
  if (!input.repair_estimate) missing.push('repair_estimate');
  if (!input.dom && !input.listing_status) missing.push('dom_or_listing_status');
  if (!input.confirmed_arv) missing.push('operator_confirmed_arv');
  return {
    version: 'instant_property_deal_analyzer_foundation_v1',
    status: 'foundation_only',
    address,
    city,
    state,
    county,
    property_intelligence: generateDallasPropertyIntelligence(Object.assign({}, input, {
      address,
      city,
      state,
      county
    })),
    evidence_required: REQUIRED_EVIDENCE.slice(),
    missing_evidence: missing,
    no_fake_values: true,
    no_external_api_calls: true,
    ready_for_analysis: missing.length === 0
  };
}

function analyzeInstantPropertyDeal(input = {}) {
  const request = createInstantDealAnalysisRequest(input);
  return Object.assign({}, request, {
    analysis_status: request.ready_for_analysis ? 'evidence_ready_not_implemented' : 'missing_evidence',
    property_intelligence: request.property_intelligence,
    arv: null,
    mao: null,
    ppsf: null,
    wholesale_angle: null,
    flip_rental_angle: null,
    risk_flags: request.missing_evidence.slice(),
    best_next_action: request.missing_evidence.length
      ? `Collect missing evidence: ${request.missing_evidence.join(', ')}.`
      : 'Implement evidence-based analyzer before producing valuation guidance.'
  });
}

module.exports = {
  REQUIRED_EVIDENCE,
  createInstantDealAnalysisRequest,
  analyzeInstantPropertyDeal
};
