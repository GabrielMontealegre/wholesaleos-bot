'use strict';

const existingNoticeProfiles = require('./tx-county-foreclosure-source-profiles');
const taxNoticeProfiles = [
  ...require('./ca-san-diego-tax-default-source-profiles').PROFILES,
  ...require('./ca-los-angeles-tax-default-source-profiles').PROFILES
];
const appraisalProfiles = require('./county-appraisal-profiles').PROFILES;
const publicRecordProfiles = require('./public-parcel-api-profiles').PROFILES;
const publicInventoryProfiles = require('./mi-detroit-land-bank-source-profiles').PROFILES;
const codeCaseAdapter = require('./dallas-code-violations-adapter');

const SALE_DATE_FIELDS = Object.freeze(['sale_date', 'auction_date', 'sale_date_or_event_date', 'date_of_sale', 'trustee_sale_date', 'foreclosure_sale_date']);
const SOURCE_KINDS = Object.freeze(['trustee_sale_notice', 'tax_sale', 'code_case', 'parcel', 'recorded_sale', 'public_inventory']);
const VERIFIED_HOST_ALIASES = Object.freeze({
  tx_ellis_county_foreclosure_notices: Object.freeze(['www.elliscountytx.gov'])
});
const EXTRA_PROFILES = Object.freeze([
  Object.freeze({
    county: 'Dallas', state: 'TX', source_id: 'tx_dallas_county_clerk_foreclosure_notices',
    source_kind: 'trustee_sale_notice', catalog_group: 'primary',
    source_name: 'Dallas County Clerk Foreclosure Notices', market_group: 'dallas',
    hosts: Object.freeze(['dallascounty.org', 'www.dallascounty.org', 'dallas.tx.publicsearch.us']),
    parser_options: Object.freeze({ sale_date_fields: SALE_DATE_FIELDS })
  }),
  Object.freeze({
    county: 'Dallas', state: 'TX', source_id: 'tx_dallas_code_violations_socrata',
    source_kind: 'code_case', hosts: Object.freeze(['www.dallasopendata.com']),
    source_url: codeCaseAdapter.DATASET_URL,
    parser_options: Object.freeze({ api_kind: 'socrata', resource_url: codeCaseAdapter.RESOURCE_URL }),
    verification_status: 'configured_preview'
  })
]);

function allowedHosts(profile) {
  const hosts = profile.official_hosts || profile.hosts || [];
  const result = hosts.map((host) => host.toLowerCase());
  try {
    const source = new URL(profile.source_url);
    const bareHost = source.hostname.toLowerCase().replace(/^www\./, '');
    if (source.protocol === 'https:' && result.includes(bareHost)) result.push(source.hostname.toLowerCase());
  } catch (_) { /* A malformed source URL never widens the allowlist. */ }
  return [...new Set(result.concat(VERIFIED_HOST_ALIASES[profile.source_id] || []))];
}

function hostForUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.hostname.toLowerCase() : '';
  } catch (_) {
    return '';
  }
}

