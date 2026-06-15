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

const tmpDir = path.resolve(__dirname, '.tmp', 'gemini-specialist-workers');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

const priorUrl = 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32490000';
writeJson(process.env.DB_PATH, { leads: [] });
writeJson(process.env.AI_DEAL_ANALYZER_JOBS_PATH, { version: 1, updated_at: null, jobs: [] });
writeJson(process.env.DEAL_CALL_DOSSIERS_PATH, { version: 1, updated_at: null, dossiers: [] });
writeJson(process.env.FINDME_SCOUT_JOBS_PATH, {
  version: 1,
  updated_at: '2026-06-13T00:00:00.000Z',
  jobs: [{
    job_id: 'fms_prior_10527',
    status: 'complete',
    market: 'Dallas',
    location: 'Dallas, Dallas County, TX',
    created_at: '2026-06-12T00:00:00.000Z',
    updated_at: '2026-06-12T00:00:00.000Z',
    cards: [{
      card_id: 'prior_10527',
      address_or_source_text: '10527 Cayuga Dr, Dallas, TX 75228',
      display_address: '10527 Cayuga Dr, Dallas, TX 75228',
      source_url: priorUrl,
      canonical_source_url: priorUrl,
      exact_source_phrase: 'Active investor special in Dallas.',
      exact_source_phrase_verbatim: true,
      public_contact_route: 'Public Contact Form',
      listing_status: 'Active',
      lead_evidence: {
        normalized_address: '10527 Cayuga Dr, Dallas, TX 75228',
        canonical_source_url: priorUrl,
        exact_source_phrase: 'Active investor special in Dallas.',
        exact_source_phrase_verbatim: true,
        public_contact_route: 'Public Contact Form',
        listing_status: 'Active'
      }
    }]
  }]
});

const planner = require('../modules/research/gemini-query-planner');
const guard = require('../modules/research/gemini-structured-output-guard');
const extractor = require('../modules/research/gemini-evidence-extractor');
const selfAuditor = require('../modules/research/gemini-self-auditor');
const geminiProvider = require('../modules/research/gemini-scout-discovery-provider');
const findMeScoutJobs = require('../modules/research/findme-scout-jobs');

function response(payload, status, url, contentType) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: url || 'https://generativelanguage.googleapis.com/mock',
    headers: { get: (name) => /content-type/i.test(name) ? (contentType || 'application/json') : '' },
    text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload)
  };
}

function geminiPayload(text, groundingUrl, supportText) {
  return {
    candidates: [{
      content: { parts: [{ text }] },
      groundingMetadata: {
        groundingChunks: groundingUrl ? [{ web: { uri: groundingUrl, title: '2010 Fallback Dr | Redfin' } }] : [],
        groundingSupports: groundingUrl ? [{
          segment: { text: supportText || '' },
          groundingChunkIndices: [0]
        }] : []
      }
    }]
  };
}

