'use strict';

const assert = require('assert');
const roles = require('../modules/research/contact-route-roles');
const callPrep = require('../modules/research/call-prep-projection');

function route(overrides) {
  return Object.assign({
    route_kind: 'phone',
    value: '(214) 555-0100',
    route_type: 'unclassified_public_contact',
    source_kind: 'official_public_record',
    source_url: 'https://county.example.gov/record/1',
    source_label: 'Official public record',
    evidence_text: 'Call for information.'
  }, overrides || {});
}

function expected(caseName, input, role, eligibility) {
  const classification = roles.classifyRoute(input);
  const result = roles.sellerContactEligibility(input);
  assert.strictEqual(classification.role, role, `${caseName}: role`);
  assert.strictEqual(result.status, eligibility, `${caseName}: eligibility`);
  return { case_name: caseName, role, eligibility, role_basis: classification.role_basis };
}

(() => {
  const matrix = [
    expected('owner official record', route({ evidence_text: 'Owner of record: Jane Doe. Phone (214) 555-0100.' }), 'owner', roles.SELLER_CONTACT_ELIGIBLE),
    expected('owner operator-confirmed screenshot', route({
      route_type: 'operator_confirmed_owner_or_seller_contact', source_kind: 'operator_supplied_screenshot',
      source_url: 'https://operator.example.test/evidence/1', evidence_text: 'Operator confirmed this phone as the owner route.',
      operator_confirmed: true, seller_owner_confirmed: true
    }), 'owner', roles.SELLER_CONTACT_ELIGIBLE),
    expected('occupant official record', route({ evidence_text: 'Current occupant contact: (214) 555-0100.' }), 'occupant', roles.SELLER_CONTACT_ELIGIBLE),
    expected('seller-stated contact', route({ evidence_text: 'Seller contact: Jane Doe at (214) 555-0100.' }), 'owner', roles.SELLER_CONTACT_ELIGIBLE),
    expected('attorney', route({ evidence_text: 'Attorney at law contact: (214) 555-0100.' }), 'attorney', roles.RESEARCH_ONLY),
    expected('trustee', route({ evidence_text: 'Substitute trustee sale information: (214) 555-0100.' }), 'trustee', roles.RESEARCH_ONLY),
    expected('servicer', route({ evidence_text: 'Mortgage servicer phone: (214) 555-0100.' }), 'servicer', roles.RESEARCH_ONLY),
    expected('bank lender', route({ evidence_text: 'Lender contact at First Bank NA: (214) 555-0100.' }), 'lender', roles.RESEARCH_ONLY),
    expected('escrow', route({ evidence_text: 'Tax service escrow department: (214) 555-0100.' }), 'escrow', roles.RESEARCH_ONLY),
    expected('auction company', route({ evidence_text: 'Auction company information line: (214) 555-0100.' }), 'auction_company', roles.RESEARCH_ONLY),
    expected('registered agent', route({ evidence_text: 'Registered agent contact: (214) 555-0100.' }), 'registered_agent', roles.RESEARCH_ONLY),
    expected('government office', route({ evidence_text: 'County clerk office: (214) 555-0100.' }), 'government_office', roles.RESEARCH_ONLY),
    expected('taxpayer', route({ evidence_text: 'Taxpayer of record: Jane Doe. Phone (214) 555-0100.' }), 'taxpayer', roles.RESEARCH_ONLY),
    expected('unknown', route({ evidence_text: 'Call (214) 555-0100 for information.' }), 'unknown', roles.RESEARCH_ONLY)
  ];

  const conflicts = [
    expected('owner type with trustee evidence', route({ route_type: 'owner', evidence_text: 'Substitute trustee sale information: (214) 555-0100.' }), 'trustee', roles.RESEARCH_ONLY),
    expected('owner phone type with servicer evidence', route({ route_type: 'owner_phone', evidence_text: 'Mortgage servicer phone: (214) 555-0100.' }), 'servicer', roles.RESEARCH_ONLY),
    expected('operator-confirmed type with attorney evidence', route({
      route_type: 'operator_confirmed_owner_or_seller_contact', source_kind: 'operator_supplied_screenshot',
      evidence_text: 'Attorney at law phone: (214) 555-0100.', operator_confirmed: true, seller_owner_confirmed: true
    }), 'attorney', roles.RESEARCH_ONLY),
    expected('owner-sounding URL and label only', route({
      source_url: 'https://owner.example.gov/owner-phone', source_label: 'Owner contact record',
      evidence_text: 'Call (214) 555-0100 for information.'
    }), 'unknown', roles.RESEARCH_ONLY),
    expected('owner label with government evidence', route({
      source_label: 'Owner contact record', evidence_text: 'County clerk office: (214) 555-0100.'
    }), 'government_office', roles.RESEARCH_ONLY),
    expected('high-confidence official record without role evidence', route({
      confidence: 'High', evidence_text: 'Call (214) 555-0100 for information.'
    }), 'unknown', roles.RESEARCH_ONLY)
  ];

  conflicts.slice(0, 3).forEach((item) => {
    assert.strictEqual(item.role_basis, 'institutional_evidence_overrides_route_type');
  });
  matrix.concat(conflicts).forEach((item) => {
    if (item.eligibility === roles.SELLER_CONTACT_ELIGIBLE) {
      assert.ok(item.role === 'owner' || item.role === 'occupant', `${item.case_name}: seller eligibility requires owner or occupant support`);
    }
  });
  const conflictingCallPrep = callPrep.buildCallPrep({
    normalized_address: '100 Main St, Dallas, TX 75201',
    contact_route_if_visible: '(214) 555-0100 (owner_phone)',
    owner_record: { owner_name: 'Jane Doe' },
    free_contact_routes: [route({ route_type: 'owner_phone', evidence_text: 'Mortgage servicer phone: (214) 555-0100.' })]
  });
  assert.strictEqual(conflictingCallPrep.call_readiness, 'NEEDS_CONTACT_ROUTE');
  assert.strictEqual(conflictingCallPrep.contact_status, 'CONTACT_LOOKUP_REQUIRED');
  console.log(JSON.stringify({ matrix: matrix.concat(conflicts) }, null, 2));
  console.log('contact route role adversarial tests passed');
})();
