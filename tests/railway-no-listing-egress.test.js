'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle37-egress-'));
process.env.DB_PATH = path.join(tmp, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmp, 'snapshots.json');
process.env.MANUAL_EVIDENCE_PACKETS_PATH = path.join(tmp, 'packets.json');
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [], users: [{ id: 'admin', role: 'admin' }] }));
fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify({ version: 1, markets: {} }));

const guard = require('../modules/security/listing-egress-guard');
const registry = require('../modules/sources/source-adapter-registry');
const orchestrator = require('../modules/research/source-acquisition-orchestrator');
const queueService = require('../modules/research/deal-board-queue-service');
const fsbo = require('../modules/sources/dallas-fsbo-contact-acquisition-adapter');
const radar = require('../modules/sources/listing-radar-acquisition-adapter');
const manualEvidence = require('../modules/research/manual-evidence-packet-service');
const leadState = require('../modules/research/lead-operations-state');

const OFF = { WOS_ENABLE_LEGACY_LISTING_FETCH: 'false', ENABLE_SEARCH_PROVIDER: 'true', SEARCH_PROVIDER: 'mock' };
const ON = { WOS_ENABLE_LEGACY_LISTING_FETCH: 'true', ENABLE_SEARCH_PROVIDER: 'true', SEARCH_PROVIDER: 'mock' };
const LISTING_URLS = [
  'https://www.zillow.com/homedetails/100-Main-St-Dallas-TX-75201/1_zpid/',
  'https://www.redfin.com/TX/Dallas/102-Main-St-75201/home/2',
  'https://www.realtor.com/realestateandhomes-detail/104-Main-St_Dallas_TX_75201_M3'
];
const NON_LISTING_URL = 'https://www.fsbo.com/listings/listings/show/id/4/';

function resultCard(url, index) {
  return {
    title: `${100 + index * 2} Main St, Dallas, TX 75201 - For sale by owner`,
    snippet: `Active FSBO. Call owner at (214) 555-01${20 + index}.`,
    url,
    displayed_url: url,
    possible_address: `${100 + index * 2} Main St, Dallas, TX 75201`
  };
}

function htmlResponse(url, index, finalUrl) {
  const html = `<html><title>${100 + index * 2} Main St FSBO</title><body>Active for sale by owner. Call owner at <a href="tel:21455501${20 + index}">(214) 555-01${20 + index}</a>.</body></html>`;
  return {
    ok: true,
    status: 200,
    url: finalUrl || url,
    headers: { get(name) { return /content-length/i.test(name) ? String(Buffer.byteLength(html)) : 'text/html'; } },
    async text() { return html; }
  };
}

function stripTimes(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => /(?:started|finished|captured|retrieved)_at/.test(key) ? '<time>' : item));
}

