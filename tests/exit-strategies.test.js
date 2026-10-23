'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const exits = require('../modules/deals/exit-strategies');
const adapter = require('../modules/deals/exit-strategy-facts');

const today = '2026-10-22';
const fact = (value, source_kind, extra = {}) => ({ value, source_kind, source_url: 'https://records.example.test/fixture',
  evidence_text: 'Synthetic fixture evidence.', captured_at: '2026-10-01', ...extra });
// Comp records around the value: recorded sales with address, price, date and source.
const comps = (value, count, extra = {}) => Array.from({ length: count }, (_, i) => ({ comp_address: (100 + i) + ' Fixture St, Example, FL 33601',
  sold_price: Math.round(value * [1, 0.95, 1.05, 0.98, 1.02][i % 5]), sold_date: '2026-09-1' + i, source_url: 'https://records.example.test/sale/' + i,
  price_basis: 'recorded_sale', sold_status: 'Sold', ...extra }));
const arv = (value, tier = 'verified', count = 3) => fact(value, 'comp_grid', { tier, comps: comps(value, count) });
const subject = fact('900 Subject Rd, Example, FL 33601', 'public_web_page');
const src = { source_kind: 'assistant_report', source_url: 'https://www.facebook.com/groups/1/posts/2/', evidence_text: 'Buyer post.', captured_at: '2026-10-01T00:00:00.000Z' };
const byKey = (result) => Object.fromEntries(result.exits.map((exit) => [exit.key, exit]));
function deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }

// 1. A 4-plex where the rental beats the flip.
const fourplex = deepFreeze({ subject_address: subject, property_type: fact('fourplex', 'public_web_page'), units: fact(4, 'public_web_page'), arv: arv(360000),
  repairs: fact(40000, 'operator_estimate'), asking_price: fact(230000, 'public_web_page'), monthly_rent: fact(4400, 'rent_roll'),
  annual_taxes: fact(6000, 'county_record'), annual_insurance: fact(4000, 'agent_report') });
const landlord = { id: 'buyer-landlord', name: 'Fixture Landlord', strategy_profile_source: src, strategy_profile: { strategy: ['rental', 'multifamily'],
  target_return: { basis: 'cap_rate', percent: 9 }, funding: ['dscr'], deals_per_year: 6, pof_date: '2026-09-01' } };
