'use strict';
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const fs = require('node:fs'), http = require('node:http'), https = require('node:https');
const { decodeSnapshot, appendSnapshot, latestSnapshot, MAX_BYTES } = require('../modules/records/assistant-snapshot');
const now = '2026-10-26T15:00:00Z';
function fixture() {
  return { schema: 'wos-assistant-snapshot', version: 1, generated_at: '2026-10-26T13:00:00Z',
    deals: [{ id: 'example-deal-1', name: '123 Example St, Example City TX', stage: 'finding_buyer',
      people: [{ name: 'Example Buyer', role: 'buyer, Example Capital', phone: null, email: null }],
      numbers: { ask: 100000, seller_number: null, our_offer: 60000, target: 65000, value_fixed: 150000, repairs: 30000,
        buyer_number: { amount: null, buyer: 'Example Buyer' }, fee_estimate_low: 10000, fee_estimate_high: 15000 },
      next_seller: 'Ask for the reported price.', next_buyer: 'Review the reported reply.', needs_gabriel: null,
      updated_at: '2026-10-26T12:40:00Z', log: [{ at: '2026-10-24', text: 'Synthetic reported event.' }], source_file: 'deal-brains/example-deal-1.md' }],
    buyers: [{ id: 'BUY-0000', name: 'Example Buyer', company: 'Example Capital', areas: ['Example City'], buy_box: 'Synthetic criteria', pof: true, approval: 'approved',
      last_contact: '2026-10-24', deals_sent: ['example-deal-1'], phone: null, email: null, source_url: 'https://example.test/buyer' }],
    texts: [{ id: 't-0001', to_name: 'Example Buyer', role: 'buyer', phone: null, text: 'Synthetic draft; never sent.', deal: 'example-deal-1', status: 'drafted', drafted_at: '2026-10-23' }],
    calls: [{ name: 'Example Person', role: 'seller', phone: null, why: 'Synthetic call reason', questions: ['Synthetic question one?', 'Synthetic question two?'], deal: 'example-deal-1', rank: 1 }],
    emails_waiting: [{ who: 'Example Buyer', role: 'buyer', subject: 'Synthetic waiting draft', deal: 'example-deal-1', draft_ref: null, rank: 1 }] };
}
const bytes = value => Buffer.from(JSON.stringify(value));
const options = { now, operatorId: 'owner-one', filename: 'assistant-2026-10-26.json' };
const raw = bytes(fixture()), decoded = decodeSnapshot(raw, { now });
assert.deepEqual(decoded.snapshot, fixture());
assert.equal(decoded.file_sha256, crypto.createHash('sha256').update(raw).digest('hex'));
assert.notEqual(decoded.file_sha256, decodeSnapshot(Buffer.from(JSON.stringify(fixture(), null, 2)), { now }).file_sha256, 'Hash covers exact file bytes,not canonicalized JSON');
function invalid(change, code) {
  const value = fixture(); change(value); const buffer = bytes(value), copy = Buffer.from(buffer);
  assert.throws(() => decodeSnapshot(buffer, { now }), error => error.code === 'assistant_snapshot_' + code);
  assert.deepEqual(buffer, copy);
}
invalid(v => { v.version = 2; }, 'version_invalid');
invalid(v => { v.schema = 'forged'; }, 'schema_invalid');
invalid(v => { delete v.generated_at; }, 'fields_invalid');
invalid(v => { v.generated_at = '2026-10-27T00:00:00Z'; }, 'generated_at_invalid');
invalid(v => { v.generated_at = '2026-02-30T00:00:00Z'; }, 'generated_at_invalid');
invalid(v => { delete v.calls; }, 'fields_invalid');
invalid(v => { v.deals.push(v.deals[0]); }, 'duplicate_id');
invalid(v => { v.buyers[0].id = v.deals[0].id; }, 'duplicate_id');
invalid(v => { v.texts.push(v.texts[0]); }, 'duplicate_id');
for (const path of ['../private.md', '/private.md', 'C:\\private.md', 'https://example.test/private.md', 'deal-brains/../private.md', 'deal-brains/.hidden.md', 'deal-brains/private\n.md', 'settings/private.md']) {
  invalid(v => { v.deals[0].source_file = path; }, 'source_file_invalid');
}
invalid(v => { v.deals[0].walk_away = 90000; }, 'fields_invalid');
invalid(v => { v.deals[0].numbers.walk_away = 90000; }, 'fields_invalid');
invalid(v => { v.deals[0].stage = 'ready_to_contact'; }, 'field_invalid');
invalid(v => { v.deals[0].numbers.ask = '100000'; }, 'money_invalid');
invalid(v => { v.deals[0].numbers.ask = -1; }, 'money_invalid');
invalid(v => { v.deals[0].numbers.fee_estimate_high = 100; }, 'money_invalid');
invalid(v => { v.deals[0].updated_at = '2026-10-26T14:00:00Z'; }, 'date_invalid');
invalid(v => { v.deals[0].log[0].at = '10/06/2026'; }, 'date_invalid');
invalid(v => { v.buyers[0].pof = 'true'; }, 'field_invalid');
invalid(v => { v.buyers[0].approval = 'verified_by_bank'; }, 'field_invalid');
invalid(v => { v.buyers[0].last_contact = '2026-02-30'; }, 'date_invalid');
invalid(v => { v.buyers[0].deals_sent = ['missing-deal']; }, 'reference_invalid');
invalid(v => { v.buyers[0].deals_sent.push(v.buyers[0].deals_sent[0]); }, 'reference_invalid');
invalid(v => { v.buyers[0].source_url = 'javascript:alert(1)'; }, 'source_url_invalid');
invalid(v => { v.buyers[0].source_url = 'https://user:secret@example.test'; }, 'source_url_invalid');
invalid(v => { v.calls[0].rank = 0; }, 'rank_invalid');
invalid(v => { v.calls[0].questions.push('Three?', 'Four?'); }, 'array_invalid');
invalid(v => { v.emails_waiting[0].draft_ref = '../private'; }, 'reference_invalid');
invalid(v => { v.texts[0].text = 'bad\u0000text'; }, 'field_invalid');
for (const value of [Buffer.alloc(0), Buffer.from('{'), Buffer.from([0xff, 0xfe]), Buffer.from('null'), Buffer.from('[]')]) assert.throws(() => decodeSnapshot(value, { now }), /assistant_snapshot_/);
assert.throws(() => decodeSnapshot(Buffer.alloc(MAX_BYTES + 1), { now }), error => error.status === 413);
assert.throws(() => decodeSnapshot(raw), /assistant_snapshot_clock_invalid/);
const source = { buyers: [{ id: 'canonical-buyer', approval: 'pending' }], reviewed_deals: [{ id: 'canonical-deal', approval: 'pending' }], activities: [] };
const original = JSON.stringify(source), first = appendSnapshot(source, raw, options), second = appendSnapshot(first, raw, options);
assert.equal(JSON.stringify(source), original);
assert.equal(first.assistant_snapshots.length, 1); assert.equal(second.assistant_snapshots.length, 2);
assert.equal(first.assistant_snapshots[0].source_kind, 'assistant_snapshot_import');
assert.deepEqual(second.assistant_snapshots[0], first.assistant_snapshots[0]);
assert.notEqual(second.assistant_snapshots[0].id, second.assistant_snapshots[1].id, 'Every identical import is retained with a distinct append receipt');
assert.equal(second.buyers, source.buyers); assert.equal(second.reviewed_deals, source.reviewed_deals);
assert.equal(second.buyers[0].approval, 'pending', 'Reported approval/POF never changes canonical eligibility');
assert.equal(latestSnapshot(second, options).id, second.assistant_snapshots[1].id);
assert.equal(latestSnapshot(second, { operatorId: 'other-owner', now }), null);
const olderGenerated = fixture(); olderGenerated.generated_at = '2026-10-25T13:00:00Z'; olderGenerated.deals[0].updated_at = '2026-10-25T12:40:00Z';
const third = appendSnapshot(second, bytes(olderGenerated), { ...options, now: '2026-10-26T15:01:00Z' });
assert.equal(latestSnapshot(third, { ...options, now: '2026-10-26T15:01:00Z' }).generated_at, olderGenerated.generated_at, 'Newest import wins,not newest generation time');
const other = appendSnapshot(third, raw, { ...options, operatorId: 'other-owner', now: '2026-10-26T15:02:00Z' });
assert.equal(latestSnapshot(other, { ...options, now: '2026-10-26T15:02:00Z' }).id, third.assistant_snapshots[2].id);
assert.throws(() => latestSnapshot(third, options), /assistant_snapshot_store_invalid/, 'Future stored receipts are not silently displayed');
assert.throws(() => latestSnapshot(first, { operatorId: options.operatorId }), /assistant_snapshot_clock_invalid/);
const corrupted = { ...first, assistant_snapshots: [{ ...first.assistant_snapshots[0], snapshot: { schema: 'forged' } }] };
assert.throws(() => appendSnapshot(corrupted, raw, options), error => error.status === 503);
assert.throws(() => latestSnapshot(corrupted, options), error => error.status === 503);
assert.throws(() => appendSnapshot({ ...first, assistant_snapshots: [first.assistant_snapshots[0], first.assistant_snapshots[0]] }, raw, options), /assistant_snapshot_store_invalid/);
const empty = { schema: 'wos-assistant-snapshot', version: 1, generated_at: now, deals: [], buyers: [], texts: [], calls: [], emails_waiting: [] };
assert.deepEqual(decodeSnapshot(bytes(empty), { now }).snapshot, empty);
const zero = fixture(); zero.deals[0].numbers.ask = 0; zero.buyers[0].pof = null;
assert.equal(decodeSnapshot(bytes(zero), { now }).snapshot.deals[0].numbers.ask, 0);
for (const value of [null, [], { assistant_snapshots: {} }, { assistant_snapshots: Array(1) }, { assistant_snapshots: [{}] }]) assert.throws(() => appendSnapshot(value, raw, options), /assistant_snapshot_store_invalid/);
assert.throws(() => appendSnapshot(source, raw, { ...options, operatorId: '' }), error => error.status === 403);
assert.throws(() => appendSnapshot(source, raw, { ...options, filename: '../private.json' }), /assistant_snapshot_filename_invalid/);
const bad = fixture(); bad.deals[0].numbers.private_contact = 'PRIVATE_SENTINEL_PHONE';
assert.throws(() => appendSnapshot(second, bytes(bad), options), error => !error.message.includes('PRIVATE_SENTINEL') && error.code === 'assistant_snapshot_fields_invalid');
assert.equal(second.assistant_snapshots.length, 2, 'Rejected file never partially imports');
const blocked = [], restore = [];
try {
  for (const [object, key] of [[Date, 'now'], [global, 'fetch'], [fs, 'readFileSync'], [fs, 'writeFileSync'], [http, 'request'], [https, 'request']]) {
    const old = object[key]; restore.push(() => { object[key] = old; }); object[key] = () => { blocked.push(key); throw Error('Side effect forbidden'); };
  }
  assert.deepEqual(appendSnapshot(source, raw, options), first);
  assert.equal(latestSnapshot(second, options).id, second.assistant_snapshots[1].id);
} finally { restore.forEach(fn => fn()); }
assert.deepEqual(blocked, []);
console.log('assistant-snapshot: exact file hash,strict all-or-nothing v1,source/date/ID/reference/money negatives,append-only per-owner latest imports,canonical non-promotion,PII-safe errors and no clock/disk/network/writers passed');
