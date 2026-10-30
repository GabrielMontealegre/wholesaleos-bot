'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { fixture } = require('./helpers/assistant-snapshot-fixture');
const { appendSnapshot, decodeSnapshot, latestSnapshot } = require('../modules/records/assistant-snapshot');
const { registerAssistantSnapshotRoutes } = require('../modules/records/assistant-snapshot-routes');
const model = require('../dashboard/workspace/assistant-model');
const now = '2026-10-26T15:00:00Z';
const options = { now, operatorId: 'synthetic-owner', filename: 'synthetic.json' };
const raw = Buffer.from(JSON.stringify(fixture()));
const original = appendSnapshot({ buyers: [], reviewed_deals: [] }, raw, options);

// A future writer fixture uses the same exact-byte hash and unchanged eight-field receipt.
const receipt = structuredClone(original.assistant_snapshots[0]);
receipt.snapshot.buyers[0].last_reply_at = '2026-10-26T14:00:00Z';
receipt.file_sha256 = crypto.createHash('sha256').update(JSON.stringify(receipt.snapshot)).digest('hex');
receipt.id = crypto.createHash('sha256').update(JSON.stringify([0, receipt.imported_at, options.operatorId, receipt.file_sha256])).digest('hex');
const futureStore = { ...original, assistant_snapshots: [receipt] };
const before = JSON.stringify(futureStore);
assert.equal(latestSnapshot(original, options).snapshot.buyers[0].last_reply_at, undefined, 'Old omitted fields stay omitted');
assert.equal(latestSnapshot(futureStore, options).snapshot.buyers[0].last_reply_at, '2026-10-26T14:00:00Z', 'Stored reply is checked against imported server time,not browser or contact time');
assert.equal(latestSnapshot(futureStore, { ...options, operatorId: 'other-owner' }), null);
assert.deepEqual(model.project(receipt).recent_replies.map(b => b.id), ['demo-buyer'], 'D064 ranks only the explicit reported reply');
assert.equal(model.project(receipt).buyers[0].last_contact, '2026-10-25');
assert.equal(model.project(receipt).buyers[0].last_reply_at, receipt.snapshot.buyers[0].last_reply_at);
assert.deepEqual(decodeSnapshot(Buffer.from(JSON.stringify(receipt.snapshot)), options).snapshot, receipt.snapshot, 'D064 writer follows the already-deployed compatible reader');
const forged = structuredClone(receipt.snapshot); forged.buyers[0].last_reply_at_origin = 'forged';
assert.throws(() => decodeSnapshot(Buffer.from(JSON.stringify(forged)), { ...options, storedReplies: true }), error => error.code === 'assistant_snapshot_fields_invalid', 'A caller option never authorizes unrelated fields');
assert.equal(appendSnapshot(futureStore, Buffer.from(JSON.stringify(receipt.snapshot)), options).assistant_snapshots.length, 2);
assert.equal(JSON.stringify(futureStore), before, 'Valid additive import is immutable and never overwrites history');
const appended = appendSnapshot(futureStore, raw, { ...options, now: '2026-10-26T15:01:00Z' });
assert.equal(appended.assistant_snapshots.length, 2);
assert.deepEqual(appended.assistant_snapshots[0], receipt, 'Old-format explicit upload preserves all prior additive reply evidence');
assert.equal(latestSnapshot(appended, { ...options, now: '2026-10-26T15:01:00Z' }).id, appended.assistant_snapshots[1].id, 'Latest import wins,not latest reply');
assert.equal(appended.buyers, original.buyers); assert.equal(appended.reviewed_deals, original.reviewed_deals);
const requestId = 'd6be163b-3d73-4d7c-82ba-c70e798c50fb';
const transport = appendSnapshot(futureStore, raw, { ...options, requestId });
assert.equal(appendSnapshot(transport, raw, { ...options, requestId }), transport, 'Existing transport replay remains idempotent with additive stored history');
assert.deepEqual(transport.assistant_snapshots[0], receipt);

function invalid(change) {
  const store = structuredClone(futureStore); change(store);
  assert.throws(() => latestSnapshot(store, options), error => error.status === 503 && error.code === 'assistant_snapshot_store_invalid' && !error.message.includes('PRIVATE_SENTINEL'));
  assert.throws(() => appendSnapshot(store, raw, options), error => error.status === 503);
}
for (const value of [null, '', 0, true, {}, [], '2026-02-30T12:00:00Z', '2026-10-26', '2026-10-26T15:00:00.001Z', 'PRIVATE_SENTINEL']) invalid(s => { s.assistant_snapshots[0].snapshot.buyers[0].last_reply_at = value; });
invalid(s => { s.assistant_snapshots[0].snapshot.buyers[0].last_reply = '2026-10-26T12:00:00Z'; });
invalid(s => { s.assistant_snapshots[0].snapshot.buyers[0].last_reply_at_origin = 'forged'; });
invalid(s => { const buyer = s.assistant_snapshots[0].snapshot.buyers[0]; delete buyer.last_reply_at; Object.setPrototypeOf(buyer, { last_reply_at: '2026-10-26T12:00:00Z' }); });
invalid(s => { s.assistant_snapshots[0].source_kind = 'canonical_buyer'; });
invalid(s => { s.assistant_snapshots[0].imported_at = '2026-10-26T13:59:59Z'; });
invalid(s => { s.assistant_snapshots.push(s.assistant_snapshots[0]); });
invalid(s => { s.assistant_snapshots[0].snapshot.buyers = Array(1); });
let getterCalls = 0;
invalid(s => { Object.defineProperty(s.assistant_snapshots[0].snapshot.buyers[0], 'last_reply_at', { enumerable: true, get() { getterCalls++; throw Error('PRIVATE_SENTINEL'); } }); });
assert.equal(getterCalls, 0, 'New timestamp accessors are rejected without invoking them');
const oldNow = Date.now, oldFetch = global.fetch;
try { Date.now = global.fetch = () => { throw Error('Ambient side effect forbidden'); }; assert.equal(latestSnapshot(futureStore, options).id, receipt.id); }
finally { Date.now = oldNow; global.fetch = oldFetch; }
assert.equal(JSON.stringify(futureStore), before);

async function routeProof() {
  let actor = options.operatorId, admin = true, writes = 0;
  const app = express();
  registerAssistantSnapshotRoutes(app, { db: { readDBStrict: () => futureStore, writeDB: () => { writes++; throw Error('No writes'); } }, now: () => now,
    requireAdmin(req, res, next) { if (!admin) return res.status(401).json({ code: 'SESSION_REQUIRED' }); req.currentUser = { id: actor }; next(); } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/dashboard/assistant-snapshots';
    let response = await fetch(url); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    let data = await response.json(); assert.equal(data.latest.snapshot.buyers[0].last_reply_at, receipt.snapshot.buyers[0].last_reply_at); assert.equal(Object.keys(data.latest).length, 8);
    actor = 'other-owner'; response = await fetch(url); data = await response.json(); assert.equal(data.latest, null);
    admin = false; response = await fetch(url); assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(writes, 0);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
routeProof().then(() => console.log('assistant-reply-reader: old/additive stored receipts,authorized D064 writer,server-clock negatives,accessor purity,history preservation and actual private route ownership passed')).catch(error => { console.error(error.stack); process.exitCode = 1; });
