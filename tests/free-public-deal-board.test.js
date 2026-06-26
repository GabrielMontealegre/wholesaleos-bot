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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-free-public-deal-board-'));
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

const dealBoard = require('../modules/research/free-public-deal-board');

function response(status) {
  return {
    ok: status >= 200 && status < 400,
    status,
    headers: { get: () => 'text/html' },
    async text() { return '<html></html>'; }
  };
}

function comp(number, price, date = '2026-05-20') {
  return {
    comp_address: `${number} Oak St, Dallas, TX 75208`,
    sold_status: 'sold',
    sold_price: price,
    sold_date: date,
    source_url: `https://www.realtor.com/realestateandhomes-detail/${number}-Oak-St_Dallas_TX_75208_M${number}`,
    distance_miles: '0.8'
  };
}

const officialDeal = {
  headline: 'Trustee sale notice - 123 Main St',
  normalized_address: '123 Main St, Dallas, TX 75208',
  source_family: 'official_foreclosure',
  source_name: 'Dallas County Clerk Foreclosure Notices',
  source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
  source_document_url: 'https://www.dallascounty.org/Assets/uploads/docs/county-clerk/foreclosures/123-main-st-notice.pdf',
  motivation_type: 'foreclosure',
  motivation_evidence_text: 'Notice of Substitute Trustee Sale',
  status_evidence_text: 'Sale date June 4, 2026',
  sale_date_or_event_date: '2026-06-04',
  owner_name_if_visible: 'Visible Owner LLC'
};

const auctionDeal = {
  headline: 'Auction property - 456 Elm St',
  source_url: 'https://www.auction.com/details/456-Elm-St-Dallas-TX-75208-10001',
  motivation_evidence_text: 'Auction property',
  status_evidence_text: 'Auction date June 15, 2026',
  possible_comps: [comp(101, 220000), comp(102, 230000), comp(103, 240000)]
};

const redfinDeal = {
  headline: 'Redfin detail page',
  source_url: 'https://www.redfin.com/TX/Dallas/222-Cedar-St-75208/home/123456',
  motivation_evidence_text: 'Price reduced',
  status_evidence_text: 'Active for sale',
  possible_comps: [comp(201, 210000)]
};

const facebookFullAddress = {
  headline: 'Investor special - 400 Yeager St',
  source_url: 'https://www.facebook.com/groups/394054101914791/posts/1650291306291058/',
  motivation_evidence_text: 'Investor special',
  status_evidence_text: 'Manual Verification Needed',
  source_snippet: 'Investor special at 400 Yeager St, Dallas, TX 75208. Needs TLC.'
};

const repairDeal = {
  headline: 'Needs TLC - 789 Pine St',
  normalized_address: '789 Pine St, Dallas, TX 75208',
  source_url: 'https://www.facebook.com/groups/reihub/posts/10153972465452037/',
  motivation_evidence_text: 'Needs TLC',
  status_evidence_text: 'for sale'
};

const rejectedRecords = [
  {
    headline: 'Anyone ever sold a home as is?',
    source_url: 'https://www.reddit.com/r/RealEstate/comments/c7fwlw/anyone_ever_sold_a_home_as_is_what_does_that_mean/',
    motivation_evidence_text: 'as is',
    status_evidence_text: 'sold'
  },
  {
    headline: 'HAR.com: Texas Real Estate',
    source_url: 'https://www.har.com/',
    motivation_evidence_text: 'homes for sale',
    status_evidence_text: 'for sale'
  },
  {
    headline: 'For Sale by Owner in Texas',
    source_url: 'https://www.redfin.com/state/Texas/for-sale-by-owner',
    motivation_evidence_text: 'for sale by owner',
    status_evidence_text: 'for sale'
  },
  {
    headline: 'Generic Zillow category',
    source_url: 'https://www.zillow.com/dallas-tx/',
    motivation_evidence_text: 'cash only',
    status_evidence_text: 'active'
  },
  {
    headline: 'Facebook group without address',
    source_url: 'https://www.facebook.com/groups/reihub/posts/10153972465452037/',
    motivation_evidence_text: 'investor special',
    status_evidence_text: 'Manual Verification Needed'
  },
  {
    headline: 'Redfin Wylie investment category with bad prefix',
    source_url: 'https://www.redfin.com/city/30854/TX/Wylie/amenity/investment',
    source_snippet: 'Investment homes including 189 Sq Ft 215 Hillside Dr, Wylie, TX 75098.',
    motivation_evidence_text: 'investment',
    status_evidence_text: 'for sale'
  },
  {
    headline: 'Malformed sqft-prefixed address',
    raw_address_text: '189 Sq Ft Dallas TX 75208',
    source_url: 'https://www.redfin.com/city/30794/TX/Dallas/amenity/investment',
    motivation_evidence_text: 'investment',
    status_evidence_text: 'for sale'
  }
];

