'use strict';

const fs = require('fs');
const path = require('path');
const manualEvidence = require('../modules/research/manual-evidence-packet-service');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'exports', 'cycle-37-local-proof.json');
const TODAY = '2026-09-22';
const subject = {
  queue_key: 'ellis-3808-kings-dr',
  normalized_address: '3808 Kings Dr, Ennis, TX 75119',
  address_state: 'complete_source_address', source_structured_address_verified: true,
  city: 'Ennis', county: 'Ellis', state: 'TX', zip: '75119',
  bedrooms: 3, bathrooms: 2, living_area: 1600, latitude: 32.3293, longitude: -96.6253,
  source_name: 'Ellis County Foreclosure Notices',
  source_document_url: 'https://www.co.ellis.tx.us/notices/2026-10-06-foreclosure.pdf',
  sale_date_or_event_date: '2026-10-06',
  status_evidence_text: 'Property is listed in the Ellis County foreclosure notice for the October 6, 2026 sale.',
  source_proof_text: 'Property: 3808 Kings Dr, Ennis, TX 75119. Sale date: October 6, 2026.',
  free_contact_routes: [], lifecycle_status: { status: 'FRESH', quarantined: false },
  preview_only: true, should_ingest: false, not_a_saved_lead: true
};

function confirmation() {
  return { confirmed: true, confirmed_by: 'gabriel', confirmed_at: '2026-09-22T12:00:00.000Z' };
}

function subjectFacts(confirmed) {
  const fieldConfirmations = {};
  if (confirmed) ['property_kind', 'year_built', 'lot_size'].forEach((name) => { fieldConfirmations[name] = confirmation(); });
  return {
    evidence_id: 'subject-facts-1', evidence_type: 'subject_property', screenshot_id: '10000000-0000-4000-8000-000000000001',
    source_name: 'Zillow property detail', captured_at: '2026-09-22T11:00:00.000Z', operator_confirmed: false,
    fields: { property_kind: 'single family', year_built: '1994', lot_size: '7200', source_url: 'https://www.zillow.com/homedetails/3808-Kings-Dr-Ennis-TX-75119/' },
    field_confirmations: fieldConfirmations
  };
}

function comp(index) {
  return {
    evidence_id: `comp-${index}`, evidence_type: 'sold_comp', screenshot_id: `20000000-0000-4000-8000-00000000000${index}`,
    source_name: 'Operator-captured sold result', captured_at: '2026-09-22T11:30:00.000Z', operator_confirmed: true,
    operator_confirmation: confirmation(),
    fields: {
      comp_address: `${3810 + index * 2} Kings Dr, Ennis, TX 75119`, sold_status: 'sold', sold_price: String(210000 + index * 10000), sold_date: '2026-07-15',
      source_url: `https://www.zillow.com/homedetails/ellis-comp-${index}/`, similarity_basis: 'same single-family property type, similar living area, beds, baths, age and lot',
      property_kind: 'single family', land_use: 'single family', beds: '3', baths: '2', sqft: '1580', year_built: '1996', lot_size: '7000',
      latitude: String(32.3293 + index * 0.001), longitude: String(-96.6253 + index * 0.001)
    }
  };
}

function snapshot(label, items) {
  const evaluation = manualEvidence.evaluatePacket({ evidence_items: items }, subject, { today_iso: TODAY });
  return {
    label,
    confirmed_subject_field_count: evaluation.confirmed_subject_field_count,
    subject_grid_readiness: evaluation.subject_grid_readiness,
    confirmed_strict_comp_count: evaluation.confirmed_strict_comp_count,
    property_state: evaluation.projected_property_state,
    contact_state: evaluation.projected_contact_state,
    can_value: evaluation.readiness.can_value.status,
    ready_to_offer: evaluation.readiness.ready_to_offer.status,
    arv_range: evaluation.arv_range,
    comp_addresses: evaluation.verified_screenshot_comps.map((item) => item.comp_address),
    contact_route_count: evaluation.contact_routes_accepted.length
  };
}

const steps = [
  snapshot('baseline', []),
  snapshot('subject facts proposed but unconfirmed', [subjectFacts(false)]),
  snapshot('subject facts confirmed', [subjectFacts(true)]),
  snapshot('one comp confirmed', [subjectFacts(true), comp(1)]),
  snapshot('two comps confirmed', [subjectFacts(true), comp(1), comp(2)]),
  snapshot('three comps confirmed', [subjectFacts(true), comp(1), comp(2), comp(3)])
];
const final = steps[steps.length - 1];
if (steps[0].property_state !== 'NEEDS_COMPS' || final.property_state !== 'PROPERTY_READY' || final.contact_state !== 'LOCKED' || final.contact_route_count !== 0 || final.ready_to_offer === 'YES') {
  throw new Error('Cycle 37 local proof did not preserve the required state transition and contact lock.');
}
const artifact = {
  generated_at: new Date().toISOString(),
  fixture: '3808 Kings Dr, Ennis, TX 75119',
  network_requests_made: 0,
  browser_launched: false,
  saved_leads_mutated: false,
  steps,
  final_assertion: {
    transition: 'NEEDS_COMPS -> PROPERTY_READY',
    property_state: final.property_state,
    contact_state: final.contact_state,
    contact_route_count: final.contact_route_count,
    ready_to_offer: final.ready_to_offer
  }
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), final: artifact.final_assertion }));

