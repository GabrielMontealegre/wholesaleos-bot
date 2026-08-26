'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-manual-packet-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'deal-board-snapshots.json');
process.env.MANUAL_EVIDENCE_PACKETS_PATH = path.join(tmpDir, 'manual-evidence-packets.json');
process.env.MANUAL_EVIDENCE_SCREENSHOTS_DIR = path.join(tmpDir, 'screenshots');
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));

const service = require('../modules/research/manual-evidence-packet-service');
const fieldProvenance = require('../modules/research/field-provenance');

const TODAY = '2026-08-19';
const DALLAS = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const SUBJECT = '100 Sample St, Dallas, TX 75201';

function marketKey(market) {
  return [market.city, market.county, market.state].map((value) => String(value || '').toLowerCase()).join('|');
}

function row(queueKey, market, overrides) {
  return Object.assign({
    queue_key: queueKey,
    headline: `${queueKey} public notice`,
    normalized_address: `${100 + queueKey.length} ${queueKey} St, ${market.city}, ${market.state} 75001`,
    city: market.city,
    county: market.county,
    state: market.state,
    row_state: 'NEEDS_CONTACT_SEARCH',
    row_state_reason: 'Identity known; free contact search is not complete.',
    quality_bucket: 'INSPECT_NOW',
    lifecycle_status: { status: 'FRESH', quarantined: false },
    source_family: 'preforeclosure_trustee_notice',
    motivation_type: 'preforeclosure_trustee_notice',
    motivation_evidence_text: 'Official notice of trustee sale.',
    source_url: `https://county.example.gov/notices/${queueKey}`,
    source_document_url: `https://county.example.gov/notices/${queueKey}.pdf`,
    owner_clue: 'JANE SAMPLE',
    property_kind: 'single family',
    sqft: 1500,
    beds: 3,
    baths: 2,
    year_built: 1995,
    lot_size: 6000,
    latitude: 32.7767,
    longitude: -96.797,
    missing_fields: ['3 verified sold comps', 'public contact route'],
    preview_only: true,
    should_ingest: false,
    not_a_saved_lead: true
  }, overrides || {});
}

const markets = [
  { city: 'Dallas', county: 'Dallas', state: 'TX', count: 4 },
  { city: 'San Antonio', county: 'Bexar', state: 'TX', count: 2 },
  { city: 'Houston', county: 'Harris', state: 'TX', count: 0 },
  { city: 'Detroit', county: 'Wayne', state: 'MI', count: 0 },
  { city: 'San Diego', county: 'San Diego', state: 'CA', count: 2 },
  { city: 'Los Angeles', county: 'Los Angeles', state: 'CA', count: 2 }
];
const snapshot = { version: 1, markets: {} };
markets.forEach((market) => {
  snapshot.markets[marketKey(market)] = {
    market: { city: market.city, county: market.county, state: market.state },
    rows: Array.from({ length: market.count }, (_, index) => row(`${market.city.toLowerCase().replace(/\s/g, '-')}-${index + 1}`, market, {
      normalized_address: `${100 + index} Sample St, ${market.city}, ${market.state} 7500${index + 1}`,
      sale_date_iso: index === 0 ? '2026-09-01' : '',
      sale_date_or_event_date: index === 0 ? '09/01/2026' : ''
    }))
  };
});
snapshot.markets[marketKey(DALLAS)].rows[0] = row('dallas-subject', DALLAS, {
  normalized_address: SUBJECT,
  source_document_url: 'https://dallascounty.example.gov/notices/subject.pdf',
  sale_date_iso: '2026-09-01',
  sale_date_or_event_date: '09/01/2026'
});
fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify(snapshot, null, 2));

function packetWithComps(comps) {
  return {
    evidence_items: comps.map((fields, index) => ({
      evidence_id: `comp-${index}`,
      evidence_type: 'sold_comp',
      screenshot_id: `shot-${index}`,
      source_name: 'Zillow sold result',
      captured_at: '2026-08-19T12:00:00.000Z',
      operator_confirmed: true,
      fields
    }))
  };
}

function comp(index, overrides) {
  return Object.assign({
    comp_address: `${200 + index} Nearby St, Dallas, TX 75201`,
    sold_status: 'sold',
    sold_price: `$${200000 + index * 10000}`,
    sold_date: '2026-06-15',
    source_url: `https://www.zillow.com/homedetails/nearby-${index}_zpid/`,
    similarity_basis: 'same single-family land use and nearby location',
    land_use: 'single family',
    property_kind: 'single family',
    beds: '3',
    baths: '2',
    sqft: '1500',
    year_built: '1998',
    lot_size: '6200',
    latitude: String(32.7767 + index * 0.001),
    longitude: String(-96.797 + index * 0.001)
  }, overrides || {});
}

