'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');

const root = path.resolve(__dirname, '..');
const proofDir = path.join(root, 'exports', 'cycle-21-dashboard-hygiene');
const screenshotPath = path.join(proofDir, 'synthetic-dashboard-load.png');
const resultsPath = path.join(proofDir, 'load-requests.json');
const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cycle21-dashboard-hygiene-'));
const dbPath = path.join(isolatedDir, 'db.json');
const syntheticDb = Buffer.from(JSON.stringify({ leads: [], buyers: [], data_kind: 'SYNTHETIC_TEST_ONLY' }, null, 2));

fs.mkdirSync(proofDir, { recursive: true });
fs.writeFileSync(dbPath, syntheticDb);

const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const packetItem = {
  queue_key: 'synthetic|cycle-21|dashboard-load',
  headline: 'SYNTHETIC TEST PROPERTY',
  address: '100 Synthetic Proof St, Dallas, TX 75201',
  address_state: 'complete_source_supported_address',
  lead_origin: 'SYNTHETIC TEST ONLY',
  source_proof_url: 'https://county.example.gov/synthetic-proof.pdf',
  source_event_date: '2026-09-15',
  source_last_checked_at: '2026-09-08T12:00:00.000Z',
  why_worth_checking: 'Synthetic fixture for dashboard load verification.',
  row_state: 'CALL_READY',
  missing_evidence: ['3 verified sold comps'],
  research_links: [],
  packet: {
    evidence_items: [],
    evaluation: {
      confirmed_evidence_count: 0,
      verified_sold_comp_count: 0,
      arv_status: 'ARV_LOCKED_NEEDS_3_VERIFIED_SOLD_COMPS',
      readiness: {
        can_contact: { status: 'YES', reason: 'Synthetic supported contact route.' },
        can_value: { status: 'NO', reason: 'Synthetic fixture has fewer than three comps.' },
        ready_to_offer: { status: 'NO', reason: 'Synthetic fixture is not offer ready.' },
        event_status: { reason_text: 'Synthetic event status for rendering only.' }
      }
    }
  }
};

function emptyApiPayload(req) {
  if (req.path === '/api/auth/role') return { ok: true, role: 'admin', isAdmin: true, userId: 'admin' };
  if (req.path === '/api/dashboard/free-public-deal-board/latest') {
    return {
      ok: true,
      has_snapshot: true,
      market,
      rows: [],
      counts: {},
      source_coverage: [],
      auto_run: { enabled: false },
      manual_evidence_packet: { selected_count: 1, items: [packetItem] }
    };
  }
  if (req.path === '/api/dashboard/market-demand-index') return { ok: true, counties: [], rows: [], artifact_scope: 'SYNTHETIC_TEST_ONLY' };
  if (req.path === '/api/buyboxes') {
    return { ok: true, buyboxes: [{ id: 'synthetic-buybox', name: 'SYNTHETIC TEST BUY BOX', state: 'TX', active: true }] };
  }
  if (req.path === '/api/buyboxes/recommendations') return { ok: true, recommendations: [] };
  return {
    ok: true,
    data_kind: 'SYNTHETIC_TEST_ONLY',
    leads: [],
    buyers: [],
    buyboxes: [],
    recommendations: [],
    notifications: [],
    rows: [],
    items: [],
    total: 0,
    totalAll: 0,
    totalFiltered: 0
  };
}

