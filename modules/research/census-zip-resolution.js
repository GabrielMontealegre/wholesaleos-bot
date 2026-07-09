// census-zip-resolution.js - resolve a partial address (street + city + state,
// zip unreadable in the source document) against the US Census Bureau public
// geocoder. The zip comes from the federal TIGER/Line address-range database:
// authoritative public data, never a guess. No API key, no paid service.
'use strict';

const CENSUS_GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const LOOKUP_TIMEOUT_MS = 12000;
const DEFAULT_MAX_LOOKUPS_PER_BATCH = 8;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function leadingStreetNumber(text) {
  const match = cleanText(text).match(/^(\d+)\b/);
  return match ? match[1] : '';
}

function titleCaseAddressPart(text) {
  return cleanText(text).toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}

async function fetchCensusMatch(oneLineAddress, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const url = `${CENSUS_GEOCODER_URL}?address=${encodeURIComponent(oneLineAddress)}&benchmark=Public_AR_Current&format=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await doFetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'WholesaleOS free public deal board (address zip verification)' }
    });
    if (!response.ok) return { ok: false, error: `census_http_${response.status}` };
    const payload = await response.json();
    const matches = payload && payload.result && Array.isArray(payload.result.addressMatches)
      ? payload.result.addressMatches
      : [];
    return { ok: true, matches };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'census_timeout' : `census_error_${cleanText(error.message).slice(0, 60)}` };
  } finally {
    clearTimeout(timer);
  }
}

// Resolve one partial address. Returns:
//   { resolved: true, zip, matched_address, normalized_address, city, state }
//   { resolved: false, reason }
// A match is only accepted when the Census echo agrees with what the document
// showed: same leading street number, same state, and (when the partial names
// a city) the same city. Anything weaker is rejected - no zip is ever guessed.
async function resolveZipFromCensus(partial, options = {}) {
  const street = cleanText(partial && partial.street_or_partial);
  const city = cleanText(partial && partial.city);
  const state = cleanText(partial && partial.state) || 'TX';
  if (!street || !leadingStreetNumber(street)) return { resolved: false, reason: 'no_street_number_in_partial' };

  // The partial from the document is usually already one line ("4016 Poplar
  // Point Dr, Rockwall, TX") - only append city/state when it is bare street.
  const oneLine = street.includes(',')
    ? street
    : [street, city, state].filter(Boolean).join(', ');
  const result = await fetchCensusMatch(oneLine, options.fetchImpl);
  if (!result.ok) return { resolved: false, reason: result.error };
  if (!result.matches.length) return { resolved: false, reason: 'no_census_match' };

  const match = result.matches[0];
  const components = match.addressComponents || {};
  const zip = cleanText(components.zip);
  const matchedAddress = cleanText(match.matchedAddress);
  if (!/^\d{5}$/.test(zip)) return { resolved: false, reason: 'census_match_without_zip' };

  const inputNumber = leadingStreetNumber(street);
  const matchedNumber = leadingStreetNumber(matchedAddress);
  if (inputNumber !== matchedNumber) return { resolved: false, reason: 'census_street_number_mismatch' };
  const matchedState = cleanText(components.state).toUpperCase();
  if (matchedState && state && matchedState !== state.toUpperCase()) return { resolved: false, reason: 'census_state_mismatch' };
  // The document text is the source of truth for the city: queue rows can
  // carry the market city as a stale label, so accept when the matched city
  // is visible in the partial itself OR equals the explicit city param.
  const matchedCity = cleanText(components.city).toUpperCase();
  if (matchedCity) {
    const cityInPartial = street.toUpperCase().includes(matchedCity);
    const cityMatchesParam = !!city && matchedCity === city.toUpperCase();
    if (!cityInPartial && !cityMatchesParam) return { resolved: false, reason: 'census_city_mismatch' };
  }

  const prettyCity = titleCaseAddressPart(components.city || city);
  const prettyStreet = titleCaseAddressPart([
    components.fromAddress ? inputNumber : inputNumber,
    components.preDirection, components.streetName, components.suffixType, components.suffixDirection
  ].filter(Boolean).join(' '));
  return {
    resolved: true,
    zip,
    matched_address: matchedAddress,
    normalized_address: `${prettyStreet}, ${prettyCity}, ${matchedState || state.toUpperCase()} ${zip}`,
    city: prettyCity,
    state: matchedState || state.toUpperCase(),
    source: 'us_census_geocoder',
    source_url: CENSUS_GEOCODER_URL
  };
}

module.exports = {
  CENSUS_GEOCODER_URL,
  DEFAULT_MAX_LOOKUPS_PER_BATCH,
  resolveZipFromCensus
};
