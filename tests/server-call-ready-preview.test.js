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
const craigslistAdapter = require('../modules/sources/dallas-craigslist-owner-acquisition-adapter');
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

    const craigslistUrl = 'https://dallas.craigslist.org/dal/reo/d/dallas-motivated-owner-fixer/7919000001.html';
    const searchHtml = `<html><body><a href="${craigslistUrl}">Dallas owner property</a></body></html>`;
    const postHtml = `<html>
      <head>
        <title>Motivated owner fixer - craigslist</title>
        <script type="application/ld+json">{
          "streetAddress":"123 Main St",
          "addressLocality":"Dallas",
          "addressRegion":"TX",
          "postalCode":"75208",
          "datePosted":"2026-06-21T10:00:00-05:00"
        }</script>
      </head>
      <body>
        <time datetime="2026-06-21T10:00:00-05:00"></time>
        <section id="postingbody">For sale by owner. Cash only. Call owner at (214) 555-0123.</section>
      </body>
    </html>`;

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
      page_fetch_impl: async (url) => {
        if (craigslistAdapter.isCraigslistOwnerSearchUrl(url)) return mockResponse(searchHtml, url);
        if (url === craigslistUrl) return mockResponse(postHtml, url);
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
      page_fetch_impl: async (url) => {
        if (craigslistAdapter.isCraigslistOwnerSearchUrl(url)) return mockResponse('<html></html>', url);
        throw new Error(`Unexpected missing-config fetch: ${url}`);
      }
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
