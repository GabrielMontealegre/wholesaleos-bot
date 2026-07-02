'use strict';

// Dallas County free public lookup profile.
// County-specific configuration for the reusable free-public-contact-hunter.
// Everything here is public, no-login. Blocked lookups are reported, never bypassed.

const APPRAISAL_SEARCH_URL = 'https://www.dallascad.org/SearchAddr.aspx';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function hiddenField(html, id) {
  const match = String(html || '').match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`, 'i'));
  return match ? match[1] : '';
}

// DCAD address search is an ASP.NET postback form. We attempt it with a
// plain session GET + POST. DCAD currently redirects non-browser postbacks
// to /Errors/SearchError.aspx - when that happens we report the source as
// blocked instead of bypassing anything.
async function dallasAppraisalLookup(addressParts, options = {}) {
  const fetchImpl = options.fetch_impl || global.fetch || require('node-fetch');
  const timeoutMs = Number(options.timeout_ms) || 8000;
  const streetNumber = cleanText(addressParts && addressParts.street_number);
  const streetName = cleanText(addressParts && addressParts.street_name).replace(/\b(rd|road|st|street|ave|avenue|dr|drive|ln|lane|ct|court|blvd|boulevard|pkwy|parkway|way|pl|place|trl|trail|cir|circle|ter|terrace|loop|hwy|highway)\.?$/i, '').trim();
  if (!streetNumber || !streetName) {
    return { status: 'skipped', blocked_reason: 'address_parts_incomplete', source_url: APPRAISAL_SEARCH_URL };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const formResponse = await fetchImpl(APPRAISAL_SEARCH_URL, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { Accept: 'text/html', 'User-Agent': 'WholesaleOS Free Public Lookup Preview/1.0' }
    });
    const formHtml = await formResponse.text();
    if (!formResponse.ok || /captcha|access denied|login required/i.test(formHtml)) {
      return { status: 'blocked', blocked_reason: 'appraisal_search_page_blocked', source_url: APPRAISAL_SEARCH_URL };
    }
    const cookie = cleanText(formResponse.headers && formResponse.headers.get && formResponse.headers.get('set-cookie')).split(';')[0];
    const body = new URLSearchParams({
      __VIEWSTATE: hiddenField(formHtml, '__VIEWSTATE'),
      __VIEWSTATEGENERATOR: hiddenField(formHtml, '__VIEWSTATEGENERATOR'),
      __EVENTVALIDATION: hiddenField(formHtml, '__EVENTVALIDATION'),
      txtAddrNum: streetNumber,
      txtStName: streetName,
      cmdSubmit: 'Search'
    });
    const postResponse = await fetchImpl(APPRAISAL_SEARCH_URL, {
      method: 'POST',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html',
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
        'User-Agent': 'WholesaleOS Free Public Lookup Preview/1.0'
      },
      body: body.toString()
    });
    const resultHtml = await postResponse.text();
    const finalUrl = cleanText(postResponse.url || APPRAISAL_SEARCH_URL);
    if (/SearchError/i.test(finalUrl) || /SearchError/i.test(resultHtml)) {
      return { status: 'blocked', blocked_reason: 'appraisal_postback_rejected_non_browser', source_url: APPRAISAL_SEARCH_URL };
    }
    if (/captcha|verify you are human|access denied/i.test(resultHtml)) {
      return { status: 'blocked', blocked_reason: 'appraisal_result_captcha_or_denied', source_url: finalUrl };
    }
    const ownerMatch = resultHtml.match(/owner[^<]*<\/[^>]+>\s*<[^>]*>([^<]{3,90})</i) || resultHtml.match(/OwnerName[^>]*>([^<]{3,90})</i);
    const owner = cleanText(ownerMatch && ownerMatch[1]);
    if (!owner) {
      return { status: 'no_visible_owner', blocked_reason: '', source_url: finalUrl };
    }
    return {
      status: 'owner_found',
      owner_name: owner,
      source_url: finalUrl,
      evidence_text: cleanText(resultHtml.slice(Math.max(0, resultHtml.indexOf(ownerMatch[0]) - 60), resultHtml.indexOf(ownerMatch[0]) + 200)).slice(0, 300)
    };
  } catch (error) {
    return { status: 'failed', blocked_reason: `appraisal_lookup_failed:${cleanText(error && error.message).slice(0, 60)}`, source_url: APPRAISAL_SEARCH_URL };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  county: 'Dallas',
  state: 'TX',
  appraisal_source_name: 'Dallas Central Appraisal District address search',
  appraisal_source_url: APPRAISAL_SEARCH_URL,
  appraisalLookup: dallasAppraisalLookup
};
