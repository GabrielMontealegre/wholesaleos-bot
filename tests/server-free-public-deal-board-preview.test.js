'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (/(?:^|[\\/])agents[\\/](?:comp-agent|skip-trace-agent)$/.test(String(request))) {
    throw new Error(`Legacy agent must not load: ${request}`);
  }
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-free-public-server-preview-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

const initialStores = {
  db: { leads: [], users: [{ id: 'admin', role: 'admin' }] },
  findme: { version: 1, jobs: [] },
  analyzer: { version: 1, jobs: [] },
  dossiers: { version: 1, dossiers: [] }
};
fs.writeFileSync(process.env.DB_PATH, JSON.stringify(initialStores.db, null, 2));
fs.writeFileSync(process.env.FINDME_SCOUT_JOBS_PATH, JSON.stringify(initialStores.findme, null, 2));
fs.writeFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, JSON.stringify(initialStores.analyzer, null, 2));
fs.writeFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, JSON.stringify(initialStores.dossiers, null, 2));

const previewService = require('../modules/research/free-public-deal-board-preview-service');

function jsonResponse(payload, url) {
  return {
    ok: true,
    status: 200,
    url,
    headers: {
      get(name) {
        if (/content-type/i.test(name)) return 'application/json';
        if (/content-length/i.test(name)) return String(Buffer.byteLength(JSON.stringify(payload)));
        return '';
      }
    },
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function htmlResponse(body, url, status) {
  return {
    ok: status >= 200 && status < 400,
    status,
    url,
    headers: {
      get(name) {
        if (/content-type/i.test(name)) return 'text/html; charset=utf-8';
        if (/content-length/i.test(name)) return String(Buffer.byteLength(body));
        return '';
      }
    },
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    }
  };
}

(async () => {
  try {
    const routeSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(routeSource.includes("const freePublicDealBoardPreviewService = require('./modules/research/free-public-deal-board-preview-service');"), 'server should import free public deal board preview service');
    assert.ok(routeSource.includes("app.post('/api/preview/free-public-deal-board', requireAdmin"), 'free public deal board preview route should require admin');
    assert.ok(routeSource.includes('freePublicDealBoardPreviewService.runFreePublicDealBoardServerPreview'), 'route should use shared preview service');
    assert.ok(routeSource.indexOf("app.post('/api/preview/free-public-deal-board'") < routeSource.indexOf('app.listen(PORT, () => {'), 'preview route should register before app.listen');
    assert.ok(routeSource.includes("res.set('Cache-Control', 'no-store')"), 'route should disable response caching');

    const capped = previewService.buildFreePublicDealBoardPreviewCaps({
      limit: 999,
      caps: {
        output_deals: 999,
        source_pages: 999,
        documents: 999,
        property_link_searches: 999,
        property_pages_fetched: 999,
        timeout_ms: 999999,
        retries: 12
      }
    }, {
      ENABLE_SEARCH_PROVIDER: 'true',
      SEARCH_PROVIDER: 'serper',
      SERPER_API_KEY: 'ready_secret_key_123456789',
      SEARCH_PROVIDER_TIMEOUT_MS: '50000'
    });
    assert.deepStrictEqual(capped, {
      output_deals: 25,
      source_pages: 8,
      documents: 4,
      property_link_searches: 20,
      property_pages_fetched: 12,
      timeout_ms: 8000,
      retries: 0
    });

    const secret = 'super_secret_serper_key_that_must_not_leak';
    const readyEnv = {
      ENABLE_SEARCH_PROVIDER: 'true',
      SEARCH_PROVIDER: 'serper',
      SERPER_API_KEY: secret,
      SERPER_QUERY_MODE: 'free',
      SEARCH_PROVIDER_TIMEOUT_MS: '8000',
      SEARCH_PROVIDER_MAX_RESULTS: '20'
    };
    const auctionUrl = 'https://www.auction.com/details/456-Elm-St-Dallas-TX-75208-10001';
    const searchPayload = {
      organic: [
        {
          title: 'Auction property - 456 Elm St Dallas TX 75208',
          snippet: 'Auction property with sale date June 15, 2026.',
          link: auctionUrl,
          position: 1
        }
      ]
    };
    let providerCalls = 0;
    let linkChecks = 0;
    const beforeDb = JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8'));
    const beforeFindme = JSON.parse(fs.readFileSync(process.env.FINDME_SCOUT_JOBS_PATH, 'utf8'));
    const beforeAnalyzer = JSON.parse(fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8'));
    const beforeDossiers = JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8'));

    const preview = await previewService.runFreePublicDealBoardServerPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      limit: 500,
      caps: {
        property_link_searches: 500,
        property_pages_fetched: 500,
        timeout_ms: 50000,
        retries: 9
      }
    }, {
      env: readyEnv,
      mock_source_adapter_records: [{
        headline: 'Source-backed auction candidate - 456 Elm St',
        normalized_address: '456 Elm St, Dallas, TX 75208',
        source_family: 'official_foreclosure',
        source_name: 'Dallas County Clerk Foreclosure Notices',
        source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
        motivation_type: 'foreclosure',
        motivation_evidence_text: 'Notice of Substitute Trustee Sale',
        status_evidence_text: 'Sale date June 15, 2026'
      }],
      fetch_impl: async (url, init) => {
        if (/google\.serper\.dev/.test(String(url))) {
          providerCalls += 1;
          assert.strictEqual(init && init.headers && init.headers['X-API-KEY'], secret);
          return jsonResponse(searchPayload, url);
        }
        if (url === auctionUrl) {
          linkChecks += 1;
          return htmlResponse('<html><body>Auction property</body></html>', url, 200);
        }
        return htmlResponse('<html></html>', url, 200);
      }
    });

    assert.ok(providerCalls > 0, 'ready Serper env should reach provider execution path');
    assert.ok(linkChecks > 0, 'property link validation should use capped fetch path');
    assert.strictEqual(preview.ok, true);
    assert.strictEqual(preview.preview_only, true);
    assert.strictEqual(preview.should_ingest, false);
    assert.strictEqual(preview.no_global_mutation, true);
    assert.strictEqual(preview.search_provider_readiness.readiness, 'ready');
    assert.strictEqual(preview.search_provider_readiness.search_provider.normalized, 'serper');
    assert.strictEqual(preview.search_provider_readiness.serper_query_mode, 'free');
    assert.strictEqual(preview.caps.output_deals, 25);
    assert.strictEqual(preview.caps.property_link_searches, 20);
    assert.strictEqual(preview.caps.property_pages_fetched, 12);
    assert.strictEqual(preview.caps.timeout_ms, 8000);
    assert.strictEqual(preview.caps.retries, 0);
    assert.ok(Array.isArray(preview.free_public_deals));
    assert.ok(preview.free_public_deals.length >= 1);
    assert.ok(preview.free_public_deals.some((deal) => deal.auction_url === auctionUrl));
    assert.ok(preview.property_specific_link_count >= 1);
    assert.strictEqual(preview.diagnostics.source_adapter_records_count, 1);
    assert.strictEqual(preview.diagnostics.serper_primary_rows_count, 0);
    assert.ok(Array.isArray(preview.top_deals));
    assert.ok(!JSON.stringify(preview).includes(secret), 'preview response must not expose provider secret');

    const missingPreview = await previewService.runFreePublicDealBoardServerPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      limit: 25
    }, {
      env: {},
      mock_source_adapter_records: [{
        headline: 'Source-backed auction candidate - 456 Elm St',
        normalized_address: '456 Elm St, Dallas, TX 75208',
        source_family: 'official_foreclosure',
        source_name: 'Dallas County Clerk Foreclosure Notices',
        source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
        motivation_type: 'foreclosure',
        motivation_evidence_text: 'Notice of Substitute Trustee Sale',
        status_evidence_text: 'Sale date June 15, 2026'
      }],
      fetch_impl: async () => {
        return htmlResponse('<html></html>', 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php', 200);
      }
    });
    assert.strictEqual(missingPreview.search_provider_readiness.readiness, 'not_configured');
    assert.strictEqual(missingPreview.free_public_deals.length, 1);
    assert.ok(missingPreview.diagnostics.identity_repair.property_link_repair_attempts.length > 0);
    assert.ok(missingPreview.diagnostics.identity_repair.property_link_repair_attempts.every((attempt) => attempt.status === 'provider_not_configured'));
    assert.strictEqual(missingPreview.preview_only, true);
    assert.strictEqual(missingPreview.should_ingest, false);
    assert.strictEqual(missingPreview.no_global_mutation, true);

    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')), beforeDb);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.FINDME_SCOUT_JOBS_PATH, 'utf8')), beforeFindme);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8')), beforeAnalyzer);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')), beforeDossiers);

    console.log('server free public deal board preview tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
