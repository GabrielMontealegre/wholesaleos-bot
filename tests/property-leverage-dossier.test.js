'use strict';

const assert = require('assert');
const dossierModule = require('../modules/research/property-leverage-dossier');
const leadState = require('../modules/research/lead-operations-state');
const queueService = require('../modules/research/deal-board-queue-service');

function source(overrides) {
  return Object.assign({
    source_kind: 'official_public_record',
    source_url: 'https://example.gov/property/100',
    evidence_text: 'Official public record evidence.'
  }, overrides || {});
}

function comp(index, overrides) {
  return Object.assign(source({
    comp_address: `${index} Comp St, Detroit, MI 48201`,
    sold_price: 200000 + index * 10000,
    sold_date: `2026-0${index}-15`,
    distance_miles: index / 10,
    comp_grid: { accepted: true }
  }), overrides || {});
}

function base(overrides) {
  return Object.assign({
    normalized_address: '100 Subject St, Detroit, MI 48201',
    city: 'Detroit', county: 'Wayne', state: 'MI',
    bedrooms: 3,
    source_document_url: 'https://example.gov/notices/100.pdf',
    source_proof_text: 'Property: 100 Subject St, Detroit, MI 48201.',
    owner_record: source({ owner_name: 'JANE OWNER', owner_role: 'owner_of_record' }),
    lifecycle_status: { quarantined: false },
    free_contact_routes: [],
    verified_sold_comp_count: 3,
    verified_sold_comps: [comp(1), comp(2), comp(3)]
  }, overrides || {});
}

function listingDossier(listPrice, debt) {
  return dossierModule.buildLeverageDossier(base({
    source_family: 'public_listing_marketplace',
    source_url: 'https://example.com/listing/100',
    listed_price: `$${listPrice.toLocaleString('en-US')}`,
    listed_price_evidence_text: `Listing price: $${listPrice.toLocaleString('en-US')}`,
    original_loan_amount: `$${debt.toLocaleString('en-US')}`,
    original_loan_amount_evidence_text: `Original loan amount: $${debt.toLocaleString('en-US')}`,
    verified_sold_comp_count: 0,
    verified_sold_comps: []
  }));
}

// 1. Property work is independent of contact work.
const noContact = base({ free_contact_routes: [], mailing_route: null });
assert.strictEqual(leadState.propertyStateForDeal(noContact).property_state, 'PROPERTY_READY');
assert.notStrictEqual(leadState.contactStateForDeal(noContact).contact_state, 'CALL_READY');

// 2-3. Missing either side stays honest and never becomes zero.
const unknownDebt = dossierModule.equityEstimate(dossierModule.buildLeverageDossier(base({
  original_loan_amount: '', lien_amount: '', tax_due: '', judgment_amount: ''
})));
assert.strictEqual(unknownDebt.status, 'UNKNOWN');
assert.strictEqual(unknownDebt.equity_estimate, null);
assert.notStrictEqual(unknownDebt.equity_estimate, 0);
const unknownValueDossier = dossierModule.buildLeverageDossier(base({
  verified_sold_comp_count: 0, verified_sold_comps: [], source_family: 'foreclosure_notice',
  original_loan_amount: '$40,000', original_loan_amount_evidence_text: 'Original loan amount: $40,000'
}));
const unknownValue = dossierModule.equityEstimate(unknownValueDossier);
assert.strictEqual(unknownValue.status, 'UNKNOWN');
assert.strictEqual(unknownValue.value_reference, null);
assert.strictEqual(unknownValue.equity_estimate, null);

// 4. The brief's formula classifies positive 10% equity as TIGHT, not NONE.
const tight = dossierModule.equityEstimate(listingDossier(445000, 400000));
assert.strictEqual(tight.equity_estimate, 45000);
assert.strictEqual(tight.room_to_offer, 'TIGHT');

// 5. Large positive equity is LIKELY.
const likely = dossierModule.equityEstimate(listingDossier(60000, 16000));
assert.strictEqual(likely.equity_estimate, 44000);
assert.strictEqual(likely.room_to_offer, 'LIKELY');

