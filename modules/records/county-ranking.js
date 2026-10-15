'use strict';
const {rulesForState} = require('../research/state-rules');
const {buyerEligible} = require('../research/operational-lead-eligibility');

const METHOD = Object.freeze({population: 30, median_value: 30, disclosure: 15, foreclosure: 10, buyers: 15});
const key = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/ county$/, '') : '';
function positive(value) {return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;}

function parseStateResponse(payload, {stateFips, sourceUrl, retrievedAt}) {
  if (payload?.release?.id !== 'acs2024_5yr') throw Error('county_acs_vintage_mismatch');
  for (const table of ['B01003', 'B25077']) if (!payload.tables?.[table]) throw Error('county_acs_table_missing');
  const rows = [];
  for (const [geoid, data] of Object.entries(payload.data || {})) {
    if (!/^05000US\d{5}$/.test(geoid)) continue;
    const fips = geoid.slice(-5);
    if (!fips.startsWith(stateFips)) throw Error('county_acs_wrong_state');
    if (!payload.geography?.[geoid]?.name) throw Error('county_acs_identity_missing');
    rows.push({fips, acs_population: positive(data.B01003?.estimate?.B01003001),
      median_home_value: positive(data.B25077?.estimate?.B25077001),
      source_url: sourceUrl, table_ids: ['B01003', 'B25077'], acs_vintage: '2024 5-year', retrieved_at: retrievedAt});
  }
  if (!rows.length) throw Error('county_acs_no_counties');
  return rows.sort((a, b) => a.fips.localeCompare(b.fips));
}

function buyerCoverage(counties, buyers) {
  const result = new Map(counties.map(c => [c.fips, 0]));
  if (!Array.isArray(buyers)) return null;
  const seen = new Set();
  for (const buyer of buyers) {
    if (!buyer?.id || seen.has(buyer.id) || !buyerEligible(buyer)) continue;
    seen.add(buyer.id);
    const find = buyer.assistant_find;
    if ((find ? find.approval : buyer.approval) !== 'approved') continue;
    const states = find?.states || buyer.states || (buyer.state ? [buyer.state] : []);
    const areas = [...(find?.areas || []), ...(find?.buy_box?.areas || []), ...(buyer.counties || [])];
    const boxState = find?.buy_box?.state;
    // Only an explicit county name in a stated state establishes county coverage.
    // City, ZIP, statewide and nearby-area inference are deliberately excluded.
    for (const county of counties) {
      if (!(boxState ? [boxState] : states).some(s => key(s) === key(county.state))) continue;
      if (!areas.some(area => key(area) === key(county.name))) continue;
      result.set(county.fips, result.get(county.fips) + 1);
    }
  }
  return result;
}

function rankCatalog(catalog, {buyers, rules = rulesForState} = {}) {
  const coverage = buyerCoverage(catalog.counties, buyers);
  const counties = catalog.counties.map(county => {
    const rule = rules(county.state);
    const population = positive(county.acs_population), value = positive(county.median_home_value);
    const disclosure = rule?.disclosure?.verification_status === 'verified' && rule.disclosure.citation &&
      ['disclosure', 'non_disclosure'].includes(rule.disclosure.status) ? rule.disclosure.status : null;
    const foreclosure = rule?.foreclosure?.citation ? rule.foreclosure.type : null;
    const nonjudicial = ['nonjudicial_trustee_sale', 'power_of_sale', 'foreclosure_by_advertisement'];
    const knownForeclosure = [...nonjudicial, 'judicial'].includes(foreclosure);
    const buyerCount = coverage ? coverage.get(county.fips) : null;
    const parts = {
      population: population == null ? null : population >= 100000 ? 30 : population >= 50000 ? 20 : population >= 25000 ? 10 : 0,
      median_value: value == null ? null : value >= 120000 && value <= 350000 ? 30 : value >= 80000 && value <= 450000 ? 15 : 0,
      disclosure: disclosure == null ? null : disclosure === 'disclosure' ? 15 : 0,
      foreclosure: !knownForeclosure ? null : nonjudicial.includes(foreclosure) ? 10 : 0,
      buyers: buyerCount == null ? null : Math.min(buyerCount, 3) * 5
    };
    const missing = Object.keys(parts).filter(k => parts[k] == null);
    const score = missing.length ? null : Object.values(parts).reduce((a, b) => a + b, 0);
    return {...county, score, rank: null, approved_buyer_count: buyerCount, components: parts, missing_components: missing,
      rule_sources: {disclosure: rule?.disclosure?.citation || null, foreclosure: rule?.foreclosure?.citation || null}};
  });
  counties.sort((a, b) => a.state.localeCompare(b.state) || (a.score == null) - (b.score == null) ||
    (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name) || a.fips.localeCompare(b.fips));
  const ranks = new Map();
  for (const county of counties) if (county.score != null) {const n = (ranks.get(county.state) || 0) + 1; ranks.set(county.state, n); county.rank = n;}
  return {...catalog, ranking_status: 'ACS_WITH_EXPLICIT_UNKNOWN_COMPONENTS', ranking_method: METHOD,
    ranking_reason: 'Market screening only; not lead evidence, comps, property value or offer readiness. Missing inputs remain unranked.', counties};
}
module.exports = {METHOD, parseStateResponse, buyerCoverage, rankCatalog};
