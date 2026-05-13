'use strict';

var SOURCE_KINDS = {
  socrata: 'socrata',
  arcgis: 'arcgis',
  pdf: 'pdf',
  csv: 'csv',
  json: 'json',
  portal: 'portal',
  html: 'html',
  courthouse: 'courthouse',
  unknown: 'unknown'
};

var CONFIDENCE_LEVELS = ['low', 'medium', 'high'];
var CANONICAL_DISTRESS_TYPES = [
  'foreclosure',
  'auction',
  'tax_delinquent',
  'probate',
  'lien',
  'vacant',
  'utility_delinquent',
  'bankruptcy',
  'divorce',
  'code_violation',
  'fire_damage',
  'unsafe_structure',
  'demolition',
  'failed_listing',
  'price_reduction',
  'out_of_state_owner',
  'high_equity',
  'absentee_owner'
];

var DISTRESS_ALIASES = {
  pre_foreclosure: 'foreclosure',
  preforeclosure: 'foreclosure',
  lis_pendens: 'foreclosure',
  sheriff_sale: 'auction',
  tax_sale: 'auction',
  tax_deed: 'tax_delinquent',
  tax_lien: 'tax_delinquent',
  tax_delinquency: 'tax_delinquent',
  delinquent_tax: 'tax_delinquent',
  code_enforcement: 'code_violation',
  code_violations: 'code_violation',
  property_maintenance: 'code_violation',
  blight: 'code_violation',
  vacant_property: 'vacant',
  abandoned: 'vacant',
  unoccupied: 'vacant',
  utility_shutoff: 'utility_delinquent',
  utility_shut_off: 'utility_delinquent',
  water_shutoff: 'utility_delinquent',
  water_shut_off: 'utility_delinquent',
  fire_damaged: 'fire_damage',
  unsafe: 'unsafe_structure',
  unsafe_condition: 'unsafe_structure',
  demo_order: 'demolition',
  demolition_order: 'demolition',
  failed_mls: 'failed_listing',
  expired_listing: 'failed_listing',
  cancelled_listing: 'failed_listing',
  canceled_listing: 'failed_listing',
  price_reduced: 'price_reduction',
  price_drop: 'price_reduction',
  out_of_state: 'out_of_state_owner',
  potential_equity: 'high_equity'
};

function firstValue() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function asString(value) {
  if (value === undefined || value === null) return null;
  var str = String(value).trim();
  return str ? str : null;
}

function asNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  var n = Number(String(value).replace(/[$,\s]/g, ''));
  return isFinite(n) ? n : null;
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(function(v) { return v !== undefined && v !== null && v !== ''; });
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function normalizeDistressType(value) {
  var str = asString(value);
  if (!str) return null;
  var key = str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  key = DISTRESS_ALIASES[key] || key;
  return CANONICAL_DISTRESS_TYPES.indexOf(key) > -1 ? key : null;
}

function addCanonicalType(types, type) {
  var canonical = normalizeDistressType(type);
  if (canonical && types.indexOf(canonical) === -1) types.push(canonical);
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  var d = new Date(value);
  if (isNaN(d.getTime())) return asString(value);
  return d.toISOString().slice(0, 10);
}

function normalizeState(value) {
  var str = asString(value);
  return str ? str.toUpperCase().slice(0, 2) : null;
}

function normalizeSourceDetails(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object') {
    return {
      type: asString(value.type || value.source_type || value.kind),
      source_name: asString(value.source_name || value.name || value.label),
      raw_data: value.raw_data || value.raw || null
    };
  }
  return asString(value);
}

function normalizeSourceKind(value) {
  var kind = asString(value);
  if (!kind) return SOURCE_KINDS.unknown;
  var text = kind.toLowerCase().replace(/[_\s-]+/g, '');
  if (text.indexOf('socrata') > -1 || text.indexOf('ckan') > -1 || text.indexOf('carto') > -1) return SOURCE_KINDS.socrata;
  if (text.indexOf('arcgis') > -1 || text.indexOf('featureserver') > -1 || text.indexOf('mapserver') > -1) return SOURCE_KINDS.arcgis;
  if (text.indexOf('pdf') > -1) return SOURCE_KINDS.pdf;
  if (text.indexOf('csv') > -1) return SOURCE_KINDS.csv;
  if (text.indexOf('json') > -1) return SOURCE_KINDS.json;
  if (text.indexOf('courthouse') > -1) return SOURCE_KINDS.courthouse;
  if (text.indexOf('portal') > -1 || text.indexOf('playwright') > -1 || text.indexOf('accela') > -1 || text.indexOf('tyler') > -1 || text.indexOf('acclaim') > -1) return SOURCE_KINDS.portal;
  if (text.indexOf('html') > -1 || text.indexOf('web') > -1) return SOURCE_KINDS.html;
  return SOURCE_KINDS.unknown;
}

