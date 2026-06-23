'use strict';

const dallasForeclosureAcquisitionAdapter = require('./dallas-foreclosure-acquisition-adapter');
const dallasFsboContactAcquisitionAdapter = require('./dallas-fsbo-contact-acquisition-adapter');
const dallasCraigslistOwnerAcquisitionAdapter = require('./dallas-craigslist-owner-acquisition-adapter');

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
    adapter: dallasForeclosureAcquisitionAdapter,
    run: dallasForeclosureAcquisitionAdapter.runDallasForeclosureAcquisitionAdapter
  },
  tx_dallas_fsbo_contact_first: {
    source_id: 'tx_dallas_fsbo_contact_first',
    source_family: 'fsbo',
    adapter_id: 'dallas_fsbo_contact_acquisition_adapter',
    adapter_family: 'public_contact_listing_adapter',
    source_name: 'Dallas FSBO / owner-contact listing sources',
    adapter: dallasFsboContactAcquisitionAdapter,
    run: dallasFsboContactAcquisitionAdapter.runDallasFsboContactAcquisitionAdapter
  },
  tx_dallas_craigslist_owner_posts: {
    source_id: 'tx_dallas_craigslist_owner_posts',
    source_family: 'craigslist_owner_fsbo',
    adapter_id: 'dallas_craigslist_owner_acquisition_adapter',
    adapter_family: 'public_owner_post_adapter',
    source_name: 'Dallas Craigslist owner real-estate posts',
    adapter: dallasCraigslistOwnerAcquisitionAdapter,
    run: dallasCraigslistOwnerAcquisitionAdapter.runDallasCraigslistOwnerAcquisitionAdapter
  }
};

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
  discoverSource
};
