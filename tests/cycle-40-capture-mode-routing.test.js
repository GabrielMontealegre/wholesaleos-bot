'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const agent = require('../scripts/wos-local-comp-agent');
const helper = require('../scripts/wos-local-helper');

const market = { city: 'Ennis', county: 'Ellis', state: 'TX' };
const address = '3808 Kings Dr, Ennis, TX 75119';
const detailUrl = 'https://www.zillow.com/homedetails/3808-kings-dr-ennis-tx-75119/';
const soldUrl = 'https://www.zillow.com/homes/recently_sold/?searchQueryState=synthetic';
const row = {
  queue_key: 'cycle40-synthetic-row', address_state: 'complete_source_address', normalized_address: address,
  city: market.city, county: market.county, state: market.state,
  source_family: 'synthetic_public_notice', source_proof_text: `SYNTHETIC TEST ONLY subject property at ${address}`,
  source_document_url: 'https://county.example.invalid/synthetic.pdf',
  sale_date_iso: '2026-10-06', status_evidence_text: 'SYNTHETIC TEST ONLY current event',
  zillow_url: detailUrl, preview_only: true, should_ingest: false, not_a_saved_lead: true
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function browserStub(counters, status = 200) {
  let currentUrl = '';
  const locator = (selector) => ({
    count: async () => selector === 'main' ? 1 : 0,
    innerText: async () => 'Single family home. List price $300,000. Year built 2001.',
    first() { return this; },
    screenshot: async () => Buffer.from('synthetic-image')
  });
  const page = {
    setDefaultTimeout() {},
    url: () => currentUrl,
    goto: async (url) => { counters.navigations.push(url); currentUrl = url; return { status: () => status }; },
    locator,
    context: () => ({ close: async () => {} })
  };
  return async () => {
    counters.launches += 1;
    return { browser: {
      newContext: async () => ({ route: async () => {}, newPage: async () => page, close: async () => {} }),
      close: async () => {}
    } };
  };
}

function dashboardCaptureFunction(calls) {
  const uiSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
  const start = uiSource.indexOf('  function captureWithLocalHelper(');
  const end = uiSource.indexOf('  function ensureSection(', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    localHelperState: { running: true, paired: true },
    LOCAL_HELPER: 'http://127.0.0.1:8797',
    selectedMarket: () => market,
    fetchLatestWithNote() {}, refreshLocalHelperStatus() {},
    localCaptureResults: {},
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ ok: true, run: { captures_submitted: 0, outcome: 'synthetic_done' } }) };
    }
  };
  return vm.runInNewContext(`${uiSource.slice(start, end)}\ncaptureWithLocalHelper`, context);
}

