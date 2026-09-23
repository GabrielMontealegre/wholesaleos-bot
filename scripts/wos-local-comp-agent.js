'use strict';

// Local-only visible-browser capture. The server receives images through its
// existing manual-evidence route; it never visits a listing website.
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');
const resolver = require('../modules/research/playwright-browser-resolver');
const addressEvidence = require('../modules/research/property-address-evidence');
const compEvidence = require('../modules/research/screenshot-comp-evidence');
const localConfig = require('../modules/security/local-config-path');
const addressCanonical = require('./lib/address-canonical');

const SITE_HOSTS = Object.freeze({
  zillow: 'zillow.com',
  redfin: 'redfin.com',
  realtor: 'realtor.com'
});
const SOURCE_ORDER = Object.freeze(['zillow', 'redfin', 'realtor']);
const SUPPORTED_MODES = Object.freeze(['sold_comps', 'subject_facts']);
// Bump this only for an incompatible helper-to-dashboard contract change, such as a route request/response shape, capture-mode meaning, or safety-gate semantic change; never bump it for a bug fix, selector update, or refactor.
const HELPER_PROTOCOL_VERSION = 1;
const CARD_SELECTOR = 'article, [role="article"], li, [data-testid*="card"], [data-testid*="property"]';
const SOURCE_SELECTORS = Object.freeze({
  zillow: Object.freeze({
    container: '[data-testid="search-page-list-container"], #grid-search-results, .search-page-list-container, main',
    cards: '[data-testid="property-card"], article, li[class*="ListItem"]'
  }),
  redfin: Object.freeze({
    container: '[data-rf-test-id="home-card-list"], .HomeCardsContainer, .ReactHomeCard, main',
    cards: '[data-rf-test-id="home-card"], .HomeCard, .bp-Homecard, article'
  }),
  realtor: Object.freeze({
    container: '[data-testid="property-list"], .PropertiesList, ul[class*="property-list"], main',
    cards: '[data-testid="result-card"], [data-testid="property-card"], .BasePropertyCard, article'
  })
});
const SOLD_DATE_VISIBLE_RE = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4})\b/i;
const ADDRESS_VISIBLE_RE = /\b\d{1,7}\s+[A-Za-z0-9 .'#-]{3,70},?\s*[A-Za-z .'-]{2,40},?\s*(?:TX|Texas|CA|California|MI|Michigan)\s*\d{5}\b/i;
const PRICE_VISIBLE_RE = /\$\s?[\d,]{4,12}\b/;
const RATE_STATE = path.resolve(__dirname, '..', '.cache', 'wos-local-comp-agent', 'rate-state.json');
const RUN_LOCK = path.resolve(__dirname, '..', '.cache', 'wos-local-comp-agent', 'agent.lock');
const LOG_DIR = path.resolve(__dirname, '..', 'exports', 'cycle-30-comp-capture');
let lastUploadCaptureMs = 0;

function helperBuild() {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: path.resolve(__dirname, '..'), timeout: 2000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || 'unknown';
  } catch (_) { return 'unknown'; }
}
const HELPER_BUILD = helperBuild();

function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }

function safeFailureReason(error) {
  const code = clean(error && error.code).toLowerCase();
  if (/^[a-z0-9_:-]{1,80}$/.test(code)) return code;
  const message = clean(error && error.message || error).toLowerCase();
  const upload = message.match(/^(upload_failed_http_\d+:[a-z0-9_]+)/);
  if (upload) return upload[1];
  if (/spawn eperm/.test(message)) return 'browser_process_launch_blocked';
  if (/timeout|timed out/.test(message)) return 'navigation_timeout';
  if (/enoent/.test(message)) return 'local_file_not_found';
  if (/net::err_/.test(message)) return 'browser_navigation_failed';
  return 'local_capture_error';
}

function hostAllowed(url, site) {
  try {
    const parsed = new URL(url);
    const root = SITE_HOSTS[site];
    return parsed.protocol === 'https:' && !!root && (parsed.hostname === root || parsed.hostname.endsWith(`.${root}`));
  } catch (_) { return false; }
}

function dashboardOrigin(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('dashboard_url_invalid'); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) {
    throw new Error('dashboard_url_must_be_https_or_localhost');
  }
  return url.origin;
}

function parseMarket(value) {
  const parts = clean(value).split('|').map(clean);
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('market_format_required_city|county|state');
  return { city: parts[0], county: parts[1], state: parts[2].toUpperCase() };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`unexpected_argument:${key}`);
    if (key === '--init-config') { parsed.init_config = true; continue; }
    if (key === '--help') { parsed.help = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`argument_value_required:${key}`);
    parsed[key.slice(2).replace(/-/g, '_')] = value;
    index += 1;
  }
  return parsed;
}

function safeRowAddress(row) { return clean(row && row.normalized_address); }

function selectRow(rows, packetItems, input) {
  const matches = rows.filter((row) => {
    const lifecycle = row && row.lifecycle_status && typeof row.lifecycle_status === 'object' ? row.lifecycle_status : {};
    if (lifecycle.quarantined === true || row && row.quarantined === true) return false;
    if (input.queue_key) return clean(row.queue_key) === clean(input.queue_key);
    return compEvidence.addressKey(safeRowAddress(row)) === compEvidence.addressKey(input.address);
  });
  if (matches.length !== 1) return { row: null, reason: matches.length ? 'subject_match_ambiguous' : 'subject_row_not_found' };
  const row = matches[0];
  const packetItem = (Array.isArray(packetItems) ? packetItems : []).find((item) => clean(item.queue_key) === clean(row.queue_key));
  const addressState = clean(row.address_state || packetItem && packetItem.address_state);
  if (addressState !== 'complete_source_address' || !addressEvidence.isSourceSupportedSubjectAddress(row)) {
    return { row, reason: 'address_not_complete_source_supported' };
  }
  return { row, packetItem, reason: '' };
}

function sourceUrlFor(row, site, options = {}) {
  const keys = { zillow: ['zillow_url', 'Zillow'], redfin: ['redfin_url', 'Redfin'], realtor: ['realtor_url', 'Realtor'] };
  const pair = keys[site];
  if (!pair) throw new Error('listing_site_not_allowed');
  const direct = clean(row[ pair[0] ]);
  const localDirect = options.allow_local_source === true && direct && /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(direct);
  if (direct && (hostAllowed(direct, site) || localDirect)) return direct;
  const link = (Array.isArray(row.research_links) ? row.research_links : []).find((item) =>
    new RegExp(pair[1], 'i').test(clean(item && item.label)) && (hostAllowed(item && item.url, site) ||
      (options.allow_local_source === true && /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(clean(item && item.url)))));
  if (link) return clean(link.url);
  const address = safeRowAddress(row);
  if (!address) throw new Error('complete_subject_address_required');
  const encoded = encodeURIComponent(address);
  if (site === 'zillow') return `https://www.zillow.com/homes/${encoded}_rb/`;
  if (site === 'redfin') return `https://www.redfin.com/search?q=${encoded}`;
  return `https://www.realtor.com/realestateandhomes-search/${encoded}`;
}

function soldResultsUrlFor(row, site, options = {}) {
  const override = options.source_urls && clean(options.source_urls[site]);
  const localOverride = options.allow_local_source === true && override && /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(override);
  if (override && (hostAllowed(override, site) || localOverride)) return override;
  if (options.allow_local_source === true) return sourceUrlFor(row, site, options);
  const address = safeRowAddress(row);
  if (!address) throw new Error('complete_subject_address_required');
  const encoded = encodeURIComponent(address);
  if (site === 'zillow') {
    const search = encodeURIComponent(JSON.stringify({ usersSearchTerm: address, filterState: { isRecentlySold: { value: true } } }));
    return `https://www.zillow.com/homes/recently_sold/?searchQueryState=${search}`;
  }
  if (site === 'redfin') return `https://www.redfin.com/search?q=${encoded}&sold_within_days=365`;
  if (site === 'realtor') return `https://www.realtor.com/realestateandhomes-search/${encoded}/show-recently-sold`;
  throw new Error('listing_site_not_allowed');
}

