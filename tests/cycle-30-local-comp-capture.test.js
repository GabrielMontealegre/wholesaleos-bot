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
const Module = require('module');

const root = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle30-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'snapshots.json');
process.env.MANUAL_EVIDENCE_PACKETS_PATH = path.join(tmpDir, 'packets.json');
process.env.MANUAL_EVIDENCE_SCREENSHOTS_DIR = path.join(tmpDir, 'images');
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }));

const agent = require('../scripts/wos-local-comp-agent');
const service = require('../modules/research/manual-evidence-packet-service');
const resolver = require('../modules/research/playwright-browser-resolver');
const { probeBrowser } = require('./helpers/browser-capability');
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalHttpGet = http.get;
const originalHttpRequest = http.request;
const originalHttpsGet = https.get;
const originalHttpsRequest = https.request;
const listingText = '$250,000 sold June 14, 2026 201 Nearby St, Dallas, TX 75201';
const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const subjectAddress = '100 Synthetic St, Dallas, TX 75201';
let latestRow;
let uploadCount = 0;
let externalBrowserRequests = [];

function snapshotFor(row) {
  return { version: 1, markets: { 'dallas|dallas|tx': { market, rows: [row] } } };
}

function row(overrides) {
  return Object.assign({
    queue_key: 'cycle30-synthetic-subject',
    address_state: 'complete_source_address',
    normalized_address: subjectAddress,
    city: 'Dallas', county: 'Dallas', state: 'TX',
    property_kind: 'single family', land_use: 'single family', beds: 3, baths: 2, sqft: 1500, year_built: 1998, lot_size: 6200,
    latitude: 32.7767, longitude: -96.797,
    source_family: 'synthetic_public_notice',
    source_proof_text: `SYNTHETIC TEST ONLY subject property at ${subjectAddress}`,
    source_document_url: 'https://county.example.invalid/synthetic.pdf',
    sale_date_iso: '2026-10-01', sale_date_or_event_date: '10/01/2026',
    status_evidence_text: 'SYNTHETIC TEST ONLY current event',
    preview_only: true, should_ingest: false, not_a_saved_lead: true
  }, overrides || {});
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function setRow(value) {
  latestRow = value;
  fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify(snapshotFor(value)));
}

function comp(index, far) {
  return {
    comp_address: `${200 + index} Nearby St, Dallas, TX 75201`,
    sold_status: 'sold', sold_price: '$250,000', sold_date: '2026-06-14',
    source_url: 'https://www.zillow.com/homedetails/synthetic-comp/',
    similarity_basis: 'same single-family land use and nearby location',
    land_use: 'single family', property_kind: 'single family',
    beds: '3', baths: '2', sqft: '1500', year_built: '1998', lot_size: '6200',
    latitude: far ? 32.80 : 32.7767 + index * 0.0005,
    longitude: far ? -96.80 : -96.797 + index * 0.0005
  };
}

function packetFor(comps, confirmed) {
  return { evidence_items: comps.map((fields, index) => ({
    evidence_id: `synthetic-${index}`,
    screenshot_id: `synthetic-shot-${index}`,
    evidence_type: 'sold_comp', source_name: 'Synthetic fixture',
    captured_at: '2026-09-18T12:00:00.000Z',
    operator_confirmed: confirmed,
    operator_confirmation: confirmed ? { confirmed: true, confirmed_by: 'synthetic-operator', confirmed_at: '2026-09-18T12:00:00.000Z' } : null,
    fields
  })) };
}

