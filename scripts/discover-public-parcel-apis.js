'use strict';

const fs = require('fs');
const path = require('path');
const fetchDefault = require('node-fetch');
const parcelProfiles = require('../modules/sources/public-parcel-api-profiles');
const countyCandidates = require('../modules/sources/county-candidate-registry');
const marketCompPolicy = require('../modules/research/market-comp-policy');

const BLOCKED_TEXT_RE = /\b(captcha|verify you are human|access denied|forbidden|login required|sign in|subscription required|paywall)\b/i;
const COUNTY_ONBOARDING_DIR = path.join(process.cwd(), 'exports', 'county-onboarding');
const PUBLIC_SALES_DISCOVERY_DIR = path.join(process.cwd(), 'exports', 'public-sales-layer-discovery');

const PRIORITY_SALES_COUNTIES = Object.freeze([
  { county: 'Wayne', state: 'MI', metro: 'Detroit', hosts: ['services2.arcgis.com/qvkbeam7Wirps6zC'] },
  { county: 'Oakland', state: 'MI', metro: 'Detroit' },
  { county: 'Macomb', state: 'MI', metro: 'Detroit' },
  { county: 'Franklin', state: 'OH', metro: 'Columbus' },
  { county: 'Hamilton', state: 'OH', metro: 'Cincinnati' },
  { county: 'Cuyahoga', state: 'OH', metro: 'Cleveland' },
  { county: 'Mecklenburg', state: 'NC', metro: 'Charlotte' },
  { county: 'Wake', state: 'NC', metro: 'Raleigh' },
  { county: 'Marion', state: 'IN', metro: 'Indianapolis' },
  { county: 'Duval', state: 'FL', metro: 'Jacksonville' },
  { county: 'Hillsborough', state: 'FL', metro: 'Tampa' },
  { county: 'Pinellas', state: 'FL', metro: 'Tampa' },
  { county: 'Broward', state: 'FL', metro: 'Fort Lauderdale' },
  { county: 'Clark', state: 'NV', metro: 'Las Vegas' },
  { county: 'Philadelphia', state: 'PA', metro: 'Philadelphia' },
  { county: 'Cook', state: 'IL', metro: 'Chicago' },
  { county: 'San Diego', state: 'CA', metro: 'San Diego' },
  { county: 'Los Angeles', state: 'CA', metro: 'Los Angeles' }
]);

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

async function fetchSchemaDocument(url, options = {}) {
  const fetchImpl = options.fetch_impl || options.fetchImpl || fetchDefault;
  const timeoutMs = Number(options.timeout_ms || options.timeoutMs || 12000);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'application/json,text/csv,text/plain,text/html,*/*', 'User-Agent': 'WholesaleOS County Onboarding/1.0' },
      signal: controller ? controller.signal : undefined
    });
  } catch (error) {
    const reason = error && error.name === 'AbortError' ? 'timeout' : cleanText(error && error.message).slice(0, 80) || 'fetch_failed';
    return { status: 'failed', blocked_reason: reason, data: null, url };
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return { status: 'blocked', blocked_reason: `http_${response.status}`, data: null, url };
  }
  if (response.status === 404) {
    return { status: 'not_found', blocked_reason: 'http_404', data: null, url };
  }
  if (!response.ok) return { status: 'failed', blocked_reason: `http_${response.status}`, data: null, url };
  const text = await response.text();
  if (BLOCKED_TEXT_RE.test(text)) return { status: 'blocked', blocked_reason: 'captcha_or_login_wall', data: null, url };
  if (/^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(text)) {
    return { status: 'closed', blocked_reason: 'html_portal_no_machine_readable_schema', data: null, url };
  }
  return { status: 'fetched', blocked_reason: '', data: text, url };
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
  const parcelId = find([/^apn$/i, /^pin$/i, /^ain$/i, /^parcel(?:_id|id|_number|number)?$/i, /propid/i, /parcel.*number/i]);
  return {
    owner_name: find([/^owner/i, /^own_?name/i, /^own/i, /^taxpayer_?1$/i, /^taxpayer.*name/i]),
    mailing_address: normalizedNames.filter((name) => /mail|own_addr|taxpayer_(?:street|city|state|zip)/i.test(name)).slice(0, 6),
    situs_address: find([/situs.*address/i, /^address$/i, /site.*address/i]),
    parcel_id: /^num_?parcels/i.test(parcelId) ? '' : parcelId,
    sale_price: find([/sale.*price/i, /amt_sale_price/i, /sold.*price/i, /consideration/i, /transfer.*amount/i, /sale.*amt/i]),
    sale_date: find([/sale.*date/i, /recording.*date/i, /docdate/i, /deed.*date/i, /transfer.*date/i, /recorded.*date/i]),
    land_use: find([/land.*use/i, /^class$/i, /class.*desc/i, /use.*desc/i, /property.*class/i, /use.*code/i]),
    year_built: find([/year.*built/i, /year_effective/i]),
    living_area: find([/living.*area/i, /bldg.*area/i, /building.*area/i, /sqft/i, /square.*feet/i]),
    assessed_value: find([/assessed.*value/i, /asr.*total/i, /total.*value/i, /totval/i, /taxable.*value/i]),
    prior_document_date: find([/docdate/i, /document.*date/i, /recording.*date/i, /recorded.*date/i, /deed.*date/i]),
    zip: find([/^zip$/i, /zip.*code/i, /postal/i]),
    field_count: names.size
  };
}

