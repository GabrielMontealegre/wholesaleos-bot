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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-selected-deal-packet-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.FINDME_SCOUT_JOBS_PATH = path.join(tmpDir, 'findme-scout-jobs.json');
process.env.AI_DEAL_ANALYZER_JOBS_PATH = path.join(tmpDir, 'ai-deal-analyzer-jobs.json');
process.env.DEAL_CALL_DOSSIERS_PATH = path.join(tmpDir, 'deal-call-dossiers.json');

fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [], users: [] }, null, 2));
fs.writeFileSync(process.env.FINDME_SCOUT_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, JSON.stringify({ version: 1, jobs: [] }, null, 2));
fs.writeFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, JSON.stringify({ version: 1, dossiers: [] }, null, 2));

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

function soldComp(number, price, address = `${number} Oak St, Dallas, TX 75208`) {
  return {
    comp_address: address,
    sold_status: 'sold',
    sold_price: price,
    sold_date: '2026-05-15',
    source_url: `https://www.realtor.com/realestateandhomes-detail/${number}-Oak-St_Dallas_TX_75208_M${number}`,
    source_title: `${address} sold`,
    source_type: 'realtor sold property page'
  };
}

const phoneUrl = 'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345';
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

const formUrl = 'https://www.fsbo.com/property/789-pine-rd-dallas-tx-75208';
const formPage = `<html>
  <head>
    <title>Active FSBO property</title>
    <meta property="og:title" content="789 Pine Rd, Dallas, TX 75208">
    <meta property="og:description" content="Active for sale by owner. Needs TLC.">
  </head>
  <body>
    Active for sale by owner. Needs TLC.
    <form class="property-contact"><button>Contact seller</button></form>
  </body>
</html>`;

const fetchCalls = [];
async function fetchImpl(url) {
  fetchCalls.push(url);
  if (url === phoneUrl) return mockResponse(phonePage, url);
  if (url === formUrl) return mockResponse(formPage, url);
  throw new Error(`Unexpected fetch: ${url}`);
}

