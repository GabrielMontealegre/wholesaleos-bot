'use strict';

const assert = require('assert');

const sourceAdapterRegistry = require('../modules/sources/source-adapter-registry');
const foreclosureAdapter = require('../modules/sources/dallas-foreclosure-acquisition-adapter');
const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');
const sourceAcquisitionScore = require('../modules/research/source-acquisition-score');

(async () => {
  assert.ok(sourceAdapterRegistry.adapterForSourceId('tx_dallas_county_clerk_foreclosure_notices'));
  assert.strictEqual(sourceAdapterRegistry.adapterIdForSourceId('tx_dallas_county_clerk_foreclosure_notices'), 'dallas_foreclosure_acquisition_adapter');
  assert.strictEqual(sourceAdapterRegistry.adapterFamilyForSourceId('tx_dallas_county_clerk_foreclosure_notices'), 'pdf_list_adapter');

  const sourceText = [
    'NOTICE OF SUBSTITUTE TRUSTEE SALE',
    'Property Address: 7421 Birch Ave, Dallas, TX 75228',
    'Borrower: Jane Doe',
    'Sale Date: 07/02/2026',
    'Case Number: 2026-12345',
    'Parcel: 123456789',
    'Foreclosure sale notice. Investor special - cash only.',
    '',
    'NOTICE OF SUBSTITUTE TRUSTEE SALE',
    'Property Address: 7423 Birch Ave, Dallas, TX 75228',
    'Borrower: John Smith',
    'Sale Date: 07/02/2026',
    'Case Number: 2026-12346',
    'Parcel: 987654321',
    'Foreclosure sale notice. As-is fixer upper.',
    '',
    'NOTICE OF SUBSTITUTE TRUSTEE SALE',
    'Property Address: 7425 Birch Ave, Dallas, TX 75228',
    'Borrower: No Date Buyer',
    'Case Number: 2026-12347',
    'Parcel: 111222333'
  ].join('\n');

  const sourceHtml = '<html><body><a href="https://www.dallascounty.org/government/county-clerk/recording/foreclosures/2026-07-02-notice.pdf">Official PDF</a></body></html>';
  const records = [
    {
      property_address: '7421 Birch Ave, Dallas, TX 75228',
      source_row_reference: '2026-12345',
      contact_route: 'Manual Lookup Needed',
      source_proof_text: 'Foreclosure sale notice.'
    },
    {
      property_address: '7423 Birch Ave, Dallas, TX 75228',
      source_row_reference: '2026-12346',
      contact_route: 'Public Contact Form',
      contact_phone: '214-555-1212',
      source_proof_text: 'Foreclosure sale notice.'
    }
  ];

  const adapterResult = await foreclosureAdapter.runDallasForeclosureAcquisitionAdapter({
    source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
    source_document_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures/2026-07-02-notice.pdf',
    source_text: sourceText,
    source_html: sourceHtml,
    records,
    captured_at: '2026-06-17T00:00:00.000Z',
    max_rows: 10,
    max_files: 2
  });

  assert.strictEqual(adapterResult.status, 'available');
  assert.strictEqual(adapterResult.attempted, true);
  assert.ok(Array.isArray(adapterResult.candidates));
  assert.ok(adapterResult.candidates.length >= 3);
  assert.ok(Array.isArray(adapterResult.cards));
  assert.strictEqual(adapterResult.preview_only, true);
  assert.strictEqual(adapterResult.should_ingest, false);
  assert.ok(adapterResult.diagnostics);
  assert.ok(adapterResult.diagnostics.evidence_links_found >= 1);
  assert.ok(adapterResult.diagnostics.phrase_candidate_seen >= 1);
  assert.ok(adapterResult.diagnostics.status_candidate_seen >= 1);
  assert.ok(adapterResult.diagnostics.exact_phrases_promoted >= 1);
  assert.ok(adapterResult.diagnostics.source_url_classification);

  const byAddress = new Map(adapterResult.candidates.map((candidate) => [candidate.normalized_address, candidate]));
  const skipTrace = byAddress.get('7421 Birch Ave, Dallas, TX 75228');
  const pipeline = byAddress.get('7423 Birch Ave, Dallas, TX 75228');
  const manualReview = byAddress.get('7425 Birch Ave, Dallas, TX 75228');

  assert.ok(skipTrace);
  assert.ok(pipeline);
  assert.ok(manualReview);
  assert.ok(skipTrace.lead_evidence);
  assert.strictEqual(skipTrace.lead_evidence.normalized_address, '7421 Birch Ave, Dallas, TX 75228');
  assert.ok(skipTrace.lead_evidence.exact_source_phrase);
  assert.strictEqual(skipTrace.next_best_worker, sourceAcquisitionScore.NEXT_BEST_WORKERS.SKIP_TRACE);
  assert.strictEqual(pipeline.next_best_worker, sourceAcquisitionScore.NEXT_BEST_WORKERS.PIPELINE);
  assert.ok(pipeline.contact_confidence >= 50);
  assert.ok(manualReview.missing_evidence.includes('current listing status'));

  const score = sourceAcquisitionScore.scoreCandidate({
    source_confidence: 40,
    motivation_confidence: 80,
    identity_confidence: 90,
    contact_confidence: 90
  });
  assert.strictEqual(sourceAcquisitionScore.routeNextBestWorker({}, score), sourceAcquisitionScore.NEXT_BEST_WORKERS.MANUAL_REVIEW);

  const coreResult = await sourceAcquisitionOrchestrator.runAcquisitionCore({
    job_id: 'acq_core_foreclosure_test',
    discovery_batch_id: 'acq_core_foreclosure_test',
    city: 'Dallas',
    state: 'TX',
    county: 'Dallas',
    source_families: ['preforeclosure_trustee_notice']
  }, {
    source_text: sourceText,
    source_html: sourceHtml,
    records,
    source_document_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures/2026-07-02-notice.pdf'
  });

  assert.strictEqual(coreResult.status, 'available');
  assert.strictEqual(coreResult.attempted, true);
  assert.ok(coreResult.source_ids_attempted.includes('tx_dallas_county_clerk_foreclosure_notices'));
  assert.ok(coreResult.source_families_attempted.includes('preforeclosure_trustee_notice'));
  assert.ok(coreResult.candidates_found >= 3);
  assert.ok(coreResult.cards.length >= 3);
  assert.ok(coreResult.next_best_worker_counts.SKIP_TRACE >= 1);
  assert.ok(coreResult.next_best_worker_counts.PIPELINE >= 1);
  assert.strictEqual(coreResult.preview_only, true);
  assert.strictEqual(coreResult.should_ingest, false);
  assert.strictEqual(coreResult.persist_scope, 'batch_only');

  const firstCard = coreResult.cards.find((card) => /7421 Birch/i.test(card.address_or_source_text));
  assert.ok(firstCard);
  assert.strictEqual(firstCard.preview_only, true);
  assert.strictEqual(firstCard.should_ingest, false);
  assert.ok(Array.isArray(firstCard.missing_evidence));

  console.log('dallas foreclosure acquisition adapter tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
