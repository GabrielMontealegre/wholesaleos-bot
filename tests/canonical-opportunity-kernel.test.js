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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-canonical-opportunity-'));
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
const canonicalKernel = require('../modules/research/canonical-opportunity-kernel');
const selectedDealPacketService = require('../modules/research/selected-deal-packet-service');

const sourceUrl = 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345';

function baseCandidate(overrides = {}) {
  return Object.assign({
    candidate_id: 'pcd_kernel_test',
    source_id: 'tx_dallas_fsbo_contact_first',
    source_family: 'fsbo',
    source_name: 'Dallas FSBO',
    source_url: sourceUrl,
    source_classification: 'exact_property_record',
    normalized_address: '123 Main St, Dallas, TX 75208',
    motivation_type: 'FSBO',
    motivation_phrase: 'cash only',
    motivation_evidence_text: 'Active for sale by owner. Cash only.',
    source_proof_text: 'Active for sale by owner. Cash only. Call owner at (214) 555-0123.',
    current_status: 'active',
    status_evidence_text: 'active',
    status_verified_visible: true,
    contact_route: 'Direct Phone',
    contact_phone: '(214) 555-0123',
    contact_source_url: sourceUrl,
    contact_evidence_text: 'Call owner at (214) 555-0123.',
    contact_verification_status: 'verified_visible_source',
    contact_verified: true,
    risk_flags: ['POSTER_ROLE_UNVERIFIED']
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

function buildOpportunity(candidate, options = {}) {
  const packet = callReadyDealPacket.buildCallReadyDealPacket(candidate);
  const executionState = opportunitySpine.buildOpportunityExecutionState(packet);
  return canonicalKernel.buildCanonicalOpportunity({
    packet,
    execution_state: executionState
  }, Object.assign({
    now: '2026-06-23T00:00:00.000Z',
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' }
  }, options));
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
    const callReady = buildOpportunity(baseCandidate());
    assert.strictEqual(callReady.identity.normalized_address, '123 Main St, Dallas, TX 75208');
    assert.strictEqual(callReady.readiness.identity_ready, true);
    assert.strictEqual(callReady.readiness.source_ready, true);
    assert.strictEqual(callReady.readiness.call_ready, true);
    assert.strictEqual(callReady.money_path.current_stage, 'READY_TO_CALL');
    assert.strictEqual(callReady.money_path.next_best_action, 'CALL_SELLER');
    assert.strictEqual(callReady.money_path.next_best_action_label, 'Call seller');
    assert.strictEqual(callReady.money_path.progress_percentage, 55);
    assert.ok(callReady.operator_view.headline.includes('123 Main St'));
    assert.strictEqual(callReady.operator_view.badge, 'CALL READY');
    assert.ok(callReady.operator_view.readiness_checklist.some((item) => item.key === 'call_ready' && item.ready === true));
    assert.ok(callReady.operator_view.action_buttons.includes('Call seller'));
    assert.ok(callReady.operator_view.action_buttons.includes('Research comps'));
    assert.ok(callReady.operator_view.missing_evidence_checklist.includes('3 verified sold comps'));
    assert.ok(callReady.locks.includes('ARV_LOCKED_NO_VERIFIED_COMPS'));
    assert.ok(callReady.locks.includes('REPAIRS_LOCKED_NO_EVIDENCE'));
    assert.ok(callReady.locks.includes('MAO_LOCKED_NO_ARV_OR_REPAIRS'));
    assert.ok(callReady.locks.includes('BUYER_LOCKED_NO_MATCH'));
    assert.ok(callReady.locks.includes('TITLE_LOCKED_NO_TITLE_COMPANY'));
    assert.ok(callReady.audit.risk_flags.includes('POSTER_ROLE_UNVERIFIED'));
    assert.strictEqual(callReady.audit.preview_only, true);
    assert.strictEqual(callReady.audit.should_ingest, false);
    assert.strictEqual(callReady.audit.no_global_mutation, true);

    const outreachReady = buildOpportunity(baseCandidate({
      contact_route: 'Direct Email',
      contact_phone: '',
      contact_email: 'seller@example.com',
      contact_evidence_text: 'Email seller@example.com for details.'
    }));
    assert.strictEqual(outreachReady.readiness.call_ready, false);
    assert.strictEqual(outreachReady.readiness.outreach_ready, true);
    assert.strictEqual(outreachReady.money_path.current_stage, 'READY_FOR_OUTREACH');
    assert.strictEqual(outreachReady.money_path.next_best_action, 'SEND_VERIFIED_OUTREACH');
    assert.strictEqual(outreachReady.operator_view.badge, 'OUTREACH READY');
    assert.ok(outreachReady.locks.includes('CALL_LOCKED_NO_PHONE'));

    const incompleteIdentity = buildOpportunity(baseCandidate({
      source_url: 'https://dallas.craigslist.org/dal/reo/d/dallas-cash-only/7918000002.html',
      normalized_address: '',
      address: '',
      contact_route: 'Public Reply',
      contact_phone: '',
      contact_email: '',
      contact_source_url: 'https://dallas.craigslist.org/reply/dal/reo/7918000002/__SERVICE_ID__',
      contact_evidence_text: 'Public reply link visible on Craigslist property post.'
    }));
    assert.strictEqual(incompleteIdentity.readiness.identity_ready, false);
    assert.strictEqual(incompleteIdentity.money_path.current_stage, 'DISCOVERY');
    assert.strictEqual(incompleteIdentity.money_path.next_best_action, 'RESOLVE_PROPERTY_IDENTITY');
    assert.strictEqual(incompleteIdentity.operator_view.badge, 'NEEDS ADDRESS');
    assert.ok(incompleteIdentity.operator_view.missing_evidence_checklist.includes('complete property identity'));

    const valuedNoRepair = buildOpportunity(baseCandidate({
      verified_sold_comps: [soldComp(101, 220000), soldComp(102, 230000), soldComp(103, 240000)]
    }));
    assert.strictEqual(valuedNoRepair.readiness.comp_ready, true);
    assert.strictEqual(valuedNoRepair.readiness.arv_ready, true);
    assert.strictEqual(valuedNoRepair.readiness.repair_ready, false);
    assert.strictEqual(valuedNoRepair.readiness.mao_ready, false);
    assert.ok(valuedNoRepair.locks.includes('REPAIRS_LOCKED_NO_EVIDENCE'));
    assert.ok(valuedNoRepair.locks.includes('MAO_LOCKED_NO_ARV_OR_REPAIRS'));

    const valuedWithRepair = buildOpportunity(baseCandidate({
      verified_sold_comps: [soldComp(101, 220000), soldComp(102, 230000), soldComp(103, 240000)],
      repair_estimate: 30000
    }));
    assert.strictEqual(valuedWithRepair.readiness.comp_ready, true);
    assert.strictEqual(valuedWithRepair.readiness.repair_ready, true);
    assert.strictEqual(valuedWithRepair.readiness.mao_ready, true);
    assert.strictEqual(valuedWithRepair.readiness.offer_ready, true);
    assert.strictEqual(valuedWithRepair.money_path.current_stage, 'BUYER_MATCH');
    assert.strictEqual(valuedWithRepair.money_path.next_best_action, 'CALL_SELLER');
    assert.ok(valuedWithRepair.locks.includes('BUYER_LOCKED_NO_MATCH'));
    assert.ok(valuedWithRepair.locks.includes('TITLE_LOCKED_NO_TITLE_COMPANY'));

    const page = `<html>
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
      fetch_impl: async (url) => mockResponse(page, url)
    });
    assert.strictEqual(preview.packet_count, 1);
    assert.strictEqual(preview.opportunity_count, 1);
    assert.strictEqual(preview.canonical_opportunity_count, 1);
    assert.strictEqual(preview.canonical_opportunities[0].operator_view.badge, 'CALL READY');
    assert.strictEqual(preview.canonical_opportunities[0].money_path.next_best_action, 'CALL_SELLER');
    assert.strictEqual(preview.item_results[0].canonical_stage, 'READY_TO_CALL');
    assert.strictEqual(preview.diagnostics.canonical_stage_counts.READY_TO_CALL, 1);

    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')), initialStores.db);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.FINDME_SCOUT_JOBS_PATH, 'utf8')), initialStores.findme);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8')), initialStores.analyzer);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')), initialStores.dossiers);

    console.log('canonical opportunity kernel tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
