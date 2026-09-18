'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sessions = require('../modules/security/dashboard-session');
const pairing = require('../modules/security/dashboard-pairing');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle31-session-'));

function runtimePin() { return String(3000 + crypto.randomInt(5000)); }
function runtimeSecret() { return crypto.randomBytes(48).toString('base64url'); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function spawnServer(port, env) {
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, env, { PORT: String(port), WOS_ENABLE_BACKGROUND_INGESTION: 'false' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += String(chunk); });
  child.stderr.on('data', (chunk) => { output += String(chunk); });
  return { child, output: () => output };
}

async function waitFor(base, processInfo) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode != null) throw new Error(`server exited before health check (${processInfo.child.exitCode})`);
    try { if ((await fetch(`${base}/health`)).ok) return; } catch (_) {}
    await sleep(100);
  }
  throw new Error(`server health timeout: ${processInfo.output().slice(-800)}`);
}

async function stop(processInfo) {
  if (!processInfo || processInfo.child.exitCode != null) return;
  processInfo.child.kill();
  await sleep(100);
}

async function api(base, method, route, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  const request = { method, headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(options.body);
  }
  const response = await fetch(base + route, request);
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch (_) { body = { raw }; }
  return { status: response.status, body, raw, headers: response.headers };
}

function cookieFrom(response) {
  const value = response.headers.get('set-cookie') || '';
  return value.split(';')[0];
}

