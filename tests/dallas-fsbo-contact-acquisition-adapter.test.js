'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-fsbo-adapter-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));
fs.writeFileSync(process.env.FINDME_SCOUT_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, JSON.stringify({ version: 1, dossiers: [] }, null, 2));

const searchProviderWorker = require('../modules/research/search-provider-worker');
const sourceAdapterRegistry = require('../modules/sources/source-adapter-registry');
const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');
const fsboAdapter = require('../modules/sources/dallas-fsbo-contact-acquisition-adapter');
const craigslistAdapter = require('../modules/sources/dallas-craigslist-owner-acquisition-adapter');
const previewScript = require('../scripts/preview-call-ready-deal-packets');

function mockPage(body, url) {
  return {
    ok: true,
    status: 200,
    url,
    headers: {
      get(name) {
        if (/content-type/i.test(name)) return 'text/html; charset=utf-8';
        if (/content-length/i.test(name)) return String(Buffer.byteLength(body));
        return '';
      }
    },
    async text() {
      return body;
    }
  };
}

(async () => {
  const recentPostedAt = new Date(Date.now() - 2 * 86400000).toISOString();
  const phoneUrl = 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345';
  const emailUrl = 'https://www.realtor.com/realestateandhomes-detail/124-Main-St_Dallas_TX_75208_M12346';
  const genericUrl = 'https://www.realtor.com/realestateandhomes-search/Dallas_TX';
  const mockResults = [{
    title: '123 Main St, Dallas, TX 75208 - For sale by owner',
    snippet: 'Active FSBO. Cash only. Call owner at (214) 555-0123.',
    url: phoneUrl,
    displayed_url: phoneUrl,
    possible_address: '123 Main St, Dallas, TX 75208'
  }, {
    title: '124 Main St, Dallas, TX 75208 - For sale by owner',
    snippet: 'Active for sale by owner listing. Contact seller for details.',
    url: emailUrl,
    displayed_url: emailUrl,
    possible_address: '124 Main St, Dallas, TX 75208'
  }, {
    title: 'Dallas homes for sale',
    snippet: 'Browse FSBO homes and cash-only listings.',
    url: genericUrl,
    displayed_url: genericUrl
  }];

  const queryGroups = searchProviderWorker.buildContactFirstSearchQueries({
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX'
  });
  assert.ok(queryGroups.length > 0 && queryGroups.length <= 4);
  assert.strictEqual(queryGroups[0].purpose, 'contact_first_acquisition');
  assert.ok(/fsbo|for sale by owner/i.test(queryGroups[0].query));
  assert.ok(queryGroups.every((group) => !/broad_market_refinement/i.test(group.query_group)));

  const directContact = fsboAdapter.extractVisibleContactEvidence({
    source_url: phoneUrl,
    title: mockResults[0].title,
    snippet: mockResults[0].snippet
  });
  assert.strictEqual(directContact.contact_route, 'Direct Phone');
  assert.strictEqual(directContact.contact_phone, '(214) 555-0123');
  assert.strictEqual(directContact.contact_verified, true);

  const fakeContact = fsboAdapter.extractVisibleContactEvidence({
    source_url: phoneUrl,
    title: '123 Main St for sale by owner',
    snippet: 'Active listing. No contact information shown.'
  });
  assert.strictEqual(fakeContact.contact_verified, false);
  assert.strictEqual(fakeContact.contact_phone, '');

  const supportPhone = fsboAdapter.extractVisibleContactEvidence({
    source_url: phoneUrl,
    title: '123 Main St for sale by owner',
    snippet: 'Active listing. Platform support: (800) 555-0100.'
  });
  assert.strictEqual(supportPhone.contact_verified, false);
  assert.strictEqual(supportPhone.contact_phone, '');

  const result = await fsboAdapter.runDallasFsboContactAcquisitionAdapter({
    acquisition_run_id: 'fsbo_adapter_test',
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX',
    env: {
      ENABLE_SEARCH_PROVIDER: 'true',
      SEARCH_PROVIDER: 'mock',
      SEARCH_PROVIDER_MAX_RESULTS: '10'
    },
    mock_search_results: mockResults,
    max_results: 10,
    max_page_fetches: 2,
    page_fetch_impl: async (url) => {
      if (url === phoneUrl) {
        return mockPage('<html><title>123 Main St - FSBO</title><body>Active for sale by owner. Call owner at <a href="tel:2145550123">(214) 555-0123</a>.</body></html>', url);
      }
      if (url === emailUrl) {
        return mockPage('<html><title>124 Main St - FSBO</title><body>Active for sale by owner. Email <a href="mailto:seller@example.com">seller@example.com</a>.</body></html>', url);
      }
      throw new Error(`Unexpected page fetch: ${url}`);
    }
  });

  assert.strictEqual(result.preview_only, true);
  assert.strictEqual(result.should_ingest, false);
  assert.strictEqual(result.no_global_mutation, true);
  assert.strictEqual(result.candidates.length, 2);
  assert.strictEqual(result.packets.length, 2);
  assert.ok(result.packets.some((packet) => packet.packet_status === 'CALL_READY'));
  assert.ok(result.packets.some((packet) => packet.packet_status === 'OUTREACH_READY'));
  assert.ok(result.diagnostics.rejected_results.some((item) => item.source_url === genericUrl && item.reason === 'generic_or_non_property_source'));
  assert.strictEqual(result.diagnostics.page_fetches_used, 2);
  assert.ok(result.candidates.every((candidate) => candidate.preview_only === true && candidate.should_ingest === false));
  assert.ok(result.packets.every((packet) => packet.preview_only === true && packet.should_ingest === false));

  const registryEntry = sourceAdapterRegistry.adapterForSourceId('tx_dallas_fsbo_contact_first');
  assert.ok(registryEntry);
  assert.strictEqual(typeof registryEntry.run, 'function');

  const core = await sourceAcquisitionOrchestrator.runAcquisitionCore({
    job_id: 'fsbo_core_test',
    discovery_batch_id: 'fsbo_core_test',
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX',
    source_ids: ['tx_dallas_fsbo_contact_first'],
    source_families: ['fsbo']
  }, {
    env: {
      ENABLE_SEARCH_PROVIDER: 'true',
      SEARCH_PROVIDER: 'mock',
      SEARCH_PROVIDER_MAX_RESULTS: '10'
    },
    mock_search_results: mockResults,
    max_results: 10,
    max_page_fetches: 0
  });
  assert.strictEqual(core.status, 'available');
  assert.strictEqual(core.call_ready_packet_count, 2);
  assert.ok(core.call_ready_packets.some((packet) => packet.packet_status === 'CALL_READY'));
  assert.strictEqual(core.preview_only, true);
  assert.strictEqual(core.should_ingest, false);

  assert.deepStrictEqual(previewScript.CAPS, {
    max_queries: 4,
    max_results: 10,
    max_page_fetches: 4,
    timeout_ms: 5000,
    retries: 0
  });
  const craigslistUrl = 'https://dallas.craigslist.org/dal/reo/d/dallas-owner-fixer/7919000002.html';
  const preview = await previewScript.runPreview(['node', 'preview-call-ready-deal-packets.js'], {
    env: {
      ENABLE_SEARCH_PROVIDER: 'true',
      SEARCH_PROVIDER: 'mock',
      SEARCH_PROVIDER_MAX_RESULTS: '10'
    },
    page_fetch_impl: async (url) => {
      if (craigslistAdapter.isCraigslistOwnerSearchUrl(url)) {
        return mockPage(`<html><body><a href="${craigslistUrl}">owner post</a></body></html>`, url);
      }
      if (url === craigslistUrl) {
        return mockPage(`<html>
          <head><script type="application/ld+json">{
            "streetAddress":"125 Main St",
            "addressLocality":"Dallas",
            "addressRegion":"TX",
            "postalCode":"75208",
            "datePosted":"${recentPostedAt}"
          }</script></head>
          <body>
            <time datetime="${recentPostedAt}"></time>
            <section id="postingbody">For sale by owner. Cash only. Call owner at (214) 555-0124.</section>
          </body>
        </html>`, url);
      }
      throw new Error(`Unexpected preview fetch: ${url}`);
    }
  });
  assert.strictEqual(preview.mode, 'local_preview_only');
  assert.strictEqual(preview.preview_only, true);
  assert.strictEqual(preview.should_ingest, false);
  assert.strictEqual(preview.no_global_mutation, true);
  assert.strictEqual(preview.packet_count, 1);

  assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads, []);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')).dossiers, []);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('Dallas FSBO contact acquisition adapter tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
