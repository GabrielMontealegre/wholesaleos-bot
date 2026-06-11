'use strict';

const STATE_ALIASES = {
  texas: 'TX'
};

const STREET_SUFFIXES = {
  street: 'St',
  st: 'St',
  avenue: 'Ave',
  ave: 'Ave',
  road: 'Rd',
  rd: 'Rd',
  drive: 'Dr',
  dr: 'Dr',
  lane: 'Ln',
  ln: 'Ln',
  court: 'Ct',
  ct: 'Ct',
  boulevard: 'Blvd',
  blvd: 'Blvd',
  circle: 'Cir',
  cir: 'Cir',
  place: 'Pl',
  pl: 'Pl',
  parkway: 'Pkwy',
  pkwy: 'Pkwy',
  highway: 'Hwy',
  hwy: 'Hwy',
  terrace: 'Ter',
  ter: 'Ter',
  trail: 'Trl',
  trl: 'Trl',
  loop: 'Loop',
  way: 'Way'
};

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function pick(obj, keys) {
  obj = obj || {};
  for (const key of keys) {
    const parts = String(key).split('.');
    let cursor = obj;
    for (const part of parts) {
      if (!cursor || typeof cursor !== 'object') {
        cursor = undefined;
        break;
      }
      cursor = cursor[part];
    }
    if (cursor !== undefined && cursor !== null && cleanText(cursor)) return cursor;
  }
  return '';
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function normalizeState(value) {
  const text = cleanText(value);
  if (!text) return '';
  const lower = text.toLowerCase();
  return (STATE_ALIASES[lower] || text).toUpperCase();
}

function normalizeZip(value) {
  const match = cleanText(value).match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : '';
}

function titleCaseWord(word) {
  const text = cleanText(word);
  if (!text) return '';
  const lower = text.toLowerCase().replace(/\.$/, '');
  if (STREET_SUFFIXES[lower]) return STREET_SUFFIXES[lower];
  if (/^(tx|dc)$/i.test(lower)) return lower.toUpperCase();
  if (/^\d+[a-z]?$/i.test(text)) return text.toUpperCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function titleCaseText(value) {
  return cleanText(value)
    .replace(/[,_]+/g, ' ')
    .split(/\s+/)
    .map(titleCaseWord)
    .filter(Boolean)
    .join(' ');
}

function normalizeStreet(value) {
  return titleCaseText(cleanText(value).replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' '));
}

function formatAddress(parts) {
  const street = normalizeStreet(parts && parts.street);
  const city = titleCaseText(parts && parts.city);
  const state = normalizeState(parts && parts.state);
  const zip = normalizeZip(parts && parts.zip);
  const stateZip = [state, zip].filter(Boolean).join(' ');
  return [street, city, stateZip].filter(Boolean).join(', ');
}

function streetNumber(value) {
  const match = cleanText(value).match(/^\s*(\d{1,7})\b/);
  return match ? match[1] : '';
}

function hasStreetShape(value) {
  return /\b\d{1,7}\b/.test(cleanText(value)) &&
    /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b/i.test(cleanText(value));
}

function parseAddress(value) {
  const text = cleanText(value).replace(/\s*,\s*/g, ', ');
  if (!text) return { street: '', city: '', state: '', zip: '', full_address: '' };
  const parts = text.split(',').map(cleanText).filter(Boolean);
  let street = '';
  let city = '';
  let state = '';
  let zip = '';

  if (parts.length >= 2) {
    street = parts[0];
    const tail = parts.slice(1).join(' ');
    const stateZip = tail.match(/\b(TX|Texas|[A-Z]{2})\b\.?\s*(\d{5}(?:-\d{4})?)?\b/i);
    if (stateZip) {
      state = stateZip[1];
      zip = stateZip[2] || '';
      city = cleanText(tail.slice(0, stateZip.index));
    } else if (!/^\d+$/.test(parts[1]) && parts[1] !== streetNumber(street)) {
      city = parts[1];
      zip = normalizeZip(tail);
    }
  } else {
    const complete = text.match(/^(.+?)\s+([A-Za-z][A-Za-z .'-]*?)\s+(TX|Texas|[A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
    if (complete) {
      street = complete[1];
      city = complete[2];
      state = complete[3];
      zip = complete[4];
    } else {
      street = text.replace(/\b(TX|Texas|[A-Z]{2})\b\.?\s*\d{5}(?:-\d{4})?\s*$/i, '').trim();
    }
  }

  const full = formatAddress({ street, city, state, zip });
  return {
    street: normalizeStreet(street),
    city: titleCaseText(city),
    state: normalizeState(state),
    zip: normalizeZip(zip),
    full_address: full,
    complete: !!(hasStreetShape(street) && city && normalizeState(state) && normalizeZip(zip)),
    malformed: !!(street && parts.length === 2 && (parts[1] === streetNumber(street) || /^\d+$/.test(parts[1])))
  };
}

function decodePath(value) {
  try {
    return decodeURIComponent(value || '');
  } catch (_) {
    return value || '';
  }
}

function slugToText(value) {
  return cleanText(decodePath(value).replace(/[_-]+/g, ' '));
}

function addressFromPropertyUrl(sourceUrl, title) {
  const raw = cleanText(sourceUrl);
  if (!isHttpUrl(raw)) return { street: '', city: '', state: '', zip: '', full_address: '' };
  let host = '';
  let pathText = '';
  try {
    const parsed = new URL(raw);
    host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    pathText = decodePath(parsed.pathname || '');
  } catch (_) {
    return { street: '', city: '', state: '', zip: '', full_address: '' };
  }
  let street = '';
  let city = '';
  let state = '';
  let zip = '';

  if (/redfin\.com$/i.test(host)) {
    const match = pathText.match(/\/(?<state>[A-Za-z]{2})\/(?<city>[^/]+)\/(?<street>[^/]+)\/home\/\d+/i);
    if (match && match.groups) {
      state = match.groups.state;
      city = slugToText(match.groups.city);
      const tokens = slugToText(match.groups.street).split(/\s+/).filter(Boolean);
      if (tokens.length && /^\d{5}(?:-\d{4})?$/.test(tokens[tokens.length - 1])) zip = tokens.pop();
      street = tokens.join(' ');
    }
  } else if (/realtor\.com$/i.test(host)) {
    const match = pathText.match(/\/realestateandhomes-detail\/([^/?#]+)/i);
    const parts = cleanText(match && match[1] || '').split('_').map(slugToText).filter(Boolean);
    street = parts[0] || '';
    city = parts[1] || '';
    state = parts[2] || '';
    zip = parts[3] || '';
  } else if (/zillow\.com$/i.test(host)) {
    const match = pathText.match(/\/homedetails\/([^/?#]+)/i);
    const parts = cleanText(match && match[1] || '').split('_').map(slugToText).filter(Boolean);
    street = parts[0] || '';
    city = parts[1] || '';
    state = parts[2] || '';
    zip = parts[3] || '';
  } else if (/har\.com$/i.test(host)) {
    const match = pathText.match(/\/homedetail\/([^/?#]+)/i);
    const tokens = cleanText(match && match[1] || '').split('-').map(cleanText).filter(Boolean);
    if (tokens.length) {
      if (/^\d{5}(?:-\d{4})?$/.test(tokens[tokens.length - 1])) zip = tokens.pop();
      if (tokens.length && /^[A-Za-z]{2}$/.test(tokens[tokens.length - 1])) state = tokens.pop();
      if (tokens.length) city = tokens.pop();
      street = tokens.join(' ');
    }
  }

  if (!street && title) {
    const parsed = parseAddress(title);
    street = parsed.street;
    city = parsed.city;
    state = parsed.state;
    zip = parsed.zip;
  }

  const full = formatAddress({ street, city, state, zip });
  return {
    street: normalizeStreet(street),
    city: titleCaseText(city),
    state: normalizeState(state),
    zip: normalizeZip(zip),
    full_address: full,
    complete: !!(hasStreetShape(street) && city && normalizeState(state) && normalizeZip(zip)),
    address_extracted_from_source_url: !!full,
    basis: full ? 'Address extracted from property URL - verify before offer.' : ''
  };
}

function sourceUrlFrom(input) {
  return cleanText(pick(input, [
    'lead_evidence.canonical_source_url',
    'canonical_source_url',
    'source_url',
    'sourceUrl',
    'source_proof_url',
    'sourceProofUrl',
    'source_record_url',
    'record_url',
    'source_details.source_url',
    'source_details.record_url',
    'scout_context.canonical_source_url',
    'scout_context.source_url'
  ]));
}

function structuredFields(input) {
  return {
    street: cleanText(pick(input, ['street', 'street_address', 'address', 'property_address', 'address_or_source_text', 'display_address', 'input_value', 'normalized_address'])),
    city: cleanText(pick(input, ['city', 'property_city', 'situs_city', 'city_candidate', 'scout_context.city'])),
    state: cleanText(pick(input, ['state', 'property_state', 'situs_state', 'state_candidate', 'scout_context.state'])),
    zip: cleanText(pick(input, ['zip', 'zipcode', 'postal_code', 'property_zip', 'situs_zip', 'zip_candidate', 'scout_context.zip']))
  };
}

function candidateScore(candidate, base) {
  if (!candidate || !candidate.full_address || !hasStreetShape(candidate.street || candidate.full_address)) return -1;
  let score = base || 0;
  if (candidate.complete) score += 50;
  if (candidate.city) score += 10;
  if (candidate.state) score += 10;
  if (candidate.zip) score += 10;
  if (candidate.malformed) score -= 80;
  return score;
}

function canonicalAddress(input, overrides) {
  if (typeof input === 'string') input = { normalized_address: input };
  input = input || {};
  overrides = overrides || {};
  const sourceUrl = cleanText(overrides.source_url || overrides.canonical_source_url || sourceUrlFrom(input));
  const title = cleanText(overrides.source_title || pick(input, ['source_title', 'title', 'candidate_title']));
  const fields = Object.assign({}, structuredFields(input), {
    street: cleanText(overrides.street || overrides.normalized_address || overrides.address || structuredFields(input).street),
    city: cleanText(overrides.city || structuredFields(input).city),
    state: cleanText(overrides.state || structuredFields(input).state),
    zip: cleanText(overrides.zip || structuredFields(input).zip)
  });
  const sourceAddress = parseAddress(cleanText(pick(input, ['source_url_address_candidate', 'source_evidence.0.source_url_address_candidate'])));
  const urlAddress = addressFromPropertyUrl(sourceUrl, title);
  const structured = parseAddress(formatAddress(fields));
  const existing = parseAddress(cleanText(overrides.normalized_address || pick(input, ['lead_evidence.normalized_address', 'normalized_address', 'input_value', 'address'])));
  const rawStreet = parseAddress(fields.street);

  const candidates = [
    { value: sourceAddress, score: candidateScore(sourceAddress, 100) },
    { value: urlAddress, score: candidateScore(urlAddress, 90) },
    { value: structured, score: candidateScore(structured, 80) },
    { value: existing, score: candidateScore(existing, 50) },
    { value: rawStreet, score: candidateScore(rawStreet, 30) }
  ].filter((item) => item.score >= 0);
  candidates.sort((a, b) => b.score - a.score || b.value.full_address.length - a.value.full_address.length);
  return candidates.length ? candidates[0].value.full_address : cleanText(fields.street || existing.full_address);
}

function canonicalParts(input, overrides) {
  const address = canonicalAddress(input, overrides);
  const parsed = parseAddress(address);
  const sourceUrl = cleanText(overrides && (overrides.source_url || overrides.canonical_source_url) || sourceUrlFrom(input || {}));
  const urlAddress = addressFromPropertyUrl(sourceUrl, cleanText(pick(input || {}, ['source_title', 'title', 'candidate_title'])));
  return {
    street: parsed.street || urlAddress.street,
    city: parsed.city || urlAddress.city,
    state: parsed.state || urlAddress.state,
    zip: parsed.zip || urlAddress.zip,
    full_address: parsed.full_address || urlAddress.full_address,
    source_url: sourceUrl
  };
}

function normalizeKeyText(value) {
  return cleanText(value).toLowerCase()
    .replace(/[^a-z0-9\s#-]/g, ' ')
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(drive)\b/g, 'dr')
    .replace(/\b(lane)\b/g, 'ln')
    .replace(/\b(court)\b/g, 'ct')
    .replace(/\b(boulevard)\b/g, 'blvd')
    .replace(/\b(circle)\b/g, 'cir')
    .replace(/\b(place)\b/g, 'pl')
    .replace(/\b(parkway)\b/g, 'pkwy')
    .replace(/\b(highway)\b/g, 'hwy')
    .replace(/\b(terrace)\b/g, 'ter')
    .replace(/\b(trail)\b/g, 'trl')
    .replace(/\b(texas)\b/g, 'tx')
    .replace(/\s+/g, ' ')
    .trim();
}

function unitToken(street) {
  const match = normalizeKeyText(street).match(/\b(?:unit|apt|apartment|suite|ste|#)\s*([a-z0-9-]+)\b/);
  return match ? match[1] : '';
}

function streetWithoutUnit(street) {
  return normalizeKeyText(street).replace(/\b(?:unit|apt|apartment|suite|ste|#)\s*[a-z0-9-]+\b/g, '').replace(/\s+/g, ' ').trim();
}

function canonicalSourceUrlKey(value) {
  const raw = cleanText(value);
  if (!isHttpUrl(raw)) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    parsed.search = '';
    return `${parsed.hostname.replace(/^www\./i, '').toLowerCase()}${decodePath(parsed.pathname || '').toLowerCase().replace(/\/+$/, '')}`;
  } catch (_) {
    return '';
  }
}

function canonicalPropertyKey(input, overrides) {
  const parts = canonicalParts(input, overrides);
  const unit = unitToken(parts.street);
  return [
    streetWithoutUnit(parts.street),
    unit ? `unit ${unit}` : '',
    normalizeKeyText(parts.city),
    normalizeState(parts.state).toLowerCase()
  ].filter(Boolean).join('|');
}

function sameProperty(a, b) {
  const aKey = canonicalPropertyKey(a);
  const bKey = canonicalPropertyKey(b);
  const aSource = canonicalSourceUrlKey(sourceUrlFrom(a || {}) || (a && a.property && (a.property.source_url || a.property.canonical_source_url)));
  const bSource = canonicalSourceUrlKey(sourceUrlFrom(b || {}) || (b && b.property && (b.property.source_url || b.property.canonical_source_url)));
  if (aSource && bSource && aSource === bSource) return true;
  if (!aKey || !bKey) return false;
  if (aKey === bKey) return true;
  const aStreet = aKey.split('|').slice(0, 2).join('|');
  const bStreet = bKey.split('|').slice(0, 2).join('|');
  return !!(aStreet && aStreet === bStreet && (aSource || bSource));
}

module.exports = {
  cleanText,
  isHttpUrl,
  parseAddress,
  addressFromPropertyUrl,
  canonicalAddress,
  canonicalParts,
  canonicalPropertyKey,
  canonicalSourceUrlKey,
  sameProperty,
  normalizeKeyText
};
