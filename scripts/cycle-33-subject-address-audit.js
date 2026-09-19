'use strict';

const fs = require('fs');
const path = require('path');

const propertyAddressEvidence = require('../modules/research/property-address-evidence');
const sourceEvidenceRecovery = require('../modules/research/source-evidence-recovery');

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function measureRows(rows, nowIso) {
  const result = {
    total_rows: 0,
    normalized_address_is_venue_or_non_property: 0,
    repairable_rows: 0,
    not_repairable_reason_counts: {},
    newly_complete_source_address: 0
  };
  for (const sourceRow of Array.isArray(rows) ? rows : []) {
    result.total_rows += 1;
    const row = JSON.parse(JSON.stringify(sourceRow || {}));
    const beforeComplete = propertyAddressEvidence.isSourceSupportedSubjectAddress(row);
    const recovery = sourceEvidenceRecovery.recoverSubjectAddress(row, { now_iso: nowIso });
    if (recovery.previous_value_role === 'sale_venue' || recovery.previous_value_role === 'non_property_address') {
      result.normalized_address_is_venue_or_non_property += 1;
    }
    if (recovery.recovered) {
      result.repairable_rows += 1;
      if (!beforeComplete && propertyAddressEvidence.isSourceSupportedSubjectAddress(row)) {
        result.newly_complete_source_address += 1;
      }
    } else {
      result.not_repairable_reason_counts[recovery.reason_code] =
        (result.not_repairable_reason_counts[recovery.reason_code] || 0) + 1;
    }
  }
  return result;
}

function buildAudit(store, options = {}) {
  const nowIso = cleanText(options.now_iso) || new Date().toISOString();
  const markets = Object.entries(store && store.markets || {}).map(([marketKey, bucket]) => Object.assign({
    market_key: marketKey
  }, measureRows(bucket && bucket.rows, nowIso)));
  const totals = markets.reduce((sum, market) => {
    for (const key of [
      'total_rows', 'normalized_address_is_venue_or_non_property', 'repairable_rows',
      'newly_complete_source_address'
    ]) sum[key] += market[key];
    for (const [reason, count] of Object.entries(market.not_repairable_reason_counts)) {
      sum.not_repairable_reason_counts[reason] = (sum.not_repairable_reason_counts[reason] || 0) + count;
    }
    return sum;
  }, {
    total_rows: 0,
    normalized_address_is_venue_or_non_property: 0,
    repairable_rows: 0,
    not_repairable_reason_counts: {},
    newly_complete_source_address: 0
  });
  return {
    cycle: 33,
    status: 'MEASURED_LOCAL_SNAPSHOT_READ_ONLY',
    production_contacted: false,
    generated_at: nowIso,
    totals,
    markets
  };
}

function buildUnreachable(snapshotPath, nowIso) {
  return {
    cycle: 33,
    status: 'UNREACHABLE',
    production_contacted: false,
    generated_at: nowIso,
    snapshot_path: snapshotPath,
    reason: 'No local deal-board snapshot exists; production was not contacted.',
    totals: null,
    markets: null
  };
}

function main() {
  const nowIso = new Date().toISOString();
  const snapshotPath = path.resolve(process.env.DEAL_BOARD_SNAPSHOTS_PATH || path.join('data', 'deal-board-snapshots.json'));
  const outputPath = path.resolve('exports', 'cycle-33-subject-address-audit', 'audit.json');
  const output = fs.existsSync(snapshotPath)
    ? buildAudit(JSON.parse(fs.readFileSync(snapshotPath, 'utf8')), { now_iso: nowIso })
    : buildUnreachable(snapshotPath, nowIso);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = { buildAudit, buildUnreachable, measureRows };
