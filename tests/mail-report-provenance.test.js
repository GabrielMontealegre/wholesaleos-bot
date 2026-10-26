'use strict';
const assert = require('node:assert/strict'), http = require('node:http'), https = require('node:https');
const blocked = [], restore = [];
for (const [object, key] of [[global, 'fetch'], [http, 'get'], [http, 'request'], [https, 'get'], [https, 'request']]) {
  const old = object[key]; restore.push(() => { object[key] = old; });
  object[key] = () => { blocked.push(key); throw Error('External network forbidden'); };
}
const { sourceLabelledMail } = require('./helpers/source-labelled-mail');
const { project } = require('../dashboard/workspace/mail-layout-model');
const now = '2026-10-26T12:00:00Z';
async function main() {
  const actual = await sourceLabelledMail([{ labels: new Set(['Other', 'WOS/Reports']) }], { now });
  assert.deepEqual(actual.calls, ['metadata']);
  const source = actual.messages[0], before = JSON.stringify(source);
  const reports = rows => project(rows, { now }).categories.reports;
  assert.equal(reports([source]), 1, 'Actual adapter and annotation receipt reaches Reports');
  assert.equal(reports([{ ...source, provider_labels: { ...source.provider_labels, names: ['WOS Action'] } }]), 1);
  const invalid = [undefined, null, [], {}, { origin: 'gmail_label_ids', scope: 'message', ids: ['WOS/Reports'] },
    { origin: 'gmail_label_ids', scope: 'message', names: ['WOS/Reports'] },
    { ...source.provider_labels, origin: 'derived_workflow' }, { ...source.provider_labels, scope: 'thread' },
    { ...source.provider_labels, id: 'forged-other-message' }, { ...source.provider_labels, names: Array(1) },
    { ...source.provider_labels, names: ['WOS/Reports', 'WOS/Reports'] },
    { ...source.provider_labels, names: ['WOS/Reports', 'bad\nlabel'] },
    { ...source.provider_labels, names: ['WOS/Reports', '\u202ebad'] },
    { ...source.provider_labels, names: ['WOS/Reports', 'x'.repeat(201)] },
    { ...source.provider_labels, names: Array.from({ length: 101 }, (_, i) => i ? 'label' + i : 'WOS/Reports') },
    { ...source.provider_labels, names: ['wos/reports'] }, { ...source.provider_labels, names: [] },
    Object.create(source.provider_labels)];
  for (const provider_labels of invalid) assert.equal(reports([{ ...source, provider_labels, labels: ['WOS/Reports'] }]), 0);
  let callbacks = 0;
  const accessor = { ...source.provider_labels };
  Object.defineProperty(accessor, 'names', { enumerable: true, get() { callbacks++; throw Error('Receipt getter forbidden'); } });
  assert.equal(reports([{ ...source, provider_labels: accessor }]), 0);
  const names = [];
  Object.defineProperty(names, '0', { get() { callbacks++; throw Error('Label getter forbidden'); } }); names.length = 1;
  assert.equal(reports([{ ...source, provider_labels: { ...source.provider_labels, names } }]), 0);
  assert.equal(callbacks, 0);
  assert.equal(reports([source, { ...source, provider_labels: undefined }]), 0);
  assert.equal(reports([source, { ...source, provider_labels: { ...source.provider_labels, names: ['WOS Action'] } }]), 0, 'Conflicting duplicate receipts cannot certify Reports');
  assert.equal(reports([source, { ...source, provider_labels: { ...source.provider_labels, names: ['WOS/Reports', 'Other'] } }]), 1, 'Collection ordering is not a provenance conflict');
  assert.equal(reports([source, { ...source, subject: 'conflicting identity' }]), 0);
  assert.equal(reports([{ ...source, date: '2027-01-01T00:00:00Z' }]), 0);
  assert.equal(reports([{ ...source, source_kind: 'derived_workflow' }]), 0);
  assert.equal(reports([{ ...source, to: {} }]), 0, 'Malformed identity cannot certify a source label');
  const human = { ...source, id: 'another-message', provider_labels: null };
  assert.equal(reports([source, human]), 0, 'An unlabelled member keeps a mixed conversation out of Reports');
  assert.equal(reports((await sourceLabelledMail([{ labels: new Set(['WOS/Reports']) }], { now, supported: false })).messages), 0);
  const oldNow = Date.now;
  try { Date.now = () => { throw Error('Ambient clock forbidden'); }; assert.equal(reports([source]), 1); }
  finally { Date.now = oldNow; }
  assert.equal(JSON.stringify(source), before, 'Projection never mutates source evidence');
  assert.deepEqual(blocked, []);
  console.log('mail-report-provenance: real adapter/annotation positive, names versus opaque IDs, strict scope/source/shape/identity/copy/group negatives, no getters/clock/network/writes and original source retained passed');
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => restore.forEach(fn => fn()));
