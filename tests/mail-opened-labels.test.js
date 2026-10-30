'use strict';
const assert = require('node:assert/strict');
const layout = require('../dashboard/workspace/mail-layout-model');
const now = '2026-10-30T00:00:00Z';
const receipt = names => ({ origin: 'imap_gmail_labels', scope: 'message', names });
const row = (patch = {}) => ({ id: 'synthetic-message', source_kind: 'connected_mailbox', date: '2026-10-29T00:00:00Z',
  from: 'sender@example.test', subject: 'Synthetic message', provider_labels: receipt(['WOS/Buyers', 'Property update']), ...patch });
const metadata = row(), body = row({ body: 'Synthetic source body' });
assert.equal(typeof layout.openedLabels, 'function', 'Opened messages need a source-bound label projection');
const labels = (m = metadata, b = body, copies = [m]) => layout.openedLabels(m, b, copies, { now });
assert.deepEqual(labels(), ['Property update', 'WOS/Buyers']);
assert.deepEqual(labels(metadata, row({ provider_labels: receipt(['Property update', 'WOS/Buyers']) })), labels());
assert.deepEqual(labels(row({ provider_labels: receipt([]) }), row({ provider_labels: receipt([]) })), []);
for (const patch of [{ id: 'other' }, { source_kind: 'derived_workflow' }, { subject: 'different' }, { date: '2027-01-01T00:00:00Z' },
  { provider_labels: null }, { provider_labels: receipt(['different']) }, { provider_labels: { origin: 'gmail_label_ids', scope: 'message', ids: ['Label_123'] } },
  { provider_labels: { origin: 'imap_gmail_labels', scope: 'folder', names: ['WOS/Buyers'] } },
  { provider_labels: { ...receipt(['WOS/Buyers']), extra: true } }, { provider_labels: receipt(Array(1)) },
  { provider_labels: receipt(['bad\nname']) }, { provider_labels: receipt(['duplicate', 'duplicate']) },
  { provider_labels: receipt(Array.from({ length: 101 }, (_, i) => 'Label' + i)) }]) assert.equal(labels(metadata, row(patch)), null);
assert.equal(labels(row({ provider_labels: null, labels: ['WOS/Buyers'] }), body), null);
assert.equal(labels(metadata, body, []), null);
assert.equal(labels(metadata, body, [metadata, row({ provider_labels: receipt(['different']) })]), null);
assert.equal(labels(metadata, body, [metadata, row({ subject: 'conflicting' })]), null);
assert.deepEqual(labels(metadata, body, [metadata, row(), row({ id: 'other', provider_labels: receipt(['Unrelated']) })]), labels());
assert.equal(labels(metadata, body, Array(1)), null);
let reads = 0;
const getter = row();
Object.defineProperty(getter, 'provider_labels', { get() { reads++; throw Error('Accessor must not run'); } });
assert.equal(labels(metadata, getter), null);
assert.equal(reads, 0);
const inherited = Object.create(receipt(['WOS/Buyers']));
assert.equal(labels(metadata, row({ provider_labels: inherited })), null);
const snapshot = JSON.stringify([metadata, body]);
const out = labels(); out.push('Not source evidence');
assert.equal(JSON.stringify([metadata, body]), snapshot);
assert.equal(layout.project([metadata], { now }).rows[0].role, '', 'Provider labels never establish a person role');
const clock = Date.now, fetch = global.fetch;
try {
  Date.now = global.fetch = () => { throw Error('Ambient effect forbidden'); };
  assert.deepEqual(labels(), ['Property update', 'WOS/Buyers']);
} finally { Date.now = clock; global.fetch = fetch; }
console.log('mail-opened-labels: exact per-message names, matching metadata/body/copies, unknown/opaque/forged/stale/conflicting/accessor negatives and purity passed');
