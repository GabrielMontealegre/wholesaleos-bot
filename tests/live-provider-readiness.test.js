'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const searchWorker = require('../modules/research/search-provider-worker');

const managedEnv = [
  'ENABLE_SEARCH_PROVIDER',
  'SEARCH_PROVIDER',
  'SERPER_API_KEY',
  'BRAVE_SEARCH_API_KEY',
  'GOOGLE_CSE_API_KEY',
  'GOOGLE_CSE_CX',
  'SEARCH_PROVIDER_TIMEOUT_MS',
  'SEARCH_PROVIDER_MAX_RESULTS',
  'NODE_ENV',
  'PORT'
];
const originalEnv = {};
managedEnv.forEach((key) => {
  originalEnv[key] = process.env[key];
});

function restoreEnv() {
  managedEnv.forEach((key) => {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  });
}

function clearEnv() {
  managedEnv.forEach((key) => delete process.env[key]);
}

function assertNoSecret(payload, secret) {
  const text = JSON.stringify(payload);
  assert.ok(!text.includes(secret), 'raw secret must not be present');
  assert.ok(!text.includes(secret.slice(0, 8)), 'secret prefix must not be present');
  assert.ok(!text.includes(secret.slice(-8)), 'secret suffix must not be present');
  assert.ok(!/"hash"|hashed|sha1|sha256/i.test(text), 'secret hash markers must not be present');
}

function invokeReadinessRoute(envOverrides) {
  const originalEnv = {};
  const envKeys = ['ENABLE_SEARCH_PROVIDER', 'SEARCH_PROVIDER', 'SERPER_API_KEY', 'BRAVE_SEARCH_API_KEY', 'GOOGLE_CSE_API_KEY', 'GOOGLE_CSE_CX', 'SEARCH_PROVIDER_TIMEOUT_MS', 'SEARCH_PROVIDER_MAX_RESULTS', 'NODE_ENV'];
  envKeys.forEach((key) => { originalEnv[key] = process.env[key]; });
  envKeys.forEach((key) => {
    if (envOverrides && Object.prototype.hasOwnProperty.call(envOverrides, key)) process.env[key] = envOverrides[key];
    else delete process.env[key];
  });

  const headers = {};
  const response = {
    statusCode: 200,
    set(name, value) { headers[String(name).toLowerCase()] = value; return response; },
    status(code) { response.statusCode = code; return response; },
    json(body) { response.body = body; return response; },
    send(body) { response.body = body; return response; },
    end(body) { if (body !== undefined) response.body = body; return response; }
  };
  try {
    response.set('Cache-Control', 'no-store');
    response.json({
      ok: true,
      search_provider_readiness: searchWorker.getLiveSearchProviderReadiness()
    });
    return { headers, response };
  } finally {
    envKeys.forEach((key) => {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    });
  }
}

