'use strict';

const dallasPriority = require('./dallas-source-priority-router');
const sourceAdapterRegistry = require('./source-adapter-registry');

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const SECONDARY_DALLAS_SOURCES = [
  {
    source_id: 'tx_dallas_craigslist_owner_posts',
    source_name: 'Dallas Craigslist owner real-estate posts',
    source_family: 'craigslist_owner_fsbo',
    priority_score: 90,
    official_source: false,
    source_type: 'public individual owner post',
    adapter_id: 'dallas_craigslist_owner_acquisition_adapter',
    readiness: 'Preview adapter ready',
    use_policy: 'contact_first_lead_source',
    likely_call_ready: true,
    auto_select: false,
    preview_only: true,
    should_ingest: false
  },
  {
    source_id: 'tx_dallas_fsbo_contact_first',
    source_name: 'Dallas FSBO / owner-contact listing sources',
    source_family: 'fsbo',
    priority_score: 86,
    official_source: false,
    source_type: 'public listing source',
    adapter_id: 'dallas_fsbo_contact_acquisition_adapter',
    readiness: 'Preview adapter ready',
    use_policy: 'lead_source',
    likely_call_ready: true,
    auto_select: false,
    preview_only: true,
    should_ingest: false
  },
  {
    source_id: 'tx_dallas_public_listing_sources',
    source_name: 'Dallas public listing sources',
    source_family: 'public_listing',
    priority_score: 70,
    official_source: false,
    source_type: 'public listing source',
    adapter_id: 'public_listing_source',
    readiness: 'Needs adapter',
    use_policy: 'support_or_contact_source',
    likely_call_ready: true,
    preview_only: true,
    should_ingest: false
  },
  {
    source_id: 'tx_dallas_serper_secondary_discovery',
    source_name: 'Serper secondary source discovery',
    source_family: 'serper_secondary',
    priority_score: 40,
    official_source: false,
    source_type: 'search fallback',
    adapter_id: 'serper_secondary',
    readiness: 'Available as secondary only',
    use_policy: 'secondary_discovery_only',
    likely_call_ready: false,
    preview_only: true,
    should_ingest: false
  }
];

// DFW regional county foreclosure lanes (config lives in
// tx-county-foreclosure-source-profiles; adapter is generic).
const DFW_COUNTY_SOURCES = [
  {
    source_id: 'tx_tarrant_county_foreclosure_notices',
    source_name: 'Tarrant County Clerk Foreclosure Notices',
    source_family: 'preforeclosure_trustee_notice',
    county: 'Tarrant',
    priority_score: 88,
    official_source: true,
    source_type: 'official county clerk foreclosure postings',
    source_url: 'https://www.tarrantcountytx.gov/en/county-clerk/real-estate-records/foreclosures.html',
    readiness: 'Preview adapter ready',
    use_policy: 'official_source_first',
    preview_only: true,
    should_ingest: false
  },
  {
    source_id: 'tx_collin_county_foreclosure_notices',
    source_name: 'Collin County Foreclosure Notices',
    source_family: 'preforeclosure_trustee_notice',
    county: 'Collin',
    priority_score: 87,
    official_source: true,
    source_type: 'official county foreclosure postings',
    source_url: 'https://www.collincountytx.gov/government/sales-and-auctions',
    readiness: 'Preview adapter ready',
    use_policy: 'official_source_first',
    preview_only: true,
    should_ingest: false
  },
  {
    source_id: 'tx_denton_county_foreclosure_notices',
    source_name: 'Denton County Foreclosure Sale Notices',
    source_family: 'preforeclosure_trustee_notice',
    county: 'Denton',
    priority_score: 86,
    official_source: true,
    source_type: 'official county foreclosure postings',
    source_url: 'https://www.dentoncounty.gov/293/Foreclosure-Information',
    readiness: 'Preview adapter ready',
    use_policy: 'official_source_first',
    preview_only: true,
    should_ingest: false
  }
];

function normalizeCatalogSource(source) {
  const item = clone(source || {});
  item.source_family = cleanText(item.source_family || item.category_key || item.category || 'unknown');
  item.adapter_id = cleanText(sourceAdapterRegistry.adapterIdForSourceId(item.source_id) || item.adapter_id || item.source_id);
  item.adapter_family = cleanText(sourceAdapterRegistry.adapterFamilyForSourceId(item.source_id) || item.adapter_family || '');
  item.official_source = item.official_source === true || /\.gov\b|county|clerk|sheriff|tax|probate|opendata|socrata/i.test(`${item.source_url || ''} ${item.source_name || ''} ${item.source_type || ''}`);
  item.document_hunter_ready = item.document_hunter_ready === true || item.source_family === 'preforeclosure_trustee_notice';
  item.priority_score = Number(item.priority_score || 0) || 0;
  item.preview_only = true;
  item.should_ingest = false;
  return item;
}

function buildSourceCatalog(input = {}) {
  const state = cleanText(input.state || 'TX').toUpperCase();
  const county = cleanText(input.county || input.market_county || 'Dallas');
  const base = /dallas/i.test(county) && state === 'TX'
    ? dallasPriority.buildDallasSourcePriorityPlan({}).sources
    : [];
  const dfwMarket = state === 'TX' && /dallas|tarrant|collin|denton|fort worth/i.test(`${county} ${cleanText(input.city || '')}`);
  return base
    .concat(/dallas/i.test(county) && state === 'TX' ? SECONDARY_DALLAS_SOURCES : [])
    .concat(dfwMarket ? DFW_COUNTY_SOURCES : [])
    .map(normalizeCatalogSource)
    .sort((a, b) => b.priority_score - a.priority_score || a.source_name.localeCompare(b.source_name));
}

function sourceById(sourceId, input = {}) {
  const id = cleanText(sourceId);
  return buildSourceCatalog(input).find((source) => source.source_id === id) || null;
}

module.exports = {
  buildSourceCatalog,
  sourceById,
  SECONDARY_DALLAS_SOURCES,
  DFW_COUNTY_SOURCES
};