function hasSalesCompShape(fieldMap) {
  const capabilities = capabilitiesForMap(fieldMap);
  return capabilities.sale_price === true &&
    capabilities.sale_date === true &&
    (capabilities.situs_address === true || capabilities.parcel_id === true || capabilities.zip === true);
}

function salesDiscoveryTier(result) {
  if (!result || result.status !== 'open' || result.schema_parsed !== true) return 'blocked';
  return hasSalesCompShape(result.field_map_proposal) ? 'comp_capable' : 'schema_insufficient';
}

function countySlug(county) {
  return cleanText(county && county.county).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function hostCandidatesForCounty(county) {
  const explicit = Array.isArray(county && county.hosts) ? county.hosts : [];
  const slug = countySlug(county);
  const state = cleanText(county && county.state).toLowerCase();
  const baseHosts = [
    `${slug}county.gov`,
    `${slug}county${state}.gov`,
    `${slug}.${state}.gov`,
    `${slug}gis.${state}.gov`,
    `${slug}county.${state}.gov`
  ];
  const subdomains = ['gis', 'maps', 'opendata', 'services', 'data', `${slug}gis`];
  const derived = [];
  for (const host of baseHosts) {
    derived.push(host);
    for (const sub of subdomains) derived.push(`${sub}.${host}`);
  }
  return Array.from(new Set(explicit.concat(derived).map((item) => cleanText(item).replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase()).filter(Boolean)));
}

function arcgisDirectoryUrl(host) {
  return `https://${cleanText(host).replace(/\/+$/, '')}/arcgis/rest/services?f=json`;
}

function arcgisServiceUrl(host, service = {}) {
  const name = cleanText(service.name);
  const type = cleanText(service.type || 'FeatureServer');
  if (!name || !/^(?:FeatureServer|MapServer)$/i.test(type)) return '';
  return `https://${cleanText(host).replace(/\/+$/, '')}/arcgis/rest/services/${name}/${type}`;
}

function isLikelySalesService(service) {
  const haystack = `${cleanText(service && service.name)} ${cleanText(service && service.type)}`.toLowerCase().replace(/[_-]+/g, ' ');
  return /\b(sale|sales|assessor|assessment|parcel|property|tax|deed|transfer|record)\b/i.test(haystack);
}

async function inspectArcgisServiceLayers(host, service, county, options = {}) {
  const serviceUrl = arcgisServiceUrl(host, service);
  if (!serviceUrl) return [];
  const metadata = await fetchJson(`${serviceUrl}?f=json`, options);
  if (metadata.status !== 'ok') {
    return [{
      endpoint: serviceUrl,
      status: metadata.status,
      blocked_reason: metadata.blocked_reason || metadata.status,
      schema_parsed: false,
      field_list: [],
      field_map_proposal: {},
      record_count: null,
      tier: 'blocked'
    }];
  }
  const layers = Array.isArray(metadata.data && metadata.data.layers) ? metadata.data.layers : [];
  const tables = Array.isArray(metadata.data && metadata.data.tables) ? metadata.data.tables : [];
  const layerIds = layers.concat(tables)
    .map((layer) => Number(layer && layer.id))
    .filter((id) => Number.isInteger(id))
    .slice(0, Number(options.max_layers_per_service || 12));
  const ids = layerIds.length ? layerIds : [0];
  const reports = [];
  for (const id of ids) {
    const target = {
      market: `${cleanText(county.metro)} / ${cleanText(county.county)} ${cleanText(county.state)}`,
      purpose: 'recorded_sales',
      service_url: serviceUrl,
      layer: id,
      required_capabilities: ['sale_price', 'sale_date']
    };
    const inspected = await inspectArcgisLayer(target, options);
    const fieldList = Array.isArray(inspected.field_names) ? inspected.field_names : [];
    const fieldMap = inspected.field_map_guess || classifyFieldMap(fieldList);
    reports.push({
      endpoint: `${serviceUrl}/${id}`,
      status: inspected.status === 'open' ? 'open' : inspected.status,
      blocked_reason: inspected.status === 'open' ? '' : cleanText(inspected.blocked_reason || inspected.gate_status),
      schema_parsed: inspected.status === 'open' && fieldList.length > 0,
      schema_kind: 'arcgis_fields_descriptor',
      field_list: fieldList,
      field_map_proposal: fieldMap,
      record_count: inspected.record_count,
      exposes_price_date_location: hasSalesCompShape(fieldMap),
      tier: inspected.status === 'open' && hasSalesCompShape(fieldMap) ? 'comp_capable' : 'schema_insufficient',
      service_name: cleanText(service.name),
      layer: id
    });
    if (reports[reports.length - 1].tier === 'comp_capable') break;
  }
  return reports;
}

async function enumerateArcgisServiceDirectoryForCounty(county, options = {}) {
  const reports = [];
  for (const host of hostCandidatesForCounty(county).slice(0, Number(options.max_hosts_per_county || 18))) {
    const directory = await fetchJson(arcgisDirectoryUrl(host), options);
    if (directory.status !== 'ok') {
      reports.push({
        host,
        endpoint: arcgisDirectoryUrl(host),
        status: directory.status,
        blocked_reason: directory.blocked_reason || directory.status,
        schema_parsed: false,
        field_list: [],
        field_map_proposal: {},
        record_count: null,
        tier: 'blocked'
      });
      continue;
    }
    const services = (Array.isArray(directory.data && directory.data.services) ? directory.data.services : [])
      .filter((service) => /^(?:FeatureServer|MapServer)$/i.test(cleanText(service && service.type)))
      .filter(isLikelySalesService)
      .slice(0, Number(options.max_services_per_host || 20));
    if (!services.length) {
      reports.push({
        host,
        endpoint: arcgisDirectoryUrl(host),
        status: 'closed',
        blocked_reason: 'service_directory_has_no_likely_sales_or_parcel_services',
        schema_parsed: true,
        field_list: [],
        field_map_proposal: {},
        record_count: null,
        tier: 'blocked'
      });
      continue;
    }
    for (const service of services) {
      const layerReports = await inspectArcgisServiceLayers(host, service, county, options);
      reports.push(...layerReports.map((report) => Object.assign({ host }, report)));
      if (layerReports.some((report) => report.tier === 'comp_capable')) break;
    }
    if (reports.some((report) => report.host === host && report.tier === 'comp_capable')) break;
  }
  return reports;
}

async function querySocrataCatalogForCounty(county, options = {}) {
  const fetchImpl = options.fetch_impl || options.fetchImpl || fetchDefault;
  const query = encodeURIComponent(`${cleanText(county.county)} ${cleanText(county.state)} sales parcels`);
  const url = `https://api.us.socrata.com/api/catalog/v1?q=${query}`;
  const fetched = await fetchJson(url, Object.assign({}, options, { fetch_impl: fetchImpl }));
  if (fetched.status !== 'ok') {
    return [{ endpoint: url, status: fetched.status, blocked_reason: fetched.blocked_reason || fetched.status, schema_parsed: false, field_list: [], field_map_proposal: {}, record_count: null, tier: 'blocked' }];
  }
  const results = Array.isArray(fetched.data && fetched.data.results) ? fetched.data.results : [];
  return results.slice(0, Number(options.max_socrata_results || 8)).map((item) => {
    const resource = item && item.resource || {};
    const domain = cleanText(resource.domain || item && item.metadata && item.metadata.domain);
    const id = cleanText(resource.id);
    const relevantText = cleanText([
      domain,
      resource.name,
      resource.description,
      item && item.metadata && item.metadata.name,
      item && item.metadata && item.metadata.description
    ].join(' ')).toLowerCase();
    const countyNeedle = cleanText(county && county.county).toLowerCase();
    const metroNeedle = cleanText(county && county.metro).toLowerCase();
    const stateNeedle = cleanText(county && county.state).toLowerCase();
    const relevant = !!countyNeedle && (
      relevantText.includes(countyNeedle) ||
      (!!metroNeedle && relevantText.includes(metroNeedle) && relevantText.includes(stateNeedle))
    );
    const fields = (Array.isArray(resource.columns_field_name) ? resource.columns_field_name : [])
      .concat(Array.isArray(resource.columns_name) ? resource.columns_name : [])
      .map(cleanText)
      .filter(Boolean);
    const fieldMap = classifyFieldMap(fields);
    if (!domain || !id) {
      return {
        endpoint: url,
        status: 'closed',
        blocked_reason: 'socrata_result_missing_domain_or_resource_id',
        schema_parsed: fields.length > 0,
        schema_kind: fields.length ? 'socrata_catalog_fields_descriptor' : '',
        field_list: fields,
        field_map_proposal: fields.length ? fieldMap : {},
        record_count: null,
        exposes_price_date_location: false,
        tier: 'blocked',
        service_name: cleanText(resource.name)
      };
    }
    if (!relevant) {
      return {
        endpoint: `https://${domain}/resource/${id}.json`,
        status: 'closed',
        blocked_reason: 'socrata_result_not_county_relevant',
        schema_parsed: fields.length > 0,
        schema_kind: fields.length ? 'socrata_catalog_fields_descriptor' : '',
        field_list: fields,
        field_map_proposal: fields.length ? fieldMap : {},
        record_count: null,
        exposes_price_date_location: false,
        tier: 'blocked',
        service_name: cleanText(resource.name)
      };
    }
    return {
      endpoint: `https://${domain}/resource/${id}.json`,
      status: fields.length ? 'open' : 'closed',
      blocked_reason: fields.length ? '' : 'socrata_result_has_no_schema_fields',
      schema_parsed: fields.length > 0,
      schema_kind: 'socrata_catalog_fields_descriptor',
      field_list: fields,
      field_map_proposal: fieldMap,
      record_count: Number(resource.count || resource.row_count || 0) || null,
      exposes_price_date_location: hasSalesCompShape(fieldMap),
      tier: fields.length && hasSalesCompShape(fieldMap) ? 'comp_capable' : 'schema_insufficient',
      service_name: cleanText(resource.name)
    };
  });
}

function publicSalesProfileDraft(county, result, generatedAt, artifactPath) {
  if (!result || result.tier !== 'comp_capable') return null;
  validateFieldMapProposal(result.field_map_proposal || {}, result.field_list || []);
  return {
    profile_id: `${cleanText(county.state).toLowerCase()}_${countySlug(county)}_public_sales_discovery`,
    market: { city: cleanText(county.metro), county: cleanText(county.county), state: cleanText(county.state).toUpperCase() },
    county: cleanText(county.county),
    state: cleanText(county.state).toUpperCase(),
    api_kind: /arcgis/i.test(cleanText(result.schema_kind)) ? 'arcgis' : 'socrata',
    service_url: cleanText(result.endpoint).replace(/\/\d+$/, ''),
    layer: Number(result.layer) || 0,
    field_map: result.field_map_proposal,
    disclosure_state: true,
    verified_at: generatedAt.slice(0, 10),
    verification_status: 'verified_machine_readable_public_sales_schema',
    verification_evidence: cleanText(artifactPath).replace(/\\/g, '/'),
    record_count: Number(result.record_count) || null,
    notes: 'Discovered from a machine-readable government service directory. Sale price/date/location schema only; rows still require normal comp quality gates.'
  };
}

async function runPublicSalesLayerDiscovery(options = {}) {
  const counties = Array.isArray(options.counties) ? options.counties : PRIORITY_SALES_COUNTIES;
  const generatedAt = new Date().toISOString();
  const artifactPath = `exports/public-sales-layer-discovery/public-sales-layer-discovery-${generatedAt.replace(/[:.]/g, '-')}.json`;
  const countyReports = [];
  for (const county of counties) {
    const existingProfileResults = [];
    const existingCompProfiles = parcelProfiles.compProfilesForMarket({
      city: cleanText(county.metro),
      county: cleanText(county.county),
      state: cleanText(county.state)
    });
    for (const profile of existingCompProfiles) {
      const inspected = await inspectArcgisLayer({
        market: `${cleanText(county.metro)} / ${cleanText(county.county)} ${cleanText(county.state)}`,
        purpose: 'recorded_sales_existing_profile',
        service_url: profile.service_url,
        layer: profile.layer,
        required_capabilities: ['sale_price', 'sale_date']
      }, options);
      const fieldList = Array.isArray(inspected.field_names) ? inspected.field_names : [];
      const fieldMap = inspected.field_map_guess || classifyFieldMap(fieldList);
      existingProfileResults.push({
        endpoint: `${cleanText(profile.service_url).replace(/\/+$/, '')}/${Number(profile.layer) || 0}`,
        status: inspected.status === 'open' ? 'open' : inspected.status,
        blocked_reason: inspected.status === 'open' ? '' : cleanText(inspected.blocked_reason || inspected.gate_status),
        schema_parsed: inspected.status === 'open' && fieldList.length > 0,
        schema_kind: 'arcgis_fields_descriptor_existing_profile',
        field_list: fieldList,
        field_map_proposal: fieldMap,
        record_count: inspected.record_count || profile.record_count || null,
        exposes_price_date_location: hasSalesCompShape(fieldMap),
        tier: inspected.status === 'open' && hasSalesCompShape(fieldMap) ? 'comp_capable' : 'schema_insufficient',
        service_name: cleanText(profile.profile_id),
        layer: Number(profile.layer) || 0,
        source: 'existing_verified_profile'
      });
    }
    const arcgisResults = await enumerateArcgisServiceDirectoryForCounty(county, options);
    const socrataResults = options.skip_socrata === true ? [] : await querySocrataCatalogForCounty(county, options);
    const results = existingProfileResults.concat(arcgisResults, socrataResults);
    const compCapable = results.find((result) => result.tier === 'comp_capable') || null;
    countyReports.push({
      county: cleanText(county.county),
      state: cleanText(county.state).toUpperCase(),
      metro: cleanText(county.metro),
      status: compCapable ? 'open' : 'blocked',
      endpoint_found: cleanText(compCapable && compCapable.endpoint),
      record_count: Number(compCapable && compCapable.record_count) || null,
      exposes_price_date_location: !!compCapable,
      tier: compCapable ? 'comp_capable' : 'blocked',
      results,
      profile_draft: compCapable ? publicSalesProfileDraft(county, compCapable, generatedAt, artifactPath) : null
    });
    if (options.delay_ms) await new Promise((resolve) => setTimeout(resolve, options.delay_ms));
  }
  const report = {
    generated_at: generatedAt,
    preview_only: true,
    no_global_mutation: true,
    method: 'service_directory_schema_discovery',
    targets_checked: counties.length,
    counties: countyReports,
    profile_drafts: countyReports.map((county) => county.profile_draft).filter(Boolean)
  };
  if (options.write_output !== false) {
    const outDir = options.output_dir || PUBLIC_SALES_DISCOVERY_DIR;
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, path.basename(artifactPath));
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    report.output_path = outPath;
  }
  return report;
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
  capabilities.comp_location_key = capabilities.situs_address || capabilities.zip || capabilities.parcel_id;
  return capabilities;
}

