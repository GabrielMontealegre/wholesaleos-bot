'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const profiles = require('../modules/sources/county-appraisal-profiles');
const adapter = require('../modules/sources/county-appraisal-adapter');
const { selectTestProperties } = require('../scripts/cycle-44-select-test-property');

const profile = profiles.profileForCounty('Ellis', 'TX');
const sourceUrl = 'https://www.elliscad.org/property-detail/292247/2027';
const owner = 'WITTE JACOB & ADRIANA';
const subject = '3808 Kings Dr, Ennis, TX 75119';
const sourceRow = {
  pid: '292247', pyear: '2027', valueyear: '2026', geoid: '25.2976.907.012.00.103',
  fileasname: owner, ownerid: '211938', streetnum: '3808', streetname: 'KINGS',
  streetseco: 'DR', city: 'ENNIS', state: 'TX', zip: '75119',
  owneraddrd: '3808 Kings Dr', owneraddrc: 'Ennis', owneraddrs: 'TX', owneraddrz: '75119-1789',
  legaldescr: 'LOT 12 BLK G CHRISTIAN MEADOWS PH 2 0.1148 AC', statecd: 'A1',
  legalacre: '0.1148', ownerappra: '246266', deeddt: '20230629', instrument: '2319326',
  imprvactua: '2023'
};
const portalHtml = `<main>
  <h2>Property | 292247</h2>
  <div><p>Geographic ID:</p><p>25.2976.907.012.00.103</p></div>
  <div><p>Name:</p><p>${owner}</p></div>
  <div><p>Owner ID:</p><p>211938</p></div>
  <div><p>% Ownership:</p><div>100.000000 %</div></div>
  <div><p>Mailing Address:</p><p>3808 Kings Dr Ennis TX 75119-1789</p></div>
  <div><p>Exemptions:</p><p>HS - Homestead</p></div>
  <div><p>State Code:</p><p>A1</p></div>
  <div><p>Legal Description:</p><p>LOT 12 BLK G CHRISTIAN MEADOWS PH 2 0.1148 AC</p></div>
  <div>Address: 3808 KINGS DR, ENNIS TX 75119 Market Area: ENN16</div>
  <table><thead><tr><th>Year</th><th>Appraised</th></tr></thead><tbody>
    <tr><td>2026</td><td>246,266</td></tr><tr><td>2025</td><td>249,308</td></tr>
    <tr><td>2024</td><td>256,634</td></tr><tr><td>2023</td><td>37,125</td></tr>
  </tbody></table>
  <div><p>Gross Building Area:</p><p>1,860 sqft</p></div>
  <table><thead><tr><th>Description</th><th>Year Built</th><th>SQFT</th></tr></thead><tbody>
    <tr><td>MAIN AREA</td><td>2023</td><td>1,374</td></tr>
    <tr><td>ATTACHED 2 CAR GARAGE</td><td>2023</td><td>400</td></tr>
    <tr><td>COVERED PORCH</td><td>2023</td><td>86</td></tr>
  </tbody></table>
  <table><tbody><tr><td>Exterior Wall : BRICK 80.00% Exterior Wall : HARDBOARD 20.00% Foundation : SLAB Heating/Cooling : CENTRAL H/A Number of Bedrooms : THREE BEDROOM Plumbing : TWO BATH Roof Covering : COMPOSITION SHINGLE Roof Style : HIP/GABLE</td></tr></tbody></table>
  <table><thead><tr><th>Land</th><th>Acres</th><th>SQFT</th></tr></thead><tbody>
    <tr><td>LOT</td><td>0.1148</td><td>5,000.00</td></tr>
  </tbody></table>
  <table><thead><tr><th>Deed Date</th><th>Description</th><th>Grantor/Seller</th><th>Grantee/Buyer</th><th>Instrument</th></tr></thead><tbody>
    <tr><td>2023-06-29</td><td>DEED</td><td>LEGEND CLASSIC HOMES LTD</td><td>${owner}</td><td>2319326</td></tr>
    <tr><td>2022-07-29</td><td>DEED</td><td>CHRISTIAN ROAD DEVELOPMENT LLC</td><td>LEGEND CLASSIC HOMES LTD</td><td>2231528</td></tr>
    <tr><td>2017-08-08</td><td>DEED</td><td>WADLEY ROBERT W BRYPASS TRUST</td><td>CHRISTIAN ROAD DEVELOPMENT LLC</td><td>1722635</td></tr>
  </tbody></table>
</main>`;

