'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const sessions = require('../modules/security/dashboard-session');
const routeModule = require('../modules/research/research-queue-read-route');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle38-alias-'));

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

async function waitForServer(base, processInfo) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode != null) throw new Error(`server exited (${processInfo.child.exitCode}): ${processInfo.output().slice(-1000)}`);
    try { if ((await fetch(`${base}/health`)).ok) return; } catch (_) {}
    await sleep(100);
  }
  throw new Error(`server health timeout: ${processInfo.output().slice(-1000)}`);
}

async function request(base, route, headers = {}) {
  const response = await fetch(base + route, { headers });
  return {
    status: response.status,
    cacheControl: response.headers.get('cache-control'),
    raw: await response.text()
  };
}

function cookieFrom(response) {
  return (response.headers.get('set-cookie') || '').split(';')[0];
}

async function stop(processInfo) {
  if (!processInfo || processInfo.child.exitCode != null) return;
  processInfo.child.kill();
  await sleep(100);
}

(async () => {
  const secret = crypto.randomBytes(48).toString('base64url');
  const pin = String(4000 + crypto.randomInt(5000));
  const dbFile = path.join(temp, 'db.json');
  const snapshotFile = path.join(temp, 'snapshots.json');
  const packetFile = path.join(temp, 'packets.json');
  const jobsFile = path.join(temp, 'jobs.json');
  const pairingFile = path.join(temp, 'pairings.json');
  const fixtureMarker = 'CYCLE38_PRIVATE_FIXTURE_MARKER';
  const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
  fs.writeFileSync(dbFile, JSON.stringify({ leads: [], users: [{ id: 'admin', name: 'Admin', role: 'admin', firstLogin: false }] }));
  fs.writeFileSync(snapshotFile, JSON.stringify({
    version: 1,
    store_kind: 'deal_board_snapshots_not_saved_leads',
    updated_at: '2026-09-22T00:00:00.000Z',
    markets: {
      'dallas|dallas|tx': {
        market,
        rows: [],
        batches: [{ run_at: '2026-09-21T00:00:00.000Z', marker: fixtureMarker }]
      }
    }
  }));
  fs.writeFileSync(packetFile, JSON.stringify({ version: 1, markets: {} }));
  fs.writeFileSync(jobsFile, JSON.stringify({ version: 1, jobs: {} }));
  fs.writeFileSync(pairingFile, JSON.stringify({ version: 1, pairings: {}, agents: {} }));

  const environment = {
    DB_PATH: dbFile,
    DEAL_BOARD_SNAPSHOTS_PATH: snapshotFile,
    DEAL_BOARD_JOBS_PATH: jobsFile,
    MANUAL_EVIDENCE_PACKETS_PATH: packetFile,
    WOS_PAIRING_STATE_PATH: pairingFile,
    WOS_ADMIN_PIN: pin,
    WOS_SESSION_SECRET: secret
  };
  const port = 37000 + (process.pid % 2000);
  const base = `http://127.0.0.1:${port}`;
  const server = spawnServer(port, environment);
  await waitForServer(base, server);

  try {
    const loginResponse = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    assert.strictEqual(loginResponse.status, 200);
    const auth = { Cookie: cookieFrom(loginResponse) };
    const query = '?city=Dallas&county=Dallas&state=TX';
    const oldRoute = routeModule.LEGACY_PATH + query;
    const newRoute = routeModule.CURRENT_PATH + query;

    const oldAuthenticated = await request(base, oldRoute, auth);
    const newAuthenticated = await request(base, newRoute, auth);
    assert.strictEqual(oldAuthenticated.raw, newAuthenticated.raw, 'T1 old and new paths return byte-identical JSON');
    assert.strictEqual(oldAuthenticated.status, newAuthenticated.status, 'T2 status is identical');
    assert.strictEqual(oldAuthenticated.cacheControl, newAuthenticated.cacheControl, 'T2 Cache-Control is identical');
    assert.strictEqual(newAuthenticated.cacheControl, 'no-store');

    const oldUnauthenticated = await request(base, oldRoute);
    const newUnauthenticated = await request(base, newRoute);
    assert.strictEqual(oldUnauthenticated.status, 401, 'T3 old path remains private');
    assert.strictEqual(newUnauthenticated.status, 401, 'T3 new path is private');
    assert.ok(!oldUnauthenticated.raw.includes(fixtureMarker) && !newUnauthenticated.raw.includes(fixtureMarker), 'T3 auth failures do not leak snapshot fields');

    const nonce = crypto.randomUUID();
    const agentSession = sessions.issueSession({
      userId: 'admin', role: 'admin', scope: 'agent', permissions: ['manual_evidence:write'], nonce
    }, { secret, lifetime_ms: 60000 });
    fs.writeFileSync(pairingFile, JSON.stringify({
      version: 1,
      pairings: {},
      agents: { [nonce]: { userId: 'admin', expiresAt: agentSession.payload.expiresAt, revoked: false } }
    }));
    const agentHeaders = { Authorization: `Bearer ${agentSession.token}` };
    const oldAgent = await request(base, oldRoute, agentHeaders);
    const newAgent = await request(base, newRoute, agentHeaders);
    assert.strictEqual(oldAgent.status, 401, 'T4 old path rejects an agent without deal_board:read');
    assert.strictEqual(newAgent.status, oldAgent.status, 'T4 new path rejects that agent identically');
    assert.strictEqual(newAgent.raw, oldAgent.raw, 'T4 rejection body is identical');

    const registrations = [];
    const sharedAuth = function sharedAuth(req, res, next) { next(); };
    const registered = routeModule.registerResearchQueueReadRoutes({
      get(route, authorization, handler) { registrations.push({ route, authorization, handler }); }
    }, (permission) => {
      assert.strictEqual(permission, 'deal_board:read');
      return sharedAuth;
    });
    assert.strictEqual(registrations.length, 2);
    assert.strictEqual(registrations[0].handler, registrations[1].handler, 'T5 both aliases use the same handler function reference');
    assert.strictEqual(registrations[0].handler, registered.handler);
    assert.strictEqual(registrations[0].authorization, registrations[1].authorization, 'authorization middleware is also shared');

    const before = {
      db: fs.readFileSync(dbFile), snapshots: fs.readFileSync(snapshotFile), packets: fs.readFileSync(packetFile), jobs: fs.readFileSync(jobsFile)
    };
    const originalEnv = {
      DB_PATH: process.env.DB_PATH,
      DEAL_BOARD_SNAPSHOTS_PATH: process.env.DEAL_BOARD_SNAPSHOTS_PATH,
      DEAL_BOARD_JOBS_PATH: process.env.DEAL_BOARD_JOBS_PATH,
      MANUAL_EVIDENCE_PACKETS_PATH: process.env.MANUAL_EVIDENCE_PACKETS_PATH
    };
    Object.assign(process.env, environment);
    const originals = {
      writeFileSync: fs.writeFileSync,
      appendFileSync: fs.appendFileSync,
      renameSync: fs.renameSync
    };
    const writeCalls = [];
    fs.writeFileSync = function (...args) { writeCalls.push(['writeFileSync', String(args[0])]); return originals.writeFileSync.apply(fs, args); };
    fs.appendFileSync = function (...args) { writeCalls.push(['appendFileSync', String(args[0])]); return originals.appendFileSync.apply(fs, args); };
    fs.renameSync = function (...args) { writeCalls.push(['renameSync', String(args[0])]); return originals.renameSync.apply(fs, args); };
    try {
      for (const route of registrations) {
        let status = 200;
        let body;
        const response = {
          set() {},
          status(value) { status = value; return this; },
          json(value) { body = value; return this; }
        };
        route.handler({ query: market }, response);
        assert.strictEqual(status, 200);
        assert.strictEqual(body.ok, true);
      }
    } finally {
      fs.writeFileSync = originals.writeFileSync;
      fs.appendFileSync = originals.appendFileSync;
      fs.renameSync = originals.renameSync;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
    assert.deepStrictEqual(writeCalls, [], 'T6 neither GET performs a filesystem write');
    assert.deepStrictEqual(fs.readFileSync(dbFile), before.db, 'T6 saved leads remain byte-identical');
    assert.deepStrictEqual(fs.readFileSync(snapshotFile), before.snapshots, 'T6 snapshot store remains byte-identical');
    assert.deepStrictEqual(fs.readFileSync(packetFile), before.packets, 'T6 packet store remains byte-identical');
    assert.deepStrictEqual(fs.readFileSync(jobsFile), before.jobs, 'T6 acquisition jobs remain byte-identical');

    const neutralSuffix = routeModule.CURRENT_PATH.replace(/^\/api\/dashboard\//, '');
    const blockedVocabulary = ['ad', 'ads', 'advert', 'banner', 'promo', 'deal', 'deals', 'offer', 'sponsor', 'track', 'popup', 'affiliate', 'board', 'coupon', 'sale'];
    const neutralTokens = neutralSuffix.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    assert.deepStrictEqual(neutralTokens.filter((token) => blockedVocabulary.includes(token)), [], 'T7 neutral route suffix avoids blocked vocabulary');

    const uiSource = fs.readFileSync(path.join(root, 'dashboard', 'wos-public-deals.js'), 'utf8');
    const uiContext = {
      window: {},
      document: { readyState: 'loading', addEventListener() {} },
      MutationObserver: function MutationObserver() {},
      setInterval() {},
      setTimeout() { return 1; },
      clearTimeout() {},
      AbortController: function AbortController() { this.signal = {}; this.abort = function () {}; },
      fetch: () => Promise.reject(new Error('blocked by client'))
    };
    vm.runInNewContext(uiSource, uiContext);
    let rejected;
    try { await uiContext.window.__wosPublicDealsTestHooks.requestLatestSnapshot(); }
    catch (error) { rejected = error; }
    const errorMarkup = uiContext.window.__wosPublicDealsTestHooks.snapshotErrorMarkup(rejected);
    assert.ok(errorMarkup.includes('Could not load the property queue (request blocked or timed out).'), 'T8 rejected fetch renders the plain-English error');
    assert.ok(errorMarkup.includes('wos-snapshot-retry') && errorMarkup.includes('Retry'), 'T8 rejected fetch renders Retry');
    assert.ok(!errorMarkup.includes('Loading public deals...'), 'T8 rejected fetch cannot leave the loading placeholder');

    console.log('cycle-38-research-queue-alias.test.js passed (T1-T8)');
  } finally {
    await stop(server);
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch (_) {}
  process.exitCode = 1;
});
