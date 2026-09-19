'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cycle-33-ellis-notice.json'), 'utf8'));
const recovery = require('../modules/research/source-evidence-recovery');
const propertyAddressEvidence = require('../modules/research/property-address-evidence');
const packetService = require('../modules/research/manual-evidence-packet-service');
const audit = require('../scripts/cycle-33-subject-address-audit');

const NOW = '2026-09-18T18:00:00.000Z';
const SUBJECT = '3808 Kings Dr, Ennis, TX 75119';
const VENUE = '101 W Main St, Waxahachie, TX 75165';

function storedRow(overrides) {
  return Object.assign({
    queue_key: 'ellis-stored-before-cycle-28',
    normalized_address: VENUE,
    source_proof_text: fixture.source_text,
    motivation_evidence_text: fixture.source_text,
    status_evidence_text: 'Notice of trustee sale',
    source_document_url: fixture.source_url,
    source_url: fixture.source_url,
    property_identity_source_only: true,
    source_structured_address_verified: true,
    preview_only: true,
    not_a_saved_lead: true
  }, overrides || {});
}

let networkCalls = 0;
const original = {
  fetch: global.fetch,
  httpGet: http.get,
  httpRequest: http.request,
  httpsGet: https.get,
  httpsRequest: https.request
};
function rejectNetwork() {
  networkCalls += 1;
  throw new Error('cycle_33_network_forbidden');
}
global.fetch = rejectNetwork;
http.get = rejectNetwork;
http.request = rejectNetwork;
https.get = rejectNetwork;
https.request = rejectNetwork;

