function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function leadAddress(lead) {
  lead = lead || {};
  var parts = [];
  var address = cleanText(lead.address || lead.property_address || lead.site_address);
  if (address) parts.push(address);
  var cityStateZip = [lead.city, lead.state, lead.zip || lead.postal_code].map(cleanText).filter(Boolean).join(' ');
  if (cityStateZip && address.toLowerCase().indexOf(cityStateZip.toLowerCase()) === -1) parts.push(cityStateZip);
  return cleanText(parts.join(', '));
}

function googleUrl(query) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(query);
}

function buildCompScoutSearchUrls(lead, sourcePreference) {
  var address = leadAddress(lead);
  if (!address) return [];
  var cityState = [lead && lead.city, lead && lead.state].map(cleanText).filter(Boolean).join(' ');
  var physical = [lead && (lead.beds || lead.bedrooms), lead && (lead.baths || lead.bathrooms), lead && (lead.sqft || lead.square_feet)].map(cleanText).filter(Boolean).join(' ');
  var pref = cleanText(sourcePreference || 'google').toLowerCase();
  var queries = [];

  function add(q) {
    q = cleanText(q);
    if (q && queries.indexOf(q) === -1) queries.push(q);
  }

  if (pref === 'zillow') add('site:zillow.com/homedetails "' + address + '"');
  if (pref === 'redfin') add('site:redfin.com "' + address + '"');
  if (pref === 'realtor') add('site:realtor.com/realestateandhomes-detail "' + address + '"');

  add('site:zillow.com/homedetails "' + address + '"');
  add('site:redfin.com "' + address + '"');
  add('site:realtor.com/realestateandhomes-detail "' + address + '"');
  add('"' + address + '" "sold" "Zillow"');
  if (cityState) add('"' + cityState + '" "' + physical + '" "sold"');

  return queries.slice(0, 5).map(function(query) {
    return { source: 'google', query: query, url: googleUrl(query) };
  });
}

function normalizeGoogleHref(href) {
  href = cleanText(href);
  if (!href) return '';
  try {
    var parsed = new URL(href);
    if (parsed.hostname.indexOf('google.') > -1 && parsed.pathname === '/url') {
      return parsed.searchParams.get('q') || href;
    }
    return href;
  } catch (_) {
    return href;
  }
}

function sourceFromUrl(url) {
  try {
    var host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.indexOf('zillow') > -1) return 'zillow';
    if (host.indexOf('redfin') > -1) return 'redfin';
    if (host.indexOf('realtor') > -1) return 'realtor';
    return host || 'google';
  } catch (_) {
    return 'google';
  }
}

