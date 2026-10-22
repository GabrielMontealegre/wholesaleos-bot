'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), http = require('node:http'), https = require('node:https');
const planner = require('../modules/deals/negotiation-planner');

const today = '2026-10-22';
const comp = (n, extra = {}) => ({ address: `${100 + n} Fixture St`, sold_price: 200000, sold_date: '2026-08-0' + n,
  source_url: `https://records.example.gov/sales/${n}`, ...extra });
const signal = kind => ({ kind, source_kind: 'county_record', source_url: `https://records.example.gov/${kind}` });
// Value 200k from 3 sold comps, repairs 30k: default buyer max (75%) = 120k.
function facts(extra = {}) {
  return {
    subject_address: '1 Subject Ln',
    arv: { value: 200000, source_kind: 'sold_comps', comp_count: 3, comps: [comp(1), comp(2), comp(3)] },
    repairs: { value: 30000, source_kind: 'contractor_bid' },
    distress_signals: [signal('vacant'), signal('taxes_owed')],
    seller: { number_asked: true },
    offers: [], buyer_numbers: [], buyers: [], new_defects: [],
    ...extra
  };
}
const buyer = (amount, extra = {}) => ({ buyer_id: 'B1', amount, captured_at: '2026-10-12', source_kind: 'buyer_email',
  proof_of_funds: true, ...extra });
const run = (f, o = {}) => planner.plan(f, { today, ...o });

function walk(value, visit, path = '') {
  visit(value, path);
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, visit, path + '.' + k);
}
function noPrices(out) {
  walk(out, (v, path) => {
    if (typeof v === 'number') assert.ok(v < 1000, `price-like number at ${path}`);
    if (typeof v === 'string') assert.ok(!v.includes('$'), `dollar text at ${path}`);
  });
}
const outputs = [];
const record = out => (outputs.push(out), out);

const original = { fetch: global.fetch, hg: http.get, hr: http.request, sg: https.get, sr: https.request,
  write: fs.writeFileSync, writeAsync: fs.writeFile, append: fs.appendFileSync, Date: global.Date };
