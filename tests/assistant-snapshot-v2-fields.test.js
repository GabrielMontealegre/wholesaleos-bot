'use strict';
const assert = require('node:assert/strict');
const { validateV2Fields } = require('../modules/records/assistant-snapshot-v2-fields');
const now = '2026-10-31T12:00:00Z';
function fixture() {
  return { version: 2, generated_at: '2026-10-31T11:00:00Z',
    open_items: [{ id: 'K1', tier: 1, status: 'needs_decision', title: 'Synthetic decision',
      who: [{ name: 'Synthetic agent', role: 'listing agent', channel: 'email' }],
      happened: [{ at: '2026-10-30', text: 'Synthetic reported question.' }],
      numbers: { ask: null, value_fixed: null, repairs: null, buyer_number: null, our_offer: 0, fee_estimate_low: null, fee_estimate_high: null },
      suggestion: 'Synthetic draft, never sent.', options: { A: { label: 'Ask', consequence: 'Request clarification.' }, B: { label: 'Wait', consequence: 'No action.' }, C: { label: 'Pass', consequence: 'Do not proceed.' } },
      pick: null, due: '2026-11-01', refs: { thread: null, draft: null } }],
    agents: [{ id: 'agent-1', name: 'Synthetic agent', brokerage: null, emails: [], phones: [], markets: ['Example market'], properties: ['example-ref'], contacted: null, answered: null, response_hours: null, last_touch: null }],
    outreach: [{ ref: 'example-ref', priority: 1, address: 'Synthetic property', market: 'Example market', agent_id: 'agent-1', next_step: 'Review the reported question.', follow_up_on: null, contacted: false, answered: false, last_answer_summary: null }] };
}
const first = fixture(), before = structuredClone(first);
assert.doesNotThrow(() => validateV2Fields(first, { now, existingIds: ['v1-deal'] }));
assert.deepEqual(first, before, 'Validation does not normalize or mutate reported data');
function reject(change) { const value = fixture(); change(value); assert.throws(() => validateV2Fields(value, { now }), /^Error: assistant_snapshot_/); }
for (const tier of [0, 6, 1.5, '1', null]) reject(v => { v.open_items[0].tier = tier; });
reject(v => { v.open_items.push(structuredClone(v.open_items[0])); });
reject(v => { v.agents[0].id = 'K1'; });
assert.throws(() => validateV2Fields(fixture(), { now, existingIds: ['K1'] }), /duplicate_id/);
reject(v => { v.generated_at = '2026-11-01T00:00:00Z'; });
reject(v => { v.generated_at = '2026-02-30T00:00:00Z'; });
reject(v => { v.open_items[0].happened[0].at = '2026-11-01'; });
reject(v => { v.agents[0].last_touch = '2026-11-01T00:00:00Z'; });
reject(v => { delete v.open_items[0].options.C; });
reject(v => { v.open_items[0].pick = 'send'; });
reject(v => { v.open_items[0].numbers.walk_away = 1; });
reject(v => { v.open_items[0].numbers.ask = -1; });
reject(v => { v.open_items[0].numbers.fee_estimate_low = 3; v.open_items[0].numbers.fee_estimate_high = 2; });
reject(v => { v.outreach[0].agent_id = 'missing-agent'; });
reject(v => { v.outreach.push(structuredClone(v.outreach[0])); });
reject(v => { v.agents[0].answered = 'true'; });
reject(v => { v.agents[0].response_hours = -1; });
reject(v => { v.outreach[0].follow_up_on = '11/01/2026'; });
reject(v => { delete v.agents; });
reject(v => { v.open_items = Array(1); });
reject(v => { v.agents[0].emails = Array(1); });
reject(v => { v.outreach[0].unexpected = true; });
reject(v => { v.open_items = Array(1001).fill(v.open_items[0]); });
reject(v => { v.agents[0].markets.push('bad\u0000text'); });
reject(v => { v.open_items[0].who[0].channel = 'email\nforged'; });
reject(v => { v.open_items[0].due = '2026-02-30'; });
reject(v => { v.open_items[0].refs.thread = 'PRIVATE_SENTINEL\u0000'; });
let getterCalls = 0;
reject(v => { Object.defineProperty(v.agents[0], 'name', { enumerable: true, get() { getterCalls++; return 'hidden'; } }); });
assert.equal(getterCalls, 0, 'Accessor fields are rejected without invocation');
assert.throws(() => validateV2Fields(fixture(), {}), /clock_invalid/);
assert.throws(() => validateV2Fields({ ...fixture(), version: 1 }, { now }), /version_invalid/);
const batch = fixture();
batch.open_items = Array.from({ length: 20 }, (_, i) => ({ ...structuredClone(first.open_items[0]), id: 'K' + (i + 1), tier: i % 5 + 1 }));
assert.doesNotThrow(() => validateV2Fields(batch, { now }));
const fs = require('node:fs'), http = require('node:http'), https = require('node:https');
const restore = [], effects = [];
try {
  for (const [object, keys] of [[fs, ['readFileSync', 'writeFileSync']], [http, ['request', 'get']], [https, ['request', 'get']], [Date, ['now']]]) {
    for (const key of keys) { const original = object[key]; restore.push(() => { object[key] = original; }); object[key] = () => { effects.push(key); throw Error('forbidden_side_effect'); }; }
  }
  assert.doesNotThrow(() => validateV2Fields(batch, { now }));
  assert.deepEqual(effects, [], 'Pure extension validation has no clock, filesystem or network side effects');
} finally { restore.reverse().forEach(fn => fn()); }
console.log('assistant-snapshot-v2-fields: synthetic extension fields,20-row batch,strict unknown/null/date/reference boundaries and no mutation passed');