function listingUrlKind(value, options = {}) {
  let url;
  try { url = new URL(value); } catch (_) { return 'other'; }
  if (options.allow_local_source === true && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    return /(?:^|[/-])property-detail(?:[/.]|$)/i.test(url.pathname) ? 'property_detail' :
      /(?:^|[/-])sold(?:[/-]|$)/i.test(url.pathname) ? 'sold_search' :
        /(?:^|[/-])address-search(?:[/.]|$)/i.test(url.pathname) ? 'address_search' : 'other';
  }
  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();
  if (hostname === 'zillow.com' || hostname.endsWith('.zillow.com')) {
    if (pathname.startsWith('/homedetails/')) return 'property_detail';
    if (pathname.startsWith('/homes/recently_sold/')) return 'sold_search';
    if (pathname.startsWith('/homes/')) return 'address_search';
    return 'other';
  }
  if (hostname === 'redfin.com' || hostname.endsWith('.redfin.com')) {
    if (/\/home\/\d+(?:\/|$)/.test(pathname)) return 'property_detail';
    if (pathname.startsWith('/search')) return /(?:^|[?&])sold_within_days=/i.test(url.search) ? 'sold_search' : 'address_search';
    return 'other';
  }
  if (hostname === 'realtor.com' || hostname.endsWith('.realtor.com')) {
    if (pathname.startsWith('/realestateandhomes-detail/')) return 'property_detail';
    if (pathname.startsWith('/realestateandhomes-search/')) return /\/show-recently-sold(?:\/|$)/i.test(pathname) ? 'sold_search' : 'address_search';
  }
  return 'other';
}

function recordVisitedUrl(run, value, options = {}) {
  const url = new URL(value);
  run.pages_visited += 1;
  run.hosts_visited.push(url.hostname);
  run.url_kinds_visited.push({ host: url.hostname, url_kind: listingUrlKind(value, options) });
}

function localSourceAllowed(value, options = {}) {
  try { return options.allow_local_source === true && ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname); }
  catch (_) { return false; }
}

function addressCandidatesFromText(text) {
  const source = clean(text);
  const pattern = /\b\d{1,7}\s+[A-Za-z0-9 .'#-]{2,80}?\s+(?:DR(?:IVE)?|ST(?:REET)?|RD|ROAD|LN|LANE|AVE(?:NUE)?|BLVD|BOULEVARD|CT|COURT|CIR(?:CLE)?|PL(?:ACE)?|TRL|TRAIL|PKWY|PARKWAY|HWY|HIGHWAY|WAY|TER(?:RACE)?),?\s+[A-Za-z .'-]{2,50},?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/gi;
  return source.match(pattern) || [];
}

async function visibleSearchCards(page, site, options = {}) {
  if (typeof options.visible_card_reader_impl === 'function') return options.visible_card_reader_impl(page, site);
  const selectors = SOURCE_SELECTORS[site] || SOURCE_SELECTORS.zillow;
  const sourceCount = await page.locator(selectors.cards).count().catch(() => 0);
  const selector = sourceCount ? selectors.cards : CARD_SELECTOR;
  return page.locator(selector).evaluateAll((elements) => elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    const anchor = element.matches && element.matches('a[href]') ? element : element.querySelector('a[href]');
    return {
      index,
      text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
      href: anchor ? (anchor.getAttribute('href') || anchor.href || '') : '',
      visible: rect.width > 0 && rect.height > 0
    };
  }).filter((item) => item.visible && item.text));
}

async function resolveDetailUrlFromSearch(page, subjectAddress, site, options = {}) {
  const searchUrl = clean(options.search_url);
  if (listingUrlKind(searchUrl, options) !== 'address_search') throw new Error('subject_search_url_required');
  const requestedKind = listingUrlKind(searchUrl, options);
  const resolution = (values) => Object.assign({
    requested_url: searchUrl, final_url: clean(page.url()) || searchUrl,
    redirected: (clean(page.url()) || searchUrl) !== searchUrl,
    url_kind_requested: requestedKind, url_kind_final: listingUrlKind(clean(page.url()) || searchUrl, options)
  }, values);
  let response;
  try { response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: compEvidence.DEFAULT_CAPS.timeout_ms }); }
  catch (error) { return resolution({ blocked: true, reason: safeFailureReason(error), http_status: 0, matches: [] }); }
  const status = response ? response.status() : 0;
  if (status === 403 || status === 429) return resolution({ blocked: true, reason: `http_${status}`, http_status: status, matches: [] });
  const current = clean(page.url());
  if (!hostAllowed(current, site) && !localSourceAllowed(current, options)) {
    return resolution({ blocked: true, reason: 'subject_search_left_allowed_host', http_status: status, matches: [] });
  }
  const finalKind = listingUrlKind(current, options);
  if (finalKind === 'property_detail') return resolution({ blocked: false, direct_redirect: true, detail_url: current, http_status: status, matches: [] });
  if (finalKind !== 'address_search') return resolution({ blocked: true, reason: 'subject_search_redirected_or_wrong_type', http_status: status, matches: [] });
  const bodyText = clean(await page.locator('body').innerText().catch(() => ''));
  if (compEvidence.BLOCKED_TEXT_RE.test(bodyText)) return resolution({ blocked: true, reason: 'blocked_text_detected', http_status: status, matches: [] });
  const selectors = SOURCE_SELECTORS[site] || SOURCE_SELECTORS.zillow;
  const renderWaitMs = Math.max(100, Math.min(Number(options.render_wait_ms) || 5000, 10000));
  await page.locator(`${selectors.container}, ${selectors.cards}`).first().waitFor({ state: 'visible', timeout: renderWaitMs }).catch(() => {});
  const cards = await visibleSearchCards(page, site, options);
  const matches = [];
  for (const card of cards) {
    const displayed = addressCandidatesFromText(card.text).find((candidate) => addressCanonical.addressesMatchExactly(candidate, subjectAddress));
    if (!displayed || !clean(card.href)) continue;
    let detailUrl = '';
    try { detailUrl = new URL(card.href, current).toString(); } catch (_) { continue; }
    if ((!hostAllowed(detailUrl, site) && !localSourceAllowed(detailUrl, options)) || listingUrlKind(detailUrl, options) !== 'property_detail') continue;
    matches.push({ detail_url: detailUrl, matched_card_text: clean(card.text), match_index: card.index });
  }
  if (matches.length === 1) return resolution(Object.assign({ blocked: false, direct_redirect: false, http_status: status }, matches[0]));
  return resolution({ blocked: true, reason: matches.length ? 'ambiguous_address_match' : 'no_exact_address_match_visible', http_status: status, matches });
}

async function detailAddressVerification(page, subjectAddress, options = {}) {
  const texts = typeof options.detail_address_reader_impl === 'function'
    ? await options.detail_address_reader_impl(page)
    : await page.locator('h1, address, [data-testid*="address" i], [class*="address" i]').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }).filter(Boolean)).catch(async () => [clean(await page.locator('body').innerText().catch(() => ''))]);
  for (const text of Array.isArray(texts) ? texts : [texts]) {
    const exact = addressCandidatesFromText(text).find((candidate) => addressCanonical.addressesMatchExactly(candidate, subjectAddress));
    if (exact) return { matched: true, matched_text: clean(text) };
  }
  return { matched: false, matched_text: '' };
}

