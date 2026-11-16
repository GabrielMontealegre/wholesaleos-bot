'use strict';
const assert = require('node:assert/strict'), http = require('node:http'), https = require('node:https');
const { registerRoutes } = require('../modules/email/reviewed-thread-replies'), { annotate } = require('../modules/email/thread-view');
const effects = [], undo = [];
for (const [obj, key] of [[global, 'fetch'], [http, 'get'], [http, 'request'], [https, 'get'], [https, 'request']]) { const old = obj[key]; undo.push(() => { obj[key] = old; }); obj[key] = () => { effects.push(key); throw Error('No network'); }; }
async function main() {
  const own = 'operator@example.test', now = '2026-10-21T02:00:00Z';
  const rows = [{ id: 'source1', source_kind: 'connected_mailbox', message_id: '<one@example.test>', date: '2026-10-20T12:00:00Z', body: 'Private synthetic source text', subject: 'Synthetic subject', from_addresses: ['person@example.test'], to_addresses: [own], cc_addresses: ['copy@example.test'] }];
  const store = { users: [{ id: 'operator', role: 'admin' }] }, env = { GMAIL_USER: own, WOS_EMAIL_REPLY_ENABLED: 'true' }, routes = new Map();
  let reads = 0, authorized = true, duringRead;
  registerRoutes({ get(url, ...handlers) { routes.set(url, handlers); }, post() {} }, {
    env, now: () => now, reader: { async messages(ids) { reads++; if (duringRead) duringRead(); return rows.filter(m => ids.includes(m.id)); } }, sender: { configured: () => true, send() { effects.push('send'); throw Error('No send'); } },
    requireAdmin(req, res, next) { if (!authorized) return res.status(401).json({ code: 'SESSION_REQUIRED' }); req.currentUser = { id: 'operator' }; next(); },
    db: { readDBStrict: () => structuredClone(store), writeDB() { effects.push('write'); throw Error('No write'); } }
  });
  const query = () => ({ message_ids: JSON.stringify(['source1']), thread_key: annotate(rows, store, { now })[0].thread_key });
  async function request(q = query()) {
    const req = { query: q }, res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    for (const handler of routes.get('/api/dashboard/email/thread-replies/context')) { let next = false; await handler(req, res, () => { next = true; }); if (!next) break; }
    return res;
  }
  let result = await request(); assert.equal(result.statusCode, 200); assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(result.body.to, ['person@example.test']); assert.deepEqual(result.body.cc, ['copy@example.test']);
  assert.deepEqual(Object.keys(result.body).sort(), ['cc', 'message_ids', 'participants', 'subject', 'thread_key', 'to']);
  assert(!JSON.stringify(result.body).includes(own)); assert(!JSON.stringify(result.body).includes(rows[0].body));
  authorized = false; const previous = reads; assert.equal((await request()).statusCode, 401); assert.equal(reads, previous); authorized = true;
  env.WOS_EMAIL_REPLY_ENABLED = 'false'; assert.equal((await request()).statusCode, 503); assert.equal(reads, previous); env.WOS_EMAIL_REPLY_ENABLED = 'true';
  for (const q of [{ ...query(), message_ids: 'invalid json' }, { ...query(), message_ids: JSON.stringify(['source1', 'source1']) }, { ...query(), extra: 'forged' }, { ...query(), thread_key: 'f'.repeat(64) }]) assert.notEqual((await request(q)).statusCode, 200);
  const q = query(); rows[0].source_kind = 'operator_input'; assert.notEqual((await request(q)).statusCode, 200); rows[0].source_kind = 'connected_mailbox';
  duringRead = () => { store.users[0].role = 'viewer'; }; assert.equal((await request()).statusCode, 403);
  assert.deepEqual(effects, []);
  console.log('thread-reply-context: signed-admin boundary, default-OFF, source-only defaults, missing/forged/stale/role-change rejection, no body/own-mailbox exposure, zero writes/send/network passed');
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(() => undo.forEach(fn => fn()));
