'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const kernel = require('../modules/research/lead-contact-brief');
const lead = require('./helpers/lead-contact-fixture').lead;
const root = path.resolve(__dirname, '..');
const row = { ...lead(), queue_key: 'synthetic-source', normalized_address: lead().address };
const snapshot = { rows: [row], batches: [{ rows: [row] }], store_kind: 'deal_board_snapshots_not_saved_leads' };
let reads = 0, logged = 0;
const moduleObject = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'modules/research/research-queue-read-route.js'), 'utf8'), {
  module: moduleObject, console: { log() { logged++; }, error() { logged++; } }, require(name) {
    if (name === './deal-board-queue-service') return { latestDealBoardSnapshot: () => { reads++; return snapshot; } };
    if (name === './lead-contact-brief') return kernel;
    throw Error('unapproved dependency');
  }
});
const api = moduleObject.exports;
const before = JSON.stringify(snapshot);
let failureStatus, failureBody;
api.createResearchQueueHandler({ readSnapshot() { throw Error('synthetic-private-error'); } })({ query: {} }, {
  set() {}, status(value) { failureStatus = value; return this; }, json(value) { failureBody = value; }
});
assert.equal(failureStatus, 500);
assert.equal(JSON.stringify(failureBody).includes('synthetic-private-error'), false, 'read failures do not echo private data');
const allowed = api.projectContactResponse(snapshot, true);
assert.equal(allowed.rows[0].contact_brief.phone.number, '+15550101234');
assert.equal(allowed.rows[0].contact_summary_authorized, true);
assert.equal(JSON.stringify(allowed.batches).includes('contact_brief'), false);
assert.equal(JSON.stringify(snapshot), before, 'derived response never mutates snapshot/batches');
assert.equal(JSON.stringify(snapshot).includes('contact_brief'), false, 'no persisted summary introduced');
for (const flag of [false, undefined, 'true', 1, {}]) assert.equal(JSON.stringify(api.projectContactResponse(snapshot, flag)).includes('contact_brief'), false);
const forged = { rows: [{ ...row, contact_brief: { phone: { number: 'forged' } }, contact_summary_authorized: true }], batches: [{ contact_brief: { private: 'forged' } }] };
assert.equal(JSON.stringify(api.projectContactResponse(forged, false)).includes('contact_brief'), false);
assert.equal(api.projectContactResponse(forged, true).rows[0].contact_brief.phone.number, '+15550101234');
assert.equal(JSON.stringify(api.projectContactResponse(forged, true).batches).includes('contact_brief'), false);
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const authCode = source.slice(source.indexOf('function contactSummaryAuthorized('), source.indexOf('\nfunction requireAdmin(', source.indexOf('function contactSummaryAuthorized(')));
let identity = { ok: false }, scope = '', fallbackCalls = 0;
const auth = { process: { env: {} }, signedDashboardIdentity: () => identity,
  dashboardIdentity: () => { fallbackCalls++; return { ok: true, user: { role: 'admin' } }; },
  bearerToken: () => 'synthetic-token', dashboardPairing: { verifyAgent(_token, permission) { return { ok: scope === permission }; } } };
vm.runInNewContext(authCode, auth);
assert.equal(auth.contactSummaryAuthorized({}, {}, true), false);
identity = { ok: true, user: { id: 'synthetic-admin', role: 'admin' } }; assert.equal(auth.contactSummaryAuthorized({}, {}), true);
identity = { ok: true, user: { role: 'user' } }; scope = 'deal_board:read'; assert.equal(auth.contactSummaryAuthorized({}, {}, true), false);
identity = { ok: false }; assert.equal(auth.contactSummaryAuthorized({}, {}, true), true);
assert.equal(auth.contactSummaryAuthorized({}, {}), false); scope = 'manual_evidence:write'; assert.equal(auth.contactSummaryAuthorized({}, {}, true), false);
assert.equal(fallbackCalls, 0, 'D069 anonymous-admin fallback never authorizes the feature');
for (const [result, status] of [[{ ok: false }, 401], [{ ok: true, user: { role: 'user' } }, 403]]) {
  identity = result; let denied;
  auth.requireSignedContactAdmin({}, { status(value) { denied = value; return this; }, json() {} }, () => { throw Error('unauthorized next'); });
  assert.equal(denied, status);
}
identity = { ok: true, user: { id: 'synthetic-admin', role: 'admin' } }; let admitted = false;
auth.requireSignedContactAdmin({}, {}, () => { admitted = true; }); assert.equal(admitted, true);
const lockPolicy = {};
vm.runInNewContext(source.slice(source.indexOf('function loginLockOff('), source.indexOf('\nfunction openAdminIdentity(')), lockPolicy);
assert.equal(lockPolicy.loginLockOff({ RAILWAY_ENVIRONMENT: 'production' }), true);
assert.equal(lockPolicy.loginLockOff({ RAILWAY_ENVIRONMENT: 'production', WOS_LOGIN_LOCK: 'on' }), false);
assert.equal(lockPolicy.loginLockOff({}), false);
assert.ok(source.includes('requireAdmin: requireSignedContactAdmin'), 'saved tap route also requires a real signed admin');
const queueSource = fs.readFileSync(path.join(root, 'modules/research/deal-board-queue-service.js'), 'utf8');
assert.equal(queueSource.includes('contact_brief'), false, 'public projection and snapshot writers stay unchanged');
(async () => {
  const app = express();
  api.registerResearchQueueReadRoutes(app, permission => {
    assert.equal(permission, 'deal_board:read');
    return (req, res, next) => {
      if (req.headers['x-fixture-role'] === 'user') return res.status(403).end();
      if (req.headers['x-fixture-signed'] === 'admin' || req.headers['x-fixture-scope'] === permission || req.headers['x-fixture-host-open'] === 'yes') return next();
      return res.status(401).end();
    };
  }, { authorizeSummary: req => req.headers['x-fixture-signed'] === 'admin' || req.headers['x-fixture-scope'] === 'deal_board:read' });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const route of [api.CURRENT_PATH, api.LEGACY_PATH]) {
      for (const [headers, expected, summary] of [
        [{}, 401, false], [{ 'x-fixture-role': 'user' }, 403, false], [{ 'x-fixture-scope': 'wrong' }, 401, false],
        [{ 'x-fixture-signed': 'admin' }, 200, true], [{ 'x-fixture-scope': 'deal_board:read' }, 200, true],
        [{ 'x-fixture-host-open': 'yes' }, 200, false], [{ 'x-fixture-host-open': 'yes', 'x-fixture-scope': 'wrong' }, 200, false]
      ]) {
        const oldReads = reads, response = await fetch(base + route + '?include_summary=true', { headers });
        assert.equal(response.status, expected);
        if (expected !== 200) { assert.equal(reads, oldReads); continue; }
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const result = await response.json(); assert.equal(Boolean(result.rows[0].contact_brief), summary);
        assert.equal(JSON.stringify(result.batches).includes('contact_brief'), false);
      }
    }
    assert.equal(JSON.stringify(snapshot), before);
    assert.equal(logged, 0, 'no owner/phone logging');
    console.log('source contact response: aliases, strict signed/scoped authorization, D069 no fallback, no-store, forged/missing/regular/wrong-scope negatives, no export/persistence PASS');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
