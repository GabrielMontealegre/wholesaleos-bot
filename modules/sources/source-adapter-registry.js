'use strict';

const dallasForeclosureAcquisitionAdapter = require('./dallas-foreclosure-acquisition-adapter');
const dallasFsboContactAcquisitionAdapter = require('./dallas-fsbo-contact-acquisition-adapter');
const dallasCraigslistOwnerAcquisitionAdapter = require('./dallas-craigslist-owner-acquisition-adapter');
const listingRadarAcquisitionAdapter = require('./listing-radar-acquisition-adapter');
const miLandBankAcquisitionAdapter = require('./mi-land-bank-acquisition-adapter');
const miDetroitLandBankSourceProfiles = require('./mi-detroit-land-bank-source-profiles');
const caTaxDefaultNoticeAcquisitionAdapter = require('./ca-tax-default-notice-acquisition-adapter');
const caSanDiegoTaxDefaultSourceProfiles = require('./ca-san-diego-tax-default-source-profiles');
const caLosAngelesTaxDefaultAcquisitionAdapter = require('./ca-los-angeles-tax-default-acquisition-adapter');
const caLosAngelesTaxDefaultSourceProfiles = require('./ca-los-angeles-tax-default-source-profiles');
const txCountyForeclosureAcquisitionAdapter = require('./tx-county-foreclosure-acquisition-adapter');
const txCountyForeclosureSourceProfiles = require('./tx-county-foreclosure-source-profiles');
const listingEgressGuard = require('../security/listing-egress-guard');

const LISTING_EGRESS_VALUES = Object.freeze(['required', 'optional_degrades', 'none']);

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

const ADAPTERS = {
  tx_dallas_county_clerk_foreclosure_notices: {
    source_id: 'tx_dallas_county_clerk_foreclosure_notices',
    source_family: 'preforeclosure_trustee_notice',
    adapter_id: 'dallas_foreclosure_acquisition_adapter',
    adapter_family: 'pdf_list_adapter',
    source_name: 'Dallas County Clerk Foreclosure Notices',
    listing_egress: 'none',
    adapter: dallasForeclosureAcquisitionAdapter,
    run: dallasForeclosureAcquisitionAdapter.runDallasForeclosureAcquisitionAdapter
  },
  tx_dallas_fsbo_contact_first: {
    source_id: 'tx_dallas_fsbo_contact_first',
    source_family: 'fsbo',
    adapter_id: 'dallas_fsbo_contact_acquisition_adapter',
    adapter_family: 'public_contact_listing_adapter',
    source_name: 'Dallas FSBO / owner-contact listing sources',
    listing_egress: 'optional_degrades',
    adapter: dallasFsboContactAcquisitionAdapter,
    run: dallasFsboContactAcquisitionAdapter.runDallasFsboContactAcquisitionAdapter
  },
  tx_dallas_craigslist_owner_posts: {
    source_id: 'tx_dallas_craigslist_owner_posts',
    source_family: 'craigslist_owner_fsbo',
    adapter_id: 'dallas_craigslist_owner_acquisition_adapter',
    adapter_family: 'public_owner_post_adapter',
    source_name: 'Dallas Craigslist owner real-estate posts',
    listing_egress: 'none',
    adapter: dallasCraigslistOwnerAcquisitionAdapter,
    run: dallasCraigslistOwnerAcquisitionAdapter.runDallasCraigslistOwnerAcquisitionAdapter
  },
  tx_dallas_listing_radar: {
    source_id: 'tx_dallas_listing_radar',
    source_family: 'public_listing_radar',
    adapter_id: 'listing_radar_acquisition_adapter',
    adapter_family: 'property_listing_search_adapter',
    source_name: 'Dallas Listing Radar',
    listing_egress: 'required',
    adapter: listingRadarAcquisitionAdapter,
    run: listingRadarAcquisitionAdapter.runListingRadarAcquisitionAdapter
  }
};

// Every TX county foreclosure profile registers against the same generic
// adapter - adding a county is a profile entry, not adapter code.
for (const profile of txCountyForeclosureSourceProfiles.PROFILES) {
  ADAPTERS[profile.source_id] = {
    source_id: profile.source_id,
    source_family: 'preforeclosure_trustee_notice',
    adapter_id: 'tx_county_foreclosure_acquisition_adapter',
    adapter_family: 'pdf_list_adapter',
    source_name: profile.source_name,
    listing_egress: 'none',
    adapter: txCountyForeclosureAcquisitionAdapter,
    run: txCountyForeclosureAcquisitionAdapter.runTxCountyForeclosureAcquisitionAdapter
  };
}

