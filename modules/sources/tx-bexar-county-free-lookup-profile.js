'use strict';

// Bexar County public owner lookup profile.
// This is a best-effort public appraisal search used by the free contact
// hunter. Blocked or shape-changed pages are reported, never bypassed.

const APPRAISAL_SEARCH_URL = 'https://bexar.trueautomation.com/clientdb/?cid=110';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function stripStreetType(value) {
  return cleanText(value).replace(/\b(rd|road|st|street|ave|avenue|dr|drive|ln|lane|ct|court|blvd|boulevard|pkwy|parkway|way|pl|place|trl|trail|cir|circle|ter|terrace|loop|hwy|highway)\.?$/i, '').trim();
}

function htmlText(html) {
  return cleanText(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function ownerFromText(text) {
  const patterns = [
    /owner\s*name\s*:?\s*([A-Z0-9][A-Z0-9 .,'&/-]{4,100}?)(?:\s{2,}|mailing|property|legal|account|$)/i,
    /\bowner\b\s+([A-Z0-9][A-Z0-9 .,'&/-]{4,100}?)(?:\s{2,}|mailing|property|legal|account|$)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const owner = cleanText(match && match[1]).replace(/\s+(mailing|property|legal|account).*$/i, '');
    if (owner) return owner;
  }
  return '';
}

function mailingFromText(text) {
  const match = text.match(/mailing\s+address\s*:?\s*([A-Z0-9][A-Z0-9 .,#'/-]{8,160}?)(?:\s{2,}|property\s+address|legal|account|$)/i);
  return cleanText(match && match[1]).replace(/\s+(property\s+address|legal|account).*$/i, '');
}

async function bexarAppraisalLookup(addressParts, options = {}) {
  const fetchImpl = options.fetch_impl || global.fetch || require('node-fetch');
  const timeoutMs = Number(options.timeout_ms) || 8000;
  const streetNumber = cleanText(addressParts && addressParts.street_number);
  const streetName = stripStreetType(addressParts && addressParts.street_name);
  if (!streetNumber || !streetName) {
    return { status: 'skipped', blocked_reason: 'address_parts_incomplete', source_url: APPRAISAL_SEARCH_URL };
  }
  const url = `${APPRAISAL_SEARCH_URL}&prop_search=${encodeURIComponent(`${streetNumber} ${streetName}`)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'text/html', 'User-Agent': 'WholesaleOS Free Public Lookup Preview/1.0' }
    });
    const body = await response.text();
    const text = htmlText(body);
    if (response.status === 403 || response.status === 429 || /captcha|verify you are human|access denied|login required|forbidden/i.test(text)) {
      return { status: 'blocked', blocked_reason: `bcad_lookup_blocked_http_${response.status || 'wall'}`, source_url: url };
    }
    if (!response.ok) return { status: 'failed', blocked_reason: `http_${response.status}`, source_url: url };
    if (!new RegExp(`\\b${streetNumber}\\b`, 'i').test(text)) {
      return { status: 'no_visible_owner', blocked_reason: 'address_not_visible_in_results', source_url: url };
    }
    const owner = ownerFromText(text);
    if (!owner) return { status: 'no_visible_owner', blocked_reason: 'owner_not_visible_in_results', source_url: url };
    return {
      status: 'owner_found',
      owner_name: owner,
      mailing_address: mailingFromText(text),
      source_url: url,
      evidence_text: cleanText(text.slice(Math.max(0, text.toLowerCase().indexOf(owner.toLowerCase()) - 80), text.toLowerCase().indexOf(owner.toLowerCase()) + 220)).slice(0, 300)
    };
  } catch (error) {
    return { status: 'failed', blocked_reason: `bcad_lookup_failed:${cleanText(error && error.message).slice(0, 60)}`, source_url: url };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  county: 'Bexar',
  state: 'TX',
  appraisal_source_name: 'Bexar County Appraisal District public property search',
  appraisal_source_url: APPRAISAL_SEARCH_URL,
  appraisalLookup: bexarAppraisalLookup
};
