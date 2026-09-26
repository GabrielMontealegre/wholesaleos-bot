'use strict';

const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');
const { addressFromBulk } = require('./county-appraisal-adapter');

const callsByCounty = new Map();
const blocksByCounty = new Map();
const PAGE_SIZE = 1000;
const MAX_QUERY_URL_LENGTH = 6000;

function clean(value) { return String(value == null ? '' : value).trim(); }
function numberOrNull(value) {
  const number = Number(value);
  return value == null || clean(value) === '' || !Number.isFinite(number) || number <= 0 ? null : number;
}
function dateFromEpoch(value, timestamp = false) {
  const date = new Date(Number(value));
  if (value == null || clean(value) === '' || !Number.isFinite(date.getTime())) return '';
  return timestamp ? date.toISOString() : date.toISOString().slice(0, 10);
}
function completeAddress(value) {
  const parts = canonicalizeAddress(value);
  return ['number', 'street', 'suffix', 'city', 'state', 'zip'].every((field) => parts[field]) ? parts : null;
}
function centroid(geometry) {
  if (!geometry || !Array.isArray(geometry.rings)) return null;
  let area = 0;
  let longitude = 0;
  let latitude = 0;
  for (const ring of geometry.rings) {
    if (!Array.isArray(ring) || ring.length < 4) continue;
    const origin = ring[0];
    let ringArea = 0;
    let ringLongitude = 0;
    let ringLatitude = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const left = ring[index];
      const right = ring[index + 1];
      if (!Array.isArray(left) || !Array.isArray(right) ||
          !left.every(Number.isFinite) || !right.every(Number.isFinite)) return null;
      const x1 = left[0] - origin[0];
      const y1 = left[1] - origin[1];
      const x2 = right[0] - origin[0];
      const y2 = right[1] - origin[1];
      const cross = x1 * y2 - x2 * y1;
      ringArea += cross;
      ringLongitude += (x1 + x2) * cross;
      ringLatitude += (y1 + y2) * cross;
    }
    if (Math.abs(ringArea) < 1e-15) continue;
    area += ringArea;
    longitude += (origin[0] + ringLongitude / (3 * ringArea)) * ringArea;
    latitude += (origin[1] + ringLatitude / (3 * ringArea)) * ringArea;
  }
  if (Math.abs(area) < 1e-12) return null;
  const point = { longitude: longitude / area, latitude: latitude / area };
  return Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180 ? point : null;
}
function layerUrl(profile) {
  const config = profile && profile.arcgis_parcel_service;
  if (!config || !/^[a-z0-9.-]+$/i.test(config.host) ||
      !/^\/arcgis\/rest\/services\/[a-z0-9/_-]+\/MapServer$/i.test(config.service_path) ||
      !Number.isInteger(config.layer_id) || config.out_sr !== 4326) {
    throw new Error('county_parcel_profile_invalid');
  }
  return `https://${config.host}${config.service_path}/${config.layer_id}/query`;
}
function recordFromFeature(feature, profile, queryUrl) {
  const config = profile.arcgis_parcel_service;
  const attributes = feature && feature.attributes;
  if (!attributes || typeof attributes !== 'object') return null;
  const fields = Object.assign({}, config.address_fields, config.field_map, config.id_fields);
  const mapped = { field_map: fields };
  const value = (name) => attributes[fields[name]];
  const parcelId = clean(value('parcel_id'));
  if (!parcelId) return null;
  const address = addressFromBulk(attributes, mapped);
  const mailing = addressFromBulk(attributes, mapped, true);
  const acres = numberOrNull(value('acreage'));
  const stateCode = clean(value('state_code'));
  const point = centroid(feature.geometry);
  const sourceDate = dateFromEpoch(value('source_date'), true);
  const record = {
    county: profile.county, state: profile.state, parcel_id: parcelId,
    geo_id: clean(value('geo_id')), normalized_address: address,
    address_key: completeAddress(address) && canonicalizeAddress(address).canonical_string,
    owner_of_record: clean(value('owner_of_record')), owner_id: clean(value('owner_id')),
    mailing_address: mailing, legal_description: clean(value('legal_description')),
    state_code: stateCode,
    property_type: clean(profile.state_code_property_types && profile.state_code_property_types[stateCode]),
    lot_size_acres: acres, lot_size_sqft_approx: acres == null ? null : Math.round(acres * 43560),
    year_built: numberOrNull(value('year_built')),
    assessed_value: numberOrNull(value('assessed_value')),
    improvement_value: numberOrNull(value('improvement_value')),
    land_value: numberOrNull(value('land_value')),
    latest_deed_date: dateFromEpoch(value('latest_deed_date')),
    latest_deed_instrument: clean(value('latest_deed_instrument')),
    subdivision: clean(value('subdivision')), market_area: clean(value('market_area')),
    source_kind: 'official_public_record', source_url: queryUrl,
    source_reference_url: clean(value('source_reference_url')), source_date: sourceDate
  };
  if (point) Object.assign(record, point, {
    coordinate_source: 'official_county_parcel_polygon_centroid',
    coordinate_derivation: 'Derived from the public parcel polygon; not a measured building location.'
  });
  return record;
}
function quote(value) { return `'${clean(value).replace(/'/g, "''")}'`; }
function candidateClause(row, config) {
  const parcel = clean(row && (row.parcel_id || row.apn || row.owner_record && row.owner_record.parcel_id));
  if (parcel) {
    if (config.id_fields.parcel_id_numeric && !/^\d+$/.test(parcel)) return '';
    return `${config.id_fields.parcel_id}=${config.id_fields.parcel_id_numeric ? parcel : quote(parcel)}`;
  }
  const address = completeAddress(row && row.normalized_address);
  if (!address) return '';
  return `(${config.address_fields.situs_number}=${quote(address.number)} AND ` +
    `${config.address_fields.situs_street} LIKE ${quote(`${address.street}%`)})`;
}
function queryUrl(base, where, offset = 0) {
  const url = new URL(base);
  for (const [key, value] of Object.entries({ where, outFields: '*', returnGeometry: 'true',
    outSR: '4326', resultOffset: String(offset), resultRecordCount: String(PAGE_SIZE), f: 'json' })) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
function queryGroups(rows, profile) {
  const config = profile.arcgis_parcel_service;
  const base = layerUrl(profile);
  const clauses = [...new Set((rows || []).map((row) => candidateClause(row, config)).filter(Boolean))];
  const groups = [];
  let current = [];
  for (const clause of clauses) {
    if (current.length && queryUrl(base, [...current, clause].join(' OR ')).length > MAX_QUERY_URL_LENGTH) {
      groups.push(current.join(' OR '));
      current = [];
    }
    current.push(clause);
    if (queryUrl(base, current.join(' OR ')).length > MAX_QUERY_URL_LENGTH) throw new Error('county_parcel_query_too_long');
  }
  if (current.length) groups.push(current.join(' OR '));
  return groups.map((where) => ({ base, where }));
}
async function fetchCandidates(rows, profile, options = {}) {
  const config = profile.arcgis_parcel_service;
  const key = `${profile.state}|${profile.county}`;
  const blocked = options.blocked_state || blocksByCounty;
  const calls = options.rate_state || callsByCounty;
  const now = options.now_impl || Date.now;
  const wait = options.wait_impl || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const fetchImpl = options.fetch_impl || globalThis.fetch;
  const groups = queryGroups(rows, profile);
  const features = [];
  let requestCount = 0;
  if (blocked.has(key)) return { status: 'blocked', reason: blocked.get(key), request_count: 0, records: [] };
  for (const group of groups) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const history = (calls.get(key) || []).filter((at) => now() - at < 3600000);
      if (history.length >= 60) return { status: 'rate_limited', reason: 'county_limit_60_per_hour', request_count: requestCount, records: [] };
      if (history.length) await wait(Math.max(0, 3000 - (now() - history[history.length - 1])));
      const url = queryUrl(group.base, group.where, offset);
      history.push(now());
      calls.set(key, history);
      requestCount += 1;
      let response;
      try {
        response = await fetchImpl(url, { method: 'GET', redirect: 'manual',
          headers: { Accept: 'application/json', 'User-Agent': 'WholesaleOS County Parcel Read/1.0' } });
      } catch (_) {
        return { status: 'failed', reason: 'county_parcel_fetch_failed', request_count: requestCount, records: [] };
      }
      if (response.status === 403 || response.status === 429) {
        const reason = `http_${response.status}`;
        blocked.set(key, reason);
        return { status: 'blocked', reason, request_count: requestCount, records: [] };
      }
      if (!response.ok || response.status >= 300) {
        return { status: 'failed', reason: `http_${response.status}`, request_count: requestCount, records: [] };
      }
      let data;
      try { data = await response.json(); }
      catch (_) { return { status: 'failed', reason: 'county_parcel_json_invalid', request_count: requestCount, records: [] }; }
      if (data.error || !Array.isArray(data.features)) {
        return { status: 'failed', reason: data.error ? `arcgis_error_${data.error.code || 'unknown'}` : 'county_parcel_features_invalid',
          request_count: requestCount, records: [] };
      }
      for (const feature of data.features) features.push({ feature, source_url: url });
      if (!data.exceededTransferLimit) break;
      if (!data.features.length) return { status: 'failed', reason: 'county_parcel_pagination_empty', request_count: requestCount, records: [] };
    }
  }
  const seen = new Set();
  const records = features.filter(({ feature }) => {
    const identity = feature.attributes && feature.attributes.OBJECTID != null
      ? `object_id:${feature.attributes.OBJECTID}` : JSON.stringify(feature);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).map(({ feature, source_url }) => recordFromFeature(feature, profile, source_url)).filter(Boolean);
  return { status: 'ok', request_count: requestCount, records,
    source_host: config.host };
}

module.exports = { candidateClause, centroid, fetchCandidates, layerUrl, queryGroups, recordFromFeature };
