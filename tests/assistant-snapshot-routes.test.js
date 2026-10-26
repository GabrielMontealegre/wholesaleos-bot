'use strict';
const assert = require('node:assert/strict'), express = require('express'), crypto = require('node:crypto');
const { registerAssistantSnapshotRoutes } = require('../modules/records/assistant-snapshot-routes');
const now = '2026-10-26T15:00:00Z';
const fixture = { schema: 'wos-assistant-snapshot', version: 1, generated_at: '2026-10-26T14:00:00Z', deals: [], buyers: [], texts: [], calls: [], emails_waiting: [] };
async function main() {
  let store = { buyers: [{ id: 'canonical', approval: 'pending' }] }, writes = 0, unavailable = false, writeFailure = false, base;
  const app = express(); app.set('trust proxy', 1);
  app.use(express.json({ strict: false, limit: '1mb' })); app.use(express.text({ limit: '100mb', type: 'text/plain' }));
  const db = { readDBStrict() { if (unavailable) throw Error('PRIVATE_STORAGE_SENTINEL'); return store; },
    writeDB(value) { if (writeFailure) throw Error('PRIVATE_WRITE_SENTINEL'); writes++; store = value; } };
  function requireAdmin(req, res, next) {
    if (req.get('X-Test-Session') !== 'signed') return res.status(401).json({ code: 'SESSION_REQUIRED' });
    if (req.get('X-Test-Role') !== 'admin') return res.status(403).json({ code: 'ADMIN_REQUIRED' });
    req.currentUser = { id: req.get('X-Test-Actor') || 'owner-one', role: 'admin' }; next();
  }
  registerAssistantSnapshotRoutes(app, { db, requireAdmin, now: () => now });
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  base = 'http://127.0.0.1:' + server.address().port;
  const path = '/api/dashboard/assistant-snapshots', raw = Buffer.from(JSON.stringify(fixture));
  const session = { 'X-Test-Session': 'signed', 'X-Test-Role': 'admin' };
  const upload = { ...session, Origin: base, 'Content-Type': 'application/octet-stream', 'X-WOS-Assistant-Import': '1', 'X-WOS-Assistant-Filename': 'assistant-2026-10-26.json' };
  async function request(options, status) {
    const response = await fetch(base + path, options); assert.equal(response.status, status); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const text = await response.text(); assert(!text.includes('PRIVATE_')); return JSON.parse(text);
  }
  try {
    assert.throws(() => registerAssistantSnapshotRoutes(express(), { db, now: () => now }), /dependencies_required/);
    await request({}, 401); await request({ headers: { 'x-user-id': 'admin' } }, 401);
    await request({ headers: { 'X-Test-Session': 'signed', 'X-Test-Role': 'agent' } }, 403);
    assert.equal((await request({ headers: session }, 200)).latest, null);
    for (const headers of [{}, { ...session, Origin: 'https://other.example.test' }, { ...upload, Origin: 'null' },
      { ...upload, Origin: base + '/forged-path' }, { ...upload, 'X-WOS-Assistant-Import': '0' }]) await request({ method: 'POST', headers, body: raw }, headers['X-Test-Session'] ? 403 : 401);
    await request({ method: 'POST', headers: { ...upload, 'Content-Type': 'text/plain' }, body: raw }, 415);
    await request({ method: 'POST', headers: { ...upload, 'X-WOS-Assistant-Filename': '../private.json' }, body: raw }, 400);
    await request({ method: 'POST', headers: upload, body: Buffer.from([0xff]) }, 400);
    await request({ method: 'POST', headers: upload, body: Buffer.alloc(1024 * 1024 + 1) }, 413);
    assert.equal(writes, 0);
    const result = await request({ method: 'POST', headers: upload, body: raw }, 200);
    assert.equal(result.file_sha256, crypto.createHash('sha256').update(raw).digest('hex'));
    assert.equal(result.snapshot, undefined, 'Upload receipt does not echo private file contents');
    assert.equal(writes, 1); assert.equal(store.assistant_snapshots.length, 1); assert.equal(store.buyers[0].approval, 'pending');
    assert.deepEqual((await request({ headers: session }, 200)).latest.snapshot, fixture);
    assert.equal((await request({ headers: { ...session, 'X-Test-Actor': 'owner-two' } }, 200)).latest, null);
    await request({ method: 'POST', headers: upload, body: raw }, 200);
    assert.equal(store.assistant_snapshots.length, 2); assert.equal(writes, 2);
    const bad = { ...fixture, version: 2, private_note: 'PRIVATE_INPUT_SENTINEL' };
    await request({ method: 'POST', headers: upload, body: JSON.stringify(bad) }, 400); assert.equal(writes, 2);
    unavailable = true;
    await request({ headers: session }, 503); await request({ method: 'POST', headers: upload, body: raw }, 503); assert.equal(writes, 2);
    unavailable = false; writeFailure = true;
    await request({ method: 'POST', headers: upload, body: raw }, 503); assert.equal(writes, 2); assert.equal(store.assistant_snapshots.length, 2);
    writeFailure = false;
    await request({ method: 'POST', headers: { ...upload, Origin: base.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https' }, body: raw }, 200);
    assert.equal(writes, 3, 'Existing one-hop HTTPS proxy origin handling works without an auth rewrite');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  console.log('assistant-snapshot-routes: synthetic signed-admin guard/no-store,origin/type/raw byte hash/size rejection,private per-actor read,append-only writes,proxy HTTPS and safe storage errors passed;local synthetic registration only');
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