const flipper = { id: 'buyer-flipper', name: 'Fixture Flipper', strategy_profile_source: src, strategy_profile: { strategy: ['flip'], target_return: { basis: 'pct_arv', percent: 80 }, funding: ['hard_money'] } };
const buyers = deepFreeze([flipper, landlord]);
const plex = exits.evaluate(fourplex, { today, buyers });
let e = byKey(plex);
assert.equal(plex.is_offer, false); assert.equal(plex.derived, true);
assert.deepEqual(plex.rejected_facts, []);
assert.equal(e.flip.verdict, 'strong'); assert.equal(e.flip.buyer_max, 258800, '360k x 83% - 40k repairs (D-015 band)');
assert.equal(e.rental.verdict, 'strong'); assert.equal(e.rental.buyer_max, 323400, 'NOI 29,072 / 8% cap - 40k repairs');
assert(e.rental.buyer_max > e.flip.buyer_max, 'a landlord pays more than a flipper for this 4-plex');
assert.equal(e.rental.metrics.noi, 29072); assert.equal(e.rental.metrics.cap_rate, 10.4); assert.equal(e.rental.metrics.dscr, 1.92);
assert.equal(e.rental.metrics.at_flipper_price.works, true);
assert.equal(e.multifamily.verdict, 'strong');
assert(e.multifamily.numbers.some((n) => n.key === 'price_per_door' && n.value === 60000 && n.kind === 'derived'));
assert.equal(plex.best, 'rental', 'the landlord with current proof of funds and a met target outranks the flip');
assert(plex.also_works.includes('flip'));
assert.deepEqual(e.rental.matching_buyers.map((b) => [b.id, b.return_check, b.pof_current, b.rank]), [['buyer-landlord', 'meets', true, 3]]);
assert.deepEqual(e.rental.matching_buyers[0].profile_source, src, 'the evidence behind a match travels with it');
// A profile with no source is listed but never confirmed, so it never changes the ranking.
const unsourced = exits.evaluate(fourplex, { today, buyers: [{ ...flipper, strategy_profile_source: null }, { ...flipper, id: 'half', strategy_profile_source: { source_kind: 'assistant_report', captured_at: '2026-10-01' } }] });
assert.deepEqual(byKey(unsourced).flip.matching_buyers.map((b) => [b.id, b.return_check, b.rank, b.pof_current]), [['buyer-flipper', 'unsourced', 1, false], ['half', 'unsourced', 1, false]]);
assert.equal(unsourced.best, 'rental');
// Weak provenance is not provenance: blank evidence, a bad or future date, an http URL, an empty kind.
for (const bad of [{ ...src, source_url: null, evidence_text: '   ' }, { ...src, captured_at: 'nonsense' }, { ...src, captured_at: '2026-12-01' },
  { ...src, source_url: 'http://example.test/post' }, { ...src, source_kind: '  ' }, ['assistant_report']]) {
  const weak = exits.evaluate(fourplex, { today, buyers: [{ ...landlord, strategy_profile_source: bad }] });
  assert.deepEqual(byKey(weak).rental.matching_buyers.map((b) => [b.return_check, b.rank]), [['unsourced', 1]], JSON.stringify(bad));
  assert.equal(byKey(weak).rental.confirmed_buyer_fee, null);
}
assert.equal(byKey(exits.evaluate(fourplex, { today, buyers: [{ ...landlord, strategy_profile_source: { ...src, source_url: null } }] })).rental.matching_buyers[0].rank, 3, 'evidence text alone is a source');
assert.deepEqual(e.flip.matching_buyers.map((b) => [b.id, b.return_check, b.buyer_price, b.fee]), [['buyer-flipper', 'meets', 248000, 18000]]);
// Codex example: an 80%-of-ARV buyer at $248k against a $247k asking supports a $1k fee, not the generic flip fee.
const thin = exits.evaluate({ ...fourplex, asking_price: fact(247000, 'public_web_page') }, { today, buyers: [flipper] });
assert.equal(byKey(thin).flip.fee, 11800, 'the generic flipper band still shows its own fee');
assert.equal(byKey(thin).flip.matching_buyers[0].fee, 1000);
assert.equal(byKey(thin).wholesale_jv.fee, 1000); assert.equal(byKey(thin).wholesale_jv.verdict, 'possible');
assert.match(byKey(thin).wholesale_jv.reason, /leaves about \$1,000/);
assert.equal(e.wholesale_jv.verdict, 'strong'); assert.match(e.wholesale_jv.reason, /matched buy and hold rental buyer; their price leaves about \$53,022/);
// The landlord wants 9%, so they pay NOI / 9% - repairs = $283,022, not the exit's 8%-cap maximum.
assert.deepEqual(e.rental.matching_buyers.map((b) => [b.buyer_price, b.fee]), [[283022, 53022]]);
assert.equal(e.rental.confirmed_buyer_fee, 53022); assert.equal(e.wholesale_jv.fee, 53022);
assert.match(e.rental.pitch, /rents for \$4,400\/month \(rent roll\).*cap rate.*cash-on-cash.*Estimates, not guarantees\./);
const lines = exits.cardLines(plex);
assert.equal(lines.best, 'Best exit: Buy and hold rental ($93,400 fee, estimate)');
assert.match(lines.also_works, /^Also works: .*Fix and flip \(\$28,800 fee, estimate\)/);
for (const exit of plex.exits) for (const n of exit.numbers) assert(['fact', 'derived', 'assumption'].includes(n.kind), exit.key + ' number is labeled');
assert(plex.assumptions.every((item) => item.label && typeof item.value === 'number'));
// Without any buyer the rental still ranks first on fee; with no rental buyer the flip buyer leads.
assert.equal(exits.evaluate(fourplex, { today }).best, 'rental');
assert.equal(exits.evaluate(fourplex, { today, buyers: [flipper] }).best, 'flip', 'a real matching buyer weighs most');
// A buyer whose return cannot be checked is listed but never moves an exit up the ranking.
const unchecked = exits.evaluate(fourplex, { today, buyers: [{ id: 'b-cap-flip', strategy_profile_source: src, strategy_profile: { strategy: ['flip'], target_return: { basis: 'cap_rate', percent: 8 } } },
  { id: 'b-silent-flip', strategy_profile_source: src, strategy_profile: { strategy: ['flip'] } }] });
assert.equal(unchecked.best, 'rental');
assert.deepEqual(byKey(unchecked).flip.matching_buyers.map((b) => [b.id, b.return_check, b.rank]), [['b-cap-flip', 'unknown', 1], ['b-silent-flip', 'not_stated', 1]]);
assert.equal(byKey(unchecked).wholesale_jv.verdict, 'possible', 'no confirmed buyer yet');

// 2. A 2/1 where the rental fails at the flipper price.
const twoOne = deepFreeze({ subject_address: subject, property_type: fact('house', 'public_web_page'), units: fact(1, 'public_web_page'), sqft: fact(900, 'public_web_page'),
  arv: arv(150000), repairs: fact(25000, 'operator_estimate'), asking_price: fact(70000, 'public_web_page'),
  monthly_rent: fact(1000, 'hud_small_area_fmr'), annual_taxes: fact(2500, 'county_record'), annual_insurance: fact(1500, 'agent_report') });
