'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ui = require('../dashboard/wos-lead-contact');
const { buildLeadContactBrief } = require('../modules/research/lead-contact-brief');
const row = require('./helpers/lead-contact-fixture').lead(); row.contact_brief = buildLeadContactBrief(row);
(async () => {
  let calls = 0, actor = 'synthetic-admin', locked = 0;
  const opened = [], response = status => ({ status, ok: status === 200, body: { cancel: async () => {} }, json: async () => ({ ok: true }) });
  let next = async (_path, request) => {
    calls++; assert.equal(request.credentials, 'include'); assert.equal(request.redirect, 'error');
    const body = JSON.parse(request.body); assert.deepEqual(Object.keys(body).sort(), ['channel', 'confirm', 'number', 'request_id']);
    assert.equal(body.number, '+15550101234'); return response(200);
  };
  const controller = ui.createController({ fetchImpl: (...args) => next(...args), actor: () => actor, openLocal: value => opened.push(value),
    lock: () => { actor = null; locked++; }, createId: () => crypto.randomUUID(), timeout: 20 });
  assert.equal((await controller.request(row, 'call')).ok, true);
  assert.equal(opened[0], 'tel:+15550101234');
  assert.equal((await controller.request(row, 'text', 'Edited & private 123')).ok, true);
  assert.equal(opened[1], 'sms:+15550101234?body=Edited%20%26%20private%20123');
  assert.equal(ui.href({ ...row.contact_brief, call_allowed: 'true' }, 'call'), '');
  assert.equal(ui.href({ ...row.contact_brief, call_href: 'tel:forged' }, 'call'), '');
  assert.equal(ui.href(row.contact_brief, 'text', 'x'.repeat(1601)), '');
  for (const status of [409, 429, 503]) {
    const count = calls; next = async () => { calls++; return response(status); };
    assert.equal((await controller.request(row, 'call')).ok, false); assert.equal(calls, count + 1, 'no automatic retry');
  }
  let resolve;
  next = () => new Promise(done => { resolve = done; });
  const pending = controller.request(row, 'call');
  assert.equal((await controller.request(row, 'call')).busy, true);
  controller.clear(); resolve(response(200));
  assert.equal((await pending).ok, false); assert.equal(opened.length, 2);
  next = (_path, request) => new Promise((_done, reject) => request.signal.addEventListener('abort', () => reject(Error('timeout'))));
  assert.equal((await controller.request(row, 'call')).ok, false); assert.equal(opened.length, 2);
  for (const status of [401, 403]) {
    actor = 'synthetic-admin'; next = async () => response(status);
    assert.equal((await controller.request(row, 'call')).locked, true);
  }
  assert.equal(locked, 2); assert.equal(opened.length, 2);
  actor = 'synthetic-admin';
  next = async (url, request) => {
    assert.equal(url, '/api/dashboard/free-public-deal-board/contact-workflow');
    const payload = JSON.parse(request.body);
    assert.deepEqual(Object.keys(payload).sort(), ['action', 'channel', 'confirm', 'market', 'number', 'queue_key', 'request_id']);
    assert.equal(payload.action, 'local_contact_requested'); assert.equal(payload.queue_key, 'synthetic-source');
    assert.deepEqual(payload.market, { city: 'Example City', county: 'Example', state: 'TX' });
    return response(200);
  };
  const sourceRow = { ...row, id: undefined, queue_key: 'synthetic-source', contact_summary_authorized: true,
    contact_market: { city: 'Example City', county: 'Example', state: 'TX' } };
  assert.equal((await controller.request(sourceRow, 'text', 'Synthetic local-only body')).ok, true);
  assert.equal(opened.at(-1), 'sms:+15550101234?body=Synthetic%20local-only%20body');
  assert.equal((await controller.request({ ...sourceRow, contact_summary_authorized: 'true' }, 'call')).ok, false);
  const html = ui.markup(row); assert.ok(html.includes('Synthetic Owner')); assert.ok(html.includes('data-lc-message'));
  assert.equal(ui.addressLine(row), row.address);
  assert.equal(ui.addressLine({ address: '100 Test St', city: 'Example City', state: 'TX', zip: '75001' }), row.address);
  assert.equal(ui.addressLine({ address: '100 Test St, Example City', city: 'Example City', state: 'TX', zip: '75001' }), row.address);
  assert.equal(ui.addressLine({ ...row, state: 'FL' }), row.address, 'display never rewrites a complete raw address to match stored state');
  assert.ok(!ui.markup({ ...row, contact_brief: buildLeadContactBrief({ ...row, do_not_call: true }) }).includes('data-lc-channel'));
  assert.ok(ui.markup({ id: 'empty' }).includes('Owner not found yet'));
  assert.ok(!ui.markup({ ...row, contact_brief: { ...row.contact_brief, owner: { name: '<img onerror=bad>' } } }).includes('<img onerror=bad>'));
  console.log('lead-contact-controller: explicit tap/edited local SMS, no message upload, no retry, timeout, late response/session lock and escaping PASS');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
