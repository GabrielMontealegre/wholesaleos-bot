'use strict';
const assert = require('node:assert/strict'), express = require('express'), crypto = require('node:crypto');
const devices = require('../modules/security/remembered-devices'), routes = require('../modules/security/remembered-device-routes');
async function run() {
  const now = Date.parse('2026-10-27T12:00:00.000Z'), user = { id: 'opaque:synthetic-owner', role: 'admin' }, secret = crypto.randomBytes(48).toString('base64url');
  const nonce = devices.nonceForLogin(user.id, '11111111-1111-4111-8111-111111111111');
  const made = devices.issueDevice({ buyers: [], users: [user] }, user, { secret, now, nonce });
  let store = made.store, writes = 0, down = false, writeDown = false, other = false;
  const app = express(); app.set('trust proxy', 1);
  function auth(req, res, next) { if (req.get('Cookie') !== 'synthetic-signed-session') return res.status(401).json({ ok: false }); req.currentUser = { ...user, id: other ? 'other' : user.id }; req.rememberedDeviceId = devices.deviceId(nonce); next(); }
  app.use('/api/auth/devices', routes.noStore, auth, routes.requireDevicePayload);
  app.use(express.json());
  routes.registerRememberedDeviceRoutes(app, { requireAuth: auth, now: () => now, db: { readDBStrict() { if (down) throw Error('PRIVATE'); return store; }, writeDB(value) { if (writeDown) throw Error('PRIVATE'); store = value; writes++; } } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }), base = 'http://127.0.0.1:' + server.address().port;
  const action = { Cookie: 'synthetic-signed-session', Origin: base, 'X-WOS-Device-Action': '1' }, id = made.store.remembered_devices[0].id;
  async function call(method, suffix = '', headers = {}, body) { const res = await fetch(base + '/api/auth/devices' + suffix, { method, headers, body }); assert.equal(res.headers.get('cache-control'), 'no-store'); return { status: res.status, headers: res.headers, text: await res.text() }; }
  try {
    assert.throws(() => routes.registerRememberedDeviceRoutes(app, { db: {}, requireAuth: auth }));
    for (const headers of [{}, { 'x-user-id': user.id }, { Authorization: 'Bearer synthetic-upload-credential' }]) assert.equal((await call('GET', '', headers)).status, 401);
    const list = await call('GET', '', action); assert.equal(list.status, 200); assert.equal(JSON.parse(list.text).devices[0].current, true); assert(!list.text.includes(made.token)); assert(!list.text.includes('token_sha256')); assert(!list.text.includes(user.id));
    other = true; assert.deepEqual(JSON.parse((await call('GET', '', action)).text).devices, []); assert.equal((await call('POST', '/' + id + '/revoke', action)).status, 404); other = false;
    for (const headers of [{ ...action, Origin: 'https://other.example.test' }, { ...action, 'X-WOS-Device-Action': '0' }, { Cookie: action.Cookie }]) assert.equal((await call('POST', '/' + id + '/revoke', headers)).status, 403);
    assert.equal((await call('POST', '/' + id + '/revoke', { ...action, 'Content-Type': 'application/json' }, 'PRIVATE_MALFORMED')).status, 400);
    assert.equal((await call('DELETE', '/' + id + '/revoke', action)).status, 405);
    assert.equal(writes, 0);
    writeDown = true; const rejected = await call('POST', '/' + id + '/revoke', action); assert.equal(rejected.status, 503); assert(!rejected.text.includes('PRIVATE')); assert.equal(store.remembered_devices[0].revoked_at, null); writeDown = false;
    const proxy = await call('POST', '/' + id + '/revoke', { ...action, Origin: base.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https' });
    assert.equal(proxy.status, 200); assert.equal(JSON.parse(proxy.text).current_device, true); assert(proxy.headers.get('set-cookie').includes('Max-Age=0')); assert.equal(writes, 1);
    assert.equal((await call('POST', '/' + id + '/revoke', action)).status, 200); assert.equal(writes, 1);
    down = true; const failed = await call('GET', '', action); assert.equal(failed.status, 503); assert(!failed.text.includes('PRIVATE'));
    assert.equal(store.buyers.length, 0); console.log('remembered-device-routes: injected-user controller fixture/own metadata/current revocation/origin/preparser/no-store/storage negatives passed');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(() => { console.error('remembered-device-routes failed;synthetic credential fixture details withheld'); process.exitCode = 1; });
