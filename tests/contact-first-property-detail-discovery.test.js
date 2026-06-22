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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-contact-first-'));
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
    assert.strictEqual(queryGroups[0].max_results, 3);
    assert.strictEqual(queryGroups[1].max_results, 3);
    assert.strictEqual(queryGroups[2].max_results, 10);
    assert.strictEqual(queryGroups[3].max_results, 3);
    assert.ok(/zillow/i.test(queryGroups[2].query));
    assert.ok(/zillow\.com\/homedetails|zpid/i.test(queryGroups[2].query));
    assert.ok(/realestateandhomes-detail/i.test(queryGroups[3].query));

    const sanitized = searchWorker.sanitizeSerperFreeQuery(queryGroups[2].query, {
      search_mode: 'contact_first_acquisition',
      city: 'Dallas',
      county: 'Dallas',
      state: 'TX'
    });
    assert.ok(/zillow|homedetails|zillow\.com\/homedetails|zpid|for sale by owner|owner listed/i.test(sanitized));
    assert.ok(!/house for sale/i.test(sanitized));

    const zillowDetail = 'https://www.zillow.com/homedetails/123-Main-St-Dallas-TX-75208/123_zpid/';
    const realtorDetail = 'https://www.realtor.com/realestateandhomes-detail/124-Main-St_Dallas_TX_75208_M124';
    const fsboDetail = 'https://www.fsbo.com/listing/125-main-st-dallas-tx-75208';
    const forSaleByOwnerDetail = 'https://www.forsalebyowner.com/property/126-main-st-dallas-tx-75208';
    const genericSearch = 'https://www.realtor.com/realestateandhomes-search/Dallas_TX';
    const genericFsbo = 'https://www.fsbo.com/';

    assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl(zillowDetail, '123 Main St', 'Active FSBO'), true);
    assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl(realtorDetail, '124 Main St', 'Active listing'), true);
    assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl(fsboDetail, '125 Main St', 'Active FSBO'), true);
    assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl(forSaleByOwnerDetail, '126 Main St', 'Active FSBO'), true);
    assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl(genericSearch, 'Dallas homes for sale', 'Search results'), false);
    assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl(genericFsbo, 'FSBO homes', 'Homepage'), false);

    const requests = [];
    const fetchImpl = async (url, options = {}) => {
      const payload = options.body ? JSON.parse(options.body) : {};
      const query = String(payload.q || '').toLowerCase();
      requests.push({ url, query, num: Number(payload.num || 0) || 0 });
      if (/fsbo/i.test(query) && /listing/i.test(query)) {
        return mockSerperResponse([
          {
            title: 'Dallas homes for sale',
            snippet: 'Browse Dallas homes and listings.',
            link: genericSearch,
            displayedLink: 'realtor.com'
          },
          {
            title: 'FSBO homepage',
            snippet: 'For sale by owner homes.',
            link: genericFsbo,
            displayedLink: 'fsbo.com'
          },
          {
            title: 'Dallas public listing contacts',
            snippet: 'Social group for homes.',
            link: 'https://www.facebook.com/groups/example',
            displayedLink: 'facebook.com'
          }
        ]);
      }
      if (/forsalebyowner/i.test(query) || (/property/i.test(query) && /owner contact/i.test(query))) {
        return mockSerperResponse([
          {
            title: '125 Main St, Dallas, TX 75208 - For sale by owner',
            snippet: 'Active FSBO. Contact seller at (214) 555-0191.',
            link: fsboDetail,
            displayedLink: 'fsbo.com',
            position: 1,
            possible_address: '125 Main St, Dallas, TX 75208'
          },
          {
            title: 'Dallas homes for sale',
            snippet: 'Browse Dallas homes and listings.',
            link: genericSearch,
            displayedLink: 'realtor.com',
            position: 2
          }
        ]);
      }
      if (/zillow/i.test(query) || /homedetails/i.test(query)) {
        return mockSerperResponse([
          {
            title: '123 Main St, Dallas, TX 75208 - For sale by owner',
            snippet: 'Active FSBO. Call owner at (214) 555-0123.',
            link: zillowDetail,
            displayedLink: 'zillow.com',
            position: 1,
            possible_address: '123 Main St, Dallas, TX 75208'
          }
        ]);
      }
      if (/realtor/i.test(query) || /realestateandhomes-detail/i.test(query)) {
        return mockSerperResponse([
          {
            title: '124 Main St, Dallas, TX 75208 - For sale by owner',
            snippet: 'Active listing. Email seller@example.com.',
            link: realtorDetail,
            displayedLink: 'realtor.com',
            position: 1,
            possible_address: '124 Main St, Dallas, TX 75208'
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
    assert.strictEqual(searchResult.provider_attempts.length, 4);
    assert.deepStrictEqual(requests.map((item) => item.num), [3, 3, 10, 3]);
    assert.ok(searchResult.provider_attempts[0].generic_result_count >= 1);
    assert.ok(searchResult.provider_attempts.slice(1).some((attempt) => attempt.property_specific_result_count >= 1));
    assert.ok(Array.isArray(searchResult.provider_attempts[2].result_diagnostics));
    assert.ok(searchResult.provider_attempts[2].result_diagnostics.some((item) => item.property_specific === true));
    assert.ok(searchResult.cards.some((card) => card.search_result_property_specific === true));

    const adapterResult = await fsboAdapter.runDallasFsboContactAcquisitionAdapter({
      acquisition_run_id: 'contact_first_property_detail_test',
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
        if (url === realtorDetail) {
          return mockPage('<html><body>Active listing. Email <a href="mailto:seller@example.com">seller@example.com</a>.</body></html>', url);
        }
        if (url === fsboDetail) {
          return mockPage('<html><body>Active for sale by owner. <form action="/contact"><button>Contact seller</button></form></body></html>', url);
        }
        throw new Error(`Unexpected page fetch: ${url}`);
      },
      max_results: 10,
      max_page_fetches: 2
    });

    assert.strictEqual(adapterResult.preview_only, true);
    assert.strictEqual(adapterResult.should_ingest, false);
    assert.strictEqual(adapterResult.no_global_mutation, true);
    assert.deepStrictEqual(adapterResult.diagnostics.query_groups_used, queryGroups.map((group) => group.query_group));
    assert.strictEqual(adapterResult.diagnostics.query_group_count, 4);
    assert.ok(adapterResult.diagnostics.property_specific_results_reviewed >= 3);
    assert.ok(adapterResult.diagnostics.rejected_reason_counts.generic_or_non_property_source >= 1);
    assert.ok(adapterResult.diagnostics.page_fetch_skipped_count >= 1);
    assert.ok(adapterResult.diagnostics.page_fetch_skips.some((item) => item.reason === 'max_page_fetches_reached'));
    assert.ok(adapterResult.diagnostics.accepted_results.every((item) => item.reason === 'property_specific_and_allowed'));
    assert.ok(Array.isArray(adapterResult.diagnostics.search_provider_result_diagnostics));
    assert.ok(adapterResult.diagnostics.search_provider_result_diagnostics.some((attempt) => {
      return Array.isArray(attempt.result_diagnostics) && attempt.result_diagnostics.some((result) => result.page_fetch_attempted === true);
    }));
    assert.ok(adapterResult.candidates.length >= 3);
    assert.ok(adapterResult.packets.some((packet) => packet.packet_status === 'CALL_READY'));
    assert.ok(adapterResult.packets.some((packet) => packet.packet_status === 'OUTREACH_READY'));
    assert.ok(adapterResult.packets.every((packet) => packet.preview_only === true && packet.should_ingest === false));

    console.log('contact-first property detail discovery tests passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
