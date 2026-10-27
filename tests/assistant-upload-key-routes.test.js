'use strict';
const assert = require('node:assert/strict'), express = require('express');
const { registerAssistantUploadKeyRoutes, requireKeyPayload, noStore } = require('../modules/records/assistant-upload-key-routes');
const keyModel = require('../modules/records/assistant-upload-keys');
const route = '/api/dashboard/assistant-upload-keys', now = '2026-10-27T12:00:00Z';
async function run() {
  let store = { buyers: [{ synthetic: true }] }, writes = 0, unavailable = false, writeFailure = false;
  const app = express();
  app.set('trust proxy', 1);
  function requireAdmin(req, res, next) {
    if (req.get('cookie') !== 'synthetic-admin' && req.get('cookie') !== 'synthetic-other') return res.status(req.get('cookie') === 'synthetic-user' ? 403 : 401).json({ code: 'SIGNED_ADMIN_REQUIRED' });
    req.currentUser = { id: req.get('cookie') === 'synthetic-admin' ? 'opaque:synthetic-owner@example.test' : 'synthetic-other', role: 'admin' }; next();
  }
  app.use(route, noStore, requireAdmin, requireKeyPayload);
  app.use(express.json());
  registerAssistantUploadKeyRoutes(app, { requireAdmin, now: () => now, randomBytes: () => Buffer.alloc(32, 7), db: {
    readDBStrict() { if (unavailable) throw Error('PRIVATE_STORAGE_DETAIL'); return store; },
    writeDB(value) { if (unavailable || writeFailure) throw Error('PRIVATE_STORAGE_DETAIL'); store = value; writes++; }
  } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const headers = { Cookie: 'synthetic-admin', Origin: origin, 'X-WOS-Assistant-Key-Action': '1', 'X-WOS-Assistant-Request': '11111111-1111-4111-8111-111111111111' };
  async function read(method, suffix = '', extra = {}, body) {
    const response = await fetch(origin + route + suffix, { method, headers: extra, body });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, text: await response.text() };
  }
  try {
    for (const h of [{}, { 'x-user-id': 'admin' }, { Cookie: 'synthetic-user' }]) {
      const result = await read('POST', '', { ...h, 'Content-Type': 'application/json' }, 'PRIVATE_MALFORMED');
      assert.equal(result.status, h.Cookie ? 403 : 401); assert(!result.text.includes('PRIVATE_'));
    }
    assert.equal((await read('POST', '', headers, 'PRIVATE_BODY')).status, 400);
    assert.equal((await read('PUT', '', headers)).status, 405);
    assert.equal((await read('POST', '', { ...headers, Origin: 'https://cross-origin.example.test' })).status, 403);
    assert.equal((await read('POST', '', { ...headers, 'X-WOS-Assistant-Key-Action': '0' })).status, 403);
    assert.equal((await read('POST', '', { ...headers, 'X-WOS-Assistant-Request': 'a'.repeat(64) })).status, 400);
    assert.equal(writes, 0);
    const created = await read('POST', '', { ...headers, Origin: origin.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https' }); assert.equal(created.status, 200);
    const receipt = JSON.parse(created.text); assert.equal(writes, 1);
    assert.deepEqual(Object.keys(receipt).sort(), ['created_at', 'id', 'key', 'ok']);
    assert(!JSON.stringify(store).includes(receipt.key)); assert.equal(store.buyers[0].synthetic, true);
    assert.equal(keyModel.authenticateKey(store, receipt.key, { now }).operatorId, 'opaque:synthetic-owner@example.test');
    for (const method of ['GET', 'POST']) assert.equal((await read(method, '', { Authorization: 'Bearer ' + receipt.key, 'X-WOS-Assistant-Upload-Key': receipt.key })).status, 401, 'Upload credential never grants key-management authority');
    const replay = await read('POST', '', headers); assert.equal(replay.status, 409); assert(!replay.text.includes(receipt.key)); assert.equal(writes, 1);
    const list = await read('GET', '', { Cookie: headers.Cookie }); assert.equal(list.status, 200);
    assert.deepEqual(Object.keys(JSON.parse(list.text).keys[0]).sort(), ['created_at', 'id', 'revoked_at']);
    assert(!list.text.includes(receipt.key)); assert(!list.text.includes(store.assistant_upload_keys[0].secret_sha256));
    assert.equal(JSON.parse((await read('GET', '', { Cookie: 'synthetic-other' })).text).keys.length, 0);
    assert.equal((await read('POST', '/' + receipt.id + '/revoke', { ...headers, Cookie: 'synthetic-other' })).status, 404);
    assert.equal((await read('POST', '/' + receipt.id + '/revoke', headers)).status, 200); assert.equal(writes, 2);
    assert.equal((await read('POST', '/' + receipt.id + '/revoke', headers)).status, 200); assert.equal(writes, 2);
    assert.throws(() => keyModel.authenticateKey(store, receipt.key, { now }), e => e.status === 401);
    writeFailure = true;
    const lostWrite = await read('POST', '', { ...headers, 'X-WOS-Assistant-Request': '22222222-2222-4222-8222-222222222222' });
    assert.equal(lostWrite.status, 503); assert(!lostWrite.text.includes('wosai_')); assert.equal(store.assistant_upload_keys.length, 1); assert.equal(writes, 2);
    writeFailure = false;
    unavailable = true;
    for (const [method, suffix] of [['GET', ''], ['POST', ''], ['POST', '/' + receipt.id + '/revoke']]) {
      const denied = await read(method, suffix, headers); assert.equal(denied.status, 503); assert(!denied.text.includes('PRIVATE_')); assert(!denied.text.includes(receipt.key));
    }
    assert.equal(writes, 2);
    console.log('assistant-upload-key-routes: synthetic injected-admin/no-store/preparser/origin/one-time replay/hash-only metadata/revoke/storage negatives passed;production unregistered');
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(() => { console.error('assistant-upload-key-routes failed;private fixture details withheld'); process.exitCode = 1; });
