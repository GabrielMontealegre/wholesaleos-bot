'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const finds = require('../modules/buyers/assistant-finds');
const { registerAssistantFindRoutes, REQUESTS_PER_HOUR } = require('../modules/buyers/assistant-find-routes');
const pairing = require('../modules/security/dashboard-pairing');
const ui = require('../dashboard/wos-buyers-found');

const now = '2026-10-06T12:00:00.000Z';
const item = {
  name: 'Synthetic Buyer', platform: 'facebook', group_name: 'Synthetic Group', group_id: '123',
  profile_url: 'https://www.facebook.com/groups/123/user/456/',
  source_url: 'https://www.facebook.com/groups/123/search/?q=buy%20box',
  what_they_buy: 'Houses in the stated area.', deal_type: 'house', states: ['TX'], areas: ['Example metro'],
  email: 'fixture@example.test', phone: '555-010-1234', drafted_message: 'Synthetic draft only.', captured_at: now
};
const valid = finds.validateItems({ items: [item] }, now);
for (const changes of [
  { source_url: '' }, { source_url: 'https://evil.test/groups/123/search/?q=buy' },
  { profile_url: 'https://facebook.com.evil.test/groups/123/user/456/' },
  { profile_url: 'https://facebook.com/groups/999/user/456/' },
  { profile_url: 'javascript:alert(1)' }, { profile_url: 'https://x@facebook.com/groups/123/user/456/' },
  { source_url: 'https://facebook.com/groups/123/' }, { source_url: 'https://facebook.com/groups/123/search/?redirect=secret' },
  { what_they_buy: 'x'.repeat(501) }, { drafted_message: 'x'.repeat(601) },
  { verified: true }, { status: 'replied' }, { captured_at: '2027-01-01T00:00:00Z' }
]) assert.throws(() => finds.validateItems({ items: [{ ...item, ...changes }] }, now), /^Error: find_/);
assert.throws(() => finds.validateItems({ items: Array(26).fill(item) }, now), /find_item_limit/);
assert.throws(() => finds.validateItems({ items: [item], secret: 'x' }, now), /find_request_invalid/);
const original = { leads: [{ id: 'keep-lead' }], buyers: [{ id: 'keep-buyer' }], settings: { keep: true } };
const before = JSON.stringify(original);
let sequence = 0;
const context = { now, operatorId: 'fixture-operator', createId: () => 'fixture-' + (++sequence) };
let result = finds.ingest(original, valid, context);
assert.strictEqual(JSON.stringify(original), before, 'pure merge leaves the input store untouched');
assert.deepStrictEqual(result.store.leads, original.leads);
assert.deepStrictEqual(result.results, [{ id: 'fixture-1', result: 'created' }]);
assert.strictEqual(result.store.buyers[1].verified, false);
assert.strictEqual(result.store.buyers[1].status, 'Unverified');
let updated = finds.update(result.store, 'fixture-1', { status: 'messaged', drafted_message: 'Operator edit' }, context);
updated = finds.update(updated, 'fixture-1', { status: 'replied' }, context);
const repeat = finds.ingest(updated, [{ ...valid[0], drafted_message: 'Should not replace operator edit' }], { ...context, now: '2026-10-06T13:00:00.000Z' });
assert.strictEqual(repeat.store.buyers.length, 2);
assert.strictEqual(repeat.store.buyers[1].assistant_find.status, 'replied');
assert.strictEqual(repeat.store.buyers[1].assistant_find.drafted_message, 'Operator edit');
assert.strictEqual(repeat.store.buyers[1].assistant_find.history.length, 2);
assert.strictEqual(repeat.store.buyers[1].assistant_find.history[0].operator_id, 'fixture-operator');
assert.strictEqual(repeat.store.buyers[1].assistant_find.last_seen_at, '2026-10-06T13:00:00.000Z');
assert.strictEqual(repeat.store.buyers[1].verified, false, 'a workflow status does not verify a buyer');
assert.throws(() => finds.update(updated, 'fixture-1', { verified: true }, context), /find_update_invalid/);
assert.throws(() => finds.update(updated, 'missing', { status: 'new' }, context), /find_not_found/);
assert.deepStrictEqual(finds.listFinds(updated, { now }).counts, { total: 1, new_today: 1, messaged_this_week: 1 });
const html = ui.card({ ...finds.listFinds(updated, { now }).items[0], name: '<script>bad()</script>' });
assert.ok(!html.includes('<script>bad()'));
assert.ok(html.includes('&lt;script&gt;bad()'));
assert.ok(html.includes('published by them') && html.includes('not verified'));
assert.ok(ui.markup({ items: [], counts: { total: 0 } }).includes('No buyers found yet'));
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.ok(serverSource.includes("method: 'POST', path: '/assistant/finds'"));
assert.ok(!/method: 'GET', path: '\/assistant\/finds'/.test(serverSource));

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-buyer-finds-test-'));
  const pairingOptions = { state_path: path.join(temporary, 'pairing.json'), secret: crypto.randomBytes(48).toString('base64url'), now: Date.parse(now) };
  const createToken = () => pairing.exchangePairing(pairing.createPairing({ id: 'admin-fixture', role: 'admin' }, pairingOptions).pairing_token, pairingOptions).agent_token;
  const token = createToken();
  let store = JSON.parse(before);
  let writes = 0;
  const app = express();
  app.use(express.json());
  const admin = (req, res, next) => {
    if (req.headers['x-test-session'] !== 'fixture') return res.status(401).json({ code: 'session_required' });
    req.currentUser = { id: 'admin-fixture' }; next();
  };
  registerAssistantFindRoutes(app, {
    db: { readDBStrict: () => store, writeDB: (value) => { store = value; writes++; } },
    requireAdmin: admin, pairingOptions, now: () => now
  });
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(method, route, body, bearer = '', session = false) {
    const response = await fetch(base + route, { method, headers: {
      'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(session ? { 'x-test-session': 'fixture' } : {})
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  try {
    const malformed = await fetch(base + '/api/assistant/finds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"private_contact":' });
    assert.strictEqual(malformed.status, 400);
    assert.deepStrictEqual(await malformed.json(), { code: 'find_request_invalid' });
    assert.strictEqual((await request('POST', '/api/assistant/finds', { items: [item] })).status, 401);
    assert.strictEqual((await request('POST', '/api/assistant/finds', { items: [item] }, 'wrong')).status, 401);
    assert.strictEqual(writes, 0);
    const created = await request('POST', '/api/assistant/finds', { items: [item] }, token);
    assert.strictEqual(created.status, 200);
    assert.deepStrictEqual(Object.keys(created.body), ['results']);
    assert.deepStrictEqual(Object.keys(created.body.results[0]), ['id', 'result']);
    const id = created.body.results[0].id;
    assert.strictEqual((await request('GET', '/api/assistant/finds', null, token)).status, 405);
    assert.strictEqual((await request('GET', '/api/dashboard/buyers-found', null, token)).status, 401);
    assert.strictEqual((await request('PATCH', '/api/dashboard/buyers-found/' + id, { status: 'messaged' }, token)).status, 401);
    assert.strictEqual((await request('PATCH', '/api/dashboard/buyers-found/' + id, { status: 'messaged' }, '', true)).status, 200);
    assert.strictEqual((await request('POST', '/api/assistant/finds', { items: [item] }, token)).body.results[0].result, 'duplicate');
    const read = await request('GET', '/api/dashboard/buyers-found', null, '', true);
    assert.strictEqual(read.body.items[0].status, 'messaged');
    const invalid = await request('POST', '/api/assistant/finds', { items: [{ ...item, profile_url: 'https://secret.example.test/private' }] }, token);
    assert.strictEqual(invalid.status, 400);
    assert.ok(!JSON.stringify(invalid.body).includes('secret'));
    const limitedToken = createToken();
    for (let index = 0; index < REQUESTS_PER_HOUR; index++) assert.strictEqual((await request('POST', '/api/assistant/finds', { items: [item] }, limitedToken)).status, 200);
    assert.strictEqual((await request('POST', '/api/assistant/finds', { items: [item] }, limitedToken)).status, 429);
    assert.strictEqual(store.buyers.length, 2);
    assert.deepStrictEqual(store.leads, original.leads);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  console.log('assistant buyer finds: validation, token auth, write-only dropbox, caps, dedupe, operator history and privacy passed');
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