function writeDbf(file, records) {
  const names = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const lengths = Object.fromEntries(names.map((name) => [name, Math.max(9, ...records.map((row) => String(row[name] || '').length))]));
  const headerLength = 32 + names.length * 32 + 1;
  const recordLength = 1 + names.reduce((sum, name) => sum + lengths[name], 0);
  const out = Buffer.alloc(headerLength + recordLength * records.length + 1, 0x20);
  out[0] = 0x03;
  out[29] = 0x57;
  out.writeUInt32LE(records.length, 4);
  out.writeUInt16LE(headerLength, 8);
  out.writeUInt16LE(recordLength, 10);
  let offset = 32;
  for (const name of names) {
    out.write(name, offset, 11, 'ascii');
    out[offset + 11] = 0x43;
    out[offset + 16] = lengths[name];
    offset += 32;
  }
  out[headerLength - 1] = 0x0d;
  for (let index = 0; index < records.length; index += 1) {
    let cursor = headerLength + index * recordLength;
    out[cursor++] = 0x20;
    for (const name of names) {
      out.write(String(records[index][name] || '').padEnd(lengths[name]), cursor, lengths[name], 'latin1');
      cursor += lengths[name];
    }
  }
  out[out.length - 1] = 0x1a;
  fs.writeFileSync(file, out);
  return out;
}

