'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildContactCardContext: build } = require('../modules/research/contact-card-context');
const { buildLeadContactBrief } = require('../modules/research/lead-contact-brief');
const ui = require('../dashboard/wos-lead-contact');
const row = { ...require('./helpers/lead-contact-fixture').lead(),
  motivation_evidence_text: 'Property is vacant.', sale_date: 'December 1, 2026', original_loan_amount: 100000,
  original_loan_amount_evidence_text: 'Original loan amount $100,000.',
  source_proof_text: 'Property address: 100 Test St, Example City, TX 75001. Property is vacant. Sale Date: December 1, 2026. Original loan amount $100,000.' };
const before = JSON.stringify(row), result = build(row);
assert.equal(result.why.text, 'Property is vacant.'); assert.equal(result.sale_date.iso, '2026-12-01');
assert.equal(result.sale_date.origin, 'sale_date'); assert.equal(result.debt_clues[0].amount, '100000');
assert.match(result.debt_clues[0].label, /not the current payoff/); assert.equal(result.equity_band, 'unknown');
assert.equal(build({ ...row, sale_date_iso: '2030-01-01', sale_date_resolution: { resolved_iso: '2030-01-01' } }).sale_date.iso, '2026-12-01');
for (const patch of [{ sale_date: '', sale_date_iso: '2030-01-01' }, { sale_date_origin: 'posted_at' },
  { sale_date: '10/06/2026', source_proof_text: 'Sale Date: 10/06/2026.' }, { source_proof_text: '' }, { source_url: 'javascript:bad' }]) assert.equal(build({ ...row, ...patch }).sale_date, null);
assert.equal(build({ ...row, sale_date: '10/06/2026', source_proof_text: 'Sale Date: 10/06/2026. Sale Date: October 6, 2026.' }).sale_date.iso, '2026-10-06');
assert.equal(build({ ...row, motivation_evidence_text: 'Forged motivation' }).why, null);
assert.equal(build({ ...row, original_loan_amount_evidence_text: '' }).debt_clues.length, 0);
assert.equal(build({ ...row, original_loan_amount: 200000 }).debt_clues.length, 0);
const bid = build({ ...row, original_loan_amount: null, minimum_bid: '$10,000', minimum_bid_evidence_text: 'Minimum bid $10,000.' });
assert.equal(bid.debt_clues.length, 0, 'auction bid is never debt');
assert.equal(build({ ...row, contact_brief: { context: { equity_band: 'rich' } }, leverage_dossier: { debt: { original_loan_amount: { value: 999999 } } } }).debt_clues[0].amount, '100000');
assert.equal(JSON.stringify(row), before);
const rendered = ui.markup({ ...row, contact_brief: buildLeadContactBrief(row) });
for (const label of ['Why they may sell:', 'Sale date from source:', 'not the current payoff', 'Equity band:', 'Next step:']) assert(rendered.includes(label));
const past = { ...row, sale_date: 'January 1, 2000', source_proof_text: 'Property address: 100 Test St, Example City, TX 75001. Sale Date: January 1, 2000.' };
assert(ui.markup({ ...past, contact_brief: buildLeadContactBrief(past) }).includes('Ask whether the house is still theirs before discussing an offer.'));
const oldFetch = global.fetch, oldNow = Date.now, oldWrite = fs.writeFileSync;
try {
  global.fetch = () => { throw Error('network forbidden'); }; Date.now = () => { throw Error('clock forbidden'); }; fs.writeFileSync = () => { throw Error('write forbidden'); };
  assert.equal(build(row).sale_date.iso, '2026-12-01'); assert.equal(buildLeadContactBrief(row).call_allowed, true);
} finally { global.fetch = oldFetch; Date.now = oldNow; fs.writeFileSync = oldWrite; }
console.log('contact-card-context: existing strict date/typed-money readers, current raw evidence over caches, wrong-origin/ambiguous/missing/forged negatives, unknown equity, unchanged contact gates and no clock/network/write PASS');
