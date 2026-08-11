'use strict';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function compPolicyForMarket(market) {
  const state = cleanText(market && market.state).toUpperCase();
  if (state === 'TX') {
    return {
      disclosure_state: false,
      comp_lane_enabled: false,
      arv_lock_reason_when_disabled: 'ARV_LOCKED_NON_DISCLOSURE_STATE_MLS_REQUIRED',
      work_order: 'RUN_COMPS_VIA_MLS_ACCESS_OR_DECIDE_PAID_COMP_DATA'
    };
  }
  if (state === 'CA' || state === 'MI' || state === 'OH') {
    return {
      disclosure_state: true,
      comp_lane_enabled: true,
      arv_lock_reason_when_disabled: '',
      work_order: 'RUN_FREE_PUBLIC_COMP_RESEARCH'
    };
  }
  return {
    disclosure_state: false,
    comp_lane_enabled: false,
    arv_lock_reason_when_disabled: 'COMP_POLICY_UNKNOWN_FOR_MARKET',
    work_order: 'DEFINE_MARKET_COMP_POLICY_BEFORE_RUNNING_COMPS'
  };
}

module.exports = {
  compPolicyForMarket
};
