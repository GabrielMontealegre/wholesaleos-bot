'use strict';
const assert = require('node:assert/strict');
const http = require('node:http'), https = require('node:https');
const blocked = [], restore = [];
for (const [object, key] of [[global, 'fetch'], [http, 'get'], [http, 'request'], [https, 'get'], [https, 'request']]) {
  const old = object[key]; restore.push(() => { object[key] = old; });
  object[key] = () => { blocked.push(key); throw Error('External network forbidden'); };
}
const { providerLabels } = require('../modules/email/provider-labels');
const { createMailboxReader } = require('../modules/email/mailbox-reader');
const { annotate } = require('../modules/email/thread-view');
const now = '2026-10-26T10:00:00Z';
const raw = Buffer.from('From: Source <source@example.test>\r\nTo: Operator <operator@example.test>\r\nMessage-ID: <labels@example.test>\r\nDate: Mon, 26 Oct 2026 08:00:00 +0000\r\nSubject: Synthetic labels\r\n\r\nSynthetic body.');
let labels, supported = true, calls = [], callbacks = 0;
const envelope = { from: [{ address: 'source@example.test' }], messageId: '<labels@example.test>', date: new Date('2026-10-26T08:00:00Z') };
class Client {
  constructor() { this.mailbox = { exists: 1, uidValidity: '7' }; this.capabilities = new Map(supported ? [['X-GM-EXT-1', true]] : []); }
  on() {} async connect() {} async logout() {} async list() { return []; }
  async getMailboxLock(box, options) { assert.equal(options.readOnly, true); return { release() {} }; }
  async *fetch(range, query) {
    calls.push('metadata'); assert.equal(query.labels, true); assert.equal(query.source, undefined);
    yield { uid: 1, size: raw.length, envelope, labels, flags: new Set() };
  }
  async fetchOne(uid, query) {
    calls.push(query.source ? 'body' : 'header');
    if (!query.source) assert.equal(query.labels, true);
    return query.source ? { source: raw } : { uid, size: raw.length, envelope, labels, flags: new Set() };
  }
}
const googleImpl = { auth: { OAuth2: class { setCredentials() {} } }, gmail() { return { users: { messages: {
  async list() { calls.push('list'); return { data: { messages: [{ id: 'source1' }] } }; },
  async get(query) {
    calls.push(query.format);
    return { data: { id: 'source1', labelIds: labels, raw: raw.toString('base64url'), payload: { headers: [
      ['From', 'Source <source@example.test>'], ['Date', 'Mon, 26 Oct 2026 08:00:00 +0000'], ['Message-ID', '<labels@example.test>']
    ].map(([name, value]) => ({ name, value })) } } };
  }
}, labels: { async list() { throw Error('No new registry request permitted'); } } } }; } };
function check(message, expected) {
  assert.deepEqual(message.provider_labels, expected);
  assert.deepEqual(annotate([message], {}, { now })[0].provider_labels, expected);
  assert.equal(message.labels, undefined, 'The legacy unproven display-label field is not populated');
}
async function main() {
  const sparse = Array(1), accessor = [];
  Object.defineProperty(accessor, '0', { get() { callbacks++; throw Error('Getter forbidden'); } }); accessor.length = 1;
  const coercible = { toString() { callbacks++; throw Error('Coercion forbidden'); } };
  for (const [origin, values] of [
    ['imap_gmail_labels', [undefined, null, [], new Set([null]), new Set(['bad\nlabel']), new Set(['\u202elabel']), new Set(['x'.repeat(201)]), new Set(Array.from({ length: 101 }, (_, i) => 'label' + i))]],
    ['gmail_label_ids', [undefined, null, new Set(), sparse, accessor, [coercible], ['INBOX', 'INBOX'], ['WOS/Reports'], ['bad\nlabel'], [''], Array.from({ length: 101 }, (_, i) => 'Label_' + i)]]
  ]) for (const value of values) assert.equal(providerLabels(value, origin), null);
  assert.equal(providerLabels(['INBOX'], 'derived_workflow'), null);
  assert.equal(callbacks, 0);
  const oldNow = Date.now;
  try {
    Date.now = () => { throw Error('Ambient clock forbidden'); };
    const source = new Set(['WOS/Reports', '\\Inbox']);
    const receipt = providerLabels(source, 'imap_gmail_labels'); source.add('later');
    assert.deepEqual(receipt, { origin: 'imap_gmail_labels', scope: 'message', names: ['WOS/Reports', '\\Inbox'] });
    assert.deepEqual(providerLabels(['INBOX', 'Label_123'], 'gmail_label_ids'), { origin: 'gmail_label_ids', scope: 'message', ids: ['INBOX', 'Label_123'] });
  } finally { Date.now = oldNow; }
  const imap = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_APP_PASSWORD: 'synthetic' }, Client });
  for (const value of [new Set(['WOS/Reports', '\\Inbox']), new Set(), undefined, new Set([null])]) {
    labels = value; calls = [];
    const listed = await imap.list('inbox'), expected = providerLabels(value, 'imap_gmail_labels');
    check(listed.messages[0], expected); check(await imap.message(listed.messages[0].id), expected);
    assert.deepEqual(calls, ['metadata', 'header', 'body']);
  }
  supported = false; labels = new Set(['WOS/Reports']); calls = [];
  const unsupported = await imap.list('inbox'); check(unsupported.messages[0], null);
  check(await imap.message(unsupported.messages[0].id), null);
  assert.deepEqual(calls, ['metadata', 'header', 'body']);
  const oauth = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_CLIENT_ID: 'synthetic', GMAIL_CLIENT_SECRET: 'synthetic', GMAIL_REFRESH_TOKEN: 'synthetic' }, googleImpl });
  for (const value of [['INBOX', 'Label_123'], [], undefined, sparse, ['INBOX', 'INBOX']]) {
    labels = value; calls = []; const expected = providerLabels(value, 'gmail_label_ids');
    check((await oauth.list('inbox')).messages[0], expected); check(await oauth.message('source1'), expected);
    assert.deepEqual(calls, ['list', 'metadata', 'raw']);
  }
  assert.deepEqual(blocked, []);
  console.log('mailbox-provider-labels: exact per-message names versus opaque IDs, genuine capability gate, bounded unknown/empty/malformed receipts, real adapter/MIME/annotation parity, unchanged reads and no clock/network/writers passed');
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => restore.forEach(fn => fn()));
