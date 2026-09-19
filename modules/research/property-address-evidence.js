'use strict';

const propertyIdentity = require('./property-identity');
const { NON_PROPERTY_ADDRESS_CONTEXT_RE } = require('./tx-trustee-notice-text-extractor');

const STREET_SUFFIX = '(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)';
const ADDRESS_RE = new RegExp(
  "\\b(\\d{1,7}\\s+[A-Za-z][A-Za-z0-9 .#'/-]{0,80}?\\b" + STREET_SUFFIX + "\\.?(?:\\s+(?:apt|unit|#)\\s*[A-Za-z0-9-]+)?)" +
  "\\s*,?\\s+([A-Za-z][A-Za-z .'-]{0,40}?)\\s*,\\s*(TX|Texas|[A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)\\b",
  'ig'
);
const SUBJECT_CONTEXT_RE = /\b(?:property\s+address|property\s+commonly\s+known\s+as|real\s+property\s+(?:located|known)\s+at|situs\s+address|subject\s+property)\s*[:#-]?/ig;
const SALE_VENUE_CONTEXT_RE = /\b(?:place\s*of\s*sale|sale\s+location|auction\s+venue|courthouse|front\s+steps|area\s+(?:immediately\s+)?outside)\b/ig;
const FULL_MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
const STRICT_DATE_PREFIX = `(?:19\\d{2}|20\\d{2}|${FULL_MONTH}\\s+\\d{1,2}(?:,\\s*|\\s+)\\d{4}|\\d{2}\\/\\d{2}\\/\\d{4}|\\d{4}-\\d{2}-\\d{2})`;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function lastMatchIndex(text, regex) {
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let index = -1;
  let match;
  while ((match = re.exec(text))) index = match.index;
  return index;
}

function canonicalAddress(street, city, state, zip) {
  const parsed = propertyIdentity.parseAddress(`${cleanText(street).replace(/\.$/, '')}, ${cleanText(city)}, ${cleanText(state) === 'Texas' ? 'TX' : cleanText(state)} ${cleanText(zip)}`);
  return parsed.complete ? cleanText(parsed.full_address) : '';
}

function labelledDatePrefixAnalysis(text) {
  const source = String(text || '').replace(/\r/g, '\n');
  const candidates = [];
  const rejections = [];
  const labelRe = new RegExp(SUBJECT_CONTEXT_RE.source, SUBJECT_CONTEXT_RE.flags);
  const months = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };

  function validDateToken(value) {
    const token = cleanText(value);
    if (/^(?:19|20)\d{2}$/.test(token)) return true;
    let match = token.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let year;
    let month;
    let day;
    if (match) {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else {
      match = token.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        year = Number(match[3]);
        month = Number(match[1]);
        day = Number(match[2]);
      } else {
        match = token.match(new RegExp(`^(${FULL_MONTH})\\s+(\\d{1,2})(?:,\\s*|\\s+)(\\d{4})$`, 'i'));
        if (!match) return false;
        year = Number(match[3]);
        month = months[match[1].toLowerCase()];
        day = Number(match[2]);
      }
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    return year >= 1900 && year <= 2099 &&
      date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function rejection(labelIndex, reasonCode, skippedDatePrefix) {
    rejections.push({
      index: labelIndex,
      reason_code: reasonCode,
      skipped_date_prefix: cleanText(skippedDatePrefix)
    });
  }

  let labelMatch;
  while ((labelMatch = labelRe.exec(source))) {
    const labelStart = labelMatch.index;
    const tailStart = labelStart + labelMatch[0].length;
    const clauseStart = Math.max(
      source.lastIndexOf('\n', labelStart - 1),
      source.lastIndexOf('|', labelStart - 1),
      source.lastIndexOf(';', labelStart - 1),
      source.lastIndexOf('.', labelStart - 1)
    ) + 1;
    const guardedContext = source.slice(clauseStart, tailStart);
    if (NON_PROPERTY_ADDRESS_CONTEXT_RE.test(guardedContext)) {
      rejection(labelStart, 'labelled_date_prefix_non_property_context', '');
      continue;
    }

    const tail = source.slice(tailStart, Math.min(source.length, tailStart + 220));
    const addressRe = new RegExp(ADDRESS_RE.source, ADDRESS_RE.flags);
    const addressMatch = addressRe.exec(tail);
    const leadingDate = tail.match(new RegExp(`^[\\s,:-]*(${STRICT_DATE_PREFIX})[\\s,:-]+`, 'i'));
    if (!addressMatch) {
      if (leadingDate && validDateToken(leadingDate[1])) {
        rejection(labelStart, 'labelled_date_prefix_address_incomplete', leadingDate[1]);
      } else {
        const invalidLeadingDate = tail.match(/^[\s,:-]*((?:\d{1,2}\/\d{1,2}\/\d{3,4}|\d{3,4}(?:-\d{2}-\d{2})?|[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*|\s+)\d{3,4}))(?=\s+\d{1,7}\s+)/i);
        if (invalidLeadingDate) rejection(labelStart, 'labelled_date_prefix_invalid', invalidLeadingDate[1]);
      }
      continue;
    }

    const between = tail.slice(0, addressMatch.index);
    if (!cleanText(between.replace(/[,:-]/g, ' '))) {
      const streetNumbers = cleanText(addressMatch[1]).match(/\b\d+\b/g) || [];
      if (/^(?:19|20)\d{2}\b/.test(cleanText(addressMatch[1])) && streetNumbers.length > 1) {
        rejection(labelStart, 'labelled_date_prefix_intervening_text', cleanText(addressMatch[1]));
      }
      continue;
    }
    const prefixMatch = between.match(new RegExp(`^[\\s,:-]*(${STRICT_DATE_PREFIX})[\\s,:-]*$`, 'i'));
    if (!prefixMatch || !validDateToken(prefixMatch[1])) {
      const looksDateLike = /\d/.test(between) || new RegExp(FULL_MONTH, 'i').test(between) || /^[\s,:-]*[A-Za-z]{3}\b/.test(between);
      rejection(labelStart, looksDateLike ? 'labelled_date_prefix_invalid' : 'labelled_date_prefix_intervening_text', between);
      continue;
    }

    const address = canonicalAddress(addressMatch[1], addressMatch[2], addressMatch[3], addressMatch[4]);
    if (!address) {
      rejection(labelStart, 'labelled_date_prefix_address_incomplete', prefixMatch[1]);
      continue;
    }
    const addressStart = tailStart + addressMatch.index;
    const addressEnd = addressStart + addressMatch[0].length;
    const rawAddress = cleanText(source.slice(addressStart, addressEnd));
    if (!cleanText(source).includes(rawAddress)) {
      rejection(labelStart, 'labelled_date_prefix_address_not_verbatim', prefixMatch[1]);
      continue;
    }
    candidates.push({
      address,
      raw_address: rawAddress,
      role: 'subject_property',
      evidence_text: cleanText(source.slice(Math.max(0, labelStart - 40), Math.min(source.length, addressEnd + 100))),
      index: addressStart,
      label_index: labelStart,
      skipped_date_prefix: cleanText(prefixMatch[1]),
      recovered_phrase: cleanText(source.slice(labelStart, addressEnd))
    });
  }
  return { candidates, rejections };
}

function addressCandidates(text) {
  const source = String(text || '').replace(/\r/g, '\n');
  const candidates = [];
  const datePrefixAnalysis = labelledDatePrefixAnalysis(source);
  const regex = new RegExp(ADDRESS_RE.source, ADDRESS_RE.flags);
  let match;
  while ((match = regex.exec(source))) {
    const numericPrefix = source.slice(Math.max(0, match.index - 20), match.index);
    if (/\d\s+$/.test(numericPrefix)) continue;
    const address = canonicalAddress(match[1], match[2], match[3], match[4]);
    if (!address) continue;
    const before = source.slice(Math.max(0, match.index - 220), match.index);
    const subjectIndex = lastMatchIndex(before, SUBJECT_CONTEXT_RE);
    const nonPropertyIndex = lastMatchIndex(before, NON_PROPERTY_ADDRESS_CONTEXT_RE);
    const saleVenueIndex = lastMatchIndex(before, SALE_VENUE_CONTEXT_RE);
    const role = nonPropertyIndex >= subjectIndex && nonPropertyIndex >= 0
      ? (saleVenueIndex === nonPropertyIndex ? 'sale_venue' : 'non_property_address')
      : subjectIndex >= 0
        ? 'subject_property'
        : 'unlabeled_address';
    const governedByDatePrefix = role === 'subject_property' && (
      datePrefixAnalysis.rejections.some((item) => match.index >= item.index && match.index <= item.index + 220) ||
      datePrefixAnalysis.candidates.some((item) => match.index >= item.label_index && match.index < item.index)
    );
    if (governedByDatePrefix) continue;
    candidates.push({
      address,
      raw_address: cleanText(match[0]),
      role,
      evidence_text: cleanText(source.slice(Math.max(0, match.index - 100), Math.min(source.length, regex.lastIndex + 100))),
      index: match.index
    });
  }
  for (const candidate of datePrefixAnalysis.candidates) {
    if (!candidates.some((existing) => existing.index === candidate.index && existing.address === candidate.address)) {
      const outputCandidate = Object.assign({}, candidate);
      delete outputCandidate.label_index;
      candidates.push(outputCandidate);
    }
  }
  candidates.sort((left, right) => left.index - right.index);
  Object.defineProperty(candidates, 'date_prefix_rejections', {
    configurable: false,
    enumerable: false,
    value: datePrefixAnalysis.rejections,
    writable: false
  });
  return candidates;
}

function extractPropertyAddressEvidence(text) {
  const candidates = addressCandidates(text);
  const subject = candidates.find((candidate) => candidate.role === 'subject_property') || null;
  const venue = candidates.find((candidate) => candidate.role === 'sale_venue') || null;
  return {
    subject_address: subject ? subject.address : '',
    subject_evidence_text: subject ? subject.evidence_text : '',
    sale_venue_address: venue ? venue.address : '',
    sale_venue_evidence_text: venue ? venue.evidence_text : '',
    candidates,
    date_prefix_rejections: candidates.date_prefix_rejections || []
  };
}

function roleForAddressInText(address, text) {
  const target = propertyIdentity.canonicalAddress(cleanText(address)).toLowerCase();
  if (!target) return '';
  const candidate = addressCandidates(text).find((item) => item.address.toLowerCase() === target);
  return candidate ? candidate.role : '';
}

function isSourceSupportedSubjectAddress(row) {
  const normalized = cleanText(row && row.normalized_address);
  if (!normalized) return false;
  const text = [
    row && row.source_proof_text,
    row && row.source_text,
    row && row.source_excerpt,
    row && row.motivation_evidence_text,
    row && row.sale_venue_evidence_text
  ].map(cleanText).filter(Boolean).join(' | ');
  const normalizedKey = propertyIdentity.canonicalAddress(normalized).toLowerCase();
  const evidence = text ? extractPropertyAddressEvidence(text) : null;
  if (evidence && evidence.candidates.some((candidate) =>
    candidate.role !== 'subject_property' && candidate.role !== 'unlabeled_address' &&
    candidate.address.toLowerCase() === normalizedKey)) return false;
  if (row && row.property_identity_source_only !== true) return true;
  if (row && row.source_structured_address_verified !== true) return false;
  if (!evidence) return false;
  return !evidence.subject_address || evidence.subject_address.toLowerCase() === normalizedKey;
}

module.exports = {
  addressCandidates,
  extractPropertyAddressEvidence,
  isSourceSupportedSubjectAddress,
  roleForAddressInText
};
