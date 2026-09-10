'use strict';

const assert = require('assert');

const callPrepProjection = require('../modules/research/call-prep-projection');
const distressEvidenceModel = require('../modules/research/distress-evidence-model');
const leadLifecycleStatus = require('../modules/research/lead-lifecycle-status');
const manualEvidencePacketService = require('../modules/research/manual-evidence-packet-service');
const propertyCandidate = require('../modules/research/property-candidate');

const SOURCE_URL = 'https://county.example.gov/notices/2026-09.pdf';

function fact(row, type) {
  return distressEvidenceModel.moneyFactsForRow(Object.assign({ source_document_url: SOURCE_URL }, row))
    .find((item) => item.amount_type === type);
}

(() => {
  const minimumBid = fact({
    minimum_bid: '$152,743',
    minimum_bid_evidence_text: '157 2317-018-044 $152,743 539'
  }, 'minimum_bid');
  assert.strictEqual(minimumBid.exact_amount, '$152,743');
  assert.strictEqual(minimumBid.plain_english_meaning, distressEvidenceModel.BID_MEANING);
  assert.doesNotMatch(minimumBid.operator_label, /amount owed|debt|arrears|payoff/i);
  assert.match(minimumBid.plain_english_meaning, /not confirmed total debt/i);

  const openingBid = fact({
    opening_bid: '$45,000.00',
    opening_bid_evidence_text: 'Opening bid: $45,000.00'
  }, 'opening_bid');
  assert.strictEqual(openingBid.plain_english_meaning, distressEvidenceModel.BID_MEANING);

  const judgment = fact({
    judgment_amount: '$82,410.33',
    judgment_amount_evidence_text: 'Judgment amount: $82,410.33'
  }, 'judgment_amount');
  const taxes = fact({
    tax_due: '$14,221.07',
    tax_due_evidence_text: 'Delinquent taxes due: $14,221.07'
  }, 'tax_due');
  assert.strictEqual(judgment.operator_label, 'Judgment amount');
  assert.strictEqual(taxes.operator_label, 'Tax due');
  assert.notStrictEqual(judgment.amount_type, taxes.amount_type);

  const unlabeledDebtCandidate = distressEvidenceModel.moneyFactsForRow({
    lien_amount: '$9,900',
    source_proof_text: 'Public notice reference 100-A; amount $9,900.'
  });
  assert.strictEqual(unlabeledDebtCandidate[0].amount_type, 'unknown_source_amount');
  assert.strictEqual(unlabeledDebtCandidate[0].verification_state, 'source_amount_type_unverified');

  const legacy = fact({
    amount_or_judgment: '$300,000',
    amount_or_judgment_evidence_text: 'Legacy source amount $300,000'
  }, 'unknown_source_amount');
  assert.strictEqual(legacy.exact_amount, '$300,000');
  assert.match(legacy.plain_english_meaning, /without enough evidence to classify/i);

  const missing = distressEvidenceModel.buildDistressEvidence({ source_document_url: SOURCE_URL }).money_facts;
  assert.strictEqual(missing.length, 1);
  assert.strictEqual(missing[0].amount_type, 'unknown_source_amount');
  assert.strictEqual(missing[0].exact_amount, 'Not published in source');

  const everyAmountType = distressEvidenceModel.moneyFactsForRow({
    tax_due: '$14,221.07', tax_due_evidence_text: 'Delinquent taxes due: $14,221.07',
    mortgage_arrears: '$7,850.00', mortgage_arrears_evidence_text: 'Mortgage arrears: $7,850.00',
    lien_amount: '$24,900', lien_amount_evidence_text: 'Lien amount: $24,900',
    judgment_amount: '$82,410.33', judgment_amount_evidence_text: 'Judgment amount: $82,410.33',
    redemption_amount: '$18,775', redemption_amount_evidence_text: 'Redemption amount: $18,775',
    minimum_bid: '$152,743', minimum_bid_evidence_text: 'Minimum bid: $152,743',
    opening_bid: '$45,000.00', opening_bid_evidence_text: 'Opening bid: $45,000.00',
    assessed_value: '$210,000', assessed_value_evidence_text: 'Assessed value: $210,000',
    public_estimate: '$260,000', public_estimate_evidence_text: 'Public estimate: $260,000',
    listing_price: '$245,000', listing_price_evidence_text: 'Listing price: $245,000',
    amount_or_judgment: '$300,000', amount_or_judgment_evidence_text: 'Legacy source amount: $300,000',
    source_document_url: SOURCE_URL
  });
  assert.deepStrictEqual(everyAmountType.map((item) => item.amount_type), distressEvidenceModel.AMOUNT_TYPES);
  assert.ok(everyAmountType.every((item) => item.exact_amount && item.operator_label && item.plain_english_meaning));
  assert.deepStrictEqual(everyAmountType.map((item) => item.semantic_role), [
    'debt', 'debt', 'debt', 'debt', 'debt', 'bid', 'bid',
    'value_context', 'value_context', 'value_context', 'unknown'
  ]);

  const valueContext = distressEvidenceModel.buildDistressEvidence({
    assessed_value: '$210,000',
    public_estimate: '$260,000',
    listing_price: '$245,000',
    source_proof_text: 'Assessed value $210,000; public estimate $260,000; listing price $245,000.',
    verified_sold_comp_count: 0
  });
  assert.deepStrictEqual(valueContext.money_facts.map((item) => item.amount_type), ['assessed_value', 'public_estimate', 'listing_price']);
  assert.strictEqual(valueContext.money_facts[1].plain_english_meaning, 'Public estimate - not ARV.');
  const callPrep = callPrepProjection.buildCallPrep({
    assessed_value: '$210,000', public_estimate: '$260,000', listing_price: '$245,000', verified_sold_comp_count: 0
  });
  assert.strictEqual(callPrep.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
  assert.match(callPrep.ARV_lock_reason, /3 sold comps/i);

  const candidate = propertyCandidate.normalizePropertyCandidate({
    normalized_address: '100 Truth St, Dallas, TX 75201',
    source_structured_address_verified: true,
    source_url: SOURCE_URL,
    judgment_amount: '$80,000',
    judgment_amount_evidence_text: 'Judgment amount: $80,000',
    tax_amount: '$12,000',
    tax_amount_evidence_text: 'Taxes due: $12,000'
  });
  assert.strictEqual(candidate.amount_or_judgment, '');
  assert.strictEqual(candidate.judgment_amount, '$80,000');
  assert.strictEqual(candidate.tax_due, '$12,000');
  assert.deepStrictEqual(candidate.distress_evidence.money_facts.map((item) => item.amount_type), ['tax_due', 'judgment_amount']);

  const passed = leadLifecycleStatus.computeLifecycleStatus({
    normalized_address: '100 Truth St, Dallas, TX 75201', source_url: SOURCE_URL, sale_date_iso: '2026-09-01'
  }, '2026-09-10');
  assert.strictEqual(passed.status, 'SALE_PASSED');
  assert.strictEqual(passed.quarantined, true);

  const repostWithoutEvidence = leadLifecycleStatus.computeLifecycleStatus({
    normalized_address: '100 Truth St, Dallas, TX 75201', source_url: SOURCE_URL, sale_date_iso: '2026-09-01', reposted_source_date: '2026-09-09'
  }, '2026-09-10');
  assert.strictEqual(repostWithoutEvidence.status, 'SALE_PASSED');
  const reposted = leadLifecycleStatus.computeLifecycleStatus({
    normalized_address: '100 Truth St, Dallas, TX 75201', source_url: SOURCE_URL, sale_date_iso: '2026-09-01',
    reposted_source_date: '2026-09-09', reposted_source_evidence_text: 'Reposted in the September official sale list.', reposted_source_url: SOURCE_URL
  }, '2026-09-10');
  assert.strictEqual(reposted.status, 'REPOSTED_OR_REPLACED');
  assert.strictEqual(reposted.quarantined, false);

  const disappeared = leadLifecycleStatus.computeLifecycleStatus({
    normalized_address: '100 Truth St, Dallas, TX 75201', source_url: SOURCE_URL,
    source_listing_status: 'not_present_in_latest_monthly_list', source_date: '2026-08-01'
  }, '2026-09-10');
  assert.strictEqual(disappeared.status, 'SOURCE_NO_LONGER_LISTED');
  assert.strictEqual(disappeared.quarantined, true);
  assert.doesNotMatch(disappeared.reason_text, /sold|resolved|withdrawn/i);

  const dateless = leadLifecycleStatus.computeLifecycleStatus({
    normalized_address: '100 Truth St, Dallas, TX 75201', source_url: SOURCE_URL,
    first_seen_at: '2026-09-09', last_seen_at: '2026-09-10', last_checked_at: '2026-09-10'
  }, '2026-09-10');
  assert.strictEqual(dateless.status, 'DATE_UNKNOWN_REVERIFY');
  assert.strictEqual(dateless.quarantined, true);

  const completeLinks = manualEvidencePacketService.researchLinks({
    normalized_address: '100 Truth St, Dallas, TX 75201', county: 'Dallas', state: 'TX'
  });
  ['Zillow subject search', 'Redfin subject search', 'Google Maps', 'County appraisal or assessor search'].forEach((label) => {
    assert.ok(completeLinks.some((item) => item.label === label), `${label} must be present`);
  });
  const partialLinks = manualEvidencePacketService.researchLinks({
    partial_address: '100 Truth St, Dallas, TX', county: 'Dallas', state: 'TX'
  });
  assert.ok(partialLinks.some((item) => /Zillow subject search \(partial address - verify first\)/.test(item.label)));
  assert.ok(partialLinks.every((item) => !/exact property/i.test(item.label)));

  console.log('distress evidence model tests passed');
})();
