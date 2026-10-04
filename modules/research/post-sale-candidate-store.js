'use strict';

const crypto = require('crypto');
const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');
const countySourceProfiles = require('../sources/county-source-profile-registry');
const noticeFields = require('./notice-field-evidence');
const { normalizeSourceDate } = require('./normalize-source-date');

const PAGE_SIZE = 20;
const MAX_EXCERPT_LENGTH = 1000;

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function urlIdentity(value) {
  try {
    const url = new URL(value);
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/$/, '').toLowerCase()}`;
  } catch (_) {
    return '';
  }
}

function isIndexUrl(profile, value) {
  const identity = urlIdentity(value);
  return !!identity && (profile.index_urls || []).some((item) => urlIdentity(item) === identity);
}

function proofMentionsPropertyAndDate(item) {
  return !proofFailure(item);
}

function proofIssues(item) {
  const proof = clean(item.source_proof_text || item.source_proof_excerpt);
  const addressOrigin = noticeFields.propertyAddressOrigin(proof, item.property_address);
  const issues = [];
  if (!noticeFields.PROPERTY_ADDRESS_ORIGINS.has(clean(item.property_address_origin)) ||
      !addressOrigin || item.property_address_origin !== addressOrigin)
    issues.push({ reason: 'address_not_property_field', field: 'property_address', old_value: clean(item.property_address) });
  const sale = noticeFields.labeledSaleDate(proof);
  if (!noticeFields.SALE_DATE_ORIGINS.has(clean(item.sale_date_origin)) ||
      !sale.date || item.sale_date_origin !== sale.origin)
    issues.push({ reason: 'sale_date_not_labeled', field: 'sale_date', old_value: clean(item.sale_date) });
  else if (clean(sale.date).toLowerCase() !== clean(item.sale_date_raw_text || item.sale_date).toLowerCase())
    issues.push({ reason: 'sale_date_differs_from_proof', field: 'sale_date', old_value: clean(item.sale_date) });
  return issues;
}

function proofFailure(item) {
  return proofIssues(item)[0]?.reason || '';
}

function rejectionReason(item, sourceId) {
  if (!item || item.preview_only !== true || item.should_ingest !== false ||
      item.sale_outcome !== 'OUTCOME_UNKNOWN' || item.can_contact_original_owner !== false ||
      clean(item.source_id) !== clean(sourceId)) return 'invalid_candidate';
  const profile = countySourceProfiles.profileForSourceId(sourceId);
  const sourceUrl = clean(item.source_url);
  if (!countySourceProfiles.sourceHostAllowed(profile, sourceUrl)) return 'untrusted_source';
  const documentUrl = clean(item.source_document_url);
  if (documentUrl && !countySourceProfiles.sourceHostAllowed(profile, documentUrl)) return 'untrusted_source';
  const address = canonicalizeAddress(item.property_address);
  if (!address.number || !address.street || !clean(item.sale_date)) return 'missing_property_identity';
  const exactDocument = [documentUrl, sourceUrl].some((url) =>
    countySourceProfiles.sourceHostAllowed(profile, url) && !isIndexUrl(profile, url));
  const proofReason = proofFailure(item);
  if (proofReason) return proofReason;
  if (!exactDocument) return 'generic_source_url';
  return '';
}

function proofExcerpt(item) {
  const proof = clean(item.source_proof_text);
  if (proof.length <= MAX_EXCERPT_LENGTH) return proof;
  const address = canonicalizeAddress(item.property_address);
  const marker = `${address.number} ${address.street}`.toLowerCase();
  const match = proof.toLowerCase().indexOf(marker);
  const dateMatch = proof.indexOf(clean(item.sale_date_raw_text || item.sale_date));
  if (match >= 0 && dateMatch >= 0 && Math.abs(match - dateMatch) > MAX_EXCERPT_LENGTH - 100) {
    const half = Math.floor((MAX_EXCERPT_LENGTH - 3) / 2);
    return `${proof.slice(Math.max(0, match - 100), Math.max(0, match - 100) + half)} | ` +
      proof.slice(Math.max(0, dateMatch - 100), Math.max(0, dateMatch - 100) + half);
  }
  const center = match >= 0 && dateMatch >= 0 ? Math.floor((match + dateMatch) / 2) :
    match >= 0 ? match : dateMatch >= 0 ? dateMatch : 0;
  const start = Math.max(0, Math.min(proof.length - MAX_EXCERPT_LENGTH,
    center - Math.floor(MAX_EXCERPT_LENGTH / 2)));
  return proof.slice(start, start + MAX_EXCERPT_LENGTH);
}

function storedCandidate(item, firstSeenAt) {
  const fullProof = String(item.source_proof_text == null ? '' : item.source_proof_text);
  const proof = clean(fullProof);
  const sourceUrl = clean(item.source_url);
  const documentUrl = clean(item.source_document_url);
  const profile = countySourceProfiles.profileForSourceId(item.source_id);
  const exactDocument = countySourceProfiles.sourceHostAllowed(profile, documentUrl) &&
    !isIndexUrl(profile, documentUrl) ? documentUrl : '';
  const urls = [sourceUrl, documentUrl, ...(Array.isArray(item.source_urls) ? item.source_urls : [])]
    .map(clean).filter((url) => countySourceProfiles.sourceHostAllowed(profile, url));
  return {
    source_id: clean(item.source_id), source_kind: clean(item.source_kind),
    source_family: clean(item.source_family), source_url: exactDocument || sourceUrl,
    source_document_url: documentUrl, source_urls: [...new Set(urls)],
    source_row_reference: clean(item.source_row_reference),
    property_address: clean(item.property_address), parcel_or_account: clean(item.parcel_or_account),
    sale_date: clean(item.sale_date), sale_date_resolution: item.sale_date_resolution || null,
    sale_date_origin: clean(item.sale_date_origin),
    property_address_origin: clean(item.property_address_origin),
    lane_status: clean(item.lane_status), invalidation_reason: clean(item.invalidation_reason),
    previous_invalidation_reason: clean(item.previous_invalidation_reason),
    invalidated_fields: Array.isArray(item.invalidated_fields) ? item.invalidated_fields.slice() : [],
    stale_basis: clean(item.stale_basis), sale_outcome: 'OUTCOME_UNKNOWN',
    source_proof_excerpt: proof ? proofExcerpt(item) : clean(item.source_proof_excerpt).slice(0, MAX_EXCERPT_LENGTH),
    source_proof_sha256: proof ? crypto.createHash('sha256').update(fullProof).digest('hex') :
      clean(item.source_proof_sha256) || crypto.createHash('sha256').update('').digest('hex'),
    captured_at: clean(item.captured_at), first_seen_at: clean(item.first_seen_at || firstSeenAt),
    candidate_key: clean(item.candidate_key || candidateKey(item)),
    can_contact_original_owner: false, preview_only: true, should_ingest: false
  };
}

function candidateKey(item) {
  const address = canonicalizeAddress(item.property_address);
  const identity = [item.source_id, address.canonical_string,
    item.sale_date_resolution && item.sale_date_resolution.resolved_iso || item.sale_date,
    item.parcel_or_account].map(clean).join('|');
  return crypto.createHash('sha256').update(identity).digest('hex');
}

function collectFromPreview(preview) {
  const results = preview && preview.diagnostics && preview.diagnostics.source_adapter &&
    preview.diagnostics.source_adapter.source_adapter_results;
  const accepted = [];
  const rejected = {};
  for (const result of Array.isArray(results) ? results : []) {
    for (const item of Array.isArray(result && result.post_sale_candidates) ? result.post_sale_candidates : []) {
      const reason = rejectionReason(item, result.source_id);
      if (reason) rejected[reason] = (rejected[reason] || 0) + 1;
      else accepted.push(item);
    }
  }
  return { accepted, rejected };
}

function mergeCandidates(existing, incoming, seenAt) {
  const byKey = new Map();
  for (const item of (Array.isArray(existing) ? existing : []).concat(Array.isArray(incoming) ? incoming : [])) {
    const stored = storedCandidate(item, seenAt);
    const issues = proofIssues(stored);
    if (issues.length) {
      stored.lane_status = 'superseded_invalid';
      stored.invalidation_reason = issues.map((issue) => issue.reason).join(',');
      if (!stored.invalidated_fields.length) stored.invalidated_fields = issues.map(({ field, old_value }) => ({ field, old_value }));
    }
    const key = candidateKey(stored);
    const prior = byKey.get(key);
    if (!prior) byKey.set(key, { ...stored, candidate_key: key });
    else if (prior.lane_status === 'superseded_invalid' && stored.lane_status !== 'superseded_invalid') {
      byKey.set(key, { ...stored, candidate_key: key,
        first_seen_at: prior.first_seen_at && prior.first_seen_at < stored.first_seen_at ? prior.first_seen_at : stored.first_seen_at,
        source_urls: [...new Set(prior.source_urls.concat(stored.source_urls))],
        invalidated_fields: prior.invalidated_fields,
        previous_invalidation_reason: prior.invalidation_reason });
    }
    else {
      prior.source_urls = [...new Set(prior.source_urls.concat(stored.source_urls))];
      if (stored.first_seen_at && stored.first_seen_at < prior.first_seen_at) prior.first_seen_at = stored.first_seen_at;
    }
  }
  return [...byKey.values()];
}

function responsePage(candidates) {
  const items = Array.isArray(candidates) ? candidates : [];
  const valid = items.filter((item) => item.lane_status !== 'superseded_invalid' && !proofFailure(item));
  const resolvedDate = (item) => clean(item.sale_date_resolution && item.sale_date_resolution.resolved_iso ||
    normalizeSourceDate(item.sale_date).iso);
  const sorted = valid.slice().sort((a, b) =>
    Number(!!resolvedDate(b)) - Number(!!resolvedDate(a)) ||
    resolvedDate(b).localeCompare(resolvedDate(a)) ||
    clean(b.first_seen_at).localeCompare(clean(a.first_seen_at)));
  return { post_sale_candidates: sorted.slice(0, PAGE_SIZE).map((item) => storedCandidate(item, item.first_seen_at)),
    post_sale_candidate_total: valid.length, post_sale_invalidated: items.length - valid.length };
}

module.exports = { PAGE_SIZE, collectFromPreview, mergeCandidates, responsePage,
  rejectionReason, proofMentionsPropertyAndDate };
