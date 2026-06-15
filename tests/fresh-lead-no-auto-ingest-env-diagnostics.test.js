'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = path.resolve(__dirname, '.tmp', 'fresh-lead-no-auto-ingest-env-diagnostics');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

writeJson(process.env.DB_PATH, {
  leads: [{ id: 'lead_existing', address: '1 Existing St, Dallas, TX 75201' }],
  reviewQueue: [{ id: 'mrq_existing', status: 'open', title: 'Existing queue row' }],
  buyers: [{ id: 'buyer_existing', name: 'Existing Buyer' }]
});
writeJson(process.env.AI_DEAL_ANALYZER_JOBS_PATH, { version: 1, updated_at: null, jobs: [] });
writeJson(process.env.DEAL_CALL_DOSSIERS_PATH, { version: 1, updated_at: null, dossiers: [] });
writeJson(process.env.FINDME_SCOUT_JOBS_PATH, { version: 1, updated_at: null, jobs: [] });

const geminiProvider = require('../modules/research/gemini-scout-discovery-provider');
const searchWorker = require('../modules/research/search-provider-worker');
const findMeScoutJobs = require('../modules/research/findme-scout-jobs');

geminiProvider.runGeminiScoutDiscovery = async function mockGemini(job, options) {
  if (options && options.purpose === 'evidence_enrichment') {
    return {
      status: 'available',
      attempted: true,
      provider: 'Gemini',
      model: 'mock',
      candidates_found: 0,
      cards: []
    };
  }
  return {
    status: 'available',
    attempted: true,
    provider: 'Gemini',
    model: 'mock',
    candidates_found: 0,
    url_only_candidate_count: 1,
    cards: []
  };
};

