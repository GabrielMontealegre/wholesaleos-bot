'use strict';

const LENDER_NAME_RE = /\b(?:FANNIE MAE|FREDDIE MAC|HUD|VETERANS AFFAIRS|BANK|MORTGAGE|SERVICING|LOAN|TRUST COMPANY)\b/i;

function text(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function isoDate(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(`${match[0]}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[0] ? match[0] : '';
}

function name(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function propertyMatches(subject, item) {
  const subjectParcel = name(subject.parcel_or_account || subject.parcel_id);
  const itemParcel = name(item.parcel_or_account || item.parcel_id);
  if (subjectParcel && itemParcel) return subjectParcel === itemParcel;
  const subjectAddress = name(subject.property_address || subject.normalized_address);
  const itemAddress = name(item.property_address || item.normalized_address);
  return !!(subjectAddress && itemAddress && subjectAddress === itemAddress);
}

function officialEvidence(item, hosts) {
  if (!item || !text(item.source_kind) || !text(item.evidence_text) ||
      !isoDate(item.record_date) || !isoDate(text(item.captured_at).slice(0, 10)) ||
      isoDate(item.record_date) > isoDate(text(item.captured_at).slice(0, 10))) return false;
  try {
    const url = new URL(text(item.source_url));
    return url.protocol === 'https:' && hosts.some((host) => url.hostname.toLowerCase() === host);
  } catch (_) {
    return false;
  }
}

function excerptSupports(item, value) {
  const claim = name(value);
  return !!(claim && name(item.evidence_text).includes(claim));
}

function classifyPostSaleOutcome(input = {}) {
  const subject = input.subject || {};
  const resolution = subject.sale_date_resolution || {};
  const saleDate = resolution.status === 'RESOLVED' ? isoDate(resolution.resolved_iso) : '';
  const today = isoDate(input.today);
  const hosts = (Array.isArray(input.official_hosts) ? input.official_hosts : []).map((host) => text(host).toLowerCase());
  const matches = (items) => (Array.isArray(items) ? items : []).filter((item) =>
    officialEvidence(item, hosts) && propertyMatches(subject, item));
  const signals = [];
  if (saleDate && today && saleDate < today) {
    for (const item of matches(input.notices).filter((record) =>
      ['trustee_sale_notice', 'tax_sale_notice'].includes(text(record.source_kind)))) {
      if (isoDate(item.record_date) > saleDate && isoDate(item.sale_date_iso) > saleDate &&
          /^(?:postponed|reposted|rescheduled)$/i.test(text(item.status)) &&
          excerptSupports(item, item.status) && excerptSupports(item, item.sale_date_iso)) {
        signals.push({ outcome: 'POSTPONED_REPOSTED', item });
      }
    }
    const deeds = matches(input.deeds).filter((item) => text(item.source_kind) === 'recorded_deed' &&
      isoDate(item.record_date) >= saleDate && text(item.grantee) && excerptSupports(item, item.grantee));
    for (const item of deeds) {
      const grantee = name(item.grantee);
      const originalOwner = name(subject.original_owner_name);
      const lenderNames = [subject.mortgagee_or_beneficiary, subject.mortgage_servicer].map(name).filter(Boolean);
      if (originalOwner && grantee === originalOwner) continue;
      const lender = lenderNames.includes(grantee) || LENDER_NAME_RE.test(grantee);
      if (!lender && !originalOwner) continue;
      signals.push({ outcome: lender ? 'REVERTED_TO_LENDER' : 'SOLD_TO_THIRD_PARTY', item });
    }
    const deedSearch = matches(input.deed_searches).find((item) =>
      text(item.source_kind) === 'official_deed_search' && item.no_post_sale_deed === true &&
      isoDate(item.searched_through) > saleDate &&
      isoDate(item.searched_through) <= isoDate(text(item.captured_at).slice(0, 10)) &&
      excerptSupports(item, 'no post-sale deed'));
    if (!deeds.length && deedSearch && name(subject.original_owner_name)) {
      for (const item of matches(input.ownership).filter((record) =>
        text(record.source_kind) === 'official_owner_record')) {
        if (isoDate(item.record_date) > saleDate && name(item.owner_name) === name(subject.original_owner_name) &&
            excerptSupports(item, item.owner_name)) {
          signals.push({ outcome: 'STILL_OWNER_LIKELY', item, supporting: deedSearch });
        }
      }
    }
  }
  const outcomes = [...new Set(signals.map((signal) => signal.outcome))];
  const conflict = outcomes.length > 1;
  const outcome = outcomes.length === 1 ? outcomes[0] : 'OUTCOME_UNKNOWN';
  const reasons = {
    POSTPONED_REPOSTED: 'A newer official notice for the same property shows a later sale date.',
    STILL_OWNER_LIKELY: 'A dated official ownership record still shows the original owner, and a dated official deed search found no later deed.',
    REVERTED_TO_LENDER: 'A recorded deed names the lender or an identifiable lender/agency as grantee.',
    SOLD_TO_THIRD_PARTY: 'A recorded deed names a grantee other than the sourced original owner or lender.',
    OUTCOME_UNKNOWN: conflict ? 'Official records disagree about what happened after the scheduled sale.' :
      'The scheduled sale date alone does not establish what happened. Check the current official records.'
  };
  const nextSteps = {
    POSTPONED_REPOSTED: 'Verify the newer sale notice and current status before considering contact.',
    STILL_OWNER_LIKELY: 'Check for later deeds and verify the current status before considering contact.',
    REVERTED_TO_LENDER: 'Watch for an official bank-owned listing; do not contact the former owner as seller.',
    SOLD_TO_THIRD_PARTY: 'Check the recorded grantee and deed; do not contact the former owner as seller.',
    OUTCOME_UNKNOWN: 'Check the county clerk and appraisal records for a newer notice, deed, or ownership update.'
  };
  return {
    sale_outcome: outcome,
    reason: reasons[outcome],
    next_step: nextSteps[outcome],
    deal_paths: outcome === 'REVERTED_TO_LENDER' ? ['bank_owned_listing'] :
      outcome === 'SOLD_TO_THIRD_PARTY' ? ['new_buyer_research'] : [],
    evidence: signals.flatMap(({ outcome: signalOutcome, item, supporting }) =>
      [item, supporting].filter(Boolean).map((record) => ({
        signal: signalOutcome,
        source_kind: text(record.source_kind),
        source_url: text(record.source_url),
        evidence_text: text(record.evidence_text),
        record_date: isoDate(record.record_date),
        captured_at: text(record.captured_at)
      }))),
    conflicts: conflict ? outcomes : [],
    // A future integration must run the existing contact gates before this can be true.
    can_contact_original_owner: false
  };
}

module.exports = { classifyPostSaleOutcome };
