'use strict';

const fetchDefault = require('node-fetch');
const compResearchProvider = require('./comp-research-provider');
const fieldProvenance = require('./field-provenance');
const parcelProfiles = require('../sources/public-parcel-api-profiles');
const strictCompGridConfig = require('./strict-comp-grid-config');

const DEFAULT_CAPS = Object.freeze({
  max_rows: 6,
  max_results_per_row: 8,
  timeout_ms: 8000
});
const DEFAULT_MIN_MARKET_SALE_PRICE = 5000;

const BLOCKED_TEXT_RE = /\b(captcha|verify you are human|access denied|forbidden|login required|sign in|subscription required|paywall)\b/i;
const NON_ARMS_LENGTH_RE = /\b(quitclaim|inter[-\s]?family|family transfer|gift deed|nominal|non[-\s]?arms|foreclosure deed|sheriff|tax deed)\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function numberValue(value) {
  return Number(cleanText(value).replace(/[^0-9.-]/g, '')) || 0;
}

function optionalNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(cleanText(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function normalizeCaps(caps) {
  const merged = Object.assign({}, DEFAULT_CAPS, caps || {});
  merged.max_rows = Math.max(1, Math.min(Number(merged.max_rows) || DEFAULT_CAPS.max_rows, 6));
  merged.max_results_per_row = Math.max(1, Math.min(Number(merged.max_results_per_row) || DEFAULT_CAPS.max_results_per_row, 20));
  merged.timeout_ms = Math.max(1000, Math.min(Number(merged.timeout_ms) || DEFAULT_CAPS.timeout_ms, 12000));
  return merged;
}

function attrsValue(attrs, field) {
  if (!attrs || !field) return '';
  if (attrs[field] != null) return cleanText(attrs[field]);
  const key = Object.keys(attrs).find((item) => item.toLowerCase() === cleanText(field).toLowerCase());
  return key ? cleanText(attrs[key]) : '';
}

function layerUrl(profile) {
  const base = cleanText(profile && profile.service_url).replace(/\/+$/, '');
  if (!base) return '';
  if (/\/(?:FeatureServer|MapServer)\/\d+$/i.test(base)) return base;
  return `${base}/${Number(profile && profile.layer) || 0}`;
}

function socrataUrl(profile) {
  return cleanText(profile && profile.service_url).replace(/\/+$/, '');
}

function normalizeArcgisDate(value) {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num) && num > 1000000000) {
    return new Date(num).toISOString().slice(0, 10);
  }
  return cleanText(value);
}

function isoDate(value) {
  const text = normalizeArcgisDate(value);
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : '';
}

function addMonthsIso(iso, months) {
  const base = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return '';
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
}

function todayIso(options = {}) {
  const explicit = isoDate(options.now_iso || options.nowIso || options.today_iso || options.todayIso);
  return explicit || new Date().toISOString().slice(0, 10);
}

function addressKey(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function subjectParcel(row) {
  return cleanText(row && (row.parcel_or_account || row.parcel_id || row.apn || row.pin)).toLowerCase();
}

function subjectZip(row) {
  const matches = cleanText(row && row.normalized_address).match(/\b\d{5}\b/g) || [];
  return matches.length ? matches[matches.length - 1] : cleanText(row && row.zip);
}

function rowLandUse(row) {
  return cleanText(row && (row.land_use || row.property_kind_if_visible || row.property_class_description));
}

function landUseTokens(value) {
  return cleanText(value).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !['property', 'class', 'description', 'building', 'parcel'].includes(token));
}

function similarityBasis(candidate, row) {
  const rowUse = landUseTokens(rowLandUse(row));
  const compUse = landUseTokens(candidate.land_use);
  const sharedUse = rowUse.find((token) => compUse.includes(token));
  if (sharedUse) return `land_use:${sharedUse}`;
  return '';
}

