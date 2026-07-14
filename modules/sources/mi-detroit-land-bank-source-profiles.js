'use strict';

const PROFILE = Object.freeze({
  source_id: 'mi_wayne_detroit_land_bank_listings',
  source_name: 'Detroit Land Bank Public Listings',
  source_family: 'land_bank_public_sale',
  county: 'Wayne',
  state: 'MI',
  city: 'Detroit',
  source_url: 'https://buildingdetroit.org/properties/',
  api_url: 'https://buildingdetroit.org/properties',
  human_portal_url: 'https://buildingdetroit.org/purchase_property',
  official_hosts: Object.freeze(['buildingdetroit.org']),
  city_names: Object.freeze(['Detroit']),
  blocked_note: 'Public Detroit Land Bank listings show property identity, program, displayed price, and detail links; owner contact and verified sold comps are not provided.'
});

module.exports = {
  PROFILE,
  PROFILES: Object.freeze([PROFILE])
};
