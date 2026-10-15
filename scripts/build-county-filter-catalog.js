'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {parsePepCountyCsv, parseGazetteerText} = require('../modules/research/market-demand-index');

function buildCatalog(population, geography) {
  const byFips = new Map(population.map(row => [row.fips, row]));
  const states = new Map();
  const seen = new Set();
  const counties = geography.flatMap(row => {
    const source = byFips.get(row.geoid);
    if (!source) return [];
    if (!/^[A-Z]{2}$/.test(row.state) || !/^\d{5}$/.test(row.geoid) || seen.has(row.geoid)) throw Error('county_catalog_invalid_identity');
    seen.add(row.geoid);
    states.set(row.state, {code: row.state, name: source.state_name});
    return [{fips: row.geoid, state: row.state, name: row.name,
      acs_population: null, median_home_value: null, rank: null}];
  });
  if (seen.size !== byFips.size) throw Error('county_catalog_incomplete_geography');
  counties.sort((a,b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name) || a.fips.localeCompare(b.fips));
  return {schema_version: 1, purpose: 'Location filtering only; not lead evidence or a valuation',
    ranking_status: 'UNAVAILABLE_MISSING_ACS_DATA',
    ranking_reason: 'ACS population and median home value are not established. Counties are alphabetical, not ranked.',
    geography_vintage: 2025, county_count: counties.length,
    sources: [
      {kind: 'county_identity', url: 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_counties_national.zip', vintage: 2025},
      {kind: 'state_identity_and_coverage_crosscheck', url: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv', vintage: 2025}
    ],
    states: Array.from(states.values()).sort((a,b) => a.name.localeCompare(b.name)), counties};
}
function main(args) {
  const sourceDir = path.resolve(args[0] || path.join(__dirname, '../.cache/market-demand-source'));
  const output = path.resolve(args[1] || path.join(__dirname, '../data/county-rankings.json'));
  const bundledOutput = path.resolve(args[2] || path.join(__dirname, '../modules/records/county-filter-directory.json'));
  const catalog = buildCatalog(parsePepCountyCsv(fs.readFileSync(path.join(sourceDir, 'co-est2025-alldata.csv'), 'utf8')),
    parseGazetteerText(fs.readFileSync(path.join(sourceDir, 'counties/2025_Gaz_counties_national.txt'), 'utf8')));
  if (catalog.states.length !== 51 || !catalog.states.some(state => state.code === 'DC')) throw Error('county_catalog_requires_50_states_and_dc');
  const bytes = JSON.stringify(catalog) + '\n';
  fs.writeFileSync(output, bytes);
  fs.writeFileSync(bundledOutput, bytes);
  console.log(JSON.stringify({states: catalog.states.length, counties: catalog.county_count, ranking_status: catalog.ranking_status}));
}
module.exports = {buildCatalog};
if (require.main === module) main(process.argv.slice(2));
