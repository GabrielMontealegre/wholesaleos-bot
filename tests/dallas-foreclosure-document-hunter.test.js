'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'pdf-parse') {
    return async (buffer) => ({ text: Buffer.from(buffer).toString('utf8') });
  }
  return originalLoad.call(this, request, parent, isMain);
};

const searchProviderWorker = require('../modules/research/search-provider-worker');
const sourceCatalog = require('../modules/sources/source-catalog');
const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');
const documentHunter = require('../modules/sources/dallas-foreclosure-document-hunter');
const sourceAcquisitionScore = require('../modules/research/source-acquisition-score');

function makeResponse(body, contentType = 'text/html; charset=UTF-8', status = 200, finalUrl = '') {
  const buffer = Buffer.from(String(body || ''), 'utf8');
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl,
    headers: {
      get(name) {
        return /^content-type$/i.test(name) ? contentType : '';
      }
    },
    async text() {
      return buffer.toString('utf8');
    },
    async arrayBuffer() {
      return buffer;
    }
  };
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-doc-hunter-'));
  const dbPath = path.join(tmpDir, 'db.json');
  const findMePath = path.join(tmpDir, 'findme-scout-jobs.json');
  const analyzerPath = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
  const dossierPath = path.join(tmpDir, 'deal-call-dossiers.json');

  process.env.DB_PATH = dbPath;
  process.env.FINDME_SCOUT_JOBS_PATH = findMePath;
  process.env.AI_DEAL_ANALYZER_JOBS_PATH = analyzerPath;
  process.env.DEAL_CALL_DOSSIERS_PATH = dossierPath;

  fs.writeFileSync(dbPath, JSON.stringify({ leads: [] }, null, 2));
  fs.writeFileSync(findMePath, JSON.stringify({ version: 1, updated_at: null, jobs: [] }, null, 2));
  fs.writeFileSync(analyzerPath, JSON.stringify({ version: 1, updated_at: null, jobs: [] }, null, 2));
  fs.writeFileSync(dossierPath, JSON.stringify({ version: 1, updated_at: null, dossiers: [] }, null, 2));

  const countyPageUrl = 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php';
  const countyPdfUrl = 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures/2026-07-02-notice.pdf';
  const publicSearchUrl = 'https://dallas.tx.publicsearch.us/';

  const countyPageHtml = `
    <html>
      <body>
        <h1>Dallas County Foreclosure Notices</h1>
        <a href="${countyPdfUrl}">Official foreclosure notice PDF</a>
        <p>PublicSearch pointer: ${publicSearchUrl}</p>
      </body>
    </html>
  `;

  const countyPdfText = [
    'NOTICE OF SUBSTITUTE TRUSTEE SALE',
    'Borrower: Hunter Buyer',
    'Property Address:',
    '9100 Hunter Rd',
    'Dallas, TX 75228',
    'Sale Date: 07/02/2026',
    'Case Number: 2026-54321',
    'Parcel: 123456789',
    'Foreclosure sale notice. Investor special - cash only.',
    'NOTICE OF SUBSTITUTE TRUSTEE SALE',
    'Borrower: Ledger Owner',
    'Property Address:',
    '9200 Ledger Ln',
    'Dallas, TX 75228',
    'Date of Sale: July 7, 2026',
    'Instrument Number: 2026-67890',
    'Foreclosure sale notice.'
  ].join('\n');

  const searchQueries = [];
  const searchResults = [{
    title: 'Dallas County foreclosure notice PDF',
    snippet: 'Official foreclosure notice PDF.',
    url: countyPdfUrl,
    displayed_url: countyPdfUrl,
    source_domain: 'dallascounty.org',
    source_url: countyPdfUrl,
    search_result_classification: 'pdf_document',
    provider_result_rank: 1
  }, {
    title: 'Dallas County foreclosure notices',
    snippet: 'Official county foreclosure page.',
    url: countyPageUrl,
    displayed_url: countyPageUrl,
    source_domain: 'dallascounty.org',
    source_url: countyPageUrl,
    search_result_classification: 'county_search_page',
    provider_result_rank: 2
  }, {
    title: 'Dallas foreclosure blog',
    snippet: 'Generic blog post that should be rejected.',
    url: 'https://example.com/blog/dallas-foreclosure',
    displayed_url: 'https://example.com/blog/dallas-foreclosure',
    source_domain: 'example.com',
    source_url: 'https://example.com/blog/dallas-foreclosure',
    search_result_classification: 'generic_portal',
    provider_result_rank: 3
  }];

  searchProviderWorker.runSearchProvider = async function mockSearchProvider(input, options) {
    searchQueries.push({
      input,
      query_groups: Array.isArray(options && options.query_groups) ? options.query_groups.map((group) => group.query_group) : []
    });
    return {
      status: 'provider_available',
      attempted: true,
      provider: 'serper',
      model: 'serper',
      message: 'Mock discovery provider returned one official PDF and one county page.',
      result_count: searchResults.length,
      search_results_found: searchResults.length,
      cards: searchResults.map((row) => Object.assign({}, row)),
      results: searchResults.map((row, index) => ({
        title: row.title,
        snippet: row.snippet,
        url: row.url,
        displayed_url: row.displayed_url,
        source_domain: row.source_domain,
        rank: index + 1,
        source_url: row.source_url
      })),
      query_groups_used: Array.isArray(options && options.query_groups) ? options.query_groups.map((group) => group.query_group) : [],
      query_group_count: Array.isArray(options && options.query_groups) ? options.query_groups.length : 0,
      query_plan: Array.isArray(options && options.query_groups) ? options.query_groups.map((group) => ({
        provider: 'serper',
        provider_family: group.provider_family,
        purpose: group.purpose,
        query_group: group.query_group,
        attempt_key: group.query_group,
        expected_url_pattern: group.expected_url_pattern,
        query: group.query,
        status: 'provider_available',
        result_count: searchResults.length,
        candidate_count: searchResults.length,
        grounded_url_count: 2,
        snippet_phrase_count: 2
      })) : [],
      result_demotion_counts: { property_detail_url: 0, address_like_text: 0, broad_source: 0, generic_source: 1 },
      rejected_url_class_counts: { generic_source: 1 },
      warnings: []
    };
  };

  const queryGroups = searchProviderWorker.buildSourceDocumentDiscoveryQueryGroups({
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX'
  });
  assert.ok(queryGroups.length >= 2);
  assert.strictEqual(queryGroups[0].purpose, 'source_document_discovery');
  assert.ok(/foreclosure|trustee|notice/i.test(queryGroups[0].query));
  assert.ok(!/house for sale/i.test(searchProviderWorker.sanitizeSerperFreeQuery(queryGroups[0].query, {
    search_mode: 'source_document_discovery'
  })));

  const catalog = sourceCatalog.buildSourceCatalog({ city: 'Dallas', county: 'Dallas', state: 'TX' });
  const foreclosureSource = catalog.find((source) => source.source_id === 'tx_dallas_county_clerk_foreclosure_notices');
  assert.ok(foreclosureSource);
  assert.strictEqual(foreclosureSource.document_hunter_ready, true);

  const foreclosureNoticeAdapter = require('../modules/sources/dallas-foreclosure-notice-adapter');
  const rankedNoticeLinks = foreclosureNoticeAdapter.rankForeclosureNoticeLinks([
    { url: 'https://www.dallascounty.org/Assets/uploads/docs/sheriff/68-A_InspectionFlyer.pdf', label: 'Inspection flyer' },
    { url: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/Addison_4.pdf' },
    { url: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/April/Dallas_2.pdf' },
    { url: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/May/Dallas_1.pdf' }
  ], { now: new Date('2026-07-01T12:00:00Z') });
  assert.ok(/\/May\/Dallas_1\.pdf$/.test(rankedNoticeLinks[0].url));
  assert.ok(/\/April\/Dallas_2\.pdf$/.test(rankedNoticeLinks[1].url));
  assert.ok(/\/March\/Addison_4\.pdf$/.test(rankedNoticeLinks[2].url));
  assert.ok(/InspectionFlyer\.pdf$/.test(rankedNoticeLinks[3].url));

  const navNoiseHtml = `
    <html><body>
      ${Array.from({ length: 14 }, (_, i) => `<a href="https://www.dallascounty.org/about-us/notice-page-${i}/">County notice info page ${i}</a>`).join('\n')}
      <a href="/department/countyclerk/media/foreclosure/May/Dallas_1.pdf">Dallas</a>
    </body></html>
  `;
  const discoveredThroughNoise = foreclosureNoticeAdapter.discoverForeclosureEvidenceLinksFromHtml(navNoiseHtml, 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php');
  assert.ok(discoveredThroughNoise.some((link) => /\/May\/Dallas_1\.pdf$/.test(link.url)), 'foreclosure PDF must be discovered even when nav links come first');
  assert.ok(/\/May\/Dallas_1\.pdf$/.test(discoveredThroughNoise[0].url), 'foreclosure PDF must rank ahead of nav pages');

  const hunterResult = await documentHunter.runDallasForeclosureDocumentHunter({
    source_url: countyPageUrl,
    source_document_url: '',
    env: {
      ENABLE_SEARCH_PROVIDER: 'true',
      SEARCH_PROVIDER: 'serper',
      SERPER_API_KEY: 'dummy-serper-key',
      SERPER_QUERY_MODE: 'free'
    },
    fetch_impl: (url) => {
      if (String(url) === countyPageUrl) {
        return Promise.resolve(makeResponse(countyPageHtml, 'text/html; charset=UTF-8', 200, countyPageUrl));
      }
      if (String(url) === countyPdfUrl) {
        return Promise.resolve(makeResponse(countyPdfText, 'application/pdf', 200, countyPdfUrl));
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    }
  });

  assert.strictEqual(hunterResult.preview_only, true);
  assert.strictEqual(hunterResult.should_ingest, false);
  assert.strictEqual(hunterResult.no_global_mutation, true);
  assert.strictEqual(hunterResult.publicsearch_pointer_found, true);
  assert.ok(Array.isArray(hunterResult.discovered_links));
  assert.ok(hunterResult.discovered_links.some((link) => link.url === countyPdfUrl));
  assert.ok(hunterResult.document_urls_found.includes(countyPdfUrl));
  assert.ok(hunterResult.search_provider_status === 'provider_available' || hunterResult.search_provider_status === 'provider_available');
  assert.ok(Array.isArray(hunterResult.search_provider_query_groups_used));
  assert.ok(hunterResult.search_provider_query_groups_used.includes('dallas_county_foreclosure_notice_pdf'));
  assert.ok(hunterResult.document_hunter_summary);
  assert.ok(hunterResult.document_hunter_summary.candidate_count >= 2);
  assert.ok(hunterResult.document_hunter_summary.search_results_found >= 1);
  assert.ok(hunterResult.document_hunter_summary.discovered_url_count >= 1);
  assert.ok(hunterResult.document_hunter_summary.blocked_rejected_reasons.generic_source >= 1);
  assert.strictEqual(hunterResult.document_hunter_summary.pdf_notice_documents_fetched, 1);
  assert.strictEqual(hunterResult.document_hunter_summary.pdf_notice_documents_parsed, 1);
  assert.ok(hunterResult.document_hunter_summary.pdf_notice_rows_extracted >= 2);
  assert.ok(hunterResult.document_hunter_summary.pdf_notice_rows_with_address >= 2);
  assert.ok(hunterResult.document_hunter_summary.pdf_notice_rows_with_sale_date >= 2);
  assert.strictEqual(hunterResult.document_hunter_summary.pdf_notice_parse_failures, 0);
  assert.ok(hunterResult.candidates.length >= 2);
  assert.ok(hunterResult.cards.length >= 2);

  const candidate = hunterResult.candidates.find((item) => item.normalized_address === '9100 Hunter Rd, Dallas, TX 75228' && item.source_document_url === countyPdfUrl);
  assert.ok(candidate);
  assert.strictEqual(candidate.normalized_address, '9100 Hunter Rd, Dallas, TX 75228');
  assert.strictEqual(candidate.source_document_url, countyPdfUrl);
  assert.ok(candidate.lead_evidence);
  assert.ok(/NOTICE OF SUBSTITUTE TRUSTEE SALE/i.test(candidate.source_proof_text));
  assert.ok(/Sale Date: 07\/02\/2026/i.test(candidate.source_proof_text));
  assert.strictEqual(candidate.preview_only, true);
  assert.strictEqual(candidate.should_ingest, false);
  assert.ok([sourceAcquisitionScore.NEXT_BEST_WORKERS.SKIP_TRACE, sourceAcquisitionScore.NEXT_BEST_WORKERS.PIPELINE, sourceAcquisitionScore.NEXT_BEST_WORKERS.MANUAL_REVIEW].includes(candidate.next_best_worker));

  const acquisitionCore = await sourceAcquisitionOrchestrator.runAcquisitionCore({
    job_id: 'doc_hunter_core_test',
    discovery_batch_id: 'doc_hunter_core_test',
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX',
    source_families: ['preforeclosure_trustee_notice']
  }, {
    env: {
      ENABLE_SEARCH_PROVIDER: 'true',
      SEARCH_PROVIDER: 'serper',
      SERPER_API_KEY: 'dummy-serper-key',
      SERPER_QUERY_MODE: 'free'
    },
    fetch_impl: (url) => {
      if (String(url) === countyPageUrl) {
        return Promise.resolve(makeResponse(countyPageHtml, 'text/html; charset=UTF-8', 200, countyPageUrl));
      }
      if (String(url) === countyPdfUrl) {
        return Promise.resolve(makeResponse(countyPdfText, 'application/pdf', 200, countyPdfUrl));
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    }
  });

  assert.strictEqual(acquisitionCore.status, 'available');
  assert.strictEqual(acquisitionCore.preview_only, true);
  assert.strictEqual(acquisitionCore.should_ingest, false);
  assert.ok(acquisitionCore.document_hunter_summary);
  assert.ok(acquisitionCore.document_hunter_summary.search_provider_status === 'provider_available' || acquisitionCore.document_hunter_summary.search_provider_status === 'provider_available');
  assert.ok(acquisitionCore.document_hunter_summary.candidate_count >= 2);
  assert.ok(acquisitionCore.document_hunter_summary.pdf_notice_rows_extracted >= 2);
  assert.ok(acquisitionCore.adapter_results[0].document_hunter_summary);
  assert.ok(acquisitionCore.adapter_results[0].document_hunter_summary.candidate_count >= 2);

  assert.ok(searchQueries.length >= 1);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(dbPath, 'utf8')).leads, []);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  assert.strictEqual(fs.existsSync(tmpDir), false);
  console.log('dallas foreclosure document hunter tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
