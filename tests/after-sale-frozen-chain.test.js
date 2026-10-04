'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-after-sale-proof-'));
const oldDbPath = process.env.DB_PATH;
const oldSnapshotPath = process.env.DEAL_BOARD_SNAPSHOTS_PATH;
process.env.DB_PATH = path.join(tmp, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmp, 'snapshots.json');
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [], users: [] }));

const orchestrator = require('../modules/research/source-acquisition-orchestrator');
const { runFreePublicDealBoardPreview } = require('../modules/research/free-public-deal-board');
const queue = require('../modules/research/deal-board-queue-service');
const corpus = require('./fixtures/cycle-18-notices.json');
const sourceId = 'tx_dallas_county_clerk_foreclosure_notices';
const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const original = { fetch: global.fetch, httpGet: http.get, httpRequest: http.request,
  httpsGet: https.get, httpsRequest: https.request };
let requests = 0;
const rejectNetwork = () => { requests++; throw new Error('network forbidden'); };
global.fetch = http.get = http.request = https.get = https.request = rejectNetwork;

(async () => {
  try {
    const adapterResults = [];
    const counts = { extracted: 0, active: 0, needs_data: 0, post_sale_proposed: 0, rejected: {} };
    for (const [index, document] of corpus.documents.entries()) {
      const result = await orchestrator.runAcquisitionCore({ ...market, source_ids: [sourceId] }, {
        source_text: document.text,
        source_document_url: `https://www.dallascounty.org/notices/frozen-${index + 1}.pdf`,
        captured_at: '2026-10-02T12:00:00.000Z',
        enable_provider_search: false
      });
      const adapter = result.adapter_results.find((item) => item.source_id === sourceId);
      assert(adapter);
      adapterResults.push({ ...adapter, candidates: result.candidates, cards: result.cards });
      counts.extracted += adapter.candidate_count + adapter.post_sale_candidates.length;
      counts.post_sale_proposed += adapter.post_sale_candidates.length;
      for (const candidate of result.candidates) {
        if (candidate.sale_date) counts.active++;
        else counts.needs_data++;
      }
      for (const item of adapter.rejected_candidates || []) {
        counts.rejected[item.reason] = (counts.rejected[item.reason] || 0) + 1;
      }
    }
    const proofUrl = 'https://www.dallascounty.org/notices/synthetic-proof.pdf';
    const proofHead = 'NOTICE OF SUBSTITUTE TRUSTEE SALE\nProperty Address: 101 N Main St, Dallas, TX 75201\nDeed of Trust dated 02/09/2022\n';
    const prove = async (text) => orchestrator.runAcquisitionCore({ ...market, source_ids: [sourceId] }, {
      source_text: text, source_document_url: proofUrl, enable_provider_search: false
    });
    const unlabeled = await prove(proofHead);
    assert.strictEqual(unlabeled.adapter_results[0].post_sale_candidates.length, 0);
    assert(unlabeled.candidates.every((item) => !item.sale_date));
    const labeledPast = await prove(`${proofHead}Date of Sale: 05/05/2026`);
    assert.strictEqual(labeledPast.adapter_results[0].post_sale_candidates.length, 1);
    assert.strictEqual(labeledPast.adapter_results[0].post_sale_candidates[0].sale_date, '05/05/2026');
    assert.strictEqual(labeledPast.adapter_results[0].post_sale_candidates[0].sale_date_origin, 'labeled_sale_date');
    const labeledFuture = await prove(`${proofHead}Date, Time, and Place of Sale. Date: 11/03/2026`);
    assert(labeledFuture.candidates.some((item) => item.sale_date === '11/03/2026'));
    assert.strictEqual(labeledFuture.adapter_results[0].post_sale_candidates.length, 0);
    const preview = await runFreePublicDealBoardPreview({ market,
      mock_source_adapter_results: adapterResults, enable_provider_search: false });
    const batch = await queue.runDealBoardBatch({ market, enable_document_reextraction: false }, {
      preview_impl: async () => preview, enable_document_reextraction: false
    });
    const stored = JSON.parse(fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8'));
    const bucket = stored.markets['dallas|dallas|tx'];
    assert(bucket);
    const forbiddenDates = new Set(['02/09/2022', '07/28/2026', '1/31/2002', '7/29/2025']);
    for (const item of bucket.post_sale_candidates) {
      assert(!forbiddenDates.has(item.sale_date), 'loan, order, and filing dates never enter after-sale storage');
      assert(!/3900 Capital City|2507 Lee/i.test(item.property_address), 'office and courthouse are not properties');
      assert(item.sale_date_origin && item.property_address_origin);
    }
    assert.strictEqual(batch.post_sale_candidate_total,
      bucket.post_sale_candidates.filter((item) => item.lane_status !== 'superseded_invalid').length);
    for (const row of bucket.rows) {
      assert(!forbiddenDates.has(row.sale_date_or_event_date), 'loan and filing dates are not sale dates on the queue');
      assert(!/3900 Capital City|2507 Lee/i.test(row.normalized_address), 'office and courthouse are not subject properties');
    }
    assert.strictEqual(requests, 0);
    console.log(`after-sale frozen chain passed: ${JSON.stringify({ ...counts,
      accepted: batch.post_sale_candidate_total, invalidated: batch.post_sale_invalidated })}`);
  } finally {
    global.fetch = original.fetch;
    http.get = original.httpGet;
    http.request = original.httpRequest;
    https.get = original.httpsGet;
    https.request = original.httpsRequest;
    if (oldDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = oldDbPath;
    if (oldSnapshotPath === undefined) delete process.env.DEAL_BOARD_SNAPSHOTS_PATH;
    else process.env.DEAL_BOARD_SNAPSHOTS_PATH = oldSnapshotPath;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
