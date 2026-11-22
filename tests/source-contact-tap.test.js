'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSourceContactTapHandler } = require('../modules/records/lead-contact-tap-routes');
const { lead } = require('./helpers/lead-contact-fixture');
let store, rows, writes, reads;
const canonical = { ...lead(), queue_key: 'synthetic-source', normalized_address: lead().address };
delete canonical.id;
delete canonical.address;
const original = JSON.stringify(canonical);
function reset() { store = { users: [{ id: 'synthetic-admin', role: 'admin' }], leads: [], activities: [] }; rows = [structuredClone(canonical)]; writes = 0; reads = 0; }
const handler = createSourceContactTapHandler({ db: { readDBStrict: () => store, writeDB(value) { writes++; store = value; } },
  readSnapshot(input) { reads++; assert.deepEqual(input.market, { city: 'Example City', county: 'Example', state: 'TX' }); return { rows }; },
  now: () => '2026-11-22T08:00:00.000Z' });
function body() { return { action: 'local_contact_requested', confirm: true, channel: 'call', number: '+15550101234',
  queue_key: canonical.queue_key, market: { city: 'Example City', county: 'Example', state: 'TX' }, request_id: crypto.randomUUID() }; }
function invoke(input, actor = { id: 'synthetic-admin' }, query = {}) {
  const response = { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } };
  handler({ body: input, query, currentUser: actor }, response); return response;
}
reset();
const request = body(); let result = invoke(request);
assert.equal(result.statusCode, 200); assert.equal(result.headers['Cache-Control'], 'no-store'); assert.equal(writes, 1);
const entry = store.activities[0];
assert.equal(entry.type, 'local_contact_requested'); assert.equal(entry.operator_id, 'synthetic-admin');
assert.equal(entry.ts, '2026-11-22T08:00:00.000Z'); assert.equal(entry.contact_number, request.number);
assert.equal(entry.source_queue_key, canonical.queue_key); assert.deepEqual(entry.source_market, request.market);
assert.equal(entry.lead_id, undefined); assert.equal(entry.message, undefined); assert.equal(entry.body, undefined);
assert.equal(JSON.stringify(store).includes('contact_brief'), false); assert.deepEqual(store.leads, []);
assert.equal(JSON.stringify(rows[0]), original, 'snapshot evidence/outcome never changes');
result = invoke(request); assert.equal(result.body.duplicate, true); assert.equal(writes, 1);
assert.equal(invoke({ ...request, channel: 'text' }).statusCode, 409); assert.equal(writes, 1);
for (const patch of [{ confirm: 'true' }, { confirm: false }, { message: 'Never upload' }, { number: ['+15550101234'] },
  { actor: 'forged' }, { ts: 'forged' }, { market: { state: 'TX' } }, { request_id: 'forged' }, { queue_key: '' }]) {
  reset(); assert.equal(invoke({ ...body(), ...patch }).statusCode, 400); assert.equal(writes, 0); assert.equal(reads, 0);
}
for (const patch of [{ do_not_call: true }, { owner_type: 'bank' }, { owner_record: {} },
  { sale_outcome: 'SOLD_TO_THIRD_PARTY' }, { free_contact_routes: [] },
  { free_contact_routes: [{ ...canonical.free_contact_routes[0], status: 'wrong' }] }]) {
  reset(); rows = [{ ...canonical, ...patch }]; assert.equal(invoke(body()).statusCode, 409); assert.equal(writes, 0);
}
reset(); rows = []; assert.equal(invoke(body()).statusCode, 409); assert.equal(writes, 0);
reset(); rows.push(structuredClone(canonical)); assert.equal(invoke(body()).statusCode, 409); assert.equal(writes, 0);
reset(); assert.equal(invoke(body(), { id: 'another' }).statusCode, 403); assert.equal(writes, 0); assert.equal(reads, 0);
reset(); store.record_activity_sequence = 'forged'; assert.equal(invoke(body()).statusCode, 503); assert.equal(writes, 0);
reset(); store.record_activity_sequence = Number.MAX_SAFE_INTEGER; assert.equal(invoke(body()).statusCode, 503); assert.equal(writes, 0);
reset(); assert.equal(invoke(body(), undefined, { override: 'true' }).statusCode, 400); assert.equal(writes, 0);
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.ok(server.includes('return requireSignedContactAdmin(req, res, () => sourceContactTapHandler(req, res))'));
assert.equal((server.match(/app\.post\('\/api\/dashboard\/free-public-deal-board\/contact-workflow'/g) || []).length, 1);
let registered, identity = { ok: false };
reset();
const context = { app: { post(_path, outer, endpoint) { registered = (req, res) => outer(req, res, () => endpoint(req, res)); } },
  requireAdmin(_req, _res, next) { next(); }, signedDashboardIdentity: () => identity,
  db: { readDBStrict: () => store, writeDB(value) { writes++; store = value; } },
  dealBoardQueueService: { latestDealBoardSnapshot() { reads++; return { rows }; }, recordContactWorkflow() { throw Error('legacy outcome writer forbidden'); } },
  require(name) { assert.equal(name, './modules/records/lead-contact-tap-routes'); return { createSourceContactTapHandler }; }
};
vm.runInNewContext(server.slice(server.indexOf('function requireSignedContactAdmin('), server.indexOf('\nfunction requireAdmin(')), context);
vm.runInNewContext(server.slice(server.indexOf('const sourceContactTapHandler ='), server.indexOf("app.post('/api/dashboard/free-public-deal-board/discovery-answer'")), context);
function registeredRequest() {
  const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; } };
  registered({ body: body(), query: {} }, res); return res;
}
assert.equal(registeredRequest().code, 401); assert.equal(reads, 0); assert.equal(writes, 0);
identity = { ok: true, user: { id: 'synthetic-admin', role: 'user' } };
assert.equal(registeredRequest().code, 403); assert.equal(reads, 0); assert.equal(writes, 0);
identity = { ok: true, user: { id: 'synthetic-admin', role: 'admin' } };
assert.equal(registeredRequest().code, 200); assert.equal(writes, 1);
console.log('source-contact-tap: canonical admin/evidence/number/time, existing endpoint, private intent-only activity, quiet replay, forged/stale/ambiguous/corrupt/actor guards and zero snapshot/lead writes PASS');