function parseMoney(text) {
  var m = cleanText(text).match(/\$?\s?([1-9][0-9,]{4,})/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

function parseNumberBefore(text, labels) {
  var pattern = new RegExp('([0-9]+(?:\\.[0-9]+)?)\\s*(?:' + labels + ')', 'i');
  var m = cleanText(text).match(pattern);
  return m ? Number(m[1]) : null;
}

function parseSqft(text) {
  var m = cleanText(text).match(/([1-9][0-9,]{2,5})\s*(?:sq\.?\s*ft|sqft|sf|square feet)/i);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

function parseStatus(text) {
  text = cleanText(text);
  if (/sold/i.test(text)) return 'sold visible';
  if (/for sale|active/i.test(text)) return 'list visible';
  if (/pending/i.test(text)) return 'pending visible';
  if (/off market/i.test(text)) return 'off market visible';
  return '';
}

function parseDate(text) {
  var m = cleanText(text).match(/\b(?:sold|listed|sale date)?\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/i);
  return m ? cleanText(m[1]) : '';
}

function candidateFromRow(row) {
  var url = normalizeGoogleHref(row.href || '');
  var text = cleanText([row.title, row.snippet].filter(Boolean).join(' '));
  if (!url || !text) return null;
  var source = sourceFromUrl(url);
  if (!/(zillow|redfin|realtor)/i.test(source + ' ' + url + ' ' + text)) return null;
  var price = parseMoney(text);
  var sqft = parseSqft(text);
  var beds = parseNumberBefore(text, 'beds?|bd');
  var baths = parseNumberBefore(text, 'baths?|ba');
  return {
    source: source,
    title: cleanText(row.title).slice(0, 180),
    address: cleanText(row.title).slice(0, 180),
    price: price,
    beds: beds,
    baths: baths,
    sqft: sqft,
    status: parseStatus(text),
    date: parseDate(text),
    url: url,
    snippet: cleanText(row.snippet).slice(0, 500),
    confidence_reason: 'Visible public search result candidate. Operator must verify sold status, sqft, condition, distance, and similarity before using for ARV.',
    extraction_status: 'candidate_visible_in_search_result'
  };
}

function isBlockedText(text) {
  text = cleanText(text).toLowerCase();
  return /captcha|unusual traffic|not a robot|verify you are human|our systems have detected|sorry/.test(text);
}

async function extractCandidatesFromPage(page, maxResults) {
  var bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(function() { return ''; });
  if (isBlockedText(bodyText)) {
    return {
      blocked: true,
      reason: 'Search page appears to require human verification or CAPTCHA.'
    };
  }
  var rows = await page.$$eval('a', function(anchors) {
    return anchors.map(function(a) {
      var box = a.closest('div');
      return {
        title: (a.innerText || '').trim(),
        href: a.href || '',
        snippet: box ? (box.innerText || '').trim() : (a.innerText || '').trim()
      };
    });
  });
  var seen = {};
  var candidates = [];
  rows.forEach(function(row) {
    var candidate = candidateFromRow(row);
    if (!candidate || seen[candidate.url]) return;
    seen[candidate.url] = true;
    candidates.push(candidate);
  });
  return { blocked: false, candidates: candidates.slice(0, maxResults) };
}

async function scoutCompsForLead(options) {
  options = options || {};
  var lead = options.lead || {};
  var maxResults = Math.min(Math.max(parseInt(options.maxResults, 10) || 5, 1), 10);
  var searches = buildCompScoutSearchUrls(lead, options.sourcePreference);
  if (!leadAddress(lead)) {
    return {
      ok: false,
      blocked: false,
      reason: 'Lead has no usable address for comp scouting.',
      searches: searches,
      candidates: []
    };
  }

  var playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    return {
      ok: false,
      blocked: false,
      reason: 'Playwright is not available in this runtime: ' + e.message,
      searches: searches,
      candidates: []
    };
  }

  var browser;
  var candidates = [];
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    var context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
    });
    var page = await context.newPage();
    page.setDefaultTimeout(12000);

    for (var i = 0; i < searches.length && candidates.length < maxResults; i++) {
      var search = searches[i];
      await page.goto(search.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      var extracted = await extractCandidatesFromPage(page, maxResults - candidates.length);
      if (extracted.blocked) {
        return {
          ok: true,
          blocked: true,
          source: search.source,
          reason: extracted.reason,
          suggested_manual_action: 'Open the listed search URL manually and enter any verified sold comps into the draft comp rows.',
          searches: searches,
          candidates: candidates,
          extraction_status: 'blocked'
        };
      }
      candidates = candidates.concat(extracted.candidates || []);
    }

    return {
      ok: true,
      blocked: false,
      searches: searches,
      candidates: candidates.slice(0, maxResults),
      extraction_status: candidates.length ? 'candidates_found' : 'no_visible_candidates',
      suggested_manual_action: candidates.length
        ? 'Review each candidate manually before using it as a comp.'
        : 'No visible candidates found. Use the search links manually and paste verified sold comps.'
    };
  } catch (e) {
    return {
      ok: false,
      blocked: /captcha|blocked|timeout|net::/i.test(e.message || ''),
      source: 'google',
      reason: e.message,
      suggested_manual_action: 'Open the search links manually and enter verified comps. No retry loop was started.',
      searches: searches,
      candidates: candidates,
      extraction_status: 'error'
    };
  } finally {
    if (browser) await browser.close().catch(function() {});
  }
}

module.exports = {
  buildCompScoutSearchUrls: buildCompScoutSearchUrls,
  scoutCompsForLead: scoutCompsForLead,
  _internal: {
    candidateFromRow: candidateFromRow,
    isBlockedText: isBlockedText,
    leadAddress: leadAddress
  }
};