(async () => {
  try {
    const fetchHits = [];
    async function fetchImpl(url) {
      fetchHits.push(url);
      return response(200);
    }

    const blank = dealBoard.dealFromRecord({
      headline: 'Blank address source',
      source_url: 'https://www.har.com/',
      motivation_evidence_text: 'for sale'
    }, { market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, caps: {} });
    assert.strictEqual(blank.maps_url, null);

    const result = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      source_records: [
        ...rejectedRecords,
        facebookFullAddress,
        repairDeal,
        auctionDeal,
        redfinDeal,
        officialDeal
      ],
      enable_provider_search: true,
      mock_repair_results_by_query_group: {
        repair_zillow_property_link: [
          {
            title: '789 Pine St Dallas TX 75208 | Zillow',
            snippet: 'Zillow home details for 789 Pine St, Dallas, TX 75208.',
            url: 'https://www.zillow.com/homedetails/789-Pine-St_Dallas_TX_75208/123456_zpid/'
          }
        ]
      }
    }, {
      env: {
        ENABLE_SEARCH_PROVIDER: 'true',
        SEARCH_PROVIDER: 'mock'
      },
      fetch_impl: fetchImpl
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.preview_only, true);
    assert.strictEqual(result.should_ingest, false);
    assert.strictEqual(result.no_global_mutation, true);
    assert.strictEqual(result.recommended_dashboard_section_name, 'Best Public Deals');
    assert.ok(Array.isArray(result.free_public_deals));
    assert.strictEqual(result.deal_board_count, result.free_public_deals.length);
    assert.ok(result.free_public_deals.length < 9, 'generic rows should be filtered from board rows');
    assert.ok(result.top_deals.every((deal) => deal.usable_for_gabriel === true));
    assert.ok(result.top_deals.every((deal) => deal.quality_bucket !== 'REJECTED_GENERIC'));

    const official = result.free_public_deals.find((deal) => deal.normalized_address === '123 Main St, Dallas, TX 75208');
    assert.ok(official);
    assert.strictEqual(official.quality_bucket, 'INSPECT_NOW');
    assert.strictEqual(official.usable_for_gabriel, true);
    assert.strictEqual(official.source_family, 'official_foreclosure');
    assert.strictEqual(official.motivation_type, 'foreclosure');
    assert.ok(official.source_document_url.endsWith('.pdf'));
    assert.ok(official.best_link_to_click_first.includes('123-main-st-notice.pdf'));
    assert.ok(official.maps_url.includes('google.com/maps'));
    assert.ok(official.confidence_score >= 70);

    const auction = result.free_public_deals.find((deal) => deal.auction_url);
    assert.ok(auction);
    assert.strictEqual(auction.normalized_address, '456 Elm St, Dallas, TX 75208');
    assert.strictEqual(auction.quality_bucket, 'INSPECT_NOW');
    assert.strictEqual(auction.comp_status, 'verified_sold_comps_ready');
    assert.strictEqual(auction.ARV_lock_state, 'ARV_UNLOCKED_VERIFIED_COMPS');
    assert.strictEqual(auction.verified_sold_comp_count, 3);

    const redfin = result.free_public_deals.find((deal) => deal.redfin_url);
    assert.ok(redfin);
    assert.strictEqual(redfin.normalized_address, '222 Cedar St, Dallas, TX 75208');
    assert.strictEqual(redfin.quality_bucket, 'INSPECT_NOW');
    assert.strictEqual(redfin.comp_status, 'partial_verified_sold_comps');
    assert.strictEqual(redfin.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
    assert.ok(redfin.missing_fields.includes('3 verified sold comps'));

    const facebookAccepted = result.free_public_deals.find((deal) => deal.normalized_address === '400 Yeager St, Dallas, TX 75208');
    assert.ok(facebookAccepted);
    assert.strictEqual(facebookAccepted.usable_for_gabriel, true);
    assert.strictEqual(facebookAccepted.quality_bucket, 'NEEDS_IDENTITY');
    assert.ok(facebookAccepted.maps_url.includes('400%20Yeager%20St'));

    const repaired = result.free_public_deals.find((deal) => deal.normalized_address === '789 Pine St, Dallas, TX 75208');
    assert.ok(repaired);
    assert.ok(repaired.zillow_url.includes('/homedetails/'));
    assert.strictEqual(repaired.quality_bucket, 'INSPECT_NOW');

    assert.ok(!result.free_public_deals.some((deal) => /reddit/i.test(deal.source_url)));
    assert.ok(!result.free_public_deals.some((deal) => deal.source_url === 'https://www.har.com/'));
    assert.ok(!result.free_public_deals.some((deal) => deal.source_url === 'https://www.redfin.com/state/Texas/for-sale-by-owner'));
    assert.ok(!result.free_public_deals.some((deal) => deal.source_url === 'https://www.zillow.com/dallas-tx/'));
    assert.ok(!result.free_public_deals.some((deal) => deal.headline === 'Facebook group without address'));
    assert.ok(!result.free_public_deals.some((deal) => /Wylie/.test(deal.headline)));
    assert.ok(result.diagnostics.bad_address_rejected_count >= 1);

    assert.ok(result.property_specific_link_count >= 3);
    assert.ok(result.usable_deal_count >= 5);
    assert.ok(result.inspect_now_count >= 4);
    assert.ok(result.needs_identity_count >= 1);
    assert.ok(result.rejected_generic_count >= rejectedRecords.length);
    assert.strictEqual(result.source_counts.official_foreclosure, 1);
    assert.strictEqual(result.motivation_counts.foreclosure, 1);
    assert.ok(result.operator_summary.includes('usable preview-only public deals'));
    assert.ok(result.diagnostics.quality.rejected_generic_samples.length >= 1);
    assert.ok(result.diagnostics.identity_repair_attempted_count >= 1);
    assert.ok(result.diagnostics.property_link_repair_success_count >= 1);
    assert.ok(result.diagnostics.rows_without_maps_due_to_missing_address >= 5);
    assert.strictEqual(result.diagnostics.serper_primary_rows_count, 0);

    const sourceFirst = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      mock_source_adapter_records: [{
        headline: 'Adapter trustee sale - 321 Source St',
        normalized_address: '321 Source St, Dallas, TX 75208',
        source_family: 'official_foreclosure',
        source_name: 'Dallas County Clerk Foreclosure Notices',
        source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
        source_document_url: 'https://www.dallascounty.org/Assets/uploads/docs/county-clerk/foreclosures/321-source-st.pdf',
        motivation_type: 'foreclosure',
        motivation_evidence_text: 'Notice of Substitute Trustee Sale',
        status_evidence_text: 'Sale date July 7, 2026'
      }],
      enable_provider_search: true,
      enable_provider_primary_rows: true,
      mock_results_by_query_group: {
        official_foreclosure_trustee_notices: [{
          title: 'Reddit as-is discussion',
          snippet: 'Discussion about as-is homes.',
          url: 'https://www.reddit.com/r/RealEstate/comments/example/as_is_discussion/'
        }]
      }
    }, {
      env: {
        ENABLE_SEARCH_PROVIDER: 'true',
        SEARCH_PROVIDER: 'mock'
      },
      fetch_impl: fetchImpl
    });
    assert.strictEqual(sourceFirst.diagnostics.source_adapter_records_count, 1);
    assert.strictEqual(sourceFirst.free_public_deals[0].normalized_address, '321 Source St, Dallas, TX 75208');
    assert.ok(!sourceFirst.free_public_deals.some((deal) => /reddit/i.test(deal.source_url)));
    assert.strictEqual(sourceFirst.diagnostics.serper_primary_rows_count, 0);

    const capped = await dealBoard.runFreePublicDealBoardPreview({
      source_records: Array.from({ length: 40 }, (_, index) => ({
        headline: `Deal ${index}`,
        normalized_address: `${1000 + index} Test St, Dallas, TX 75208`,
        source_url: `https://www.realtor.com/realestateandhomes-detail/${1000 + index}-Test-St_Dallas_TX_75208_M${index}`,
        motivation_evidence_text: 'fixer',
        status_evidence_text: 'active'
      }))
    }, { fetch_impl: fetchImpl });
    assert.strictEqual(capped.free_public_deals.length, 25);
    assert.ok(fetchHits.length <= 12 + 8 + 4 + result.free_public_deals.length + 8);

    assert.strictEqual(result.diagnostics.legacy_comp_agent_invoked, false);
    assert.strictEqual(result.diagnostics.legacy_skip_trace_agent_invoked, false);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')), initialStores.db);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.FINDME_SCOUT_JOBS_PATH, 'utf8')), initialStores.findme);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.AI_DEAL_ANALYZER_JOBS_PATH, 'utf8')), initialStores.analyzer);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_CALL_DOSSIERS_PATH, 'utf8')), initialStores.dossiers);

    const source = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'research', 'free-public-deal-board.js'), 'utf8');
    assert.ok(!source.includes("require('../agents/comp-agent')"));
    assert.ok(!source.includes("require('../agents/skip-trace-agent')"));

    console.log('free public deal board tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
