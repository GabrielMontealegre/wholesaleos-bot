'use strict';
const assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs'), http = require('node:http');
const devices = require('../modules/security/remembered-devices'), sessions = require('../modules/security/dashboard-session');
let phase = 'setup';
try {
  const now = Date.parse('2026-10-27T12:00:00.000Z'), day = 86400000;
  const secret = crypto.randomBytes(48).toString('base64url'), user = { id: 'operator:synthetic@example.test', role: 'admin' };
  const request = '11111111-1111-4111-8111-111111111111', nonce = devices.nonceForLogin(user.id, request);
  const options = { secret, now, nonce }, baseline = { users: [user], buyers: [], assistant_snapshots: [], assistant_upload_keys: [] };
  const made = devices.issueDevice(baseline, user, options), row = made.store.remembered_devices[0];
  phase = 'contract';
  assert.equal(Object.keys(row).length, 7); assert(!JSON.stringify(made.store).includes(made.token));
  assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 30 * day);
  assert.strictEqual(made.store.buyers, baseline.buyers); assert.strictEqual(made.store.assistant_snapshots, baseline.assistant_snapshots); assert.strictEqual(made.store.assistant_upload_keys, baseline.assistant_upload_keys);
  assert.equal(devices.verifyDevice(made.token, made.store, { secret, now }).ok, true);
  assert.equal(sessions.verifySession(made.token, { secret, now }).code, 'SESSION_DEVICE_REQUIRED', 'Generic token verification grants no device authority');
  assert.equal(devices.verifyDevice(made.token, made.store, { secret, now: now + 16 * day }).should_renew, false);
  assert.equal(devices.verifyDevice(made.token, made.store, { secret, now: now + 30 * day }).ok, false);
  assert.equal(devices.verifyDevice(made.token + 'x', made.store, { secret, now }).ok, false);
  assert.equal(devices.verifyDevice(made.token, {}, { secret, now }).ok, false);
  assert.equal(devices.verifyDevice(made.token, made.store, { secret, now: now - 1 }).ok, false);
  const forgedNonce = sessions.issueSession({ ...user, scope: 'dashboard', nonce: 'malformed' }, { secret, now, remember_device: true });
  assert.equal(devices.verifyDevice(forgedNonce.token, made.store, { secret, now }).ok, false);
  const legacy = sessions.issueSession(user, { secret, now });
  assert.equal(sessions.verifySession(legacy.token, { secret, now }).ok, true);
  assert.equal(devices.verifyDevice(legacy.token, made.store, { secret, now }).ok, false);
  assert.throws(() => sessions.issueSession({ ...user, scope: 'local-agent' }, { secret, now, remember_device: true }));
  const cookie = sessions.sessionCookie(made.token, made.max_age_ms);
  assert(cookie.includes('Max-Age=2592000')); assert(cookie.includes('HttpOnly')); assert(cookie.includes('Secure')); assert(cookie.includes('SameSite=Strict'));
  assert(!sessions.sessionCookie(legacy.token, legacy.lifetime_ms, { session_only: true }).includes('Max-Age'));
  const sessionOnly = sessions.issueSession(user, { secret, now, browser_session: true });
  assert.equal(sessions.verifySession(sessionOnly.token, { secret, now }).payload.browserSession, true);
  phase = 'replay-and-revocation';
  const replay = devices.issueDevice(made.store, user, { ...options, now: now + day });
  assert.strictEqual(replay.store, made.store); assert.equal(replay.token, made.token); assert.equal(replay.max_age_ms, 29 * day);
  assert.throws(() => devices.issueDevice({ ...made.store, users: [{ ...user, role: 'user' }] }, { ...user, role: 'user' }, options), e => e.status === 409);
  for (const changed of [{ ...user, pin: 'synthetic-new-pin' }, { ...user, password: 'synthetic-new-password' }, { ...user, role: 'user' }]) assert.equal(devices.verifyDevice(made.token, { ...made.store, users: [changed] }, { secret, now }).ok, false);
  assert.equal(devices.verifyDevice(made.token, { ...made.store, users: [] }, { secret, now }).ok, false);
  const admin = { id: 'admin', role: 'admin' }, env = { WOS_ADMIN_PIN: 'synthetic-admin-pin' };
  const adminMade = devices.issueDevice({ users: [admin] }, admin, { ...options, env });
  assert.equal(devices.verifyDevice(adminMade.token, adminMade.store, { secret, now, env }).ok, true);
  assert.equal(devices.verifyDevice(adminMade.token, adminMade.store, { secret, now, env: { WOS_ADMIN_PIN: 'synthetic-rotated-pin' } }).ok, false);
  assert.notEqual(devices.nonceForLogin('other', request), nonce);
  const own = devices.listDevices(made.store, { userId: user.id, now, currentId: row.id });
  assert.equal(own.length, 1); assert.equal(own[0].current, true); assert.equal(own[0].active, true); assert(!JSON.stringify(own).includes('token_sha256'));
  assert.deepEqual(devices.listDevices(made.store, { userId: 'other', now }), []);
  assert.throws(() => devices.revokeDevice(made.store, { userId: 'other', id: row.id, now }), e => e.status === 404);
  const revoked = devices.revokeDevice(made.store, { userId: user.id, id: row.id, now });
  assert.equal(made.store.remembered_devices[0].revoked_at, null); assert.equal(devices.verifyDevice(made.token, revoked, { secret, now }).ok, false);
  assert.strictEqual(devices.revokeDevice(revoked, { userId: user.id, id: row.id, now }), revoked);
  assert.throws(() => devices.issueDevice(revoked, user, options), e => e.status === 409);
  assert.throws(() => devices.issueDevice(made.store, user, { ...options, now: now + 30 * day }), e => e.status === 409);
  phase = 'malformed-history';
  for (const rows of [[{ ...row, source_kind: 'other' }], [{ ...row, unknown: true }], [{ ...row, created_at: '2026-02-30T12:00:00.000Z' }], [{ ...row, token_sha256: 'invalid' }], [{ ...row, expires_at: new Date(now + day).toISOString() }], [row, row], Array(1)]) {
    assert.throws(() => devices.listDevices({ remembered_devices: rows }, { userId: user.id, now }), e => e.status === 503);
  }
  assert.throws(() => devices.listDevices(made.store, { userId: user.id, now: now - 1 }), e => e.status === 503);
  let invoked = false; const accessor = {}; Object.defineProperty(accessor, 'remembered_devices', { enumerable: true, get() { invoked = true; return []; } });
  assert.throws(() => devices.listDevices(accessor, { userId: user.id, now }), e => e.status === 503); assert.equal(invoked, false);
  for (const clock of [undefined, NaN, -1, 1.5, 253402300799999]) assert.throws(() => devices.issueDevice({}, user, { ...options, now: clock }), e => e.code === 'remembered_device_clock_invalid');
  phase = 'purity';
  const old = { now: Date.now, random: crypto.randomUUID, bytes: crypto.randomBytes, write: fs.writeFileSync, request: http.request, fetch: global.fetch };
  try {
    Date.now = crypto.randomUUID = crypto.randomBytes = fs.writeFileSync = http.request = global.fetch = () => { throw Error('Ambient effect'); };
    assert.equal(devices.verifyDevice(devices.issueDevice(baseline, user, options).token, made.store, { secret, now }).ok, true);
  } finally { Date.now = old.now; crypto.randomUUID = old.random; crypto.randomBytes = old.bytes; fs.writeFileSync = old.write; http.request = old.request; global.fetch = old.fetch; }
  console.log('remembered-devices: synthetic30day/hash-only/replay/fixed-expiry/own-revocation/legacy-separation/cookie-flags/malformed-history/purity passed;unwired');
} catch { console.error('remembered-devices failed at ' + phase + ';credential fixture details withheld'); process.exitCode = 1; }
