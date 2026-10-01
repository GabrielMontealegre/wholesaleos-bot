'use strict';

const assert = require('assert');
const http = require('http');
const https = require('https');

let requests = 0;
const originalFetch = global.fetch;
const originalHttpGet = http.get;
const originalHttpsGet = https.get;
global.fetch = () => { requests++; throw new Error('network forbidden'); };
http.get = https.get = () => { requests++; throw new Error('network forbidden'); };
try {
  const profiles = require('../modules/sources/county-source-profile-registry');
  const priority = require('../modules/sources/dallas-source-priority-router');
  const catalog = require('../modules/sources/source-catalog');
  const adapters = require('../modules/sources/source-adapter-registry');
  const queue = require('../modules/research/deal-board-queue-service');
  const implementation = require('../modules/sources/dallas-foreclosure-acquisition-adapter');
  const profile = profiles.PROFILES.find((item) => item.catalog_group === 'primary');
  const expectedId = 'tx_dallas_county_clerk_foreclosure_notices';
  const expectedUrl = 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php';

  assert.strictEqual(profile.source_id, expectedId);
  assert.strictEqual(profile.source_url, expectedUrl);
  assert.strictEqual(profile.source_kind, 'trustee_sale_notice');
  assert.strictEqual(profile.source_family, 'preforeclosure_trustee_notice');
  assert.deepStrictEqual(profiles.profilesForCountyKind('Dallas', 'TX', 'trustee_sale_notice')
    .filter((item) => item.catalog_group === 'primary'), [profile]);
  assert.deepStrictEqual(profiles.profilesForCountyKind('Ellis', 'TX', 'trustee_sale_notice')
    .filter((item) => item.catalog_group === 'primary'), []);
  assert.strictEqual(profiles.sourceHostAllowed(profile, expectedUrl), true);
  assert.strictEqual(profiles.sourceHostAllowed(profile, 'https://untrusted.example/notice.pdf'), false);

  const planned = priority.DALLAS_SOURCE_PLAN[0];
  const listed = catalog.buildSourceCatalog({ county: 'Dallas', state: 'TX', city: 'Dallas' })
    .find((source) => source.source_id === expectedId);
  const adapter = adapters.adapterForSourceId(expectedId);
  assert.strictEqual(planned.source_id, profile.source_id);
  assert.strictEqual(planned.source_name, profile.source_name);
  assert.strictEqual(planned.source_url, profile.source_url);
  assert.strictEqual(listed.source_url, profile.source_url);
  assert.strictEqual(listed.source_name, profile.source_name);
  assert.strictEqual(listed.preview_only, true);
  assert.strictEqual(listed.should_ingest, false);
  assert.strictEqual(adapter.source_id, profile.source_id);
  assert.strictEqual(adapter.source_name, profile.source_name);
  assert.strictEqual(adapter.source_family, profile.source_family);
  assert.strictEqual(adapter.run, implementation.runDallasForeclosureAcquisitionAdapter);
  assert.strictEqual(queue.DEFAULT_QUEUE_SOURCE_IDS[0], profile.source_id);
  assert.strictEqual(adapters.adapterForSourceId('unconfigured'), null);
  assert.strictEqual(requests, 0);
} finally {
  global.fetch = originalFetch;
  http.get = originalHttpGet;
  https.get = originalHttpsGet;
}

console.log('B-04g primary source profile equivalence passed');
