'use strict';
const crypto = require('node:crypto');
const SCOPE = 'assistant_snapshot:append';
const FIELDS = ['id', 'source_kind', 'scope', 'operator_id', 'created_at', 'revoked_at', 'secret_sha256'];
function fail(code, status = 400) { throw Object.assign(Error('assistant_upload_key_' + code), { code: 'assistant_upload_key_' + code, status }); }
function actor(value) {
  if (typeof value !== 'string' || !value.length || value.length > 128 || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value)) fail('actor_required', 403);
}
function clock(value, code = 'clock_invalid') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail(code, code === 'store_invalid' ? 503 : 400);
  const at = Date.parse(value);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 19) !== value.slice(0, 19)) fail(code, code === 'store_invalid' ? 503 : 400);
  return at;
}
function dataObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    [null, Object.prototype].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).every(key => typeof key === 'string' && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}
function records(store, at) {
  if (!dataObject(store)) fail('store_invalid', 503);
  const rows = Object.hasOwn(store, 'assistant_upload_keys') ? store.assistant_upload_keys : [];
  if (!Array.isArray(rows) || Reflect.ownKeys(rows).length !== rows.length + 1) fail('store_invalid', 503);
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    if (!Object.hasOwn(rows, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(rows, String(i)), 'value')) fail('store_invalid', 503);
    const row = rows[i];
    if (!dataObject(row) || Reflect.ownKeys(row).length !== FIELDS.length || FIELDS.some(key => !Object.hasOwn(row, key)) ||
        typeof row.id !== 'string' || !/^[a-f0-9]{32}$/.test(row.id) || seen.has(row.id) ||
        row.source_kind !== 'assistant_snapshot_upload_key' || row.scope !== SCOPE ||
        typeof row.secret_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.secret_sha256)) fail('store_invalid', 503);
    try { actor(row.operator_id); } catch (_) { fail('store_invalid', 503); }
    const created = clock(row.created_at, 'store_invalid');
    if (created > at || (row.revoked_at !== null && (clock(row.revoked_at, 'store_invalid') < created || clock(row.revoked_at, 'store_invalid') > at))) fail('store_invalid', 503);
    seen.add(row.id);
  }
  return rows;
}
function digest(value) { return crypto.createHash('sha256').update('assistant_snapshot_upload_key_v1\0').update(value).digest('hex'); }
// Entropy and server time are injected; no filesystem, network or ambient clock.
function createKey(store, { operatorId, now, entropy } = {}) {
  actor(operatorId);
  const at = clock(now), previous = records(store, at);
  if (!Buffer.isBuffer(entropy) || entropy.length !== 48) fail('entropy_required');
  const id = entropy.subarray(0, 16).toString('hex');
  if (previous.some(row => row.id === id)) fail('identity_conflict', 409);
  const key = 'wosai_' + id + '_' + entropy.subarray(16).toString('hex');
  const row = { id, source_kind: 'assistant_snapshot_upload_key', scope: SCOPE, operator_id: operatorId,
    created_at: new Date(at).toISOString(), revoked_at: null, secret_sha256: digest(key) };
  return { store: { ...store, assistant_upload_keys: previous.concat(row) }, key };
}
function listKeys(store, { operatorId, now } = {}) {
  actor(operatorId);
  return records(store, clock(now)).filter(row => row.operator_id === operatorId).map(row => ({ id: row.id, created_at: row.created_at, revoked_at: row.revoked_at }));
}
function revokeKey(store, { operatorId, id, now } = {}) {
  actor(operatorId);
  const at = clock(now), previous = records(store, at);
  const found = previous.find(row => row.id === id && row.operator_id === operatorId);
  if (!found) fail('not_found', 404);
  if (found.revoked_at !== null) return store;
  return { ...store, assistant_upload_keys: previous.map(row => row === found ? { ...row, revoked_at: new Date(at).toISOString() } : row) };
}
function authenticateKey(store, key, { now } = {}) {
  if (typeof key !== 'string' || !/^wosai_[a-f0-9]{32}_[a-f0-9]{64}$/.test(key)) fail('missing_or_revoked', 401);
  const row = records(store, clock(now)).find(candidate => candidate.id === key.slice(6, 38));
  if (!row || !crypto.timingSafeEqual(Buffer.from(row.secret_sha256, 'hex'), Buffer.from(digest(key), 'hex')) || row.revoked_at !== null) fail('missing_or_revoked', 401);
  return { operatorId: row.operator_id, scope: SCOPE };
}
module.exports = { createKey, listKeys, revokeKey, authenticateKey };
