'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-call-packet-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));
fs.writeFileSync(process.env.FINDME_SCOUT_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, JSON.stringify({ version: 1, dossiers: [] }, null, 2));

const callReadyPacket = require('../modules/research/call-ready-deal-packet');

const sourceUrl = 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345';

function baseCandidate(overrides = {}) {
  return Object.assign({
    candidate_id: 'pcd_call_ready',
    source_id: 'tx_dallas_fsbo_contact_first',
    source_family: 'fsbo',
    source_name: 'Dallas FSBO',
    source_url: sourceUrl,
    source_classification: 'exact_property_record',
    normalized_address: '123 Main St, Dallas, TX 75208',
    motivation_type: 'FSBO',
    motivation_phrase: 'For sale by owner - cash only.',
    motivation_evidence_text: 'For sale by owner - cash only.',
    source_proof_text: 'For sale by owner - cash only. Active listing. Call owner at (214) 555-0123.',
    current_status: 'active',
    status_evidence_text: 'active',
    status_verified_visible: true,
    contact_route: 'Direct Phone',
    contact_phone: '(214) 555-0123',
    contact_source_url: sourceUrl,
    contact_evidence_text: 'Call owner at (214) 555-0123.',
    contact_verification_status: 'verified_visible_source',
    contact_verified: true,
    asking_price: '$165,000',
    beds: '3',
    baths: '2',
    sqft: '1450',
    year_built: '1958'
  }, overrides);
}

function soldComp(number, price, date = '2026-05-15') {
  return {
    comp_address: `${number} Oak St, Dallas, TX 75208`,
    sold_status: 'sold',
    sold_price: price,
    sold_date: date,
    source_url: `https://www.realtor.com/realestateandhomes-detail/${number}-Oak-St_Dallas_TX_75208_M${number}`,
    source_title: `${number} Oak St sold`,
    source_type: 'realtor sold property page'
  };
}

const callReady = callReadyPacket.buildCallReadyDealPacket(baseCandidate());
assert.strictEqual(callReady.packet_status, callReadyPacket.PACKET_STATUSES.CALL_READY);
assert.strictEqual(callReady.contact.route_type, 'DIRECT_PHONE');
assert.strictEqual(callReady.contact.call_allowed, true);
assert.strictEqual(callReady.contact.phone, '(214) 555-0123');
assert.ok(callReady.lock_states.includes(callReadyPacket.LOCK_STATES.CALL_ALLOWED_WITH_MISSING_COMPS));
assert.ok(callReady.lock_states.includes(callReadyPacket.LOCK_STATES.ARV_LOCKED_NO_VERIFIED_COMPS));
assert.ok(callReady.lock_states.includes(callReadyPacket.LOCK_STATES.COMP_REQUIRED_BEFORE_OFFER));
assert.strictEqual(callReady.arv.range, null);
assert.strictEqual(callReady.mao.range, null);
assert.strictEqual(callReady.offer_recommendation.maximum_contract_price_range, null);
assert.strictEqual(callReady.questions_to_ask_seller.length, 5);
assert.ok(callReady.call_script.why_calling.includes('For sale by owner - cash only.'));
assert.strictEqual(callReady.preview_only, true);
assert.strictEqual(callReady.should_ingest, false);
assert.strictEqual(callReady.no_global_mutation, true);

const unprovenPhone = callReadyPacket.buildCallReadyDealPacket(baseCandidate({
  contact_evidence_text: '',
  contact_verified: false,
  contact_verification_status: 'unverified'
}));
assert.strictEqual(unprovenPhone.packet_status, callReadyPacket.PACKET_STATUSES.CONTACT_LOOKUP);
assert.strictEqual(unprovenPhone.contact.route_type, 'NONE');
assert.strictEqual(unprovenPhone.contact.phone, '');
assert.ok(unprovenPhone.lock_states.includes(callReadyPacket.LOCK_STATES.CALL_LOCKED_NO_CONTACT));
assert.ok(unprovenPhone.lock_states.includes(callReadyPacket.LOCK_STATES.OFFER_LOCKED_NO_CONTACT));

const emailOutreach = callReadyPacket.buildCallReadyDealPacket(baseCandidate({
  contact_route: 'Direct Email',
  contact_phone: '',
  contact_email: 'seller@example.com',
  contact_evidence_text: 'Email seller@example.com for property details.'
}));
assert.strictEqual(emailOutreach.packet_status, callReadyPacket.PACKET_STATUSES.OUTREACH_READY);
assert.strictEqual(emailOutreach.contact.route_type, 'DIRECT_EMAIL');
assert.strictEqual(emailOutreach.contact.call_allowed, false);
assert.strictEqual(emailOutreach.contact.outreach_allowed, true);
assert.ok(emailOutreach.lock_states.includes(callReadyPacket.LOCK_STATES.CALL_LOCKED_NO_CONTACT));

