'use strict';

const parcelProfiles = require('../sources/public-parcel-api-profiles');

const NON_DISCLOSURE_STATES = new Set([
  'AK', 'ID', 'KS', 'LA', 'MS', 'MO', 'MT', 'NM', 'ND', 'TX', 'UT', 'WY'
]);

const POLICY_TABLE = Object.freeze({
  non_disclosure: Object.freeze({
    disclosure_state: false,
    comp_lane_enabled: false,
    arv_lock_reason_when_disabled: 'ARV_LOCKED_NON_DISCLOSURE_STATE_MLS_REQUIRED',
    work_order: 'OBTAIN_MLS_COMPS_VIA_LICENSED_AGENT_PARTNERSHIP_OR_PAID_COMP_DATA'
  }),
  public_sales: Object.freeze({
    disclosure_state: true,
    comp_lane_enabled: true,
    arv_lock_reason_when_disabled: '',
    comp_lane_source: 'disclosure_state_public_parcel_sales',
    work_order: 'RUN_DISCLOSURE_STATE_PUBLIC_COMP_RESOLUTION'
  }),
  pending_source: Object.freeze({
    disclosure_state: true,
    comp_lane_enabled: false,
    arv_lock_reason_when_disabled: 'COMP_LANE_PENDING_PUBLIC_SALES_SOURCE',
    comp_lane_source: 'comp_lane_pending_source',
    work_order: 'VERIFY_PUBLIC_RECORDED_SALES_SOURCE_BEFORE_RUNNING_COMPS'
  })
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function paidProviderForState(state, env) {
  if (!/^[A-Z]{2}$/.test(state)) return { paid_provider_name: '', paid_comp_key_present: false, paid_comp_enabled: false };
  const provider = cleanText(env[`WOS_PAID_COMP_PROVIDER_${state}`]);
  const keyPresent = !!(provider && cleanText(env[`WOS_PAID_COMP_KEY_${state}`]));
  return {
    paid_provider_name: provider,
    paid_comp_key_present: keyPresent,
    paid_comp_enabled: keyPresent && env[`WOS_PAID_COMP_ENABLE_${state}`] === 'true'
  };
}

function compPolicyForMarket(market, options = {}) {
  const state = cleanText(market && market.state).toUpperCase();
  const manualValueLane = {
    manual_value_lane_enabled: true,
    manual_value_lane_source: 'operator_confirmed_screenshot_comps'
  };
  const kind = NON_DISCLOSURE_STATES.has(state) ? 'non_disclosure'
    : parcelProfiles.compProfilesForMarket(market).length ? 'public_sales' : 'pending_source';
  return Object.assign({}, manualValueLane, POLICY_TABLE[kind],
    paidProviderForState(state, options.env || process.env));
}

module.exports = {
  compPolicyForMarket,
  NON_DISCLOSURE_STATES
};