async function dashboardMode(mode, expected) {
  const calls = [];
  const capture = dashboardCaptureFunction(calls);
  const message = { textContent: '' };
  const card = { dataset: { queueKey: row.queue_key } };
  const rowBox = { querySelector: () => message };
  const button = {
    dataset: mode ? { captureMode: mode } : {}, disabled: false, textContent: 'Capture',
    closest: (selector) => selector === '.wos-manual-evidence-card' ? card : rowBox
  };
  await capture({ querySelector: () => message }, button);
  assert.strictEqual(calls.length, expected ? 1 : 0);
  if (expected) {
    assert.strictEqual(JSON.parse(calls[0].init.body).mode, expected);
    assert.strictEqual(calls[0].init.mode, 'cors');
  } else assert.ok(message.textContent.includes('Capture mode missing'));
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle40-'));
  try {
    await dashboardMode('subject_facts', 'subject_facts');
    await dashboardMode('sold_comps', 'sold_comps');
    await dashboardMode('', '');

    const configPath = path.join(tmp, 'helper.json');
    const dashboard = 'https://dashboard.example.test';
    helper.writeConfig({ dashboard_url: dashboard, agent_token: 'synthetic-token' }, configPath);
    const forwarded = [];
    const server = helper.createHelperServer({ dashboard_url: dashboard, config_path: configPath,
      run_capture_impl: async (input) => {
        forwarded.push(input.mode);
        return { run: { mode: input.mode, outcome: 'synthetic_done' }, log_path: path.join(tmp, 'synthetic.json') };
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const send = async (mode, includeMode = true) => {
        const body = { market, queue_key: row.queue_key };
        if (includeMode) body.mode = mode;
        const result = await fetch(`${base}/helper/capture`, {
          method: 'POST', headers: { Origin: dashboard, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        return { status: result.status, body: await result.json() };
      };
      assert.strictEqual((await send('subject_facts')).status, 200);
      assert.deepStrictEqual(forwarded, ['subject_facts']);
      assert.deepStrictEqual(await send(undefined, false), { status: 400, body: { ok: false, code: 'CAPTURE_MODE_REQUIRED' } });
      assert.deepStrictEqual(await send('garbage'), { status: 400, body: { ok: false, code: 'CAPTURE_MODE_REQUIRED' } });
      assert.deepStrictEqual(forwarded, ['subject_facts']);
    } finally { await new Promise((resolve) => server.close(resolve)); }

    const counters = { fetches: 0, launches: 0, navigations: [] };
    const common = {
      market, queue_key: row.queue_key, dashboard_url: dashboard, agent_token: 'synthetic-token', site: 'zillow',
      log_dir: path.join(tmp, 'logs'), rate_state_path: path.join(tmp, 'rate.json'),
      fetch_impl: async () => { counters.fetches += 1; return response({ rows: [row], manual_evidence_packet: { items: [] } }); },
      browser_resolver_impl: browserStub(counters), ocr_impl: async () => ''
    };
    await assert.rejects(agent.runCapture({}, common), /capture_mode_required/);
    await assert.rejects(agent.runCapture({ mode: 'garbage' }, common), /capture_mode_required/);
    assert.deepStrictEqual([counters.fetches, counters.launches, counters.navigations.length], [0, 0, 0]);

    const subject = await agent.runCapture({ ...common, mode: 'subject_facts' }, common);
    assert.strictEqual(subject.run.mode, 'subject_facts');
    assert.deepStrictEqual(counters.navigations, [detailUrl]);
    assert.strictEqual(subject.run.pages_visited, 1);
    assert.deepStrictEqual(subject.run.url_kinds_visited, [{ host: 'www.zillow.com', url_kind: 'property_detail' }]);
    assert.strictEqual(subject.run.proposals, 0);
    assert.strictEqual(subject.run.requested_mode, subject.run.effective_mode);
    assert.strictEqual(subject.run.helper_build, agent.HELPER_BUILD);

    const launchesBeforeBadTarget = counters.launches;
    const badTarget = await agent.runCapture({ ...common, mode: 'subject_facts' }, {
      ...common, fetch_impl: async () => response({ rows: [{ ...row, zillow_url: soldUrl }], manual_evidence_packet: { items: [] } })
    });
    assert.strictEqual(badTarget.run.outcome, 'subject_target_not_property_detail');
    assert.strictEqual(counters.launches, launchesBeforeBadTarget);
    assert.deepStrictEqual(counters.navigations, [detailUrl]);
    assert.strictEqual(badTarget.run.pages_visited, 0);
    assert.strictEqual(badTarget.run.url_kinds_visited.length, 0);

    const soldCounters = { fetches: 0, launches: 0, navigations: [] };
    const sold = await agent.runCapture({ ...common, mode: 'sold_comps' }, {
      ...common, source_order: ['zillow', 'redfin'],
      browser_resolver_impl: browserStub(soldCounters, 403),
      fetch_impl: async () => response({ rows: [row], manual_evidence_packet: { items: [] } })
    });
    assert.deepStrictEqual(sold.run.source_results.map((item) => item.source), ['zillow', 'redfin']);
    assert.strictEqual(sold.run.pages_visited, 2);
    assert.strictEqual(sold.run.proposals, 0);
    assert.strictEqual(sold.run.outcome, 'zillow:BLOCKED_STOPPED|redfin:BLOCKED_STOPPED');
    assert.deepStrictEqual(sold.run.url_kinds_visited.map((item) => item.url_kind), ['sold_search', 'sold_search']);

    assert.throws(() => agent.cleanRunLog({ ...subject.run, requested_mode: 'sold_comps' }), /capture_mode_mismatch/);
    const agentSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'wos-local-comp-agent.js'), 'utf8');
    assert.ok(agentSource.includes("Object.defineProperty(run, 'mode', { value: mode, enumerable: true, writable: false })"));
    assert.ok(!/run\.mode\s*=(?!=)/.test(agentSource), 'mode is never reassigned after creation');

    const busyNet = { createServer() { return {
      once(_event, fn) { this.fail = fn; return this; }, listen() { this.fail({ code: 'EADDRINUSE' }); }, close() {}
    }; } };
    const doctor = await helper.doctorReport({ config_path: configPath, net_impl: busyNet,
      running_status_impl: async () => ({ ok: true, version: 1, running: true, paired: true })
    });
    assert.strictEqual(doctor.running_helper_build, 'unknown');
    assert.strictEqual(doctor.running_helper_stale, true);
    const lines = [];
    const originalLog = console.log;
    try { console.log = (line) => lines.push(line); helper.printDoctor(doctor); }
    finally { console.log = originalLog; }
    assert.ok(lines.some((line) => line.includes('STALE/UNKNOWN BUILD - restart helper')));
    assert.ok(lines.every((line) => !line.includes('synthetic-token')));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('cycle-40-capture-mode-routing: ok');
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
