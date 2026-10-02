'use strict';

const crypto = require('crypto');
const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');
const countySourceProfiles = require('../sources/county-source-profile-registry');

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
  const proof = clean(item.source_proof_text).toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  const address = canonicalizeAddress(item.property_address);
  const number = clean(address.number).toUpperCase();
  const street = clean(address.street).toUpperCase();
  const rawDate = clean(item.sale_date_raw_text || item.sale_date).toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ');
  if (!number || !street || !rawDate) return false;
  const streetMatch = new RegExp(`\\b${number}\\s+${street.replace(/\s+/g, '\\s+')}\\b`);
  return streetMatch.test(proof) && proof.includes(rawDate);
}

function exactRowReference(value) {
  return /\b(?:page|row|line|entry|record)\s*[#:\-]?\s*\d+\b/i.test(clean(value));
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
  const rowReference = exactRowReference(item.source_row_reference);
  if (!rowReference && clean(item.source_proof_text) && !proofMentionsPropertyAndDate(item))
    return 'proof_not_property_specific';
  if (!exactDocument) return 'generic_source_url';
  if (!rowReference && !proofMentionsPropertyAndDate(item)) return 'proof_not_property_specific';
  if (rowReference && !clean(item.source_proof_text) &&
      (!address.number || !address.street || !clean(item.sale_date))) return 'proof_not_property_specific';
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
    const key = candidateKey(stored);
    const prior = byKey.get(key);
    if (!prior) byKey.set(key, { ...stored, candidate_key: key });
    else {
      prior.source_urls = [...new Set(prior.source_urls.concat(stored.source_urls))];
      if (stored.first_seen_at && stored.first_seen_at < prior.first_seen_at) prior.first_seen_at = stored.first_seen_at;
    }
  }
  return [...byKey.values()];
}

function responsePage(candidates) {
  const items = Array.isArray(candidates) ? candidates : [];
  const sorted = items.slice().sort((a, b) =>
    clean(b.sale_date_resolution && b.sale_date_resolution.resolved_iso || b.sale_date)
      .localeCompare(clean(a.sale_date_resolution && a.sale_date_resolution.resolved_iso || a.sale_date)) ||
    clean(b.first_seen_at).localeCompare(clean(a.first_seen_at)));
  return { post_sale_candidates: sorted.slice(0, PAGE_SIZE).map((item) => storedCandidate(item, item.first_seen_at)),
    post_sale_candidate_total: items.length };
}

module.exports = { PAGE_SIZE, collectFromPreview, mergeCandidates, responsePage,
  rejectionReason, proofMentionsPropertyAndDate };
