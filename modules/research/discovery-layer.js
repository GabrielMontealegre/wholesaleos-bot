'use strict';

const propertyAddressEvidence = require('./property-address-evidence');
const addressDerivedResearchLinks = require('./address-derived-research-links');
const propertyIdentity = require('./property-identity');
const leadLifecycleStatus = require('./lead-lifecycle-status');
const marketCompPolicy = require('./market-comp-policy');

const SELLER_FIELDS = Object.freeze([
  'current_payoff', 'months_behind', 'other_liens_known_to_owner', 'condition_detail',
  'repairs_needed', 'motivation', 'urgency', 'timeline', 'decision_makers',
  'occupancy_plan', 'willing_to_consider_terms', 'price_expectation',
  'what_they_need_to_walk_away'
]);

const QUESTIONS = Object.freeze({
  motivation: ['Why are you looking to sell?', 'Learn the seller\'s own reason, without assuming one.', 'Their own explanation of what changed.', 'Why not just list it with an agent?'],
  condition_detail: ['Starting at the front door, walk me through the property. What do you see?', 'Understand condition in the seller\'s words.', 'A room-by-room description.', 'What have you noticed about the roof, heating, plumbing or foundation?'],
  repairs_needed: ['What work do you think the property needs?', 'Separate visible work from unknown work.', 'Specific repairs they have noticed.', 'Have you had anyone look at those issues?'],
  timeline: ['Are you trying to make a decision in the next few months?', 'Learn their actual timeframe.', 'A timeframe they choose.', 'What would make that timing change?'],
  urgency: ['What changes if you do not sell?', 'Understand the consequence they see.', 'Their own description of urgency.', 'How long has this been going on?'],
  price_expectation: ['What do you need to walk away with for this to be worth it?', 'Learn their expectation without proposing terms.', 'Their own expectations.', 'What would make an outcome work for you?'],
  what_they_need_to_walk_away: ['What would you need to walk away feeling comfortable?', 'Understand their desired outcome.', 'Their own stated needs.', 'What else matters to you besides the proceeds?'],
  current_payoff: ["What's still owed on it?", 'The current balance is not published in public records.', 'A balance they can check with the servicer.', 'Would you be comfortable checking the current statement?'],
  months_behind: ['Are any payments behind?', 'Understand the seller-stated payment situation.', 'Their description of payment status.', 'Have you received a recent statement?'],
  other_liens_known_to_owner: ['Are there other obligations tied to the property that you know about?', 'Avoid overlooking seller-known obligations.', 'Any obligation they identify.', 'Do you have paperwork for any of those?'],
  decision_makers: ['Is anyone else on the title?', 'Find out who needs to participate in a decision.', 'The people they say must decide.', 'Who else would need to be part of a conversation?'],
  occupancy_plan: ['Do you have somewhere lined up?', 'Understand the seller\'s moving needs.', 'Their stated plan.', 'What timing would work for your move?'],
  willing_to_consider_terms: ['Would you consider different ways to structure a sale?', 'Learn openness without presenting an offer.', 'Their own preferences.', 'What would make a structure comfortable for you?']
});

