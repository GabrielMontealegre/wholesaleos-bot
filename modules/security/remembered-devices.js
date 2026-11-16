'use strict';
const crypto = require('node:crypto');
const sessions = require('./dashboard-session');
const FIELDS = ['id', 'source_kind', 'user_id', 'token_sha256', 'created_at', 'expires_at', 'revoked_at'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function fail(code, status = 400) { throw Object.assign(Error('remembered_device_' + code), { code: 'remembered_device_' + code, status }); }
function actor(value) { if (typeof value !== 'string' || !value.length || value.length > 128 || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value)) fail('actor_invalid'); }
function nowValue(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 253402300799999 - sessions.REMEMBERED_LIFETIME_MS) fail('clock_invalid'); return value; }
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail('store_invalid', 503);
  const at = Date.parse(value); if (!Number.isFinite(at) || new Date(at).toISOString() !== value) fail('store_invalid', 503); return at;
}
function data(value) { return value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).every(k => typeof k === 'string' && Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), 'value')); }
function history(store, now) {
  if (!data(store)) fail('store_invalid', 503);
  const rows = Object.hasOwn(store, 'remembered_devices') ? store.remembered_devices : [];
  if (!Array.isArray(rows) || Reflect.ownKeys(rows).length !== rows.length + 1) fail('store_invalid', 503);
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    if (!Object.hasOwn(rows, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(rows, String(i)), 'value')) fail('store_invalid', 503);
    const row = rows[i];
    if (!data(row) || Reflect.ownKeys(row).length !== FIELDS.length || FIELDS.some(k => !Object.hasOwn(row, k)) || row.source_kind !== 'remembered_dashboard_device' || typeof row.id !== 'string' || !/^[a-f0-9]{32}$/.test(row.id) || seen.has(row.id) || typeof row.token_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.token_sha256)) fail('store_invalid', 503);
    try { actor(row.user_id); } catch { fail('store_invalid', 503); }
    const created = timestamp(row.created_at), expires = timestamp(row.expires_at);
    if (created > now || expires - created !== sessions.REMEMBERED_LIFETIME_MS || (row.revoked_at !== null && (timestamp(row.revoked_at) < created || timestamp(row.revoked_at) > now))) fail('store_invalid', 503);
    seen.add(row.id);
  }
  return rows;
}
function deviceId(nonce) { if (typeof nonce !== 'string' || !UUID.test(nonce)) fail('request_invalid'); return crypto.createHash('sha256').update('remembered_device_identity_v1\0' + nonce).digest('hex').slice(0, 32); }
function nonceForLogin(userId, requestId) {
  actor(userId); if (typeof requestId !== 'string' || !UUID.test(requestId)) fail('request_invalid');
  const bytes = crypto.createHash('sha256').update(JSON.stringify(['remembered_device_login_v1', userId, requestId])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex'); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function optionsFor(options, now) { const result = { secret: options.secret, env: options.env || {}, now }; if (!sessions.isConfigured(result)) fail('signing_unavailable', 503); return result; }
function currentUser(store, id) {
  if (!Array.isArray(store.users) || Reflect.ownKeys(store.users).length !== store.users.length + 1) fail('store_invalid', 503);
  const found = [];
  for (let i = 0; i < store.users.length; i++) {
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(store.users, String(i)) || {}, 'value')) fail('store_invalid', 503);
    const user = store.users[i]; if (!data(user)) fail('store_invalid', 503);
    if (user.id === id) found.push(user);
  }
  return found.length === 1 ? found[0] : null;
}
function digest(token, user, options) {
  if (typeof user.role !== 'string' || !user.role.trim() || user.role.length > 40) fail('store_invalid', 503);
  for (const key of ['pin', 'password', 'created']) if (user[key] != null && !['string', 'number'].includes(typeof user[key])) fail('store_invalid', 503);
  const configured = optionsFor(options, options.now), secret = sessions.configuredSecret(configured);
  const adminPin = user.id === 'admin' ? String(configured.env.WOS_ADMIN_PIN || '').trim() : '';
  const binding = crypto.createHmac('sha256', secret).update(JSON.stringify(['remembered_credentials_v1', user.id, user.role, user.pin ?? null, user.password ?? null, user.created ?? null, adminPin])).digest('hex');
  return crypto.createHash('sha256').update('remembered_dashboard_token_v1\0' + binding + '\0' + token).digest('hex');
}
function issueDevice(store, identity, options = {}) {
  actor(identity?.id); const now = nowValue(options.now), rows = history(store, now), id = deviceId(options.nonce), prior = rows.find(r => r.id === id);
  const user = currentUser(store, identity.id); if (!user || user.role !== identity.role) fail('actor_invalid', 403);
  if (prior && (prior.user_id !== identity.id || prior.revoked_at !== null || timestamp(prior.expires_at) <= now)) fail('request_conflict', 409);
  const created = prior ? timestamp(prior.created_at) : now;
  const issued = sessions.issueSession({ userId: identity.id, role: identity.role, scope: 'dashboard', nonce: options.nonce }, { ...optionsFor(options, created), remember_device: true });
  if (prior) { if (prior.token_sha256 !== digest(issued.token, user, options)) fail('request_conflict', 409); return { store, token: issued.token, expires_at: prior.expires_at, max_age_ms: timestamp(prior.expires_at) - now, duplicate: true }; }
  const row = { id, source_kind: 'remembered_dashboard_device', user_id: identity.id, token_sha256: digest(issued.token, user, options), created_at: new Date(created).toISOString(), expires_at: new Date(issued.payload.expiresAt).toISOString(), revoked_at: null };
  return { store: { ...store, remembered_devices: rows.concat(row) }, token: issued.token, expires_at: row.expires_at, max_age_ms: issued.lifetime_ms, duplicate: false };
}
function verifyDevice(token, store, options = {}) {
  const now = nowValue(options.now), verified = sessions.verifySession(token, { ...optionsFor(options, now), allow_remembered: true });
  if (!verified.ok || verified.payload.v !== 2 || verified.user.scope !== 'dashboard') return { ok: false, code: 'SESSION_REQUIRED' };
  let id; try { id = deviceId(verified.payload.nonce); } catch { return { ok: false, code: 'SESSION_REQUIRED' }; }
  const row = history(store, now).find(r => r.id === id);
  if (!row || row.user_id !== verified.user.id || row.revoked_at !== null || timestamp(row.created_at) !== verified.payload.issuedAt || timestamp(row.expires_at) !== verified.payload.expiresAt || timestamp(row.expires_at) <= now) return { ok: false, code: 'SESSION_REQUIRED' };
  const user = currentUser(store, verified.user.id); if (!user) return { ok: false, code: 'SESSION_REQUIRED' };
  if (!crypto.timingSafeEqual(Buffer.from(row.token_sha256, 'hex'), Buffer.from(digest(token, user, options), 'hex'))) return { ok: false, code: 'SESSION_REQUIRED' };
  return { ...verified, device_id: row.id, should_renew: false };
}
function listDevices(store, { userId, now, currentId } = {}) {
  actor(userId); nowValue(now);
  return history(store, now).filter(r => r.user_id === userId).map(r => ({ id: r.id, created_at: r.created_at, expires_at: r.expires_at, revoked_at: r.revoked_at, active: r.revoked_at === null && timestamp(r.expires_at) > now, current: r.id === currentId }));
}
function revokeDevice(store, { userId, id, now } = {}) {
  actor(userId); nowValue(now); const rows = history(store, now), row = rows.find(r => r.id === id && r.user_id === userId);
  if (!row) fail('not_found', 404); if (row.revoked_at !== null) return store;
  return { ...store, remembered_devices: rows.map(r => r === row ? { ...r, revoked_at: new Date(now).toISOString() } : r) };
}
module.exports = { issueDevice, verifyDevice, listDevices, revokeDevice, deviceId, nonceForLogin };
