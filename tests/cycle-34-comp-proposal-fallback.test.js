'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');

const root = path.resolve(__dirname, '..');
const fixtures = path.join(__dirname, 'fixtures', 'cycle-34');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle34-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'snapshots.json');
process.env.MANUAL_EVIDENCE_PACKETS_PATH = path.join(tmpDir, 'packets.json');
process.env.MANUAL_EVIDENCE_SCREENSHOTS_DIR = path.join(tmpDir, 'images');
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }));

const agent = require('../scripts/wos-local-comp-agent');
const service = require('../modules/research/manual-evidence-packet-service');
const resolver = require('../modules/research/playwright-browser-resolver');
const originalFetch = global.fetch;
const originalHttpGet = http.get;
const originalHttpRequest = http.request;
const originalHttpsGet = https.get;
const originalHttpsRequest = https.request;
const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const subjectAddress = '100 Synthetic Subject St, Dallas, TX 75201';
let latestRow;

function row(overrides = {}) {
  return Object.assign({
    queue_key: 'cycle34-synthetic-subject', address_state: 'complete_source_address', normalized_address: subjectAddress,
    city: 'Dallas', county: 'Dallas', state: 'TX', property_kind: 'single family', land_use: 'single family', beds: 3, baths: 2,
    sqft: 1500, latitude: 32.7767, longitude: -96.797, source_family: 'synthetic_public_notice',
    source_proof_text: `SYNTHETIC TEST ONLY subject property at ${subjectAddress}`,
    source_document_url: 'https://county.example.invalid/synthetic.pdf', sale_date_iso: '2026-10-01',
    sale_date_or_event_date: '10/01/2026', status_evidence_text: 'SYNTHETIC TEST ONLY current event',
    preview_only: true, should_ingest: false, not_a_saved_lead: true
  }, overrides);
}

function setRow(value) {
  latestRow = value;
  fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify({ version: 1, markets: { 'dallas|dallas|tx': { market, rows: [value] } } }));
}

function comp(index, far = false) {
  return {
    comp_address: `${500 + index} Synthetic Grid St, Dallas, TX 75201`,
    sold_status: 'sold', sold_price: '$250,000', sold_date: '2026-06-14',
    source_url: 'https://www.zillow.com/homedetails/synthetic-comp/',
    similarity_basis: 'same single-family land use and nearby location',
    land_use: 'single family', property_kind: 'single family', beds: '3', baths: '2', sqft: '1500',
    year_built: '1998', lot_size: '6200', latitude: far ? 32.80 : 32.7767 + index * 0.0005,
    longitude: far ? -96.80 : -96.797 + index * 0.0005
  };
}

function packetFor(comps, confirmed) {
  return { evidence_items: comps.map((fields, index) => ({
    evidence_id: `cycle34-${index}`, screenshot_id: `cycle34-shot-${index}`,
    evidence_type: 'sold_comp', source_name: 'Synthetic fixture', captured_at: '2026-09-19T12:00:00.000Z',
    operator_confirmed: confirmed, fields
  })) };
}

function responseBodyForUpload(sourceUrl, indexByPath) {
  const pathName = new URL(sourceUrl).pathname;
  if (pathName.includes('redfin')) return '$251,000 sold June 14, 2026 301 Synthetic Pine St, Dallas, TX 75201 3 beds 2 baths 1,500 sqft';
  const index = indexByPath.realtor++;
  return index === 0
    ? '$261,000 sold June 15, 2026 401 Synthetic Elm St, Dallas, TX 75201 3 beds 2 baths 1,510 sqft'
    : '$271,000 sold June 16, 2026 402 Synthetic Elm St, Dallas, TX 75201 3 beds 2 baths 1,490 sqft';
}

