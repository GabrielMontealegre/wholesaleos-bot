'use strict';

const assert = require('assert');
const roles = require('../modules/research/contact-route-roles');
const hunter = require('../modules/research/free-public-contact-hunter');
const leadState = require('../modules/research/lead-operations-state');

function route(overrides) {
  return Object.assign({
    route_kind: 'phone',
    value: '(214) 555-0100',
    source_kind: 'public_source_document',
    source_url: 'https://county.example.gov/notice.pdf',
    source_label: 'Official source document',
    evidence_text: 'For sale information call the substitute trustee at (214) 555-0100.',
    route_type: 'trustee_servicer_or_official'
  }, overrides || {});
}

function row(contactRoute, overrides) {
  return Object.assign({
    normalized_address: '100 Main St, Dallas, TX 75201',
    owner_record: { owner_name: 'JANE OWNER' },
    lifecycle_status: { quarantined: false },
    free_contact_routes: [contactRoute],
    enrichment_ledger: { attempts: [] }
  }, overrides || {});
}

(() => {
  const trustee = route({ evidence_text: 'Substitute trustee sale information: (214) 555-0100.' });
  assert.strictEqual(roles.classifyRoute(trustee).role, 'trustee');
  assert.strictEqual(roles.sellerContactEligibility(trustee).status, roles.RESEARCH_ONLY);
  assert.notStrictEqual(leadState.rowStateForDeal(row(trustee)).row_state, 'CALL_READY');

  const servicer = route({ evidence_text: 'Mortgage servicer phone: (214) 555-0101.' });
  const attorney = route({ evidence_text: 'Attorney at law phone: (214) 555-0102.' });
  assert.strictEqual(roles.classifyRoute(servicer).role, 'servicer');
  assert.strictEqual(roles.classifyRoute(attorney).role, 'attorney');
  assert.ok([servicer, attorney].every((item) => roles.sellerContactEligibility(item).status === roles.RESEARCH_ONLY));

  const owner = route({ route_type: 'owner', evidence_text: 'Owner of record phone: (214) 555-0200.' });
  assert.strictEqual(roles.classifyRoute(owner).role, 'owner');
  assert.strictEqual(roles.sellerContactEligibility(owner).status, roles.SELLER_CONTACT_ELIGIBLE);
  assert.strictEqual(leadState.rowStateForDeal(row(owner)).row_state, 'CALL_READY');

  const screenshotOwner = route({
    route_type: 'operator_confirmed_owner_or_seller_contact',
    source_kind: 'operator_supplied_screenshot',
    source_url: 'https://background.example.test/address/100-main',
    evidence_text: 'Operator confirmed this phone as the owner route from screenshot shot-1.',
    operator_confirmed: true,
    seller_owner_confirmed: true
  });
  assert.strictEqual(roles.sellerContactEligibility(screenshotOwner).status, roles.SELLER_CONTACT_ELIGIBLE);
  assert.strictEqual(leadState.rowStateForDeal(row(screenshotOwner)).row_state, 'CALL_READY');

  const unknown = route({ route_type: 'unclassified_public_contact', evidence_text: 'Call (214) 555-0300 for information.', confidence: 'High' });
  assert.strictEqual(roles.classifyRoute(unknown).role, 'unknown');
  assert.strictEqual(roles.sellerContactEligibility(unknown).status, roles.RESEARCH_ONLY);
  assert.notStrictEqual(leadState.rowStateForDeal(row(unknown)).row_state, 'CALL_READY');

  const listingAgent = route({ route_type: 'listing_agent_or_poster', evidence_text: 'Listing agent phone: (214) 555-0400.' });
  const listingClass = roles.classifyRoute(listingAgent);
  assert.strictEqual(listingClass.role, 'other_source_stated_role');
  assert.strictEqual(listingClass.role_source_stated_text, 'listing_agent_or_poster');

  const borrower = route({ route_type: 'unclassified_public_contact', evidence_text: 'Borrower phone: (214) 555-0450.' });
  assert.strictEqual(roles.classifyRoute(borrower).role, 'other_source_stated_role');
  assert.strictEqual(roles.classifyRoute(borrower).role_source_stated_text, 'Borrower');
  assert.strictEqual(roles.sellerContactEligibility(route({ route_type: 'owner', source_url: '', evidence_text: '' })).status, roles.RESEARCH_ONLY);

  assert.strictEqual(hunter.contactStatusFromRoutes([trustee], null, [{ source: 'document' }]), 'CONTACT_SEARCH_EXHAUSTED_FREE');
  assert.strictEqual(hunter.contactStatusFromRoutes([owner], null, [{ source: 'document' }]), 'CALL_READY');
  console.log('contact route role tests passed');
})();