function appendResolutionStep(run, step) {
  const entry = {
    step: clean(step.step), url: clean(step.url), url_kind: clean(step.url_kind), host: clean(step.host),
    http_status: Number(step.http_status) || 0,
    address_match: ['EXACT', 'NONE', 'AMBIGUOUS', 'NA'].includes(step.address_match) ? step.address_match : 'NA',
    matched_card_text: clean(step.matched_card_text)
  };
  if (run.mode === 'subject_facts') {
    const requestedUrl = clean(step.requested_url || step.url);
    const finalUrl = clean(step.final_url || step.url);
    Object.assign(entry, {
      requested_url: requestedUrl, final_url: finalUrl,
      redirected: typeof step.redirected === 'boolean' ? step.redirected : requestedUrl !== finalUrl,
      url_kind_requested: clean(step.url_kind_requested || step.url_kind),
      url_kind_final: clean(step.url_kind_final || step.url_kind)
    });
  }
  run.resolution_chain.push(entry);
}

function readRateState(file, now, options = {}) {
  const fsImpl = options.fs_impl || fs;
  let state = {};
  try { state = JSON.parse(fsImpl.readFileSync(file, 'utf8')); } catch (_) { state = {}; }
  const cutoff = now - 60 * 60 * 1000;
  return { page_times: (Array.isArray(state.page_times) ? state.page_times : []).map(Number).filter((time) => Number.isFinite(time) && time > cutoff) };
}

function writeState(file, state, options = {}) {
  const fsImpl = options.fs_impl || fs;
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  fsImpl.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function reservePage(file, now, limit, options = {}) {
  const state = readRateState(file, now, options);
  if (state.page_times.length >= limit) return false;
  state.page_times.push(now);
  writeState(file, state, options);
  return true;
}

function acquireRunLock(file = RUN_LOCK) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const token = `${process.pid}:${crypto.randomUUID()}`;
  let descriptor;
  try {
    descriptor = fs.openSync(file, 'wx');
  } catch (error) {
    if (!error || error.code !== 'EEXIST') throw error;
    let ownerPid = 0;
    try { ownerPid = Number(fs.readFileSync(file, 'utf8').split(':')[0]) || 0; } catch (_) { ownerPid = 0; }
    let ownerAlive = false;
    if (ownerPid > 0) {
      try { process.kill(ownerPid, 0); ownerAlive = true; } catch (probeError) { ownerAlive = probeError && probeError.code === 'EPERM'; }
    }
    if (ownerAlive) throw Object.assign(new Error('capture_already_running'), { code: 'capture_already_running' });
    fs.unlinkSync(file);
    descriptor = fs.openSync(file, 'wx');
  }
  try { fs.writeFileSync(descriptor, token); } finally { fs.closeSync(descriptor); }
  return () => {
    try { if (fs.readFileSync(file, 'utf8') === token) fs.unlinkSync(file); } catch (_) { /* Lock may already be gone. */ }
  };
}

function cleanRunLog(value) {
  if (!SUPPORTED_MODES.includes(value.requested_mode) || value.requested_mode !== value.effective_mode ||
      value.effective_mode !== value.mode) throw new Error('capture_mode_mismatch');
  const chain = Array.isArray(value.resolution_chain) ? value.resolution_chain : [];
  if (value.mode === 'subject_facts') {
    if (chain.length > 2 || (value.url_kinds_visited || []).some((item) => item.url_kind === 'sold_search')) {
      throw new Error('subject_navigation_invariant_failed');
    }
    if (Number(value.proposals) > 0) {
      const terminal = chain[chain.length - 1] || {};
      if ((terminal.url_kind_final || terminal.url_kind) !== 'property_detail' || terminal.address_match !== 'EXACT') throw new Error('subject_proposal_resolution_chain_incomplete');
    }
  }
  return {
    data_kind: 'OPERATOR_LOCAL_CAPTURE_RUN',
    mode: value.mode,
    helper_build: value.helper_build,
    requested_mode: value.requested_mode,
    effective_mode: value.effective_mode,
    url_kinds_visited: value.url_kinds_visited,
    resolution_chain: chain,
    started_at: value.started_at,
    completed_at: value.completed_at,
    elapsed_ms: value.elapsed_ms,
    subject_address: value.subject_address || '',
    rows_attempted: value.rows_attempted,
    pages_visited: value.pages_visited,
    hosts_visited: Array.from(new Set(value.hosts_visited)),
    captures_submitted: value.captures_submitted,
    active_listing_context_captures: value.active_listing_context_captures || 0,
    discards: value.discards,
    block_events: value.block_events,
    source_results: Array.isArray(value.source_results) ? value.source_results : [],
    screenshots: Number(value.screenshots) || 0,
    proposals: Number(value.proposals) || 0,
    outcome: value.outcome,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    not_a_saved_lead: true
  };
}

function incrementDiscard(result, reasonCode, detail) {
  const code = clean(reasonCode).toUpperCase() || 'GRID_REJECTED_OTHER';
  const existing = result.discards.find((item) => item.reason_code === code && clean(item.detail) === clean(detail));
  if (existing) existing.count += 1;
  else result.discards.push({ reason_code: code, count: 1, ...(detail ? { detail: clean(detail).slice(0, 160) } : {}) });
}

function gridDiscardCode(reason) {
  const value = clean(reason).toLowerCase();
  if (/distance|one[_ -]?mile|radius/.test(value)) return 'DISTANCE_OVER_ONE_MILE';
  if (/sale.*(?:date|window)|date.*(?:outside|window|stale)/.test(value)) return 'SOLD_DATE_OUTSIDE_WINDOW';
  if (/price.*(?:floor|minimum|nominal)|below.*price|nominal|non[_ -]?market.*price/.test(value)) return 'PRICE_BELOW_FLOOR';
  if (/(?:property|land[_ -]?use).*type|type.*mismatch/.test(value)) return 'PROPERTY_TYPE_MISMATCH';
  return 'GRID_REJECTED_OTHER';
}

function visibleFieldState(text) {
  const value = clean(text);
  return {
    price: PRICE_VISIBLE_RE.test(value),
    date: SOLD_DATE_VISIBLE_RE.test(value),
    address: ADDRESS_VISIBLE_RE.test(value)
  };
}

function emptySourceResult(site, url) {
  return {
    source: site,
    source_url: url || '',
    url_kind: 'unknown',
    page_state: 'unknown',
    cards_detected: 0,
    cards_with_price: 0,
    cards_with_date: 0,
    cards_with_address: 0,
    candidates_built: 0,
    discards: [],
    screenshots: 0,
    proposals: 0,
    outcome_code: 'WRONG_PAGE_TYPE'
  };
}

async function waitForSoldRender(page, site, options = {}) {
  const selectors = SOURCE_SELECTORS[site] || SOURCE_SELECTORS.zillow;
  const timeout = Math.max(100, Math.min(Number(options.render_wait_ms) || 5000, 10000));
  try {
    await page.locator(`${selectors.container}, ${selectors.cards}`).first().waitFor({ state: 'visible', timeout });
    return { rendered: true, timed_out: false };
  } catch (_) {
    return { rendered: false, timed_out: true };
  }
}

