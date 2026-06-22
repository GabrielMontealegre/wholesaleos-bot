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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-call-ready-preview-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));
fs.writeFileSync(process.env.FINDME_SCOUT_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, JSON.stringify({ version: 1, dossiers: [] }, null, 2));

const callReadyPreviewService = require('../modules/research/call-ready-preview-service');
const searchProviderWorker = require('../modules/research/search-provider-worker');

function mockResponse(body, url) {
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

function serperResponse(payload) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

(async () => {
  try {
    const routeSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(routeSource.includes("app.post('/api/preview/call-ready-deal-packets', requireAdmin"), 'call-ready preview route should exist');
    assert.ok(routeSource.includes('callReadyPreviewService.runCallReadyPreview'), 'preview route should use shared preview service');
    assert.ok(routeSource.indexOf("app.post('/api/preview/call-ready-deal-packets'") < routeSource.indexOf('app.listen(PORT, () => {'), 'preview route should register before app.listen');

    const capped = callReadyPreviewService.buildCallReadyPreviewCaps({
      max_queries: 99,
      max_results: 99,
      max_page_fetches: 99,
      retries: 9
    });
    assert.deepStrictEqual(capped, {
      max_queries: 4,
      max_results: 10,
      max_page_fetches: 4,
      retries: 0,
      timeout_ms: 12000
    });

    const secret = 'super_secret_serper_key_that_must_not_leak';
    const readyEnv = {
      ENABLE_SEARCH_PROVIDER: 'true',
      SEARCH_PROVIDER: 'serper',
      SERPER_API_KEY: secret,
      SEARCH_PROVIDER_TIMEOUT_MS: '8000',
      SEARCH_PROVIDER_MAX_RESULTS: '20'
    };
    const ready = callReadyPreviewService.buildCallReadyPreviewCaps(readyEnv);
    assert.strictEqual(ready.timeout_ms, 8000);

    const searchPayload = {
      organic: [
        {
          title: '123 Main St, Dallas, TX 75208 - For sale by owner',
          snippet: 'Active FSBO. Cash only. Call owner at (214) 555-0123.',
          link: 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345',
          displayedLink: 'realtor.com',
          position: 1
        }
      ]
    };

    const preview = await callReadyPreviewService.runCallReadyPreview({
      city: 'Dallas',
      county: 'Dallas County',
      state: 'TX',
      max_queries: 999,
      max_results: 999,
      max_page_fetches: 999,
      retries: 99
    }, {
      env: readyEnv,
      search_fetch_impl: async () => serperResponse(searchPayload),
      page_fetch_impl: async (url) => {
        if (url === 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345') {
          return mockResponse('<html><body>Active for sale by owner. Call owner at <a href="tel:2145550123">(214) 555-0123</a>. Cash only.</body></html>', url);
        }
        throw new Error(`Unexpected page fetch: ${url}`);
      }
    });

    assert.strictEqual(preview.preview_only, true);
    assert.strictEqual(preview.should_ingest, false);
    assert.strictEqual(preview.no_global_mutation, true);
    assert.strictEqual(preview.search_provider_readiness.readiness, 'ready');
    assert.strictEqual(preview.search_provider_readiness.search_provider.normalized, 'serper');
    assert.strictEqual(preview.caps.max_queries, 4);
    assert.strictEqual(preview.caps.max_results, 10);
    assert.strictEqual(preview.caps.max_page_fetches, 4);
    assert.strictEqual(preview.caps.retries, 0);
    assert.strictEqual(preview.caps.timeout_ms, 8000);
    assert.ok(!JSON.stringify(preview).includes(secret), 'preview response must not leak raw provider secret');
    assert.strictEqual(preview.packet_count, 1);
    assert.ok(Array.isArray(preview.packets));
    assert.strictEqual(preview.packets[0].packet_status, 'CALL_READY');
    assert.strictEqual(preview.packets[0].contact.route_type, 'DIRECT_PHONE');
    assert.strictEqual(preview.packets[0].contact.call_allowed, true);
    assert.strictEqual(preview.packets[0].contact.phone, '(214) 555-0123');

    const beforeDb = JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8'));
    const beforeAnalyzer = JSON.parse(fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8'));
    const beforeDossiers = JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8'));

    const missing = callReadyPreviewService.runCallReadyPreview({
      city: 'Dallas',
      county: 'Dallas County',
      state: 'TX'
    }, {
      env: {},
      search_fetch_impl: async () => serperResponse({ organic: [] }),
      page_fetch_impl: async () => mockResponse('<html></html>', 'https://example.com')
    });
    const missingResult = await missing;
    assert.strictEqual(missingResult.search_provider_readiness.readiness, 'not_configured');
    assert.strictEqual(missingResult.packet_count, 0);
    assert.strictEqual(missingResult.preview_only, true);
    assert.strictEqual(missingResult.should_ingest, false);

    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')), beforeDb);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8')), beforeAnalyzer);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')), beforeDossiers);

    console.log('server call-ready preview tests passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
