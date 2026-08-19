'use strict';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

const PROVIDERS = Object.freeze([
  {
    provider: 'databatch',
    lane: 'paid_skip_trace',
    enabled: false,
    requires_env_opt_in: 'ENABLE_DATABATCH_PAID_SKIP_TRACE',
    daily_cap_env: 'DATABATCH_PAID_SKIP_TRACE_DAILY_CAP_USD',
    quoted_cost: {
      unverified_placeholder: true,
      unit_cost_source: 'PLACEHOLDER_REQUIRES_VENDOR_QUOTE'
    },
    expected_fields: ['owner_name', 'phone', 'email', 'mailing_address', 'source_timestamp']
  },
  {
    provider: 'promptstream',
    lane: 'paid_skip_trace',
    enabled: false,
    requires_env_opt_in: 'ENABLE_PROMPTSTREAM_PAID_SKIP_TRACE',
    daily_cap_env: 'PROMPTSTREAM_PAID_SKIP_TRACE_DAILY_CAP_USD',
    quoted_cost: {
      unverified_placeholder: true,
      unit_cost_source: 'PLACEHOLDER_REQUIRES_VENDOR_QUOTE'
    },
    expected_fields: ['owner_name', 'phone', 'email', 'mailing_address', 'source_timestamp']
  }
]);

function describePlan(row = {}, options = {}) {
  const providers = Array.isArray(options.providers) ? options.providers : PROVIDERS;
  return {
    lane: 'paid_skip_trace',
    enabled: false,
    network_calls: 0,
    would_request: {
      normalized_address: cleanText(row.normalized_address),
      owner_or_taxpayer: cleanText(row.owner_clue || row.owner_name || row.taxpayer_name),
      mailing_address: cleanText(row.mailing_route && row.mailing_route.value),
      city: cleanText(row.city),
      county: cleanText(row.county),
      state: cleanText(row.state)
    },
    providers: providers.map((provider) => Object.assign({}, provider)),
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

function assertMayExecute(provider, env = {}, spentToday = 0) {
  if (!provider || provider.enabled !== true) throw new Error('paid_skip_trace_provider_disabled');
  if (!provider.requires_env_opt_in || env[provider.requires_env_opt_in] !== 'true') throw new Error('paid_skip_trace_env_opt_in_missing');
  const cap = Number(env[provider.daily_cap_env] || 0) || 0;
  if (cap <= 0) throw new Error('paid_skip_trace_daily_cap_missing');
  if (Number(spentToday) >= cap) throw new Error('paid_skip_trace_daily_cap_exceeded');
  return true;
}

async function execute() {
  throw new Error('paid_skip_trace_execute_disabled');
}

module.exports = {
  PROVIDERS,
  describePlan,
  assertMayExecute,
  execute
};
