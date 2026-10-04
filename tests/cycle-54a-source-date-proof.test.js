'use strict';

const assert = require('assert');
const { resolveSourceSaleDate, saleDateStaleness } = require('../modules/research/resolve-source-sale-date');
const { normalizeSourceDate } = require('../modules/research/normalize-source-date');
const notice = require('../modules/sources/dallas-foreclosure-notice-adapter');
const queue = require('../modules/research/deal-board-queue-service');
const operations = require('../modules/research/lead-operations-state');
const board = require('../modules/research/free-public-deal-board');
const propertyCandidate = require('../modules/research/property-candidate');
const { futureSaleDate } = require('./helpers/future-sale-date');

const dallas = (raw, overrides = {}) => Object.assign({
  raw_text: raw, raw_field: 'sale_date', source_adapter_id: notice.SOURCE_ID,
  source_url: notice.SOURCE_URL, document_text: `Date of Sale: ${raw}`
}, overrides);
const resolve = (raw, overrides) => resolveSourceSaleDate(dallas(raw, overrides));

for (const [raw, expected] of [
  ['10/06/2026', '2026-10-06'], ['11/03/2026', '2026-11-03'],
  ['12/01/2026', '2026-12-01'], ['07/05/2028', '2028-07-05'],
  ['01/02/2030', '2030-01-02']
]) {
  const result = resolve(raw);
  assert.strictEqual(result.status, 'RESOLVED', raw);
  assert.strictEqual(result.resolved_iso, expected, raw);
  assert.deepStrictEqual(result.rule_ids, ['tx_prop_code_51_002_sale_day'], raw);
}
assert.strictEqual(resolve('10/07/2026').status, 'AMBIGUOUS');
assert.strictEqual(resolve('06/10/2026').reason, 'only_day_first_is_sale_day');
for (const raw of ['10/16/2026', '03/03/2026']) {
  assert.deepStrictEqual(resolve(raw).rule_ids, ['single_valid_reading']);
}
assert.strictEqual(resolve('10/06/2026', { source_adapter_id: 'unregistered' }).status, 'AMBIGUOUS');
assert.strictEqual(resolve('10/06/2026', { source_url: 'https://example.org/notice' }).status, 'AMBIGUOUS');
assert.strictEqual(resolve('10/06/2026', { document_text: 'Posted: 10/06/2026' }).status, 'AMBIGUOUS');
assert.strictEqual(resolve('10/06/2026', { raw_field: 'posted_date' }).status, 'AMBIGUOUS');
assert.strictEqual(resolve('10/06/2026', {
  source_adapter_id: 'tx_ellis_county_foreclosure_notices', source_url: 'https://co.ellis.tx.us/notice.pdf'
}).resolved_iso, '2026-10-06');
assert.strictEqual(resolve('10/06/2026', {
  source_adapter_id: 'tx_ellis_county_foreclosure_notices', source_url: 'https://www.elliscountytx.gov/notice.pdf'
}).resolved_iso, '2026-10-06', 'N1: Ellis www official host');
assert.strictEqual(resolve('10/06/2026', {
  source_adapter_id: 'tx_ellis_county_foreclosure_notices', source_url: 'https://example.org/notice.pdf'
}).status, 'AMBIGUOUS');
const matchingNamed = resolve('10/06/2026', { document_text: 'Date of Sale: 10/06/2026 | Sale Date: October 6, 2026' });
assert.deepStrictEqual(matchingNamed.rule_ids, ['same_source_named_date', 'tx_prop_code_51_002_sale_day']);
assert.strictEqual(resolve('10/06/2026', { document_text: 'Date of Sale: 10/06/2026 | Sale Date: November 3, 2026' }).reason, 'rule_conflict');
assert.strictEqual(resolve('10/06/2026', { document_text: 'Sale Date: October 6, 2026 | Sale Date: November 3, 2026' }).reason, 'conflicting_named_dates');
assert.deepStrictEqual(resolve('10/06/2026', { source_adapter_id: '', document_text: '', index_sale_date_text: 'Sale Date: October 6, 2026' }).rule_ids, ['same_source_named_date']);
assert.strictEqual(resolve('10/06/26').reason, 'two_digit_year');
assert.strictEqual(resolve('02/30/2026').status, 'INVALID');
assert.strictEqual(normalizeSourceDate('10/06/2026').reason, 'ambiguous_numeric_order');

