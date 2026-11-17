'use strict';

// B-23 (D-066): generic public distress list source kinds and one profile per source.
// Profiles are data, built from docs/knowledge/county-source-specs-2026-11-09.json.
// No county or state behavior lives in code here (D-013, D-019); it lives in the spec rows.
// Pure: no network, no clock, no writes.

const specs = require('../../docs/knowledge/county-source-specs-2026-11-09.json');

const DISTRESS_SOURCE_KINDS = Object.freeze([
  'foreclosure_notice', 'trustee_sale', 'tax_sale', 'tax_delinquent',
  'lis_pendens', 'probate', 'code_case', 'land_bank'
]);
// D-053 named the trustee list kind `trustee_sale_list`; it is the same generic kind.
const SOURCE_KIND_ALIASES = Object.freeze({ trustee_sale_list: 'trustee_sale' });

// One generic reader per format. Formats with no reader stay manual until one exists.
const READER_FOR_FORMAT = Object.freeze({
  csv: 'csv', xlsx: 'xlsx', arcgis_layer: 'arcgis_json', socrata_api: 'socrata_json',
  json_api: 'json_rows', html_list: 'html_table', html_search: 'html_table', pdf: 'pdf_text'
});

// Hosts shared by many publishers. Allowlisting the host alone would admit every tenant,
// so a URL on one of these hosts must also start with the profile's own URL path.
const SHARED_HOSTS = Object.freeze([
  'services.arcgis.com', 'services1.arcgis.com', 'services2.arcgis.com', 'services3.arcgis.com',
  'services5.arcgis.com', 'services6.arcgis.com', 'services7.arcgis.com', 'services8.arcgis.com',
  'services9.arcgis.com', 'scgpublic.s3.amazonaws.com', 'opendata.arcgis.com'
]);

// The first profiles B-23 ships, in the backlog's order. Ids come from the spec file.
const FIRST_PROFILE_IDS = Object.freeze([
  'nc_mecklenburg_tax_sale_meckags_mecklenburgcountync_gov',
  'tx_dallas_foreclosure_notice_dallas_tx_publicsearch_us',
  'tx_tarrant_foreclosure_notice_tarrant_tx_publicsearch_us',
  'tx_dallas_lis_pendens_dallas_tx_publicsearch_us',
  'tx_collin_lis_pendens_collin_tx_publicsearch_us',
  'tx_denton_lis_pendens_denton_tx_publicsearch_us',
  'tx_bexar_lis_pendens_bexar_tx_publicsearch_us',
  'tx_bexar_foreclosure_notice_www_bexar_org',
  'ga_dekalb_tax_sale_publicaccess_dekalbtaxga_gov',
  'ga_douglas_tax_delinquent_www_douglastax_org',
  'nc_guilford_tax_sale_gcgis_guilfordcountync_gov',
  'nc_mecklenburg_code_case_gis_charlottenc_gov',
  'tx_ellis_foreclosure_notice_www_elliscountytx_gov',
  'tx_kaufman_foreclosure_notice_www_kaufmancounty_net',
  'tx_bexar_code_case_data_sanantonio_gov',
  'tx_travis_code_case_data_austintexas_gov',
  'nc_rowan_tax_delinquent_www_rowancountync_gov',
  'tn_shelby_tax_sale_scgpublic_s3_amazonaws_com',
  'tn_davidson_code_case_services2_arcgis_com'
]);

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function canonicalDistressKind(kind) {
  const value = clean(kind).toLowerCase();
  const mapped = SOURCE_KIND_ALIASES[value] || value;
  return DISTRESS_SOURCE_KINDS.includes(mapped) ? mapped : '';
}

function httpsUrl(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' ? url : null;
  } catch (_) {
    return null;
  }
}

// Why a source is not run automatically. Empty string means the importer may run it.
function manualReason(spec, url, reader) {
  if (spec.access === 'login') return 'Needs a login. Operator only.';
  if (spec.access === 'captcha') return 'Shows a CAPTCHA. Operator only.';
  if (spec.access === 'forbidden') return 'Terms forbid automation or the host refused automated requests.';
  if (spec.access !== 'open') return 'Access not confirmed.';
  if (spec.automatable !== true) return 'Not confirmed as a stable machine-readable list.';
  if (!url) return 'Source address is not https.';
  if (!reader) return 'No generic reader for this format yet.';
  return '';
}

function buildProfile(spec) {
  const sourceKind = canonicalDistressKind(spec.source_kind);
  const url = httpsUrl(spec.url);
  const host = clean(spec.allowlisted_host).toLowerCase();
  const reader = READER_FOR_FORMAT[clean(spec.format)] || '';
  const hostMatches = Boolean(url && host && url.hostname.toLowerCase() === host);
  const reason = !sourceKind ? 'Unknown source kind.'
    : !hostMatches ? 'Source address is not on its allowlisted host.'
      : manualReason(spec, url, reader);
  return Object.freeze({
    source_id: clean(spec.source_id),
    county: clean(spec.county),
    state: clean(spec.state).toUpperCase(),
    source_kind: sourceKind,
    source_name: clean(spec.source_name),
    source_url: url ? url.href : '',
    format: clean(spec.format),
    reader,
    hosts: Object.freeze(host ? [host] : []),
    shared_host: SHARED_HOSTS.includes(host),
    access: clean(spec.access),
    expected_fields: Object.freeze((Array.isArray(spec.fields) ? spec.fields : []).map(clean).filter(Boolean)),
    refresh_cadence: clean(spec.update_cadence) || null,
    sample_checked_at: clean(spec.sample_checked_at) || null,
    runnable: reason === '',
    manual_reason: reason
  });
}

const PROFILES = Object.freeze((specs.sources || []).map(buildProfile));

function profileForSourceId(sourceId) {
  const id = clean(sourceId);
  return PROFILES.find((profile) => profile.source_id === id) || null;
}

function firstProfiles() {
  return FIRST_PROFILE_IDS.map(profileForSourceId).filter(Boolean);
}

// A URL may be fetched for a profile only when it is https, on the profile's allowlisted
// host and, for shared hosts, under the profile's own path.
function urlAllowedForProfile(profile, value) {
  if (!profile) return false;
  const url = httpsUrl(value);
  if (!url || !profile.hosts.includes(url.hostname.toLowerCase())) return false;
  if (!profile.shared_host) return true;
  const base = httpsUrl(profile.source_url);
  if (!base) return false;
  if (url.pathname === base.pathname) return true;
  const prefix = base.pathname.replace(/\/[^/]*$/, '/');
  return prefix.length > 1 && url.pathname.startsWith(prefix);
}

module.exports = {
  DISTRESS_SOURCE_KINDS, SOURCE_KIND_ALIASES, READER_FOR_FORMAT, SHARED_HOSTS, FIRST_PROFILE_IDS,
  PROFILES, buildProfile, canonicalDistressKind, profileForSourceId, firstProfiles, urlAllowedForProfile
};
