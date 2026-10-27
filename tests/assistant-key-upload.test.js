'use strict';
const assert = require('node:assert/strict'), crypto = require('node:crypto'), express = require('express'), http = require('node:http');
const snapshots = require('../modules/records/assistant-snapshot'), keys = require('../modules/records/assistant-upload-keys');
const { createAssistantKeyUpload } = require('../modules/records/assistant-key-upload');
const { fixture } = require('./helpers/assistant-snapshot-fixture');
const now = '2026-10-27T12:00:00Z', actor = 'opaque:synthetic-owner@example.test', filename = 'wos-assistant-synthetic.json';
const bytes = Buffer.from(JSON.stringify(fixture())), sha = crypto.createHash('sha256').update(bytes).digest('hex');
const options = { operatorId: actor, now, filename, fileSha256: sha };
const initial = { users: [{ id: actor, role: 'admin' }], buyers: [] };
const made = keys.createKey(initial, { operatorId: actor, now, entropy: Buffer.alloc(48, 7) });
const first = snapshots.appendKeySnapshot(made.store, bytes, options), firstRow = first.assistant_snapshots[0];
assert.equal(Object.keys(firstRow).length, 8); assert.equal(first.buyers.length, 0);
assert.strictEqual(snapshots.appendKeySnapshot(first, bytes, { ...options, filename: 'renamed.json' }), first);
assert.equal(firstRow.filename, filename, 'SHA replay preserves original provenance,not the new filename');
assert.throws(() => snapshots.appendKeySnapshot(first, bytes, { ...options, fileSha256: '0'.repeat(64) }), e => e.status === 409);
assert.throws(() => snapshots.appendKeySnapshot(first, bytes, { ...options, fileSha256: undefined }), e => e.code === 'assistant_snapshot_request_invalid');
assert.throws(() => snapshots.appendSnapshot(first, bytes, { ...options, requestId: sha }), e => e.code === 'assistant_snapshot_request_invalid');
const manual = snapshots.appendSnapshot(first, bytes, { ...options, requestId: '11111111-1111-4111-8111-111111111111' });
assert.equal(manual.assistant_snapshots.length, 2); assert.notEqual(manual.assistant_snapshots[1].id, firstRow.id);
assert.strictEqual(manual.assistant_upload_keys, first.assistant_upload_keys);
const other = snapshots.appendKeySnapshot(first, bytes, { ...options, operatorId: 'other' });
assert.equal(other.assistant_snapshots.length, 2); assert.notEqual(other.assistant_snapshots[1].id, firstRow.id);
const future = fixture(); future.generated_at = '2027-01-01T12:00:00Z';
assert.throws(() => snapshots.appendKeySnapshot(first, Buffer.from(JSON.stringify(future)), options), e => e.code === 'assistant_snapshot_generated_at_invalid');
async function run() {
  let store = made.store, writes = 0, limits = 0, limited = false, unavailable = false, began;
  const app = express(), route = '/api/dashboard/assistant-snapshots';
  app.use(route, createAssistantKeyUpload({ db: { readDBStrict() { if (unavailable) throw Error('PRIVATE'); return store; }, writeDB(next) { store = next; writes++; } }, now: () => now,
    limiter(req, res, next) { limits++; if (limited) return res.status(429).end(); if (req.get('X-Synthetic-Hold')) began?.(); next(); } }));
  app.use('/api', (req, res, next) => req.get('Cookie') === 'synthetic-admin' ? next() : res.status(401).end());
  app.get(route, (req, res) => res.json({ manual: true }));
  app.get('/api/leads', (req, res) => res.json({ manual: true }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const headers = { 'X-WOS-Assistant-Upload-Key': made.key, 'X-WOS-Assistant-Request': sha, 'X-WOS-Assistant-Filename': filename, 'Content-Type': 'application/octet-stream' };
  async function post(h = headers, body = bytes) { const r = await fetch(origin + route, { method: 'POST', headers: h, body }); assert.equal(r.headers.get('cache-control'), 'no-store'); return { status: r.status, value: await r.json() }; }
  try {
    assert.equal((await fetch(origin + '/api/leads', { headers })).status, 401);
    assert.equal((await fetch(origin + route, { headers })).status, 401);
    assert.equal((await fetch(origin + route, { headers: { Cookie: 'synthetic-admin' } })).status, 200);
    assert.equal(limits, 0, 'Manual reads do not double-count the key-mode limiter');
    assert.equal((await post({ ...headers, Cookie: 'synthetic-admin' })).status, 403);
    assert.equal((await post({ ...headers, Origin: origin })).status, 403);
    assert.equal((await post({ ...headers, 'X-WOS-Assistant-Upload-Key': 'forged' })).status, 401);
    assert.equal((await post({ ...headers, 'Content-Type': 'application/json' }, 'PRIVATE_MALFORMED')).status, 415);
    assert.equal(writes, 0);
    const result = await post(); assert.equal(result.status, 200); assert.equal(writes, 1); assert.equal(result.value.duplicate, false);
    assert.deepEqual(Object.keys(result.value).sort(), ['counts', 'duplicate', 'imported_at', 'ok']);
    assert.equal(result.value.counts.buyers, 1); assert(!JSON.stringify(result.value).includes(made.key));
    assert.equal((await post()).value.duplicate, true); assert.equal(writes, 1);
    assert.equal((await post({ ...headers, 'X-WOS-Assistant-Request': '0'.repeat(64) })).status, 409); assert.equal(writes, 1);
    assert.equal((await post(headers, Buffer.alloc(snapshots.MAX_BYTES + 1, 65))).status, 413);
    limited = true; const throttled = await fetch(origin + route, { method: 'POST', headers, body: bytes }); assert.equal(throttled.status, 429); limited = false;
    store = { ...store, users: [{ id: actor, role: 'user' }] }; assert.equal((await post()).status, 401);
    store = { ...store, users: initial.users }; unavailable = true; assert.equal((await post()).status, 503); unavailable = false;
    const boundary = new Promise(resolve => { began = resolve; });
    const pending = new Promise((resolve, reject) => {
      const req = http.request(origin + route, { method: 'POST', headers: { ...headers, 'Content-Length': bytes.length, 'X-Synthetic-Hold': '1' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.write(bytes.subarray(0, 8));
      boundary.then(() => { store = keys.revokeKey(store, { operatorId: actor, id: store.assistant_upload_keys[0].id, now }); req.end(bytes.subarray(8)); });
    });
    assert.equal(await pending, 401, 'Revocation during body read wins'); assert.equal(writes, 1);
    console.log('assistant-key-upload: exact SHA/8field/manual separation,private scope/limiter/issuer/revocation/body/storage/replay negatives passed');
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(() => { console.error('assistant-key-upload failed;private fixture details withheld'); process.exitCode = 1; });
