'use strict';

const fs = require('fs');
const path = require('path');

const propertyIdentity = require('../modules/research/property-identity');
const propertyAddressEvidence = require('../modules/research/property-address-evidence');

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function sourceTextForRow(row) {
  return [
    row && row.source_proof_text,
    row && row.source_text,
    row && row.source_excerpt,
    row && row.motivation_evidence_text,
    row && row.sale_venue_evidence_text
  ].map(cleanText).filter(Boolean).join(' | ');
}

function canonical(value) {
  return cleanText(propertyIdentity.canonicalAddress(cleanText(value))).toLowerCase();
}

function wouldQualifyAsCompleteSourceAddress(row) {
  return propertyAddressEvidence.isSourceSupportedSubjectAddress(row);
}

function rowFindings(row) {
  const text = sourceTextForRow(row);
  const evidence = propertyAddressEvidence.extractPropertyAddressEvidence(text);
  const normalized = canonical(row && row.normalized_address);
  const venueContamination = normalized && evidence.candidates.some((candidate) =>
    candidate.role === 'sale_venue' && canonical(candidate.address) === normalized
  );
  const sourcePropertyMismatch = normalized && evidence.subject_address && canonical(evidence.subject_address) !== normalized;
  const labeledComplete = !!cleanText(row && row.normalized_address);
  const invalidCompleteLabel = labeledComplete && !wouldQualifyAsCompleteSourceAddress(row);
  return {
    venue_address_as_subject: !!venueContamination,
    source_property_address_mismatch: !!sourcePropertyMismatch,
    invalid_complete_source_address_label: !!invalidCompleteLabel
  };
}

function buildAudit(store) {
  const markets = [];
  const totals = {
    rows_scanned: 0,
    venue_address_as_subject: 0,
    source_property_address_mismatch: 0,
    invalid_complete_source_address_label: 0
  };
  for (const [marketKey, bucket] of Object.entries(store && store.markets || {})) {
    const queues = {
      venue_address_as_subject: [],
      source_property_address_mismatch: [],
      invalid_complete_source_address_label: []
    };
    const rows = Array.isArray(bucket && bucket.rows) ? bucket.rows : [];
    rows.forEach((row) => {
      totals.rows_scanned += 1;
      const findings = rowFindings(row);
      Object.keys(queues).forEach((key) => {
        if (!findings[key]) return;
        totals[key] += 1;
        queues[key].push(cleanText(row && row.queue_key));
      });
    });
    markets.push({
      market_key: marketKey,
      rows_scanned: rows.length,
      counts: Object.fromEntries(Object.entries(queues).map(([key, values]) => [key, values.length])),
      queue_keys: queues
    });
  }
  return {
    status: 'COMPLETE',
    production_contacted: false,
    generated_at: new Date().toISOString(),
    totals,
    markets
  };
}

function main() {
  const snapshotPath = path.resolve(process.env.DEAL_BOARD_SNAPSHOTS_PATH || path.join('data', 'deal-board-snapshots.json'));
  const outputPath = path.resolve('exports', 'cycle-28-venue-audit', 'audit.json');
  let output;
  if (!fs.existsSync(snapshotPath)) {
    output = {
      status: 'UNREACHABLE',
      production_contacted: false,
      generated_at: new Date().toISOString(),
      snapshot_path: snapshotPath,
      reason: 'No local deal-board snapshot exists; the live snapshot is stored on the Railway volume and production access is forbidden for this build.',
      totals: null,
      markets: null
    };
  } else {
    output = buildAudit(JSON.parse(fs.readFileSync(snapshotPath, 'utf8')));
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  buildAudit,
  rowFindings,
  wouldQualifyAsCompleteSourceAddress
};
