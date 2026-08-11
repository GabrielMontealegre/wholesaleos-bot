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

const tmpDir = path.resolve(__dirname, '.tmp', 'source-acquisition-engine');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

writeJson(process.env.DB_PATH, { leads: [] });
writeJson(process.env.AI_DEAL_ANALYZER_JOBS_PATH, { version: 1, updated_at: null, jobs: [] });
writeJson(process.env.DEAL_CALL_DOSSIERS_PATH, { version: 1, updated_at: null, dossiers: [] });
writeJson(process.env.FINDME_SCOUT_JOBS_PATH, {
  version: 1,
  updated_at: '2026-06-17T00:00:00.000Z',
  jobs: [{
    job_id: 'fms_prior_acq',
    created_at: '2026-06-16T00:00:00.000Z',
    updated_at: '2026-06-16T00:00:00.000Z',
    status: 'complete',
    market: 'Dallas',
    location: 'Dallas, Dallas County, TX',
    cards: [{
      card_id: 'prior_acq',
      address_or_source_text: '124 Main St, Dallas, TX 75208',
      source_url: 'https://www.realtor.com/realestateandhomes-detail/124-Main-St_Dallas_TX_75208_M12445',
      canonical_source_url: 'https://www.realtor.com/realestateandhomes-detail/124-Main-St_Dallas_TX_75208_M12445',
      exact_source_phrase: 'Foreclosure sale notice.',
      public_contact_route: 'Manual Lookup Needed',
      listing_status: 'Active',
      lead_evidence: {
        normalized_address: '124 Main St, Dallas, TX 75208',
        canonical_source_url: 'https://www.realtor.com/realestateandhomes-detail/124-Main-St_Dallas_TX_75208_M12445',
        exact_source_phrase: 'Foreclosure sale notice.',
        exact_source_phrase_verbatim: true,
        public_contact_route: 'Manual Lookup Needed',
        listing_status: 'Active'
      }
    }]
  }]
});

const geminiProvider = require('../modules/research/gemini-scout-discovery-provider');
const searchProviderWorker = require('../modules/research/search-provider-worker');
const findMeScoutJobs = require('../modules/research/findme-scout-jobs');
const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');

let geminiCalls = 0;
geminiProvider.runGeminiScoutDiscovery = async function noGemini() {
  geminiCalls += 1;
  return {
    status: 'not_configured',
    attempted: false,
    cards: [],
    message: 'Gemini disabled in source acquisition test.'
  };
};

let searchCalls = 0;
searchProviderWorker.runSearchProvider = async function noSearch() {
  searchCalls += 1;
  return {
    status: 'provider_not_configured',
    attempted: false,
    cards: [],
    message: 'Search disabled in source acquisition test.'
  };
};

