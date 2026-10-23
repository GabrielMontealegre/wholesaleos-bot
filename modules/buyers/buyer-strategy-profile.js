'use strict';

// Buyer strategy profile (#402): which exits a buyer buys for, how often, the return they need,
// how they pay and the date of their proof of funds. Pure: no network, clock or writes; callers
// pass `today` (YYYY-MM-DD). A recorded proof-of-funds date is a report, never a funds check.
const STRATEGIES = Object.freeze(['flip', 'rental', 'brrrr', 'wholetail', 'creative', 'land', 'multifamily']);
const RETURN_BASES = Object.freeze(['cap_rate', 'cash_on_cash', 'pct_arv']);
const FUNDING = Object.freeze(['cash', 'hard_money', 'dscr']);
const FIELDS = new Set(['strategy', 'deals_per_year', 'target_return', 'funding', 'pof_date', 'evidence_text']);
const LABELS = Object.freeze({ flip: 'Fix and flip', rental: 'Buy and hold rental', brrrr: 'BRRRR', wholetail: 'Wholetail',
  creative: 'Creative terms', land: 'Land / builder', multifamily: 'Small multifamily',
  cap_rate: 'cap rate', cash_on_cash: 'cash-on-cash return', pct_arv: 'of after-repair value',
  cash: 'Cash', hard_money: 'Hard money', dscr: 'DSCR loan' });
const POF_MAX_AGE_DAYS = 90;

function fail(code = 'find_strategy_profile_invalid') {
  const error = new Error(code);
  error.code = code;
  error.status = 400;
  throw error;
}

function dayNumber(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // Reject rolled-over dates such as 2026-02-30.
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / 86400000 : null;
}

function choices(value, allowed) {
  if (!Array.isArray(value) || !value.length || value.length > allowed.length || value.some((entry) => !allowed.includes(entry))) fail();
  return allowed.filter((entry) => value.includes(entry));
}

// Returns a normalized profile or throws find_strategy_profile_invalid. `today` bounds pof_date.
function validate(input, today) {
  if (dayNumber(today) == null) fail('find_strategy_profile_clock_invalid');
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !FIELDS.has(key))) fail();
  const profile = {};
  if (input.strategy != null) profile.strategy = choices(input.strategy, STRATEGIES);
  if (input.funding != null) profile.funding = choices(input.funding, FUNDING);
  if (input.deals_per_year != null) {
    if (!Number.isInteger(input.deals_per_year) || input.deals_per_year < 0 || input.deals_per_year > 1000) fail();
    profile.deals_per_year = input.deals_per_year;
  }
  if (input.target_return != null) {
    const target = input.target_return;
    if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).some((key) => !['basis', 'percent'].includes(key)) ||
        !RETURN_BASES.includes(target.basis) || typeof target.percent !== 'number' || !Number.isFinite(target.percent) ||
        target.percent <= 0 || target.percent > 100) fail();
    profile.target_return = { basis: target.basis, percent: target.percent };
  }
  if (input.pof_date != null) {
    const day = dayNumber(input.pof_date);
    if (day == null || day > dayNumber(today)) fail('find_strategy_profile_pof_date_invalid');
    profile.pof_date = input.pof_date;
  }
  if (!Object.keys(profile).length) fail();
  return profile;
}

function evidence(input) {
  const value = input && input.evidence_text;
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 300 || /[\u0000-\u001f]/.test(value)) fail();
  return value.trim();
}

function profileOf(buyer) {
  const profile = buyer && buyer.assistant_find && buyer.assistant_find.strategy_profile;
  return profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : null;
}

// Proof of funds counts as current only when recorded, not future-dated and at most 90 days old.
function pofCurrent(profile, today, maxAgeDays = POF_MAX_AGE_DAYS) {
  const day = dayNumber(profile && profile.pof_date);
  const now = dayNumber(today);
  return day != null && now != null && day <= now && now - day <= maxAgeDays;
}

function describe(profile) {
  if (!profile) return 'Strategy not stated';
  const parts = [];
  if (profile.strategy) parts.push(profile.strategy.map((key) => LABELS[key]).join(', '));
  if (profile.target_return) parts.push('wants ' + profile.target_return.percent + '% ' + LABELS[profile.target_return.basis]);
  if (profile.funding) parts.push(profile.funding.map((key) => LABELS[key]).join(' / '));
  if (profile.deals_per_year != null) parts.push(profile.deals_per_year + ' deals a year (buyer-reported)');
  if (profile.pof_date) parts.push('proof of funds dated ' + profile.pof_date + ' (recorded, not verified)');
  return parts.join('; ');
}

module.exports = { STRATEGIES, RETURN_BASES, FUNDING, LABELS, POF_MAX_AGE_DAYS, validate, evidence, profileOf, pofCurrent, describe, dayNumber };
