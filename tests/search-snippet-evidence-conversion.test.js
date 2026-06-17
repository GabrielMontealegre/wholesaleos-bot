const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = path.resolve(__dirname, '.tmp', 'search-snippet-evidence-conversion');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));
fs.writeFileSync(process.env.FINDME_SCOUT_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, JSON.stringify({ version: 1, dossiers: [] }, null, 2));

const snippetEvidence = require('../modules/research/search-snippet-evidence');
const geminiProvider = require('../modules/research/gemini-scout-discovery-provider');
const findMeScoutJobs = require('../modules/research/findme-scout-jobs');
const leadEvidence = require('../modules/research/lead-evidence');

function normalize(result) {
  return snippetEvidence.normalizeSearchResult(result, {
    provider: 'mock',
    query: 'Dallas investor special cash only',
    city: 'Dallas',
    county: 'Dallas County',
    state: 'TX'
  });
}

const propertyDetailUrl = 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32490000';
const validDetail = normalize({
  title: '10527 Cayuga Dr Dallas TX | Redfin',
  snippet: 'Investor special. Cash only. House for sale.',
  url: propertyDetailUrl,
  possible_address: '10527 Cayuga Dr, Dallas, TX 75228',
  public_contact_route: 'Manual Lookup Needed'
});
assert.strictEqual(validDetail.address, '10527 Cayuga Dr, Dallas, TX 75228');
assert.strictEqual(validDetail.lead_evidence.normalized_address, '10527 Cayuga Dr, Dallas, TX 75228');
assert.strictEqual(validDetail.phrase_candidate_seen, true);
assert.strictEqual(validDetail.status_candidate_seen, true);
assert.ok(/investor special|cash only/i.test(validDetail.phrase_candidate_text));
assert.strictEqual(validDetail.phrase_candidate_promoted, true);
assert.ok(/for sale/i.test(validDetail.status_candidate_text));
assert.strictEqual(validDetail.status_candidate_promoted, true);
assert.strictEqual(validDetail.exact_source_phrase_verbatim, true);
assert.strictEqual(validDetail.lead_evidence.exact_source_phrase_verbatim, true);
assert.strictEqual(validDetail.lead_evidence.comp_status, 'Needs Comps');
assert.strictEqual(leadEvidence.dealFinderGroup(validDetail.lead_evidence), 'Valid Leads - Needs Comps');

const missingStatus = normalize({
  title: '1200 Quiet Dr Dallas TX | Redfin',
  snippet: 'Needs TLC.',
  url: 'https://www.redfin.com/TX/Dallas/1200-Quiet-Dr-75208/home/1200',
  possible_address: '1200 Quiet Dr, Dallas, TX 75208'
});
assert.strictEqual(missingStatus.exact_source_phrase, '');
assert.strictEqual(missingStatus.lead_evidence.exact_source_phrase, '');
assert.strictEqual(missingStatus.phrase_candidate_seen, true);
assert.strictEqual(missingStatus.status_candidate_seen, false);
assert.strictEqual(missingStatus.evidence_conversion_trace.property_url_but_missing_status, true);
assert.ok(missingStatus.evidence_conversion_reason_codes.includes('property_url_but_missing_status'));
assert.ok(missingStatus.evidence_conversion_reason_codes.includes('source_phrase_dropped'));
assert.strictEqual(leadEvidence.dealFinderGroup(missingStatus.lead_evidence), 'Research / Reference');

const missingPhrase = normalize({
  title: '1222 Atlas Dr Dallas TX | Redfin',
  snippet: 'Active listing in Dallas. Great location.',
  url: 'https://www.redfin.com/TX/Dallas/1222-Atlas-Dr-75208/home/1222',
  possible_address: '1222 Atlas Dr, Dallas, TX 75208'
});
assert.strictEqual(missingPhrase.exact_source_phrase, '');
assert.strictEqual(missingPhrase.status_candidate_seen, true);
assert.strictEqual(missingPhrase.evidence_conversion_trace.property_url_but_missing_phrase, true);
assert.ok(missingPhrase.evidence_conversion_reason_codes.includes('exact_property_page_rejected_reason'));
assert.strictEqual(leadEvidence.dealFinderGroup(missingPhrase.lead_evidence), 'Research / Reference');

