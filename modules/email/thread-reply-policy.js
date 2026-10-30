'use strict';
const crypto = require('node:crypto');
const { annotate } = require('./thread-view');
const { messageId, receivedTime } = require('../records/mailbox-reply-evidence');
const PREVIEW_MS = 300000, HOURLY_CAP = 30;
function fail(code, status = 400) { const e = new Error('thread_reply_' + code); e.code = e.message; e.status = status; throw e; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function address(value) {
  if (typeof value !== 'string' || value.length > 254 || value !== value.trim() || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value) || /\.\.|^\.|\.@/.test(value)) fail('address_invalid');
  return value;
}
function addresses(values, maxInput = 30) {
  if (!Array.isArray(values) || values.length > maxInput) fail('addresses_invalid');
  const seen = new Set();
  const result = values.map(address).filter(value => { const key = value.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
  if (result.length > 30) fail('addresses_invalid'); return result;
}
function ids(values) {
  if (!Array.isArray(values) || !values.length || values.length > 30 || values.some(v => typeof v !== 'string' || !v || v.length > 1000) || new Set(values).size !== values.length) fail('anchor_invalid');
  return values;
}
function clock(now) { const time = receivedTime(now); if (!Number.isFinite(time)) fail('clock_invalid', 503); return time; }
function history(store) { if (store.thread_reply_previews != null && !Array.isArray(store.thread_reply_previews)) fail('store_invalid', 503); return store.thread_reply_previews || []; }
function context(messages, store, { now, own, message_ids, thread_key }) {
  const time = clock(now), wanted = ids(message_ids); address(own);
  if (!/^[a-f0-9]{64}$/.test(thread_key || '') || !Array.isArray(messages) || messages.length !== wanted.length || new Set(messages.map(m => m?.id)).size !== wanted.length) fail('anchor_invalid');
  if (messages.some(m => !m || !wanted.includes(m.id) || m.source_kind !== 'connected_mailbox' || !messageId(m.message_id) || /[\x00-\x1f]/.test(m.message_id) || !Number.isFinite(receivedTime(m.date)) || receivedTime(m.date) > time || typeof m.body !== 'string')) fail('source_invalid', 409);
  if (new Set(messages.map(m => m.message_id)).size !== wanted.length) fail('anchor_ambiguous', 409);
  const annotated = annotate(messages, store, { now });
  if (annotated.some(m => m.thread_key !== thread_key || m.link_status === 'ambiguous')) fail('thread_changed', 409);
  const ownKey = own.toLowerCase();
  const source = annotated.map(m => ({ ...m, from_addresses: addresses(m.from_addresses), to_addresses: addresses(m.to_addresses), cc_addresses: addresses(m.cc_addresses) }));
  const participants = addresses(source.flatMap(m => [...m.from_addresses, ...m.to_addresses, ...m.cc_addresses]), 2700);
  if (!participants.some(v => v.toLowerCase() === ownKey)) fail('mailbox_participant_required', 409);
  source.sort((a, b) => receivedTime(a.date) - receivedTime(b.date) || a.id.localeCompare(b.id));
  const latest = source.at(-1);
  const to = addresses([...latest.from_addresses, ...latest.to_addresses], 60).filter(v => v.toLowerCase() !== ownKey);
  const cc = latest.cc_addresses.filter(v => v.toLowerCase() !== ownKey && !to.some(t => t.toLowerCase() === v.toLowerCase()));
  return { message_ids: wanted.slice().sort(), thread_key, anchor: latest.message_id, thread_id: latest.threadId || '',
    participants: participants.filter(v => v.toLowerCase() !== ownKey), to, cc,
    subject: /^re:/i.test(latest.subject || '') ? latest.subject : 'Re: ' + (latest.subject || '(No subject)'),
    links: latest.conversation?.records || [],
    digest: hash(source.map(m => [m.id, m.message_id, m.in_reply_to, m.threadId, m.date, m.from_addresses, m.to_addresses, m.cc_addresses, m.subject, hash(m.body), m.conversation])) };
}
function prepare(input, ctx, { now, own, operatorId }) {
  clock(now);
  if (!input || Array.isArray(input) || Object.keys(input).some(k => !['message_ids', 'thread_key', 'to', 'cc', 'added_recipients', 'subject', 'body'].includes(k)) || typeof operatorId !== 'string' || !operatorId) fail('request_invalid');
  if (hash(ids(input.message_ids).slice().sort()) !== hash(ctx.message_ids) || input.thread_key !== ctx.thread_key) fail('anchor_invalid');
  const to = addresses(input.to), cc = addresses(input.cc || []), added = addresses(input.added_recipients || []);
  const selected = [...to, ...cc], keys = selected.map(v => v.toLowerCase()), allowed = ctx.participants.map(v => v.toLowerCase());
  if (!to.length || selected.length > 30 || new Set(keys).size !== keys.length || keys.includes(own.toLowerCase())) fail('recipients_invalid');
  if (added.some(v => !keys.includes(v.toLowerCase()) || allowed.includes(v.toLowerCase())) || selected.some(v => !allowed.includes(v.toLowerCase()) && !added.some(a => a.toLowerCase() === v.toLowerCase()))) fail('recipient_not_reviewed', 409);
  if (typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 240 || /[\x00-\x1f]/.test(input.subject) || typeof input.body !== 'string' || !input.body.trim() || input.body.length > 12000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.body)) fail('text_invalid');
  const message = { message_ids: ctx.message_ids, thread_key: ctx.thread_key, thread_id: ctx.thread_id, anchor: ctx.anchor,
    context_digest: ctx.digest, links: ctx.links, to, cc, added_recipients: added, subject: input.subject, body: input.body, operator_id: operatorId };
  return { ...message, version: hash(message) };
}
function fresh(preview, now) { const age = clock(now) - receivedTime(preview.created_at); return Number.isFinite(age) && age >= 0 && age <= PREVIEW_MS; }
function withinCap(store, now) {
  const time = clock(now), attempts = history(store).filter(p => ['sending', 'accepted', 'unknown'].includes(p.status));
  if (attempts.some(p => !Number.isFinite(receivedTime(p.attempted_at)) || receivedTime(p.attempted_at) > time)) fail('attempt_history_invalid', 503);
  if (attempts.filter(p => time - receivedTime(p.attempted_at) < 3600000).length >= HOURLY_CAP) fail('rate_limited', 429);
}
module.exports = { context, prepare, history, fresh, withinCap, hash, fail, address, ids, PREVIEW_MS, HOURLY_CAP };
