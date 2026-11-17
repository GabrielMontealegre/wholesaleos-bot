'use strict';
const assert = require('node:assert/strict');
const { appendBatch, readBatches } = require('../modules/records/assistant-decision-batches');
const { appendSnapshot } = require('../modules/records/assistant-snapshot');
const { fixture } = require('./helpers/assistant-snapshot-v2-fixture');
const options = { operatorId: 'synthetic-owner', now: '2026-10-31T12:00:00Z', filename: 'synthetic.json' };
const initial = appendSnapshot({ buyers: [{ id: 'canonical' }], assistant_decision_answers: [] }, Buffer.from(JSON.stringify(fixture())), options);
const request = n => String(n).padStart(8, '0') + '-1111-4111-8111-111111111111';
const input = { request_id: request(1), round: initial.assistant_snapshots[0].id, revision: 0,
  submitted_at: options.now, overall_note: '', choices: [{ id: 'decision-0', choice: 'A', choice_label: 'Ask', note: '', from_voice: false }] };
const before = structuredClone(initial), first = appendBatch(initial, input, options);
assert.deepEqual(initial, before);
assert.equal(first.buyers, initial.buyers);
assert.equal(first.assistant_decision_answers, initial.assistant_decision_answers);
assert.equal(first.assistant_snapshots, initial.assistant_snapshots);
assert.equal(appendBatch(first, input, options), first);
const publicRows = readBatches(first, options);
assert.equal(publicRows[0].revision, 1);
assert.equal(publicRows[0].batch.revision, 0);
assert(!Object.hasOwn(publicRows[0], 'operator_id'));
publicRows[0].batch.choices[0].note = 'Changed detached result';
assert.equal(first.assistant_decision_batches[0].input.choices[0].note, '');
input.choices[0].note = 'Changed caller input';
assert.equal(first.assistant_decision_batches[0].input.choices[0].note, '');
input.choices[0].note = '';
const failure = (value, state = initial, config = options) => assert.throws(() => appendBatch(state, value, config), /assistant_batch_/);
for (const patch of [{ request_id: 'bad' }, { round: '0'.repeat(64) }, { revision: -1 }, { revision: 1.1 },
  { submitted_at: '2026-02-30T12:00:00Z' }, { submitted_at: '2026-10-31T12:01:00Z' }, { submitted_at: '2026-10-31T11:59:59Z' },
  { submitted_at: '10/31/2026' }, { overall_note: 'x'.repeat(4001) }, { overall_note: '\u202e' }, { choices: [] },
  { choices: Array(1) }, { choices: Array(101).fill(input.choices[0]) }, { extra: true }]) failure({ ...input, ...patch });
