'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const dataSources = require('./market-demand-data-sources');

const INDEX_PATH = path.resolve(process.env.MARKET_DEMAND_INDEX_PATH || path.join(__dirname, '..', '..', 'data', 'market-demand-index.json'));

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function known(value, source, evidenceDate, extra = {}) {
  return Object.assign({ status: 'KNOWN', value, source, evidence_date: evidenceDate }, extra);
}

function unknown(source, evidenceDate, reason) {
  return { status: 'UNKNOWN', value: null, source, evidence_date: evidenceDate, unknown_reason: reason };
}

function parseCsv(text, delimiter = ',') {
  return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true, delimiter, bom: true, trim: true });
}

function parsePepCountyCsv(text) {
  return parseCsv(text).filter((row) => cleanText(row.SUMLEV) === '050').map((row) => {
    const population2020 = finiteNumber(row.POPESTIMATE2020);
    const population2025 = finiteNumber(row.POPESTIMATE2025);
    return {
      fips: `${cleanText(row.STATE).padStart(2, '0')}${cleanText(row.COUNTY).padStart(3, '0')}`,
      state_name: cleanText(row.STNAME),
      county_name: cleanText(row.CTYNAME),
      population_2020: population2020,
      population_2025: population2025,
      growth_rate: population2020 > 0 && population2025 != null
        ? ((population2025 - population2020) / population2020) * 100
        : null
    };
  });
}

function parseGazetteerText(text) {
  return parseCsv(text, '|').map((row) => ({
    state: cleanText(row.USPS).toUpperCase(),
    geoid: cleanText(row.GEOID),
    name: cleanText(row.NAME),
    land_sq_miles: finiteNumber(row.ALAND_SQMI),
    latitude: finiteNumber(row.INTPTLAT),
    longitude: finiteNumber(row.INTPTLONG)
  }));
}

function parsePepPlaceCsv(text) {
  return parseCsv(text).filter((row) => cleanText(row.SUMLEV) === '162').map((row) => ({
    geoid: `${cleanText(row.STATE).padStart(2, '0')}${cleanText(row.PLACE).padStart(5, '0')}`,
    name: cleanText(row.NAME),
    state_name: cleanText(row.STNAME),
    population_2025: finiteNumber(row.POPESTIMATE2025)
  }));
}

function parseRuccCsv(text) {
  const byFips = {};
  parseCsv(text).forEach((row) => {
    const fips = cleanText(row.FIPS).padStart(5, '0');
    if (!byFips[fips]) byFips[fips] = { fips };
    const attribute = cleanText(row.Attribute);
    if (attribute === 'RUCC_2023') byFips[fips].rucc = finiteNumber(row.Value);
    if (attribute === 'Description') byFips[fips].description = cleanText(row.Value);
  });
  return Object.values(byFips);
}

function parseCbsaRows(rows) {
  const headerIndex = rows.findIndex((row) => Array.isArray(row) && cleanText(row[0]) === 'CBSA Code');
  if (headerIndex < 0) return [];
  return rows.slice(headerIndex + 1).filter((row) => Array.isArray(row) && cleanText(row[0])).map((row) => ({
    cbsa_code: cleanText(row[0]),
    cbsa_title: cleanText(row[3]),
    cbsa_type: cleanText(row[4]),
    fips: `${cleanText(row[9]).padStart(2, '0')}${cleanText(row[10]).padStart(3, '0')}`,
    central_or_outlying: cleanText(row[11])
  }));
}

function radians(value) {
  return Number(value) * Math.PI / 180;
}

