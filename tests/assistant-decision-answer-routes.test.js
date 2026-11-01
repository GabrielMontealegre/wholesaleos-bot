'use strict';
const assert = require('node:assert/strict'), express = require('express');
const { registerAssistantSnapshotRoutes } = require('../modules/records/assistant-snapshot-routes');
const { appendSnapshot } = require('../modules/records/assistant-snapshot');
const { fixture } = require('./helpers/assistant-snapshot-v2-fixture');
const now = '2026-10-31T12:00:00Z';
(async () => {
  let store = appendSnapshot({ buyers: [] }, Buffer.from(JSON.stringify(fixture())), { now, operatorId: 'synthetic-owner', filename: 'synthetic.json' }), writes = 0;
  const app = express();
  registerAssistantSnapshotRoutes(app, { now: () => now, db: { readDBStrict: () => store, writeDB: value => { store = value; writes++; } }, requireAdmin: (req, res, next) => {
    if (req.get('X-Test-Session') !== 'signed') return res.sendStatus(401);
    if (req.get('X-Test-Role') !== 'admin') return res.sendStatus(403);
    req.currentUser = { id: req.get('X-Test-Actor') || 'synthetic-owner' }; next();
  } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port, url = base + '/api/dashboard/assistant-snapshot-answers';
  const auth = { 'X-Test-Session': 'signed', 'X-Test-Role': 'admin' };
  const headers = { ...auth, Origin: base, 'Content-Type': 'application/json', 'X-WOS-Assistant-Answer': '1' };
  const input = { snapshot_id: store.assistant_snapshots[0].id, item_id: 'decision-0', choice: 'A', note: '', request_id: '11111111-1111-4111-8111-111111111111' };
  async function request(status, options = {}, suffix = '') {
    const response = await fetch(url + suffix, options); assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text(); assert(!text.includes('PRIVATE_SENTINEL')); return text.startsWith('{') ? JSON.parse(text) : null;
  }
  try {
    await request(401); await request(401, { headers: { 'X-WOS-Assistant-Upload-Key': 'synthetic-not-a-session' } });
    await request(403, { headers: { ...auth, 'X-Test-Role': 'agent' } });
    await request(405, { method: 'DELETE', headers: auth });
    await request(403, { method: 'POST', headers: { ...headers, Origin: 'https://other.example.test' }, body: JSON.stringify(input) });
    await request(403, { method: 'POST', headers: { ...headers, Origin: base + '/forged' }, body: JSON.stringify(input) });
    await request(403, { method: 'POST', headers: { ...headers, 'X-WOS-Assistant-Answer': '0' }, body: JSON.stringify(input) });
    await request(415, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: JSON.stringify(input) });
    await request(400, { method: 'POST', headers, body: '{' });
    await request(413, { method: 'POST', headers, body: JSON.stringify({ note: 'x'.repeat(9000) }) });
    await request(400, { method: 'POST', headers, body: JSON.stringify({ ...input, note: 'PRIVATE_SENTINEL\u0000' }) });
    assert.equal(writes, 0);
    const one = await request(200, { method: 'POST', headers, body: JSON.stringify(input) });
    assert.equal(one.answer.choice, 'A'); assert.equal(one.answer.snapshot, undefined); assert.equal(one.answer.operator_id, undefined);
    assert.equal(writes, 1);
    assert.deepEqual(await request(200, { method: 'POST', headers, body: JSON.stringify(input) }), one); assert.equal(writes, 1);
    await request(409, { method: 'POST', headers, body: JSON.stringify({ ...input, choice: 'B' }) });
    await request(409, { method: 'POST', headers: { ...headers, 'X-Test-Actor': 'other-owner' }, body: JSON.stringify(input) });
    assert.equal((await request(200, { headers: auth })).items[0].choice, 'A');
    assert.equal((await request(200, { headers: { ...auth, 'X-Test-Actor': 'other-owner' } })).items.length, 0);
    await request(400, { headers: auth }, '?limit=1001'); await request(400, { headers: auth }, '?unknown=1');
    await request(400, { headers: { ...auth, 'X-Test-Actor': 'other-owner' } }, '?after=' + one.answer.id);
    store = { ...store, assistant_decision_answers: [{ ...store.assistant_decision_answers[0], note: 5 }] };
    await request(503, { headers: auth }); assert.equal(writes, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  console.log('assistant-decision-answer-routes: local synthetic admin/session/CSRF/type/size guards,append/readback,no-store,owner isolation,replay/conflict and safe errors passed');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
