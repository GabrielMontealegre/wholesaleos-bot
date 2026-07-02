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

const BROWSER_BLOCKED_TEXT_RE = /captcha|verify you are human|access denied|login required|forbidden/i;

// Real-browser DCAD lookup for the public-record-browser-lookup core.
// The address-search results grid publicly shows owner of record, appraised
// value, and property type. The account detail page currently returns 403 to
// automated access - it is attempted once and reported as blocked, never
// bypassed, so the mailing address stays empty until DCAD allows it.
async function dallasBrowserAppraisalSearch(page, parts, options = {}) {
  if (!cleanText(parts && parts.street_number) || !cleanText(parts && parts.street_name)) {
    return { status: 'skipped', blocked_reason: 'address_parts_incomplete', source_url: APPRAISAL_SEARCH_URL };
  }
  await page.goto(APPRAISAL_SEARCH_URL, { waitUntil: 'domcontentloaded' });
  const searchPageText = cleanText(await page.textContent('body'));
  if (BROWSER_BLOCKED_TEXT_RE.test(searchPageText)) {
    return { status: 'blocked', blocked_reason: 'search_page_blocked', source_url: APPRAISAL_SEARCH_URL };
  }
  await page.fill('#txtAddrNum', parts.street_number);
  await page.fill('#txtStName', parts.street_name);
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.click('#cmdSubmit')
  ]);
  const gridRows = await page.$$eval('a[href*="AcctDetail"]', (anchors) => anchors.map((anchor) => {
    const row = anchor.closest('tr');
    return {
      href: anchor.getAttribute('href') || '',
      link_text: (anchor.innerText || '').replace(/\s+/g, ' ').trim(),
      cells: row ? Array.from(row.cells || []).map((cell) => (cell.innerText || '').replace(/\s+/g, ' ').trim()) : []
    };
  }));
  if (!gridRows.length) {
    const resultText = cleanText(await page.textContent('body'));
    if (BROWSER_BLOCKED_TEXT_RE.test(resultText)) {
      return { status: 'blocked', blocked_reason: 'results_page_blocked', source_url: page.url() };
    }
    return { status: 'no_visible_owner', blocked_reason: '', source_url: page.url() };
  }
  const best = gridRows.find((row) => row.link_text.toUpperCase().startsWith(`${parts.street_number} `)) || gridRows[0];
  const owner = cleanText(best.cells[3]);
  const appraisedValue = cleanText(best.cells[4]);
  const propertyType = cleanText(best.cells[5]);
  const recordUrl = new URL(best.href, APPRAISAL_SEARCH_URL).toString();
  const linkSuffix = cleanText(best.link_text.split(' ').pop()).toUpperCase();
  const addressSuffixMismatch = !!linkSuffix && !cleanText(parts.full_address).toUpperCase().includes(` ${linkSuffix}`);

  // One honest attempt at the detail page for the mailing address.
  let mailingAddress = '';
  const blockedSources = [];
  try {
    const detailResponse = await page.goto(recordUrl, { waitUntil: 'domcontentloaded' });
    const detailStatus = detailResponse ? detailResponse.status() : 0;
    const detailText = cleanText(await page.textContent('body'));
    if (detailStatus === 403 || detailStatus === 429 || BROWSER_BLOCKED_TEXT_RE.test(detailText)) {
      blockedSources.push({ source: 'dcad_account_detail_page', url: recordUrl, reason: `detail_page_blocked_http_${detailStatus || 'wall'}` });
    } else {
      const mailingMatch = detailText.match(/mailing\s+address\s*:?\s*(.{8,140}?)(?:\s{2,}|legal\s+desc|property\s+site|owner|$)/i);
      mailingAddress = cleanText(mailingMatch && mailingMatch[1]);
    }
  } catch (error) {
    blockedSources.push({ source: 'dcad_account_detail_page', url: recordUrl, reason: `detail_page_failed:${cleanText(error && error.message).slice(0, 50)}` });
  }

  if (!owner) return { status: 'no_visible_owner', blocked_reason: '', source_url: page.url(), blocked_sources: blockedSources };
  return {
    status: 'owner_found',
    owner_name: owner,
    mailing_address: mailingAddress,
    appraised_value: appraisedValue,
    property_type: propertyType,
    record_url: recordUrl,
    account_reference: (best.href.match(/ID=([A-Za-z0-9]+)/) || [])[1] || '',
    evidence_text: `DCAD address search result row: ${best.cells.filter(Boolean).join(' | ')}`,
    address_suffix_mismatch: addressSuffixMismatch,
    blocked_sources: blockedSources
  };
}

module.exports = {
  county: 'Dallas',
  state: 'TX',
  appraisal_source_name: 'Dallas Central Appraisal District address search',
  appraisal_source_url: APPRAISAL_SEARCH_URL,
  appraisalLookup: dallasAppraisalLookup,
  browserAppraisalSearch: dallasBrowserAppraisalSearch
};
