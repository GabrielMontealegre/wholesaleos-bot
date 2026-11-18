'use strict';
const assert = require('node:assert/strict');
const { forecastBudget, describeCapability } = require('../modules/research/paid-skip-trace-preflight');
const providerModule = require('../modules/research/paid-skip-trace-provider');
const budget = { daily_cap_microusd: 1000000, spent_microusd: 100000, reserved_microusd: 200000, max_unit_cost_microusd: 70000, units: 10 };
const original = structuredClone(budget);
assert.deepEqual(forecastBudget(budget), { request_microusd: 700000, projected_microusd: 1000000, remaining_microusd: 700000, within_limit: true });
assert.equal(forecastBudget({ ...budget, reserved_microusd: 200001 }).within_limit, false, 'Reservations and projected request count against cap');
assert.equal(forecastBudget({ ...budget, spent_microusd: 1100000 }).remaining_microusd, 0);
assert.equal(forecastBudget({ ...budget, spent_microusd: 1100000 }).within_limit, false);
const max = Number.MAX_SAFE_INTEGER;
assert.equal(forecastBudget({ daily_cap_microusd: max, spent_microusd: max - 1, reserved_microusd: 0, max_unit_cost_microusd: 1, units: 1 }).within_limit, true);
const invalid = value => assert.throws(() => forecastBudget(value), error => error.code === 'paid_skip_trace_preflight_invalid');
for (const key of Object.keys(budget)) for (const value of [-1, -0, NaN, Infinity, 1.5, '1', null, undefined, true, {}, max + 1]) invalid({ ...budget, [key]: value });
for (const patch of [{ daily_cap_microusd: 0 }, { max_unit_cost_microusd: 0 }, { units: 0 }, { units: 101 },
  { spent_microusd: max, reserved_microusd: 1 }, { max_unit_cost_microusd: max, units: 2 }, { extra: true }]) invalid({ ...budget, ...patch });
invalid([]); invalid(null); invalid(Object.assign(Object.create({ inherited: true }), budget));
let getters = 0;
const accessor = { ...budget };
Object.defineProperty(accessor, 'spent_microusd', { enumerable: true, get() { getters++; return 0; } });
invalid(accessor); assert.equal(getters, 0);
const symbol = { ...budget, [Symbol('forged')]: true }; invalid(symbol);
const base = { provider_id: providerModule.PROVIDERS[0].provider, switch_on: false, budget: null };
const blocked = describeCapability(base);
assert.equal(blocked.registered, true); assert.equal(blocked.enabled, false); assert.equal(blocked.execution_available, false);
assert(blocked.blocking_reasons.includes('switch_off')); assert(blocked.blocking_reasons.includes('budget_unknown'));
const switched = describeCapability({ ...base, switch_on: true, budget });
assert.equal(switched.budget.within_limit, true);
assert.equal(switched.execution_available, false, 'Affordable math plus switch never grants execution');
for (const reason of ['provider_disabled', 'vendor_quote_unverified', 'subject_binding_unverified', 'owner_authorization_unverified', 'execution_adapter_disabled']) assert(switched.blocking_reasons.includes(reason));
assert(describeCapability({ ...base, budget: { ...budget, units: 11 } }).blocking_reasons.includes('budget_exceeded'));
assert.deepEqual(describeCapability({ ...base, provider_id: 'unregistered-provider' }).provider_id, null, 'Unknown caller identifiers are not echoed');
for (const patch of [{ switch_on: 'true' }, { switch_on: 1 }, { provider_id: '' }, { provider_id: '__proto__' },
  { provider_id: 'constructor' , owner_authorized: true }, { quote_verified: true }, { subject_id: 'untrusted' }, { budget: {} }]) {
  assert.throws(() => describeCapability({ ...base, ...patch }), /paid_skip_trace_preflight_invalid/);
}
const accessorInput = { ...base };
Object.defineProperty(accessorInput, 'budget', { enumerable: true, get() { getters++; return budget; } });
assert.throws(() => describeCapability(accessorInput), /paid_skip_trace_preflight_invalid/); assert.equal(getters, 0);
const registryBefore = structuredClone(providerModule.PROVIDERS);
const returned = describeCapability({ ...base, budget }); returned.blocking_reasons.length = 0; returned.budget.within_limit = false;
assert(describeCapability({ ...base, budget }).blocking_reasons.length > 0);
assert.equal(describeCapability({ ...base, budget }).budget.within_limit, true);
assert.deepEqual(providerModule.PROVIDERS, registryBefore); assert.deepEqual(budget, original);
const fs = require('node:fs'), http = require('node:http'), https = require('node:https'), restore = [], effects = [];
try {
  for (const [object, keys] of [[fs, ['readFileSync', 'writeFileSync']], [http, ['get', 'request']], [https, ['get', 'request']],
    [Date, ['now']], [globalThis, ['fetch']], [providerModule, ['execute', 'describePlan', 'assertMayExecute']]]) {
    for (const key of keys) { const old = object[key]; restore.push(() => { object[key] = old; }); object[key] = () => { effects.push(key); throw Error('forbidden_effect'); }; }
  }
  assert.equal(describeCapability({ ...base, switch_on: true, budget }).execution_available, false);
  forecastBudget(budget); assert.deepEqual(effects, []);
} finally { restore.reverse().forEach(fn => fn()); }
console.log('Paid skip-trace preflight: synthetic integer projected/reserved budgets, strict hostile-input rejection, detached always-disabled capabilities and zero provider/network/filesystem/clock effects passed');
