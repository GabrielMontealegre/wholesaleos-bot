'use strict';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function dateOnly(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  return match ? match[1] : '';
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
  const saleIso = dateOnly(row && (row.sale_date_iso || row.sale_date_or_event_date));
  const sourceDateFields = [
    ['source_date', row && row.source_date],
    ['sale_date_iso', row && row.sale_date_iso],
    ['sale_date_or_event_date', row && row.sale_date_or_event_date],
    ['event_date', row && row.event_date],
    ['sale_date', row && row.sale_date],
    ['auction_date', row && row.auction_date],
    ['notice_date', row && row.notice_date],
    ['filing_date', row && row.filing_date],
    ['source_published_at', row && row.source_published_at],
    ['listing_date_if_visible', row && row.listing_date_if_visible]
  ];
  const sourceDateEntry = sourceDateFields.find((entry) => dateOnly(entry[1])) || null;
  const sourceDateIso = sourceDateEntry ? dateOnly(sourceDateEntry[1]) : '';
  const repostFields = [
    ['reposted_source_date', row && row.reposted_source_date],
    ['replacement_source_date', row && row.replacement_source_date]
  ];
  const repostEntry = repostFields.find((entry) => dateOnly(entry[1])) || null;
  const repostDateIso = repostEntry ? dateOnly(repostEntry[1]) : '';
  const repostEvidence = cleanText(row && (row.reposted_source_evidence_text || row.replacement_source_evidence_text));
  const repostUrl = cleanText(row && (row.reposted_source_url || row.replacement_source_url || row.source_document_url || row.source_url));
  const sourceNoLongerListed = row && row.source_no_longer_listed === true ||
    /^(?:source_no_longer_listed|not_present_in_latest_monthly_list)$/i.test(cleanText(row && row.source_listing_status));
  const sourceDoc = cleanText(row && row.source_document_url);
  const sourceUrl = cleanText(row && row.source_url);
  const address = cleanText(row && row.normalized_address);

  function out(status, reasonCode, reasonText, evidenceField) {
    return {
      status,
      reason_code: reasonCode,
      reason_text: reasonText,
      // Unknown or disappeared source state is quarantined until a source check
      // supplies dated evidence. A dated repost is the only reactivation path.
      quarantined: status === 'SALE_PASSED' || status === 'SUPERSEDED_DUPLICATE' ||
        status === 'UNVERIFIABLE' || status === 'SOURCE_NO_LONGER_LISTED' ||
        status === 'DATE_UNKNOWN_REVERIFY',
      evidence_field: evidenceField
    };
  }

  if (!address && !sourceDoc && !sourceUrl) {
    return out('UNVERIFIABLE', 'NO_ADDRESS_OR_SOURCE_DOCUMENT', 'No complete address and no source document or source URL remain on the row.', 'normalized_address/source_document_url');
  }
  if (duplicateSuperseded(row)) {
    return out('SUPERSEDED_DUPLICATE', 'RICHER_CENSUS_MATCH_EXISTS', 'A richer row has the same census-matched address.', 'census_matched_address');
  }
  if (sourceNoLongerListed) {
    return out('SOURCE_NO_LONGER_LISTED', 'ABSENT_FROM_LATEST_MONTHLY_LIST', 'The row is absent from the latest monthly source list. Its outcome is unknown; verify against current official evidence.', 'source_listing_status');
  }
  const hasNewDatedRepost = !!(repostDateIso && repostEvidence && repostUrl && (!saleIso || repostDateIso > saleIso));
  if (saleIso && saleIso < today && !hasNewDatedRepost) {
    return out('SALE_PASSED', 'SALE_DATE_BEFORE_TODAY', `Sale date ${saleIso} is before ${today}; verify status before calling.`, 'sale_date_iso');
  }
  if (hasNewDatedRepost) {
    return out('REPOSTED_OR_REPLACED', 'NEW_DATED_SOURCE_EVIDENCE', `A newer source dated ${repostDateIso} reposts or replaces the prior event.`, `${repostEntry[0]}/reposted_source_evidence_text`);
  }
  if (saleIso && saleIso >= today) {
    return out('FRESH', 'FUTURE_SALE_DATE', `Sale or event date ${saleIso} is still upcoming.`, 'sale_date_iso');
  }
  if (!sourceDateIso) {
    return out('DATE_UNKNOWN_REVERIFY', 'NO_SOURCE_DATE_EVIDENCE', 'The source provides no usable event or publication date. Reverify before treating this row as current.', 'source_date');
  }
  const sourceAge = daysBetween(sourceDateIso, today);
  if (sourceAge != null && sourceAge < 7) {
    return out('FRESH', 'SOURCE_DATED_UNDER_7_DAYS', `Source evidence is dated ${sourceAge} day${sourceAge === 1 ? '' : 's'} ago.`, sourceDateEntry[0]);
  }
  return out('AGING', sourceAge <= 30 ? 'SOURCE_DATED_7_TO_30_DAYS' : 'SOURCE_DATED_OVER_30_DAYS', `Source evidence is dated ${sourceAge} days ago.`, sourceDateEntry[0]);
}

module.exports = {
  cleanText,
  computeLifecycleStatus,
  evidenceScore
};
