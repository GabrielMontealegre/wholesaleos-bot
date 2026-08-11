'use strict';

const fetchDefault = require('node-fetch');
const compResearchProvider = require('./comp-research-provider');
const fieldProvenance = require('./field-provenance');
const parcelProfiles = require('../sources/public-parcel-api-profiles');

const DEFAULT_CAPS = Object.freeze({
  max_rows: 6,
  max_results_per_row: 8,
  timeout_ms: 8000
});

const BLOCKED_TEXT_RE = /\b(captcha|verify you are human|access denied|forbidden|login required|sign in|subscription required|paywall)\b/i;
const NON_ARMS_LENGTH_RE = /\b(quitclaim|inter[-\s]?family|family transfer|gift deed|nominal|non[-\s]?arms|foreclosure deed|sheriff|tax deed)\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function numberValue(value) {
  return Number(cleanText(value).replace(/[^0-9.-]/g, '')) || 0;
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

function normalizeArcgisDate(value) {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num) && num > 1000000000) {
    return new Date(num).toISOString().slice(0, 10);
  }
  return cleanText(value);
}

function addressKey(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function subjectParcel(row) {
  return cleanText(row && (row.parcel_or_account || row.parcel_id || row.apn || row.source_row_reference)).toLowerCase();
}

function subjectZip(row) {
  return (cleanText(row && row.normalized_address).match(/\b\d{5}\b/) || [])[0] || cleanText(row && row.zip);
}

function compFromAttributes(attrs, profile, queryUrl) {
  const map = profile.field_map || {};
  const address = attrsValue(attrs, map.situs_address);
  const price = numberValue(attrsValue(attrs, map.sale_price));
  const soldDate = normalizeArcgisDate(attrsValue(attrs, map.sale_date));
  const parcelId = attrsValue(attrs, map.parcel_id);
  const landUse = attrsValue(attrs, map.land_use);
  const evidence = cleanText([
    address ? `Address: ${address}` : '',
    price ? `Recorded sale price: $${price}` : '',
    soldDate ? `Sale date: ${soldDate}` : '',
    parcelId ? `Parcel: ${parcelId}` : '',
    landUse ? `Use: ${landUse}` : ''
  ].filter(Boolean).join(' | '));
  return {
    comp_address: address,
    sold_status: 'sold',
    sold_price: price,
    sold_date: soldDate,
    parcel_id: parcelId,
    land_use: landUse,
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
    return { status: 'ok', data: JSON.parse(text) };
  } catch (error) {
    return { status: 'failed', blocked_reason: cleanText(error && error.message).slice(0, 100) || 'fetch_failed', data: null };
  } finally {
    clearTimeout(timer);
  }
}

function whereForRow(row, profile) {
  const map = profile.field_map || {};
  const clauses = [];
  const zip = subjectZip(row);
  if (zip && cleanText(map.zip)) clauses.push(`${map.zip} = '${zip.replace(/'/g, "''")}'`);
  const landUse = cleanText(row && (row.land_use || row.property_kind_if_visible));
  if (landUse && cleanText(map.land_use)) clauses.push(`UPPER(${map.land_use}) LIKE '%${landUse.toUpperCase().replace(/'/g, "''")}%'`);
  const priceField = cleanText(map.sale_price);
  const dateField = cleanText(map.sale_date);
  if (priceField) clauses.push(`${priceField} > 1`);
  if (dateField) clauses.push(`${dateField} IS NOT NULL`);
  return clauses.length ? clauses.join(' AND ') : '1=1';
}

function rejectReason(candidate, row) {
  if (subjectParcel(row) && cleanText(candidate.parcel_id).toLowerCase() === subjectParcel(row)) return 'subject_parcel_not_a_comp';
  if (addressKey(candidate.comp_address) && addressKey(candidate.comp_address) === addressKey(row && row.normalized_address)) return 'subject_address_not_a_comp';
  if (!(Number(candidate.sold_price) > 1)) return 'nominal_sale_price';
  if (NON_ARMS_LENGTH_RE.test(candidate.evidence_text)) return 'non_arms_length_transfer_visible';
  if (!fieldProvenance.compHasProvenance(candidate)) return 'missing_comp_provenance';
  const validation = compResearchProvider.validateVerifiedCompCandidate(candidate);
  return validation.verified ? '' : `missing_${validation.missing_fields.join('_').toLowerCase()}`;
}

async function resolveCompsForRow(row, options = {}) {
  const caps = normalizeCaps(options.caps);
  const profiles = Array.isArray(options.profiles) ? options.profiles : parcelProfiles.compProfilesForMarket(options.market || row || {});
  if (!profiles.length) return { status: 'no_profile', blocked_reason: 'no_verified_disclosure_state_sales_profile', verified_comps: [], rejected_comp_candidates: [] };
  const mock = options.mock_comp_features;
  for (const profile of profiles) {
    if (profile.api_kind !== 'arcgis') continue;
    const urlBase = layerUrl(profile);
    const queryUrl = `${urlBase}/query?f=json&where=${encodeURIComponent(whereForRow(row, profile))}&outFields=*&returnGeometry=false&resultRecordCount=${caps.max_results_per_row}`;
    const features = Array.isArray(mock)
      ? mock.map((attributes) => ({ attributes }))
      : await (async () => {
        const fetched = await fetchJson(queryUrl, options, caps);
        if (fetched.status !== 'ok') throw Object.assign(new Error(fetched.blocked_reason || fetched.status), { lookup_status: fetched.status, blocked_reason: fetched.blocked_reason, source_url: queryUrl });
        return Array.isArray(fetched.data && fetched.data.features) ? fetched.data.features : [];
      })();
    const verified = [];
    const rejected = [];
    for (const feature of features) {
      const candidate = compFromAttributes(feature.attributes || {}, profile, queryUrl);
      const rejection = rejectReason(candidate, row);
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
  resolveCompsForRow,
  runDisclosureStateCompResolution,
  compFromAttributes
};
