'use strict';

const identity = require('./property-identity');
const addressEvidence = require('./property-address-evidence');
const addressLinks = require('./address-derived-research-links');
const canonical = require('../../scripts/lib/address-canonical');
const operations = require('./lead-operations-state');
const sourceAdapter = require('./source-evidence-adapter');
const sourceDates = require('./normalize-source-date');
const dateOrigins = require('./sale-date-origin');

function text(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function sourceUrl(row) { return text(row.source_record_url || row.source_document_url || row.source_url || row.property && (row.property.canonical_source_url || row.property.source_url)); }
function subjectAddress(row) { return text(row.property_address || row.address || row.normalized_address || row.property && row.property.full_address); }
function sameAddress(a, b) {
  const x = canonical.canonicalizeAddress(a); const y = canonical.canonicalizeAddress(b);
  return !!(x.number && x.street && y.number && y.street && ['number', 'street', 'suffix', 'city', 'state', 'zip'].every(key => !x[key] || !y[key] || x[key] === y[key]));
}
function sourceConflict(row) {
  if (row.source_address_conflict === true || row.source_address_conflict_warning ||
      row.property && (row.property.source_address_conflict_warning || row.property.source_proof_status === 'Source/Address Conflict') ||
      ['blocked_source_address_conflict', 'source_address_conflict'].includes(row.comp_research_status)) return true;
  const address = subjectAddress(row);
  const urls = [sourceUrl(row), row.redfin_url, row.zillow_url, row.realtor_url, row.canonical_source_url,
    row.source_resolved_url, row.resolved_source_url];
  return urls.filter(Boolean).some(url => {
    if (addressLinks.classifyStoredAddressLink(url, address).status === 'MISMATCH') return true;
    const parsed = identity.addressFromPropertyUrl(url);
    return parsed.street && address && !sameAddress(parsed.full_address, address);
  });
}
function verifiedPropertyAddress(row) {
  const address = subjectAddress(row);
  if (!identity.isCompleteAddress(address) || !/^https?:\/\//i.test(sourceUrl(row))) return false;
  if (row.source_structured_address_verified !== true || /ai.generated|synthetic|template/i.test(text(row.source_kind)) || row.risk_flags && !Array.isArray(row.risk_flags) || (row.risk_flags || []).includes('OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED')) return false;
  if (/[<>]/.test(address) || /mail|trustee|servicer|attorney|courthouse|sale_venue|registered_agent|mortgagee/i.test(text(row.property_address_origin))) return false;
  const kind = sourceAdapter.classifySourceUrl(sourceUrl(row));
  const hasRowReference = [row.source_reference, row.source_row_reference, row.source_record_id, row.source_row_id].some(value => text(value));
  if (!['pdf_document', 'exact_property_record'].includes(kind) && !(kind === 'list_page' && hasRowReference)) return false;
  const proof = [row.source_proof_text, row.source_text, row.source_excerpt, row.source_page_text, row.property_address_evidence_text].map(text).filter(Boolean).join(' | ');
  const role = addressEvidence.roleForAddressInText(address, proof);
  if (role && !['subject_property', 'unlabeled_address'].includes(role)) return false;
  if (role === 'subject_property') return true;
  return row.source_structured_address_verified === true && !!proof &&
    addressEvidence.addressCandidates(proof).some(candidate => sameAddress(candidate.address, address) && ['subject_property', 'unlabeled_address'].includes(candidate.role));
}
function classify(row) {
  row = row || {};
  const conflict = sourceConflict(row);
  const propertyVerified = verifiedPropertyAddress(row);
  const lane = row.archived === true ? 'archived' : conflict ? 'source_conflict' : propertyVerified ? 'working' : 'needs_address_proof';
  const phone = operations.provenPhoneRoute(row);
  const digits = phone ? text(phone.value).replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'') : '';
  const phoneSupported = digits.length === 10 && text(phone.evidence_text).replace(/\D/g,'').includes(digits);
  const callable = lane === 'working' && phoneSupported && operations.identityKnown(row) && !['bank','government'].includes(text(row.owner_type || row.owner_record && row.owner_record.owner_type).toLowerCase()) && row.do_not_call !== true && row.do_not_contact !== true && row.contact_workflow_outcome !== 'not_interested';
  return { lane, property_verified: propertyVerified, source_conflict: conflict, callable, proven_phone: callable ? phone.value : '',
    reason: conflict ? 'Link points to a different property' : propertyVerified ? 'Property address has source proof' : 'Needs address proof',
    next_action: conflict ? 'Review the property and source link before contacting anyone.' : propertyVerified ? 'Open Lead Details to review the evidence.' : 'Open the source record and verify the property address.' };
}
function counts(rows) {
  const result = { total_saved: 0, working: 0, needs_address_proof: 0, source_conflict: 0, archived: 0, callable: 0 };
  for (const row of rows || []) { const state = classify(row); result.total_saved++; result[state.lane]++; if (state.callable) result.callable++; }
  return result;
}
function buyerEligible(buyer) {
  if (!buyer || buyer.test === true || buyer.synthetic_test_data === true || /\btest buyer\b|synthetic|ai.generated|auto.generated|template/i.test([buyer.name, buyer.source, buyer.notes].map(text).join(' '))) return false;
  if (buyer.assistant_find) return require('../buyers/buyer-fit').approvedForMatching(buyer);
  return buyer.verified === true && !!text(buyer.verified_by) && !!text(buyer.verified_at) && /^https?:\/\//i.test(text(buyer.source_url));
}
function matchEligible(row, buyer) { return classify(row).lane === 'working' && Number(row.arv) > 0 && Number(row.offer) > 0 && buyerEligible(buyer); }
function matchReasons(row, buyer) {
  if (!matchEligible(row, buyer)) return [];
  if (buyer.assistant_find) {
    const result = require('../buyers/buyer-fit').fitLead(buyer, row);
    return result.fits ? result.reasons : [];
  }
  const norm = value => text(value).toLowerCase();
  const states = buyer.states || (buyer.state ? [buyer.state] : []);
  const types = buyer.buyTypes || [];
  const cities = buyer.cities || (buyer.city ? [buyer.city] : []);
  const reasons = [];
  if (states.length) { if (!states.map(norm).includes(norm(row.state))) return []; reasons.push('State fits'); }
  if (types.length) { if (!types.map(norm).includes(norm(row.type || row.property_type))) return []; reasons.push('Property type fits'); }
  if (cities.length) { if (!cities.map(norm).includes(norm(row.city))) return []; reasons.push('City fits'); }
  if (buyer.minPrice != null && Number(row.offer) < Number(buyer.minPrice) || buyer.maxPrice != null && Number(row.offer) > Number(buyer.maxPrice)) return [];
  if (buyer.minPrice != null || buyer.maxPrice != null) reasons.push('Recorded offer fits price range');
  return reasons;
}
function saleDateForSort(row) {
  for (const field of dateOrigins.SALE_DATE_ORIGINS) {
    if (field === 'sale_date' && row.sale_date_origin && !dateOrigins.isSaleDateOrigin(row.sale_date_origin, row.source_id || row.source_adapter)) continue;
    const normalized = sourceDates.normalizeSourceDate(text(row[field]));
    if (normalized.iso) return normalized.iso;
  }
  if (dateOrigins.isSaleDateOrigin(row.sale_date_origin, row.source_id || row.source_adapter)) return sourceDates.normalizeSourceDate(text(row.sale_date_or_event_date)).iso || '';
  return '';
}

module.exports = { classify, counts, sourceConflict, verifiedPropertyAddress, buyerEligible, matchEligible, matchReasons, saleDateForSort, sourceUrl, subjectAddress };
