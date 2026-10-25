'use strict';
const assert = require('node:assert/strict'), http = require('node:http'), https = require('node:https');
const blocked = [], restore = [];
if (require.main === module) for (const [object, key] of [[global, 'fetch'], [http, 'get'], [http, 'request'], [https, 'get'], [https, 'request']]) {
  const old = object[key]; restore.push(() => { object[key] = old; }); object[key] = () => { blocked.push(key); throw Error('External network forbidden'); };
}
const { createMailboxReader } = require('../modules/email/mailbox-reader');
const { manifest } = require('../modules/email/attachment-manifest');
const { annotate } = require('../modules/email/thread-view');
const layout = require('../dashboard/workspace/mail-layout-model');
const now = '2026-10-25T17:00:00Z';
const name = 'Synthetic ' + 'long-name-'.repeat(10) + '<img src=x onerror=attack()>.pdf';
const raw = Buffer.from(['From: Source <source@example.test>', 'To: Operator <operator@example.test>', 'Subject: Synthetic attachment source', 'Date: Sun, 25 Oct 2026 10:00:00 +0000',
  'Message-ID: <attachment@example.test>', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="fixture-boundary"', '',
  '--fixture-boundary', 'Content-Type: text/plain; charset=utf-8', '', 'Synthetic source body. No automatic downloads.',
  '--fixture-boundary', 'Content-Type: application/pdf', 'Content-Disposition: attachment; filename="' + name + '"', 'Content-Transfer-Encoding: base64', '', 'JVBERg==',
  '--fixture-boundary', 'Content-Type: image/png', 'Content-Disposition: inline; filename="synthetic-inline.png"', 'Content-ID: <fixture-image>', 'Content-Transfer-Encoding: base64', '', 'AQIDBA==', '--fixture-boundary--', ''].join('\r\n'));
