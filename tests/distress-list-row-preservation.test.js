'use strict';
const assert = require('node:assert/strict');
const mapper = require('../modules/sources/distress-list-lead-mapper');
const readers = require('../modules/sources/distress-list-readers');
const XLSX = require('xlsx');
require('csv-parse/sync');
const profile = { source_id: 'synthetic-case-list', source_kind: 'tax_sale', source_url: 'https://records.example.gov/list.csv', county: 'Synthetic', state: 'TX' };
const options = { today: '2026-11-17', captured_at: '2026-11-17T12:00:00Z' };
const row = (address, reference, extra = {}) => ({ fields: { 'Case Number': 'CASE-SHARED', 'Property Address': address, 'Sale Date': '2026-12-01', ...extra }, row_reference: reference });
const inputs = [row('100 Example St', 'row 1'), row('200 Example Ave', 'row 2')];
const before = JSON.stringify(inputs);
const leads = inputs.map(input => mapper.mapRowToLead(input, profile, options));
const first = mapper.mergeLeads([], leads);
assert.equal(first.leads.length, 2, 'Different properties in a case must both survive');
assert.notEqual(leads[0].lead_key, leads[1].lead_key);
assert(!leads[0].lead_key.includes('100 Example'), 'Property identity must not expose an address in the key');
const moved = mapper.mapRowToLead(row('100 Example St', 'row 9', { 'Amount Due': '$150' }), profile, options);
const next = mapper.mergeLeads(first.leads, [moved]);
assert.equal(next.leads.length, 2, 'Moving the same case/property row still merges');
assert.equal(next.updated, 1);
assert(next.audit[0].changes.some(change => change.field === 'source_row_reference' && change.old_value === 'row 1'));
const normalized = mapper.mapRowToLead(row(' 100   EXAMPLE St ', 'row 10'), profile, options);
assert.equal(normalized.lead_key, leads[0].lead_key);
const missing = ['row 3', 'row 4'].map(ref => mapper.mapRowToLead(row('', ref), profile, options));
assert.equal(mapper.mergeLeads([], missing).leads.length, 2, 'Unaddressed rows in one case remain distinct');
assert(missing.every(lead => lead.lane === 'needs_data' && lead.address_verified === false));
assert.notEqual(mapper.mapRowToLead(inputs[0], { ...profile, source_id: 'other-source' }, options).lead_key, leads[0].lead_key);
assert.equal(JSON.stringify(inputs), before);

const csv = 'Case Number,Address,Note\n\nCASE-A,100 Example St,"one\ntwo"\nCASE-B,200 Example Ave,last\n';
assert.deepEqual(readers.readCsv(csv).rows.map(record => record.row_reference), ['row 1 (line 4)', 'row 2 (line 5)']);
assert.equal(readers.readCsv('Address\n100 Example St\n').rows[0].row_reference, 'row 1 (line 2)');
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Case Number', 'Address'], ['A', '100 Example St'], [], ['B', '200 Example Ave']]), 'Synthetic');
assert.deepEqual(readers.readXlsx(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })).rows.map(record => record.row_reference), ['sheet Synthetic row 2', 'sheet Synthetic row 4']);
for (const value of [1e308, Number.MAX_SAFE_INTEGER, 8640000000000001, 1764547200000.5]) {
  const lead = mapper.mapRowToLead(row('100 Example St', 'row 1', { 'Sale Date': value }), profile, options);
  assert.equal(lead.sale_date_status, 'INVALID');
  assert.equal(lead.sale_date, '');
  assert.equal(lead.sale_date_raw, String(value));
  assert.equal(lead.source_row_reference, 'row 1');
  assert.equal(lead.address_verified, false);
}
const valid = mapper.mapRowToLead(row('100 Example St', 'row 1', { 'Sale Date': Date.UTC(2026, 11, 1) }), profile, options);
assert.equal(valid.sale_date, '2026-12-01');
assert.equal(valid.sale_date_status, 'RESOLVED');
let effects = 0;
const http = require('node:http'), https = require('node:https'), fs = require('node:fs');
const restore = [];
try {
  for (const [object, keys] of [[globalThis, ['fetch']], [http, ['get', 'request']], [https, ['get', 'request']], [fs, ['writeFileSync']], [Date, ['now']]]) {
    for (const key of keys) { const original = object[key]; restore.push(() => { object[key] = original; }); object[key] = () => { effects++; throw Error('side_effect'); }; }
  }
  mapper.mergeLeads([], inputs.map(input => mapper.mapRowToLead(input, profile, options)));
  assert.equal(effects, 0);
} finally { restore.reverse().forEach(fn => fn()); }
console.log('distress-list row preservation: shared-case properties, moving duplicates, missing addresses, physical references, invalid epochs and no side effects PASS');
