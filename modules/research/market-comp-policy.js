'use strict';

const parcelProfiles = require('../sources/public-parcel-api-profiles');

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
      work_order: 'OBTAIN_MLS_COMPS_VIA_LICENSED_AGENT_PARTNERSHIP_OR_PAID_COMP_DATA'
    };
  }
  if (state === 'CA' || state === 'MI' || state === 'OH') {
    const hasPublicSalesProfile = parcelProfiles.compProfilesForMarket(market).length > 0;
    if (!hasPublicSalesProfile) {
      return {
        disclosure_state: true,
        comp_lane_enabled: false,
        arv_lock_reason_when_disabled: 'COMP_LANE_PENDING_PUBLIC_SALES_SOURCE',
        comp_lane_source: 'comp_lane_pending_source',
        work_order: 'VERIFY_PUBLIC_RECORDED_SALES_SOURCE_BEFORE_RUNNING_COMPS'
      };
    }
    return {
      disclosure_state: true,
      comp_lane_enabled: true,
      arv_lock_reason_when_disabled: '',
      comp_lane_source: 'disclosure_state_public_parcel_sales',
      work_order: 'RUN_DISCLOSURE_STATE_PUBLIC_COMP_RESOLUTION'
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
