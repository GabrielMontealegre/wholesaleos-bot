'use strict';

const assert = require('assert');
const notice = require('../modules/sources/dallas-foreclosure-notice-adapter');
const queue = require('../modules/research/deal-board-queue-service');

function sourceRow(overrides = {}) {
  return {
    sale_date_or_event_date: '10/06/2026',
    source_id: notice.SOURCE_ID,
    source_url: notice.SOURCE_URL,
    source_document_url: notice.SOURCE_URL,
    source_proof_text: 'Date of Sale: 10/06/2026',
    ...overrides
  };
}

const matchingResolution = {
  raw_text: '10/06/2026',
  resolved_iso: '2026-10-06',
  rule_ids: ['tx_prop_code_51_002_sale_day']
};

const onlyIsoStale = queue.deriveSourceDates(sourceRow({
  sale_date_iso: '2026-10-13',
  source_event_date: '2026-10-06',
  sale_date_resolution: { ...matchingResolution }
}));
assert.strictEqual(onlyIsoStale.sale_date_iso, '2026-10-06');
assert.deepStrictEqual(onlyIsoStale.sale_date_resolution_superseded.old_values, [
  { field: 'sale_date_iso', old_value: '2026-10-13' }
], 'matching source_event_date and resolution are not superseded');

const multipleStale = queue.deriveSourceDates(sourceRow({
  sale_date_iso: '2026-10-06',
  source_event_date: '2026-10-14',
  sale_date_resolution: {
    raw_text: '10/13/2026',
    resolved_iso: '2026-10-13',
    rule_ids: ['single_valid_reading']
  }
}));
assert.deepStrictEqual(multipleStale.sale_date_resolution_superseded.old_values, [
  { field: 'source_event_date', old_value: '2026-10-14' },
  { field: 'sale_date_resolution.raw_text', old_value: '10/13/2026' },
  { field: 'sale_date_resolution.resolved_iso', old_value: '2026-10-13' },
  { field: 'sale_date_resolution.rule_ids', old_value: ['single_valid_reading'] }
]);
assert.strictEqual(multipleStale.sale_date_iso, '2026-10-06', 'current raw source still wins');

const allEqual = queue.deriveSourceDates(sourceRow({
  sale_date_iso: '2026-10-06',
  source_event_date: 'October 6, 2026',
  sale_date_resolution: { ...matchingResolution }
}));
assert.strictEqual(allEqual.sale_date_resolution_superseded, undefined,
  'equivalent stored values must not produce a false supersession audit');

const noSource = queue.deriveSourceDates({ sale_date_iso: '2026-10-06', source_event_date: '2026-10-06' });
assert.strictEqual(noSource.sale_date_iso, null, 'derived dates do not create source evidence');
assert.strictEqual(noSource.sale_date_resolution_superseded, undefined,
  'no raw source must not create a supersession audit');

console.log('B-04a date supersession audit tests passed');
