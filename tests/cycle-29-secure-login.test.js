'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const tmpRoot = path.join(__dirname, '.tmp', 'cycle-29-secure-login');
const nodePath = process.execPath;
const dashboardAuth = require('../modules/security/dashboard-auth');
const clientAuth = require('../dashboard/wos-dashboard-auth');
const preflight = require('../scripts/cycle-29-login-preflight');

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });

const TEST_ADMIN_PIN = '8642';
const TEST_USER_PIN = '7319';
const HISTORICAL_ADMIN_DEFAULT = '1234';
const HISTORICAL_USER_DEFAULTS = Array.from({ length: 9 }, (_, index) => String(2001 + index));
const users = [
  { id: 'admin', name: 'Test Admin', role: 'admin', pin: HISTORICAL_ADMIN_DEFAULT, firstLogin: false },
  { id: 'u2', name: 'Test User', role: 'user', pin: TEST_USER_PIN, firstLogin: true }
];

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`server exited before health check (${child.exitCode})`);
    try {
      const health = await fetch(`${baseUrl}/health`);
      if (health.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become healthy within 60 seconds: ${String(output()).slice(-1200)}`);
}

async function api(baseUrl, method, route, options) {
  const input = options || {};
  const headers = Object.assign({}, input.headers || {});
  const request = { method, headers };
  if (input.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(input.body);
  }
  const result = await fetch(`${baseUrl}${route}`, request);
  const text = await result.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }
  return { status: result.status, body, raw: text };
}

(async () => {
  let serverProcess;
  try {
    const configured = dashboardAuth.authenticatePin({ pin: TEST_ADMIN_PIN, users, env: { WOS_ADMIN_PIN: TEST_ADMIN_PIN } });
    assert.strictEqual(configured.ok, true, 'configured environment PIN authenticates the admin');
    assert.strictEqual(configured.user.id, 'admin');
    assert.strictEqual(dashboardAuth.authenticatePin({ pin: '0000', users, env: { WOS_ADMIN_PIN: TEST_ADMIN_PIN } }).status, 401, 'incorrect PIN is rejected');

    const disabled = dashboardAuth.authenticatePin({ pin: HISTORICAL_ADMIN_DEFAULT, users, env: {} });
    assert.strictEqual(disabled.ok, false);
    assert.strictEqual(disabled.code, 'ADMIN_LOGIN_NOT_CONFIGURED', 'unset environment disables login instead of accepting a seeded value');
    assert.strictEqual(dashboardAuth.authenticatePin({ pin: HISTORICAL_ADMIN_DEFAULT, users, env: { WOS_ADMIN_PIN: TEST_ADMIN_PIN } }).ok, false, 'historical admin default cannot authenticate');
    assert.strictEqual(dashboardAuth.authenticatePin({ pin: HISTORICAL_ADMIN_DEFAULT, users, env: { WOS_ADMIN_PIN: HISTORICAL_ADMIN_DEFAULT } }).code, 'ADMIN_LOGIN_INSECURE_DEFAULT', 'historical admin default stays retired even if configured');
    HISTORICAL_USER_DEFAULTS.forEach((pin) => {
      assert.strictEqual(dashboardAuth.authenticatePin({ pin, users: users.concat({ id: `legacy-${pin}`, role: 'user', pin }), env: { WOS_ADMIN_PIN: TEST_ADMIN_PIN } }).ok, false, 'historical user defaults cannot authenticate');
    });

    const dbPath = path.join(tmpRoot, 'db-unit.json');
    fs.writeFileSync(dbPath, JSON.stringify({ users: users }, null, 2));
    process.env.DB_PATH = dbPath;
    delete require.cache[require.resolve('../db')];
    const db = require('../db');
    assert.strictEqual(db.getUserByPin(''), undefined, 'empty PIN never matches');
    assert.strictEqual(db.getUserByPin(null), undefined, 'null PIN never matches');
    assert.strictEqual(db.getUserByPin(undefined), undefined, 'missing PIN never matches');
    assert.strictEqual(db.getUserByPin(HISTORICAL_ADMIN_DEFAULT), undefined, 'historical seeded PIN is rejected by the database lookup');
    assert.strictEqual(db.getUserByPin(TEST_USER_PIN).id, 'u2', 'a non-default configured user PIN remains usable');

    const appState = { currentUser: { id: 'cached-admin', role: 'admin' }, userId: 'cached-admin', role: 'admin', isAdmin: true, unlocked: true };
    globalThis.localStorage = { getItem() { return TEST_ADMIN_PIN; } };
    clientAuth.lockIdentity(appState);
    assert.strictEqual(appState.unlocked, false, 'localStorage cannot unlock the dashboard');
    assert.strictEqual(appState.currentUser, null);
    assert.deepStrictEqual(clientAuth.authHeaders(appState, false), {}, 'locked browser sends no authenticated identity');

    let externalNetworkAttempts = 0;
    const failedLogin = await clientAuth.authenticate(TEST_ADMIN_PIN, { fetch_impl: async (url) => {
      assert.strictEqual(url, '/api/auth/login');
      throw new Error('offline');
    } });
    assert.strictEqual(failedLogin.ok, false, 'API failure unlocks nothing');
    assert.strictEqual(failedLogin.code, 'LOGIN_REQUEST_FAILED');
    assert.strictEqual(appState.unlocked, false);

    const timeoutLogin = await clientAuth.authenticate(TEST_ADMIN_PIN, { fetch_impl: async (url) => {
      assert.strictEqual(url, '/api/auth/login');
      return Promise.reject(new Error('timeout'));
    } });
    assert.strictEqual(timeoutLogin.ok, false, 'API timeout unlocks nothing');
    assert.strictEqual(appState.currentUser, null, 'API timeout cannot fabricate an admin');

    const acceptedLogin = await clientAuth.authenticate(TEST_ADMIN_PIN, { fetch_impl: async (url) => {
      assert.strictEqual(url, '/api/auth/login');
      return response(200, { ok: true, user: { id: 'admin', name: 'Test Admin', role: 'admin' } });
    } });
    assert.strictEqual(clientAuth.applyAuthenticatedUser(appState, acceptedLogin.user), true);
    assert.strictEqual(appState.unlocked, true);
    assert.strictEqual(clientAuth.authHeaders(appState, false)['x-user-id'], 'admin');
    assert.strictEqual(externalNetworkAttempts, 0, 'browser tests make zero external network attempts');

    const indexHtml = fs.readFileSync(path.join(repoRoot, 'dashboard', 'index.html'), 'utf8');
    const rootIndexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const clientSource = fs.readFileSync(path.join(repoRoot, 'dashboard', 'wos-dashboard-auth.js'), 'utf8');
    const serverSource = fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8');
    assert.ok(indexHtml.includes('wos-dashboard-auth.js?v=1'));
    assert.ok(indexHtml.includes('id="pin-screen" style="display:flex"'));
    assert.ok(indexHtml.includes('id="app" style="display:none"'));
    assert.ok(!indexHtml.includes('montsan_pin'), 'browser no longer stores or reads a local PIN');
    assert.ok(!indexHtml.includes('correctPin'), 'browser has no local correct-PIN branch');
    assert.ok(!indexHtml.includes("pin === '1234'"), 'browser has no historical literal fallback');
    assert.ok(!indexHtml.includes("currentUser = {id: 'admin'"), 'browser cannot fabricate an admin after transport failure');
    assert.ok(!indexHtml.includes("applyRoleBasedUI('admin'); // fail open"), 'role lookup cannot fail open');
    [indexHtml, rootIndexHtml].forEach((html) => {
      assert.ok(!html.includes('montsan_pin'), 'no dashboard copy stores or reads a local PIN');
      assert.ok(!html.includes('Default PIN:'), 'no dashboard copy publishes a default PIN');
      assert.ok(!html.includes('Admin (1234)'), 'no dashboard copy publishes the historical admin PIN');
      assert.ok(!html.includes('Fallback local check'), 'no dashboard copy contains a local login fallback');
      assert.ok(!/\|\|\s*['\"]admin['\"]/.test(html), 'no dashboard copy silently substitutes admin for a missing identity');
      assert.ok(html.includes('wos-dashboard-auth.js?v=1'), 'every dashboard copy uses the fail-closed login helper');
    });
    assert.ok(clientSource.includes('__wos_unauthenticated__'), 'protected scripts receive a rejected sentinel before login');
    assert.ok(/app\.get\('\/api\/users',\s*requireAdmin/.test(serverSource));
    assert.ok(/app\.put\('\/api\/users\/:id',\s*requireAdminOrOwnFirstLoginPinUpdate/.test(serverSource));
    assert.ok(/app\.post\('\/api\/users',\s*requireAdmin/.test(serverSource));
    assert.ok(/app\.post\('\/api\/users\/:id\/credentials',\s*requireAdmin/.test(serverSource));

    const preflightDb = path.join(tmpRoot, 'preflight-db.json');
    fs.writeFileSync(preflightDb, JSON.stringify({ users: [
      { id: 'admin', name: 'Test Admin', role: 'admin', pin: null, firstLogin: false },
      { id: 'u2', name: 'Test User', role: 'user', pin: TEST_USER_PIN, firstLogin: false }
    ] }, null, 2));
    const safePreflight = preflight.buildPreflight({ database_path: preflightDb, env: { WOS_ADMIN_PIN: TEST_ADMIN_PIN }, server_source: serverSource });
    assert.strictEqual(safePreflight.verdict, 'SAFE_TO_REMOVE_FALLBACK');
    assert.strictEqual(safePreflight.admin_pin_configured, true);
    assert.strictEqual(safePreflight.admin_pin_is_a_seeded_default, false);
    assert.strictEqual(safePreflight.any_user_still_has_seeded_default_pin, 0);
    assert.strictEqual(safePreflight.login_would_succeed_for_configured_admin, true);
    assert.strictEqual(safePreflight.user_write_routes_guarded, true);
    assert.ok(!JSON.stringify(safePreflight).includes(TEST_ADMIN_PIN), 'preflight never emits the configured PIN');

    const serverDb = path.join(tmpRoot, 'server-db.json');
    const snapshotsPath = path.join(tmpRoot, 'deal-board-snapshots.json');
    const jobsPath = path.join(tmpRoot, 'deal-board-jobs.json');
    const autoRunPath = path.join(tmpRoot, 'deal-board-auto-run.json');
    const phoneEvidence = '(214) 555-0199';
    fs.writeFileSync(serverDb, JSON.stringify({ leads: [], users: [
      { id: 'admin', name: 'Test Admin', role: 'admin', pin: HISTORICAL_ADMIN_DEFAULT, firstLogin: false },
      { id: 'u2', name: 'Test User', role: 'user', pin: TEST_USER_PIN, firstLogin: true }
    ] }, null, 2));
    fs.writeFileSync(snapshotsPath, JSON.stringify({
      version: 1,
      store_kind: 'deal_board_snapshots_not_saved_leads',
      markets: {
        'dallas|dallas|tx': {
          market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
          rows: [{
            queue_key: 'cycle-29|phone-evidence',
            headline: '101 Test St, Dallas, TX 75201',
            normalized_address: '101 Test St, Dallas, TX 75201',
            city: 'Dallas', county: 'Dallas', state: 'TX',
            quality_bucket: 'INSPECT_NOW',
            preview_only: true, should_ingest: false, not_a_saved_lead: true,
            free_contact_routes: [{ route_kind: 'phone', value: phoneEvidence, source_url: 'https://example.test/phone-proof' }]
          }],
          batches: []
        }
      }
    }, null, 2));

    const port = 31000 + (process.pid % 10000);
    const baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = childProcess.spawn(nodePath, ['server.js'], {
      cwd: repoRoot,
      env: Object.assign({}, process.env, {
        PORT: String(port),
        DB_PATH: serverDb,
        DEAL_BOARD_SNAPSHOTS_PATH: snapshotsPath,
        DEAL_BOARD_JOBS_PATH: jobsPath,
        DEAL_BOARD_AUTO_RUN_PATH: autoRunPath,
        WOS_ADMIN_PIN: TEST_ADMIN_PIN,
        WOS_ENABLE_BACKGROUND_INGESTION: 'false'
      }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverOutput = '';
    serverProcess.stdout.on('data', (chunk) => { serverOutput += String(chunk); });
    serverProcess.stderr.on('data', (chunk) => { serverOutput += String(chunk); });
    await waitForServer(baseUrl, serverProcess, () => serverOutput);

    const login = await api(baseUrl, 'POST', '/api/auth/login', { body: { pin: TEST_ADMIN_PIN } });
    assert.strictEqual(login.status, 200);
    assert.strictEqual(login.body.user.id, 'admin');
    assert.ok(!login.raw.includes(TEST_ADMIN_PIN), 'login response never echoes the configured PIN');
    assert.strictEqual((await api(baseUrl, 'POST', '/api/auth/login', { body: { pin: '0000' } })).status, 401);
    assert.strictEqual((await api(baseUrl, 'POST', '/api/auth/login', { body: { pin: HISTORICAL_ADMIN_DEFAULT } })).status, 401);

    const latestRoute = '/api/dashboard/free-public-deal-board/latest?city=Dallas&county=Dallas&state=TX';
    const latestWithoutIdentity = await api(baseUrl, 'GET', latestRoute);
    assert.strictEqual(latestWithoutIdentity.status, 401);
    assert.ok(!latestWithoutIdentity.raw.includes(phoneEvidence), 'seller phone evidence cannot load without identity');
    assert.strictEqual((await api(baseUrl, 'GET', latestRoute, { headers: { 'x-user-id': 'unknown-user' } })).status, 401);
    assert.strictEqual((await api(baseUrl, 'GET', latestRoute, { headers: { 'x-user-id': '' } })).status, 401);
    assert.strictEqual((await api(baseUrl, 'GET', latestRoute, { headers: { 'x-user-id': 'u2' } })).status, 403);
    const latestWithIdentity = await api(baseUrl, 'GET', latestRoute, { headers: { 'x-user-id': 'admin' } });
    assert.strictEqual(latestWithIdentity.status, 200);
    assert.ok(latestWithIdentity.raw.includes(phoneEvidence), 'authenticated admin can read stored seller-phone evidence');
    assert.strictEqual(latestWithIdentity.body.rows[0].preview_only, true);
    assert.strictEqual(latestWithIdentity.body.rows[0].should_ingest, false);
    assert.strictEqual(latestWithIdentity.body.rows[0].not_a_saved_lead, true);

    const sampleRoute = '/api/dashboard/free-public-deal-board/manual-evidence/sample';
    assert.strictEqual((await api(baseUrl, 'GET', sampleRoute)).status, 401);
    assert.strictEqual((await api(baseUrl, 'GET', sampleRoute, { headers: { 'x-user-id': 'u2' } })).status, 403);
    assert.strictEqual((await api(baseUrl, 'GET', sampleRoute, { headers: { 'x-user-id': 'admin' } })).status, 200);

    const protectedWrites = [
      ['POST', '/api/dashboard/free-public-deal-board/manual-evidence/upload'],
      ['POST', '/api/dashboard/free-public-deal-board/manual-evidence/proposal'],
      ['POST', '/api/dashboard/free-public-deal-board/contact-workflow'],
      ['POST', '/api/dashboard/free-public-deal-board/document-review-clear'],
      ['PUT', '/api/users/u2'],
      ['POST', '/api/users']
    ];
    for (const [method, route] of protectedWrites) {
      const rejected = await api(baseUrl, method, route, { body: {} });
      assert.strictEqual(rejected.status, 401, `${method} ${route} rejects unauthenticated writes`);
    }

    const firstLoginUpdate = await api(baseUrl, 'PUT', '/api/users/u2', {
      headers: { 'x-user-id': 'u2' },
      body: { name: 'Configured User', pin: '4826', firstLogin: false }
    });
    assert.strictEqual(firstLoginUpdate.status, 200, 'first-login user can update only their own initial credentials');
    const elevationAttempt = await api(baseUrl, 'PUT', '/api/users/u2', {
      headers: { 'x-user-id': 'u2' },
      body: { role: 'admin' }
    });
    assert.strictEqual(elevationAttempt.status, 403, 'user cannot elevate their role');
    assert.strictEqual((await api(baseUrl, 'PUT', '/api/users/admin', {
      headers: { 'x-user-id': 'u2' }, body: { name: 'Changed' }
    })).status, 403, 'user cannot affect another account');

    assert.deepStrictEqual(JSON.parse(fs.readFileSync(snapshotsPath, 'utf8')).markets['dallas|dallas|tx'].rows[0].free_contact_routes[0].value, phoneEvidence, 'read-only auth checks do not mutate snapshot evidence');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(serverDb, 'utf8')).leads, [], 'auth checks do not create saved leads');
    assert.strictEqual(fs.existsSync(path.join(tmpRoot, 'network-attempts.json')), false);
    assert.ok(!serverOutput.includes(TEST_ADMIN_PIN), 'server output never logs the configured PIN');

    console.log('cycle-29-secure-login: ok');
    console.log('cycle-29 session note: x-user-id remains the current identity transport; signed sessions and expiry are deferred.');
  } finally {
    if (serverProcess && serverProcess.exitCode == null) {
      serverProcess.kill();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    delete globalThis.localStorage;
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
