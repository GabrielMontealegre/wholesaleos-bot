'use strict';
const assert = require('node:assert/strict'), http = require('node:http'), https = require('node:https');
const blocked = [], restore = [];
for (const [object, key] of [[global, 'fetch'], [http, 'get'], [http, 'request'], [https, 'get'], [https, 'request']]) { const old = object[key]; restore.push(() => { object[key] = old; }); object[key] = () => { blocked.push(key); throw Error('External network forbidden'); }; }
const { createMailboxReader } = require('../modules/email/mailbox-reader');
const from = [{ name: 'Last, First', address: 'source@example.test' }], to = [{ name: 'Operator', address: 'operator@example.test' }], cc = [{ name: 'Source copy', address: 'copy@example.test' }];
const raw = 'From: "Last, First" <source@example.test>\r\nTo: Operator <operator@example.test>\r\nCc: Source copy <copy@example.test>\r\nMessage-ID: <source@example.test>\r\nDate: Tue, 20 Oct 2026 12:00:00 +0000\r\nSubject: Synthetic source\r\n\r\nSynthetic text';
const envelope = { from, to, cc, messageId: '<source@example.test>', date: new Date('2026-10-20T12:00:00Z'), subject: 'Synthetic source' };
class Client {
  constructor() { this.mailbox = { exists: 1, uidValidity: '7' }; }
  on() {} async connect() {} async logout() {} close() {} async list() { return []; }
  async getMailboxLock(_, options) { assert.equal(options.readOnly, true); return { release() {} }; }
  async *fetch() { yield { uid: 1, size: Buffer.byteLength(raw), envelope }; }
  async fetchOne(_, fields) { return fields.source ? { source: Buffer.from(raw) } : { uid: 1, size: Buffer.byteLength(raw), envelope }; }
}
function check(message) {
  assert.equal(message.source_kind, 'connected_mailbox');
  assert.deepEqual(message.from_addresses, ['source@example.test']); assert.deepEqual(message.to_addresses, ['operator@example.test']); assert.deepEqual(message.cc_addresses, ['copy@example.test']);
  assert.equal(message.message_id, '<source@example.test>');
}
async function main() {
  const imap = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_APP_PASSWORD: 'synthetic-fixture' }, Client });
  const listed = await imap.list('inbox'); check(listed.messages[0]); check(await imap.message(listed.messages[0].id));
  const googleImpl = { auth: { OAuth2: class { setCredentials() {} } }, gmail() { return { users: { messages: {
    async list() { return { data: { messages: [{ id: 'source1' }] } }; },
    async get(input) {
      if (input.format === 'raw') return { data: { id: 'source1', threadId: 'abcdef1234', raw: Buffer.from(raw).toString('base64url') } };
      assert(input.metadataHeaders.includes('Cc'));
      return { data: { id: 'source1', threadId: 'abcdef1234', payload: { headers: [
        ['From', '"Last, First" <source@example.test>'], ['To', 'Operator <operator@example.test>'], ['Cc', 'Source copy <copy@example.test>'], ['Message-ID', '<source@example.test>'], ['Date', 'Tue, 20 Oct 2026 12:00:00 +0000'], ['Subject', 'Synthetic source']
      ].map(([name, value]) => ({ name, value })) } } };
    }
  } } }; } };
  const oauth = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_CLIENT_ID: 'synthetic-id', GMAIL_CLIENT_SECRET: 'synthetic-value', GMAIL_REFRESH_TOKEN: 'synthetic-refresh' }, googleImpl });
  const rows = await oauth.list('inbox'); check(rows.messages[0]); assert.equal(rows.messages[0].sender_name, 'Last, First'); check(await oauth.message('source1'));
  assert.deepEqual(blocked, []);
  console.log('mailbox-participants: IMAP envelope/body and OAuth metadata/raw MIME preserve exact structured From/To/CC with quoted names, no address inference, read-only locks and zero network passed');
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => restore.forEach(fn => fn()));
