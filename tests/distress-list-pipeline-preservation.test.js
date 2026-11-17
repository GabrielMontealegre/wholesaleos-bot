'use strict';

const assert = require('node:assert/strict');
const { installRefuseLiveNetwork } = require('./helpers/refuse-live-network');
const network = installRefuseLiveNetwork();
const catalog = require('../modules/sources/source-catalog');
const profiles = require('../modules/sources/distress-list-profiles');
const pipeline = require('../modules/research/source-acquisition-orchestrator');
const propertyCandidate = require('../modules/research/property-candidate');

async function main() {
  const originalCatalog = catalog.buildSourceCatalog;
  try {
    const profile = profiles.profileForSourceId('tn_shelby_tax_sale_scgpublic_s3_amazonaws_com');
    catalog.buildSourceCatalog = () => [{ source_id: profile.source_id, source_name: profile.source_name, source_family: profile.source_kind, source_url: profile.source_url }];
    const csv = 'Parcel ID,Property Address,Sale Date,Amount Due,Owner,Recorded Date\n'
      + 'P-0,100 Example St,2020-01-01,100,Synthetic Owner,2026-11-16\n'
      + 'P-1,200 Example St,05/06/2026,200,Synthetic Owner,\n'
      + 'P-2,,05/06/2026,50,Synthetic Owner,\n'
      + 'P-0,100 Example St,2020-01-01,125,Synthetic Owner,"November 16, 2026"\n';
    let requests = 0;
    const result = await pipeline.runAcquisitionCore({ job_id: 'synthetic-provenance-run', source_ids: [profile.source_id] }, {
      fetcher: { fetchForProfile: async () => { requests++; return { status: 'ok', text: () => csv }; } }
    });
    const before = JSON.stringify(result);
    assert.equal(requests, 1);
    assert.equal(result.candidates.length, 2);
    const past = result.candidates.find(row => row.normalized_address.startsWith('100 Example St'));
    const ambiguous = result.candidates.find(row => row.normalized_address.startsWith('200 Example St'));
    assert.match(past.distress_lead_key || '', /\|doc:p-0\|property:/, 'Case/property identity survives repeated shared normalization');
    assert.equal(past.document_number, 'P-0');
    assert.equal(past.distress_source_kind, 'tax_sale');
    assert.equal(past.lane, 'after_sale');
    assert.equal(past.sale_date_raw, '2020-01-01');
    assert.equal(past.sale_date_origin, 'Sale Date');
    assert.equal(past.address_origin, 'Property Address');
    assert.equal(past.recorded_date, '2026-11-16');
    assert.equal(past.recorded_date_raw, 'November 16, 2026');
    assert.equal(past.recorded_date_origin, 'Recorded Date');
    assert.equal(past.amount_listed, '125');
    assert.equal(past.amount_listed_label, 'Amount listed by the source. Not a price, value or loan payoff.');
    assert.equal(past.asking_price, '', 'Source amount never becomes an asking price');
    assert.equal(ambiguous.sale_date_status, 'AMBIGUOUS');
    assert.equal(ambiguous.sale_date_raw, '05/06/2026');
    assert.equal(ambiguous.event_date, '', 'Raw ambiguous date is evidence, not an event date');
    assert.equal(result.source_proof_rows.length, 1, 'Addressless evidence survives orchestration');
    const proof = result.source_proof_rows[0];
    assert.equal(proof.sale_date_status, 'AMBIGUOUS');
    assert.equal(proof.sale_date_raw, '05/06/2026');
    assert.equal(proof.sale_date_origin, 'Sale Date');
    assert.equal(proof.source_row_reference, 'row 3 (line 4)');
    assert.equal(proof.lane, 'needs_data');
    const outcome = result.adapter_results[0];
    assert.equal(outcome.source_proof_rows.length, 1);
    assert.equal(outcome.distress_summary.rows_found, 4);
    assert(!JSON.stringify(outcome.distress_summary).includes('Synthetic Owner'));
    assert(outcome.distress_audit[0].changes.some(change => change.field === 'amount_listed' && change.old_value === '100'));
    assert(outcome.distress_audit[0].changes.some(change => change.field === 'recorded_date_raw' && change.old_value === '2026-11-16'), 'Raw evidence changes are audited even when their normalized date is unchanged');
    for (const card of result.cards) {
      const row = card.property_candidate;
      assert(row.distress_lead_key && row.document_number && row.lane);
      assert.equal(row.source_structured_address_verified, false);
      assert.equal(row.preview_only, true);
      assert.equal(row.should_ingest, false);
      assert.equal(row.not_a_saved_lead, true);
    }
    const forged = propertyCandidate.normalizePropertyCandidate(Object.assign({}, past, { preview_only: false, should_ingest: true, not_a_saved_lead: false }));
    assert.equal(forged.preview_only, true);
    assert.equal(forged.should_ingest, false);
    assert.equal(forged.not_a_saved_lead, true);
    const rawOnly = propertyCandidate.normalizePropertyCandidate({
      sale_date_raw: '2026-12-01', sale_date_status: 'RESOLVED', recorded_date: '2026-12-01',
      amount_listed: '999999', lane: 'working', should_ingest: true
    });
    assert.equal(rawOnly.event_date, '', 'Descriptive evidence never supplies date authority');
    assert.equal(rawOnly.asking_price, '');
    assert.equal(rawOnly.should_ingest, false);
    assert.equal(rawOnly.source_structured_address_verified, false);
    const inherited = propertyCandidate.normalizePropertyCandidate(Object.create({ distress_lead_key: 'forged-inherited-key' }));
    assert.equal(Object.hasOwn(inherited, 'distress_lead_key'), false, 'Only own row evidence is copied');
    assert.equal(JSON.stringify(result), before, 'Re-normalizing does not mutate the original result');
    assert.equal(result.preview_only, true);
    assert.equal(result.should_ingest, false);
    assert.deepEqual(network.attempts, []);
    console.log('distress-list pipeline: case/date/amount/lane metadata, proof rows, duplicate audit, counts-only summary and preview safety survive orchestration PASS');
  } finally {
    catalog.buildSourceCatalog = originalCatalog;
    network.restore();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
