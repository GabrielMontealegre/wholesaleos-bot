'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const profile = require('../modules/sources/county-appraisal-search-profile');
const legacy = require('../modules/sources/dallas-county-free-lookup-profile');
const registry = require('../modules/sources/county-free-lookup-profiles');

const compatibilitySource = fs.readFileSync(path.join(__dirname, '..', 'modules', 'sources',
  'dallas-county-free-lookup-profile.js'), 'utf8').trim();
assert.strictEqual(compatibilitySource, "module.exports = require('./county-appraisal-search-profile');");
assert.strictEqual(legacy, profile, 'the old module path must re-export the same profile');
assert.strictEqual(registry.profileForMarket({ county: 'Dallas', state: 'TX' }), profile);
assert.strictEqual(registry.profileForMarket({ county: 'Other', state: 'TX' }), null);
assert.strictEqual(profile.appraisalLookup.name, 'countyAppraisalLookup');
assert.strictEqual(profile.browserAppraisalSearch.name, 'countyBrowserAppraisalSearch');

(async () => {
  let requests = 0;
  const skipped = await profile.appraisalLookup({}, { fetch_impl: () => { requests += 1; throw new Error('network forbidden'); } });
  assert.strictEqual(skipped.status, 'skipped');
  assert.strictEqual(requests, 0, 'an incomplete address must not start a lookup');

  let clicks = 0;
  const blocked = await profile.browserAppraisalSearch({
    goto: async () => {},
    textContent: async () => 'Access denied - CAPTCHA',
    click: async () => { clicks += 1; throw new Error('blocked page must not be clicked'); }
  }, { street_number: '100', street_name: 'Main', full_address: '100 Main St' });
  assert.strictEqual(blocked.status, 'blocked');
  assert.strictEqual(clicks, 0, 'a blocked source must not be bypassed');
  console.log('county appraisal profile compatibility: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