;(async () => {
try {
  clearEnv();

  let live = searchWorker.getLiveSearchProviderReadiness();
  assert.strictEqual(live.enable_search_provider.present, false);
  assert.strictEqual(live.enable_search_provider.enabled, false);
  assert.strictEqual(live.enable_search_provider.normalized, 'false');
  assert.strictEqual(live.search_provider.present, false);
  assert.strictEqual(live.search_provider.normalized, 'unknown');
  assert.strictEqual(live.readiness, 'not_configured');
  assert.deepStrictEqual(live.missing_config, ['ENABLE_SEARCH_PROVIDER']);
  assert.strictEqual(live.selected_provider_ready, false);

  const secret = 'serper_live_secret_value_should_not_appear';
  process.env.ENABLE_SEARCH_PROVIDER = 'true';
  process.env.SEARCH_PROVIDER = 'Serper';
  process.env.SERPER_API_KEY = secret;
  process.env.SEARCH_PROVIDER_TIMEOUT_MS = '8000';
  process.env.SEARCH_PROVIDER_MAX_RESULTS = '20';
  live = searchWorker.getLiveSearchProviderReadiness();
  assert.strictEqual(live.enable_search_provider.present, true);
  assert.strictEqual(live.enable_search_provider.enabled, true);
  assert.strictEqual(live.enable_search_provider.normalized, 'true');
  assert.strictEqual(live.search_provider.present, true);
  assert.strictEqual(live.search_provider.normalized, 'serper');
  assert.strictEqual(live.keys.serper.present, true);
  assert.strictEqual(live.keys.serper.length_bucket, 'present_expected');
  assert.strictEqual(live.effective.timeout_ms, 8000);
  assert.strictEqual(live.effective.max_results, 20);
  assert.strictEqual(live.readiness, 'ready');
  assert.deepStrictEqual(live.missing_config, []);
  assert.strictEqual(live.selected_provider_ready, true);
  assertNoSecret(live, secret);

  delete process.env.SERPER_API_KEY;
  live = searchWorker.getLiveSearchProviderReadiness();
  assert.strictEqual(live.readiness, 'missing_key');
  assert.ok(live.missing_config.includes('SERPER_API_KEY'));
  assert.strictEqual(live.keys.serper.present, false);
  assert.strictEqual(live.keys.serper.length_bucket, 'missing');

  process.env.ENABLE_SEARCH_PROVIDER = 'false';
  live = searchWorker.getLiveSearchProviderReadiness();
  assert.strictEqual(live.readiness, 'disabled');
  assert.strictEqual(live.selected_provider_ready, false);

  process.env.ENABLE_SEARCH_PROVIDER = 'YES';
  process.env.SEARCH_PROVIDER = 'serpr';
  live = searchWorker.getLiveSearchProviderReadiness();
  assert.strictEqual(live.readiness, 'invalid_provider');
  assert.strictEqual(live.search_provider.normalized, 'unknown');
  assert.ok(live.missing_config.includes('SEARCH_PROVIDER'));

  process.env.SEARCH_PROVIDER = 'google';
  process.env.GOOGLE_CSE_API_KEY = 'google_key_present_long_enough';
  delete process.env.GOOGLE_CSE_CX;
  live = searchWorker.getLiveSearchProviderReadiness();
  assert.strictEqual(live.search_provider.normalized, 'google');
  assert.strictEqual(live.readiness, 'missing_google_cx');
  assert.ok(live.missing_config.includes('GOOGLE_CSE_CX'));

  process.env.SEARCH_PROVIDER = 'SERPER';
  process.env.SERPER_API_KEY = 'another_dummy_serper_key';
  live = searchWorker.getLiveSearchProviderReadiness();
  assert.strictEqual(live.search_provider.normalized, 'serper');
  assert.strictEqual(live.readiness, 'ready');

  const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(serverSource.includes("app.get('/api/provider-readiness'"), 'provider readiness endpoint should exist');
  assert.ok(serverSource.includes('getLiveSearchProviderReadiness()'), 'endpoint should read live provider readiness');
  assert.ok(serverSource.indexOf("app.get('/api/provider-readiness'") < serverSource.indexOf('app.listen(PORT, () => {'), 'provider readiness endpoint should register before app.listen');

  const readyRoute = invokeReadinessRoute({
    ENABLE_SEARCH_PROVIDER: 'true',
    SEARCH_PROVIDER: 'serper',
    SERPER_API_KEY: secret,
    SEARCH_PROVIDER_TIMEOUT_MS: '8000',
    SEARCH_PROVIDER_MAX_RESULTS: '20'
  });
  assert.strictEqual(readyRoute.response.statusCode, 200);
  assert.strictEqual(readyRoute.headers['cache-control'], 'no-store');
  assert.strictEqual(readyRoute.response.body.ok, true);
  assert.strictEqual(readyRoute.response.body.search_provider_readiness.readiness, 'ready');
  assert.strictEqual(readyRoute.response.body.search_provider_readiness.selected_provider_ready, true);
  assert.strictEqual(readyRoute.response.body.search_provider_readiness.search_provider.normalized, 'serper');
  assertNoSecret(readyRoute.response.body, secret);

  const missingKeyRoute = invokeReadinessRoute({
    ENABLE_SEARCH_PROVIDER: 'yes',
    SEARCH_PROVIDER: 'serper'
  });
  assert.strictEqual(missingKeyRoute.response.body.search_provider_readiness.readiness, 'missing_key');
  assert.ok(missingKeyRoute.response.body.search_provider_readiness.missing_config.includes('SERPER_API_KEY'));

  const disabledRoute = invokeReadinessRoute({
    ENABLE_SEARCH_PROVIDER: 'false',
    SEARCH_PROVIDER: 'serper'
  });
  assert.strictEqual(disabledRoute.response.body.search_provider_readiness.readiness, 'disabled');
  assert.strictEqual(disabledRoute.response.body.search_provider_readiness.selected_provider_ready, false);

  const invalidRoute = invokeReadinessRoute({
    ENABLE_SEARCH_PROVIDER: 'true',
    SEARCH_PROVIDER: 'nonsense'
  });
  assert.strictEqual(invalidRoute.response.body.search_provider_readiness.readiness, 'invalid_provider');
  assert.ok(invalidRoute.response.body.search_provider_readiness.missing_config.includes('SEARCH_PROVIDER'));

  const googleRoute = invokeReadinessRoute({
    ENABLE_SEARCH_PROVIDER: 'true',
    SEARCH_PROVIDER: 'google',
    GOOGLE_CSE_API_KEY: 'google_key_present_long_enough'
  });
  assert.strictEqual(googleRoute.response.body.search_provider_readiness.readiness, 'missing_google_cx');
  assert.ok(googleRoute.response.body.search_provider_readiness.missing_config.includes('GOOGLE_CSE_CX'));

  console.log('live provider readiness tests passed');
} finally {
  restoreEnv();
}
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
