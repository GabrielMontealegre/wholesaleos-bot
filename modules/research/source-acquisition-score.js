'use strict';

const NEXT_BEST_WORKERS = Object.freeze({
  NONE: 'NONE',
  PROPERTY_INTELLIGENCE: 'PROPERTY_INTELLIGENCE',
  SKIP_TRACE: 'SKIP_TRACE',
  COMP_HUNTER: 'COMP_HUNTER',
  OFFER_ENGINE: 'OFFER_ENGINE',
  PIPELINE: 'PIPELINE',
  MANUAL_REVIEW: 'MANUAL_REVIEW'
});

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function bool(value) {
  return value === true || /^(true|1|yes)$/i.test(cleanText(value));
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function sourceConfidenceFor(input) {
  const sourceUrl = cleanText(input.source_url || input.canonical_source_url || input.source_document_url);
  const sourceType = cleanText(input.source_type || input.source_classification);
  const official = bool(input.official_source);
  if (!sourceUrl) return official ? 45 : 20;
  if (/exact_property_record|official_property_notice|official_source_record|property_specific/i.test(sourceType)) return official ? 95 : 88;
  if (official) return 82;
  if (isHttpUrl(sourceUrl)) return 62;
  return 30;
}

function identityConfidenceFor(input) {
  const address = cleanText(input.normalized_address || input.property_address || input.address);
  const parcel = cleanText(input.parcel_or_account || input.parcel_id || input.apn || input.account_number);
  if (/\b\d{1,7}\b/.test(address) && /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b/i.test(address)) return 92;
  if (address) return 55;
  if (parcel) return 48;
  return 10;
}

function motivationConfidenceFor(input) {
  const family = cleanText(input.source_family || input.motivation_type || input.category_key);
  const phrase = cleanText(input.motivation_phrase || input.exact_source_phrase || input.motivation_evidence_text);
  const official = bool(input.official_source);
  if (phrase && official) return 92;
  if (phrase) return 82;
  if (/foreclosure|trustee|tax_resale|tax_foreclosure|tax_delinquent|probate|fsbo/i.test(family)) return 70;
  if (/code_violation|vacant|auction/i.test(family)) return 52;
  return 20;
}

function contactConfidenceFor(input) {
  const route = cleanText(input.contact_route || input.public_contact_route);
  const phone = cleanText(input.contact_phone || input.phone);
  const email = cleanText(input.contact_email || input.email);
  if (phone || email) return 92;
  if (/FSBO|seller/i.test(route)) return 82;
  if (/Public Contact Form|Listing Agent|agent|contact/i.test(route)) return 72;
  if (route && !/Manual Lookup Needed/i.test(route)) return 58;
  return 15;
}

function scoreCandidate(input) {
  input = input || {};
  return {
    source_confidence: clampScore(input.source_confidence || sourceConfidenceFor(input)),
    motivation_confidence: clampScore(input.motivation_confidence || motivationConfidenceFor(input)),
    identity_confidence: clampScore(input.identity_confidence || identityConfidenceFor(input)),
    contact_confidence: clampScore(input.contact_confidence || contactConfidenceFor(input))
  };
}

function routeNextBestWorker(input, scores) {
  input = input || {};
  scores = scores || scoreCandidate(input);
  if (cleanText(input.next_best_worker) && NEXT_BEST_WORKERS[cleanText(input.next_best_worker)]) {
    return cleanText(input.next_best_worker);
  }
  if (scores.identity_confidence < 60) return NEXT_BEST_WORKERS.PROPERTY_INTELLIGENCE;
  if (scores.source_confidence < 60 || scores.motivation_confidence < 50) return NEXT_BEST_WORKERS.MANUAL_REVIEW;
  if (scores.contact_confidence < 50) return NEXT_BEST_WORKERS.SKIP_TRACE;
  if (input.ready_for_offer === true) return NEXT_BEST_WORKERS.OFFER_ENGINE;
  if (input.ready_for_comp_hunter === true) return NEXT_BEST_WORKERS.COMP_HUNTER;
  if (input.ready_for_pipeline === false) return NEXT_BEST_WORKERS.NONE;
  return NEXT_BEST_WORKERS.PIPELINE;
}

function confidenceBucket(scores) {
  scores = scores || {};
  const min = Math.min(
    Number(scores.source_confidence || 0) || 0,
    Number(scores.motivation_confidence || 0) || 0,
    Number(scores.identity_confidence || 0) || 0
  );
  const contact = Number(scores.contact_confidence || 0) || 0;
  if (min >= 80 && contact >= 50) return 'callable_candidate';
  if (min >= 70) return 'needs_contact_or_comps';
  if (min >= 50) return 'manual_research';
  return 'blocked';
}

module.exports = {
  NEXT_BEST_WORKERS,
  scoreCandidate,
  routeNextBestWorker,
  confidenceBucket,
  clampScore
};