const NOTICE_PROFILES = existingNoticeProfiles.PROFILES.map((profile) => Object.freeze({
  county: profile.county, state: profile.state, source_id: profile.source_id,
  source_kind: 'trustee_sale_notice', catalog_group: 'regional',
  source_name: profile.source_name, market_group: profile.market_group || 'dallas',
  hosts: Object.freeze(allowedHosts(profile)),
  official_hosts: Object.freeze(profile.official_hosts.slice()),
  parser_options: Object.freeze({ sale_date_fields: SALE_DATE_FIELDS }),
  source_url: profile.source_url,
  human_portal_url: profile.human_portal_url
}));
const TAX_PROFILES = taxNoticeProfiles.map((profile) => Object.freeze({
  county: profile.county, state: profile.state, source_id: profile.source_id,
  source_kind: 'tax_sale', evidence_stage: 'notice_only',
  source_name: profile.source_name, source_family: profile.source_family,
  hosts: Object.freeze(allowedHosts(profile)),
  parser_options: Object.freeze({ source_family: profile.source_family }),
  source_url: profile.source_url, document_url: profile.document_url,
  human_portal_url: profile.human_portal_url,
  verification_status: 'configured_preview'
}));
const INVENTORY_PROFILES = publicInventoryProfiles.map((profile) => Object.freeze({
  county: profile.county, state: profile.state, source_id: profile.source_id,
  source_kind: 'public_inventory', evidence_stage: 'listing_only',
  source_name: profile.source_name, source_family: profile.source_family,
  hosts: Object.freeze(allowedHosts(profile)),
  parser_options: Object.freeze({ api_kind: 'public_json_inventory', api_url: profile.api_url }),
  source_url: profile.source_url, human_portal_url: profile.human_portal_url,
  verification_status: 'configured_preview'
}));
const APPRAISAL_PROFILES = appraisalProfiles.map((profile) => Object.freeze({
  county: profile.county, state: profile.state, source_id: `${profile.state.toLowerCase()}_${profile.county.toLowerCase().replace(/\s+/g, '_')}_appraisal_parcels`,
  source_kind: 'parcel',
  hosts: Object.freeze([profile.arcgis_parcel_service.host]),
  parser_options: Object.freeze({ api_kind: 'arcgis', layer: profile.arcgis_parcel_service.layer_id, field_map: profile.arcgis_parcel_service.field_map }),
  source_url: `https://${profile.arcgis_parcel_service.host}${profile.arcgis_parcel_service.service_path}`,
  human_portal_url: profile.portal_search_url, verification_status: profile.verified_at ? 'verified_public_schema' : 'unverified'
}));
const PUBLIC_RECORD_PROFILES = publicRecordProfiles.map((profile) => {
  const fieldMap = profile.field_map || {};
  const recordedSale = Boolean(fieldMap.sale_price && fieldMap.sale_date);
  return Object.freeze({
    county: profile.county, state: profile.state, source_id: profile.profile_id,
    source_kind: recordedSale ? 'recorded_sale' : 'parcel',
    hosts: Object.freeze([hostForUrl(profile.service_url)].filter(Boolean)),
    parser_options: Object.freeze({ api_kind: profile.api_kind, layer: profile.layer, field_map: fieldMap }),
    source_url: profile.service_url, verification_status: profile.verification_status ||
      (profile.verified_at ? 'verified_public_schema' : 'unverified')
  });
});
const PROFILES = Object.freeze([...EXTRA_PROFILES, ...NOTICE_PROFILES, ...TAX_PROFILES,
  ...INVENTORY_PROFILES, ...APPRAISAL_PROFILES, ...PUBLIC_RECORD_PROFILES].map((profile) =>
  Object.freeze({ refresh_cadence: null, ...profile })));

function profileForSourceId(sourceId) {
  return PROFILES.find((profile) => profile.source_id === String(sourceId || '').trim()) || null;
}

function profilesForCountyKind(county, state, sourceKind) {
  return PROFILES.filter((profile) => profile.county.toLowerCase() === String(county || '').trim().toLowerCase() &&
    profile.state === String(state || '').trim().toUpperCase() &&
    (!sourceKind || profile.source_kind === sourceKind));
}

function regionalProfilesForGroup(group) {
  const target = String(group || '').trim().toLowerCase();
  return PROFILES.filter((profile) => profile.catalog_group === 'regional' &&
    (!target || profile.market_group === target));
}

function sourceHostAllowed(profile, sourceUrl) {
  if (!profile) return false;
  try {
    const url = new URL(String(sourceUrl || ''));
    return url.protocol === 'https:' && profile.hosts.includes(url.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

module.exports = { PROFILES, SOURCE_KINDS, SALE_DATE_FIELDS, profileForSourceId,
  profilesForCountyKind, regionalProfilesForGroup, sourceHostAllowed };
