'use strict';

// B-24 (D-066, D-012 amended): one provider-generic interface for a paid data vendor
// (comps, property detail, skip trace, lists). OFF by default. A provider runs only when:
//   - its registry entry exists,
//   - its environment switch is exactly "true",
//   - its key is present in the environment (Railway only; never in code, logs or payloads),
//   - the per-call cost for that capability is configured, and
//   - this month's logged spend plus the call's cost stays within the monthly cap.
// The transport (the actual HTTP call) is injected, so tests never reach a vendor.
// Vendor field mapping happens before normalizeProviderComps / normalizeSkipTrace; those take
// the generic shape documented on each function.

const crypto = require('crypto');
const { rulesForState } = require('../research/state-rules');
const { normalizeSourceDate } = require('../research/normalize-source-date');

const CAPABILITIES = Object.freeze(['comps', 'property_detail', 'skip_trace', 'lists']);
const POSSIBLE_NUMBER_LABEL = 'Possible number — not confirmed';
const ESTIMATE_LABEL = 'Provider estimate — not a comp and not ARV';

// Registry entries are data. Costs stay null until the owner confirms pricing; a null cost
// keeps the capability off because the monthly cap cannot be enforced without it.
const PROVIDERS = Object.freeze({
  propertyradar: Object.freeze({
    provider_id: 'propertyradar', label: 'PropertyRadar',
    capabilities: Object.freeze(['comps', 'property_detail', 'skip_trace', 'lists']),
    env_switch: 'WOS_PROVIDER_PROPERTYRADAR_ENABLED', credential_env: 'WOS_PROVIDER_PROPERTYRADAR_KEY',
    env_monthly_cap_usd: 'WOS_PROVIDER_PROPERTYRADAR_MONTHLY_CAP_USD',
    cost_per_call_usd: Object.freeze({ comps: null, property_detail: null, skip_trace: null, lists: null })
  }),
  batchdata: Object.freeze({
    provider_id: 'batchdata', label: 'BatchData',
    capabilities: Object.freeze(['skip_trace', 'property_detail']),
    env_switch: 'WOS_PROVIDER_BATCHDATA_ENABLED', credential_env: 'WOS_PROVIDER_BATCHDATA_KEY',
    env_monthly_cap_usd: 'WOS_PROVIDER_BATCHDATA_MONTHLY_CAP_USD',
    cost_per_call_usd: Object.freeze({ skip_trace: null, property_detail: null })
  })
});

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function own(object, key) {
  const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function isoDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && normalizeSourceDate(value).iso === value ? value : '';
}

function injectedIso(value) {
  if (isoDay(value)) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !isoDay(value.slice(0, 10))) return '';
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')) ? value : '';
}

function monthKeyOf(isoDate) {
  const text = injectedIso(isoDate);
  if (!text) throw new TypeError('now_iso must be an injected valid ISO date');
  return text.slice(0, 7);
}

function monthSpend(ledgerRows, providerId, monthKey) {
  if (!Array.isArray(ledgerRows)) return null;
  let spent = 0;
  for (const row of Array.from(ledgerRows)) {
    const at = injectedIso(own(row, 'at')), cost = own(row, 'cost_usd');
    if (!row || typeof own(row, 'provider_id') !== 'string' || !at || typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return null;
    if (row.provider_id === providerId && at.slice(0, 7) === monthKey) spent += cost;
    if (!Number.isFinite(spent)) return null;
  }
  return spent;
}

// Never returns the key. Reasons are plain English for the Settings screen.
function statusForCall(providerId, capability, options = {}, cached = false) {
  const provider = own(PROVIDERS, clean(providerId));
  const env = options.env || {};
  if (!provider) return { enabled: false, reason: 'Unknown provider.' };
  if (!CAPABILITIES.includes(capability) || !provider.capabilities.includes(capability)) {
    return { enabled: false, reason: 'This provider does not offer that service.' };
  }
  if (own(env, provider.env_switch) !== 'true') return { enabled: false, reason: 'Switched off. The owner turns it on.' };
  const key = own(env, provider.credential_env);
  if (typeof key !== 'string' || !key.trim()) return { enabled: false, reason: 'No key set on the server.' };
  const cost = provider.cost_per_call_usd[capability];
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return { enabled: false, reason: 'Price per call not confirmed yet.' };
  const rawCap = own(env, provider.env_monthly_cap_usd);
  const cap = typeof rawCap === 'number' || (typeof rawCap === 'string' && /^\d+(?:\.\d+)?$/.test(rawCap)) ? Number(rawCap) : NaN;
  if (!Number.isFinite(cap) || !(cap > 0)) return { enabled: false, reason: 'No monthly spending cap set.' };
  const spent = monthSpend(options.ledger_rows === undefined ? [] : options.ledger_rows, provider.provider_id, monthKeyOf(options.now_iso));
  if (spent == null) return { enabled: false, reason: 'Spending ledger needs review.' };
  if (spent + (cached ? 0 : cost) > cap) return { enabled: false, reason: 'Monthly spending cap reached.', spent_usd: spent, cap_usd: cap };
  return { enabled: true, reason: '', cost_usd: cost, spent_usd: spent, cap_usd: cap };
}

function providerStatus(providerId, capability, options = {}) { return statusForCall(providerId, capability, options); }

function canonicalJson(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== 'object' || seen.has(value) || Object.getOwnPropertySymbols(value).length ||
      (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw new TypeError('Expected plain finite JSON data');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) throw new TypeError('Expected dense JSON array');
      return '[' + Array.from({ length: value.length }, (_, index) => canonicalJson(own(value, String(index)), seen)).join(',') + ']';
    }
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(own(value, key), seen)).join(',') + '}';
  } finally { seen.delete(value); }
}

