#!/usr/bin/env node

const http = require('http');

const DEFAULT_PORT = Number(process.env.LOCAL_COMP_AGENT_PORT || 8791);
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_CDP_URL = process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';
const MAX_RESULTS = 10;
var activePort = DEFAULT_PORT;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function json(res, status, body) {
  var payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://127.0.0.1',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function parseBody(req) {
  return new Promise(function(resolve) {
    var chunks = [];
    req.on('data', function(chunk) { chunks.push(chunk); });
    req.on('end', function() {
      var raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (_) { resolve({}); }
    });
  });
}

async function fetchJson(url) {
  var response = await fetch(url);
  if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + url);
  return response.json();
}

async function chromeTargets(cdpUrl) {
  return fetchJson(cdpUrl.replace(/\/$/, '') + '/json/list');
}

function detectSource(url, title) {
  var text = cleanText(url + ' ' + title).toLowerCase();
  if (text.indexOf('zillow.') > -1) return 'zillow';
  if (text.indexOf('redfin.') > -1) return 'redfin';
  if (text.indexOf('realtor.') > -1) return 'realtor';
  if (text.indexOf('google.') > -1 && text.indexOf('/search') > -1) return 'google';
  return 'unsupported';
}

function chooseActiveTarget(targets) {
  targets = Array.isArray(targets) ? targets : [];
  var pages = targets.filter(function(target) {
    return target && target.type === 'page' && target.url && !/^devtools:|^chrome:|^edge:|^about:/i.test(target.url);
  });
  return pages[0] || null;
}

function parseCandidateText(text) {
  text = cleanText(text);
  var priceMatch = text.match(/\$?\s?([1-9][0-9,]{4,})/);
  var sqftMatch = text.match(/([1-9][0-9,]{2,5})\s*(?:sq\.?\s*ft|sqft|sf|square feet)/i);
  var bedMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:beds?|bd)\b/i);
  var bathMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:baths?|ba)\b/i);
  var dateMatch = text.match(/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/i);
  var status = '';
  if (/sold/i.test(text)) status = 'sold visible';
  else if (/for sale|active/i.test(text)) status = 'list visible';
  else if (/pending/i.test(text)) status = 'pending visible';
  else if (/off market/i.test(text)) status = 'off market visible';
  return {
    price: priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : null,
    sqft: sqftMatch ? Number(sqftMatch[1].replace(/,/g, '')) : null,
    beds: bedMatch ? Number(bedMatch[1]) : null,
    baths: bathMatch ? Number(bathMatch[1]) : null,
    status: status,
    date: dateMatch ? cleanText(dateMatch[1]) : ''
  };
}

function normalizeCandidate(raw, page, index) {
  var text = cleanText(raw.snippet || raw.title || '');
  var parsed = parseCandidateText(text);
  var missing = [];
  if (!parsed.price) missing.push('price');
  if (!parsed.beds) missing.push('beds');
  if (!parsed.baths) missing.push('baths');
  if (!parsed.sqft) missing.push('sqft');
  if (!parsed.status) missing.push('sold/list status');
  if (!parsed.date) missing.push('sold/list date');
  if (!raw.href) missing.push('url');
  var reasons = [];
  if (parsed.price) reasons.push('visible price');
  if (parsed.sqft) reasons.push('visible sqft');
  if (parsed.beds) reasons.push('visible beds');
  if (parsed.baths) reasons.push('visible baths');
  if (parsed.status) reasons.push('visible status');
  if (raw.href) reasons.push('visible link');
  return {
    candidate_id: 'local-visible-' + Date.now() + '-' + index,
    source: page.source,
    title: cleanText(raw.title || '').slice(0, 180),
    address: cleanText(raw.title || '').slice(0, 180),
    price: parsed.price,
    beds: parsed.beds,
    baths: parsed.baths,
    sqft: parsed.sqft,
    status: parsed.status,
    date: parsed.date,
    url: raw.href || '',
    snippet: text.slice(0, 600),
    extraction_status: missing.length ? 'extraction_partial' : 'candidate_visible_dom',
    confidence_reason: reasons.length
      ? 'Visible DOM only: ' + reasons.join(', ') + '. Operator must verify sold status, condition, distance, and similarity before ARV.'
      : 'Visible DOM candidate with limited structured fields. Operator must verify before use.',
    missing_fields: missing,
    verification_label: 'unverified',
    capture_method: 'local_visible_dom',
    page_url: page.url,
    page_title: page.title
  };
}

