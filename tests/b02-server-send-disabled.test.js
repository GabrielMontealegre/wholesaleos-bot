'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const commsUi = fs.readFileSync(path.join(root, 'dashboard', 'wos-comms.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
const routes = new Map();
const calls = { sends: 0, reads: 0, writes: 0 };
const leads = [{ id: 'lead-1', phone: '+15555550123', email: 'example@example.test', status: 'New Lead', lastSMSSent: null }];
const originalLeads = JSON.stringify(leads);
const db = {
  getLeads() { calls.reads++; return leads; },
  updateLead() { calls.writes++; throw new Error('unexpected write'); }
};
const comms = {
  sendSMS() { calls.sends++; throw new Error('unexpected SMS send'); },
  sendBulkSMS() { calls.sends++; throw new Error('unexpected bulk SMS send'); },
  sendBulkEmail() { calls.sends++; throw new Error('unexpected bulk email send'); },
  generateHumanizedSMS() { return 'Draft only'; },
  generateHumanizedEmail() { return { subject: 'Draft only', body: 'Draft only' }; }
};
const app = {
  get(route, handler) { routes.set(`GET ${route}`, handler); },
  post(route, handler) { routes.set(`POST ${route}`, handler); }
};

const start = server.indexOf('function serverSendDisabled(req, res)');
const end = server.indexOf("app.get('/api/sms/conversations'", start);
assert.ok(start >= 0 && end > start, 'disabled handler and preview routes must be present');
vm.runInNewContext(server.slice(start, end), {
  app,
  db,
  require(name) { assert.strictEqual(name, './modules/comms'); return comms; }
});
for (const route of ['/api/gmail/send', '/api/gmail/reply', '/api/buyers/:id/send-deals']) {
  const registration = `app.post('${route}', serverSendDisabled);`;
  assert.ok(server.includes(registration), `${route} must use the same disabled handler`);
  vm.runInNewContext(registration, { app, serverSendDisabled: routes.get('POST /api/sms/send') });
}

function response() {
  return {
    code: 200,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

for (const route of ['/api/sms/send', '/api/email/send', '/api/sms/bulk', '/api/email/bulk']) {
  const res = response();
  routes.get(`POST ${route}`)({ body: { leadIds: ['lead-1'], to: leads[0].phone, body: 'Do not send' } }, res);
  assert.strictEqual(res.code, 410, route);
  assert.strictEqual(res.body.ok, false, route);
  assert.match(res.body.error, /Sending from the server is disabled/, route);
}

for (const route of ['/api/gmail/send', '/api/gmail/reply', '/api/buyers/:id/send-deals']) {
  const res = response();
  routes.get(`POST ${route}`)({ body: {}, params: { id: 'buyer-1' } }, res);
  assert.strictEqual(res.code, 410);
}

for (const route of ['/api/sms/preview/:leadId', '/api/email/preview/:leadId']) {
  const res = response();
  routes.get(`GET ${route}`)({ params: { leadId: 'lead-1' } }, res);
  assert.strictEqual(res.code, 200, route);
  assert.strictEqual(res.body.ok, true, route);
}

assert.strictEqual(calls.sends, 0);
assert.strictEqual(calls.writes, 0);
assert.strictEqual(JSON.stringify(leads), originalLeads);
assert.ok(!/\bcomms\.(?:sendSMS|sendBulkSMS|sendBulkEmail)\s*\(/.test(server));
assert.ok(!/\b(?:sendMail|messages\.send)\s*\(/.test(server));
assert.ok(!/onclick="wosCommsSend(?:Sms|Email)\(\)"/.test(commsUi));
assert.ok(!/onclick="openBulk(?:SMS|Email)\(\)"/.test(dashboard));
assert.ok(!/onclick="sendOne(?:SMS|Email)\(/.test(dashboard));

const followupSource = fs.readFileSync(path.join(root, 'modules', 'followup.js'), 'utf8');
const followup = { exports: {} };
const due = { leadId: 'lead-1', type: 'email', day: 14, status: 'pending', nextDate: '2000-01-01' };
vm.runInNewContext(followupSource, {
  module: followup,
  exports: followup.exports,
  process,
  Date,
  require(name) {
    if (name === 'dotenv') return { config() {} };
    if (name === '../db') return {
      readDB() { return { leads: [{ ...leads[0], address: 'Test St, TX' }], followups: [due] }; },
      writeDB() { calls.writes++; throw new Error('unexpected follow-up write'); }
    };
    throw new Error(`unexpected dependency: ${name}`);
  }
});

followup.exports.processDueFollowUps(null, null).then(count => {
  assert.strictEqual(count, 1);
  assert.strictEqual(due.status, 'pending');
  assert.strictEqual(calls.sends, 0);
  assert.strictEqual(calls.writes, 0);
  console.log('server sending disabled; previews and stored lead state unchanged');
}).catch(error => { console.error(error); process.exitCode = 1; });
