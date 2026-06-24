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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-work-orders-'));
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
const workOrders = require('../modules/research/opportunity-work-orders');

const sourceUrl = 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345';

function baseCandidate(overrides = {}) {
  return Object.assign({
    candidate_id: 'pcd_work_orders',
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

function canonicalOpportunity(input) {
  const packet = callReadyDealPacket.buildCallReadyDealPacket(input);
  const executionState = opportunitySpine.buildOpportunityExecutionState(packet);
  return canonicalKernel.buildCanonicalOpportunity({
    packet,
    execution_state: executionState
  }, {
    now: '2026-06-23T00:00:00.000Z',
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' }
  });
}

function orderTypes(opportunity) {
  return opportunity.work_orders.map((item) => item.type);
}

function assertSortedByPriority(opportunity) {
  const priorities = opportunity.work_orders.map((item) => item.priority);
  assert.deepStrictEqual(priorities, priorities.slice().sort((a, b) => a - b));
}

(async () => {
  try {
    const missingIdentity = canonicalOpportunity(baseCandidate({
      source_url: 'https://dallas.craigslist.org/dal/reo/d/dallas-cash-only/7918000002.html',
      normalized_address: '',
      address: '',
      contact_route: 'Public Reply',
      contact_phone: '',
      contact_source_url: 'https://dallas.craigslist.org/reply/dal/reo/7918000002/__SERVICE_ID__',
      contact_evidence_text: 'Public reply link visible on Craigslist property post.'
    }));
    assert.strictEqual(missingIdentity.readiness_outcome, workOrders.READINESS_OUTCOMES.RESEARCH_NEEDED);
    assert.ok(orderTypes(missingIdentity).includes(workOrders.WORK_ORDER_TYPES.VERIFY_PROPERTY_IDENTITY));
    assert.strictEqual(missingIdentity.work_orders.find((item) => item.type === workOrders.WORK_ORDER_TYPES.VERIFY_PROPERTY_IDENTITY).owner, 'Gabriel');
    assertSortedByPriority(missingIdentity);

    const phoneNoNumbers = canonicalOpportunity(baseCandidate());
    assert.strictEqual(phoneNoNumbers.readiness_outcome, workOrders.READINESS_OUTCOMES.CALL_READY_NUMBERS_LOCKED);
    assert.ok(orderTypes(phoneNoNumbers).includes(workOrders.WORK_ORDER_TYPES.CALL_SELLER));
    assert.ok(orderTypes(phoneNoNumbers).includes(workOrders.WORK_ORDER_TYPES.RUN_COMP_RESEARCH));
    assert.ok(orderTypes(phoneNoNumbers).includes(workOrders.WORK_ORDER_TYPES.CAPTURE_REPAIR_EVIDENCE));
    assert.ok(phoneNoNumbers.operator_view.what_gabriel_can_do_now.includes('Call seller'));
    assert.ok(phoneNoNumbers.operator_view.why_numbers_are_locked.includes('ARV is locked'));
    assert.ok(phoneNoNumbers.operator_view.seller_question_to_unlock_numbers.includes('repairs'));

    const outreachNoNumbers = canonicalOpportunity(baseCandidate({
      contact_route: 'Public Reply',
      contact_phone: '',
      contact_email: '',
      contact_source_url: 'https://dallas.craigslist.org/reply/dal/reo/7918000002/__SERVICE_ID__',
      contact_evidence_text: 'Public reply link visible on Craigslist property post.'
    }));
    assert.strictEqual(outreachNoNumbers.readiness_outcome, workOrders.READINESS_OUTCOMES.OUTREACH_READY_NUMBERS_LOCKED);
    assert.ok(orderTypes(outreachNoNumbers).includes(workOrders.WORK_ORDER_TYPES.SEND_SELLER_OUTREACH));
    assert.ok(!orderTypes(outreachNoNumbers).includes(workOrders.WORK_ORDER_TYPES.CALL_SELLER));

    const noContact = canonicalOpportunity(baseCandidate({
      contact_route: 'Manual Lookup Needed',
      contact_phone: '',
      contact_source_url: '',
      contact_evidence_text: '',
      contact_verified: false,
      contact_verification_status: 'unverified'
    }));
    assert.strictEqual(noContact.readiness_outcome, workOrders.READINESS_OUTCOMES.RESEARCH_NEEDED);
    assert.ok(orderTypes(noContact).includes(workOrders.WORK_ORDER_TYPES.FIND_CONTACT_ROUTE));
    assert.ok(!orderTypes(noContact).includes(workOrders.WORK_ORDER_TYPES.CALL_SELLER));
    assert.ok(!orderTypes(noContact).includes(workOrders.WORK_ORDER_TYPES.SEND_SELLER_OUTREACH));

    const offerReady = canonicalOpportunity(baseCandidate({
      verified_sold_comps: [soldComp(101, 220000), soldComp(102, 230000), soldComp(103, 240000)],
      repair_estimate: 30000
    }));
    assert.strictEqual(offerReady.readiness_outcome, workOrders.READINESS_OUTCOMES.OFFER_READY);
    assert.ok(orderTypes(offerReady).includes(workOrders.WORK_ORDER_TYPES.CALCULATE_ARV));
    assert.ok(orderTypes(offerReady).includes(workOrders.WORK_ORDER_TYPES.CALCULATE_MAO));
    assert.ok(orderTypes(offerReady).includes(workOrders.WORK_ORDER_TYPES.DRAFT_OFFER));
    assert.ok(orderTypes(offerReady).includes(workOrders.WORK_ORDER_TYPES.MATCH_BUYERS));
    assert.ok(orderTypes(offerReady).includes(workOrders.WORK_ORDER_TYPES.SELECT_TITLE_COMPANY));
    assert.ok(orderTypes(offerReady).includes(workOrders.WORK_ORDER_TYPES.PREPARE_CONTRACT));
    assert.strictEqual(offerReady.work_orders.find((item) => item.type === workOrders.WORK_ORDER_TYPES.CALCULATE_ARV).safe_to_auto_run, true);
    assert.strictEqual(offerReady.work_orders.find((item) => item.type === workOrders.WORK_ORDER_TYPES.CALCULATE_MAO).safe_to_auto_run, true);
    assert.strictEqual(offerReady.work_orders.find((item) => item.type === workOrders.WORK_ORDER_TYPES.DRAFT_OFFER).safe_to_auto_run, false);
    assert.ok(offerReady.operator_view.what_gabriel_can_do_now.includes('Call seller'));
    assert.ok(offerReady.operator_view.what_gabriel_can_do_now.includes('Draft offer'));

    const lowEvidence = canonicalOpportunity({});
    assert.strictEqual(lowEvidence.readiness_outcome, workOrders.READINESS_OUTCOMES.DEAD_OR_LOW_EVIDENCE);
    assert.deepStrictEqual(orderTypes(lowEvidence), [workOrders.WORK_ORDER_TYPES.MARK_LOW_EVIDENCE]);
    assert.ok(lowEvidence.work_order_summary.low_evidence_reasons.includes('missing address'));
    assert.ok(lowEvidence.operator_view.next_3_tasks[0].label.includes('Mark low evidence'));

    for (const opportunity of [missingIdentity, phoneNoNumbers, outreachNoNumbers, noContact, offerReady, lowEvidence]) {
      assert.strictEqual(opportunity.preview_only, true);
      assert.strictEqual(opportunity.should_ingest, false);
      assert.strictEqual(opportunity.no_global_mutation, true);
      assert.strictEqual(opportunity.work_order_summary.preview_only, true);
      assert.strictEqual(opportunity.work_order_summary.should_ingest, false);
      assert.strictEqual(opportunity.work_order_summary.no_global_mutation, true);
      assert.ok(Array.isArray(opportunity.money_path.task_queue));
      assert.strictEqual(opportunity.money_path.task_queue.length, opportunity.work_orders.length);
      assertSortedByPriority(opportunity);
      for (const item of opportunity.work_orders) {
        assert.ok(item.id);
        assert.ok(item.type);
        assert.ok(Number.isFinite(item.priority));
        assert.strictEqual(item.status, 'OPEN');
        assert.ok(['system', 'Gabriel', 'future_provider'].includes(item.owner));
        assert.ok(item.reason);
        assert.ok('required_input' in item);
        assert.ok('output_expected' in item);
        assert.ok(Array.isArray(item.blocked_by));
        assert.ok(Array.isArray(item.unlocks));
        assert.strictEqual(typeof item.can_run_now, 'boolean');
        assert.strictEqual(typeof item.safe_to_auto_run, 'boolean');
        assert.ok(item.estimated_value_impact);
        assert.ok(item.user_visible_label);
      }
    }

    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')), initialStores.db);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.FINDME_SCOUT_JOBS_PATH, 'utf8')), initialStores.findme);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8')), initialStores.analyzer);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')), initialStores.dossiers);

    console.log('opportunity work orders tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
