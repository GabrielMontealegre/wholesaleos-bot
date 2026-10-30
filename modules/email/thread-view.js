'use strict';
const crypto = require('node:crypto');
const { messageId, threadId, receivedTime, savedReplies } = require('../records/mailbox-reply-evidence');
const { gmailThread } = require('../records/mailbox-conversation-preview');
const conversations = require('../records/conversations');
const records = require('../records/record-activity');
function nodes(message) {
  return [messageId(message.message_id) && 'm:' + message.message_id, messageId(message.in_reply_to) && 'm:' + message.in_reply_to, threadId(message.threadId) && 't:' + message.threadId].filter(Boolean);
}
function annotate(messages, store, { now }) {
  const current = receivedTime(now); if (!Number.isFinite(current)) throw Error('email_view_time_invalid');
  const rows = Array.isArray(messages) ? messages.slice(0, 50) : [];
  const graph = new Map();
  const trusted = message => message && message.source_kind === 'connected_mailbox' && typeof message.id === 'string' && message.id.length > 0 && message.id.length <= 1000 && Number.isFinite(receivedTime(message.date)) && receivedTime(message.date) <= current;
  for (const message of rows.filter(trusted)) {
    const keys = nodes(message);
    for (const a of keys) { if (!graph.has(a)) graph.set(a, new Set()); for (const b of keys) graph.get(a).add(b); }
  }
  function component(seed) {
    const seen = new Set(), stack = seed.slice();
    while (stack.length) { const node = stack.pop(); if (seen.has(node)) continue; seen.add(node); for (const next of graph.get(node) || []) stack.push(next); }
    return seen;
  }
  const links = [];
  for (const row of store.conversations || []) {
    const at = receivedTime(row.recorded_at || row.captured_at);
    if (!['operator_input', 'imported_report'].includes(row.source_kind) || !conversations.ROLES.includes(row.role) || !row.channels?.includes('email') || !Number.isFinite(at) || at > current) continue;
    const receipts = savedReplies(row, now);
    const seeds = [...(Array.isArray(row.email_message_ids) ? row.email_message_ids : []).filter(messageId).map(id => 'm:' + id), ...receipts.flatMap(r => [messageId(r.rfc_message_id) && 'm:' + r.rfc_message_id, threadId(r.thread_id) && 't:' + r.thread_id].filter(Boolean)), gmailThread(row.thread_url) && 't:' + gmailThread(row.thread_url)].filter(Boolean);
    if (seeds.length) links.push({ row, nodes: component(seeds) });
  }
  return rows.map((message, index) => {
    const keys = trusted(message) ? [...component(nodes(message))].sort() : [];
    const owners = links.filter(link => keys.some(key => link.nodes.has(key)));
    const identity = keys.length ? keys.join('|') : 'isolated:' + index + ':' + String(message?.id || '');
    const row = owners.length === 1 ? owners[0].row : null;
    const deals = row ? (Array.isArray(row.refs) ? row.refs : []).flatMap(ref => {
      try { if (records.ref(ref) !== ref) return []; } catch { return []; }
      const matches = (store.reviewed_deals || []).filter(deal => records.reference(deal) === ref);
      return matches.length === 1 ? [{ ref, id: matches[0].id }] : [];
    }) : [];
    const linkedRecords = row ? (Array.isArray(row.refs) ? row.refs : []).flatMap(ref => {
      try { if (records.ref(ref) !== ref) return []; } catch { return []; }
      const matches = [['deal', 'reviewed_deals'], ['buyer', 'buyers'], ['lead', 'leads'], ['match', 'record_matches']].flatMap(([kind, collection]) =>
        (store[collection] || []).filter(item => records.reference(item) === ref).map(item => ({ kind, id: item.id, ref })));
      return matches.length === 1 && ['deal', 'buyer'].includes(matches[0].kind) && typeof matches[0].id === 'string' ? matches : [];
    }) : [];
    return { ...message, date: Number.isFinite(receivedTime(message?.date)) ? new Date(receivedTime(message.date)).toISOString() : '',
      thread_key: crypto.createHash('sha256').update(identity).digest('hex'),
      conversation: row ? { role: row.role, role_source_kind: row.source_kind, role_recorded_at: row.recorded_at || row.captured_at, deals, records: linkedRecords } : null,
      link_status: owners.length > 1 ? 'ambiguous' : row ? 'linked' : 'unlinked' };
  });
}
module.exports = { annotate };