function candidateDedupKey(candidate) {
  return [
    cleanText(candidate.url).toLowerCase(),
    cleanText(candidate.title).toLowerCase(),
    candidate.price || '',
    candidate.sqft || ''
  ].join('|');
}

function isCaptchaText(text) {
  return /captcha|not a robot|verify you are human|human verification|unusual traffic|access denied/i.test(cleanText(text));
}

async function extractVisibleCandidates(page, maxResults) {
  var raw = await page.evaluate(function(limit) {
    function textOf(node) {
      return String(node && node.innerText || '').replace(/\s+/g, ' ').trim();
    }
    function visible(node) {
      if (!node || !node.getBoundingClientRect) return false;
      var style = window.getComputedStyle(node);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      var rect = node.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 10) return false;
      return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
    }
    function hrefOf(node) {
      var link = node.closest && node.closest('a') || node.querySelector && node.querySelector('a[href]');
      return link && link.href ? link.href : '';
    }
    function titleOf(node) {
      var link = node.querySelector && node.querySelector('a[href]');
      var heading = node.querySelector && node.querySelector('h1,h2,h3,[role="heading"]');
      return textOf(heading) || textOf(link) || textOf(node).slice(0, 140);
    }
    function looksLikeCandidate(text, href) {
      var hay = (text + ' ' + href).toLowerCase();
      var hasListingSource = /zillow|redfin|realtor|realestateandhomes|homes[-/]detail/.test(hay);
      var hasPropertyTerms = /\$?\s?[1-9][0-9,]{4,}|beds?|baths?|bd\b|ba\b|sq\.?\s*ft|sqft|sold|for sale|pending|off market/i.test(text);
      return hasListingSource || hasPropertyTerms;
    }
    var selector = [
      'article',
      '[role="article"]',
      '[role="listitem"]',
      'li',
      'a[href]',
      '[data-testid]',
      '[class*="card" i]',
      '[class*="result" i]',
      '[class*="property" i]',
      '[class*="home" i]'
    ].join(',');
    var nodes = Array.prototype.slice.call(document.querySelectorAll(selector));
    var out = [];
    var seen = {};
    nodes.forEach(function(node) {
      if (out.length >= limit * 4 || !visible(node)) return;
      var text = textOf(node);
      if (text.length < 20 || text.length > 1200) return;
      var href = hrefOf(node);
      if (!looksLikeCandidate(text, href)) return;
      var key = (href || '') + '|' + text.slice(0, 100);
      if (seen[key]) return;
      seen[key] = true;
      out.push({
        title: titleOf(node),
        href: href,
        snippet: text,
        tag: node.tagName ? node.tagName.toLowerCase() : ''
      });
    });
    return {
      body_text: textOf(document.body).slice(0, 3000),
      candidates: out.slice(0, limit * 2)
    };
  }, maxResults);
  return raw || { body_text: '', candidates: [] };
}