(async () => {
  const secret = 'serper_live_secret_value_should_not_appear';
  const disabled = searchWorker.searchProviderEnvDiagnostics({});
  assert.strictEqual(disabled.enable_search_provider_present, false);
  assert.strictEqual(disabled.enable_search_provider_enabled, false);
  assert.strictEqual(disabled.readiness, 'not_configured');

  const serperReady = searchWorker.searchProviderConfig({
    ENABLE_SEARCH_PROVIDER: 'YES',
    SEARCH_PROVIDER: 'Serper',
    SERPER_API_KEY: secret,
    SEARCH_PROVIDER_TIMEOUT_MS: '8000',
    SEARCH_PROVIDER_MAX_RESULTS: '20'
  });
  assert.strictEqual(serperReady.configured, true);
  assert.strictEqual(serperReady.readiness, 'ready');
  assert.strictEqual(serperReady.display_provider, 'serper');
  assert.strictEqual(serperReady.diagnostics.serper_api_key_length_bucket, 'present_expected');
  assert.ok(!JSON.stringify(serperReady).includes(secret));

  const typo = searchWorker.searchProviderConfig({
    ENABLE_SEARCH_PROVIDER: 'true',
    SEARCH_PROVIDER: 'brvae'
  });
  assert.strictEqual(typo.status, 'invalid_provider');
  assert.strictEqual(typo.readiness, 'invalid_provider');
  assert.deepStrictEqual(typo.missing, []);

  const missingKey = searchWorker.searchProviderConfig({
    ENABLE_SEARCH_PROVIDER: '1',
    SEARCH_PROVIDER: 'brave'
  });
  assert.strictEqual(missingKey.status, 'provider_not_configured');
  assert.strictEqual(missingKey.readiness, 'missing_key');
  assert.deepStrictEqual(missingKey.missing, ['BRAVE_SEARCH_API_KEY']);

  const missingGoogleCx = searchWorker.searchProviderConfig({
    ENABLE_SEARCH_PROVIDER: 'TRUE',
    SEARCH_PROVIDER: 'google',
    GOOGLE_CSE_API_KEY: 'google_key_present'
  });
  assert.strictEqual(missingGoogleCx.readiness, 'missing_google_cx');
  assert.deepStrictEqual(missingGoogleCx.missing, ['GOOGLE_CSE_CX']);

  const beforeDb = readJson(process.env.DB_PATH);
  const beforeAnalyzer = readJson(process.env.AI_DEAL_ANALYZER_JOBS_PATH);
  const beforeDossiers = readJson(process.env.DEAL_CALL_DOSSIERS_PATH);

  const created = findMeScoutJobs.createJob({
    fresh_batch: true,
    discovery_mode: 'fresh_batch',
    state: 'TX',
    county: 'Dallas County',
    city: 'Dallas',
    quantity: 5,
    include_previous_results: false,
    wholesale_criteria: ['investor_special', 'cash_only', 'as_is'],
    max_provider_calls: 2
  });

  const sourceUrl = 'https://www.redfin.com/TX/Dallas/3010-Noauto-Dr-75208/home/3010';
  const run = await findMeScoutJobs.runJob(created.job_id, {
    env: {
      ENABLE_SEARCH_PROVIDER: 'true',
      SEARCH_PROVIDER: 'mock',
      SEARCH_PROVIDER_MAX_RESULTS: '10'
    },
    mock_search_results: [{
      title: '3010 Noauto Dr | Redfin',
      snippet: 'Active investor special in Dallas. Cash only, sold as-is.',
      url: sourceUrl,
      possible_address: '3010 Noauto Dr, Dallas, TX 75208',
      public_contact_route: 'Public Contact Form',
      listing_status: 'Active'
    }]
  });

  const afterRunDb = readJson(process.env.DB_PATH);
  const afterRunAnalyzer = readJson(process.env.AI_DEAL_ANALYZER_JOBS_PATH);
  const afterRunDossiers = readJson(process.env.DEAL_CALL_DOSSIERS_PATH);

  assert.strictEqual(afterRunDb.leads.length, beforeDb.leads.length, 'Fresh batch should not create saved/global leads');
  assert.strictEqual(afterRunDb.reviewQueue.length, beforeDb.reviewQueue.length, 'Fresh batch should not create manual review rows');
  assert.strictEqual(afterRunDb.buyers.length, beforeDb.buyers.length, 'Fresh batch should not mutate buyers');
  assert.strictEqual(afterRunAnalyzer.jobs.length, beforeAnalyzer.jobs.length, 'Fresh batch should not create analyzer jobs automatically');
  assert.strictEqual(afterRunDossiers.dossiers.length, beforeDossiers.dossiers.length, 'Fresh batch should not create call dossiers automatically');
  assert.strictEqual(run.persist_scope, 'batch_only');
  assert.strictEqual(run.no_auto_ingestion_status, 'passed');
  assert.strictEqual(run.provider_summary.no_auto_ingestion_status, 'passed');
  assert.strictEqual(run.provider_summary.batch_persisted_scope, 'batch_only');
  assert.strictEqual(run.source_summary.manual_review_rows_added, 0);
  assert.strictEqual(run.source_summary.no_auto_ingestion_status, 'passed');
  assert.strictEqual(run.provider_summary.search_provider_configured, true);
  assert.strictEqual(run.provider_summary.search_provider_readiness, 'ready');
  assert.strictEqual(run.provider_summary.search_provider_normalized, 'mock');

  const card = run.cards.find((candidate) => candidate && candidate.can_send_to_analyzer === true);
  assert.ok(card, 'mock result should produce an explicit handoff-eligible card');
  const handoff = findMeScoutJobs.sendCardToAnalyzer(run.job_id, card.card_id);
  assert.ok(handoff.analyzer_job && handoff.analyzer_job.job_id, 'explicit Analyzer handoff should still create a job');
  assert.strictEqual(handoff.card.lead_evidence.canonical_source_url, sourceUrl);
  assert.strictEqual(handoff.card.lead_evidence.exact_source_phrase_verbatim, true);

  const afterHandoffAnalyzer = readJson(process.env.AI_DEAL_ANALYZER_JOBS_PATH);
  assert.strictEqual(afterHandoffAnalyzer.jobs.length, 1, 'only explicit handoff should create analyzer job');
  assert.strictEqual(readJson(process.env.DEAL_CALL_DOSSIERS_PATH).dossiers.length, beforeDossiers.dossiers.length, 'Analyzer handoff should not create call dossier');

  const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(serverSource.includes('Legacy global lead pull is disabled for Fresh Lead safety'));
  assert.ok(!/await\s+de\.dealEngine\(state,\s*count\)/.test(serverSource), 'legacy route must not run dealEngine ingestion');

  console.log('fresh lead no-auto-ingest and env diagnostics tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
