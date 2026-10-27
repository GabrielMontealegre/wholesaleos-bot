'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const session = require('../modules/security/dashboard-session');
const uploadKeys = require('../modules/records/assistant-upload-keys');
const { probeProcessSpawn, processSpawnDenied } = require('./helpers/process-capability');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const helperSource = fs.readFileSync(path.join(root, 'modules/research/research-queue-read-route.js'), 'utf8');
const gateIndex = source.indexOf("app.use('/api', (req, res, next) => {");
assert.ok(gateIndex > 0, 'all API methods have one mounted session gate');
const registrations = [...source.matchAll(/\bapp\.(?:get|post|put|patch|delete|all)\(\s*['"](\/api(?:\/[^'"]*)?)['"]/g)];
assert.ok(registrations.length > 200, 'static audit covers the API route registrations');
for (const route of registrations) {
  assert.ok(route.index > gateIndex, `${route[1]} must be registered after the API gate`);
}
assert.ok(!source.includes("Access-Control-Allow-Origin', '*'"), 'no cross-origin wildcard');
for (const route of [
  '/dashboard/free-public-deal-board/latest',
  '/dashboard/research-queue/current',
  '/dashboard/free-public-deal-board/manual-evidence/upload',
  '/dashboard/free-public-deal-board/manual-evidence/proposal'
]) {
  assert.ok(source.includes(`path: '${route}'`), `local helper exception is explicit: ${route}`);
}
assert.ok(helperSource.includes("authorizationFactory('deal_board:read')"), 'helper read routes still verify the agent scope');
assert.ok(source.includes("requireAdminOrAgent('manual_evidence:write')"), 'helper write routes still verify the agent scope');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function request(base, method, route, options = {}) {
  const headers = Object.assign({}, options.headers);
  const init = { method, headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(base + route, init);
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch (_) { body = raw; }
  return { status: response.status, body, headers: response.headers };
}

(async () => {
  if (!(await probeProcessSpawn()).available) {
    console.log('SKIPPED: real-server API checks require process spawn');
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-api-gate-'));
  const port = 41000 + (process.pid % 20000);
  const base = `http://127.0.0.1:${port}`;
  const pin = String(3000 + crypto.randomInt(5000));
  const secret = crypto.randomBytes(48).toString('base64url');
  const providerToken = crypto.randomBytes(32).toString('hex');
  const dbPath = path.join(tmp, 'db.json');
  const syntheticKey = uploadKeys.createKey({
    leads: [{ id: 'seed-lead', address: '123 Test St', status: 'New Lead' }],
    users: [{ id: 'admin', name: 'Admin', role: 'admin', firstLogin: false },
      { id: 'regular-fixture', name: 'SYNTHETIC USER', role: 'user', firstLogin: false }]
  }, { operatorId: 'admin', now: new Date(Date.now() - 60000).toISOString(), entropy: Buffer.from(Array.from({ length: 48 }, (_, i) => i)) });
  const syntheticKeyRows = JSON.stringify(syntheticKey.store.assistant_upload_keys);
  const syntheticKeyHash = syntheticKey.store.assistant_upload_keys[0].secret_sha256;
  const syntheticKeyId = syntheticKey.store.assistant_upload_keys[0].id;
  fs.writeFileSync(dbPath, JSON.stringify(syntheticKey.store));
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      PORT: String(port), DB_PATH: dbPath, WOS_ADMIN_PIN: pin, WOS_SESSION_SECRET: secret,
      TWILIO_AUTH_TOKEN: providerToken, RAILWAY_PUBLIC_DOMAIN: '',
      SENTRY_DSN: '',
      GMAIL_CLIENT_ID: '', GMAIL_CLIENT_SECRET: '', GDRIVE_REFRESH_TOKEN: '',
      WOS_ENABLE_BACKGROUND_INGESTION: 'false',
      DEAL_BOARD_SNAPSHOTS_PATH: path.join(tmp, 'snapshots.json'),
      DEAL_BOARD_JOBS_PATH: path.join(tmp, 'jobs.json'),
      DEAL_BOARD_AUTO_RUN_PATH: path.join(tmp, 'auto.json'),
      MANUAL_EVIDENCE_PACKETS_PATH: path.join(tmp, 'packets.json'),
      WOS_PAIRING_STATE_PATH: path.join(tmp, 'pairings.json')
    }),
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += String(chunk); });
  child.stderr.on('data', (chunk) => { output += String(chunk); });
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}): ${output.slice(-500)}`);
      try { healthy = (await request(base, 'GET', '/health')).status === 200; } catch (_) {}
      if (healthy) break;
      await sleep(100);
    }
    assert.ok(healthy, `server health timeout: ${output.slice(-500)}`);
    assert.strictEqual((await request(base, 'GET', '/health')).status, 200);
    const publicStatus = await request(base, 'GET', '/api/auth/session');
    assert.strictEqual(publicStatus.status, 200);
    assert.strictEqual(publicStatus.headers.get('access-control-allow-origin'), null);

    for (const [method, route, body] of [
      ['GET', '/api/leads'],
      ['GET', '/api/gmail/messages'],
      ['GET', '/api/sms/conversations'],
      ['POST', '/api/leads/import', { leads: [] }],
      ['DELETE', '/api/leads/seed-lead'],
      ['GET', '/api/new-route-not-registered'],
      ['GET', '/api/dashboard/free-public-deal-board/latest'],
      ['POST', '/api/dashboard/free-public-deal-board/manual-evidence/proposal', {}]
    ]) {
      const denied = await request(base, method, route, { body, headers: { 'x-user-id': 'admin' } });
      assert.strictEqual(denied.status, 401, `${method} ${route} requires a signed session`);
    }
    assert.strictEqual(JSON.parse(fs.readFileSync(dbPath, 'utf8')).leads.length, 1, 'anonymous DELETE did not mutate the lead');

    const now = Date.now();
    const forged = session.issueSession({ userId: 'admin', role: 'admin', scope: 'dashboard' }, { secret }).token + 'x';
    const expired = session.issueSession({ userId: 'admin', role: 'admin', scope: 'dashboard' }, { secret, now: now - 2000, lifetime_ms: 1000 }).token;
    const wrongScope = session.issueSession({ userId: 'admin', role: 'admin', scope: 'agent' }, { secret }).token;
    for (const token of [forged, expired, wrongScope]) {
      const denied = await request(base, 'GET', '/api/leads', { headers: { Cookie: `wos_session=${encodeURIComponent(token)}` } });
      assert.strictEqual(denied.status, 401, 'forged, expired and wrong-scope cookies cannot read leads');
    }

    const login = await request(base, 'POST', '/api/auth/login', { body: { pin } });
    assert.strictEqual(login.status, 200);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(cookie.startsWith('wos_session='));
    assert.strictEqual((await request(base, 'GET', '/api/leads', { headers: { Cookie: cookie } })).status, 200);

    const snapshotPath = '/api/dashboard/assistant-snapshots';
    const privateSnapshot = { schema: 'wos-assistant-snapshot', version: 1, generated_at: new Date(Date.now() - 60000).toISOString(), deals: [],
      buyers: [{ id: 'snapshot-buyer', name: 'PRIVATE_SNAPSHOT_SENTINEL', company: null, areas: [], buy_box: null, pof: true, approval: 'approved', last_contact: null, deals_sent: [], phone: null, email: null, source_url: null }],
      texts: [], calls: [], emails_waiting: [] };
    const snapshotBytes = Buffer.from(JSON.stringify(privateSnapshot));
    const uploadHeaders = { Cookie: cookie, Origin: base, 'Content-Type': 'application/octet-stream', 'X-WOS-Assistant-Import': '1', 'X-WOS-Assistant-Filename': 'assistant-fixture.json' };
    for (const headers of [{ 'x-user-id': 'admin' }, { Cookie: `wos_session=${encodeURIComponent(forged)}` }]) {
      const denied = await fetch(base + snapshotPath, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: 'PRIVATE_MALFORMED_JSON' });
      assert.strictEqual(denied.status, 401); assert.strictEqual(denied.headers.get('cache-control'), 'no-store');
      assert.ok(!(await denied.text()).includes('PRIVATE_'), 'Authorization precedes generic body parsing');
    }
    const regular = session.issueSession({ userId: 'regular-fixture', role: 'user', scope: 'dashboard' }, { secret }).token;
    const regularRead = await fetch(base + snapshotPath, { headers: { Cookie: `wos_session=${encodeURIComponent(regular)}` } });
    assert.strictEqual(regularRead.status, 403); assert.strictEqual(regularRead.headers.get('cache-control'), 'no-store');
    const wrongType = await fetch(base + snapshotPath, { method: 'POST', headers: { ...uploadHeaders, 'Content-Type': 'application/json' }, body: 'PRIVATE_MALFORMED_JSON' });
    assert.strictEqual(wrongType.status, 415); assert.ok(!(await wrongType.text()).includes('PRIVATE_'));
    const wrongMethod = await fetch(base + snapshotPath, { method: 'PUT', headers: { ...uploadHeaders, 'Content-Type': 'application/json' }, body: 'PRIVATE_MALFORMED_JSON' });
    assert.strictEqual(wrongMethod.status, 405); assert.strictEqual(wrongMethod.headers.get('cache-control'), 'no-store');
    assert.ok(!(await wrongMethod.text()).includes('PRIVATE_'));
    const upload = await fetch(base + snapshotPath, { method: 'POST', headers: uploadHeaders, body: snapshotBytes });
    assert.strictEqual(upload.status, 200); assert.strictEqual(upload.headers.get('cache-control'), 'no-store');
    const receipt = await upload.json(); assert.strictEqual(receipt.file_sha256, crypto.createHash('sha256').update(snapshotBytes).digest('hex'));
    assert.strictEqual(receipt.snapshot, undefined);
    const privateRead = await request(base, 'GET', snapshotPath, { headers: { Cookie: cookie } });
    assert.strictEqual(privateRead.status, 200); assert.strictEqual(privateRead.body.latest.snapshot.buyers[0].name, 'PRIVATE_SNAPSHOT_SENTINEL');
    assert.ok(!JSON.stringify(privateRead.body).includes(syntheticKeyHash), 'Private snapshot GET does not expose key hashes');
    const persisted = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    assert.strictEqual(persisted.assistant_snapshots.length, 1); assert.ok(!(persisted.buyers || []).some(buyer => buyer.name === 'PRIVATE_SNAPSHOT_SENTINEL'));
    for (const publicProjection of ['/api/stats', '/api/leads', '/api/buyers', '/api/dashboard/today-workspace', '/api/dashboard/operator-brief', '/api/dashboard/calendar-workspace', '/api/dashboard/approvals', '/api/dashboard/pipeline-workspace', '/api/settings', '/api/debug/env']) {
      const projected = await request(base, 'GET', publicProjection, { headers: { Cookie: cookie } });
      assert.strictEqual(projected.status, 200, publicProjection + ' remains available');
      if (publicProjection === '/api/dashboard/today-workspace') assert.strictEqual(projected.body.capabilities.assistant_snapshot_import, true, 'The actual server advertises its registered private importer');
      assert.ok(!JSON.stringify(projected.body).includes('PRIVATE_SNAPSHOT_SENTINEL'), 'Private snapshot is not serialized by ' + publicProjection);
      assert.ok(!JSON.stringify(projected.body).includes(syntheticKeyHash), 'Private hash is not serialized by ' + publicProjection);
      assert.ok(!JSON.stringify(projected.body).includes(syntheticKeyId), 'Private key identity is not serialized by ' + publicProjection);
      assert.ok(!JSON.stringify(projected.body).includes(syntheticKey.key), 'Synthetic credential is not serialized by ' + publicProjection);
      assert.ok(!JSON.stringify(projected.body).includes('assistant_upload_keys'), 'Private collection is not serialized by ' + publicProjection);
    }

    const pairing = await request(base, 'POST', '/api/auth/pairing-token', { headers: { Cookie: cookie }, body: {} });
    assert.strictEqual(pairing.status, 200);
    const exchange = await request(base, 'POST', '/api/auth/pairing-exchange', { body: { pairing_token: pairing.body.pairing_token } });
    assert.strictEqual(exchange.status, 200);
    const latest = '/api/dashboard/free-public-deal-board/latest?city=Dallas&county=Dallas&state=TX';
    assert.strictEqual((await request(base, 'GET', latest, { headers: { Authorization: `Bearer ${exchange.body.agent_token}` } })).status, 200);
    assert.strictEqual((await request(base, 'GET', latest, { headers: { Authorization: 'Bearer forged' } })).status, 401);
    assert.strictEqual((await request(base, 'GET', '/api/leads', { headers: { Authorization: `Bearer ${exchange.body.agent_token}` } })).status, 401);

    const findHeaders = { Authorization: `Bearer ${exchange.body.agent_token}` };
    const findInput = { items: [{ name: 'SYNTHETIC BUYER', platform: 'facebook', group_name: 'SYNTHETIC GROUP', group_id: '123',
      profile_url: 'https://www.facebook.com/groups/123/user/456/', source_url: 'https://www.facebook.com/groups/123/search/?q=buy',
      what_they_buy: 'Synthetic fixture only', deal_type: 'house', classification: 'end_buyer', captured_at: new Date().toISOString() }] };
    assert.strictEqual((await request(base, 'POST', '/api/assistant/finds', { body: findInput })).status, 401);
    const findWrite = await request(base, 'POST', '/api/assistant/finds', { headers: findHeaders, body: findInput });
    assert.strictEqual(findWrite.status, 200, 'the exact POST exception still checks its own agent scope');
    const findId = findWrite.body.results[0].id;
    assert.strictEqual((await request(base, 'GET', '/api/assistant/finds', { headers: findHeaders })).status, 401);
    assert.strictEqual((await request(base, 'GET', '/api/dashboard/buyers-found', { headers: findHeaders })).status, 401);
    assert.strictEqual((await request(base, 'PATCH', '/api/dashboard/buyers-found/' + findId, { headers: findHeaders, body: { approval: 'approved' } })).status, 401);
    assert.strictEqual((await request(base, 'GET', '/api/dashboard/buyers-found', { headers: { Cookie: cookie } })).status, 200);
    assert.strictEqual((await request(base, 'GET', '/api/buyers/' + findId + '/match-deals', { headers: { Cookie: cookie } })).status, 409);
    assert.strictEqual((await request(base, 'PUT', '/api/buyers/' + findId, { headers: { Cookie: cookie }, body: { assistant_find: { approval: 'approved' } } })).status, 409);
    assert.strictEqual((await request(base, 'PATCH', '/api/dashboard/buyers-found/' + findId, { headers: { Cookie: cookie }, body: { approval: 'approved', reason: 'Synthetic fixture review' } })).status, 200);
    assert.strictEqual(JSON.parse(fs.readFileSync(dbPath, 'utf8')).buyers[0].assistant_find.history[0].operator_id, 'admin');
    const previewPath = '/api/dashboard/buyers-found/import/preview';
    const commitPath = '/api/dashboard/buyers-found/import/commit';
    assert.strictEqual((await request(base, 'POST', previewPath, { headers: findHeaders, body: findInput })).status, 401);
    const regularSession = session.issueSession({ userId: 'regular-fixture', role: 'user', scope: 'dashboard' }, { secret }).token;
    const calendarPath = '/api/dashboard/calendar-workspace';
    const drivePath = '/api/drive/status';
    assert.strictEqual((await request(base, 'GET', drivePath)).status, 401);
    assert.strictEqual((await request(base, 'GET', drivePath, { headers: findHeaders })).status, 401);
    assert.strictEqual((await request(base, 'GET', drivePath, { headers: { Cookie: `wos_session=${encodeURIComponent(regularSession)}` } })).status, 403);
    const driveStatus = await request(base, 'GET', drivePath, { headers: { Cookie: cookie } });
    assert.strictEqual(driveStatus.status, 200);
    assert.strictEqual(driveStatus.headers.get('cache-control'), 'no-store');
    assert.strictEqual(driveStatus.body.code, 'DRIVE_CONFIGURATION_MISSING');
    assert.strictEqual((await request(base, 'GET', calendarPath)).status, 401);
    assert.strictEqual((await request(base, 'GET', calendarPath, { headers: findHeaders })).status, 401);
    assert.strictEqual((await request(base, 'GET', calendarPath, { headers: { Cookie: `wos_session=${encodeURIComponent(regularSession)}` } })).status, 403);
    assert.strictEqual((await request(base, 'GET', calendarPath, { headers: { Cookie: cookie } })).status, 200);
    for (const action of ['preview', 'draft', 'send']) {
      const path = '/api/dashboard/buyers-found/' + findId + '/email/' + action;
      assert.strictEqual((await request(base, 'POST', path, { body: {} })).status, 401);
      assert.strictEqual((await request(base, 'POST', path, { headers: findHeaders, body: {} })).status, 401);
      assert.strictEqual((await request(base, 'POST', path, { headers: { Cookie: `wos_session=${encodeURIComponent(regularSession)}` }, body: {} })).status, 403);
    }
    assert.strictEqual((await request(base, 'POST', previewPath, { headers: { Cookie: `wos_session=${encodeURIComponent(regularSession)}` }, body: findInput })).status, 403);
    const dbBeforePreview = fs.readFileSync(dbPath, 'utf8');
    const importPreview = await request(base, 'POST', previewPath, { headers: { Cookie: cookie }, body: findInput });
    assert.strictEqual(importPreview.status, 200);
    assert.strictEqual(fs.readFileSync(dbPath, 'utf8'), dbBeforePreview);
    assert.strictEqual((await request(base, 'POST', commitPath, { headers: findHeaders, body: { preview_id: importPreview.body.preview_id, bulk_approve: true } })).status, 401);

    for (const route of ['/api/sms/webhook', '/api/dialer/twiml', '/api/dialer/recording-complete']) {
      const denied = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'CallSid=CA123' });
      assert.strictEqual(denied.status, 401, `${route} requires a provider signature`);
      const forgedSignature = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': 'forged' }, body: 'CallSid=CA123' });
      assert.strictEqual(forgedSignature.status, 401, `${route} rejects a forged provider signature`);
    }
    const twilio = require('twilio');
    const params = { CallSid: 'CA123' };
    const signature = twilio.getExpectedTwilioSignature(providerToken, `${base}/api/dialer/twiml`, params);
    const signed = await fetch(`${base}/api/dialer/twiml`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
      body: new URLSearchParams(params)
    });
    assert.strictEqual(signed.status, 200, 'a valid provider signature reaches the unchanged callback');

    assert.strictEqual((await request(base, 'DELETE', '/api/leads/seed-lead', { headers: { Cookie: cookie } })).status, 200);
    assert.strictEqual(JSON.parse(fs.readFileSync(dbPath, 'utf8')).leads.length, 0, 'signed-in DELETE still works');
    assert.strictEqual(JSON.parse(fs.readFileSync(dbPath, 'utf8')).assistant_snapshots.length, 1, 'Existing canonical writers preserve private snapshot history');
    assert.ok(JSON.stringify(JSON.parse(fs.readFileSync(dbPath, 'utf8')).assistant_upload_keys) === syntheticKeyRows, 'Existing canonical writers preserve hash-only key records');
    assert.ok(!output.includes(syntheticKey.key) && !output.includes(syntheticKeyHash) && !output.includes(syntheticKeyId), 'Server logs omit synthetic upload credentials/hashes/identities');
    console.log(`api-session-gate: ok (${registrations.length} API registrations behind the gate)`);
  } finally {
    child.kill();
    await sleep(100);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((error) => {
  if (processSpawnDenied(error)) {
    console.log('SKIPPED: real-server API checks require process spawn');
    return;
  }
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