const envelope = { from: [{ name: 'Source', address: 'source@example.test' }], to: [{ name: 'Operator', address: 'operator@example.test' }], subject: 'Synthetic attachment source', date: new Date('2026-10-25T10:00:00Z'), messageId: '<attachment@example.test>' };
async function fixture() {
  const calls = [];
  class Client {
    constructor() { this.mailbox = { exists: 1, uidValidity: '7' }; }
    on() {} async connect() {} async logout() {} async list() { return []; }
    async getMailboxLock(_, options) { assert.equal(options.readOnly, true); return { release() {} }; }
    async *fetch(_, query) { calls.push('metadata'); assert.equal(query.source, undefined); assert.equal(query.bodyStructure, undefined); yield { uid: 1, size: raw.length, flags: new Set(), envelope }; }
    async fetchOne(uid, query) { calls.push(query.source ? 'body' : 'header'); return query.source ? { source: raw } : { uid, size: raw.length, flags: new Set(), envelope }; }
  }
  const reader = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_APP_PASSWORD: 'synthetic' }, Client });
  const metadata = annotate((await reader.list()).messages, {}, { now })[0];
  const body = annotate([await reader.message(metadata.id)], {}, { now })[0];
  return { metadata, body, calls };
}
async function main() {
  const { metadata, body, calls } = await fixture();
  assert.deepEqual(calls, ['metadata', 'header', 'body']); assert.equal(metadata.attachment_manifest, undefined);
  assert.equal(body.attachment_manifest_origin, 'parsed_mime_metadata'); assert.equal(body.attachment_manifest.length, 2);
  const first = body.attachment_manifest[0];
  assert.equal(first.filename, name); assert.equal(first.content_type, 'application/pdf'); assert.equal(first.size_bytes, 4); assert.equal(first.disposition, 'attachment');
  assert.equal(body.attachment_manifest[1].disposition, 'inline');
  for (const part of body.attachment_manifest) assert.deepEqual(Object.keys(part).sort(), ['part_index', 'filename', 'content_type', 'size_bytes', 'disposition', 'related'].sort());
  assert.deepEqual(layout.attachmentManifest(metadata, body, { now }), body.attachment_manifest);
  const reply = require('../modules/email/thread-reply-policy');
  const options = { now, own: 'operator@example.test', message_ids: [body.id], thread_key: body.thread_key };
  const context = reply.context([body], {}, options);
  assert.equal(reply.context([{ ...body, attachment_manifest: null, attachment_manifest_origin: null }], {}, options).digest, context.digest, 'Read-only manifests do not change the D-061 source digest');
  assert.throws(() => reply.prepare({ message_ids: [body.id], thread_key: body.thread_key, to: context.to, cc: [], added_recipients: [], subject: context.subject, body: 'Synthetic reply', attachments: [] }, context, { now, own: options.own, operatorId: 'synthetic-operator' }), /request_invalid/, 'Attachment sending remains outside this read-only slice');
  assert.deepEqual(layout.attachmentManifest(metadata, { ...body, body: '(No readable text)', body_origin: null }, { now }), body.attachment_manifest, 'File metadata does not require an invented readable body');
  for (const patch of [{ id: 'wrong' }, { source_kind: 'derived_workflow' }, { subject: 'wrong' }, { date: '2027-01-01T00:00:00Z' }, { attachment_manifest_origin: null }, { attachment_manifest: [{ ...first, content: 'forged data' }] }, { attachment_manifest: [{ ...first, size_bytes: -1 }] }, { attachment_manifest: [{ ...first, filename: '../secret.pdf' }] }, { attachment_manifest: [null] }]) {
    assert.equal(layout.attachmentManifest(metadata, { ...body, ...patch }, { now }), null);
  }
  for (const parts of [undefined, null, {}, [null], [{}], Array(1), Array(51).fill({ contentDisposition: 'attachment' })]) {
    assert.deepEqual(manifest(parts), { attachment_manifest: null, attachment_manifest_origin: null });
  }
  assert.deepEqual(manifest([]), { attachment_manifest: [], attachment_manifest_origin: 'parsed_mime_metadata' });
  for (const filename of ['../file.pdf', 'C:\\file.pdf', '\0bad', '\u202efile.pdf', 'x'.repeat(201)]) assert.equal(manifest([{ filename, contentDisposition: 'attachment' }]).attachment_manifest[0].filename, null);
  const missing = manifest([{ contentDisposition: 'attachment', contentType: '<script>', size: '4' }]).attachment_manifest[0];
  assert.equal(missing.filename, null); assert.equal(missing.content_type, null); assert.equal(missing.size_bytes, null);
  assert.equal(manifest([{ contentDisposition: 'attachment', size: 0 }]).attachment_manifest[0].size_bytes, 0);
  const googleImpl = { auth: { OAuth2: class { setCredentials() {} } }, gmail() { return { users: { messages: {
    async get(query) { assert.equal(query.format, 'raw'); return { data: { id: 'oauth1', raw: raw.toString('base64url'), labelIds: [] } }; },
    attachments: { get() { throw Error('No attachment download API allowed'); } }
  } } }; } };
  const oauth = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_CLIENT_ID: 'synthetic', GMAIL_CLIENT_SECRET: 'synthetic', GMAIL_REFRESH_TOKEN: 'synthetic' }, googleImpl });
  assert.deepEqual((await oauth.message('oauth1')).attachment_manifest, body.attachment_manifest);
  const clock = Date.now; try { Date.now = () => { throw Error('Ambient clock forbidden'); }; assert.deepEqual(layout.attachmentManifest(metadata, body, { now }), body.attachment_manifest); assert.equal(manifest([]).attachment_manifest.length, 0); } finally { Date.now = clock; }
  assert.deepEqual(blocked, []);
  console.log('mailbox-attachments: real multipart MIME/IMAP/OAuth, metadata-only allowlist,no buffers/downloads,unknown/zero/path/control/type/size/identity negatives,purity and unchanged reads passed');
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => restore.forEach(fn => fn()));
module.exports = { fixture };