(async () => {
  const job = {
    market: 'Texas',
    city: 'Dallas',
    state: 'TX',
    county: 'Dallas County',
    location: 'Dallas, Dallas County, TX',
    batch_size: 10,
    include_auction: false,
    exclude_reo: true,
    strategies: ['investor_special', 'cash_only', 'as_is', 'fixer', 'fsbo', 'price_reduction']
  };
  const groups = planner.planGeminiQueryGroups(job);
  assert.ok(groups.some((group) => group.id === 'redfin_investor_special'));
  assert.ok(groups.some((group) => group.id === 'redfin_cash_only'));
  assert.ok(groups.some((group) => group.id === 'redfin_as_is'));
  assert.ok(groups.some((group) => group.id === 'realtor_investor_special'));
  assert.ok(groups.some((group) => group.id === 'har_as_is'));
  assert.ok(groups.some((group) => group.id === 'fsbo_as_is'));
  assert.ok(!groups.some((group) => /opendata|archive/i.test(group.query)));
  assert.ok(!groups.some((group) => /auction|reo|bank-owned/i.test(group.query)));

  const malformed = guard.guardGeminiOutput({
    text: '```json\n{"candidates":[{"source_url":"https://www.redfin.com/TX/Dallas/2010-Fallback-Dr-75208/home/2010",}]\n```',
    grounding_urls: ['https://www.redfin.com/TX/Dallas/2010-Fallback-Dr-75208/home/2010'],
    response: geminiPayload('', 'https://www.redfin.com/TX/Dallas/2010-Fallback-Dr-75208/home/2010', 'Investor Special!')
  });
  assert.strictEqual(malformed.gemini_output_valid_json, false);
  assert.strictEqual(malformed.gemini_output_repaired, true);
  assert.ok(malformed.gemini_grounding_urls_count >= 1);
  assert.ok(malformed.gemini_grounding_support_count >= 1);
  assert.strictEqual(malformed.gemini_candidates_recovered_count, 1);

  const phrase = extractor.extractPhraseEvidence({
    source_title: '2010 Fallback Dr | Redfin',
    source_snippet: 'Active listing. Investor Special! Cash only.',
    source_url: 'https://www.redfin.com/TX/Dallas/2010-Fallback-Dr-75208/home/2010'
  });
  assert.strictEqual(phrase.exact_source_phrase_verbatim, true);
  assert.ok(/Investor Special/i.test(phrase.exact_source_phrase));
  assert.ok(phrase.exact_source_phrase_source_type);

  const guessed = extractor.extractPhraseEvidence({
    source_title: '2011 Guess Dr | Redfin',
    source_snippet: 'Single family home in Dallas.',
    source_url: 'https://www.redfin.com/TX/Dallas/2011-Guess-Dr-75208/home/2011',
    exact_source_phrase: 'likely investor special'
  });
  assert.strictEqual(guessed.exact_source_phrase, '');
  assert.strictEqual(guessed.exact_source_phrase_verbatim, false);

  const queryOnly = extractor.extractPhraseEvidence({
    source_title: '2012 Query Dr | Redfin',
    source_snippet: 'Single family home in Dallas.',
    provider_query: 'Dallas cash only investor special',
    source_url: 'https://www.redfin.com/TX/Dallas/2012-Query-Dr-75208/home/2012'
  });
  assert.strictEqual(queryOnly.exact_source_phrase, '');

  const missingStatusAudit = selfAuditor.auditGeminiCandidate({
    address: '2013 Missing Status Dr, Dallas, TX 75208',
    source_url: 'https://www.redfin.com/TX/Dallas/2013-Missing-Status-Dr-75208/home/2013',
    exact_source_phrase: 'Investor Special!',
    exact_source_phrase_verbatim: true,
    exact_source_phrase_source_type: 'grounding_support',
    public_contact_route: 'Public Contact Form'
  });
  assert.strictEqual(missingStatusAudit.valid_for_gate, false);
  assert.ok(missingStatusAudit.blockers.includes('missing_status'));

  const sourceUrl = 'https://www.redfin.com/TX/Dallas/2010-Fallback-Dr-75208/home/2010';
  const providerRun = await geminiProvider.runGeminiScoutDiscovery(job, {
    env: { GEMINI_API_KEY: 'test', ENABLE_GEMINI_WEB_RESEARCH: 'true', GEMINI_RESEARCH_MODEL: 'mock' },
    fetchImpl: async (url, init) => {
      if (init && init.method === 'POST') {
        return response(geminiPayload('```json\n{"candidates":[{"source_url":"' + sourceUrl + '",}]\n```', sourceUrl, 'Active Investor Special! Cash only listing.'), 200);
      }
      return response('<html><head><title>2010 Fallback Dr</title><meta name="description" content="Active Investor Special! Cash only listing."></head></html>', 200, sourceUrl, 'text/html');
    }
  });
  assert.strictEqual(providerRun.gemini_output_valid_json, false);
  assert.strictEqual(providerRun.gemini_output_repaired, true);
  assert.ok(providerRun.gemini_grounding_urls_count >= 1);
  assert.ok(providerRun.gemini_grounding_support_count >= 1);
  assert.ok(providerRun.gemini_query_groups_used.length >= 1);
  assert.ok(providerRun.exact_phrases_verified >= 1);
  assert.strictEqual(providerRun.cards[0].exact_source_phrase_verbatim, true);
  assert.ok(providerRun.cards[0].gemini_self_audit);

  const normalizedGuess = geminiProvider.normalizeCandidate({
    address: '2014 Guess Dr, Dallas, TX 75208',
    source_url: 'https://www.redfin.com/TX/Dallas/2014-Guess-Dr-75208/home/2014',
    source_title: '2014 Guess Dr | Redfin',
    source_snippet: 'Single family home in Dallas.',
    exact_source_phrase: 'likely investor special',
    exact_source_phrase_verbatim: true,
    listing_status: 'Active'
  }, { market: 'Texas', location: 'Dallas, TX', strategy_labels: ['investor special'] });
  assert.strictEqual(normalizedGuess.exact_source_phrase, '');
  assert.strictEqual(normalizedGuess.exact_source_phrase_verbatim, false);

  const originalGemini = geminiProvider.runGeminiScoutDiscovery;
  geminiProvider.runGeminiScoutDiscovery = async function weakGemini() {
    return {
      status: 'available',
      attempted: true,
      provider: 'Gemini',
      model: 'mock',
      message: 'Weak Gemini for specialist routing test.',
      source_urls_found_count: 1,
      candidates_found: 1,
      url_only_candidate_count: 1,
      exact_phrases_verified: 0,
      cards: [{
        card_id: 'weak_10527',
        source_kind: 'gemini_live_discovery',
        provider: 'Gemini',
        address_or_source_text: '10527 Cayuga Dr, Dallas, TX 75228',
        display_address: '10527 Cayuga Dr, Dallas, TX 75228',
        city: 'Dallas',
        state: 'TX',
        source_url: priorUrl,
        canonical_source_url: priorUrl,
        source_title: '10527 Cayuga Dr | Redfin',
        source_snippet: 'Single family home in Dallas.',
        listing_status: 'Active',
        public_contact_route: 'Public Contact Form',
        missing_evidence: ['exact source-backed wholesale phrase'],
        status: 'Needs Source Proof',
        can_send_to_analyzer: false
      }]
    };
  };
  const created = findMeScoutJobs.createJob({
    fresh_batch: true,
    discovery_mode: 'fresh_batch',
    state: 'TX',
    county: 'Dallas County',
    city: 'Dallas',
    quantity: 10,
    include_previous_results: false,
    include_auction: false,
    exclude_reo: true,
    exclude_sold: true,
    wholesale_criteria: ['investor_special', 'cash_only', 'fixer', 'as_is'],
    max_provider_calls: 3
  });
  const run = await findMeScoutJobs.runJob(created.job_id, {
    env: { ENABLE_SEARCH_PROVIDER: 'true', SEARCH_PROVIDER: 'mock', SEARCH_PROVIDER_MAX_RESULTS: '10' },
    mock_search_results: [{
      title: '2015 Search Dr | Redfin',
      snippet: 'Active investor special. Cash only.',
      url: 'https://www.redfin.com/TX/Dallas/2015-Search-Dr-75208/home/2015',
      possible_address: '2015 Search Dr, Dallas, TX 75208',
      public_contact_route: 'Public Contact Form',
      listing_status: 'Active'
    }]
  });
  geminiProvider.runGeminiScoutDiscovery = originalGemini;
  assert.ok((run.batch_progress.provider_attempts || []).some((attempt) => attempt.purpose === 'search_fallback'));
  assert.ok(!run.cards.some((card) => /10527 Cayuga/i.test(JSON.stringify(card)) && card.batch_group !== 'Rejected'));
  assert.strictEqual(run.should_ingest, false);

  console.log('gemini specialist worker tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
