'use strict';

const assert = require('assert');

const searchWorker = require('../modules/research/search-provider-worker');

const DUMMY_KEY = 'serper_dummy_secret_value_should_never_leak_abcdef';
const BASE_ENV = {
  ENABLE_SEARCH_PROVIDER: 'true',
  SEARCH_PROVIDER: 'serper',
  SERPER_API_KEY: DUMMY_KEY,
  SEARCH_PROVIDER_TIMEOUT_MS: '8000',
  SEARCH_PROVIDER_MAX_RESULTS: '20'
};

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload)
  };
}

function assertNoSecret(payload) {
  const text = JSON.stringify(payload);
  assert.ok(!text.includes(DUMMY_KEY), 'raw key must not leak');
  assert.ok(!text.includes(DUMMY_KEY.slice(0, 10)), 'key prefix must not leak');
  assert.ok(!text.includes(DUMMY_KEY.slice(-10)), 'key suffix must not leak');
  assert.ok(!/X-API-KEY|Authorization|Bearer/i.test(text), 'secret header names must not leak');
  assert.ok(!/"headers"\s*:/i.test(text), 'raw headers must not leak');
}

function bodyQuery(requests, index) {
  return JSON.parse(requests[index].init.body).q;
}

async function run(query, env, fetchImpl) {
  return searchWorker.runSearchProvider({
    city: 'Dallas',
    state: 'TX',
    query_group: 'serper_free_query_test'
  }, {
    env: Object.assign({}, BASE_ENV, env || {}),
    query,
    fetchImpl
  });
}

(async () => {
  assert.strictEqual(
    searchWorker.sanitizeSerperFreeQuery('site:redfin.com/TX/Dallas "investor special"', { city: 'Dallas', state: 'TX' }),
    'Dallas TX Redfin investor special house for sale'
  );
  assert.strictEqual(
    searchWorker.sanitizeSerperFreeQuery('site:realtor.com/realestateandhomes-detail Dallas TX "cash only"', { city: 'Dallas', state: 'TX' }),
    'Dallas TX Realtor cash only house for sale'
  );
  assert.strictEqual(
    searchWorker.sanitizeSerperFreeQuery('site:zillow.com/homedetails Dallas TX "fixer"', { city: 'Dallas', state: 'TX' }),
    'Dallas TX Zillow fixer house for sale'
  );
  assert.strictEqual(
    searchWorker.sanitizeSerperFreeQuery('site:har.com/homedetail Dallas TX "price reduced"', { city: 'Dallas', state: 'TX' }),
    'Dallas TX HAR price reduced house for sale'
  );

  const stripped = searchWorker.sanitizeSerperFreeQuery('site:redfin.com "cash only" AND (fixer OR as-is) +Dallas -sold', { city: 'Dallas', state: 'TX' });
  assert.ok(!/site:|["'()]|\bAND\b|\bOR\b|(^|\s)[+-](?=\S)/i.test(stripped), 'free query should remove advanced operators');
  assert.ok(/Dallas TX Redfin/i.test(stripped));
  assert.ok(/cash only/i.test(stripped));

  const freeRequests = [];
  const freeDefault = await run('site:redfin.com/TX/Dallas "investor special"', {}, async (url, init) => {
    freeRequests.push({ url, init });
    return response(200, {
      organic: [{
        title: '2012 Free Mode Dr, Dallas, TX 75208 | Redfin',
        link: 'https://www.redfin.com/TX/Dallas/2012-Free-Mode-Dr-75208/home/2012',
        snippet: 'Active investor special in Dallas. Cash only.',
        position: 1
      }]
    });
  });
  assert.strictEqual(freeDefault.status, 'provider_available');
  assert.strictEqual(bodyQuery(freeRequests, 0), 'Dallas TX Redfin investor special house for sale');
  assert.strictEqual(freeDefault.provider_attempts[0].query_mode, 'free');
  assert.strictEqual(freeDefault.provider_attempts[0].sanitized_query, 'Dallas TX Redfin investor special house for sale');
  assert.strictEqual(freeDefault.provider_attempts[0].retry_used, false);
  assertNoSecret(freeDefault);

  const advancedRequests = [];
  const advanced = await run('site:redfin.com/TX/Dallas "investor special"', { SERPER_QUERY_MODE: 'advanced' }, async (url, init) => {
    advancedRequests.push({ url, init });
    return response(200, { organic: [] });
  });
  assert.strictEqual(advanced.status, 'provider_no_results');
  assert.strictEqual(bodyQuery(advancedRequests, 0), 'site:redfin.com/TX/Dallas "investor special"');
  assert.strictEqual(advanced.provider_attempts[0].query_mode, 'advanced');

  const retryRequests = [];
  const retrySuccess = await run('site:redfin.com/TX/Dallas "investor special"', { SERPER_QUERY_MODE: 'advanced' }, async (url, init) => {
    retryRequests.push({ url, init });
    if (retryRequests.length === 1) return response(400, { message: 'Query pattern not allowed for free accounts.', statusCode: 400 });
    return response(200, {
      organic: [{
        title: '2013 Retry Dr, Dallas, TX 75208 | Redfin',
        link: 'https://www.redfin.com/TX/Dallas/2013-Retry-Dr-75208/home/2013',
        snippet: 'Active cash only investor special.',
        position: 1
      }]
    });
  });
  assert.strictEqual(retrySuccess.status, 'provider_available');
  assert.strictEqual(retryRequests.length, 2);
  assert.strictEqual(bodyQuery(retryRequests, 0), 'site:redfin.com/TX/Dallas "investor special"');
  assert.strictEqual(bodyQuery(retryRequests, 1), 'Dallas TX Redfin investor special house for sale');
  assert.strictEqual(retrySuccess.provider_attempts[0].query_pattern_rejected, true);
  assert.strictEqual(retrySuccess.provider_attempts[0].retry_used, true);
  assert.strictEqual(retrySuccess.provider_attempts[0].retry_reason, 'query_pattern_not_allowed');
  assert.strictEqual(retrySuccess.provider_attempts[0].final_http_status, 200);
  assert.strictEqual(retrySuccess.provider_attempts[0].organic_count, 1);
  assert.strictEqual(retrySuccess.result_count, 1);
  assertNoSecret(retrySuccess);

  const retryFailRequests = [];
  const retryFail = await run('site:redfin.com/TX/Dallas "investor special"', { SERPER_QUERY_MODE: 'advanced' }, async (url, init) => {
    retryFailRequests.push({ url, init });
    return response(400, { message: 'Query pattern not allowed for free accounts.', statusCode: 400 });
  });
  assert.strictEqual(retryFail.status, 'provider_query_not_allowed');
  assert.strictEqual(retryFailRequests.length, 2);
  assert.strictEqual(retryFail.provider_attempts[0].retry_used, true);
  assert.strictEqual(retryFail.provider_attempts[0].query_pattern_rejected, true);
  assert.strictEqual(retryFail.provider_attempts[0].final_error_category, 'provider_query_not_allowed');
  assertNoSecret(retryFail);

  console.log('serper free query mode tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
