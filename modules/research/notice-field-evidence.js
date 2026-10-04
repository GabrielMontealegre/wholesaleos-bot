'use strict';

const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');

const DATE_RE = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4})\b/i;
const SALE_LABEL_RE = /\b(?:trustee\s+sale\s+date|foreclosure\s+sale\s+date|auction\s+date|sale\s+date|date\s+of\s+sale(?:\s+of\s+property)?)\s*[:#-]?\s*/gi;
const SALE_SECTION_RE = /\bdate,?\s+time,?\s+and\s+place\s+of\s+sale\b/gi;
const STREET_RE = /\b\d{1,7}\s+(?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\.?\s+)?[A-Za-z][A-Za-z0-9.'/-]*(?:\s+[A-Za-z0-9.'/-]+){0,7}?\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b\.?/gi;
const PROPERTY_LABEL_RE = /\b(?:property\s+address|commonly\s+known\s+as|property\s+to\s+be\s+sold)\s*[:#-]?/gi;
const NON_PROPERTY_ADDRESS_CONTEXT_RE = /\b(?:attorneys?\s+at\s+law|law\s+(?:firm|offices?)|office\s+center|c\/o|whose\s+address\s+is|my\s+address\s+is|certificate\s+of\s+posting|return\s+to|mail\s+to|mortgage\s+servicer\s+is|(?:mortgage\s+)?servicer\s+address|mortgagee\s+address|beneficiary\s+address|trustee\s+address|lender\s+address|escrow\s+address|auction(?:eer|\s+company)?\s+address|registered\s+agent\s+address|government\s+office|county\s+clerk\s+address|sheriff'?s?\s+office|suite\s+\d{1,5}|place\s*of\s*sale|sale\s+location|auction\s+venue|courthouse|front\s+steps|area\s+(?:immediately\s+)?outside)\b/i;
const SALE_DATE_ORIGINS = new Set(['labeled_sale_date', 'sale_section_date']);
const PROPERTY_ADDRESS_ORIGINS = new Set(['property_address_label', 'commonly_known_as', 'property_to_be_sold']);

function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }

function labeledSaleDate(text) {
  const source = clean(text);
  let match;
  SALE_LABEL_RE.lastIndex = 0;
  while ((match = SALE_LABEL_RE.exec(source))) {
    const tail = source.slice(SALE_LABEL_RE.lastIndex, SALE_LABEL_RE.lastIndex + 80)
      .split(/\b(?:deed\s+of\s+trust|recorded|filed|property\s+address|mortgagee|grantor)\b/i)[0];
    const date = tail.match(DATE_RE);
    if (date && date.index <= 30) return { date: clean(date[0]), origin: 'labeled_sale_date' };
  }
  SALE_SECTION_RE.lastIndex = 0;
  while ((match = SALE_SECTION_RE.exec(source))) {
    const tail = source.slice(SALE_SECTION_RE.lastIndex, SALE_SECTION_RE.lastIndex + 160);
    const dateLabel = tail.match(/\bdate\s*[:#-]\s*/i);
    if (!dateLabel || dateLabel.index > 80) continue;
    const date = tail.slice(dateLabel.index + dateLabel[0].length, dateLabel.index + dateLabel[0].length + 50).match(DATE_RE);
    if (date && date.index <= 30) return { date: clean(date[0]), origin: 'sale_section_date' };
  }
  return { date: '', origin: '' };
}

function sameStreet(left, right) {
  const streetRe = new RegExp(STREET_RE.source, 'i');
  const a = canonicalizeAddress((clean(left).match(streetRe) || [left])[0]);
  const b = canonicalizeAddress((clean(right).match(streetRe) || [right])[0]);
  return !!a.number && a.number === b.number && !!a.street && a.street === b.street &&
    !!a.suffix && a.suffix === b.suffix && (a.directional || '') === (b.directional || '');
}

function latestMatchBefore(regex, source, end) {
  const search = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let last = null;
  let match;
  while ((match = search.exec(source)) && match.index < end) last = match;
  return last;
}

function propertyAddressOrigin(text, address) {
  const source = clean(text);
  const streetRe = new RegExp(STREET_RE.source, 'gi');
  let match;
  while ((match = streetRe.exec(source))) {
    if (address && !sameStreet(match[0], address)) continue;
    const label = latestMatchBefore(PROPERTY_LABEL_RE, source, match.index);
    if (!label) continue;
    const distance = match.index - (label.index + label[0].length);
    const limit = /property\s+to\s+be\s+sold/i.test(label[0]) ? 350 : 100;
    if (distance < 0 || distance > limit) continue;
    const intervening = source.slice(label.index + label[0].length, match.index);
    NON_PROPERTY_ADDRESS_CONTEXT_RE.lastIndex = 0;
    if (NON_PROPERTY_ADDRESS_CONTEXT_RE.test(intervening)) continue;
    if (/property\s+address/i.test(label[0])) return 'property_address_label';
    if (/commonly\s+known\s+as/i.test(label[0])) return 'commonly_known_as';
    return 'property_to_be_sold';
  }
  return '';
}

function sourcePropertyAddress(text) {
  const source = clean(text);
  const streetRe = new RegExp(STREET_RE.source, 'gi');
  let match;
  while ((match = streetRe.exec(source))) {
    if (propertyAddressOrigin(source, match[0])) {
      const rest = source.slice(match.index, Math.min(source.length, streetRe.lastIndex + 75));
      return clean(rest.match(/^.*?\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b\.?(?:\s*,?\s*[A-Za-z][A-Za-z .'-]*,?\s*(?:TX|Texas|[A-Z]{2})\s*\d{5}(?:-\d{4})?)?/i)?.[0] || match[0]);
    }
  }
  return '';
}

module.exports = {
  SALE_DATE_ORIGINS, PROPERTY_ADDRESS_ORIGINS, NON_PROPERTY_ADDRESS_CONTEXT_RE,
  labeledSaleDate, propertyAddressOrigin, sourcePropertyAddress, sameStreet
};
