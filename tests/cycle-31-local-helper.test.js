'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const helper = require('../scripts/wos-local-helper');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle31-helper-'));
  const configPath = path.join(tmp, 'helper.json');
  const dashboard = 'https://dashboard.example.test';
  const agentToken = crypto.randomBytes(32).toString('base64url');
  let captureCalls = 0;
  let exchangeCalls = 0;
  const server = helper.createHelperServer({
    dashboard_url: dashboard,
    config_path: configPath,
    fetch_impl: async (url) => {
      exchangeCalls += 1;
      assert.strictEqual(url, `${dashboard}/api/auth/pairing-exchange`);
      return { ok: true, status: 200, async json() { return { ok: true, agent_token: agentToken, expires_at: new Date(Date.now() + 10000).toISOString() }; } };
    },
    run_capture_impl: async (input) => {
      captureCalls += 1;
      assert.strictEqual(input.agent_token, agentToken);
      assert.strictEqual(input.queue_key, 'fixture-row');
      return { run: { outcome: 'no_qualifying_sold_cards_found', captures_submitted: 0 }, log_path: path.join(tmp, 'run.json') };
    }
  });
  const base = await listen(server);
  try {
    const forbidden = await fetch(`${base}/helper/status`, { headers: { Origin: 'https://evil.example' } });
    assert.strictEqual(forbidden.status, 403);

    const initial = await fetch(`${base}/helper/status`, { headers: { Origin: dashboard } });
    assert.deepStrictEqual(await initial.json(), { ok: true, connected: true, version: 1, running: true, paired: false,
      capture_running: false, helper_build: require('../scripts/wos-local-comp-agent').HELPER_BUILD, subject_facts_supported: true });
    assert.strictEqual(captureCalls, 0, 'status polling never starts a capture');

    const unpaired = await fetch(`${base}/helper/capture`, {
      method: 'POST', headers: { Origin: dashboard, 'Content-Type': 'application/json' },
      body: JSON.stringify({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, queue_key: 'fixture-row' })
    });
    assert.strictEqual(unpaired.status, 401);
    assert.strictEqual(captureCalls, 0);

    const pairingToken = crypto.randomBytes(32).toString('base64url');
    const paired = await fetch(`${base}/helper/pair`, {
      method: 'POST', headers: { Origin: dashboard, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_token: pairingToken })
    });
    const pairedBody = await paired.json();
    assert.strictEqual(pairedBody.ok, true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(pairedBody, 'agent_token'), false, 'helper never returns its stored agent token to the browser');
    assert.strictEqual(exchangeCalls, 1);
    assert.ok(helper.readConfig(configPath));

    const capture = await fetch(`${base}/helper/capture`, {
      method: 'POST', headers: { Origin: dashboard, 'Content-Type': 'application/json' },
      body: JSON.stringify({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, queue_key: 'fixture-row', site: 'zillow', mode: 'sold_comps' })
    });
    assert.strictEqual(capture.status, 200);
    assert.strictEqual(captureCalls, 1, 'one explicit request starts exactly one capture');

    const agentSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'wos-local-comp-agent.js'), 'utf8');
    const helperSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'wos-local-helper.js'), 'utf8');
    const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
    assert.ok(!agentSource.includes('x-user-id'));
    assert.ok(!/\bpin\b/i.test(agentSource), 'agent never reads a PIN');
    assert.ok(helperSource.includes("server.listen(port, host"), 'launcher binds the helper through the loopback host constant');
    assert.ok(/class="wos-helper-capture"[^>]*\sdisabled(?:\s|>)/.test(dashboardSource), 'capture starts disabled while helper status is unknown or absent');
    assert.ok(!/refreshLocalHelperStatus[\s\S]{0,800}helper\/capture/.test(dashboardSource), 'passive status polling does not call capture');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('cycle-31-local-helper: ok');
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