function pngBuffer(size) {
  const buffer = Buffer.alloc(size || 40, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  return buffer;
}

(async () => {
  assert.strictEqual(fieldProvenance.sourceKind('operator_supplied_screenshot'), 'operator_supplied_screenshot');
  const beforeSnapshotBytes = fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH);
  const originalFetch = global.fetch;
  let outboundRequests = 0;
  global.fetch = async () => { outboundRequests += 1; throw new Error('manual packet service must not fetch research links'); };
  const all = service.sampleModeForAllMarkets({ snapshot_store: snapshot }, { today_iso: TODAY });
  global.fetch = originalFetch;
  const counts = Object.fromEntries(all.markets.map((entry) => [entry.market.city, entry.selected_count]));
  assert.deepStrictEqual(counts, { Dallas: 3, 'San Antonio': 2, Houston: 0, Detroit: 0, 'San Diego': 2, 'Los Angeles': 2 });
  const selectedByMarket = Object.fromEntries(all.markets.map((entry) => [entry.market.city, entry.items.map((item) => item.queue_key)]));
  assert.deepStrictEqual(selectedByMarket, {
    Dallas: ['dallas-subject', 'dallas-2', 'dallas-3'],
    'San Antonio': ['san-antonio-1', 'san-antonio-2'],
    Houston: [],
    Detroit: [],
    'San Diego': ['san-diego-1', 'san-diego-2'],
    'Los Angeles': ['los-angeles-1', 'los-angeles-2']
  });
  assert.ok(all.markets.find((entry) => entry.market.city === 'Houston').empty_reason);
  assert.strictEqual(all.outbound_research_requests, 0);
  assert.strictEqual(outboundRequests, 0, 'sample selection and link generation must make zero outbound requests');
  assert.deepStrictEqual(fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH), beforeSnapshotBytes, 'sample reads cannot rewrite the snapshot');

  const dallas = all.markets.find((entry) => entry.market.city === 'Dallas');
  const selected = dallas.items.find((item) => item.queue_key === 'dallas-subject');
  assert.ok(selected, 'future-sale Dallas subject must be selected deterministically');
  assert.ok(selected.research_links.some((entry) => /zillow/i.test(entry.label) && /dallas/i.test(entry.url)));
  assert.ok(selected.research_links.some((entry) => /CyberBackgroundChecks address/i.test(entry.label)));
  assert.strictEqual(selected.packet.preview_only, true);
  assert.strictEqual(selected.packet.not_a_saved_lead, true);

  assert.strictEqual(service.imageType(Buffer.from('not an image')), null);
  await assert.rejects(() => service.uploadScreenshot({
    market: DALLAS, queue_key: 'dallas-subject', evidence_type: 'sold_comp', source_name: 'Zillow', source_url: 'https://zillow.com/x',
    filename: 'fake.png', buffer: Buffer.from('not an image')
  }, { ocr_impl: async () => '' }), (error) => error.code === 'manual_evidence_file_magic_invalid');
  await assert.rejects(() => service.uploadScreenshot({
    market: DALLAS, queue_key: 'dallas-subject', evidence_type: 'sold_comp', source_name: 'Zillow', source_url: 'https://zillow.com/x',
    filename: 'large.png', buffer: pngBuffer(service.MAX_UPLOAD_BYTES + 1)
  }, { ocr_impl: async () => '' }), (error) => error.code === 'manual_evidence_file_too_large');
  assert.ok(!fs.existsSync(process.env.MANUAL_EVIDENCE_PACKETS_PATH), 'rejected uploads must write no metadata');

  const upload = await service.uploadScreenshot({
    market: DALLAS,
    queue_key: 'dallas-subject',
    evidence_type: 'sold_comp',
    source_name: 'Zillow sold result',
    source_url: 'https://www.zillow.com/homedetails/200-nearby_zpid/',
    filename: '..\\sold-proof.png',
    buffer: pngBuffer()
  }, {
    ocr_impl: async () => 'Sold $225,000 on 06/15/2026 200 Nearby St, Dallas, TX 75201',
    now_impl: () => '2026-08-19T12:00:00.000Z'
  });
  const uploadedItem = upload.manual_evidence_item.packet.evidence_items[0];
  assert.strictEqual(uploadedItem.operator_confirmed, false);
  Object.values(uploadedItem.field_evidence).forEach((entry) => {
    assert.strictEqual(entry.source_kind, 'operator_supplied_screenshot');
    assert.strictEqual(entry.source_name, 'Zillow sold result');
    assert.strictEqual(entry.screenshot_id, uploadedItem.screenshot_id);
    assert.strictEqual(entry.operator_confirmed, false);
    assert.ok(entry.captured_at);
  });
  assert.strictEqual(upload.manual_evidence_item.packet.evaluation.verified_sold_comp_count, 0, 'unconfirmed OCR cannot count as a comp');
  const packetJson = fs.readFileSync(process.env.MANUAL_EVIDENCE_PACKETS_PATH, 'utf8');
  assert.ok(!packetJson.includes('iVBOR') && !packetJson.includes('data:image'), 'packet JSON stores no image bytes or base64');
  const stored = JSON.parse(packetJson);
  const storedShot = stored.markets[marketKey(DALLAS)].packets['dallas-subject'].screenshots[0];
  assert.strictEqual(storedShot.mime, 'image/png');
  assert.ok(storedShot.sha256 && storedShot.byte_size === 40);
  assert.ok(!Object.prototype.hasOwnProperty.call(storedShot, 'buffer'));

  const corrected = service.recordEvidenceProposal({
    market: DALLAS,
    queue_key: 'dallas-subject',
    evidence_id: uploadedItem.evidence_id,
    operator_confirmed: true,
    fields: comp(1, { comp_address: '200 Nearby St, Dallas, TX 75201', sold_price: '$225,000' })
  }, { now_impl: () => '2026-08-19T12:05:00.000Z', operator_id: 'admin' });
  assert.strictEqual(corrected.manual_evidence_item.packet.evaluation.verified_sold_comp_count, 1);
  assert.strictEqual(corrected.manual_evidence_item.packet.evaluation.arv_range, null);

  const blankOcrUpload = await service.uploadScreenshot({
    market: DALLAS,
    queue_key: 'dallas-subject',
    evidence_type: 'subject_property',
    source_name: 'Redfin',
    source_url: 'https://www.redfin.com/TX/Dallas/100-Sample-St-75201/home/1',
    filename: 'subject.png',
    buffer: pngBuffer()
  }, { ocr_impl: async () => '', now_impl: () => '2026-08-19T12:06:00.000Z' });
  const blankItem = blankOcrUpload.manual_evidence_item.packet.evidence_items.find((item) => item.evidence_type === 'subject_property');
  assert.strictEqual(blankItem.proposal_status, 'ocr_no_usable_fields_manual_entry_required');
  const manuallyEntered = service.recordEvidenceProposal({
    market: DALLAS,
    queue_key: 'dallas-subject',
    evidence_id: blankItem.evidence_id,
    operator_confirmed: true,
    fields: { normalized_address: SUBJECT, property_kind: 'single family', beds: '3', baths: '2', sqft: '1450', source_url: 'https://www.redfin.com/TX/Dallas/100-Sample-St-75201/home/1' }
  }, { now_impl: () => '2026-08-19T12:07:00.000Z', operator_id: 'admin' });
  const confirmedManual = manuallyEntered.manual_evidence_item.packet.evidence_items.find((item) => item.evidence_id === blankItem.evidence_id);
  assert.strictEqual(confirmedManual.operator_confirmed, true, 'manual entry must work when OCR finds no usable fields');
  assert.strictEqual(confirmedManual.fields.sqft, '1450');

  const two = service.evaluatePacket(packetWithComps([comp(1), comp(2)]), snapshot.markets[marketKey(DALLAS)].rows[0], { today_iso: TODAY });
  assert.strictEqual(two.verified_sold_comp_count, 2);
  assert.strictEqual(two.arv_status, 'ARV_LOCKED_NEEDS_3_VERIFIED_SOLD_COMPS');
  const three = service.evaluatePacket(packetWithComps([comp(1), comp(2), comp(3)]), snapshot.markets[marketKey(DALLAS)].rows[0], { today_iso: TODAY });
  assert.strictEqual(three.verified_sold_comp_count, 3);
  assert.strictEqual(three.arv_status, 'ARV_UNLOCKED_VERIFIED_COMPS');
  assert.strictEqual(three.arv_evidence_basis, 'operator_supplied_screenshot');
  assert.ok(three.verified_screenshot_comps.every((item) => item.comp_grid.accepted === true));
  assert.deepStrictEqual(three.arv_range, {
    low: 210000, high: 230000, median: 220000, count: 3, basis: 'operator_supplied_screenshot',
    label: 'Preliminary ARV range from operator-confirmed screenshot sold comps. Review before any offer.'
  });

  const rejected = service.evaluatePacket(packetWithComps([
    comp(1, { sold_date: '2023-01-01' }),
    comp(2, { sold_date: '2025-06-01' }),
    comp(3, { sold_price: '$250' }),
    comp(4, { similarity_basis: '' }),
    comp(5, { comp_address: SUBJECT }),
    comp(6, { comp_address: '', parcel_id: '123-456', similarity_basis: 'same land use' })
  ]), snapshot.markets[marketKey(DALLAS)].rows[0], { today_iso: TODAY });
  assert.deepStrictEqual(rejected.rejected_screenshot_comps.map((item) => item.rejected_reason), [
    'sale_outside_comp_window', 'stale_comp', 'nominal_or_non_market_sale_price', 'missing_similarity_basis',
    'subject_address_not_a_comp', 'parcel_only_comp_without_subject_parcel_id'
  ]);
  assert.strictEqual(rejected.verified_sold_comp_count, 0);

  const missingGridFacts = service.evaluatePacket(packetWithComps([comp(7, { sqft: '', beds: '', baths: '' })]), snapshot.markets[marketKey(DALLAS)].rows[0], { today_iso: TODAY });
  assert.strictEqual(missingGridFacts.verified_sold_comp_count, 0);
  assert.ok(missingGridFacts.rejected_screenshot_comps[0].comp_grid.criteria.some((item) => item.status === 'NOT_APPLIED'));

  const officialConflictRow = Object.assign({}, snapshot.markets[marketKey(DALLAS)].rows[0], { listed_price: '$300,000' });
  const conflict = service.evaluatePacket({ evidence_items: [{
    evidence_type: 'subject_property', screenshot_id: 'shot-clue', source_name: 'Zillow', captured_at: '2026-08-19T12:00:00Z', operator_confirmed: true,
    fields: { normalized_address: '999 Different St, Dallas, TX 75201', list_price: '$350,000', zestimate: '$410,000', source_url: 'https://zillow.com/x' }
  }] }, officialConflictRow, { today_iso: TODAY });
  assert.strictEqual(officialConflictRow.normalized_address, SUBJECT, 'screenshot conflict cannot overwrite official address');
  assert.ok(conflict.conflicts.some((item) => item.field === 'normalized_address'));
  assert.ok(conflict.conflicts.some((item) => item.field === 'list_price'));
  assert.ok(conflict.clue_values_not_arv.every((item) => item.label === 'CLUE_ONLY_NOT_ARV'));
  assert.strictEqual(conflict.arv_status, 'ARV_LOCKED_NEEDS_3_VERIFIED_SOLD_COMPS');

  function contactPacket(classification, confirmed) {
    return { evidence_items: [{
      evidence_type: 'skip_trace', screenshot_id: 'shot-contact', source_name: 'CyberBackgroundChecks', captured_at: '2026-08-19T12:00:00Z', operator_confirmed: true,
      fields: { owner_name: 'JANE SAMPLE', contact_value: '(214) 555-0100', contact_route_kind: 'phone', contact_classification: classification, seller_owner_confirmed: confirmed, source_url: 'https://www.cyberbackgroundchecks.com/address/example' }
    }] };
  }
  const unknownContact = service.evaluatePacket(contactPacket('unknown_unverified_contact', false), snapshot.markets[marketKey(DALLAS)].rows[0], { today_iso: TODAY });
  const relativeContact = service.evaluatePacket(contactPacket('possible_household_or_relative_contact', false), snapshot.markets[marketKey(DALLAS)].rows[0], { today_iso: TODAY });
  const servicerContact = service.evaluatePacket(contactPacket('trustee_servicer_or_attorney_contact', false), snapshot.markets[marketKey(DALLAS)].rows[0], { today_iso: TODAY });
  const ownerContact = service.evaluatePacket(contactPacket('possible_owner_contact', true), snapshot.markets[marketKey(DALLAS)].rows[0], { today_iso: TODAY });
  assert.strictEqual(unknownContact.contact_routes_accepted.length, 0);
  assert.strictEqual(relativeContact.contact_routes_accepted.length, 0);
  assert.strictEqual(servicerContact.contact_routes_accepted.length, 0);
  assert.notStrictEqual(unknownContact.projected_row_state, 'CALL_READY');
  assert.notStrictEqual(relativeContact.projected_row_state, 'CALL_READY');
  assert.notStrictEqual(servicerContact.projected_row_state, 'CALL_READY');
  assert.strictEqual(ownerContact.contact_routes_accepted.length, 1);
  assert.strictEqual(ownerContact.projected_row_state, 'CALL_READY');

  assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads, [], 'manual packets never write saved leads');
  assert.deepStrictEqual(fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH), beforeSnapshotBytes, 'manual evidence writes cannot mutate official snapshot rows');
  console.log(JSON.stringify({ sample_mode: selectedByMarket, outbound_research_requests: outboundRequests }));
  console.log('manual evidence packet tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