const dateRow = (raw, overrides = {}) => Object.assign({
  sale_date_or_event_date: raw, sale_date_or_event_date_origin: 'sale_date', source_id: notice.SOURCE_ID,
  source_url: notice.SOURCE_URL, source_document_url: notice.SOURCE_URL,
  source_proof_text: `Date of Sale: ${raw}`, normalized_address: '123 Test St, Dallas, TX 75201'
}, overrides);
assert.strictEqual(queue.lifecycleStatusWithNormalizedDates(dateRow('10/06/2026'), '2026-09-30').status, 'FRESH');
assert.strictEqual(queue.lifecycleStatusWithNormalizedDates(dateRow('10/07/2026'), '2026-09-30').quarantined, true);
assert.strictEqual(queue.lifecycleStatusWithNormalizedDates(dateRow('10/06/2026', {
  source_id: 'unregistered', sale_date_iso: '2026-10-06',
  sale_date_resolution: { raw_text: '10/06/2026', resolved_iso: '2026-10-06', rule_ids: ['tx_prop_code_51_002_sale_day'] }
}), '2026-09-30').reason_code, 'date_resolution_mismatch');
assert.strictEqual(queue.lifecycleStatusWithNormalizedDates(dateRow('10/06/2026', {
  source_url: 'https://example.org/notice', source_document_url: 'https://example.org/notice',
  sale_date_iso: '2026-10-06', sale_date_resolution: { raw_text: '10/06/2026', resolved_iso: '2026-10-06' }
}), '2026-09-30').quarantined, true);
assert.strictEqual(queue.lifecycleStatusWithNormalizedDates(dateRow('10/07/2026', {
  sale_date_resolution: { raw_text: '10/06/2026', resolved_iso: '2026-10-06' }
}), '2026-09-30').reason_code, 'date_resolution_mismatch');
assert.strictEqual(queue.lifecycleStatusWithNormalizedDates({
  normalized_address: '123 Test St, Dallas, TX 75201', sale_date_iso: '2026-10-06',
  source_url: notice.SOURCE_URL
}, '2026-09-30').quarantined, true);

function rowStates(row) {
  const lifecycle_status = queue.lifecycleStatusWithNormalizedDates(row, '2026-09-30');
  const projected = Object.assign({}, row, { lifecycle_status });
  return {
    lifecycle: lifecycle_status,
    row: operations.rowStateForDeal(projected).row_state,
    contact: operations.contactStateForDeal(projected).contact_state
  };
}
const derivedScaffold = {
  normalized_address: '123 Test St, Ennis, TX 75119', source_url: 'https://www.elliscad.org/property-search',
  sale_date_iso: '2026-10-06', source_event_date: '2026-10-06',
  lifecycle_status: { status: 'FRESH', quarantined: false }
};
const derivedStates = rowStates(derivedScaffold);
assert.strictEqual(derivedStates.lifecycle.status, 'DATE_UNKNOWN_REVERIFY');
assert.strictEqual(derivedStates.lifecycle.reason_code, 'DERIVED_DATE_WITHOUT_SOURCE_TEXT');
assert.strictEqual(derivedStates.lifecycle.quarantined, true);
assert.strictEqual(derivedStates.row, 'LOCKED');
assert.strictEqual(derivedStates.contact, 'LOCKED');

const ambiguousScaffold = rowStates(Object.assign({}, derivedScaffold, {
  sale_date_or_event_date: '10/06/2026'
}));
assert.strictEqual(ambiguousScaffold.lifecycle.quarantined, true);
assert.strictEqual(ambiguousScaffold.row, 'LOCKED');
assert.strictEqual(ambiguousScaffold.contact, 'LOCKED');

