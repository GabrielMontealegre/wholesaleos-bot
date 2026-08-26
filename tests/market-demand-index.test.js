'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const marketDemand = require('../modules/research/market-demand-index');
const dataSources = require('../modules/research/market-demand-data-sources');

const readiness = dataSources.readinessRegistry();
for (const countyKey of ['dallas|TX', 'harris|TX']) {
  assert.strictEqual(readiness[countyKey].source_readiness.status, 'KNOWN');
  assert.strictEqual(readiness[countyKey].source_readiness.value, 'CONFIGURED_PREVIEW_LANE');
  assert.ok(readiness[countyKey].source_ids.length > 0, `${countyKey} must retain configured source proof`);
}

const input = {
  county_population: [
    { fips: '48001', state_name: 'Texas', county_name: 'Alpha County', population_2020: 100000, population_2025: 125000, growth_rate: 25 },
    { fips: '48003', state_name: 'Texas', county_name: 'Beta County', population_2020: 500000, population_2025: 510000, growth_rate: 2 },
    { fips: '48005', state_name: 'Texas', county_name: 'Gamma County', population_2020: 10000, population_2025: 10000, growth_rate: 0 }
  ],
  county_gazetteer: [
    { geoid: '48001', state: 'TX', land_sq_miles: 100, latitude: 30, longitude: -97 },
    { geoid: '48003', state: 'TX', land_sq_miles: 200, latitude: 31, longitude: -98 },
    { geoid: '48005', state: 'TX', land_sq_miles: null, latitude: null, longitude: null }
  ],
  place_population: [{ geoid: '4810000', name: 'Example city', population_2025: 1000000 }],
  place_gazetteer: [{ geoid: '4810000', state: 'TX', latitude: 30.1, longitude: -97.1 }],
  rucc: [
    { fips: '48001', rucc: 1, description: 'Metro' },
    { fips: '48003', rucc: 2, description: 'Metro' },
    { fips: '48005', rucc: 9, description: 'Remote rural' }
  ],
  cbsa: [{ fips: '48001', cbsa_code: '10000', cbsa_title: 'Example, TX', cbsa_type: 'Metropolitan Statistical Area', central_or_outlying: 'Central' }],
  readiness: {
    'alpha|TX': {
      source_ids: ['tx_alpha'], comp_profile_ids: [],
      source_readiness: { status: 'KNOWN', value: 'VERIFIED_CONFIGURED', score: 100, source: 'fixture catalog', evidence_date: '2026-08-25' }
    }
  }
};

const before = JSON.stringify(input);
const first = marketDemand.buildMarketDemandIndex(input);
const second = marketDemand.buildMarketDemandIndex(input);
assert.deepStrictEqual(first, second, 'same source inputs must produce byte-stable ordering and values');
assert.strictEqual(JSON.stringify(input), before, 'ranking must not mutate source inputs');
assert.strictEqual(first.county_count, 3);
assert.strictEqual(first.not_lead_evidence, true);
assert.ok(first.counties.every((county) => Number.isInteger(county.rank)));
assert.ok(first.counties.every((county) => Object.values(county.components).every((component) => component.source && component.evidence_date)));

const gamma = first.counties.find((county) => county.fips === '48005');
assert.strictEqual(gamma.components.source_readiness.status, 'UNKNOWN');
assert.strictEqual(gamma.components.source_readiness.value, null);
assert.strictEqual(gamma.components.source_readiness.unknown_reason, 'county_not_yet_verified_for_distress_lane');
assert.strictEqual(gamma.components.land_area_sq_miles.status, 'UNKNOWN');
assert.strictEqual(gamma.components.land_area_sq_miles.value, null);
assert.strictEqual(gamma.components.density.status, 'UNKNOWN');
assert.strictEqual(gamma.components.density.value, null, 'UNKNOWN density must never become zero');
assert.ok(gamma.confidence_score < first.counties.find((county) => county.fips === '48001').confidence_score);

const leadRow = { queue_key: 'lead-1', normalized_address: '100 Real St', ARV_lock_state: 'ARV_LOCKED_NO_VERIFIED_COMPS' };
const leadBytes = JSON.stringify(leadRow);
marketDemand.buildMarketDemandIndex(input);
assert.strictEqual(JSON.stringify(leadRow), leadBytes, 'market score cannot alter a lead row or ARV state');

const tempFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'market-demand-')), 'index.json');
fs.writeFileSync(tempFile, JSON.stringify(first));
const publicIndex = marketDemand.publicMarketDemandIndex({ file_path: tempFile, limit: 2 });
assert.strictEqual(publicIndex.county_count, 3);
assert.strictEqual(publicIndex.returned_count, 2);
assert.strictEqual(publicIndex.counties.length, 2);
assert.strictEqual(marketDemand.distanceMiles({ latitude: 30, longitude: -97 }, { latitude: null, longitude: null }), null, 'missing coordinates must never be coerced to zero');

console.log(JSON.stringify({ ranks: first.counties.map((county) => [county.fips, county.rank]), unknown_density: gamma.components.density }));
console.log('market demand index tests passed');
