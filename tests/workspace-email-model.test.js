'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let effects = 0;
const deny = () => { effects++; throw Error('Side effect'); };
class Clock extends Date { constructor(...args) { if (!args.length) deny(); super(...args); } static now() { return deny(); } }
const context = { module: { exports: {} }, Date: Clock, fetch: deny, require: deny,
  localStorage: { setItem: deny }, setTimeout: deny };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dashboard/workspace/email-model.js'), 'utf8'), context);
const model = context.module.exports;
const now = '2026-10-20T18:00:00Z';
const message = (patch = {}) => ({ id: 'synthetic-1', source_kind: 'connected_mailbox', from: 'Synthetic sender <human@example.test>',
  sender_name: 'Synthetic person', subject: 'Recorded subject', date: '2026-10-20T17:00:00Z', thread_key: 'a'.repeat(64), ...patch });
function project(rows) { return model.list(rows, { now }); }
for (const from of ['Redfin <noreply@redfin.com>', 'alerts@updates.zillow.com', 'notifications@realtor.com']) {
  assert.equal(model.category(message({ from })).kind, 'alerts');
}
for (const from of ['agent@redfin.com', 'human@example.test', 'alerts@redfin.com.evil.test', 'alerts@fake-redfin.com',
  'noreply@bank.example.test', 'Redfin <human@example.test>', 'noreply@redfin.com\r\nBcc: hidden@example.test', 'a@redfin.com, alerts@redfin.com']) {
  assert.equal(model.category(message({ from })).kind, 'people');
}
assert.equal(model.category(message()).person_verified, false);
assert.equal(model.category(message({ source_kind: 'ai_guess', from: 'alerts@redfin.com' })).kind, 'people');
assert.equal(model.sender(message({ sender_name: '', from: 'jane.smith@example.test' })), 'Sender name not recorded');
assert.equal(model.sender(message({ sender_name: '', direction: 'out' })), 'You');
assert.equal(model.role(message({ conversation: { role: 'buyer', role_source_kind: 'operator_input' }, link_status: 'ambiguous' })), '');
assert.equal(model.role(message({ conversation: { role: 'buyer', role_source_kind: 'ai_guess' }, link_status: 'linked' })), '');
assert.equal(model.role(message({ conversation: { role: 'buyer', role_source_kind: 'operator_input' }, link_status: 'linked' }), { now }), '');
assert.equal(model.role(message({ conversation: { role: 'buyer', role_source_kind: 'operator_input', role_recorded_at: '2026-10-20T17:00:00Z' }, link_status: 'linked' }), { now }), 'buyer');
assert.equal(model.role(message({ conversation: { role: 'buyer', role_source_kind: 'operator_input', role_recorded_at: '2026-10-20T19:00:00Z' }, link_status: 'linked' }), { now }), '');
const mixed = project([message({ from: 'alerts@redfin.com' }), message({ id: 'synthetic-2', date: '2026-10-20T17:30:00Z' })]);
assert.equal(mixed.threads.length, 1);
assert.equal(mixed.threads[0].category, 'people', 'A mixed thread cannot hide the human reply in Alerts');
assert.equal(mixed.threads[0].messages.length, 2);
assert.equal(mixed.threads[0].latest.id, 'synthetic-2');
const isolated = project([message({ thread_key: 'forged' }), message({ id: 'synthetic-2', thread_key: 'forged' })]);
assert.equal(isolated.threads.length, 2, 'Invalid keys cannot join unrelated messages');
const original = message(), frozen = JSON.stringify(original);
assert.equal(project([original, original]).duplicate_count, 1);
assert.equal(project([message({ read: true }), message({ unread: true })]).threads[0].unread, true);
for (const patch of [{}, { read: null, unread: null }, { read: 'false', unread: 'true' }, { read: true, unread: true }, { read: false, unread: false }]) {
  assert.equal(project([message(patch)]).threads[0].unread, null, 'Missing, malformed or contradictory state stays unknown');
}
assert.equal(project([message({ read: true, unread: false })]).threads[0].unread, false);
assert.equal(project([message({ read: false, unread: true })]).threads[0].unread, true);
assert.equal(project([message({ read: true }), message()]).threads[0].unread, null, 'Unknown duplicate cannot certify read');
assert.equal(project([message({ read: true }), message({ id: 'synthetic-2' })]).threads[0].unread, null, 'Read plus unknown thread member remains unknown');
assert.equal(project([message({ unread: true }), message({ id: 'synthetic-2' })]).threads[0].unread, true, 'One confirmed unread member is enough');
assert.equal(JSON.stringify(original), frozen);
const conflict = project([original, message({ subject: 'Conflicting source' })]);
assert.equal(conflict.threads.length, 0);
assert.equal(conflict.unavailable.length, 2);
assert(conflict.unavailable.every(row => row.reason === 'conflicting_message_reference'));
for (const patch of [{ date: '2026-10-20T19:00:00Z' }, { date: '2026-02-30T12:00:00Z' }, { date: '' }, { source_kind: 'imported_report' }, { id: '' }]) {
  const value = project([message(patch)]);
  assert.equal(value.threads.length, 0);
  assert.equal(value.unavailable.length, 1);
}
assert.throws(() => model.list([], {}), /clock/);
assert.throws(() => project(Array(51).fill(original)), /list/);
assert.equal(effects, 0, 'Projection cannot fetch, read the current clock, write storage or import modules');
console.log('workspace-email-model: source-only thread grouping, conservative listing alerts, mixed human replies retained, no identity/role inference, conflicting/stale/forged/missing inputs and purity passed');