async function inspectSoldPage(page, status, site, sourceUrl, subjectAddress, options = {}, state = '') {
  const result = emptySourceResult(site, sourceUrl);
  const currentUrl = clean(page.url());
  const localAllowed = options.allow_local_source === true && /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(currentUrl);
  if (status === 403 || status === 429) {
    result.url_kind = 'blocked'; result.page_state = 'blocked'; result.outcome_code = 'BLOCKED_STOPPED';
    incrementDiscard(result, `HTTP_${status}`);
    return { result, cards: [] };
  }
  if (!hostAllowed(currentUrl, site) && !localAllowed) {
    result.url_kind = 'blocked'; result.page_state = 'blocked'; result.outcome_code = 'BLOCKED_STOPPED';
    incrementDiscard(result, 'REDIRECTED_OUTSIDE_ALLOWED_LISTING_HOST');
    return { result, cards: [] };
  }
  const bodyText = clean(await page.locator('body').innerText().catch(() => '')).slice(0, 30000);
  if (compEvidence.BLOCKED_TEXT_RE.test(bodyText)) {
    result.url_kind = 'blocked'; result.page_state = 'blocked'; result.outcome_code = 'BLOCKED_STOPPED';
    incrementDiscard(result, 'BLOCKED_TEXT_DETECTED');
    return { result, cards: [] };
  }
  const render = await waitForSoldRender(page, site, options);
  const selectors = SOURCE_SELECTORS[site] || SOURCE_SELECTORS.zillow;
  const containerCount = await page.locator(selectors.container).count().catch(() => 0);
  const sourceCardCount = await page.locator(selectors.cards).count().catch(() => 0);
  const cardSelector = sourceCardCount ? selectors.cards : CARD_SELECTOR;
  const cardData = await page.locator(cardSelector).evaluateAll((elements) => elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    const anchor = element.matches && element.matches('a[href]') ? element : element.querySelector('a[href]');
    return {
      index, text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
      href: anchor ? (anchor.getAttribute('href') || anchor.href || '') : '', visible: rect.width > 0 && rect.height > 0
    };
  }).filter((item) => item.visible && item.text && item.text.length <= 5000));
  const currentText = clean(await page.locator('body').innerText().catch(() => bodyText)).slice(0, 30000);
  const explicitEmpty = /\b(?:0\s+(?:homes|properties|results)|no\s+(?:sold\s+)?(?:homes|properties|results)\s+(?:found|available)|no matches)\b/i.test(currentText) ||
    await page.locator('[data-empty-sold-results], [data-testid="no-results"]').count().catch(() => 0) > 0;
  const propertyDetail = /\/(?:homedetails|home)\//i.test(currentUrl) || (containerCount > 0 && /\b(?:list|asking)\s+price\b/i.test(currentText) && !/\brecently sold\b/i.test(currentText));
  const soldSignal = /\b(?:recently\s+sold|sold\s+homes?|sold\s+properties|show-recently-sold)\b/i.test(`${currentUrl} ${currentText}`);
  const searchSignal = await page.locator('form[role="search"], input[type="search"], [aria-label*="search" i]').count().catch(() => 0) > 0;
  if (propertyDetail) result.url_kind = 'property_detail';
  else if (soldSignal || explicitEmpty) result.url_kind = 'sold_results';
  else if (searchSignal || cardData.length) result.url_kind = 'search_results';
  else result.url_kind = 'unknown';
  result.page_state = render.timed_out ? 'client_render_timeout' : 'loaded';
  result.cards_detected = cardData.length;
  for (const card of cardData) {
    try { card.source_url = new URL(card.href, currentUrl).toString(); } catch (_) { card.source_url = ''; }
    if (card.source_url && !hostAllowed(card.source_url, site) && !localSourceAllowed(card.source_url, options)) card.source_url = '';
    const fields = visibleFieldState(card.text);
    if (fields.price) result.cards_with_price += 1;
    if (fields.date) result.cards_with_date += 1;
    if (fields.address) result.cards_with_address += 1;
    const candidates = compEvidence.extractCompCandidatesFromVisibleText(card.text, { state, source_url: card.source_url || sourceUrl });
    for (const candidate of candidates) {
      result.candidates_built += 1;
      card.candidates = (card.candidates || []).concat([candidate]);
    }
  }
  if (result.url_kind !== 'sold_results') result.outcome_code = 'WRONG_PAGE_TYPE';
  else if (!cardData.length && explicitEmpty) result.outcome_code = 'NO_SOLD_CARDS_ON_PAGE';
  else if (!cardData.length && containerCount > 0) result.outcome_code = 'SELECTOR_MATCHED_NOTHING';
  else if (!cardData.length) result.outcome_code = render.timed_out ? 'SELECTOR_MATCHED_NOTHING' : 'NO_SOLD_CARDS_ON_PAGE';
  else result.outcome_code = 'CARDS_MISSING_REQUIRED_FIELDS';
  return { result, cards: cardData, card_selector: cardSelector, container_count: containerCount };
}