function normalizePropertyType(value) {
  const text = cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!text) return '';
  if (/\b(single family|singlefamily|sfr|one family|residential)\b/.test(text)) return 'single_family';
  if (/\b(townhome|townhouse|town home)\b/.test(text)) return 'townhouse';
  if (/\b(condo|condominium)\b/.test(text)) return 'condominium';
  if (/\b(duplex|triplex|fourplex|multi family|multifamily)\b/.test(text)) return 'multifamily';
  if (/\b(vacant|land|lot)\b/.test(text)) return 'vacant_land';
  if (/\b(mobile|manufactured)\b/.test(text)) return 'manufactured_home';
  return text.replace(/\s+/g, '_');
}

function coordinatePair(value) {
  const latitude = optionalNumber(value && (value.latitude != null ? value.latitude : value.lat));
  const longitude = optionalNumber(value && (value.longitude != null ? value.longitude : value.lng));
  if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function geometryCoordinates(geometry) {
  if (!geometry || geometry.x == null || geometry.y == null) return null;
  let longitude = Number(geometry.x);
  let latitude = Number(geometry.y);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
    longitude = longitude * 180 / 20037508.34;
    latitude = Math.atan(Math.exp(latitude * Math.PI / 20037508.34)) * 360 / Math.PI - 90;
  }
  return coordinatePair({ latitude, longitude });
}

function haversineMiles(a, b) {
  const left = coordinatePair(a);
  const right = coordinatePair(b);
  if (!left || !right) return null;
  const radians = (value) => Number(value) * Math.PI / 180;
  const deltaLat = radians(right.latitude - left.latitude);
  const deltaLon = radians(right.longitude - left.longitude);
  const part = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(part), Math.sqrt(1 - part));
}

function subjectGridFacts(row) {
  const story = row && row.property_story || {};
  return {
    coordinates: coordinatePair({
      latitude: row && (row.latitude != null ? row.latitude : row.geocoded_latitude),
      longitude: row && (row.longitude != null ? row.longitude : row.geocoded_longitude)
    }),
    property_type: normalizePropertyType(row && (row.property_kind || row.property_kind_if_visible || row.land_use || story.property_kind)),
    living_area: optionalNumber(row && (row.living_area || row.sqft || story.living_area || story.living_area_sqft)),
    bedrooms: optionalNumber(row && (row.bedrooms != null ? row.bedrooms : row.beds != null ? row.beds : story.bedrooms != null ? story.bedrooms : story.beds)),
    bathrooms: optionalNumber(row && (row.bathrooms != null ? row.bathrooms : row.baths != null ? row.baths : story.bathrooms != null ? story.bathrooms : story.baths)),
    year_built: optionalNumber(row && (row.year_built || story.year_built)),
    lot_size: optionalNumber(row && (row.lot_size || row.lot_size_sqft || story.lot_size || story.lot_size_sqft))
  };
}

function candidateGridFacts(candidate) {
  return {
    coordinates: coordinatePair(candidate),
    property_type: normalizePropertyType(candidate && (candidate.property_kind || candidate.land_use)),
    living_area: optionalNumber(candidate && (candidate.living_area || candidate.sqft)),
    bedrooms: optionalNumber(candidate && (candidate.bedrooms != null ? candidate.bedrooms : candidate.beds)),
    bathrooms: optionalNumber(candidate && (candidate.bathrooms != null ? candidate.bathrooms : candidate.baths)),
    year_built: optionalNumber(candidate && candidate.year_built),
    lot_size: optionalNumber(candidate && (candidate.lot_size || candidate.lot_size_sqft))
  };
}

function criterion(name, status, reason, subjectValue, compValue, threshold) {
  return {
    criterion: name,
    status,
    reason,
    subject_value: subjectValue == null ? null : subjectValue,
    comp_value: compValue == null ? null : compValue,
    threshold: threshold == null ? null : threshold
  };
}