function distanceMiles(a, b) {
  const values = [a && a.latitude, a && a.longitude, b && b.latitude, b && b.longitude];
  if (values.some((value) => value == null || value === '' || !Number.isFinite(Number(value)))) return null;
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const deltaLat = radians(Number(b.latitude) - Number(a.latitude));
  const deltaLon = radians(Number(b.longitude) - Number(a.longitude));
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function percentileScores(values) {
  const unique = Array.from(new Set(values.filter(Number.isFinite))).sort((a, b) => a - b);
  const scores = new Map();
  unique.forEach((value, index) => scores.set(value, unique.length === 1 ? 100 : (index / (unique.length - 1)) * 100));
  return scores;
}

function componentScore(component, scoreMap) {
  if (!component || component.status !== 'KNOWN') return null;
  if (Number.isFinite(component.score)) return component.score;
  return scoreMap && scoreMap.has(component.value) ? scoreMap.get(component.value) : null;
}

function scoreCounties(counties, config) {
  const weights = config.weights;
  const maps = {
    population: percentileScores(counties.map((county) => county.components.population.value)),
    growth_rate: percentileScores(counties.map((county) => county.components.growth_rate.value)),
    density: percentileScores(counties.map((county) => county.components.density.value)),
    nearest_major_city_population: percentileScores(counties.map((county) => county.components.nearest_major_city.value && county.components.nearest_major_city.value.population))
  };
  const totalPossibleWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return counties.map((county) => {
    const components = county.components;
    const nearest = components.nearest_major_city;
    if (nearest.status === 'KNOWN') {
      const cityPopulationScore = maps.nearest_major_city_population.get(nearest.value.population) || 0;
      const proximityScore = Math.max(0, 100 - Math.min(200, nearest.value.distance_miles) / 2);
      nearest.score = cityPopulationScore * 0.65 + proximityScore * 0.35;
    }
    if (components.rural_urban.status === 'KNOWN') components.rural_urban.score = config.rucc_scores[components.rural_urban.value.code] || 0;
    const scored = [
      ['population', componentScore(components.population, maps.population)],
      ['growth_rate', componentScore(components.growth_rate, maps.growth_rate)],
      ['density', componentScore(components.density, maps.density)],
      ['nearest_major_city', componentScore(nearest)],
      ['rural_urban', componentScore(components.rural_urban)],
      ['source_readiness', componentScore(components.source_readiness)],
      ['comp_readiness', componentScore(components.comp_readiness)]
    ];
    let knownWeight = 0;
    let weightedScore = 0;
    scored.forEach(([name, score]) => {
      if (!Number.isFinite(score)) return;
      knownWeight += weights[name];
      weightedScore += score * weights[name];
    });
    const unknownCount = Object.values(components).filter((component) => component.status === 'UNKNOWN').length;
    return Object.assign({}, county, {
      demand_score: knownWeight ? Number((weightedScore / knownWeight).toFixed(2)) : null,
      confidence_score: Number(((knownWeight / totalPossibleWeight) * 100).toFixed(2)),
      unknown_component_count: unknownCount
    });
  }).sort((a, b) => {
    if (a.demand_score == null && b.demand_score != null) return 1;
    if (b.demand_score == null && a.demand_score != null) return -1;
    return (b.demand_score || 0) - (a.demand_score || 0) || b.confidence_score - a.confidence_score || a.fips.localeCompare(b.fips);
  }).map((county, index) => Object.assign({}, county, { rank: index + 1 }));
}

function buildMarketDemandIndex(input = {}, options = {}) {
  const sources = options.sources || dataSources.SOURCES;
  const config = options.score_config || dataSources.SCORE_CONFIG;
  const gazetteerByFips = new Map((input.county_gazetteer || []).map((row) => [row.geoid, row]));
  const ruccByFips = new Map((input.rucc || []).map((row) => [row.fips, row]));
  const cbsaByFips = new Map((input.cbsa || []).map((row) => [row.fips, row]));
  const readiness = input.readiness || {};
  const placeGazetteer = new Map((input.place_gazetteer || []).map((row) => [row.geoid, row]));
  const majorCities = (input.place_population || []).filter((row) => row.population_2025 >= config.major_city_min_population).map((row) => {
    const gazetteer = placeGazetteer.get(row.geoid) || {};
    return Object.assign({}, row, {
      state: gazetteer.state,
      latitude: gazetteer.latitude,
      longitude: gazetteer.longitude
    });
  }).filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude));

  const counties = (input.county_population || []).map((population) => {
    const geo = gazetteerByFips.get(population.fips) || {};
    const rucc = ruccByFips.get(population.fips) || {};
    const cbsa = cbsaByFips.get(population.fips) || {};
    const countyReadiness = readiness[dataSources.countyKey(population.county_name.replace(/\s+(County|Parish|Borough|Municipality|Census Area)$/i, ''), geo.state)] || {};
    let nearest = null;
    if (Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude)) {
      majorCities.forEach((city) => {
        const miles = distanceMiles(geo, city);
        if (miles == null || (nearest && miles >= nearest.distance_miles)) return;
        nearest = { name: city.name, state: city.state, population: city.population_2025, distance_miles: Number(miles.toFixed(1)) };
      });
    }
    const populationComponent = population.population_2025 == null
      ? unknown(sources.county_population.label, sources.county_population.evidence_date, 'population_missing_from_source')
      : known(population.population_2025, sources.county_population.label, sources.county_population.evidence_date);
    const growthComponent = population.growth_rate == null
      ? unknown(sources.county_population.label, sources.county_population.evidence_date, 'growth_inputs_missing_from_source')
      : known(Number(population.growth_rate.toFixed(3)), sources.county_population.label, sources.county_population.evidence_date, { period: '2020-2025' });
    const landComponent = geo.land_sq_miles == null
      ? unknown(sources.county_gazetteer.label, sources.county_gazetteer.evidence_date, 'land_area_missing_from_source')
      : known(geo.land_sq_miles, sources.county_gazetteer.label, sources.county_gazetteer.evidence_date);
    const densityValue = population.population_2025 != null && geo.land_sq_miles > 0 ? population.population_2025 / geo.land_sq_miles : null;
    return {
      fips: population.fips,
      county: population.county_name,
      state: geo.state || '',
      state_name: population.state_name,
      components: {
        population: populationComponent,
        growth_rate: growthComponent,
        land_area_sq_miles: landComponent,
        density: densityValue == null
          ? unknown(`${sources.county_population.label} + ${sources.county_gazetteer.label}`, sources.county_population.evidence_date, 'population_or_land_area_missing')
          : known(Number(densityValue.toFixed(2)), `${sources.county_population.label} + ${sources.county_gazetteer.label}`, sources.county_population.evidence_date),
        county_centroid: Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude)
          ? known({ latitude: geo.latitude, longitude: geo.longitude }, sources.county_gazetteer.label, sources.county_gazetteer.evidence_date)
          : unknown(sources.county_gazetteer.label, sources.county_gazetteer.evidence_date, 'centroid_missing_from_source'),
        rural_urban: rucc.rucc == null
          ? unknown(sources.rural_urban.label, sources.rural_urban.evidence_date, 'rucc_missing_from_source')
          : known({ code: rucc.rucc, description: rucc.description }, sources.rural_urban.label, sources.rural_urban.evidence_date),
        cbsa: cbsa.cbsa_code
          ? known({ code: cbsa.cbsa_code, title: cbsa.cbsa_title, type: cbsa.cbsa_type, county_role: cbsa.central_or_outlying }, sources.cbsa.label, sources.cbsa.evidence_date)
          : unknown(sources.cbsa.label, sources.cbsa.evidence_date, 'county_not_in_cbsa_delineation'),
        nearest_major_city: nearest
          ? known(nearest, `${sources.place_population.label} + ${sources.place_gazetteer.label}`, sources.place_population.evidence_date)
          : unknown(`${sources.place_population.label} + ${sources.place_gazetteer.label}`, sources.place_population.evidence_date, 'county_or_major_city_centroid_missing'),
        households: unknown(sources.acs.label, sources.acs.evidence_date, sources.acs.unavailable_reason),
        owner_renter_tenure: unknown(sources.acs.label, sources.acs.evidence_date, sources.acs.unavailable_reason),
        median_home_value: unknown(sources.acs.label, sources.acs.evidence_date, sources.acs.unavailable_reason),
        source_readiness: countyReadiness.source_readiness || unknown('WholesaleOS source catalog', '2026-08-25', 'county_not_yet_verified_for_distress_lane'),
        comp_readiness: countyReadiness.comp_readiness || unknown('WholesaleOS public sales profile registry', '2026-08-25', 'county_not_yet_verified_for_public_sales_layer')
      },
      readiness_evidence: {
        source_ids: countyReadiness.source_ids || [],
        comp_profile_ids: countyReadiness.comp_profile_ids || []
      }
    };
  });

  const ranked = scoreCounties(counties, config);
  return {
    version: 1,
    methodology: 'deterministic_weighted_percentile_known_components_only',
    county_count: ranked.length,
    sources,
    score_config: config,
    counties: ranked,
    preview_only: true,
    not_lead_evidence: true
  };
}

function readMarketDemandIndex(options = {}) {
  const file = path.resolve(options.file_path || INDEX_PATH);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && Array.isArray(parsed.counties) ? parsed : { version: 1, county_count: 0, counties: [], unavailable_reason: 'market_demand_index_invalid' };
  } catch (error) {
    return { version: 1, county_count: 0, counties: [], unavailable_reason: error.code === 'ENOENT' ? 'market_demand_index_not_built' : 'market_demand_index_read_failed' };
  }
}

function publicMarketDemandIndex(options = {}) {
  const index = readMarketDemandIndex(options);
  const limit = Math.max(1, Math.min(Number(options.limit) || 400, 400));
  return Object.assign({}, index, { counties: index.counties.slice(0, limit), returned_count: Math.min(index.counties.length, limit) });
}

module.exports = {
  INDEX_PATH,
  parsePepCountyCsv,
  parseGazetteerText,
  parsePepPlaceCsv,
  parseRuccCsv,
  parseCbsaRows,
  distanceMiles,
  buildMarketDemandIndex,
  readMarketDemandIndex,
  publicMarketDemandIndex
};
