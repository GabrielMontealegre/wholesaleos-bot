'use strict';

const assert = require('assert');
const evidence = require('../modules/research/source-evidence-adapter');
const board = require('../modules/research/free-public-deal-board');
const queue = require('../modules/research/deal-board-queue-service');
const candidate = require('../modules/research/property-candidate');
const lifecycle = require('../modules/research/lead-lifecycle-status');
const notice = require('../modules/sources/dallas-foreclosure-notice-adapter');

const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const source_url = notice.SOURCE_URL;
const normalized_address = '123 Test St, Dallas, TX 75201';
const originalFetch = global.fetch;
let fetches = 0;
global.fetch = () => { fetches++; throw new Error('network_forbidden'); };
try {
  for (const origin of ['filed_date', 'created_at']) {
    const value = 'October 6, 2026';
    const pack = evidence.buildSourceEvidencePack({}, { [origin]: value, source_url });
    assert.strictEqual(pack.event_date, value);
    assert.strictEqual(pack.event_date_origin, origin);

    const deal = board.dealFromRecord({
      normalized_address, source_url, source_id: notice.SOURCE_ID,
      event_date: value, event_date_origin: pack.event_date_origin
    }, { market });
    assert.strictEqual(deal.sale_date_or_event_date_origin, origin);
    const row = queue.projectRowForQueue(deal, `b04b|${origin}`, '2026-09-30T12:00:00Z');
    assert.strictEqual(row.sale_date_or_event_date_origin, origin);
    assert.strictEqual(row.sale_date_or_event_date, value, 'raw text is retained');
    assert.strictEqual(row.sale_date_iso, null, 'initial queue projection cannot show a filing date as a sale');
    assert.strictEqual(lifecycle.computeLifecycleStatus(deal, '2026-09-30').reason_code,
      'NON_SALE_DATE_ORIGIN', 'board lifecycle is locked before snapshot repair');
    assert.strictEqual(queue.deriveSourceDates(row).sale_date_iso, null);
    const status = queue.lifecycleStatusWithNormalizedDates(row, '2026-09-30');
    assert.strictEqual(status.status, 'DATE_UNKNOWN_REVERIFY');
    assert.strictEqual(status.reason_code, 'NON_SALE_DATE_ORIGIN');
    assert.strictEqual(status.quarantined, true);

    const numeric = queue.deriveSourceDates({ ...row,
      sale_date_or_event_date: '10/06/2026', sale_date_iso: '2026-10-06',
      source_event_date: '2026-10-06', source_proof_text: 'Date of Sale: 10/06/2026'
    });
    assert.strictEqual(numeric.sale_date_iso, null, 'registered adapters cannot turn a filing date into a sale');
    assert.strictEqual(numeric.sale_date_resolution_issue, 'NON_SALE_DATE_ORIGIN');
    assert.strictEqual(queue.lifecycleStatusWithNormalizedDates(numeric, '2026-09-30').quarantined, true);
  }

  for (const origin of ['posted_at', 'date']) {
    const row = { normalized_address, source_url, source_id: notice.SOURCE_ID,
      sale_date_or_event_date: '2026-10-06', sale_date_or_event_date_origin: origin };
    assert.strictEqual(queue.deriveSourceDates(row).sale_date_iso, null,
      `${origin} cannot supply an ISO sale date either`);
    assert.strictEqual(queue.lifecycleStatusWithNormalizedDates(row, '2026-09-30').reason_code,
      'NON_SALE_DATE_ORIGIN');
  }

  const realSale = evidence.buildSourceEvidencePack({}, {
    sale_date: 'November 3, 2026', filed_date: 'October 6, 2026', source_url
  });
  assert.strictEqual(realSale.event_date, 'November 3, 2026');
  assert.strictEqual(realSale.event_date_origin, 'sale_date');
  const saleDeal = board.dealFromRecord({
    normalized_address, source_url, event_date: 'October 6, 2026',
    event_date_origin: 'filed_date', sale_date: 'November 3, 2026'
  }, { market });
  assert.strictEqual(saleDeal.sale_date_or_event_date, 'November 3, 2026');
  assert.strictEqual(saleDeal.sale_date_or_event_date_origin, 'sale_date');
  const saleRow = {
    normalized_address, source_url, source_id: notice.SOURCE_ID,
    sale_date_or_event_date: 'October 6, 2026', sale_date_or_event_date_origin: 'filed_date',
    sale_date: 'November 3, 2026'
  };
  assert.strictEqual(queue.deriveSourceDates(saleRow).sale_date_iso, '2026-11-03',
    'a separate source sale date remains valid');
  assert.strictEqual(queue.lifecycleStatusWithNormalizedDates(saleRow, '2026-09-30').status, 'FRESH');

  const normalized = candidate.normalizePropertyCandidate({
    normalized_address, event_date: 'October 6, 2026', event_date_origin: 'filed_date',
    source_url, source_family: 'preforeclosure_trustee_notice'
  }, market);
  assert.strictEqual(normalized.event_date_origin, 'filed_date');
  assert.strictEqual(candidate.candidateToFindMeCard(normalized, market).sale_date_or_event_date_origin,
    'filed_date');
  assert.strictEqual(fetches, 0);
} finally {
  global.fetch = originalFetch;
}

console.log('B-04b event-date origin tests passed');
