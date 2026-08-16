'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-contact-workflow-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'deal-board-snapshots.json');
process.env.DEAL_BOARD_JOBS_PATH = path.join(tmpDir, 'deal-board-jobs.json');
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));

const queueService = require('../modules/research/deal-board-queue-service');

const MARKET = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const CONTACTED_AT = '2026-08-15T18:30:00.000Z';
const CONTACT_LANES = ['row_source_document', 'county_appraisal', 'public_search', 'official_browser_lookup'];

function phoneRoute(number) {
  return {
    route_kind: 'phone',
    route_type: 'official_public_contact',
    value: number,
    source_kind: 'official_public_record',
    source_url: 'https://county.example.gov/property/1',
    evidence_text: `Phone ${number} is visible on the official public record.`
  };
}

function exhaustedLedger() {
  return {
    attempts: CONTACT_LANES.map((lane) => ({
      lane,
      outcome: 'NOT_FOUND',
      attempted_at: '2026-08-15T12:00:00.000Z',
      reason_code: 'test_exhausted',
      reason_text: 'Test contact lane exhausted.'
    })),
    dropped_count: 0
  };
}

function stableNumber(slug, verifiedCompCount) {
  const seed = slug.split('').reduce((sum, char) => sum + char.charCodeAt(0), verifiedCompCount * 100);
  return `(214) 555-${String(seed % 10000).padStart(4, '0')}`;
}

function deal(slug, verifiedCompCount, overrides) {
  const streetNumber = 100 + slug.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 800;
  return Object.assign({
    headline: `${streetNumber} ${slug} St, Dallas, TX 75201`,
    normalized_address: `${streetNumber} ${slug} St, Dallas, TX 75201`,
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX',
    quality_bucket: 'INSPECT_NOW',
    source_family: 'test_official_notice',
    source_url: `https://county.example.gov/property/${slug}`,
    source_document_url: `https://county.example.gov/notices/${slug}.pdf`,
    free_contact_status: 'CALL_READY',
    free_contact_routes: [phoneRoute(stableNumber(slug, verifiedCompCount))],
    owner_record: {
      owner_name: 'JANE DOE',
      owner_role: 'owner_of_record',
      source_kind: 'official_public_record',
      source_url: `https://county.example.gov/property/${slug}`,
      evidence_text: 'Owner JANE DOE is visible on the official public record.'
    },
    verified_sold_comp_count: verifiedCompCount || 0,
    call_prep: {
      ARV_lock_state: verifiedCompCount >= 3 ? 'ARV_UNLOCKED_VERIFIED_COMPS' : 'ARV_LOCKED_NO_VERIFIED_COMPS',
      MAO_lock_state: 'MAO_LOCKED_OPERATOR_REVIEW'
    },
    preview_only: true,
    should_ingest: false,
    not_a_saved_lead: true
  }, overrides || {});
}

function previewFor(deals) {
  return async () => ({
    free_public_deals: deals,
    rejected_generic_count: 0,
    source_coverage: []
  });
}

function rowsByAddress(rows) {
  return new Map(rows.map((row) => [row.normalized_address, row]));
}

function record(row, outcome, offsetMinutes) {
  const stamp = new Date(Date.parse(CONTACTED_AT) + (offsetMinutes || 0) * 60000).toISOString();
  return queueService.recordContactWorkflow({
    market: MARKET,
    queue_key: row.queue_key,
    outcome
  }, { now_impl: () => stamp, operator_id: 'admin' });
}

