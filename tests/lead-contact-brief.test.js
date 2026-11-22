'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildLeadContactBrief: brief } = require('../modules/research/lead-contact-brief');
const route = {
  route_kind: 'owner_phone', route_type: 'owner', value: '5550101234',
  source_kind: 'official_public_record', source_url: 'https://county.example.gov/property/SYNTHETIC',
  evidence_text: 'Owner of record phone: 5550101234'
};
const row = {
  id: 'synthetic-contact', address: '100 Test St, Example City, TX 75001', city: 'Example City', state: 'TX',
  source_url: 'https://county.example.gov/notices/SYNTHETIC.pdf', source_kind: 'official_public_record',
  source_structured_address_verified: true, source_proof_text: 'Property address: 100 Test St, Example City, TX 75001.',
  owner_record: { owner_name: 'Synthetic Owner' }, status: 'New Lead', free_contact_routes: [route]
};
const before = JSON.stringify(row);
const accepted = brief(row);
assert.equal(accepted.owner.name, 'Synthetic Owner');
assert.equal(accepted.owner.origin, 'owner_record.owner_name');
assert.equal(accepted.call_href, 'tel:+15550101234');
assert.equal(accepted.text_href, 'sms:+15550101234');
assert.equal(accepted.local_action_only, true);
assert.equal(accepted.phone.source_url, route.source_url);
assert.equal(accepted.phone.evidence_text, route.evidence_text);
assert.equal(brief({ ...row, phone: '5559999999' }).phone.number, accepted.phone.number, 'bare phone never overrides evidence');
for (const patch of [
  { free_contact_routes: [] }, { do_not_call: true }, { do_not_contact: true }, { do_not_call: 'false' }, { archived: true },
  { owner_type: 'bank' }, { owner_type: 'government' }, { seller_type: 'bank-owned' },
  { owner_record: { owner_name: 'Synthetic Agency', owner_type: 'government' } },
  { source_proof_text: '' }, { source_structured_address_verified: false },
  { contact_workflow_outcome: 'not_interested' }, { lifecycle_status: { quarantined: true } }, { lifecycle_status: { quarantined: 'false' } },
  { contact_workflow_invalidated_routes: [{ value: '(555) 010-1234' }] },
  { owner_record: {}, owner_clue: '' }
]) {
  const result = brief({ ...row, ...patch, contact_brief: accepted, operational_eligibility: { callable: true } });
  assert.equal(result.call_allowed, false);
  assert.equal(result.text_allowed, false);
  assert.equal(result.call_href, null);
  assert.equal(result.text_href, null);
}
for (const patch of [
  { operator_disproved: true }, { do_not_call: true }, { do_not_contact: true }, { dnc: true }, { dnc: 'false' }, { litigator: true },
  { status: 'wrong' }, { status: 'wrong_number' }, { status: 'rejected' }, { status: 'disconnected' },
  { risk_flags: ['OPERATOR_WRONG_NUMBER_REPORTED'] }, { risk_flags: ['DO_NOT_CALL'] }, { risk_flags: {} },
  { evidence_text: '' }, { source_url: 'javascript:alert(1)' }, { source_url: 'https://user:synthetic@county.example.gov/' },
  { value: '5550101234?body=bad' }
]) assert.equal(brief({ ...row, free_contact_routes: [{ ...route, ...patch }] }).phone, null);
for (const patch of [
  { evidence_text: 'Unconfirmed phone 5550101234' }, { route_type: 'registered_agent', evidence_text: 'Registered agent phone 5550101234' },
  { source_kind: 'search_snippet' }, { source_kind: 'paid_api' },
  { evidence_text: 'Owner of record phone: 5559999999' }
]) {
  const result = brief({ ...row, free_contact_routes: [{ ...route, ...patch }] });
  assert.equal(result.call_allowed, false);
  assert.match(result.phone.label, /Possible number/);
}
assert.equal(brief({ ...row, free_contact_routes: [{ ...route, status: 'wrong' }, route] }).call_allowed, true,
  'choose a usable route rather than a rejected first entry');
assert.equal(brief({ ...row, owner_record: {} }).owner.name, null);
assert.equal(brief(null).phone, null);
assert.equal(JSON.stringify(row), before);
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.equal((server.match(/leadContactBrief\.buildLeadContactBrief\(/g) || []).length, 4,
  'list, list fallback, operational list and detail recompute from canonical rows');
assert.ok(server.includes('safeLeadListValue(leadContactBrief.buildLeadContactBrief(lead), 4)'), 'list limits still apply');
let detail;
const registration = server.indexOf("app.get('/api/leads/:id',");
vm.runInNewContext(server.slice(registration, server.indexOf('\n});', registration) + 4), {
  app: { get(_route, handler) { detail = handler; } }, db: { getLeads: () => [{ ...row, contact_brief: { call_href: 'tel:forged' } }] },
  operationalLeads: require('../modules/research/operational-lead-eligibility'),
  leadContactBrief: { buildLeadContactBrief: brief }, withLeadIntelligence: value => value
});
const response = { json(value) { this.body = value; } };
detail({ params: { id: row.id } }, response);
assert.equal(response.body.contact_brief.call_href, accepted.call_href, 'actual detail response ignores cached action forgery');
const originalFetch = global.fetch, originalNow = Date.now, originalWrite = fs.writeFileSync;
try {
  global.fetch = () => { throw Error('network forbidden'); };
  Date.now = () => { throw Error('clock forbidden'); };
  fs.writeFileSync = () => { throw Error('write forbidden'); };
  assert.equal(brief(row).call_allowed, true);
} finally { global.fetch = originalFetch; Date.now = originalNow; fs.writeFileSync = originalWrite; }
console.log('lead-contact-brief: canonical provenance, source-only phone, privacy-safe links, negative guards, API projections and purity PASS');
