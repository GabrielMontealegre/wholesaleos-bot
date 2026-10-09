'use strict';
const assert = require('assert');
const express = require('express');
const finds = require('../modules/buyers/assistant-finds');
const imports = require('../modules/buyers/buyer-find-import');
const { registerAssistantFindRoutes } = require('../modules/buyers/assistant-find-routes');
const ui = require('../dashboard/wos-buyers-found');
const now = '2026-10-06T12:00:00.000Z';
const item = { name: 'SYNTHETIC BUYER', platform: 'facebook', group_id: '123', group_name: 'SYNTHETIC GROUP',
  profile_url: 'https://www.facebook.com/groups/123/user/456/', source_url: 'https://www.facebook.com/groups/123/search/?q=buy',
  what_they_buy: 'Synthetic fixture only', deal_type: 'house', captured_at: now, classification: 'end_buyer',
  email: 'fixture@example.test', drafted_message: 'Synthetic draft' };
const original = { buyers: [], leads: [{ id: 'keep' }], settings: { keep: true } };
const before = JSON.stringify(original);
const input = { items: [item, { ...item, profile_url: 'https://www.facebook.com/groups/123/user/457/' },
  { ...item, source_url: 'https://private.example.test/' }] };
const plan = imports.prepareImport(original, input, { now });
assert.deepStrictEqual(plan.summary.counts, { new_items: 1, updates: 0, duplicates: 1, rejected: 1, bulk_approval_eligible: 1 });
assert.strictEqual(JSON.stringify(original), before);
for (const value of [item.name, item.email, item.profile_url, 'private.example.test']) assert.ok(!JSON.stringify(plan.summary).includes(value));
assert.throws(() => imports.prepareImport(original, { items: Array(51).fill(item) }, { now }), /find_item_limit/);
assert.throws(() => imports.prepareImport(original, { ...input, bulk_approve: true }, { now }), /find_request_invalid/);
const kinds = ['end_buyer', 'end_buyer_strict', 'end_buyer_stale', 'middleman_jv', 'caution_lending', 'not_buyer_service', 'unknown', 'out_of_market'];
const mixed = imports.prepareImport(original, { items: kinds.map((classification, i) => ({ ...item, classification,
  email: '', profile_url: 'https://www.facebook.com/groups/123/user/' + (1000 + i) + '/' })) }, { now });
let serial = 0;
const context = { now, operatorId: 'signed-admin', createId: () => 'fixture-' + (++serial) };
const pending = imports.commitImport(original, mixed, context);
assert.ok(pending.store.buyers.every(b => b.assistant_find.approval === 'pending'));
const approved = imports.commitImport(original, mixed, { ...context, bulkApprove: true });
assert.strictEqual(approved.summary.approved, 3);
approved.store.buyers.forEach((buyer, index) => {
  assert.strictEqual(buyer.assistant_find.approval, index < 3 ? 'approved' : 'pending');
  if (index < 3) assert.deepStrictEqual(buyer.assistant_find.history[0], { kind: 'approval', from: 'pending', to: 'approved',
    reason: 'approved before import', at: now, operator_id: 'signed-admin', channel: 'dashboard' });
});
const rejectedStore = finds.update(approved.store, approved.store.buyers[0].id, { approval: 'rejected' }, context);
const repeated = imports.commitImport(rejectedStore, mixed, { ...context, bulkApprove: true });
assert.strictEqual(repeated.summary.created, 0);
assert.strictEqual(repeated.summary.approved, 0);
assert.strictEqual(repeated.store.buyers[0].assistant_find.approval, 'rejected');
assert.deepStrictEqual(repeated.store.leads, original.leads);
assert.ok(!ui.markup({ items: [], counts: {} }).includes('data-import-action="open"'), 'no admin capability means no import control');
const fileSystem = require('fs');
const saved = { fetch: global.fetch, now: Date.now, write: fileSystem.writeFileSync };
let sideEffects = 0;
const denied = () => { sideEffects++; throw new Error('Unexpected pure-module side effect'); };
try {
  global.fetch = denied; Date.now = denied; fileSystem.writeFileSync = denied;
  imports.prepareImport(original, input, { now });
  imports.commitImport(original, mixed, { ...context, bulkApprove: true });
} finally { global.fetch = saved.fetch; Date.now = saved.now; fileSystem.writeFileSync = saved.write; }
assert.strictEqual(sideEffects, 0);

(async () => {
  let store = JSON.parse(before);
  let writes = 0;
  let currentTime = now;
  const app = express(); app.use(express.json());
  const admin = (req, res, next) => {
    if (!req.headers['x-test-admin']) return res.status(403).json({ code: 'admin_required' });
    req.currentUser = { id: req.headers['x-test-admin'] }; next();
  };
  registerAssistantFindRoutes(app, { db: { readDBStrict: () => store, writeDB: value => { store = value; writes++; } }, requireAdmin: admin, now: () => currentTime });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/dashboard/buyers-found/import/';
  async function request(path, body, actor = 'admin') {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(actor ? { 'x-test-admin': actor } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  const logs = [];
  const originals = { log: console.log, error: console.error, warn: console.warn };
  Object.keys(originals).forEach(key => { console[key] = (...values) => logs.push(values.map(String).join(' ')); });
  try {
    assert.strictEqual((await request('preview', input, '')).status, 403);
    assert.strictEqual((await request('commit', { preview_id: 'forged', bulk_approve: true }, '')).status, 403);
    assert.strictEqual((await request('commit', { preview_id: 'forged', bulk_approve: true })).status, 409);
    const preview = await request('preview', input);
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(writes, 0);
    assert.strictEqual(JSON.stringify(store), before);
    assert.deepStrictEqual(preview.body.counts, plan.summary.counts);
    assert.ok(!JSON.stringify(preview.body).includes(item.email));
    const commit = { preview_id: preview.body.preview_id, bulk_approve: true };
    assert.strictEqual((await request('commit', commit, 'different-admin')).status, 409);
    assert.strictEqual((await request('commit', { ...commit, actor: 'forged' })).status, 400);
    const saved = await request('commit', commit);
    assert.deepStrictEqual(saved.body, { created: 1, updated: 0, duplicates: 1, rejected: 1, approved: 1 });
    assert.strictEqual(writes, 1);
    assert.strictEqual(store.buyers[0].assistant_find.history[0].operator_id, 'admin');
    assert.strictEqual((await request('commit', commit)).status, 409);
    const stale = await request('preview', { items: [item] });
    currentTime = '2026-10-06T12:06:00.000Z';
    assert.strictEqual((await request('commit', { preview_id: stale.body.preview_id, bulk_approve: true })).status, 409);
    assert.strictEqual(writes, 1);
    assert.deepStrictEqual(logs, []);
  } finally { Object.assign(console, originals); await new Promise(resolve => server.close(resolve)); }
  console.log('buyer import: shared validation, no-write preview, admin ownership, expiry, approval exclusions, dedupe and privacy passed');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