function requestHash(providerId, capability, request) {
  const stable = canonicalJson(request);
  return crypto.createHash('sha256').update(`${providerId}|${capability}|${stable}`).digest('hex').slice(0, 32);
}

// ledger.runExclusive must serialize ALL clients sharing the durable spending ledger.
// Append a reservation before transport; uncertain outcomes retain it without retry.
// This OFF core supplies no production ledger/transport or automatic reconciliation.
// transport: async ({ provider_id, capability, request, key }) => vendor response
function createProviderClient(options = {}) {
  const { provider_id: rawProviderId, env, transport, ledger, cache } = options;
  const providerId = clean(rawProviderId);
  if (typeof transport !== 'function' || !ledger || typeof ledger.rows !== 'function' || typeof ledger.append !== 'function' || typeof ledger.runExclusive !== 'function') {
    throw new TypeError('transport and atomic ledger must be injected');
  }
  const responseCache = cache || new Map();
  let credential, scope = Symbol('private provider cache scope');
  return {
    async call(capability, request, callOptions = {}) {
      const nowIso = callOptions.now_iso;
      monthKeyOf(nowIso);
      const payload = JSON.parse(canonicalJson(request == null ? {} : request));
      const hash = requestHash(providerId, capability, payload);
      return ledger.runExclusive(async () => {
        const provider = own(PROVIDERS, providerId), key = provider && own(env, provider.credential_env);
        if (credential !== key) { credential = key; scope = Symbol('private provider cache scope'); }
        const entry = responseCache.get(hash), hit = entry && entry.scope === scope;
        const rows = await ledger.rows();
        if (!Array.isArray(rows)) return { status: 'disabled', reason: 'Spending ledger needs review.', request_hash: hash };
        const status = statusForCall(providerId, capability, { env, ledger_rows: rows, now_iso: nowIso }, Boolean(hit));
        if (!status.enabled) return { status: 'disabled', reason: status.reason, request_hash: hash };
        if (hit) return { status: 'cached', request_hash: hash, response: JSON.parse(entry.json), captured_at: entry.captured_at, cost_usd: 0 };
        const review = { status: 'review_required', reason: 'Reserved outcome needs review. No automatic retry.', request_hash: hash };
        if (rows.some(row => own(row, 'provider_id') === providerId && own(row, 'request_hash') === hash)) return review;
        // Only costs, control metadata and the synthetic-testable request digest persist.
        await ledger.append({ provider_id: providerId, capability, cost_usd: status.cost_usd, at: nowIso, request_hash: hash, status: 'reserved' });
        const reservedRows = await ledger.rows();
        const reservedStatus = statusForCall(providerId, capability, { env, ledger_rows: reservedRows, now_iso: nowIso }, true);
        if (!Array.isArray(reservedRows) || !reservedStatus.enabled || !reservedRows.some(row => own(row, 'provider_id') === providerId &&
          own(row, 'request_hash') === hash && own(row, 'cost_usd') === status.cost_usd && own(row, 'at') === nowIso && own(row, 'status') === 'reserved')) return review;
        if (own(env, provider.env_switch) !== 'true' || own(env, provider.credential_env) !== key) return review;
        try {
          const response = await transport({ provider_id: providerId, capability, request: payload, key });
          const json = canonicalJson(response);
          if (own(env, provider.env_switch) !== 'true' || own(env, provider.credential_env) !== key) return review;
          responseCache.set(hash, { scope, json, captured_at: nowIso });
          return { status: 'ok', request_hash: hash, response: JSON.parse(json), captured_at: nowIso, cost_usd: status.cost_usd };
        } catch (_) { return review; }
      });
    }
  };
}

function addressKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function optionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value :
    typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
}

