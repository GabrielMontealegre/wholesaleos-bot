'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (/(?:^|[\\/])agents[\\/](?:comp-agent|skip-trace-agent)$/.test(String(request))) {
    throw new Error(`Legacy agent must not load: ${request}`);
  }
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-opportunity-spine-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

const initialStores = {
  db: { leads: [], users: [] },
  findme: { version: 1, jobs: [] },
  analyzer: { version: 1, jobs: [] },
  dossiers: { version: 1, dossiers: [] }
};
fs.writeFileSync(process.env.DB_PATH, JSON.stringify(initialStores.db, null, 2));
fs.writeFileSync(process.env.FINDME_SCOUT_JOBS_PATH, JSON.stringify(initialStores.findme, null, 2));
fs.writeFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, JSON.stringify(initialStores.analyzer, null, 2));
fs.writeFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, JSON.stringify(initialStores.dossiers, null, 2));

const callReadyDealPacket = require('../modules/research/call-ready-deal-packet');
const opportunitySpine = require('../modules/research/opportunity-execution-spine');
const selectedDealPacketService = require('../modules/research/selected-deal-packet-service');

const sourceUrl = 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345';

function candidate(overrides = {}) {
  return Object.assign({
    candidate_id: 'pcd_opportunity_spine',
    source_family: 'fsbo',
    source_name: 'Selected FSBO property',
    source_url: sourceUrl,
    source_classification: 'exact_property_record',
    normalized_address: '123 Main St, Dallas, TX 75208',
    motivation_type: 'FSBO',
    motivation_phrase: 'cash only',
    motivation_evidence_text: 'Active for sale by owner. Cash only.',
    source_proof_text: 'Active for sale by owner. Cash only. Call seller at (214) 555-0123.',
    current_status: 'active',
    status_evidence_text: 'active',
    status_verified_visible: true,
    contact_route: 'Direct Phone',
    contact_phone: '(214) 555-0123',
    contact_source_url: sourceUrl,
    contact_evidence_text: 'Call seller at (214) 555-0123.',
    contact_verification_status: 'verified_visible_source',
    contact_verified: true
  }, overrides);
}

function soldComp(number, price) {
  return {
    comp_address: `${number} Oak St, Dallas, TX 75208`,
    sold_status: 'sold',
    sold_price: price,
    sold_date: '2026-05-15',
    source_url: `https://www.realtor.com/realestateandhomes-detail/${number}-Oak-St_Dallas_TX_75208_M${number}`,
    source_title: `${number} Oak St sold`,
    source_type: 'realtor sold property page'
  };
}

function mockResponse(body, url) {
  return {
    ok: true,
    status: 200,
    url,
    headers: {
      get(name) {
        if (/content-type/i.test(name)) return 'text/html; charset=utf-8';
        if (/content-length/i.test(name)) return String(Buffer.byteLength(body));
        return '';
      }
    },
    async text() {
      return body;
    }
  };
}

