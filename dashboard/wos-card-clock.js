'use strict';
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.wosCardClock = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  var DAY = 86400000;
  var ZONE = 'Etc/GMT+7';
  var platforms = { 'facebook-wholesaler': 'Facebook wholesaler', xome: 'Xome', 'auction.com': 'Auction.com', hud: 'HUD', homepath: 'HomePath', craigslist: 'Craigslist', 'county-auction': 'County auction', 'own-lead': 'Own lead' };
  var actions = { approve: 'Approval recorded', reject: 'Rejection recorded', draft: 'Draft saved - not sent', status: 'Stage update recorded', recheck: 'Source recheck recorded', availability: 'Availability report recorded', facts_updated: 'Source-backed facts updated', exclude_comp: 'Comp exclusion recorded' };
  function text(value) { return typeof value === 'string' ? value.trim().slice(0, 600) : ''; }
  function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function instant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
    var time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19) ? time : null;
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var time = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
  }
  function day(time) { return Math.floor((time - 7 * 3600000) / DAY); }
  function formatTime(value, now) {
    var time = instant(value), current = instant(now);
    if (time == null || current == null || time > current) return 'Unknown';
    var sameWeek = Math.floor((day(time) + 4) / 7) === Math.floor((day(current) + 4) / 7);
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric' }).format(new Date(time));
    var year = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric' }).format(new Date(current));
    var options = { timeZone: ZONE, hour: 'numeric', minute: '2-digit' };
    if (sameWeek) options.weekday = 'short';
    else { options.month = 'short'; options.day = 'numeric'; if (parts !== year) options.year = 'numeric'; }
    return new Intl.DateTimeFormat('en-US', options).format(new Date(time));
  }
  function formatDate(value) {
    var time = date(value);
    return time == null ? 'Unknown' : new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(time));
  }
  // This reads the reviewed-deal projection only. It is not a source-date resolver.
  function reviewed(deal, context) {
    var now = text(context && context.now), current = instant(now);
    var evaluation = deal.evaluation || {}, workflow = deal.deal_kind === 'jv' ? deal.jv_workflow : null;
    var first = instant(deal.first_seen_at), captured = instant(deal.captured_at);
    if (current == null || first > current) first = null;
    if (current == null || captured > current) captured = null;
    var candidates = [];
    function add(at, who, label, stage) {
      var time = instant(at);
      if (current == null || time == null || time > current || !text(who)) return;
      candidates.push({ at: at, time: time, who: text(who), label: label, stage: !!stage, order: candidates.length });
    }
    if (first != null) add(deal.first_seen_at, deal.created_by, 'Added to WholesaleOS', evaluation.status === 'found' && (!workflow || workflow.stage === 'found'));
    (Array.isArray(deal.history) ? deal.history : []).forEach(function (event) {
      if (event && Object.prototype.hasOwnProperty.call(actions, event.action)) add(event.at, event.operator_id, actions[event.action], event.action === 'status' && !workflow && event.to === evaluation.status);
    });
    if (workflow && !workflow.history_invalid && !workflow.signature_reviews_invalid) {
      (Array.isArray(workflow.events) ? workflow.events : []).forEach(function (event) {
        if (event && event.source_kind === 'operator_input' && text(event.source_url) && text(event.evidence_text)) add(event.happened_at, event.operator_id, 'JV stage report recorded', event.to === workflow.stage);
      });
      (Array.isArray(workflow.signature_reviews) ? workflow.signature_reviews : []).forEach(function (event) {
        if (event && event.source_kind === 'operator_input' && text(event.source_url) && text(event.evidence_text)) add(event.happened_at, event.operator_id, 'Signed-document review recorded', false);
      });
    }
    candidates.sort(function (a, b) { return b.time - a.time || b.order - a.order; });
    var last = candidates[0], stageEvent = candidates.find(function (event) { return event.stage; });
    var due = evaluation.deadline === deal.closing_date || evaluation.deadline === deal.auction_date ? date(evaluation.deadline) : null, dueKind = 'Deadline';
    if (due != null && evaluation.deadline === deal.closing_date) dueKind = 'Closing date';
    else if (due != null && evaluation.deadline === deal.auction_date) dueKind = 'Auction date';
    var daysLeft = due != null && current != null ? Math.floor(due / DAY) - day(current) : null;
    var stage = workflow && workflow.label || (context && context.statusLabels || {})[evaluation.status] || 'Unknown';
    var next = text(evaluation.next_action) || 'Unknown';
    if (workflow && (workflow.history_invalid || workflow.signature_reviews_invalid)) next = 'Recorded JV history needs review.';
    return {
      added: first == null ? 'Unknown' : formatTime(deal.first_seen_at, now),
      source: Object.prototype.hasOwnProperty.call(platforms, deal.platform) ? platforms[deal.platform] : 'Unknown',
      captured: captured == null ? 'Unknown' : formatTime(deal.captured_at, now),
      days_since_added: first == null || current == null ? null : day(current) - day(first),
      due: due == null ? 'Unknown' : formatDate(evaluation.deadline), due_kind: dueKind, days_left: daysLeft,
      urgent: daysLeft != null && daysLeft < 7 && !['closed', 'dead'].includes(evaluation.status),
      last_action: last ? last.label + ' - recorded by ' + last.who + ', ' + formatTime(last.at, now) : 'Unknown',
      stage: text(stage), days_in_recorded_stage: stageEvent && current != null ? day(current) - day(stageEvent.time) : null,
      next: next
    };
  }
  function render(model) {
    function field(label, value, urgent) { return '<div' + (urgent ? ' class="wos-clock-urgent"' : '') + '><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>'; }
    var left = model.days_left == null ? 'Unknown' : model.days_left < 0 ? Math.abs(model.days_left) + ' days overdue' : model.days_left === 0 ? 'Due today' : model.days_left + ' days left';
    return '<dl class="wos-card-clock" aria-label="Recorded deal clock">' +
      field('Added to WholesaleOS', model.added + ' - ' + model.source) +
      field('Source captured', model.captured) +
      field('Days since added', model.days_since_added == null ? 'Unknown' : model.days_since_added) +
      field(model.due_kind, model.due) + field('Time left', left, model.urgent) +
      field('Last recorded action', model.last_action) +
      field('Current stage', model.stage + (model.days_in_recorded_stage == null ? ' - time in stage unknown' : ' - ' + model.days_in_recorded_stage + ' days since its recorded start')) +
      field('Next step', model.next) + '</dl>';
  }
  return { reviewed: reviewed, render: render, formatTime: formatTime, formatDate: formatDate };
});
