'use strict';
const records = require('../records/record-activity');

function buildPending(store, conversations, { now, today }) {
  const clock = Date.parse(now), targets = new Map(), buyers = new Map();
  const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && Date.parse(value) <= clock && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
  for (const collection of ['buyers', 'reviewed_deals', 'leads', 'record_matches']) for (const row of store[collection] || []) {
    const ref = records.reference(row);
    if (ref) targets.set(ref, targets.has(ref) ? null : row);
    if (collection === 'buyers' && typeof row.id === 'string') buyers.set(row.id, buyers.has(row.id) ? null : row);
  }
  const groups = { drafts: [], waiting: [], bounced: [], reminders: [] };
  for (const c of conversations) {
    const common = { key: 'conversation:' + c.id, heading: c.person, ref: c.refs.length === 1 ? c.refs[0] : '',
      conversation: c, recorded_at: c.captured_at, source_kind: c.source_kind, source_url: c.source_url };
    if (c.status === 'to_send') groups.drafts.push({ ...common, label: 'Draft not sent',
      reason: c.ready_message ? 'Recorded draft awaits your review and Send.' : 'Draft text has not been recorded.' });
    else if (c.status === 'waiting_on_deal' || c.status !== 'hot' && c.last_out && (!c.last_in || c.last_out > c.last_in) && c.due_date > today) {
      groups.waiting.push({ ...common, label: 'Waiting on someone else', reason: 'Waiting on a recorded conversation reply.', waiting_since: c.last_out || null });
    } else if (c.status !== 'hot' && (c.due_date || c.next_step)) groups.reminders.push({ ...common, label: "Don't forget",
      reason: c.next_step || 'Review the recorded follow-up.', due_date: c.due_date || null });
  }
  const drafts = store.buyer_email_drafts || [], ids = new Map();
  for (const d of drafts) if (d && typeof d.id === 'string') ids.set(d.id, (ids.get(d.id) || 0) + 1);
  for (const d of drafts) {
    const buyer = buyers.get(d?.buyer_id), ref = buyer && records.reference(buyer);
    if (!d || !d.id || ids.get(d.id) !== 1 || !buyer || !ref || targets.get(ref) !== buyer || !stamp(d.created_at) || !['draft', 'sending', 'unknown'].includes(d.status) || d.sent_at ||
      (store.email_delivery_receipts || []).some(r => r.approval_id === d.id && r.status === 'accepted')) continue;
    groups.drafts.push({ key: 'buyer-draft:' + d.id, heading: buyer.name || 'Buyer name not recorded', ref,
      label: 'Saved email not confirmed sent', reason: d.status === 'draft' ? 'Saved draft; review the current buyer message before sending.' : 'Send outcome is uncertain. Check Sent mail before taking any action.',
      recorded_at: d.created_at, source_kind: 'recorded_workflow' });
  }
  // A bounce report is historical evidence, not an inferred current delivery state.
  const bounces = new Map();
  for (const event of store.activities || []) {
    const refs = [...new Set([event.buyer_ref, event.deal_ref, event.match_ref].filter(Boolean))];
    const ref = refs[0], at = event.ts || event.created_at;
    if (event.type !== 'bounce' || refs.length !== 1 || !stamp(at) || !targets.get(ref)) continue;
    const prior = bounces.get(ref);
    if (!prior || Date.parse(at) > Date.parse(prior.at)) bounces.set(ref, { at });
  }
  for (const [ref, event] of bounces) {
    const row = targets.get(ref);
    groups.bounced.push({ key: 'bounce:' + ref, heading: row.name || 'Linked contact record', ref,
      label: 'Bounce reported', reason: 'Review the reported bounce and current contact details. Resolution is not recorded here.',
      recorded_at: event.at, source_kind: 'recorded_activity' });
  }
  for (const items of Object.values(groups)) items.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.key.localeCompare(b.key));
  return { ...groups, coverage: { drafts: 'Saved buyer drafts and recorded conversation drafts only', bounced: 'Recorded bounce events only; mailbox delivery status is not connected', reminders: 'Existing recorded conversation reminders only' } };
}
module.exports = { buildPending };
