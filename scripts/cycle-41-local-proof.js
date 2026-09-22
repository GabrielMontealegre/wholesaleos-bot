'use strict';

// Deterministic fixture proof only. No browser, network, dashboard, or production access.
const fs = require('fs');
const path = require('path');
const agent = require('./wos-local-comp-agent');
const compEvidence = require('../modules/research/screenshot-comp-evidence');
const compResolution = require('../modules/research/disclosure-state-comp-resolution');

const output = path.resolve(__dirname, '..', 'exports', 'cycle-41-local-proof.json');
const subjectAddress = '3808 Kings Dr, Ennis, TX 75119';
const searchUrl = 'http://127.0.0.1:4141/address-search/zillow';
const detailUrl = 'http://127.0.0.1:4141/property-detail/3808-kings';
const soldUrl = 'http://127.0.0.1:4141/sold/zillow';
const subject = {
  normalized_address: subjectAddress, property_kind: 'single family', land_use: 'single family',
  beds: 3, baths: 2, sqft: 1640, year_built: 2003, lot_size: 7200,
  latitude: 32.3293, longitude: -96.6253
};

function fakeSearchPage() {
  let current = '';
  return {
    goto: async (url) => { current = url; return { status: () => 200 }; },
    url: () => current,
    locator: (selector) => ({
      innerText: async () => selector === 'body' ? 'Synthetic address search fixture' : '',
      count: async () => 1,
      evaluateAll: async () => [],
      first() { return this; },
      waitFor: async () => {}
    })
  };
}

async function main() {
  const page = fakeSearchPage();
  const resolved = await agent.resolveDetailUrlFromSearch(page, subjectAddress, 'zillow', {
    allow_local_source: true,
    search_url: searchUrl,
    visible_card_reader_impl: async () => [{ index: 0, text: `${subjectAddress} Synthetic fixture`, href: detailUrl, visible: true }]
  });
  if (resolved.blocked || resolved.detail_url !== detailUrl) throw new Error('synthetic_search_resolution_failed');
  const verification = await agent.detailAddressVerification(page, subjectAddress, {
    detail_address_reader_impl: async () => [subjectAddress]
  });
  if (!verification.matched) throw new Error('synthetic_detail_verification_failed');

  const subjectFields = agent.subjectFactsFromVisibleText(
    `${subjectAddress} Single family home 3 beds 2 baths 1,640 sqft Year built 2003 Lot size 7,200 sqft List price $320,000`,
    detailUrl
  );
  const soldTexts = [
    '$305,000 sold June 10, 2026 3812 Kings Dr, Ennis, TX 75119',
    '$299,000 sold May 22, 2026 3820 Kings Dr, Ennis, TX 75119',
    '$312,000 sold April 18, 2026 3704 Kings Dr, Ennis, TX 75119'
  ];
  const soldDates = ['2026-06-10', '2026-05-22', '2026-04-18'];
  const coordinates = [[32.3298, -96.6250], [32.3302, -96.6256], [32.3287, -96.6248]];
  const soldProposals = soldTexts.map((text, index) => {
    const parsed = compEvidence.extractCompCandidatesFromVisibleText(text, { state: 'TX', source_url: `${detailUrl}-comp-${index + 1}` })[0];
    const candidate = Object.assign({}, parsed, {
      sold_date: soldDates[index],
      property_kind: 'single family', land_use: 'single family', beds: 3, baths: 2, sqft: 1640,
      year_built: 2003, lot_size: 7200, latitude: coordinates[index][0], longitude: coordinates[index][1],
      similarity_basis: 'same single-family property type and living area', source_kind: 'operator_supplied_screenshot',
      source_url: `${detailUrl}-comp-${index + 1}`, evidence_text: 'Synthetic screenshot fixture with visible sold facts.'
    });
    const grid = compResolution.evaluateStrictCompGrid(candidate, subject, { today_iso: '2026-09-22' });
    return { evidence_type: 'sold_comp', operator_confirmed: false, fields: parsed, source_url: candidate.source_url,
      screenshot_id: `synthetic-shot-${index + 1}`, grid_verdict: { accepted: grid.accepted, rejected_reason: grid.rejected_reason, criteria: grid.criteria } };
  });

  const artifact = {
    data_kind: 'CYCLE_41_SYNTHETIC_LOCAL_PROOF', synthetic_fixture_only: true, network_requests: 0,
    subject_address: subjectAddress,
    resolution_chain: [
      { step: 'address_search', url: searchUrl, url_kind: 'address_search', host: '127.0.0.1', http_status: 200, address_match: 'EXACT', matched_card_text: resolved.matched_card_text },
      { step: 'property_detail', url: detailUrl, url_kind: 'property_detail', host: '127.0.0.1', http_status: 200, address_match: 'EXACT', matched_card_text: subjectAddress }
    ],
    subject_proposal: { evidence_type: 'subject_property', operator_confirmed: false, fields: subjectFields, source_url: detailUrl, screenshot_id: 'synthetic-subject-shot' },
    sold_search: { url: soldUrl, url_kind: 'sold_search' },
    sold_proposals: soldProposals,
    proposal_count: 1 + soldProposals.length,
    confirmed_count: 0,
    arv_status_before: 'ARV_LOCKED_NON_DISCLOSURE_STATE_MLS_REQUIRED',
    arv_status_after: 'ARV_LOCKED_NON_DISCLOSURE_STATE_MLS_REQUIRED',
    ready_to_offer: 'NO',
    preview_only: true, should_ingest: false, no_global_mutation: true, not_a_saved_lead: true
  };
  if (!artifact.proposal_count || artifact.confirmed_count !== 0 || artifact.arv_status_before !== artifact.arv_status_after || artifact.ready_to_offer !== 'NO') {
    throw new Error('synthetic_proof_safety_invariant_failed');
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Cycle 41 synthetic proof wrote ${artifact.proposal_count} unconfirmed proposals; ARV unchanged; ready_to_offer NO.`);
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
