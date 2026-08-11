'use strict';

const assert = require('assert');
const scheduler = require('../modules/research/enrichment-scheduler');
const ledger = require('../modules/research/enrichment-ledger');

(() => {
  const rows = Array.from({ length: 61 }, (_, index) => ({
    queue_key: `row-${String(index).padStart(2, '0')}`,
    normalized_address: `${1000 + index} Test St, San Antonio, TX 78201`,
    source_document_url: 'https://bexar.org/doc.pdf',
    first_seen_at: `2026-08-${String(1 + (index % 9)).padStart(2, '0')}T00:00:00Z`,
    last_seen_at: '2026-08-10T00:00:00Z'
  }));
  const touched = new Set();
  for (let batch = 0; batch < 24; batch += 1) {
    const out = scheduler.selectRowsForEnrichment(rows, {
      lane: 'public_search',
      limit: 6,
      now_iso: '2026-08-11T00:00:00Z',
      market_policy: {}
    });
    assert.ok(out.skipped.every((skip) => skip.skip_reason));
    for (const row of out.selected) {
      assert.ok(!touched.has(row.queue_key), 'no row should be re-hunted before cooldown while untouched rows exist');
      touched.add(row.queue_key);
      ledger.appendAttempt(row, {
        lane: 'public_search',
        attempted_at: '2026-08-11T00:00:00Z',
        outcome: 'NOT_FOUND',
        reason_code: 'NO_VISIBLE_ROUTE',
        reason_text: 'No visible route.',
        source_url: row.source_document_url,
        cost_usd: 0,
        next_eligible_at: ''
      });
    }
  }
  assert.ok(touched.size >= 55, `expected >=55 distinct rows, got ${touched.size}`);
  assert.strictEqual(touched.size, 61);
  console.log('enrichment scheduler tests passed');
})();
