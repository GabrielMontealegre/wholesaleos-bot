'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { registerLeadContactTapRoutes } = require('../modules/records/lead-contact-tap-routes');
const fixture = require('./helpers/lead-contact-fixture');
(async () => {
  let store, reads, writes, failWrite = false;
  function reset() { store = { users: [{ id: 'synthetic-admin', name: 'Synthetic Operator', role: 'admin' }], leads: [fixture.lead()], activities: [] }; reads = 0; writes = 0; }
  reset(); const original = JSON.stringify(store.leads);
  const app = express(); app.use(express.json());
  registerLeadContactTapRoutes(app, {
    db: { readDBStrict() { reads++; return store; }, writeDB(value) { if (failWrite) throw Error('synthetic private store failure'); writes++; store = value; } },
    requireAdmin(req, res, next) {
      if (req.headers['x-fixture-admin'] !== 'yes') return res.status(401).json({ code: 'admin_required' });
      req.currentUser = { id: 'synthetic-admin', role: 'admin' }; next();
    }, now: () => '2026-11-22T04:30:00.000Z'
  });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const body = () => ({ confirm: true, channel: 'call', number: '+15550101234', request_id: crypto.randomUUID() });
  async function post(value, { admin = true, id = 'synthetic-contact', query = '' } = {}) {
    const response = await fetch(base + '/api/dashboard/leads/' + id + '/contact-tap' + query, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(admin ? { 'x-fixture-admin': 'yes' } : {}) }, body: JSON.stringify(value)
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.ok(!JSON.stringify(result).includes('Synthetic Operator'));
    assert.ok(!JSON.stringify(result).includes('5550101234'));
    return { status: response.status, result };
  }
  try {
    assert.equal((await post(body(), { admin: false })).status, 401); assert.equal(reads, 0); assert.equal(writes, 0);
    for (const patch of [{ confirm: 'true' }, { number: '5550101234' }, { channel: 'send' }, { request_id: 'forged' },
      { operator_id: 'forged' }, { when: '2099-01-01' }, { message: 'private text must stay on device' }]) {
      assert.equal((await post({ ...body(), ...patch })).status, patch.number ? 409 : 400);
    }
    assert.equal((await post(body(), { query: '?now=2099-01-01' })).status, 400);
    assert.equal((await post(body(), { id: 'missing' })).status, 409); assert.equal(writes, 0);
    const request = body(); assert.equal((await post(request)).status, 200); assert.equal(writes, 1);
    const event = store.activities[0];
    assert.equal(event.type, 'local_contact_requested'); assert.equal(event.contact_channel, 'call');
    assert.equal(event.contact_number, '+15550101234'); assert.equal(event.operator_id, 'synthetic-admin');
    assert.equal(event.created_at, '2026-11-22T04:30:00.000Z'); assert.match(event.summary, /no call outcome/);
    assert.equal(event.message, undefined); assert.equal(event.outcome, undefined);
    assert.equal((await post(request)).result.duplicate, true); assert.equal(writes, 1);
    assert.equal((await post({ ...request, channel: 'text' })).status, 409); assert.equal(writes, 1);
    assert.equal((await post({ ...body(), channel: 'text' })).status, 200); assert.equal(writes, 2);
    assert.equal(JSON.stringify(store.leads), original); assert.equal(store.leads[0].record_ref, undefined);
    assert.equal(store.activities.some(row => ['message_sent', 'email_sent', 'call_note'].includes(row.type)), false);
    for (const patch of [{ do_not_call: true }, { owner_type: 'bank' }, { lifecycle_status: { quarantined: true } },
      { free_contact_routes: [] }, { free_contact_routes: [{ ...fixture.lead().free_contact_routes[0], status: 'rejected' }] }]) {
      reset(); Object.assign(store.leads[0], patch); assert.equal((await post(body())).status, 409); assert.equal(writes, 0);
    }
    reset(); store.leads.push({ ...store.leads[0] }); assert.equal((await post(body())).status, 409); assert.equal(writes, 0);
    reset(); store.users = []; assert.equal((await post(body())).status, 403); assert.equal(writes, 0);
    reset(); failWrite = true; assert.equal((await post(body())).status, 503); assert.equal(writes, 0); assert.equal(store.activities.length, 0);
    console.log('lead-contact-tap: actual HTTP/admin/no-store, actor/time/number provenance, no message/outcome, duplicate/stale/forged/restricted/failure guards and unchanged leads PASS');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