const social = normalize({
  title: 'Dallas cash buyer group',
  snippet: 'We buy houses in Dallas. Investor special deals.',
  url: 'https://www.facebook.com/groups/dallascashbuyers'
});
assert.strictEqual(social.property_specific_source, false);
assert.strictEqual(social.exact_source_phrase, '');
assert.ok(social.evidence_conversion_reason_codes.includes('generic_url_rejected'));
assert.strictEqual(leadEvidence.dealFinderGroup(social.lead_evidence), 'Research / Reference');

const comingSoon = normalize({
  title: 'Coming Soon - 6424 Teague Dr Dallas TX | Realtor',
  snippet: 'Cash only. Investor special.',
  url: 'https://www.realtor.com/realestateandhomes-detail/6424-Teague-Dr_Dallas_TX_75241_M12345',
  possible_address: '6424 Teague Dr, Dallas, TX 75241'
});
assert.strictEqual(comingSoon.status_candidate_seen, true);
assert.ok(/coming soon/i.test(comingSoon.status_candidate_rejected_reason));
assert.strictEqual(comingSoon.exact_source_phrase, '');
assert.strictEqual(leadEvidence.dealFinderGroup(comingSoon.lead_evidence), 'Research / Reference');

const pending = normalize({
  title: 'Pending - 2009 Las Cruces Ln Dallas TX | Redfin',
  snippet: 'Investor special. Cash only.',
  url: 'https://www.redfin.com/TX/Dallas/2009-Las-Cruces-Ln-75217/home/2009',
  possible_address: '2009 Las Cruces Ln, Dallas, TX 75217'
});
assert.strictEqual(pending.status_candidate_seen, true);
assert.ok(/pending/i.test(pending.status_candidate_rejected_reason));
assert.strictEqual(pending.exact_source_phrase, '');
assert.strictEqual(leadEvidence.dealFinderGroup(pending.lead_evidence), 'Research / Reference');

const historical = normalize({
  title: '2912 Warren Ave Dallas TX | Redfin',
  snippet: 'Sold history. Investor special.',
  url: 'https://www.redfin.com/TX/Dallas/2912-Warren-Ave-75215/home/2912',
  possible_address: '2912 Warren Ave, Dallas, TX 75215'
});
assert.strictEqual(historical.status_candidate_seen, true);
assert.ok(/sold|closed|historical/i.test(historical.status_candidate_rejected_reason));
assert.ok(historical.evidence_conversion_reason_codes.includes('status_candidate_rejected_reason'));
assert.strictEqual(leadEvidence.dealFinderGroup(historical.lead_evidence), 'Research / Reference');

assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl('https://www.zillow.com/homedetails/123-Main-St_Dallas_TX_75208/123_zpid/'), true);
assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl('https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345'), true);
assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl('https://www.har.com/homedetail/123-main-st-dallas-tx-75208'), true);
assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl('https://examplebroker.com/listing/123-Main-St-Dallas-TX-75208'), true);
assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl('https://www.zillow.com/dallas-tx/'), false);

const summary = snippetEvidence.summarizeEvidenceConversion([
  validDetail,
  missingStatus,
  missingPhrase,
  social,
  comingSoon,
  pending,
  historical
]);
assert.ok(summary.snippet_phrases_found >= 6);
assert.strictEqual(summary.exact_phrases_promoted, 1);
assert.ok(summary.phrase_candidate_seen >= 6);
assert.ok(summary.status_candidate_seen >= 5);
assert.ok(summary.property_url_but_missing_phrase >= 1);
assert.ok(summary.property_url_but_missing_status >= 1);
assert.ok(summary.exact_property_page_rejected_reason >= 2);
assert.ok(summary.generic_url_rejected >= 1);
assert.ok(summary.source_phrase_dropped >= 5);
assert.ok(summary.missing_property_url >= 1);
assert.ok(summary.missing_status >= 1);

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
    cards: [{
      card_id: 'weak_url_only',
      source_kind: 'gemini_live_discovery',
      provider: 'Gemini',
      address_or_source_text: '7777 Weak Dr, Dallas, TX 75208',
      display_address: '7777 Weak Dr, Dallas, TX 75208',
      city: 'Dallas',
      state: 'TX',
      source_url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX',
      canonical_source_url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX',
      source_title: '7777 Weak Dr | Realtor',
      source_snippet: 'Single family home in Dallas.',
      listing_status: 'Active',
      public_contact_route: 'Public Contact Form',
      missing_evidence: ['exact source-backed wholesale phrase'],
      status: 'Needs Source Proof',
      can_send_to_analyzer: false
    }]
  };
};

