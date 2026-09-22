'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'exports', 'cycle-37-egress-inventory.json');
const sourceAdapterRegistry = require('../modules/sources/source-adapter-registry');
const dealBoardQueueService = require('../modules/research/deal-board-queue-service');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function lineFor(relativePath, needle) {
  const lines = read(relativePath).split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(needle));
  if (index < 0) throw new Error(`Cycle 37 inventory needle not found: ${relativePath}: ${needle}`);
  return index + 1;
}

function entry(relativePath, needle, details) {
  return Object.assign({
    file: relativePath.replace(/\\/g, '/'),
    line: lineFor(relativePath, needle)
  }, details);
}

const entries = [
  entry('modules/agents/comp-agent.js', "var url = 'https://www.redfin.com/", {
    host: 'redfin.com', kind: 'request', transport: 'fetch',
    owner: 'GET /api/leads/:id/comps; POST /api/leads/reanalyze; POST /api/leads/:id/analyze; 4AM cron',
    gated: 'routes require WOS_ENABLE_LEGACY_LISTING_FETCH; cron also requires ENABLE_BACKGROUND_INGESTION', disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/agents/comp-agent.js', "var url = 'https://www.zillow.com/", {
    host: 'zillow.com', kind: 'request', transport: 'fetch',
    owner: 'GET /api/leads/:id/comps; POST /api/leads/reanalyze; POST /api/leads/:id/analyze; 4AM cron',
    gated: 'routes require WOS_ENABLE_LEGACY_LISTING_FETCH; cron also requires ENABLE_BACKGROUND_INGESTION', disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/scraper.js', 'const geoUrl=`https://www.redfin.com/', {
    host: 'redfin.com', kind: 'request', transport: 'scraperGet -> axios.get',
    owner: 'GET /api/property/intel/:leadId; POST /api/leads/:id/enrich', gated: 'routes require WOS_ENABLE_LEGACY_LISTING_FETCH',
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/scraper.js', 'const propRes=await scraperGet(`https://www.redfin.com', {
    host: 'redfin.com', kind: 'request', transport: 'scraperGet -> axios.get',
    owner: 'GET /api/property/intel/:leadId; POST /api/leads/:id/enrich', gated: 'routes require WOS_ENABLE_LEGACY_LISTING_FETCH',
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/scraper.js', 'const url=`https://www.realtor.com/', {
    host: 'realtor.com', kind: 'request', transport: 'scraperGet -> axios.get',
    owner: 'GET /api/property/intel/:leadId; POST /api/leads/:id/enrich', gated: 'routes require WOS_ENABLE_LEGACY_LISTING_FETCH',
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/scraper.js', 'const url=`https://www.zillow.com/search/GetSearchPageState', {
    host: 'zillow.com', kind: 'request', transport: 'scraperGet -> axios.get',
    owner: 'GET /api/property/intel/:leadId; POST /api/leads/:id/enrich', gated: 'routes require WOS_ENABLE_LEGACY_LISTING_FETCH',
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/datasources.js', 'const url = `https://www.redfin.com/stingray/api/gis', {
    host: 'redfin.com', kind: 'request', transport: 'dsGet -> axios.get',
    owner: 'POST /api/datasources/run-all; POST /api/datasources/:source', gated: 'routes require WOS_ENABLE_LEGACY_LISTING_FETCH',
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/datasources.js', 'const searchUrl = `https://www.zillow.com/search/GetSearchPageState', {
    host: 'zillow.com', kind: 'request', transport: 'ScraperAPI proxy -> axios.get',
    owner: 'POST /api/datasources/run-all; POST /api/datasources/:source', gated: 'routes require WOS_ENABLE_LEGACY_LISTING_FETCH',
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/sources/listing-radar-acquisition-adapter.js', 'const response = await inspectViaFetch(url, options.page_fetch_impl, options);', {
    host: 'zillow.com|redfin.com|realtor.com', kind: 'request', transport: 'injected fetch',
    owner: 'POST /api/preview/free-public-deal-board with source_ids=[tx_dallas_listing_radar]; deal-board run with an explicit source id',
    gated: 'listing_egress required; skipped with LISTING_EGRESS_DISABLED unless WOS_ENABLE_LEGACY_LISTING_FETCH is true',
    disposition: 'GATE_REQUIRED', architecture_listed: true,
    evidence: 'source-adapter-registry registers tx_dallas_listing_radar and free-public-deal-board passes caller-supplied source_ids to the acquisition orchestrator'
  }),
  entry('modules/sources/listing-radar-acquisition-adapter.js', 'const response = await inspectViaPlaywright(url, options);', {
    host: 'zillow.com|redfin.com|realtor.com', kind: 'request', transport: 'Playwright page.goto',
    owner: 'POST /api/preview/free-public-deal-board with source_ids=[tx_dallas_listing_radar]; deal-board run with an explicit source id',
    gated: 'listing_egress required; skipped with LISTING_EGRESS_DISABLED unless WOS_ENABLE_LEGACY_LISTING_FETCH is true',
    disposition: 'GATE_REQUIRED', architecture_listed: true,
    evidence: 'this is the default path when no injected listing-page fetch implementation is supplied'
  }),
  entry('modules/sources/dallas-fsbo-contact-acquisition-adapter.js', 'const response = await fetchImpl(url, {', {
    host: 'zillow.com|redfin.com|realtor.com', kind: 'request', transport: 'fetch',
    owner: 'Default Dallas deal-board queue and POST /api/preview/free-public-deal-board through tx_dallas_fsbo_contact_first',
    gated: 'listing_egress optional_degrades; listing-host fetches blocked unless WOS_ENABLE_LEGACY_LISTING_FETCH is true',
    disposition: 'HOST_SCOPED_OPTIONAL_DEGRADATION', architecture_listed: true,
    evidence: 'ALLOWED_CONTACT_HOSTS includes Zillow, Redfin, and Realtor; property-specific result URLs are passed to fetchContactPageEvidence, which defaults to global.fetch'
  }),
  entry('server.js', "zillow: zillowDirect || (full ? 'https://www.zillow.com/homes/", {
    host: 'zillow.com', kind: 'url_builder', transport: 'none', owner: 'operator research link',
    gated: false, disposition: 'KEEP', architecture_listed: true
  }),
  entry('server.js', "redfin: redfinDirect || (full ? 'https://www.redfin.com/search?", {
    host: 'redfin.com', kind: 'url_builder', transport: 'none', owner: 'operator research link',
    gated: false, disposition: 'KEEP', architecture_listed: true
  }),
  entry('modules/research/manual-evidence-packet-service.js', "push('Zillow subject search'", {
    host: 'zillow.com', kind: 'url_builder', transport: 'none', owner: 'manual evidence packet operator link',
    gated: false, disposition: 'KEEP', architecture_listed: true
  }),
  entry('modules/research/manual-evidence-packet-service.js', "push('Redfin subject search'", {
    host: 'redfin.com', kind: 'url_builder', transport: 'none', owner: 'manual evidence packet operator link',
    gated: false, disposition: 'KEEP', architecture_listed: true
  }),
  entry('modules/research/manual-evidence-packet-service.js', "push('Realtor.com subject search'", {
    host: 'realtor.com', kind: 'url_builder', transport: 'none', owner: 'manual evidence packet operator link',
    gated: false, disposition: 'KEEP', architecture_listed: true
  }),
  entry('modules/scraper.js', 'const streetViewUrl=`https://maps.googleapis.com/maps/api/streetview', {
    host: 'maps.google.com (Google Maps family)', kind: 'url_builder', transport: 'none',
    owner: 'property intelligence response link', gated: false, disposition: 'KEEP', architecture_listed: true
  })
];