async function run() {
  assert(profile && profile.verified_at);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle44-'));
  try {
    const file = path.join(temp, 'ownership.dbf');
    const bytes = writeDbf(file, [sourceRow]);
    const index = await adapter.ingestBulkFile({ profile, file_path: file, operator_id: 'fixture_operator', now_iso: '2026-09-23T00:00:00Z' });
    assert.equal(index.provenance.file_hash, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal(index.provenance.record_count, 1);
    assert.equal(index.provenance.operator_id, 'fixture_operator');
    assert.equal(index.provenance.source_page_url, profile.bulk_export_page_url);
    await assert.rejects(() => adapter.ingestBulkFile({ profile, file_path: file }), /bulk_operator_id_required/);
    const wrongTable = path.join(temp, 'wrong-table.dbf');
    writeDbf(wrongTable, [{ pid: '292247' }]);
    await assert.rejects(() => adapter.ingestBulkFile({ profile, file_path: wrongTable, operator_id: 'fixture' }),
      /bulk_required_field_missing_owner_of_record/);
    const row = { queue_key: 'fixture-3808', address_state: 'complete_source_address', normalized_address: subject,
      city: 'Ennis', county: 'Ellis', state: 'TX', source_url: 'https://county.example.invalid/notice',
      preview_only: true, not_a_saved_lead: true };
    const matched = adapter.matchRow(row, index);
    assert.equal(matched.status, 'matched');
    assert.equal(matched.match_basis, 'exact_address');
    assert.equal(matched.record.owner_of_record, owner);
    assert.equal(matched.record.owner_occupied, true);
    assert.equal(matched.record.assessed_value_year, '2026');
    assert.equal(adapter.matchRow({ normalized_address: '3808 King Dr, Ennis, TX 75119' }, index).status, 'no_match');
    assert.equal(adapter.matchRow({ ...row, county: 'Dallas' }, index).reason, 'county_or_state_mismatch');
    assert.equal(adapter.matchRow({ ...row, state: 'OK' }, index).reason, 'county_or_state_mismatch');

    const duplicateFile = path.join(temp, 'duplicate.dbf');
    writeDbf(duplicateFile, [sourceRow, { ...sourceRow, pid: '292248' }]);
    const duplicateIndex = await adapter.ingestBulkFile({ profile, file_path: duplicateFile, operator_id: 'fixture' });
    assert.equal(adapter.matchRow(row, duplicateIndex).status, 'ambiguous');
    assert.equal(adapter.matchRow({ ...row, parcel_id: '999999' }, index).reason, 'parcel_or_geo_conflicts_with_address');

    const portal = adapter.parsePortalHtml(portalHtml, profile, sourceUrl);
    assert.equal(portal.parcel_id, '292247');
    assert.equal(portal.owner_of_record, owner);
    assert.equal(portal.mailing_address, '3808 Kings Dr Ennis TX 75119-1789');
    assert.equal(portal.homestead_exemption, true);
    assert.equal(adapter.parsePortalHtml(portalHtml.replace('<div><p>Exemptions:</p><p>HS - Homestead</p></div>', ''), profile, sourceUrl).homestead_exemption, null);
    assert.equal(portal.percent_ownership, 100);
    assert.equal(portal.living_area, 1374);
    assert.equal(portal.gross_building_area, 1860);
    assert.equal(portal.year_built, 2023);
    assert.equal(portal.beds, 3);
    assert.equal(portal.baths, 2);
    assert.equal(portal.garage, 'ATTACHED 2 CAR GARAGE');
    assert.equal(portal.lot_size_acres, 0.1148);
    assert.equal(portal.lot_size_sqft, 5000);
    assert.deepEqual(portal.deed_history.map((deed) => deed.instrument), ['2319326', '2231528', '1722635']);
    assert.deepEqual(portal.value_history.map((value) => value.appraised_value), [246266, 249308, 256634, 37125]);
    assert.equal(portal.legal_description, sourceRow.legaldescr);

    const enriched = adapter.applyMatchedRecord(row, matched.record, '2026-09-23T00:00:00Z');
    assert.equal(enriched.contact_state, 'MAIL_READY');
    assert.equal(enriched.row_state, 'MAIL_READY');
    assert.equal(enriched.free_contact_routes, undefined);
    assert.equal(enriched.owner_record.source_kind, 'official_public_record');
    assert.equal(enriched.mailing_route.source_kind, 'official_public_record');
    assert.equal(enriched.owner_record.operator_confirmed, undefined);
    assert.equal(enriched.county_appraisal_record.equity_signal, 'UNKNOWN');
    assert.equal(enriched.year_built, undefined);
    assert.equal(enriched.living_area, undefined);
    assert.equal(enriched.assessed_value, 246266);
    assert.equal(enriched.arv_status, undefined);
    assert.equal(enriched.verified_sold_comp_count, undefined);
    const noOwner = adapter.applyMatchedRecord({ ...row, owner_record: { owner_name: 'KNOWN OWNER' } },
      { ...matched.record, owner_of_record: '', mailing_address: '' }, '2026-09-23T00:00:00Z');
    assert.equal(noOwner.owner_record.owner_name, 'KNOWN OWNER');
    assert.notEqual(noOwner.official_lookup_status, 'owner_found');
    assert.equal(noOwner.appraisal_conflicts, undefined);

    const cp1252 = Buffer.from([0x20, 0x93, 0x4a, 0x4f, 0x48, 0x4e, 0x94]);
    assert.equal(adapter.parseDbfRow(cp1252, { code_page: 0x57, fields: [{ name: 'owner', offset: 1, length: 6 }] }).owner, '\u201cJOHN\u201d');

    const prior = { ...row, lot_size: 4791, public_estimate: '$268,400', arv_status: 'LOCKED',
      arv_range: null, verified_sold_comp_count: 0, ready_to_offer: 'NO',
      owner_record: { owner_name: 'SCREENSHOT NAME', source_url: 'https://zillow.example.invalid' } };
    const corrected = adapter.applyMatchedRecord(prior, matched.record, '2026-09-23T00:00:00Z');
    assert.equal(corrected.lot_size, 5001);
    assert.equal(corrected.appraisal_conflicts.find((item) => item.field === 'lot_size').prior_value, 4791);
    assert.equal(corrected.appraisal_conflicts.find((item) => item.field === 'owner_record.owner_name').prior_value, 'SCREENSHOT NAME');
    assert.equal(corrected.owner_record.is_entity, false);
    const entityOwner = adapter.applyMatchedRecord(row, { ...matched.record, owner_of_record: 'EXAMPLE HOMES LLC' });
    assert.equal(entityOwner.owner_record.is_entity, true);
    assert.equal(corrected.public_estimate, '$268,400');
    assert.equal(corrected.arv_status, 'LOCKED');
    assert.equal(corrected.arv_range, null);
    assert.equal(corrected.verified_sold_comp_count, 0);
    assert.equal(corrected.ready_to_offer, 'NO');
    assert.equal(corrected.preview_only, true);
    assert.equal(corrected.not_a_saved_lead, true);

    const portalEnriched = adapter.applyMatchedRecord(row, portal, '2026-09-23T00:00:00Z');
    assert.equal(portalEnriched.county_appraisal_record.equity_signal, 'LIKELY_NONE');
    assert.equal(portalEnriched.county_appraisal_record.years_held, 3);
    assert.equal(portalEnriched.ready_to_offer, undefined);

    const sparse = adapter.bulkRecord({ ...sourceRow, ownerappra: '', imprvactua: '' }, profile, index.provenance);
    const sparseRow = adapter.applyMatchedRecord(row, sparse);
    assert.equal(sparseRow.assessed_value, undefined);
    assert.equal(sparseRow.year_built, undefined);
    const retainedStory = adapter.applyMatchedRecord({ ...row, property_story: { assessed_value: 'screenshot estimate', source_kind: 'operator_supplied_screenshot' } }, sparse);
    assert.equal(retainedStory.property_story.source_kind, 'operator_supplied_screenshot');

    let requests = 0;
    const rateState = new Map();
    const blockedState = new Map();
    const fetchImpl = async () => { requests += 1; return { status: 403, ok: false }; };
    assert.equal((await adapter.readPortalRecord({ profile, parcel_id: '292247', year: '2027' },
      { now_ms: 10000, rate_state: rateState, blocked_state: blockedState, fetch_impl: fetchImpl })).status, 'blocked');
    assert.equal((await adapter.readPortalRecord({ profile, parcel_id: '292247', year: '2027' },
      { now_ms: 11000, rate_state: rateState, blocked_state: blockedState, fetch_impl: fetchImpl })).status, 'blocked');
    assert.equal(requests, 1);
    const blocked429 = await adapter.readPortalRecord({ profile, parcel_id: '292247', year: '2027' },
      { now_ms: 14000, rate_state: rateState, blocked_state: new Map(), fetch_impl: async () => ({ status: 429, ok: false }) });
    assert.equal(blocked429.reason, 'http_429');

    const adapterSource = fs.readFileSync(path.join(__dirname, '../modules/sources/county-appraisal-adapter.js'), 'utf8');
    assert(!adapterSource.includes('trueprodigyapi.com'));
    assert(!/Authorization\s*:|Bearer\s+|api.key/i.test(adapterSource));
    assert(!/\bEllis\b/.test(adapterSource));
    const olderRecord = { ...matched.record, parcel_id: '100001', normalized_address: '100 Oak St, Ennis, TX 75119',
      address_key: '100|OAK|ST|ENNIS|TX|75119', owner_of_record: 'OLDER OWNER', owner_occupied: false,
      deed_history: [{ date: '2010-01-01', grantee: 'OLDER OWNER', grantor: 'PREVIOUS OWNER' }], year_built: 1990 };
    const rankingIndex = { profile, by_address: new Map(index.by_address), by_parcel: index.by_parcel, by_geo: index.by_geo };
    rankingIndex.by_address.set(olderRecord.address_key, [olderRecord]);
    const ranked = selectTestProperties([row, { ...row, queue_key: 'older', normalized_address: olderRecord.normalized_address }],
      rankingIndex, '2026-09-23T00:00:00Z');
    assert.equal(ranked.summary.matched_count, 2);
    assert.equal(ranked.top_five[0].queue_key, 'older');
    assert.equal(ranked.top_five[0].equity_signal, 'LIKELY_EQUITY');
    console.log('cycle-44-county-appraisal: 15 checks passed');
  } finally {
    if (path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(temp, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
