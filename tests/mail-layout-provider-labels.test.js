'use strict';
const assert = require('node:assert/strict');
const { project } = require('../dashboard/workspace/mail-layout-model');
const now = '2026-10-30T00:00:00Z';
const row = (id = 'a', extra = {}) => ({ id, source_kind: 'connected_mailbox', from: 'sender@example.test',
  subject: 'Synthetic update', date: '2026-10-29T00:00:00Z', ...extra });
const receipt = names => ({ origin: 'imap_gmail_labels', scope: 'message', names });
const reports = messages => project(messages, { now, category: 'reports' }).rows.length;

for (const name of ['WOS/Reports', 'WOS Action']) {
  assert.equal(reports([row('a', { provider_labels: receipt([name]) })]), 1);
}
assert.equal(reports([row('a', { labels: ['WOS/Reports'] })]), 0, 'unproven legacy labels are not provider evidence');
assert.equal(reports([row('a', { subject: 'WOS/Reports', from: 'WOS Action <sender@example.test>' })]), 0);
for (const value of [null, {}, { origin: 'gmail_label_ids', scope: 'message', ids: ['WOS_Action'] },
  { origin: 'gmail_label_ids', scope: 'message', ids: ['Label_123'], names: ['WOS/Reports'] },
  { origin: 'imap_gmail_labels', scope: 'folder', names: ['WOS/Reports'] },
  { origin: 'operator_input', scope: 'message', names: ['WOS/Reports'] },
  { ...receipt(['WOS/Reports']), unexpected: true },
  receipt(['wos/reports']), receipt(['WOS/Reports suffix']), receipt(['WOS/Reports', 'bad\nlabel']),
  receipt(['WOS/Reports', 'WOS/Reports']), receipt(Array(1)), receipt(['WOS/Reports', null]),
  receipt(Array.from({ length: 101 }, (_, i) => 'Label' + i))]) {
  assert.equal(reports([row('a', { provider_labels: value, labels: ['WOS/Reports'] })]), 0);
}
const inherited = Object.create(receipt(['WOS/Reports']));
assert.equal(reports([row('a', { provider_labels: inherited })]), 0);
let reads = 0;
const accessor = receipt(['WOS/Reports']);
Object.defineProperty(accessor, 'names', { enumerable: true, get() { reads++; return ['WOS/Reports']; } });
assert.equal(reports([row('a', { provider_labels: accessor })]), 0);
assert.equal(reads, 0);
const sparse = []; sparse.length = 1;
Object.defineProperty(sparse, '0', { get() { reads++; return 'WOS/Reports'; } });
assert.equal(reports([row('a', { provider_labels: receipt(sparse) })]), 0);
assert.equal(reads, 0);

const good = row('a', { provider_labels: receipt(['WOS/Reports', 'Other']) });
assert.equal(reports([good, row('a', { provider_labels: receipt(['Other', 'WOS/Reports']) })]), 1);
assert.equal(reports([good, row('a', { provider_labels: receipt(['WOS Action']) })]), 0, 'conflicting copies cannot establish report provenance');
assert.equal(reports([good, row('a')]), 0);
const thread = 'a'.repeat(64);
assert.equal(reports([row('a', { thread_key: thread, provider_labels: receipt(['WOS/Reports']) }),
  row('b', { thread_key: thread })]), 0, 'a report label cannot classify an unlabeled thread member');
assert.equal(reports([row('a', { source_kind: 'imported_report', provider_labels: receipt(['WOS/Reports']) })]), 0);
const before = JSON.stringify(good);
const result = project([good], { now, category: 'reports' });
assert.equal(result.rows[0].role, '', 'provider labels never establish a person role');
assert.equal(result.folder_total, null);
assert.equal(result.can_load_older, false);
assert.equal(JSON.stringify(good), before);
console.log('mail-layout-provider-labels: exact per-message receipts, opaque REST/forged/duplicate/mixed negatives and no role/count authority passed');
