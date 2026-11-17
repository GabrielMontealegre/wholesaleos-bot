'use strict';
const { PROVIDERS } = require('./paid-skip-trace-provider');
const REGISTERED_IDS = Object.freeze(PROVIDERS.map(entry => entry.provider));
const BUDGET_FIELDS = ['daily_cap_microusd', 'spent_microusd', 'reserved_microusd', 'max_unit_cost_microusd', 'units'];
function invalid() { throw Object.assign(Error('paid_skip_trace_preflight_invalid'), { code: 'paid_skip_trace_preflight_invalid', status: 400 }); }
function record(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || fields.some(key => !Object.hasOwn(value, key)) ||
      keys.some(key => typeof key !== 'string' || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) invalid();
}
function safeNumber(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
  return Number(value);
}
function forecastBudget(input) {
  record(input, BUDGET_FIELDS);
  for (const key of BUDGET_FIELDS) if (!Number.isSafeInteger(input[key]) || input[key] < 0 || Object.is(input[key], -0)) invalid();
  if (input.daily_cap_microusd === 0 || input.max_unit_cost_microusd === 0 || input.units < 1 || input.units > 100) invalid();
  const request = BigInt(input.max_unit_cost_microusd) * BigInt(input.units);
  const committed = BigInt(input.spent_microusd) + BigInt(input.reserved_microusd);
  const projected = committed + request, cap = BigInt(input.daily_cap_microusd);
  return {
    request_microusd: safeNumber(request), projected_microusd: safeNumber(projected),
    remaining_microusd: safeNumber(committed < cap ? cap - committed : 0n),
    within_limit: projected <= cap
  };
}
function describeCapability(input) {
  record(input, ['provider_id', 'switch_on', 'budget']);
  if (typeof input.provider_id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(input.provider_id) || typeof input.switch_on !== 'boolean') invalid();
  const registered = REGISTERED_IDS.includes(input.provider_id), budget = input.budget === null ? null : forecastBudget(input.budget);
  const reasons = [registered ? 'provider_disabled' : 'provider_unknown'];
  if (!input.switch_on) reasons.push('switch_off');
  if (budget === null) reasons.push('budget_unknown');
  else if (!budget.within_limit) reasons.push('budget_exceeded');
  // These evidence contracts and the executable adapter do not exist yet.
  reasons.push('vendor_quote_unverified', 'subject_binding_unverified', 'owner_authorization_unverified', 'execution_adapter_disabled');
  return {
    provider_id: registered ? input.provider_id : null, registered, enabled: false,
    execution_available: false, budget, blocking_reasons: reasons
  };
}
module.exports = { forecastBudget, describeCapability };
