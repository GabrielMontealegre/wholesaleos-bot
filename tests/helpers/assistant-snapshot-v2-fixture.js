'use strict';
const { fixture: v1 } = require('./assistant-snapshot-fixture');
function fixture() {
  return { ...v1(), version: 2, generated_at: '2026-10-31T11:00:00Z',
    open_items: Array.from({ length: 5 }, (_, i) => ({ id: 'decision-' + i, tier: i + 1, status: 'needs_decision', title: 'Synthetic decision ' + i,
      who: [{ name: 'Synthetic agent', role: 'listing agent', channel: 'email' }], happened: [{ at: '2026-10-30', text: 'Synthetic reported event.' }],
      numbers: { ask: null, value_fixed: null, repairs: null, buyer_number: null, our_offer: 0, fee_estimate_low: null, fee_estimate_high: null },
      suggestion: 'Synthetic draft, never sent.\nA second line.', options: { A: { label: 'Ask', consequence: 'Request clarification.' }, B: { label: 'Wait', consequence: 'No action.' }, C: { label: 'Pass', consequence: 'Do not proceed.' } },
      pick: null, due: '2026-11-01', refs: { thread: null, draft: null } })),
    agents: [{ id: 'agent-1', name: 'Synthetic agent', brokerage: null, emails: [], phones: [], markets: ['Example market'], properties: ['example-ref'], contacted: null, answered: null, response_hours: null, last_touch: null }],
    outreach: [{ ref: 'example-ref', priority: 1, address: 'Synthetic property', market: 'Example market', agent_id: 'agent-1', next_step: 'Review the reported question.', follow_up_on: '2026-10-31', contacted: false, answered: false, last_answer_summary: null }] };
}
module.exports = { fixture };
