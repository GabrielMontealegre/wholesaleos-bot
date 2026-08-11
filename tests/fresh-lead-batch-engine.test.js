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

const tmpDir = path.resolve(__dirname, '.tmp', 'fresh-lead-batch-engine');
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
writeJson(process.env.FINDME_SCOUT_JOBS_PATH, {
  version: 1,
  updated_at: '2026-06-12T00:00:00.000Z',
  jobs: [{
    job_id: 'fms_prior_10527',
    created_at: '2026-06-11T00:00:00.000Z',
    updated_at: '2026-06-11T00:00:00.000Z',
    status: 'complete',
    market: 'Dallas',
    location: 'Dallas, Dallas County, TX',
    cards: [{
      card_id: 'prior_10527',
      address_or_source_text: '10527 Cayuga Dr, Dallas, TX 75228',
      source_url: 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32490000',
      canonical_source_url: 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32490000',
      exact_source_phrase: 'Investor Special!',
      public_contact_route: 'Public Contact Form',
      listing_status: 'Active',
      lead_evidence: {
        normalized_address: '10527 Cayuga Dr, Dallas, TX 75228',
        canonical_source_url: 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32490000',
        exact_source_phrase: 'Investor Special!',
        public_contact_route: 'Public Contact Form',
        listing_status: 'Active'
      }
    }]
  }]
});
writeJson(process.env.AI_DEAL_ANALYZER_JOBS_PATH, { version: 1, updated_at: null, jobs: [] });
writeJson(process.env.DEAL_CALL_DOSSIERS_PATH, { version: 1, updated_at: null, dossiers: [] });

const geminiProvider = require('../modules/research/gemini-scout-discovery-provider');
const findMeScoutJobs = require('../modules/research/findme-scout-jobs');
const aiDealAnalyzerJobs = require('../modules/research/ai-deal-analyzer-jobs');
const dealCallDossiers = require('../modules/research/deal-call-dossiers');

function card(id, address, sourceUrl, phrase, route, status, extra) {
  extra = extra || {};
  return Object.assign({
    card_id: id,
    source_kind: 'gemini_live_discovery',
    provider: 'Gemini',
    address_or_source_text: address,
    display_address: address,
    city: 'Dallas',
    county: 'Dallas County',
    state: 'TX',
    source_url: sourceUrl,
    canonical_source_url: sourceUrl,
    source_title: address + ' | Public Listing',
    exact_source_phrase: phrase,
    matched_source_phrase: phrase,
    exact_source_phrase_source_url: sourceUrl,
    exact_source_phrase_source_type: 'stored_verified_evidence',
    exact_source_phrase_checked_at: '2026-06-12T00:00:00.000Z',
    exact_source_phrase_verbatim: !!phrase,
    public_contact_route: route,
    listing_status: status,
    status: 'Research Ready',
    can_send_to_analyzer: true,
    property_specific_source: true,
    source_classification: 'exact_property_source',
    source_quality: 'Property-specific public source',
    distress_motivation_signals: phrase ? [phrase] : [],
    missing_evidence: [],
    lead_evidence: {
      normalized_address: address,
      canonical_source_url: sourceUrl,
      exact_source_phrase: phrase,
      exact_source_phrase_source_url: sourceUrl,
      exact_source_phrase_source_type: 'stored_verified_evidence',
      exact_source_phrase_checked_at: '2026-06-12T00:00:00.000Z',
      exact_source_phrase_verbatim: !!phrase,
      public_contact_route: route,
      listing_status: status,
      comp_status: 'Needs Comps',
      source_checked_at: '2026-06-12T00:00:00.000Z'
    }
  }, extra);
}

