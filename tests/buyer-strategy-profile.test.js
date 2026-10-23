'use strict';

const assert = require('node:assert/strict');
const profiles = require('../modules/buyers/buyer-strategy-profile');
const finds = require('../modules/buyers/assistant-finds');
const imports = require('../modules/buyers/buyer-find-import');
const exits = require('../modules/deals/exit-strategies');
const adapter = require('../modules/deals/exit-strategy-facts');

const now = '2026-10-22T12:00:00.000Z';
const today = now.slice(0, 10);
const profile = { strategy: ['rental', 'flip', 'rental'], deals_per_year: 6, target_return: { basis: 'cap_rate', percent: 9 }, funding: ['dscr', 'cash'], pof_date: '2026-09-01' };

// Validation: normalized order, duplicates collapsed, every field optional but at least one required.
assert.deepEqual(profiles.validate(profile, today), { strategy: ['flip', 'rental'], funding: ['cash', 'dscr'], deals_per_year: 6,
  target_return: { basis: 'cap_rate', percent: 9 }, pof_date: '2026-09-01' });
assert.deepEqual(profiles.validate({ strategy: ['land'] }, today), { strategy: ['land'] });
for (const bad of [null, [], 'flip', {}, { strategy: [] }, { strategy: ['wholesale'] }, { strategy: 'flip' }, { funding: ['credit_card'] },
  { deals_per_year: 2.5 }, { deals_per_year: -1 }, { deals_per_year: '6' }, { target_return: { basis: 'irr', percent: 10 } },
  { target_return: { basis: 'cap_rate', percent: 0 } }, { target_return: { basis: 'cap_rate', percent: 101 } },
  { target_return: { basis: 'cap_rate', percent: '9' } }, { target_return: { basis: 'cap_rate', percent: 9, verified: true } },
  { strategy: ['flip'], verified_funds: true }, { strategy: ['flip'], evidence_text: 'x'.repeat(301) }]) {
  assert.throws(() => { profiles.validate(bad, today); profiles.evidence(bad); }, /find_strategy_profile_invalid/, JSON.stringify(bad));
}
for (const date of ['2026-12-01', '2026-02-30', '09/01/2026', '2026-9-1']) assert.throws(() => profiles.validate({ pof_date: date }, today), /find_strategy_profile_pof_date_invalid/);
assert.throws(() => profiles.validate({ strategy: ['flip'] }, 'today'), /find_strategy_profile_clock_invalid/);
assert.equal(profiles.pofCurrent({ pof_date: '2026-09-01' }, today), true);
assert.equal(profiles.pofCurrent({ pof_date: '2026-07-01' }, today), false, 'older than 90 days');
assert.equal(profiles.pofCurrent({ pof_date: '2026-10-23' }, today), false, 'future-dated');
assert.equal(profiles.pofCurrent({}, today), false);
assert.match(profiles.describe(profiles.validate(profile, today)), /Fix and flip, Buy and hold rental; wants 9% cap rate; Cash \/ DSCR loan; 6 deals a year \(buyer-reported\); proof of funds dated 2026-09-01 \(recorded, not verified\)/);
assert.equal(profiles.describe(null), 'Strategy not stated');

// Stage 1, assistant import: the profile is validated and carries its source.
const item = { name: 'Fixture Landlord', platform: 'facebook', group_name: 'Synthetic Group', group_id: '123',
  profile_url: 'https://www.facebook.com/groups/123/user/456/', source_url: 'https://www.facebook.com/groups/123/search/?q=rentals',
  post_url: 'https://www.facebook.com/groups/123/posts/789/', what_they_buy: 'Duplexes to rent, 9% cap or better.', deal_type: 'house',
  states: ['FL'], areas: ['Tampa'], captured_at: '2026-10-20T12:00:00.000Z', classification: 'end_buyer', strategy_profile: profile };
const [valid] = finds.validateItems({ items: [item] }, now);
assert.deepEqual(valid.strategy_profile, profiles.validate(profile, today));
assert.deepEqual(valid.strategy_profile_source, { source_kind: 'assistant_report', source_url: item.post_url,
  evidence_text: item.what_they_buy, captured_at: item.captured_at });
