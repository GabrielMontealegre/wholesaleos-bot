'use strict';
const assert = require('node:assert/strict');
const { project } = require('../dashboard/workspace/mail-layout-model');
const now = '2026-10-25T00:00:00Z';
const role = value => ({ role: value, role_source_kind: 'operator_input', role_recorded_at: '2026-10-20T00:00:00Z' });
const row = (id, extra = {}) => ({ id, thread_key: id.repeat(64), date: '2026-10-24T12:00:00Z', source_kind: 'connected_mailbox',
  sender_name: 'Synthetic person', from: 'Synthetic person <person@example.test>', subject: 'Recorded property discussion', snippet: 'Source snippet', ...extra });
const messages = [row('a'), row('b', { conversation: role('buyer'), link_status: 'linked' }),
  row('c', { conversation: role('seller'), link_status: 'linked' }), row('d', { conversation: role('agent'), link_status: 'linked' }),
  row('e', { from: 'alerts@redfin.com' }), row('f', { labels: ['WOS/Reports'] }),
  row('g', { subject: 'WOS report from a human', from: 'human@redfin.com' })];
const before = JSON.stringify(messages);
const view = project(messages, { now });
assert.deepEqual(view.categories, { primary: 2, buyers: 1, sellers_agents: 2, alerts: 1, reports: 1 });
assert.equal(view.counts_scope, 'loaded_threads');
assert.equal(view.folder_total, null);
assert.equal(view.can_load_older, false);
assert.deepEqual(view.range, { start: 1, end: 2, total: 2, scope: 'loaded_threads' });
assert.equal(project(messages, { now, category: 'buyers' }).rows[0].role, 'buyer');
assert.equal(project(messages, { now, role: 'buyer', category: 'buyers' }).matching_loaded_threads, 1);
assert.equal(project(messages, { now, query: 'ＳＯＵＲＣＥ snippet' }).matching_loaded_threads, 7);
assert.equal(project(messages, { now, query: '.*' }).matching_loaded_threads, 0, 'Search is literal, not an executable pattern');
assert.equal(project(messages, { now, query: '<img onerror=fetch()>' }).matching_loaded_threads, 0);
assert.equal(project(messages, { now, query: 'not recorded' }).range.start, 0);
const many = Array.from({ length: 50 }, (_, i) => row('message-' + i, { thread_key: '' }));
const last = project(many, { now, page: Number.MAX_SAFE_INTEGER, pageSize: 10 });
assert.equal(last.page, 5); assert.equal(last.rows.length, 10); assert.equal(last.range.start, 41); assert.equal(last.range.end, 50);
assert.equal(project(many, { now }).rows.length, 50);
for (const options of [{ page: 0 }, { page: '1' }, { page: Infinity }, { pageSize: 51 }, { pageSize: -1 }, { query: '\n' },
  { query: 'x'.repeat(301) }, { category: 'forged' }, { role: 'verified_buyer' }]) assert.throws(() => project(messages, { now, ...options }), /mail_layout_filter_invalid/);
assert.throws(() => project(messages), /email_view_clock_invalid/);
assert.throws(() => project(many.concat(row('z')), { now }), /email_view_list_invalid/);
const unknownRoles = ['missing', 'future', 'wrong-origin'].map((id, i) => row(id, { thread_key: '', link_status: 'linked',
  conversation: i === 0 ? undefined : { ...role('buyer'), ...(i === 1 ? { role_recorded_at: '2027-01-01T00:00:00Z' } : { role_source_kind: 'derived_workflow' }) } }));
assert.equal(project(unknownRoles, { now }).categories.buyers, 0);
const mixed = [row('h', { thread_key: 'c'.repeat(64), labels: ['WOS Action'] }), row('i', { thread_key: 'c'.repeat(64) })];
assert.equal(project(mixed, { now }).categories.reports, 0, 'A human reply without the report label remains Primary');
const labelConflict = [row('j', { labels: ['WOS/Reports'] }), row('j')];
assert.equal(project(labelConflict, { now }).categories.reports, 0);
const snippetConflict = [row('k', { snippet: 'first' }), row('k', { snippet: 'other' })];
assert.equal(project(snippetConflict, { now }).rows[0].snippet, '', 'Conflicting source snippet is withheld');
assert.equal(project([row('l', { snippet: undefined })], { now }).rows[0].snippet, '');
assert.equal(project([row('m', { source_kind: 'derived_workflow' })], { now }).total_loaded_threads, 0);
assert.equal(project([row('n', { date: '2027-01-01T00:00:00Z' })], { now }).total_loaded_threads, 0);
assert.equal(project([row('o'), row('o', { subject: 'conflicting' })], { now }).total_loaded_threads, 0);
assert.equal(JSON.stringify(messages), before, 'Input evidence never mutated');
const oldNow = Date.now, oldFetch = global.fetch;
try {
  Date.now = () => { throw Error('ambient_clock_forbidden'); };
  global.fetch = () => { throw Error('network_forbidden'); };
  assert.deepEqual(project(messages, { now }), view);
} finally { Date.now = oldNow; global.fetch = oldFetch; }
console.log('mail-layout-model: five sourced display categories, literal loaded-only search, scoped counts/ranges, deterministic paging, missing/forged/future/conflicting negatives and purity passed');