function normalizeSourceConfidence(value) {
  var str = asString(value);
  if (!str) return null;
  str = str.toLowerCase();
  if (CONFIDENCE_LEVELS.indexOf(str) > -1) return str;
  if (str === 'direct' || str === 'verified' || str === 'csv_direct' || str === 'excel_direct' || str === 'json_direct') return 'high';
  if (str === 'parse_failed' || str === 'scanned_image' || str === 'ocr_needed') return 'low';
  return 'medium';
}

function normalizeDistressTypes() {
  var values = [];
  for (var i = 0; i < arguments.length; i++) values = values.concat(asArray(arguments[i]));
  var text = values.map(function(v) {
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }).join(' ').toLowerCase();
  var types = [];

  function add(type) {
    addCanonicalType(types, type);
  }

  values.forEach(function(value) { add(value); });

  if (/foreclos|pre.?foreclos|lis.?pendens|notice.?of.?default/.test(text)) add('foreclosure');
  if (/auction|sheriff.?sale|trustee.?sale|tax.?sale/.test(text)) add('auction');
  if (/probate|estate|heir|letters testamentary/.test(text)) add('probate');
  if (/tax.?delin|delin.?tax|tax.?lien|tax.?sale|tax.?deed|treasurer/.test(text)) add('tax_delinquent');
  if (/code.?viol|code.?enforce|property.?maint|complaint/.test(text)) add('code_violation');
  if (/unsafe|condemn|dangerous building|structural hazard/.test(text)) add('unsafe_structure');
  if (/demo order|demolition/.test(text)) add('demolition');
  if (/\blien\b/.test(text)) add('lien');
  if (/bankruptcy|chapter 7|chapter 13/.test(text)) add('bankruptcy');
  if (/divorce|dissolution/.test(text)) add('divorce');
  if (/vacant|abandoned|unoccupied/.test(text)) add('vacant');
  if (/utility.?delin|utility.?shut.?off|water.?shut.?off|water.?disconnect|electric.?disconnect/.test(text)) add('utility_delinquent');
  if (/fire.?damage|fire.?damaged|burned|burnt/.test(text)) add('fire_damage');
  if (/expired.?listing|failed.?mls|cancelled.?listing|canceled.?listing/.test(text)) add('failed_listing');
  if (/price.?reduc|price.?drop/.test(text)) add('price_reduction');
  if (/out.?of.?state/.test(text)) add('out_of_state_owner');
  if (/absentee|non.?owner.?occupied/.test(text)) add('absentee_owner');
  if (/high.?equity|potential.?equity|equity.?play/.test(text)) add('high_equity');

  return types;
}

function estimateDistressScore(types, raw) {
  var score = 0;
  types = asArray(types);
  if (types.indexOf('foreclosure') > -1) score += 35;
  if (types.indexOf('auction') > -1) score += 25;
  if (types.indexOf('tax_delinquent') > -1) score += 30;
  if (types.indexOf('probate') > -1) score += 25;
  if (types.indexOf('code_violation') > -1) score += 20;
  if (types.indexOf('lien') > -1) score += 15;
  if (types.indexOf('utility_delinquent') > -1) score += 15;
  if (types.indexOf('bankruptcy') > -1) score += 15;
  if (types.indexOf('divorce') > -1) score += 10;
  if (types.indexOf('vacant') > -1) score += 10;
  if (types.indexOf('fire_damage') > -1) score += 25;
  if (types.indexOf('unsafe_structure') > -1) score += 20;
  if (types.indexOf('demolition') > -1) score += 20;
  if (types.indexOf('failed_listing') > -1) score += 10;
  if (types.indexOf('price_reduction') > -1) score += 10;
  if (types.indexOf('out_of_state_owner') > -1) score += 10;
  if (types.indexOf('absentee_owner') > -1) score += 10;
  if (types.indexOf('high_equity') > -1) score += 10;
  if (types.length > 1) score += 10;

  var years = asNumber(raw && raw.years_delinquent);
  if (years) score += Math.min(years * 5, 25);
  return Math.min(score, 100);
}