const operatorConfirmed = rowStates(Object.assign({}, derivedScaffold, {
  sale_date_or_event_date: '2026-10-06',
  sale_date_or_event_date_origin: 'sale_date',
  notice_confirmations: [{ field: 'sale_date', value: '2026-10-06',
    operator_id: 'fixture-operator', confirmed_at: '2026-09-24T12:00:00Z' }]
}));
assert.strictEqual(operatorConfirmed.lifecycle.status, 'FRESH');
assert.strictEqual(operatorConfirmed.lifecycle.quarantined, false);
assert.strictEqual(operatorConfirmed.lifecycle.reason_code, 'FUTURE_SALE_DATE');

const newerRaw = queue.deriveSourceDates(Object.assign({}, derivedScaffold, {
  sale_date_or_event_date: 'October 7, 2026', sale_date_or_event_date_origin: 'sale_date'
}));
assert.strictEqual(newerRaw.sale_date_iso, '2026-10-07', 'B1: current raw beats old ISO');
assert.strictEqual(rowStates(newerRaw).lifecycle.status, 'FRESH');
assert(newerRaw.sale_date_resolution_superseded && newerRaw.sale_date_resolution_superseded.superseded_at);

const olderRaw = queue.deriveSourceDates(Object.assign({}, derivedScaffold, {
  sale_date_or_event_date: 'October 6, 2026', sale_date_or_event_date_origin: 'sale_date', source_event_date: '2026-10-07'
}));
assert.strictEqual(olderRaw.sale_date_iso, '2026-10-06', 'B1: current raw beats old source_event_date');
assert.strictEqual(rowStates(olderRaw).lifecycle.status, 'FRESH');
assert.strictEqual(olderRaw.sale_date_resolution_superseded.resolved_iso, '2026-10-07');

const staleRule = queue.deriveSourceDates(dateRow('10/06/2026', {
  sale_date_resolution: { raw_text: '10/06/2026', resolved_iso: '2026-10-06',
    rule_ids: ['single_valid_reading'] }
}));
assert.strictEqual(rowStates(staleRule).lifecycle.status, 'FRESH');
assert.deepStrictEqual(staleRule.sale_date_resolution.rule_ids, ['tx_prop_code_51_002_sale_day']);
assert(staleRule.sale_date_resolution_superseded && staleRule.sale_date_resolution_superseded.superseded_at);

const postponed = queue.deriveSourceDates(Object.assign({}, dateRow('2026-11-03'), {
  sale_date_iso: '2026-11-03', source_event_date: '2026-10-06',
  sale_date_resolution: { raw_text: '10/06/2026', resolved_iso: '2026-10-06',
    rule_ids: ['tx_prop_code_51_002_sale_day'] },
  notice_confirmations: [{ field: 'sale_date', value: '2026-11-03',
    operator_id: 'fixture-operator', confirmed_at: '2026-09-30T12:00:00Z' }]
}));
assert.strictEqual(postponed.sale_date_iso, '2026-11-03', 'B1: confirmed postponement');
assert.strictEqual(postponed.sale_date_resolution, null);
assert.strictEqual(postponed.sale_date_resolution_superseded.resolved_iso, '2026-10-06');
assert.strictEqual(rowStates(postponed).lifecycle.status, 'FRESH');