const RECORD_FIELDS = Object.freeze([
  ['owner_of_record', 'Owner of record', 'county appraisal record', 'owner_record.owner_name', 'owner_record.source_url', 'BLOCKS_CLOSE'],
  ['mailing_address', 'Mailing address', 'county appraisal record', 'owner_record.mailing_address', 'owner_record.source_url', 'INFORMATIONAL'],
  ['parcel_id', 'Parcel identifier', 'county appraisal record', 'county_appraisal_record.parcel_id', 'county_appraisal_record.source_url', 'BLOCKS_CLOSE'],
  ['legal_description', 'Legal description', 'county deed or appraisal record', 'county_appraisal_record.legal_description', 'county_appraisal_record.source_url', 'BLOCKS_CLOSE'],
  ['year_built', 'Year built', 'county appraisal record', 'county_appraisal_record.improvement_actual_year', 'county_appraisal_record.source_url', 'BLOCKS_OFFER'],
  ['living_area', 'Living area', 'county appraisal record', 'property_story.living_area', 'property_story.source_url', 'BLOCKS_OFFER'],
  ['beds', 'Bedrooms', 'county appraisal record', 'bedrooms', 'property_facts_source_url', 'BLOCKS_OFFER'],
  ['baths', 'Bathrooms', 'county appraisal record', 'bathrooms', 'property_facts_source_url', 'BLOCKS_OFFER'],
  ['lot_size', 'Lot size', 'county appraisal record', 'county_appraisal_record.lot_size_sqft_approx', 'county_appraisal_record.source_url', 'BLOCKS_OFFER'],
  ['property_type', 'Property type', 'county appraisal record', 'county_appraisal_record.property_type', 'county_appraisal_record.source_url', 'BLOCKS_OFFER'],
  ['original_principal_amount', 'Original principal', 'recorded deed of trust', 'original_principal_amount', 'source_document_url', 'INFORMATIONAL'],
  ['deed_date', 'Deed date', 'county deed record', 'county_appraisal_record.latest_deed_date', 'county_appraisal_record.source_url', 'INFORMATIONAL'],
  ['deed_instrument', 'Deed instrument', 'county deed record', 'county_appraisal_record.latest_deed_instrument', 'county_appraisal_record.source_url', 'INFORMATIONAL'],
  ['assessed_value', 'Assessed value (not market value)', 'county appraisal record', 'county_appraisal_record.assessed_value', 'county_appraisal_record.source_url', 'INFORMATIONAL']
]);

function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function at(row, path) { return path.split('.').reduce((value, key) => value == null ? undefined : value[key], row); }
function has(value) { return value !== null && value !== undefined && clean(value) !== ''; }
function sourceUrl(row) { return clean(row && (row.source_document_url || row.source_url)); }

function sourceType(row) {
  const description = [row && row.source_family, row && row.foreclosure_type, row && row.source_type,
    row && row.distress_types, row && row.lead_origin].map(clean).join(' ').toLowerCase();
  if (/probate|estate|heir/.test(description)) return 'probate';
  if (/code.?viol|code.?enforc/.test(description)) return 'code';
  if (/foreclos|trustee|tax.?sale|tax.?default|tax.?delinquent|lien|auction|land.?bank|fsbo|for.?sale.?by.?owner|owner.?post/.test(description)) return 'distress';
  return '';
}

function questionOrder(row) {
  const first = sourceType(row) === 'probate' ? ['decision_makers', 'timeline', 'motivation'] :
    sourceType(row) === 'code' ? ['condition_detail', 'repairs_needed', 'motivation'] :
      ['motivation', 'timeline', 'condition_detail'];
  return Array.from(new Set(first.concat([
    'urgency', 'repairs_needed', 'decision_makers', 'occupancy_plan', 'months_behind',
    'other_liens_known_to_owner', 'current_payoff', 'willing_to_consider_terms',
    'price_expectation', 'what_they_need_to_walk_away'
  ])));
}

function latestAnswers(row) {
  const answers = new Map();
  for (const answer of Array.isArray(row && row.discovery_answers) ? row.discovery_answers : []) {
    if (SELLER_FIELDS.includes(answer && answer.field) && answer.source_kind === 'seller_stated' && clean(answer.value)) {
      answers.set(answer.field, answer);
    }
  }
  return answers;
}

function question(field) {
  const parts = QUESTIONS[field];
  return { field, wording: parts[0], why: parts[1], useful_answer: parts[2], follow_up: parts[3] };
}

function workOrder(field, source, url) {
  return { kind: 'WORK_ORDER', field, source, source_url: clean(url), operator_needed: true,
    automatable: false, action: `Check the ${source} for this property and retain the exact record link.` };
}

