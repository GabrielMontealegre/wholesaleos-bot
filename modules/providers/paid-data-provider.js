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

const CAPABILITIES = Object.freeze(['comps', 'property_detail', 'skip_trace', 'lists']);
const POSSIBLE_NUMBER_LABEL = 'Possible number — not confirmed';
const ESTIMATE_LABEL = 'Provider estimate — not a comp and not ARV';

// Registry entries are data. Costs stay null until the owner confirms pricing; a null cost
// keeps the capability off because the monthly cap cannot be enforced without it.
const PROVIDERS = Object.freeze({
  propertyradar: Object.freeze({
    provider_id: 'propertyradar', label: 'PropertyRadar',
    capabilities: Object.freeze(['comps', 'property_detail', 'skip_trace', 'lists']),
    env_switch: 'WOS_PROVIDER_PROPERTYRADAR_ENABLED', env_key: 'WOS_PROVIDER_PROPERTYRADAR_KEY',
    env_monthly_cap_usd: 'WOS_PROVIDER_PROPERTYRADAR_MONTHLY_CAP_USD',
    cost_per_call_usd: Object.freeze({ comps: null, property_detail: null, skip_trace: null, lists: null })
  }),
  batchdata: Object.freeze({
    provider_id: 'batchdata', label: 'BatchData',
    capabilities: Object.freeze(['skip_trace', 'property_detail']),
    env_switch: 'WOS_PROVIDER_BATCHDATA_ENABLED', env_key: 'WOS_PROVIDER_BATCHDATA_KEY',
    env_monthly_cap_usd: 'WOS_PROVIDER_BATCHDATA_MONTHLY_CAP_USD',
    cost_per_call_usd: Object.freeze({ skip_trace: null, property_detail: null })
  })
});

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function monthKeyOf(isoDate) {
  const text = clean(isoDate);
  if (!/^\d{4}-\d{2}/.test(text)) throw new TypeError('now_iso must be an injected ISO date');
  return text.slice(0, 7);
}

function monthSpend(ledgerRows, providerId, monthKey) {
  return (Array.isArray(ledgerRows) ? ledgerRows : [])
    .filter((row) => row && row.provider_id === providerId && clean(row.at).slice(0, 7) === monthKey)
    .reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0);
}

// Never returns the key. Reasons are plain English for the Settings screen.
function providerStatus(providerId, capability, options = {}) {
  const provider = PROVIDERS[clean(providerId)];
  const env = options.env || {};
  if (!provider) return { enabled: false, reason: 'Unknown provider.' };
  if (!CAPABILITIES.includes(capability) || !provider.capabilities.includes(capability)) {
    return { enabled: false, reason: 'This provider does not offer that service.' };
  }
  if (env[provider.env_switch] !== 'true') return { enabled: false, reason: 'Switched off. The owner turns it on.' };
  if (!clean(env[provider.env_key])) return { enabled: false, reason: 'No key set on the server.' };
  const cost = provider.cost_per_call_usd[capability];
  if (typeof cost !== 'number' || !(cost >= 0)) return { enabled: false, reason: 'Price per call not confirmed yet.' };
  const cap = Number(env[provider.env_monthly_cap_usd]);
  if (!(cap > 0)) return { enabled: false, reason: 'No monthly spending cap set.' };
  const spent = monthSpend(options.ledger_rows, provider.provider_id, monthKeyOf(options.now_iso));
  if (spent + cost > cap) return { enabled: false, reason: 'Monthly spending cap reached.', spent_usd: spent, cap_usd: cap };
  return { enabled: true, reason: '', cost_usd: cost, spent_usd: spent, cap_usd: cap };
}

function requestHash(providerId, capability, request) {
  const stable = JSON.stringify(request, Object.keys(request || {}).sort());
  return crypto.createHash('sha256').update(`${providerId}|${capability}|${stable}`).digest('hex').slice(0, 32);
}

// ledger: { rows(): array, append(row) }   cache: Map-like { get(hash), set(hash, value) }
// transport: async ({ provider_id, capability, request, key }) => vendor response
function createProviderClient(options = {}) {
  const { provider_id: providerId, env, transport, ledger, cache } = options;
  if (typeof transport !== 'function' || !ledger || typeof ledger.rows !== 'function' || typeof ledger.append !== 'function') {
    throw new TypeError('transport and ledger must be injected');
  }
  const responseCache = cache || new Map();
  return {
    async call(capability, request, callOptions = {}) {
      const nowIso = clean(callOptions.now_iso);
      monthKeyOf(nowIso);
      const hash = requestHash(providerId, capability, request || {});
      if (responseCache.get(hash)) return { status: 'cached', request_hash: hash, response: responseCache.get(hash), cost_usd: 0 };
      const status = providerStatus(providerId, capability, { env, ledger_rows: ledger.rows(), now_iso: nowIso });
      if (!status.enabled) return { status: 'disabled', reason: status.reason, request_hash: hash };
      const provider = PROVIDERS[providerId];
      const response = await transport({ provider_id: providerId, capability, request, key: env[provider.env_key] });
      // The ledger holds cost and a hash only: no names, addresses, phones or keys.
      ledger.append({ provider_id: providerId, capability, cost_usd: status.cost_usd, at: nowIso, request_hash: hash });
      responseCache.set(hash, response);
      return { status: 'ok', request_hash: hash, response, cost_usd: status.cost_usd };
    }
  };
}

function addressKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Generic comp row: { address, sale_status, sale_price, sale_date, beds, baths, living_area_sqft,
// year_built, distance_miles, value_kind, source_label }. value_kind is "recorded_sale" for a
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
    const price = Number(row && row.sale_price);
    const date = clean(row && row.sale_date);
    const base = {
      address, sale_price: Number.isFinite(price) ? price : null, sale_date: date,
      beds: row && row.beds != null ? Number(row.beds) : null, baths: row && row.baths != null ? Number(row.baths) : null,
      living_area_sqft: row && row.living_area_sqft != null ? Number(row.living_area_sqft) : null,
      year_built: row && row.year_built != null ? Number(row.year_built) : null,
      distance_miles: row && row.distance_miles != null ? Number(row.distance_miles) : null,
      source_label: clean(row && row.source_label), provider_id: clean(context.provider_id),
      captured_at: clean(context.captured_at), source_kind: 'paid_provider'
    };
    let reason = '';
    if (!address) reason = 'missing_address';
    else if (subject && addressKey(address) === subject) reason = 'subject_property';
    else if (kind !== 'recorded_sale') reason = `not_a_closed_sale:${kind || 'unknown'}`;
    else if (!['sold', 'closed'].includes(status)) reason = 'not_sold';
    else if (!(price > 0)) reason = 'missing_sale_price';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) reason = 'missing_or_unproven_sale_date';
    else if (!base.source_label || !base.provider_id) reason = 'missing_source_label';
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
    const dnc = phone && phone.dnc === true;
    const litigator = phone && phone.litigator === true;
    const rejectedStatus = ['wrong', 'rejected', 'disconnected', 'do_not_call'].includes(clean(phone && phone.status).toLowerCase());
    // A flag the vendor did not send is unknown, not "clear".
    const dncKnown = phone && typeof phone.dnc === 'boolean';
    return {
      number, valid: number.length === 10, phone_type: clean(phone && phone.phone_type) || 'unknown',
      dnc, dnc_known: dncKnown, litigator, label: POSSIBLE_NUMBER_LABEL,
      counts_as_route: number.length === 10 && dncKnown && !dnc && !litigator && !rejectedStatus,
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
