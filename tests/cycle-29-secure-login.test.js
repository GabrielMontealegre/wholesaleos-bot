'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dashboardAuth = require('../modules/security/dashboard-auth');
const clientAuth = require('../dashboard/wos-dashboard-auth');

function runtimePin() { return String(3000 + crypto.randomInt(5000)); }
function response(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

(async () => {
  const adminPin = runtimePin();
  const userPin = runtimePin();
  const retired = String(1200 + 34);
  const users = [
    { id: 'admin', name: 'Test Admin', role: 'admin', pin: retired, firstLogin: false },
    { id: 'u2', name: 'Test User', role: 'user', pin: userPin, firstLogin: true }
  ];

  assert.strictEqual(dashboardAuth.authenticatePin({ pin: adminPin, users, env: { WOS_ADMIN_PIN: adminPin } }).ok, true);
  assert.strictEqual(dashboardAuth.authenticatePin({ pin: runtimePin(), users, env: { WOS_ADMIN_PIN: adminPin } }).status, 401);
  assert.strictEqual(dashboardAuth.authenticatePin({ pin: retired, users, env: {} }).code, 'ADMIN_LOGIN_NOT_CONFIGURED');
  assert.strictEqual(dashboardAuth.authenticatePin({ pin: retired, users, env: { WOS_ADMIN_PIN: retired } }).code, 'ADMIN_LOGIN_INSECURE_DEFAULT');
  assert.strictEqual(dashboardAuth.adminPinStatus({ WOS_ADMIN_PIN: 'abc' }).status, 'malformed_length');

  const app = { currentUser: { id: 'cached-admin', role: 'admin' }, unlocked: true };
  clientAuth.lockIdentity(app);
  assert.strictEqual(app.unlocked, false, 'cached browser state cannot unlock the dashboard');
  assert.deepStrictEqual(clientAuth.authHeaders(app, false), {}, 'the client sends no identity header');
  assert.deepStrictEqual(clientAuth.authHeaders(app, true), { 'Content-Type': 'application/json' });

  const accepted = await clientAuth.authenticate(adminPin, { fetch_impl: async (_url, request) => {
    assert.strictEqual(request.credentials, 'include');
    return response(200, { ok: true, user: { id: 'admin', name: 'Test Admin', role: 'admin' } });
  } });
  assert.strictEqual(clientAuth.applyAuthenticatedUser(app, accepted.user), true);
  assert.strictEqual(app.unlocked, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(clientAuth.authHeaders(app, false), 'x-user-id'), false);

  const dashboardHtml = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
  const rootHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const clientSource = fs.readFileSync(path.join(root, 'dashboard', 'wos-dashboard-auth.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  for (const html of [dashboardHtml, rootHtml]) {
    assert.ok(html.includes('wos-dashboard-auth.js?v=2'));
    assert.ok(!html.includes('montsan_pin'));
    assert.ok(!html.includes('Default PIN:'));
    assert.ok(!html.includes('Fallback local check'));
    assert.ok(!html.includes('x-user-id'), 'dashboard copies do not send identity headers');
  }
  assert.ok(dashboardHtml.includes('signOutDashboard()'));
  assert.ok(clientSource.includes("credentials: 'include'"));
  assert.ok(!clientSource.includes("headers['x-user-id']"));
  assert.ok(/app\.get\('\/api\/users',\s*requireAdmin/.test(serverSource));
  assert.ok(/app\.post\('\/api\/users\/:id\/credentials',\s*requireAdmin/.test(serverSource));
  assert.ok(!/req\.headers\[['"]x-user-id['"]\]/.test(serverSource));

  console.log('cycle-29-secure-login: ok');
  console.log('cycle-29 session note: identity transport is now an expiring signed server session.');
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