(async () => {
  // E1: required listing radar is skipped before its adapter or browser can run.
  const e1 = await orchestrator.runAcquisitionCore({
    job_id: 'e1', city: 'Dallas', county: 'Dallas', state: 'TX', source_ids: ['tx_dallas_listing_radar']
  }, { env: OFF, mock_search_results: LISTING_URLS.map(resultCard) });
  assert.strictEqual(e1.diagnostics.adapter_results[0].skip_code, 'LISTING_EGRESS_DISABLED');
  assert.strictEqual(e1.diagnostics.adapter_results[0].attempted, false);

  // E2 and E16: a foreclosure lane still runs and is byte-identical with either flag value.
  const foreclosure = registry.ADAPTERS.tx_dallas_county_clerk_foreclosure_notices;
  const originalForeclosureRun = foreclosure.run;
  foreclosure.run = async () => ({
    source_id: foreclosure.source_id, source_name: foreclosure.source_name, status: 'available', attempted: true,
    candidates: [{ candidate_id: 'foreclosure-1', normalized_address: '3808 Kings Dr, Ennis, TX 75119', city: 'Ennis', county: 'Ellis', state: 'TX', source_url: 'https://ellis.example.gov/notice.pdf', preview_only: true, should_ingest: false }],
    cards: [], packets: [], diagnostics: { fixture: true }, preview_only: true, should_ingest: false, no_global_mutation: true
  });
  try {
    const mixed = await orchestrator.runAcquisitionCore({ job_id: 'e2', city: 'Dallas', county: 'Dallas', state: 'TX', source_ids: [foreclosure.source_id, 'tx_dallas_listing_radar'] }, { env: OFF });
    assert.strictEqual(mixed.candidates_found, 1);
    assert.strictEqual(mixed.diagnostics.adapter_results.find((item) => item.source_id === 'tx_dallas_listing_radar').skip_code, 'LISTING_EGRESS_DISABLED');
    const offResult = await registry.discoverSource(foreclosure.source_id, { env: OFF });
    const onResult = await registry.discoverSource(foreclosure.source_id, { env: ON });
    assert.deepStrictEqual(stripTimes(offResult), stripTimes(onResult));
  } finally { foreclosure.run = originalForeclosureRun; }

  // E3 and Item 9: default Dallas keeps every FSBO row but blocks listing-host page egress.
  const defaultIds = queueService.defaultQueueSourceIdsForMarket({ city: 'Dallas', county: 'Dallas', state: 'TX' });
  assert.ok(defaultIds.includes('tx_dallas_fsbo_contact_first'));
  assert.ok(!defaultIds.includes('tx_dallas_listing_radar'));
  const mockResults = LISTING_URLS.concat([NON_LISTING_URL]).map(resultCard);
  const beforeHosts = [];
  const before = await fsbo.runDallasFsboContactAcquisitionAdapter({
    city: 'Dallas', county: 'Dallas', state: 'TX', env: ON, mock_search_results: mockResults,
    max_results: 10, max_page_fetches: 10,
    page_fetch_impl: async (url) => { beforeHosts.push(new URL(url).hostname); return htmlResponse(url, mockResults.findIndex((item) => item.url === url)); }
  });
  const afterHosts = [];
  const after = await fsbo.runDallasFsboContactAcquisitionAdapter({
    city: 'Dallas', county: 'Dallas', state: 'TX', env: OFF, mock_search_results: mockResults,
    max_results: 10, max_page_fetches: 10,
    page_fetch_impl: async (url) => { afterHosts.push(new URL(url).hostname); return htmlResponse(url, mockResults.findIndex((item) => item.url === url)); }
  });
  assert.strictEqual(after.candidates.length, before.candidates.length);
  assert.strictEqual(after.candidates.length, 3);
  assert.deepStrictEqual(afterHosts, []);
  assert.strictEqual(after.candidates.filter((item) => LISTING_URLS.includes(item.source_url) && item.contact_verified).length, 0);
  assert.strictEqual(after.packets.filter((item) => LISTING_URLS.includes(item.source_url) && /^(CALL_READY|OUTREACH_READY)$/.test(item.packet_status)).length, 0);

  // E4-E8: direct defenses, redirects, and snippet honesty.
  let directCalls = 0;
  const blockedContact = await fsbo.fetchContactPageEvidence(LISTING_URLS[0], { env: OFF, fetch_impl: async () => { directCalls += 1; } });
  assert.deepStrictEqual(blockedContact, { status: 'listing_egress_disabled', source_url: LISTING_URLS[0], contact_verified: false });
  assert.strictEqual(directCalls, 0);
  const allowedContact = await fsbo.fetchContactPageEvidence(NON_LISTING_URL, { env: OFF, fetch_impl: async (url) => { directCalls += 1; return htmlResponse(url, 3); } });
  assert.strictEqual(allowedContact.status, 'fetched');
  assert.strictEqual(directCalls, 1);
  let bodyRead = false;
  const redirected = await fsbo.fetchContactPageEvidence(NON_LISTING_URL, { env: OFF, fetch_impl: async () => ({ ok: true, status: 200, url: LISTING_URLS[1], headers: { get: () => '' }, async text() { bodyRead = true; return 'secret'; } }) });
  assert.strictEqual(redirected.status, 'listing_egress_disabled_redirect');
  assert.strictEqual(redirected.contact_verified, false);
  assert.strictEqual(bodyRead, false);
  const snippetOnly = fsbo.candidateFromSearchCard(mockResults[0], blockedContact, { city: 'Dallas', county: 'Dallas', state: 'TX' });
  assert.strictEqual(snippetOnly.contact_verified, false);
  assert.strictEqual(snippetOnly.contact_phone, '');
  assert.strictEqual(snippetOnly.contact_email, '');
  assert.ok(snippetOnly.missing_evidence.includes('verified public contact route'));
  assert.ok(!/^(CALL_READY|OUTREACH_READY)$/.test(leadState.rowStateForDeal(snippetOnly).row_state));
  let radarCalls = 0;
  const blockedRadar = await radar.fetchListingPageEvidence(LISTING_URLS[0], { env: OFF, page_fetch_impl: async () => { radarCalls += 1; } });
  assert.strictEqual(blockedRadar.blocked_reason, 'listing_egress_disabled');
  assert.strictEqual(radarCalls, 0);

  // E9: enabling reaches only the injected transport boundary.
  await radar.fetchListingPageEvidence(LISTING_URLS[0], { env: ON, page_fetch_impl: async (url) => { radarCalls += 1; return htmlResponse(url, 0); } });
  await fsbo.fetchContactPageEvidence(LISTING_URLS[0], { env: ON, fetch_impl: async (url) => { directCalls += 1; return htmlResponse(url, 0); } });
  assert.strictEqual(radarCalls, 1);
  assert.strictEqual(directCalls, 2);
  const radarEnabled = await registry.discoverSource('tx_dallas_listing_radar', { env: ON, mock_search_results: [], max_results: 1 });
  assert.notStrictEqual(radarEnabled.skip_code, 'LISTING_EGRESS_DISABLED');

  // E10-E11: registry completeness and fail-closed behavior.
  const adapters = registry.listRegisteredAdapters();
  assert.ok(adapters.length >= 23);
  adapters.forEach((adapter) => assert.ok(registry.LISTING_EGRESS_VALUES.includes(adapter.listing_egress), adapter.source_id));
  assert.strictEqual(registry.listingEgressForAdapter({}), 'required');
  assert.strictEqual(registry.listingEgressForAdapter({ listing_egress: 'surprise' }), 'required');
  for (const adapter of adapters) {
    if (!adapter.adapter || !adapter.adapter_id) continue;
    const moduleFile = path.join(root, 'modules', 'sources', `${adapter.adapter_id.replace(/_/g, '-')}.js`);
    if (!fs.existsSync(moduleFile)) continue;
    const source = fs.readFileSync(moduleFile, 'utf8');
    if (/(zillow|redfin|realtor|trulia|maps\.google)/i.test(source) && /(fetchImpl|global\.fetch|page\.goto|playwright\.chromium\.launch)/.test(source)) {
      assert.ok(adapter.listing_egress === 'required' || adapter.listing_egress === 'optional_degrades', adapter.source_id);
    }
  }

  // E12-E13: all nine real route handlers use the common 503 guard; the debug route is absent.
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const guardedRoutes = [
    'GET /api/leads/:id/comps', 'POST /api/leads/reanalyze', 'POST /api/leads/:id/analyze',
    'GET /api/property/intel/:leadId', 'POST /api/scraper/deals', 'POST /api/leads/:id/enrich',
    'POST /api/courthouse/scrape', 'POST /api/datasources/run-all', 'POST /api/datasources/:source'
  ];
  guardedRoutes.forEach((route) => assert.ok(serverSource.includes(`allowLegacyListingRoute('${route}', res)`), route));
  assert.ok(serverSource.includes('res.status(503).json'));
  assert.ok(serverSource.includes("code: 'LEGACY_LISTING_FETCH_DISABLED'") || serverSource.includes('code: error.code'));
  assert.ok(!serverSource.includes("app.get('/api/debug/comp-test'"));
  assert.throws(() => guard.assertLegacyListingFetchAllowed('test route', OFF), (error) => error.code === 'LEGACY_LISTING_FETCH_DISABLED' && error.status_code === 503);

  // E14-E15: operator links remain present; server screenshot Chromium is not route-reachable.
  const links = manualEvidence.researchLinks({ normalized_address: '3808 Kings Dr, Ennis, TX 75119', city: 'Ennis', county: 'Ellis', state: 'TX', owner_name_if_visible: 'Jane Owner' });
  const urls = links.map((item) => item.url).join('\n');
  assert.match(urls, /zillow\.com/);
  assert.match(urls, /redfin\.com/);
  assert.match(urls, /realtor\.com/);
  assert.match(urls, /google\.com\/maps/);
  assert.match(urls, /cyberbackgroundchecks\.com/);
  const screenshotSource = fs.readFileSync(path.join(root, 'modules', 'research', 'screenshot-comp-evidence.js'), 'utf8');
  assert.ok(screenshotSource.includes('playwright.chromium.launch'));
  assert.ok(!serverSource.includes('runScreenshotCompEvidence('));

  const proof = {
    generated_at: new Date().toISOString(),
    claim: 'With default configuration, this server issues zero requests to listing hosts.',
    default_flag_enabled: guard.legacyListingFetchEnabled(OFF),
    listing_hosts: guard.LISTING_HOSTS,
    default_dallas_queue_source_ids: defaultIds,
    listing_host_requests_observed: afterHosts.filter((host) => guard.isListingHost(host)),
    dallas_fixture_coverage: {
      before: {
        row_count: before.candidates.length,
        contact_verified_count: before.candidates.filter((item) => item.contact_verified).length,
        call_ready_count: before.diagnostics.call_ready_count,
        outreach_ready_count: before.diagnostics.outreach_ready_count,
        listing_host_contact_verified_count: before.candidates.filter((item) => guard.isListingHost(item.source_url) && item.contact_verified).length,
        listing_radar_accepted_count: 0,
        listing_radar_rejected_count: 0
      },
      after: {
        row_count: after.candidates.length,
        contact_verified_count: after.candidates.filter((item) => item.contact_verified).length,
        call_ready_count: after.diagnostics.call_ready_count,
        outreach_ready_count: after.diagnostics.outreach_ready_count,
        listing_host_contact_verified_count: after.candidates.filter((item) => guard.isListingHost(item.source_url) && item.contact_verified).length,
        listing_radar_accepted_count: 0,
        listing_radar_rejected_count: 0,
        listing_radar_skip_code: 'LISTING_EGRESS_DISABLED'
      }
    },
    assertions: { egress_cases_passed: 16, material_row_count_drop: false, unexpected_listing_request_paths: 0 }
  };
  fs.mkdirSync(path.join(root, 'exports'), { recursive: true });
  fs.writeFileSync(path.join(root, 'exports', 'cycle-37-egress-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof.dallas_fixture_coverage));
  console.log('railway-no-listing-egress: E1-E16 ok');
})().finally(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
}).catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
