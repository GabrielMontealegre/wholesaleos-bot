'use strict';

const FIELDS = new Set(['price', 'down_payment', 'annual_rate_percent', 'term_years', 'interest_only_months',
  'balloon_year', 'closing_costs', 'other_initial_cash', 'annual_noi', 'monthly_rent', 'monthly_operating_expenses']);
const KINDS = ['bank', 'seller_financing', 'assumable'];
const round = (value, places = 2) => Number.isFinite(value) ? Number(value.toFixed(places)) : null;
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const months = years => Number.isInteger(years * 12) ? years * 12 : null;

function payment(principal, rate, count) {
  if (!principal) return 0;
  return rate === 0 ? principal / count : principal * rate / -Math.expm1(-count * Math.log1p(rate));
}
function balance(principal, rate, count, paid) {
  if (paid >= count) return 0;
  if (rate === 0) return principal * (count - paid) / count;
  // Equivalent to the usual balance formula, without subtracting large near-equal values.
  return principal * -Math.expm1((paid - count) * Math.log1p(rate)) / -Math.expm1(-count * Math.log1p(rate));
}
function calculate(input = {}) {
  const result = { source_kind: 'scenario_calculation', label: 'Modeled financing scenario', verified: false, is_offer: false,
    errors: [], missing: [], assumptions: ['Fixed interest rate; monthly payments.', 'Loan payments contain principal and interest only.',
      'Operating income must already deduct all operating expenses.', 'First-year returns exclude balloon payoffs, resale, refinancing and taxes on income.'],
    loan_amount: null, monthly_payment: null, amortizing_monthly_payment: null, first_year_debt_service: null,
    monthly_cash_flow: null, yearly_cash_flow: null, cash_invested: null, cash_on_cash_percent: null, dscr: null,
    balloon_balance: null, balance_at_amortization_end: null, one_point_lower_rate: null };
  if (!input || typeof input !== 'object' || Array.isArray(input)) { result.errors.push('scenario_invalid'); return result; }
  if (Object.keys(input).some(key => !FIELDS.has(key))) result.errors.push('unknown_fields');
  const limits = { price: [0.01, 1e9], down_payment: [0, 1e9], annual_rate_percent: [0, 100], term_years: [1, 100],
    interest_only_months: [0, 1200], balloon_year: [1, 100], closing_costs: [0, 1e9], other_initial_cash: [0, 1e9], annual_noi: [-1e9, 1e9],
    monthly_rent: [0, 1e8], monthly_operating_expenses: [0, 1e8] };
  for (const [key, bounds] of Object.entries(limits)) if (input[key] != null && !number(input[key], ...bounds)) result.errors.push(key + '_invalid');
  const term = input.term_years == null ? null : months(input.term_years);
  const balloon = input.balloon_year == null ? null : months(input.balloon_year);
  const io = input.interest_only_months == null ? 0 : input.interest_only_months;
  if (input.term_years != null && term == null) result.errors.push('term_months_invalid');
  if (input.balloon_year != null && balloon == null) result.errors.push('balloon_months_invalid');
  if (!Number.isInteger(io) || term != null && io > term) result.errors.push('interest_only_period_invalid');
  if (balloon != null && term != null && balloon > term) result.errors.push('balloon_outside_term');
  if (input.price != null && input.down_payment != null && input.down_payment > input.price) result.errors.push('down_payment_exceeds_price');
  if (input.annual_noi != null && (input.monthly_rent != null || input.monthly_operating_expenses != null)) result.errors.push('income_basis_conflict');
  if (result.errors.length) return result;
  for (const key of ['price', 'down_payment']) if (input[key] == null) result.missing.push(key);
  if (input.closing_costs == null) result.missing.push('closing_costs');
  const noi = input.annual_noi != null ? input.annual_noi : input.monthly_rent != null && input.monthly_operating_expenses != null ?
    12 * (input.monthly_rent - input.monthly_operating_expenses) : null;
  if (noi == null) result.missing.push('operating_income');
  if (input.interest_only_months == null) result.assumptions.push('No interest-only period modeled because none was supplied.');
  else if (io) result.assumptions.push('Interest-only months are inside the supplied amortization term; remaining months repay principal.');
  const otherCash = input.other_initial_cash == null ? 0 : input.other_initial_cash;
  if (input.other_initial_cash == null) result.assumptions.push('No additional initial cash modeled; repairs, reserves and other upfront costs must be supplied separately.');
  if (input.price == null || input.down_payment == null) return result;
  const principal = input.price - input.down_payment;
  result.loan_amount = round(principal);
  if (input.closing_costs != null) result.cash_invested = round(input.down_payment + input.closing_costs + otherCash);
  if (principal > 0) for (const key of ['annual_rate_percent', 'term_years']) if (input[key] == null) result.missing.push(key);
  if (principal > 0 && (input.annual_rate_percent == null || term == null)) return result;
  const rate = (input.annual_rate_percent || 0) / 1200, amortization = term == null ? 0 : term - io;
  const amortizing = principal === 0 ? 0 : amortization > 0 ? payment(principal, rate, amortization) : null;
  const initial = principal === 0 ? 0 : io ? principal * rate : amortizing;
  const firstYear = principal === 0 ? 0 : Math.min(io, 12) * principal * rate + (12 - Math.min(io, 12)) * (amortizing || 0);
  result.monthly_payment = round(initial);
  result.amortizing_monthly_payment = amortizing == null ? null : round(amortizing);
  result.first_year_debt_service = round(firstYear);
  result.balance_at_amortization_end = amortization > 0 || principal === 0 ? 0 : round(principal);
  if (balloon != null) result.balloon_balance = round(balloon <= io ? principal : balance(principal, rate, amortization, balloon - io));
  if (noi != null) {
    result.monthly_cash_flow = round(noi / 12 - initial);
    result.yearly_cash_flow = round(noi - firstYear);
    result.dscr = firstYear > 0 ? round(noi / firstYear, 4) : null;
    const invested = input.closing_costs == null ? null : input.down_payment + input.closing_costs + otherCash;
    result.cash_on_cash_percent = invested > 0 ? round((noi - firstYear) / invested * 100, 4) : null;
  }
  if (principal > 0) {
    const lowerPercent = Math.max(0, input.annual_rate_percent - 1), lowerRate = lowerPercent / 1200;
    const lowerAmortizing = amortization > 0 ? payment(principal, lowerRate, amortization) : null;
    result.one_point_lower_rate = { annual_rate_percent: lowerPercent,
      monthly_savings: round(initial - (io ? principal * lowerRate : lowerAmortizing)),
      amortizing_monthly_savings: amortizing == null ? null : round(amortizing - lowerAmortizing) };
  }
  return result;
}
function compare(scenarios) {
  if (!Array.isArray(scenarios) || !scenarios.length || scenarios.length > 3 || scenarios.some(s => !s || typeof s !== 'object' || Array.isArray(s) ||
    !KINDS.includes(s.kind) || Object.keys(s).some(key => !['kind', 'inputs'].includes(key))) ||
    new Set(scenarios.map(s => s.kind)).size !== scenarios.length) return { errors: ['comparison_invalid'], scenarios: [] };
  return { errors: [], scenarios: scenarios.map(s => ({ kind: s.kind, calculation: calculate(s.inputs) })) };
}
module.exports = { calculate, compare };
