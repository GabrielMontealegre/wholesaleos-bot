'use strict';

// Texas trustee/foreclosure notice text extractor - county-configurable.
// Generalized from the proven Dallas PDF notice parser: same honesty guards
// (no attorney/servicer addresses, labeled or sale-section dates only,
// digit-required case/parcel refs, no mortgagee text as owner).

const NOTICE_RE = /\b(?:notice\s+of\s+.{0,14}trustee'?s?\s+sale|substitute\s+trustee'?s?\s+sale|foreclosure\s+sale|trustee\s+sale)\b/i;
const GATE_RE = /\b(?:property\s+address|date\s+of\s+sale|sale\s+date|date,?\s+time,?\s+and\s+place\s+of\s+sale)\b/i;
const DATE_RE = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4})\b/i;
const CASE_RE = /\b(?:case|cause|suit|instrument|document|file)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([A-Za-z0-9-]{3,40})/i;
const OWNER_RE = /\b(?:borrower|mortgagor|grantor|debtor|owner)\s*(?:name)?\s*[:#-]?\s*([^|;\n]{2,100})/i;
const NON_PROPERTY_ADDRESS_CONTEXT_RE = /\b(?:attorneys?\s+at\s+law|law\s+(?:firm|offices?)|office\s+center|c\/o|whose\s+address\s+is|my\s+address\s+is|certificate\s+of\s+posting|return\s+to|mail\s+to|mortgage\s+servicer\s+is|(?:mortgage\s+)?servicer\s+address|mortgagee\s+address|beneficiary\s+address|trustee\s+address|suite\s+\d{1,5}|place\s*of\s*sale|courthouse|front\s+steps|area\s+(?:immediately\s+)?outside)\b/i;
const STREET_SUFFIX = "(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)";
const TABULAR_NOTICE_HEADER_RE = /\bDOCUMENT\s*NUMBER\s*TYPE\s*ADDRESS\s*CITY\/TOWN\s*ZIP\b/i;
const TABULAR_NOTICE_ROW_RE = /^\s*([A-Z0-9-]{5,24})\s+(MORTGAGE|TAX)\s+(.+?)\s+(\d{5})(?:\s|$)/i;
const TABULAR_NOTICE_DOC_NUMBER_ONLY_RE = /^\s*([A-Z0-9-]{5,24})\s*$/i;
const TABULAR_NOTICE_COMPACT_ROW_RE = /^\s*(MORTGAGE|TAX)(.+)$/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function streetAddressRe(cityNames) {
  const cities = (Array.isArray(cityNames) ? cityNames : []).filter(Boolean).join('|');
  return new RegExp(
    "\\b\\d{1,7}\\s+[A-Za-z0-9][A-Za-z0-9 .#'/-]{1,90}?\\b" + STREET_SUFFIX + "\\b\\.?" +
    "(?:\\s+(?:apt|unit|#)\\s*[A-Za-z0-9-]+)?" +
    (cities ? "(?:\\s*,?\\s+(?:" + cities + "))?" : '') +
    "(?:\\s*,?\\s+(?:TX|Texas))?(?:\\s*,?\\s+\\d{5}(?:-\\d{4})?)?",
    'ig'
  );
}

function saleDateFromWindow(text) {
  const source = cleanText(text);
  const labeled = source.match(/\b(?:sale\s+date|date\s+of\s+sale|trustee\s+sale\s+date|foreclosure\s+sale\s+date|auction\s+date)\b\s*[:#-]?\s*([^|;\n]{4,80})/i);
  const labeledDate = cleanText(labeled && labeled[1]).match(DATE_RE);
  if (labeledDate) return cleanText(labeledDate[0]);
  const section = source.match(/date,?\s+time,?\s+and\s+place\s+of\s+sale\.?\s*(?:date\s*[:#-]?\s*)?([^|;]{4,120})/i);
  const sectionDate = cleanText(section && section[1]).match(DATE_RE);
  return sectionDate ? cleanText(sectionDate[0]) : '';
}

function noticeWindow(source, index) {
  const before = source.slice(0, Math.max(0, index));
  const after = source.slice(index);
  const markerRe = new RegExp(NOTICE_RE.source, 'ig');
  let start = Math.max(0, index - 1400);
  let match;
  while ((match = markerRe.exec(before))) start = Math.max(start, match.index);
  markerRe.lastIndex = 0;
  const next = markerRe.exec(after.slice(300));
  const end = next ? index + 300 + next.index : Math.min(source.length, index + 1800);
  return cleanText(source.slice(start, end));
}

function ownerFromWindow(windowText) {
  const source = cleanText(windowText);
  const patterns = [
    OWNER_RE,
    /(?:executed\s+by|deed\s+of\s+trust\s+.{0,40}?\bwith)\s+([A-Z][A-Za-z ,.'&-]{4,80}?),?\s*(?:\(|,)?\s*(?:and\s+wife|grantor|securing|mortgagor)/i,
    /\b([A-Z][A-Z .,'&-]{4,80}?),?\s*\(?\s*grantor/
  ];
  for (const re of patterns) {
    const match = source.match(re);
    const candidate = cleanText(match && match[1]).replace(/\b(?:property\s+address|address|sale|date|case|cause|parcel|account|substitute|trustee)\b.*$/i, '').replace(/[,.]$/, '').trim();
    if (!/^[A-Za-z]/.test(candidate)) continue;
    if (/\b(?:mortgagee|mortgage\s+electronic|registration\s+systems|mers|bank|servicer|beneficiary|nominee|n\.?\s?a\.?|llc|l\.?l\.?p\.?|obligations?)\b/i.test(candidate)) continue;
    return candidate;
  }
  return '';
}

function knownCityAtEnd(value, cityNames) {
  const source = cleanText(value);
  const cities = (Array.isArray(cityNames) ? cityNames : [])
    .map(cleanText)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const city of cities) {
    const re = new RegExp(`\\b${String(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (re.test(source)) {
      return {
        city,
        street: cleanText(source.replace(re, ''))
      };
    }
  }
  return { city: '', street: source };
}

function tabularNoticeParserSignature() {
  return 'tabular-notice-v2';
}

function extractTabularForeclosureListRows(source, profile = {}, context = {}) {
  if (!TABULAR_NOTICE_HEADER_RE.test(source)) return [];
  const county = cleanText(profile.county) || 'Unknown';
  const excludedRe = profile.excluded_addresses_re ||
    (cleanText(profile.excluded_address_pattern) ? new RegExp(profile.excluded_address_pattern, 'i') : null);
  const rows = [];
  const seen = new Set();
  const lines = String(source || '').replace(/\r/g, '\n').split('\n');
  let pendingDocumentNumber = '';
  for (const rawLine of lines) {
    const line = cleanText(rawLine);
    if (!line) continue;
    const docNumberOnly = line.match(TABULAR_NOTICE_DOC_NUMBER_ONLY_RE);
    if (docNumberOnly) {
      pendingDocumentNumber = cleanText(docNumberOnly[1]);
      continue;
    }
    let documentNumber = '';
    let foreclosureType = '';
    let addressAndCity = '';
    let zip = '';
    const compactMatch = line.match(TABULAR_NOTICE_ROW_RE);
    if (compactMatch) {
      documentNumber = cleanText(compactMatch[1]);
      foreclosureType = cleanText(compactMatch[2]).toUpperCase();
      addressAndCity = cleanText(compactMatch[3]);
      zip = cleanText(compactMatch[4]);
    } else if (pendingDocumentNumber) {
      const rowMatch = line.match(TABULAR_NOTICE_COMPACT_ROW_RE);
      if (!rowMatch) continue;
      documentNumber = pendingDocumentNumber;
      pendingDocumentNumber = '';
      foreclosureType = cleanText(rowMatch[1]).toUpperCase();
      const rest = cleanText(rowMatch[2]);
      const zipMatch = rest.match(/(\d{5})(?:-\d{4})?\s*$/);
      if (!zipMatch) continue;
      zip = cleanText(zipMatch[1]);
      addressAndCity = cleanText(rest.slice(0, zipMatch.index));
    } else {
      continue;
    }
    if (!documentNumber || !foreclosureType || !addressAndCity || !zip) continue;
    const citySplit = knownCityAtEnd(addressAndCity, profile.city_names);
    const city = citySplit.city;
    const street = citySplit.street;
    if (!city || !street) continue;
    if (NON_PROPERTY_ADDRESS_CONTEXT_RE.test(line)) continue;
    const hasStreetNumber = /^\d{1,7}\b/.test(street);
    const address = hasStreetNumber ? cleanText(`${street}, ${city}, TX ${zip}`) : '';
    const partialAddress = hasStreetNumber ? '' : cleanText(`${street}, ${city}, TX ${zip}`);
    if (excludedRe && excludedRe.test(address || partialAddress)) continue;
    const key = `${cleanText(context.source_proof_url)}|${documentNumber}|${address || partialAddress}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const proofText = [
      `Document Number: ${documentNumber}`,
      `Type: ${foreclosureType}`,
      hasStreetNumber ? `Address: ${address}` : `Source address text: ${partialAddress}`,
      `ZIP: ${zip}`
    ].filter(Boolean).join(' | ');
    rows.push({
      address,
      property_address: address,
      partial_address: partialAddress,
      county,
      city,
      state: cleanText(profile.state) || 'TX',
      owner_name: '',
      case_number: documentNumber,
      source_row_reference: documentNumber,
      sale_date: '',
      auction_date: '',
      event_type: `${foreclosureType} Foreclosure List Row`,
      source_text: proofText,
      source_proof_text: proofText.slice(0, 800),
      raw_text: cleanText(line).slice(0, 1200),
      source_url: cleanText(context.source_url),
      source_document_url: cleanText(context.source_proof_url),
      source_proof_url: cleanText(context.source_proof_url),
      source_reference: cleanText(context.source_reference || `official ${county} County foreclosure notice document`),
      missing_evidence: [].concat(hasStreetNumber ? [] : ['street number'], ['sale or auction date']),
      extraction_method: 'tx_tabular_foreclosure_list_text_extractor',
      extraction_confidence: hasStreetNumber ? 'Medium' : 'Low',
      preview_only: true,
      should_ingest: false
    });
    if (rows.length >= (profile.max_rows || 10)) break;
  }
  return rows;
}

// profile: { county, state, city_names[], excluded_addresses_re, max_rows }
function extractTrusteeNoticeRows(text, profile = {}, context = {}) {
  const source = String(text || '').replace(/\r/g, '\n');
  const tabularRows = extractTabularForeclosureListRows(source, profile, context);
  if (tabularRows.length >= (profile.max_rows || 10)) return tabularRows.slice(0, profile.max_rows || 10);
  if (!NOTICE_RE.test(source) && !GATE_RE.test(source)) return tabularRows;
  const county = cleanText(profile.county) || 'Unknown';
  const excludedRe = profile.excluded_addresses_re ||
    (cleanText(profile.excluded_address_pattern) ? new RegExp(profile.excluded_address_pattern, 'i') : null);
  const rows = [];
  const seen = new Set();
  const addressRe = streetAddressRe(profile.city_names);
  let match;
  while ((match = addressRe.exec(source))) {
    const precedingContext = source.slice(Math.max(0, match.index - 140), match.index);
    if (NON_PROPERTY_ADDRESS_CONTEXT_RE.test(precedingContext)) continue;
    const address = cleanText(match[0]).replace(/\s+,/g, ',');
    // Require a zip, or at least a known city from the county profile -
    // "123 Somewhere Rd, TX" alone is too weak to present as a property.
    const hasZip = /\d{5}/.test(address);
    const hasKnownCity = (Array.isArray(profile.city_names) ? profile.city_names : [])
      .some((city) => city && new RegExp(`\\b${String(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(address));
    if (!hasZip && !hasKnownCity) continue;
    if (excludedRe && excludedRe.test(address)) continue;
    const windowText = noticeWindow(source, match.index);
    const saleDate = saleDateFromWindow(windowText);
    const key = `${cleanText(context.source_proof_url)}|${address.toLowerCase()}|${saleDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const caseCandidate = cleanText((windowText.match(CASE_RE) || [])[1]);
    const proofText = [
      `Property Address: ${address}`,
      saleDate ? `Sale Date: ${saleDate}` : '',
      windowText
    ].filter(Boolean).join(' | ');
    rows.push({
      address,
      property_address: address,
      county,
      state: cleanText(profile.state) || 'TX',
      owner_name: ownerFromWindow(windowText),
      case_number: /\d/.test(caseCandidate) ? caseCandidate : '',
      sale_date: saleDate,
      auction_date: saleDate,
      event_type: 'Notice of Trustee/Foreclosure Sale',
      source_text: proofText,
      source_proof_text: proofText.slice(0, 800),
      raw_text: proofText.slice(0, 1200),
      source_url: cleanText(context.source_url),
      source_document_url: cleanText(context.source_proof_url),
      source_proof_url: cleanText(context.source_proof_url),
      source_reference: cleanText(context.source_reference || `official ${county} County foreclosure notice document`),
      missing_evidence: [].concat(saleDate ? [] : ['sale or auction date']),
      extraction_method: 'tx_trustee_notice_text_extractor',
      extraction_confidence: saleDate ? 'Medium' : 'Low',
      preview_only: true,
      should_ingest: false
    });
    if (rows.length >= (profile.max_rows || 10)) break;
  }
  return tabularRows.concat(rows).slice(0, profile.max_rows || 10);
}

module.exports = {
  extractTrusteeNoticeRows,
  extractTabularForeclosureListRows,
  saleDateFromWindow,
  tabularNoticeParserSignature
};