function candidateLegsForCounty(county) {
  return [
    { leg: 'parcel', urls: county.candidate_parcel_hosts || [], kind: 'parcel' },
    { leg: 'sales', urls: county.candidate_sales_hosts || [], kind: 'sales' },
    { leg: 'distress', urls: county.candidate_distress_sources || [], kind: 'distress' }
  ];
}

function mappedFieldNames(fieldMap) {
  const map = fieldMap || {};
  return ['owner_name', 'mailing_address', 'situs_address', 'parcel_id', 'sale_price', 'sale_date', 'land_use', 'year_built', 'living_area', 'assessed_value', 'prior_document_date', 'zip']
    .flatMap((key) => Array.isArray(map[key]) ? map[key] : [map[key]])
    .map(cleanText)
    .filter(Boolean);
}

function validateFieldMapProposal(fieldMap, fieldList) {
  const fields = new Set((fieldList || []).map(cleanText).filter(Boolean));
  const invalid = mappedFieldNames(fieldMap).filter((name) => !fields.has(name));
  if (invalid.length) throw new Error(`field_map_not_in_schema:${invalid.join(',')}`);
  return true;
}

function schemaFieldsFromDocument(text, url) {
  const raw = String(text == null ? '' : text);
  if (/\.csv(?:$|[?#])/i.test(cleanText(url))) {
    const firstLine = raw.split(/\r?\n/, 1)[0] || '';
    const fields = firstLine.split(',').map((value) => cleanText(value.replace(/^"|"$/g, ''))).filter(Boolean);
    return fields.length ? { schema_kind: 'csv_header', field_list: fields } : null;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return null;
  }
  const descriptors = Array.isArray(data && data.fields)
    ? data.fields
    : Array.isArray(data && data.columns)
      ? data.columns
      : Array.isArray(data && data.metadata && data.metadata.columns)
        ? data.metadata.columns
        : [];
  const fields = descriptors.map((field) => cleanText(
    typeof field === 'string' ? field : field && (field.name || field.fieldName || field.field_name || field.id)
  )).filter(Boolean);
  if (!fields.length) return null;
  return {
    schema_kind: Array.isArray(data && data.fields) ? 'json_fields_descriptor' : 'socrata_columns_descriptor',
    field_list: fields
  };
}

function requirementsForLeg(kind, fieldMap) {
  const capabilities = capabilitiesForMap(fieldMap);
  if (kind === 'sales') {
    return {
      capabilities,
      missing: ['sale_price', 'sale_date', 'comp_location_key'].filter((name) => !capabilities[name])
    };
  }
  if (kind === 'parcel') {
    const missing = [];
    if (!capabilities.property_location_key) missing.push('property_location_key');
    if (!capabilities.owner_name && !capabilities.mailing_address) missing.push('owner_or_mailing_address');
    return { capabilities, missing };
  }
  return {
    capabilities,
    missing: capabilities.property_location_key ? [] : ['property_location_key']
  };
}

function salesPolicyAllowsCounty(county) {
  return marketCompPolicy.compPolicyForMarket({
    city: cleanText(county && county.metro),
    county: cleanText(county && county.county),
    state: cleanText(county && county.state).toUpperCase()
  }).comp_lane_enabled === true;
}

function isDocumentedSchemaEndpoint(url) {
  const value = cleanText(url);
  return /\/arcgis\/rest\/services\//i.test(value) && /\/(?:FeatureServer|MapServer)(?:\/\d+)?(?:$|[?#])/i.test(value) ||
    /\/api\/views\/[a-z0-9-]+(?:$|[?.#])/i.test(value) ||
    /\.(?:json|csv)(?:$|[?#])/i.test(value) ||
    /[?&]f=json(?:&|$)/i.test(value);
}

async function inspectCountySchemaEndpoint(county, leg, url, options = {}) {
  const normalizedUrl = cleanText(url);
  let schemaKind = '';
  let fieldList = [];
  let probeStatus = 'closed';
  let blockedReason = '';
  if (!isDocumentedSchemaEndpoint(normalizedUrl)) {
    return {
      url: normalizedUrl,
      status: 'closed',
      blocked_reason: 'html_portal_no_machine_readable_schema',
      schema_parsed: false,
      schema_kind: '',
      field_list: [],
      field_map_proposal: {}
    };
  }
  if (/\/arcgis\/rest\/services\//i.test(normalizedUrl) && /\/(?:FeatureServer|MapServer)(?:\/\d+)?(?:$|[?#])/i.test(normalizedUrl)) {
    const layerMatch = normalizedUrl.match(/\/(?:FeatureServer|MapServer)\/(\d+)(?:$|[?#])/i);
    const serviceUrl = normalizedUrl.replace(/[?#].*$/, '').replace(/\/(\d+)$/, '');
    const target = {
      market: `${cleanText(county && county.county)} ${cleanText(county && county.state)}`,
      purpose: leg.kind === 'sales' ? 'recorded_sales' : 'owner_and_land_use',
      service_url: serviceUrl,
      layer: layerMatch ? Number(layerMatch[1]) : Number(leg.layer || 0),
      required_capabilities: []
    };
    const arcgis = await inspectArcgisLayer(target, options);
    if (arcgis.status !== 'open') {
      return {
        url: normalizedUrl,
        status: arcgis.status || 'failed',
        blocked_reason: cleanText(arcgis.blocked_reason || arcgis.gate_status || 'arcgis_schema_unavailable'),
        schema_parsed: false,
        schema_kind: '',
        field_list: [],
        field_map_proposal: {}
      };
    }
    schemaKind = 'arcgis_fields_descriptor';
    fieldList = Array.isArray(arcgis.field_names) ? arcgis.field_names.slice() : [];
    probeStatus = fieldList.length ? 'schema_parsed' : 'closed';
    blockedReason = fieldList.length ? '' : 'arcgis_descriptor_has_no_fields';
  } else {
    const fetched = await fetchSchemaDocument(normalizedUrl, options);
    if (fetched.status !== 'fetched') {
      return {
        url: normalizedUrl,
        status: fetched.status,
        blocked_reason: fetched.blocked_reason || '',
        schema_parsed: false,
        schema_kind: '',
        field_list: [],
        field_map_proposal: {}
      };
    }
    const schema = schemaFieldsFromDocument(fetched.data, normalizedUrl);
    if (!schema) {
      return {
        url: normalizedUrl,
        status: 'closed',
        blocked_reason: 'response_has_no_machine_readable_schema',
        schema_parsed: false,
        schema_kind: '',
        field_list: [],
        field_map_proposal: {}
      };
    }
    schemaKind = schema.schema_kind;
    fieldList = schema.field_list;
    probeStatus = 'schema_parsed';
  }
  const fieldMapProposal = classifyFieldMap(fieldList);
  validateFieldMapProposal(fieldMapProposal, fieldList);
  const requirements = requirementsForLeg(leg.kind, fieldMapProposal);
  if (probeStatus !== 'schema_parsed') {
    return { url: normalizedUrl, status: 'closed', blocked_reason: blockedReason, schema_parsed: false, schema_kind: schemaKind, field_list: fieldList, field_map_proposal: {} };
  }
  if (leg.kind === 'sales' && !salesPolicyAllowsCounty(county)) {
    return {
      url: normalizedUrl,
      status: 'closed',
      blocked_reason: 'market_comp_policy_disables_public_sales_lane',
      schema_parsed: true,
      schema_kind: schemaKind,
      field_list: fieldList,
      field_map_proposal: fieldMapProposal,
      missing_required_capabilities: requirements.missing
    };
  }
  if (requirements.missing.length) {
    return {
      url: normalizedUrl,
      status: 'closed',
      blocked_reason: `schema_missing_required_fields:${requirements.missing.join(',')}`,
      schema_parsed: true,
      schema_kind: schemaKind,
      field_list: fieldList,
      field_map_proposal: fieldMapProposal,
      missing_required_capabilities: requirements.missing
    };
  }
  return {
    url: normalizedUrl,
    status: 'open',
    blocked_reason: '',
    schema_parsed: true,
    schema_kind: schemaKind,
    field_list: fieldList,
    field_map_proposal: fieldMapProposal,
    missing_required_capabilities: []
  };
}

function countyReadinessTierFromLegs(legs) {
  const openLegs = new Set((Array.isArray(legs) ? legs : []).filter((leg) => cleanText(leg && leg.status) === 'open').map((leg) => cleanText(leg && leg.leg)));
  const distressOpen = openLegs.has('distress');
  const parcelOpen = openLegs.has('parcel');
  const salesOpen = openLegs.has('sales');
  if (distressOpen && parcelOpen && salesOpen) return 'FULL';
  if (distressOpen && parcelOpen) return 'MAIL_ONLY';
  if (distressOpen) return 'PROOF_ONLY';
  return 'BLOCKED';
}

function countyReadinessStatusFromTier(tier) {
  const text = cleanText(tier).toUpperCase();
  if (text === 'FULL') return 'live';
  if (text === 'MAIL_ONLY') return 'piloting';
  if (text === 'PROOF_ONLY') return 'survey';
  return 'blocked';
}

function profileDraftFromLegReport(county, countyReport, generatedAt, artifactPath) {
  const report = countyReport || {};
  const tier = cleanText(report.readiness_tier).toUpperCase();
  const openLegs = Array.isArray(report.open_legs) ? report.open_legs.slice() : [];
  const fieldMaps = {};
  for (const leg of Array.isArray(report.legs) ? report.legs : []) {
    for (const result of Array.isArray(leg && leg.results) ? leg.results : []) {
      if (result && result.status === 'open' && result.field_map_proposal && typeof result.field_map_proposal === 'object') {
        Object.assign(fieldMaps, result.field_map_proposal);
      }
    }
  }
  const openResults = (Array.isArray(report.legs) ? report.legs : [])
    .flatMap((leg) => Array.isArray(leg && leg.results) ? leg.results : [])
    .filter((result) => result && result.status === 'open' && result.schema_parsed === true);
  const hasVerifiedSchema = openResults.length > 0 && openResults.every((result) => {
    validateFieldMapProposal(result.field_map_proposal || {}, result.field_list || []);
    return true;
  });
  const verificationStatus = hasVerifiedSchema
    ? `verified_machine_readable_schema_${tier.toLowerCase()}`
    : 'unverified_no_machine_readable_schema';
  const evidencePath = cleanText(artifactPath).replace(/\\/g, '/');
  return {
    county: cleanText(county && county.county),
    state: cleanText(county && county.state).toUpperCase(),
    metro: cleanText(county && county.metro),
    readiness_tier: tier,
    verification_status: verificationStatus,
    verified_at: hasVerifiedSchema ? generatedAt : null,
    verification_evidence: evidencePath,
    source_family: 'county_onboarding_discovery',
    source_url: Array.isArray(report.legs)
      ? cleanText((report.legs.find((leg) => cleanText(leg && leg.leg) === 'parcel') || report.legs[0] || {}).results?.[0]?.url || '')
      : '',
    city_names: openLegs.length ? [cleanText(county && county.metro)].filter(Boolean) : [],
    field_map: fieldMaps,
    blocked_reason: cleanText(report.blocked_reason),
    hypothesis: cleanText(county && county.notes),
    notes: cleanText(report.blocked_reason) || `No verified machine-readable schema for ${cleanText(county && county.county)} ${cleanText(county && county.state)}`
  };
}

function countyOnboardingArtifactsDir(outputDir) {
  return outputDir || COUNTY_ONBOARDING_DIR;
}

function countyOnboardingArtifactPath(report, outputDir) {
  const generatedAt = String(report && report.generated_at || new Date().toISOString()).replace(/[:.]/g, '-');
  return path.join(countyOnboardingArtifactsDir(outputDir), `county-onboarding-${generatedAt}.json`);
}

function countyOnboardingEvidencePath(report) {
  const generatedAt = String(report && report.generated_at || new Date().toISOString()).replace(/[:.]/g, '-');
  return `exports/county-onboarding/county-onboarding-${generatedAt}.json`;
}

async function runCountyOnboardingSweep(options = {}) {
  const counties = Array.isArray(options.counties) ? options.counties : countyCandidates.COUNTY_CANDIDATES;
  const countyReports = [];
  const reportGeneratedAt = new Date().toISOString();
  const artifactPath = countyOnboardingEvidencePath({ generated_at: reportGeneratedAt });
  for (const county of counties) {
    const legs = [];
    for (const leg of candidateLegsForCounty(county)) {
      const legReports = [];
      for (const url of leg.urls) {
        const result = await inspectCountySchemaEndpoint(county, leg, url, options);
        legReports.push(result);
        if (result.status === 'blocked') break;
      }
      legs.push({
        leg: leg.leg,
        status: legReports.some((item) => item.status === 'open')
          ? 'open'
          : legReports.some((item) => item.status === 'blocked')
            ? 'blocked'
            : legReports.some((item) => item.status === 'not_found')
              ? 'not_found'
              : legReports.some((item) => item.status === 'failed')
                ? 'failed'
                : 'closed',
        results: legReports
      });
    }
    const readinessTier = countyReadinessTierFromLegs(legs);
    const openLegs = legs.filter((item) => item.status === 'open').map((item) => item.leg);
    const closedLegs = legs.filter((item) => item.status !== 'open').map((leg) => ({
      leg: leg.leg,
      status: leg.status,
      reasons: (Array.isArray(leg.results) ? leg.results : []).map((result) => ({
        url: result.url,
        status: result.status,
        blocked_reason: result.blocked_reason || ''
      }))
    }));
    const blockedReason = closedLegs.flatMap((leg) => leg.reasons)
      .map((reason) => cleanText(reason.blocked_reason))
      .find(Boolean) || '';
    const overlap = openLegs.filter((leg) => closedLegs.some((closed) => closed.leg === leg));
    if (overlap.length) throw new Error(`open_closed_leg_overlap:${overlap.join(',')}`);
    countyReports.push({
      county: cleanText(county.county),
      state: cleanText(county.state),
      metro: cleanText(county.metro),
      tier: readinessTier,
      status: countyReadinessStatusFromTier(readinessTier),
      open_legs: openLegs,
      closed_legs: closedLegs,
      blocked_reason: blockedReason,
      hypothesis: cleanText(county.notes),
      legs,
      profile_draft: profileDraftFromLegReport(county, {
        readiness_tier: readinessTier,
        open_legs: openLegs,
        blocked_reason: blockedReason,
        legs
      }, reportGeneratedAt, artifactPath)
    });
  }
  const report = {
    generated_at: reportGeneratedAt,
    preview_only: true,
    no_global_mutation: true,
    targets_checked: counties.length,
    counties: countyReports,
    profile_drafts: countyReports.map((county) => county.profile_draft).filter(Boolean)
  };
  if (options.write_output !== false) {
    fs.mkdirSync(countyOnboardingArtifactsDir(options.output_dir), { recursive: true });
    const outPath = countyOnboardingArtifactPath(report, options.output_dir);
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    report.output_path = outPath;
  }
  return report;
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
  const countyMode = process.argv.includes('--county-onboarding') || process.env.COUNTY_ONBOARDING_MODE === '1';
  const salesMode = process.argv.includes('--public-sales') || process.env.PUBLIC_SALES_DISCOVERY_MODE === '1';
  const report = salesMode
    ? await runPublicSalesLayerDiscovery({
      delay_ms: 150,
      timeout_ms: Number(process.env.PUBLIC_SALES_DISCOVERY_TIMEOUT_MS || 8000) || 8000,
      max_hosts_per_county: Number(process.env.PUBLIC_SALES_DISCOVERY_MAX_HOSTS || 5) || 5,
      max_services_per_host: Number(process.env.PUBLIC_SALES_DISCOVERY_MAX_SERVICES || 12) || 12,
      max_layers_per_service: Number(process.env.PUBLIC_SALES_DISCOVERY_MAX_LAYERS || 8) || 8
    })
    : countyMode
    ? await runCountyOnboardingSweep({ delay_ms: 250, timeout_ms: 75000 })
    : await runDiscovery({ delay_ms: 250, timeout_ms: 75000 });
  const outDir = countyMode
    ? countyOnboardingArtifactsDir()
    : salesMode
      ? PUBLIC_SALES_DISCOVERY_DIR
    : path.join(process.cwd(), 'exports', 'public-parcel-api-discovery');
  if (countyMode || salesMode) {
    console.log(report.output_path || countyOnboardingArtifactPath(report, outDir));
    return;
  }
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
  countyReadinessTierFromLegs,
  inspectCountySchemaEndpoint,
  inspectArcgisLayer,
  enumerateArcgisServiceDirectoryForCounty,
  hasSalesCompShape,
  profileDraftFromLegReport,
  runPublicSalesLayerDiscovery,
  runCountyOnboardingSweep,
  runDiscovery,
  salesDiscoveryTier,
  schemaFieldsFromDocument,
  validateFieldMapProposal
};