const house = exits.evaluate(twoOne, { today, buyers: [landlord] });
e = byKey(house);
assert.equal(e.flip.verdict, 'strong'); assert.equal(e.flip.buyer_max, 87500, '150k x 75% (D-031) - 25k');
assert.equal(e.rental.verdict, 'no');
assert.equal(e.rental.metrics.at_flipper_price.price, 87500);
assert.equal(e.rental.metrics.at_flipper_price.works, false);
assert.equal(e.rental.metrics.at_flipper_price.one_percent_rule, false);
assert(e.rental.metrics.at_flipper_price.cap_rate < 8);
assert.deepEqual(e.rental.matching_buyers, [], 'a rental that fails is never pitched to a landlord');
assert.equal(e.multifamily.applicable, false);
assert.equal(house.best, 'flip'); assert(!house.ranked.includes('rental'));

// 3. A free and clear estate where seller financing is listed.
const estate = exits.evaluate(deepFreeze({ property_type: fact('house', 'public_web_page'), inherited: fact(true, 'probate_record'),
  free_and_clear: fact(true, 'county_record', { evidence_text: 'Release of lien recorded; no open deed of trust found.' }) }), { today });
e = byKey(estate);
assert.equal(e.creative.verdict, 'possible');
assert.deepEqual(e.creative.options.map((o) => [o.kind, o.verdict]), [['seller_financing', 'possible'], ['subject_to', 'no'], ['lease_option', 'needs_data']]);
assert(estate.ranked.includes('creative')); assert.equal(estate.best, 'creative');
assert.match(exits.cardLines(estate).best, /^Best exit: Creative terms$/);
assert.match(e.creative.pitch, /seller financing.*Inherited property/);
assert(e.creative.questions.some((q) => /payments over time/.test(q)));
assert.equal(e.flip.verdict, 'needs_data'); assert.deepEqual(e.flip.missing, ['arv', 'repairs']);
assert.equal(e.creative.numbers.length, 0, 'no dollar figure is invented for creative terms');
// The owner stating openness makes seller financing strong.
assert.equal(byKey(exits.evaluate({ free_and_clear: fact(true, 'county_record'), seller_open_to_terms: fact(true, 'owner_stated') }, { today })).creative.verdict, 'strong');

// Negative: missing rent.
const noRent = { ...twoOne }; delete noRent.monthly_rent;
e = byKey(exits.evaluate(noRent, { today, buyers: [landlord] }));
assert.equal(e.rental.verdict, 'needs_data'); assert.deepEqual(e.rental.missing, ['monthly_rent']);
assert.equal(e.rental.buyer_max, null); assert.deepEqual(e.rental.metrics, {});
assert(e.rental.questions.some((q) => /HUD fair market rent/.test(q)));
assert(!e.rental.numbers.some((n) => n.key === 'cap_rate'));

// Negative: rent with no source, rent from a source that is not allowed, stale rent, future rent.
for (const [rent, reason] of [
  [{ value: 1500, source_kind: 'rental_comps', captured_at: '2026-10-01' }, 'no_source'],
  [{ value: 1500, source_kind: '', source_url: 'https://records.example.test/x', captured_at: '2026-10-01' }, 'no_source'],
  [fact(1500, 'rent_zestimate'), 'source_not_allowed'],
  [fact(1500, 'avm'), 'source_not_allowed'],
  [fact(1500, 'rental_comps', { captured_at: '2024-09-01' }), 'stale'],
  [fact(1500, 'rental_comps', { captured_at: '2026-12-01' }), 'future_capture'],
  [fact(1500, 'rental_comps', { captured_at: 'last week' }), 'no_capture_date'],
  [fact(1500, 'rental_comps', { source_url: 'http://records.example.test/x' }), 'invalid_source_url'],
  [fact('1500', 'rental_comps'), 'invalid_value'], [fact(-1, 'rental_comps'), 'invalid_value'], [fact(NaN, 'rental_comps'), 'invalid_value']
]) {
  const result = exits.evaluate({ ...twoOne, monthly_rent: rent }, { today });
  assert.deepEqual(result.rejected_facts, [{ fact: 'monthly_rent', reason }], JSON.stringify(rent));
  assert.equal(byKey(result).rental.verdict, 'needs_data');
  assert(!('monthly_rent' in result.facts_used));
}

