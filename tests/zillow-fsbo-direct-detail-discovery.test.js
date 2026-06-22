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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-zillow-detail-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));
fs.writeFileSync(process.env.FINDME_SCOUT_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, JSON.stringify({ version: 1, dossiers: [] }, null, 2));

const searchWorker = require('../modules/research/search-provider-worker');
const snippetEvidence = require('../modules/research/search-snippet-evidence');
const fsboAdapter = require('../modules/sources/dallas-fsbo-contact-acquisition-adapter');

function mockSerperResponse(organic) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({ organic });
    }
  };
}

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
  try {
    const queryGroups = searchWorker.buildContactFirstSearchQueries({
      city: 'Dallas',
      county: 'Dallas',
      state: 'TX'
    });

    assert.strictEqual(queryGroups.length, 4);
    assert.strictEqual(queryGroups[2].max_results, 10);
    assert.ok(/zillow\.com\/homedetails|zpid/i.test(queryGroups[2].query));

    const sanitized = searchWorker.sanitizeSerperFreeQuery(queryGroups[2].query, {
      search_mode: 'contact_first_acquisition',
      city: 'Dallas',
      county: 'Dallas',
      state: 'TX'
    });
    assert.ok(/zillow\.com\/homedetails|zpid/i.test(sanitized));
    assert.ok(!/house for sale/i.test(sanitized));

    const zillowDetail = 'https://www.zillow.com/homedetails/123-Main-St-Dallas-TX-75208/123_zpid/';
    const zillowGenericOne = 'https://www.zillow.com/dallas-tx/';
    const zillowGenericTwo = 'https://www.zillow.com/dallas-tx/fsbo/';
    const zillowGenericThree = 'https://www.zillow.com/dallas-county-tx/fsbo/';

    const requests = [];
    const fetchImpl = async (url, options = {}) => {
      const payload = options.body ? JSON.parse(options.body) : {};
      const query = String(payload.q || '').toLowerCase();
      requests.push({ url, query, num: Number(payload.num || 0) || 0 });
      if (/zillow/i.test(query) || /homedetails/i.test(query)) {
        return mockSerperResponse([
          {
            title: 'Dallas homes for sale',
            snippet: 'Browse Dallas homes and listings.',
            link: zillowGenericOne,
            displayedLink: 'zillow.com',
            position: 1
          },
          {
            title: 'Dallas FSBO listings',
            snippet: 'Category page for owner listings.',
            link: zillowGenericTwo,
            displayedLink: 'zillow.com',
            position: 2
          },
          {
            title: 'Dallas county FSBO search',
            snippet: 'Search category page.',
            link: zillowGenericThree,
            displayedLink: 'zillow.com',
            position: 3
          },
          {
            title: '123 Main St, Dallas, TX 75208 - For sale by owner',
            snippet: 'Active FSBO. Call owner at (214) 555-0123.',
            link: zillowDetail,
            displayedLink: 'zillow.com',
            position: 4,
            possible_address: '123 Main St, Dallas, TX 75208'
          }
        ]);
      }
      return mockSerperResponse([]);
    };

    const searchResult = await searchWorker.runSearchProvider({
      city: 'Dallas',
      county: 'Dallas',
      state: 'TX',
      search_mode: 'contact_first_acquisition'
    }, {
      env: {
        ENABLE_SEARCH_PROVIDER: 'true',
        SEARCH_PROVIDER: 'serper',
        SERPER_API_KEY: 'super_secret_serper_key_that_must_not_leak',
        SEARCH_PROVIDER_MAX_RESULTS: '10',
        SERPER_QUERY_MODE: 'free'
      },
      query_groups: queryGroups,
      fetchImpl
    });

    assert.deepStrictEqual(searchResult.query_groups_used, queryGroups.map((group) => group.query_group));
    assert.deepStrictEqual(requests.map((item) => item.num), [3, 3, 10, 3]);
    assert.ok(searchResult.provider_attempts[2].result_diagnostics.some((item) => item.url === zillowDetail && item.property_specific === true));
    assert.ok(searchResult.cards[0].search_result_property_specific === true);
    assert.strictEqual(searchResult.cards[0].source_url, zillowDetail);
    assert.ok(searchResult.cards.slice(1).every((card) => card.search_result_property_specific === false || card.search_result_quality_bucket !== 'property_detail_url'));

    const adapterResult = await fsboAdapter.runDallasFsboContactAcquisitionAdapter({
      acquisition_run_id: 'zillow_direct_detail_discovery_test',
      city: 'Dallas',
      county: 'Dallas',
      state: 'TX',
      env: {
        ENABLE_SEARCH_PROVIDER: 'true',
        SEARCH_PROVIDER: 'serper',
        SERPER_API_KEY: 'super_secret_serper_key_that_must_not_leak',
        SEARCH_PROVIDER_MAX_RESULTS: '10',
        SERPER_QUERY_MODE: 'free'
      },
      search_fetch_impl: fetchImpl,
      page_fetch_impl: async (url) => {
        if (url === zillowDetail) {
          return mockPage('<html><body>Active for sale by owner. Call owner at <a href="tel:2145550123">(214) 555-0123</a>.</body></html>', url);
        }
        throw new Error(`Unexpected page fetch: ${url}`);
      },
      max_results: 10,
      max_page_fetches: 1
    });

    assert.strictEqual(adapterResult.preview_only, true);
    assert.strictEqual(adapterResult.should_ingest, false);
    assert.strictEqual(adapterResult.no_global_mutation, true);
    assert.ok(adapterResult.candidates.length >= 1);
    assert.ok(adapterResult.packets.some((packet) => packet.packet_status === 'CALL_READY'));
    assert.ok(adapterResult.diagnostics.search_provider_result_diagnostics.some((attempt) => {
      return Array.isArray(attempt.result_diagnostics) && attempt.result_diagnostics.some((result) => result.page_fetch_attempted === true);
    }));

    console.log('zillow fsbo direct detail discovery tests passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
