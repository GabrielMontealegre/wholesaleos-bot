'use strict';
const assert = require('node:assert/strict');
const { createMailboxReader } = require('../../modules/email/mailbox-reader');
const { annotate } = require('../../modules/email/thread-view');

async function sourceLabelledMail(rows, { supported = true, now = '2026-10-26T12:00:00Z', date = '2026-10-24T12:00:00Z' } = {}) {
  const calls = [];
  class Client {
    constructor() { this.mailbox = { exists: rows.length, uidValidity: '7' }; this.capabilities = new Map(supported ? [['X-GM-EXT-1', true]] : []); }
    on() {} async connect() {} async logout() {}
    async getMailboxLock(box, options) { assert.equal(options.readOnly, true); return { release() {} }; }
    async *fetch(range, query) {
      calls.push('metadata'); assert.equal(query.labels, true); assert.equal(query.source, undefined);
      for (const [index, row] of rows.entries()) yield { uid: index + 1, size: 200, flags: new Set(), labels: row.labels,
        envelope: { from: [{ name: row.name || 'Synthetic source', address: 'source@example.test' }],
          subject: row.subject || 'Synthetic report', messageId: '<labels-' + index + '@example.test>', date: new Date(date) } };
    }
    async fetchOne() { throw Error('Unexpected body read'); }
  }
  const reader = createMailboxReader({ env: { GMAIL_USER: 'operator@example.test', GMAIL_APP_PASSWORD: 'synthetic' }, Client });
  const result = await reader.list('inbox', 50);
  return { messages: annotate(result.messages, {}, { now }), calls };
}
module.exports = { sourceLabelledMail };
