'use strict';

// Local-only visible-browser capture. The server receives images through its
// existing manual-evidence route; it never visits a listing website.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');
const resolver = require('../modules/research/playwright-browser-resolver');
const addressEvidence = require('../modules/research/property-address-evidence');
const compEvidence = require('../modules/research/screenshot-comp-evidence');

const SITE_HOSTS = Object.freeze({
  zillow: 'zillow.com',
  redfin: 'redfin.com',
  realtor: 'realtor.com'
});
const CARD_SELECTOR = 'article, [role="article"], li, [data-testid*="card"], [data-testid*="property"]';
const DEFAULT_CONFIG = path.resolve(__dirname, '..', '.local-comp-agent.json');
const RATE_STATE = path.resolve(__dirname, '..', '.cache', 'wos-local-comp-agent', 'rate-state.json');
const RUN_LOCK = path.resolve(__dirname, '..', '.cache', 'wos-local-comp-agent', 'agent.lock');
const LOG_DIR = path.resolve(__dirname, '..', 'exports', 'cycle-30-comp-capture');

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

function readRateState(file, now) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { state = {}; }
  const cutoff = now - 60 * 60 * 1000;
  return { page_times: (Array.isArray(state.page_times) ? state.page_times : []).map(Number).filter((time) => Number.isFinite(time) && time > cutoff) };
}

