'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const propertyCandidate = require('../modules/research/property-candidate');
const scorer = require('../modules/research/source-acquisition-score');
const sourceCatalog = require('../modules/sources/source-catalog');

const candidate = propertyCandidate.normalizePropertyCandidate({
  source_id: 'tx_dallas_fsbo_contact_first',
  source_family: 'fsbo',
  source_name: 'Dallas FSBO',
  source_url: 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345',
  source_classification: 'exact_property_record',
  address: '123 Main St, Dallas, TX 75208',
  motivation_phrase: 'For sale by owner - cash only.',
  motivation_evidence_text: 'For sale by owner - cash only.',
  current_status: 'Active',
  contact_route: 'FSBO Public Contact'
}, {
  acquisition_run_id: 'flb_test',
  city: 'Dallas',
  state: 'TX'
});

assert.strictEqual(candidate.candidate_origin, 'acquisition_core');
assert.strictEqual(candidate.source_family, 'fsbo');
assert.strictEqual(candidate.official_source, false);
assert.ok(candidate.property_key);
assert.ok(candidate.source_confidence >= 80);
assert.ok(candidate.identity_confidence >= 80);
assert.ok(candidate.motivation_confidence >= 80);
assert.ok(candidate.contact_confidence >= 80);
assert.strictEqual(candidate.next_best_worker, scorer.NEXT_BEST_WORKERS.PIPELINE);
assert.strictEqual(candidate.preview_only, true);
assert.strictEqual(candidate.should_ingest, false);
assert.strictEqual(candidate.lead_evidence.normalized_address, '123 Main St, Dallas, TX 75208');
assert.strictEqual(candidate.lead_evidence.exact_source_phrase_verbatim, true);

const noContact = propertyCandidate.normalizePropertyCandidate({
  source_id: 'tx_dallas_county_clerk_foreclosure_notices',
  source_family: 'preforeclosure_trustee_notice',
  official_source: true,
  source_url: 'https://www.realtor.com/realestateandhomes-detail/124-Main-St_Dallas_TX_75208_M12445',
  source_classification: 'exact_property_record',
  address: '124 Main St, Dallas, TX 75208',
  motivation_phrase: 'Foreclosure sale notice.',
  motivation_evidence_text: 'Foreclosure sale notice.',
  current_status: 'Foreclosure sale active',
  contact_route: 'Manual Lookup Needed'
});
assert.strictEqual(noContact.next_best_worker, scorer.NEXT_BEST_WORKERS.SKIP_TRACE);
assert.ok(noContact.official_source);

const unprovenPhraseAndStatus = propertyCandidate.normalizePropertyCandidate({
  source_id: 'tx_dallas_fsbo_contact_first',
  source_family: 'fsbo',
  source_url: 'https://www.realtor.com/realestateandhomes-detail/126-Main-St_Dallas_TX_75208_M12645',
  source_classification: 'exact_property_record',
  address: '126 Main St, Dallas, TX 75208',
  motivation_phrase: 'For sale by owner',
  source_proof_text: 'Public property page without visible motivation or current status.',
  source_text: 'Public property page without visible motivation or current status.',
  contact_route: 'Manual Lookup Needed'
});
assert.strictEqual(unprovenPhraseAndStatus.lead_evidence.exact_source_phrase_verbatim, false);
assert.strictEqual(unprovenPhraseAndStatus.current_status, '');
assert.strictEqual(unprovenPhraseAndStatus.status_evidence_text, '');

const weakIdentity = propertyCandidate.normalizePropertyCandidate({
  source_id: 'tx_dallas_tax_resale',
  source_family: 'tax_resale',
  official_source: true,
  source_url: 'https://www.dallascounty.org/departments/pubworks/property-division.php',
  motivation_phrase: 'Tax resale property.',
  current_status: 'Available'
});
assert.strictEqual(weakIdentity.next_best_worker, scorer.NEXT_BEST_WORKERS.PROPERTY_INTELLIGENCE);

const card = propertyCandidate.candidateToFindMeCard(candidate, { acquisition_run_id: 'flb_test' });
assert.strictEqual(card.source_kind, 'source_acquisition_core');
assert.strictEqual(card.next_best_worker, scorer.NEXT_BEST_WORKERS.PIPELINE);
assert.strictEqual(card.preview_only, true);
assert.strictEqual(card.should_ingest, false);

const catalog = sourceCatalog.buildSourceCatalog({ state: 'TX', county: 'Dallas County' });
assert.ok(catalog.length >= 10);
assert.ok(catalog.some((source) => source.source_id === 'tx_dallas_county_clerk_foreclosure_notices'));
assert.ok(catalog.some((source) => source.source_id === 'tx_dallas_fsbo_contact_first'));
assert.ok(catalog.every((source) => source.preview_only === true && source.should_ingest === false));

console.log('property-candidate tests passed');