async function main() {
  const app = express();
  const serverRequests = [];
  app.use((req, res, next) => {
    const entry = {
      method: req.method,
      url: req.originalUrl,
      x_user_id: String(req.headers['x-user-id'] || ''),
      status: null
    };
    serverRequests.push(entry);
    res.on('finish', () => { entry.status = res.statusCode; });
    next();
  });
  app.get('/dashboard/', (req, res) => res.sendFile(path.join(root, 'dashboard', 'index.html')));
  app.use('/dashboard', express.static(path.join(root, 'dashboard')));
  app.get('/favicon.ico', (req, res) => res.status(204).end());
  app.get('/api/*', (req, res) => res.json(emptyApiPayload(req)));
  app.all('*', (req, res) => res.status(405).json({ ok: false, error: 'Synthetic load proof permits GET requests only.' }));

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let browser;
  let browserRuntime;
  try {
    const launched = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
    browser = launched.browser;
    browserRuntime = launched.runtime;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    await context.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('wos_pin', '1234');
      localStorage.setItem('montsan_userId', 'admin');
      localStorage.setItem('montsan_role', 'admin');
      localStorage.setItem('wos_public_deals_market', 'dallas');
    });
    await context.route('**/*', async (route) => {
      if (route.request().url().startsWith(baseUrl + '/')) return route.continue();
      return route.fulfill({ status: 204, body: '' });
    });

    const page = await context.newPage();
    const browserRequests = [];
    const requestEntries = new WeakMap();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('request', (request) => {
      const entry = { method: request.method(), url: request.url(), status: null, failure: '' };
      requestEntries.set(request, entry);
      browserRequests.push(entry);
    });
    page.on('response', (response) => {
      const entry = requestEntries.get(response.request());
      if (entry) entry.status = response.status();
    });
    page.on('requestfailed', (request) => {
      const entry = requestEntries.get(request);
      if (entry) entry.failure = request.failure() && request.failure().errorText || 'request_failed';
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseUrl + '/dashboard/', { waitUntil: 'networkidle' });
    await page.evaluate((data) => {
      const body = document.querySelector('#wos-public-deals .wos-public-deals-body');
      const hooks = window.__wosPublicDealsTestHooks;
      if (!body || !hooks || typeof hooks.panelsForPage !== 'function') throw new Error('dashboard packet renderer unavailable');
      body.innerHTML = hooks.panelsForPage('dashboard', data, data.rows || [], '');
    }, {
      ok: true,
      has_snapshot: true,
      market,
      rows: [],
      counts: {},
      source_coverage: [],
      auto_run: { enabled: false },
      manual_evidence_packet: { selected_count: 1, items: [packetItem] }
    });
    await page.getByText('Manual Evidence Packet', { exact: false }).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const nonGetRequests = browserRequests.filter((entry) => entry.method !== 'GET');
    const failedResponses = browserRequests.filter((entry) => entry.failure || (entry.status != null && entry.status >= 400));
    const buyboxReads = serverRequests.filter((entry) => entry.method === 'GET' && /^\/api\/buyboxes(?:\/recommendations)?(?:\?|$)/.test(entry.url));
    const content = await page.locator('#content').innerText();
    const dbAfter = fs.readFileSync(dbPath);
    const result = {
      data_kind: 'SYNTHETIC_TEST_ONLY',
      generated_at: new Date().toISOString(),
      browser_runtime: browserRuntime,
      observation_window_ms: 5000,
      dashboard_rendered: content.includes('Manual Evidence Packet'),
      readiness_axes_rendered: ['Can contact: YES', 'Can value: NO', 'Ready to offer: NO'].every((label) => content.includes(label)),
      non_get_request_count: nonGetRequests.length,
      failed_response_count: failedResponses.length,
      console_error_count: consoleErrors.length,
      page_error_count: pageErrors.length,
      isolated_db_byte_identical: Buffer.compare(syntheticDb, dbAfter) === 0,
      buybox_reads_include_admin_header: buyboxReads.length > 0 && buyboxReads.every((entry) => entry.x_user_id === 'admin'),
      requests: browserRequests,
      server_requests: serverRequests,
      console_errors: consoleErrors,
      page_errors: pageErrors
    };
    fs.writeFileSync(resultsPath, JSON.stringify(result, null, 2));

    assert.deepStrictEqual(nonGetRequests, [], `Dashboard load made non-GET requests: ${JSON.stringify(nonGetRequests)}`);
    assert.deepStrictEqual(failedResponses, [], `Dashboard load had failed responses: ${JSON.stringify(failedResponses)}`);
    assert.deepStrictEqual(consoleErrors, [], `Dashboard load logged console errors: ${JSON.stringify(consoleErrors)}`);
    assert.deepStrictEqual(pageErrors, [], `Dashboard load raised page errors: ${JSON.stringify(pageErrors)}`);
    assert.strictEqual(result.isolated_db_byte_identical, true, 'Synthetic DB must be byte-identical after dashboard load');
    assert.strictEqual(result.dashboard_rendered, true, 'Manual Evidence Packet must render on the real dashboard');
    assert.strictEqual(result.readiness_axes_rendered, true, 'All three Manual Evidence Packet readiness axes must render');
    assert.strictEqual(result.buybox_reads_include_admin_header, true, 'Admin-gated buy-box reads must include x-user-id');
    console.log(`Cycle 21 dashboard load proof passed: ${browserRequests.length} GET requests, 0 writes, 0 failed responses, DB unchanged.`);
    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`Request evidence: ${resultsPath}`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(isolatedDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
