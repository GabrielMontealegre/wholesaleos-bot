'use strict';

const crypto = require('crypto');

const compResearchProvider = require('./comp-research-provider');
const leadEvidence = require('./lead-evidence');
const propertyCandidate = require('./property-candidate');
const propertyIdentity = require('./property-identity');
const searchSnippetEvidence = require('./search-snippet-evidence');
const sourceEvidenceAdapter = require('./source-evidence-adapter');

const PACKET_STATUSES = Object.freeze({
  CALL_READY: 'CALL_READY',
  OUTREACH_READY: 'OUTREACH_READY',
  CONTACT_LOOKUP: 'CONTACT_LOOKUP',
  RESEARCH_ONLY: 'RESEARCH_ONLY',
  BLOCKED: 'BLOCKED'
});

const LOCK_STATES = Object.freeze({
  ARV_LOCKED_NO_VERIFIED_COMPS: 'ARV_LOCKED_NO_VERIFIED_COMPS',
  MAO_LOCKED_NO_ARV: 'MAO_LOCKED_NO_ARV',
  MAO_LOCKED_NO_REPAIR_EVIDENCE: 'MAO_LOCKED_NO_REPAIR_EVIDENCE',
  OFFER_LOCKED_NO_CONTACT: 'OFFER_LOCKED_NO_CONTACT',
  OFFER_LOCKED_NO_MAO: 'OFFER_LOCKED_NO_MAO',
  CALL_LOCKED_NO_CONTACT: 'CALL_LOCKED_NO_CONTACT',
  CALL_ALLOWED_WITH_MISSING_COMPS: 'CALL_ALLOWED_WITH_MISSING_COMPS',
  COMP_REQUIRED_BEFORE_OFFER: 'COMP_REQUIRED_BEFORE_OFFER'
});

function cleanText(value) {
  return leadEvidence.cleanText(value);
}

