'use strict';

const assert = require('assert');
const policy = require('../modules/research/market-comp-policy');
const scheduler = require('../modules/research/enrichment-scheduler');

(() => {
  const tx = policy.compPolicyForMarket({ city: 'San Antonio', county: 'Bexar', state: 'TX' });
  assert.strictEqual(tx.disclosure_state, false);
  assert.strictEqual(tx.comp_lane_enabled, false);
  assert.strictEqual(tx.arv_lock_reason_when_disabled, 'ARV_LOCKED_NON_DISCLOSURE_STATE_MLS_REQUIRED');
  assert.strictEqual(tx.work_order, 'OBTAIN_MLS_COMPS_VIA_LICENSED_AGENT_PARTNERSHIP_OR_PAID_COMP_DATA');
  const rows = [{ queue_key: 'a', normalized_address: '1 Main St, San Antonio, TX 78201', source_document_url: 'https://bexar.org/doc.pdf' }];
  const selected = scheduler.selectRowsForEnrichment(rows, { lane: 'sold_comp', limit: 6, now_iso: '2026-08-11T00:00:00Z', market_policy: tx });
  assert.strictEqual(selected.selected.length, 0, 'TX comp lane should run zero queries and zero fetches');
  assert.strictEqual(selected.skipped[0].skip_reason, 'lane_disabled_by_market_policy');
  const detroit = policy.compPolicyForMarket({ city: 'Detroit', county: 'Wayne', state: 'MI' });
  assert.strictEqual(detroit.comp_lane_enabled, true);
  assert.strictEqual(detroit.comp_lane_source, 'disclosure_state_public_parcel_sales');
  assert.strictEqual(detroit.work_order, 'RUN_DISCLOSURE_STATE_PUBLIC_COMP_RESOLUTION');
  const caPending = policy.compPolicyForMarket({ city: 'San Diego', county: 'San Diego', state: 'CA' });
  assert.strictEqual(caPending.comp_lane_enabled, false);
  assert.strictEqual(caPending.comp_lane_source, 'comp_lane_pending_source');
  assert.strictEqual(caPending.arv_lock_reason_when_disabled, 'COMP_LANE_PENDING_PUBLIC_SALES_SOURCE');
  assert.strictEqual(caPending.work_order, 'VERIFY_PUBLIC_RECORDED_SALES_SOURCE_BEFORE_RUNNING_COMPS');
  assert.strictEqual(policy.compPolicyForMarket({ state: 'AL' }).comp_lane_enabled, false);
  assert.strictEqual(policy.compPolicyForMarket({ state: 'AL' }).arv_lock_reason_when_disabled, 'COMP_POLICY_UNKNOWN_FOR_MARKET');
  console.log('market comp policy tests passed');
})();