// Generic comp row: { address, sale_status, sale_price, sale_date, beds, baths, living_area_sqft,
// year_built, distance_miles, value_kind, source_label, source_url, source_reference }.
// A verified-state comp also requires subject address and a valid injected capture date.
// value_kind is "recorded_sale" for a
// closed sale; anything else (avm, estimate, list_price, tax_value, auction_bid) is rejected.
function normalizeProviderComps(rows, context = {}) {
  const state = clean(context.subject_state).toUpperCase();
  const lookup = typeof context.rules_for_state === 'function' ? context.rules_for_state : rulesForState;
  const disclosure = lookup(state) && lookup(state).disclosure;
  // Only a verified disclosure state can produce comps from a provider. Non-disclosure and
  // unknown states return estimates at most (AGENTS section 5, D-066 point 3).
  const compEligibleState = Boolean(disclosure && disclosure.status === 'disclosure' && disclosure.verification_status === 'verified');
  const subject = addressKey(context.subject_address);
  const comps = [];
  const estimates = [];
  const rejected = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const address = clean(row && row.address);
    const kind = clean(row && row.value_kind).toLowerCase();
    const status = clean(row && row.sale_status).toLowerCase();
    const rawPrice = row && row.sale_price;
    const price = typeof rawPrice === 'number' || (typeof rawPrice === 'string' && /^\d+(?:\.\d+)?$/.test(rawPrice)) ? Number(rawPrice) : NaN;
    const date = clean(row && row.sale_date);
    const base = {
      address, sale_price: Number.isFinite(price) ? price : null, sale_date: date,
      beds: optionalNumber(row && row.beds), baths: optionalNumber(row && row.baths),
      living_area_sqft: optionalNumber(row && row.living_area_sqft),
      year_built: optionalNumber(row && row.year_built),
      distance_miles: optionalNumber(row && row.distance_miles),
      source_label: clean(row && row.source_label), provider_id: clean(context.provider_id),
      captured_at: clean(context.captured_at), source_kind: 'paid_provider'
    };
    base.source_url = clean(row && row.source_url);
    base.source_reference = clean(row && row.source_reference);
    let reason = '';
    if (!address) reason = 'missing_address';
    else if (subject && addressKey(address) === subject) reason = 'subject_property';
    else if (kind !== 'recorded_sale') reason = `not_a_closed_sale:${kind || 'unknown'}`;
    else if (!['sold', 'closed'].includes(status)) reason = 'not_sold';
    else if (!Number.isFinite(price) || !(price > 0)) reason = 'missing_sale_price';
    else if (!isoDay(date)) reason = 'missing_or_unproven_sale_date';
    else if (!base.source_label || !base.provider_id) reason = 'missing_source_label';
    else if (!injectedIso(context.captured_at)) reason = 'missing_or_unproven_capture_date';
    else if (date > context.captured_at.slice(0, 10)) reason = 'sale_after_capture';
    else if (!base.source_reference) reason = 'missing_source_reference';
    else if (compEligibleState && !subject) reason = 'missing_subject_address';
    else {
      try { const url = new URL(base.source_url); if (url.protocol !== 'https:' || url.username || url.password || url.hash) reason = 'missing_source_url'; }
      catch (_) { reason = 'missing_source_url'; }
    }
    if (reason) { rejected.push({ address, reason }); continue; }
    if (!compEligibleState) {
      estimates.push(Object.assign(base, { label: ESTIMATE_LABEL, can_satisfy_comp_gate: false }));
    } else {
      comps.push(Object.assign(base, { label: 'Closed sale from paid provider', can_satisfy_comp_gate: true }));
    }
  }
  return { comps, estimates, rejected };
}

// Generic skip-trace response: { phones: [{ number, phone_type, dnc, litigator, status }],
// emails: [{ address }] }. Every number is a possible number with its source (D-006).
function normalizeSkipTrace(response, context = {}) {
  const provider = clean(context.provider_id);
  const capturedAt = clean(context.captured_at);
  const requestId = clean(context.request_hash);
  const phones = (Array.isArray(response && response.phones) ? response.phones : []).map((phone) => {
    const digits = clean(phone && phone.number).replace(/\D/g, '');
    const number = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    const dnc = own(phone, 'dnc') === true;
    const litigator = own(phone, 'litigator') === true;
    const rejectedStatus = ['wrong', 'rejected', 'disconnected', 'do_not_call'].includes(clean(phone && phone.status).toLowerCase());
    // A flag the vendor did not send is unknown, not "clear".
    const dncKnown = typeof own(phone, 'dnc') === 'boolean';
    const litigatorKnown = typeof own(phone, 'litigator') === 'boolean';
    return {
      number, valid: number.length === 10, phone_type: clean(phone && phone.phone_type) || 'unknown',
      dnc, dnc_known: dncKnown, litigator, litigator_known: litigatorKnown, label: POSSIBLE_NUMBER_LABEL,
      counts_as_route: number.length === 10 && dncKnown && litigatorKnown && !dnc && !litigator && !rejectedStatus &&
        Boolean(provider && injectedIso(context.captured_at) && requestId),
      source_kind: 'skip_trace', provider, captured_at: capturedAt, request_id: requestId
    };
  });
  const emails = (Array.isArray(response && response.emails) ? response.emails : [])
    .map((email) => clean(email && email.address).toLowerCase())
    .filter((address) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address))
    .map((address) => ({ address, label: 'Possible email — not confirmed', source_kind: 'skip_trace', provider, captured_at: capturedAt, request_id: requestId }));
  return { phones, emails };
}

module.exports = {
  CAPABILITIES, PROVIDERS, POSSIBLE_NUMBER_LABEL, ESTIMATE_LABEL,
  providerStatus, createProviderClient, normalizeProviderComps, normalizeSkipTrace, requestHash
};
