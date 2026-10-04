'use strict';

const assert = require('assert');
const evidence = require('../modules/research/source-evidence-adapter');
const board = require('../modules/research/free-public-deal-board');
const queue = require('../modules/research/deal-board-queue-service');
const candidate = require('../modules/research/property-candidate');
const lifecycle = require('../modules/research/lead-lifecycle-status');
const saleDateOrigin = require('../modules/research/sale-date-origin');
const notice = require('../modules/sources/dallas-foreclosure-notice-adapter');

const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const source_url = notice.SOURCE_URL;
const normalized_address = '123 Test St, Dallas, TX 75201';
const originalFetch = global.fetch;
let fetches = 0;
global.fetch = () => { fetches++; throw new Error('network_forbidden'); };
try {
  for (const origin of ['hearing_date', 'source_details.event_date']) {
    const value = 'October 6, 2026';
    const lead = origin === 'hearing_date' ? { hearing_date: value, source_url }
      : { source_details: { event_date: value }, source_url };
    const pack = evidence.buildSourceEvidencePack({}, lead);
    assert.strictEqual(pack.event_date, value);
    assert.strictEqual(pack.event_date_origin, origin);
    const deal = board.dealFromRecord({ normalized_address, source_url,
      source_id: notice.SOURCE_ID, event_date: value, event_date_origin: origin }, { market });
    assert.strictEqual(deal.sale_date_or_event_date_origin, origin);
    assert.strictEqual(lifecycle.computeLifecycleStatus(deal, '2026-09-30').reason_code,
      'NON_SALE_DATE_ORIGIN');
    const row = queue.projectRowForQueue(deal, `b04b|${origin}`, '2026-09-30T12:00:00Z');
    assert.strictEqual(row.sale_date_or_event_date, value, 'non-sale source text remains visible');
    assert.strictEqual(row.sale_date_iso, null);
    row.sale_date_iso = '2026-10-06';
    row.source_event_date = '2026-10-06';
    queue.deriveSourceDates(row);
    assert.strictEqual(row.sale_date_iso, null, 'a stored derived date cannot rescue the wrong origin');
    const status = queue.lifecycleStatusWithNormalizedDates(row, '2026-09-30');
    assert.strictEqual(status.status, 'DATE_UNKNOWN_REVERIFY');
    assert.strictEqual(status.reason_code, 'NON_SALE_DATE_ORIGIN');
  }

  const hearingAndSale = evidence.buildSourceEvidencePack({}, {
    hearing_date: 'October 6, 2026', sale_date: 'November 3, 2026', source_url
  });
  assert.strictEqual(hearingAndSale.event_date, 'November 3, 2026');
  assert.strictEqual(hearingAndSale.event_date_origin, 'sale_date');
  assert.strictEqual(evidence.buildSourceEvidencePack({}, {
    hearing_date: 'October 6, 2026',
    source_details: { event_date: 'November 3, 2026', event_date_origin: 'sale_date' }, source_url
  }).event_date_origin, 'sale_date', 'an explicitly labeled nested sale date remains eligible');
  const hearingDeal = board.dealFromRecord({ normalized_address, source_url,
    source_id: notice.SOURCE_ID, event_date: 'October 6, 2026', event_date_origin: 'hearing_date',
    sale_date: 'November 3, 2026' }, { market });
  assert.strictEqual(hearingDeal.sale_date_or_event_date, 'November 3, 2026');
  assert.strictEqual(hearingDeal.sale_date_or_event_date_origin, 'sale_date');
  assert.strictEqual(queue.deriveSourceDates({ sale_date_or_event_date: 'October 6, 2026',
    sale_date_or_event_date_origin: 'hearing_date', sale_date: 'November 3, 2026',
    source_id: notice.SOURCE_ID }).sale_date_iso, '2026-11-03');
  const candidateWithSale = candidate.normalizePropertyCandidate({ normalized_address, source_url,
    event_date: 'October 6, 2026', event_date_origin: 'hearing_date',
    sale_date: 'November 3, 2026' }, market);
  assert.strictEqual(candidateWithSale.event_date_origin, 'sale_date');
  assert.strictEqual(candidateWithSale.event_date, 'November 3, 2026');

  for (const modulePath of [
    '../modules/research/source-evidence-adapter', '../modules/research/free-public-deal-board',
    '../modules/research/deal-board-queue-service', '../modules/research/lead-lifecycle-status',
    '../modules/research/property-candidate'
  ]) {
    const fs = require('fs');
    assert.match(fs.readFileSync(require.resolve(modulePath), 'utf8'), /require\('\.\/sale-date-origin'\)/,
      `${modulePath} must use the shared sale-origin rule`);
  }
  assert.strictEqual(saleDateOrigin.isSaleDateOrigin('hearing_date', notice.SOURCE_ID), false);
  assert.strictEqual(saleDateOrigin.isSaleDateOrigin('source_details.event_date', notice.SOURCE_ID), false);
  assert.strictEqual(saleDateOrigin.isSaleDateOrigin('sale_date'), true);
  assert.strictEqual(saleDateOrigin.isSaleDateOrigin('', notice.SOURCE_ID), true);
  assert.strictEqual(saleDateOrigin.isSaleDateOrigin('', 'unregistered_source'), false);
  const directEvent = { normalized_address, source_url, source_id: notice.SOURCE_ID,
    event_date: '2026-10-06', event_date_origin: 'hearing_date' };
  assert.strictEqual(queue.deriveSourceDates({ ...directEvent }).sale_date_iso, null);
  assert.strictEqual(lifecycle.computeLifecycleStatus(directEvent, '2026-09-30').reason_code,
    'NON_SALE_DATE_ORIGIN');

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
