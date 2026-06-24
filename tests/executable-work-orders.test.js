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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-exec-work-orders-'));
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

const selectedDealPacketService = require('../modules/research/selected-deal-packet-service');

function mockResponse(body, url, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
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

const env = {
  ENABLE_SEARCH_PROVIDER: 'true',
  SEARCH_PROVIDER: 'mock',
  SEARCH_PROVIDER_TIMEOUT_MS: '8000',
  SEARCH_PROVIDER_MAX_RESULTS: '20',
  NODE_ENV: 'test'
};

const sourceUrl = 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345';
const sourceResult = {
  title: '123 Main St Dallas TX 75208 active cash only fixer',
  snippet: 'Active for sale by owner. Cash only. Needs TLC. Call seller at (214) 555-0123.',
  url: sourceUrl,
  source_url: sourceUrl,
  display_address: '123 Main St, Dallas, TX 75208',
  address: '123 Main St, Dallas, TX 75208'
};

const phonePage = `<html>
  <head>
    <title>123 Main St active cash only property</title>
    <meta name="description" content="Active for sale by owner. Cash only. Needs TLC. Call seller at (214) 555-0123.">
  </head>
  <body>Active for sale by owner. Cash only. Needs TLC. Call seller at (214) 555-0123.</body>
</html>`;

const noContactPage = `<html>
  <head>
    <title>123 Main St active cash only property</title>
    <meta name="description" content="Active for sale by owner. Cash only. Needs TLC.">
  </head>
  <body>Active for sale by owner. Cash only. Needs TLC.</body>
</html>`;

function compResult(number, price, date = '2026-05-15') {
  const url = `https://www.realtor.com/realestateandhomes-detail/${number}-Oak-St_Dallas_TX_75208_M${number}`;
  return {
    title: `${number} Oak St Dallas TX 75208 sold for $${price.toLocaleString('en-US')}`,
    snippet: `Sold ${date} for $${price.toLocaleString('en-US')}. Similar Dallas home.`,
    url,
    source_url: url,
    display_address: `${number} Oak St, Dallas, TX 75208`,
    address: `${number} Oak St, Dallas, TX 75208`
  };
}

async function fetchWithPhone(url) {
  assert.strictEqual(url, sourceUrl);
  return mockResponse(phonePage, url);
}

async function fetchNoContact(url) {
  assert.strictEqual(url, sourceUrl);
  return mockResponse(noContactPage, url);
}

function packet(preview) {
  assert.strictEqual(preview.packet_count, 1);
  return preview.packets[0];
}

(async () => {
  try {
    const enriched = await selectedDealPacketService.runSelectedDealPacketPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      items: [{ address: '123 Main St, Dallas, TX 75208' }],
      source_mock_results: [sourceResult],
      comp_mock_results: [compResult(101, 220000), compResult(102, 230000), compResult(103, 240000)]
    }, {
      env,
      fetch_impl: fetchWithPhone
    });
    const enrichedPacket = packet(enriched);
    assert.strictEqual(enriched.diagnostics.executable_work_orders_enabled, true);
    assert.strictEqual(enriched.diagnostics.executable_work_orders_ran, true);
    assert.strictEqual(enriched.canonical_opportunity_before_execution.packet_status, 'RESEARCH_ONLY');
    assert.strictEqual(enriched.canonical_opportunity_after_execution.packet_status, 'CALL_READY');
    assert.strictEqual(enrichedPacket.packet_status, 'CALL_READY');
    assert.strictEqual(enrichedPacket.contact.route_type, 'DIRECT_PHONE');
    assert.strictEqual(enrichedPacket.contact.phone, '(214) 555-0123');
    assert.ok(enrichedPacket.contact.evidence_text.includes('(214) 555-0123'));
    assert.strictEqual(enrichedPacket.source_evidence.source_ready, true);
    assert.strictEqual(enrichedPacket.motivation_evidence.verbatim, true);
    assert.ok(enrichedPacket.motivation_evidence.exact_phrase.toLowerCase().includes('cash only'));
    assert.strictEqual(enrichedPacket.current_status.verified_visible_source, true);
    assert.strictEqual(enrichedPacket.comps.verified_count, 3);
    assert.strictEqual(enrichedPacket.arv.status, 'PRELIMINARY_ARV_AVAILABLE');
    assert.strictEqual(enrichedPacket.mao.status, 'MAO_LOCKED_NO_REPAIR_EVIDENCE');
    assert.strictEqual(enrichedPacket.offer_recommendation.maximum_contract_price_range, null);
    assert.ok(enriched.executed_work_orders.some((item) => item.type === 'VERIFY_PROPERTY_SOURCE' && item.evidence_added === true));
    assert.ok(enriched.executed_work_orders.some((item) => item.type === 'FIND_CONTACT_ROUTE' && item.status === 'completed'));
    assert.ok(enriched.executed_work_orders.some((item) => item.type === 'RUN_COMP_RESEARCH' && item.verified_sold_comp_count === 3));
    assert.ok(enriched.executed_work_orders.some((item) => item.type === 'CAPTURE_REPAIR_EVIDENCE' && item.status === 'completed_no_amount'));
    assert.strictEqual(enriched.comps_found[0].verified_count, 3);
    assert.strictEqual(enriched.contacts_found.length, 1);
    assert.strictEqual(enriched.source_pages_checked.length, 1);
    assert.ok(enriched.evidence_found.some((item) => item.type === 'repair_evidence'));
    assert.ok(enriched.remaining_locks.includes('MAO_LOCKED_NO_REPAIR_EVIDENCE'));
    assert.ok(enriched.updated_work_orders.some((item) => item.type === 'CALL_SELLER'));
    assert.ok(enriched.what_gabriel_can_do_now.includes('Call seller'));
    assert.ok(enriched.what_system_still_needs.includes('repair evidence or manual repair input'));
    assert.strictEqual(enriched.diagnostics.executable_work_order_diagnostics[0].provider_call_count, 2);
    assert.ok(enriched.diagnostics.executable_work_order_diagnostics[0].provider_call_count <= 4);
    assert.ok(enriched.diagnostics.executable_work_order_diagnostics[0].page_fetch_count <= 4);

    const noSource = await selectedDealPacketService.runSelectedDealPacketPreview({
      items: [{ address: '123 Main St, Dallas, TX 75208' }],
      source_mock_results: [],
      comp_mock_results: []
    }, { env, fetch_impl: fetchWithPhone });
    assert.strictEqual(packet(noSource).packet_status, 'RESEARCH_ONLY');
    assert.strictEqual(packet(noSource).source_evidence.source_ready, false);
    assert.ok(noSource.executed_work_orders.some((item) => item.type === 'VERIFY_PROPERTY_SOURCE' && item.status === 'incomplete'));

    const noPhone = await selectedDealPacketService.runSelectedDealPacketPreview({
      items: [{ address: '123 Main St, Dallas, TX 75208' }],
      source_mock_results: [sourceResult],
      comp_mock_results: [compResult(101, 220000), compResult(102, 230000)]
    }, { env, fetch_impl: fetchNoContact });
    assert.strictEqual(packet(noPhone).packet_status, 'CONTACT_LOOKUP');
    assert.strictEqual(packet(noPhone).contact.route_type, 'NONE');
    assert.strictEqual(packet(noPhone).contact.phone, '');
    assert.strictEqual(packet(noPhone).comps.verified_count, 2);
    assert.strictEqual(packet(noPhone).arv.status, 'ARV_LOCKED_NO_VERIFIED_COMPS');
    assert.ok(noPhone.executed_work_orders.some((item) => item.type === 'FIND_CONTACT_ROUTE' && item.status === 'incomplete'));
    assert.ok(noPhone.executed_work_orders.some((item) => item.type === 'RUN_COMP_RESEARCH' && item.status === 'incomplete'));

    await assert.rejects(
      selectedDealPacketService.runSelectedDealPacketPreview({
        execute_work_orders: true,
        items: [
          { address: '123 Main St, Dallas, TX 75208' },
          { address: '456 Elm St, Dallas, TX 75208' }
        ]
      }, { env }),
      (error) => error && error.code === 'max_executable_items_exceeded' && error.status_code === 400
    );

    const serviceSource = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'research', 'executable-work-orders.js'), 'utf8');
    assert.ok(!serviceSource.includes("require('../agents/comp-agent')"));
    assert.ok(!serviceSource.includes("require('../agents/skip-trace-agent')"));
    assert.strictEqual(enriched.diagnostics.legacy_comp_agent_invoked, false);
    assert.strictEqual(enriched.diagnostics.legacy_skip_trace_agent_invoked, false);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')), initialStores.db);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.FINDME_SCOUT_JOBS_PATH, 'utf8')), initialStores.findme);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8')), initialStores.analyzer);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')), initialStores.dossiers);

    console.log('executable work orders tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
