'use strict';

const sourceEvidenceAdapter = require('./source-evidence-adapter');
const propertyIdentity = require('./property-identity');

const WHOLESALE_PHRASE_RE = /\b(as[- ]?is|as is sale|investor special|investor opportunity|cash only|fixer|needs\s+(?:tlc|work|repair)|rehab|back on (?:the )?market|relisted|price (?:cut|reduced|drop|reduction)|estate sale|fsbo|for sale by owner|hard money only|traditional financing unavailable|pre[- ]?foreclosure)\b/i;
const CLOSED_RE = /\b(sold|closed|off[- ]?market|auction ended|sale completed)\b/i;
const CURRENT_RE = /\b(active|for sale|listed|available|pending|contingent|back on market|relisted|price reduced|price cut)\b/i;
const EXCLUDED_RE = /\b(bank[- ]?owned|reo|real estate owned|completed auction|auction ended|sale completed)\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function pick(obj, keys) {
  obj = obj || {};
  for (const key of keys) {
    const parts = String(key).split('.');
    let cursor = obj;
    for (const part of parts) {
      if (!cursor || typeof cursor !== 'object') {
        cursor = undefined;
        break;
      }
      cursor = cursor[part];
    }
    if (cursor !== undefined && cursor !== null && cleanText(cursor)) return cursor;
  }
  return '';
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function sourceDomain(value) {
  try {
    return new URL(cleanText(value)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function normalizeAddress(value) {
  return propertyIdentity.canonicalAddress(value);
}

function sourceUrlFrom(input) {
  return cleanText(pick(input, [
    'lead_evidence.canonical_source_url',
    'canonical_source_url',
    'source_url',
    'open_source_url',
    'source_proof_url',
    'record_url',
    'source_record_url',
    'source_details.source_url',
    'source_details.record_url'
  ]));
}

function exactPhraseFrom(input) {
  const existing = cleanText(pick(input, [
    'lead_evidence.exact_source_phrase',
    'exact_source_phrase',
    'matched_source_phrase',
    'source_excerpt',
    'description_excerpt',
    'source_snippet',
    'evidence_snippet'
  ]));
  if (WHOLESALE_PHRASE_RE.test(existing)) return existing;
  const text = [
    pick(input, ['description', 'listing_description', 'public_remarks', 'remarks', 'source_text', 'source_page_text']),
    pick(input, ['why_this_might_be_a_deal', 'why_it_matters', 'found_because', 'signal_summary']),
    Array.isArray(input && input.distress_motivation_signals) ? input.distress_motivation_signals.join(' ') : '',
    input && input.scout_context && Array.isArray(input.scout_context.distress_signals) ? input.scout_context.distress_signals.join(' ') : ''
  ].map(cleanText).filter(Boolean).join(' ');
  const match = text.match(/[^.!?]*\b(?:as[- ]?is|as is sale|investor special|investor opportunity|cash only|fixer|needs\s+(?:tlc|work|repair)|rehab|back on (?:the )?market|relisted|price (?:cut|reduced|drop|reduction)|estate sale|fsbo|for sale by owner|hard money only|traditional financing unavailable|pre[- ]?foreclosure)\b[^.!?]*[.!?]?/i);
  return match ? cleanText(match[0]) : '';
}

function matchedCriterionFrom(input, phrase) {
  const tags = []
    .concat(Array.isArray(input && input.matched_criteria) ? input.matched_criteria : [])
    .concat(Array.isArray(input && input.distress_motivation_signals) ? input.distress_motivation_signals : [])
    .concat(Array.isArray(input && input.strategy_tags) ? input.strategy_tags : [])
    .map(cleanText)
    .filter(Boolean);
  if (tags.length) return tags[0];
  const text = cleanText(phrase);
  if (/investor/i.test(text)) return 'investor special';
  if (/cash only/i.test(text)) return 'cash only';
  if (/as[- ]?is/i.test(text)) return 'as-is';
  if (/fixer|needs/i.test(text)) return 'fixer/needs work';
  if (/back on (?:the )?market|relisted/i.test(text)) return 'back on market/relisted';
  if (/price/i.test(text)) return 'price reduced';
  if (/fsbo|for sale by owner/i.test(text)) return 'FSBO';
  if (/pre[- ]?foreclosure/i.test(text)) return 'pre-foreclosure';
  return '';
}

function listingStatusFrom(input) {
  const direct = cleanText(pick(input, ['lead_evidence.listing_status', 'listing_status', 'status_label', 'source_status']));
  if (direct) return direct;
  const text = [
    pick(input, ['status', 'source_text', 'description', 'why_this_might_be_a_deal', 'found_because']),
    exactPhraseFrom(input)
  ].map(cleanText).join(' ');
  if (CLOSED_RE.test(text) && !CURRENT_RE.test(text)) return 'Sold/closed or historical';
  if (CURRENT_RE.test(text)) return 'Current or plausibly current';
  return 'Manual Verification Needed';
}

function compStatusFrom(input) {
  const direct = cleanText(pick(input, ['lead_evidence.comp_status', 'comp_status']));
  if (direct) return direct;
  const verified = Number(pick(input, ['verified_comp_count', 'verified_sold_comps_count']) || 0) || 0;
  const candidate = Number(pick(input, ['candidate_comp_count', 'candidate_sold_comps_count']) || 0) || 0;
  if (verified >= 3) return '3+ verified sold comps present; ARV gate can open.';
  if (verified > 0) return `${verified} verified sold comp${verified === 1 ? '' : 's'}; ARV locked until 3.`;
  if (candidate > 0) return `${candidate} candidate sold comp${candidate === 1 ? '' : 's'}; verify before offer.`;
  return 'Needs Comps';
}

function contactRouteFrom(input, sourceUrl, phrase) {
  const direct = cleanText(pick(input, ['lead_evidence.public_contact_route', 'public_contact_route', 'contact_route']));
  if (/^(Listing Agent|Public Contact Form|FSBO Public Contact|Manual Lookup Needed)$/i.test(direct)) return direct;
  const contactText = [
    pick(input, ['listing_agent', 'agent_name', 'contact_name']),
    pick(input, ['phone', 'contact_phone', 'agent_phone', 'email', 'contact_email', 'agent_email'])
  ].map(cleanText).filter(Boolean).join(' ');
  if (contactText && /agent|listing/i.test(contactText)) return 'Listing Agent';
  if (/fsbo|for sale by owner/i.test(cleanText(phrase))) return 'FSBO Public Contact';
  if (/(realtor|redfin|zillow|har|fsbo|homes)\.com$/i.test(sourceDomain(sourceUrl))) return 'Public Contact Form';
  return 'Manual Lookup Needed';
}

function isCurrentOpportunity(evidence) {
  const status = cleanText(evidence && evidence.listing_status);
  const phrase = cleanText(evidence && evidence.exact_source_phrase);
  const text = `${status} ${phrase}`;
  if (EXCLUDED_RE.test(text)) return false;
  if (CLOSED_RE.test(text) && !CURRENT_RE.test(text)) return false;
  return !!(CURRENT_RE.test(text) || WHOLESALE_PHRASE_RE.test(phrase));
}

function normalizeLeadEvidence(input, overrides) {
  input = input || {};
  overrides = overrides || {};
  const sourceUrl = cleanText(overrides.canonical_source_url || sourceUrlFrom(input));
  const phrase = cleanText(overrides.exact_source_phrase || exactPhraseFrom(input));
  const sourceType = sourceUrl ? sourceEvidenceAdapter.classifySourceUrl(sourceUrl) : 'missing_source_url';
  const address = propertyIdentity.canonicalAddress(input, overrides);
  const contactRoute = cleanText(overrides.public_contact_route) || contactRouteFrom(input, sourceUrl, phrase);
  const evidence = {
    normalized_address: address,
    canonical_source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
    source_domain: sourceDomain(sourceUrl),
    source_checked_at: cleanText(overrides.source_checked_at || pick(input, ['lead_evidence.source_checked_at', 'source_checked_at', 'updated_at', 'created_at'])) || new Date().toISOString(),
    listing_status: cleanText(overrides.listing_status || listingStatusFrom(input)),
    asking_price: cleanText(overrides.asking_price || pick(input, ['lead_evidence.asking_price', 'asking_price', 'list_price', 'price', 'listing_price'])),
    beds: cleanText(overrides.beds || pick(input, ['lead_evidence.beds', 'beds', 'bedrooms'])),
    baths: cleanText(overrides.baths || pick(input, ['lead_evidence.baths', 'baths', 'bathrooms'])),
    sqft: cleanText(overrides.sqft || pick(input, ['lead_evidence.sqft', 'sqft', 'square_feet', 'living_area'])),
    year_built: cleanText(overrides.year_built || pick(input, ['lead_evidence.year_built', 'year_built', 'yearBuilt'])),
    exact_source_phrase: phrase,
    matched_criterion: cleanText(overrides.matched_criterion || matchedCriterionFrom(input, phrase)),
    public_contact_route: contactRoute,
    contact_verification_status: contactRoute === 'Manual Lookup Needed' ? 'Manual Verification Needed' : 'Public route from source; verify before dialing.',
    comp_status: cleanText(overrides.comp_status || compStatusFrom(input)),
    analyzer_job_id: cleanText(overrides.analyzer_job_id || pick(input, ['lead_evidence.analyzer_job_id', 'analyzer_job_id', 'job_id'])),
    dossier_id: cleanText(overrides.dossier_id || pick(input, ['lead_evidence.dossier_id', 'dossier_id'])),
    buyer_match_status: cleanText(overrides.buyer_match_status || pick(input, ['lead_evidence.buyer_match_status', 'buyer_match_status'])) || 'Not matched',
    discovery_batch_id: cleanText(overrides.discovery_batch_id || pick(input, ['lead_evidence.discovery_batch_id', 'discovery_batch_id'])),
    discovery_request_id: cleanText(overrides.discovery_request_id || pick(input, ['lead_evidence.discovery_request_id', 'discovery_request_id'])),
    first_discovered_at: cleanText(overrides.first_discovered_at || pick(input, ['lead_evidence.first_discovered_at', 'first_discovered_at', 'created_at'])),
    last_discovered_at: cleanText(overrides.last_discovered_at || pick(input, ['lead_evidence.last_discovered_at', 'last_discovered_at', 'updated_at'])),
    last_source_checked_at: cleanText(overrides.last_source_checked_at || pick(input, ['lead_evidence.last_source_checked_at', 'last_source_checked_at', 'source_checked_at'])),
    times_seen: Number(overrides.times_seen || pick(input, ['lead_evidence.times_seen', 'times_seen']) || 0) || 0,
    previously_seen: overrides.previously_seen === true || pick(input, ['lead_evidence.previously_seen', 'previously_seen']) === true,
    material_change_type: cleanText(overrides.material_change_type || pick(input, ['lead_evidence.material_change_type', 'material_change_type'])),
    material_change_details: cleanText(overrides.material_change_details || pick(input, ['lead_evidence.material_change_details', 'material_change_details'])),
    freshness_status: cleanText(overrides.freshness_status || pick(input, ['lead_evidence.freshness_status', 'freshness_status'])),
    rejection_reason: cleanText(overrides.rejection_reason || pick(input, ['lead_evidence.rejection_reason', 'rejection_reason'])),
    provider_attempts: Number(overrides.provider_attempts || pick(input, ['lead_evidence.provider_attempts', 'provider_attempts']) || 0) || 0,
    batch_status: cleanText(overrides.batch_status || pick(input, ['lead_evidence.batch_status', 'batch_status'])),
    missing_evidence: []
  };
  const missing = []
    .concat(Array.isArray(input.missing_evidence) ? input.missing_evidence : [])
    .concat(Array.isArray(input.lead_evidence && input.lead_evidence.missing_evidence) ? input.lead_evidence.missing_evidence : []);
  if (!evidence.normalized_address) missing.push('full address');
  if (!evidence.canonical_source_url || sourceType !== 'exact_property_record') missing.push('exact property-detail source URL');
  if (!evidence.exact_source_phrase) missing.push('exact source-backed wholesale phrase');
  if (!isCurrentOpportunity(evidence)) missing.push('current listing status');
  if (evidence.public_contact_route === 'Manual Lookup Needed') missing.push('public contact route');
  if (!evidence.asking_price) missing.push('asking price');
  if (!evidence.beds) missing.push('beds');
  if (!evidence.baths) missing.push('baths');
  if (!evidence.sqft) missing.push('sqft');
  if (!evidence.year_built) missing.push('year built');
  evidence.missing_evidence = Array.from(new Set(missing.map(cleanText).filter(Boolean)));
  return evidence;
}

function dealFinderGroup(evidence) {
  evidence = normalizeLeadEvidence(evidence);
  const exactSource = evidence.canonical_source_url && sourceEvidenceAdapter.classifySourceUrl(evidence.canonical_source_url) === 'exact_property_record';
  const valid = !!(evidence.normalized_address && exactSource && evidence.exact_source_phrase && isCurrentOpportunity(evidence));
  if (!valid) return 'Research / Reference';
  if (evidence.public_contact_route !== 'Manual Lookup Needed') return 'Strong Leads';
  return 'Valid Leads - Needs Comps';
}

module.exports = {
  WHOLESALE_PHRASE_RE,
  cleanText,
  isHttpUrl,
  sourceDomain,
  normalizeAddress,
  normalizeLeadEvidence,
  canonicalPropertyKey: propertyIdentity.canonicalPropertyKey,
  sameProperty: propertyIdentity.sameProperty,
  dealFinderGroup,
  isCurrentOpportunity
};
