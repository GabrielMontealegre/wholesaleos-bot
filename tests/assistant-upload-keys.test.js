'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const keys = require('../modules/records/assistant-upload-keys');
const now = '2026-10-27T12:00:00Z', later = '2026-10-27T12:01:00Z';
const options = { operatorId: 'opaque:synthetic-owner@example.test', now, entropy: Buffer.from(Array.from({ length: 48 }, (_, i) => i)) };
const original = { buyers: [{ synthetic: true }], assistant_snapshots: [{ synthetic: 'untouched' }] };
const before = JSON.stringify(original), made = keys.createKey(original, options), row = made.store.assistant_upload_keys[0];
assert.equal(JSON.stringify(original), before);
assert.strictEqual(made.store.buyers, original.buyers);
assert.strictEqual(made.store.assistant_snapshots, original.assistant_snapshots);
assert(!JSON.stringify(made.store).includes(made.key), 'No plaintext credential in store');
assert(!row.secret_sha256.includes(made.key));
assert.deepEqual(keys.authenticateKey(made.store, made.key, { now }), { operatorId: options.operatorId, scope: 'assistant_snapshot:append' });
assert.deepEqual(Object.keys(keys.authenticateKey(made.store, made.key, { now })).sort(), ['operatorId', 'scope'], 'No session/admin/general API authority');
const listed = keys.listKeys(made.store, options);
assert.deepEqual(Object.keys(listed[0]).sort(), ['created_at', 'id', 'revoked_at']);
assert(!JSON.stringify(listed).includes(row.secret_sha256));
assert.equal(keys.listKeys(made.store, { now, operatorId: 'different-owner' }).length, 0);
assert.throws(() => keys.revokeKey(made.store, { now, operatorId: 'different-owner', id: row.id }), e => e.status === 404);
assert.throws(() => keys.createKey(made.store, options), e => e.code === 'assistant_upload_key_identity_conflict');
const replayEntropy = Buffer.from(options.entropy); replayEntropy.fill(9, 16);
assert.throws(() => keys.createKey(made.store, { ...options, entropy: replayEntropy }), e => e.code === 'assistant_upload_key_identity_conflict', 'Stable create identity cannot replace the original one-time secret');
const second = keys.createKey(made.store, { ...options, entropy: Buffer.alloc(48, 7) });
assert.equal(second.store.assistant_upload_keys.length, 2);
assert.strictEqual(second.store.assistant_upload_keys[0], row);
for (const value of [null, '', made.key + ' ', made.key.slice(0, -1) + (made.key.endsWith('0') ? '1' : '0'), second.key]) {
  assert.throws(() => keys.authenticateKey(made.store, value, { now }), e => e.status === 401 && e.code === 'assistant_upload_key_missing_or_revoked' && (!value || !e.message.includes(value)));
}
const revoked = keys.revokeKey(second.store, { operatorId: options.operatorId, id: row.id, now: later });
assert.equal(made.store.assistant_upload_keys[0].revoked_at, null);
assert.throws(() => keys.authenticateKey(revoked, made.key, { now: later }), e => e.status === 401);
assert.equal(keys.authenticateKey(revoked, second.key, { now: later }).operatorId, options.operatorId);
assert.strictEqual(keys.revokeKey(revoked, { operatorId: options.operatorId, id: row.id, now: later }), revoked);
for (const changed of [
  value => { value.assistant_upload_keys = {}; },
  value => { delete value.assistant_upload_keys[0]; },
  value => { value.assistant_upload_keys.push(structuredClone(value.assistant_upload_keys[0])); },
  value => { value.assistant_upload_keys[0].scope = 'admin'; },
  value => { value.assistant_upload_keys[0].operator_id = ''; },
  value => { value.assistant_upload_keys[0].created_at = '2026-02-30T12:00:00Z'; },
  value => { value.assistant_upload_keys[0].created_at = later; },
  value => { value.assistant_upload_keys[0].revoked_at = '2026-10-26T12:00:00Z'; },
  value => { value.assistant_upload_keys[0].revoked_at = later; },
  value => { value.assistant_upload_keys[0].plaintext = 'synthetic-only'; }
]) {
  const invalid = structuredClone(made.store); changed(invalid);
  assert.throws(() => keys.listKeys(invalid, options), e => e.status === 503 && e.code === 'assistant_upload_key_store_invalid');
}
let getters = 0; const accessor = structuredClone(made.store);
Object.defineProperty(accessor.assistant_upload_keys[0], 'secret_sha256', { enumerable: true, get() { getters++; throw Error('Private'); } });
assert.throws(() => keys.listKeys(accessor, options), e => e.status === 503); assert.equal(getters, 0);
const rootAccessor = {};
Object.defineProperty(rootAccessor, 'assistant_upload_keys', { enumerable: true, get() { getters++; throw Error('Private'); } });
assert.throws(() => keys.listKeys(rootAccessor, options), e => e.status === 503); assert.equal(getters, 0);
const arrayAccessor = structuredClone(made.store);
Object.defineProperty(arrayAccessor.assistant_upload_keys, '0', { enumerable: true, get() { getters++; throw Error('Private'); } });
assert.throws(() => keys.listKeys(arrayAccessor, options), e => e.status === 503); assert.equal(getters, 0);
for (const bad of [undefined, '2026-02-30T12:00:00Z', '2026-10-27']) assert.throws(() => keys.createKey({}, { ...options, now: bad }), e => e.code === 'assistant_upload_key_clock_invalid');
assert.throws(() => keys.createKey({}, { ...options, operatorId: '' }), e => e.status === 403);
assert.throws(() => keys.createKey({}, { ...options, entropy: Buffer.alloc(47) }), e => e.code === 'assistant_upload_key_entropy_required');
const oldNow = Date.now, oldFetch = global.fetch, oldRandom = crypto.randomBytes;
const oldWrite = fs.writeFileSync, oldAsyncWrite = fs.promises.writeFile, oldRequest = http.request;
try {
  Date.now = global.fetch = crypto.randomBytes = () => { throw Error('Ambient effect'); };
  fs.writeFileSync = fs.promises.writeFile = http.request = () => { throw Error('Ambient effect'); };
  assert.equal(keys.authenticateKey(keys.createKey({}, options).store, made.key, { now }).operatorId, options.operatorId);
} finally { Date.now = oldNow; global.fetch = oldFetch; crypto.randomBytes = oldRandom; fs.writeFileSync = oldWrite; fs.promises.writeFile = oldAsyncWrite; http.request = oldRequest; }
console.log('assistant-upload-keys: synthetic hash-only creation/list/revoke/exact append scope,actor/corrupt/clock/accessor negatives and purity passed');
