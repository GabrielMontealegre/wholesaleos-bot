'use strict';
const assert = require('node:assert/strict');
const clock = require('../dashboard/wos-card-clock');
const now = '2026-10-12T19:18:00.000Z';
const context = { now, statusLabels: { found: 'Found', vetted: 'Vetted', closed: 'Closed' } };
function fixture() { return { deal_kind: 'own', platform: 'county-auction', first_seen_at: '2026-10-10T19:18:00.000Z', created_by: 'fixture-admin', captured_at: '2026-10-09T19:18:00.000Z', closing_date: '2026-10-15', evaluation: { deadline: '2026-10-15', status: 'found', next_action: 'Review the source and comps.' }, history: [] }; }
function run() {
  const row = fixture(), frozen = JSON.stringify(row);
  const oldFetch = global.fetch, oldNow = Date.now;
  global.fetch = () => { throw Error('No network allowed'); }; Date.now = () => { throw Error('Clock must be injected'); };
  try {
    const model = clock.reviewed(row, context);
    assert.equal(model.days_since_added, 2); assert.equal(model.days_left, 3); assert.equal(model.urgent, true);
    assert.equal(model.source, 'County auction'); assert.equal(model.due, 'Oct 15, 2026'); assert.equal(model.due_kind, 'Closing date');
    assert.equal(model.days_in_recorded_stage, 2); assert.match(model.last_action, /Added to WholesaleOS - recorded by fixture-admin/);
    assert.equal(JSON.stringify(row), frozen);
    assert.equal(clock.formatTime(now, now), 'Mon 12:18 PM');
    assert.equal(clock.formatTime('2026-10-03T19:18:00Z', now), 'Oct 3');
    assert.equal(clock.formatTime('2025-10-03T19:18:00Z', now), 'Oct 3, 2025');
    assert.equal(clock.formatTime('2026-10-12T06:30:00Z', now), 'Sun 11:30 PM');
    const midnight = clock.reviewed({ ...row, closing_date: '2026-10-11', evaluation: { ...row.evaluation, deadline: '2026-10-11' } }, { ...context, now: '2026-10-12T06:30:00Z' });
    assert.equal(midnight.days_left, 0, 'owner calendar day, not UTC midnight');
    assert.equal(clock.reviewed({ ...row, evaluation: { ...row.evaluation, deadline: '2026-11-01' } }, context).due, 'Unknown', 'a mismatched projection is not a new deadline');
    const missing = clock.reviewed({ sale_date_iso: '2026-10-15', source_event_date: '2026-10-15', captured_at: now, updated_at: now }, context);
    assert.equal(missing.added, 'Unknown'); assert.equal(missing.due, 'Unknown'); assert.equal(missing.last_action, 'Unknown'); assert.equal(missing.stage, 'Unknown');
    assert.equal(missing.days_since_added, null); assert.equal(missing.days_in_recorded_stage, null);
    for (const bad of ['10/15/2026', '2026-02-30', '2026-10-12T19:18:00', '2026-10-12T19:18:00+02:00', '2026-10-13T19:18:00Z']) {
      assert.equal(clock.formatTime(bad, now), 'Unknown');
    }
    for (const bad of ['10/15/2026', '2026-02-30', 'October 15, 2026', '2026-10-15T00:00:00Z']) assert.equal(clock.formatDate(bad), 'Unknown');
    assert.equal(clock.reviewed({ ...row, first_seen_at: '2027-01-01T00:00:00Z', captured_at: '2027-01-01T00:00:00Z', history: [{ action: 'approve', at: '2027-01-01T00:00:00Z', operator_id: 'x' }] }, context).last_action, 'Unknown');
    const draft = clock.reviewed({ ...row, history: [{ action: 'draft', at: now, operator_id: 'reviewer' }] }, context);
    assert.match(draft.last_action, /Draft saved - not sent/); assert.equal(draft.days_in_recorded_stage, 2, 'draft is not a stage change');
    const tied = clock.reviewed({ ...row, history: [{ action: 'approve', at: now, operator_id: 'reviewer' }, { action: 'draft', at: now, operator_id: 'reviewer' }] }, context);
    assert.match(tied.last_action, /Draft saved - not sent/, 'append order breaks identical recorded timestamps');
    const stage = clock.reviewed({ ...row, evaluation: { ...row.evaluation, status: 'vetted' }, history: [{ action: 'status', to: 'vetted', at: now, operator_id: 'reviewer' }] }, context);
    assert.equal(stage.days_in_recorded_stage, 0); assert.equal(stage.stage, 'Vetted');
    assert.equal(clock.reviewed({ ...row, evaluation: { ...row.evaluation, status: 'vetted' } }, context).days_in_recorded_stage, null, 'preset status is not its start time');
    const jv = { ...row, deal_kind: 'jv', jv_workflow: { stage: 'holder_contacted', label: 'Holder contacted', events: [{ source_kind: 'operator_input', to: 'holder_contacted', happened_at: now, recorded_at: now, operator_id: 'reviewer', source_url: 'https://example.test/evidence', evidence_text: 'Operator report' }], signature_reviews: [] } };
    assert.equal(clock.reviewed(jv, context).days_in_recorded_stage, 0);
    assert.match(clock.reviewed(jv, context).last_action, /JV stage report recorded/);
    const invalid = clock.reviewed({ ...jv, jv_workflow: { ...jv.jv_workflow, history_invalid: true } }, context);
    assert.equal(invalid.days_in_recorded_stage, null); assert.equal(invalid.next, 'Recorded JV history needs review.'); assert.ok(!invalid.last_action.includes('JV stage'));
    assert.equal(clock.reviewed({ ...jv, jv_workflow: { ...jv.jv_workflow, events: [{ ...jv.jv_workflow.events[0], source_kind: 'ai_guess' }] } }, context).days_in_recorded_stage, null);
    const overdue = clock.reviewed({ ...row, closing_date: '2026-10-10', evaluation: { ...row.evaluation, deadline: '2026-10-10' } }, context);
    assert.equal(overdue.days_left, -2); assert.match(clock.render(overdue), /2 days overdue/);
    assert.equal(clock.reviewed({ ...row, evaluation: { ...row.evaluation, status: 'closed' } }, context).urgent, false);
    const attack = clock.render({ ...model, stage: '<img src=x onerror=alert(1)>', next: '<script>alert(1)</script>', last_action: 'Recorded by <b>not markup</b>' });
    assert.ok(!attack.includes('<img') && !attack.includes('<script') && !attack.includes('<b>')); assert.ok(attack.includes('&lt;script&gt;'));
    assert.ok(!clock.render(model).includes('T19:18')); assert.equal(clock.reviewed(row, {}).days_left, null);
    console.log('Reviewed deal clock: owner UTC-7 calendar, recent-week/older dates, recorded attribution, missing/future/ambiguous/wrong-origin dates, stage history, purity and escaping passed.');
  } finally { global.fetch = oldFetch; Date.now = oldNow; }
}
if (require.main === module) run(); module.exports = { run };