function ruralReviewApproved(row, options) {
  const review = options.rural_exception_review || row && row.rural_comp_review;
  return !!(review && review.approved === true && cleanText(review.reviewed_by) && cleanText(review.reviewed_at));
}

function evaluateStrictCompGrid(candidate, row, options = {}) {
  const config = Object.assign({}, strictCompGridConfig, options.strict_comp_grid || {});
  const subject = subjectGridFacts(row || {});
  const comp = candidateGridFacts(candidate || {});
  const criteria = [];
  let firstRejection = '';
  let warning = '';
  const reject = (reason) => { if (!firstRejection) firstRejection = reason; };

  const floor = Number(options.min_market_sale_price || DEFAULT_MIN_MARKET_SALE_PRICE) || DEFAULT_MIN_MARKET_SALE_PRICE;
  const soldPrice = Number(candidate && candidate.sold_price) || 0;
  if (soldPrice >= floor) {
    criteria.push(criterion('market_sale_price', 'APPLIED_PASS', 'sale_price_above_market_floor', floor, soldPrice, `>=${floor}`));
  } else {
    criteria.push(criterion('market_sale_price', 'APPLIED_FAIL', 'nominal_or_non_market_sale_price', floor, soldPrice || null, `>=${floor}`));
    reject('nominal_or_non_market_sale_price');
  }

  const today = todayIso(options);
  const recentCutoff = addMonthsIso(today, -12);
  const staleCutoff = addMonthsIso(today, -24);
  const soldDate = isoDate(candidate && candidate.sold_date);
  if (!soldDate) {
    criteria.push(criterion('sold_recency', 'NOT_APPLIED', 'missing_sold_date', recentCutoff, null, 'sold within 12 months'));
    reject('missing_sold_date');
  } else if (staleCutoff && soldDate < staleCutoff) {
    criteria.push(criterion('sold_recency', 'APPLIED_FAIL', 'sale_outside_comp_window', recentCutoff, soldDate, 'sold within 12 months; reject beyond 24 months'));
    reject('sale_outside_comp_window');
  } else if (recentCutoff && soldDate < recentCutoff) {
    criteria.push(criterion('sold_recency', 'APPLIED_FAIL', 'stale_comp', recentCutoff, soldDate, 'sold within 12 months'));
    reject('stale_comp');
  } else {
    criteria.push(criterion('sold_recency', 'APPLIED_PASS', 'sold_within_12_months', recentCutoff, soldDate, 'sold within 12 months'));
  }

  const basis = cleanText(candidate && candidate.similarity_basis);
  if (basis) {
    criteria.push(criterion('similarity_basis', 'APPLIED_PASS', 'source_similarity_basis_present', cleanText(rowLandUse(row)), basis, 'at least one sourced similarity dimension'));
  } else {
    criteria.push(criterion('similarity_basis', 'NOT_APPLIED', 'missing_similarity_basis', cleanText(rowLandUse(row)), null, 'at least one sourced similarity dimension'));
    reject('missing_similarity_basis');
  }

  if (fieldProvenance.compHasProvenance(candidate || {})) {
    criteria.push(criterion('provenance', 'APPLIED_PASS', 'comp_provenance_present', null, cleanText(candidate && candidate.source_kind), 'accepted source kind plus exact source URL'));
  } else {
    criteria.push(criterion('provenance', 'NOT_APPLIED', 'missing_comp_provenance', null, cleanText(candidate && candidate.source_kind), 'accepted source kind plus exact source URL'));
    reject('missing_comp_provenance');
  }

  const miles = haversineMiles(subject.coordinates, comp.coordinates);
  if (miles == null) {
    criteria.push(criterion('distance', 'NOT_APPLIED', 'distance_coordinates_missing', subject.coordinates, comp.coordinates, `<=${config.max_distance_miles} mile`));
    reject('strict_grid_distance_not_applied');
  } else if (miles <= config.max_distance_miles) {
    criteria.push(criterion('distance', 'APPLIED_PASS', 'within_one_mile', Number(miles.toFixed(3)), Number(miles.toFixed(3)), `<=${config.max_distance_miles} mile`));
  } else if (ruralReviewApproved(row, options) && miles <= config.rural_operator_max_distance_miles) {
    warning = `Rural comp exception approved by operator; distance ${miles.toFixed(2)} miles exceeds the standard one-mile grid.`;
    criteria.push(criterion('distance', 'APPLIED_PASS', 'operator_approved_rural_exception', Number(miles.toFixed(3)), Number(miles.toFixed(3)), `operator-reviewed <=${config.rural_operator_max_distance_miles} miles`));
  } else {
    const reason = miles <= config.rural_operator_max_distance_miles ? 'rural_exception_requires_operator_review' : 'comp_outside_one_mile';
    criteria.push(criterion('distance', reason === 'rural_exception_requires_operator_review' ? 'OPERATOR_REVIEW_REQUIRED' : 'APPLIED_FAIL', reason, Number(miles.toFixed(3)), Number(miles.toFixed(3)), `<=${config.max_distance_miles} mile`));
    reject(reason);
  }

  if (!subject.property_type || !comp.property_type) {
    criteria.push(criterion('property_type', 'NOT_APPLIED', 'property_type_missing', subject.property_type, comp.property_type, 'same normalized property type'));
    reject('strict_grid_property_type_not_applied');
  } else if (subject.property_type !== comp.property_type) {
    criteria.push(criterion('property_type', 'APPLIED_FAIL', 'property_type_mismatch', subject.property_type, comp.property_type, 'same normalized property type'));
    reject('property_type_mismatch');
  } else {
    criteria.push(criterion('property_type', 'APPLIED_PASS', 'same_property_type', subject.property_type, comp.property_type, 'same normalized property type'));
  }

  if (!(subject.living_area > 0) || !(comp.living_area > 0)) {
    criteria.push(criterion('living_area', 'NOT_APPLIED', 'living_area_missing', subject.living_area, comp.living_area, `+/-${config.max_living_area_variance_ratio * 100}%`));
    reject('strict_grid_living_area_not_applied');
  } else {
    const variance = Math.abs(comp.living_area - subject.living_area) / subject.living_area;
    const passes = variance <= config.max_living_area_variance_ratio;
    criteria.push(criterion('living_area', passes ? 'APPLIED_PASS' : 'APPLIED_FAIL', passes ? 'living_area_within_20_percent' : 'living_area_outside_20_percent', subject.living_area, comp.living_area, `+/-${config.max_living_area_variance_ratio * 100}%`));
    if (!passes) reject('living_area_outside_20_percent');
  }

  [['bedrooms', config.max_bedroom_difference], ['bathrooms', config.max_bathroom_difference]].forEach(([name, allowed]) => {
    if (subject[name] == null || comp[name] == null) {
      criteria.push(criterion(name, 'NOT_APPLIED', `${name}_missing`, subject[name], comp[name], `difference <=${allowed}`));
      reject(`strict_grid_${name}_not_applied`);
      return;
    }
    const passes = Math.abs(comp[name] - subject[name]) <= allowed;
    criteria.push(criterion(name, passes ? 'APPLIED_PASS' : 'APPLIED_FAIL', passes ? `${name}_within_range` : `${name}_outside_range`, subject[name], comp[name], `difference <=${allowed}`));
    if (!passes) reject(`${name}_outside_range`);
  });

  [['year_built', config.max_year_built_difference, 'years'], ['lot_size', config.max_lot_size_variance_ratio, 'ratio']].forEach(([name, allowed, kind]) => {
    if (subject[name] == null || comp[name] == null) {
      criteria.push(criterion(name, 'NOT_APPLIED', `${name}_not_visible_on_both`, subject[name], comp[name], kind === 'years' ? `difference <=${allowed} years` : `+/-${allowed * 100}%`));
      return;
    }
    const difference = kind === 'years' ? Math.abs(comp[name] - subject[name]) : Math.abs(comp[name] - subject[name]) / subject[name];
    const passes = difference <= allowed;
    criteria.push(criterion(name, passes ? 'APPLIED_PASS' : 'APPLIED_FAIL', passes ? `${name}_similar` : `${name}_not_similar`, subject[name], comp[name], kind === 'years' ? `difference <=${allowed} years` : `+/-${allowed * 100}%`));
    if (!passes) reject(`${name}_not_similar`);
  });

  return {
    accepted: !firstRejection,
    rejected_reason: firstRejection || null,
    distance_miles: miles == null ? null : Number(miles.toFixed(3)),
    rural_exception_warning: warning || null,
    criteria
  };
}

