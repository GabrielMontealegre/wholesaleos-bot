'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), express = require('express');
const { uploadLatest, argumentsFor } = require('../scripts/upload-assistant-snapshot');
const { createAssistantKeyUpload } = require('../modules/records/assistant-key-upload');
const keys = require('../modules/records/assistant-upload-keys'), { fixture } = require('./helpers/assistant-snapshot-fixture');
async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-uploader-fixture-')), keyFile = path.join(dir, 'synthetic-key.json');
  const now = '2026-10-27T12:00:00Z', made = keys.createKey({ users: [{ id: 'synthetic-owner', role: 'admin' }], buyers: [] }, { now, operatorId: 'synthetic-owner', entropy: Buffer.alloc(48, 7) });
  let store = made.store, writes = 0, requests = 0, redirected = 0;
  const app = express(); app.use('/api/dashboard/assistant-snapshots', createAssistantKeyUpload({ db: { readDBStrict: () => store, writeDB: value => { store = value; writes++; } }, limiter: (req, res, next) => next(), now: () => now }));
  app.post('/synthetic-redirect', (req, res) => res.redirect(307, '/synthetic-target'));
  app.post('/synthetic-target', (req, res) => { redirected++; res.status(500).end(); });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port, bytes = Buffer.from(JSON.stringify(fixture()));
  try {
    fs.writeFileSync(keyFile, JSON.stringify({ schema: 'wos-assistant-upload-key', version: 1, key: made.key }));
    fs.writeFileSync(path.join(dir, 'wos-assistant-old.json'), 'INVALID_OLDER');
    fs.utimesSync(path.join(dir, 'wos-assistant-old.json'), 1, 1);
    fs.writeFileSync(path.join(dir, 'wos-assistant-new.json'), bytes);
    const options = { keyFile, snapshotDir: dir, fetchImpl(url, init) {
      requests++; assert.equal(url, 'https://wholesaleos-bot-production.up.railway.app/api/dashboard/assistant-snapshots');
      assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit'); assert(Buffer.from(init.body).equals(bytes));
      assert.equal(init.headers['X-WOS-Assistant-Request'], crypto.createHash('sha256').update(bytes).digest('hex'));
      return fetch(base + new URL(url).pathname, init);
    } };
    const first = await uploadLatest(options); assert.equal(first.exitCode, 0); assert.equal(writes, 1); assert.equal(requests, 1);
    assert(first.message.includes('buyers=1')); assert(!first.message.includes(made.key)); assert(!first.message.includes('wos-assistant-new'));
    assert.equal((await uploadLatest(options)).exitCode, 0); assert.equal(writes, 1); assert.equal(requests, 2);
    for (const status of [401, 403, 429, 500]) {
      let calls = 0; const result = await uploadLatest({ ...options, fetchImpl: async () => { calls++; return { status, ok: false }; } });
      assert.equal(calls, 1); assert.equal(result.exitCode, 1); if ([401, 403].includes(status)) assert.equal(result.message, 'upload key missing or revoked');
      assert(!result.message.includes(made.key));
    }
    let calls = 0; const denied = await uploadLatest({ ...options, fetchImpl: async () => { calls++; throw Error('PRIVATE_DETAILS'); } });
    assert.equal(calls, 1); assert.equal(denied.exitCode, 1); assert(!denied.message.includes('PRIVATE_'));
    assert.equal((await uploadLatest({ ...options, fetchImpl: (_, init) => fetch(base + '/synthetic-redirect', init) })).exitCode, 1);
    assert.equal(redirected, 0, 'Actual fetch never forwards the upload credential across a redirect');
    const malformed = await uploadLatest({ ...options, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ key: made.key, private: 'PRIVATE_DETAILS' }) }) });
    assert.equal(malformed.exitCode, 1); assert(!malformed.message.includes(made.key)); assert(!malformed.message.includes('PRIVATE_'));
    for (const invalid of [Buffer.from([0xc3, 0x28]), Buffer.from(JSON.stringify({ ...fixture(), version: 2 }))]) {
      fs.writeFileSync(path.join(dir, 'wos-assistant-new.json'), invalid);
      assert.equal((await uploadLatest({ ...options, fetchImpl: () => { throw Error('MUST_NOT_FETCH'); } })).message, 'Assistant snapshot unavailable or invalid.');
    }
    fs.writeFileSync(path.join(dir, 'wos-assistant-new.json'), Buffer.alloc(1024 * 1024 + 1));
    assert.equal((await uploadLatest({ ...options, fetchImpl: () => { throw Error('MUST_NOT_FETCH'); } })).message, 'Assistant snapshot unavailable or invalid.');
    fs.writeFileSync(keyFile, JSON.stringify({ schema: 'wos-assistant-upload-key', version: 1, key: made.key, endpoint: 'https://exfiltrate.example.test' }));
    assert.equal((await uploadLatest(options)).message, 'upload key missing or revoked');
    assert.throws(() => argumentsFor(['--url', 'https://exfiltrate.example.test']));
    assert.throws(() => argumentsFor(['--key-file']));
    assert.equal(store.buyers.length, 0); assert.equal(Object.keys(store.assistant_snapshots[0]).length, 8);
    console.log('upload-assistant-snapshot: synthetic newest-file->actual local SHA import/replay,exact bytes/cap/no redirects/no retries/redacted output passed');
  } finally { await new Promise(resolve => server.close(resolve)); if (!dir.startsWith(path.join(os.tmpdir(), 'wos-uploader-fixture-'))) throw Error('fixture_cleanup_boundary'); fs.rmSync(dir, { recursive: true, force: true }); }
}
run().catch(() => { console.error('upload-assistant-snapshot failed;private fixture details withheld'); process.exitCode = 1; });