// 6. Untyped source money never becomes debt.
const unknownMoney = dossierModule.buildLeverageDossier(base({
  verified_sold_comp_count: 0, verified_sold_comps: [], source_family: 'foreclosure_notice',
  unknown_source_amount: '$300,000',
  unknown_source_amount_evidence_text: 'Amount shown: $300,000'
}));
assert.strictEqual(unknownMoney.debt.unknown_source_amount.status, 'VERIFIED');
assert.strictEqual(dossierModule.equityEstimate(unknownMoney).estimated_debt, null);

// 7. Values without provenance are not exposed as facts.
const unproven = dossierModule.buildLeverageDossier({ normalized_address: '100 Unsourced St', bedrooms: 3, city: 'Detroit', county: 'Wayne', state: 'MI' });
assert.deepStrictEqual(unproven.identity.beds.value, null);
assert.strictEqual(unproven.identity.beds.status, 'UNKNOWN');
assert.ok(unproven.identity.beds.provenance && typeof unproven.identity.beds.provenance === 'object');
Object.values(unproven).forEach((group) => Object.values(group).forEach((item) => {
  assert.deepStrictEqual(Object.keys(item).sort(), ['provenance', 'status', 'value']);
  assert.ok(['VERIFIED', 'CLUE', 'UNKNOWN'].includes(item.status));
}));

// 8. Compatibility output remains the exact legacy contract across representative fixtures.
const fixtures = [
  {},
  base({ normalized_address: '' }),
  base({ lifecycle_status: { quarantined: true, reason_text: 'Sale passed.' } }),
  base({ verified_sold_comp_count: 0 }),
  base({ free_contact_routes: [source({ route_kind: 'phone', value: '313-555-0100', route_type: 'owner_phone', evidence_text: 'Owner of record phone: 313-555-0100' })], verified_sold_comp_count: 0 })
];
const expectedLegacy = [
  { row_state: 'LOCKED', row_state_reason: 'Property identity is incomplete.', next_action: 'Verify the complete property address from the public source.' },
  { row_state: 'LOCKED', row_state_reason: 'Property identity is incomplete.', next_action: 'Verify the complete property address from the public source.' },
  { row_state: 'LOCKED', row_state_reason: 'Sale passed.', next_action: 'Verify the row status and source evidence before contacting anyone.' },
  { row_state: 'NEEDS_CONTACT_SEARCH', row_state_reason: 'Identity is known, but the free public contact search has not finished on this row.', next_action: 'Let the free contact lanes run before considering paid skip tracing.' },
  { row_state: 'CALL_READY', row_state_reason: 'A source-linked public phone route is visible.', next_action: 'Verify the source evidence, then call this contact.' }
];
assert.deepStrictEqual(fixtures.map((deal) => leadState.rowStateForDeal(deal)), expectedLegacy);

// 9. Texas stays value-source locked even when a row already carries three comps.
const texas = base({ city: 'Dallas', county: 'Dallas', state: 'TX' });
assert.strictEqual(leadState.propertyStateForDeal(texas).property_state, 'NEEDS_VALUE_SOURCE');
assert.notStrictEqual(leadState.propertyStateForDeal(texas).property_state, 'PROPERTY_READY');

// Queue transport and count additions are derived from the same state functions.
const projected = queueService.projectRowForQueue(noContact, 'detroit|100-subject', '2026-09-20T12:00:00.000Z');
assert.strictEqual(projected.property_state, 'PROPERTY_READY');
assert.ok(projected.leverage_dossier && projected.equity_estimate);
assert.strictEqual(projected.room_to_offer, projected.equity_estimate.room_to_offer);
const counts = queueService.queueCounts([projected]);
assert.strictEqual(counts.property_ready, 1);
assert.strictEqual(counts.needs_property_facts, 0);

console.log(JSON.stringify({
  property_without_contact: leadState.propertyStateForDeal(noContact).property_state,
  positive_thin_equity: tight.room_to_offer,
  large_equity: likely.room_to_offer,
  tx_property_state: leadState.propertyStateForDeal(texas).property_state
}, null, 2));
