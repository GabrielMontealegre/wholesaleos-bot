'use strict';

const fetchDefault = require('node-fetch');
const parcelProfiles = require('../sources/public-parcel-api-profiles');

const DEFAULT_CAPS = Object.freeze({
  max_rows: 6,
  max_results_per_row: 5,
  timeout_ms: 8000
});

const ENTITY_SUFFIX_RE = /\b(?:llc|l\.l\.c\.|inc|inc\.|corp|corporation|company|co\.|lp|l\.p\.|llp|trust|partners|properties|holdings|ventures|capital|investments)\b/i;
const BLOCKED_TEXT_RE = /\b(captcha|verify you are human|access denied|forbidden|login required|sign in|subscription required|paywall)\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeCaps(caps) {
  const merged = Object.assign({}, DEFAULT_CAPS, caps || {});
  merged.max_rows = Math.max(1, Math.min(Number(merged.max_rows) || DEFAULT_CAPS.max_rows, 6));
  merged.max_results_per_row = Math.max(1, Math.min(Number(merged.max_results_per_row) || DEFAULT_CAPS.max_results_per_row, 10));
  merged.timeout_ms = Math.max(1000, Math.min(Number(merged.timeout_ms) || DEFAULT_CAPS.timeout_ms, 12000));
  return merged;
}

function isEntityName(value) {
  return ENTITY_SUFFIX_RE.test(cleanText(value));
}

function layerUrl(profile) {
  const base = cleanText(profile && profile.service_url).replace(/\/+$/, '');
  if (!base) return '';
  if (/\/(?:FeatureServer|MapServer)\/\d+$/i.test(base)) return base;
  return `${base}/${Number(profile && profile.layer) || 0}`;
}

function fieldList(fieldMap) {
  const fields = [];
  for (const value of Object.values(fieldMap || {})) {
    if (Array.isArray(value)) fields.push(...value);
    else if (cleanText(value)) fields.push(value);
  }
  return Array.from(new Set(fields.map(cleanText).filter(Boolean)));
}

function attrsValue(attrs, field) {
  if (!attrs || !field) return '';
  const direct = attrs[field];
  if (direct != null) return cleanText(direct);
  const key = Object.keys(attrs).find((item) => item.toLowerCase() === cleanText(field).toLowerCase());
  return key ? cleanText(attrs[key]) : '';
}

function combinedAttrsValue(attrs, fields) {
  if (!Array.isArray(fields)) return attrsValue(attrs, fields);
  return fields.map((field) => attrsValue(attrs, field)).filter(Boolean).join(' ');
}

function streetSearchTerm(row) {
  const address = cleanText(row && row.normalized_address);
  const street = cleanText(address.split(',')[0]);
  return street.replace(/'/g, "''");
}

function parcelSearchTerm(row) {
  return cleanText(row && (row.parcel_or_account || row.parcel_id || row.apn || row.source_row_reference))
    .replace(/'/g, "''");
}

function whereForRow(row, profile) {
  const map = profile && profile.field_map || {};
  const parcel = parcelSearchTerm(row);
  if (parcel && cleanText(map.parcel_id)) {
    return `${map.parcel_id} = '${parcel}'`;
  }
  const street = streetSearchTerm(row);
  const situsField = cleanText(map.situs_address);
  if (street && situsField) {
    const number = (street.match(/^\d{1,7}/) || [])[0];
    const words = street.replace(/^\d{1,7}\s+/, '').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
    if (number && words) return `${situsField} LIKE '%${number}%' AND UPPER(${situsField}) LIKE '%${words.toUpperCase()}%'`;
    return `UPPER(${situsField}) LIKE '%${street.toUpperCase()}%'`;
  }
  return '';
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
      headers: { Accept: 'application/json,text/plain,*/*', 'User-Agent': 'WholesaleOS Public Parcel Lookup/1.0' }
    });
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return { status: 'blocked', blocked_reason: `http_${response.status}`, data: null };
    }
    if (!response.ok) return { status: 'failed', blocked_reason: `http_${response.status}`, data: null };
    const text = await response.text();
    if (BLOCKED_TEXT_RE.test(text)) return { status: 'blocked', blocked_reason: 'captcha_or_login_wall', data: null };
    return { status: 'ok', data: JSON.parse(text) };
  } catch (error) {
    return { status: 'failed', blocked_reason: cleanText(error && error.message).slice(0, 100) || 'fetch_failed', data: null };
  } finally {
    clearTimeout(timer);
  }
}

function recordFromAttributes(attrs, profile, sourceUrl) {
  const map = profile.field_map || {};
  const ownerName = combinedAttrsValue(attrs, map.owner_name);
  const mailingAddress = combinedAttrsValue(attrs, map.mailing_address);
  const parcelId = combinedAttrsValue(attrs, map.parcel_id);
  const situsAddress = combinedAttrsValue(attrs, map.situs_address);
  const assessedValue = combinedAttrsValue(attrs, map.assessed_value);
  return {
    owner_name: ownerName,
    mailing_address: mailingAddress,
    parcel_id: parcelId,
    situs_address: situsAddress,
    is_entity: isEntityName(ownerName),
    source_kind: 'official_public_record',
    source_url: sourceUrl,
    evidence_text: cleanText([
      ownerName ? `Owner: ${ownerName}` : '',
      mailingAddress ? `Mailing: ${mailingAddress}` : '',
      parcelId ? `Parcel: ${parcelId}` : '',
      assessedValue ? `Assessed value clue: ${assessedValue}` : ''
    ].filter(Boolean).join(' | '))
  };
}

