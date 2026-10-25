'use strict';
const assert = require('node:assert/strict');
const http = require('node:http'), https = require('node:https');
const blocked = [], restore = [];
if (require.main === module) for (const [object, key] of [[global, 'fetch'], [http, 'get'], [http, 'request'], [https, 'get'], [https, 'request']]) {
  const old = object[key]; restore.push(() => { object[key] = old; });
  object[key] = () => { blocked.push(key); throw Error('External network forbidden'); };
}
const { createMailboxReader } = require('../modules/email/mailbox-reader');
const { annotate } = require('../modules/email/thread-view');
const layout = require('../dashboard/workspace/mail-layout-model');
const now = '2026-10-25T12:00:00Z';
const text = 'Actual synthetic source\nwith <img src=x onerror=attack()> text.';
const raw = Buffer.from('From: Source <source@example.test>\r\nSubject: Synthetic subject\r\nDate: Sun, 25 Oct 2026 10:00:00 +0000\r\nMessage-ID: <source@example.test>\r\n\r\n' + text);
const envelope = { from: [{ name: 'Source', address: 'source@example.test' }], date: new Date('2026-10-25T10:00:00Z'), subject: 'Synthetic subject', messageId: '<source@example.test>' };
let calls = [];
class Client {
  constructor() { this.mailbox = { exists: 1, uidValidity: '7' }; }
  on() {} async connect() {} async logout() {} async list() { return []; }
  async getMailboxLock(_, options) { assert.equal(options.readOnly, true); return { release() {} }; }
  async *fetch(_, query) { calls.push('metadata'); assert.equal(query.source, undefined); yield { uid: 1, size: raw.length, flags: new Set(), envelope }; }
  async fetchOne(uid, query) { calls.push(query.source ? 'body' : 'header'); return query.source ? { source: raw } : { uid, size: raw.length, envelope, flags: new Set() }; }
}
async function fixture() {
  const reader = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_APP_PASSWORD: 'synthetic' }, Client });
  const metadata = annotate((await reader.list()).messages, {}, { now })[0];
  const body = annotate([await reader.message(metadata.id)], {}, { now })[0];
  return { metadata, body };
}
async function main() {
  const { metadata, body } = await fixture();
  assert.deepEqual(calls, ['metadata', 'header', 'body'], 'No preview batch or extra source read');
  assert.equal(metadata.snippet, ''); assert.equal(body.body_origin, 'parsed_mime_text');
  const original = JSON.stringify([metadata, body]);
  const preview = layout.openedSnippet(metadata, body, { now });
  assert(preview); assert.equal(preview.snippet, text.replace(/\s+/g, ' '));
  const cache = new Map([[metadata.id, preview]]);
  assert.equal(layout.project([metadata], { now, openedSnippets: cache }).rows[0].snippet, preview.snippet);
  assert.equal(layout.project([metadata], { now }).rows[0].snippet, '', 'Unopened IMAP message has no made-up snippet');
  for (const patch of [{ id: 'wrong' }, { source_kind: 'derived_workflow' }, { date: '2027-01-01T00:00:00Z' }, { from: 'Other <other@example.test>' }, { subject: 'changed' }, { message_id: '<other@example.test>' }, { body_origin: undefined }, { body_origin: 'operator_draft' }, { body: '' }, { body: '\0bad' }, { body: 'x'.repeat(2 * 1024 * 1024 + 1) }]) {
    assert.equal(layout.openedSnippet(metadata, { ...body, ...patch }, { now }), null, 'Forged/missing/oversize body must not become preview');
  }
  assert.equal(layout.openedSnippet({ ...metadata, date: '2027-01-01T00:00:00Z' }, { ...body, date: '2027-01-01T00:00:00Z' }, { now }), null);
  assert.equal(layout.project([{ ...metadata, subject: 'changed' }], { now, openedSnippets: cache }).rows[0].snippet, '', 'Changed metadata invalidates retained excerpt');
  assert.equal(layout.project([metadata, { ...metadata, snippet: 'conflicting' }], { now, openedSnippets: cache }).rows[0].snippet, '');
  assert.equal(layout.openedSnippet(metadata, { ...body, body: 'x'.repeat(1000) }, { now }).snippet.length, 500);
  for (const missing of [undefined, null, '', 7, {}, '\0bad', 'x'.repeat(2 * 1024 * 1024 + 1)]) {
    const reader = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_APP_PASSWORD: 'synthetic' }, Client, parse: async () => ({ text: missing }) });
    assert.equal((await reader.message(metadata.id)).body_origin, null, 'Parser absence/malformed text never proves availability');
  }
  const literal = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_APP_PASSWORD: 'synthetic' }, Client, parse: async () => ({ text: '(No readable text)' }) });
  assert.equal((await literal.message(metadata.id)).body_origin, 'parsed_mime_text', 'A real source literal is distinguished from the fallback at the writer');
  let providerPreview = 'Provider preview';
  const googleImpl = { auth: { OAuth2: class { setCredentials() {} } }, gmail() { return { users: { messages: {
    async list() { return { data: { messages: [{ id: 'oauth1' }] } }; },
    async get(query) { return query.format === 'raw' ? { data: { id: 'oauth1', raw: raw.toString('base64url'), labelIds: [] } } : { data: { id: 'oauth1', snippet: providerPreview, labelIds: [], payload: { headers: [['From', 'source@example.test'], ['Date', now]].map(([name, value]) => ({ name, value })) } } }; }
  } } }; } };
  const oauth = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_CLIENT_ID: 'synthetic', GMAIL_CLIENT_SECRET: 'synthetic', GMAIL_REFRESH_TOKEN: 'synthetic' }, googleImpl });
  const provider = annotate((await oauth.list()).messages, {}, { now });
  assert.equal(provider[0].snippet_origin, 'gmail_provider_snippet');
  assert.equal(layout.project(provider, { now }).rows[0].snippet, 'Provider preview');
  assert.equal(layout.project([{ ...provider[0], snippet_origin: null }], { now }).rows[0].snippet, '');
  assert.equal((await oauth.message('oauth1')).body_origin, 'parsed_mime_text');
  for (const invalid of [undefined, null, 7, {}, '\0bad', 'x'.repeat(4097), '漢'.repeat(2000)]) {
    providerPreview = invalid;
    const rows = annotate((await oauth.list()).messages, {}, { now });
    assert.equal(rows[0].snippet_origin, null);
    assert.equal(layout.project(rows, { now }).rows[0].snippet, '');
  }
  assert.equal(JSON.stringify([metadata, body]), original); assert.deepEqual(blocked, []);
  const clock = Date.now; try { Date.now = () => { throw Error('Ambient clock forbidden'); }; assert(layout.openedSnippet(metadata, body, { now })); } finally { Date.now = clock; }
  console.log('mailbox-snippets: actual adapters/MIME/annotate, provider/body origins, unknown fallback, identity/time/size/conflict negatives, bounded pure projection and unchanged read-only request counts passed');
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => restore.forEach(fn => fn()));
module.exports = { fixture };
