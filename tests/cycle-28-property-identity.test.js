'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cycle-28-ellis-notice.json'), 'utf8'));
const propertyAddressEvidence = require('../modules/research/property-address-evidence');
const propertyCandidate = require('../modules/research/property-candidate');
const dealBoard = require('../modules/research/free-public-deal-board');
const packetService = require('../modules/research/manual-evidence-packet-service');
const leadOperationsState = require('../modules/research/lead-operations-state');
const queueService = require('../modules/research/deal-board-queue-service');
const audit = require('../scripts/cycle-28-venue-contamination-audit');

const SUBJECT = '3808 Kings Dr, Ennis, TX 75119';
const VENUE = '101 W Main St, Waxahachie, TX 75165';
const SOURCE = fixture.source_url;

let networkAttempts = 0;
const originalFetch = global.fetch;
const originalHttpGet = http.get;
const originalHttpRequest = http.request;
const originalHttpsGet = https.get;
const originalHttpsRequest = https.request;
function blockNetwork() {
  networkAttempts += 1;
  throw new Error('Cycle 28 tests must not contact the network');
}
global.fetch = blockNetwork;
http.get = blockNetwork;
http.request = blockNetwork;
https.get = blockNetwork;
https.request = blockNetwork;

try {
  const evidence = propertyAddressEvidence.extractPropertyAddressEvidence(fixture.source_text);
  assert.strictEqual(evidence.subject_address, SUBJECT);
  assert.strictEqual(evidence.sale_venue_address, VENUE);
  assert.strictEqual(dealBoard.completeAddressFromText(fixture.source_text), SUBJECT);
  assert.strictEqual(dealBoard.completeAddressFromText(fixture.venue_line), '');

  const nonPropertyCases = [
    ['Substitute Trustee address:', '10119 Lake Creek Pkwy, Austin, TX 78729'],
    ['The mortgage servicer address is', '3217 S Decker Lake Dr, Salt Lake City, UT 84119'],
    ['Mortgagee address:', '1600 Corporate Ct, Irving, TX 75038'],
    ['Beneficiary address:', '75 Beattie Pl, Greenville, SC 29601']
  ];
  nonPropertyCases.forEach(([label, address]) => {
    const text = `${label} ${address}.`;
    const classified = propertyAddressEvidence.extractPropertyAddressEvidence(text);
    assert.strictEqual(classified.subject_address, '', `${label} is not a subject-property label`);
    assert.strictEqual(classified.sale_venue_address, '', `${label} is not an auction venue`);
    assert.strictEqual(classified.candidates[0].role, 'non_property_address');
    assert.strictEqual(dealBoard.completeAddressFromText(text), '');
    assert.strictEqual(propertyAddressEvidence.isSourceSupportedSubjectAddress({
      normalized_address: address,
      property_identity_source_only: false,
      source_structured_address_verified: true,
      source_proof_text: text
    }), false);
    const rejectedCandidate = propertyCandidate.normalizePropertyCandidate({
      normalized_address: address,
      property_address: address,
      source_structured_address_verified: true,
      source_proof_text: text,
      source_url: SOURCE
    }, {});
    const rejectedCard = propertyCandidate.candidateToFindMeCard({
      normalized_address: address,
      property_address: address,
      source_structured_address_verified: true,
      source_proof_text: text,
      source_url: SOURCE
    }, {});
    assert.strictEqual(rejectedCandidate.normalized_address, '');
    assert.strictEqual(rejectedCard.display_address, '');
    assert.strictEqual(dealBoard.dealFromRecord({
      normalized_address: address,
      source_structured_address_verified: true,
      source_proof_text: text,
      source_url: SOURCE
    }, { market: { city: 'Dallas', county: 'Ellis', state: 'TX' } }).normalized_address, '');
  });

  const trusteeThenProperty = `Substitute Trustee address: 10119 Lake Creek Pkwy, Austin, TX 78729. Property address: 3808 KINGS DR ENNIS, TX 75119.`;
  const trusteeThenPropertyEvidence = propertyAddressEvidence.extractPropertyAddressEvidence(trusteeThenProperty);
  assert.strictEqual(trusteeThenPropertyEvidence.subject_address, SUBJECT);
  assert.strictEqual(trusteeThenPropertyEvidence.candidates[0].role, 'non_property_address');
  assert.strictEqual(dealBoard.completeAddressFromText(trusteeThenProperty), SUBJECT);
  [
    'Place of sale: 101 W Main St, Waxahachie, TX 75165.',
    'The sale occurs on the front steps at 101 W Main St, Waxahachie, TX 75165.',
    'c/o 101 W Main St, Waxahachie, TX 75165.',
    'Return to: 101 W Main St, Waxahachie, TX 75165.'
  ].forEach((text) => assert.strictEqual(dealBoard.completeAddressFromText(text), ''));
  assert.strictEqual(dealBoard.completeAddressFromText('Property Address: 19 16 APACHE ROAD QUINLAN, TEXAS 75474'), '');
  assert.strictEqual(propertyAddressEvidence.isSourceSupportedSubjectAddress({
    normalized_address: SUBJECT,
    property_identity_source_only: true,
    source_structured_address_verified: true
  }), false, 'Source-only identity without evidence fails closed');

  const contaminatedInput = {
    normalized_address: VENUE,
    property_address: VENUE,
    source_structured_address_verified: true,
    property_identity_source_only: true,
    source_family: 'preforeclosure_trustee_notice',
    source_name: fixture.source_name,
    source_url: SOURCE,
    source_document_url: SOURCE,
    source_proof_text: fixture.source_text,
    motivation_evidence_text: fixture.source_text,
    status_evidence_text: 'Notice of trustee sale',
    current_status: 'Posted foreclosure notice',
    last_checked_at: fixture.captured_at
  };
  const candidate = propertyCandidate.normalizePropertyCandidate(contaminatedInput, { city: 'Ennis', state: 'TX' });
  const card = propertyCandidate.candidateToFindMeCard(contaminatedInput, { city: 'Ennis', state: 'TX' });
  assert.strictEqual(candidate.normalized_address, SUBJECT);
  assert.strictEqual(candidate.sale_venue_address, VENUE);
  assert.strictEqual(card.display_address, SUBJECT);
  assert.strictEqual(card.sale_venue_address, VENUE);
  assert.notStrictEqual(card.display_address, card.sale_venue_address);

  const venueOnlyText = fixture.venue_line;
  const venueOnly = Object.assign({}, contaminatedInput, {
    source_proof_text: venueOnlyText,
    motivation_evidence_text: venueOnlyText
  });
  const venueCandidate = propertyCandidate.normalizePropertyCandidate(venueOnly, { city: 'Waxahachie', state: 'TX' });
  const venueCard = propertyCandidate.candidateToFindMeCard(venueOnly, { city: 'Waxahachie', state: 'TX' });
  assert.strictEqual(venueCandidate.normalized_address, '');
  assert.strictEqual(venueCard.display_address, '');
  assert.strictEqual(venueCandidate.sale_venue_address, VENUE);

  const proofRecord = Object.assign({}, contaminatedInput, candidate, {
    normalized_address: SUBJECT,
    source_structured_address_verified: true,
    sale_venue_source_url: SOURCE
  });
  const boardRow = dealBoard.dealFromRecord(proofRecord, { market: { city: 'Dallas', county: 'Ellis', state: 'TX' } });
  assert.strictEqual(boardRow.normalized_address, SUBJECT);
  assert.strictEqual(boardRow.sale_venue_address, VENUE);
  const queueRow = queueService.projectRowForQueue(boardRow, 'ellis|3808-kings', fixture.captured_at);
  assert.strictEqual(queueRow.normalized_address, SUBJECT);
  assert.strictEqual(queueRow.sale_venue_address, VENUE);
  assert.strictEqual(queueRow.source_structured_address_verified, true);
  assert.strictEqual(queueRow.property_identity_source_only, true);

  const ambiguousBoardRow = dealBoard.dealFromRecord(venueCandidate, { market: { city: 'Dallas', county: 'Ellis', state: 'TX' } });
  assert.strictEqual(ambiguousBoardRow.normalized_address, '');
  assert.strictEqual(ambiguousBoardRow.property_identity_source_only, true);
  assert.strictEqual(ambiguousBoardRow.source_structured_address_verified, false);

  const badPacketRow = Object.assign({}, proofRecord, {
    queue_key: 'ellis-bad-venue',
    normalized_address: VENUE,
    source_structured_address_verified: false
  });
  const badSample = packetService.latestManualEvidenceSnapshot({
    market: { city: 'Dallas', county: 'Ellis', state: 'TX' },
    rows: [badPacketRow],
    packet_store: { version: 1, markets: {} }
  }).items[0];
  assert.strictEqual(badSample.address_state, 'partial_address_verify_first');

  const auditResult = audit.buildAudit({ markets: { 'dallas|ellis|tx': { rows: [badPacketRow] } } });
  assert.deepStrictEqual(auditResult.totals, {
    rows_scanned: 1,
    venue_address_as_subject: 1,
    source_property_address_mismatch: 1,
    invalid_complete_source_address_label: 1
  });
  assert.deepStrictEqual(auditResult.markets[0].queue_keys.venue_address_as_subject, ['ellis-bad-venue']);

  const basePhoneRow = {
    normalized_address: SUBJECT,
    property_identity_source_only: true,
    source_structured_address_verified: true,
    owner_record: {
      owner_name: 'JANE SAMPLE',
      source_url: SOURCE,
      evidence_text: 'Owner of record: JANE SAMPLE'
    },
    lifecycle_status: { status: 'FRESH', quarantined: false },
    verified_sold_comp_count: 0,
    free_contact_routes: []
  };
  function phonePacket(overrides) {
    return { evidence_items: [{
      evidence_type: 'skip_trace', screenshot_id: 'shot-phone', source_name: 'Public background-check page',
      captured_at: fixture.captured_at, operator_confirmed: true,
      fields: Object.assign({
        normalized_address: SUBJECT,
        owner_name: 'JANE SAMPLE',
        contact_value: '(214) 555-0100',
        contact_route_kind: 'phone',
        contact_classification: 'possible_owner_contact',
        seller_owner_confirmed: true,
        source_url: 'https://example.org/public-record/3808-kings'
      }, overrides || {})
    }] };
  }
  const acceptedPhone = packetService.evaluatePacket(phonePacket(), basePhoneRow, { today_iso: '2026-09-12' });
  assert.strictEqual(acceptedPhone.contact_routes_accepted.length, 1);
  assert.strictEqual(acceptedPhone.projected_row_state, 'CALL_READY');
  assert.strictEqual(packetService.evaluatePacket(phonePacket({ owner_name: 'OTHER PERSON' }), basePhoneRow, { today_iso: '2026-09-12' }).contact_routes_accepted.length, 0);
  assert.strictEqual(packetService.evaluatePacket(phonePacket({ normalized_address: VENUE }), basePhoneRow, { today_iso: '2026-09-12' }).contact_routes_accepted.length, 0);
  assert.strictEqual(packetService.evaluatePacket(phonePacket({ source_url: '' }), basePhoneRow, { today_iso: '2026-09-12' }).contact_routes_accepted.length, 0);
  const missingTimestamp = phonePacket();
  missingTimestamp.evidence_items[0].captured_at = '';
  assert.strictEqual(packetService.evaluatePacket(missingTimestamp, basePhoneRow, { today_iso: '2026-09-12' }).contact_routes_accepted.length, 0);

  const stalePhone = packetService.evaluatePacket(phonePacket(), Object.assign({}, basePhoneRow, {
    lifecycle_status: { status: 'DATE_UNKNOWN_REVERIFY', quarantined: true, reason_text: 'Current event date is unknown.' }
  }), { today_iso: '2026-09-12' });
  assert.strictEqual(stalePhone.projected_row_state, 'LOCKED');

  const institutionalRoles = ['trustee', 'attorney', 'servicer', 'lender', 'escrow', 'auction company', 'registered agent', 'county clerk'];
  institutionalRoles.forEach((role) => {
    const route = Object.assign({}, acceptedPhone.contact_routes_accepted[0], {
      evidence_text: `${role} phone from official notice`,
      route_type: 'owner_phone'
    });
    const state = leadOperationsState.rowStateForDeal(Object.assign({}, basePhoneRow, { free_contact_routes: [route] }));
    assert.notStrictEqual(state.row_state, 'CALL_READY', `${role} must remain research-only`);
  });
  assert.strictEqual(networkAttempts, 0);
  console.log('Cycle 28 property identity and seller-phone gates passed.');
} finally {
  global.fetch = originalFetch;
  http.get = originalHttpGet;
  http.request = originalHttpRequest;
  https.get = originalHttpsGet;
  https.request = originalHttpsRequest;
}