// Negative: a guessed payoff is never used and never shown, not even in the rejection list.
for (const kind of ['original_loan_amount', 'estimated', 'amortization_estimate', 'inferred']) {
  const result = exits.evaluate({ subject_address: subject, arv: arv(200000), loan_rate_pct: fact(3, 'owner_stated'), loan_payoff: fact(123457, kind) }, { today });
  assert.deepEqual(result.rejected_facts, [{ fact: 'loan_payoff', reason: 'payoff_not_stated_by_owner_or_lender' }]);
  assert(!JSON.stringify(result).includes('123457'), kind + ' payoff value leaked');
  assert.equal(byKey(result).creative.options.find((o) => o.kind === 'subject_to').verdict, 'needs_data');
}
// A rate from a typical-rate clue is not the owner's rate (D-010 clue only).
assert.deepEqual(exits.evaluate({ loan_rate_pct: fact(3, 'typical_rate_clue') }, { today }).rejected_facts, [{ fact: 'loan_rate_pct', reason: 'source_not_allowed' }]);
// Owner-stated rate and payoff are used, labeled with their source.
e = byKey(exits.evaluate({ subject_address: subject, arv: arv(200000), loan_rate_pct: fact(3, 'owner_stated'), loan_payoff: fact(90000, 'owner_stated') }, { today }));
assert.equal(e.creative.options.find((o) => o.kind === 'subject_to').verdict, 'possible');
assert(e.creative.numbers.some((n) => n.key === 'loan_payoff' && n.label === 'Loan payoff (owner stated)'));
assert.equal(byKey(exits.evaluate({ subject_address: subject, arv: arv(200000), loan_rate_pct: fact(7.5, 'owner_stated'), loan_payoff: fact(90000, 'owner_stated') }, { today })).creative.options[1].verdict, 'no');

// Negative: ARV from a list price, an AVM or the holder's claim is never ARV.
for (const kind of ['list_price', 'avm', 'zestimate', 'assessed_value', 'tax_value', 'auction_bid', 'claimed_arv', 'rent_estimate']) {
  const result = exits.evaluate({ ...twoOne, arv: fact(150000, kind, { tier: 'verified', comp_count: 3 }) }, { today });
  assert.deepEqual(result.rejected_facts, [{ fact: 'arv', reason: 'arv_needs_comparable_sales' }], kind);
  e = byKey(result);
  for (const key of ['flip', 'brrrr', 'wholetail', 'novation']) { assert.equal(e[key].verdict, 'needs_data'); assert.equal(e[key].buyer_max, null); }
}
// Forged ARV tiers: fewer than 2 comps is no ARV; "verified" with 2 comps is preliminary (D-005).
const good = comps(150000, 3);
for (const forged of [arv(150000, 'verified', 1), arv(150000, 'certain', 3), { ...arv(150000), tier: undefined },
  { ...arv(150000), comps: undefined, comp_count: 3 }, { ...arv(150000, 'verified', 1), comp_count: 3 }, { ...arv(150000), comps: 'three sales' },
  { ...arv(150000), comps: [...good.slice(0, 2), { ...good[2], sold_price: undefined }] },
  { ...arv(150000), comps: [...good.slice(0, 2), { ...good[2], sold_date: '2026-11-01' }] },
  { ...arv(150000), comps: [...good.slice(0, 2), { ...good[2], sold_date: '2026-03-01' }] },
  { ...arv(150000), comps: [...good.slice(0, 2), { ...good[2], source_url: 'http://records.example.test/x' }] },
  { ...arv(150000), comps: [...good.slice(0, 2), { ...good[2], comp_address: '' }] },
  { ...arv(150000), comps: [...good.slice(0, 2), { ...good[2], comp_address: good[0].comp_address.toUpperCase() }] },
  { ...arv(150000), comps: [...good.slice(0, 2), { ...good[2], price_basis: 'texas_last_list_price' }] },
  { ...arv(150000), value: 200000 }]) {
  assert.deepEqual(exits.evaluate({ subject_address: subject, arv: forged }, { today }).rejected_facts, [{ fact: 'arv', reason: 'arv_needs_comparable_sales' }]);
}
// The subject's own sale is never one of its comps, and ARV needs the subject address to check that.
const ownSale = { ...comps(150000, 3)[2], comp_address: '900 Subject Road, Example, FL 33601' };
assert.deepEqual(exits.evaluate({ ...twoOne, arv: { ...arv(150000), comps: [...comps(150000, 2), ownSale] } }, { today }).rejected_facts,
  [{ fact: 'arv', reason: 'arv_needs_comparable_sales' }]);
const noSubject = { ...twoOne }; delete noSubject.subject_address;
assert.deepEqual(exits.evaluate(noSubject, { today }).rejected_facts, [{ fact: 'arv', reason: 'arv_needs_subject_address' }]);
assert.deepEqual(exits.evaluate({ ...twoOne, subject_address: { ...subject, source_kind: '' } }, { today }).rejected_facts,
  [{ fact: 'arv', reason: 'arv_needs_subject_address' }, { fact: 'subject_address', reason: 'no_source' }]);
