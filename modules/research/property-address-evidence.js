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

function addressCandidates(text) {
  const source = String(text || '').replace(/\r/g, '\n');
  const candidates = [];
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
    candidates.push({
      address,
      raw_address: cleanText(match[0]),
      role,
      evidence_text: cleanText(source.slice(Math.max(0, match.index - 100), Math.min(source.length, regex.lastIndex + 100))),
      index: match.index
    });
  }
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
    candidates
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
