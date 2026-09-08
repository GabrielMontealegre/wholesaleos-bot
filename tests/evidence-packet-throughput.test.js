'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const fixtures = require('./fixtures/cycle-18-notices.json');
const extractor = require('../modules/research/tx-trustee-notice-text-extractor');
const profile = require('../modules/sources/tx-county-foreclosure-source-profiles').PROFILES.find((p) => p.county === 'Hunt');
const candidate = require('../modules/research/property-candidate');
const boardFile = path.resolve(__dirname, '../modules/research/free-public-deal-board.js');
const observed = new Module(boardFile, module);
observed.filename = boardFile; observed.paths = Module._nodeModulePaths(path.dirname(boardFile));
observed._compile(fs.readFileSync(boardFile, 'utf8') + '\nmodule.exports.observedCandidateRecord = candidateRecord; module.exports.observedCardRecord = cardRecord;', boardFile);
const board = observed.exports;
const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };

function rows(number) {
  const doc = fixtures.documents.find((d) => d.url.includes(`foreclosure-${number}.pdf`));
  assert(doc, `Real fixture ${number} exists`);
  return extractor.extractTrusteeNoticeRows(doc.text, profile, { source_url: profile.source_url, source_proof_url: doc.url });
}
function pipeline(raw) {
  const normalized = candidate.normalizePropertyCandidate({ ...raw, source_family: 'preforeclosure_trustee_notice', motivation_evidence_text: raw.source_proof_text }, { city: '', state: 'TX' });
  const direct = board.dealFromRecord(board.observedCandidateRecord(normalized, profile), { market });
  const card = candidate.candidateToFindMeCard(normalized, { city: '', state: 'TX' });
  const rendered = board.dealFromRecord(board.observedCardRecord(card, profile), { market });
  assert.strictEqual(rendered.normalized_address, direct.normalized_address, 'Card and candidate paths preserve the same property identity');
  return direct;
}

const flamingo = rows('07').filter((r) => /6407 FLAMINGO/i.test(r.address));
assert(flamingo.length > 0);
assert(flamingo.some((r) => pipeline(r).normalized_address === '6407 Flamingo Rd, Greenville, TX 75402'));
for (const raw of flamingo) assert(!/2507 Lee/i.test(pipeline(raw).normalized_address), 'Courthouse never replaces property');
const ocrReview = pipeline({ ...flamingo[0], normalized_address: '', source_structured_address_verified: false, property_identity_source_only: true, risk_flags: ['OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED'], extraction_method: 'ocr_trustee_notice_extraction', ocr_confidence: 99 });
assert.strictEqual(ocrReview.normalized_address, '');
assert(!ocrReview.maps_url, 'OCR cannot acquire a precise maps URL');
assert.notStrictEqual(ocrReview.quality_bucket, 'INSPECT_NOW');
assert.strictEqual(pipeline(rows('10')[0]).normalized_address, '1929 Stanford St, Greenville, TX 75401');
assert.strictEqual(pipeline(rows('17')[0]).normalized_address, '1430 Thibodaux Dr, Greenville, TX 75402');
assert.strictEqual(rows('18').some((r) => /10119 Lake Creek/i.test(r.address)), false, 'Trustee office is not the property');
for (const raw of rows('03')) assert.strictEqual(pipeline(raw).normalized_address, '', 'Split number remains incomplete');
const incomplete = { normalized_address: '', property_address: '5554 Agalinis Ave, Royse City, TX', property_identity_source_only: true, source_proof_text: 'Property Address: 5554 Agalinis Ave, Royse City, TX | Courthouse 2507 Lee Street, Greenville, TX 75401', source_url: profile.source_url };
assert.strictEqual(pipeline(incomplete).normalized_address, '');
assert.strictEqual(board.dealFromRecord({ normalized_address: '100 Sample St, Detroit, MI 48201' }, { market: { city: 'Detroit', county: 'Wayne', state: 'MI' } }).normalized_address, '100 Sample St, Detroit, MI 48201');

const service = require('../modules/research/manual-evidence-packet-service');
const subject = { normalized_address: '100 Synthetic St, Dallas, TX 75201', owner_clue: 'SYNTHETIC TEST PERSON', verified_sold_comp_count: 99, sale_date_iso: '2001-01-01', preview_only: true, not_a_saved_lead: true };
const original = JSON.stringify(subject);
const unavailable = service.evaluatePacket({}, subject, { today_iso: '2026-09-07' });
assert.strictEqual(unavailable.readiness.can_contact.status, 'NO');
assert.strictEqual(unavailable.readiness.can_value.status, 'NO', 'A count without comp evidence cannot imply valuation readiness');
assert.strictEqual(unavailable.readiness.ready_to_offer.status, 'NO');
assert.strictEqual(unavailable.readiness.event_status.status, 'SALE_PASSED');
assert.strictEqual(JSON.stringify(subject), original);
const callable = { ...subject, free_contact_routes: [{ route_kind: 'phone', value: '202-555-0100', source_kind: 'public_source_document', source_url: 'https://county.example.gov/synthetic', evidence_text: 'SYNTHETIC TEST route to test contact availability.' }] };
const ready = service.evaluatePacket({}, callable, { today_iso: '2026-09-07' }).readiness;
assert.strictEqual(ready.can_contact.status, 'YES');
assert.strictEqual(ready.can_value.status, 'NO');
assert.strictEqual(ready.ready_to_offer.status, 'NO', 'Contactable is not ready to offer');
const invalidated = { ...callable, contact_workflow_invalidated_routes: [{ value: '202-555-0100' }] };
assert.strictEqual(service.evaluatePacket({}, invalidated).readiness.can_contact.status, 'NO');
const closed = service.evaluatePacket({}, { ...callable, contact_workflow_outcome: 'not_interested' }).readiness;
assert.strictEqual(closed.ready_to_offer.status, 'NO');
assert(closed.ready_to_offer.reason.includes('closed'));
const ui = fs.readFileSync(path.resolve(__dirname, '../dashboard/wos-public-deals.js'), 'utf8');
for (const label of ['Can contact', 'Can value', 'Ready to offer', 'Source event date:', 'Last checked:']) assert(ui.includes(label));
console.log('evidence packet throughput: real source identity, unrelated-address exclusion, independent readiness and immutability passed');
