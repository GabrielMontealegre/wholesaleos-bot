'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dashboardAuth = require('../modules/security/dashboard-auth');
const dashboardPassword = require('../modules/security/dashboard-password');
const devices = require('../modules/security/remembered-devices');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const database = fs.readFileSync(path.join(root, 'db.js'), 'utf8');
const password = crypto.randomBytes(24).toString('hex');
const hash = dashboardPassword.hashPassword(password);
const second = dashboardPassword.hashPassword(password);
assert.notStrictEqual(hash, second, 'unique salt per write');
assert.strictEqual(dashboardPassword.verifyPassword(password, hash).ok, true);
assert.strictEqual(dashboardPassword.verifyPassword(password + 'x', hash).ok, false);
for (const invalid of [undefined, null, '', {}, 42]) {
  assert.strictEqual(dashboardPassword.verifyPassword(invalid, hash).ok, false);
}
for (const invalid of ['', 'scrypt-v1$bad', hash + 'x', {}]) {
  assert.strictEqual(dashboardPassword.verifyPassword(password, invalid).ok, false);
}
assert.strictEqual(dashboardPassword.verifyPassword('scrypt-v1$legacy', 'scrypt-v1$legacy', true).ok, true,
  'legacy passwords may use the hash prefix without lockout');

let store;
let writes;
let cookies;
const logs = [];
const db = {
  readDB: () => JSON.parse(JSON.stringify(store)),
  writeDB(value) { store = JSON.parse(JSON.stringify(value)); writes++; }
};
const sandbox = {
  db, dashboardAuth, dashboardPassword, process: { env: {} },
  dashboardSession: { isConfigured: () => true },
  loginLimiter: () => {}, requireAdmin: () => {}, requireAdminOrOwnFirstLoginPinUpdate: () => {},
  setDashboardSessionCookie(_res, user) { cookies++; assert.strictEqual(user.password_hash, undefined); },
  console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) }
};
const handlers = {};
sandbox.app = {};
for (const method of ['post', 'put']) sandbox.app[method] = (route, ...args) => { handlers[route] = args.at(-1); };
for (const [method, route] of [
  ['post', '/api/auth/email-login'], ['post', '/api/users/:id/credentials'],
  ['put', '/api/users/:id'], ['post', '/api/users']
]) {
  const start = server.indexOf(`app.${method}('${route}',`);
  assert.ok(start >= 0);
  const end = server.indexOf('\n});', start);
  vm.runInNewContext(server.slice(start, end + 4), sandbox);
}
function reset(user) {
  store = { users: [user], leads: [{ id: 'synthetic-preserved' }] };
  writes = 0; cookies = 0;
}
function call(route, body = {}) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; } };
  handlers[route]({ body, params: { id: 'synthetic-user' } }, res);
  const serialized = JSON.stringify(res.body);
  assert.ok(!serialized.includes(password) && !serialized.includes(hash));
  assert.ok(!serialized.includes('password_hash') && !serialized.includes('scrypt-v1$'));
  return res;
}
const user = { id: 'synthetic-user', email: 'synthetic@example.test', role: 'user', password };
reset(user);
assert.strictEqual(call('/api/auth/email-login', { email: user.email, password: password + 'x' }).code, 401);
assert.strictEqual(call('/api/auth/email-login', { email: user.email }).code, 401);
assert.strictEqual(writes, 0);
assert.strictEqual(cookies, 0);
assert.strictEqual(call('/api/auth/email-login', { email: user.email, password }).code, 200);
assert.strictEqual(writes, 1);
assert.strictEqual(store.users[0].password, undefined);
const upgraded = store.users[0].password_hash;
assert.strictEqual(dashboardPassword.verifyPassword(password, upgraded).ok, true);
assert.strictEqual(store.leads[0].id, 'synthetic-preserved');
assert.strictEqual(call('/api/auth/email-login', { email: user.email, password }).code, 200);
assert.strictEqual(writes, 1, 'hash login never rewrites or re-salts');
assert.strictEqual(store.users[0].password_hash, upgraded);
assert.strictEqual(call('/api/auth/email-login', { email: user.email, password: password + 'x' }).code, 401);
assert.strictEqual(call('/api/auth/email-login', { email: {} }).code, 400);
assert.strictEqual(call('/api/auth/email-login', { email: 'missing@example.test', password }).code, 401);

reset(user);
assert.strictEqual(call('/api/users/:id/credentials', { password }).code, 200);
assert.strictEqual(store.users[0].password, undefined);
assert.strictEqual(dashboardPassword.verifyPassword(password, store.users[0].password_hash).ok, true);
reset(user);
const updateStart = database.indexOf('function updateUser(');
const updateEnd = database.indexOf('\nfunction addUser(', updateStart);
const updateContext = { ...sandbox, readDB: db.readDB, writeDB: db.writeDB, JSON, DEFAULT_USERS: [] };
vm.runInNewContext(database.slice(updateStart, updateEnd) + '\nthis.updateUser = updateUser;', updateContext);
db.updateUser = updateContext.updateUser;
db.addUser = () => ({ ...user, password_hash: hash });
assert.strictEqual(call('/api/users/:id', { password }).code, 200);
assert.strictEqual(store.users[0].password, undefined);
assert.strictEqual(dashboardPassword.verifyPassword(password, store.users[0].password_hash).ok, true);
db.updateUser(user.id, { name: 'Synthetic rename', password_hash: 'forged' });
assert.strictEqual(dashboardPassword.verifyPassword(password, store.users[0].password_hash).ok, true);
call('/api/users');
db.writeDB = () => { throw new Error(password + hash); };
reset(user);
assert.strictEqual(call('/api/auth/email-login', { email: user.email, password }).code, 500);
assert.strictEqual(cookies, 0, 'failed upgrade cannot create session');
assert.strictEqual(call('/api/users/:id/credentials', { password }).code, 500);
assert.strictEqual(logs.length, 0, 'no credential logging');
const publicResult = dashboardAuth.publicUser({ ...user, password_hash: hash });
assert.strictEqual(publicResult.password, undefined);
assert.strictEqual(publicResult.password_hash, undefined);
const deviceUser = { id: 'synthetic-user', role: 'user', password_hash: hash };
const options = { secret: crypto.randomBytes(48).toString('hex'), env: {}, now: Date.UTC(2026, 10, 21), nonce: crypto.randomUUID() };
const issued = devices.issueDevice({ users: [deviceUser] }, deviceUser, options);
assert.strictEqual(devices.verifyDevice(issued.token, issued.store, options).ok, true);
assert.strictEqual(devices.verifyDevice(issued.token, { ...issued.store, users: [{ ...deviceUser, password_hash: second }] }, options).ok, false,
  'new password hash revokes remembered authentication');
console.log('dashboard-password: synthetic hashing, migration, writer and response boundaries PASS');