(async () => {
  const outcomes = ['reached', 'left_message', 'follow_up', 'wrong_number', 'not_interested'];
  const deals = [];
  for (const outcome of outcomes) {
    deals.push(deal(`${outcome}-zero`, 0));
    deals.push(deal(`${outcome}-three`, 3));
  }
  deals.push(deal('wrong-exhausted', 0, { enrichment_ledger: exhaustedLedger() }));
  deals.push(deal('untouched', 0));

  const initial = await queueService.runDealBoardBatch(
    { market: MARKET, limit: 25 },
    { preview_impl: previewFor(deals) }
  );
  assert.strictEqual(initial.lead_operations_queue.counts.CALL_READY, deals.length);
  assert.ok(initial.rows.every((row) => row.contact_workflow_complete === false), 'nothing may mark contact automatically');
  assert.ok(initial.rows.every((row) => !row.contact_workflow_attempts.length), 'nothing may append contact attempts automatically');

  const initialRows = rowsByAddress(initial.rows);
  let latest = initial;
  let offset = 0;
  for (const sourceDeal of deals.filter((item) => !/untouched/.test(item.normalized_address))) {
    const row = initialRows.get(sourceDeal.normalized_address);
    const outcome = outcomes.find((item) => sourceDeal.normalized_address.includes(item)) || 'wrong_number';
    latest = record(row, outcome, offset += 1);
  }
  const finalRows = rowsByAddress(latest.rows);

  const expectedStates = {
    reached: { zero: 'NEEDS_COMPS', three: 'TITLE_NEEDED', complete: true },
    left_message: { zero: 'CALL_READY', three: 'CALL_READY', complete: false },
    follow_up: { zero: 'CALL_READY', three: 'CALL_READY', complete: false },
    wrong_number: { zero: 'NEEDS_CONTACT_SEARCH', three: 'NEEDS_CONTACT_SEARCH', complete: false },
    not_interested: { zero: 'CLOSED_NOT_INTERESTED', three: 'CLOSED_NOT_INTERESTED', complete: false }
  };

  const stateTable = {};
  for (const outcome of outcomes) {
    for (const compCase of ['zero', 'three']) {
      const row = Array.from(finalRows.values()).find((item) => item.normalized_address.includes(`${outcome}-${compCase}`));
      stateTable[`${outcome}_${compCase}`] = row.row_state;
      assert.strictEqual(row.row_state, expectedStates[outcome][compCase], `${outcome} at ${compCase} comps state`);
      assert.strictEqual(row.contact_workflow_complete, expectedStates[outcome].complete, `${outcome} completion flag`);
      assert.strictEqual(row.contact_workflow_outcome, outcome);
      assert.strictEqual(row.contact_workflow_source, 'operator_input');
      assert.strictEqual(row.contact_workflow_recorded_by, 'admin');
      assert.strictEqual(row.contact_workflow_attempts.length, 1, `${outcome} attempt history append`);
      if (outcome === 'not_interested') {
        assert.notStrictEqual(row.row_state, 'NEEDS_COMPS');
        assert.notStrictEqual(row.row_state, 'TITLE_NEEDED');
        assert.notStrictEqual(row.row_state, 'BLOCKED');
      }
      if (outcome === 'follow_up') {
        assert.strictEqual(row.contact_follow_up_requested, true);
        assert.ok(row.contact_follow_up_at);
      }
      if (outcome === 'wrong_number') {
        assert.ok(!row.best_contact, 'wrong number must not stay displayed as the valid best contact');
        assert.strictEqual(row.free_contact_routes[0].operator_disproved, true);
        assert.ok(row.free_contact_routes[0].risk_flags.includes('OPERATOR_WRONG_NUMBER_REPORTED'));
        assert.strictEqual(row.contact_workflow_invalidated_routes.length, 1);
      }
    }
  }

  const wrongExhausted = Array.from(finalRows.values()).find((row) => row.normalized_address.includes('wrong-exhausted'));
  assert.strictEqual(wrongExhausted.row_state, 'NEEDS_SKIP_TRACE', 'wrong number with exhausted free lanes must move to skip trace');

  const untouched = Array.from(finalRows.values()).find((row) => row.normalized_address.includes('untouched'));
  assert.strictEqual(untouched.contact_workflow_complete, false);
  assert.strictEqual(untouched.contact_workflow_outcome, '');
  assert.strictEqual(untouched.row_state, 'CALL_READY');

  const callReadyKeys = latest.lead_operations_queue.segments.find((segment) => segment.key === 'CALL_READY').row_keys;
  assert.ok(callReadyKeys.slice(0, 2).every((key) => key.includes('follow_up')), 'follow-up rows must sort to the top of their callable segment');

  const refreshed = await queueService.runDealBoardBatch(
    { market: MARKET, limit: 25 },
    { preview_impl: previewFor(deals), census_zip_resolver_impl: async () => ({ resolved: false }) }
  );
  const refreshedRows = rowsByAddress(refreshed.rows);
  for (const sourceDeal of deals.filter((item) => !/untouched/.test(item.normalized_address))) {
    const row = refreshedRows.get(sourceDeal.normalized_address);
    const outcome = outcomes.find((item) => sourceDeal.normalized_address.includes(item)) || 'wrong_number';
    if (sourceDeal.normalized_address.includes('wrong-exhausted')) {
      assert.strictEqual(row.row_state, 'NEEDS_SKIP_TRACE');
    } else {
      const compCase = sourceDeal.verified_sold_comp_count >= 3 ? 'three' : 'zero';
      assert.strictEqual(row.row_state, expectedStates[outcome][compCase], `${outcome} refresh state survives`);
    }
    assert.strictEqual(row.contact_workflow_outcome, outcome);
    assert.strictEqual(row.contact_workflow_attempts.length, 1);
    if (outcome === 'wrong_number') assert.strictEqual(row.free_contact_routes[0].operator_disproved, true);
  }

  const repeatedTarget = refreshedRows.get(deals.find((item) => item.normalized_address.includes('left_message-zero')).normalized_address);
  const afterRepeat = record(repeatedTarget, 'follow up', 30);
  const repeated = afterRepeat.rows.find((row) => row.queue_key === repeatedTarget.queue_key);
  assert.strictEqual(repeated.contact_workflow_attempts.length, 2, 'repeated operator attempts must append rather than overwrite');
  assert.deepStrictEqual(repeated.contact_workflow_attempts.map((attempt) => attempt.outcome), ['left_message', 'follow_up']);
  assert.strictEqual(repeated.row_state, 'CALL_READY');

  const persisted = JSON.parse(fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8'));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads, [], 'operator contact input must not create a saved lead');
  assert.ok(persisted.markets['dallas|dallas|tx'].rows.some((row) => row.contact_workflow_attempts.length >= 1));

  assert.throws(
    () => queueService.recordContactWorkflow({ market: MARKET, queue_key: untouched.queue_key, outcome: 'guessed_reached' }),
    (error) => error.code === 'contact_workflow_outcome_invalid' && error.status_code === 400
  );
  assert.throws(
    () => queueService.recordContactWorkflow({ market: MARKET, queue_key: 'missing-row', outcome: 'reached' }),
    (error) => error.code === 'contact_workflow_row_not_found' && error.status_code === 404
  );

  console.log(JSON.stringify({
    outcome_state_table: stateTable,
    wrong_number_exhausted: wrongExhausted.row_state,
    repeated_attempts: repeated.contact_workflow_attempts.length,
    final_counts: afterRepeat.lead_operations_queue.counts
  }));
  console.log('contact workflow control tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