function recordEntry(row, spec) {
  const [field, label, source, path, urlPath, severity] = spec;
  const value = at(row, path);
  const url = clean(at(row, urlPath));
  const workUrl = url || (/county appraisal record/.test(source) ? clean(row.official_property_record_url) : sourceUrl(row));
  const root = path.split('.')[0];
  const nested = ['owner_record', 'county_appraisal_record', 'property_story'].includes(root);
  const fieldSourceKind = nested ? clean(row[root] && row[root].source_kind) :
    clean(row[`${field}_source_kind`] || row.county_appraisal_field_provenance &&
      row.county_appraisal_field_provenance[field] && row.county_appraisal_field_provenance[field].source_kind);
  const noticeConfirmed = field === 'original_principal_amount' &&
    (Array.isArray(row.notice_confirmations) ? row.notice_confirmations : [])
      .some((item) => item && item.confirmed === true && item.field === field && clean(item.value) === clean(value));
  const verified = has(value) && !!url && (fieldSourceKind === 'official_public_record' || noticeConfirmed);
  return { field, label, current_status: verified ? 'VERIFIED' : has(value) ? 'CLUE' : 'UNKNOWN',
    source_class: 'ON_RECORD', source_url: verified ? url : '', value: has(value) ? value : null,
    resolution: verified ? { kind: 'RESOLVED', source_url: url } : workOrder(field, source, workUrl),
    blocking_severity: severity };
}