(async () => {
  try {
    const callPacket = callReadyDealPacket.buildCallReadyDealPacket(candidate());
    const callOpportunity = opportunitySpine.buildOpportunityExecutionState(callPacket);
    assert.strictEqual(callOpportunity.stage, opportunitySpine.OPPORTUNITY_STAGES.CONTACT_READY);
    assert.strictEqual(callOpportunity.execution.next_action, opportunitySpine.OPPORTUNITY_TASKS.CALL_SELLER);
    assert.strictEqual(callOpportunity.readiness.contact_call_ready, true);
    assert.strictEqual(callOpportunity.readiness.comp_ready, false);
    assert.ok(callOpportunity.execution.tasks.some((item) => item.type === opportunitySpine.OPPORTUNITY_TASKS.RESEARCH_VERIFIED_SOLD_COMPS));

    const sameOpportunity = opportunitySpine.buildOpportunityExecutionState(
      callReadyDealPacket.buildCallReadyDealPacket(candidate())
    );
    assert.strictEqual(sameOpportunity.opportunity_id, callOpportunity.opportunity_id);

    const evidenceOnlyPacket = callReadyDealPacket.buildCallReadyDealPacket(candidate({
      contact_route: 'Manual Lookup Needed',
      contact_phone: '',
      contact_evidence_text: '',
      contact_verified: false,
      contact_verification_status: 'unverified'
    }));
    const evidenceOnlyOpportunity = opportunitySpine.buildOpportunityExecutionState(evidenceOnlyPacket);
    assert.strictEqual(evidenceOnlyOpportunity.stage, opportunitySpine.OPPORTUNITY_STAGES.EVIDENCE_READY);
    assert.strictEqual(evidenceOnlyOpportunity.execution.next_action, opportunitySpine.OPPORTUNITY_TASKS.ACQUIRE_VERIFIED_CONTACT);

    const addressOnlyPacket = callReadyDealPacket.buildCallReadyDealPacket({
      normalized_address: '456 Elm St, Dallas, TX 75208'
    });
    const addressOnlyOpportunity = opportunitySpine.buildOpportunityExecutionState(addressOnlyPacket);
    assert.strictEqual(addressOnlyOpportunity.stage, opportunitySpine.OPPORTUNITY_STAGES.IDENTITY_READY);
    assert.strictEqual(addressOnlyOpportunity.execution.next_action, opportunitySpine.OPPORTUNITY_TASKS.VERIFY_PROPERTY_SOURCE);

    const incompleteIdentityPacket = callReadyDealPacket.buildCallReadyDealPacket({
      source_url: 'https://dallas.craigslist.org/dal/reo/d/dallas-cash-only/7918000002.html',
      source_classification: 'exact_property_record',
      motivation_phrase: 'cash only',
      motivation_evidence_text: 'cash only',
      source_proof_text: 'cash only',
      current_status: 'active',
      status_evidence_text: 'active',
      status_verified_visible: true
    });
    const incompleteIdentityOpportunity = opportunitySpine.buildOpportunityExecutionState(incompleteIdentityPacket);
    assert.strictEqual(incompleteIdentityOpportunity.stage, opportunitySpine.OPPORTUNITY_STAGES.DISCOVERED);
    assert.strictEqual(incompleteIdentityOpportunity.execution.next_action, opportunitySpine.OPPORTUNITY_TASKS.RESOLVE_PROPERTY_IDENTITY);

    const valuedPacket = callReadyDealPacket.buildCallReadyDealPacket(candidate({
      verified_sold_comps: [soldComp(101, 220000), soldComp(102, 230000), soldComp(103, 240000)],
      repair_estimate: 30000
    }));
    const valuedOpportunity = opportunitySpine.buildOpportunityExecutionState(valuedPacket);
    assert.strictEqual(valuedOpportunity.stage, opportunitySpine.OPPORTUNITY_STAGES.CONTACT_READY);
    assert.strictEqual(valuedOpportunity.readiness.comp_ready, true);
    assert.strictEqual(valuedOpportunity.readiness.repair_ready, true);
    assert.strictEqual(valuedOpportunity.readiness.mao_ready, true);
    assert.strictEqual(valuedOpportunity.readiness.offer_review_ready, true);
    assert.strictEqual(valuedOpportunity.readiness.offer_approved, false);
    assert.ok(valuedOpportunity.execution.tasks.some((item) => item.type === opportunitySpine.OPPORTUNITY_TASKS.REVIEW_DRAFT_OFFER));
    assert.strictEqual(valuedOpportunity.execution.next_action, opportunitySpine.OPPORTUNITY_TASKS.CALL_SELLER);

    const phonePage = `<html>
      <head>
        <title>123 Main St active cash only property</title>
        <meta name="description" content="Active for sale by owner. Cash only. Call seller at (214) 555-0123.">
        <script type="application/ld+json">{
          "@type":"SingleFamilyResidence",
          "address":{
            "streetAddress":"123 Main St",
            "addressLocality":"Dallas",
            "addressRegion":"TX",
            "postalCode":"75208"
          }
        }</script>
      </head>
      <body>Active for sale by owner. Cash only. Call seller at (214) 555-0123.</body>
    </html>`;
    const preview = await selectedDealPacketService.runSelectedDealPacketPreview({
      items: [{ url: sourceUrl }],
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' }
    }, {
      fetch_impl: async (url) => mockResponse(phonePage, url)
    });
    assert.strictEqual(preview.packet_count, 1);
    assert.strictEqual(preview.opportunity_count, 1);
    assert.strictEqual(preview.opportunities[0].stage, opportunitySpine.OPPORTUNITY_STAGES.CONTACT_READY);
    assert.strictEqual(preview.item_results[0].opportunity_id, preview.opportunities[0].opportunity_id);
    assert.strictEqual(preview.item_results[0].next_action, opportunitySpine.OPPORTUNITY_TASKS.CALL_SELLER);
    assert.strictEqual(preview.diagnostics.opportunity_stage_counts.CONTACT_READY, 1);

    for (const opportunity of [
      callOpportunity,
      evidenceOnlyOpportunity,
      addressOnlyOpportunity,
      incompleteIdentityOpportunity,
      valuedOpportunity,
      preview.opportunities[0]
    ]) {
      assert.strictEqual(opportunity.preview_only, true);
      assert.strictEqual(opportunity.should_ingest, false);
      assert.strictEqual(opportunity.no_global_mutation, true);
    }

    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')), initialStores.db);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.FINDME_SCOUT_JOBS_PATH, 'utf8')), initialStores.findme);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8')), initialStores.analyzer);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')), initialStores.dossiers);

    console.log('opportunity execution spine tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
