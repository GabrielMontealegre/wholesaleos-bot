'use strict';

const fs = require('fs');
const { profileForCounty } = require('../modules/sources/county-appraisal-profiles');
const { applyMatchedRecord, ingestBulkFile, matchRow } = require('../modules/sources/county-appraisal-adapter');

function clean(value) { return String(value == null ? '' : value).trim(); }
function eventDate(row) {
  return clean(row.source_event_date || row.sale_date_iso || row.sale_date_or_event_date).slice(0, 10);
}
function score(row, nowIso) {
  const appraisal = row.county_appraisal_record || {};
  const year = Number(row.year_built);
  const held = Number(appraisal.years_held);
  const date = eventDate(row);
  const currentEvent = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= nowIso.slice(0, 10);
  return [
    appraisal.equity_signal === 'LIKELY_EQUITY' ? 1 : 0,
    Number.isFinite(year) && year > 0 && year <= 2010 ? 1 : 0,
    Number.isFinite(held) && held >= 8 ? 1 : 0,
    appraisal.owner_occupied === false || appraisal.homestead_exemption === false ? 1 : 0,
    clean(row.address_state) === 'complete_source_address' ? 1 : 0,
    currentEvent ? 1 : 0
  ];
}
function compareCandidates(left, right, nowIso) {
  const a = score(left, nowIso);
  const b = score(right, nowIso);
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return b[i] - a[i];
  const dateA = a[5] ? eventDate(left) : '9999-12-31';
  const dateB = b[5] ? eventDate(right) : '9999-12-31';
  return dateA.localeCompare(dateB) || clean(left.queue_key).localeCompare(clean(right.queue_key));
}
function selectTestProperties(rows, index, nowIso = new Date().toISOString()) {
  const results = [];
  const summary = { total_rows: rows.length, matched_count: 0, owner_count: 0, mailing_count: 0,
    mail_ready_count: 0, equity_signal_distribution: {} };
  for (const row of rows) {
    const match = matchRow(row, index);
    if (match.status !== 'matched') continue;
    summary.matched_count += 1;
    const enriched = applyMatchedRecord(row, match.record, nowIso);
    if (clean(enriched.owner_record && enriched.owner_record.owner_name)) summary.owner_count += 1;
    if (clean(enriched.mailing_route && enriched.mailing_route.value)) summary.mailing_count += 1;
    if (enriched.contact_state === 'MAIL_READY') summary.mail_ready_count += 1;
    const equity = enriched.county_appraisal_record.equity_signal;
    summary.equity_signal_distribution[equity] = (summary.equity_signal_distribution[equity] || 0) + 1;
    results.push(enriched);
  }
  results.sort((a, b) => compareCandidates(a, b, nowIso));
  return { summary, top_five: results.slice(0, 5).map((row) => {
    const appraisal = row.county_appraisal_record;
    return {
      queue_key: row.queue_key, address: row.normalized_address, source_event_date: eventDate(row),
      county_property_id: appraisal.parcel_id, official_source_url: appraisal.source_url,
      owner_of_record: appraisal.owner_of_record, mailing_address: appraisal.mailing_address,
      year_built: row.year_built || null, years_held: appraisal.years_held,
      owner_occupied: appraisal.owner_occupied, homestead_exemption: appraisal.homestead_exemption == null ? null : appraisal.homestead_exemption,
      assessed_value_clue: appraisal.assessed_value, assessed_value_year: appraisal.assessed_value_year,
      equity_signal: appraisal.equity_signal, equity_reason: appraisal.equity_reason,
      contact_state: row.contact_state, property_state: row.property_state,
      match_basis: 'exact_source_address_or_explicit_parcel'
    };
  }) };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => args[args.indexOf(flag) + 1];
  if (!args.includes('--rows') || !args.includes('--bulk') || !args.includes('--county') || !args.includes('--state')) {
    throw new Error('Usage: node scripts/cycle-44-select-test-property.js --rows snapshot.json --bulk extracted.dbf --county Ellis --state TX');
  }
  const profile = profileForCounty(value('--county'), value('--state'));
  if (!profile) throw new Error('county_appraisal_profile_missing');
  const input = JSON.parse(fs.readFileSync(value('--rows'), 'utf8'));
  const rows = Array.isArray(input) ? input : Array.isArray(input.rows) ? input.rows : [];
  const index = await ingestBulkFile({ profile, file_path: value('--bulk'), operator_id: 'local_operator_read_only' });
  process.stdout.write(`${JSON.stringify({ ingest: index.provenance, ...selectTestProperties(rows, index) }, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

module.exports = { compareCandidates, selectTestProperties };