function numberValue(value) {
  const number = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function uniqueText(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(cleanText(value)).digest('hex').slice(0, 16)}`;
}

function phoneDigits(value) {
  return cleanText(value).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
}

function sourceBackedContact(input) {
  input = input || {};
  const route = cleanText(input.contact_route || input.public_contact_route);
  const phone = cleanText(input.contact_phone || input.phone);
  const email = cleanText(input.contact_email || input.email).toLowerCase();
  const sourceUrl = cleanText(input.contact_source_url || input.source_url || input.canonical_source_url);
  const evidenceText = cleanText(input.contact_evidence_text || input.contact_source_text);
  const verification = cleanText(input.contact_verification_status);
  const provenancePresent = leadEvidence.isHttpUrl(sourceUrl) && !!evidenceText;
  const declaredVerified = input.contact_verified === true || /verified_visible_source|source_verified/i.test(verification);
  const normalizedEvidence = evidenceText.toLowerCase();
  const phoneVerified = !!(phone && provenancePresent && declaredVerified &&
    phoneDigits(phone).length === 10 && phoneDigits(normalizedEvidence).includes(phoneDigits(phone)));
  const emailVerified = !!(email && provenancePresent && declaredVerified && normalizedEvidence.includes(email));
  const formVerified = !!(provenancePresent && declaredVerified &&
    /public reply|public contact form|contact seller|contact owner|send message|email seller/i.test(`${route} ${evidenceText}`));
  let routeType = 'NONE';
  if (phoneVerified) routeType = 'DIRECT_PHONE';
  else if (emailVerified) routeType = 'DIRECT_EMAIL';
  else if (formVerified && /reply/i.test(`${route} ${evidenceText}`)) routeType = 'PUBLIC_REPLY';
  else if (formVerified) routeType = 'PUBLIC_FORM';
  return {
    route_type: routeType,
    route_label: route || (phoneVerified ? 'Direct Phone' : emailVerified ? 'Direct Email' : formVerified ? 'Public Contact Form' : 'Manual Lookup Needed'),
    role: cleanText(input.contact_role),
    name: cleanText(input.contact_name || input.owner_name_candidate),
    phone: phoneVerified ? phone : '',
    email: emailVerified ? email : '',
    contact_url: routeType === 'NONE' ? '' : sourceUrl,
    evidence_text: routeType === 'NONE' ? '' : evidenceText,
    source_url: routeType === 'NONE' ? '' : sourceUrl,
    confidence: routeType === 'NONE' ? 0 : Number(input.contact_confidence || 92) || 92,
    verified: routeType !== 'NONE',
    call_allowed: phoneVerified,
    outreach_allowed: phoneVerified || emailVerified || formVerified,
    verification_status: routeType === 'NONE' ? 'not_verified' : 'verified_visible_source'
  };
}

function packetQuestions(script) {
  script = script || {};
  return uniqueText([]
    .concat(script.motivation_questions || [])
    .concat(script.condition_questions || [])
    .concat(script.timeline_questions || [])
    .concat(script.price_questions || [])
    .concat(script.source_confirmation_questions || [])
    .concat(script.role_specific_questions || []))
    .slice(0, 5);
}

function emptyCallScript() {
  return {
    why_calling: '',
    opening: '',
    motivation_questions: [],
    condition_questions: [],
    timeline_questions: [],
    price_questions: [],
    source_confirmation_questions: [],
    role_specific_questions: []
  };
}

function propertySpecificSource(input, sourceUrl) {
  const classification = cleanText(input.source_classification || input.source_type);
  const classifiedUrl = sourceEvidenceAdapter.classifySourceUrl(sourceUrl);
  if (classifiedUrl === 'exact_property_record') return true;
  if (input.official_source === true && /official_property_notice|official_source_record|property_specific/i.test(classification)) return true;
  return searchSnippetEvidence.isPropertySpecificSearchUrl(
    sourceUrl,
    cleanText(input.source_title),
    cleanText(input.source_excerpt || input.source_text || input.source_proof_text)
  );
}

function buildCompState(input, candidate) {
  const job = {
    job_id: cleanText(input.analyzer_job_id || candidate.analyzer_job_id || candidate.candidate_id),
    normalized_address: candidate.normalized_address,
    source_url: candidate.source_url,
    repair_estimate: numberValue(input.repair_estimate || input.repairs || input.manual_repair_estimate),
    lead_evidence: candidate.lead_evidence
  };
  return compResearchProvider.canonicalizeCompResearchState(job, {
    candidates: Array.isArray(input.comp_candidates) ? input.comp_candidates : [],
    verified_sold_comps: Array.isArray(input.verified_sold_comps) ? input.verified_sold_comps : [],
    subject_sale_evidence: Array.isArray(input.subject_sale_evidence) ? input.subject_sale_evidence : [],
    candidate_sold_comps: Array.isArray(input.candidate_sold_comps) ? input.candidate_sold_comps : [],
    market_support: Array.isArray(input.market_support) ? input.market_support : [],
    not_usable_comp_results: Array.isArray(input.not_usable_comp_results) ? input.not_usable_comp_results : []
  });
}

function buildCallReadyDealPacket(input, options = {}) {
  input = input || {};
  const candidate = propertyCandidate.normalizePropertyCandidate(input, options.context || {});
  const sourceUrl = cleanText(candidate.source_url);
  const evidence = candidate.lead_evidence || {};
  const sourceClassification = cleanText(candidate.source_classification || sourceEvidenceAdapter.classifySourceUrl(sourceUrl));
  const propertySpecific = !!(sourceUrl && propertySpecificSource(candidate, sourceUrl));
  const identityReady = propertyIdentity.isCompleteAddress(candidate.normalized_address);
  const sourceReady = propertySpecific && identityReady;
  const motivationReady = !!(
    cleanText(evidence.exact_source_phrase) &&
    evidence.exact_source_phrase_verbatim === true &&
    cleanText(evidence.exact_source_phrase_source_url || sourceUrl)
  );
  const statusReady = !!(
    (input.status_verified_visible === true || candidate.status_verified_visible === true) &&
    cleanText(candidate.current_status || candidate.status_evidence_text) &&
    leadEvidence.isCurrentOpportunity(evidence)
  );
  const contact = sourceBackedContact(candidate);
  const compState = buildCompState(input, candidate);
  const verifiedCompCount = Number(compState.verified_comp_count || 0) || 0;
  const arvReady = verifiedCompCount >= 3 && !!compState.arv_range;
  const repairAmount = numberValue(input.repair_estimate || input.repairs || input.manual_repair_estimate);
  const maoReady = arvReady && repairAmount > 0 && !!compState.mao_range;

  let dossier = {
    dossier_id: '',
    address: candidate.normalized_address,
    call_script: emptyCallScript(),
    preview_only: true,
    should_ingest: false
  };
  if (identityReady) {
    const dealCallDossiers = require('./deal-call-dossiers');
    dossier = dealCallDossiers.buildDossier({
      address: candidate.normalized_address,
      source_url: sourceUrl,
      source_title: candidate.source_name || candidate.normalized_address,
      source_page_text: candidate.source_proof_text || candidate.source_text || candidate.source_excerpt,
      exact_source_phrase: cleanText(evidence.exact_source_phrase),
      listing_status: candidate.current_status || candidate.status_evidence_text,
      asking_price: candidate.asking_price,
      beds: candidate.beds,
      baths: candidate.baths,
      sqft: candidate.sqft,
      year_built: candidate.year_built,
      public_contact_route: contact.route_label,
      lead_evidence: evidence
    });
  }

  let packetStatus = PACKET_STATUSES.BLOCKED;
  if (sourceReady && motivationReady && statusReady && contact.call_allowed) packetStatus = PACKET_STATUSES.CALL_READY;
  else if (sourceReady && motivationReady && statusReady && contact.outreach_allowed) packetStatus = PACKET_STATUSES.OUTREACH_READY;
  else if (sourceReady && motivationReady && statusReady) packetStatus = PACKET_STATUSES.CONTACT_LOOKUP;
  else if (sourceUrl || candidate.normalized_address) packetStatus = PACKET_STATUSES.RESEARCH_ONLY;

  const locks = [];
  if (!arvReady) locks.push(LOCK_STATES.ARV_LOCKED_NO_VERIFIED_COMPS);
  if (!arvReady) locks.push(LOCK_STATES.MAO_LOCKED_NO_ARV);
  else if (!repairAmount) locks.push(LOCK_STATES.MAO_LOCKED_NO_REPAIR_EVIDENCE);
  if (!contact.outreach_allowed) locks.push(LOCK_STATES.OFFER_LOCKED_NO_CONTACT);
  if (!maoReady) locks.push(LOCK_STATES.OFFER_LOCKED_NO_MAO);
  if (!contact.call_allowed) locks.push(LOCK_STATES.CALL_LOCKED_NO_CONTACT);
  if (contact.call_allowed && !arvReady) locks.push(LOCK_STATES.CALL_ALLOWED_WITH_MISSING_COMPS);
  if (!arvReady) locks.push(LOCK_STATES.COMP_REQUIRED_BEFORE_OFFER);

  const missingEvidence = uniqueText([]
    .concat(candidate.missing_evidence || [])
    .concat(!propertySpecific ? ['property-specific source proof'] : [])
    .concat(!identityReady ? ['complete canonical address'] : [])
    .concat(!motivationReady ? ['verbatim source-backed motivation'] : [])
    .concat(!statusReady ? ['visible current status evidence'] : [])
    .concat(!contact.outreach_allowed ? ['verified public contact route'] : [])
    .concat(!arvReady ? ['3 verified different sold comps'] : [])
    .concat(!repairAmount ? ['repair evidence or manual repair estimate'] : []));
  const riskFlags = uniqueText([]
    .concat(candidate.risk_flags || [])
    .concat(!propertySpecific ? ['SOURCE_PROOF_INCOMPLETE'] : [])
    .concat(!identityReady ? ['PROPERTY_IDENTITY_INCOMPLETE'] : [])
    .concat(!motivationReady ? ['MOTIVATION_NOT_VERBATIM'] : [])
    .concat(!statusReady ? ['CURRENT_STATUS_NOT_VERIFIED'] : [])
    .concat(!contact.call_allowed && contact.outreach_allowed ? ['OUTREACH_ROUTE_ONLY_NO_PHONE'] : [])
    .concat(!contact.outreach_allowed ? ['CONTACT_NOT_VERIFIED'] : [])
    .concat(!arvReady ? ['ARV_LOCKED'] : [])
    .concat(!repairAmount ? ['REPAIRS_LOCKED'] : [])
    .concat(!maoReady ? ['MAO_LOCKED'] : []));
  const packetId = hashId('crdp', [
    candidate.property_key,
    sourceUrl,
    contact.route_type,
    contact.phone,
    contact.email
  ].join('|'));
  const nextBestWorker = packetStatus === PACKET_STATUSES.CALL_READY || packetStatus === PACKET_STATUSES.OUTREACH_READY
    ? 'PIPELINE'
    : packetStatus === PACKET_STATUSES.CONTACT_LOOKUP
      ? 'SKIP_TRACE'
      : cleanText(candidate.next_best_worker) || 'MANUAL_REVIEW';

  return {
    packet_id: packetId,
    packet_version: 1,
    generated_at: new Date().toISOString(),
    packet_status: packetStatus,
    property: {
      property_key: candidate.property_key,
      normalized_address: candidate.normalized_address,
      source_url: sourceUrl,
      source_domain: candidate.source_domain,
      source_classification: sourceClassification,
      identity_confidence: candidate.identity_confidence
    },
    source_evidence: {
      source_url: sourceUrl,
      source_type: candidate.source_type || candidate.source_family,
      source_checked_at: candidate.retrieved_at,
      property_specific: propertySpecific,
      identity_ready: identityReady,
      source_ready: sourceReady,
      evidence_text: candidate.source_proof_text || candidate.source_excerpt || candidate.source_text
    },
    motivation_evidence: {
      type: candidate.motivation_type,
      exact_phrase: cleanText(evidence.exact_source_phrase),
      verbatim: evidence.exact_source_phrase_verbatim === true,
      source_url: cleanText(evidence.exact_source_phrase_source_url || sourceUrl),
      confidence: candidate.motivation_confidence
    },
    current_status: {
      value: cleanText(candidate.current_status || candidate.status_evidence_text),
      evidence_text: cleanText(candidate.status_evidence_text),
      verified_visible_source: statusReady
    },
    contact,
    property_facts: {
      asking_price: candidate.asking_price,
      beds: candidate.beds,
      baths: candidate.baths,
      sqft: candidate.sqft,
      year_built: candidate.year_built,
      source_url: sourceUrl
    },
    comps: {
      status: arvReady ? 'VERIFIED_COMPS_READY' : 'COMP_REQUIRED_BEFORE_OFFER',
      verified_sold_comps: compState.verified_sold_comps,
      subject_sale_evidence: compState.subject_sale_evidence,
      candidate_sold_comps: compState.candidate_sold_comps,
      market_support: compState.market_support,
      not_usable: compState.not_usable_comp_results,
      verified_count: verifiedCompCount
    },
    arv: {
      status: arvReady ? 'PRELIMINARY_ARV_AVAILABLE' : LOCK_STATES.ARV_LOCKED_NO_VERIFIED_COMPS,
      range: arvReady ? compState.arv_range : null,
      basis: arvReady ? '3+ canonical verified sold comps' : '',
      missing_evidence: arvReady ? [] : ['3 verified different sold comps']
    },
    repairs: {
      status: repairAmount > 0 ? 'MANUAL_OR_SOURCE_REPAIR_EVIDENCE' : 'REPAIR_LOCKED_NO_EVIDENCE',
      amount: repairAmount > 0 ? repairAmount : null,
      assumption_only: false,
      basis: repairAmount > 0 ? 'Explicit source or manual repair input' : ''
    },
    mao: {
      status: maoReady ? 'DRAFT_MAO_AVAILABLE' : !arvReady ? LOCK_STATES.MAO_LOCKED_NO_ARV : LOCK_STATES.MAO_LOCKED_NO_REPAIR_EVIDENCE,
      range: maoReady ? compState.mao_range : null,
      basis: maoReady ? cleanText(compState.mao_range.basis) : '',
      missing_evidence: maoReady ? [] : !arvReady ? ['preliminary ARV'] : ['repair evidence or manual repair estimate']
    },
    offer_recommendation: {
      status: contact.outreach_allowed && maoReady ? 'REVIEW_REQUIRED' : !contact.outreach_allowed ? LOCK_STATES.OFFER_LOCKED_NO_CONTACT : LOCK_STATES.OFFER_LOCKED_NO_MAO,
      maximum_contract_price_range: contact.outreach_allowed && maoReady ? {
        low: compState.mao_range.low,
        high: compState.mao_range.high
      } : null,
      basis: contact.outreach_allowed && maoReady ? 'Canonical draft MAO; operator review required before offer.' : '',
      assumptions: []
    },
    confidence_scores: {
      source: candidate.source_confidence,
      motivation: candidate.motivation_confidence,
      identity: candidate.identity_confidence,
      contact: contact.confidence,
      comp: Math.min(100, verifiedCompCount * 33)
    },
    risk_flags: riskFlags,
    lock_states: uniqueText(locks),
    call_script: dossier.call_script,
    questions_to_ask_seller: packetQuestions(dossier.call_script),
    missing_evidence: missingEvidence,
    next_best_worker: nextBestWorker,
    post_contact_worker: arvReady ? 'NONE' : 'COMP_HUNTER',
    dossier_preview: dossier,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  PACKET_STATUSES,
  LOCK_STATES,
  sourceBackedContact,
  buildCallReadyDealPacket
};
