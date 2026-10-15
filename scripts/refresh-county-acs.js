'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {parseStateResponse} = require('../modules/records/county-ranking');

async function refresh({catalog, fetchImpl = global.fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => new Date().toISOString()}) {
  const states = [...new Set(catalog.counties.map(c => c.fips.slice(0, 2)))].sort();
  const rows = [], seen = new Set(); let requests = 0;
  for (const stateFips of states) {
    if (requests) await pause(1000);
    const sourceUrl = 'https://api.censusreporter.org/1.0/data/show/latest?table_ids=B01003,B25077&geo_ids=050%7C04000US' + stateFips;
    const response = await fetchImpl(sourceUrl, {redirect: 'error', signal: AbortSignal.timeout(60000)});
    requests++;
    if (!response.ok) throw Error('county_acs_http_' + response.status + '_state_' + stateFips + '_stopped_after_' + requests + '_requests');
    const parsed = parseStateResponse(await response.json(), {stateFips, sourceUrl, retrievedAt: now()});
    for (const row of parsed) {if (seen.has(row.fips)) throw Error('county_acs_duplicate'); seen.add(row.fips); rows.push(row);}
    console.log(JSON.stringify({state_fips: stateFips, counties: parsed.length, requests}));
  }
  return {schema_version: 1, source: 'Census ACS 2024 (via Census Reporter)', acs_vintage: '2024 5-year', requests, counties: rows};
}
async function main() {
  const root = path.resolve(__dirname, '..');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/county-rankings.json'), 'utf8'));
  if (catalog.states.length !== 51) throw Error('county_acs_requires_51_states');
  const result = await refresh({catalog});
  const file = path.join(root, 'data/county-acs.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(result) + '\n');
  fs.renameSync(file + '.tmp', file);
  console.log(JSON.stringify({requests: result.requests, counties: result.counties.length, saved: 'data/county-acs.json'}));
}
module.exports = {refresh};
if (require.main === module) main().catch(error => {console.error(error.message); process.exitCode = 1;});
