'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
let effects = 0;
const deny = () => { effects++; throw Error('Side effect forbidden'); };
class Clock extends Date { constructor(...args) { if (!args.length) deny(); super(...args); } static now() { return deny(); } }
const context = { module: { exports: {} }, Date: Clock, require: deny, fetch: deny, setTimeout: deny, process: undefined };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../modules/email/folder-summary.js'), 'utf8'), context);
const { imapStatus, gmailLabel } = context.module.exports;
const observedAt = '2026-10-25T18:00:00Z';
const imap = { folder: 'inbox', path: 'INBOX', uidValidity: 7n, observedAt };
const raw = { path: 'INBOX', uidValidity: 7n, messages: 200, unseen: 12 };
const view = imapStatus(raw, imap);
assert.equal(view.origin, 'imap_status'); assert.equal(view.scope, 'messages'); assert.equal(view.total_messages, 200); assert.equal(view.unread_messages, 12); assert.equal(view.uid_validity, '7'); assert.equal(view.captured_at, observedAt);
assert.equal(imapStatus({ ...raw, messages: 0, unseen: 0 }, imap).unread_messages, 0);
assert.equal(imapStatus({ ...raw, unseen: undefined }, imap).unread_messages, null);
assert.equal(imapStatus({ ...raw, unseen: '12' }, imap).unread_messages, null, 'No coercion of untyped provider counts');
for (const patch of [{ path: 'Other' }, { uidValidity: 8n }, { uidValidity: 0 }, { uidValidity: '007' }, { uidValidity: 4294967296n },
  { messages: undefined }, { messages: '200' }, { messages: -1 }, { messages: Infinity }, { messages: Number.MAX_SAFE_INTEGER + 1 },
  { unseen: 201 }, { exists: 200 }]) assert.equal(imapStatus({ ...raw, ...patch }, imap), null);
assert.equal(imapStatus({ path: 'INBOX', uidValidity: 7n, exists: 200, unseen: 12 }, imap), null, 'SELECT first-unseen sequence never becomes an unread count');
assert.equal(imapStatus(Object.create(raw), imap), null, 'Inherited values are not source fields');
assert.equal(imapStatus({ ...raw }, { ...imap, folder: { toString: deny } }), null, 'No coercion executes a supplied callback');
for (const patch of [{ observedAt: '' }, { observedAt: '2026-02-30T18:00:00Z' }, { observedAt: '10/25/2026' }, { path: '\0INBOX' }, { folder: '../inbox' }]) assert.equal(imapStatus(raw, { ...imap, ...patch }), null);
const gmail = { folder: 'inbox', labelId: 'INBOX', observedAt };
const label = { id: 'INBOX', messagesTotal: 200, messagesUnread: 12, threadsTotal: 150, threadsUnread: 10, resultSizeEstimate: 999 };
const result = gmailLabel(label, gmail);
assert.equal(result.origin, 'gmail_label_counts'); assert.equal(result.total_messages, 200); assert.equal(result.unread_messages, 12); assert.equal(result.scope, 'messages'); assert.equal(result.uid_validity, null);
for (const patch of [{ id: 'SENT' }, { messagesTotal: undefined }, { messagesTotal: '200' }, { messagesTotal: -1 }, { messagesUnread: 201 }]) assert.equal(gmailLabel({ ...label, ...patch }, gmail), null);
assert.equal(gmailLabel({ id: 'INBOX', resultSizeEstimate: 200, threadsTotal: 200 }, gmail), null, 'Estimates and thread totals cannot substitute for message totals');
assert.equal(gmailLabel(Object.create(label), gmail), null);
assert.equal(gmailLabel({ ...label, messagesTotal: 0, messagesUnread: 0 }, gmail).total_messages, 0);
assert.equal(gmailLabel({ ...label, messagesUnread: null }, gmail).unread_messages, null);
assert.equal(gmailLabel(label, { ...gmail, labelId: 'INBOX/other' }), null);
assert.equal(raw.messages, 200); assert.equal(label.resultSizeEstimate, 999); assert.equal(effects, 0);
console.log('mail-folder-summary PREPARATION ONLY: source-bound STATUS/label message counts,real zero,unknown/stale UID/wrong scope/malformed/sequence/estimate negatives and no clock/network/writes passed;no runtime route/UI wiring');