function compFromAttributes(attrs, profile, queryUrl, context = {}, geometry = null) {
  const map = profile.field_map || {};
  const address = attrsValue(attrs, map.situs_address);
  const price = numberValue(attrsValue(attrs, map.sale_price));
  const soldDate = isoDate(attrsValue(attrs, map.sale_date)) || normalizeArcgisDate(attrsValue(attrs, map.sale_date));
  const parcelId = attrsValue(attrs, map.parcel_id);
  const landUse = attrsValue(attrs, map.land_use);
  const coordinates = geometryCoordinates(geometry) || coordinatePair({
    latitude: attrsValue(attrs, map.latitude),
    longitude: attrsValue(attrs, map.longitude)
  });
  const basis = similarityBasis({ land_use: landUse }, context.row);
  const windowText = context.recent_cutoff_iso
    ? `Comp window: ${context.recent_cutoff_iso} to ${context.today_iso}`
    : '';
  const evidence = cleanText([
    address ? `Address: ${address}` : '',
    price ? `Recorded sale price: $${price}` : '',
    soldDate ? `Sale date: ${soldDate}` : '',
    parcelId ? `Parcel: ${parcelId}` : '',
    landUse ? `Use: ${landUse}` : '',
    basis ? `Similarity: ${basis}` : '',
    windowText
  ].filter(Boolean).join(' | '));
  return {
    comp_address: address,
    comp_identity_kind: address ? 'street_address' : parcelId ? 'parcel_id_only' : '',
    sold_status: 'sold',
    sold_price: price,
    sold_date: soldDate,
    parcel_id: parcelId,
    land_use: landUse,
    property_kind: attrsValue(attrs, map.property_kind) || landUse,
    living_area: optionalNumber(attrsValue(attrs, map.living_area || map.sqft)),
    bedrooms: optionalNumber(attrsValue(attrs, map.bedrooms || map.beds)),
    bathrooms: optionalNumber(attrsValue(attrs, map.bathrooms || map.baths)),
    year_built: optionalNumber(attrsValue(attrs, map.year_built)),
    lot_size: optionalNumber(attrsValue(attrs, map.lot_size || map.lot_size_sqft)),
    latitude: coordinates && coordinates.latitude,
    longitude: coordinates && coordinates.longitude,
    similarity_basis: basis,
    comp_window: windowText,
    source_kind: 'official_public_record',
    source_url: queryUrl,
    evidence_text: evidence
  };
}

