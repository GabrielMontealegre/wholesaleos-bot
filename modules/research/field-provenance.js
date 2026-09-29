'use strict';

const marketCompPolicy = require('./market-comp-policy');
const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

const SOURCE_KINDS = Object.freeze([
  'official_public_record',
  'public_source_document',
  'public_web_page',
  'search_snippet',
  'operator_supplied_screenshot',
  'paid_api'
]);

function sourceKind(value, fallback) {
  const kind = cleanText(value || fallback);
  return SOURCE_KINDS.includes(kind) ? kind : '';
}

function withProvenance(payload, provenance = {}) {
  const source_kind = sourceKind(provenance.source_kind || payload && payload.source_kind);
  return Object.assign({}, payload || {}, {
    source_kind,
    source_url: cleanText(provenance.source_url || payload && payload.source_url),
    evidence_text: cleanText(provenance.evidence_text || payload && payload.evidence_text)
  });
}

function hasProvenance(value) {
  return !!(
    value &&
    typeof value === 'object' &&
    sourceKind(value.source_kind) &&
    cleanText(value.source_url) &&
    cleanText(value.evidence_text)
  );
}

function routeHasProvenance(route) {
  return hasProvenance(route);
}

function compHasProvenance(comp, options = {}) {
  const paid = sourceKind(comp && comp.source_kind) === 'paid_api';
  const subject = options.subject;
  const subjectState = cleanText(subject && subject.state).toUpperCase();
  const subjectAddressState = canonicalizeAddress(subject && subject.normalized_address).state;
  const compAddressState = canonicalizeAddress(comp && (comp.comp_address || comp.address)).state;
  const declaredCompState = cleanText(comp && (comp.comp_state || comp.state)).toUpperCase();
  const compState = compAddressState || declaredCompState;
  const policy = paid && /^[A-Z]{2}$/.test(subjectState) &&
    (!subjectAddressState || subjectAddressState === subjectState)
    ? marketCompPolicy.compPolicyForMarket({ state: subjectState }, options) : null;
  const paidAllowed = !paid || !!(policy && policy.paid_comp_enabled &&
    compState === subjectState && (!declaredCompState || declaredCompState === compState) &&
    cleanText(policy.paid_provider_name) === cleanText(comp.provider_name) &&
    cleanText(comp.provider_name) &&
    ['recorded_sale', 'mls_closed_sale'].includes(cleanText(comp.price_basis)));
  return !!(hasProvenance(comp) && paidAllowed &&
    cleanText(comp.comp_address || comp.address || comp.parcel_id || comp.apn || comp.pin) &&
    Number(comp.sold_price) > 0 &&
    cleanText(comp.sold_date));
}

module.exports = {
  SOURCE_KINDS,
  sourceKind,
  withProvenance,
  hasProvenance,
  routeHasProvenance,
  compHasProvenance
};
