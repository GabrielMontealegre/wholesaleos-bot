'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs');
const { calculate, compare } = require('../modules/deals/financing-scenarios');
const input = { price: 250000, down_payment: 50000, annual_rate_percent: 6, term_years: 30, interest_only_months: 0,
  balloon_year: 5, closing_costs: 10000, annual_noi: 24000 };
const before = JSON.stringify(input), fixed = calculate(Object.freeze(input));
assert.deepEqual(fixed.errors, []); assert.deepEqual(fixed.missing, []);
assert.equal(fixed.loan_amount, 200000); assert.equal(fixed.monthly_payment, 1199.10);
assert.equal(fixed.first_year_debt_service, 14389.21); assert.equal(fixed.balloon_balance, 186108.71);
assert.equal(fixed.monthly_cash_flow, 800.90); assert.equal(fixed.yearly_cash_flow, 9610.79);
assert.equal(fixed.cash_invested, 60000); assert.equal(fixed.balance_at_amortization_end, 0);
assert.equal(fixed.source_kind, 'scenario_calculation'); assert.equal(fixed.verified, false); assert.equal(fixed.is_offer, false);
assert.equal(JSON.stringify(input), before);
assert(calculate({ ...input, other_initial_cash: 20000 }).cash_on_cash_percent < fixed.cash_on_cash_percent);
assert.equal(calculate({ ...input, other_initial_cash: 20000 }).cash_invested, 80000);
const zero = calculate({ ...input, price: 120000, down_payment: 0, annual_rate_percent: 0, term_years: 10, balloon_year: 3, closing_costs: 0, annual_noi: 18000 });
assert.equal(zero.monthly_payment, 1000); assert.equal(zero.balloon_balance, 84000); assert.equal(zero.dscr, 1.5);
assert.equal(zero.yearly_cash_flow, 6000); assert.equal(zero.cash_on_cash_percent, null, 'zero cash invested has no finite return ratio');
assert.equal(zero.one_point_lower_rate.monthly_savings, 0);
const only = calculate({ ...input, interest_only_months: 360 });
assert.equal(only.monthly_payment, 1000); assert.equal(only.balloon_balance, 200000);
assert.equal(only.balance_at_amortization_end, 200000); assert.equal(only.amortizing_monthly_payment, null);
assert.equal(only.first_year_debt_service, 12000);
const transition = calculate({ ...input, interest_only_months: 6 });
const amortizing = calculate({ ...input, term_years: 29.5, interest_only_months: 0 });
assert.equal(transition.amortizing_monthly_payment, amortizing.monthly_payment);
assert(Math.abs(transition.first_year_debt_service - (6000 + amortizing.monthly_payment * 6)) < 0.04, 'first year includes the payment change, not 12 initial payments');
const cash = calculate({ price: 100000, down_payment: 100000, closing_costs: 5000, annual_noi: 10000 });
assert.equal(cash.monthly_payment, 0); assert.equal(cash.yearly_cash_flow, 10000); assert.equal(cash.dscr, null);
assert.equal(cash.cash_on_cash_percent, 9.5238);
const rent = { ...input }; delete rent.annual_noi;
assert.equal(calculate({ ...rent, monthly_rent: 2500, monthly_operating_expenses: 500 }).yearly_cash_flow, fixed.yearly_cash_flow);
assert.equal(calculate({ ...rent, monthly_rent: 2500 }).yearly_cash_flow, null, 'missing expenses never become zero');
assert(calculate({ ...input, annual_noi: -1000 }).yearly_cash_flow < 0, 'losses are not clamped away');
const missing = calculate({ price: 250000, down_payment: 50000 });
assert.equal(missing.monthly_payment, null); assert(missing.missing.includes('annual_rate_percent')); assert(missing.missing.includes('term_years'));
assert.equal(calculate({ ...rent, closing_costs: null }).cash_on_cash_percent, null);
for (const patch of [{ price: '250000' }, { annual_rate_percent: NaN }, { annual_rate_percent: Infinity }, { term_years: 0 },
  { term_years: 1.01 }, { balloon_year: 31 }, { interest_only_months: 361 }, { interest_only_months: 1.5 },
  { down_payment: 250001 }, { monthly_rent: 2500 }, { closing_costs: -1 }, { other_initial_cash: -1 }, { unknown_field: 1 }, { verified: true, source_kind: 'public_record' }]) {
  const result = calculate({ ...input, ...patch }); assert(result.errors.length, JSON.stringify(patch)); assert.equal(result.monthly_payment, null);
}
for (const value of [null, [], 'input', 1]) assert(calculate(value).errors.includes('scenario_invalid'));
for (const rate of [0, 0.00000001, 3, 6, 12, 100]) for (const years of [1, 5, 30, 100]) {
  const result = calculate({ ...input, annual_rate_percent: rate, term_years: years, balloon_year: years });
  assert(Number.isFinite(result.monthly_payment)); assert.equal(result.balloon_balance, 0);
  assert(result.one_point_lower_rate.monthly_savings >= 0);
}
assert.equal(compare([{ kind: 'bank', inputs: input }, { kind: 'seller_financing', inputs: { ...input, annual_rate_percent: 4 } },
  { kind: 'assumable', inputs: { ...input, annual_rate_percent: 3 } }]).scenarios.length, 3);
for (const scenarios of [[], null, [{ kind: 'invented', inputs: input }], [{ kind: 'bank', approval: true }], [{ kind: 'bank' }, { kind: 'bank' }]]) assert(compare(scenarios).errors.length);
const saved = { fetch: global.fetch, clock: Date.now, write: fs.writeFileSync }; let effects = 0;
try { const deny = () => { effects++; throw Error('side effect'); }; global.fetch = deny; Date.now = deny; fs.writeFileSync = deny;
  calculate(input); compare([{ kind: 'bank', inputs: input }]); }
finally { global.fetch = saved.fetch; Date.now = saved.clock; fs.writeFileSync = saved.write; }
assert.equal(effects, 0);
// Independent monthly recurrence checks the closed-form balance at ordinary rates.
for (const rate of [0, 3, 6, 12]) for (const balloon of [1, 5, 10]) {
  const scenario = calculate({ ...input, annual_rate_percent: rate, balloon_year: balloon });
  const monthlyRate = rate / 1200;
  const factor = (1 + monthlyRate) ** 360;
  const monthly = rate ? 200000 * monthlyRate * factor / (factor - 1) : 200000 / 360;
  let remaining = 200000;
  for (let month = 0; month < balloon * 12; month++) remaining = remaining * (1 + monthlyRate) - monthly;
  assert(Math.abs(scenario.balloon_balance - remaining) < 0.01);
}
console.log('Financing scenarios: fixed/zero/interest-only/transition/cash/balloon math, missing/conflicting/invalid inputs, retained losses, rate sensitivity, comparison and zero side effects passed.');