for (const patch of [{ id: 'missing' }, { choice: 'SEND' }, { choice_label: 'Forged' }, { from_voice: true },
  { from_voice: 'false' }, { note: 'x'.repeat(2001) }, { note: '\u0000' }, { choice: null, choice_label: null }, { extra: true }]) {
  failure({ ...input, choices: [{ ...input.choices[0], ...patch }] });
}
failure({ ...input, choices: [input.choices[0], input.choices[0]] });
failure({ ...input, overall_note: 'changed' }, first);
failure({ ...input, request_id: request(2) }, first);
assert.throws(() => appendBatch(first, { ...input, request_id: request(2) }, options), error => error.status === 409 && error.code === 'assistant_batch_revision_conflict');
failure(input, initial, { ...options, operatorId: 'other-owner' });
failure(input, initial, { ...options, operatorId: '' });
const noteOnly = { ...input, revision: 1, request_id: request(2), choices: [{ ...input.choices[0], choice: null, choice_label: null, note: 'Synthetic note only' }] };
const second = appendBatch(first, noteOnly, options);
assert.equal(readBatches(second, options).length, 2);
const overallOnly = { ...input, revision: 2, request_id: request(3), choices: [], overall_note: 'Synthetic overall note' };
assert.equal(readBatches(appendBatch(second, overallOnly, options), options).length, 3);
assert.deepEqual(readBatches(second, { ...options, operatorId: 'other-owner' }), []);
assert.throws(() => readBatches(second, { ...options, limit: 101 }), /query_invalid/);
const nextOptions = { ...options, now: '2026-10-31T12:01:00Z' };
const newer = appendSnapshot(second, Buffer.from(JSON.stringify(fixture())), nextOptions);
assert.equal(appendBatch(newer, input, nextOptions), newer, 'Old identical UUID recovery is readback only');
failure({ ...input, request_id: request(4), revision: 2 }, newer, nextOptions);
const another = appendSnapshot(second, Buffer.from(JSON.stringify(fixture())), { ...options, operatorId: 'other-owner' });
const otherInput = { ...input, round: another.assistant_snapshots.at(-1).id };
const isolated = appendBatch(another, otherInput, { ...options, operatorId: 'other-owner' });
assert.equal(readBatches(isolated, options).length, 2);
assert.equal(readBatches(isolated, { ...options, operatorId: 'other-owner' }).length, 1);
let calls = 0;
for (const target of ['root', 'choice', 'array']) {
  const hostile = structuredClone(input);
  const object = target === 'root' ? hostile : target === 'choice' ? hostile.choices[0] : hostile.choices;
  const key = target === 'root' ? 'round' : target === 'choice' ? 'note' : '0';
  Object.defineProperty(object, key, { enumerable: true, get() { calls++; throw Error('getter'); } });
  failure(hostile);
}
failure(Object.assign(Object.create({ inherited: true }), input));
failure({ ...input, choices: [Object.assign(Object.create({ inherited: true }), input.choices[0])] });
assert.equal(calls, 0);
const hostileStore = structuredClone(first);
Object.defineProperty(hostileStore.assistant_decision_batches[0], 'input', { enumerable: true, get() { calls++; throw Error('getter'); } });
assert.throws(() => readBatches(hostileStore, options), error => error.status === 503);
assert.equal(calls, 0);
const duplicateStore = { ...first, assistant_decision_batches: first.assistant_decision_batches.concat(first.assistant_decision_batches) };
assert.throws(() => readBatches(duplicateStore, options), error => error.status === 503);
const nonChronological = structuredClone(second);
nonChronological.assistant_decision_batches[1].accepted_at = '2026-10-31T11:59:59Z';
assert.throws(() => readBatches(nonChronological, options), error => error.status === 503);
for (const mutate of [row => { row.revision = 9; }, row => { row.accepted_at = '2027-01-01T00:00:00Z'; },
  row => { row.input.choices[0].choice_label = 'Forged'; }, row => { row.input.revision = 2; }]) {
  const bad = structuredClone(first); mutate(bad.assistant_decision_batches[0]);
  assert.throws(() => readBatches(bad, options), error => error.status === 503);
}
const atomicBefore = structuredClone(initial);
failure({ ...input, choices: [input.choices[0], { ...input.choices[0], id: 'missing' }] });
assert.deepEqual(initial, atomicBefore);
const fs = require('node:fs'), http = require('node:http'), https = require('node:https');
const restore = [], effects = [];
try {
  for (const [object, names] of [[fs, ['readFileSync', 'writeFileSync']], [http, ['request', 'get']], [https, ['request', 'get']], [Date, ['now']], [globalThis, ['fetch']]]) {
    for (const name of names) { const original = object[name]; restore.push(() => { object[name] = original; }); object[name] = () => { effects.push(name); throw Error('effect'); }; }
  }
  appendBatch(initial, input, options); readBatches(first, options);
  assert.deepEqual(effects, []);
} finally { restore.reverse().forEach(fn => fn()); }
console.log('assistant-decision-batches: synthetic atomic append/read, identity, revision, provenance and hostile-input checks passed');
