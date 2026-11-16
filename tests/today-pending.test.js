'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs');
const { buildPending } = require('../modules/agents/today-pending');
const { buildTodayWorkspace } = require('../modules/agents/today-workspace');
const now = '2026-10-21T18:00:00Z', today = '2026-10-21', options = { now, today };
const buyer = { id: 'buyer', name: 'Fixture Investor', record_ref: 'BUY-0005' };
const draft = { id: 'draft', buyer_id: buyer.id, created_at: now, status: 'draft', body: 'PRIVATE BODY', to: 'private@example.test' };
const conversation = patch => ({ id: 'conversation', person: 'Fixture Contact', refs: ['BUY-0005'], channels: ['email'],
  status: 'to_send', ready_message: '', captured_at: now, source_kind: 'imported_report', ...patch });
const store = { buyers: [buyer], buyer_email_drafts: [draft], activities: [
  { type: 'bounce', ts: '2026-10-20T18:00:00Z', buyer_ref: buyer.record_ref, summary: 'PRIVATE ERROR' },
  { type: 'bounce', ts: now, buyer_ref: buyer.record_ref, summary: 'PRIVATE ERROR' },
  { type: 'bounce', ts: now, buyer_ref: 'BUY-0999' },
  { type: 'bounce', ts: '2026-10-22T18:00:00Z', buyer_ref: buyer.record_ref }
] };
const rows = [conversation({}), conversation({ id: 'ready', ready_message: 'Recorded draft' }),
  conversation({ id: 'waiting', status: 'waiting_on_deal', last_out: '2026-10-19T18:00:00Z' }),
  conversation({ id: 'reminder', status: 'follow_up', due_date: '2026-10-22', next_step: 'Review rent roll' }),
  conversation({ id: 'hot', status: 'hot', due_date: today })];
const frozen = JSON.stringify([store, rows]), result = buildPending(store, rows, options);
assert.equal(result.drafts.length, 3);
assert(result.drafts.find(r => r.key === 'conversation:conversation').reason.includes('not been recorded'));
assert(result.drafts.find(r => r.key === 'conversation:ready').reason.includes('review and Send'));
assert.equal(result.waiting.length, 1);
assert.equal(result.waiting[0].waiting_since, '2026-10-19T18:00:00Z');
assert.equal(result.reminders.length, 1);
assert.equal(result.reminders[0].reason, 'Review rent roll');
assert.equal(result.bounced.length, 1, 'latest report per uniquely linked record; no guessed unlinked contact');
assert.equal(result.bounced[0].recorded_at, now);
assert(result.bounced[0].reason.includes('Resolution is not recorded'));
assert(!JSON.stringify(result).includes('PRIVATE BODY'));
assert(!JSON.stringify(result).includes('private@example.test'));
assert(!JSON.stringify(result).includes('PRIVATE ERROR'));
assert.equal(JSON.stringify([store, rows]), frozen);
for (const status of ['sending', 'unknown']) assert(buildPending({ ...store, buyer_email_drafts: [{ ...draft, status }] }, [], options).drafts[0].reason.includes('uncertain'));
for (const patch of [{ status: 'accepted' }, { status: 'forged' }, { created_at: '2026-10-22T18:00:00Z' }, { created_at: '2026-02-30T18:00:00Z' }, { buyer_id: 'missing' }, { id: '' }, { sent_at: now }]) {
  assert.equal(buildPending({ ...store, buyer_email_drafts: [{ ...draft, ...patch }] }, [], options).drafts.length, 0);
}
assert.equal(buildPending({ ...store, email_delivery_receipts: [{ approval_id: draft.id, status: 'accepted' }] }, [], options).drafts.length, 0);
assert.equal(buildPending({ ...store, buyer_email_drafts: [draft, draft] }, [], options).drafts.length, 0);
const duplicate = buildPending({ ...store, buyers: [buyer, { ...buyer }] }, [], options);
assert.equal(duplicate.drafts.length, 0); assert.equal(duplicate.bounced.length, 0);
assert.equal(buildPending({buyers:[buyer],reviewed_deals:[{id:'deal',record_ref:'WOS-FL-1012'}],activities:[{type:'bounce',ts:now,buyer_ref:buyer.record_ref,deal_ref:'WOS-FL-1012'}]},[],options).bounced.length,0,'conflicting record targets never identify a contact');
const closed = buildTodayWorkspace({ ...store, conversations: [conversation({ status: 'closed' })] }, { now });
assert.equal(closed.pending.drafts.length, 1, 'closed conversations excluded by the canonical projection; saved buyer draft retained');
const original = { fetch: global.fetch, clock: Date.now, write: fs.writeFileSync }; let effects = 0;
try { const deny = () => { effects++; throw Error('side effect'); }; global.fetch = deny; Date.now = deny; fs.writeFileSync = deny; buildPending(store, rows, options); }
finally { global.fetch = original.fetch; Date.now = original.clock; fs.writeFileSync = original.write; }
assert.equal(effects, 0);
console.log('Today pending: sourced drafts/waiting/reminders, reported bounce dedupe, ambiguous/future/missing/accepted negatives, no bodies/addresses, no writes/network/clock passed.');