function buildDiscovery(row = {}, options = {}) {
  const answers = latestAnswers(row);
  const ledger = RECORD_FIELDS.map((spec) => recordEntry(row, spec));
  const confirmedNotice = (Array.isArray(row.notice_confirmations) ? row.notice_confirmations : [])
    .filter((item) => item && item.confirmed === true);
  for (const [field, label, noticeField] of [
    ['sale_date', 'Sale date', 'sale_date'], ['trustee', 'Trustee', 'trustee_or_substitute_trustee']
  ]) {
    const confirmed = confirmedNotice.slice().reverse().find((item) => item.field === noticeField);
    const url = confirmed && clean(confirmed.document_url || row.notice_scan && row.notice_scan.document_url);
    const visibleClue = field === 'sale_date' ? clean(row.sale_date_iso || row.sale_date_or_event_date) : '';
    ledger.push({ field, label, current_status: confirmed && url ? 'VERIFIED' : confirmed || visibleClue ? 'CLUE' : 'UNKNOWN',
      source_class: 'ON_RECORD', value: confirmed ? confirmed.value : visibleClue || null, source_url: url || '',
      resolution: confirmed && url ? { kind: 'RESOLVED', source_url: url } : workOrder(field, 'official sale notice', sourceUrl(row)),
      blocking_severity: field === 'sale_date' ? 'BLOCKS_OFFER' : 'INFORMATIONAL' });
  }
  const policy = marketCompPolicy.compPolicyForMarket({ city: row.city, county: row.county, state: row.state });
  const comps = Math.max(policy.manual_value_lane_enabled === true ? Number(row.confirmed_strict_comp_count) || 0 : 0,
    policy.comp_lane_enabled === true ? Number(row.verified_sold_comp_count) || 0 : 0);
  const firstComp = (Array.isArray(row.verified_comps) ? row.verified_comps : []).find((item) => clean(item && item.source_url));
  ledger.push({ field: 'sold_comps', label: 'Qualifying sold properties', current_status: comps >= 3 ? 'VERIFIED' : 'UNKNOWN',
    source_class: 'ON_RECORD', value: comps >= 3 ? comps : null, source_url: firstComp ? clean(firstComp.source_url) : '',
    resolution: comps >= 3 ? { kind: 'RESOLVED', source_url: firstComp ? clean(firstComp.source_url) : '' } : workOrder('sold_comps', 'public recorded sales where available or operator-confirmed sold-property screenshots', ''),
    blocking_severity: 'BLOCKS_OFFER' });
  for (const field of SELLER_FIELDS) {
    const answer = answers.get(field);
    ledger.push({ field, label: field.replace(/_/g, ' '), current_status: answer ? 'CLUE' : 'UNKNOWN',
      source_class: 'SELLER_ONLY', value: answer ? answer.value : null, source_url: '',
      source_kind: answer ? 'seller_stated' : '', blocking_severity: 'BLOCKS_OFFER',
      resolution: answer ? { kind: 'SELLER_STATED', answered_at: answer.answered_at, answered_by: answer.answered_by } :
        { kind: 'QUESTION', question: question(field) } });
  }
  ledger.push({ field: 'buyer_price', label: 'What a buyer would pay', current_status: 'UNKNOWN', source_class: 'BUYER_ONLY',
    value: null, source_url: '', resolution: { kind: 'BUYER_CONVERSATION' }, blocking_severity: 'BLOCKS_CLOSE' });
  ledger.push({ field: 'assignment_fee_target', label: 'Assignment fee target', current_status: 'UNKNOWN', source_class: 'OPERATOR_JUDGMENT',
    value: null, source_url: '', resolution: { kind: 'OPERATOR_DECISION' }, blocking_severity: 'BLOCKS_OFFER' });

  const lifecycle = leadLifecycleStatus.computeLifecycleStatus(row, options.now_iso);
  const address = clean(row.normalized_address);
  const addressVerified = propertyIdentity.isCompleteAddress(address) && !!sourceUrl(row) &&
    propertyAddressEvidence.isSourceSupportedSubjectAddress(row);
  const sourcedReason = !!sourceType(row) && !!sourceUrl(row) &&
    clean(row.contact_workflow_outcome).toLowerCase() !== 'not_interested';
  const questions = questionOrder(row).filter((field) => !answers.has(field) &&
    (field !== 'occupancy_plan' || row.county_appraisal_record && row.county_appraisal_record.owner_occupied === true))
    .map(question);
  const streetViewUrl = addressVerified
    ? addressDerivedResearchLinks.buildAddressResearchLinks(row).find((entry) => entry.label === 'Street View')?.url || ''
    : '';
  const callBlockedReason = lifecycle.quarantined ? 'Do not call yet: this property is quarantined until its current source status is checked.' :
    !addressVerified ? 'Do not call yet: a complete property address is not verified against its source.' :
      clean(row.contact_workflow_outcome).toLowerCase() === 'not_interested' ? 'Do not call: the seller was recorded as not interested.' :
      !sourcedReason ? 'Do not call yet: there is no current, sourced property reason to start a seller conversation.' :
        !questions.length ? 'Do not call yet: there is no unanswered seller discovery question on this row.' : '';
  const payoff = answers.get('current_payoff');
  const arv = row.leverage_dossier && row.leverage_dossier.valuation && row.leverage_dossier.valuation.verified_arv;
  const value = arv && Number(arv.value);
  const balance = payoff && /^\$?\s*[\d,]+(?:\.\d{1,2})?$/.test(clean(payoff.value))
    ? Number(clean(payoff.value).replace(/[$,\s]/g, '')) : NaN;
  const equityClue = payoff && comps >= 3 && Number.isFinite(value) && value > 0 && Number.isFinite(balance)
    ? { status: 'CLUE', amount: value - balance, value_basis: 'three_sold_comp_proxy',
      debt_basis: 'seller_stated_current_payoff', warning: 'Seller-stated balance is not verified. This is not an offer or a confirmed equity amount.' }
    : null;
  return { call_ready: !callBlockedReason, call_blocked_reason: callBlockedReason, gap_ledger: ledger,
    questions, street_view_url: streetViewUrl,
    address_link_placeholder: addressVerified ? '' : 'No verified property address yet.',
    equity_clue: equityClue, preview_only: true, not_a_saved_lead: true };
}

function summarize(rows, options = {}) {
  const summary = { total_rows: 0, call_ready: 0, call_blocked_reasons: {}, on_record_gaps: {}, seller_only_gaps: {} };
  for (const row of Array.isArray(rows) ? rows : []) {
    const view = buildDiscovery(row, options);
    summary.total_rows += 1;
    if (view.call_ready) summary.call_ready += 1;
    else summary.call_blocked_reasons[view.call_blocked_reason] = (summary.call_blocked_reasons[view.call_blocked_reason] || 0) + 1;
    for (const entry of view.gap_ledger) {
      if (entry.current_status !== 'UNKNOWN') continue;
      const group = entry.source_class === 'ON_RECORD' ? summary.on_record_gaps : entry.source_class === 'SELLER_ONLY' ? summary.seller_only_gaps : null;
      if (group) group[entry.field] = (group[entry.field] || 0) + 1;
    }
  }
  return summary;
}

module.exports = { SELLER_FIELDS, buildDiscovery, summarize, sourceType };
