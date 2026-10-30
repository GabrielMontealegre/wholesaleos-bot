'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), http = require('node:http'), https = require('node:https'), crypto = require('node:crypto');
const blocked = [], restore = [];
for (const [obj, key] of [[global, 'fetch'], [http, 'get'], [http, 'request'], [https, 'get'], [https, 'request']]) { const before = obj[key]; restore.push(() => { obj[key] = before; }); obj[key] = () => { blocked.push(key); throw Error('Network forbidden in fixture'); }; }
const policy = require('../modules/email/thread-reply-policy'), { registerRoutes, createSender } = require('../modules/email/reviewed-thread-replies');
const sessions = require('../modules/security/dashboard-session'), { annotate } = require('../modules/email/thread-view');
const at = '2026-10-21T02:00:00Z', own = 'operator@example.test', secret = 'synthetic-session-key-for-test-only-1234567890';
const original = { id: 'source1', source_kind: 'connected_mailbox', message_id: '<source1@example.test>', in_reply_to: '', threadId: '', date: '2026-10-20T12:00:00Z', body: 'Synthetic source body', subject: 'Source subject', from_addresses: ['person@example.test'], to_addresses: [own], cc_addresses: ['copy@example.test'] };
function fixture({ senderMode = 'accepted', enabled = true } = {}) {
  let store = { users: [{ id: 'operator', role: 'admin' }], buyers: [{ id: 'buyer1', record_ref: 'BUY-0001' }], reviewed_deals: [{ id: 'deal1', record_ref: 'WOS-FL-1031' }], conversations: [{ id: 'conversation1', role: 'buyer', source_kind: 'operator_input', recorded_at: at, channels: ['email'], refs: ['BUY-0001', 'WOS-FL-1031'], email_message_ids: [original.message_id] }], activities: [] };
  const env = { GMAIL_USER: own, WOS_EMAIL_REPLY_ENABLED: String(enabled), RAILWAY_PUBLIC_DOMAIN: 'fixture.test' }, rows = [structuredClone(original)], routes = new Map(), calls = [], writes = [];
  let now = at, readerCalls = 0, duringRead = null, duringSend = null, failure = null;
  const db = { readDBStrict: () => structuredClone(store), writeDB: value => { if (failure) throw Error('SYNTHETIC PRIVATE FAILURE'); store = structuredClone(value); writes.push(value); } };
  const reader = { async messages(ids) { readerCalls++; if (duringRead) await duringRead(); return rows.filter(r => ids.includes(r.id)).map(r => structuredClone(r)); } };
  const sender = { configured: () => true, async send(message) { calls.push(structuredClone(message)); if (duringSend) duringSend(); if (senderMode === 'timeout') return new Promise(() => {}); if (senderMode === 'error') throw Error('SYNTHETIC SECRET TRANSPORT'); if (senderMode === 'partial') return { accepted: [message.to[0]], rejected: message.cc }; return { accepted: [...message.to, ...message.cc], rejected: [] }; } };
  const app = Object.fromEntries(['get', 'post'].map(method => [method, (url, ...handlers) => routes.set(method + ' ' + url, handlers)]));
  const auth = (req, res, next) => { const verified = sessions.verifySession(req.headers.cookie?.slice('wos_session='.length), { secret, now: Date.parse(now) }); if (!verified.ok || verified.user.scope !== 'dashboard') return res.status(401).json({ code: 'SESSION_REQUIRED' }); const user = store.users.find(u => u.id === verified.user.id); if (user?.role !== 'admin') return res.status(403).json({ code: 'ADMIN_REQUIRED' }); req.currentUser = user; next(); };
  const install = () => registerRoutes(app, { db, requireAdmin: auth, env, reader, sender, now: () => now, timeoutMs: 5 });
  install();
  const token = sessions.issueSession({ userId: 'operator', role: 'admin', scope: 'dashboard' }, { secret, now: Date.parse(at) }).token;
  async function request(action, body, patch = {}) {
    const req = { body, protocol: 'https', headers: { cookie: 'wos_session=' + token, origin: 'https://fixture.test', host: 'fixture.test', 'content-type': 'application/json', 'x-wos-reply-request': '1', ...patch }, get(name) { return this.headers[name.toLowerCase()]; } };
    const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    const method = action === 'status' ? 'get' : 'post';
    for (const handler of routes.get(method + ' /api/dashboard/email/thread-replies/' + action)) { let next = false; await handler(req, res, () => { next = true; }); if (!next) break; }
    return res;
  }
  const input = () => ({ message_ids: ['source1'], thread_key: annotate(rows, store, { now })[0].thread_key, to: ['person@example.test'], cc: ['copy@example.test'], added_recipients: [], subject: 'Re: Source subject', body: 'Exact synthetic reply\nPreserve whitespace. ' });
  return { request, input, rows, env, calls, writes, db, store: () => store, mutate(fn) { fn(store); }, clock(value) { now = value; }, onRead(fn) { duringRead = fn; }, onSend(fn) { duringSend = fn; }, failWrites(value = true) { failure = value; }, restart: install, reads: () => readerCalls };
}
async function main() {
  let f = fixture();
  assert.equal((await f.request('status')).body.enabled, true);
  for (const headers of [{ cookie: '' }, { cookie: 'wos_session=forged', 'x-user-id': 'operator' }, { cookie: 'wos_session=' + sessions.issueSession({ userId: 'operator', role: 'admin', scope: 'agent' }, { secret, now: Date.parse(at) }).token }]) assert.equal((await f.request('preview', f.input(), headers)).statusCode, 401);
  for (const headers of [{ origin: '' }, { origin: 'https://evil.test' }, { 'content-type': 'text/plain' }, { 'x-wos-reply-request': '' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await f.request('preview', f.input(), headers)).statusCode, 403);
  assert.equal(f.reads(), 0); assert.equal(f.writes.length, 0); assert.equal(f.calls.length, 0);
  f.mutate(s => { s.users[0].role = 'viewer'; }); assert.equal((await f.request('status')).statusCode, 403);
  for (const patch of [{ to: ['injected@example.test'] }, { cc: ['evil@example.test'] }, { to: ['person@example.test\r\nBcc:evil@example.test'] }, { added_recipients: ['unused@example.test'] }, { subject: 'Bad\nheader' }, { body: '' }, { thread_key: 'f'.repeat(64) }, { message_ids: ['source1', 'source1'] }, { body: 'x'.repeat(12001) }]) { f = fixture(); assert.notEqual((await f.request('preview', { ...f.input(), ...patch })).statusCode, 200); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0); }
  for (const patch of [{ source_kind: 'operator_input' }, { date: '2026-10-22T01:00:00Z' }, { message_id: '' }, { from_addresses: undefined }, { to_addresses: [] }]) { f = fixture(); const input = f.input(); Object.assign(f.rows[0], patch); assert.notEqual((await f.request('preview', input)).statusCode, 200); assert.equal(f.calls.length, 0); }
  f = fixture(); const added = await f.request('preview', { ...f.input(), to: ['typed@example.test'], cc: [], added_recipients: ['typed@example.test'] }); assert.equal(added.statusCode, 200); assert.equal(f.calls.length, 0);
  f = fixture(); let preview = await f.request('preview', f.input()); assert.equal(preview.statusCode, 200); assert.equal(preview.body.reviewed, false); assert.equal(f.reads(), 1);
  assert.equal((await f.request('preview', f.input())).body.id, preview.body.id, 'Same unexpired draft version reuses its identity');
  const send = () => ({ preview_id: preview.body.id, version: preview.body.version, reviewed: true });
  assert.equal((await f.request('send', { ...send(), reviewed: false })).statusCode, 400);
  assert.equal((await f.request('send', { ...send(), body: 'Client cannot replace reviewed text' })).statusCode, 400);
  const [one, two] = await Promise.all([f.request('send', send()), f.request('send', send())]);
  assert.equal(f.calls.length, 1, 'Concurrent clicks make exactly one SMTP attempt'); assert([one.statusCode, two.statusCode].includes(200));
  assert.equal(f.calls[0].body, f.input().body); assert.equal(f.calls[0].anchor, original.message_id);
  assert.equal((await f.request('send', send())).body.already_sent, true); assert.equal(f.calls.length, 1);
  assert.equal(f.store().thread_reply_receipts.length, 1); assert.equal(f.store().activities.length, 2);
  assert(!JSON.stringify(f.store().activities).includes('Exact synthetic reply')); assert(f.store().activities.every(a => a.reply_receipt.to[0] === 'person@example.test' && a.attribution === 'smtp_accepted'));
  assert.equal((await f.request('preview', f.input())).body.code, 'thread_reply_already_accepted');
  f.mutate(s => { s.thread_reply_receipts = []; });
  assert.equal((await f.request('send', send())).body.code, 'thread_reply_receipt_unavailable', 'A preset accepted status without its SMTP receipt cannot claim success'); assert.equal(f.calls.length, 1);
  for (const mode of ['timeout', 'error', 'partial']) {
    f = fixture({ senderMode: mode }); preview = await f.request('preview', f.input()); const input = { preview_id: preview.body.id, version: preview.body.version, reviewed: true };
    const first = await f.request('send', input); assert.equal(first.statusCode, 502); assert.equal(first.body.status, 'unknown'); assert(!JSON.stringify(first.body).includes('SECRET'));
    assert.equal((await f.request('send', input)).statusCode, 409); assert.equal((await f.request('preview', f.input())).body.code, 'thread_reply_send_uncertain'); assert.equal(f.calls.length, 1); assert.equal(f.store().activities.length, 0);
    const reads = f.reads(); f.restart();
    assert.equal((await f.request('send', input)).statusCode, 409, 'A new route instance cannot retry an uncertain attempt');
    assert.equal(f.reads(), reads); assert.equal(f.calls.length, 1);
  }
  for (const change of ['source', 'stored', 'expired', 'disabled', 'role', 'links', 'db']) {
    f = fixture(); preview = await f.request('preview', f.input());
    if (change === 'source') f.rows[0].body += 'new source text';
    if (change === 'stored') f.mutate(s => { s.thread_reply_previews[0].body = 'Tampered stored preview'; });
    if (change === 'expired') f.clock('2026-10-21T02:06:00Z');
    if (change === 'disabled') f.env.WOS_EMAIL_REPLY_DISABLED = 'true';
    if (change === 'role') f.onRead(async () => { f.mutate(s => { s.users[0].role = 'viewer'; }); });
    if (change === 'links') f.onRead(async () => { f.mutate(s => { s.conversations[0].refs = []; }); });
    if (change === 'db') f.failWrites();
    assert.notEqual((await f.request('send', { preview_id: preview.body.id, version: preview.body.version, reviewed: true })).statusCode, 200, change); assert.equal(f.calls.length, 0, change);
  }
  f = fixture({ enabled: false }); assert.equal((await f.request('preview', f.input())).body.code, 'thread_reply_disabled'); assert.equal(f.reads(), 0);
  f = fixture(); preview = await f.request('preview', f.input()); f.mutate(s => { s.thread_reply_previews.push(...Array.from({ length: 30 }, (_, i) => ({ id: 'attempt' + i, status: 'unknown', attempted_at: at }))); });
  assert.equal((await f.request('send', { preview_id: preview.body.id, version: preview.body.version, reviewed: true })).statusCode, 429); assert.equal(f.calls.length, 0);
  f = fixture(); preview = await f.request('preview', f.input()); f.onSend(() => f.failWrites());
  assert.equal((await f.request('send', { preview_id: preview.body.id, version: preview.body.version, reviewed: true })).statusCode, 502);
  assert.equal(f.store().thread_reply_previews[0].status, 'sending', 'Failure to save the result leaves a durable no-retry state');
  f.failWrites(false); f.restart(); assert.equal((await f.request('send', { preview_id: preview.body.id, version: preview.body.version, reviewed: true })).statusCode, 409); assert.equal(f.calls.length, 1); assert.equal(f.store().activities.length, 0);
  f = fixture(); f.mutate(s => s.conversations.push({ ...s.conversations[0], id: 'other' })); assert.equal((await f.request('preview', f.input())).body.code, 'thread_reply_thread_changed');
  const mixed = [original, { ...original, id: 'other-source', message_id: '<other@example.test>' }];
  assert.throws(() => policy.context(mixed, {}, { now: at, own, message_ids: mixed.map(r => r.id), thread_key: annotate(mixed, {}, { now: at })[0].thread_key }), /thread_changed/);
  f = fixture();
  const savedNow = Date.now, savedRandom = crypto.randomUUID, savedWrite = fs.writeFileSync;
  try {
    Date.now = crypto.randomUUID = fs.writeFileSync = () => { blocked.push('pure-effect'); throw Error('Pure projection cannot use clock/random/writes'); };
    const input = f.input(), ctx = policy.context(f.rows, f.store(), { now: at, own, message_ids: input.message_ids, thread_key: input.thread_key });
    assert.deepEqual(policy.prepare(input, ctx, { now: at, own, operatorId: 'operator' }), policy.prepare(input, ctx, { now: at, own, operatorId: 'operator' }));
  } finally { Date.now = savedNow; crypto.randomUUID = savedRandom; fs.writeFileSync = savedWrite; }
  f = fixture(); f.onRead(async () => { f.mutate(s => s.activities.push({ type: 'synthetic_concurrent_note' })); });
  assert.equal((await f.request('preview', f.input())).statusCode, 200); assert.equal(f.store().activities.length, 1, 'Mailbox waits cannot overwrite concurrent store activity');
  let transmitted; const sender = createSender({ env: { GMAIL_USER: own, GMAIL_APP_PASSWORD: 'synthetic-not-a-key' }, mailer: { createTransport(options) { assert.equal(options.logger, false); assert.equal(options.debug, false); assert.equal(options.tls.rejectUnauthorized, true); return { async sendMail(message) { transmitted = message; return { accepted: message.to }; }, close() {} }; } } });
  await sender.send({ to: ['person@example.test'], cc: ['copy@example.test'], subject: 'Synthetic subject', body: 'Exact text', anchor: original.message_id, message_id: '<reply@example.test>' });
  assert.equal(transmitted.inReplyTo, original.message_id); assert.deepEqual(transmitted.references, [original.message_id]); assert.equal(transmitted.disableFileAccess, true); assert.equal(transmitted.disableUrlAccess, true); assert.equal(transmitted.html, undefined); assert.equal(transmitted.attachments, undefined);
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8'); assert(server.includes("require('./modules/email/reviewed-thread-replies').registerRoutes(app, { requireAdmin, db });")); assert(server.includes("app.post('/api/gmail/reply', serverSendDisabled)"));
  assert.deepEqual(blocked, []);
  console.log('reviewed-thread-replies: signed admin/scope, CSRF, exact source thread/participants, operator-typed additions, reviewed versions, stale/forged input, persisted double-click/timeout/cap/kill switch, source-linked receipts without bodies and safe SMTP; zero network calls passed');
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => restore.forEach(fn => fn()));
