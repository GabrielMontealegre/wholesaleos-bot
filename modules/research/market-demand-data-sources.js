'use strict';

const sourceCatalog = require('../sources/source-catalog');
const parcelProfiles = require('../sources/public-parcel-api-profiles');

const SOURCES = Object.freeze({
  county_population: {
    id: 'census_pep_county_2025',
    label: 'U.S. Census 2025 County Population Estimates',
    url: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv',
    evidence_date: '2025-07-01'
  },
  place_population: {
    id: 'census_pep_places_2025',
    label: 'U.S. Census 2025 City and Town Population Estimates',
    url: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/cities/totals/sub-est2025.csv',
    evidence_date: '2025-07-01'
  },
  county_gazetteer: {
    id: 'census_gazetteer_counties_2025',
    label: 'U.S. Census 2025 County Gazetteer',
    url: 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_counties_national.zip',
    evidence_date: '2025-01-01'
  },
  place_gazetteer: {
    id: 'census_gazetteer_places_2025',
    label: 'U.S. Census 2025 Place Gazetteer',
    url: 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip',
    evidence_date: '2025-01-01'
  },
  cbsa: {
    id: 'omb_cbsa_delineation_2023',
    label: 'OMB July 2023 CBSA Delineation',
    url: 'https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx',
    evidence_date: '2023-07-01'
  },
  rural_urban: {
    id: 'usda_ers_rucc_2023',
    label: 'USDA ERS 2023 Rural-Urban Continuum Codes',
    url: 'https://www.ers.usda.gov/media/5768/2023-rural-urban-continuum-codes.csv?v=20949',
    evidence_date: '2024-01-22'
  },
  acs: {
    id: 'census_acs5_2024',
    label: 'U.S. Census 2024 ACS 5-year',
    url: 'https://api.census.gov/data/2024/acs/acs5.html',
    evidence_date: '2024-12-31',
    unavailable_reason: 'blocked_missing_census_api_key'
  }
});

const SCORE_CONFIG = Object.freeze({
  major_city_min_population: 250000,
  weights: Object.freeze({
    population: 23,
    growth_rate: 18,
    density: 15,
    nearest_major_city: 15,
    rural_urban: 10,
    source_readiness: 12,
    comp_readiness: 7
  }),
  rucc_scores: Object.freeze({ 1: 100, 2: 90, 3: 80, 4: 68, 5: 58, 6: 50, 7: 40, 8: 30, 9: 20 })
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function key(county, state) {
  return `${cleanText(county).toLowerCase()}|${cleanText(state).toUpperCase()}`;
}

function readinessRegistry() {
  const registry = {};
  function markConfiguredCounty(county, state, sources) {
    const configuredSources = (sources || []).filter((source) => cleanText(source && source.source_id));
    if (!configuredSources.length) return;
    const countyKey = key(county, state);
    if (!registry[countyKey]) registry[countyKey] = { source_ids: [], comp_profile_ids: [] };
    registry[countyKey].source_ids.push(...configuredSources.map((source) => source.source_id));
    registry[countyKey].source_readiness = {
      status: 'KNOWN',
      value: 'CONFIGURED_PREVIEW_LANE',
      score: 60,
      source: 'WholesaleOS source catalog',
      evidence_date: '2026-08-25'
    };
  }

  const groups = [
    ['TX', sourceCatalog.SECONDARY_DALLAS_SOURCES],
    ['TX', sourceCatalog.DFW_COUNTY_SOURCES],
    ['TX', sourceCatalog.HOUSTON_COUNTY_SOURCES],
    ['TX', sourceCatalog.SAN_ANTONIO_COUNTY_SOURCES],
    ['TX', sourceCatalog.AUSTIN_COUNTY_SOURCES],
    ['MI', sourceCatalog.DETROIT_LAND_BANK_SOURCES],
    ['CA', sourceCatalog.CA_SAN_DIEGO_TAX_DEFAULT_SOURCES],
    ['CA', sourceCatalog.LOS_ANGELES_TAX_DEFAULT_SOURCES]
  ];
  groups.forEach(([state, sources]) => {
    (sources || []).forEach((source) => {
      if (cleanText(source.county)) markConfiguredCounty(source.county, state, [source]);
    });
  });

  // These catalogs represent metro market routing even when their individual
  // sources are not stamped with the anchor county.
  markConfiguredCounty('Dallas', 'TX', sourceCatalog.SECONDARY_DALLAS_SOURCES);
  markConfiguredCounty('Harris', 'TX', sourceCatalog.HOUSTON_COUNTY_SOURCES);

  parcelProfiles.PROFILES.forEach((profile) => {
    const countyKey = key(profile.county, profile.state);
    if (!registry[countyKey]) registry[countyKey] = { source_ids: [], comp_profile_ids: [] };
    const map = profile.field_map || {};
    if (profile.verified_at && cleanText(map.sale_price) && cleanText(map.sale_date)) {
      registry[countyKey].comp_profile_ids.push(profile.profile_id);
      registry[countyKey].comp_readiness = {
        status: 'KNOWN',
        value: 'VERIFIED_PUBLIC_SALES_LAYER',
        score: 100,
        source: cleanText(profile.verification_evidence || profile.service_url),
        evidence_date: cleanText(profile.verified_at)
      };
    }
  });

  parcelProfiles.PUBLIC_SOURCE_GAPS.forEach((gap) => {
    if (gap.capability !== 'recorded_sales_comps') return;
    const countyKey = key(gap.market && gap.market.county, gap.market && gap.market.state);
    if (!registry[countyKey]) registry[countyKey] = { source_ids: [], comp_profile_ids: [] };
    if (!registry[countyKey].comp_readiness) {
      registry[countyKey].comp_readiness = {
        status: 'KNOWN',
        value: cleanText(gap.status).toUpperCase(),
        score: 0,
        source: cleanText(gap.evidence),
        evidence_date: '2026-08-11'
      };
    }
  });

  Object.values(registry).forEach((entry) => {
    entry.source_ids = Array.from(new Set(entry.source_ids)).sort();
    entry.comp_profile_ids = Array.from(new Set(entry.comp_profile_ids)).sort();
  });
  return registry;
}

module.exports = {
  SOURCES,
  SCORE_CONFIG,
  readinessRegistry,
  countyKey: key
};
