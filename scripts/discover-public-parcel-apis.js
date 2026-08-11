'use strict';

const fs = require('fs');
const path = require('path');
const fetchDefault = require('node-fetch');
const parcelProfiles = require('../modules/sources/public-parcel-api-profiles');

const BLOCKED_TEXT_RE = /\b(captcha|verify you are human|access denied|forbidden|login required|sign in|subscription required|paywall)\b/i;

const DEFAULT_TARGETS = [
  { market: 'Bexar TX', service_url: 'https://maps.bexar.org/arcgis/rest/services/Parcels/MapServer', layer: 0 },
  { market: 'San Diego CA', service_url: 'https://webmaps.sandiego.gov/arcgis/rest/services/GeocoderMerged/MapServer', layer: 1 },
  { market: 'Wayne MI', service_url: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/assessor_property_sales_view/FeatureServer', layer: 0 }
];

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function layerUrl(target) {
  const base = cleanText(target && target.service_url).replace(/\/+$/, '');
  if (!base) return '';
  if (/\/(?:FeatureServer|MapServer)\/\d+$/i.test(base)) return base;
  return `${base}/${Number(target && target.layer) || 0}`;
}

function ownerFields(fields) {
  return fields.filter((field) => /\b(owner|own_|ownname|mail|addr|situs|parcel|apn|sale|price|land|year|built)\b/i.test(cleanText(field.name))).map((field) => field.name);
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetch_impl || options.fetchImpl || fetchDefault;
  const timeoutMs = Number(options.timeout_ms || options.timeoutMs || 12000);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'follow',
      headers: { Accept: 'application/json,text/plain,*/*', 'User-Agent': 'WholesaleOS Public API Discovery/1.0' },
      signal: controller ? controller.signal : undefined
    });
  } catch (error) {
    const reason = error && error.name === 'AbortError' ? 'timeout' : cleanText(error && error.message).slice(0, 80) || 'fetch_failed';
    return { status: 'failed', blocked_reason: reason, data: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return { status: 'blocked', blocked_reason: `http_${response.status}`, data: null };
  }
  if (!response.ok) return { status: 'failed', blocked_reason: `http_${response.status}`, data: null };
  const text = await response.text();
  if (BLOCKED_TEXT_RE.test(text)) return { status: 'blocked', blocked_reason: 'captcha_or_login_wall', data: null };
  try {
    return { status: 'ok', data: JSON.parse(text) };
  } catch (error) {
    return { status: 'failed', blocked_reason: 'json_parse_failed', data: null };
  }
}

function classifyFieldMap(fieldNames) {
  const names = new Set((fieldNames || []).map(cleanText));
  const find = (patterns) => fieldNames.find((name) => patterns.some((pattern) => pattern.test(name))) || '';
  return {
    owner_name: find([/^owner/i, /^own_?name/i, /^own/i]),
    mailing_address: fieldNames.filter((name) => /mail|own_addr|addr/i.test(name)).slice(0, 6),
    situs_address: find([/situs.*address/i, /^address$/i, /site.*address/i]),
    parcel_id: find([/^apn$/i, /parcel/i, /ain/i, /propid/i]),
    sale_price: find([/sale.*price/i, /amt_sale_price/i, /sold.*price/i]),
    sale_date: find([/sale.*date/i, /docdate/i]),
    land_use: find([/land.*use/i, /class.*description/i, /property.*class/i]),
    year_built: find([/year.*built/i, /year_effective/i]),
    field_count: names.size
  };
}

async function inspectArcgisLayer(target, options = {}) {
  const url = `${layerUrl(target)}?f=json`;
  const meta = await fetchJson(url, options);
  if (meta.status !== 'ok') {
    return Object.assign({ market: target.market, service_url: target.service_url, layer: target.layer, status: meta.status }, meta);
  }
  const fields = Array.isArray(meta.data && meta.data.fields) ? meta.data.fields : [];
  const countUrl = `${layerUrl(target)}/query?f=json&where=1%3D1&returnCountOnly=true`;
  const count = await fetchJson(countUrl, options);
  const fieldNames = fields.map((field) => cleanText(field && field.name)).filter(Boolean);
  return {
    market: target.market,
    service_url: target.service_url,
    layer: target.layer,
    status: 'open',
    record_count: count.status === 'ok' ? Number(count.data && count.data.count || 0) || 0 : null,
    count_status: count.status,
    field_names: fieldNames,
    relevant_fields: ownerFields(fields),
    field_map_guess: classifyFieldMap(fieldNames),
    exposes_owner_name: /owner|own/i.test(fieldNames.join(' ')),
    exposes_mailing_address: /mail|own_addr/i.test(fieldNames.join(' ')),
    exposes_situs_address: /situs|address/i.test(fieldNames.join(' ')),
    exposes_sale_price: /sale.*price|amt_sale_price/i.test(fieldNames.join(' ')),
    exposes_sale_date: /sale.*date|docdate/i.test(fieldNames.join(' '))
  };
}

async function runDiscovery(options = {}) {
  const targets = Array.isArray(options.targets) ? options.targets : DEFAULT_TARGETS.concat(parcelProfiles.PROFILES.map((profile) => ({
    market: `${profile.county} ${profile.state}`,
    service_url: profile.service_url,
    layer: profile.layer
  })));
  const seen = new Set();
  const uniqueTargets = targets.filter((target) => {
    const key = `${target.service_url}|${target.layer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const results = [];
  for (const target of uniqueTargets) {
    try {
      results.push(await inspectArcgisLayer(target, options));
    } catch (error) {
      results.push({
        market: target.market,
        service_url: target.service_url,
        layer: target.layer,
        status: 'failed',
        blocked_reason: cleanText(error && error.message).slice(0, 120) || 'discovery_failed'
      });
    }
    if (options.delay_ms) await new Promise((resolve) => setTimeout(resolve, options.delay_ms));
  }
  return {
    generated_at: new Date().toISOString(),
    preview_only: true,
    no_global_mutation: true,
    targets_checked: uniqueTargets.length,
    results
  };
}

async function main() {
  const report = await runDiscovery({ delay_ms: 250 });
  const outDir = path.join(process.cwd(), 'exports', 'public-parcel-api-discovery');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `public-parcel-api-discovery-${report.generated_at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(outPath);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_TARGETS,
  classifyFieldMap,
  inspectArcgisLayer,
  runDiscovery
};
