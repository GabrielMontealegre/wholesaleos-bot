'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'exports', 'cycle-37-egress-inventory.json');

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
  entry('server.js', "var rfUrl='https://www.redfin.com/", {
    host: 'redfin.com', kind: 'request', transport: 'axios.get',
    owner: 'GET /api/debug/comp-test', gated: false, disposition: 'REMOVE', architecture_listed: true
  }),
  entry('server.js', "var zUrl='https://www.zillow.com/", {
    host: 'zillow.com', kind: 'request', transport: 'axios.get',
    owner: 'GET /api/debug/comp-test', gated: false, disposition: 'REMOVE', architecture_listed: true
  }),
  entry('modules/agents/comp-agent.js', "var url = 'https://www.redfin.com/", {
    host: 'redfin.com', kind: 'request', transport: 'fetch',
    owner: 'GET /api/leads/:id/comps; POST /api/leads/reanalyze; POST /api/leads/:id/analyze; 4AM cron',
    gated: 'routes: no; cron: ENABLE_BACKGROUND_INGESTION', disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/agents/comp-agent.js', "var url = 'https://www.zillow.com/", {
    host: 'zillow.com', kind: 'request', transport: 'fetch',
    owner: 'GET /api/leads/:id/comps; POST /api/leads/reanalyze; POST /api/leads/:id/analyze; 4AM cron',
    gated: 'routes: no; cron: ENABLE_BACKGROUND_INGESTION', disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/scraper.js', 'const geoUrl=`https://www.redfin.com/', {
    host: 'redfin.com', kind: 'request', transport: 'scraperGet -> axios.get',
    owner: 'GET /api/property/intel/:leadId; POST /api/leads/:id/enrich', gated: false,
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/scraper.js', 'const propRes=await scraperGet(`https://www.redfin.com', {
    host: 'redfin.com', kind: 'request', transport: 'scraperGet -> axios.get',
    owner: 'GET /api/property/intel/:leadId; POST /api/leads/:id/enrich', gated: false,
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/scraper.js', 'const url=`https://www.realtor.com/', {
    host: 'realtor.com', kind: 'request', transport: 'scraperGet -> axios.get',
    owner: 'GET /api/property/intel/:leadId; POST /api/leads/:id/enrich', gated: false,
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/scraper.js', 'const url=`https://www.zillow.com/search/GetSearchPageState', {
    host: 'zillow.com', kind: 'request', transport: 'scraperGet -> axios.get',
    owner: 'GET /api/property/intel/:leadId; POST /api/leads/:id/enrich', gated: false,
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/datasources.js', 'const url = `https://www.redfin.com/stingray/api/gis', {
    host: 'redfin.com', kind: 'request', transport: 'dsGet -> axios.get',
    owner: 'POST /api/datasources/run-all; POST /api/datasources/:source', gated: false,
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/datasources.js', 'const searchUrl = `https://www.zillow.com/search/GetSearchPageState', {
    host: 'zillow.com', kind: 'request', transport: 'ScraperAPI proxy -> axios.get',
    owner: 'POST /api/datasources/run-all; POST /api/datasources/:source', gated: false,
    disposition: 'ISOLATE', architecture_listed: true
  }),
  entry('modules/sources/listing-radar-acquisition-adapter.js', 'const response = await inspectViaFetch(url, options.page_fetch_impl, options);', {
    host: 'zillow.com|redfin.com|realtor.com', kind: 'request', transport: 'injected fetch',
    owner: 'POST /api/preview/free-public-deal-board with source_ids=[tx_dallas_listing_radar]; deal-board run with an explicit source id',
    gated: 'admin auth only; adapter is excluded from default queue but remains explicitly selectable',
    disposition: 'UNDECIDED', architecture_listed: false,
    evidence: 'source-adapter-registry registers tx_dallas_listing_radar and free-public-deal-board passes caller-supplied source_ids to the acquisition orchestrator'
  }),
  entry('modules/sources/listing-radar-acquisition-adapter.js', 'const response = await inspectViaPlaywright(url, options);', {
    host: 'zillow.com|redfin.com|realtor.com', kind: 'request', transport: 'Playwright page.goto',
    owner: 'POST /api/preview/free-public-deal-board with source_ids=[tx_dallas_listing_radar]; deal-board run with an explicit source id',
    gated: 'admin auth only; adapter is excluded from default queue but remains explicitly selectable',
    disposition: 'UNDECIDED', architecture_listed: false,
    evidence: 'this is the default path when no injected listing-page fetch implementation is supplied'
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

const unexpected = entries.filter((item) => item.kind === 'request' && item.architecture_listed === false);
const artifact = {
  generated_at: new Date().toISOString(),
  network_requests_made: 0,
  scope: 'Server-reachable listing-host requests and operator-facing URL builders.',
  architecture_complete: unexpected.length === 0,
  unexpected_request_call_site_count: unexpected.length,
  unexpected_request_call_sites: unexpected,
  entries
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), entries: entries.length, unexpected: unexpected.length }));