function writeRunLog(run, logDir) {
  const log = cleanRunLog(run);
  fs.mkdirSync(logDir || LOG_DIR, { recursive: true });
  const file = path.join(logDir || LOG_DIR, `${run.started_at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(log, null, 2));
  return { run: log, log_path: file };
}

async function activeListingRegion(page) {
  const matches = await page.locator('body *').evaluateAll((elements) => elements.map((element, index) => {
    const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    const rect = element.getBoundingClientRect();
    return { index, text, visible: rect.width > 0 && rect.height > 0 };
  }).filter((item) => item.visible && item.text.length <= 500 && /\b(?:list|asking)\s+price\b/i.test(item.text) && /\$\s?[\d,]{4,}/.test(item.text)));
  return matches.sort((a, b) => a.text.length - b.text.length)[0] || null;
}

async function parseVisibleCards(page, state, sourceUrl, subjectAddress) {
  const cardData = await page.locator(CARD_SELECTOR).evaluateAll((elements) => elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    return { index, text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(), visible: rect.width > 0 && rect.height > 0 };
  }).filter((item) => item.visible && item.text && item.text.length <= 5000));
  const byAddress = new Map();
  for (const card of cardData) {
    const extracted = compEvidence.extractCompCandidatesFromVisibleText(card.text, { state, source_url: sourceUrl });
    for (const candidate of extracted) {
      if (!candidate.comp_address || !candidate.sold_date || !(Number(candidate.sold_price) > 0)) continue;
      if (compEvidence.addressKey(candidate.comp_address) === compEvidence.addressKey(subjectAddress)) continue;
      const previous = byAddress.get(compEvidence.addressKey(candidate.comp_address));
      if (!previous || card.text.length < previous.text_length) {
        byAddress.set(compEvidence.addressKey(candidate.comp_address), Object.assign({}, candidate, { locator_index: card.index, text_length: card.text.length }));
      }
    }
  }
  return Array.from(byAddress.values()).slice(0, 4);
}

async function pageClassification(page, status, site, sourceUrl, options = {}, state = '') {
  const currentUrl = clean(page.url());
  if (status === 403 || status === 429) return { type: 'blocked', reason: `http_${status}`, text: '' };
  const localAllowed = options.allow_local_source === true && /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(currentUrl);
  if (!hostAllowed(currentUrl, site) && !localAllowed) return { type: 'blocked', reason: 'redirected_outside_allowed_listing_host', text: '' };
  const text = clean(await page.locator('body').innerText().catch(() => '')).slice(0, 30000);
  if (compEvidence.BLOCKED_TEXT_RE.test(text)) return { type: 'blocked', reason: 'blocked_text_detected', text };
  const cards = await page.locator(CARD_SELECTOR).count().catch(() => 0);
  const mainRegion = await page.locator('main').count().catch(() => 0);
  const searchStructure = await page.locator('form[role="search"], input[type="search"], [aria-label*="search" i]').count().catch(() => 0);
  const sold = compEvidence.extractCompCandidatesFromVisibleText(text, { source_url: sourceUrl, state }).length > 0;
  // Listing detail pages need not contain a <main>; the exact address is checked before capture.
  if (listingUrlKind(currentUrl, options) === 'property_detail') return { type: 'property_detail', reason: '', text };
  if (sold && cards > 0) return { type: 'sold_results', reason: '', text };
  if (mainRegion > 0 && /\b(?:list|asking)\s+price\b/i.test(text)) return { type: 'property_detail', reason: '', text };
  if (cards > 0 || searchStructure > 0) return { type: 'search_results', reason: '', text };
  return { type: 'unknown', reason: 'page_type_unknown', text };
}

function nextPageUrl(page, site) {
  return page.locator('a[rel="next"], a[aria-label*="next" i], a[title*="next" i]').evaluateAll((links) => links
    .map((link) => ({ href: link.href, text: (link.innerText || link.getAttribute('aria-label') || '').trim() }))
    .filter((link) => link.href && /next/i.test(link.text))[0]?.href || '').then((url) => hostAllowed(url, site) ? url : '');
}

async function uploadImage({ fetchImpl, dashboard, agentToken, market, row, sourceName, sourceUrl, type, buffer, filename }) {
  const items = await uploadImageDetailed({ fetchImpl, dashboard, agentToken, market, row, sourceName, sourceUrl, type, buffer, filename });
  return items.length;
}

async function uploadImageDetailed({ fetchImpl, dashboard, agentToken, market, row, sourceName, sourceUrl, type, buffer, filename }) {
  const captureMs = Math.max(Date.now(), lastUploadCaptureMs + 1);
  lastUploadCaptureMs = captureMs;
  const capturedAt = new Date(captureMs).toISOString();
  const form = new FormData();
  form.set('market', JSON.stringify(market));
  form.set('queue_key', clean(row.queue_key));
  form.set('evidence_type', type);
  form.set('source_name', sourceName);
  form.set('source_url', sourceUrl);
  form.set('captured_at', capturedAt);
  form.set('screenshot', new Blob([buffer], { type: 'image/png' }), filename);
  const response = await fetchImpl(`${dashboard}/api/dashboard/free-public-deal-board/manual-evidence/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${agentToken}` }, body: form
  });
  let body;
  try { body = await response.json(); } catch (_) { body = null; }
  if (response.status === 401) throw Object.assign(new Error('Helper pairing expired. Pair the helper again from the dashboard.'), { code: 'helper_pairing_expired' });
  if (!response.ok || !body || body.ok !== true) throw new Error(`upload_failed_http_${response.status || 0}:${clean(body && (body.code || body.error) || 'invalid_response')}`);
  if (body.preview_only !== true || body.should_ingest !== false || body.no_global_mutation !== true) throw new Error('upload_response_safety_invariant_failed');
  const evidenceItems = body.manual_evidence_item && body.manual_evidence_item.packet && body.manual_evidence_item.packet.evidence_items;
  const screenshots = body.manual_evidence_item && body.manual_evidence_item.packet && body.manual_evidence_item.packet.screenshots;
  const newScreenshotIds = new Set((Array.isArray(screenshots) ? screenshots : [])
    .filter((shot) => shot.captured_at === capturedAt && shot.source_name === sourceName)
    .map((shot) => clean(shot.screenshot_id)).filter(Boolean));
  const newEvidenceItems = (Array.isArray(evidenceItems) ? evidenceItems : []).filter((item) => newScreenshotIds.has(clean(item.screenshot_id)));
  if (!newEvidenceItems.length || newEvidenceItems.some((item) => item.operator_confirmed !== false)) throw new Error('upload_response_must_remain_unconfirmed_proposals');
  return newEvidenceItems;
}

function subjectFactsFromVisibleText(text, sourceUrl) {
  const source = clean(text);
  const fields = { source_url: clean(sourceUrl) };
  const propertyKind = source.match(/\b(single[- ]family(?: home| residence)?|townhouse|townhome|condo(?:minium)?|duplex|triplex|fourplex|multi[- ]family|manufactured home|mobile home)\b/i);
  const beds = source.match(/\b(\d+(?:\.\d+)?)\s*(?:beds?|bds?|bedrooms?)\b/i);
  const baths = source.match(/\b(\d+(?:\.\d+)?)\s*(?:baths?|bas?|bathrooms?)\b/i);
  const sqft = source.match(/\b([\d,]{3,8})\s*(?:sq\.?\s*ft\.?|sqft|square feet)\b/i);
  const yearBuilt = source.match(/\b(?:year\s+built|built\s+in|built)\s*:?\s*((?:18|19|20)\d{2})\b/i);
  const lotSize = source.match(/\blot(?:\s+size)?\s*:?\s*([\d,.]+)\s*(acres?|sq\.?\s*ft\.?|sqft|square feet)\b/i);
  const latitude = source.match(/\blat(?:itude)?\s*:?\s*(-?\d{1,3}\.\d{4,})\b/i);
  const longitude = source.match(/\blon(?:gitude)?\s*:?\s*(-?\d{1,3}\.\d{4,})\b/i);
  const listPrice = source.match(/(?:list|asking)\s+price[^$\d]{0,20}(\$[\d,]+)/i);
  const publicEstimate = source.match(/(?:zestimate|(?:redfin|realtor)(?:\.com)?\s+estimate|estimated\s+market\s+value|zillow\s+estimate)[^$\d]{0,30}(\$[\d,]+)/i);
  if (propertyKind) fields.property_kind = clean(propertyKind[1]).toLowerCase();
  if (beds) fields.beds = clean(beds[1]);
  if (baths) fields.baths = clean(baths[1]);
  if (sqft) fields.sqft = clean(sqft[1]).replace(/,/g, '');
  if (yearBuilt) fields.year_built = clean(yearBuilt[1]);
  if (lotSize) fields.lot_size = `${clean(lotSize[1])} ${clean(lotSize[2]).toLowerCase()}`;
  if (latitude) fields.latitude = clean(latitude[1]);
  if (longitude) fields.longitude = clean(longitude[1]);
  if (listPrice) fields.list_price = clean(listPrice[1]);
  if (publicEstimate) fields.public_estimate = clean(publicEstimate[1]);
  return fields;
}

async function recordSubjectProposalFields({ fetchImpl, dashboard, agentToken, market, row, evidenceId, fields }) {
  const response = await fetchImpl(`${dashboard}/api/dashboard/free-public-deal-board/manual-evidence/proposal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ market, queue_key: clean(row.queue_key), evidence_id: evidenceId, operator_confirmed: false, fields })
  });
  let body;
  try { body = await response.json(); } catch (_) { body = null; }
  if (response.status === 401) throw Object.assign(new Error('Helper pairing expired. Pair the helper again from the dashboard.'), { code: 'helper_pairing_expired' });
  if (!response.ok || !body || body.ok !== true) throw new Error(`proposal_failed_http_${response.status || 0}:${clean(body && (body.code || body.error) || 'invalid_response')}`);
  if (body.preview_only !== true || body.should_ingest !== false || body.no_global_mutation !== true) throw new Error('proposal_response_safety_invariant_failed');
  const items = body.manual_evidence_item && body.manual_evidence_item.packet && body.manual_evidence_item.packet.evidence_items;
  const item = (Array.isArray(items) ? items : []).find((entry) => clean(entry && entry.evidence_id) === clean(evidenceId));
  if (!item || item.operator_confirmed !== false || item.operator_confirmation && item.operator_confirmation.confirmed === true) {
    throw new Error('subject_proposal_must_remain_unconfirmed');
  }
  return item;
}

async function recognizeLocal(buffer, options, kind) {
  if (typeof options.ocr_impl === 'function') return clean(await options.ocr_impl(buffer, { kind }));
  const tesseract = require('tesseract.js');
  const result = await tesseract.recognize(buffer, 'eng', { logger: () => {} });
  return clean(result && result.data && result.data.text);
}

