const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const searchWorker = require('../modules/research/search-provider-worker');
const snippetEvidence = require('../modules/research/search-snippet-evidence');

const input = {
  city: 'Dallas',
  state: 'TX',
  criteria: ['investor special', 'cash only', 'fixer', 'as-is', 'needs TLC'],
  source_preferences: ['redfin.com', 'realtor.com', 'zillow.com', 'har.com']
};

const queries = searchWorker.buildPropertyDetailSearchQueries(input);
assert.ok(Array.isArray(queries));
assert.ok(queries.length >= 5);
assert.ok(queries.length <= 6);
assert.strictEqual(queries[0].provider_family, 'redfin');
assert.strictEqual(queries[0].purpose, 'property_detail_first');
assert.ok(/redfin\.com/i.test(queries[0].query));
assert.ok(/home<\/id>|home\/\d+|home/i.test(queries[0].expected_url_pattern));
assert.ok(!/\bOR\b.*\bOR\b/i.test(queries[0].query));
assert.strictEqual(queries[1].provider_family, 'realtor');
assert.strictEqual(queries[2].provider_family, 'zillow');
assert.strictEqual(queries[3].provider_family, 'har');
assert.strictEqual(queries[queries.length - 1].provider_family, 'broad_market');
assert.ok(queries[queries.length - 1].query.includes('real estate'));

const groups = searchWorker.buildProviderQueryGroups(input);
assert.deepStrictEqual(groups.map((item) => item.query), queries.map((item) => item.query));

const ranked = snippetEvidence.rankSearchProviderResults([
  {
    title: 'Dallas Homes for Sale',
    snippet: 'Investor special homes in Dallas.',
    url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX'
  },
  {
    title: '10527 Cayuga Dr | Redfin',
    snippet: 'Active investor special in Dallas.',
    url: 'https://www.redfin.com/TX/Dallas/10527-Cayuga-Dr-75228/home/32490000'
  },
  {
    title: 'Cash buyer blog',
    snippet: 'We buy houses in Dallas.',
    url: 'https://example.com/blog/we-buy-houses-dallas'
  }
]);

assert.ok(/redfin\.com\/TX\/Dallas\/10527-Cayuga-Dr-75228\/home\/32490000/i.test(ranked[0].url));
assert.strictEqual(ranked[0].search_result_quality_bucket, 'property_detail_url');
assert.strictEqual(ranked[1].search_result_quality_bucket, 'broad_source');
assert.ok(snippetEvidence.isBroadSourceResult({
  title: 'Dallas investor special homes',
  snippet: 'Cash buyer blog and social post.',
  url: 'https://www.facebook.com/groups/dallascashbuyers'
}));
assert.strictEqual(snippetEvidence.summarizeSearchResultDemotions(ranked).broad_source >= 2, true);
assert.ok(Object.keys(snippetEvidence.summarizeRejectedUrlClasses(ranked)).length >= 1);

console.log('property-detail query planner tests passed');
