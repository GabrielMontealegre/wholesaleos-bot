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

const tmpDir = path.resolve(__dirname, '.tmp', 'search-provider-fallback');
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
  updated_at: '2026-06-12T00:00:00.000Z',
  jobs: [{
    job_id: 'fms_prior_10527',
    status: 'complete',
    market: 'Dallas',
    location: 'Dallas, Dallas County, TX',
    created_at: '2026-06-11T00:00:00.000Z',
    updated_at: '2026-06-11T00:00:00.000Z',
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

const geminiProvider = require('../modules/research/gemini-scout-discovery-provider');
const searchWorker = require('../modules/research/search-provider-worker');
const snippetEvidence = require('../modules/research/search-snippet-evidence');
const auditor = require('../modules/research/source-quality-auditor');
const findMeScoutJobs = require('../modules/research/findme-scout-jobs');

function weakGeminiCard() {
  const url = 'https://www.redfin.com/TX/Dallas/7777-Weak-Dr-75208/home/7777';
  return {
    card_id: 'weak_url_only',
    source_kind: 'gemini_live_discovery',
    provider: 'Gemini',
    address_or_source_text: '7777 Weak Dr, Dallas, TX 75208',
    display_address: '7777 Weak Dr, Dallas, TX 75208',
    city: 'Dallas',
    state: 'TX',
    source_url: url,
    canonical_source_url: url,
    source_title: '7777 Weak Dr | Redfin',
    source_snippet: 'Single family home in Dallas.',
    listing_status: 'Active',
    public_contact_route: 'Public Contact Form',
    missing_evidence: ['exact source-backed wholesale phrase'],
    status: 'Needs Source Proof',
    can_send_to_analyzer: false
  };
}

geminiProvider.runGeminiScoutDiscovery = async function mockWeakGemini(job, options) {
  if (options && options.purpose === 'evidence_enrichment') {
    return {
      status: 'available',
      attempted: true,
      provider: 'Gemini',
      model: 'mock',
      message: 'Mock enrichment had no stronger page evidence.',
      source_urls_found_count: 0,
      candidates_found: 0,
      evidence_enrichment_attempts: Array.isArray(options.enrichment_candidates) ? options.enrichment_candidates.length : 0,
      evidence_enriched_count: 0,
      cards: []
    };
  }
  return {
    status: 'available',
    attempted: true,
    provider: 'Gemini',
    model: 'mock',
    message: 'Mock Gemini returned URL-only candidate.',
    source_urls_found_count: 1,
    candidates_found: 1,
    url_only_candidate_count: 1,
    exact_phrases_verified: 0,
    cards: [weakGeminiCard()]
  };
};

(async () => {
  const disabled = searchWorker.searchProviderConfig({ ENABLE_SEARCH_PROVIDER: 'false', SEARCH_PROVIDER: 'serper' });
  assert.strictEqual(disabled.status, 'provider_not_configured');

  const noKey = await searchWorker.runSearchProvider({ city: 'Dallas', state: 'TX' }, {
    env: { ENABLE_SEARCH_PROVIDER: 'true', SEARCH_PROVIDER: 'brave' }
  });
  assert.strictEqual(noKey.status, 'provider_not_configured');
  assert.ok(!JSON.stringify(noKey).includes('BRAVE_SEARCH_API_KEY='));

  const phrase = snippetEvidence.phraseFromVisibleText('123 Search Dr', 'Active investor special with cash only terms.');
  assert.strictEqual(phrase.exact_source_phrase_verbatim, true);
  assert.ok(/investor special|cash only/i.test(phrase.exact_source_phrase));

  const queryOnly = snippetEvidence.normalizeSearchResult({
    title: '123 Query Dr',
    snippet: 'Single family home in Dallas.',
    url: 'https://www.redfin.com/TX/Dallas/123-Query-Dr-75208/home/123'
  }, {
    provider: 'mock',
    query: 'Dallas investor special cash only',
    city: 'Dallas',
    state: 'TX'
  });
  assert.strictEqual(queryOnly.exact_source_phrase, '');
  assert.strictEqual(queryOnly.exact_source_phrase_verbatim, false);

  const generic = snippetEvidence.normalizeSearchResult({
    title: 'Dallas homes for sale',
    snippet: 'Investor special listings in Dallas.',
    url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX'
  }, { provider: 'mock', city: 'Dallas', state: 'TX' });
  assert.strictEqual(generic.property_specific_source, false);
  assert.ok(generic.missing_evidence.includes('property-specific source URL'));

  const rateLimited = await searchWorker.runSearchProvider({ city: 'Dallas', state: 'TX' }, {
    env: { ENABLE_SEARCH_PROVIDER: 'true', SEARCH_PROVIDER: 'mock' },
    mock_status: 'provider_rate_limited'
  });
  assert.strictEqual(rateLimited.status, 'provider_rate_limited');
  assert.strictEqual(rateLimited.provider_attempts.length, 1);

  const timedOut = await searchWorker.runSearchProvider({ city: 'Dallas', state: 'TX' }, {
    env: { ENABLE_SEARCH_PROVIDER: 'true', SEARCH_PROVIDER: 'mock' },
    mock_status: 'provider_timed_out'
  });
  assert.strictEqual(timedOut.status, 'provider_timed_out');
  assert.strictEqual(timedOut.provider_attempts.length, 1);

  const audit = auditor.auditBatch({
    cards: [generic],
    batchAudit: { valid_new_leads: 0 },
    providerSummary: { search_fallback_status: 'Not configured' }
  });
  assert.ok(/Zero callable leads/i.test(audit.zero_callable_explanation));
  assert.ok(/gate/i.test(audit.recommended_action) || /provider|lookup/i.test(audit.recommended_action));

  const goodUrl = 'https://www.redfin.com/TX/Dallas/2010-Fallback-Dr-75208/home/2010';
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
      title: '2010 Fallback Dr | Redfin',
      snippet: 'Active investor special in Dallas. Cash only, sold as-is.',
      url: goodUrl,
      possible_address: '2010 Fallback Dr, Dallas, TX 75208',
      public_contact_route: 'Public Contact Form',
      listing_status: 'Active'
    }, {
      title: '10527 Cayuga Dr | Redfin',
      snippet: 'Active investor special in Dallas.',
      url: priorUrl,
      possible_address: '10527 Cayuga Dr, Dallas, TX 75228',
      public_contact_route: 'Public Contact Form',
      listing_status: 'Active'
    }, {
      title: 'Dallas search results',
      snippet: 'Investor special homes.',
      url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX'
    }]
  });

  const attempts = run.batch_progress.provider_attempts || [];
  assert.ok(attempts.some((attempt) => attempt.provider && /Gemini/i.test(attempt.provider) && attempt.purpose === 'discovery_primary'));
  assert.ok(attempts.some((attempt) => attempt.provider && /mock|search/i.test(attempt.provider) && attempt.purpose === 'search_fallback'));
  assert.ok(attempts.some((attempt) => attempt.purpose === 'evidence_enrichment'));
  assert.strictEqual(new Set(attempts.map((attempt) => attempt.attempt_key || `${attempt.provider}|${attempt.purpose}|${attempt.query_group}`)).size, attempts.length);
  assert.ok(Array.isArray(run.provider_summary.search_query_groups_used));
  assert.ok(run.provider_summary.search_query_groups_used.length >= 1);
  assert.ok(Array.isArray(run.provider_summary.search_query_plan));
  assert.ok(run.provider_summary.search_query_plan[0] && /redfin|realtor|zillow|har/i.test(run.provider_summary.search_query_plan[0].provider_family));
  assert.ok(run.provider_summary.search_result_demotion_counts.property_detail_url >= 0);
  assert.ok(run.provider_summary.search_results_found >= 3);
  assert.ok(run.provider_summary.snippet_phrases_verified >= 2);
  assert.ok(run.batch_result.search_results_found >= 3);

  const fallbackCard = run.cards.find((card) => /2010 Fallback/i.test(JSON.stringify(card)));
  assert.ok(fallbackCard);
  assert.strictEqual(fallbackCard.lead_evidence.canonical_source_url, goodUrl);
  assert.strictEqual(fallbackCard.lead_evidence.exact_source_phrase_verbatim, true);
  assert.ok(/investor special|cash only|as-is/i.test(fallbackCard.lead_evidence.exact_source_phrase));
  assert.ok(['Strong Leads', 'Valid Leads - Needs Comps'].includes(fallbackCard.batch_group));

  const priorCards = run.cards.filter((card) => /10527 Cayuga/i.test(JSON.stringify(card)));
  assert.ok(priorCards.length >= 1);
  assert.ok(priorCards.some((card) => card.lead_evidence && card.lead_evidence.normalized_address === '10527 Cayuga Dr, Dallas, TX 75228'));
  assert.ok(run.batch_result.previous_property_rejections >= 0);
  assert.strictEqual(fallbackCard.lead_evidence.comp_status, 'Needs Comps');
  assert.ok(fallbackCard.can_send_to_analyzer);

  console.log('search provider fallback tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
