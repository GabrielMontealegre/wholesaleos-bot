'use strict';

const crypto = require('crypto');

const leadEvidence = require('./lead-evidence');
const propertyIdentity = require('./property-identity');
const sourceEvidenceAdapter = require('./source-evidence-adapter');
const acquisitionScore = require('./source-acquisition-score');

const NEXT_BEST_WORKERS = acquisitionScore.NEXT_BEST_WORKERS;
const INLINE_COMPLETE_ADDRESS_RE = /^(.+?\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pkwy|parkway|pl|place|trl|trail|way|loop|ter|terrace|hwy|highway))\s*,?\s+([A-Za-z][A-Za-z .'-]*?)\s+(TX|Texas|[A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i;
const VISIBLE_PHRASE_RE = leadEvidence.WHOLESALE_PHRASE_RE;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
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

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(cleanText(value)).digest('hex').slice(0, 16)}`;
}

function bool(value) {
  return value === true || /^(true|1|yes)$/i.test(cleanText(value));
}

function textList(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map(cleanText).filter(Boolean)));
}

function inferOfficialSource(input, sourceUrl) {
  if (bool(input.official_source)) return true;
  const text = [
    sourceUrl,
    input.source_family,
    input.source_id,
    input.source_name,
    input.source_type
  ].map(cleanText).join(' ');
  return /\.gov\b|county|clerk|sheriff|tax|public works|probate|opendata|socrata/i.test(text);
}

function missingEvidenceFor(candidate) {
  const missing = [];
  if (!cleanText(candidate.normalized_address)) missing.push('canonical property address');
  if (!cleanText(candidate.source_url)) missing.push('source URL');
  if (!cleanText(candidate.motivation_phrase || candidate.motivation_evidence_text)) missing.push('motivation evidence');
  if (!cleanText(candidate.current_status || candidate.status_evidence_text)) missing.push('current status evidence');
  if (candidate.contact_confidence < 50) missing.push('contact route');
  return Array.from(new Set(missing));
}

function normalizePropertyCandidate(input, context) {
  input = input || {};
  context = context || {};
  const sourceUrl = cleanText(input.source_url || input.canonical_source_url || input.source_document_url);
  const rawAddressInput = cleanText(input.normalized_address || input.property_address || input.address);
  const sourceTextAddressSource = cleanText(input.source_proof_text || input.raw_text || input.source_excerpt || input.source_page_text || input.source_text);
  const sourceTextAddressMatch = sourceTextAddressSource.match(/(?:property\s+address|address)\s*:\s*([0-9][^|;]*?\b\d{5}(?:-\d{4})?)/i);
  const sourceTextAddressRaw = cleanText(sourceTextAddressMatch && sourceTextAddressMatch[1]);
  const sourceTextAddressParsed = sourceTextAddressRaw ? propertyIdentity.parseAddress(sourceTextAddressRaw) : null;
  const sourceTextAddress = sourceTextAddressParsed && sourceTextAddressParsed.full_address
    ? cleanText(sourceTextAddressParsed.full_address)
    : sourceTextAddressRaw;
  const trimmedAddressInput = propertyIdentity.isCompleteAddress(rawAddressInput)
    ? rawAddressInput
    : rawAddressInput.replace(/,\s*[A-Za-z .'-]+,\s*(?:TX|Texas|[A-Z]{2})\s+\d{5}(?:-\d{4})?$/i, '');
  const inlineCompleteMatch = trimmedAddressInput.match(INLINE_COMPLETE_ADDRESS_RE);
  const inlineCompleteAddress = inlineCompleteMatch
    ? `${cleanText(inlineCompleteMatch[1])}, ${cleanText(inlineCompleteMatch[2])}, ${cleanText(inlineCompleteMatch[3])} ${cleanText(inlineCompleteMatch[4])}`
    : '';
  const addressOverrides = {
    normalized_address: trimmedAddressInput || rawAddressInput,
    source_url: sourceUrl
  };
  const addressLooksComplete = propertyIdentity.isCompleteAddress(rawAddressInput) || INLINE_COMPLETE_ADDRESS_RE.test(rawAddressInput);
  if (!addressLooksComplete) {
    addressOverrides.city = cleanText(input.city || context.city);
    addressOverrides.state = cleanText(input.state || context.state);
    addressOverrides.zip = cleanText(input.zip || input.postal_code);
  }
  const address = sourceTextAddress || inlineCompleteAddress || propertyIdentity.canonicalAddress(input, {
    normalized_address: addressOverrides.normalized_address,
    source_url: sourceUrl,
    city: addressOverrides.city || '',
    state: addressOverrides.state || '',
    zip: addressOverrides.zip || ''
  });
  let normalizedAddress = cleanText(address);
  const zipMatch = cleanText(input.source_proof_text || input.raw_text || input.source_text || input.source_excerpt || input.source_page_text).match(/\b75[23]\d{2}\b/);
  if (zipMatch && !/\b\d{5}(?:-\d{4})?\b/.test(normalizedAddress)) {
    const city = cleanText(input.city || context.city || 'Dallas');
    const state = cleanText(input.state || context.state || 'TX');
    if (/\b(?:TX|Texas|[A-Z]{2})\b$/i.test(normalizedAddress)) {
      normalizedAddress = `${normalizedAddress} ${zipMatch[0]}`;
    } else if (city && state) {
      normalizedAddress = `${normalizedAddress}, ${city}, ${state} ${zipMatch[0]}`;
    } else {
      normalizedAddress = `${normalizedAddress} ${zipMatch[0]}`;
    }
  }
  const sourceType = cleanText(input.source_classification || sourceEvidenceAdapter.classifySourceUrl(sourceUrl));
  const officialSource = inferOfficialSource(input, sourceUrl);
  const base = {
    candidate_id: cleanText(input.candidate_id || input.id) || hashId('pcd', [
      context.acquisition_run_id,
      input.source_id,
      address,
      sourceUrl,
      input.source_row_reference
    ].join('|')),
    acquisition_run_id: cleanText(context.acquisition_run_id || input.acquisition_run_id),
    candidate_origin: cleanText(input.candidate_origin || input.origin || 'acquisition_core'),
    source_family: cleanText(input.source_family || input.category_key || input.source_kind || 'unknown'),
    source_id: cleanText(input.source_id),
    source_name: cleanText(input.source_name),
    source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
    source_domain: sourceDomain(sourceUrl),
    source_document_url: cleanText(input.source_document_url),
    source_row_reference: cleanText(input.source_row_reference || input.row_reference || input.case_number || input.parcel_or_account),
    source_type: cleanText(input.source_type),
    source_classification: sourceType,
    official_source: officialSource,
    source_text: cleanText(input.source_text || input.source_excerpt || input.source_page_text || input.source_proof_text || input.motivation_evidence_text),
    source_excerpt: cleanText(input.source_excerpt || input.source_text || input.source_proof_text),
    source_page_text: cleanText(input.source_page_text || input.source_text || input.source_proof_text),
    source_proof_text: cleanText(input.source_proof_text || input.source_excerpt || input.source_text || input.source_page_text),
    normalized_address: normalizedAddress,
    // Preserve the source-visible address and county verbatim so partial
    // (zip-less) identities and county labels survive normalization.
    property_address: cleanText(input.property_address || input.address),
    raw_address_text: cleanText(input.raw_address_text || input.property_address || input.address),
    source_structured_address_verified: input.source_structured_address_verified === true,
    county: cleanText(input.county),
    city: cleanText(input.city),
    state: cleanText(input.state),
    property_key: propertyIdentity.canonicalPropertyKey(Object.assign({}, input, { normalized_address: normalizedAddress, source_url: sourceUrl })),
    owner_name_candidate: cleanText(input.owner_name_candidate || input.owner_name || input.owner),
    motivation_type: cleanText(input.motivation_type || input.source_family || input.category_key),
    motivation_phrase: cleanText(input.motivation_phrase || input.exact_source_phrase || input.matched_source_phrase || input.source_excerpt || input.source_text),
    motivation_evidence_text: cleanText(input.motivation_evidence_text || input.source_excerpt || input.source_text || input.source_page_text || input.source_proof_text || input.description || input.snippet),
    current_status: cleanText(input.current_status || input.listing_status || input.status),
    status_evidence_text: cleanText(input.status_evidence_text || input.status_source_text || input.current_status || input.listing_status),
    event_date: cleanText(input.event_date || input.sale_date || input.auction_date),
    sale_date: cleanText(input.sale_date),
    foreclosure_type: cleanText(input.foreclosure_type),
    filing_period: cleanText(input.filing_period),
    filing_period_evidence_text: cleanText(input.filing_period_evidence_text),
    listing_date_if_visible: cleanText(input.listing_date_if_visible),
    offer_deadline_if_visible: cleanText(input.offer_deadline_if_visible),
    auction_closing_at_if_visible: cleanText(input.auction_closing_at_if_visible),
    amount_or_judgment: cleanText(input.amount_or_judgment || input.judgment_amount || input.tax_amount),
    parcel_or_account: cleanText(input.parcel_or_account || input.parcel_id || input.apn || input.account_number),
    contact_route: cleanText(input.contact_route || input.public_contact_route) || 'Manual Lookup Needed',
    contact_role: cleanText(input.contact_role),
    contact_name: cleanText(input.contact_name || input.agent_name || input.listing_agent),
    contact_phone: cleanText(input.contact_phone || input.phone),
    contact_email: cleanText(input.contact_email || input.email),
    contact_source_url: cleanText(input.contact_source_url || input.source_url || input.canonical_source_url),
    contact_evidence_text: cleanText(input.contact_evidence_text || input.contact_source_text),
    contact_verification_status: cleanText(input.contact_verification_status),
    contact_verified: input.contact_verified === true,
    status_verified_visible: input.status_verified_visible === true,
    risk_flags: textList(input.risk_flags),
    asking_price: cleanText(input.asking_price || input.list_price || input.price),
    listed_price: cleanText(input.listed_price),
    listed_price_evidence_text: cleanText(input.listed_price_evidence_text),
    delinquent_redemption_amount: cleanText(input.delinquent_redemption_amount),
    delinquent_redemption_amount_evidence_text: cleanText(input.delinquent_redemption_amount_evidence_text),
    minimum_bid: cleanText(input.minimum_bid),
    minimum_bid_evidence_text: cleanText(input.minimum_bid_evidence_text),
    nsb_number: cleanText(input.nsb_number),
    improvement_flag: cleanText(input.improvement_flag),
    program: cleanText(input.program),
    property_kind_if_visible: cleanText(input.property_kind_if_visible),
    vacant_lot_if_visible: input.vacant_lot_if_visible === true ? true : input.vacant_lot_if_visible === false ? false : null,
    beds: cleanText(input.beds || input.bedrooms),
    baths: cleanText(input.baths || input.bathrooms),
    sqft: cleanText(input.sqft || input.square_feet),
    year_built: cleanText(input.year_built || input.yearBuilt),
    retrieved_at: cleanText(input.retrieved_at || input.source_checked_at) || nowIso(),
    preview_only: true,
    should_ingest: false,
    not_a_saved_lead: true
  };
  const scores = acquisitionScore.scoreCandidate(Object.assign({}, input, base));
  const nextBestWorker = acquisitionScore.routeNextBestWorker(Object.assign({}, input, base), scores);
  const leadEvidencePayload = leadEvidence.normalizeLeadEvidence(Object.assign({}, input, base, {
    address: base.normalized_address,
    source_url: base.source_url,
    exact_source_phrase: base.motivation_phrase,
    exact_source_phrase_verbatim: VISIBLE_PHRASE_RE.test(cleanText(base.source_proof_text || base.motivation_evidence_text || input.source_excerpt || input.source_text)),
    listing_status: base.current_status || base.status_evidence_text,
    public_contact_route: base.contact_route
  }), {
    normalized_address: base.normalized_address,
    canonical_source_url: base.source_url,
    exact_source_phrase: base.motivation_phrase,
    exact_source_phrase_verbatim: VISIBLE_PHRASE_RE.test(cleanText(base.source_proof_text || base.motivation_evidence_text || input.source_excerpt || input.source_text)),
    exact_source_phrase_source_url: base.source_url,
    exact_source_phrase_source_type: base.motivation_phrase ? 'source_acquisition_visible_evidence' : '',
    listing_status: base.current_status || base.status_evidence_text,
    public_contact_route: base.contact_route,
    source_checked_at: base.retrieved_at,
    comp_status: cleanText(input.comp_status || 'Needs Comps')
  });
  if (cleanText(leadEvidencePayload.exact_source_phrase) &&
      leadEvidencePayload.exact_source_phrase_verbatim === true &&
      !cleanText(leadEvidencePayload.exact_source_phrase_source_type)) {
    leadEvidencePayload.exact_source_phrase_source_type = 'source_acquisition_visible_evidence';
  }
  const candidate = Object.assign({}, base, scores, {
    confidence_bucket: acquisitionScore.confidenceBucket(scores),
    next_best_worker: nextBestWorker,
    lead_evidence: leadEvidencePayload
  });
  candidate.missing_evidence = Array.from(new Set([]
    .concat(input.missing_evidence || [])
    .concat(missingEvidenceFor(candidate))
    .concat(leadEvidencePayload.missing_evidence || [])
    .map(cleanText)
    .filter(Boolean)));
  return candidate;
}

function candidateToFindMeCard(candidate, context) {
  candidate = normalizePropertyCandidate(candidate || {}, context || {});
  const sourceUrl = cleanText(candidate.source_url);
  const phrase = cleanText(candidate.motivation_phrase);
  const status = candidate.confidence_bucket === 'blocked'
    ? 'Needs Source Proof'
    : candidate.identity_confidence < 60
      ? 'Needs Address Repair'
      : 'Research Ready';
  return {
    card_id: hashId('fmc', `source_acquisition|${candidate.candidate_id}|${candidate.property_key}|${sourceUrl}`),
    source_kind: 'source_acquisition_core',
    created_from: 'Source Acquisition Core',
    candidate_id: candidate.candidate_id,
    acquisition_run_id: candidate.acquisition_run_id,
    candidate_origin: candidate.candidate_origin,
    source_family: candidate.source_family,
    source_id: candidate.source_id,
    official_source: candidate.official_source,
    address_or_source_text: candidate.normalized_address || candidate.source_row_reference || 'Source candidate needs review',
    display_address: candidate.normalized_address,
    source_url: sourceUrl,
    canonical_source_url: sourceUrl,
    source_title: candidate.source_name || candidate.source_row_reference || candidate.normalized_address,
    source_domain: candidate.source_domain,
    source_row_reference: candidate.source_row_reference,
    lead_source_type: candidate.source_family || candidate.source_type,
    source_classification: candidate.source_classification,
    source_quality: candidate.official_source ? 'Official/public source candidate' : 'Public source candidate',
    property_specific_source: /exact_property_record|official_property_notice|official_source_record|property_specific/i.test(candidate.source_classification),
    exact_source_phrase: phrase,
    matched_source_phrase: phrase,
    exact_source_phrase_source_url: phrase ? sourceUrl : '',
    exact_source_phrase_source_type: phrase ? 'source_acquisition_visible_evidence' : '',
    exact_source_phrase_checked_at: candidate.retrieved_at,
    exact_source_phrase_verbatim: !!(phrase && candidate.lead_evidence && candidate.lead_evidence.exact_source_phrase_verbatim === true),
    listing_status: candidate.current_status || candidate.status_evidence_text,
    public_contact_route: candidate.contact_route,
    contact_role: candidate.contact_role,
    contact_name: candidate.contact_name,
    contact_phone: candidate.contact_phone,
    contact_email: candidate.contact_email,
    contact_source_url: candidate.contact_source_url,
    contact_evidence_text: candidate.contact_evidence_text,
    contact_verification_status: candidate.contact_verification_status || (candidate.contact_verified ? 'verified_visible_source' : 'Manual Verification Needed'),
    contact_verified: candidate.contact_verified === true,
    risk_flags: candidate.risk_flags,
    asking_price: candidate.asking_price,
    listed_price: candidate.listed_price,
    listed_price_evidence_text: candidate.listed_price_evidence_text,
    delinquent_redemption_amount: candidate.delinquent_redemption_amount,
    delinquent_redemption_amount_evidence_text: candidate.delinquent_redemption_amount_evidence_text,
    minimum_bid: candidate.minimum_bid,
    minimum_bid_evidence_text: candidate.minimum_bid_evidence_text,
    nsb_number: candidate.nsb_number,
    improvement_flag: candidate.improvement_flag,
    program: candidate.program,
    property_kind_if_visible: candidate.property_kind_if_visible,
    vacant_lot_if_visible: candidate.vacant_lot_if_visible,
    foreclosure_type: candidate.foreclosure_type,
    filing_period: candidate.filing_period,
    filing_period_evidence_text: candidate.filing_period_evidence_text,
    sale_date_or_event_date: candidate.event_date,
    listing_date_if_visible: candidate.listing_date_if_visible,
    offer_deadline_if_visible: candidate.offer_deadline_if_visible,
    auction_closing_at_if_visible: candidate.auction_closing_at_if_visible,
    source_structured_address_verified: candidate.source_structured_address_verified === true,
    beds: candidate.beds,
    baths: candidate.baths,
    sqft: candidate.sqft,
    year_built: candidate.year_built,
    distress_motivation_signals: [candidate.motivation_type, candidate.motivation_phrase].map(cleanText).filter(Boolean),
    why_this_might_be_a_deal: candidate.motivation_evidence_text || candidate.motivation_phrase || 'Source candidate needs motivation review.',
    missing_evidence: candidate.missing_evidence,
    confidence_level: candidate.confidence_bucket,
    source_confidence: candidate.source_confidence,
    motivation_confidence: candidate.motivation_confidence,
    identity_confidence: candidate.identity_confidence,
    contact_confidence: candidate.contact_confidence,
    next_best_worker: candidate.next_best_worker,
    next_best_action: candidate.next_best_worker === NEXT_BEST_WORKERS.SKIP_TRACE
      ? 'Find contact route after source and property identity are verified.'
      : candidate.next_best_worker === NEXT_BEST_WORKERS.PIPELINE
        ? 'Send selected candidate to Daily Call Pipeline.'
        : candidate.next_best_worker === NEXT_BEST_WORKERS.PROPERTY_INTELLIGENCE
          ? 'Repair property identity before outreach.'
          : 'Review source evidence before promotion.',
    status,
    pipeline_status: 'New',
    can_send_to_analyzer: candidate.source_confidence >= 60 && candidate.identity_confidence >= 60,
    lead_evidence: candidate.lead_evidence,
    preview_only: true,
    should_ingest: false,
    not_a_saved_lead: true,
    property_candidate: candidate
  };
}

module.exports = {
  NEXT_BEST_WORKERS,
  normalizePropertyCandidate,
  candidateToFindMeCard
};
