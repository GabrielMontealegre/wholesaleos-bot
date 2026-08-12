'use strict';

const fs = require('fs');
const path = require('path');
const fetchDefault = require('node-fetch');
const parcelProfiles = require('../modules/sources/public-parcel-api-profiles');

const BLOCKED_TEXT_RE = /\b(captcha|verify you are human|access denied|forbidden|login required|sign in|subscription required|paywall)\b/i;

const DEFAULT_TARGETS = [
  {
    market: 'Detroit / Wayne MI parcel attributes',
    purpose: 'owner_and_land_use',
    service_url: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/Parcels_Current/FeatureServer',
    layer: 0,
    required_capabilities: ['owner_name', 'land_use', 'property_location_key']
  },
  {
    market: 'Bexar TX parcel owner retry',
    purpose: 'owner_and_land_use',
    service_url: 'https://maps.bexar.org/arcgis/rest/services/Parcels/MapServer',
    layer: 0,
    required_capabilities: ['owner_name', 'land_use', 'property_location_key']
  },
  {
    market: 'San Diego CA recorded-sales candidate',
    purpose: 'recorded_sales',
    service_url: 'https://webmaps.sandiego.gov/arcgis/rest/services/GeocoderMerged/MapServer',
    layer: 1,
    required_capabilities: ['sale_price', 'sale_date', 'comp_location_key']
  },
  {
    market: 'Los Angeles CA assessor-parcel candidate',
    purpose: 'recorded_sales',
    service_url: 'https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/ASSR_PARCELS_25_View/FeatureServer',
    layer: 0,
    required_capabilities: ['sale_price', 'sale_date', 'comp_location_key']
  },
  {
    market: 'Los Angeles CA multifamily-sales candidate',
    purpose: 'recorded_sales',
    service_url: 'https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/TENYRSALES50to300UNITSpt5A_2024/FeatureServer',
    layer: 0,
    required_capabilities: ['sale_price', 'sale_date', 'comp_location_key']
  },
  {
    market: 'Wayne MI recorded-sales profile',
    purpose: 'recorded_sales',
    service_url: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/assessor_property_sales_view/FeatureServer',
    layer: 0,
    required_capabilities: ['sale_price', 'sale_date', 'comp_location_key']
  }
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
  const normalizedNames = (fieldNames || []).map(cleanText).filter(Boolean);
  const names = new Set(normalizedNames);
  const find = (patterns) => {
    for (const pattern of patterns) {
      const match = normalizedNames.find((name) => pattern.test(name));
      if (match) return match;
    }
    return '';
  };
  return {
    owner_name: find([/^owner/i, /^own_?name/i, /^own/i, /^taxpayer_?1$/i, /^taxpayer.*name/i]),
    mailing_address: normalizedNames.filter((name) => /mail|own_addr|taxpayer_(?:street|city|state|zip)/i.test(name)).slice(0, 6),
    situs_address: find([/situs.*address/i, /^address$/i, /site.*address/i]),
    parcel_id: find([/^apn$/i, /parcel/i, /ain/i, /propid/i, /parcel.*number/i]),
    sale_price: find([/sale.*price/i, /amt_sale_price/i, /sold.*price/i]),
    sale_date: find([/sale.*date/i, /recording.*date/i, /docdate/i]),
    land_use: find([/land.*use/i, /class.*desc/i, /use.*desc/i, /property.*class/i, /use.*code/i]),
    year_built: find([/year.*built/i, /year_effective/i]),
    zip: find([/^zip$/i, /zip.*code/i, /postal/i]),
    field_count: names.size
  };
}

function capabilitiesForMap(fieldMap) {
  const map = fieldMap || {};
  const capabilities = {
    owner_name: Boolean(cleanText(map.owner_name)),
    mailing_address: Array.isArray(map.mailing_address) && map.mailing_address.length > 0,
    situs_address: Boolean(cleanText(map.situs_address)),
    parcel_id: Boolean(cleanText(map.parcel_id)),
    sale_price: Boolean(cleanText(map.sale_price)),
    sale_date: Boolean(cleanText(map.sale_date)),
    land_use: Boolean(cleanText(map.land_use)),
    zip: Boolean(cleanText(map.zip))
  };
  capabilities.property_location_key = capabilities.situs_address || capabilities.zip || capabilities.parcel_id;
  capabilities.comp_location_key = capabilities.situs_address || capabilities.zip;
  return capabilities;
}

async function inspectArcgisLayer(target, options = {}) {
  const url = `${layerUrl(target)}?f=json`;
  const meta = await fetchJson(url, options);
  if (meta.status !== 'ok') {
    return Object.assign({
      market: target.market,
      purpose: cleanText(target.purpose),
      service_url: target.service_url,
      layer: target.layer,
      status: meta.status,
      gate_status: meta.status,
      required_capabilities: Array.isArray(target.required_capabilities) ? target.required_capabilities.slice() : []
    }, meta);
  }
  const fields = Array.isArray(meta.data && meta.data.fields) ? meta.data.fields : [];
  const countUrl = `${layerUrl(target)}/query?f=json&where=1%3D1&returnCountOnly=true`;
  const count = await fetchJson(countUrl, options);
  const fieldNames = fields.map((field) => cleanText(field && field.name)).filter(Boolean);
  const fieldMapGuess = classifyFieldMap(fieldNames);
  const capabilities = capabilitiesForMap(fieldMapGuess);
  const requiredCapabilities = Array.isArray(target.required_capabilities) ? target.required_capabilities.slice() : [];
  const missingRequiredCapabilities = requiredCapabilities.filter((capability) => capabilities[capability] !== true);
  return {
    market: target.market,
    purpose: cleanText(target.purpose),
    service_url: target.service_url,
    layer: target.layer,
    status: 'open',
    gate_status: missingRequiredCapabilities.length ? 'open_insufficient_fields' : 'open_usable',
    record_count: count.status === 'ok' ? Number(count.data && count.data.count || 0) || 0 : null,
    count_status: count.status,
    field_names: fieldNames,
    relevant_fields: ownerFields(fields),
    field_map_guess: fieldMapGuess,
    capabilities,
    required_capabilities: requiredCapabilities,
    missing_required_capabilities: missingRequiredCapabilities,
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
        purpose: cleanText(target.purpose),
        service_url: target.service_url,
        layer: target.layer,
        status: 'failed',
        gate_status: 'failed',
        required_capabilities: Array.isArray(target.required_capabilities) ? target.required_capabilities.slice() : [],
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
  const report = await runDiscovery({ delay_ms: 250, timeout_ms: 75000 });
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
  capabilitiesForMap,
  classifyFieldMap,
  inspectArcgisLayer,
  runDiscovery
};