assert.equal(byKey(exits.evaluate({ ...twoOne, subject_address: fact('901 Subject Rd, Example, FL 33601', 'public_web_page') }, { today })).flip.verdict, 'strong', 'a neighbour is a valid comp');
// A partial subject address can't rule out a self-sale, so it is rejected; so is an unlocated comp at the same number and street.
assert.deepEqual(exits.evaluate({ ...twoOne, subject_address: fact('900 Subject Rd', 'public_web_page') }, { today }).rejected_facts,
  [{ fact: 'arv', reason: 'arv_needs_subject_address' }, { fact: 'subject_address', reason: 'incomplete_address' }]);
assert.deepEqual(exits.evaluate({ ...twoOne, arv: { ...arv(150000), comps: [...comps(150000, 2), { ...ownSale, comp_address: '900 Subject Rd' }] } }, { today }).rejected_facts,
  [{ fact: 'arv', reason: 'arv_needs_comparable_sales' }]);
// Every comp must say it sold, with a recorded-sale basis: an active listing never counts.
for (const patch of [{ sold_status: undefined }, { sold_status: 'Active' }, { sold_status: 'pending' }, { sold_status: '' }, { price_basis: undefined }]) {
  const listing = { ...comps(150000, 3)[2], ...patch };
  for (const key of Object.keys(patch)) if (patch[key] === undefined) delete listing[key];
  assert.deepEqual(exits.evaluate({ ...twoOne, arv: { ...arv(150000), comps: [...comps(150000, 2), listing] } }, { today }).rejected_facts,
    [{ fact: 'arv', reason: 'arv_needs_comparable_sales' }], JSON.stringify(patch));
}
assert.deepEqual(exits.evaluate({ ...twoOne, arv: { ...arv(150000), comps: comps(150000, 3, { sold_status: 'closed' }) } }, { today }).rejected_facts, []);
// Lot values need the subject too, and the lot's own sale never counts.
assert.deepEqual(exits.evaluate({ property_type: fact('lot', 'county_record'), lot_comps_value: fact(70000, 'lot_sale_comps', { comps: comps(70000, 3) }) }, { today }).rejected_facts,
  [{ fact: 'lot_comps_value', reason: 'needs_subject_address' }]);
assert.deepEqual(exits.evaluate({ subject_address: subject, lot_comps_value: fact(70000, 'lot_sale_comps', { comps: [...comps(70000, 2), { ...comps(70000, 3)[2], comp_address: subject.value }] }) }, { today }).rejected_facts,
  [{ fact: 'lot_comps_value', reason: 'needs_comparable_sales' }]);
const prelim = exits.evaluate({ ...twoOne, arv: arv(150000, 'verified', 2) }, { today });
assert.equal(prelim.facts_used.arv.tier, 'preliminary');
assert.match(byKey(prelim).flip.numbers[0].label, /preliminary, 2 sales/);
assert.equal(byKey(prelim).novation.verdict, 'possible', 'retail listing needs a verified value to be strong');
// Ballpark ARV (D-003) never makes a price-based exit strong; an unknown tier such as "rough" is rejected.
assert.equal(byKey(exits.evaluate({ ...twoOne, arv: arv(150000, 'ballpark', 3) }, { today })).flip.verdict, 'possible');
assert.deepEqual(exits.evaluate({ subject_address: subject, arv: arv(150000, 'rough', 2) }, { today }).rejected_facts, [{ fact: 'arv', reason: 'arv_needs_comparable_sales' }]);
// Wrong-origin assessed values, unknown facts and stale comps-based ARV are rejected.
assert.deepEqual(exits.evaluate({ subject_address: subject, assessed_total_value: fact(100000, 'avm'), made_up: fact(1, 'x'), arv: { ...arv(150000), captured_at: '2026-01-01' } }, { today }).rejected_facts,
  [{ fact: 'arv', reason: 'stale' }, { fact: 'assessed_total_value', reason: 'source_not_allowed' }, { fact: 'made_up', reason: 'unknown_fact' }]);

// Weak rent coverage keeps a rental at Possible and says why.
e = byKey(exits.evaluate(fourplex, { today, assumptions: { dscr_rate_pct: 15 } }));
assert.equal(e.rental.verdict, 'possible'); assert.match(e.rental.reason, /covers a DSCR loan less than 1.25 times/);

// Asking unknown: buyer maximums still show, the fee does not, and no offer number is produced.
const noAsk = { ...twoOne }; delete noAsk.asking_price;
e = byKey(exits.evaluate(noAsk, { today }));
assert.equal(e.flip.verdict, 'possible'); assert.equal(e.flip.fee, null); assert.equal(e.flip.buyer_max, 87500);
assert(e.flip.missing.includes('asking_price'));
assert.equal(e.rental.metrics.price, 87500, 'without an asking price the rental is tested at what a flipper pays');
assert(!JSON.stringify(exits.evaluate(noAsk, { today })).match(/"(?:mao|offer|max_offer)"/i));

