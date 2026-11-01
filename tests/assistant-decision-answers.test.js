'use strict';
const assert = require('node:assert/strict');
const { appendAnswer, readAnswers } = require('../modules/records/assistant-decision-answers');
const { appendSnapshot } = require('../modules/records/assistant-snapshot');
const { fixture } = require('./helpers/assistant-snapshot-v2-fixture');
const now = '2026-10-31T12:00:00Z', options = { now, operatorId: 'synthetic-owner', filename: 'synthetic.json' };
const initial = appendSnapshot({ buyers: [{ id: 'canonical', approval: 'pending' }] }, Buffer.from(JSON.stringify(fixture())), options);
const input = { snapshot_id: initial.assistant_snapshots[0].id, item_id: 'decision-0', choice: 'A', note: '', request_id: '11111111-1111-4111-8111-111111111111' };
const before = JSON.stringify(initial), first = appendAnswer(initial, input, options);
assert.equal(JSON.stringify(initial), before);
assert.equal(first.assistant_decision_answers.length, 1);
assert.equal(first.buyers, initial.buyers);
assert.equal(first.assistant_snapshots, initial.assistant_snapshots);
assert.equal(first.assistant_snapshots[0].snapshot.open_items[0].pick, null, 'Owner answers never rewrite the assistant file');
assert.equal(appendAnswer(first, input, options), first, 'Identical explicit request is idempotent');
assert.throws(() => appendAnswer(first, { ...input, choice: 'B' }, options), e => e.status === 409);
const second = appendAnswer(first, { ...input, choice: 'C', note: 'Synthetic clarification.', request_id: '22222222-2222-4222-8222-222222222222' }, options);
assert.equal(second.assistant_decision_answers.length, 2);
assert.deepEqual(second.assistant_decision_answers[0], first.assistant_decision_answers[0]);
assert.deepEqual(readAnswers(second, options).items.map(row => row.choice), ['A', 'C']);
assert.equal(readAnswers(second, { ...options, operatorId: 'another-owner' }).items.length, 0);
const page = readAnswers(second, { ...options, limit: 1 });
assert.equal(page.items.length, 1); assert.equal(page.next_after, page.items[0].id);
assert.equal(readAnswers(second, { ...options, after: page.next_after, limit: 1 }).items[0].choice, 'C');
assert.throws(() => readAnswers(second, { ...options, limit: 1001 }), /query_invalid/);
assert.throws(() => readAnswers(second, { ...options, operatorId: 'another-owner', after: page.next_after }), /query_invalid/);
for (const patch of [{ choice: 'SEND' }, { item_id: 'missing' }, { snapshot_id: '0'.repeat(64) }, { request_id: 'forged' }, { note: 'x'.repeat(2001) }, { answered_at: now }, { operator_id: 'another-owner' }]) {
  assert.throws(() => appendAnswer(initial, { ...input, ...patch }, options), /assistant_answer_/);
}
assert.throws(() => appendAnswer(initial, input, { ...options, operatorId: 'another-owner' }), e => e.status === 409);
const newer = appendSnapshot(first, Buffer.from(JSON.stringify(fixture())), { ...options, now: '2026-10-31T12:01:00Z' });
assert.equal(appendAnswer(newer, input, { ...options, now: '2026-10-31T12:02:00Z' }), newer, 'Old identical replay is readback only');
assert.throws(() => appendAnswer(newer, { ...input, request_id: '33333333-3333-4333-8333-333333333333' }, { ...options, now: '2026-10-31T12:02:00Z' }), e => e.status === 409);
for (const mutate of [row => { row.choice = 'SEND'; }, row => { row.answered_at = '2026-11-01T00:00:00Z'; }, row => { row.snapshot_id = '0'.repeat(64); }]) {
  const corrupt = structuredClone(first); mutate(corrupt.assistant_decision_answers[0]);
  assert.throws(() => readAnswers(corrupt, options), e => e.status === 503);
}
assert.throws(() => readAnswers({ ...first, assistant_decision_answers: Array(1) }, options), /store_invalid/);
const otherSnapshot = appendSnapshot(second, Buffer.from(JSON.stringify(fixture())), { ...options, operatorId: 'another-owner' });
const otherAnswers = appendAnswer(otherSnapshot, { ...input, snapshot_id: otherSnapshot.assistant_snapshots.at(-1).id }, { ...options, operatorId: 'another-owner' });
assert.equal(readAnswers(otherAnswers, options).items.length, 2);
assert.equal(readAnswers(otherAnswers, { ...options, operatorId: 'another-owner' }).items.length, 1);
assert.notEqual(otherAnswers.assistant_decision_answers.at(-1).id, first.assistant_decision_answers[0].id, 'Request IDs are actor scoped');
let accessorCalls = 0;
const accessorStore = structuredClone(first);
Object.defineProperty(accessorStore.assistant_decision_answers[0], 'note', { enumerable: true, get() { accessorCalls++; return 'hidden'; } });
assert.throws(() => readAnswers(accessorStore, options), /store_invalid/);
assert.equal(accessorCalls, 0);
const fs = require('node:fs'), http = require('node:http'), https = require('node:https'), restore = [], effects = [];
try {
  for (const [object, names] of [[fs, ['readFileSync', 'writeFileSync']], [http, ['request', 'get']], [https, ['request', 'get']], [Date, ['now']]]) {
    for (const name of names) { const original = object[name]; restore.push(() => { object[name] = original; }); object[name] = () => { effects.push(name); throw Error('forbidden_effect'); }; }
  }
  assert.doesNotThrow(() => appendAnswer(initial, input, options));
  assert.doesNotThrow(() => readAnswers(first, options));
  assert.deepEqual(effects, []);
} finally { restore.reverse().forEach(fn => fn()); }
console.log('assistant-decision-answers: append-only source-bound owner answers,private pagination,idempotence/stale/forged/future/corrupt rejection and no business mutation passed');
