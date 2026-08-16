'use strict';

const fs = require('fs');
const path = require('path');

const fieldProvenance = require('../modules/research/field-provenance');
const leadOperationsState = require('../modules/research/lead-operations-state');

const TAXPAYER_CAVEAT = 'Taxpayer of record may be a servicer or escrow company, not the owner.';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function csvCell(value) {
  const text = cleanText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function mailReadyRecord(row) {
  const mailing = row && row.mailing_route;
  if (!mailing || !cleanText(mailing.value) || !fieldProvenance.routeHasProvenance(mailing)) return null;
  if (leadOperationsState.rowStateForDeal(row).row_state !== 'MAIL_READY') return null;
  const owner = row.owner_record && typeof row.owner_record === 'object' ? row.owner_record : {};
  const role = cleanText(owner.owner_role) === 'taxpayer_of_record' ? 'taxpayer_of_record' : 'owner_of_record';
  const recipient = role === 'taxpayer_of_record'
    ? cleanText(owner.taxpayer_name || row.owner_clue)
    : cleanText(owner.owner_name || row.owner_clue);
  const sourceUrl = cleanText(mailing.source_url);
  if (!recipient || !sourceUrl) return null;
  return {
    recipient_name: recipient,
    recipient_role: role,
    mailing_address: cleanText(mailing.value),
    property_address: cleanText(row.normalized_address),
    county: cleanText(row.county),
    motivation: cleanText(row.motivation_type || row.source_family || row.foreclosure_type),
    sale_date: cleanText(row.sale_date_or_event_date),
    source_url: sourceUrl,
    caveat: role === 'taxpayer_of_record' ? TAXPAYER_CAVEAT : cleanText((mailing.risk_flags || []).join('; '))
  };
}

function collectMailReadyRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(mailReadyRecord).filter(Boolean);
}

function csvForRows(rows) {
  const columns = ['recipient_name', 'recipient_role', 'mailing_address', 'property_address', 'county', 'motivation', 'sale_date', 'source_url', 'caveat'];
  return [columns.join(',')].concat(rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))).join('\r\n') + '\r\n';
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function exportMailReadyRows(options = {}) {
  const snapshotPath = path.resolve(options.snapshot_path || process.env.DEAL_BOARD_SNAPSHOTS_PATH || './data/deal-board-snapshots.json');
  const outputDir = path.resolve(options.output_dir || './exports/mail-ready');
  const store = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const rows = Object.values(store.markets || {}).flatMap((market) => Array.isArray(market && market.rows) ? market.rows : []);
  const records = collectMailReadyRows(rows);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${timestampForFile(options.now || new Date())}.csv`);
  fs.writeFileSync(outputPath, csvForRows(records));
  return { output_path: outputPath, row_count: records.length, preview_only: true, not_a_saved_lead: true };
}

if (require.main === module) {
  const result = exportMailReadyRows({ snapshot_path: process.argv[2], output_dir: process.argv[3] });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

module.exports = {
  TAXPAYER_CAVEAT,
  collectMailReadyRows,
  csvForRows,
  exportMailReadyRows,
  mailReadyRecord
};