async function fetchJson(url, options = {}, caps = DEFAULT_CAPS) {
  const fetchImpl = options.fetch_impl || options.fetchImpl || fetchDefault;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), caps.timeout_ms);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'application/json,text/plain,*/*', 'User-Agent': 'WholesaleOS Public Sales Comp Lookup/1.0' }
    });
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return { status: 'blocked', blocked_reason: `http_${response.status}`, data: null };
    }
    if (!response.ok) return { status: 'failed', blocked_reason: `http_${response.status}`, data: null };
    const text = await response.text();
    if (BLOCKED_TEXT_RE.test(text)) return { status: 'blocked', blocked_reason: 'captcha_or_login_wall', data: null };
    const data = JSON.parse(text);
    if (data && data.error) {
      const code = cleanText(data.error.code);
      const message = cleanText(data.error.message);
      return { status: 'failed', blocked_reason: `arcgis_error_${code || 'unknown'}: ${message || 'ArcGIS error response'}`, data: null };
    }
    return { status: 'ok', data };
  } catch (error) {
    return { status: 'failed', blocked_reason: cleanText(error && error.message).slice(0, 100) || 'fetch_failed', data: null };
  } finally {
    clearTimeout(timer);
  }
}

function whereForRow(row, profile, options = {}) {
  const map = profile.field_map || {};
  const clauses = [];
  const zip = subjectZip(row);
  if (zip && cleanText(map.zip)) clauses.push(`${map.zip} = '${zip.replace(/'/g, "''")}'`);
  const landUse = rowLandUse(row);
  if (landUse && cleanText(map.land_use)) clauses.push(`UPPER(${map.land_use}) LIKE '%${landUse.toUpperCase().replace(/'/g, "''")}%'`);
  const priceField = cleanText(map.sale_price);
  const dateField = cleanText(map.sale_date);
  const floor = Number(profile.min_market_sale_price || options.min_market_sale_price || DEFAULT_MIN_MARKET_SALE_PRICE) || DEFAULT_MIN_MARKET_SALE_PRICE;
  const today = todayIso(options);
  const recentCutoff = addMonthsIso(today, -12);
  if (priceField) clauses.push(`${priceField} >= ${floor}`);
  if (dateField) {
    clauses.push(`${dateField} IS NOT NULL`);
    if (recentCutoff) clauses.push(`${dateField} >= DATE '${recentCutoff}'`);
  }
  return clauses.length ? clauses.join(' AND ') : '1=1';
}