const defaultDallasSourceIds = new Set(dealBoardQueueService.defaultQueueSourceIdsForMarket({
  city: 'Dallas', county: 'Dallas', state: 'TX'
}));
const adapterModulePaths = {
  dallas_foreclosure_acquisition_adapter: 'modules/sources/dallas-foreclosure-acquisition-adapter.js',
  dallas_fsbo_contact_acquisition_adapter: 'modules/sources/dallas-fsbo-contact-acquisition-adapter.js',
  dallas_craigslist_owner_acquisition_adapter: 'modules/sources/dallas-craigslist-owner-acquisition-adapter.js',
  listing_radar_acquisition_adapter: 'modules/sources/listing-radar-acquisition-adapter.js',
  tx_county_foreclosure_acquisition_adapter: 'modules/sources/tx-county-foreclosure-acquisition-adapter.js',
  mi_land_bank_acquisition_adapter: 'modules/sources/mi-land-bank-acquisition-adapter.js',
  ca_tax_default_notice_acquisition_adapter: 'modules/sources/ca-tax-default-notice-acquisition-adapter.js',
  ca_los_angeles_tax_default_acquisition_adapter: 'modules/sources/ca-los-angeles-tax-default-acquisition-adapter.js'
};
const listingHostPatterns = {
  'zillow.com': /zillow\.com/i,
  'redfin.com': /redfin\.com/i,
  'realtor.com': /realtor\.com/i,
  'trulia.com': /trulia\.com/i,
  'maps.google.com': /maps\.google\.com|google\.com\/maps/i
};
const registeredAdapters = sourceAdapterRegistry.listRegisteredAdapters().map((adapter) => {
  const modulePath = adapterModulePaths[adapter.adapter_id] || '';
  const source = modulePath ? read(modulePath) : '';
  const listingHosts = Object.entries(listingHostPatterns)
    .filter(([, pattern]) => pattern.test(source))
    .map(([host]) => host);
  const transport = [];
  if (/\bfetchImpl\s*\(|\bglobal\.fetch\b|\bfetch\s*\(/.test(source)) transport.push('fetch');
  if (/page\.goto\s*\(|inspectViaPlaywright|playwright\.chromium\.launch/.test(source)) transport.push('playwright');
  return {
    source_id: adapter.source_id,
    adapter_id: adapter.adapter_id,
    module: modulePath,
    listing_egress: Object.prototype.hasOwnProperty.call(adapter, 'listing_egress')
      ? adapter.listing_egress
      : null,
    in_default_dallas_queue: defaultDallasSourceIds.has(adapter.source_id),
    listing_hosts_referenced: listingHosts,
    transports_present: transport,
    request_or_url_builder: (adapter.source_id === 'tx_dallas_listing_radar' || adapter.source_id === 'tx_dallas_fsbo_contact_first')
      ? 'request'
      : listingHosts.length ? 'url_builder_or_reference' : 'none',
    known_listing_request_path: adapter.source_id === 'tx_dallas_listing_radar' || adapter.source_id === 'tx_dallas_fsbo_contact_first'
  };
});
const unexpectedAdapters = registeredAdapters.filter((adapter) => (
  adapter.listing_hosts_referenced.length > 0 &&
  adapter.transports_present.length > 0 &&
  adapter.known_listing_request_path !== true
));
const unexpected = entries
  .filter((item) => item.kind === 'request' && item.architecture_listed === false)
  .concat(unexpectedAdapters.map((adapter) => ({
    file: adapter.module,
    source_id: adapter.source_id,
    kind: 'request',
    transport: adapter.transports_present.join('|'),
    host: adapter.listing_hosts_referenced.join('|'),
    architecture_listed: false,
    disposition: 'UNEXPECTED_ADAPTER_PATH'
  })));
const artifact = {
  generated_at: new Date().toISOString(),
  network_requests_made: 0,
  scope: 'Server-reachable listing-host requests and operator-facing URL builders.',
  architecture_complete: unexpected.length === 0,
  unexpected_request_call_site_count: unexpected.length,
  unexpected_request_call_sites: unexpected,
  removed_routes: ['GET /api/debug/comp-test'],
  registered_adapter_count: registeredAdapters.length,
  registered_adapters: registeredAdapters,
  entries
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), entries: entries.length, unexpected: unexpected.length }));