const noProfile = { ...item }; delete noProfile.strategy_profile; delete noProfile.post_url;
const [plain] = finds.validateItems({ items: [noProfile] }, now);
assert(!('strategy_profile' in plain) && !('strategy_profile_source' in plain), 'records without a profile keep their old shape');
assert.equal(finds.validateItems({ items: [{ ...noProfile, strategy_profile: { strategy: ['flip'], evidence_text: 'Said so in the post' } }] }, now)[0].strategy_profile_source.source_url, noProfile.source_url);
for (const bad of [{ strategy: ['wholesale'] }, { pof_date: '2026-12-01' }, { strategy: ['flip'], approved: true }]) {
  assert.throws(() => finds.validateItems({ items: [{ ...item, strategy_profile: bad }] }, now), /^Error: find_strategy_profile_/);
}
const plan = imports.prepareImport({ buyers: [] }, { items: [{ ...item, strategy_profile: { strategy: ['flip'], deals_per_year: 'many' } }] }, { now });
assert.deepEqual(plan.summary.rejected, [{ item: 1, reason: 'find_strategy_profile_invalid' }]);

// Stage 2, ingest: the profile persists on the new record.
let sequence = 0;
const context = { now, operatorId: 'fixture-operator', createId: () => 'buyer-' + (++sequence) };
const committed = imports.commitImport({ buyers: [] }, imports.prepareImport({ buyers: [] }, { items: [{ kind: 'buyer', ...item }] }, { now }), context);
let store = committed.store;
assert.deepEqual(store.buyers[0].assistant_find.strategy_profile, valid.strategy_profile);
assert.equal(store.buyers[0].assistant_find.approval, 'pending', 'a profile never approves a buyer');

// Stage 3, a re-import from the same identity: newer replaces (old kept in history), older or equal does not.
const newer = finds.validateItems({ items: [{ ...item, captured_at: '2026-10-21T12:00:00.000Z', strategy_profile: { strategy: ['rental'], target_return: { basis: 'cap_rate', percent: 10 } } }] }, now);
let next = finds.ingest(store, newer, context).store;
assert.deepEqual(next.buyers[0].assistant_find.strategy_profile, { strategy: ['rental'], target_return: { basis: 'cap_rate', percent: 10 } });
const audit = next.buyers[0].assistant_find.history.at(-1);
assert.equal(audit.kind, 'strategy_profile'); assert.equal(audit.to, 'strategy profile updated'); assert.equal(audit.operator_id, 'fixture-operator');
assert.deepEqual(audit.old_value, valid.strategy_profile); assert.deepEqual(audit.new_value.strategy, ['rental']); assert.equal(audit.source_kind, 'assistant_report');
// The timeline shows the audit entry as plain text, never an object dump.
const timeline = require('../modules/records/record-activity').listActivity(next, { recordKind: 'buyer', recordId: 'buyer-1' }).items;
assert(timeline.some((row) => row.summary === 'strategy profile updated'));
assert(!timeline.some((row) => /\[object Object\]/.test(row.summary)));
const older = finds.validateItems({ items: [{ ...item, captured_at: '2026-10-19T12:00:00.000Z', strategy_profile: { strategy: ['land'] } }] }, now);
assert.deepEqual(finds.ingest(next, older, context).store.buyers[0].assistant_find.strategy_profile.strategy, ['rental'], 'a stale report never replaces a newer one');
const sameTime = finds.validateItems({ items: [{ ...item, captured_at: '2026-10-21T12:00:00.000Z', strategy_profile: { strategy: ['land'] } }] }, now);
assert.deepEqual(finds.ingest(next, sameTime, context).store.buyers[0].assistant_find.strategy_profile.strategy, ['rental'], 'a retry with the same capture time never replaces');
const historyLength = next.buyers[0].assistant_find.history.length;
assert.equal(finds.ingest(next, newer, context).store.buyers[0].assistant_find.history.length, historyLength, 'the same report adds no audit noise');
const byEmail = finds.validateItems({ items: [{ ...item, profile_url: 'https://www.facebook.com/groups/123/user/999/', email: 'same@example.test', captured_at: '2026-10-21T13:00:00.000Z', strategy_profile: { strategy: ['land'] } }] }, now);
const emailStore = finds.ingest(finds.ingest(store, finds.validateItems({ items: [{ ...noProfile, profile_url: 'https://www.facebook.com/groups/123/user/998/', email: 'same@example.test' }] }, now), context).store, byEmail, context).store;
assert.equal(emailStore.buyers.at(-1).assistant_find.strategy_profile, undefined, 'a contact-only duplicate never rewrites another record');

