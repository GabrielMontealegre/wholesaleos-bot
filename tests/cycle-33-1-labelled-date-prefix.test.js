'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cycle-33-ellis-notice.json'), 'utf8'));
const propertyAddressEvidence = require('../modules/research/property-address-evidence');
const recovery = require('../modules/research/source-evidence-recovery');

const NOW = '2026-09-18T18:00:00.000Z';
const SUBJECT = '3808 Kings Dr, Ennis, TX 75119';
const VENUE = '101 W Main St, Waxahachie, TX 75165';

function storedRow(sourceText, overrides) {
  return Object.assign({
    queue_key: 'cycle-33-1-ellis',
    normalized_address: VENUE,
    source_proof_text: sourceText,
    motivation_evidence_text: '',
    status_evidence_text: '',
    source_document_url: fixture.source_url,
    source_url: fixture.source_url,
    property_identity_source_only: true,
    source_structured_address_verified: true,
    preview_only: true,
    not_a_saved_lead: true
  }, overrides || {});
}

function recover(sourceText, overrides) {
  return recovery.recoverRow(storedRow(sourceText, overrides), { now_iso: NOW });
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
  throw new Error('cycle_33_1_network_forbidden');
}
global.fetch = rejectNetwork;
http.get = rejectNetwork;
http.request = rejectNetwork;
https.get = rejectNetwork;
https.request = rejectNetwork;

try {
  const observed = [
    ['bare_year', '2023'],
    ['month_day_year', 'June 29,2023']
  ];
  for (const [key, skippedDatePrefix] of observed) {
    const result = recover(fixture.date_prefixed_source_texts[key]);
    assert.strictEqual(result.row.normalized_address, SUBJECT);
    assert.strictEqual(result.row.sale_venue_address, VENUE);
    assert.strictEqual(result.row.source_structured_address_verified, true);
    assert.strictEqual(propertyAddressEvidence.isSourceSupportedSubjectAddress(result.row), true);
    assert.strictEqual(result.row.subject_address_recovery.skipped_date_prefix, skippedDatePrefix);
    assert.strictEqual(result.row.subject_address_recovery.recovered_from_field, 'source_proof_text');
    assert.strictEqual(result.row.subject_address_recovery.previous_value_role, 'sale_venue');
    assert.strictEqual(result.row.subject_address_recovery.recovered_at, NOW);
    assert.ok(fixture.date_prefixed_source_texts[key].includes(result.row.subject_address_recovery.recovered_phrase));
    assert.strictEqual(result.row.sale_date_or_event_date || '', '');
    assert.strictEqual(result.row.notice_date || '', '');
    assert.strictEqual(result.row.filing_date || '', '');
    assert.strictEqual(result.row.source_published_at || '', '');
    assert.strictEqual(result.recovered_money_facts.length, 0);
  }

  for (const prefix of ['06/29/2023', '2023-06-29', 'June 29 2023']) {
    const result = recover(`${fixture.venue_line} Property Address: ${prefix} 3808 KINGS DR ENNIS, TX 75119`);
    assert.strictEqual(result.row.normalized_address, SUBJECT);
    assert.strictEqual(result.row.subject_address_recovery.skipped_date_prefix, prefix);
  }

  const reversed = recover('Property Address: 2023 3808 KINGS DR ENNIS, TX 75119. The sale will be conducted at the Ellis County Courthouse, 101 W. Main Street, Waxahachie, TX 75165.');
  assert.strictEqual(reversed.row.normalized_address, SUBJECT);
  assert.strictEqual(reversed.row.sale_venue_address, VENUE);

  const excludedLabels = [
    'Trustee address:',
    'Mortgage servicer address:',
    'Mortgagee address:',
    'Law office c/o:',
    'Return to:',
    'Mail to:'
  ];
  for (const label of excludedLabels) {
    const result = recover(`${label} Property Address: 2023 3808 KINGS DR ENNIS, TX 75119`, { normalized_address: '' });
    assert.strictEqual(result.row.normalized_address, '', `${label} must keep the non-property guard`);
    assert.strictEqual(result.subject_address_recovery.recovered, false);
  }

  const incompleteCases = [
    'Property Address: 2023 3808 KINGS DR ENNIS, TX',
    'Property Address: 2023 3808 KINGS DR TX 75119',
    'Property Address: 2023 3808 KINGS ENNIS, TX 75119'
  ];
  for (const source of incompleteCases) {
    const result = recover(source, { normalized_address: '' });
    assert.strictEqual(result.row.normalized_address, '');
    assert.strictEqual(result.subject_address_recovery.reason_code, 'labelled_date_prefix_address_incomplete');
  }

  const intervening = recover('Property Address: 2023 Case 123 3808 KINGS DR ENNIS, TX 75119', { normalized_address: '' });
  assert.strictEqual(intervening.row.normalized_address, '');
  assert.strictEqual(intervening.subject_address_recovery.recovered, false);

  const invalidPrefixes = [
    '13/45/2023',
    '02/30/2023',
    'Jun 29 2023',
    '123'
  ];
  for (const prefix of invalidPrefixes) {
    const result = recover(`Property Address: ${prefix} 3808 KINGS DR ENNIS, TX 75119`, { normalized_address: '' });
    assert.strictEqual(result.row.normalized_address, '');
    assert.strictEqual(result.subject_address_recovery.reason_code, 'labelled_date_prefix_invalid');
    assert.notStrictEqual(result.subject_address_recovery.reason_code, 'subject_candidate_missing_or_truncated');
  }

  const multiple = recover('Property Address: 2023 3808 KINGS DR ENNIS, TX 75119. Subject property: 2023 100 FIRST ST DALLAS, TX 75201.', { normalized_address: '' });
  assert.strictEqual(multiple.row.normalized_address, '');
  assert.strictEqual(multiple.subject_address_recovery.reason_code, 'multiple_subject_candidates');

  const alreadyCorrect = recover(fixture.date_prefixed_source_texts.bare_year, { normalized_address: SUBJECT });
  assert.strictEqual(alreadyCorrect.row.normalized_address, SUBJECT);
  assert.strictEqual(alreadyCorrect.subject_address_recovery.reason_code, 'current_address_subject_supported');
  assert.strictEqual(alreadyCorrect.row.subject_address_recovery, undefined);

  const originalExtractor = propertyAddressEvidence.extractPropertyAddressEvidence;
  propertyAddressEvidence.extractPropertyAddressEvidence = () => ({
    candidates: [{
      address: SUBJECT,
      raw_address: '3808 KINGS DR ENNIS, TX 75119',
      recovered_phrase: 'Property Address: 2023 3808 KINGS DR ENNIS, TX 75119',
      role: 'subject_property'
    }],
    date_prefix_rejections: []
  });
  try {
    const notVerbatim = recover('Property Address: 2023 9999 OTHER DR ENNIS, TX 75119', { normalized_address: '' });
    assert.strictEqual(notVerbatim.row.normalized_address, '');
    assert.strictEqual(notVerbatim.subject_address_recovery.reason_code, 'subject_candidate_not_verbatim');
  } finally {
    propertyAddressEvidence.extractPropertyAddressEvidence = originalExtractor;
  }

  const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
  assert.ok(dashboardSource.includes('a date fragment appeared between the property label and address'));
  assert.strictEqual(networkCalls, 0);
  console.log('Cycle 33.1 labelled date-prefix recovery tests passed.');
} finally {
  global.fetch = original.fetch;
  http.get = original.httpGet;
  http.request = original.httpRequest;
  https.get = original.httpsGet;
  https.request = original.httpsRequest;
}