async function main() {
  const app = express();
  const allowedFixtures = new Set(fs.readdirSync(fixtures));
  app.get('/fixture/late', (_req, res) => res.type('html').send('<!doctype html><html><body><h1>Recently sold homes loading</h1><script>setTimeout(function(){document.body.innerHTML += `<main data-testid="search-page-list-container"><article data-testid="property-card">$250,000 sold June 14, 2026 901 Late St, Dallas, TX 75201</article></main>`;},500);</script></body></html>'));
  app.get('/fixture/:name', (req, res) => {
    if (!allowedFixtures.has(req.params.name)) return res.status(404).end();
    if (req.params.name === 'blocked.html') res.status(403);
    return res.type('html').sendFile(path.join(fixtures, req.params.name));
  });
  app.get('/api/dashboard/free-public-deal-board/latest', (_req, res) => res.json({
    ok: true, rows: [latestRow], manual_evidence_packet: service.latestManualEvidenceSnapshot({ market, rows: [latestRow] }, { today_iso: '2026-09-19' })
  }));
  const indexByPath = { realtor: 0 };
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: service.MAX_UPLOAD_BYTES } }).single('screenshot');
  app.post('/api/dashboard/free-public-deal-board/manual-evidence/upload', upload, async (req, res) => {
    try {
      const result = await service.uploadScreenshot({
        market: JSON.parse(req.body.market), queue_key: req.body.queue_key, evidence_type: req.body.evidence_type,
        source_name: req.body.source_name, source_url: req.body.source_url, captured_at: req.body.captured_at,
        filename: req.file.originalname, buffer: req.file.buffer
      }, { ocr_impl: async () => responseBodyForUpload(req.body.source_url, indexByPath), now_impl: () => req.body.captured_at });
      res.json(result);
    } catch (error) { res.status(error.status_code || 400).json({ ok: false, code: error.code, error: error.message }); }
  });
  const server = await new Promise((resolve) => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const externalNodeRequests = [];
  const externalBrowserRequests = [];
  global.fetch = async (url) => { externalNodeRequests.push(String(url)); throw new Error('unexpected global fetch'); };
  http.get = () => { externalNodeRequests.push('http.get'); throw new Error('unexpected http.get'); };
  http.request = () => { externalNodeRequests.push('http.request'); throw new Error('unexpected http.request'); };
  https.get = () => { externalNodeRequests.push('https.get'); throw new Error('unexpected https.get'); };
  https.request = () => { externalNodeRequests.push('https.request'); throw new Error('unexpected https.request'); };
  const localFetch = async (url, init) => {
    const parsed = new URL(url);
    assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname));
    return originalFetch(url, init);
  };
  const launched = await resolver.launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  const browser = launched.browser;
  const context = await browser.newContext();
  await context.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage();

  async function inspect(name, site, options = {}) {
    const response = await page.goto(`${base}/fixture/${name}`, { waitUntil: 'domcontentloaded' });
    return agent.inspectSoldPage(page, response.status(), site, `${base}/fixture/${name}`, subjectAddress,
      Object.assign({ allow_local_source: true, render_wait_ms: 150 }, options), 'TX');
  }

  try {
    const zillow = await inspect('zillow-sold-results.html', 'zillow');
    assert.strictEqual(zillow.result.url_kind, 'sold_results');
    assert.strictEqual(zillow.result.cards_detected, 3);
    assert.deepStrictEqual([zillow.result.cards_with_price, zillow.result.cards_with_date, zillow.result.cards_with_address], [2, 2, 2]);
    const redfin = await inspect('redfin-sold-results.html', 'redfin');
    const realtor = await inspect('realtor-sold-results.html', 'realtor');
    assert.strictEqual(redfin.result.url_kind, 'sold_results');
    assert.strictEqual(realtor.result.url_kind, 'sold_results');
    assert.strictEqual(redfin.result.candidates_built, 1);
    assert.strictEqual(realtor.result.candidates_built, 2);

    const detail = await inspect('property-detail.html', 'zillow');
    assert.strictEqual(detail.result.url_kind, 'property_detail');
    assert.strictEqual(detail.result.outcome_code, 'WRONG_PAGE_TYPE');
    const drift = await inspect('selector-drift.html', 'zillow');
    assert.strictEqual(drift.result.outcome_code, 'SELECTOR_MATCHED_NOTHING');
    const empty = await inspect('empty-sold-results.html', 'zillow');
    assert.strictEqual(empty.result.outcome_code, 'NO_SOLD_CARDS_ON_PAGE');
    const blocked = await inspect('blocked.html', 'zillow');
    assert.strictEqual(blocked.result.outcome_code, 'BLOCKED_STOPPED');
    const lateResponse = await page.goto(`${base}/fixture/late`, { waitUntil: 'domcontentloaded' });
    const late = await agent.inspectSoldPage(page, lateResponse.status(), 'zillow', `${base}/fixture/late`, subjectAddress,
      { allow_local_source: true, render_wait_ms: 100 }, 'TX');
    assert.strictEqual(late.result.page_state, 'client_render_timeout');
    assert.strictEqual(late.result.outcome_code, 'SELECTOR_MATCHED_NOTHING');

    const missingPrice = agent.visibleFieldState('Sold June 14, 2026 201 Synthetic Oak Dr, Dallas, TX 75201');
    const missingDate = agent.visibleFieldState('$250,000 sold 201 Synthetic Oak Dr, Dallas, TX 75201');
    const missingAddress = agent.visibleFieldState('$250,000 sold June 14, 2026');
    assert.deepStrictEqual(missingPrice, { price: false, date: true, address: true });
    assert.deepStrictEqual(missingDate, { price: true, date: false, address: true });
    assert.deepStrictEqual(missingAddress, { price: true, date: true, address: false });

    await context.close();
    await browser.close();
    setRow(row());
    const agentOcr = [
      '$251,000 sold June 14, 2026 301 Synthetic Pine St, Dallas, TX 75201',
      '$261,000 sold June 15, 2026 401 Synthetic Elm St, Dallas, TX 75201',
      '$271,000 sold June 16, 2026 402 Synthetic Elm St, Dallas, TX 75201'
    ];
    let ocrIndex = 0;
    const common = {
      market, queue_key: latestRow.queue_key, dashboard_url: base, agent_token: crypto.randomBytes(32).toString('base64url'),
      allow_local_source: true, source_order: ['zillow', 'redfin', 'realtor'],
      source_urls: {
        zillow: `${base}/fixture/zillow-sold-results.html`, redfin: `${base}/fixture/redfin-sold-results.html`,
        realtor: `${base}/fixture/realtor-sold-results.html`
      },
      fetch_impl: localFetch, log_dir: path.join(tmpDir, 'logs'), rate_state_path: path.join(tmpDir, 'rate.json'),
      render_wait_ms: 150, ocr_impl: async () => agentOcr[ocrIndex++],
      on_browser_context_impl: (browserContext) => browserContext.on('request', (request) => {
        if (!request.url().startsWith(base + '/')) externalBrowserRequests.push(request.url());
      })
    };
    const sequential = await agent.runCapture(common, common);
    assert.deepStrictEqual(sequential.run.source_results.map((item) => item.source), ['zillow', 'redfin', 'realtor']);
    assert.deepStrictEqual(sequential.run.source_results.map((item) => item.outcome_code), ['CARDS_MISSING_REQUIRED_FIELDS', 'PROPOSALS_CREATED', 'PROPOSALS_CREATED']);
    assert.strictEqual(sequential.run.proposals, 3);
    assert.strictEqual(sequential.run.screenshots, 3);
    assert.strictEqual(sequential.run.source_results[0].discards.find((item) => item.reason_code === 'MISSING_SOLD_DATE').count, 1);
    assert.strictEqual(sequential.run.source_results[0].discards.find((item) => item.reason_code === 'MISSING_SOLD_PRICE').count, 1);
    assert.strictEqual(sequential.run.source_results[0].discards.find((item) => item.reason_code === 'MISSING_ADDRESS').count, 1);
    const packet = service.latestManualEvidenceSnapshot({ market, rows: [latestRow] }, { today_iso: '2026-09-19' });
    assert.strictEqual(packet.items[0].packet.evaluation.verified_sold_comp_count, 0);
    assert.strictEqual(packet.items[0].packet.evaluation.readiness.can_value.status, 'NO');
    assert.ok(packet.items[0].packet.evidence_items.every((item) => item.operator_confirmed === false));

    setRow(row({ queue_key: 'cycle34-zillow-enough' }));
    let zillowOcrIndex = 0;
    const zillowOcr = [
      '$241,000 sold June 11, 2026 211 Synthetic Oak Dr, Dallas, TX 75201',
      '$242,000 sold June 12, 2026 212 Synthetic Oak Dr, Dallas, TX 75201',
      '$243,000 sold June 13, 2026 213 Synthetic Oak Dr, Dallas, TX 75201'
    ];
    const enoughAtZillowOptions = Object.assign({}, common, {
      queue_key: latestRow.queue_key,
      source_urls: {
        zillow: `${base}/fixture/zillow-three-valid.html`, redfin: `${base}/fixture/redfin-sold-results.html`,
        realtor: `${base}/fixture/realtor-sold-results.html`
      },
      rate_state_path: path.join(tmpDir, 'enough-rate.json'), ocr_impl: async () => zillowOcr[zillowOcrIndex++]
    });
    const enoughAtZillow = await agent.runCapture(enoughAtZillowOptions, enoughAtZillowOptions);
    assert.deepStrictEqual(enoughAtZillow.run.source_results.map((item) => item.source), ['zillow']);
    assert.strictEqual(enoughAtZillow.run.proposals, 3);

    setRow(row({ queue_key: 'cycle34-global-cap' }));
    let capOcrIndex = 0;
    const capOcr = zillowOcr.concat(['$251,000 sold June 14, 2026 301 Synthetic Pine St, Dallas, TX 75201']);
    const capOptions = Object.assign({}, common, {
      queue_key: latestRow.queue_key, minimum_proposals: 99,
      source_urls: {
        zillow: `${base}/fixture/zillow-three-valid.html`, redfin: `${base}/fixture/redfin-sold-results.html`,
        realtor: `${base}/fixture/realtor-sold-results.html`
      },
      rate_state_path: path.join(tmpDir, 'cap-rate.json'), ocr_impl: async () => capOcr[capOcrIndex++]
    });
    const globallyCapped = await agent.runCapture(capOptions, capOptions);
    assert.strictEqual(globallyCapped.run.screenshots, 4, 'the four-screenshot ceiling spans all sources');
    assert.deepStrictEqual(globallyCapped.run.source_results.map((item) => item.source), ['zillow', 'redfin']);

    setRow(row({ queue_key: 'cycle34-cross-source-dedupe' }));
    const duplicateOptions = Object.assign({}, common, {
      queue_key: latestRow.queue_key, minimum_proposals: 4, source_order: ['redfin', 'realtor'],
      source_urls: { redfin: `${base}/fixture/redfin-sold-results.html`, realtor: `${base}/fixture/realtor-sold-results.html` },
      rate_state_path: path.join(tmpDir, 'duplicate-rate.json'),
      ocr_impl: async () => '$251,000 sold June 14, 2026 301 Synthetic Pine St, Dallas, TX 75201'
    });
    const deduped = await agent.runCapture(duplicateOptions, duplicateOptions);
    assert.strictEqual(deduped.run.proposals, 1, `the same address from two sources is uploaded only once: ${JSON.stringify(deduped.run.source_results)}`);
    assert.ok(deduped.run.source_results[1].discards.some((item) => item.detail === 'duplicate address already captured from an earlier source'));

    const subjectRow = row({ queue_key: 'cycle34-grid-proof' });
    const unconfirmed = service.evaluatePacket(packetFor([comp(1), comp(2), comp(3)], false), subjectRow, { today_iso: '2026-09-19' });
    const confirmed = service.evaluatePacket(packetFor([comp(1), comp(2), comp(3)], true), subjectRow, { today_iso: '2026-09-19' });
    const offGrid = service.evaluatePacket(packetFor([comp(1, true), comp(2), comp(3)], true), subjectRow, { today_iso: '2026-09-19' });
    assert.strictEqual(unconfirmed.readiness.can_value.status, 'NO');
    assert.strictEqual(confirmed.readiness.can_value.status, 'YES');
    assert.notStrictEqual(confirmed.readiness.ready_to_offer.status, 'YES');
    assert.ok(offGrid.verified_sold_comp_count < 3);

    const blockedCommon = Object.assign({}, common, {
      queue_key: latestRow.queue_key,
      source_urls: { zillow: `${base}/fixture/blocked.html`, redfin: `${base}/fixture/blocked.html`, realtor: `${base}/fixture/realtor-sold-results.html` },
      rate_state_path: path.join(tmpDir, 'blocked-rate.json'), ocr_impl: async () => agentOcr[0]
    });
    const twoBlocked = await agent.runCapture(blockedCommon, blockedCommon);
    assert.deepStrictEqual(twoBlocked.run.source_results.map((item) => item.source), ['zillow', 'redfin']);
    assert.ok(twoBlocked.run.source_results.every((item) => item.outcome_code === 'BLOCKED_STOPPED'));

    const subjectResult = agent.emptySourceResult('zillow', 'https://www.zillow.com/');
    agent.incrementDiscard(subjectResult, 'ADDRESS_EQUALS_SUBJECT');
    assert.deepStrictEqual(subjectResult.discards, [{ reason_code: 'ADDRESS_EQUALS_SUBJECT', count: 1 }]);
    const gridResult = agent.emptySourceResult('zillow', 'https://www.zillow.com/');
    for (const reason of ['DISTANCE_OVER_ONE_MILE', 'SOLD_DATE_OUTSIDE_WINDOW', 'PRICE_BELOW_FLOOR', 'PROPERTY_TYPE_MISMATCH']) agent.incrementDiscard(gridResult, reason);
    assert.deepStrictEqual(gridResult.discards.map((item) => item.reason_code), ['DISTANCE_OVER_ONE_MILE', 'SOLD_DATE_OUTSIDE_WINDOW', 'PRICE_BELOW_FLOOR', 'PROPERTY_TYPE_MISMATCH']);
    assert.strictEqual(agent.gridDiscardCode('strict_grid_distance_over_one_mile'), 'DISTANCE_OVER_ONE_MILE');
    assert.strictEqual(agent.gridDiscardCode('sale_outside_comp_window'), 'SOLD_DATE_OUTSIDE_WINDOW');
    assert.strictEqual(agent.gridDiscardCode('nominal_or_non_market_sale_price'), 'PRICE_BELOW_FLOOR');
    assert.strictEqual(agent.gridDiscardCode('property_type_mismatch'), 'PROPERTY_TYPE_MISMATCH');

    const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    const moduleSources = fs.readdirSync(path.join(root, 'modules')).flatMap((folder) => {
      const target = path.join(root, 'modules', folder);
      return fs.statSync(target).isDirectory() ? fs.readdirSync(target).filter((file) => file.endsWith('.js')).map((file) => fs.readFileSync(path.join(target, file), 'utf8')) : [];
    }).join('\n');
    assert.ok(!serverSource.includes('wos-local-comp-agent'));
    assert.ok(!moduleSources.includes('wos-local-comp-agent'));
    assert.deepStrictEqual(externalNodeRequests, []);
    assert.deepStrictEqual(externalBrowserRequests, []);

    const dashboardSource = fs.readFileSync(path.join(root, 'dashboard', 'wos-public-deals.js'), 'utf8');
    assert.ok(dashboardSource.includes('the sold-results container loaded but no supported card markup was found'));
    assert.ok(dashboardSource.includes('Nothing counts until you confirm it.'));

    const proofDir = path.join(root, 'exports', 'cycle-34-synthetic-proof');
    fs.mkdirSync(proofDir, { recursive: true });
    const proof = {
      data_kind: 'SYNTHETIC_TEST_ONLY', source_results: sequential.run.source_results,
      blocked_path: twoBlocked.run.source_results, proposals_created: sequential.run.proposals,
      screenshots: sequential.run.screenshots, external_requests: 0, preview_only: true,
      should_ingest: false, no_global_mutation: true, not_a_saved_lead: true
    };
    fs.writeFileSync(path.join(proofDir, 'cycle-34-synthetic-proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify({ source_results: proof.source_results, blocked_path: proof.blocked_path, proposals: proof.proposals_created, external_requests: 0 }));
    console.log('cycle 34 comp proposal fallback tests passed');
  } finally {
    global.fetch = originalFetch;
    http.get = originalHttpGet;
    http.request = originalHttpRequest;
    https.get = originalHttpsGet;
    https.request = originalHttpsRequest;
    try { await browser.close(); } catch (_) { /* Already closed by the sequential proof. */ }
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
