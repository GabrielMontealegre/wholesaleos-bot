'use strict';

const assert = require('node:assert/strict');
const { installRefuseLiveNetwork } = require('./helpers/refuse-live-network');
const network = installRefuseLiveNetwork();
const profiles = require('../modules/sources/distress-list-profiles');
const adapter = require('../modules/sources/distress-list-acquisition-adapter');
const mapper = require('../modules/sources/distress-list-lead-mapper');
const specs = require('../docs/knowledge/county-source-specs-2026-11-09.json');
const capture = '2026-11-17T12:00:00Z';
async function run(id, attributes) {
  let requests = 0;
  const result = await adapter.runDistressListAcquisitionAdapter({ source_id: id, captured_at: capture, today: '2026-11-17',
    fetcher: { fetchForProfile: async () => { requests++; return { status: 'ok', text: () => JSON.stringify({ features: [{ attributes }] }) }; } } });
  assert.equal(requests, 1); return result;
}

async function main() {
  try {
    const settings = require('../modules/sources/distress-list-reader-settings.json');
    const review = require('../docs/cycles/proof-b23c-reader-settings/schema-review.json');
    assert.equal(settings.schema_version, 1);
    assert.equal(review.property_rows_fetched, false); assert.equal(review.source_promoted, false);
    assert.equal(new Set(settings.settings.map(item => item.source_id)).size, settings.settings.length);
    for (const item of settings.settings) {
      const evidence = review.reports.find(report => report.source_id === item.source_id && report.source_url === item.source_url);
      assert(evidence && evidence.metadata_fields_observed);
      for (const field of [...Object.values(item.field_map), item.reader_options.id_field]) assert(evidence.field_names.includes(field), 'Every configured column is present in retained primary schema evidence');
    }
    const id = 'nc_guilford_tax_sale_gcgis_guilfordcountync_gov';
    const attributes = { OBJECTID: 41, OBJECTID_1: 99, LOCATION_ADDR: '100 Example St', PARCEL_ID: 'P-41',
      AuctionDate: Date.UTC(2026, 11, 1), FLAG_STATUS: 'Notice of Sale', Owner: 'Synthetic Owner', Total_Assessed: 900000 };
    const result = await run(id, attributes);
    assert.equal(result.candidates.length, 1, 'Observed official address field is mapped, not lost as proof only');
    const lead = result.candidates[0];
    assert.equal(lead.address_origin, 'LOCATION_ADDR');
    assert.equal(lead.source_row_reference, 'feature OBJECTID=41');
    assert.equal(lead.document_number, 'P-41');
    assert.equal(lead.sale_date_origin, 'AuctionDate');
    assert.equal(lead.sale_date_status, 'RESOLVED');
    assert.equal(lead.event_date, '2026-12-01');
    assert.equal(lead.amount_listed, '', 'Assessed value is not a source amount due');
    assert.equal(lead.asking_price, '', 'Assessed value is not a price');
    assert.equal(lead.source_structured_address_verified, false);
    assert.equal(result.preview_only, true); assert.equal(result.should_ingest, false);
    const missing = await run(id, { OBJECTID: 42, AuctionLocation: '100 Justice Center', Mail_Address: '200 Mailing St', DEED_DATE: Date.UTC(2026, 11, 1) });
    assert.equal(missing.candidates.length, 0, 'No venue/mailing fallback for missing property address');
    assert.equal(missing.source_proof_rows.length, 1);
    assert.equal(missing.source_proof_rows[0].sale_date_status, 'MISSING', 'Deed date never supplies the auction date');
    const ambiguous = await run(id, { ...attributes, AuctionDate: '05/06/2026' });
    assert.equal(ambiguous.candidates[0].sale_date_status, 'AMBIGUOUS');
    assert.equal(ambiguous.candidates[0].event_date, '');

    const meckId = 'nc_mecklenburg_tax_sale_meckags_mecklenburgcountync_gov';
    const meck = await run(meckId, { objectid: 7, situs: '300 Example Rd', parcel_id: 'P-7', due_amount: 125, status: 'Pending', zip: '28000', amt_totalvalue: 800000 });
    assert.equal(meck.candidates[0].source_row_reference, 'feature objectid=7');
    assert.equal(meck.candidates[0].amount_listed, '125');
    assert.equal(meck.candidates[0].asking_price, '');
    assert.equal(meck.candidates[0].event_date, '');
    const codeId = 'tn_davidson_code_case_services2_arcgis_com';
    const codeProfile = profiles.profileForSourceId(codeId);
    const codeFields = { ObjectId: 3, Property_Address: '400 Example Ave', Request_Nbr: 'CASE-3', Property_Owner: 'Synthetic Owner',
      City: 'Example', ZIP: '37000', Status: 'Open', Date_Received: Date.UTC(2026, 10, 1) };
    const code = await run(codeId, codeFields);
    assert.equal(code.candidates[0].document_number, 'CASE-3');
    assert.equal(code.candidates[0].source_row_reference, 'feature ObjectId=3');
    assert.equal(code.candidates[0].recorded_date, '', 'Case receipt date is not a clerk recording date');
    assert.equal(code.candidates[0].event_date, '');
    const mapped = mapper.mapRowToLead({ fields: codeFields, row_reference: 'feature ObjectId=3' }, codeProfile, { captured_at: capture, today: '2026-11-17' });
    assert.equal(mapped.owner_clue, 'Synthetic Owner');
    assert.equal(mapped.owner_clue_origin, 'Property_Owner');
    const overridden = mapper.mapRowToLead({ fields: codeFields, row_reference: 'row 3' }, codeProfile,
      { captured_at: capture, today: '2026-11-17', field_map: { address: 'missing' } });
    assert.equal(overridden.address_as_written, '', 'Explicit missing mapping never guesses a different field');
    assert.equal(overridden.document_number, 'CASE-3', 'Unchanged profile mappings survive a targeted override');

    const original = specs.sources.find(source => source.source_id === id);
    for (const changes of [{ url: original.url + '/other' }, { source_kind: 'probate' }, { format: 'csv' }]) {
      const changed = profiles.buildProfile({ ...original, ...changes });
      assert.deepEqual(changed.field_map, {}, 'Metadata settings never follow a changed source URL/kind/format');
      assert.deepEqual(changed.reader_options, {});
    }
    assert(Object.isFrozen(codeProfile.field_map)); assert(Object.isFrozen(codeProfile.reader_options));
    assert.deepEqual(network.attempts, []);
    console.log('distress reader settings: exact schema mappings/row IDs, epoch/date origins, no venue/mailing/deed/assessment promotion, bound source settings and no network PASS');
  } finally { network.restore(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