// Land: builder price first (A-018), signals alone are possible, wholetail needs light repairs.
e = byKey(exits.evaluate({ property_type: fact('vacant land', 'county_record'), builder_price: fact(90000, 'buyer_stated'), asking_price: fact(60000, 'public_web_page') }, { today }));
assert.equal(e.land.verdict, 'strong'); assert.equal(e.land.fee, 30000); assert.equal(e.flip.applicable, false); assert.equal(e.rental.applicable, false);
e = byKey(exits.evaluate({ subject_address: subject, property_type: fact('lot', 'county_record'), lot_comps_value: fact(70000, 'lot_sale_comps', { comps: comps(70000, 3) }), asking_price: fact(50000, 'public_web_page') }, { today }));
assert.equal(e.land.buyer_max, 65000, 'lot sales minus the ~$5k builders expect'); assert.equal(e.land.verdict, 'strong');
// A list price, AVM or tax value never becomes a land price; lot value needs real lot sales.
for (const [name, bad, reason] of [['lot_comps_value', fact(70000, 'list_price', { comps: comps(70000, 3) }), 'source_not_allowed'],
  ['lot_comps_value', fact(70000, 'avm', { comps: comps(70000, 3) }), 'source_not_allowed'], ['lot_comps_value', fact(70000, 'lot_sale_comps', { comps: comps(70000, 1) }), 'needs_comparable_sales'],
  ['lot_comps_value', fact(70000, 'lot_sale_comps', { comp_count: 3 }), 'needs_comparable_sales'],
  ['lot_comps_value', fact(70000, 'lot_sale_comps'), 'needs_comparable_sales'], ['builder_price', fact(90000, 'zestimate'), 'source_not_allowed'],
  ['builder_price', fact(90000, 'list_price'), 'source_not_allowed'], ['new_home_value', fact(400000, 'list_price'), 'source_not_allowed'],
  ['new_home_value', fact(400000, 'assessed_value'), 'source_not_allowed']]) {
  const result = exits.evaluate({ subject_address: subject, property_type: fact('lot', 'county_record'), asking_price: fact(40000, 'public_web_page'), [name]: bad }, { today });
  assert.deepEqual(result.rejected_facts, [{ fact: name, reason }], name + ' ' + bad.source_kind);
  assert.equal(byKey(result).land.buyer_max, null); assert.equal(byKey(result).land.verdict, 'needs_data');
}
e = byKey(exits.evaluate({ assessed_land_value: fact(80000, 'county_record'), assessed_total_value: fact(100000, 'county_record'), builder_activity: fact(4, 'county_record') }, { today }));
assert.equal(e.land.verdict, 'possible'); assert.match(e.land.reason, /80% of the county assessed value.*4 new builds/);
assert(e.land.numbers.every((n) => n.key !== 'buyer_max'), 'assessed values never become a price');
e = byKey(exits.evaluate({ property_type: fact('lot', 'county_record'), new_home_value: fact(400000, 'new_construction_sales'), asking_price: fact(40000, 'public_web_page') }, { today }));
assert.equal(e.land.buyer_max, 80000, 'suburban tier sells at 20% (D-032)'); assert.equal(e.land.verdict, 'possible', '10-15-20 rule alone is rough');
// Only vacant land switches off the house exits; a mobile home on land is still a house.
for (const type of ['land', 'Vacant Land', 'lot', 'vacant lot', 'lots', 'acreage', 'raw land']) assert.equal(byKey(exits.evaluate({ property_type: fact(type, 'county_record') }, { today })).flip.applicable, false, type);
for (const type of ['mobile home on land', 'house on large lot', 'Lakeland bungalow', 'house']) {
  e = byKey(exits.evaluate({ ...twoOne, property_type: fact(type, 'county_record') }, { today }));
  assert.equal(e.flip.applicable, true, type); assert.equal(e.flip.verdict, 'strong', type); assert.equal(e.rental.applicable, true, type);
}
e = byKey(exits.evaluate({ ...twoOne, repairs: fact(9000, 'operator_estimate') }, { today }));
assert.equal(e.wholetail.verdict, 'strong'); assert.equal(e.wholetail.buyer_max, 111000);