(async () => {
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
    wholesale_criteria: ['investor_special', 'cash_only', 'as_is', 'needs_tlc'],
    max_provider_calls: 3
  });
  const before = JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads.length;
  const run = await findMeScoutJobs.runJob(created.job_id, {
    env: { ENABLE_SEARCH_PROVIDER: 'true', SEARCH_PROVIDER: 'mock', SEARCH_PROVIDER_MAX_RESULTS: '10' },
    mock_search_results: [
      {
        title: '10527 Cayuga Dr Dallas TX | Redfin',
        snippet: 'Investor special. Cash only. House for sale.',
        url: propertyDetailUrl,
        possible_address: '10527 Cayuga Dr, Dallas, TX 75228',
        public_contact_route: 'Manual Lookup Needed',
        listing_status: 'Active'
      },
      {
        title: '1200 Quiet Dr Dallas TX | Redfin',
        snippet: 'Needs TLC.',
        url: 'https://www.redfin.com/TX/Dallas/1200-Quiet-Dr-75208/home/1200',
        possible_address: '1200 Quiet Dr, Dallas, TX 75208',
        public_contact_route: 'Manual Lookup Needed'
      },
      {
        title: 'Dallas cash buyer group',
        snippet: 'We buy houses in Dallas. Investor special deals.',
        url: 'https://www.facebook.com/groups/dallascashbuyers'
      }
    ]
  });
  const after = JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads.length;
  assert.strictEqual(after, before);
  assert.strictEqual(run.no_auto_ingestion_status, 'passed');
  assert.strictEqual(run.persist_scope, 'batch_only');
  assert.strictEqual(run.batch_result.no_auto_ingestion_status, 'passed');
  assert.strictEqual(run.batch_result.batch_persisted_scope, 'batch_only');

  const valid = run.cards.find((card) => /10527 Cayuga/i.test(JSON.stringify(card)));
  assert.ok(valid);
  assert.strictEqual(valid.batch_group, 'Valid Leads - Needs Comps');
  assert.strictEqual(valid.lead_evidence.exact_source_phrase_verbatim, true);
  assert.strictEqual(valid.lead_evidence.comp_status, 'Needs Comps');
  assert.strictEqual(valid.lead_evidence.normalized_address, '10527 Cayuga Dr, Dallas, TX 75228');

  const reference = run.cards.find((card) => /1200 Quiet/i.test(JSON.stringify(card)));
  assert.ok(reference);
  assert.strictEqual(reference.batch_group, 'Research / Reference');
  assert.ok(reference.evidence_conversion_reason_codes.includes('property_url_but_missing_status'));

  const fallback = run.cards.find((card) => /Facebook|cash buyer/i.test(JSON.stringify(card)));
  assert.ok(fallback);
  assert.strictEqual(fallback.batch_group, 'Research / Reference');
  assert.ok(fallback.evidence_conversion_reason_codes.includes('generic_url_rejected'));

  assert.ok(run.batch_result.search_results_found >= 3);
  assert.ok(run.batch_result.valid_new_leads >= 1);
  assert.strictEqual(run.batch_result.no_auto_ingestion_status, 'passed');
  assert.strictEqual(run.batch_result.batch_persisted_scope, 'batch_only');

  console.log('search snippet evidence conversion tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