let providerCalls = 0;
geminiProvider.runGeminiScoutDiscovery = async function mockRunGeminiScoutDiscovery() {
  providerCalls += 1;
  return {
    status: 'available',
    attempted: true,
    model: 'mock',
    message: 'Mock Gemini discovery returned bounded candidates.',
    source_urls_found_count: 8,
    candidates_found: 8,
    cards: [
      card('new_strong', '123 Main St, Dallas, TX 75208', 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345', 'Investor special - cash only.', 'Public Contact Form', 'Active'),
      card('new_needs_comps', '124 Main St, Dallas, TX 75208', 'https://www.redfin.com/TX/Dallas/124-Main-St-75208/home/123124', 'Needs TLC and sold as-is.', 'Manual Lookup Needed', 'Active'),
      card('duplicate_new_strong', '123 Main Street, Dallas, TX 75208', 'https://www.redfin.com/TX/Dallas/123-Main-St-75208/home/123123', 'Investor special - cash only.', 'Public Contact Form', 'Active'),
      card('previous_10527', '10527 Cayuga Dr, Dallas, TX 75228', 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32490000', 'Investor Special!', 'Public Contact Form', 'Active'),
      card('generic_source', '125 Main St, Dallas, TX 75208', 'https://www.realtor.com/realestateandhomes-search/Dallas_TX', 'Cash only.', 'Public Contact Form', 'Active', { property_specific_source: false }),
      card('sold_source', '126 Main St, Dallas, TX 75208', 'https://www.realtor.com/realestateandhomes-detail/126-Main-St_Dallas_TX_75208_M126', 'Fixer sold as-is.', 'Public Contact Form', 'Sold'),
      card('unit_224', '5926 Sandhurst Ln Unit 224, Dallas, TX 75206', 'https://www.redfin.com/TX/Dallas/5926-Sandhurst-Ln-Unit-224-75206/home/224', 'Investor opportunity.', 'Manual Lookup Needed', 'Active'),
      card('unit_225', '5926 Sandhurst Ln Unit 225, Dallas, TX 75206', 'https://www.redfin.com/TX/Dallas/5926-Sandhurst-Ln-Unit-225-75206/home/225', 'Investor opportunity.', 'Manual Lookup Needed', 'Active')
    ]
  };
};

assert.throws(() => findMeScoutJobs.createJob({
  fresh_batch: true,
  state: 'TX',
  county: 'Dallas County',
  quantity: 7
}), /quantity must be 5, 10, 20, 30, or 50/i);

(async () => {
  const created = findMeScoutJobs.createJob({
    fresh_batch: true,
    discovery_mode: 'fresh_batch',
    state: 'TX',
    county: 'Dallas County',
    city: 'Dallas',
    quantity: 10,
    include_previous_results: false,
    source_acquisition_enabled: false,
    acquisition_core_enabled: false,
    include_auction: false,
    exclude_reo: true,
    exclude_sold: true,
    wholesale_criteria: ['investor_special', 'cash_only', 'fixer', 'as_is']
  });
  assert.ok(created.discovery_batch_id);
  assert.strictEqual(created.requested_quantity, 10);

  assert.throws(() => findMeScoutJobs.createJob({
    fresh_batch: true,
    state: 'TX',
    county: 'Dallas County',
    city: 'Dallas',
    quantity: 10,
    operator_request_id: created.operator_request_id
  }), /already active/i);

  const run = await findMeScoutJobs.runJob(created.job_id);
  assert.ok(providerCalls >= 1 && providerCalls <= 3);
  assert.strictEqual(run.fresh_batch, true);
  assert.strictEqual(run.batch_result.batch_status, 'partial_success');
  assert.strictEqual(run.batch_result.requested, 10);
  assert.strictEqual(run.batch_result.valid_new_leads, run.batch_result.strong_leads + run.batch_result.needs_comps);
  assert.ok(run.batch_result.strong_leads >= 1);
  assert.ok(run.batch_result.needs_comps >= 3);
  assert.ok(run.batch_result.previous_property_rejections >= 1);
  assert.ok(run.batch_result.generic_incomplete_rejected >= 1);
  assert.ok(run.batch_result.sold_stale_rejected >= 1);

  const valid = run.cards.filter((item) => item.batch_group === 'Strong Leads' || item.batch_group === 'Valid Leads - Needs Comps');
  assert.ok(valid.length <= 10);
  assert.ok(valid.every((item) => item.lead_evidence && item.lead_evidence.canonical_source_url));
  assert.ok(valid.every((item) => item.lead_evidence && item.lead_evidence.exact_source_phrase));
  assert.ok(valid.every((item) => item.lead_evidence && item.lead_evidence.exact_source_phrase_verbatim === true));
  assert.ok(run.batch_progress.started_at);
  assert.ok(run.batch_progress.provider_attempts.length >= 1);
  assert.ok(!valid.some((item) => /10527 Cayuga/i.test(JSON.stringify(item))));
  assert.ok(valid.some((item) => /Unit 224/i.test(item.address_or_source_text)));
  assert.ok(valid.some((item) => /Unit 225/i.test(item.address_or_source_text)));
  assert.ok(valid.every((item) => item.lead_evidence.discovery_batch_id === run.discovery_batch_id));

  const strong = valid.find((item) => item.batch_group === 'Strong Leads');
  const analyzerResult = findMeScoutJobs.sendCardToAnalyzer(run.job_id, strong.card_id);
  assert.ok(analyzerResult.analyzer_job && analyzerResult.analyzer_job.job_id);
  const dossier = dealCallDossiers.createDossier({ analyzer_job_id: analyzerResult.analyzer_job.job_id });
  assert.ok(dossier.dossier && dossier.dossier.dossier_id);
  assert.strictEqual(dossier.dossier.valuation.valuation_status, 'Locked');
  assert.strictEqual(dossier.dossier.valuation.arv_range, null);
  assert.strictEqual(dossier.dossier.valuation.mao_range, null);

  const continued = findMeScoutJobs.continueJob(run.job_id);
  assert.strictEqual(continued.job_id, run.job_id);
  const callsBeforeContinueRun = providerCalls;
  const afterContinue = await findMeScoutJobs.runJob(run.job_id);
  assert.strictEqual(providerCalls, callsBeforeContinueRun);
  assert.strictEqual(afterContinue.discovery_batch_id, run.discovery_batch_id);
  assert.ok(afterContinue.cards.length >= run.cards.length);

  const cancelledJob = findMeScoutJobs.createJob({
    fresh_batch: true,
    state: 'NC',
    county: 'Mecklenburg County',
    city: 'Charlotte',
    quantity: 5,
    operator_request_id: 'cancel-test'
  });
  const cancelled = findMeScoutJobs.cancelJob(cancelledJob.job_id);
  assert.strictEqual(cancelled.batch_status, 'cancelled');

  geminiProvider.runGeminiScoutDiscovery = async function slowProvider() {
    providerCalls += 1;
    return new Promise(() => {});
  };
  const timeoutJob = findMeScoutJobs.createJob({
    fresh_batch: true,
    state: 'NC',
    county: 'Wake County',
    city: 'Raleigh',
    quantity: 5,
    operator_request_id: 'timeout-test',
    source_acquisition_enabled: false,
    acquisition_core_enabled: false,
    provider_timeout_ms: 50
  });
  const timeoutRun = await findMeScoutJobs.runJob(timeoutJob.job_id);
  assert.strictEqual(timeoutRun.batch_status, 'provider_unavailable');
  assert.strictEqual(timeoutRun.batch_result.valid_new_leads, 0);

  const dbAfter = JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8'));
  assert.deepStrictEqual(dbAfter.leads, []);
  assert.ok(aiDealAnalyzerJobs.listJobs(20).length >= 1);

  console.log('fresh lead batch engine tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
