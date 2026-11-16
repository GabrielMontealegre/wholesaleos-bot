'use strict';
const assert = require('node:assert/strict');
const express = require('express');
const { registerLegacyContractFill } = require('../modules/contracts/legacy-fill-routes');

async function prove() {
  const app = express(); app.use(express.json());
  let reads = 0, leads = [Object.freeze({ id: 'synthetic-lead', address: 'Synthetic property address', offer: 125000 })];
  const db = new Proxy({ getLeads() { reads++; if (leads instanceof Error) throw leads; return leads; } }, {
    get(target, key) { if (!(key in target)) throw new Error('unexpected writer'); return target[key]; }
  });
  registerLegacyContractFill(app, { db, requireAdmin(req, res, next) {
    if (!req.headers['x-test-role']) return res.status(401).json({ code: 'SESSION_REQUIRED' });
    if (req.headers['x-test-role'] !== 'admin') return res.status(403).json({ code: 'ADMIN_REQUIRED' });
    next();
  } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = 'http://127.0.0.1:' + server.address().port + '/api/contracts/fill';
  async function request(body, role = 'admin') {
    const headers = { 'content-type': 'application/json' }; if (role) headers['x-test-role'] = role;
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, data: await response.json() };
  }
  try {
    assert.equal((await request({ leadId: 'synthetic-lead' }, null)).status, 401);
    assert.equal((await request({ leadId: 'synthetic-lead' }, 'agent')).status, 403);
    assert.equal(reads, 0);
    for (const body of [{}, [], { leadId: {} }, { leadId: '' }, { leadId: 'synthetic-lead', sellerName: [] },
      { leadId: 'synthetic-lead', titleCompany: null }, { leadId: 'synthetic-lead', extraNotes: 'a'.repeat(5001) },
      { leadId: 'synthetic-lead', profile: { reviewed: false } }, { leadId: 'synthetic-lead', signature: 'forged' },
      { leadId: 'synthetic-lead', effective_date: '10/06/2026' }, { leadId: 'synthetic-lead', deposit_payer: 'operator' },
      { leadId: 'synthetic-lead', earnest_money: 5000 }]) assert.equal((await request(body)).status, 400);
    assert.equal(reads, 0, 'invalid input must not read records');
    const before = JSON.stringify(leads);
    const success = await request({ leadId: 'synthetic-lead', sellerName: 'Synthetic seller', titleCompany: 'Synthetic title', extraNotes: 'Local note' });
    assert.equal(success.status, 200); assert.equal(success.data.unsigned, true);
    assert.equal(success.data.fields.purchase_price, '$125,000'); assert.equal(success.data.fields.earnest_money, '');
    assert.equal(success.data.fields.buyer_name, ''); assert.equal(success.data.notes, 'Local note');
    assert.equal(JSON.stringify(leads), before);
    assert.equal((await request({ leadId: 'missing' })).status, 404);
    leads = [{ id: 'duplicate' }, { id: 'duplicate' }];
    assert.equal((await request({ leadId: 'duplicate' })).status, 409);
    leads = new Error('Synthetic internal failure detail');
    assert.deepEqual(await request({ leadId: 'synthetic-lead' }), { status: 503, data: { code: 'contract_fill_unavailable' } });
    console.log('legacy contract route: admin-first, allowlisted input, unique identity, no writes, no-store and value-free failures PASS');
  } finally { await new Promise(resolve => server.close(resolve)); }
}
prove().catch(() => { console.error('legacy contract route assertions failed'); process.exitCode = 1; });
