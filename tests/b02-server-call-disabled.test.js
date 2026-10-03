'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
const routes = new Map();
const calls = { create: 0, token: 0, writes: 0 };
const app = {
  get(route, handler) { routes.set(`GET ${route}`, handler); },
  post(route, handler) { routes.set(`POST ${route}`, handler); }
};
const start = server.indexOf('function serverCallDisabled(req, res)');
const end = server.indexOf("app.post('/api/dialer/twiml'", start);
assert.ok(start >= 0 && end > start, 'disabled call routes must be present');
vm.runInNewContext(server.slice(start, end), {
  app,
  process: { env: { TWILIO_ACCOUNT_SID: 'test', TWILIO_AUTH_TOKEN: 'test' } },
  twilio: { calls: { create() { calls.create++; } } },
  comms: { generateDialerToken() { calls.token++; } },
  db: { writeDB() { calls.writes++; } }
});

for (const [method, route] of [['GET', '/api/dialer/token'], ['POST', '/api/dialer/call']]) {
  const handler = routes.get(`${method} ${route}`);
  assert.strictEqual(typeof handler, 'function', `${method} ${route}`);
  const res = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
  handler({ body: { to: '+15550100199' } }, res);
  assert.strictEqual(res.code, 410, route);
  assert.strictEqual(res.body.ok, false, route);
  assert.strictEqual(res.body.error, 'Calling from the server is disabled. Call from your phone.', route);
}
assert.deepStrictEqual(calls, { create: 0, token: 0, writes: 0 });
assert.ok(!/\bcalls\.create\s*\(/.test(server), 'server must have no provider call creator');
assert.ok(!/\bgenerateDialerToken\s*\(/.test(server), 'server must have no voice token issuer');
assert.ok(!dashboard.includes("fetch('/api/dialer/call'"), 'dashboard must not POST to disabled call route');
assert.ok(!dashboard.includes("logAction('call'"), 'opening a phone dialer must not log a completed call');

const uiStart = dashboard.indexOf('function phoneTelHref(value)');
const uiEnd = dashboard.indexOf('function openBulkSMS()', uiStart);
assert.ok(uiStart >= 0 && uiEnd > uiStart);
const { phoneTelHref, renderDialer } = vm.runInNewContext(
  dashboard.slice(uiStart, uiEnd) + '\n({ phoneTelHref, renderDialer })'
);
assert.strictEqual(phoneTelHref('(555) 010-0199'), 'tel:+15550100199');
assert.strictEqual(phoneTelHref('+1 555 010 0199'), 'tel:+15550100199');
assert.strictEqual(phoneTelHref('123'), '');
assert.strictEqual(phoneTelHref(''), '');
const dialerHtml = renderDialer();
assert.match(dialerHtml, /Call from your phone/);
assert.match(dialerHtml, /id="dialer-manual-call" href="#"/);
assert.match(dialerHtml, /phoneTelHref\(this\.value\)/);
assert.doesNotMatch(dialerHtml, /makeCall\(/);

const scripts = [...dashboard.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
for (const [, attrs, source] of scripts) {
  if (/\bsrc\s*=/.test(attrs) || !source.trim()) continue;
  new vm.Script(source, { filename: 'dashboard/index.html inline script' });
}
assert.ok(scripts.length > 0, 'dashboard scripts must be parsed');
assert.match(dashboard, /href="' \+ \(phoneTelHref\(l\.phone\) \|\| '#'\)/);
assert.match(dashboard, /href="' \+ \(phoneTelHref\(lead\.phone\) \|\| '#'\)/);
console.log('server calling disabled; phone links render; no call provider or logging invoked');
