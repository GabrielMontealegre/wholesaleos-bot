'use strict';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

const SOURCE_KINDS = Object.freeze([
  'official_public_record',
  'public_source_document',
  'public_web_page',
  'search_snippet'
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

function compHasProvenance(comp) {
  return !!(hasProvenance(comp) &&
    cleanText(comp.comp_address || comp.address) &&
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
