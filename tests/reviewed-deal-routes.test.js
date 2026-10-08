'use strict';
const assert = require('assert'); const express = require('express');
const { registerReviewedDealRoutes } = require('../modules/deals/reviewed-deal-routes');
const { registerAssistantFindRoutes } = require('../modules/buyers/assistant-find-routes');
const { fixture, buyer, now } = require('./reviewed-deals.test');
(async () => {
  let store = { buyers: [buyer], leads: [{ id: 'untouched' }] }; let writes = 0;
  const db = { readDBStrict: () => store, writeDB: s => { store = s; writes++; } }; const app = express(); app.use(express.json());
  const requireAdmin = (req, res, next) => { if (!req.headers['x-fixture-admin']) return res.status(401).end(); req.currentUser = { id: req.headers['x-fixture-admin'] }; next(); };
  registerReviewedDealRoutes(app, { db, requireAdmin, now: () => now }); registerAssistantFindRoutes(app, { db, requireAdmin, now: () => now });
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); }); const base = 'http://127.0.0.1:' + server.address().port;
  async function request(route, method = 'GET', body, actor = 'admin') { return fetch(base + route, { method, headers: { ...(actor ? { 'x-fixture-admin': actor } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); }
  try {
    assert.strictEqual((await request('/api/dashboard/todays-deals', 'GET', null, '')).status, 401);
    const p = await (await request('/api/dashboard/buyers-found/import/preview', 'POST', { items: [fixture()] })).json(); assert.strictEqual(writes, 0); assert.strictEqual(p.counts.new_items, 1);
    assert.strictEqual((await request('/api/dashboard/buyers-found/import/commit', 'POST', { preview_id: p.preview_id, bulk_approve: true }, 'other')).status, 409);
    assert.strictEqual((await request('/api/dashboard/buyers-found/import/commit', 'POST', { preview_id: p.preview_id, bulk_approve: true })).status, 200); assert.strictEqual(writes, 1);
    const result = await (await request('/api/dashboard/todays-deals')).json(); assert.strictEqual(result.items[0].approval, 'pending'); assert.strictEqual(result.items[0].evaluation.value.tier, 'Not established'); assert.strictEqual(writes, 1);
    const id = result.items[0].id;
    assert.strictEqual((await request('/api/dashboard/todays-deals/' + id, 'PATCH', { action: 'approve', reviewed_comps: true }, '')).status, 401); assert.strictEqual(writes, 1);
    assert.strictEqual((await request('/api/dashboard/todays-deals/' + id, 'PATCH', { action: 'approve', reviewed_comps: true })).status, 200); assert.strictEqual(writes, 2);
    const draft = await request('/api/dashboard/todays-deals/' + id + '/jv-draft'); assert.ok((await draft.text()).includes('NOT A SIGNED AGREEMENT')); assert.strictEqual(writes, 2);
    assert.strictEqual((await request('/api/dashboard/todays-deals/missing', 'PATCH', { action: 'reject' })).status, 404); assert.strictEqual(writes, 2);
    assert.deepStrictEqual(store.leads, [{ id: 'untouched' }]);
    console.log('Reviewed-deal routes: admin guards, no-write reads/previews/drafts, owned import, pending-only deal saves, explicit writes passed.');
  } finally { await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