function socrataLiteral(value) {
  return `'${cleanText(value).replace(/'/g, "''")}'`;
}

function socrataWhereForRow(row, profile, options = {}) {
  const map = profile.field_map || {};
  const clauses = [];
  const landUse = rowLandUse(row);
  if (landUse && cleanText(map.land_use)) clauses.push(`${map.land_use} like ${socrataLiteral(`%${landUse}%`)}`);
  const priceField = cleanText(map.sale_price);
  const dateField = cleanText(map.sale_date);
  const floor = Number(profile.min_market_sale_price || options.min_market_sale_price || DEFAULT_MIN_MARKET_SALE_PRICE) || DEFAULT_MIN_MARKET_SALE_PRICE;
  const today = todayIso(options);
  const recentCutoff = addMonthsIso(today, -12);
  if (priceField) clauses.push(`${priceField} >= ${floor}`);
  if (dateField && recentCutoff) clauses.push(`${dateField} >= ${socrataLiteral(recentCutoff)}`);
  return clauses.length ? clauses.join(' AND ') : '';
}

function queryUrlForProfile(row, profile, context, caps) {
  if (profile.api_kind === 'socrata') {
    const base = socrataUrl(profile);
    const params = new URLSearchParams();
    params.set('$limit', String(caps.max_results_per_row));
    const where = socrataWhereForRow(row, profile, context);
    if (where) params.set('$where', where);
    return `${base}?${params.toString()}`;
  }
  const urlBase = layerUrl(profile);
  return `${urlBase}/query?f=json&where=${encodeURIComponent(whereForRow(row, profile, context))}&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=${caps.max_results_per_row}`;
}

