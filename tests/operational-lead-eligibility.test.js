'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const policy = require('../modules/research/operational-lead-eligibility');
const ui = require('../dashboard/wos-operational-views');
const row = { id: 'TEST-property', address: '100 Test St, Example City, TX 75001', city: 'Example City', state: 'TX',
  source_url: 'https://county.example.gov/notices/TEST.pdf', source_kind: 'official_public_record',
  source_structured_address_verified: true, source_proof_text: 'Property address: 100 Test St, Example City, TX 75001.',
  owner_clue: 'Fixture Owner', status: 'New Lead', arv: 200000, offer: 100000,
  free_contact_routes: [{ route_kind: 'owner_phone', route_type: 'owner', value: '5550101234', source_kind: 'official_public_record',
    source_url: 'https://county.example.gov/property/TEST', evidence_text: 'Owner of record phone: 5550101234' }] };
const before = JSON.stringify(row);
assert.strictEqual(policy.classify(row).lane, 'working');
assert.strictEqual(policy.classify(row).callable, true);
assert.strictEqual(policy.classify({ ...row, phone: '9999999999' }).proven_phone, '5550101234');
for (const change of [
  { address: 'TOP HEADLINES FROM THE BOARD' }, { address: 'FIND A VOTE CENTER' }, { address: 'CITIES DETENTION CENTER' },
  { source_structured_address_verified: false }, { source_proof_text: '' }, { source_kind: 'ai_generated' },
  { source_url: 'https://county.example.gov/' }, { source_proof_text: 'Place of sale: 100 Test St, Example City, TX 75001.' },
  { property_address_origin: 'mailing_address' }, { risk_flags: ['OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED'] },
  { risk_flags: {} }, { operational_eligibility: { lane: 'working', callable: true }, source_proof_text: '' }
]) assert.strictEqual(policy.classify({ ...row, ...change }).lane, 'needs_address_proof');
const conflict = { ...row, redfin_url: 'https://www.redfin.com/TX/Other-City/101-Test-St-75002/home/123' };
assert.strictEqual(policy.classify(conflict).source_conflict, true);
assert.strictEqual(policy.classify(conflict).callable, false);
for (const change of [{ free_contact_routes: [] }, { do_not_call: true }, { do_not_contact: true }, { owner_type: 'bank' },
  { contact_workflow_outcome: 'not_interested' }, { contact_workflow_invalidated_routes: [{ value: '5550101234' }] },
  { free_contact_routes: [{ ...row.free_contact_routes[0], value: 'not a phone' }] },
  { free_contact_routes: [{ ...row.free_contact_routes[0], evidence_text: 'No telephone provided' }] }
]) assert.strictEqual(policy.classify({ ...row, ...change }).callable, false);
const buyer = { id: 'TEST-buyer', name: 'Fixture Investor', verified: true, verified_by: 'fixture-admin', verified_at: '2026-10-06T12:00:00Z',
  source_url: 'https://company.example.test/buy-box', states: ['TX'], buyTypes: ['SFR'], maxPrice: 150000 };
assert.strictEqual(policy.matchEligible(row,buyer),true);
assert.strictEqual(policy.matchEligible({ ...row, arv: 0 },buyer),false);
assert.strictEqual(policy.matchEligible(row,{ ...buyer, name: 'Test Buyer 1' }),false);
assert.strictEqual(policy.matchEligible(row,{ ...buyer, verified_by: '' }),false);
assert.strictEqual(policy.matchEligible(conflict,buyer),false);
assert.ok(policy.matchReasons({ ...row, type: 'SFR' },buyer).length);
assert.deepStrictEqual(policy.matchReasons({ ...row, state: 'FL', type: 'SFR' },buyer),[]);
assert.deepStrictEqual(policy.counts([row, conflict, { ...row, address: 'TOP HEADLINES' }]),
  { total_saved: 3, working: 1, needs_address_proof: 1, source_conflict: 1, archived: 0, callable: 1 });
assert.strictEqual(policy.saleDateForSort({ sale_date_or_event_date: 'October 6, 2026', sale_date_origin: 'sale_date' }), '2026-10-06');
assert.strictEqual(policy.saleDateForSort({ sale_date: '2026-10-06', sale_date_origin: 'hearing_date' }), '');
assert.strictEqual(policy.saleDateForSort({ sale_date_or_event_date: '10/06/2026', sale_date_origin: 'sale_date' }), '');
assert.strictEqual(policy.saleDateForSort({ sale_date_iso: '2026-10-06' }), '');
assert.strictEqual(JSON.stringify(row),before);
const saved = { fetch: global.fetch, now: Date.now, write: fs.writeFileSync };
let effects=0; const deny=()=>{effects++;throw new Error('pure side effect');};
try { global.fetch=deny;Date.now=deny;fs.writeFileSync=deny;policy.counts([row]);policy.matchReasons(row,buyer); }
finally {global.fetch=saved.fetch;Date.now=saved.now;fs.writeFileSync=saved.write;}
assert.strictEqual(effects,0);
assert.strictEqual(ui.eligible({ operational_eligibility: policy.classify(row) }),true);
assert.strictEqual(ui.matchable({ ...row, operational_eligibility: policy.classify(row) },{ matching_eligible:false }),false);
assert.ok(!ui.markup('matching',{rows:[],counts:{},matches:[],total:0}).includes('Send'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wos-ops-proof-'));
try {
  const file=path.join(tmp,'dossiers.json');
  const dossier={ dossier_id:'TEST-conflict', property:{ full_address:row.address, source_url:conflict.redfin_url,
    source_proof_status:'Source/Address Conflict' }, workflow:{outcome:'Call Today'}, contact:{target:'Public Source Contact',phone:'5550101234'},
    valuation:{groups:{}},signals:[],lead_evidence:{},source_backed_facts:{},updated_at:'2026-10-06T12:00:00Z' };
  fs.writeFileSync(file,JSON.stringify([dossier])); const original=fs.readFileSync(file,'utf8');
  const dossiers=require('../modules/research/deal-call-dossiers');
  assert.strictEqual(dossiers.listDossiers({storePath:file,filter:'Call Today'}).length,0);
  const result=dossiers.getDossier('TEST-conflict',{storePath:file});
  assert.strictEqual(result.property.full_address,row.address);
  assert.strictEqual(result.workflow.outcome,'Research More');
  assert.strictEqual(result.contact.call_allowed,false);
  assert.strictEqual(fs.readFileSync(file,'utf8'),original);
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
console.log('Operational safety: address proof, venue/OCR/forged rejection, wrong links, sourced phone, DNC, buyer/value gates, counts, raw-date sorting and read-only dossier correction passed.');
