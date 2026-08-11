'use strict';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function dateOnly(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function daysBetween(startIso, endIso) {
  const start = Date.parse(`${dateOnly(startIso)}T00:00:00Z`);
  const end = Date.parse(`${dateOnly(endIso)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.floor((end - start) / 86400000);
}

function evidenceScore(row) {
  const fields = [
    'source_document_url', 'source_url', 'best_link_to_click_first',
    'official_property_record_url', 'owner_clue', 'best_contact',
    'status_evidence_text', 'minimum_bid', 'delinquent_redemption_amount',
    'listed_price'
  ];
  return fields.reduce((score, field) => score + (cleanText(row && row[field]) ? 1 : 0), 0) +
    (Array.isArray(row && row.source_document_urls) ? row.source_document_urls.filter(cleanText).length : 0) +
    (Array.isArray(row && row.free_contact_routes) ? row.free_contact_routes.length : 0) +
    (Array.isArray(row && row.verified_comps) ? row.verified_comps.length : 0);
}

function duplicateSuperseded(row) {
  const duplicates = Array.isArray(row && row.duplicate_candidates) ? row.duplicate_candidates : [];
  const ownKey = cleanText(row && row.queue_key);
  const ownAddress = cleanText(row && row.census_matched_address);
  const ownScore = Number(row && row.evidence_score != null ? row.evidence_score : evidenceScore(row)) || 0;
  return duplicates.some((item) => cleanText(item && item.queue_key) &&
    cleanText(item.queue_key) !== ownKey &&
    cleanText(item.census_matched_address) === ownAddress &&
    (Number(item.evidence_score) || 0) > ownScore);
}

function computeLifecycleStatus(row, nowIso) {
  const today = dateOnly(cleanText(nowIso).slice(0, 10)) || dateOnly(new Date().toISOString().slice(0, 10));
  const saleIso = dateOnly(row && row.sale_date_iso);
  const sourceDoc = cleanText(row && row.source_document_url);
  const sourceUrl = cleanText(row && row.source_url);
  const address = cleanText(row && row.normalized_address);
  const lastSeen = dateOnly(cleanText(row && row.last_seen_at).slice(0, 10));
  const firstSeen = dateOnly(cleanText(row && row.first_seen_at).slice(0, 10));
  const seenIso = lastSeen || firstSeen;

  function out(status, reasonCode, reasonText, evidenceField) {
    return {
      status,
      reason_code: reasonCode,
      reason_text: reasonText,
      quarantined: status === 'SALE_PASSED' || status === 'SUPERSEDED_DUPLICATE' || status === 'UNVERIFIABLE',
      evidence_field: evidenceField
    };
  }

  if (!address && !sourceDoc && !sourceUrl) {
    return out('UNVERIFIABLE', 'NO_ADDRESS_OR_SOURCE_DOCUMENT', 'No complete address and no source document or source URL remain on the row.', 'normalized_address/source_document_url');
  }
  if (saleIso && saleIso < today) {
    return out('SALE_PASSED', 'SALE_DATE_BEFORE_TODAY', `Sale date ${saleIso} is before ${today}; verify status before calling.`, 'sale_date_iso');
  }
  if (duplicateSuperseded(row)) {
    return out('SUPERSEDED_DUPLICATE', 'RICHER_CENSUS_MATCH_EXISTS', 'A richer row has the same census-matched address.', 'census_matched_address');
  }
  if (saleIso && saleIso >= today) {
    return out('FRESH', 'FUTURE_SALE_DATE', `Sale or event date ${saleIso} is still upcoming.`, 'sale_date_iso');
  }
  const seenAge = seenIso ? daysBetween(seenIso, today) : null;
  if (seenAge != null && seenAge < 7) {
    return out('FRESH', 'SOURCE_SEEN_UNDER_7_DAYS', `Source was last seen ${seenAge} day${seenAge === 1 ? '' : 's'} ago.`, lastSeen ? 'last_seen_at' : 'first_seen_at');
  }
  if (seenAge != null && seenAge <= 30) {
    return out('AGING', 'SOURCE_SEEN_7_TO_30_DAYS', `Source was last seen ${seenAge} days ago.`, lastSeen ? 'last_seen_at' : 'first_seen_at');
  }
  return out('AGING', 'NO_DATE_EVIDENCE', 'No sale date evidence is available; keep the row active but verify status.', saleIso ? 'sale_date_iso' : 'last_seen_at');
}

module.exports = {
  cleanText,
  computeLifecycleStatus,
  evidenceScore
};
