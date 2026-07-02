'use strict';

// Registry of county free-lookup profiles for the free public hunters.
// Add one profile per county; the hunter core stays county-agnostic.

const dallasProfile = require('./dallas-county-free-lookup-profile');

const PROFILES = [dallasProfile];

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
  profileForMarket
};
