'use strict';

// Synthetic-only proof for address-search card selection and same-host redirect.
const fs = require('fs');
const path = require('path');
const agent = require('./wos-local-comp-agent');
const manualEvidence = require('../modules/research/manual-evidence-packet-service');

const output = path.resolve(__dirname, '..', 'exports', 'cycle-42-local-proof.json');
const address = '3808 Kings Dr, Ennis, TX 75119';
const searchUrl = 'http://127.0.0.1:4141/address-search/zillow';
const detailUrl = 'http://127.0.0.1:4141/property-detail/3808-kings';
const market = { city: 'Ennis', county: 'Ellis', state: 'TX' };
const row = { queue_key: 'cycle42-synthetic', normalized_address: address, address_state: 'complete_source_address',
  source_structured_address_verified: true, property_identity_source_only: true, preview_only: true, should_ingest: false, not_a_saved_lead: true };
const pageText = `${address} Single family home 3 beds 2 baths 1,640 sqft Year built 2003 Lot size 7,200 sqft Zestimate $268,400`;

function makePage({ direct, cards }) {
  let currentUrl = '';
  let currentBody = '';
  const navigations = [];
  const page = {
    goto: async (url) => {
      navigations.push(url);
      currentUrl = direct && url === searchUrl ? detailUrl : url;
      currentBody = currentUrl === detailUrl ? pageText : 'Synthetic address search results';
      return { status: () => 200 };
    },
    url: () => currentUrl,
    locator: () => ({ innerText: async () => currentBody, count: async () => 1, first() { return this; }, waitFor: async () => {} })
  };
  return { page, navigations, cards };
}

async function proveShape(shape) {
  const fixture = makePage({ direct: shape === 'direct_redirect', cards: [{ index: 0, text: `${address} For sale`, href: detailUrl, visible: true }] });
  const resolved = await agent.resolveDetailUrlFromSearch(fixture.page, address, 'zillow', {
    allow_local_source: true, search_url: searchUrl,
    visible_card_reader_impl: async () => fixture.cards
  });
  if (resolved.blocked || resolved.detail_url !== detailUrl) throw new Error(`${shape}_resolution_failed`);
  if (!resolved.direct_redirect) await fixture.page.goto(resolved.detail_url);
  const verification = await agent.detailAddressVerification(fixture.page, address, { detail_address_reader_impl: async () => [address] });
  if (!verification.matched) throw new Error(`${shape}_address_verification_failed`);
  const chain = [];
  if (resolved.direct_redirect) {
    agent.appendResolutionStep({ mode: 'subject_facts', resolution_chain: chain }, { step: 'address_search', url: detailUrl, url_kind: 'property_detail',
      requested_url: resolved.requested_url, final_url: resolved.final_url, redirected: resolved.redirected,
      url_kind_requested: resolved.url_kind_requested, url_kind_final: resolved.url_kind_final, host: '127.0.0.1', http_status: 200, address_match: 'EXACT' });
  } else {
    agent.appendResolutionStep({ mode: 'subject_facts', resolution_chain: chain }, { step: 'address_search', url: searchUrl, url_kind: 'address_search',
      requested_url: searchUrl, final_url: searchUrl, redirected: false, url_kind_requested: 'address_search', url_kind_final: 'address_search',
      host: '127.0.0.1', http_status: 200, address_match: 'EXACT' });
    agent.appendResolutionStep({ mode: 'subject_facts', resolution_chain: chain }, { step: 'property_detail', url: detailUrl, url_kind: 'property_detail',
      requested_url: detailUrl, final_url: detailUrl, redirected: false, url_kind_requested: 'property_detail', url_kind_final: 'property_detail',
      host: '127.0.0.1', http_status: 200, address_match: 'EXACT' });
  }
  const fields = agent.subjectFactsFromVisibleText(pageText, detailUrl);
  const proposal = { evidence_type: 'subject_property', fields, operator_confirmed: false, source_url: detailUrl };
  if (fixture.navigations.length !== (shape === 'direct_redirect' ? 1 : 2)) throw new Error(`${shape}_navigation_count_invalid`);
  return { shape, navigations: fixture.navigations.length, resolution_chain: chain, proposal };
}

async function main() {
  const direct = await proveShape('direct_redirect');
  const card = await proveShape('search_card');
  const before = manualEvidence.evaluatePacket({ evidence_items: [] }, row, { today_iso: '2026-09-22' });
  const after = manualEvidence.evaluatePacket({ evidence_items: [direct.proposal, card.proposal] }, row, { today_iso: '2026-09-22' });
  const artifact = {
    data_kind: 'CYCLE_42_SYNTHETIC_LOCAL_PROOF', synthetic_fixture_only: true, network_requests: 0,
    market, subject_address: address, flows: [direct, card],
    confirmed_proposal_count: 0,
    arv_status_before: before.arv_status, arv_status_after: after.arv_status,
    arv_range_after: after.arv_range, verified_sold_comp_count_after: after.verified_sold_comp_count,
    ready_to_offer_after: after.readiness.ready_to_offer.status,
    preview_only: true, should_ingest: false, no_global_mutation: true, not_a_saved_lead: true
  };
  if (artifact.flows.some((flow) => flow.proposal.operator_confirmed !== false || flow.resolution_chain.at(-1).url_kind_final !== 'property_detail' || flow.resolution_chain.at(-1).address_match !== 'EXACT') ||
      artifact.arv_status_before !== artifact.arv_status_after || artifact.confirmed_proposal_count !== 0 || artifact.ready_to_offer_after !== 'NO') {
    throw new Error('cycle42_synthetic_proof_invariant_failed');
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log('Cycle 42 synthetic proof: direct redirect and card paths verified; proposals unconfirmed; ARV unchanged; ready_to_offer NO.');
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