for (const profile of miDetroitLandBankSourceProfiles.PROFILES) {
  ADAPTERS[profile.source_id] = {
    source_id: profile.source_id,
    source_family: profile.source_family,
    adapter_id: 'mi_land_bank_acquisition_adapter',
    adapter_family: 'public_json_inventory_adapter',
    source_name: profile.source_name,
    listing_egress: 'none',
    adapter: miLandBankAcquisitionAdapter,
    run: miLandBankAcquisitionAdapter.runMiLandBankAcquisitionAdapter
  };
}

for (const profile of caSanDiegoTaxDefaultSourceProfiles.PROFILES) {
  ADAPTERS[profile.source_id] = {
    source_id: profile.source_id,
    source_family: profile.source_family,
    adapter_id: 'ca_tax_default_notice_acquisition_adapter',
    adapter_family: 'pdf_notice_table_adapter',
    source_name: profile.source_name,
    listing_egress: 'none',
    adapter: caTaxDefaultNoticeAcquisitionAdapter,
    run: caTaxDefaultNoticeAcquisitionAdapter.runCaTaxDefaultNoticeAcquisitionAdapter
  };
}

for (const profile of caLosAngelesTaxDefaultSourceProfiles.PROFILES) {
  ADAPTERS[profile.source_id] = {
    source_id: profile.source_id,
    source_family: profile.source_family,
    adapter_id: 'ca_los_angeles_tax_default_acquisition_adapter',
    adapter_family: 'pdf_auction_book_adapter',
    source_name: profile.source_name,
    listing_egress: 'none',
    adapter: caLosAngelesTaxDefaultAcquisitionAdapter,
    run: caLosAngelesTaxDefaultAcquisitionAdapter.runCaLosAngelesTaxDefaultAcquisitionAdapter
  };
}

function adapterForSourceId(sourceId) {
  return ADAPTERS[cleanText(sourceId)] || null;
}

function adapterIdForSourceId(sourceId) {
  const adapter = adapterForSourceId(sourceId);
  return adapter ? adapter.adapter_id : '';
}

function adapterFamilyForSourceId(sourceId) {
  const adapter = adapterForSourceId(sourceId);
  return adapter ? adapter.adapter_family : '';
}

function listRegisteredSourceIds() {
  return Object.keys(ADAPTERS);
}

function listRegisteredAdapters() {
  return Object.values(ADAPTERS).map((adapter) => Object.assign({}, adapter));
}

function listingEgressForAdapter(adapter) {
  const value = cleanText(adapter && adapter.listing_egress);
  return LISTING_EGRESS_VALUES.includes(value) ? value : 'required';
}

async function discoverSource(sourceId, input = {}) {
  const adapter = adapterForSourceId(sourceId);
  if (!adapter || typeof adapter.run !== 'function') {
    return {
      source_id: cleanText(sourceId),
      status: 'not_configured',
      attempted: false,
      candidates: [],
      cards: [],
      diagnostics: {
        source_id: cleanText(sourceId),
        adapter_available: false
      }
    };
  }
  const listingEgress = listingEgressForAdapter(adapter);
  if (listingEgress === 'required' && !listingEgressGuard.legacyListingFetchEnabled(input.env || process.env)) {
    const skipReason = 'Server-side listing fetches are disabled. Capture this source with the local helper instead.';
    return {
      source_id: adapter.source_id,
      source_name: adapter.source_name,
      source_family: adapter.source_family,
      status: 'skipped',
      attempted: false,
      skipped: true,
      skip_code: 'LISTING_EGRESS_DISABLED',
      skip_reason: skipReason,
      candidates: [],
      cards: [],
      diagnostics: {
        source_id: adapter.source_id,
        adapter_available: true,
        listing_egress: listingEgress,
        skipped: true,
        skip_code: 'LISTING_EGRESS_DISABLED',
        skip_reason: skipReason
      },
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    };
  }
  return adapter.run(Object.assign({}, input, {
    source_id: adapter.source_id,
    source_family: adapter.source_family,
    source_name: adapter.source_name
  }));
}

module.exports = {
  ADAPTERS,
  adapterForSourceId,
  adapterIdForSourceId,
  adapterFamilyForSourceId,
  listRegisteredSourceIds,
  listRegisteredAdapters,
  LISTING_EGRESS_VALUES,
  listingEgressForAdapter,
  discoverSource
};
