'use strict';
const assert = require('node:assert/strict');
const express = require('express');
const boundary = require('../modules/security/production-data-boundary');

async function run() {
  process.env.NODE_ENV = 'production';
  for (const flag of ['test_data', 'synthetic', 'fixture']) {
    assert.equal(boundary.hasExplicitTestData({ rows: [{ [flag]: true }] }), true);
    for (const value of [false, null, 0, 1, 'true', 'synthetic', undefined]) {
      assert.equal(boundary.hasExplicitTestData({ [flag]: value }), false);
    }
  }
  assert.equal(boundary.hasExplicitTestData({ name: 'Synthetic Materials', filename: 'fixture.json', text: 'LOCAL TEST DATA', nested: '{"fixture":true}' }), false);
  assert.equal(boundary.hasExplicitTestData(Object.create({ synthetic: true })), false);
  assert.equal(boundary.hasExplicitTestData(Object.defineProperty({}, 'fixture', { value: true })), true);
  assert.equal(boundary.productionEnvironment({ NODE_ENV: 'production' }), true);
  assert.equal(boundary.productionEnvironment({}), true);
  assert.equal(boundary.productionEnvironment({ NODE_ENV: 'test' }), false);
  assert.equal(boundary.productionEnvironment({ NODE_ENV: 'development', RAILWAY_ENVIRONMENT_ID: 'synthetic-environment' }), true);
  const { fixture } = require('./helpers/assistant-snapshot-fixture');
  const { decodeSnapshot } = require('../modules/records/assistant-snapshot');
  decodeSnapshot(Buffer.from(JSON.stringify(fixture())), { now: '2026-10-27T12:00:00Z' });
  for (const flag of ['test_data', 'synthetic', 'fixture']) {
    const marked = fixture(); marked.deals[0][flag] = true;
    assert.throws(() => decodeSnapshot(Buffer.from(JSON.stringify(marked)), { now: '2026-10-27T12:00:00Z' }));
  }
  let reads = 0;
  const getter = Object.defineProperty({}, 'fixture', { enumerable: true, get() { reads++; return true; } });
  assert.equal(boundary.hasExplicitTestData(getter), false); assert.equal(reads, 0);
  const cycle = {}; cycle.self = cycle;
  assert.equal(boundary.hasExplicitTestData(cycle), false);
  cycle.rows = [{ fixture: true }]; assert.equal(boundary.hasExplicitTestData(cycle), true);
  const fs = require('node:fs'), originalWrite = fs.writeFileSync, originalClock = Date.now, originalFetch = global.fetch;
  const unchanged = { records: [{ synthetic: true, name: 'Synthetic Materials' }] }, before = JSON.stringify(unchanged);
  try {
    fs.writeFileSync = Date.now = global.fetch = () => { throw Error('pure_detector_side_effect'); };
    assert.equal(boundary.hasExplicitTestData(unchanged), true);
  } finally { fs.writeFileSync = originalWrite; Date.now = originalClock; global.fetch = originalFetch; }
  assert.equal(JSON.stringify(unchanged), before);
  let deep = { fixture: true };
  for (let i = 0; i < 2000; i++) deep = { row: deep };
  assert.equal(boundary.hasExplicitTestData(deep), true);

  const app = express(); let writes = 0;
  app.use('/api', boundary.protectRender({ production: true }));
  app.use(express.json());
  app.use('/api', (req, res, next) => req.get('x-test-session') === 'signed' ? next() : res.status(401).json({ code: 'SESSION_REQUIRED' }));
  app.post('/api/leads/import', boundary.rejectImport({ production: true }), (req, res) => { writes++; res.json({ ok: true }); });
  app.get('/api/leads', (req, res) => res.json({ rows: [{ fixture: true, name: 'MUST_NOT_LEAK' }] }));
  app.get('/api/status', (req, res) => res.status(429).json({ code: 'RATE_LIMIT', fixture: true }));
  const { registerAssistantFindRoutes } = require('../modules/buyers/assistant-find-routes');
  let storeReads = 0;
  registerAssistantFindRoutes(app, {
    db: { readDBStrict() { storeReads++; return {}; }, writeDB() { writes++; } },
    requireAdmin(req, res, next) {
      if (req.get('x-test-role') !== 'admin') return res.status(403).json({ code: 'ADMIN_REQUIRED' });
      req.currentUser = { id: 'synthetic-owner' }; next();
    }, now: () => '2026-10-27T12:00:00Z'
  });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const flag of ['test_data', 'synthetic', 'fixture']) {
      const response = await fetch(origin + '/api/leads/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-session': 'signed' }, body: JSON.stringify({ leads: [{ [flag]: true, name: 'MUST_NOT_LEAK' }] }) });
      assert.equal(response.status, 400); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { ok: false, code: 'production_test_data_rejected' });
    }
    assert.equal(writes, 0);
    const denied = await fetch(origin + '/api/leads/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"fixture":true}' });
    assert.equal(denied.status, 401); assert.equal((await denied.json()).code, 'SESSION_REQUIRED');
    const rendered = await fetch(origin + '/api/leads', { headers: { 'x-test-session': 'signed' } });
    assert.equal(rendered.status, 503); assert.deepEqual(await rendered.json(), { ok: false, code: 'production_test_data_rejected' });
    const limited = await fetch(origin + '/api/status', { headers: { 'x-test-session': 'signed' } });
    assert.equal(limited.status, 429); assert.equal((await limited.json()).code, 'RATE_LIMIT');
    const real = await fetch(origin + '/api/leads/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-session': 'signed' }, body: '{"name":"Synthetic Materials","fixture":"true"}' });
    assert.equal(real.status, 200); assert.equal(writes, 1);
    // The actual import router keeps role checks ahead of the new data check.
    for (const suffix of ['preview', 'commit']) {
      const request = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-session': 'signed', 'x-test-role': 'admin' }, body: '{"items":[{"synthetic":true}]}' };
      const guarded = await fetch(origin + '/api/dashboard/buyers-found/import/' + suffix, request);
      assert.equal(guarded.status, 400); assert.equal((await guarded.json()).code, 'production_test_data_rejected');
      request.headers['x-test-role'] = 'user';
      const unauthorized = await fetch(origin + '/api/dashboard/buyers-found/import/' + suffix, request);
      assert.equal(unauthorized.status, 403); assert.equal((await unauthorized.json()).code, 'ADMIN_REQUIRED');
    }
    assert.equal(storeReads, 0); assert.equal(writes, 1);
    let next = 0;
    boundary.rejectImport({ production: false })({ body: { fixture: true } }, {}, () => next++);
    assert.equal(next, 1);
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
    assert(source.indexOf('productionDataBoundary.protectRender()') < source.indexOf('registerDecisionAnswerRoutes(app'));
    assert(source.includes("app.post('/api/leads/import', rejectProductionImport,"));
    assert(source.includes("app.post('/api/buyers/bulk-import', rejectProductionImport,"));
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('production-data-boundary: PASS');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