async function runCapture(input = {}, options = {}) {
  const mode = input.mode;
  if (!SUPPORTED_MODES.includes(mode)) throw new Error('capture_mode_required');
  const now = options.now_impl || Date.now;
  const fetchImpl = options.fetch_impl || global.fetch;
  const started = now();
  const run = {
    started_at: new Date(started).toISOString(), mode, requested_mode: mode, effective_mode: mode,
    helper_build: HELPER_BUILD, url_kinds_visited: [], resolution_chain: [], subject_address: '', rows_attempted: 0, active_listing_context_captures: 0,
    pages_visited: 0, hosts_visited: [], captures_submitted: 0, discards: [], block_events: [], source_results: [],
    screenshots: 0, proposals: 0, outcome: 'started'
  };
  Object.defineProperty(run, 'mode', { value: mode, enumerable: true, writable: false });
  const site = clean(input.site || 'zillow').toLowerCase();
  if (!SITE_HOSTS[site]) throw new Error('listing_site_not_allowed');
  if (!input.market || !input.agent_token || !input.dashboard_url) throw new Error('market_dashboard_and_agent_session_required');
  const market = typeof input.market === 'string' ? parseMarket(input.market) : input.market;
  const dashboard = dashboardOrigin(input.dashboard_url);
  const agentToken = clean(input.agent_token);
  const latestUrl = new URL('/api/dashboard/free-public-deal-board/latest', dashboard);
  latestUrl.search = new URLSearchParams({ city: market.city, county: market.county, state: market.state }).toString();
  const latestResponse = await fetchImpl(latestUrl.toString(), { headers: { Authorization: `Bearer ${agentToken}` } });
  if (latestResponse.status === 401) throw Object.assign(new Error('Helper pairing expired. Pair the helper again from the dashboard.'), { code: 'helper_pairing_expired' });
  if (!latestResponse.ok) throw new Error(`latest_snapshot_request_failed_http_${latestResponse.status}`);
  const latest = await latestResponse.json();
  const selected = selectRow(latest.rows, latest.manual_evidence_packet && latest.manual_evidence_packet.items, input);
  if (!selected.row || selected.reason) {
    run.outcome = selected.reason || 'row_not_found';
    run.completed_at = new Date(now()).toISOString();
    run.elapsed_ms = now() - started;
    return writeRunLog(run, options.log_dir || LOG_DIR);
  }
  const row = selected.row;
  run.rows_attempted = 1;
  run.subject_address = safeRowAddress(row);
  const subjectTarget = mode === 'subject_facts' ? sourceUrlFor(row, site, options) : '';
  if (mode === 'subject_facts' && !['address_search', 'property_detail'].includes(listingUrlKind(subjectTarget, options))) {
    run.outcome = 'subject_target_not_property_detail';
    run.completed_at = new Date(now()).toISOString();
    run.elapsed_ms = now() - started;
    return writeRunLog(run, options.log_dir || LOG_DIR);
  }
  const sites = options.allow_local_source === true && !options.source_urls
    ? [site]
    : (Array.isArray(options.source_order) && options.source_order.length ? options.source_order : SOURCE_ORDER).filter((value) => SITE_HOSTS[value]);
  const crossSourceDedup = sites.length > 1;
  const playwright = options.playwright_impl || require('playwright');
  const browserLauncher = options.browser_resolver_impl || resolver.launchChromiumWithResolvedBrowser;
  let launched;
  try { launched = await browserLauncher(playwright, { headless: options.headless === true }); }
  catch (error) {
    run.outcome = `browser_unavailable:${clean(error && error.message || error).slice(0, 120)}`;
    run.completed_at = new Date(now()).toISOString();
    run.elapsed_ms = now() - started;
    return writeRunLog(run, options.log_dir || LOG_DIR);
  }
  const browser = launched.browser;
  let page;
  try {
    const context = await browser.newContext();
    if (typeof options.on_browser_context_impl === 'function') options.on_browser_context_impl(context);
    if (typeof context.route === 'function') {
      await context.route('**/*', (route) => {
        let url;
        try { url = new URL(route.request().url()); } catch (_) { return route.abort(); }
        if (mode === 'subject_facts' && route.request().isNavigationRequest() &&
            !['address_search', 'property_detail'].includes(listingUrlKind(url.toString(), options))) return route.abort();
        const localAllowed = options.allow_local_source === true && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
        const listingHost = SOURCE_ORDER.some((source) => url.hostname === SITE_HOSTS[source] || url.hostname.endsWith(`.${SITE_HOSTS[source]}`));
        return (localAllowed || url.protocol === 'data:' || url.protocol === 'blob:' || listingHost)
          ? route.continue()
          : route.abort();
      });
    }
    page = await context.newPage();
    page.setDefaultTimeout(compEvidence.DEFAULT_CAPS.timeout_ms);
    let shots = 0;
    let blockedSources = 0;
    const minimumProposals = Math.max(3, Number(options.minimum_proposals) || 3);
    const uploadedAddresses = new Set();
    if (run.mode === 'subject_facts') {
      let target = subjectTarget;
      const initialKind = listingUrlKind(target, options);
      let detailNeedsReservation = false;
      let directRedirect = false;
      let redirectResolution = null;
      if (!reservePage(options.rate_state_path || RATE_STATE, now(), 30)) {
        run.discards.push({ reason: 'pages_per_hour_limit_30' });
      } else if (initialKind === 'address_search') {
        recordVisitedUrl(run, target, options);
        const resolved = await resolveDetailUrlFromSearch(page, run.subject_address, site, Object.assign({}, options, { search_url: target }));
        if (resolved.blocked) {
          appendResolutionStep(run, {
            step: 'address_search', url: resolved.final_url || target,
            url_kind: resolved.url_kind_final || 'address_search', host: new URL(resolved.final_url || target).hostname,
            requested_url: resolved.requested_url, final_url: resolved.final_url, redirected: resolved.redirected,
            url_kind_requested: resolved.url_kind_requested, url_kind_final: resolved.url_kind_final,
            http_status: resolved.http_status, address_match: resolved.reason === 'ambiguous_address_match' ? 'AMBIGUOUS' : 'NONE',
            matched_card_text: resolved.matched_card_text || ''
          });
          run.outcome = resolved.reason;
          if (/^(?:http_403|http_429|blocked_text_detected|navigation_timeout|browser_navigation_failed)$/.test(resolved.reason)) {
            run.block_events.push({ host: new URL(target).hostname, reason: resolved.reason });
          } else run.discards.push({ host: new URL(target).hostname, reason: resolved.reason.toUpperCase() });
          target = '';
        } else {
          target = resolved.detail_url;
          directRedirect = resolved.direct_redirect === true;
          redirectResolution = resolved;
          detailNeedsReservation = !directRedirect;
          if (!directRedirect) appendResolutionStep(run, {
            step: 'address_search', url: resolved.final_url || resolved.requested_url || subjectTarget,
            url_kind: 'address_search', host: new URL(resolved.final_url || subjectTarget).hostname,
            requested_url: resolved.requested_url, final_url: resolved.final_url, redirected: resolved.redirected,
            url_kind_requested: resolved.url_kind_requested, url_kind_final: resolved.url_kind_final,
            http_status: resolved.http_status, address_match: 'EXACT', matched_card_text: resolved.matched_card_text || ''
          });
        }
      }
      if (target && detailNeedsReservation && run.pages_visited < 2) {
        if (!reservePage(options.rate_state_path || RATE_STATE, now(), 30)) {
          run.discards.push({ reason: 'pages_per_hour_limit_30' });
          target = '';
        }
      }
      if (target) {
        if (listingUrlKind(target, options) !== 'property_detail') throw new Error('subject_target_not_property_detail');
        let response;
        let navigationFailure = '';
        if (directRedirect) response = { status: () => redirectResolution.http_status };
        else {
          recordVisitedUrl(run, target, options);
          try { response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: compEvidence.DEFAULT_CAPS.timeout_ms }); }
          catch (error) { navigationFailure = safeFailureReason(error); }
        }
        const status = response ? response.status() : 0;
        const resolutionFields = directRedirect ? {
          requested_url: redirectResolution.requested_url, final_url: redirectResolution.final_url,
          redirected: redirectResolution.redirected, url_kind_requested: redirectResolution.url_kind_requested,
          url_kind_final: redirectResolution.url_kind_final
        } : {
          requested_url: target, final_url: clean(page.url()) || target, redirected: clean(page.url()) !== target,
          url_kind_requested: 'property_detail', url_kind_final: listingUrlKind(clean(page.url()) || target, options)
        };
        if (navigationFailure || status === 403 || status === 429) {
          const reason = navigationFailure || `http_${status}`;
          appendResolutionStep(run, Object.assign({ step: directRedirect ? 'address_search' : 'property_detail', url: target, url_kind: 'property_detail', host: new URL(target).hostname, http_status: status, address_match: 'NA' }, resolutionFields));
          run.block_events.push({ host: new URL(target).hostname, reason });
          run.outcome = 'BLOCKED_STOPPED';
        } else {
          const classification = await pageClassification(page, status, site, target, options, market.state);
          if (classification.type === 'blocked' || classification.type === 'unknown' || classification.type !== 'property_detail') {
            const reason = classification.reason || (classification.type === 'property_detail' ? '' : 'subject_property_detail_required');
            appendResolutionStep(run, Object.assign({ step: directRedirect ? 'address_search' : 'property_detail', url: target, url_kind: listingUrlKind(page.url(), options), host: new URL(target).hostname, http_status: status, address_match: 'NA' }, resolutionFields));
            run.block_events.push({ host: new URL(target).hostname, reason });
            run.outcome = classification.type === 'blocked' ? 'BLOCKED_STOPPED' : 'WRONG_PAGE_TYPE';
          } else {
            const verification = await detailAddressVerification(page, run.subject_address, options);
            appendResolutionStep(run, Object.assign({
              step: directRedirect ? 'address_search' : 'property_detail', url: target, url_kind: 'property_detail', host: new URL(target).hostname,
              http_status: status, address_match: verification.matched ? 'EXACT' : 'NONE', matched_card_text: verification.matched_text
            }, resolutionFields));
            if (!verification.matched) {
              run.outcome = 'detail_page_address_mismatch';
              run.discards.push({ host: new URL(target).hostname, reason: 'DETAIL_PAGE_ADDRESS_MISMATCH' });
            } else {
              const region = await page.locator('main').count().catch(() => 0) ? page.locator('main').first() : page.locator('body');
              const buffer = await region.screenshot({ type: 'png' });
              shots = 1;
              run.screenshots = 1;
              if (typeof options.on_capture_impl === 'function') options.on_capture_impl(buffer, { kind: 'subject_property', host: new URL(target).hostname, index: 1 });
              let ocrText = '';
              try { ocrText = await recognizeLocal(buffer, options, 'subject_property'); }
              catch (_) { /* Missing OCR remains an honest no-proposal result. */ }
              const fields = subjectFactsFromVisibleText(ocrText, target);
              const proposedNames = Object.keys(fields).filter((name) => name !== 'source_url');
              if (!proposedNames.length) {
                run.discards.push({ host: new URL(target).hostname, reason: 'SUBJECT_FACTS_NOT_VISIBLE' });
                run.outcome = 'NO_SUBJECT_FACTS_VISIBLE';
              } else {
                const items = await uploadImageDetailed({
                  fetchImpl, dashboard, agentToken, market, row, sourceName: SITE_HOSTS[site], sourceUrl: target,
                  type: 'subject_property', buffer, filename: 'subject-property.png'
                });
                if (items.length !== 1) throw new Error('subject_capture_must_create_one_proposal');
                await recordSubjectProposalFields({ fetchImpl, dashboard, agentToken, market, row, evidenceId: items[0].evidence_id, fields });
                run.captures_submitted = 1;
                run.active_listing_context_captures = 1;
                run.proposals = 1;
                run.outcome = 'SUBJECT_FACT_PROPOSAL_CREATED';
              }
            }
          }
        }
      }
    } else for (const currentSite of sites) {
      let target = '';
      try { target = soldResultsUrlFor(row, currentSite, options); }
      catch (error) {
        const unavailable = emptySourceResult(currentSite, '');
        incrementDiscard(unavailable, clean(error && error.message || error) || 'LISTING_URL_UNAVAILABLE');
        run.source_results.push(unavailable);
        continue;
      }
      if (run.pages_visited >= 30) { run.discards.push({ reason: 'per_run_page_limit_30' }); break; }
      if (run.pages_visited >= compEvidence.DEFAULT_CAPS.max_pages_per_row) { run.discards.push({ reason: 'per_row_page_limit' }); break; }
      const rateStatePath = options.rate_state_path || RATE_STATE;
      if (!reservePage(rateStatePath, now(), 30)) { run.discards.push({ reason: 'pages_per_hour_limit_30' }); break; }
      recordVisitedUrl(run, target, options);
      if (now() - started > compEvidence.DEFAULT_CAPS.total_budget_ms) {
        run.discards.push({ reason: 'total_runtime_budget_90_seconds' });
        break;
      }
      let response;
      try { response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: compEvidence.DEFAULT_CAPS.timeout_ms }); }
      catch (error) {
        appendResolutionStep(run, { step: 'sold_search', url: target, url_kind: 'sold_search', host: new URL(target).hostname, http_status: 0, address_match: 'NA' });
        const failed = emptySourceResult(currentSite, target);
        failed.page_state = 'unknown';
        incrementDiscard(failed, 'NAVIGATION_FAILED', safeFailureReason(error));
        run.source_results.push(failed);
        continue;
      }
      const status = response ? response.status() : 0;
      appendResolutionStep(run, { step: 'sold_search', url: target, url_kind: 'sold_search', host: new URL(target).hostname, http_status: status, address_match: 'NA' });
      const inspected = await inspectSoldPage(page, status, currentSite, target, run.subject_address, options, market.state);
      const sourceResult = inspected.result;
      run.source_results.push(sourceResult);
      if (sourceResult.outcome_code === 'BLOCKED_STOPPED') {
        blockedSources += 1;
        const diagnostic = sourceResult.discards[0] && sourceResult.discards[0].reason_code || 'BLOCKED_STOPPED';
        run.block_events.push({ host: new URL(target).hostname, reason: diagnostic.toLowerCase() });
        if (blockedSources >= 2) break;
        continue;
      }
      if (sourceResult.url_kind === 'unknown') {
        run.block_events.push({ host: new URL(target).hostname, reason: 'page_type_unknown' });
        continue;
      }
      if (sourceResult.url_kind === 'property_detail' && shots < compEvidence.DEFAULT_CAPS.max_screenshots_per_row) {
        const listingRegion = await activeListingRegion(page);
        if (listingRegion) {
          const buffer = await page.locator('body *').nth(listingRegion.index).screenshot({ type: 'png' });
          shots += 1;
          let ocrText = '';
          try { ocrText = await recognizeLocal(buffer, options, 'subject_property'); }
          catch (_) { /* No OCR result means no proposal. */ }
          if (/\b(?:list|asking)\s+price\b/i.test(ocrText) && /\$\s?[\d,]{4,}/.test(ocrText)) {
            const proposalCount = await uploadImage({
              fetchImpl, dashboard, agentToken, market, row, sourceName: SITE_HOSTS[currentSite],
              sourceUrl: target, type: 'subject_property', buffer, filename: `subject-listing-${shots}.png`
            });
            run.active_listing_context_captures += 1;
            if (!proposalCount) run.discards.push({ host: new URL(target).hostname, reason: 'server_created_no_active_listing_proposal' });
          } else {
            run.discards.push({ host: new URL(target).hostname, reason: 'active_listing_ocr_did_not_confirm_labeled_price' });
          }
        }
      }
      if (sourceResult.url_kind !== 'sold_results') continue;
      for (const card of inspected.cards) {
        if (shots >= compEvidence.DEFAULT_CAPS.max_screenshots_per_row) break;
        if (!card.source_url) { incrementDiscard(sourceResult, 'MISSING_SOURCE_URL'); continue; }
        const fields = visibleFieldState(card.text);
        if (!fields.price) { incrementDiscard(sourceResult, 'MISSING_SOLD_PRICE'); continue; }
        if (!fields.date) { incrementDiscard(sourceResult, 'MISSING_SOLD_DATE'); continue; }
        if (!fields.address) { incrementDiscard(sourceResult, 'MISSING_ADDRESS'); continue; }
        const candidate = (card.candidates || [])[0];
        if (!candidate) { incrementDiscard(sourceResult, 'GRID_REJECTED_OTHER', 'visible fields did not produce a deterministic candidate'); continue; }
        const candidateKey = compEvidence.addressKey(candidate.comp_address);
        if (candidateKey === compEvidence.addressKey(run.subject_address)) { incrementDiscard(sourceResult, 'ADDRESS_EQUALS_SUBJECT'); continue; }
        if (uploadedAddresses.has(candidateKey)) { incrementDiscard(sourceResult, 'GRID_REJECTED_OTHER', 'duplicate address already captured from an earlier source'); continue; }
        const region = page.locator(inspected.card_selector).nth(card.index);
        const buffer = await region.screenshot({ type: 'png' });
        shots += 1;
        run.screenshots += 1;
        sourceResult.screenshots += 1;
        if (typeof options.on_capture_impl === 'function') options.on_capture_impl(buffer, { kind: 'sold_comp', host: new URL(target).hostname, index: shots });
        let ocrText = '';
        try { ocrText = await recognizeLocal(buffer, options, 'sold_comp'); }
        catch (_) { /* OCR failure is a discard, never a guessed field. */ }
        if (!ocrText) { incrementDiscard(sourceResult, 'OCR_UNREADABLE'); continue; }
        const parsed = compEvidence.extractCompCandidatesFromVisibleText(ocrText, { state: market.state, source_url: card.source_url });
        const ocrFields = visibleFieldState(ocrText);
        if (!ocrFields.price) { incrementDiscard(sourceResult, 'MISSING_SOLD_PRICE'); continue; }
        if (!ocrFields.date) { incrementDiscard(sourceResult, 'MISSING_SOLD_DATE'); continue; }
        if (!ocrFields.address) { incrementDiscard(sourceResult, 'MISSING_ADDRESS'); continue; }
        const verifiedText = parsed.find((item) => item.comp_address && item.sold_date && Number(item.sold_price) > 0);
        if (!verifiedText) {
          incrementDiscard(sourceResult, 'GRID_REJECTED_OTHER', 'OCR text did not produce a deterministic comp candidate');
          continue;
        }
        const verifiedKey = compEvidence.addressKey(verifiedText.comp_address);
        if (verifiedKey === compEvidence.addressKey(run.subject_address)) { incrementDiscard(sourceResult, 'ADDRESS_EQUALS_SUBJECT'); continue; }
        if (crossSourceDedup && uploadedAddresses.has(verifiedKey)) { incrementDiscard(sourceResult, 'GRID_REJECTED_OTHER', 'duplicate address already captured from an earlier source'); continue; }
        if (typeof options.grid_reject_impl === 'function') {
          const gridReason = clean(await options.grid_reject_impl(verifiedText, row));
          if (gridReason) { incrementDiscard(sourceResult, gridDiscardCode(gridReason), gridReason); continue; }
        }
        const proposalCount = await uploadImage({
          fetchImpl, dashboard, agentToken, market, row, sourceName: SITE_HOSTS[currentSite],
          sourceUrl: card.source_url, type: 'sold_comp', buffer, filename: `sold-comp-${shots}.png`
        });
        run.captures_submitted += 1;
        run.proposals += proposalCount;
        sourceResult.proposals += proposalCount;
        uploadedAddresses.add(verifiedKey);
        if (proposalCount < 1) run.discards.push({ host: new URL(target).hostname, reason: 'server_created_no_proposal_for_confirmation' });
      }
      if (sourceResult.proposals > 0) sourceResult.outcome_code = 'PROPOSALS_CREATED';
      else if (sourceResult.candidates_built > 0 && sourceResult.discards.length) sourceResult.outcome_code = 'CANDIDATES_DISCARDED_BY_GRID';
      else if (sourceResult.cards_detected > 0) sourceResult.outcome_code = 'CARDS_MISSING_REQUIRED_FIELDS';
      if (run.proposals >= minimumProposals || shots >= compEvidence.DEFAULT_CAPS.max_screenshots_per_row) break;
    }
    if (run.outcome === 'started') run.outcome = run.proposals ? 'PROPOSALS_CREATED' :
      (run.source_results.length ? run.source_results.map((item) => `${item.source}:${item.outcome_code}`).join('|') : 'NO_SOURCE_ATTEMPTED');
  } catch (error) {
    const reason = safeFailureReason(error);
    run.block_events.push({ host: run.hosts_visited[run.hosts_visited.length - 1] || '', reason });
    run.outcome = `capture_failed:${reason}`;
  } finally {
    if (page && page.context) await page.context().close().catch(() => {});
    await browser.close().catch(() => {});
  }
  run.completed_at = new Date(now()).toISOString();
  run.elapsed_ms = now() - started;
  return writeRunLog(run, options.log_dir || LOG_DIR);
}

