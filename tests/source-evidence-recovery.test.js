'use strict';

const assert = require('assert');

const recovery = require('../modules/research/source-evidence-recovery');
const report = require('../scripts/cycle-26-recovery-report');

const NOW = '2026-09-10T12:00:00.000Z';
const SOURCE_URL = 'https://county.example.gov/notices/current.pdf';

function row(overrides) {
  return Object.assign({
    queue_key: 'cycle-26-fixture',
    normalized_address: '100 Evidence St, Dallas, TX 75201',
    source_document_url: SOURCE_URL,
    verified_sold_comp_count: 0,
    ARV_lock_state: 'ARV_LOCKED_NO_VERIFIED_COMPS',
    preview_only: true,
    not_a_saved_lead: true
  }, overrides || {});
}

(() => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('network_forbidden_in_source_evidence_recovery');
  };
  try {
    const openingBid = recovery.recoverRow(row({ source_proof_text: 'Opening bid $45,000.' }), { now_iso: NOW });
    assert.deepStrictEqual(openingBid.recovered_money_facts.map((fact) => fact.amount_type), ['opening_bid']);
    assert.strictEqual(openingBid.row.opening_bid, '$45,000');
    assert.strictEqual(openingBid.recovered_money_facts[0].semantic_role, 'bid');

    const existingBid = recovery.recoverRow(row({
      minimum_bid: '$152,743',
      minimum_bid_evidence_text: 'Minimum bid $152,743.',
      source_proof_text: '157 2317-018-044 $152,743 539'
    }), { now_iso: NOW });
    assert.deepStrictEqual(existingBid.recovered_money_facts, [], 'an already typed bid must not be duplicated as an unknown amount');
    assert.deepStrictEqual(existingBid.row.distress_evidence.money_facts.map((fact) => fact.amount_type), ['minimum_bid']);

    const judgment = recovery.recoverRow(row({ source_proof_text: 'The court entered judgment in the amount of $120,000.' }), { now_iso: NOW });
    assert.deepStrictEqual(judgment.recovered_money_facts.map((fact) => fact.amount_type), ['judgment_amount']);
    assert.strictEqual(judgment.recovered_money_facts[0].semantic_role, 'debt');

    const unlabeled = recovery.recoverRow(row({ source_proof_text: 'Official notice reference 22-100 lists $88,000.' }), { now_iso: NOW });
    assert.deepStrictEqual(unlabeled.recovered_money_facts.map((fact) => fact.amount_type), ['unknown_source_amount']);
    assert.strictEqual(unlabeled.recovered_money_facts[0].semantic_role, 'unknown');

    const adjacentColumn = recovery.recoverRow(row({ source_proof_text: 'Amount | due | $91,000' }), { now_iso: NOW });
    assert.deepStrictEqual(adjacentColumn.recovered_money_facts.map((fact) => fact.amount_type), ['unknown_source_amount']);
    assert.ok(!adjacentColumn.recovered_money_facts.some((fact) => fact.semantic_role === 'debt'));

    const dated = recovery.recoverRow(row({
      status_evidence_text: 'Sale date: September 20, 2026.',
      source_proof_text: 'Opening bid $45,000.'
    }), { now_iso: NOW });
    assert.strictEqual(dated.lifecycle_before.status, 'DATE_UNKNOWN_REVERIFY');
    assert.strictEqual(dated.row.sale_date_or_event_date, '2026-09-20');
    assert.strictEqual(dated.lifecycle_after.status, 'FRESH');
    assert.strictEqual(dated.lifecycle_after.quarantined, false);
    assert.deepStrictEqual(dated.recovered_dates.map((item) => item.field), ['sale_date_or_event_date']);

    const passed = recovery.recoverRow(row({
      sale_date_iso: '2026-09-01',
      status_evidence_text: 'Notice date: September 9, 2026.'
    }), { now_iso: NOW });
    assert.strictEqual(passed.lifecycle_before.status, 'SALE_PASSED');
    assert.strictEqual(passed.lifecycle_after.status, 'SALE_PASSED');
    assert.strictEqual(passed.lifecycle_after.quarantined, true);

    const noEvidence = recovery.recoverRow(row({ source_proof_text: 'Official notice without a published date or amount.' }), { now_iso: NOW });
    assert.strictEqual(noEvidence.lifecycle_after.status, 'DATE_UNKNOWN_REVERIFY');
    assert.strictEqual(noEvidence.lifecycle_after.quarantined, true);
    assert.deepStrictEqual(noEvidence.recovered_dates, []);
    assert.deepStrictEqual(noEvidence.recovered_money_facts, []);

    assert.strictEqual(dated.row.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
    assert.strictEqual(dated.row.verified_sold_comp_count, 0);
    assert.strictEqual(fetchCalls, 0, 'offline recovery must never call fetch');

    const fixtureReport = report.measureRows({ city: 'Dallas', county: 'Dallas', state: 'TX' }, [
      row({ queue_key: 'dated', status_evidence_text: 'Sale date: September 20, 2026.', source_proof_text: 'Opening bid $45,000.' }),
      row({ queue_key: 'judgment', source_proof_text: 'Judgment in the amount of $120,000.' }),
      row({ queue_key: 'unknown', source_proof_text: 'Published amount $88,000.' }),
      row({ queue_key: 'none', source_proof_text: 'No date or amount is published.' })
    ], NOW);
    assert.strictEqual(fixtureReport.total_rows, 4);
    assert.strictEqual(fixtureReport.left_date_unknown_reverify, 1);
    assert.strictEqual(fixtureReport.lifecycle_after.DATE_UNKNOWN_REVERIFY, 3);
    assert.strictEqual(fixtureReport.rows_acquiring_money_fact, 3);
    assert.strictEqual(fixtureReport.recovered_amount_type_counts.opening_bid, 1);
    assert.strictEqual(fixtureReport.recovered_amount_type_counts.judgment_amount, 1);
    assert.strictEqual(fixtureReport.recovered_amount_type_counts.unknown_source_amount, 1);
    assert.strictEqual(fixtureReport.rows_acquiring_debt_fact, 1);
    assert.strictEqual(fixtureReport.rows_acquiring_bid_fact, 1);
    assert.strictEqual(fixtureReport.rows_acquiring_unknown_source_amount, 1);
  } finally {
    global.fetch = originalFetch;
  }

  console.log('source evidence recovery tests passed');
})();