(async () => {
  const created = findMeScoutJobs.createJob({
    fresh_batch: true,
    discovery_mode: 'fresh_batch',
    source_acquisition_enabled: true,
    acquisition_core_enabled: true,
    source_acquisition_mode: 'mock',
    state: 'TX',
    county: 'Dallas County',
    city: 'Dallas',
    quantity: 10,
    include_previous_results: false,
    mock_acquisition_candidates: [{
      source_id: 'tx_dallas_fsbo_contact_first',
      source_family: 'fsbo',
      source_name: 'Dallas FSBO',
      source_url: 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345',
      source_classification: 'exact_property_record',
      address: '123 Main St, Dallas, TX 75208',
      motivation_phrase: 'For sale by owner - cash only.',
      motivation_evidence_text: 'For sale by owner - cash only.',
      current_status: 'Active',
      contact_route: 'FSBO Public Contact'
    }, {
      source_id: 'tx_dallas_county_clerk_foreclosure_notices',
      source_family: 'preforeclosure_trustee_notice',
      official_source: true,
      source_url: 'https://www.realtor.com/realestateandhomes-detail/124-Main-St_Dallas_TX_75208_M12445',
      source_classification: 'exact_property_record',
      address: '124 Main St, Dallas, TX 75208',
      motivation_phrase: 'Foreclosure sale notice.',
      motivation_evidence_text: 'Foreclosure sale notice.',
      current_status: 'Active',
      contact_route: 'Manual Lookup Needed'
    }, {
      source_id: 'tx_dallas_public_works_tax_resales',
      source_family: 'tax_resale',
      official_source: true,
      source_url: 'https://www.realtor.com/realestateandhomes-detail/125-Main-St_Dallas_TX_75208_M12545',
      source_classification: 'exact_property_record',
      address: '125 Main St, Dallas, TX 75208',
      motivation_phrase: 'Cash only tax resale property.',
      motivation_evidence_text: 'Cash only tax resale property.',
      current_status: 'Active',
      contact_route: 'Manual Lookup Needed'
    }]
  });

  const run = await findMeScoutJobs.runJob(created.job_id);
  assert.strictEqual(run.source_summary.acquisition_core_status, 'available');
  assert.strictEqual(run.source_summary.acquisition_core_attempted, true);
  assert.strictEqual(run.source_summary.acquisition_core_candidates_found, 3);
  assert.strictEqual(run.source_summary.acquisition_core_cards_checked, 3);
  assert.ok(run.source_summary.acquisition_core_source_families.includes('fsbo'));
  assert.ok(run.source_summary.acquisition_core_next_best_worker_counts.PIPELINE >= 1);
  assert.ok(run.source_summary.acquisition_core_next_best_worker_counts.SKIP_TRACE >= 1);

  const strong = run.cards.filter((card) => card.batch_group === 'Strong Leads');
  const needsComps = run.cards.filter((card) => card.batch_group === 'Valid Leads - Needs Comps');
  const rejected = run.cards.filter((card) => card.batch_group === 'Rejected');

  assert.ok(strong.some((card) => /123 Main/i.test(card.address_or_source_text)));
  assert.ok(needsComps.some((card) => /125 Main/i.test(card.address_or_source_text)));
  assert.ok(rejected.some((card) => /124 Main/i.test(card.address_or_source_text)));
  assert.ok(run.batch_result.previous_property_rejections >= 1);
  assert.strictEqual(run.no_auto_ingestion_status, 'passed');
  assert.strictEqual(run.persist_scope, 'batch_only');
  assert.ok(run.cards.every((card) => card.preview_only === true));
  assert.ok(run.cards.every((card) => card.should_ingest === false));
  assert.ok(geminiCalls <= 1);
  assert.ok(searchCalls <= 1);

  const storedDb = JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8'));
  assert.deepStrictEqual(storedDb.leads, []);

  const bexarStructuredAddress = '15603 Garam Trl, Von Ormy, TX 78073';
  const bexarCore = await sourceAcquisitionOrchestrator.runAcquisitionCore({
    source_acquisition_mode: 'mock',
    city: 'San Antonio',
    county: 'Bexar',
    state: 'TX',
    discovery_batch_id: 'bexar_structured_address_idempotence',
    mock_acquisition_candidates: [{
      source_id: 'tx_bexar_county_foreclosure_notices',
      source_name: 'Bexar County Clerk Current Foreclosures',
      source_family: 'preforeclosure_trustee_notice',
      source_url: 'https://www.bexar.org/DocumentCenter/View/505/Current-County-Clerk-Foreclosures',
      source_document_url: 'https://www.bexar.org/DocumentCenter/View/505/Current-County-Clerk-Foreclosures',
      source_row_reference: '20260900015',
      normalized_address: bexarStructuredAddress,
      property_address: bexarStructuredAddress,
      raw_address_text: bexarStructuredAddress,
      source_structured_address_verified: true,
      city: 'Von Ormy',
      county: 'Bexar',
      state: 'TX',
      zip: '78073',
      motivation_type: 'preforeclosure_trustee_notice',
      motivation_evidence_text: 'Bexar County Clerk current foreclosure list.',
      current_status: 'On Bexar County Clerk current foreclosure list',
      status_evidence_text: 'Listed on the Bexar County Clerk current foreclosure list (document 20260900015, type MORTGAGE)',
      foreclosure_type: 'MORTGAGE',
      filing_period: '2026-09',
      risk_flags: ['NO_SALE_DATE_IN_SOURCE']
    }]
  });
  assert.strictEqual(bexarCore.candidates[0].normalized_address, bexarStructuredAddress, 'orchestrator normalization must preserve an explicit source-structured address verbatim');
  assert.strictEqual(bexarCore.cards[0].display_address, bexarStructuredAddress, 'card normalization must remain idempotent for source-structured addresses');
  assert.strictEqual(bexarCore.cards[0].listing_status, 'On Bexar County Clerk current foreclosure list');
  assert.strictEqual(bexarCore.cards[0].foreclosure_type, 'MORTGAGE');
  assert.ok(bexarCore.candidates[0].not_a_saved_lead && bexarCore.cards[0].not_a_saved_lead);

  console.log('source-acquisition-engine tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