function normalizeAddressFields(raw, options) {
  raw = raw || {};
  options = options || {};
  var rawAddress = asString(firstValue(
    raw.raw_address,
    raw.address,
    raw.Address,
    raw.ADDRESS,
    raw.site_address,
    raw.SiteAddress,
    raw.SITE_ADDRESS,
    raw.property_address,
    raw.Property_Address,
    raw.PROPERTY_ADDRESS,
    raw.situs,
    raw.situs_address,
    raw.Situs_Address,
    raw.parcel_address,
    raw.location_address,
    raw.Location_Address,
    raw.LOCATION_ADDRESS,
    options.raw_address,
    options.address
  ));
  var city = asString(firstValue(raw.city, raw.City, raw.CITY, options.city));
  var state = normalizeState(firstValue(raw.state, raw.State, raw.STATE, options.state));
  var zip = asString(firstValue(raw.zip, raw.Zip, raw.ZIP, raw.zip_code, raw.zipcode, raw.postal_code, options.zip));
  var normalized = asString(firstValue(raw.normalized_address, options.normalized_address, rawAddress));

  if (normalized) {
    normalized = normalized
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    normalized_address: normalized,
    raw_address: rawAddress,
    city: city,
    state: state,
    zip: zip
  };
}

function normalizeTimeline(raw, options) {
  raw = raw || {};
  options = options || {};
  var auctionDate = normalizeDate(firstValue(raw.auction_date, raw.sale_date, raw.date, options.auction_date));
  var daysToAuction = asNumber(firstValue(raw.days_to_auction, options.days_to_auction));
  if (daysToAuction === null && auctionDate) {
    var d = new Date(auctionDate);
    if (!isNaN(d.getTime())) daysToAuction = Math.ceil((d.getTime() - Date.now()) / 86400000);
  }
  return {
    auction_date: auctionDate,
    days_to_auction: daysToAuction,
    opening_bid: asNumber(firstValue(raw.opening_bid, raw.bid, raw.amount, options.opening_bid)),
    tax_due: asNumber(firstValue(raw.tax_due, raw.tax_amount, raw.amount_due, options.tax_due)),
    years_delinquent: asNumber(firstValue(raw.years_delinquent, raw.tax_years, options.years_delinquent)),
    foreclosure_stage: asString(firstValue(raw.foreclosure_stage, raw.stage, options.foreclosure_stage)),
    probate_status: asString(firstValue(raw.probate_status, raw.case_status, raw.status, options.probate_status)),
    lien_amount: asNumber(firstValue(raw.lien_amount, raw.lien, raw.amount, options.lien_amount))
  };
}

function normalizeEvidence(raw, options) {
  raw = raw || {};
  options = options || {};
  var sourceUrl = asString(firstValue(raw.source_url, raw.sourceUrl, raw.url, options.source_url));
  var recordUrl = asString(firstValue(raw.source_record_url, raw.record_url, raw.case_url, options.source_record_url));
  var pdfUrl = asString(firstValue(raw.source_pdf_url, raw.pdf_source_url, raw.pdf_url, options.source_pdf_url));
  var queryUrl = asString(firstValue(raw.source_query_url, raw.query_url, options.source_query_url));
  var details = normalizeSourceDetails(firstValue(raw.source_details, options.source_details));

  return {
    urls: {
      source_url: sourceUrl,
      source_record_url: recordUrl,
      source_pdf_url: pdfUrl,
      source_query_url: queryUrl
    },
    source_details: details,
    record_key: asString(firstValue(raw.record_key, raw.case_number, raw.case, raw.record_id, raw.parcel, raw.apn, options.record_key)),
    snippets: asArray(firstValue(raw.evidence_snippets, raw.snippets, options.snippets)),
    confidence: normalizeSourceConfidence(firstValue(raw.source_confidence, raw.pdf_confidence, options.source_confidence))
  };
}