(async () => {
  try {
    const routeSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(routeSource.includes("app.post('/api/preview/selected-deal-packet', requireAdmin"), 'selected route must require admin');
    assert.ok(routeSource.includes('selectedDealPacketService.runSelectedDealPacketPreview'), 'route must use selected packet service');
    assert.ok(routeSource.indexOf("app.post('/api/preview/selected-deal-packet'") < routeSource.indexOf('app.listen(PORT, () => {'), 'route must register before listen');

    const preview = await selectedDealPacketService.runSelectedDealPacketPreview({
      items: [
        { url: phoneUrl },
        { url: formUrl },
        { address: '456 Elm St, Dallas, TX 75208' }
      ],
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      max_items: 99,
      max_page_fetches: 99,
      timeout_ms: 99999,
      retries: 9
    }, { fetch_impl: fetchImpl });

    assert.strictEqual(preview.preview_only, true);
    assert.strictEqual(preview.should_ingest, false);
    assert.strictEqual(preview.no_global_mutation, true);
    assert.deepStrictEqual(preview.caps, {
      max_items: 3,
      max_page_fetches: 4,
      max_page_bytes: 512 * 1024,
      timeout_ms: 8000,
      retries: 0
    });
    assert.strictEqual(preview.page_fetches, 2);
    assert.strictEqual(fetchCalls.length, 2);
    assert.strictEqual(preview.packet_count, 3);

    const phonePacket = preview.packets[0];
    assert.strictEqual(phonePacket.packet_status, 'CALL_READY');
    assert.strictEqual(phonePacket.property.normalized_address, '123 Main St, Dallas, TX 75208');
    assert.strictEqual(phonePacket.property.address_evidence_source, 'structured_page_metadata');
    assert.strictEqual(phonePacket.contact.route_type, 'DIRECT_PHONE');
    assert.strictEqual(phonePacket.contact.phone, '(214) 555-0123');
    assert.ok(phonePacket.contact.evidence_text.includes('(214) 555-0123'));
    assert.strictEqual(phonePacket.motivation_evidence.verbatim, true);
    assert.ok(phonePacket.motivation_evidence.exact_phrase.toLowerCase().includes('cash only'));
    assert.strictEqual(phonePacket.current_status.verified_visible_source, true);
    assert.ok(phonePacket.call_script.why_calling);
    assert.strictEqual(phonePacket.questions_to_ask_seller.length, 5);
    assert.strictEqual(phonePacket.arv.range, null);
    assert.strictEqual(phonePacket.mao.range, null);
    assert.strictEqual(phonePacket.offer_recommendation.maximum_contract_price_range, null);

    const formPacket = preview.packets[1];
    assert.strictEqual(formPacket.packet_status, 'OUTREACH_READY');
    assert.strictEqual(formPacket.property.normalized_address, '789 Pine Rd, Dallas, TX 75208');
    assert.strictEqual(formPacket.property.address_evidence_source, 'page_metadata');
    assert.strictEqual(formPacket.contact.route_type, 'PUBLIC_FORM');
    assert.strictEqual(formPacket.contact.outreach_allowed, true);
    assert.strictEqual(formPacket.contact.call_allowed, false);
    assert.ok(formPacket.call_script.why_calling);
    assert.strictEqual(formPacket.questions_to_ask_seller.length, 5);

    const addressOnlyPacket = preview.packets[2];
    assert.strictEqual(addressOnlyPacket.packet_status, 'RESEARCH_ONLY');
    assert.strictEqual(addressOnlyPacket.property.normalized_address, '456 Elm St, Dallas, TX 75208');
    assert.strictEqual(addressOnlyPacket.property.address_evidence_source, 'supplied_complete_address');
    assert.strictEqual(addressOnlyPacket.call_script.why_calling, '');
    assert.deepStrictEqual(addressOnlyPacket.questions_to_ask_seller, []);
    assert.ok(addressOnlyPacket.lock_states.includes('ARV_LOCKED_NO_VERIFIED_COMPS'));
    assert.ok(addressOnlyPacket.lock_states.includes('MAO_LOCKED_NO_ARV'));
    assert.ok(addressOnlyPacket.lock_states.includes('OFFER_LOCKED_NO_CONTACT'));

    const generic = await selectedDealPacketService.runSelectedDealPacketPreview({
      items: [{ url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX' }]
    }, { fetch_impl: fetchImpl });
    assert.strictEqual(generic.packet_count, 0);
    assert.strictEqual(generic.page_fetches, 0);
    assert.strictEqual(generic.rejected_items[0].reason, 'generic_or_non_property_source');

    const mismatch = await selectedDealPacketService.runSelectedDealPacketPreview({
      items: [{ url: phoneUrl, address: '999 Different Rd, Dallas, TX 75208' }]
    }, { fetch_impl: fetchImpl });
    assert.strictEqual(mismatch.packet_count, 0);
    assert.strictEqual(mismatch.rejected_items[0].reason, 'supplied_address_source_mismatch');
    assert.strictEqual(mismatch.rejected_items[0].source_address, '123 Main St, Dallas, TX 75208');

    const partial = await selectedDealPacketService.runSelectedDealPacketPreview({
      items: [{ address: '123 Main St' }]
    }, { fetch_impl: fetchImpl });
    assert.strictEqual(partial.packet_count, 1);
    assert.strictEqual(partial.packets[0].packet_status, 'RESEARCH_ONLY');
    assert.strictEqual(partial.packets[0].source_evidence.identity_ready, false);
    assert.strictEqual(partial.packets[0].call_script.why_calling, '');

    const subject = {
      comp_address: '123 Main St, Dallas, TX 75208',
      sold_status: 'sold',
      sold_price: 210000,
      sold_date: '2026-05-01',
      source_url: phoneUrl,
      source_title: 'Subject property sold history'
    };
    const valued = await selectedDealPacketService.runSelectedDealPacketPreview({
      items: [{
        url: phoneUrl,
        verified_sold_comps: [
          subject,
          soldComp(101, 220000),
          soldComp(102, 230000),
          soldComp(103, 240000)
        ]
      }],
      manual_repair_estimate: 30000,
      desired_assignment_fee: 10000
    }, { fetch_impl: fetchImpl });
    const valuedPacket = valued.packets[0];
    assert.strictEqual(valuedPacket.comps.verified_count, 3);
    assert.strictEqual(valuedPacket.comps.subject_sale_evidence.length, 1);
    assert.strictEqual(valuedPacket.arv.status, 'PRELIMINARY_ARV_AVAILABLE');
    assert.strictEqual(valuedPacket.repairs.amount, 30000);
    assert.strictEqual(valuedPacket.mao.status, 'DRAFT_MAO_AVAILABLE');
    assert.deepStrictEqual(valuedPacket.mao.range, {
      low: 114000,
      high: 128000,
      desired_assignment_fee: 10000
    });
    assert.deepStrictEqual(valuedPacket.offer_recommendation.maximum_contract_price_range, {
      low: 114000,
      high: 128000
    });

    await assert.rejects(
      selectedDealPacketService.runSelectedDealPacketPreview({
        items: [{ address: '1 Main St' }, { address: '2 Main St' }, { address: '3 Main St' }, { address: '4 Main St' }]
      }),
      (error) => error && error.code === 'max_items_exceeded' && error.status_code === 400
    );

    const serviceSource = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'research', 'selected-deal-packet-service.js'), 'utf8');
    assert.ok(!serviceSource.includes("require('../agents/comp-agent')"));
    assert.ok(!serviceSource.includes("require('../agents/skip-trace-agent')"));
    assert.strictEqual(preview.diagnostics.legacy_comp_agent_invoked, false);
    assert.strictEqual(preview.diagnostics.legacy_skip_trace_agent_invoked, false);

    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')), { leads: [], users: [] });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.FINDME_SCOUT_JOBS_PATH, 'utf8')), { version: 1, jobs: [] });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8')), { version: 1, jobs: [] });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')), { version: 1, dossiers: [] });

    console.log('selected deal packet service tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
