'use strict';

// Registry of county free-lookup profiles for the free public hunters.
// Add one profile per county; the hunter core stays county-agnostic.

const appraisalSearchProfile = require('./county-appraisal-search-profile');
const bexarProfile = require('./tx-bexar-county-free-lookup-profile');

const PROFILES = [appraisalSearchProfile, bexarProfile];

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function profileForMarket(market) {
  const county = cleanText(market && market.county).toLowerCase();
  const state = cleanText(market && market.state).toLowerCase();
  return PROFILES.find((profile) =>
    cleanText(profile.county).toLowerCase() === county &&
    cleanText(profile.state).toLowerCase() === state) || null;
}

module.exports = {
  PROFILES,
  profileForMarket
};