function normalizeSourcePayload(raw, options) {
  raw = raw || {};
  options = options || {};
  var address = normalizeAddressFields(raw, options);
  var timeline = normalizeTimeline(raw, options);
  var evidence = normalizeEvidence(raw, options);
  var kind = normalizeSourceKind(firstValue(options.source_kind, raw.source_kind, raw.source_platform, raw.source, raw.provider, evidence.urls.source_url));
  var sourceType = asString(firstValue(
    raw.source_type,
    raw.type,
    raw.doc_type,
    raw.motivation,
    options.source_type,
    evidence.source_details && evidence.source_details.type
  ));
  var recordEvidenceValues = [
    raw.distress_types,
    raw.priority_flags,
    raw.violations,
    raw.motivation,
    raw.good_deal_reasons,
    raw.evidence_snippets,
    raw.snippets,
    raw.doc_type,
    raw.source_type,
    raw.type,
    timeline.auction_date ? 'auction' : null,
    timeline.years_delinquent ? 'tax_delinquent' : null,
    timeline.lien_amount ? 'lien' : null,
    timeline.foreclosure_stage,
    timeline.probate_status
  ];
  var hasRecordEvidence = recordEvidenceValues.some(function(value) {
    return asArray(value).length > 0;
  });
  var sourceTypeForDistress = hasRecordEvidence ? sourceType : null;
  var sourceDetailsForDistress = hasRecordEvidence ? evidence.source_details : null;
  var distressTypes = normalizeDistressTypes(
    raw.distress_types,
    raw.priority_flags,
    raw.violations,
    raw.motivation,
    sourceTypeForDistress,
    sourceDetailsForDistress,
    raw.good_deal_reasons,
    timeline.auction_date ? 'auction' : null,
    timeline.years_delinquent ? 'tax_delinquent' : null,
    timeline.lien_amount ? 'lien' : null,
    timeline.foreclosure_stage,
    timeline.probate_status
  );
  var providedScore = asNumber(firstValue(raw.distress_score, raw.motivation_score, raw.score, options.distress_score));
  var confidence = evidence.confidence || normalizeSourceConfidence(firstValue(options.source_confidence, raw.source_confidence));

  return {
    source_id: asString(firstValue(raw.source_id, options.source_id)),
    source_kind: kind,
    provider: asString(firstValue(options.provider, raw.provider, raw.source)),
    state: address.state,
    county: asString(firstValue(raw.county, raw.County, options.county)),
    source_type: sourceType,
    source_url: evidence.urls.source_url,
    source_record_url: evidence.urls.source_record_url,
    source_pdf_url: evidence.urls.source_pdf_url,
    source_query_url: evidence.urls.source_query_url,
    normalized_address: address.normalized_address,
    raw_address: address.raw_address,
    city: address.city,
    zip: address.zip,
    owner_name: asString(firstValue(raw.owner_name, raw.owner, raw.Owner, options.owner_name)),
    owner_type: asString(firstValue(raw.owner_type, options.owner_type)),
    parcel: asString(firstValue(raw.parcel, raw.apn, raw.APN, raw.parcel_number, options.parcel)),
    case_number: asString(firstValue(raw.case_number, raw.case, raw.case_no, raw.record_id, options.case_number)),
    auction_date: timeline.auction_date,
    days_to_auction: timeline.days_to_auction,
    opening_bid: timeline.opening_bid,
    tax_due: timeline.tax_due,
    years_delinquent: timeline.years_delinquent,
    foreclosure_stage: timeline.foreclosure_stage,
    probate_status: timeline.probate_status,
    lien_amount: timeline.lien_amount,
    distress_types: distressTypes,
    distress_score: providedScore !== null ? providedScore : estimateDistressScore(distressTypes, raw),
    source_confidence: confidence,
    evidence: evidence,
    raw_payload: raw
  };
}

module.exports = {
  normalizeSourcePayload: normalizeSourcePayload,
  normalizeDistressTypes: normalizeDistressTypes,
  normalizeSourceKind: normalizeSourceKind,
  normalizeEvidence: normalizeEvidence,
  normalizeTimeline: normalizeTimeline,
  normalizeAddressFields: normalizeAddressFields,
  normalizeSourceDetails: normalizeSourceDetails,
  normalizeSourceConfidence: normalizeSourceConfidence,
  normalizeDistressType: normalizeDistressType,
  CANONICAL_DISTRESS_TYPES: CANONICAL_DISTRESS_TYPES,
  asArray: asArray,
  asString: asString,
  asNumber: asNumber
};
