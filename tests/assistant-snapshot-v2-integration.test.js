'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
const express = require('express');
const snapshot = require('../modules/records/assistant-snapshot');
const model = require('../dashboard/workspace/assistant-model');
const { registerAssistantSnapshotRoutes } = require('../modules/records/assistant-snapshot-routes');
const { fixture } = require('./helpers/assistant-snapshot-v2-fixture');
const { fixture: v1 } = require('./helpers/assistant-snapshot-fixture');
const now = '2026-10-31T12:00:00Z', options = { now, operatorId: 'synthetic-owner', filename: 'synthetic.json' };
const bytes = value => Buffer.from(JSON.stringify(value, null, 2));
const input = fixture(), raw = bytes(input), original = structuredClone(input);
const first = snapshot.appendSnapshot({ buyers: [{ id: 'canonical', approval: 'pending' }] }, raw, options);
const receipt = snapshot.latestSnapshot(first, options);
assert.deepEqual(receipt.snapshot, original);
assert.equal(receipt.file_sha256, crypto.createHash('sha256').update(raw).digest('hex'));
assert.equal(first.buyers[0].approval, 'pending');
assert.equal(snapshot.latestSnapshot(first, { ...options, operatorId: 'other-owner' }), null);
const view = model.project(receipt, { today: '2026-10-31' });
assert.deepEqual(view.decision_desk.counts.map(row => row.count), [1, 1, 1, 1, 1]);
assert.deepEqual(view.decision_desk.tiers.map(row => row.items[0].tier), [1, 2, 3]);
assert.equal(view.decision_desk.lower_tier_count, 2);
assert.equal(view.decision_desk.tiers[0].items[0].reported_pick, null);
assert.equal(Object.hasOwn(view.decision_desk.tiers[0].items[0], 'pick'), false, 'An imported suggestion is not an authoritative owner answer');
assert.equal(view.decision_desk.tiers[0].items[0].numbers.our_offer, 0);
assert.equal(view.decision_desk.tiers[0].items[0].numbers.ask, null);
assert.equal(view.agents[0].answered, null);
assert.equal(view.outreach_counts.follow_ups_due, 1);
assert.equal(model.project(receipt).outreach_counts.follow_ups_due, null, 'No injected day means unknown, not a fabricated zero');
assert.equal(view.agents[0].provenance.generated_at, input.generated_at);
view.agents[0].markets.push('mutated projection');
assert.deepEqual(receipt.snapshot, original, 'Projection owns copied extension data');
const legacy = snapshot.appendSnapshot(first, bytes(v1()), options);
assert.equal(snapshot.latestSnapshot(legacy, options).snapshot.version, 1);
assert.equal(legacy.assistant_snapshots[0], receipt, 'Later v1 imports retain earlier v2 receipts');
assert.equal(Object.hasOwn(model.project(snapshot.latestSnapshot(legacy, options)), 'decision_desk'), false);
const context = { window: {}, URL, payload: JSON.stringify(receipt) };
vm.runInNewContext(fs.readFileSync(require.resolve('../dashboard/workspace/assistant-v2-fields'), 'utf8') + '\n' + fs.readFileSync(require.resolve('../dashboard/workspace/assistant-model'), 'utf8') + '\nglobalThis.result=window.WOSAssistantModel.project(JSON.parse(payload),{today:"2026-10-31"});', context);
assert.deepEqual(JSON.parse(JSON.stringify(context.result.decision_desk)), model.project(receipt).decision_desk);
function invalid(change) {
  const value = fixture(); change(value);
  const before = JSON.stringify(first);
  assert.throws(() => snapshot.appendSnapshot(first, bytes(value), options), /assistant_snapshot_/);
  assert.equal(JSON.stringify(first), before, 'Invalid v2 import is whole-file and nonmutating');
}
invalid(v => { v.open_items[0].tier = 6; });
invalid(v => { v.open_items[1].id = v.open_items[0].id; });
invalid(v => { v.open_items[0].id = v.deals[0].id; });
invalid(v => { v.generated_at = '2026-11-01T00:00:00Z'; });
invalid(v => { v.deals[0].source_file = '../private.md'; });
invalid(v => { v.outreach[0].agent_id = 'unknown'; });
invalid(v => { delete v.agents; });
invalid(v => { v.unknown = true; });
const badReceipt = structuredClone(receipt); badReceipt.snapshot.open_items[0].tier = 9;
assert.throws(() => model.project(badReceipt), /assistant_sheet_invalid/);
assert.throws(() => snapshot.latestSnapshot({ assistant_snapshots: [badReceipt] }, options), /assistant_snapshot_store_invalid/);
let accessorCalls=0;
for(const corrupt of [value=>Object.defineProperty(value.snapshot,'version',{enumerable:true,get(){accessorCalls++;return 2;}}),value=>Object.defineProperty(value.snapshot.deals[0],'name',{enumerable:true,get(){accessorCalls++;return 'Synthetic getter';}})]){
 const value=structuredClone(receipt);corrupt(value);assert.throws(()=>snapshot.latestSnapshot({assistant_snapshots:[value]},options),/assistant_snapshot_store_invalid/);
}
assert.equal(accessorCalls,0,'Schema selection and base validation must not invoke stored v2 accessors');

(async () => {
  let store = {}, writes = 0;
  const app = express();
  registerAssistantSnapshotRoutes(app, { now: () => now, db: { readDBStrict: () => store, writeDB: value => { store = value; writes++; } },
    requireAdmin: (req, res, next) => { if (req.get('X-Test-Admin') !== 'synthetic') return res.sendStatus(401); req.currentUser = { id: options.operatorId }; next(); } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port, route = base + '/api/dashboard/assistant-snapshots';
  const headers = { 'X-Test-Admin': 'synthetic', Origin: base, 'Content-Type': 'application/octet-stream', 'X-WOS-Assistant-Import': '1', 'X-WOS-Assistant-Filename': 'synthetic.json' };
  try {
    assert.equal((await fetch(route)).status, 401);
    const capabilities = await (await fetch(route, { headers })).json();
    assert.deepEqual(capabilities.capabilities.supported_versions, [1, 2]);
    const malformed = fixture(); malformed.open_items[0].tier = 0;
    const denied = await fetch(route, { method: 'POST', headers, body: bytes(malformed) });
    assert.equal(denied.status, 400); assert.equal(writes, 0);
    const uploaded = await fetch(route, { method: 'POST', headers, body: raw });
    assert.equal(uploaded.status, 200); assert.equal(writes, 1);
    assert.equal((await uploaded.json()).snapshot, undefined, 'Upload does not echo private contents');
    const read = await fetch(route, { headers }); assert.equal(read.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await read.json()).latest.snapshot, original);
    assert.equal((await fetch(route, { method: 'POST', headers, body: bytes(v1()) })).status, 200);
    assert.equal(writes, 2); assert.equal(store.assistant_snapshots[1].snapshot.version, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  console.log('assistant-snapshot-v2-integration: exact-byte append/read,v1 compatibility,whole-file rejection,synthetic admin/no-store routes,browser parity,tiers/provenance and unknown-day counts passed');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