async function main() {
  const browserCheck = await probeBrowser();
  if (!browserCheck.available) {
    console.log(browserCheck.reason);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }
  const fixtureApp = express();
  fixtureApp.get('/sold', (req, res) => {
    const cards = Array.from({ length: 5 }, (_, index) =>
      `<article class="sold-card"><h2>Recently sold</h2><p>$${250 + index},000 sold June 14, 2026</p><p>${200 + index} Nearby St, Dallas, TX 75201</p><p>3 beds 2 baths 1,500 sqft</p></article>`).join('');
    res.type('html').send(`<!doctype html><html><body><main><h1>SYNTHETIC TEST PAGE - sold results</h1>${cards}</main></body></html>`);
  });
  fixtureApp.get('/blocked', (req, res) => res.status(403).type('html').send('<h1>Access denied</h1><p>Verify you are human</p>'));
  fixtureApp.get('/unknown', (req, res) => res.type('html').send('<html><body><h1>SYNTHETIC EMPTY PAGE</h1></body></html>'));
  fixtureApp.get('/home/subject', (req, res) => res.type('html').send('<html><body><main><div class="listing-price"><b>List price</b><strong>$350,000</strong><span>Days on market 12</span></div></main></body></html>'));
  fixtureApp.get('/', (req, res) => res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNTHETIC TEST ONLY</title></head><body><main id="content"></main><script>window.APP={page:"dashboard"};window._uid="synthetic-test-operator";</script><script src="/dashboard/wos-public-deals.js"></script></body></html>'));
  fixtureApp.get('/dashboard/wos-public-deals.js', (req, res) => res.sendFile(path.join(root, 'dashboard', 'wos-public-deals.js')));
  fixtureApp.get('/api/dashboard/market-demand-index', (req, res) => res.json({ counties: [], county_count: 0, returned_count: 0 }));
  const server = await new Promise((resolve) => { const value = fixtureApp.listen(0, '127.0.0.1', () => resolve(value)); });
  const fixtureUrl = `http://127.0.0.1:${server.address().port}`;
  const logDir = path.join(tmpDir, 'logs');
  const syntheticLogDir = path.join(root, 'exports', 'cycle-30-comp-capture');
  fs.mkdirSync(syntheticLogDir, { recursive: true });
  let browserLaunches = 0;

  function latestSnapshotFixture(req, res) {
    res.json({
      ok: true, rows: [latestRow],
      manual_evidence_packet: service.latestManualEvidenceSnapshot({ market, rows: [latestRow] }, { today_iso: '2026-09-18' })
    });
  }
  fixtureApp.get('/api/dashboard/free-public-deal-board/latest', latestSnapshotFixture);
  fixtureApp.get('/api/dashboard/research-queue/current', latestSnapshotFixture);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: service.MAX_UPLOAD_BYTES } }).single('screenshot');
  fixtureApp.post('/api/dashboard/free-public-deal-board/manual-evidence/upload', upload, async (req, res) => {
    uploadCount += 1;
    try {
      const result = await service.uploadScreenshot({
        market: JSON.parse(req.body.market), queue_key: req.body.queue_key,
        evidence_type: req.body.evidence_type, source_name: req.body.source_name,
        source_url: req.body.source_url, captured_at: req.body.captured_at,
        filename: req.file.originalname, buffer: req.file.buffer
      }, {
        ocr_impl: async () => req.body.evidence_type === 'subject_property'
          ? 'List price $350,000 Days on market 12'
          : listingText,
        now_impl: () => '2026-09-18T12:00:00.000Z'
      });
      res.json(result);
    } catch (error) { res.status(error.status_code || 400).json({ ok: false, code: error.code, error: error.message }); }
  });
  fixtureApp.get('/api/dashboard/free-public-deal-board/manual-evidence/screenshot/:id', (req, res) => {
    const image = service.readScreenshotAsset(req.params.id);
    if (!image) return res.status(404).json({ error: 'synthetic screenshot not found' });
    return res.type(image.mime).send(image.buffer);
  });

  const externalNodeRequests = [];
  global.fetch = async (url) => { externalNodeRequests.push(String(url)); throw new Error('unexpected global fetch'); };
  http.get = function blockedHttpGet() { externalNodeRequests.push('http.get'); throw new Error('unexpected http.get'); };
  http.request = function blockedHttpRequest() { externalNodeRequests.push('http.request'); throw new Error('unexpected http.request'); };
  https.get = function blockedHttpsGet() { externalNodeRequests.push('https.get'); throw new Error('unexpected https.get'); };
  https.request = function blockedHttpsRequest() { externalNodeRequests.push('https.request'); throw new Error('unexpected https.request'); };

  const localFetch = async (url, init) => {
    const parsed = new URL(url);
    assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname), 'only the local synthetic dashboard may receive API requests');
    return originalFetch(url, init);
  };
  const common = {
    market, dashboard_url: fixtureUrl, agent_token: crypto.randomBytes(32).toString('base64url'), site: 'zillow', mode: 'sold_comps',
    allow_local_source: true, log_dir: logDir,
    fetch_impl: localFetch,
    ocr_impl: async (_buffer, context) => context && context.kind === 'subject_property' ? 'List price $350,000 Days on market 12' : listingText,
    browser_resolver_impl: async (playwright, options) => {
      browserLaunches += 1;
      return resolver.launchChromiumWithResolvedBrowser(playwright, options);
    },
    on_browser_context_impl: (context) => context.on('request', (request) => {
      if (!request.url().startsWith(fixtureUrl + '/')) externalBrowserRequests.push(request.url());
    })
  };

  try {
    // Incomplete source address is refused before a browser is launched.
    setRow(row({ address_state: 'partial_address_verify_first', normalized_address: '' }));
    const launchesBeforeRefusal = browserLaunches;
    const refused = await agent.runCapture(Object.assign({}, common, { queue_key: latestRow.queue_key }), common);
    assert.strictEqual(refused.run.outcome, 'address_not_complete_source_supported');
    assert.strictEqual(browserLaunches, launchesBeforeRefusal);
    assert.strictEqual(uploadCount, 0);

    // Both an HTTP block and an unknown DOM shape stop before card screenshots or upload.
    for (const blockedCase of [
      { path: '/blocked', expected: 'http_403' },
      { path: '/unknown', expected: 'page_type_unknown' }
    ]) {
      setRow(row({ zillow_url: `${fixtureUrl}${blockedCase.path}` }));
      const before = uploadCount;
      const stopped = await agent.runCapture(Object.assign({}, common, { queue_key: latestRow.queue_key }), common);
      assert.ok(stopped.run.block_events[0], JSON.stringify(stopped.run));
      assert.strictEqual(stopped.run.block_events[0].reason, blockedCase.expected);
      assert.strictEqual(uploadCount, before);
    }

    // A genuine local browser renders the synthetic page. Five cards are present,
    // but no more than the existing four-screenshot-per-row cap are captured.
    setRow(row({ zillow_url: `${fixtureUrl}/sold` }));
    const beforeSnapshot = fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH);
    const demoPng = path.join(syntheticLogDir, 'synthetic-sold-card.png');
    const captured = await agent.runCapture(Object.assign({}, common, { queue_key: latestRow.queue_key }), Object.assign({}, common, {
      log_dir: syntheticLogDir,
      on_capture_impl: (buffer, metadata) => {
        if (metadata.kind === 'sold_comp' && !fs.existsSync(demoPng)) fs.writeFileSync(demoPng, buffer);
      }
    }));
    assert.strictEqual(captured.run.pages_visited, 1);
    assert.strictEqual(captured.run.captures_submitted, 4, 'only four sold-card regions are captured per row');
    assert.strictEqual(uploadCount, 4);
    assert.ok(fs.existsSync(demoPng));
    const runLog = JSON.parse(fs.readFileSync(captured.log_path, 'utf8'));
    assert.deepStrictEqual(runLog.hosts_visited, ['127.0.0.1']);
    assert.ok(!JSON.stringify(runLog).includes('synthetic-test-operator'));
    assert.deepStrictEqual(fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH), beforeSnapshot, 'capture must not mutate snapshot rows');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads, [], 'capture must not write saved leads');

    const packet = service.latestManualEvidenceSnapshot({ market, rows: [latestRow] }, { today_iso: '2026-09-18' });
    const evidence = packet.items[0].packet.evidence_items;
    assert.strictEqual(evidence.length, 4);
    assert.ok(evidence.every((item) => item.evidence_type === 'sold_comp' && item.operator_confirmed === false));
    assert.ok(evidence.every((item) => item.fields.source_url === `${fixtureUrl}/sold`));
    assert.ok(evidence.every((item) => item.fields.sold_price && item.fields.sold_date && item.fields.comp_address));
    assert.ok(evidence.every((item) => !Object.prototype.hasOwnProperty.call(item.fields, 'normalized_address')));
    assert.strictEqual(packet.items[0].packet.evaluation.verified_sold_comp_count, 0, 'unconfirmed proposals never count as comps');
    const asset = service.readScreenshotAsset(evidence[0].screenshot_id);
    assert.strictEqual(asset.mime, 'image/png', 'upload traversed the server magic-byte validation and stored a genuine PNG');
    assert.strictEqual(packet.items[0].packet.evidence_items[0].screenshot_url.endsWith(evidence[0].screenshot_id), true);

    // Render the real dashboard packet panel and its stored images against the
    // same loopback-only synthetic fixture.
    const dashboardProof = path.join(syntheticLogDir, 'synthetic-dashboard-comp-captures.png');
    const proofBrowserResult = await resolver.launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
    const proofBrowser = proofBrowserResult.browser;
    const dashboardPageErrors = [];
    try {
      const proofContext = await proofBrowser.newContext({ viewport: { width: 1440, height: 1100 } });
      await proofContext.route('**/*', (route) => {
        const target = new URL(route.request().url());
        return target.hostname === '127.0.0.1' && target.port === String(server.address().port) ? route.continue() : route.abort();
      });
      const dashboardPage = await proofContext.newPage();
      dashboardPage.on('pageerror', (error) => dashboardPageErrors.push(error.message));
      await dashboardPage.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
      await dashboardPage.locator('.wos-manual-evidence-card').first().waitFor();
      await dashboardPage.locator('.wos-evidence-image').first().waitFor();
      await dashboardPage.waitForFunction(() => {
        const image = document.querySelector('.wos-evidence-image');
        return !!(image && image.complete && image.naturalWidth > 0);
      });
      const panelText = await dashboardPage.locator('#wos-public-deals').innerText();
      assert.ok(panelText.includes('Comp captures awaiting your confirmation: 4'));
      assert.ok(panelText.includes('Rows with 3 confirmed comps in this sample: 0'));
      assert.ok(panelText.includes('Can value: NO'));
      assert.ok(panelText.includes('Ready to offer: NO'));
      assert.strictEqual(await dashboardPage.locator('.wos-evidence-image').count(), 4);
      await dashboardPage.screenshot({ path: dashboardProof, fullPage: true });
      assert.deepStrictEqual(dashboardPageErrors, []);
    } finally { await proofBrowser.close(); }

    // Three manually confirmed, nearby, same-type comps can reach can_value only
    // through the existing evaluator. An off-grid comp fails; offer readiness does not become YES.
    const sourceRow = row({ address_state: 'complete_source_address' });
    const unconfirmed = service.evaluatePacket(packetFor([comp(1), comp(2), comp(3)], false), sourceRow, { today_iso: '2026-09-18' });
    assert.strictEqual(unconfirmed.readiness.can_value.status, 'NO');
    const confirmed = service.evaluatePacket(packetFor([comp(1), comp(2), comp(3)], true), sourceRow, { today_iso: '2026-09-18' });
    assert.strictEqual(confirmed.readiness.can_value.status, 'YES');
    assert.ok(['NO', 'UNKNOWN'].includes(confirmed.readiness.ready_to_offer.status));
    const far = service.evaluatePacket(packetFor([comp(1, true), comp(2), comp(3)], true), sourceRow, { today_iso: '2026-09-18' });
    assert.ok(far.verified_sold_comp_count < 3, 'a comp outside the existing one-mile grid cannot count');
    const quarantined = service.evaluatePacket(packetFor([comp(1), comp(2), comp(3)], true), row({ sale_date_iso: '2026-08-01', sale_date_or_event_date: '08/01/2026' }), { today_iso: '2026-09-18' });
    assert.strictEqual(quarantined.readiness.ready_to_offer.status, 'NO');

    // Listing price evidence remains subject context, never a sold comp.
    setRow(row({ zillow_url: `${fixtureUrl}/home/subject` }));
    const active = await agent.runCapture(Object.assign({}, common, { queue_key: latestRow.queue_key }), common);
    assert.strictEqual(active.run.active_listing_context_captures, 1);
    const finalPacket = service.latestManualEvidenceSnapshot({ market, rows: [latestRow] }, { today_iso: '2026-09-18' });
    const subjectEvidence = finalPacket.items[0].packet.evidence_items.filter((item) => item.evidence_type === 'subject_property');
    assert.ok(subjectEvidence.length >= 1);
    assert.ok(subjectEvidence.every((item) => item.operator_confirmed === false));
    assert.strictEqual(subjectEvidence[0].fields.list_price, '$350,000');
    assert.strictEqual(finalPacket.items[0].packet.evaluation.verified_sold_comp_count, 0);

    // Hourly cap uses a local timestamp-only file; once full, no 31st page is reserved.
    const rateFile = path.join(tmpDir, 'rate.json');
    fs.writeFileSync(rateFile, JSON.stringify({ page_times: Array.from({ length: 30 }, (_, index) => Date.now() - index * 1000) }));
    assert.strictEqual(agent.reservePage(rateFile, Date.now(), 30), false);
    const lockFile = path.join(tmpDir, 'run.lock');
    const releaseLock = agent.acquireRunLock(lockFile);
    assert.throws(() => agent.acquireRunLock(lockFile), /capture_already_running/);
    releaseLock();
    assert.strictEqual(fs.existsSync(lockFile), false, 'the local single-run lock is released after the work ends');

    // Cycle 30 never wires the existing server-side browser runner into the new route.
    const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    assert.ok(!serverSource.includes('wos-local-comp-agent'), 'server must not import or launch the local agent');
    assert.ok(!serverSource.includes('runScreenshotCompEvidence'), 'Cycle 30 server routes must not invoke browser crawling');
    assert.strictEqual(externalNodeRequests.length, 0, 'the runner must not use global fetch or Node HTTP clients');
    assert.deepStrictEqual(externalBrowserRequests, [], 'the visible browser must make no request outside the local synthetic fixture');
    assert.strictEqual(fs.existsSync(path.join(syntheticLogDir, 'synthetic-sold-card.png')), true);
    console.log(JSON.stringify({
      data_kind: 'SYNTHETIC_TEST_ONLY',
      local_browser_launches: browserLaunches,
      pages_visited: captured.run.pages_visited,
      five_fixture_cards: 5,
      captured_regions: captured.run.captures_submitted,
      upload_count: uploadCount,
      pending_proposals_count_as_comps: false,
      confirmed_three_comp_readiness: confirmed.readiness.can_value.status,
      far_comp_counted: far.verified_sold_comp_count,
      active_price_is_comp: false,
      external_requests: 0,
      snapshot_unchanged: true,
      saved_leads_unchanged: true,
      synthetic_run_log: captured.log_path,
      synthetic_screenshot: demoPng
    }));
    console.log('cycle 30 local comp capture tests passed');
  } finally {
    global.fetch = originalFetch;
    http.get = originalHttpGet;
    http.request = originalHttpRequest;
    https.get = originalHttpsGet;
    https.request = originalHttpsRequest;
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  global.fetch = originalFetch;
  http.get = originalHttpGet;
  http.request = originalHttpRequest;
  https.get = originalHttpsGet;
  https.request = originalHttpsRequest;
  console.error(error);
  process.exitCode = 1;
});
