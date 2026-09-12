'use strict';

const fs = require('fs');
const path = require('path');

const distressEvidenceModel = require('../modules/research/distress-evidence-model');
const leadLifecycleStatus = require('../modules/research/lead-lifecycle-status');
const sourceEvidenceRecovery = require('../modules/research/source-evidence-recovery');

const MARKETS = Object.freeze([
  { city: 'Dallas', county: 'Dallas', state: 'TX' },
  { city: 'Detroit', county: 'Wayne', state: 'MI' },
  { city: 'San Diego', county: 'San Diego', state: 'CA' },
  { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
  { city: 'San Antonio', county: 'Bexar', state: 'TX' },
  { city: 'Houston', county: 'Harris', state: 'TX' }
]);

const LIFECYCLE_STATUSES = Object.freeze([
  'FRESH', 'AGING', 'SALE_PASSED', 'REPOSTED_OR_REPLACED',
  'SOURCE_NO_LONGER_LISTED', 'DATE_UNKNOWN_REVERIFY', 'UNVERIFIABLE'
]);

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function marketKey(market) {
  return [market.city, market.county, market.state].map((value) => cleanText(value).toLowerCase()).join('|');
}

function emptyLifecycleCounts(value) {
  return Object.fromEntries(LIFECYCLE_STATUSES.map((status) => [status, value]));
}

function emptyAmountCounts(value) {
  return Object.fromEntries(distressEvidenceModel.AMOUNT_TYPES.map((type) => [type, value]));
}

function unavailableMarket(market) {
  return {
    market,
    total_rows: null,
    lifecycle_before: emptyLifecycleCounts(null),
    lifecycle_after: emptyLifecycleCounts(null),
    left_date_unknown_reverify: null,
    recovered_date_field_counts: {},
    rows_acquiring_money_fact: null,
    recovered_amount_type_counts: emptyAmountCounts(null),
    rows_acquiring_debt_fact: null,
    rows_acquiring_bid_fact: null,
    rows_acquiring_unknown_source_amount: null,
    remaining_blocked: null,
    remaining_blocked_reason_counts: {}
  };
}

function factKey(fact) {
  return `${cleanText(fact && fact.amount_type)}|${cleanText(fact && (fact.exact_amount || fact.amount))}|${cleanText(fact && fact.evidence_text)}`;
}

function measureRows(market, rows, nowIso) {
  const result = unavailableMarket(market);
  result.total_rows = rows.length;
  result.lifecycle_before = emptyLifecycleCounts(0);
  result.lifecycle_after = emptyLifecycleCounts(0);
  result.left_date_unknown_reverify = 0;
  result.recovered_amount_type_counts = emptyAmountCounts(0);
  result.rows_acquiring_money_fact = 0;
  result.rows_acquiring_debt_fact = 0;
  result.rows_acquiring_bid_fact = 0;
  result.rows_acquiring_unknown_source_amount = 0;
  result.remaining_blocked = 0;

  for (const sourceRow of rows) {
    const before = leadLifecycleStatus.computeLifecycleStatus(sourceRow, nowIso);
    const recovery = sourceEvidenceRecovery.recoverRow(sourceRow, { now_iso: nowIso });
    const after = recovery.lifecycle_after;
    result.lifecycle_before[before.status] += 1;
    result.lifecycle_after[after.status] += 1;
    if (before.status === 'DATE_UNKNOWN_REVERIFY' && after.status !== 'DATE_UNKNOWN_REVERIFY') {
      result.left_date_unknown_reverify += 1;
      recovery.recovered_dates.forEach((item) => {
        result.recovered_date_field_counts[item.field] = (result.recovered_date_field_counts[item.field] || 0) + 1;
      });
    }

    const existingKeys = new Set(distressEvidenceModel.moneyFactsForRow(sourceRow).map(factKey));
    const acquired = recovery.recovered_money_facts.filter((fact) => !existingKeys.has(factKey(fact)));
    if (acquired.length) result.rows_acquiring_money_fact += 1;
    const semanticRoles = new Set();
    for (const fact of acquired) {
      result.recovered_amount_type_counts[fact.amount_type] += 1;
      semanticRoles.add(fact.semantic_role);
    }
    if (semanticRoles.has('debt')) result.rows_acquiring_debt_fact += 1;
    if (semanticRoles.has('bid')) result.rows_acquiring_bid_fact += 1;
    if (acquired.some((fact) => fact.amount_type === 'unknown_source_amount')) result.rows_acquiring_unknown_source_amount += 1;
    if (after.quarantined) {
      result.remaining_blocked += 1;
      result.remaining_blocked_reason_counts[after.reason_code] = (result.remaining_blocked_reason_counts[after.reason_code] || 0) + 1;
    }
  }
  return result;
}

function buildReport() {
  const snapshotPath = path.resolve(process.env.DEAL_BOARD_SNAPSHOTS_PATH || path.join('data', 'deal-board-snapshots.json'));
  const outputPath = path.resolve('exports', 'cycle-26-recovery', 'report.json');
  const generatedAt = new Date().toISOString();
  let report;
  if (!fs.existsSync(snapshotPath)) {
    report = {
      cycle: 26,
      status: 'UNREACHABLE',
      reason: `Local deal-board snapshot store does not exist at ${snapshotPath}. The production Railway volume was not contacted.`,
      production_contacted: false,
      snapshot_path: snapshotPath,
      generated_at: generatedAt,
      markets: MARKETS.map(unavailableMarket)
    };
  } else {
    const store = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    report = {
      cycle: 26,
      status: 'MEASURED_LOCAL_SNAPSHOT_READ_ONLY',
      reason: '',
      production_contacted: false,
      snapshot_path: snapshotPath,
      generated_at: generatedAt,
      markets: MARKETS.map((market) => {
        const bucket = store && store.markets && store.markets[marketKey(market)];
        return measureRows(market, bucket && Array.isArray(bucket.rows) ? bucket.rows : [], generatedAt);
      })
    };
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) process.stdout.write(`${JSON.stringify(buildReport(), null, 2)}\n`);

module.exports = { MARKETS, buildReport, measureRows };