const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
function boardDateRow(record) {
  const deal = board.dealFromRecord(Object.assign({ normalized_address: '123 Test St, Dallas, TX 75201' }, record), { market });
  const row = queue.projectRowForQueue(deal, 'test|date-origin', '2026-09-30T12:00:00Z');
  return { deal, row, lifecycle: queue.lifecycleStatusWithNormalizedDates(row, '2026-09-30') };
}
for (const [field, value] of [['posted_at', '10/16/2026'], ['date', '11/16/2026']]) {
  const result = boardDateRow({ [field]: value });
  assert.strictEqual(result.deal.sale_date_or_event_date_origin, field, `B2: ${field} origin on deal`);
  assert.strictEqual(result.row.sale_date_or_event_date_origin, field, `B2: ${field} origin on queue`);
  assert.strictEqual(result.lifecycle.quarantined, true, `B2: ${field} numeric stays quarantined`);
  assert.strictEqual(queue.deriveSourceDates(result.row).sale_date_resolution, null, `B2: ${field} has no sale resolution`);
}
const registeredPosting = boardDateRow({ posted_at: '10/16/2026', source_id: notice.SOURCE_ID });
assert.strictEqual(registeredPosting.lifecycle.quarantined, true, 'B2: posting date is not sale evidence on a registered adapter');
assert.strictEqual(queue.deriveSourceDates(registeredPosting.row).sale_date_resolution, null);
const saleField = boardDateRow({ sale_date: '10/16/2026' });
assert.strictEqual(saleField.row.sale_date_or_event_date_origin, 'sale_date');
assert.deepStrictEqual(queue.deriveSourceDates(saleField.row).sale_date_resolution.rule_ids, ['single_valid_reading']);
const genericField = boardDateRow({ sale_date_or_event_date: '10/16/2026' });
assert.strictEqual(genericField.row.sale_date_or_event_date_origin, null);
assert.strictEqual(genericField.lifecycle.quarantined, true, 'B2: untagged generic numeric stays quarantined');
assert.strictEqual(queue.deriveSourceDates(genericField.row).sale_date_resolution, null);

const normalizedCandidate = propertyCandidate.normalizePropertyCandidate({
  normalized_address: '123 Test St, Dallas, TX 75201', sale_date: '10/16/2026',
  source_url: notice.SOURCE_URL, source_family: 'preforeclosure_trustee_notice'
}, market);
assert.strictEqual(normalizedCandidate.event_date_origin, 'sale_date');
const card = propertyCandidate.candidateToFindMeCard(normalizedCandidate, market);
assert.strictEqual(card.sale_date_or_event_date_origin, 'sale_date');

assert.strictEqual(saleDateStaleness('10/06/2026', '2027-01-01', dallas('10/06/2026')).stale, true);
const allPast = saleDateStaleness('01/02/2026', '2026-09-30');
assert.strictEqual(allPast.stale, true);
assert.strictEqual(allPast.stale_basis, 'all_readings_past');
assert.strictEqual(notice.isStaleSaleDate('01/02/2026', '2026-09-30'), true);
assert.strictEqual(saleDateStaleness('07/02/2026', '2026-06-17').stale, false);
assert.strictEqual(saleDateStaleness('11/12/2026', '2026-09-30').stale, false);
assert.strictEqual(saleDateStaleness('02/30/2026', '2026-09-30').invalid_sale_date, true);
assert.strictEqual(notice.parseDateValue('10/06/2026'), null);
const noticeRows = notice.extractForeclosureNoticeCandidatesFromText(
  'NOTICE OF SUBSTITUTE TRUSTEE SALE | Property Address: 123 Test St, Dallas, TX 75201 | Date of Sale: 10/06/2026 | Case: X1',
  { source_url: notice.SOURCE_URL, source_proof_url: notice.SOURCE_URL, captured_at: '2026-09-30T00:00:00Z' }
);
assert(noticeRows.some((row) => row.sale_date_resolution && row.sale_date_resolution.resolved_iso === '2026-10-06'));

const oldFetch = global.fetch;
let networkCalls = 0;
global.fetch = () => { networkCalls++; throw new Error('network_forbidden'); };
try {
  assert.strictEqual(resolve('10/06/2026').status, 'RESOLVED');
  assert.strictEqual(networkCalls, 0);
} finally {
  global.fetch = oldFetch;
}

for (let day = 0; day < 365; day++) {
  const today = new Date(Date.UTC(2026, 0, 1 + day, 12));
  const next = futureSaleDate(today);
  assert(next.getTime() >= today.getTime() + 60 * 86400000);
  assert(next.getDate() >= 13);
  const numeric = `${next.getMonth() + 1}/${next.getDate()}/${next.getFullYear()}`;
  assert.deepStrictEqual(resolveSourceSaleDate({ raw_text: numeric }).rule_ids, ['single_valid_reading']);
}

console.log('cycle 54A source-date proof fixtures passed');
