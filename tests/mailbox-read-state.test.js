'use strict';
const assert = require('node:assert/strict');
const http = require('node:http'), https = require('node:https');
const blocked = [], restore = [];
for (const [object, key] of [[global, 'fetch'], [http, 'get'], [http, 'request'], [https, 'get'], [https, 'request']]) {
  const old = object[key]; restore.push(() => { object[key] = old; });
  object[key] = () => { blocked.push(key); throw Error('External network forbidden'); };
}
const { createMailboxReader } = require('../modules/email/mailbox-reader');
const { annotate } = require('../modules/email/thread-view');
const model = require('../dashboard/workspace/email-model');
const now = '2026-10-25T12:00:00Z';
const raw = Buffer.from('From: Source <source@example.test>\r\nTo: Operator <operator@example.test>\r\nMessage-ID: <source@example.test>\r\nDate: Sun, 25 Oct 2026 10:00:00 +0000\r\nSubject: Synthetic read-state fixture\r\n\r\nSynthetic body.');
let flags, labels, calls = [];
const envelope = { from: [{ address: 'source@example.test' }], messageId: '<source@example.test>', date: new Date('2026-10-25T10:00:00Z') };
class Client {
  constructor() { this.mailbox = { exists: 1, uidValidity: '7' }; }
  on() {} async connect() {} async logout() {} async list() { return []; }
  async getMailboxLock(box, options) { assert.equal(options.readOnly, true); return { release() {} }; }
  async *fetch(range, query) { calls.push('metadata'); assert.equal(query.flags, true); assert.equal(query.source, undefined); yield { uid: 1, size: raw.length, envelope, flags }; }
  async fetchOne(uid, query) { calls.push(query.source ? 'body' : 'header'); return query.source ? { source: raw } : { uid, size: raw.length, envelope, flags }; }
}
const googleImpl = { auth: { OAuth2: class { setCredentials() {} } }, gmail() { return { users: { messages: {
  async list() { calls.push('list'); return { data: { messages: [{ id: 'source1' }] } }; },
  async get(query) {
    calls.push(query.format);
    return { data: { id: 'source1', threadId: 'abcdef1234', labelIds: labels, raw: raw.toString('base64url'), payload: { headers: [
      ['From', 'Source <source@example.test>'], ['Date', 'Sun, 25 Oct 2026 10:00:00 +0000'], ['Message-ID', '<source@example.test>']
    ].map(([name, value]) => ({ name, value })) } } };
  }
} } }; } };
function check(message, read, origin) {
  assert.equal(message.read, read); assert.equal(message.unread, read === null ? null : !read);
  assert.equal(message.read_state_origin, read === null ? null : origin);
  const annotated = annotate([message], {}, { now });
  assert.equal(annotated[0].read_state_origin, message.read_state_origin);
  assert.equal(model.list(annotated, { now }).threads[0].unread, read === null ? null : !read);
}
async function main() {
  const imap = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_APP_PASSWORD: 'synthetic' }, Client });
  for (const [value, read] of [[new Set(), false], [new Set(['\\Seen']), true], [new Set(['\\Flagged']), false], [undefined, null], [null, null], [[], null], [{ has: () => false }, null], [new Set([null]), null], [new Set(['\\Seen', 'bad\nflag']), null]]) {
    flags = value; calls = [];
    const listed = await imap.list('inbox'); check(listed.messages[0], read, 'imap_flags'); assert.deepEqual(calls, ['metadata']);
    check(await imap.message(listed.messages[0].id), read, 'imap_flags'); assert.deepEqual(calls, ['metadata', 'header', 'body']);
  }
  const oauth = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_CLIENT_ID: 'synthetic', GMAIL_CLIENT_SECRET: 'synthetic', GMAIL_REFRESH_TOKEN: 'synthetic' }, googleImpl });
  for (const [value, read] of [[[], true], [['INBOX'], true], [['UNREAD'], false], [undefined, null], [null, null], ['UNREAD', null], [[null], null], [Array(1), null], [['INBOX', 'bad\nlabel'], null]]) {
    labels = value; calls = [];
    check((await oauth.list('inbox')).messages[0], read, 'gmail_label_ids'); assert.deepEqual(calls, ['list', 'metadata']);
    check(await oauth.message('source1'), read, 'gmail_label_ids'); assert.deepEqual(calls, ['list', 'metadata', 'raw']);
  }
  assert.deepEqual(blocked, []);
  console.log('mailbox-read-state: genuine flags/labels, unknown malformed states, list/body parity, actual annotation/projection, read-only locks and unchanged request counts passed');
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => restore.forEach(fn => fn()));
