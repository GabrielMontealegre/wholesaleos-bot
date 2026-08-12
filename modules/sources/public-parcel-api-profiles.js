'use strict';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

const PROFILES = Object.freeze([
  {
    profile_id: 'tx_bexar_arcgis_parcels',
    market: { city: 'San Antonio', county: 'Bexar', state: 'TX' },
    county: 'Bexar',
    state: 'TX',
    api_kind: 'arcgis',
    service_url: 'https://maps.bexar.org/arcgis/rest/services/Parcels/MapServer',
    layer: 0,
    field_map: {
      owner_name: 'Owner',
      mailing_address: ['AddrLn1', 'AddrLn2', 'AddrLn3', 'AddrCity', 'AddrSt', 'Zip', 'Zip4'],
      situs_address: 'Situs',
      parcel_id: 'PropID',
      sale_price: '',
      sale_date: '',
      land_use: 'PropUse',
      year_built: 'YrBlt',
      assessed_value: 'TotVal'
    },
    disclosure_state: false,
    verified_at: null,
    verification_status: 'unverified_field_map_guess_discovery_timed_out',
    verification_evidence: 'exports/public-parcel-api-discovery/public-parcel-api-discovery-2026-08-11T22-57-27-738Z.json',
    verification_last_outcome: 'failed_source_unreachable',
    record_count: null,
    notes: 'Public ArcGIS parcel candidate for Bexar owner and mailing route; TX sold prices are not disclosure data.'
  },
  {
    profile_id: 'ca_san_diego_arcgis_parcels',
    market: { city: 'San Diego', county: 'San Diego', state: 'CA' },
    county: 'San Diego',
    state: 'CA',
    api_kind: 'arcgis',
    service_url: 'https://webmaps.sandiego.gov/arcgis/rest/services/GeocoderMerged/MapServer',
    layer: 1,
    field_map: {
      owner_name: ['OWN_NAME1', 'OWN_NAME2', 'OWN_NAME3'],
      mailing_address: ['OWN_ADDR1', 'OWN_ADDR2', 'OWN_ADDR3', 'OWN_ADDR4', 'OWN_ZIP'],
      situs_address: 'SITUS_ADDRESS',
      parcel_id: 'APN',
      sale_price: '',
      sale_date: 'DOCDATE',
      land_use: 'NUCLEUS_USE_CD',
      year_built: 'YEAR_EFFECTIVE',
      assessed_value: 'ASR_TOTAL'
    },
    disclosure_state: true,
    verified_at: '2026-08-11',
    record_count: null,
    notes: 'SanGIS public parcel layer exposes owner, mailing, APN, situs, and document date; assessed value is not ARV.'
  },
  {
    profile_id: 'mi_detroit_arcgis_parcels_current',
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    county: 'Wayne',
    state: 'MI',
    api_kind: 'arcgis',
    service_url: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/Parcels_Current/FeatureServer',
    layer: 0,
    field_map: {
      taxpayer_name: 'taxpayer_1',
      taxpayer_name_secondary: 'taxpayer_2',
      taxpayer_mailing_address: ['taxpayer_street', 'taxpayer_city', 'taxpayer_state', 'taxpayer_zip'],
      situs_address: 'address',
      parcel_id: 'parcel_number',
      sale_price: '',
      sale_date: '',
      land_use: 'property_class_desc',
      year_built: 'year_built',
      assessed_value: 'assessed_value',
      zip: 'zip_code'
    },
    disclosure_state: true,
    verified_at: '2026-08-11',
    verification_status: 'verified_public_schema_taxpayer_only_no_owner_field',
    verification_evidence: 'exports/public-parcel-api-discovery/public-parcel-api-discovery-2026-08-11T22-57-27-738Z.json',
    record_count: 380445,
    notes: 'City of Detroit Office of the Assessor parcel layer used for sourced taxpayer-of-record, mailing, parcel, and property-class evidence. It exposes taxpayer fields rather than an owner field; the separate verified sales profile remains the comp source.'
  },
  {
    profile_id: 'mi_detroit_arcgis_property_sales',
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    county: 'Wayne',
    state: 'MI',
    api_kind: 'arcgis',
    service_url: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/assessor_property_sales_view/FeatureServer',
    layer: 0,
    field_map: {
      owner_name: '',
      mailing_address: '',
      situs_address: 'address',
      parcel_id: 'parcel_id',
      sale_price: 'amt_sale_price',
      sale_date: 'sale_date',
      land_use: 'property_class_description',
      year_built: '',
      zip: 'zip_code'
    },
    disclosure_state: true,
    verified_at: '2026-08-11',
    record_count: null,
    notes: 'Detroit public ArcGIS property-sales layer exposes sale price and sale date for verified comp evidence.'
  }
]);

const PUBLIC_SOURCE_GAPS = Object.freeze([
  {
    market: { city: 'San Antonio', county: 'Bexar', state: 'TX' },
    capability: 'owner_and_land_use',
    status: 'unverified_source_unreachable',
    evidence: 'exports/public-parcel-api-discovery/public-parcel-api-discovery-2026-08-11T22-57-27-738Z.json'
  },
  {
    market: { city: 'San Diego', county: 'San Diego', state: 'CA' },
    capability: 'recorded_sales_comps',
    status: 'pending_source_missing_sale_price',
    evidence: 'exports/public-parcel-api-discovery/public-parcel-api-discovery-2026-08-11T22-57-27-738Z.json'
  },
  {
    market: { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
    capability: 'recorded_sales_comps',
    status: 'pending_source_missing_property_location_key',
    evidence: 'exports/public-parcel-api-discovery/public-parcel-api-discovery-2026-08-11T22-57-27-738Z.json'
  }
]);

function marketMatches(profile, market = {}) {
  const state = cleanText(market.state).toUpperCase();
  const haystack = `${cleanText(market.city)} ${cleanText(market.county)}`.toLowerCase();
  return cleanText(profile.state).toUpperCase() === state &&
    haystack.includes(cleanText(profile.county).toLowerCase());
}

function profilesForMarket(market = {}) {
  return PROFILES.filter((profile) => marketMatches(profile, market));
}

function ownerProfilesForMarket(market = {}) {
  return profilesForMarket(market).filter((profile) =>
    cleanText(profile.field_map && profile.field_map.owner_name) ||
    Array.isArray(profile.field_map && profile.field_map.owner_name) ||
    cleanText(profile.field_map && profile.field_map.taxpayer_name) ||
    Array.isArray(profile.field_map && profile.field_map.taxpayer_name));
}

function compProfilesForMarket(market = {}) {
  return profilesForMarket(market).filter((profile) =>
    profile.disclosure_state === true &&
    cleanText(profile.field_map && profile.field_map.sale_price) &&
    cleanText(profile.field_map && profile.field_map.sale_date));
}

module.exports = {
  PROFILES,
  PUBLIC_SOURCE_GAPS,
  profilesForMarket,
  ownerProfilesForMarket,
  compProfilesForMarket
};