(async () => {
  const pin = runtimePin();
  const secret = runtimeSecret();
  const serverDb = path.join(tmp, 'db.json');
  const snapshots = path.join(tmp, 'snapshots.json');
  const users = [
    { id: 'admin', name: 'Admin', role: 'admin', firstLogin: false },
    { id: 'user-one', name: 'User', role: 'user', pin: runtimePin(), firstLogin: false }
  ];
  fs.writeFileSync(serverDb, JSON.stringify({ leads: [], users }));
  fs.writeFileSync(snapshots, JSON.stringify({ version: 1, store_kind: 'deal_board_snapshots_not_saved_leads', markets: {
    'dallas|dallas|tx': { market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, rows: [], batches: [] }
  } }));
  const commonEnv = {
    DB_PATH: serverDb,
    DEAL_BOARD_SNAPSHOTS_PATH: snapshots,
    DEAL_BOARD_JOBS_PATH: path.join(tmp, 'jobs.json'),
    DEAL_BOARD_AUTO_RUN_PATH: path.join(tmp, 'auto.json'),
    MANUAL_EVIDENCE_PACKETS_PATH: path.join(tmp, 'packets.json'),
    WOS_PAIRING_STATE_PATH: path.join(tmp, 'pairings.json'),
    WOS_ADMIN_PIN: pin,
    WOS_SESSION_SECRET: secret
  };

  const now = Date.now();
  const fresh = sessions.issueSession({ userId: 'admin', role: 'admin' }, { secret, now });
  assert.strictEqual(sessions.verifySession(fresh.token, { secret, now: now + 1000 }).ok, true);
  assert.strictEqual(sessions.verifySession(fresh.token + 'x', { secret, now }).code, 'SESSION_BAD_SIGNATURE');
  assert.strictEqual(sessions.verifySession('malformed', { secret, now }).code, 'SESSION_MALFORMED');
  const expired = sessions.issueSession({ userId: 'admin', role: 'admin' }, { secret, now: now - 2000, lifetime_ms: 1000 });
  assert.strictEqual(sessions.verifySession(expired.token, { secret, now }).code, 'SESSION_EXPIRED');
  const halfway = sessions.issueSession({ userId: 'admin', role: 'admin' }, { secret, now: now - 8 * 24 * 60 * 60 * 1000 });
  assert.strictEqual(sessions.verifySession(halfway.token, { secret, now }).should_renew, true);
  assert.strictEqual(sessions.verifySession(fresh.token, { secret, now: now + 1000 }).should_renew, false);

  const pairingState = path.join(tmp, 'unit-pairings.json');
  const short = pairing.createPairing({ id: 'admin', role: 'admin' }, { secret, state_path: pairingState, now });
  assert.strictEqual(pairing.exchangePairing(short.pairing_token, { secret, state_path: pairingState, now: now + sessions.PAIRING_LIFETIME_MS + 1 }).ok, false);

  const port = 34000 + (process.pid % 10000);
  const base = `http://127.0.0.1:${port}`;
  const mainServer = spawnServer(port, commonEnv);
  await waitFor(base, mainServer);
  try {
    const status = await api(base, 'GET', '/api/auth/session');
    assert.strictEqual(status.status, 200);
    assert.deepStrictEqual(Object.keys(status.body).sort(), ['authenticated', 'login_configured', 'login_status', 'role', 'session_configured'].sort());
    assert.deepStrictEqual(status.body, { login_configured: true, login_status: 'configured', session_configured: true, authenticated: false, role: null });
    assert.ok(!status.raw.includes(pin) && !status.raw.includes(secret), 'status exposes no configured value');

    const login = await api(base, 'POST', '/api/auth/login', { body: { pin } });
    assert.strictEqual(login.status, 200);
    assert.ok(!login.raw.includes(pin) && !login.raw.includes(secret));
    const setCookie = login.headers.get('set-cookie') || '';
    assert.ok(/HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Strict/i.test(setCookie));
    const adminCookie = cookieFrom(login);

    const latest = '/api/dashboard/free-public-deal-board/latest?city=Dallas&county=Dallas&state=TX';
    const protectedRoutes = [
      ['GET', latest],
      ['GET', '/api/dashboard/free-public-deal-board/manual-evidence/sample'],
      ['POST', '/api/dashboard/free-public-deal-board/manual-evidence/upload'],
      ['POST', '/api/dashboard/free-public-deal-board/manual-evidence/proposal'],
      ['POST', '/api/dashboard/free-public-deal-board/contact-workflow'],
      ['POST', '/api/dashboard/free-public-deal-board/document-review-clear'],
      ['GET', '/api/users'],
      ['PUT', '/api/users/user-one'],
      ['POST', '/api/users/user-one/credentials']
    ];
    for (const [method, route] of protectedRoutes) {
      const result = await api(base, method, route, { headers: { 'x-user-id': 'admin' }, body: method === 'GET' ? undefined : {} });
      assert.strictEqual(result.status, 401, `${method} ${route} rejects a bare identity header`);
      assert.strictEqual(result.body.code, 'SESSION_REQUIRED');
    }

    const valid = await api(base, 'GET', latest, { headers: { Cookie: adminCookie } });
    assert.strictEqual(valid.status, 200);
    const tamperedCookie = adminCookie.slice(0, -1) + (adminCookie.endsWith('a') ? 'b' : 'a');
    assert.strictEqual((await api(base, 'GET', latest, { headers: { Cookie: tamperedCookie } })).status, 401);
    assert.strictEqual((await api(base, 'GET', latest, { headers: { Cookie: `wos_session=${encodeURIComponent(expired.token)}` } })).status, 401);

    const freshRoute = await api(base, 'GET', latest, { headers: { Cookie: `wos_session=${encodeURIComponent(fresh.token)}` } });
    assert.strictEqual(freshRoute.headers.get('set-cookie'), null, 'fresh sessions do not renew');
    const renewedRoute = await api(base, 'GET', latest, { headers: { Cookie: `wos_session=${encodeURIComponent(halfway.token)}` } });
    assert.ok((renewedRoute.headers.get('set-cookie') || '').includes('wos_session='), 'sessions renew after halfway');

    const userToken = sessions.issueSession({ userId: 'user-one', role: 'user' }, { secret });
    assert.strictEqual((await api(base, 'GET', '/api/users', { headers: { Cookie: `wos_session=${encodeURIComponent(userToken.token)}` } })).status, 403);
    const noPassword = await api(base, 'POST', '/api/auth/email-login', { body: { email: 'missing@example.test', password: 'not-used' } });
    assert.strictEqual(noPassword.status, 401);

    const pairingTokenResponse = await api(base, 'POST', '/api/auth/pairing-token', { headers: { Cookie: adminCookie }, body: {} });
    assert.strictEqual(pairingTokenResponse.status, 200);
    const exchange = await api(base, 'POST', '/api/auth/pairing-exchange', { body: { pairing_token: pairingTokenResponse.body.pairing_token } });
    assert.strictEqual(exchange.status, 200);
    const agentHeader = { Authorization: `Bearer ${exchange.body.agent_token}` };
    assert.strictEqual((await api(base, 'POST', '/api/auth/pairing-exchange', { body: { pairing_token: pairingTokenResponse.body.pairing_token } })).status, 401, 'pairing token is single-use');
    assert.strictEqual((await api(base, 'GET', latest, { headers: agentHeader })).status, 200, 'agent can read its row source');
    for (const [method, route] of [
      ['GET', '/api/users'], ['GET', '/api/dashboard/free-public-deal-board/manual-evidence/sample'],
      ['POST', '/api/dashboard/free-public-deal-board/contact-workflow'], ['POST', '/api/dashboard/free-public-deal-board/document-review-clear'],
      ['POST', '/api/auth/pairing-token']
    ]) {
      assert.strictEqual((await api(base, method, route, { headers: agentHeader, body: method === 'GET' ? undefined : {} })).status, 401, `agent scope cannot access ${route}`);
    }
    const uploadScope = await api(base, 'POST', '/api/dashboard/free-public-deal-board/manual-evidence/upload', { headers: agentHeader, body: {} });
    assert.notStrictEqual(uploadScope.status, 401, 'agent reaches upload validation');
    const proposalScope = await api(base, 'POST', '/api/dashboard/free-public-deal-board/manual-evidence/proposal', { headers: agentHeader, body: {} });
    assert.notStrictEqual(proposalScope.status, 401, 'agent reaches proposal validation');

    assert.strictEqual((await api(base, 'POST', '/api/auth/pairing-revoke', { headers: { Cookie: adminCookie }, body: {} })).status, 200);
    assert.strictEqual((await api(base, 'GET', latest, { headers: agentHeader })).status, 401, 'revoke invalidates the agent session');

    const loggedOut = await api(base, 'POST', '/api/auth/logout', { headers: { Cookie: adminCookie } });
    assert.strictEqual(loggedOut.status, 200);
    assert.ok(/Max-Age=0/.test(loggedOut.headers.get('set-cookie') || ''));
  } finally { await stop(mainServer); }

  const missingPort = port + 1;
  const missingBase = `http://127.0.0.1:${missingPort}`;
  const missingServer = spawnServer(missingPort, Object.assign({}, commonEnv, { WOS_SESSION_SECRET: '' }));
  await waitFor(missingBase, missingServer);
  try {
    assert.strictEqual((await api(missingBase, 'POST', '/api/auth/login', { body: { pin } })).body.code, 'SESSION_NOT_CONFIGURED');
    assert.strictEqual((await api(missingBase, 'GET', '/api/users', { headers: { 'x-user-id': 'admin' } })).status, 401);
  } finally { await stop(missingServer); }

  const ratePort = port + 2;
  const rateBase = `http://127.0.0.1:${ratePort}`;
  const rateServer = spawnServer(ratePort, Object.assign({}, commonEnv, { WOS_PAIRING_STATE_PATH: path.join(tmp, 'rate-pairings.json') }));
  await waitFor(rateBase, rateServer);
  try {
    let result;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      result = await api(rateBase, 'POST', '/api/auth/login', { body: { pin: runtimePin() } });
      if (attempt <= 5) assert.strictEqual(result.status, 401);
    }
    assert.strictEqual(result.status, 429);
    assert.strictEqual(result.body.code, 'LOGIN_RATE_LIMITED');
  } finally { await stop(rateServer); }

  console.log('cycle-31-session-security: ok');
})().finally(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
}).catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
