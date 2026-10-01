'use strict';

const existingNoticeProfiles = require('./tx-county-foreclosure-source-profiles');

const SALE_DATE_FIELDS = Object.freeze(['sale_date', 'auction_date', 'sale_date_or_event_date', 'date_of_sale', 'trustee_sale_date', 'foreclosure_sale_date']);
const VERIFIED_HOST_ALIASES = Object.freeze({
  tx_ellis_county_foreclosure_notices: Object.freeze(['www.elliscountytx.gov'])
});
const EXTRA_PROFILES = Object.freeze([
  Object.freeze({
    county: 'Dallas', state: 'TX', source_id: 'tx_dallas_county_clerk_foreclosure_notices',
    source_kind: 'trustee_sale_notice',
    hosts: Object.freeze(['dallascounty.org', 'www.dallascounty.org', 'dallas.tx.publicsearch.us']),
    parser_options: Object.freeze({ sale_date_fields: SALE_DATE_FIELDS })
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

const PROFILES = Object.freeze([...EXTRA_PROFILES, ...existingNoticeProfiles.PROFILES.map((profile) => Object.freeze({
  county: profile.county, state: profile.state, source_id: profile.source_id,
  source_kind: 'trustee_sale_notice',
  hosts: Object.freeze(allowedHosts(profile)),
  parser_options: Object.freeze({ sale_date_fields: SALE_DATE_FIELDS }),
  source_url: profile.source_url,
  human_portal_url: profile.human_portal_url
}))]);

function profileForSourceId(sourceId) {
  return PROFILES.find((profile) => profile.source_id === String(sourceId || '').trim()) || null;
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

module.exports = { PROFILES, SALE_DATE_FIELDS, profileForSourceId, sourceHostAllowed };
