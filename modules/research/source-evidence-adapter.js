'use strict';

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
    if (cursor !== undefined && cursor !== null && String(cursor).trim() !== '') return cursor;
  }
  return '';
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

const STATE_ABBREVIATIONS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA',
  'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY', 'DC'
]);

function isStateToken(value) {
  return STATE_ABBREVIATIONS.has(cleanText(value).toUpperCase());
}

function isZipToken(value) {
  return /^\d{5}(?:-\d{4})?$/.test(cleanText(value));
}

function titleCaseText(value) {
  return cleanText(value).split(/\s+/).filter(Boolean).map((word) => {
    return word.split('-').map((part) => {
      const piece = cleanText(part);
      if (!piece) return piece;
      return piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase();
    }).join('-');
  }).join(' ');
}

function parseUrl(sourceUrl) {
  const value = cleanText(sourceUrl);
  if (!isHttpUrl(value)) return null;
  try {
    return new URL(value);
  } catch (error) {
    return null;
  }
}

function classifySourceUrl(sourceUrl) {
  const value = cleanText(sourceUrl);
  if (!value) return 'missing_source_url';
  const parsed = parseUrl(value);
  if (!parsed) return 'unknown';

  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const probe = `${host} ${path} ${parsed.search}`.toLowerCase();
  if (/\.pdf(?:$|[?#])|\/pdf\/|document|notice|notices|download|file=/.test(probe)) return 'pdf_document';
  if (/realtor\.com$/i.test(host) && /\/realestateandhomes-detail\//i.test(path)) return 'exact_property_record';
  if (/redfin\.com$/i.test(host) && /\/[a-z]{2}\/[^/]+\/[^/]+\/home\/\d+/i.test(path)) return 'exact_property_record';
  if (/zillow\.com$/i.test(host) && /\/homedetails\//i.test(path)) return 'exact_property_record';
  if (/har\.com$/i.test(host) && /\/homedetail\//i.test(path)) return 'exact_property_record';
  if (/auction\.com$/i.test(host) && /\/details\//i.test(path)) return 'exact_property_record';
  if (/realauction\.com$/i.test(host) && /(?:zmethod=details|\/details\/|auctiondetails)/i.test(probe)) return 'exact_property_record';
  if ((host === 'craigslist.org' || host.endsWith('.craigslist.org')) &&
      /^\/(?:[^/]+\/)?reo\/d\/[^/]+\/\d{7,12}\.html$/i.test(path)) {
    return 'exact_property_record';
  }
  if (/\b\d{2,7}\b/.test(probe) &&
      /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b/i.test(probe) &&
      /\b(listing|details?|property|homes?|house|real-estate|realestate)\b/i.test(probe) &&
      !/\b(search|query|results|lookup|find|city|county|category|blog|article|archive)\b/i.test(probe)) {
    return 'exact_property_record';
  }
  if (/\b(parcel|apn|account|propertyid|property_id|case|cause|doc|record|detail|details)\b/.test(probe) &&
      /[?/&=]|\d{4,}|[a-z]{2,}\d{2,}/i.test(probe)) return 'exact_property_record';
  if (/\b(search|query|results|lookup|find|property-search|property_search)\b/.test(probe)) return 'county_search_page';
  if (/\b(list|auction|foreclosure|sheriff|tax-sale|taxsale|delinquent|calendar|docket|socrata|resource)\b/.test(probe)) return 'list_page';
  if (/\/$/.test(parsed.pathname) || parsed.pathname.split('/').filter(Boolean).length <= 1) return 'generic_portal';
  if (/\b(treasurer|assessor|recorder|clerk|court|county|gov)\b/.test(probe)) return 'generic_portal';
  return 'unknown';
}

function extractPropertyIdentityFromSourceUrl(sourceUrl) {
  const parsed = parseUrl(sourceUrl);
  if (!parsed) {
    return {
      address_candidate: '',
      city_candidate: '',
      state_candidate: '',
      zip_candidate: '',
      address_extracted_from_source_url: false
    };
  }

  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  const path = parsed.pathname || '';
  const decodedPath = decodeURIComponent(path);
  let street = '';
  let city = '';
  let state = '';
  let zip = '';

  function finalize() {
    const streetText = titleCaseText(street);
    const cityText = titleCaseText(city);
    const stateText = cleanText(state).toUpperCase();
    const zipText = cleanText(zip);
    const addressCandidate = cleanText([
      streetText,
      cityText,
      [stateText, zipText].filter(Boolean).join(' ')
    ].filter(Boolean).join(', ') || streetText);
    return {
      address_candidate: addressCandidate,
      city_candidate: cityText,
      state_candidate: stateText,
      zip_candidate: zipText,
      address_extracted_from_source_url: !!cleanText(addressCandidate)
    };
  }

  const realtorMatch = decodedPath.match(/\/realestateandhomes-detail\/([^/?#]+)/i);
  if (/realtor\.com$/i.test(host) && realtorMatch) {
    const parts = cleanText(realtorMatch[1]).split('_').map(cleanText).filter(Boolean);
    if (parts.length) {
      street = cleanText(parts[0]).replace(/-/g, ' ');
      city = parts[1] || '';
      state = parts[2] || '';
      zip = parts[3] || '';
      return finalize();
    }
  }

  const zillowMatch = decodedPath.match(/\/homedetails\/([^/?#]+)/i);
  if (/zillow\.com$/i.test(host) && zillowMatch) {
    const parts = cleanText(zillowMatch[1]).split('_').map(cleanText).filter(Boolean);
    if (parts.length) {
      street = cleanText(parts[0]).replace(/-/g, ' ');
      city = parts[1] || '';
      state = parts[2] || '';
      zip = parts[3] || '';
      return finalize();
    }
  }

  const harMatch = decodedPath.match(/\/homedetail\/([^/?#]+)/i);
  if (/har\.com$/i.test(host) && harMatch) {
    const tokens = cleanText(harMatch[1]).split('-').map(cleanText).filter(Boolean);
    if (tokens.length) {
      if (isZipToken(tokens[tokens.length - 1])) zip = tokens.pop();
      if (tokens.length && isStateToken(tokens[tokens.length - 1])) state = tokens.pop();
      if (tokens.length) city = tokens.pop();
      street = tokens.join(' ');
      return finalize();
    }
  }

  const redfinMatch = decodedPath.match(/\/([a-z]{2})\/([^/]+)\/([^/]+)\/home\/\d+/i);
  if (/redfin\.com$/i.test(host) && redfinMatch) {
    state = cleanText(redfinMatch[1]).toUpperCase();
    city = cleanText(redfinMatch[2]).replace(/-/g, ' ');
    const tokens = cleanText(redfinMatch[3]).split('-').map(cleanText).filter(Boolean);
    if (tokens.length && isZipToken(tokens[tokens.length - 1])) zip = tokens.pop();
    street = tokens.join(' ');
    return finalize();
  }

  const auctionMatch = decodedPath.match(/\/details\/([^/?#]+)/i);
  if (/auction\.com$/i.test(host) && auctionMatch) {
    const value = cleanText(auctionMatch[1]);
    if (value) {
      const parts = value.split(/[_-]/).map(cleanText).filter(Boolean);
      if (parts.length) {
        if (parts.length >= 6 && isZipToken(parts[parts.length - 1]) && isZipToken(parts[parts.length - 2])) {
          parts.pop();
        }
        if (parts.length && isZipToken(parts[parts.length - 1])) zip = parts.pop();
        if (parts.length && isStateToken(parts[parts.length - 1])) state = parts.pop();
        if (parts.length) city = parts.pop() || '';
        street = parts.join(' ');
        return finalize();
      }
    }
  }

  return {
    address_candidate: '',
    city_candidate: '',
    state_candidate: '',
    zip_candidate: '',
    address_extracted_from_source_url: false
  };
}

function sourceTypeLabel(type) {
  return ({
    exact_property_record: 'Source record',
    county_search_page: 'County search page',
    list_page: 'List page',
    pdf_document: 'PDF or document',
    generic_portal: 'Generic portal',
    missing_source_url: 'Missing',
    unknown: 'Needs review'
  })[type] || 'Needs review';
}

function sourceStatusLabel(type, identityStatus) {
  if (type === 'missing_source_url') return 'Missing';
  if (identityStatus === 'junk_address_blocked' || identityStatus === 'needs_source_repair') return 'Needs repair';
  if (type === 'county_search_page') return 'Search page only';
  if (type === 'generic_portal' || type === 'list_page' || type === 'unknown') return 'Needs review';
  return 'Found';
}

function sourceUrlFrom(job, lead) {
  const jobUrl = pick(job, ['source_url', 'sourceUrl', 'source_proof_url', 'sourceProofUrl']);
  if (isHttpUrl(jobUrl)) return cleanText(jobUrl);
  const leadUrl = pick(lead, [
    'source_record_url',
    'record_url',
    'verification_url',
    'source_pdf_url',
    'source_url',
    'source_details.record_url',
    'source_details.source_url',
    'source_details.query_url',
    'source_truth.source_record_url',
    'source_truth.source_url',
    '_courthouse_metadata.source_url',
    '_courthouse_metadata.source_pdf_url'
  ]);
  if (isHttpUrl(leadUrl)) return cleanText(leadUrl);
  if ((job || {}).input_type === 'property_link' && isHttpUrl((job || {}).input_value)) return cleanText(job.input_value);
  return '';
}

function resolvePropertyIdentityFromExistingFields(job, lead, sourceUrl) {
  lead = lead || {};
  job = job || {};
  const sourceIdentity = extractPropertyIdentityFromSourceUrl(sourceUrl);
  const addressCandidate = cleanText(pick(lead, [
    'address',
    'property_address',
    'situs_address',
    'site_address',
    'mailing_address'
  ]) || job.normalized_address || (job.input_type === 'pasted_address' ? job.input_value : '') || sourceIdentity.address_candidate);
  const cityCandidate = cleanText(pick(lead, [
    'city',
    'property_city',
    'situs_city'
  ]) || job.city || sourceIdentity.city_candidate);
  const stateCandidate = cleanText(pick(lead, [
    'state',
    'property_state',
    'situs_state'
  ]) || job.state || sourceIdentity.state_candidate).toUpperCase();
  const zipCandidate = cleanText(pick(lead, [
    'zip',
    'zipcode',
    'postal_code',
    'property_zip',
    'situs_zip'
  ]) || job.zip || sourceIdentity.zip_candidate);
  const sourceUrlAddressCandidate = cleanText(sourceIdentity.address_candidate);
  const addressExtractedFromSourceUrl = !!sourceUrlAddressCandidate;
  return {
    address_candidate: addressCandidate,
    city_candidate: cityCandidate,
    state_candidate: stateCandidate,
    zip_candidate: zipCandidate,
    source_url_address_candidate: sourceUrlAddressCandidate,
    address_extracted_from_source_url: addressExtractedFromSourceUrl,
    property_identity_basis: addressExtractedFromSourceUrl ? (addressCandidate === sourceUrlAddressCandidate ? 'source_url' : 'existing_fields+source_url') : 'existing_fields',
    owner_candidate: cleanText(pick(lead, [
      'owner',
      'owner_name',
      'property_owner',
      'source_details.owner',
      'source_truth.owner',
      '_courthouse_metadata.owner'
    ])),
    amount_candidate: cleanText(pick(lead, [
      'amount_owed',
      'tax_due',
      'tax_lien_amount',
      'lien_amount',
      'violation_amount',
      'judgment_amount',
      'minimum_bid',
      'source_amount',
      'source_details.amount_owed',
      'source_truth.amount',
      '_courthouse_metadata.lien_amount'
    ])),
    event_type: cleanText(pick(lead, [
      'event_type',
      'lead_type',
      'distress_type',
      'source_details.event_type',
      'source_details.type',
      'source_truth.event_type',
      '_courthouse_metadata.lead_type'
    ])),
    event_date: cleanText(pick(lead, [
      'event_date',
      'auction_date',
      'sale_date',
      'hearing_date',
      'filed_date',
      'created_at',
      'source_details.event_date',
      'source_truth.event_date',
      '_courthouse_metadata.auction_date'
    ])),
    source_ref: cleanText(pick(lead, [
      'case_number',
      'cause_number',
      'parcel',
      'apn',
      'parcel_id',
      'account_number',
      'source_reference',
      'source_details.case_number',
      'source_details.cause_number',
      'source_truth.case_number',
      '_courthouse_metadata.case_number',
      '_courthouse_metadata.parcel'
    ])),
    lead_ref: cleanText(job.lead_ref || pick(lead, ['ref_id', 'reference_id', 'ref', 'id']))
  };
}

function classifyPropertyIdentityStatus(evidencePack) {
  evidencePack = evidencePack || {};
  const address = cleanText(evidencePack.address_candidate);
  const sourceType = evidencePack.source_url_type || 'missing_source_url';
  const missingUrl = sourceType === 'missing_source_url';
  const isJunk = /\b(public information request|phone directory|page not found|contact us|contact|search results|court calendar)\b/i.test(address);
  const hasNumber = /\b\d{1,7}\b/.test(address);
  const hasStreetWord = /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop|sq|square)\b/i.test(address);

  if (isJunk) return 'junk_address_blocked';
  if (!address || !hasNumber || !hasStreetWord) return missingUrl ? 'unresolved' : 'needs_source_repair';
  if (sourceType === 'generic_portal') return 'needs_source_repair';
  if (evidencePack.source_ref && (sourceType === 'exact_property_record' || sourceType === 'pdf_document')) return 'resolved';
  if (sourceType === 'exact_property_record' || sourceType === 'pdf_document') return 'partial';
  if (sourceType === 'county_search_page' || sourceType === 'list_page' || sourceType === 'generic_portal' || sourceType === 'unknown') return 'partial';
  return 'unresolved';
}

function propertyIdentityLabel(status) {
  return ({
    resolved: 'Resolved',
    partial: 'Partial',
    unresolved: 'Needs repair',
    junk_address_blocked: 'Needs repair',
    needs_source_repair: 'Needs repair'
  })[status] || 'Needs repair';
}

function sourceEvidenceProofLevel(sourceUrlType, propertyIdentityStatus) {
  if (propertyIdentityStatus === 'resolved') return 'source_proof';
  if (propertyIdentityStatus === 'partial' && (sourceUrlType === 'exact_property_record' || sourceUrlType === 'pdf_document')) return 'source_proof';
  return 'source_context';
}

function missingFieldsFor(pack) {
  const missing = [];
  if (!pack.source_url) missing.push('Source record');
  if (pack.property_identity_status !== 'resolved' && pack.property_identity_status !== 'partial') missing.push('Property identity');
  if (!pack.address_candidate || pack.property_identity_status === 'junk_address_blocked') missing.push('Usable address');
  return missing;
}

function getSourceEvidenceNextAction(evidencePack) {
  evidencePack = evidencePack || {};
  if (evidencePack.source_url && !cleanText(evidencePack.address_candidate)) return 'Add the property address to analyze this link.';
  if (evidencePack.source_url_type === 'missing_source_url') return 'Needs source/property evidence before outreach.';
  if (evidencePack.property_identity_status === 'junk_address_blocked' || evidencePack.property_identity_status === 'needs_source_repair') {
    return 'Repair property identity from source record before comps.';
  }
  if (evidencePack.source_url_type === 'county_search_page') return 'County search page found - property identity still needs repair.';
  if (evidencePack.property_identity_status === 'partial') return 'Source evidence found. Confirm property identity before comps.';
  if (evidencePack.property_identity_status === 'resolved') return 'Source evidence found. Comps needed next.';
  return 'Verify source/property evidence before outreach.';
}

function confidenceFor(pack) {
  let score = 0;
  if (pack.source_url) score += 20;
  if (pack.source_url_type === 'exact_property_record' || pack.source_url_type === 'pdf_document') score += 25;
  if (pack.address_candidate) score += 20;
  if (pack.address_extracted_from_source_url) score += 10;
  if (pack.source_ref) score += 15;
  if (pack.owner_candidate) score += 5;
  if (pack.amount_candidate) score += 5;
  if (pack.property_identity_status === 'resolved') score += 10;
  if (pack.property_identity_status === 'junk_address_blocked') score = Math.min(score, 30);
  return Math.max(0, Math.min(score, 95));
}

function buildSourceEvidencePack(job, lead) {
  const sourceUrl = sourceUrlFrom(job, lead);
  const sourceUrlType = classifySourceUrl(sourceUrl);
  const identity = resolvePropertyIdentityFromExistingFields(job, lead, sourceUrl);
  const pack = Object.assign({
    source_url: sourceUrl,
    source_url_type: sourceUrlType,
    source_label: sourceTypeLabel(sourceUrlType),
    source_status: 'Missing',
    county: cleanText(pick(lead, ['county', 'property_county', 'situs_county'])),
    state: cleanText(pick(lead, ['state', 'property_state', 'situs_state'])).toUpperCase(),
    missing_fields: [],
    confidence: 0,
    next_action: '',
    notes: []
  }, identity);
  pack.property_identity_status = classifyPropertyIdentityStatus(pack);
  pack.property_identity_label = propertyIdentityLabel(pack.property_identity_status);
  pack.source_status = sourceStatusLabel(pack.source_url_type, pack.property_identity_status);
  pack.missing_fields = missingFieldsFor(pack);
  pack.confidence = confidenceFor(pack);
  pack.next_action = getSourceEvidenceNextAction(pack);
  if (pack.source_url && pack.property_identity_status === 'junk_address_blocked') {
    pack.notes.push('The source may still be useful, but the property address must be repaired first.');
  }
  if (pack.address_extracted_from_source_url) {
    pack.notes.push('Address extracted from property URL - verify before offer.');
  }
  if (pack.source_url_type === 'generic_portal' || pack.source_url_type === 'county_search_page' || pack.source_url_type === 'list_page') {
    pack.notes.push('This source is not treated as an exact property record yet.');
  }
  return pack;
}

module.exports = {
  classifySourceUrl,
  classifySourceRecordType: classifySourceUrl,
  extractPropertyIdentityFromSourceUrl,
  buildSourceEvidencePack,
  resolvePropertyIdentityFromExistingFields,
  classifyPropertyIdentityStatus,
  getSourceEvidenceNextAction,
  sourceTypeLabel,
  sourceEvidenceProofLevel
};
