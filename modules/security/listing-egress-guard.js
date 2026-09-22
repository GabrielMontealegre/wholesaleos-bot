'use strict';

const LISTING_HOSTS = Object.freeze([
  'zillow.com',
  'redfin.com',
  'realtor.com',
  'trulia.com',
  'maps.google.com'
]);

function hostname(value) {
  const text = String(value == null ? '' : value).trim().toLowerCase();
  if (!text) return '';
  try {
    return new URL(text.includes('://') ? text : `https://${text}`).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function isListingHost(urlOrHost) {
  const host = hostname(urlOrHost);
  return LISTING_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function legacyListingFetchEnabled(env) {
  return /^(1|true|yes|on)$/i.test(String(env && env.WOS_ENABLE_LEGACY_LISTING_FETCH || '').trim());
}

function assertLegacyListingFetchAllowed(routeName, env) {
  if (legacyListingFetchEnabled(env)) return true;
  const error = new Error('Server-side listing fetches are disabled. Use the local helper.');
  error.code = 'LEGACY_LISTING_FETCH_DISABLED';
  error.route = String(routeName || 'unknown');
  error.status_code = 503;
  throw error;
}

module.exports = {
  LISTING_HOSTS,
  isListingHost,
  legacyListingFetchEnabled,
  assertLegacyListingFetchAllowed
};

