'use strict';

const propertyAddressEvidence = require('./property-address-evidence');
const addressCanonical = require('../../scripts/lib/address-canonical');

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function verifiedSubjectAddress(row) {
  if (!propertyAddressEvidence.isSourceSupportedSubjectAddress(row)) return '';
  return cleanText(row && row.normalized_address);
}

function decoded(value) {
  try { return decodeURIComponent(String(value || '').replace(/\+/g, ' ')); } catch (error) { return ''; }
}

function addressFromUrl(value) {
  let url;
  try { url = new URL(cleanText(value)); } catch (error) { return ''; }
  const host = url.hostname.toLowerCase();
  const pathname = decoded(url.pathname);
  if (host.includes('google.')) {
    const queryValue = url.searchParams.get('query') || url.searchParams.get('q') || url.searchParams.get('address');
    if (queryValue) return decoded(queryValue);
  }
  if (host.includes('redfin.com')) {
    const queryValue = url.searchParams.get('q') || url.searchParams.get('address');
    if (queryValue) return decoded(queryValue);
  }
  if (host.includes('zillow.com')) {
    const match = pathname.match(/\/homes\/(.+?)_rb\/?$/i);
    if (match) return match[1].replace(/-/g, ' ');
  }
  if (host.includes('realtor.com')) {
    const match = pathname.match(/\/realestateandhomes-search\/(.+)$/i);
    if (match) return match[1].replace(/-/g, ' ');
  }
  if (host.includes('google.') && /\/maps\/place\//i.test(pathname)) {
    return pathname.split(/\/maps\/place\//i)[1].split('/')[0].replace(/\+/g, ' ');
  }
  return '';
}

function storedAddressLinkMatches(url, subjectAddress) {
  const encodedAddress = addressFromUrl(url);
  return !!encodedAddress && addressCanonical.addressesMatchExactly(
    addressCanonical.canonicalizeAddress(encodedAddress),
    addressCanonical.canonicalizeAddress(subjectAddress)
  );
}

function isKnownAddressSearchUrl(value) {
  try {
    const host = new URL(cleanText(value)).hostname.toLowerCase();
    return /(?:^|\.)(?:zillow\.com|redfin\.com|realtor\.com|google\.[a-z.]+|cyberbackgroundchecks\.com)$/.test(host);
  } catch (error) {
    return false;
  }
}

function safeStoredAddressUrl(value, subjectAddress) {
  const url = cleanText(value);
  if (!url) return '';
  if (!isKnownAddressSearchUrl(url) && !addressFromUrl(url)) return url;
  return subjectAddress && storedAddressLinkMatches(url, subjectAddress) ? url : '';
}

function mapsSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function slug(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildAddressResearchLinks(row) {
  const address = verifiedSubjectAddress(row);
  const parts = address.split(',').map(cleanText);
  const city = parts[1] || cleanText(row && row.city);
  const state = cleanText(row && row.state);
  const links = [];
  const push = (label, url, kind = 'human_research_only') => {
    if (url && /^https?:\/\//i.test(url)) links.push({ label, url, link_kind: kind, warning: '' });
  };

  if (address) {
    const mapStored = cleanText(row && (row.maps_url || row.street_view_url));
    const mapUrl = mapStored && storedAddressLinkMatches(mapStored, address) ? mapStored : mapsSearchUrl(address);
    push('Zillow subject search', `https://www.zillow.com/homes/${encodeURIComponent(address)}_rb/`);
    push('Redfin subject search', `https://www.redfin.com/search?q=${encodeURIComponent(address)}`);
    push('Realtor.com subject search', `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(address)}`);
    push('Google Maps', mapUrl);
    push('Street View', mapUrl);
    if (parts[0] && city && state) push('CyberBackgroundChecks address search', `https://www.cyberbackgroundchecks.com/address/${slug(parts[0])}/${slug(city)}/${slug(state)}`);
  }

  const owner = cleanText(row && (row.owner_clue || row.owner_record && (row.owner_record.owner_name || row.owner_record.taxpayer_name)));
  if (owner) push('CyberBackgroundChecks name search', `https://www.google.com/search?q=${encodeURIComponent(`site:cyberbackgroundchecks.com/detail "${owner}" "${cleanText(row && row.city)} ${state}"`)}`);
  push('County source proof', cleanText(row && (row.source_document_url || row.source_url)), 'source_proof');
  push('County appraisal or assessor search', cleanText(row && row.official_property_record_url), 'official_property_record_search');
  if (cleanText(row && row.auction_url) && (cleanText(row.sale_date_or_event_date) || /auction|foreclosure|tax/i.test(cleanText(row.source_family)))) {
    push('Auction or sale status', cleanText(row.auction_url), 'source_backed_auction_status');
  }
  return links;
}

function isAddressDerivedLink(entry) {
  const label = cleanText(entry && entry.label);
  return /zillow|redfin|realtor|google maps|street view|cyberbackgroundchecks address/i.test(label);
}

function auditStoredAddressLinks(rows) {
  const result = { rows_total: 0, rows_with_address_links: 0, rows_with_mismatched_address_links: 0,
    mismatched_link_count: 0, unverifiable_link_count: 0 };
  for (const row of Array.isArray(rows) ? rows : []) {
    result.rows_total += 1;
    const entries = [
      ['maps_url', row && row.maps_url], ['street_view_url', row && row.street_view_url],
      ['zillow_url', row && row.zillow_url], ['redfin_url', row && row.redfin_url],
      ['realtor_url', row && row.realtor_url], ['best_link_to_click_first', row && row.best_link_to_click_first]
    ].filter((entry) => cleanText(entry[1])).map((entry) => ({ label: entry[0], url: entry[1] }));
    entries.splice(5, 1);
    const bestLink = cleanText(row && row.best_link_to_click_first);
    if (bestLink && (isKnownAddressSearchUrl(bestLink) || addressFromUrl(bestLink))) entries.push({ label: 'best_link_to_click_first', url: bestLink });
    for (const entry of Array.isArray(row && row.research_links) ? row.research_links : []) {
      if (entry && entry.url && isAddressDerivedLink(entry)) entries.push(entry);
    }
    if (!entries.length) continue;
    result.rows_with_address_links += 1;
    const subject = verifiedSubjectAddress(row);
    let rowMismatch = false;
    for (const entry of entries) {
      if (!subject || !storedAddressLinkMatches(entry.url, subject)) {
        result.unverifiable_link_count += !subject || !addressFromUrl(entry.url) ? 1 : 0;
        result.mismatched_link_count += subject ? 1 : 0;
        rowMismatch = rowMismatch || !!subject;
      }
    }
    if (rowMismatch) result.rows_with_mismatched_address_links += 1;
  }
  return result;
}

module.exports = { verifiedSubjectAddress, addressFromUrl, storedAddressLinkMatches, mapsSearchUrl,
  safeStoredAddressUrl, buildAddressResearchLinks, auditStoredAddressLinks };
