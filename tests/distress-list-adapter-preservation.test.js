'use strict';

const assert = require('node:assert/strict');
const adapter = require('../modules/sources/distress-list-acquisition-adapter');
const { installRefuseLiveNetwork } = require('./helpers/refuse-live-network');

async function main() {
  const network = installRefuseLiveNetwork();
  try {
    const rows = ['Parcel ID,Property Address,Sale Date,Amount Due'];
    for (let i = 0; i <= adapter.MAX_ROWS; i++) rows.push(`P-${i},${100 + i} Example St,2026-12-01,100`);
    rows.push('NO-ADDRESS,,2026-12-01,50');
    rows.push('P-0,100 Example St,2026-12-01,125');
    let requests = 0;
    const result = await adapter.runDistressListAcquisitionAdapter({
      source_id: 'tn_shelby_tax_sale_scgpublic_s3_amazonaws_com',
      captured_at: '2026-11-17T12:00:00Z', today: '2026-11-17',
      now_ms: () => { throw Error('Explicit capture date must not read a clock'); },
      fetcher: { fetchForProfile: async () => {
        requests++;
        return { status: 'ok', text: () => rows.join('\n') };
      } }
    });
    assert.equal(requests, 1, 'No extra page or live request is introduced');
    assert.equal(result.diagnostics.rows_found, adapter.MAX_ROWS + 3);
    assert.equal(result.candidates.length, adapter.MAX_ROWS + 1, 'Keep every addressed row already read, including beyond the request-page limit');
    assert.equal(result.source_proof_rows.length, 1, 'Keep the addressless row beyond the request-page limit');
    assert.equal(result.source_proof_rows[0].lane, 'needs_data');
    assert.equal(result.diagnostics.rows_capped, 0, 'No parsed rows discarded');
    assert.equal(result.diagnostics.duplicate_rows_merged, 1);
    const current = result.candidates.find(row => row.document_number === 'P-0');
    assert.equal(current.amount_listed, '125', 'Last source row is current evidence');
    const audit = result.distress_audit.find(row => row.lead_key === current.distress_lead_key);
    assert(audit.changes.some(change => change.field === 'amount_listed' && change.old_value === '100'), 'Duplicate changes survive the adapter boundary');
    assert(audit.changes.some(change => change.field === 'source_row_reference' && change.old_value === 'row 1 (line 2)'));
    assert.equal(result.distress_summary.rows_found, adapter.MAX_ROWS + 3);
    assert.equal(result.preview_only, true);
    assert.equal(result.should_ingest, false);
    assert.equal(result.no_global_mutation, true);
    assert(result.candidates.every(row => row.source_structured_address_verified === false && row.not_a_saved_lead === true));
    assert(!JSON.stringify(result.distress_summary).includes('Example St'), 'Aggregate summary remains counts only');
    assert.deepEqual(network.attempts, []);
    console.log('distress-list adapter preservation: all parsed rows, missing-address proof, current duplicate evidence/audit, no clock/live requests/ingest PASS');
  } finally {
    network.restore();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