function configPath(args = {}, options = {}) {
  if (args.config) return path.resolve(args.config);
  return localConfig.resolveLocalConfigPath({ env: options.env || process.env }).path;
}

async function initConfig(file) {
  throw Object.assign(new Error('Use the dashboard Pair helper action. Credentials are never entered on the command line.'), { code: 'dashboard_pairing_required' });
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Use: node scripts/wos-local-comp-agent.js --market "City|County|ST" --queue-key KEY [--site zillow|redfin|realtor]');
    return 0;
  }
  const file = configPath(args);
  if (args.init_config) { await initConfig(file); return 0; }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!args.market || (!args.queue_key && !args.address)) throw new Error('--market and one of --queue-key or --address are required');
  const releaseRunLock = acquireRunLock();
  try {
    const result = await runCapture({
      market: args.market, queue_key: args.queue_key, address: args.address,
      site: args.site, mode: args.mode, dashboard_url: args.dashboard_url || config.dashboard_url, agent_token: config.agent_token
    });
    console.log(JSON.stringify({ run: result.run, log_path: result.log_path }, null, 2));
    return result.run.outcome === 'address_not_complete_source_supported' ? 2 : 0;
  } finally { releaseRunLock(); }
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`Local comp capture stopped: ${safeFailureReason(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  SITE_HOSTS, SOURCE_ORDER, SUPPORTED_MODES, HELPER_PROTOCOL_VERSION, HELPER_BUILD, SOURCE_SELECTORS, CARD_SELECTOR, hostAllowed, dashboardOrigin, parseMarket, parseArgs,
  selectRow, sourceUrlFor, soldResultsUrlFor, listingUrlKind, readRateState, writeState, reservePage, acquireRunLock, cleanRunLog, writeRunLog,
  safeFailureReason, configPath, incrementDiscard, gridDiscardCode, visibleFieldState, emptySourceResult, waitForSoldRender, inspectSoldPage,
  activeListingRegion, pageClassification, parseVisibleCards, nextPageUrl, uploadImage, uploadImageDetailed,
  addressCandidatesFromText, visibleSearchCards, resolveDetailUrlFromSearch, detailAddressVerification, appendResolutionStep,
  subjectFactsFromVisibleText, recordSubjectProposalFields, runCapture, main
};