function rejectReason(candidate, row, options = {}) {
  const rowParcel = subjectParcel(row);
  const candidateParcel = cleanText(candidate.parcel_id).toLowerCase();
  if (rowParcel && candidateParcel === rowParcel) return 'subject_parcel_not_a_comp';
  if (addressKey(candidate.comp_address) && addressKey(candidate.comp_address) === addressKey(row && row.normalized_address)) return 'subject_address_not_a_comp';
  if (!cleanText(candidate.comp_address) && candidateParcel && !rowParcel) return 'parcel_only_comp_without_subject_parcel_id';
  const floor = Number(options.min_market_sale_price || DEFAULT_MIN_MARKET_SALE_PRICE) || DEFAULT_MIN_MARKET_SALE_PRICE;
  if (!(Number(candidate.sold_price) >= floor)) return 'nominal_or_non_market_sale_price';
  const today = todayIso(options);
  const recentCutoff = addMonthsIso(today, -12);
  const staleCutoff = addMonthsIso(today, -24);
  const soldDate = isoDate(candidate.sold_date);
  if (!soldDate) return 'missing_sold_date';
  if (staleCutoff && soldDate < staleCutoff) return 'sale_outside_comp_window';
  if (recentCutoff && soldDate < recentCutoff) return 'stale_comp';
  if (!cleanText(candidate.similarity_basis)) return 'missing_similarity_basis';
  if (NON_ARMS_LENGTH_RE.test(candidate.evidence_text)) return 'non_arms_length_transfer_visible';
  if (!fieldProvenance.compHasProvenance(candidate)) return 'missing_comp_provenance';
  const grid = candidate.comp_grid || evaluateStrictCompGrid(candidate, row, options);
  if (!grid.accepted) return grid.rejected_reason;
  const validation = compResearchProvider.validateVerifiedCompCandidate(candidate);
  return validation.verified ? '' : `missing_${validation.missing_fields.join('_').toLowerCase()}`;
}

async function resolveCompsForRow(row, options = {}) {
  const caps = normalizeCaps(options.caps);
  const profiles = Array.isArray(options.profiles) ? options.profiles : parcelProfiles.compProfilesForMarket(options.market || row || {});
  if (!profiles.length) return { status: 'no_profile', blocked_reason: 'no_verified_disclosure_state_sales_profile', verified_comps: [], rejected_comp_candidates: [] };
  const mock = options.mock_comp_features;
  for (const profile of profiles) {
    if (!['arcgis', 'socrata'].includes(profile.api_kind)) continue;
    const context = {
      row,
      today_iso: todayIso(options),
      recent_cutoff_iso: addMonthsIso(todayIso(options), -12),
      min_market_sale_price: Number(profile.min_market_sale_price || options.min_market_sale_price || DEFAULT_MIN_MARKET_SALE_PRICE) || DEFAULT_MIN_MARKET_SALE_PRICE
    };
    const queryUrl = queryUrlForProfile(row, profile, context, caps);
    let features;
    if (Array.isArray(mock)) {
      features = mock.map((item) => item && item.attributes ? item : ({ attributes: item }));
    } else {
      const fetched = await fetchJson(queryUrl, options, caps);
      if (fetched.status !== 'ok') {
        return {
          status: fetched.status,
          blocked_reason: fetched.blocked_reason || fetched.status,
          verified_comps: [],
          rejected_comp_candidates: [],
          source_url: queryUrl
        };
      }
      if (Array.isArray(fetched.data && fetched.data.features)) {
        features = fetched.data.features;
      } else if (Array.isArray(fetched.data)) {
        features = fetched.data.map((attributes) => ({ attributes }));
      } else {
        features = [];
      }
    }
    const verified = [];
    const rejected = [];
    for (const feature of features) {
      const candidate = compFromAttributes(feature.attributes || {}, profile, queryUrl, context, feature.geometry);
      candidate.comp_grid = evaluateStrictCompGrid(candidate, row, context);
      candidate.distance_miles = candidate.comp_grid.distance_miles;
      candidate.rural_comp_warning = candidate.comp_grid.rural_exception_warning;
      candidate.evidence_text = cleanText(`${candidate.evidence_text} | Strict comp grid: ${candidate.comp_grid.criteria.map((item) => `${item.criterion}=${item.status}`).join(', ')}`);
      const rejection = rejectReason(candidate, row, context);
      if (rejection) rejected.push(Object.assign({}, candidate, { rejected_reason: rejection }));
      else verified.push(candidate);
      if (verified.length >= 3) break;
    }
    return {
      status: verified.length >= 3 ? 'COMP_READY' : verified.length ? 'COMP_PARTIAL' : 'COMP_SEARCH_EXHAUSTED_FREE',
      verified_comps: verified.slice(0, 3),
      rejected_comp_candidates: rejected.slice(0, 8),
      source_url: queryUrl,
      evidence_text: `${verified.length} verified official recorded sale comp(s) found.`
    };
  }
  return { status: 'no_profile', blocked_reason: 'no_supported_disclosure_state_sales_profile', verified_comps: [], rejected_comp_candidates: [] };
}

