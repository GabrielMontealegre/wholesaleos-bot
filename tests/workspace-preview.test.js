'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const navigation = require('../dashboard/workspace/navigation');
const { APP_HOME, registerAppHome, registerWorkspacePreview } = require('../modules/ui/workspace-preview');
const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.equal(serverSource.split("require('./modules/ui/workspace-preview').registerWorkspacePreview(app);").length - 1, 1,
  'The production server must register the tested preview document route exactly once');

for (const key of ['today', 'email', 'leads', 'deals', 'buyers', 'calendar', 'pipeline', 'approvals', 'settings']) {
  assert(navigation.href(key).startsWith('/dashboard/?workspace='));
}
for (const forged of ['__proto__', 'constructor', '//evil.test', '<script>', 'gmail', null]) {
  assert.equal(navigation.href(forged), null);
}
assert.equal(navigation.recordHref('WOS-FL-1012'), '/dashboard/?record_ref=WOS-FL-1012');
// #429: one home, one shell. Rebuilt screens stay in the shell; every other key is a labeled classic view.
assert.equal(navigation.home, '/app', 'Home opens nativeToday;explicit classic tool links remain separate');
assert.equal(APP_HOME, '/app', 'Owner455item2 makes the native Today screen the browser home');
assert.equal(APP_HOME, navigation.home, 'Server and native shell agree on Home');
assert.equal(navigation.navHref('today'), '/app?preview=1');
assert.equal(navigation.navHref('email'), '/app?preview=1&view=email');
for (const key of ['today', 'email']) assert.equal(navigation.isClassic(key), false);
for (const key of ['leads', 'deals', 'buyers', 'calendar', 'pipeline', 'approvals', 'settings']) {
  assert.equal(navigation.isClassic(key), true);
  assert.equal(navigation.shellHref(key), null);
  assert.equal(navigation.navHref(key), navigation.href(key));
}
for (const forged of ['__proto__', 'constructor', 'hasOwnProperty', 'toString', '//evil.test', 'gmail', '', null, undefined]) {
  assert.equal(navigation.shellHref(forged), null);
  assert.equal(navigation.navHref(forged), null);
  assert.equal(navigation.isClassic(forged), false);
}
assert.equal(serverSource.split("require('./modules/ui/workspace-preview').registerAppHome(app, () => ({").length - 1, 1,
  'The production server must register the tested home route exactly once');
assert(!/app\.get\('\/', /.test(serverSource), 'No second root route may bypass the home redirect');
const homeRoutes = [];
let statusCalls = 0;
registerAppHome({ get: (route, handler) => homeRoutes.push({ route, handler }) }, () => { statusCalls++; return { status: 'Online', dashboard: '/dashboard/' }; });
assert.deepEqual(homeRoutes.map(item => item.route), ['/']);
function home(accepted) {
  const result = { headers: {} };
  const req = { accepts: types => { assert.deepEqual(types, ['json', 'html']); return accepted; } };
  const res = { set: (key, value) => { result.headers[key] = value; },
    redirect: (status, target) => Object.assign(result, { status, target }), json: body => { result.body = body; } };
  homeRoutes[0].handler(req, res);
  return result;
}
const browserHome = home('html');
assert.equal(browserHome.status, 302);
assert.equal(browserHome.target, '/app');
assert.equal(browserHome.headers['Cache-Control'], 'no-store');
assert.equal(browserHome.headers.Vary, 'Accept', 'The redirect is marked as varying on Accept');
assert.equal(statusCalls, 0, 'A browser visit must not compute the status payload');
for (const accepted of ['json', false]) {
  const api = home(accepted);
  assert.equal(api.target, undefined, 'API clients keep the JSON status');
  assert.equal(api.body.status, 'Online');
  assert.equal(api.headers.Vary, 'Accept', 'The JSON status is marked as varying on Accept');
  assert.equal(api.headers['Cache-Control'], 'no-store', 'The JSON status is never cached for a later browser visit');
}
assert.equal(statusCalls, 2);

for (const forged of ['WOS-FL-1012&x=1', 'BUY-005', 'https://evil.test', null]) assert.equal(navigation.recordHref(forged), null);

const routes = [];
registerWorkspacePreview({ get: (route, handler) => routes.push({ route, handler }) });
assert.deepEqual(routes.map(item => item.route), ['/app']);
function response(query) {
  const result = { headers: {} };
  const res = { set: (key, value) => { result.headers[key] = value; },
    redirect: (status, target) => Object.assign(result, { status, target }), sendFile: file => { result.file = file; } };
  routes[0].handler({ query }, res);
  return result;
}
for (const query of [{}, { preview: 'true' }, { preview: ['1', '1'] }, { preview: { a: '1' } }]) {
  assert(response(query).file.endsWith(path.join('workspace', 'index.html')), 'Native app no longer requires the old preview switch');
  assert.equal(response(query).target, undefined, 'Opening app never redirects to the classic PIN screen');
}
const preview = response({ preview: '1' });
assert(preview.file.endsWith(path.join('workspace', 'index.html')));
assert.equal(preview.headers['Cache-Control'], 'no-store');
assert(preview.headers['Content-Security-Policy'].includes("script-src 'self'"));
assert(!preview.headers['Content-Security-Policy'].includes('unsafe-inline'));

const source = fs.readFileSync(path.join(__dirname, '../dashboard/workspace/navigation.js'), 'utf8');
function bridge(search, unlocked) {
  const calls = [];
  let observerCallback, disconnected = false;
  const root = { document: { documentElement: { dataset: {} }, body: {}, readyState: 'complete' },
    location: { search }, APP: { unlocked, currentUser: { role: 'admin' } }, navigate: (...args) => calls.push(args) };
  class Observer {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  vm.runInNewContext(source, { window: root, URLSearchParams, MutationObserver: Observer });
  return { root, calls, tick: () => observerCallback && observerCallback(), disconnected: () => disconnected };
}
const pending = bridge('?workspace=email', false);
assert.equal(pending.calls.length, 0);
pending.root.APP.unlocked = true;
pending.tick(); pending.tick();
assert.equal(pending.calls.length, 1);
assert.equal(pending.calls[0][0], 'gmail');
assert(pending.disconnected());
assert.equal(bridge('?workspace=email&record_ref=WOS-FL-1012', true).calls.length, 0, 'Exact record wins');
assert.equal(bridge('?workspace=constructor', true).calls.length, 0);
const wrongRole = bridge('?workspace=email', false);
wrongRole.root.APP.unlocked = true;
wrongRole.root.APP.currentUser.role = 'user';
wrongRole.tick();
assert.equal(wrongRole.calls.length, 0);
console.log('workspace-preview: native Today browser home, JSON root for clients, classic tool compatibility, direct app route, CSP, allowed classic views, signed-admin deferred navigation and exact record precedence passed');