// Buyers: below target, unknown metric, future or stale proof of funds, no profile.
const strict = { id: 'b-strict', strategy_profile_source: src, strategy_profile: { strategy: ['rental'], target_return: { basis: 'cap_rate', percent: 12 } } };
const coc = { id: 'b-coc', strategy_profile_source: src, strategy_profile: { strategy: ['rental'], target_return: { basis: 'cash_on_cash', percent: 12 }, funding: ['cash'] } };
const futurePof = { id: 'b-future', strategy_profile_source: src, strategy_profile: { strategy: ['rental'], target_return: { basis: 'cap_rate', percent: 9 }, pof_date: '2026-12-01' } };
const stalePof = { id: 'b-stale', strategy_profile_source: src, strategy_profile: { strategy: ['rental'], target_return: { basis: 'cap_rate', percent: 9 }, pof_date: '2026-01-01' } };
const capFlip = { id: 'b-capflip', strategy_profile_source: src, strategy_profile: { strategy: ['flip'], target_return: { basis: 'cap_rate', percent: 8 } } };
// Hard money (or unstated funding) is not modeled for cash-on-cash yet, so it is unknown, never a pass.
for (const funding of [['hard_money'], undefined]) {
  const hm = { id: 'b-hm', strategy_profile_source: src, strategy_profile: { strategy: ['rental'], target_return: { basis: 'cash_on_cash', percent: 5 }, ...(funding ? { funding } : {}) } };
  assert.deepEqual(byKey(exits.evaluate(fourplex, { today, buyers: [hm] })).rental.matching_buyers.map((b) => [b.return_check, b.rank]), [['unknown', 1]]);
}
e = byKey(exits.evaluate(fourplex, { today, buyers: [strict, coc, futurePof, stalePof, capFlip, { id: 'b-none' }, null] }));
assert.deepEqual(e.rental.matching_buyers.map((b) => [b.id, b.pof_current, b.rank]), [['b-future', false, 2], ['b-stale', false, 2]]);
assert.equal(e.rental.below_target_buyers, 2, 'cash buyer sees unlevered 10.1%, below 12%');
assert.deepEqual(e.flip.matching_buyers.map((b) => [b.id, b.return_check]), [['b-capflip', 'unknown']], 'an unknown return is never a pass');

// Input validation and purity.
for (const bad of [undefined, '2026-13-01', '2026-02-30', 20261022, '10/22/2026']) assert.throws(() => exits.evaluate({}, { today: bad }), /exit_today_required/);
assert.throws(() => exits.evaluate([], { today }), /exit_facts_invalid/);
assert.throws(() => exits.evaluate({}, { today, buyers: {} }), /exit_buyers_invalid/);
for (const bad of [{ target_fee: -1 }, { vacancy_pct: 101 }, { invented: 1 }, { target_fee: '1' }, { target_cap_rate_pct: 0 }, { dscr_term_years: 0 }, [], 'x']) assert.throws(() => exits.evaluate({}, { today, assumptions: bad }), /exit_assumptions_invalid/);
const custom = exits.evaluate(fourplex, { today, assumptions: { target_cap_rate_pct: 12 } });
assert.equal(byKey(custom).rental.buyer_max, round(29072 / 0.12 - 40000));
assert(custom.assumptions.find((item) => item.key === 'target_cap_rate_pct').changed);
function round(value) { return Math.round(value); }
assert.equal(exits.payment(200000, 6, 30).toFixed(2), '1199.10');
assert.equal(exits.payment(120000, 0, 10), 1000);
const empty = exits.evaluate({}, { today });
assert.equal(empty.best, null); assert.equal(exits.cardLines(empty).best, 'Best exit: not enough data yet');
assert.equal(byKey(empty).wholesale_jv.verdict, 'needs_data');

const saved = { fetch: global.fetch, Date: global.Date, write: fs.writeFileSync, append: fs.appendFileSync, request: http.request, secure: https.request };
let effects = 0;
try {
  const deny = () => { effects++; throw new Error('side effect'); };
  const RealDate = saved.Date;
  global.Date = class extends RealDate { constructor(...args) { if (!args.length) deny(); super(...args); } static now() { return deny(); } };
  global.fetch = deny; fs.writeFileSync = deny; fs.appendFileSync = deny; http.request = deny; https.request = deny;
  exits.evaluate(fourplex, { today, buyers }); exits.evaluate(twoOne, { today }); exits.cardLines(plex);
  adapter.fromReviewedDeal({ source_url: 'https://example.test/x', captured_at: '2026-10-01T00:00:00.000Z', repair_estimate: 1 }, { value: {}, asking: 1 });
} finally {
  global.Date = saved.Date; global.fetch = saved.fetch; fs.writeFileSync = saved.write; fs.appendFileSync = saved.append; http.request = saved.request; https.request = saved.secure;
}
assert.equal(effects, 0, 'no clock, network or writes');
assert.equal(exits.evaluate(fourplex, { today, buyers }).best, plex.best, 'same input, same answer');

