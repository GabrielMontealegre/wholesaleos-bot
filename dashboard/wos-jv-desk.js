'use strict';
(function(root) {
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function money(value) { return typeof value === 'number' && Number.isFinite(value) ? '$' + value.toLocaleString('en-US', {maximumFractionDigits:0}) : 'Not established'; }
  function render(deal) {
    if (deal.deal_kind !== 'jv' || !deal.jv_workflow) return '';
    var workflow = deal.jv_workflow, evaluation = deal.evaluation, best = evaluation.matches[0];
    var next = workflow.stages.find(function(stage) { return stage.stage === workflow.next_stage; });
    var share = best && best.estimated_spread;
    var holder = deal.holder_contact || {};
    return '<section class="jv-desk" aria-label="JV deal workspace"><h4>Deal workspace</h4>' +
      '<p class="jv-now">Now: <strong>' + esc(workflow.label) + '</strong> &rarr; Next: ' + esc(next ? next.label : 'Closed out') + '</p>' +
      '<dl class="jv-money"><div><dt>Price</dt><dd>' + money(evaluation.asking) + '</dd></div><div><dt>Our value</dt><dd>' + (evaluation.value.range ? money(evaluation.value.range.low) + ' - ' + money(evaluation.value.range.high) : 'Not established') + '</dd><small>' + esc(evaluation.value.tier) + '</small></div><div><dt>Buyer maximum</dt><dd>' + money(best && best.max_price) + '</dd></div><div><dt>Your estimated share</dt><dd>' + (share ? money(share.low) + ' - ' + money(share.high) : 'Not established') + '</dd><small>Derived estimate, not an offer or earned fee</small></div></dl>' +
      '<div class="jv-people"><section><h4>JV partner</h4>' +
      (holder.name ? '<p>' + esc(holder.name) + '</p>' : '') +
      (holder.phone || holder.email ? '<p>' + esc([holder.phone,holder.email].filter(Boolean).join(' | ')) + '</p>' : '') +
      (deal.jv_split != null ? '<p>Your recorded share: ' + esc(deal.jv_split * 100) + '%</p>' : '') +
      '<p>Agreement: ' + (workflow.full_package_evidence_ready ? 'Current signed evidence recorded' : workflow.review_required ? 'Signed evidence needs re-review' : 'Current signed evidence not established') + '</p>' +
      (deal.title_company ? '<p>Title company: ' + esc(deal.title_company) + '</p>' : '') + '</section><section><h4>Buyer</h4>' +
      (evaluation.matches.length ? evaluation.matches.map(function(buyer) { return '<p>' + esc(buyer.buyer_ref || buyer.name) + ' - criteria match</p><p>' + money(buyer.max_price) + '</p>' + (buyer.check_items || []).map(function(check) { return '<p>Check: ' + esc(check) + '</p>'; }).join(''); }).join('') : '<p>No approved buyer passes the recorded criteria.</p>') +
      '<p>' + esc(evaluation.introduction_allowed ? 'Recorded introduction prerequisites met; you decide whether to contact.' : 'Introduction locked until holder, contract and signing checks are current.') + '</p></section></div>' +
      (!evaluation.jv_eligible ? '<p class="td-caution">Buyer readiness: ' + esc(evaluation.jv_reasons.join('; ')) + '</p>' : '') +
      '<section class="jv-next-message"><h4>Next message</h4><label>Unsent draft<textarea data-deal-draft maxlength="600">' + esc(deal.drafted_message || '') + '</textarea></label><div class="td-actions"><button type="button" disabled title="Sending remains locked until the guarded email workflow is released">Send email</button><button type="button" disabled title="Texting remains locked until the guarded texting workflow is released">Send text</button><button type="button" disabled title="Reviewed templates will be connected with the guarded Send workflow">Use another template</button><button type="button" data-deal-action="draft">Save draft</button></div></section></section>';
  }
  var api = {render:render};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.wosJVDesk = api;
})(typeof window === 'undefined' ? {} : window);