// Stage 4, operator update: wins over later assistant reports and leaves an audited activity event.
const before = JSON.stringify(next);
assert.throws(() => finds.update(next, 'buyer-1', { strategy_profile: { strategy: ['nonsense'] } }, context), /find_strategy_profile_invalid/);
assert.throws(() => finds.update(next, 'buyer-1', { strategy_profile: { strategy: ['flip'] }, verified: true }, context), /find_update_invalid/);
assert.equal(JSON.stringify(next), before, 'a rejected update changes nothing');
next = finds.update(next, 'buyer-1', { strategy_profile: { strategy: ['multifamily'], pof_date: '2026-10-15', evidence_text: 'Buyer emailed a bank letter dated 2026-10-15.' } },
  { now: '2026-10-22T13:00:00.000Z', operatorId: 'fixture-operator' });
const find = next.buyers[0].assistant_find;
assert.deepEqual(find.strategy_profile, { strategy: ['multifamily'], pof_date: '2026-10-15' });
assert.deepEqual(find.strategy_profile_source, { source_kind: 'operator_input', source_url: null, evidence_text: 'Buyer emailed a bank letter dated 2026-10-15.',
  captured_at: '2026-10-22T13:00:00.000Z', operator_id: 'fixture-operator' });
assert.equal(find.history.at(-1).kind, 'strategy_profile'); assert.deepEqual(find.history.at(-1).old_value.strategy, ['rental']);
assert.deepEqual(find.history.at(-1).new_value, find.strategy_profile);
assert(next.activities.some((event) => event.buyer_id === 'buyer-1' && event.type === 'status_change' && event.summary === 'Operator recorded the buyer strategy profile.'));
const later = finds.validateItems({ items: [{ ...item, captured_at: '2026-10-22T12:30:00.000Z', strategy_profile: { strategy: ['land'] } }] }, '2026-10-22T14:00:00.000Z');
assert.deepEqual(finds.ingest(next, later, context).store.buyers[0].assistant_find.strategy_profile.strategy, ['multifamily'], 'operator input is never overwritten by an import');

// Stage 5, read: the list exposes the profile and a plain-English summary.
const listed = finds.listFinds(next, { now }).items[0];
assert.deepEqual(listed.strategy_profile, find.strategy_profile);
assert.equal(listed.strategy_profile_view, 'Small multifamily; proof of funds dated 2026-10-15 (recorded, not verified)');

// Stage 6, persisted store -> matching: a JSON round trip keeps the profile and the engine matches it.
const persisted = JSON.parse(JSON.stringify(finds.update(next, 'buyer-1', { strategy_profile: { strategy: ['rental'], target_return: { basis: 'cap_rate', percent: 9 }, pof_date: '2026-10-15' } }, context)));
const fact = (value, source_kind, extra = {}) => ({ value, source_kind, source_url: 'https://records.example.test/f', evidence_text: 'fixture', captured_at: '2026-10-01', ...extra });
const deal = { units: fact(4, 'public_web_page'), arv: fact(360000, 'comp_grid', { tier: 'verified', comp_count: 3 }), repairs: fact(40000, 'operator_estimate'),
  asking_price: fact(230000, 'public_web_page'), monthly_rent: fact(4400, 'rent_roll'), annual_taxes: fact(6000, 'county_record'), annual_insurance: fact(4000, 'agent_report') };
const matched = exits.evaluate(deal, { today, buyers: adapter.buyersFor({ matches: [{ id: 'buyer-1', name: 'Fixture Landlord' }] }, persisted.buyers) });
assert.deepEqual(matched.exits.find((exit) => exit.key === 'rental').matching_buyers.map((b) => [b.id, b.return_check, b.pof_current]), [['buyer-1', 'meets', true]]);
// Legacy buyers (no assistant record) have no profile and are never matched on strategy.
assert.deepEqual(adapter.buyersFor({ matches: [{ id: 'legacy' }] }, [{ id: 'legacy', buyTypes: ['SFR'] }]).map((b) => b.strategy_profile), [null]);

console.log('buyer-strategy-profile: validation, sourced import, newer/older/same re-import with audit, operator precedence, list view, persisted matching and legacy buyers passed');
