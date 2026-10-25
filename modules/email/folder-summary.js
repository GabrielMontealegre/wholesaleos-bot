'use strict';
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 19) === value.slice(0, 19) ? at : null;
}
function uid(value) {
  if (!['number', 'string', 'bigint'].includes(typeof value) || typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const text = String(value);
  return /^[1-9]\d{0,9}$/.test(text) && BigInt(text) <= 4294967295n ? text : null;
}
function count(value) { return Number.isSafeInteger(value) && value >= 0 ? value : null; }
function optionsValid(options) {
  return options && /^[a-z_]{1,32}$/.test(options.folder || '') && instant(options.observedAt) !== null;
}
function snapshot(options, origin, scopeId, validity, total, unread) {
  if (!optionsValid(options) || count(total) === null) return null;
  const unseen = count(unread);
  if (unseen !== null && unseen > total) return null;
  return { folder: options.folder, source_kind: 'connected_mailbox', origin, scope_id: scopeId,
    uid_validity: validity, captured_at: options.observedAt, scope: 'messages',
    total_messages: total, unread_messages: unseen };
}
function imapStatus(raw, options) {
  if (!optionsValid(options) || !raw || typeof raw !== 'object' || Object.hasOwn(raw, 'exists') ||
      typeof options.path !== 'string' || !options.path || options.path.length > 200 || /[\x00-\x1f\x7f]/.test(options.path) ||
      raw.path !== options.path || !uid(options.uidValidity) || uid(raw.uidValidity) !== uid(options.uidValidity)) return null;
  // SELECT's mailbox.unseen is a sequence number. Only a STATUS response with
  // an explicit messages count may supply this snapshot.
  return snapshot(options, 'imap_status', options.path, uid(raw.uidValidity), raw.messages, raw.unseen);
}
function gmailLabel(raw, options) {
  if (!optionsValid(options) || !raw || typeof raw !== 'object' || typeof options.labelId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,200}$/.test(options.labelId) || raw.id !== options.labelId) return null;
  return snapshot(options, 'gmail_label_counts', options.labelId, null, raw.messagesTotal, raw.messagesUnread);
}
module.exports = { imapStatus, gmailLabel };