const craigslistUrl = 'https://dallas.craigslist.org/dal/reo/d/dallas-as-is-owner-property/7918000002.html';
const craigslistOutreach = callReadyPacket.buildCallReadyDealPacket(baseCandidate({
  source_id: 'tx_dallas_craigslist_owner_posts',
  source_family: 'craigslist_owner_fsbo',
  source_name: 'Dallas Craigslist owner real-estate posts',
  source_url: craigslistUrl,
  source_classification: 'exact_property_record',
  contact_route: 'Public Reply',
  contact_phone: '',
  contact_email: '',
  contact_source_url: 'https://dallas.craigslist.org/reply/dal/reo/7918000002/__SERVICE_ID__',
  contact_evidence_text: 'Public reply link visible on Craigslist property post.'
}));
assert.strictEqual(craigslistOutreach.packet_status, callReadyPacket.PACKET_STATUSES.OUTREACH_READY);
assert.strictEqual(craigslistOutreach.source_evidence.property_specific, true);
assert.strictEqual(craigslistOutreach.source_evidence.identity_ready, true);
assert.strictEqual(craigslistOutreach.source_evidence.source_ready, true);

const craigslistIncompleteIdentity = callReadyPacket.buildCallReadyDealPacket(baseCandidate({
  source_id: 'tx_dallas_craigslist_owner_posts',
  source_family: 'craigslist_owner_fsbo',
  source_name: 'Dallas Craigslist owner real-estate posts',
  source_url: craigslistUrl,
  source_classification: 'exact_property_record',
  normalized_address: '',
  contact_route: 'Public Reply',
  contact_phone: '',
  contact_email: '',
  contact_source_url: 'https://dallas.craigslist.org/reply/dal/reo/7918000002/__SERVICE_ID__',
  contact_evidence_text: 'Public reply link visible on Craigslist property post.'
}));
assert.strictEqual(craigslistIncompleteIdentity.packet_status, callReadyPacket.PACKET_STATUSES.RESEARCH_ONLY);
assert.strictEqual(craigslistIncompleteIdentity.source_evidence.property_specific, true);
assert.strictEqual(craigslistIncompleteIdentity.source_evidence.identity_ready, false);
assert.strictEqual(craigslistIncompleteIdentity.source_evidence.source_ready, false);
assert.ok(craigslistIncompleteIdentity.risk_flags.includes('PROPERTY_IDENTITY_INCOMPLETE'));
assert.ok(!craigslistIncompleteIdentity.risk_flags.includes('SOURCE_PROOF_INCOMPLETE'));

const subjectComp = {
  comp_address: '123 Main St, Dallas, TX 75208',
  sold_status: 'sold',
  sold_price: 150000,
  sold_date: '2026-04-01',
  source_url: sourceUrl,
  source_title: 'Subject property sold history'
};
const subjectExcluded = callReadyPacket.buildCallReadyDealPacket(baseCandidate({
  verified_sold_comps: [subjectComp, soldComp(101, 220000), soldComp(102, 230000)],
  repair_estimate: 30000
}));
assert.strictEqual(subjectExcluded.comps.verified_count, 2);
assert.strictEqual(subjectExcluded.comps.subject_sale_evidence.length, 1);
assert.strictEqual(subjectExcluded.arv.range, null);
assert.strictEqual(subjectExcluded.mao.range, null);

const valued = callReadyPacket.buildCallReadyDealPacket(baseCandidate({
  verified_sold_comps: [soldComp(101, 220000), soldComp(102, 230000), soldComp(103, 240000)],
  repair_estimate: 30000
}));
assert.strictEqual(valued.comps.verified_count, 3);
assert.strictEqual(valued.arv.status, 'PRELIMINARY_ARV_AVAILABLE');
assert.ok(valued.arv.range);
assert.strictEqual(valued.repairs.amount, 30000);
assert.strictEqual(valued.mao.status, 'DRAFT_MAO_AVAILABLE');
assert.ok(valued.mao.range);
assert.strictEqual(valued.offer_recommendation.status, 'REVIEW_REQUIRED');
assert.ok(valued.offer_recommendation.maximum_contract_price_range);

const noRepair = callReadyPacket.buildCallReadyDealPacket(baseCandidate({
  verified_sold_comps: [soldComp(101, 220000), soldComp(102, 230000), soldComp(103, 240000)]
}));
assert.ok(noRepair.arv.range);
assert.strictEqual(noRepair.mao.range, null);
assert.strictEqual(noRepair.offer_recommendation.maximum_contract_price_range, null);
assert.ok(noRepair.lock_states.includes(callReadyPacket.LOCK_STATES.MAO_LOCKED_NO_REPAIR_EVIDENCE));

const genericSource = callReadyPacket.buildCallReadyDealPacket(baseCandidate({
  source_url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX',
  source_classification: 'exact_property_record',
  contact_source_url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX'
}));
assert.strictEqual(genericSource.packet_status, callReadyPacket.PACKET_STATUSES.RESEARCH_ONLY);
assert.strictEqual(genericSource.source_evidence.property_specific, false);
assert.strictEqual(genericSource.source_evidence.identity_ready, true);
assert.strictEqual(genericSource.source_evidence.source_ready, false);
assert.strictEqual(genericSource.offer_recommendation.maximum_contract_price_range, null);

assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads, []);
assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')).dossiers, []);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('call-ready deal packet tests passed');