try {
  const repaired = recovery.recoverRow(storedRow(), { now_iso: NOW });
  assert.strictEqual(repaired.row.normalized_address, SUBJECT);
  assert.strictEqual(repaired.row.sale_venue_address, VENUE);
  assert.notStrictEqual(repaired.row.normalized_address, repaired.row.sale_venue_address);
  assert.strictEqual(repaired.row.source_structured_address_verified, true);
  assert.strictEqual(repaired.row.property_identity_source_only, true);
  assert.strictEqual(propertyAddressEvidence.isSourceSupportedSubjectAddress(repaired.row), true);
  assert.strictEqual(repaired.subject_address_recovery.reason_code, 'subject_address_recovered_from_stored_evidence');

  const provenance = repaired.row.subject_address_recovery;
  assert.deepStrictEqual(Object.keys(provenance).sort(), [
    'previous_value_role', 'recovered_at', 'recovered_from_field', 'recovered_phrase'
  ]);
  assert.strictEqual(provenance.previous_value_role, 'sale_venue');
  assert.strictEqual(provenance.recovered_at, NOW);
  assert.ok(fixture.source_text.includes(provenance.recovered_phrase));
  assert.strictEqual(provenance.recovered_phrase, '3808 KINGS DR ENNIS, TX 75119');

  const packet = packetService.latestManualEvidenceSnapshot({
    market: { city: 'Dallas', county: 'Ellis', state: 'TX' },
    rows: [repaired.row],
    packet_store: { version: 1, markets: {} }
  });
  assert.strictEqual(packet.items[0].address, SUBJECT);
  assert.strictEqual(packet.items[0].address_state, 'complete_source_address');
  assert.strictEqual(packet.items[0].sale_venue_address, VENUE);
  assert.strictEqual(packet.items[0].subject_address_recovery.recovered_phrase, provenance.recovered_phrase);

  const alreadyCorrect = storedRow({ normalized_address: SUBJECT });
  const alreadyCorrectResult = recovery.recoverRow(alreadyCorrect, { now_iso: NOW });
  assert.strictEqual(alreadyCorrectResult.row.normalized_address, SUBJECT);
  assert.strictEqual(alreadyCorrectResult.subject_address_recovery.reason_code, 'current_address_subject_supported');
  assert.strictEqual(alreadyCorrectResult.row.subject_address_recovery, undefined);

  const excludedLabels = [
    ['Substitute Trustee address:', '10119 Lake Creek Pkwy, Austin, TX 78729'],
    ['Mortgage servicer address:', '3217 S Decker Lake Dr, Salt Lake City, UT 84119'],
    ['Mortgagee lender address:', '1600 Corporate Ct, Irving, TX 75038'],
    ['Law office c/o:', '16415 Addison Rd, Addison, TX 75001'],
    ['Return to:', '400 Records Blvd, Dallas, TX 75201'],
    ['Mailing address:', '500 Mailer St, Dallas, TX 75202']
  ];
  excludedLabels.forEach(([label, address]) => {
    const result = recovery.recoverRow(storedRow({
      normalized_address: '',
      source_proof_text: `${label} ${address}.`,
      motivation_evidence_text: '',
      status_evidence_text: ''
    }), { now_iso: NOW });
    assert.strictEqual(result.row.normalized_address, '', `${label} must never become the subject`);
    assert.strictEqual(result.subject_address_recovery.recovered, false);
  });

  const unlabeled = recovery.recoverRow(storedRow({
    normalized_address: '',
    source_proof_text: 'The notice references 100 Plain St, Dallas, TX 75201.',
    motivation_evidence_text: '',
    status_evidence_text: ''
  }), { now_iso: NOW });
  assert.strictEqual(unlabeled.subject_address_recovery.reason_code, 'subject_candidate_unlabeled_only');
  assert.strictEqual(unlabeled.row.normalized_address, '');

  const multiple = recovery.recoverRow(storedRow({
    normalized_address: '',
    source_proof_text: 'Property address: 100 First St, Dallas, TX 75201. Subject property: 200 Second St, Dallas, TX 75202.',
    motivation_evidence_text: '',
    status_evidence_text: ''
  }), { now_iso: NOW });
  assert.strictEqual(multiple.subject_address_recovery.reason_code, 'multiple_subject_candidates');
  assert.strictEqual(multiple.row.normalized_address, '');

  const empty = recovery.recoverRow(storedRow({ normalized_address: '', source_proof_text: '', motivation_evidence_text: '', status_evidence_text: '' }), { now_iso: NOW });
  assert.strictEqual(empty.subject_address_recovery.reason_code, 'source_evidence_missing');
  const truncated = recovery.recoverRow(storedRow({ normalized_address: '', source_proof_text: 'Property address: 3808 KINGS', motivation_evidence_text: '', status_evidence_text: '' }), { now_iso: NOW });
  assert.strictEqual(truncated.subject_address_recovery.reason_code, 'subject_candidate_missing_or_truncated');

  const auditInput = { markets: { 'dallas|ellis|tx': { rows: [storedRow(), alreadyCorrect, unlabeled.row] } } };
  const beforeAudit = JSON.stringify(auditInput);
  const auditResult = audit.buildAudit(auditInput, { now_iso: NOW });
  assert.strictEqual(JSON.stringify(auditInput), beforeAudit, 'audit must not mutate the snapshot');
  assert.strictEqual(auditResult.production_contacted, false);
  assert.deepStrictEqual(auditResult.totals, {
    total_rows: 3,
    normalized_address_is_venue_or_non_property: 1,
    repairable_rows: 1,
    not_repairable_reason_counts: {
      current_address_subject_supported: 1,
      subject_candidate_unlabeled_only: 1
    },
    newly_complete_source_address: 1
  });

  const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
  assert.ok(dashboardSource.includes('Heading corrected from the source document:'));
  assert.ok(dashboardSource.includes('sale venue was shown as the property'));

  assert.strictEqual(networkCalls, 0);
  console.log('Cycle 33 stored subject-address recovery tests passed.');
} finally {
  global.fetch = original.fetch;
  http.get = original.httpGet;
  http.request = original.httpRequest;
  https.get = original.httpsGet;
  https.request = original.httpsRequest;
}