// Reviewed-deal adapter: ARV only from the reviewed comp grid; claimed ARV and claimed rehab are ignored.
const deal = { address: '900 Subject Rd, Example, FL 33601', source_url: 'https://deals.example.test/post/1', captured_at: '2026-10-10T12:00:00.000Z', evidence_reviewed_at: '2026-10-11T12:00:00.000Z',
  property_type: 'duplex', sqft: 1800, repair_estimate: 30000, claimed_arv: 999999, claimed_rehab: 1, asking_price: 120000 };
const reviewedComps = comps(250000, 3).map((comp, i) => ({ ...comp, sold_price: [240000, 250000, 260000][i], sqft: 1800, distance_miles: 0.4 }));
const reviewed = { asking: 120000, value: { tier: 'Verified', range: { low: 240000, high: 260000 }, comps: reviewedComps }, matches: [{ id: 'buyer-landlord', buyer_ref: 'BUY-0001', name: 'Fixture Landlord' }] };
const mapped = adapter.fromReviewedDeal(deal, reviewed);
assert.equal(mapped.arv.value, 240000); assert.equal(mapped.arv.tier, 'verified'); assert.equal(mapped.arv.comps.length, 3);
assert.deepEqual(Object.keys(mapped.arv.comps[0]).sort(), ['comp_address', 'price_basis', 'sold_date', 'sold_price', 'sold_status', 'source_url']);
assert.equal(mapped.subject_address.value, deal.address);
assert.equal(mapped.repairs.value, 30000); assert.equal(mapped.units.value, 2); assert.equal(mapped.asking_price.value, 120000);
assert(!JSON.stringify(mapped).includes('999999'), 'the holder claim is never ARV');
assert.equal(adapter.fromReviewedDeal({ ...deal }, { ...reviewed, value: { tier: 'Not established', range: null, comps: [] } }).arv, undefined);
assert.equal(adapter.fromReviewedDeal({ ...deal, property_type: '2-4 units' }, reviewed).units, undefined, 'an ambiguous type gives no unit count');
// Texas last list prices are not recorded sales, so they never become ARV here.
const listTier = adapter.fromReviewedDeal({ ...deal }, { ...reviewed, value: { ...reviewed.value, tier: 'Texas list-price', price_basis_label: 'Texas last list prices - not recorded sales' } });
assert.equal(listTier.arv, undefined);
const widerMix = { ...reviewed.value, tier: 'Preliminary', comps: [reviewedComps[0], { ...reviewedComps[2], price_basis: 'texas_last_list_price', area: 'wider' }] };
assert.equal(adapter.fromReviewedDeal({ ...deal }, { ...reviewed, value: widerMix }).arv, undefined, 'a wider-area mix with list prices is not ARV');
assert.equal(adapter.fromReviewedDeal({ ...deal }, { ...reviewed, value: { ...widerMix, comps: [reviewedComps[0], reviewedComps[2]] } }).arv.tier, 'preliminary');
e = byKey(exits.evaluate(listTier, { today }));
for (const key of ['flip', 'brrrr', 'wholetail', 'novation']) { assert.equal(e[key].verdict, 'needs_data'); assert.equal(e[key].buyer_max, null); }
const mappedResult = exits.evaluate(mapped, { today, buyers: adapter.buyersFor(reviewed, [{ id: 'buyer-landlord', assistant_find: { strategy_profile: landlord.strategy_profile } }, { id: 'unmatched', assistant_find: { strategy_profile: flipper.strategy_profile } }]) });
assert.deepEqual(mappedResult.rejected_facts, []); assert.equal(mappedResult.facts_used.arv.comp_count, 3); assert.equal(mappedResult.facts_used.arv.tier, 'verified');
assert.equal(byKey(mappedResult).rental.verdict, 'needs_data', 'reviewed deals carry no rent yet');
const unstated = adapter.fromReviewedDeal(deal, { ...reviewed, value: { ...reviewed.value, comps: reviewedComps.map(({ sold_status, ...comp }) => comp) } });
assert.deepEqual(exits.evaluate(unstated, { today }).rejected_facts, [{ fact: 'arv', reason: 'arv_needs_comparable_sales' }], 'a reviewed comp with no sold status is not a sale');
assert.deepEqual(adapter.buyersFor(reviewed, []).map((b) => [b.id, b.strategy_profile]), [['buyer-landlord', null]]);

console.log('exit-strategies: 4-plex rental beats flip, 2/1 rental fails at the flipper price, free-and-clear estate lists seller financing; missing/unsourced/stale/future rent, guessed payoff never shown, list-price/AVM/claimed ARV rejected, forged comp tiers, buyer target/proof-of-funds matching, ranking, adapter and zero clock/network/write effects passed');
