'use strict';

const crypto = require('crypto');
const researchProviderRouter = require('./free-research-provider-router');

const PROVIDER_STATUSES = new Set([
  'not_configured',
  'provider_not_configured',
  'blocked_needs_address',
  'blocked_needs_source_evidence',
  'blocked_source_address_conflict',
  'ready_to_research',
  'researching',
  'temporarily_unavailable',
  'provider_temporarily_unavailable',
  'timed_out',
  'auth_error',
  'quota_or_rate_limited',
  'provider_error',
  'failed_cleanly',
  'candidates_found',
  'partial_results',
  'completed',
  'completed_no_results',
  'no_usable_comp_evidence',
  'no_candidates_found',
  'failed'
]);

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function envEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function numberValue(value) {
  const n = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function arrayText(value) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function normalizeUrlHost(value) {
  try {
    return new URL(cleanText(value)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (error) {
    return '';
  }
}

function normalizeAddressKey(value) {
  return cleanText(value).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(apartment|apt|unit|suite|ste|#)\s*[a-z0-9-]+\b/g, ' ')
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(drive)\b/g, 'dr')
    .replace(/\b(lane)\b/g, 'ln')
    .replace(/\b(court)\b/g, 'ct')
    .replace(/\b(place)\b/g, 'pl')
    .replace(/\b(boulevard)\b/g, 'blvd')
    .replace(/\b(circle)\b/g, 'cir')
    .replace(/\b(parkway)\b/g, 'pkwy')
    .replace(/\b(highway)\b/g, 'hwy')
    .replace(/\b(terrace)\b/g, 'ter')
    .replace(/\b(trail)\b/g, 'trl')
    .replace(/\s+/g, ' ')
    .trim();
}

function addressConflictKey(value) {
  return normalizeAddressKey(value).replace(/\b\d{5}(?:-\d{4})?\b/g, '').replace(/\s+/g, ' ').trim();
}

function streetAddressKey(value) {
  const normalized = addressConflictKey(value)
    .replace(/\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|ia|id|il|in|ks|ky|la|ma|md|me|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|va|vt|wa|wi|wv|wy|dc|texas)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(/\b(\d{1,7}\s+[a-z0-9 ]+?\b(?:st|ave|rd|dr|ln|ct|cir|blvd|way|pl|pkwy|hwy|ter|trl|loop|sq))\b/);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function canonicalSourceUrlKey(value) {
  const raw = cleanText(value);
  if (!isHttpUrl(raw)) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    parsed.search = '';
    return `${parsed.hostname.replace(/^www\./i, '').toLowerCase()}${decodeURIComponent(parsed.pathname || '').toLowerCase().replace(/\/+$/, '')}`;
  } catch (error) {
    return '';
  }
}

function addressFromPropertyUrl(value) {
  const raw = cleanText(value);
  if (!isHttpUrl(raw)) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const path = decodeURIComponent(parsed.pathname || '');
    let slug = '';
    if (/realtor\.com$/i.test(host)) {
      const match = path.match(/\/realestateandhomes-detail\/([^/]+)/i);
      if (match) slug = match[1].replace(/_M\d.+$/i, '');
    } else if (/redfin\.com$/i.test(host)) {
      const parts = path.split('/').filter(Boolean);
      slug = parts.length >= 3 ? parts[2] : '';
    } else if (/zillow\.com$/i.test(host)) {
      const match = path.match(/\/homedetails\/([^/]+)/i);
      if (match) slug = match[1].replace(/_zpid.*$/i, '');
    } else if (/har\.com$/i.test(host)) {
      const match = path.match(/\/homedetail\/([^/]+)/i);
      if (match) slug = match[1].replace(/\/\d+$/i, '');
    } else if (/auction\.com$|realauction\.com$|hubzu\.com$/i.test(host)) {
      const parts = path.split('/').filter(Boolean);
      slug = parts.find((part) => /\d{2,7}[-_][a-z0-9-]+/i.test(part)) || '';
    }
    if (!slug) return '';
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b(?:tx|texas|dallas|houston|chicago|il|ca|fl|az)\b\s*\d{5}(?:\s+\d+)?\b/ig, ' ')
      .replace(/\b\d{5}(?:-\d{4})?\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (error) {
    return '';
  }
}

function subjectIdentityForJob(job) {
  const pack = sourcePackFromJob(job);
  const addressValues = [
    job && job.normalized_address,
    pack && pack.address_candidate,
    pack && pack.source_url_address_candidate,
    job && job.input_value,
    addressFromPropertyUrl(job && job.source_url),
    addressFromPropertyUrl(pack && pack.source_url)
  ].map(cleanText).filter(Boolean);
  const urlValues = [
    job && job.source_url,
    pack && pack.source_url
  ].map(canonicalSourceUrlKey).filter(Boolean);
  return {
    addressKeys: new Set(addressValues.map(addressConflictKey).filter(Boolean)),
    streetKeys: new Set(addressValues.map(streetAddressKey).filter(Boolean)),
    urlKeys: new Set(urlValues)
  };
}

function isSubjectCandidate(candidate, job) {
  const subject = subjectIdentityForJob(job);
  const candidateAddresses = [
    candidate && candidate.comp_address,
    [candidate && candidate.comp_address, candidate && candidate.city, candidate && candidate.state, candidate && candidate.zip].map(cleanText).filter(Boolean).join(', '),
    addressFromPropertyUrl(candidate && candidate.source_url)
  ].map(cleanText).filter(Boolean);
  const candidateAddressKeys = candidateAddresses.map(addressConflictKey).filter(Boolean);
  const candidateStreetKeys = candidateAddresses.map(streetAddressKey).filter(Boolean);
  const candidateUrlKey = canonicalSourceUrlKey(candidate && candidate.source_url);
  if (candidateUrlKey && subject.urlKeys.has(candidateUrlKey)) return true;
  if (candidateAddressKeys.some((key) => subject.addressKeys.has(key))) return true;
  return candidateStreetKeys.some((key) => subject.streetKeys.has(key));
}

function addressLike(value) {
  const address = cleanText(value);
  if (!address) return false;
  if (/\b(public information request|phone directory|page not found|contact us|contact|search results|court calendar)\b/i.test(address)) return false;
  const hasNumber = /\b\d{1,7}\b/.test(address);
  const hasStreetWord = /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop|sq|square)\b/i.test(address);
  const hasCityStateOrZip = /\b\d{5}(?:-\d{4})?\b/.test(address) ||
    /,\s*[A-Za-z][A-Za-z\s.-]+,\s*[A-Z]{2}\b/.test(address) ||
    /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b/.test(address);
  return hasNumber && hasStreetWord && hasCityStateOrZip;
}

function looksGenericSourceUrl(value) {
  const url = cleanText(value);
  if (!isHttpUrl(url)) return true;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (!path || path === '/') return true;
    if (/\b(search|homes-for-sale|realestateandhomes-search|property-search|market|city|county|neighborhood|for-sale)\b/i.test(path) &&
        !/\b(detail|homedetail|home\/\d+|homedetails|sold|property)\b/i.test(path)) {
      return true;
    }
    return false;
  } catch (error) {
    return true;
  }
}

function subjectAddressKeyForJob(job) {
  const pack = sourcePackFromJob(job);
  const value = cleanText((job && job.normalized_address) || (pack && pack.address_candidate) || (pack && pack.source_url_address_candidate) || (job && job.input_value) || '');
  return addressConflictKey(value);
}

function sourceQuality(candidate) {
  const url = cleanText(candidate && candidate.source_url);
  if (!isHttpUrl(url)) return { label: 'Missing source URL', score: 0, generic: true };
  if (looksGenericSourceUrl(url)) return { label: 'Generic/search source', score: 20, generic: true };
  const host = normalizeUrlHost(url);
  if (/(county|cad|assessor|recorder|clerk|gov|official)/i.test(host)) return { label: 'Official/property source', score: 95, generic: false };
  if (/(redfin|zillow|realtor|har|auction\.com|estately|coldwellbanker|compass|movoto)/i.test(host)) return { label: 'Property/listing source', score: 75, generic: false };
  return { label: 'Public web source', score: 55, generic: false };
}

function saleStatusKind(candidate) {
  const statusText = [
    candidate && candidate.sold_status,
    candidate && candidate.listing_status,
    candidate && candidate.source_type,
    candidate && candidate.source_label,
    candidate && candidate.why_included
  ].map(cleanText).join(' ').toLowerCase();
  if (/\b(sold|closed|sale closed)\b/.test(statusText)) return 'sold';
  if (/\b(active|for sale|listed|pending|contingent|auction|bid|estimate|zestimate|rent)\b/.test(statusText)) return 'market_support';
  return 'unknown';
}

function scoreRecency(candidate) {
  const raw = cleanText(candidate && candidate.sold_date);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return 35;
  const ageDays = Math.max(0, (Date.now() - parsed) / 86400000);
  if (ageDays <= 180) return 100;
  if (ageDays <= 365) return 80;
  if (ageDays <= 730) return 55;
  return 25;
}

function scoreSimilarity(candidate) {
  let score = 20;
  if (candidate && candidate.beds) score += 15;
  if (candidate && candidate.baths) score += 15;
  if (candidate && candidate.sqft) score += 20;
  if (candidate && candidate.distance_miles !== null && candidate.distance_miles !== undefined && cleanText(candidate.distance_miles) !== '') score += 20;
  if (candidate && cleanText(candidate.why_included)) score += 10;
  return Math.min(score, 100);
}

function scoreProximity(candidate) {
  const distance = Number(String(candidate && candidate.distance_miles || '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(distance)) return 25;
  if (distance <= 0.5) return 100;
  if (distance <= 1) return 85;
  if (distance <= 3) return 60;
  return 30;
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
    if (cursor !== undefined && cursor !== null && String(cursor).trim() !== '') return cursor;
  }
  return '';
}

function candidateId() {
  if (crypto.randomUUID) return `compcand_${crypto.randomUUID()}`;
  return `compcand_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getConfiguredCompProviders(env) {
  env = env || process.env;
  return researchProviderRouter.getConfiguredResearchProviders(env).map((provider) => ({
    id: provider.id,
    label: provider.label,
    enabled: provider.enabled === true,
    implemented: provider.implemented === true,
    source: provider.source || '',
    model: provider.model || ''
  }));
}

function providerLabel(id) {
  return ({
    gemini_web_research: 'Gemini',
    groq_research: 'Groq',
    openrouter_research: 'OpenRouter',
    openai_web_research: 'OpenAI',
    deterministic_fallback: 'Fallback',
    attom: 'ATTOM',
    batchdata: 'BatchData',
    propstream: 'PropStream',
    datatree: 'DataTree'
  })[String(id || '').toLowerCase()] || cleanText(id || 'Comp provider');
}

function isCompResearchConfigured(options) {
  return getConfiguredCompProviders(options && options.env).length > 0;
}

function sourcePackFromJob(job) {
  const sourceEvidence = Array.isArray(job && job.source_evidence) ? job.source_evidence : [];
  return sourceEvidence.find((item) => item && item.type === 'source_evidence_pack') || null;
}

function hasUsableAddress(job, pack) {
  const address = cleanText((job && job.normalized_address) || (pack && pack.address_candidate) || '');
  return addressLike(address);
}

function buildCompResearchRequest(job) {
  job = job || {};
  const pack = sourcePackFromJob(job);
  return {
    subject_job_id: job.job_id || '',
    input_type: job.input_type || '',
    input_value: job.input_value || '',
    normalized_address: cleanText(job.normalized_address || (pack && pack.address_candidate) || ''),
    source_url: cleanText((pack && pack.source_url) || ''),
    source_url_address_candidate: cleanText((pack && pack.source_url_address_candidate) || ''),
    address_extracted_from_source_url: pack && pack.address_extracted_from_source_url === true,
    source_url_type: cleanText((pack && pack.source_url_type) || ''),
    property_identity_status: cleanText((pack && pack.property_identity_status) || ''),
    source_evidence_role: cleanText((pack && pack.evidence_role) || ''),
    source_status: cleanText((pack && pack.source_status) || ''),
    lead_id: cleanText(job.lead_id || ''),
    lead_ref: cleanText(job.lead_ref || '')
  };
}

function validateCompResearchInput(job) {
  const request = buildCompResearchRequest(job);
  const pack = sourcePackFromJob(job);
  const identityStatus = request.property_identity_status;
  const subjectAddress = cleanText((job && job.normalized_address) || (pack && pack.address_candidate) || request.normalized_address || '');
  const sourceAddress = cleanText(request.source_url_address_candidate || '');
  if (!hasUsableAddress(job, pack) || identityStatus === 'junk_address_blocked' || identityStatus === 'needs_source_repair') {
    return {
      ok: false,
      provider_status: 'blocked_needs_address',
      message: request.source_url
        ? 'Source may be useful, but property identity must be repaired before comp research.'
        : 'Repair property identity before comps.',
      missing_fields: ['Usable property address']
    };
  }
  if (subjectAddress && sourceAddress && addressLike(subjectAddress) && addressLike(sourceAddress) && addressConflictKey(subjectAddress) !== addressConflictKey(sourceAddress)) {
    return {
      ok: false,
      provider_status: 'blocked_source_address_conflict',
      message: 'Source URL address conflicts with Analyzer address. Verify before comp research.',
      missing_fields: ['Source/property evidence']
    };
  }
  if (!request.source_url || identityStatus === 'unresolved' || !request.source_evidence_role || request.source_evidence_role !== 'source_proof') {
    return {
      ok: false,
      provider_status: 'blocked_needs_source_evidence',
      message: request.source_url
        ? 'Source repair needed before comps.'
        : 'Needs source/property evidence before comp research.',
      missing_fields: ['Source/property evidence']
    };
  }
  return {
    ok: true,
    provider_status: 'ready_to_research',
    message: 'Ready to research comps when a provider is configured.',
    missing_fields: []
  };
}

function normalizeCompCandidate(rawCandidate, provider) {
  rawCandidate = rawCandidate || {};
  provider = provider || {};
  const candidate = {
    candidate_id: cleanText(rawCandidate.candidate_id) || candidateId(),
    provider: cleanText(rawCandidate.provider || provider.id || provider.label || 'unknown'),
    subject_job_id: cleanText(rawCandidate.subject_job_id || rawCandidate.job_id),
    comp_address: cleanText(pick(rawCandidate, ['comp_address', 'address', 'property_address'])),
    city: cleanText(pick(rawCandidate, ['city'])),
    state: cleanText(pick(rawCandidate, ['state'])),
    zip: cleanText(pick(rawCandidate, ['zip', 'postal_code'])),
    sold_status: cleanText(pick(rawCandidate, ['sold_status', 'status', 'sale_status'])).toLowerCase(),
    sold_price: numberValue(pick(rawCandidate, ['sold_price', 'sale_price', 'price', 'closed_price'])),
    sold_date: cleanText(pick(rawCandidate, ['sold_date', 'sale_date', 'closed_date', 'date'])),
    listing_status: cleanText(pick(rawCandidate, ['listing_status', 'list_status'])),
    beds: pick(rawCandidate, ['beds', 'bedrooms']) || null,
    baths: pick(rawCandidate, ['baths', 'bathrooms']) || null,
    sqft: pick(rawCandidate, ['sqft', 'square_feet']) || null,
    lot_size: cleanText(pick(rawCandidate, ['lot_size', 'lot'])),
    distance_miles: pick(rawCandidate, ['distance_miles', 'distance']) || null,
    source_url: cleanText(pick(rawCandidate, ['source_url', 'url', 'record_url'])),
    source_title: cleanText(pick(rawCandidate, ['source_title', 'title'])),
    source_type: cleanText(pick(rawCandidate, ['source_type', 'record_type', 'source_kind'])),
    source_label: cleanText(rawCandidate.source_label || rawCandidate.source || provider.label || ''),
    confidence: numberValue(rawCandidate.confidence),
    verification_status: cleanText(rawCandidate.verification_status || 'candidate').toLowerCase(),
    comp_group: cleanText(rawCandidate.comp_group),
    why_included: cleanText(rawCandidate.why_included || rawCandidate.reason || rawCandidate.notes_summary),
    why_not_verified: cleanText(rawCandidate.why_not_verified || rawCandidate.reason_excluded),
    missing_fields: arrayText(rawCandidate.missing_fields),
    notes: arrayText(rawCandidate.notes),
    created_at: cleanText(rawCandidate.created_at) || new Date().toISOString()
  };
  return candidate;
}

function validateVerifiedCompCandidate(candidate) {
  candidate = candidate || {};
  const missing = [];
  if (!cleanText(candidate.comp_address || candidate.parcel_id || candidate.apn || candidate.pin)) missing.push('Comp address or parcel id');
  if (!/\b(sold|closed)\b/.test(cleanText(candidate.sold_status).toLowerCase())) missing.push('Sold status');
  if (!(numberValue(candidate.sold_price) > 0)) missing.push('Sold price');
  if (!cleanText(candidate.sold_date)) missing.push('Sold date');
  if (!isHttpUrl(candidate.source_url)) missing.push('Source URL');
  if (looksGenericSourceUrl(candidate.source_url)) missing.push('Property-specific sold source');
  return {
    verified: missing.length === 0,
    missing_fields: missing
  };
}

function classifyCompCandidate(candidate, job, seen) {
  candidate = Object.assign({}, candidate || {});
  seen = seen || new Set();
  const quality = sourceQuality(candidate);
  const validation = validateVerifiedCompCandidate(candidate);
  const kind = saleStatusKind(candidate);
  const requestedGroup = cleanText(candidate.comp_group || candidate.verification_status).toLowerCase();
  const dedupeKey = normalizeAddressKey(candidate.comp_address) || cleanText(candidate.source_url).toLowerCase();
  const isSubjectProperty = isSubjectCandidate(candidate, job);
  const duplicate = !!(dedupeKey && seen.has(dedupeKey));
  if (dedupeKey) seen.add(dedupeKey);
  const missing = new Set(arrayText(candidate.missing_fields).concat(validation.missing_fields));
  if (!cleanText(candidate.comp_address)) missing.add('Comp address');
  if (!(numberValue(candidate.sold_price) > 0)) missing.add('Sold price');
  if (!cleanText(candidate.sold_date)) missing.add('Sold date');
  if (quality.generic) missing.add('Property-specific source URL');
  if (duplicate) missing.add('Unique comp record');
  if (candidate.distance_miles === null || candidate.distance_miles === undefined || cleanText(candidate.distance_miles) === '') {
    missing.add('Distance not verified');
  }

  candidate.source_quality = quality.label;
  candidate.source_quality_score = quality.score;
  candidate.sold_evidence_score = validation.verified ? 100 : kind === 'sold' ? 55 : 15;
  candidate.recency_score = scoreRecency(candidate);
  candidate.similarity_score = scoreSimilarity(candidate);
  candidate.proximity_evidence_score = scoreProximity(candidate);
  candidate.distance_note = missing.has('Distance not verified') ? 'Distance not verified.' : '';
  candidate.comp_confidence_score = Math.round((
    candidate.source_quality_score +
    candidate.sold_evidence_score +
    candidate.recency_score +
    candidate.similarity_score +
    candidate.proximity_evidence_score
  ) / 5);
  candidate.missing_fields = Array.from(missing);

  if (isSubjectProperty) {
    candidate.verification_status = 'subject_sale_evidence';
    candidate.comp_classification = 'Subject Sale Evidence';
    candidate.comp_group = 'subject_sale_evidence';
    candidate.notes = candidate.notes.concat('This is the subject property\'s own sale/listing evidence, not a comparable sale.');
    candidate.why_not_verified = 'Subject property cannot be used as its own comparable sale.';
    return candidate;
  }
  if (duplicate) {
    candidate.verification_status = 'not_usable';
    candidate.comp_classification = 'Not Usable';
    candidate.comp_group = 'not_usable';
    candidate.notes = candidate.notes.concat('Duplicate comp/source result.');
    candidate.why_not_verified = candidate.why_not_verified || 'Duplicate comp/source result.';
    return candidate;
  }
  if (/\bnot[_\s-]?usable\b/.test(requestedGroup)) {
    candidate.verification_status = 'not_usable';
    candidate.comp_classification = 'Not Usable';
    candidate.comp_group = 'not_usable';
    candidate.why_not_verified = candidate.why_not_verified || candidate.why_included || 'Provider marked this result not usable.';
    return candidate;
  }
  if (validation.verified && !quality.generic) {
    candidate.verification_status = 'verified';
    candidate.comp_classification = 'Verified Sold Comp';
    candidate.comp_group = 'verified_sold';
    return candidate;
  }
  if (kind === 'sold' && cleanText(candidate.comp_address) && isHttpUrl(candidate.source_url) && !quality.generic && numberValue(candidate.sold_price) > 0 && cleanText(candidate.sold_date)) {
    candidate.verification_status = 'candidate';
    candidate.comp_classification = 'Candidate Sold Comp';
    candidate.comp_group = 'candidate_sold';
    candidate.notes = candidate.notes.concat('Sold evidence is incomplete; does not unlock valuation.');
    candidate.why_not_verified = candidate.why_not_verified || `Missing verified comp evidence: ${candidate.missing_fields.join(', ') || 'complete sold evidence'}.`;
    return candidate;
  }
  if (kind === 'sold') {
    candidate.verification_status = 'not_usable';
    candidate.comp_classification = 'Not Usable';
    candidate.comp_group = 'not_usable';
    candidate.notes = candidate.notes.concat('Sold evidence is missing required price, date, address, or property source.');
    candidate.why_not_verified = candidate.why_not_verified || `Missing usable sold-comp evidence: ${candidate.missing_fields.join(', ') || 'complete sold evidence'}.`;
    return candidate;
  }
  if (kind === 'market_support' || numberValue(candidate.sold_price) > 0 || cleanText(candidate.source_url)) {
    candidate.verification_status = 'market_support';
    candidate.comp_classification = 'Market Support';
    candidate.comp_group = 'market_support';
    candidate.notes = candidate.notes.concat('Market support only; not a verified sold comp.');
    candidate.why_not_verified = candidate.why_not_verified || 'Market support only; sold/closed comp evidence is incomplete.';
    return candidate;
  }
  candidate.verification_status = 'not_usable';
  candidate.comp_classification = 'Not Usable';
  candidate.comp_group = 'not_usable';
  candidate.notes = candidate.notes.concat('Not enough public comp evidence to use.');
  candidate.why_not_verified = candidate.why_not_verified || `Missing usable comp evidence: ${candidate.missing_fields.join(', ') || 'public sold-comp proof'}.`;
  return candidate;
}

function verifiedCompCount(candidates) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    return cleanText(candidate.verification_status).toLowerCase() === 'verified' &&
      validateVerifiedCompCandidate(candidate).verified;
  }).length;
}

function groupedCompCandidates(candidates) {
  const grouped = {
    verified_sold_comps: [],
    subject_sale_evidence: [],
    candidate_sold_comps: [],
    market_support: [],
    not_usable_comp_results: []
  };
  (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
    if (candidate.comp_group === 'verified_sold') grouped.verified_sold_comps.push(candidate);
    else if (candidate.comp_group === 'subject_sale_evidence') grouped.subject_sale_evidence.push(candidate);
    else if (candidate.comp_group === 'candidate_sold') grouped.candidate_sold_comps.push(candidate);
    else if (candidate.comp_group === 'market_support') grouped.market_support.push(candidate);
    else grouped.not_usable_comp_results.push(candidate);
  });
  return grouped;
}

function compRowIdentityKey(candidate) {
  candidate = candidate || {};
  const addressKey = addressConflictKey(candidate.comp_address || addressFromPropertyUrl(candidate.source_url));
  const sourceKey = canonicalSourceUrlKey(candidate.source_url);
  if (addressKey || sourceKey) return `${addressKey}|${sourceKey}`;
  return cleanText(candidate.candidate_id) || crypto.createHash('sha1').update(JSON.stringify(candidate)).digest('hex');
}

function compGroupRank(candidate) {
  const group = cleanText(candidate && candidate.comp_group).toLowerCase();
  if (group === 'subject_sale_evidence') return 5;
  if (group === 'verified_sold') return 4;
  if (group === 'candidate_sold') return 3;
  if (group === 'market_support') return 2;
  return 1;
}

function collectCompRows(source) {
  source = source || {};
  return []
    .concat(Array.isArray(source.candidates) ? source.candidates : [])
    .concat(Array.isArray(source.comp_candidates) ? source.comp_candidates : [])
    .concat(Array.isArray(source.verified_sold_comps) ? source.verified_sold_comps : [])
    .concat(Array.isArray(source.subject_sale_evidence) ? source.subject_sale_evidence : [])
    .concat(Array.isArray(source.candidate_sold_comps) ? source.candidate_sold_comps : [])
    .concat(Array.isArray(source.market_support) ? source.market_support : [])
    .concat(Array.isArray(source.not_usable_comp_results) ? source.not_usable_comp_results : []);
}

function canonicalizeCompResearchState(job, state) {
  state = state || {};
  const provider = cleanText(state.provider || job && job.comp_research_provider || 'unknown');
  const rows = collectCompRows(state);
  if (state.retain_existing === true) rows.push(...collectCompRows(job));
  const byKey = new Map();
  rows.forEach((row) => {
    const normalized = normalizeCompCandidate(row, { id: cleanText(row && row.provider) || provider || 'unknown' });
    const classified = classifyCompCandidate(normalized, job, new Set());
    const key = compRowIdentityKey(classified);
    const existing = byKey.get(key);
    if (!existing || compGroupRank(classified) > compGroupRank(existing)) {
      byKey.set(key, classified);
    }
  });
  const candidates = Array.from(byKey.values());
  const groups = groupedCompCandidates(candidates);
  const verifiedCount = groups.verified_sold_comps.length;
  const valuation = valuationFromVerifiedComps(job, groups.verified_sold_comps);
  return {
    candidates,
    verified_sold_comps: groups.verified_sold_comps,
    subject_sale_evidence: groups.subject_sale_evidence,
    candidate_sold_comps: groups.candidate_sold_comps,
    market_support: groups.market_support,
    not_usable_comp_results: groups.not_usable_comp_results,
    verified_comp_count: verifiedCount,
    subject_sale_evidence_count: groups.subject_sale_evidence.length,
    candidate_comp_count: groups.candidate_sold_comps.length,
    market_support_count: groups.market_support.length,
    not_usable_comp_count: groups.not_usable_comp_results.length,
    valuation_locked: valuation.valuation_locked,
    arv_range: valuation.arv_range,
    mao_range: valuation.mao_range,
    valuation_note: valuation.valuation_note
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function repairEvidenceFromJob(job) {
  const raw = pick(job || {}, ['repair_estimate', 'repairs', 'repair_cost', 'estimated_repairs', 'manual_repair_estimate']);
  const repairs = numberValue(raw);
  return repairs > 0 ? repairs : 0;
}

function valuationFromVerifiedComps(job, verifiedComps) {
  const prices = (Array.isArray(verifiedComps) ? verifiedComps : [])
    .map((comp) => numberValue(comp.sold_price))
    .filter((price) => price > 0);
  if (prices.length < 3) {
    return {
      valuation_locked: true,
      arv_range: null,
      mao_range: null,
      valuation_note: prices.length
        ? 'Valuation locked. Need at least 3 verified sold comps for preliminary ARV.'
        : 'Valuation locked. No verified sold comps found yet.'
    };
  }
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const arvRange = {
    low,
    high,
    median: median(prices),
    count: prices.length,
    basis: 'gemini_verified_sold_comps',
    label: 'Preliminary evidence-backed ARV range from verified sold comps. Review before offer.'
  };
  const repairs = repairEvidenceFromJob(job);
  if (!repairs) {
    return {
      valuation_locked: false,
      arv_range: arvRange,
      mao_range: null,
      valuation_note: 'Preliminary ARV range available. MAO locked until repair evidence or a manual repair estimate is added.'
    };
  }
  return {
    valuation_locked: false,
    arv_range: arvRange,
    mao_range: {
      low: Math.round(low * 0.7 - repairs),
      high: Math.round(high * 0.7 - repairs),
      repairs,
      basis: 'arv_x_70_percent_minus_repair_evidence',
      label: 'Draft MAO from verified comps and repair evidence. Review before offer.'
    },
    valuation_note: 'Preliminary ARV and draft MAO are available for review.'
  };
}

function runCompResearch(job, options) {
  options = options || {};
  const validation = validateCompResearchInput(job);
  const providers = getConfiguredCompProviders(options.env);
  const existingCandidates = Array.isArray(job && job.comp_candidates) ? job.comp_candidates : [];
  if (!validation.ok) {
    return summarizeCompResearchState(job, {
      provider_status: validation.provider_status,
      provider: '',
      candidates: existingCandidates,
      message: validation.message,
      missing_fields: validation.missing_fields
    });
  }
  if (!providers.length) {
      return summarizeCompResearchState(job, {
      provider_status: 'provider_not_configured',
      provider: 'none',
      candidates: existingCandidates,
      message: 'Comp provider not configured yet.',
      missing_fields: ['Configured comp research provider']
    });
  }
  const provider = providers[0];
  if (provider.implemented) {
    if (!options.executeProvider) {
      return summarizeCompResearchState(job, {
        provider_status: 'ready_to_research',
        provider: provider.id,
        candidates: existingCandidates,
        message: `${provider.label} research is ready. Click Research Comps to gather public evidence.`,
        missing_fields: []
      });
    }
    return researchProviderRouter.runResearchProvider(job, options)
      .then((result) => summarizeRouterResearchState(job, provider, result))
      .catch((error) => summarizeCompResearchState(job, {
        provider_status: cleanText(error && error.provider_status) || 'provider_error',
        provider: provider.id,
        candidates: existingCandidates,
        message: cleanText(error && error.message) || 'Comp research needs review.',
        missing_fields: ['Public research result'],
        warnings: [
          cleanText(error && error.provider_raw_message ? error.provider_raw_message : error && error.message ? error.message : 'Public research failed.')
        ],
        provider_models_attempted: Array.isArray(error && error.provider_models_attempted) ? error.provider_models_attempted : [],
        provider_model: cleanText(error && error.provider_model)
      }));
  }
  return summarizeCompResearchState(job, {
    provider_status: 'ready_to_research',
    provider: provider.id,
    candidates: existingCandidates,
    message: 'Comp research provider is configured but not implemented yet.',
    missing_fields: []
  });
}

function researchResultMessage(result) {
  result = result || {};
  const hasCandidates = Array.isArray(result.comp_candidates) && result.comp_candidates.length > 0;
  if (result.status === 'provider_not_configured' || result.status === 'not_configured') return 'Comp provider not configured yet.';
  if (result.status === 'blocked_source_address_conflict') return 'Source URL address conflicts with Analyzer address. Verify before comp research.';
  if (result.status === 'temporarily_unavailable' || result.status === 'provider_temporarily_unavailable' || result.status === 'quota_or_rate_limited') {
    return 'Gemini is temporarily unavailable/high demand. Try again later.';
  }
  if (result.status === 'timed_out') return 'Gemini live comp research timed out before returning evidence. Try again later.';
  if (result.status === 'auth_error') return 'Gemini is configured but authentication or permission failed. Verify the Gemini API key and model access.';
  if (result.status === 'provider_error' || result.status === 'failed_cleanly') return 'Provider error. No valuation was generated.';
  if (result.status === 'failed') return 'Comp research needs review.';
  if (hasCandidates) return 'Candidate comps found - review evidence.';
  if (result.status === 'partial_results') return 'Gemini found public market evidence, but no verified sold comps yet.';
  if (result.status === 'completed' || result.status === 'completed_no_results') return 'Gemini found public market evidence, but no verified sold comps yet.';
  if (result.status === 'no_usable_comp_evidence') return 'No usable public comp evidence found.';
  return 'Not enough public comp evidence found.';
}

function summarizeRouterResearchState(job, provider, result) {
  result = result || {};
  const hasCandidates = Array.isArray(result.comp_candidates) && result.comp_candidates.length > 0;
  const evidenceCount = [
    Array.isArray(result.property_evidence) ? result.property_evidence.length : 0,
    Array.isArray(result.source_evidence) ? result.source_evidence.length : 0,
    Array.isArray(result.citations) ? result.citations.length : 0,
    cleanText(result.raw_summary) ? 1 : 0,
    result.normalized_from_text === true ? 1 : 0
  ].reduce((sum, value) => sum + (Number(value) || 0), 0);
  let status = cleanText(result.status);
  if (!PROVIDER_STATUSES.has(status)) {
    status = hasCandidates ? 'candidates_found' : (evidenceCount > 0 ? 'completed' : 'no_usable_comp_evidence');
  } else if (!hasCandidates && status === 'candidates_found') {
    status = evidenceCount > 0 ? 'completed' : 'no_usable_comp_evidence';
  } else if (!hasCandidates && status === 'partial_results') {
    status = evidenceCount > 0 ? 'completed' : 'no_usable_comp_evidence';
  } else if (status === 'completed_no_results' && evidenceCount > 0) {
    status = 'completed';
  }
  return summarizeCompResearchState(job, {
    provider_status: status,
    provider: provider.id,
    candidates: result.comp_candidates || [],
    message: researchResultMessage(result),
    missing_fields: result.missing_evidence || [],
    property_evidence: result.property_evidence || [],
    source_evidence: result.source_evidence || [],
    warnings: result.warnings || [],
    citations: result.citations || [],
    raw_summary: result.raw_summary || '',
    normalized_from_text: result.normalized_from_text === true,
    normalization_note: cleanText(result.normalization_note),
    comp_search_strategy: cleanText(result.comp_search_strategy),
    missing_evidence_summary: cleanText(result.missing_evidence_summary),
    next_action: cleanText(result.next_action)
  });
}

function summarizeCompResearchState(job, result) {
  result = result || {};
  const status = PROVIDER_STATUSES.has(result.provider_status) ? result.provider_status : 'failed';
  const canonical = canonicalizeCompResearchState(job, result);
  const verifiedCount = canonical.verified_comp_count;
  const missing = Array.isArray(result.missing_fields) ? result.missing_fields.slice() : [];
  if (verifiedCount < 3 && missing.indexOf('3 verified sold comps') === -1) missing.push('3 verified sold comps');
  if (verifiedCount > 0 && verifiedCount < 3 && missing.indexOf('Insufficient verified sold comps') === -1) {
    missing.push('Insufficient verified sold comps');
  }
  if (!verifiedCount && canonical.subject_sale_evidence.length && missing.indexOf('Subject property sale evidence excluded from verified comp count') === -1) {
    missing.push('Subject property sale evidence excluded from verified comp count');
  }
  if (canonical.arv_range && !canonical.mao_range && missing.indexOf('Repair estimate for MAO') === -1) {
    missing.push('Repair estimate for MAO');
  }
  let nextAction = cleanText(result.message) || canonical.valuation_note || 'Comp research needs review.';
  if (status === 'temporarily_unavailable' || status === 'provider_temporarily_unavailable' || status === 'quota_or_rate_limited') {
    nextAction = 'Gemini is temporarily unavailable/high demand. Try again later.';
  } else if (status === 'timed_out') {
    nextAction = 'Gemini live comp research timed out before returning evidence. Try again later.';
  } else if (status === 'auth_error') {
    nextAction = 'Gemini is configured but authentication or permission failed. Verify the Gemini API key and model access.';
  } else if (status === 'provider_error' || status === 'failed_cleanly') {
    nextAction = 'Provider error. No valuation was generated.';
  } else if (status === 'blocked_source_address_conflict') {
    nextAction = 'Source URL address conflicts with Analyzer address. Verify before comp research.';
  }
  if (!verifiedCount && canonical.subject_sale_evidence.length && !canonical.candidate_sold_comps.length && !canonical.market_support.length) {
    nextAction = 'Only subject property evidence found. More nearby sold comps are needed.';
  } else if (!verifiedCount && canonical.market_support.length && !canonical.candidate_sold_comps.length) {
    nextAction = 'Gemini found market support, but no verified sold comps yet.';
  } else if (!verifiedCount && canonical.subject_sale_evidence.length) {
    nextAction = 'Subject property evidence was excluded from comps. More nearby sold comps are needed.';
  }
  return {
    provider_status: status,
    provider: cleanText(result.provider || 'none'),
    provider_label: result.provider && result.provider !== 'none' ? providerLabel(result.provider) : 'Not configured',
    candidates: canonical.candidates,
    verified_sold_comps: canonical.verified_sold_comps,
    subject_sale_evidence: canonical.subject_sale_evidence,
    candidate_sold_comps: canonical.candidate_sold_comps,
    market_support: canonical.market_support,
    not_usable_comp_results: canonical.not_usable_comp_results,
    verified_comp_count: canonical.verified_comp_count,
    subject_sale_evidence_count: canonical.subject_sale_evidence_count,
    candidate_comp_count: canonical.candidate_comp_count,
    market_support_count: canonical.market_support_count,
    not_usable_comp_count: canonical.not_usable_comp_count,
    missing_evidence: missing,
    next_action: nextAction,
    comp_search_strategy: cleanText(result.comp_search_strategy),
    missing_evidence_summary: cleanText(result.missing_evidence_summary),
    provider_next_action: cleanText(result.next_action),
    valuation_locked: canonical.valuation_locked,
    arv_range: canonical.arv_range,
    mao_range: canonical.mao_range,
    valuation_note: canonical.valuation_note,
    normalized_from_text: result.normalized_from_text === true,
    normalization_note: cleanText(result.normalization_note),
    property_evidence: Array.isArray(result.property_evidence) ? result.property_evidence : [],
    source_evidence: Array.isArray(result.source_evidence) ? result.source_evidence : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.map(cleanText).filter(Boolean) : [],
    citations: Array.isArray(result.citations) ? result.citations : [],
    raw_summary: cleanText(result.raw_summary),
    updated_at: new Date().toISOString()
  };
}

module.exports = {
  PROVIDER_STATUSES,
  getConfiguredCompProviders,
  isCompResearchConfigured,
  buildCompResearchRequest,
  validateCompResearchInput,
  runCompResearch,
  normalizeAddressKey,
  normalizeCompCandidate,
  validateVerifiedCompCandidate,
  classifyCompCandidate,
  canonicalizeCompResearchState,
  summarizeCompResearchState,
  addressConflictKey
};
