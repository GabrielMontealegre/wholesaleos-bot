'use strict';

// List membership is workflow visibility, never permission to share or send.
function section(deal) {
  if (deal.deal_kind !== 'jv') return null;
  const workflow = deal.jv_workflow;
  if (!workflow || workflow.history_invalid || workflow.signature_reviews_invalid) return 'near_miss';
  if (workflow?.active && !workflow.history_invalid && !workflow.signature_reviews_invalid &&
      !['closed', 'dead'].includes(workflow.stage)) return 'active';
  return deal.evaluation.jv_eligible ? 'ready' : 'near_miss';
}
module.exports = { section };