function attemptForRow(row, result, nowIso) {
  const status = cleanText(result && result.status);
  const found = status === 'COMP_READY' || status === 'COMP_PARTIAL';
  const blocked = status === 'blocked' || status === 'failed';
  return {
    lane: 'sold_comp',
    attempted_at: nowIso,
    outcome: found ? 'FOUND' : blocked ? (status === 'blocked' ? 'BLOCKED' : 'FAILED') : 'NOT_FOUND',
    reason_code: found ? status : blocked ? cleanText(result.blocked_reason || status).toUpperCase() : (status || 'NO_DISCLOSURE_STATE_COMPS').toUpperCase(),
    reason_text: found
      ? `${Number(result && result.verified_comps && result.verified_comps.length || 0)} source-linked official recorded sale comp(s) found.`
      : cleanText(result && (result.blocked_reason || result.evidence_text)) || 'No official recorded sale comps found in the bounded free lookup.',
    source_url: cleanText(result && result.source_url) || cleanText(row && (row.source_document_url || row.source_url)),
    cost_usd: 0,
    next_eligible_at: ''
  };
}

async function runDisclosureStateCompResolution(input = {}, options = {}) {
  const caps = normalizeCaps(input.caps || options.caps);
  const rows = (Array.isArray(input.rows) ? input.rows : [])
    .filter((row) => cleanText(row && row.normalized_address))
    .slice(0, caps.max_rows);
  const results = new Map();
  const attempt_records = [];
  const now = new Date().toISOString();
  for (const row of rows) {
    let result;
    try {
      result = await resolveCompsForRow(row, Object.assign({}, options, { caps, market: input.market || options.market || row }));
    } catch (error) {
      result = { status: error.lookup_status === 'blocked' ? 'blocked' : 'failed', blocked_reason: cleanText(error.blocked_reason || error.message), source_url: cleanText(error.source_url) };
    }
    const key = cleanText(row.queue_key || row.normalized_address).toLowerCase();
    results.set(key, {
      free_comp_status: result.status,
      verified_comps: result.verified_comps || [],
      comp_candidates: result.rejected_comp_candidates || [],
      free_searches_run: [{ source: 'disclosure_state_public_sales_api', target: cleanText(result.source_url) }],
      blocked_sources: result.status === 'blocked' || result.status === 'failed'
        ? [{ source: 'disclosure_state_public_sales_api', url: cleanText(result.source_url), reason: cleanText(result.blocked_reason || result.status) }]
        : [],
      next_comp_action: result.status === 'COMP_READY' ? 'REVIEW_ARV_FROM_VERIFIED_PUBLIC_SALES' : 'GET_ADDITIONAL_VERIFIED_SOLD_COMPS',
      preview_only: true
    });
    attempt_records.push(Object.assign({ row_key: key }, attemptForRow(row, result, now)));
  }
  return {
    results,
    attempt_records,
    rows_hunted: rows.length,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  DEFAULT_CAPS,
  rejectReason,
  evaluateStrictCompGrid,
  haversineMiles,
  resolveCompsForRow,
  runDisclosureStateCompResolution,
  compFromAttributes
};
