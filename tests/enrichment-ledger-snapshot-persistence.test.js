'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-enrichment-ledger-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'deal-board-snapshots.json');
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));

const queue = require('../modules/research/deal-board-queue-service');

function deal(overrides) {
  return Object.assign({
    headline: '15603 Garam Trl, Von Ormy, TX 78073',
    normalized_address: '15603 Garam Trl, Von Ormy, TX 78073',
    city: 'Von Ormy',
    county: 'Bexar',
    state: 'TX',
    quality_bucket: 'INSPECT_NOW',
    source_family: 'preforeclosure_trustee_notice',
    source_url: 'https://www.bexar.org/doc.pdf',
    source_document_url: 'https://www.bexar.org/doc.pdf',
    source_row_reference: '20260900015',
    free_contact_status: 'CONTACT_SEARCH_EXHAUSTED_FREE',
    free_contact_routes: [],
    free_searches_run: [{ source: 'public_search', target: '15603 Garam Trl owner phone' }],
    why_call_ready_or_blocked: 'No visible public contact route found.',
    enrichment_ledger: {
      attempts: [{
        lane: 'public_search',
        attempted_at: '2026-08-11T00:00:00Z',
        outcome: 'NOT_FOUND',
        reason_code: 'NO_VISIBLE_FREE_CONTACT_ROUTE',
        reason_text: 'No visible public contact route found.',
        source_url: 'https://www.bexar.org/doc.pdf',
        cost_usd: 0,
        next_eligible_at: '2026-08-13T00:00:00Z'
      }],
      dropped_count: 0
    },
    call_prep: { ARV_lock_state: 'ARV_LOCKED_NO_VERIFIED_COMPS', MAO_lock_state: 'MAO_LOCKED_NO_ARV', seller_questions: [] },
    ARV_lock_state: 'ARV_LOCKED_NO_VERIFIED_COMPS',
    MAO_lock_state: 'MAO_LOCKED_NO_ARV',
    call_readiness: 'NEEDS_CONTACT_ROUTE',
    next_best_action: 'FIND_CONTACT_ROUTE',
    missing_fields: ['visible public contact route']
  }, overrides || {});
}

(async () => {
  await queue.runDealBoardBatch({ market: { city: 'San Antonio', county: 'Bexar', state: 'TX' } }, {
    preview_impl: async () => ({ free_public_deals: [deal()], rejected_generic_count: 0, diagnostics: { source_adapter: { source_adapter_results: [] } } })
  });
  const weak = await queue.runDealBoardBatch({ market: { city: 'San Antonio', county: 'Bexar', state: 'TX' } }, {
    preview_impl: async () => ({ free_public_deals: [deal({ free_searches_run: [], why_call_ready_or_blocked: '', enrichment_ledger: { attempts: [], dropped_count: 0 } })], rejected_generic_count: 0, diagnostics: { source_adapter: { source_adapter_results: [] } } })
  });
  const row = weak.rows.find((item) => item.normalized_address === '15603 Garam Trl, Von Ormy, TX 78073');
  assert.ok(row);
  assert.strictEqual(row.free_searches_run.length, 1);
  assert.strictEqual(row.why_call_ready_or_blocked, 'No visible public contact route found.');
  assert.strictEqual(row.enrichment_ledger.attempts.length, 1);
  const before = fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8');
  const latest = queue.latestDealBoardSnapshot({ market: { city: 'San Antonio', county: 'Bexar', state: 'TX' } });
  assert.strictEqual(latest.rows[0].enrichment_ledger.attempts.length, 1);
  const after = fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8');
  assert.strictEqual(after, before, 'read path must not write the snapshot file');
  console.log('enrichment ledger snapshot persistence tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