async function lookupOwnerForRow(row, options = {}) {
  const caps = normalizeCaps(options.caps);
  const profiles = Array.isArray(options.profiles) ? options.profiles : parcelProfiles.ownerProfilesForMarket(options.market || row || {});
  if (!profiles.length) return { status: 'no_profile', source_url: '', blocked_reason: 'no_verified_public_parcel_owner_profile' };
  for (const profile of profiles) {
    if (profile.api_kind !== 'arcgis') continue;
    const where = whereForRow(row, profile);
    const urlBase = layerUrl(profile);
    if (!where || !urlBase) continue;
    const outFields = fieldList(profile.field_map).join(',') || '*';
    const queryUrl = `${urlBase}/query?f=json&where=${encodeURIComponent(where)}&outFields=${encodeURIComponent(outFields)}&returnGeometry=false&resultRecordCount=${caps.max_results_per_row}`;
    const fetched = await fetchJson(queryUrl, options, caps);
    if (fetched.status !== 'ok') {
      return { status: fetched.status, blocked_reason: fetched.blocked_reason, source_url: queryUrl };
    }
    const features = Array.isArray(fetched.data && fetched.data.features) ? fetched.data.features : [];
    if (!features.length) continue;
    const records = features.map((feature) => recordFromAttributes(feature.attributes || {}, profile, queryUrl))
      .filter((record) => cleanText(record.owner_name) || cleanText(record.mailing_address) || cleanText(record.parcel_id));
    if (records.length === 1) {
      const record = records[0];
      return {
        status: cleanText(record.owner_name) ? 'owner_found' : 'no_match',
        owner_name: record.owner_name,
        mailing_address: record.mailing_address,
        parcel_id: record.parcel_id,
        is_entity: record.is_entity,
        source_url: record.source_url,
        evidence_text: record.evidence_text,
        owner_record: record,
        mailing_route: record.mailing_address ? {
          route_kind: 'mailing_address',
          value: record.mailing_address,
          source_kind: 'official_public_record',
          source_url: record.source_url,
          evidence_text: record.evidence_text,
          confidence: 'High',
          risk_flags: ['mail_only_route', 'owner_of_record_may_differ_from_occupant']
        } : null
      };
    }
    if (records.length > 1) {
      return {
        status: 'ambiguous',
        source_url: queryUrl,
        evidence_text: `${records.length} parcel records matched; manual parcel confirmation required.`
      };
    }
  }
  return { status: 'no_match', source_url: cleanText(layerUrl(profiles[0])), evidence_text: 'No matching public parcel owner record found.' };
}

function attemptForRow(row, result, nowIso) {
  const status = cleanText(result && result.status);
  const found = status === 'owner_found';
  const blocked = status === 'blocked' || status === 'failed';
  return {
    lane: 'county_appraisal',
    attempted_at: nowIso,
    outcome: found ? 'FOUND' : blocked ? (status === 'blocked' ? 'BLOCKED' : 'FAILED') : 'NOT_FOUND',
    reason_code: found ? 'OFFICIAL_OWNER_RECORD_FOUND' : blocked ? cleanText(result.blocked_reason || status).toUpperCase() : (status || 'NO_PUBLIC_PARCEL_MATCH').toUpperCase(),
    reason_text: found ? 'Owner-of-record and/or mailing route found in official public parcel API.' : cleanText(result && (result.evidence_text || result.blocked_reason)) || 'No official public parcel owner record matched this row.',
    source_url: cleanText(result && result.source_url) || cleanText(row && (row.source_document_url || row.source_url)),
    cost_usd: 0,
    next_eligible_at: ''
  };
}

async function runPublicParcelOwnerLookup(input = {}, options = {}) {
  const caps = normalizeCaps(input.caps || options.caps);
  const rows = (Array.isArray(input.rows) ? input.rows : []).filter((row) => cleanText(row && row.normalized_address) || cleanText(row && (row.parcel_or_account || row.source_row_reference)));
  const distinct = rows.slice(0, caps.max_rows);
  const results = new Map();
  const attempt_records = [];
  const now = new Date().toISOString();
  for (const row of distinct) {
    const result = await lookupOwnerForRow(row, Object.assign({}, options, { caps, market: input.market || options.market || row }));
    const key = cleanText(row.queue_key || row.normalized_address || row.source_row_reference).toLowerCase();
    results.set(key, result);
    if (row.normalized_address) results.set(cleanText(row.normalized_address).toLowerCase(), result);
    attempt_records.push(Object.assign({ row_key: key }, attemptForRow(row, result, now)));
  }
  return {
    results,
    attempt_records,
    rows_hunted: distinct.length,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  DEFAULT_CAPS,
  isEntityName,
  lookupOwnerForRow,
  runPublicParcelOwnerLookup
};