function reservePage(file, now, limit) {
  const state = readRateState(file, now);
  if (state.page_times.length >= limit) return false;
  state.page_times.push(now);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
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
  return {
    data_kind: 'OPERATOR_LOCAL_CAPTURE_RUN',
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
    outcome: value.outcome,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    not_a_saved_lead: true
  };
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

async function uploadImage({ fetchImpl, dashboard, operatorId, market, row, sourceName, sourceUrl, type, buffer, filename }) {
  const capturedAt = new Date().toISOString();
  const form = new FormData();
  form.set('market', JSON.stringify(market));
  form.set('queue_key', clean(row.queue_key));
  form.set('evidence_type', type);
  form.set('source_name', sourceName);
  form.set('source_url', sourceUrl);
  form.set('captured_at', capturedAt);
  form.set('screenshot', new Blob([buffer], { type: 'image/png' }), filename);
  const response = await fetchImpl(`${dashboard}/api/dashboard/free-public-deal-board/manual-evidence/upload`, {
    method: 'POST', headers: { 'x-user-id': operatorId }, body: form
  });
  let body;
  try { body = await response.json(); } catch (_) { body = null; }
  if (!response.ok || !body || body.ok !== true) throw new Error(`upload_failed_http_${response.status || 0}:${clean(body && (body.code || body.error) || 'invalid_response')}`);
  if (body.preview_only !== true || body.should_ingest !== false || body.no_global_mutation !== true) throw new Error('upload_response_safety_invariant_failed');
  const evidenceItems = body.manual_evidence_item && body.manual_evidence_item.packet && body.manual_evidence_item.packet.evidence_items;
  const screenshots = body.manual_evidence_item && body.manual_evidence_item.packet && body.manual_evidence_item.packet.screenshots;
  const newScreenshotIds = new Set((Array.isArray(screenshots) ? screenshots : [])
    .filter((shot) => shot.captured_at === capturedAt && shot.source_name === sourceName)
    .map((shot) => clean(shot.screenshot_id)).filter(Boolean));
  const newEvidenceItems = (Array.isArray(evidenceItems) ? evidenceItems : []).filter((item) => newScreenshotIds.has(clean(item.screenshot_id)));
  if (!newEvidenceItems.length || newEvidenceItems.some((item) => item.operator_confirmed !== false)) throw new Error('upload_response_must_remain_unconfirmed_proposals');
  return newEvidenceItems.length;
}

async function recognizeLocal(buffer, options, kind) {
  if (typeof options.ocr_impl === 'function') return clean(await options.ocr_impl(buffer, { kind }));
  const tesseract = require('tesseract.js');
  const result = await tesseract.recognize(buffer, 'eng', { logger: () => {} });
  return clean(result && result.data && result.data.text);
}

async function runCapture(input = {}, options = {}) {
  const now = options.now_impl || Date.now;
  const fetchImpl = options.fetch_impl || global.fetch;
  const started = now();
  const run = {
    started_at: new Date(started).toISOString(), subject_address: '', rows_attempted: 0, active_listing_context_captures: 0,
    pages_visited: 0, hosts_visited: [], captures_submitted: 0, discards: [], block_events: [], outcome: 'started'
  };
  const site = clean(input.site || 'zillow').toLowerCase();
  if (!SITE_HOSTS[site]) throw new Error('listing_site_not_allowed');
  if (!input.market || !input.operator_id || !input.dashboard_url) throw new Error('market_dashboard_and_operator_identity_required');
  const market = typeof input.market === 'string' ? parseMarket(input.market) : input.market;
  const dashboard = dashboardOrigin(input.dashboard_url);
  const operatorId = clean(input.operator_id);
  const latestUrl = new URL('/api/dashboard/free-public-deal-board/latest', dashboard);
  latestUrl.search = new URLSearchParams({ city: market.city, county: market.county, state: market.state }).toString();
  const latestResponse = await fetchImpl(latestUrl.toString(), { headers: { 'x-user-id': operatorId } });
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
  let initialUrl;
  try { initialUrl = sourceUrlFor(row, site, options); }
  catch (error) {
    run.outcome = clean(error && error.message || error) || 'listing_url_unavailable';
    run.completed_at = new Date(now()).toISOString();
    run.elapsed_ms = now() - started;
    return writeRunLog(run, options.log_dir || LOG_DIR);
  }
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
  const siteRoot = SITE_HOSTS[site];
  let page;
  try {
    const context = await browser.newContext();
    if (typeof options.on_browser_context_impl === 'function') options.on_browser_context_impl(context);
    if (typeof context.route === 'function') {
      await context.route('**/*', (route) => {
        let url;
        try { url = new URL(route.request().url()); } catch (_) { return route.abort(); }
        const localAllowed = options.allow_local_source === true && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
        return (localAllowed || url.protocol === 'data:' || url.protocol === 'blob:' || url.hostname === siteRoot || url.hostname.endsWith(`.${siteRoot}`))
          ? route.continue()
          : route.abort();
      });
    }
    page = await context.newPage();
    page.setDefaultTimeout(compEvidence.DEFAULT_CAPS.timeout_ms);
    let target = initialUrl;
    const visited = new Set();
    let shots = 0;
    for (let pageNumber = 0; pageNumber < compEvidence.DEFAULT_CAPS.max_pages_per_row; pageNumber += 1) {
      if (visited.has(target)) break;
      if (run.pages_visited >= 30) { run.discards.push({ reason: 'per_run_page_limit_30' }); break; }
      const rateStatePath = options.rate_state_path || RATE_STATE;
      if (!reservePage(rateStatePath, now(), 30)) { run.discards.push({ reason: 'pages_per_hour_limit_30' }); break; }
      visited.add(target);
      run.pages_visited += 1;
      run.hosts_visited.push(new URL(target).hostname);
      if (now() - started > compEvidence.DEFAULT_CAPS.total_budget_ms) {
        run.discards.push({ reason: 'total_runtime_budget_90_seconds' });
        break;
      }
      const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: compEvidence.DEFAULT_CAPS.timeout_ms });
      const status = response ? response.status() : 0;
      const classified = await pageClassification(page, status, site, target, options, market.state);
      if (classified.type === 'blocked' || classified.type === 'unknown') {
        const reason = classified.reason || classified.type;
        run.block_events.push({ host: new URL(target).hostname, reason });
        run.outcome = reason;
        break;
      }
      if (classified.type === 'property_detail' && shots < compEvidence.DEFAULT_CAPS.max_screenshots_per_row) {
        const listingRegion = await activeListingRegion(page);
        if (listingRegion) {
          const buffer = await page.locator('body *').nth(listingRegion.index).screenshot({ type: 'png' });
          shots += 1;
          let ocrText = '';
          try { ocrText = await recognizeLocal(buffer, options, 'subject_property'); }
          catch (_) { /* No OCR result means no proposal. */ }
          if (/\b(?:list|asking)\s+price\b/i.test(ocrText) && /\$\s?[\d,]{4,}/.test(ocrText)) {
            const proposalCount = await uploadImage({
              fetchImpl, dashboard, operatorId, market, row, sourceName: new URL(target).hostname,
              sourceUrl: target, type: 'subject_property', buffer, filename: `subject-listing-${shots}.png`
            });
            run.active_listing_context_captures += 1;
            if (!proposalCount) run.discards.push({ host: new URL(target).hostname, reason: 'server_created_no_active_listing_proposal' });
          } else {
            run.discards.push({ host: new URL(target).hostname, reason: 'active_listing_ocr_did_not_confirm_labeled_price' });
          }
        }
      }
      const candidates = await parseVisibleCards(page, market.state, target, run.subject_address);
      for (const candidate of candidates) {
        if (shots >= compEvidence.DEFAULT_CAPS.max_screenshots_per_row) break;
        const region = page.locator(CARD_SELECTOR).nth(candidate.locator_index);
        const buffer = await region.screenshot({ type: 'png' });
        shots += 1;
        if (typeof options.on_capture_impl === 'function') options.on_capture_impl(buffer, { kind: 'sold_comp', host: new URL(target).hostname, index: shots });
        let ocrText = '';
        try { ocrText = await recognizeLocal(buffer, options, 'sold_comp'); }
        catch (_) { /* OCR failure is a discard, never a guessed field. */ }
        const parsed = compEvidence.extractCompCandidatesFromVisibleText(ocrText, { state: market.state, source_url: target });
        const verifiedText = parsed.find((item) => item.comp_address && item.sold_date && Number(item.sold_price) > 0 &&
          compEvidence.addressKey(item.comp_address) !== compEvidence.addressKey(run.subject_address));
        if (!verifiedText) {
          run.discards.push({ host: new URL(target).hostname, reason: 'ocr_missing_sold_price_date_or_address_or_subject_match' });
          continue;
        }
        const proposalCount = await uploadImage({
          fetchImpl, dashboard, operatorId, market, row, sourceName: new URL(target).hostname,
          sourceUrl: target, type: 'sold_comp', buffer, filename: `sold-comp-${shots}.png`
        });
        run.captures_submitted += 1;
        if (proposalCount < 1) run.discards.push({ host: new URL(target).hostname, reason: 'server_created_no_proposal_for_confirmation' });
      }
      if (shots >= compEvidence.DEFAULT_CAPS.max_screenshots_per_row) break;
      const next = await nextPageUrl(page, site);
      if (!next) break;
      target = next;
    }
    if (run.outcome === 'started') run.outcome = run.captures_submitted ? 'proposals_uploaded_for_operator_confirmation' : 'no_qualifying_sold_cards_found';
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

function configPath(args) { return path.resolve(args.config || DEFAULT_CONFIG); }

async function initConfig(file) {
  const readline = require('readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const dashboard_url = clean(await rl.question('Dashboard URL (HTTPS): '));
    const operator_id = clean(await rl.question('Dashboard operator ID (kept in this local file): '));
    if (!dashboard_url || !operator_id) throw new Error('dashboard_url_and_operator_id_required');
    dashboardOrigin(dashboard_url);
    fs.writeFileSync(file, JSON.stringify({ dashboard_url, operator_id }, null, 2), { flag: 'wx' });
    console.log(`Local configuration saved at ${file}.`);
  } finally { rl.close(); }
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
      site: args.site, dashboard_url: args.dashboard_url || config.dashboard_url, operator_id: config.operator_id
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
  SITE_HOSTS, CARD_SELECTOR, hostAllowed, dashboardOrigin, parseMarket, parseArgs,
  selectRow, sourceUrlFor, readRateState, reservePage, acquireRunLock, cleanRunLog, writeRunLog, safeFailureReason,
  activeListingRegion, pageClassification, parseVisibleCards, nextPageUrl, uploadImage, runCapture, main
};
