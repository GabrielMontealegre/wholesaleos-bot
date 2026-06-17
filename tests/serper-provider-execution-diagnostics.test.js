'use strict';

const assert = require('assert');

const searchWorker = require('../modules/research/search-provider-worker');

const DUMMY_KEY = 'serper_dummy_secret_value_should_never_leak_123456';
const BASE_ENV = {
  ENABLE_SEARCH_PROVIDER: 'true',
  SEARCH_PROVIDER: 'serper',
  SERPER_API_KEY: DUMMY_KEY,
  SERPER_QUERY_MODE: 'advanced',
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
  assert.ok(!/"headers"\s*:/i.test(text), 'raw request headers must not leak');
}

async function runWithFetch(fetchImpl) {
  return searchWorker.runSearchProvider({
    city: 'Dallas',
    state: 'TX',
    query_group: 'serper_diagnostics_test'
  }, {
    env: Object.assign({}, BASE_ENV),
    query: 'site:redfin.com "Dallas" "TX" "investor special"',
    fetchImpl
  });
}

(async () => {
  let capturedRequest = null;
  const organic = await runWithFetch(async (url, init) => {
    capturedRequest = { url, init };
    return response(200, {
      organic: [{
        title: '2011 Serper Dr, Dallas, TX 75208 | Redfin',
        link: 'https://www.redfin.com/TX/Dallas/2011-Serper-Dr-75208/home/2011',
        snippet: 'Active investor special in Dallas. Cash only, sold as-is.',
        position: 1
      }]
    });
  });

  assert.strictEqual(capturedRequest.url, 'https://google.serper.dev/search');
  assert.strictEqual(capturedRequest.init.method, 'POST');
  assert.strictEqual(capturedRequest.init.headers['Content-Type'], 'application/json');
  assert.strictEqual(capturedRequest.init.headers['X-API-KEY'], DUMMY_KEY);
  assert.deepStrictEqual(JSON.parse(capturedRequest.init.body), {
    q: 'site:redfin.com "Dallas" "TX" "investor special"',
    num: 20
  });
  assert.strictEqual(organic.status, 'provider_available');
  assert.strictEqual(organic.result_count, 1);
  assert.strictEqual(organic.results[0].url, 'https://www.redfin.com/TX/Dallas/2011-Serper-Dr-75208/home/2011');
  assert.strictEqual(organic.results[0].source_domain, 'redfin.com');
  assert.strictEqual(organic.results[0].rank, 1);
  assert.ok(/investor special|cash only|as-is/i.test(organic.results[0].possible_exact_phrase));
  assert.strictEqual(organic.results[0].phrase_provenance, 'search_snippet');
  assert.strictEqual(organic.provider_attempts[0].method, 'POST');
  assert.strictEqual(organic.provider_attempts[0].endpoint_host, 'google.serper.dev');
  assert.strictEqual(organic.provider_attempts[0].http_status, 200);
  assert.strictEqual(organic.provider_attempts[0].response_shape.organic_count, 1);
  assertNoSecret(organic);

  const authFailed = await runWithFetch(async () => response(401, { message: 'Unauthorized' }));
  assert.strictEqual(authFailed.status, 'provider_auth_failed');
  assert.strictEqual(authFailed.provider_attempts[0].http_status, 401);
  assert.ok(/key permissions/i.test(authFailed.next_action));
  assertNoSecret(authFailed);

  const forbidden = await runWithFetch(async () => response(403, { message: 'Forbidden' }));
  assert.strictEqual(forbidden.status, 'provider_auth_failed');
  assert.strictEqual(forbidden.provider_attempts[0].http_status, 403);

  const rateLimited = await runWithFetch(async () => response(429, { message: 'Too many requests' }));
  assert.strictEqual(rateLimited.status, 'provider_rate_limited');
  assert.strictEqual(rateLimited.provider_attempts[0].http_status, 429);
  assert.ok(/quota|batch size/i.test(rateLimited.next_action));

  const timedOut = await runWithFetch(async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  });
  assert.strictEqual(timedOut.status, 'provider_timed_out');
  assert.strictEqual(timedOut.provider_attempts[0].endpoint_host, 'google.serper.dev');
  assert.strictEqual(timedOut.provider_attempts[0].http_status, null);
  assert.ok(/SEARCH_PROVIDER_TIMEOUT_MS/i.test(timedOut.next_action));
  assertNoSecret(timedOut);

  const networkError = await runWithFetch(async () => {
    throw new Error(`connect ECONNRESET ${DUMMY_KEY}`);
  });
  assert.strictEqual(networkError.status, 'provider_network_error');
  assert.strictEqual(networkError.provider_attempts[0].endpoint_host, 'google.serper.dev');
  assertNoSecret(networkError);

  const malformed = await runWithFetch(async () => response(200, 'this is not json'));
  assert.strictEqual(malformed.status, 'provider_bad_response');
  assert.strictEqual(malformed.provider_attempts[0].http_status, 200);
  assert.ok(/malformed JSON/i.test(malformed.warnings[0]));
  assertNoSecret(malformed);

  const noOrganic = await runWithFetch(async () => response(200, { organic: [] }));
  assert.strictEqual(noOrganic.status, 'provider_no_results');
  assert.strictEqual(noOrganic.result_count, 0);
  assert.strictEqual(noOrganic.provider_attempts[0].response_shape.has_organic, true);
  assertNoSecret(noOrganic);

  const unsupportedSerperShape = await runWithFetch(async () => response(200, {
    places: [{ title: 'Dallas investor listings', link: 'https://example.com/search' }]
  }));
  assert.strictEqual(unsupportedSerperShape.status, 'provider_bad_response');
  assert.strictEqual(unsupportedSerperShape.provider_attempts[0].response_shape.has_places, true);
  assertNoSecret(unsupportedSerperShape);

  console.log('serper provider execution diagnostics tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
