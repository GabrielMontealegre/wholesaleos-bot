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

function normalize(result) {
  return snippetEvidence.normalizeSearchResult(result, {
    provider: 'mock',
    query: 'Dallas investor special cash only',
    city: 'Dallas',
    county: 'Dallas County',
    state: 'TX'
  });
}

const redfinUrl = 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32490000';
const redfin = normalize({
  title: 'Investor Special - 10527 Cayuga Dr Dallas TX | Redfin',
  snippet: 'Cash only. House for sale.',
  url: redfinUrl
});
assert.strictEqual(redfin.address, '10527 Cayuga Dr, Dallas, TX 75228');
assert.strictEqual(redfin.possible_exact_phrase, 'Investor Special - 10527 Cayuga Dr Dallas TX | Redfin');
assert.strictEqual(redfin.exact_source_phrase_candidate, redfin.possible_exact_phrase);
assert.strictEqual(redfin.exact_source_phrase_verbatim_candidate, true);
assert.strictEqual(redfin.phrase_provenance, 'search_title');
assert.strictEqual(redfin.exact_source_phrase_verbatim, true);
assert.strictEqual(redfin.listing_status, 'plausibly_current_from_search_snippet');

const missingStatus = normalize({
  title: '1200 Quiet Dr Dallas TX',
  snippet: 'Needs TLC.',
  url: 'https://www.redfin.com/TX/Dallas/1200-Quiet-Dr-75208/home/1200'
});
assert.strictEqual(missingStatus.exact_source_phrase, '');
assert.strictEqual(missingStatus.lead_evidence.exact_source_phrase, '');
assert.ok(missingStatus.evidence_conversion_reason_codes.includes('phrase_verified_but_missing_status'));
assert.ok(missingStatus.evidence_conversion_reason_codes.includes('source_phrase_dropped'));

const missingAddress = normalize({
  title: 'Mystery investor special | Redfin',
  snippet: 'Active cash only house for sale.',
  url: 'https://www.redfin.com/TX/Dallas/home/777'
});
assert.strictEqual(missingAddress.exact_source_phrase, '');
assert.ok(missingAddress.evidence_conversion_reason_codes.includes('phrase_verified_but_missing_address'));

const queryOnly = normalize({
  title: 'Single family home in Dallas',
  snippet: 'Three bedroom home on quiet street.',
  url: 'https://www.redfin.com/TX/Dallas/1220-Query-Dr-75208/home/1220'
});
assert.strictEqual(queryOnly.exact_source_phrase_candidate, '');
assert.strictEqual(queryOnly.exact_source_phrase, '');

const generic = normalize({
  title: 'Dallas homes for sale',
  snippet: 'Investor special homes in Dallas.',
  url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX'
});
assert.strictEqual(generic.property_specific_source, false);
assert.strictEqual(generic.exact_source_phrase, '');
assert.ok(generic.evidence_conversion_reason_codes.includes('generic_url_rejected'));

assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl('https://www.zillow.com/homedetails/123-Main-St_Dallas_TX_75208/123_zpid/'), true);
assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl('https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345'), true);
assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl('https://www.har.com/homedetail/123-main-st-dallas-tx-75208'), true);
assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl('https://examplebroker.com/listing/123-Main-St-Dallas-TX-75208'), true);
assert.strictEqual(snippetEvidence.isPropertySpecificSearchUrl('https://www.zillow.com/dallas-tx/'), false);

const summary = snippetEvidence.summarizeEvidenceConversion([redfin, missingStatus, missingAddress, generic]);
assert.strictEqual(summary.snippet_phrases_found, 4);
assert.strictEqual(summary.exact_phrases_promoted, 1);
assert.ok(summary.source_phrase_dropped >= 3);
assert.ok(summary.missing_address >= 1);
assert.ok(summary.missing_status >= 1);
assert.ok(summary.missing_property_url >= 1);

geminiProvider.runGeminiScoutDiscovery = async function mockWeakGemini() {
  return {
    status: 'available',
    attempted: true,
    provider: 'Gemini',
    message: 'Mock weak Gemini output.',
    source_urls_found_count: 1,
    candidates_found: 1,
    url_only_candidate_count: 1,
    exact_phrases_verified: 0,
    cards: [{
      card_id: 'weak',
      source_url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX',
      display_address: 'Dallas search results',
      source_kind: 'gemini_live_discovery'
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
    wholesale_criteria: ['investor_special', 'cash_only', 'as_is']
  });
  const before = JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads.length;
  const run = await findMeScoutJobs.runJob(created.job_id, {
    env: { ENABLE_SEARCH_PROVIDER: 'true', SEARCH_PROVIDER: 'mock', SEARCH_PROVIDER_MAX_RESULTS: '10' },
    mock_search_results: [{
      title: '2012 Atlas Dr, Dallas, TX 75208 | Redfin',
      snippet: 'Investor special. Cash only. House for sale.',
      url: 'https://www.redfin.com/TX/Dallas/2012-Atlas-Dr-75208/home/2012',
      public_contact_route: 'Manual Lookup Needed'
    }, {
      title: '2013 Atlas Dr Dallas TX',
      snippet: 'Needs TLC.',
      url: 'https://www.redfin.com/TX/Dallas/2013-Atlas-Dr-75208/home/2013',
      public_contact_route: 'Manual Lookup Needed'
    }]
  });
  const after = JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads.length;
  assert.strictEqual(after, before);
  const valid = run.cards.find((card) => /2012 Atlas/i.test(JSON.stringify(card)));
  assert.ok(valid);
  assert.strictEqual(valid.batch_group, 'Valid Leads - Needs Comps');
  assert.strictEqual(valid.lead_evidence.exact_source_phrase_verbatim, true);
  assert.strictEqual(valid.lead_evidence.comp_status, 'Needs Comps');
  const reference = run.cards.find((card) => /2013 Atlas/i.test(JSON.stringify(card)));
  assert.ok(reference);
  assert.strictEqual(reference.batch_group, 'Research / Reference');
  assert.ok(reference.evidence_conversion_reason_codes.includes('phrase_verified_but_missing_status'));
  assert.ok(run.provider_summary.evidence_conversion_diagnostics.source_phrase_dropped >= 1);
  assert.ok(run.source_summary.evidence_conversion_diagnostics.exact_phrases_promoted >= 1);
  assert.strictEqual(run.no_auto_ingestion_status, 'passed');
  console.log('search snippet evidence conversion tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