let effects = 0;
const denied = () => { effects++; throw Error('network/clock/write forbidden'); };
try {
  global.fetch = http.get = http.request = https.get = https.request = fs.writeFileSync = fs.writeFile = fs.appendFileSync = denied;
  global.Date = class extends original.Date {
    constructor(...args) { if (!args.length) denied(); super(...args); }
    static now() { return denied(); }
  };

  // Seller number unknown -> ask first, no price anywhere in the output.
  let out = record(run(facts({ seller: { number_asked: false }, buyer_numbers: [buyer(130000)] })));
  assert.equal(out.next_move.code, 'ask_seller_number');
  assert.equal(out.prices_withheld, true);
  assert.equal(out.seller_side, null); assert.equal(out.buyer_side, null);
  noPrices(out);
  // A forged seller number (future, no source, ambiguous date) does not count as asked.
  for (const stated of [{ value: 90000, captured_at: '2026-11-01', source_kind: 'seller_call' },
    { value: 90000, captured_at: '2026-10-20' }, { value: 90000, captured_at: '10/20/2026', source_kind: 'seller_call' },
    { value: '90000', captured_at: '2026-10-20', source_kind: 'seller_call' }]) {
    out = record(run(facts({ seller: { stated_number: stated } })));
    assert.equal(out.next_move.code, 'ask_seller_number');
    noPrices(out);
  }

  // Distress sizing (#400 part 3).
  out = record(run(facts({ buyer_numbers: [buyer(130000)] })));
  assert.equal(out.seller_side.distress_tier, '2 signals');
  assert.equal(out.seller_side.opening.value, 70000);
  assert.equal(out.seller_side.target.value, 80000);
  assert.equal(out.seller_side.walk_away.value, 120000, 'best buyer number minus $10k');
  assert.equal(out.next_move.code, 'open_offer'); assert.equal(out.next_move.amount, 70000);
  out = record(run(facts({ distress_signals: ['vacant', 'taxes_owed', 'code_case', 'long_ownership'].map(signal), buyer_numbers: [buyer(130000)] })));
  assert.equal(out.seller_side.distress_tier, '3+ signals');
  assert.equal(out.seller_side.opening.value, 50000); assert.equal(out.seller_side.target.value, 70000);
  out = record(run(facts({ distress_signals: [signal('vacant')], buyers: [{ buyer_id: 'B1', holding_teaser_at: '2026-10-20' }, { buyer_id: 'B2', holding_teaser_at: '2026-10-21' }] })));
  assert.equal(out.seller_side.distress_tier, '0-1 signals');
  assert.equal(out.seller_side.opening.value, 90000);
  assert.equal(out.seller_side.target.value, 100000, 'buyer max minus $20k');
  assert.equal(out.seller_side.walk_away.value, 105000, 'buyer max minus $15k without a buyer number');
  assert.equal(out.next_move.code, 'open_offer', '2 buyers holding the teaser unlock an offer');
  // Signals without a source, unknown kinds and duplicates do not count.
  out = record(run(facts({ distress_signals: [signal('vacant'), signal('vacant'), { kind: 'taxes_owed', source_kind: 'county_record' },
    { kind: 'divorce', source_kind: 'x', source_url: 'https://x.example' }, { kind: 'code_case', source_url: 'https://x.example' }], buyer_numbers: [buyer(130000)] })));
  assert.equal(out.distress.count, 1);
  assert.equal(out.ignored_inputs.filter(i => i.field.startsWith('distress_signals')).length, 3);

  // Buyers first: no offer without a current buyer number or 2+ buyers holding the teaser.
  out = record(run(facts()));
  assert.equal(out.next_move.code, 'send_to_buyers_first'); assert.equal(out.next_move.amount, null);
  out = record(run(facts({ buyers: [{ buyer_id: 'B1', holding_teaser_at: '2026-10-20' }, { buyer_id: 'B1', holding_teaser_at: '2026-10-21' }] })));
  assert.equal(out.next_move.code, 'send_to_buyers_first', 'the same buyer twice is one buyer');
  out = record(run(facts({ buyers: [{ buyer_id: 'B1', holding_teaser_at: '2026-10-20' }, { buyer_id: 'B2', holding_teaser_at: '2026-08-01' }] })));
  assert.equal(out.next_move.code, 'send_to_buyers_first', 'a stale teaser hold does not count');
  // Buyer number without id, stale (>30 days), future, ambiguous date, no source: ignored.
  for (const bad of [buyer(130000, { buyer_id: '' }), buyer(130000, { buyer_id: undefined }), buyer(130000, { captured_at: '2026-09-21' }),
    buyer(130000, { captured_at: '2026-11-02' }), buyer(130000, { captured_at: '10/12/2026' }), buyer(130000, { source_kind: '' }),
    buyer(-5), buyer('130000')]) {
    out = record(run(facts({ buyer_numbers: [bad] })));
    assert.equal(out.next_move.code, 'send_to_buyers_first', JSON.stringify(bad));
    assert.ok(out.ignored_inputs.some(i => i.field === 'buyer_numbers[0]'));
    assert.equal(out.seller_side.walk_away.value, 105000, 'ignored buyer number never sets the walk-away');
  }
  // Exactly 30 days old still counts; 31 does not.
  assert.equal(run(facts({ buyer_numbers: [buyer(130000, { captured_at: '2026-09-22' })] })).next_move.code, 'open_offer');
  assert.equal(run(facts({ buyer_numbers: [buyer(130000, { captured_at: '2026-09-21' })] })).next_move.code, 'send_to_buyers_first');

  // Buyer number below our open -> walk or hold, never an offer above buyer number minus $10k.
  for (const [signals, number] of [[[signal('vacant')], 95000], [[signal('vacant'), signal('taxes_owed')], 75000], [[], 20000], [[], 5000]]) {
    out = record(run(facts({ distress_signals: signals, buyer_numbers: [buyer(number)] })));
    assert.ok(['walk', 'hold_backup'].includes(out.next_move.code), `${number}: ${out.next_move.code}`);
    assert.ok(out.next_move.amount === null || out.next_move.amount <= number - 10000);
  }
  assert.equal(run(facts({ distress_signals: [], buyer_numbers: [buyer(5000)] })).next_move.code, 'walk');
  // ...unless the seller's own number already fits under that limit.
  out = record(run(facts({ distress_signals: [signal('vacant')], buyer_numbers: [buyer(95000)],
    seller: { stated_number: { value: 80000, captured_at: '2026-10-15', source_kind: 'seller_call' } } })));
  assert.equal(out.next_move.code, 'open_offer'); assert.equal(out.next_move.amount, 80000);
  // With an offer out and a low buyer number, never counter past buyer number minus $10k.
  out = record(run(facts({ buyer_numbers: [buyer(85000)], offers: [{ amount: 80000, date: '2026-10-10' }],
    seller: { stated_number: { value: 100000, captured_at: '2026-10-14', source_kind: 'seller_call' } } })));
  assert.equal(out.next_move.code, 'hold_backup'); assert.equal(out.next_move.amount, null);

  // Counter ladder from $80k -> next step <= $88k, soft phrase.
  const counterFacts = (last, said, extra = {}) => facts({ buyer_numbers: [buyer(130000)], offers: [{ amount: last, date: '2026-10-10' }],
    seller: { stated_number: { value: said, captured_at: '2026-10-14', source_kind: 'agent_email' } }, ...extra });
  out = record(run(counterFacts(80000, 110000)));
  assert.equal(out.next_move.code, 'counter');
  assert.equal(out.next_move.amount, 84000);
  assert.equal(out.next_move.phrase, 'around $84k (mid 80s)');
  assert.ok(!out.next_move.phrase.includes('84,000'));
  out = record(run(counterFacts(80000, 110000, { other_offer: true })));
  assert.equal(out.next_move.amount, 88000, 'another offer allows the 10% maximum step');
  assert.match(out.next_move.phrase, /^around \$88k \(high 80s\)$/);
  // Walk the whole ladder: every step is 5-10%, never above our limit or the seller's number, then we stop.
  for (const other of [false, true]) {
    let last = 70000, rounds = 0, finalCode;
    for (;;) {
      out = record(run(counterFacts(last, 150000, { other_offer: other })));
      if (out.next_move.code !== 'counter') { finalCode = out.next_move.code; break; }
      const next = out.next_move.amount, step = (next - last) / last;
      assert.ok(next <= last * 1.10 + 1e-9, `step ${step} above 10%`);
      assert.ok(next <= out.seller_side.walk_away.value);
      assert.ok(step >= 0.05 - 1e-9 || next === out.seller_side.walk_away.value, `step ${step} below 5% before the limit`);
      last = next; rounds++;
      assert.ok(rounds < 20);
    }
    assert.equal(last, 120000, 'ladder ends exactly at the walk-away'); assert.equal(finalCode, 'hold_backup');
  }
  out = record(run(counterFacts(80000, 82000)));
  assert.equal(out.next_move.amount, 82000, 'never counter above the seller number');
  out = record(run(counterFacts(80000, 78000)));
  assert.equal(out.next_move.code, 'open_offer'); assert.equal(out.next_move.amount, 78000);
  // The seller has not answered our last offer -> do not raise against ourselves (same-day dates are ambiguous).
  for (const said of ['2026-10-09', '2026-10-10']) {
    out = record(run(facts({ buyer_numbers: [buyer(130000)], offers: [{ amount: 80000, date: '2026-10-10' }],
      seller: { stated_number: { value: 110000, captured_at: said, source_kind: 'agent_email' } } })));
    assert.equal(out.next_move.code, 'hold_backup'); assert.equal(out.next_move.amount, null);
  }
  out = record(run(facts({ buyer_numbers: [buyer(130000)], offers: [{ amount: 80000, date: '2026-10-10T15:00:00Z' }],
    seller: { stated_number: { value: 110000, captured_at: '2026-10-10T18:30:00Z', source_kind: 'agent_email' } } })));
  assert.equal(out.next_move.code, 'counter', 'a timed answer after the offer is a response');
  // Forged offers (future, ambiguous, non-numeric) are not offer history.
  out = record(run(facts({ buyer_numbers: [buyer(130000)], offers: [{ amount: 80000, date: '2026-12-01' }, { amount: 80000, date: '10/10/2026' }, { amount: 'x', date: '2026-10-10' }] })));
  assert.equal(out.next_move.code, 'open_offer'); assert.equal(out.seller_side.last_offer, null);

  // Inspection adds $40k repairs -> renegotiate down, itemized, new target lower.
  const defect = (item, cost, extra = {}) => ({ item, cost, source_kind: 'inspection', evidence: 'Inspection report page 4', captured_at: '2026-10-20', ...extra });
  out = record(run(facts({ buyer_numbers: [buyer(130000)], offers: [{ amount: 80000, date: '2026-10-10' }],
    seller: { stated_number: { value: 80000, captured_at: '2026-10-11', source_kind: 'seller_call' } },
    new_defects: [defect('Foundation repair', 25000), defect('Roof replacement', 15000)] })));
  assert.equal(out.next_move.code, 'renegotiate_down_for_defects');
  assert.match(out.next_move.reason, /Foundation repair \(\$25,000\)/);
  assert.match(out.next_move.reason, /Roof replacement \(\$15,000\)/);
  assert.equal(out.renegotiation.defects_total, 40000);
  assert.equal(out.renegotiation.previous_target, 80000);
  assert.equal(out.renegotiation.new_target, 40000);
  assert.ok(out.renegotiation.new_target < out.renegotiation.previous_target);
  assert.equal(out.next_move.amount, 40000);
  assert.equal(out.renegotiation.proposed.label, 'derived');
  // A buyer number from before the inspection does not cover the new repairs: the limit drops with them.
  out = record(run(facts({ buyer_numbers: [buyer(130000)], offers: [{ amount: 100000, date: '2026-10-10' }],
    seller: { stated_number: { value: 100000, captured_at: '2026-10-11', source_kind: 'seller_call' } },
    new_defects: [defect('Foundation repair', 25000)] })));
  assert.equal(out.seller_side.walk_away.value, 95000, 'buyer number 130k less 25k found after it, less 10k');
  assert.equal(out.next_move.amount, 75000);
  assert.ok(out.warnings.some(w => /after the best buyer number/.test(w)));
  out = record(run(facts({ buyer_numbers: [buyer(105000, { captured_at: '2026-10-21' })], offers: [{ amount: 100000, date: '2026-10-10' }],
    seller: { stated_number: { value: 100000, captured_at: '2026-10-11', source_kind: 'seller_call' } },
    new_defects: [defect('Foundation repair', 25000)] })));
  assert.equal(out.seller_side.walk_away.value, 95000, 'a buyer number given after the inspection already prices it');
  assert.equal(out.next_move.amount, 75000);
  // Defects without a source, cost or valid date are ignored.
  out = record(run(facts({ buyer_numbers: [buyer(130000)], offers: [{ amount: 80000, date: '2026-10-10' }],
    seller: { stated_number: { value: 90000, captured_at: '2026-10-11', source_kind: 'seller_call' } },
    new_defects: [defect('Roof', 15000, { evidence: '' }), defect('HVAC', 0), defect('Plumbing', 5000, { captured_at: '2026-12-01' }), defect('', 5000)] })));
  assert.equal(out.next_move.code, 'counter');
  assert.equal(out.ignored_inputs.filter(i => i.field.startsWith('new_defects')).length, 4);

  // Value gate: list price / AVM / estimates are never a value from comps; no value = no offer.
  for (const kind of planner.NOT_ARV.concat(['operator_guess', ''])) {
    out = record(run(facts({ arv: { value: 200000, source_kind: kind, comp_count: 3 }, buyer_numbers: [buyer(130000)] })));
    assert.equal(out.status, 'no_offer', kind);
    assert.equal(out.seller_side, null); assert.equal(out.buyer_side, null);
    assert.equal(out.next_move.amount, null);
    assert.notEqual(out.next_move.code, 'open_offer');
  }
  assert.ok(run(facts({ arv: { value: 200000, source_kind: 'zestimate' } })).ignored_inputs.some(i => /never a value from sold comps/.test(i.reason)));
  // Comp counts are proven by the comps themselves.
  out = record(run(facts({ arv: { value: 200000, source_kind: 'sold_comps', comp_count: 3, status: 'verified',
    comps: [comp(1), comp(2), comp(3, { source_url: '' })] }, buyer_numbers: [buyer(130000)] })));
  assert.equal(out.arv.status, 'preliminary'); assert.equal(out.arv.comp_count, 2);
  assert.ok(out.warnings.some(w => /Preliminary/.test(w)));
  assert.ok(out.ignored_inputs.some(i => i.field === 'arv.comp_count'));
  walk(out, v => { if (v && v.label === 'derived') assert.equal(v.preliminary, true); });
  for (const comps of [[comp(1), comp(2, { address: '1 Subject Ln' }), comp(3, { sold_date: '2026-12-01' })],
    [comp(1), comp(1), comp(2, { sold_date: '08/02/2026' })], [comp(1), comp(2, { sold_price: null }), comp(3, { address: '' })]]) {
    out = record(run(facts({ arv: { value: 200000, source_kind: 'sold_comps', comp_count: 3, comps }, buyer_numbers: [buyer(130000)] })));
    assert.equal(out.status, 'no_offer', 'own sale, duplicates, future, ambiguous or incomplete comps do not count');
  }
  out = record(run(facts({ arv: { value: 200000, source_kind: 'sold_comps', comp_count: 2, status: 'verified' }, buyer_numbers: [buyer(130000)] })));
  assert.equal(out.arv.status, 'preliminary');
  // Missing repairs or value: no price, still asks first when the seller has not been asked.
  out = record(run(facts({ repairs: null, buyer_numbers: [buyer(130000)] })));
  assert.equal(out.status, 'no_offer'); assert.equal(out.next_move.code, 'hold_backup'); assert.equal(out.next_move.amount, null);
  out = record(run(facts({ arv: null, seller: {} })));
  assert.equal(out.next_move.code, 'ask_seller_number'); noPrices(out);
  // No room at all -> walk.
  out = record(run(facts({ repairs: { value: 200000, source_kind: 'inspection' } })));
  assert.equal(out.next_move.code, 'walk');

  // Buyer side: asking price above target (never below target + fee), push a little only on a fast answer above target.
  out = record(run(facts({ buyer_numbers: [buyer(130000, { response_hours: 3 })], buyers: [{ buyer_id: 'B2', arv_pct: 0.8 }, { buyer_id: 'B3', arv_pct: 1.4 }] })));
  assert.equal(out.buyer_side.asking_price.value, 120000);
  assert.ok(out.buyer_side.asking_price.value >= out.seller_side.target.value + planner.MIN_FEE);
  assert.equal(out.buyer_side.push_a_little.low.value, 134000);
  assert.equal(out.buyer_side.push_a_little.high.value, 136500);
  const b2 = out.buyer_side.buyers.find(b => b.buyer_id === 'B2'), b3 = out.buyer_side.buyers.find(b => b.buyer_id === 'B3');
  assert.equal(b2.buyer_max.value, 130000, "buyer's own percentage of value");
  assert.equal(b3, undefined, 'an impossible percentage is ignored');
  assert.equal(out.buyer_side.buyers.find(b => b.buyer_id === 'B1').proof_of_funds, true);
  out = record(run(facts({ buyer_numbers: [buyer(130000)] })));
  assert.equal(out.buyer_side.push_a_little, null, 'no push without a fast answer');
  out = record(run(facts({ buyer_numbers: [buyer(130000), buyer(70000, { buyer_id: 'B2', response_hours: 1 })] })));
  assert.equal(out.buyer_side.push_a_little, null, 'no push when the fast answer is below our target');
  out = record(run(facts({ buyer_numbers: [buyer(130000)] }), { min_fee: 45000 }));
  assert.equal(out.buyer_side.asking_price.value, 125000, 'target plus a larger fee lifts the asking price');
  assert.equal(out.seller_side.walk_away.value, 85000, 'a larger fee lowers the walk-away');
  assert.equal(run(facts({ buyer_numbers: [buyer(130000)] }), { min_fee: 1000 }).seller_side.walk_away.value, 120000, 'fee below $10k is not accepted');
  out = record(run(facts({ buyer_numbers: [buyer(130000, { proof_of_funds: false })] })));
  assert.ok(out.warnings.some(w => /proof of funds/.test(w)));

  // Preliminary value is flagged on every number; a long time on market shows in the talking points.
  out = record(run(facts({ arv: { value: 200000, source_kind: 'sold_comps', comps: [comp(1), comp(2)] }, days_on_market: 120, buyer_numbers: [buyer(130000)] })));
  assert.equal(out.arv.status, 'preliminary');
  assert.ok(out.next_move.talking_points.some(t => /preliminary/.test(t)));
  assert.ok(out.next_move.talking_points.some(t => /120 days/.test(t)));

  // Bad clock input.
  for (const bad of [undefined, '', '10/22/2026', '2026-02-30', '2026-10-22T00:00:00Z']) {
    const r = planner.plan(facts(), { today: bad });
    assert.equal(r.ok, false); assert.equal(r.error, 'today_required'); assert.equal(r.next_move, null);
  }
  assert.equal(planner.plan(null, { today }).next_move.code, 'ask_seller_number');

  // Inputs are never mutated.
  const frozen = facts({ buyer_numbers: [buyer(130000)], offers: [{ amount: 80000, date: '2026-10-10' }],
    seller: { stated_number: { value: 110000, captured_at: '2026-10-14', source_kind: 'agent_email' } }, new_defects: [defect('Roof', 15000)] });
  const before = JSON.stringify(frozen);
  (function deepFreeze(o) { Object.freeze(o); Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v)); })(frozen);
  record(run(frozen));
  assert.equal(JSON.stringify(frozen), before);

  // Every output: a known move, every number labeled, no deposit from Gabriel, nothing like "my buyer pays",
  // and the seller-facing words never reveal our limit or a buyer's number.
  const deposits = facts({ buyer_numbers: [buyer(130000)], deposit_requested: 5000, earnest_money: 2000, seller: { number_asked: true, wants_deposit: 3000 } });
  out = record(run(deposits));
  assert.equal(out.deposit, 'No deposit from Gabriel. Any deposit is buyer-funded at assignment (D-059).');
  for (const o of outputs) {
    if (!o.ok) continue;
    assert.ok(planner.MOVES.includes(o.next_move.code), o.next_move.code);
    assert.equal(o.deposit, 'No deposit from Gabriel. Any deposit is buyer-funded at assignment (D-059).');
    walk(o, (v, path) => {
      if (/deposit|earnest/i.test(path) && path !== '.deposit') assert.fail(`deposit field ${path}`);
      if (typeof v === 'string' && path !== '.deposit') {
        assert.ok(!/deposit|earnest/i.test(v), `deposit text at ${path}`);
        assert.ok(!/buyer (pays|will pay)|my buyer/i.test(v), `buyer price talk at ${path}`);
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.value === 'number' && !path.endsWith('.inputs')) {
        assert.ok(['derived', 'our offer history', 'seller stated', 'buyer stated'].includes(v.label), `unlabeled number at ${path}`);
        if (v.label === 'derived') { assert.ok(v.basis); assert.ok(v.inputs); }
      }
    });
    const spoken = [o.next_move.reason, o.next_move.phrase || '', ...o.next_move.talking_points].join(' ');
    const secret = [o.seller_side?.walk_away?.value, ...(o.buyer_side?.buyers || []).map(b => b.current_number?.value)].filter(Boolean);
    for (const n of secret) assert.ok(!spoken.includes(n.toLocaleString('en-US')), `seller-facing text reveals ${n}`);
  }

  assert.equal(effects, 0);
  console.log(`Negotiation planner: ask-first with no prices, buyers-first gate, #400 distress sizing, walk-away caps, 5-10% soft counter ladder stopping at the limit, ` +
    `no raising against ourselves, defect renegotiation, value-from-comps gate, forged/stale/future/ambiguous/missing inputs, ` +
    `no deposit from Gabriel, labeled numbers, no mutation and zero network/clock/writes passed (${outputs.length} plans).`);
} finally {
  global.fetch = original.fetch; http.get = original.hg; http.request = original.hr; https.get = original.sg; https.request = original.sr;
  fs.writeFileSync = original.write; fs.writeFile = original.writeAsync; fs.appendFileSync = original.append; global.Date = original.Date;
}