async function captureVisibleComps(options) {
  options = options || {};
  var cdpUrl = options.cdpUrl || DEFAULT_CDP_URL;
  var maxResults = Math.min(Math.max(parseInt(options.maxResults, 10) || 5, 1), MAX_RESULTS);

  var targets;
  try {
    targets = await chromeTargets(cdpUrl);
  } catch (e) {
    return {
      ok: false,
      extraction_status: 'browser_not_connected',
      reason: 'Could not connect to Chrome CDP at ' + cdpUrl + ': ' + e.message,
      candidates: []
    };
  }

  var target = chooseActiveTarget(targets);
  if (!target) {
    return {
      ok: false,
      extraction_status: 'browser_not_connected',
      reason: 'No visible Chrome page target found at ' + cdpUrl + '.',
      candidates: []
    };
  }

  var source = detectSource(target.url, target.title);
  if (source === 'unsupported') {
    return {
      ok: true,
      extraction_status: 'unsupported_page',
      page_url: target.url,
      page_title: target.title,
      source: source,
      candidates: [],
      reason: 'Current active page is not Zillow, Redfin, Realtor, or Google search results.'
    };
  }

  var playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    return {
      ok: false,
      extraction_status: 'browser_not_connected',
      reason: 'Playwright is not installed locally: ' + e.message,
      candidates: []
    };
  }

  var browser;
  try {
    browser = await playwright.chromium.connectOverCDP(cdpUrl);
    var contexts = browser.contexts();
    var pages = [];
    contexts.forEach(function(context) {
      pages = pages.concat(context.pages());
    });
    var page = pages.find(function(p) { return p.url() === target.url; }) || pages.find(function(p) {
      return detectSource(p.url(), '') === source;
    });
    if (!page) {
      return {
        ok: false,
        extraction_status: 'browser_not_connected',
        reason: 'Connected to Chrome, but could not attach to the selected tab.',
        candidates: []
      };
    }

    var pageInfo = {
      url: page.url(),
      title: await page.title().catch(function() { return target.title || ''; }),
      source: source
    };
    var raw = await extractVisibleCandidates(page, maxResults);
    if (isCaptchaText(raw.body_text)) {
      return {
        ok: true,
        extraction_status: 'captcha_or_verification_detected',
        source: source,
        page_url: pageInfo.url,
        page_title: pageInfo.title,
        candidates: [],
        reason: 'Visible page text indicates CAPTCHA or human verification. Complete it manually, then run capture again.'
      };
    }

    var seen = {};
    var candidates = [];
    (raw.candidates || []).forEach(function(item) {
      var candidate = normalizeCandidate(item, pageInfo, candidates.length);
      var key = candidateDedupKey(candidate);
      if (seen[key]) return;
      seen[key] = true;
      candidates.push(candidate);
    });
    candidates = candidates.slice(0, maxResults);

    return {
      ok: true,
      extraction_status: candidates.length ? (candidates.some(function(c) { return c.extraction_status === 'extraction_partial'; }) ? 'extraction_partial' : 'candidates_found') : 'no_visible_candidates',
      source: source,
      page_url: pageInfo.url,
      page_title: pageInfo.title,
      candidates: candidates,
      safety: 'Visible DOM only. No navigation, clicking, scrolling, persistence, ingestion, outbound communication, CAPTCHA bypass, proxy, or background loop.'
    };
  } catch (e) {
    return {
      ok: false,
      extraction_status: 'browser_not_connected',
      reason: e.message,
      candidates: []
    };
  } finally {
    if (browser) await browser.close().catch(function() {});
  }
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  var url = new URL(req.url, 'http://' + DEFAULT_HOST + ':' + DEFAULT_PORT);
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
        service: 'local-comp-agent',
        host: DEFAULT_HOST,
        port: activePort,
        cdp_url: DEFAULT_CDP_URL,
        mode: 'localhost_only'
    });
  }
  if (req.method === 'GET' && url.pathname === '/tabs') {
    try {
      var targets = await chromeTargets(DEFAULT_CDP_URL);
      return json(res, 200, {
        ok: true,
        tabs: (targets || []).filter(function(t) { return t.type === 'page'; }).map(function(t) {
          return {
            id: t.id,
            title: t.title,
            url: t.url,
            source: detectSource(t.url, t.title)
          };
        })
      });
    } catch (e) {
      return json(res, 200, {
        ok: false,
        extraction_status: 'browser_not_connected',
        reason: e.message,
        tabs: []
      });
    }
  }
  if (req.method === 'POST' && url.pathname === '/capture-visible-comps') {
    var body = await parseBody(req);
    var result = await captureVisibleComps({
      maxResults: body.max_results || body.maxResults,
      cdpUrl: body.cdp_url || body.cdpUrl || DEFAULT_CDP_URL
    });
    return json(res, 200, result);
  }
  return json(res, 404, { ok: false, error: 'not_found' });
}

function startServer(port) {
  activePort = port || DEFAULT_PORT;
  var server = http.createServer(function(req, res) {
    handle(req, res).catch(function(e) {
      json(res, 500, { ok: false, error: e.message });
    });
  });
  server.listen(activePort, DEFAULT_HOST, function() {
    console.log('Local Comp Agent listening on http://' + DEFAULT_HOST + ':' + activePort);
    console.log('Chrome CDP URL: ' + DEFAULT_CDP_URL);
  });
  return server;
}

if (require.main === module) {
  startServer(DEFAULT_PORT);
}

module.exports = {
  captureVisibleComps: captureVisibleComps,
  detectSource: detectSource,
  parseCandidateText: parseCandidateText,
  startServer: startServer,
  _internal: {
    chooseActiveTarget: chooseActiveTarget,
    normalizeCandidate: normalizeCandidate,
    isCaptchaText: isCaptchaText
  }
};
