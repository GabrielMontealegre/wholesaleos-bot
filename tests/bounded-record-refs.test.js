'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const records = require('../modules/records/record-activity');
const context = { now: '2026-10-08T12:00:00Z', operatorId: 'fixture-admin' };
const seed = {
  leads: Array.from({ length: 12039 }, (_, i) => ({ id: 'legacy-' + i, state: 'IL', approval: 'pending' })),
  buyers: [{ id: 'b1', approval: 'approved', phone: 'private-fixture', reference_id: 'BUY-0038' }, { id: 'b2' }],
  reviewed_deals: [{ id: 'd1', state: 'FL', status: 'found', approval: 'pending' }],
  record_matches: [{ id: 'm1', deal_id: 'd1', buyer_id: 'b1' }],
  activities: [{ activity_id: 'historical', type: 'reply_received', note: 'Retain this' }],
  record_reference_sequences: { 'WOS-TX': 1040 }
};
const before = JSON.stringify(seed);
const result = records.assignMissing(seed, context);
assert.deepStrictEqual(result.counts, { buyer: 2, deal: 1, match: 1 });
assert.strictEqual(result.count, 4);
assert.strictEqual(result.store.leads, seed.leads, 'bulk assignment must not touch legacy leads');
assert.ok(result.store.leads.every(row => !row.record_ref));
assert.strictEqual(result.store.buyers[0].record_ref, 'BUY-0038');
assert.strictEqual(result.store.buyers[1].record_ref, 'BUY-0039');
assert.strictEqual(result.store.reviewed_deals[0].record_ref, 'WOS-FL-1031');
assert.strictEqual(result.store.record_reference_sequences['WOS-TX'], 1040, 'never lower an existing counter');
for (const [prefix, floor] of Object.entries(result.store.record_reference_sequences)) if (prefix.startsWith('WOS-')) assert.ok(floor >= 1030);
assert.strictEqual(records.sequenceFloorStatus(result.store).reserved, records.sequenceFloorStatus(result.store).namespaces);
assert.strictEqual(records.sequenceFloorStatus(result.store).minimum, 1030);
assert.strictEqual(records.sequenceFloorStatus({}).minimum, null);
for (const collection of ['buyers', 'reviewed_deals', 'record_matches']) {
  assert.deepStrictEqual(result.store[collection].map(({ record_ref, ...row }) => row), seed[collection]);
}
assert.deepStrictEqual(result.store.activities.slice(0, seed.activities.length), seed.activities);
assert.ok(result.store.activities.slice(seed.activities.length).every(row => row.type === 'reference_assigned'));
assert.strictEqual(JSON.stringify(seed), before);
records.assertBoundedReferenceChanges(seed, result.store);
assert.throws(() => records.assertBoundedReferenceChanges(seed, { ...result.store, leads: [] }), /preservation_failed/);
assert.throws(() => records.assertBoundedReferenceChanges(seed, { ...result.store, buyers: result.store.buyers.map(row => ({ ...row, approval: 'rejected' })) }), /preservation_failed/);
assert.throws(() => records.assertBoundedReferenceChanges(seed, { ...result.store, activities: [] }), /preservation_failed/);
assert.strictEqual(records.assignMissing(result.store, context).store, result.store, 'repeat is a no-op');
assert.throws(() => records.assignMissing(seed, context, ['bogus']), /kinds_invalid/);
assert.throws(() => records.assignMissing(seed, context, ['buyer', 'buyer']), /kinds_invalid/);
assert.throws(() => records.assignMissing({ record_reference_sequences: { BUY: 'invalid' } }, context), /sequence_invalid/);
const buyerOnly = records.assignMissing(seed, context, ['buyer']);
assert.strictEqual(buyerOnly.store.reviewed_deals, seed.reviewed_deals);
assert.strictEqual(buyerOnly.store.record_matches, seed.record_matches);
for (const [state, reserved] of [['FL', 'WOS-FL-1005'], ['NC', 'WOS-NC-1011'], ['TX', 'WOS-TX-1001']]) {
  let store = { reviewed_deals: [{ id: 'reserved', state }, { id: 'next', state }] };
  store = records.assign(store, 'deal', 'reserved', reserved);
  store = records.assign(store, 'deal', 'next');
  assert.strictEqual(store.reviewed_deals[0].record_ref, reserved);
  assert.strictEqual(store.reviewed_deals[1].record_ref, 'WOS-' + state + '-1031');
}
assert.throws(() => records.assignMissing({ buyers: [{ id: 'a', record_ref: 'BUY-0001' }, { id: 'b', record_ref: 'BUY-0001' }] }, context), /conflict/);
assert.throws(() => records.assignMissing({ reviewed_deals: [{ id: 'full', state: 'FL' }], record_reference_sequences: { 'WOS-FL': 9999 } }, context), /exhausted/);
const lazy = records.assignOnAction(seed, 'lead', 'legacy-7', context);
assert.strictEqual(lazy.leads.filter(row => row.record_ref).length, 1);
assert.strictEqual(lazy.leads[7].record_ref, 'WOS-IL-1031');
assert.strictEqual(lazy.activities.at(-1).type, 'reference_assigned');
assert.strictEqual(records.assignOnAction(lazy, 'lead', 'legacy-7', context), lazy);
assert.throws(() => records.assignOnAction(seed, 'lead', 'missing', context), /record_missing/);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-reference-backup-'));
process.env.DB_PATH = path.join(directory, 'db.json');
const bytes = JSON.stringify({ leads: [], buyers: [], activities: [], private_marker: 'fixture-only' }, null, 2);
fs.writeFileSync(process.env.DB_PATH, bytes);
const db = require('../db');
try {
  const info = db.backupReferenceStore(db.readDBStrict());
  const backupPath = path.join(directory, 'private-record-backups', info.id);
  assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), bytes);
  assert.strictEqual(fs.readFileSync(process.env.DB_PATH, 'utf8'), bytes, 'backup alone never mutates the database');
  assert.ok(!JSON.stringify(info).includes('fixture-only'));
  assert.ok(!JSON.stringify(info).includes(directory));
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(backupPath).mode & 0o777, 0o600);
    assert.strictEqual(fs.statSync(path.dirname(backupPath)).mode & 0o777, 0o700);
  }
  assert.throws(() => db.backupReferenceStore({}), /source_changed/);
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
console.log('Bounded references: non-lead default, preserved facts/history, all-state floor, reserved imports, lazy single-lead action and private backup passed.');
