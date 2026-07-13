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

    const sourceProofOnly = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      mock_source_adapter_results: [{
        source_id: 'tx_dallas_county_clerk_foreclosure_notices',
        source_name: 'Dallas County Clerk Foreclosure Notices',
        source_family: 'preforeclosure_trustee_notice',
        source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
        status: 'needs_manual_review',
        candidate_count: 0,
        document_hunter_summary: {
          source_url_checked: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
          document_urls_found: [
            'https://www.dallascounty.org/Assets/uploads/docs/county-clerk/foreclosures/sample-notice.pdf',
            'https://dallas.tx.publicsearch.us/'
          ],
          document_urls_parsed: [
            'https://www.dallascounty.org/Assets/uploads/docs/county-clerk/foreclosures/sample-notice.pdf'
          ],
          candidate_count: 0
        }
      }]
    }, { fetch_impl: fetchImpl });
    assert.strictEqual(sourceProofOnly.diagnostics.source_adapter_records_count, 1);
    assert.strictEqual(sourceProofOnly.diagnostics.source_adapter.source_adapter_proof_record_count, 1);
    assert.strictEqual(sourceProofOnly.suppressed_nav_chrome_count, 1);
    assert.strictEqual(sourceProofOnly.diagnostics.source_adapter.suppressed_nav_chrome_count, 1);
    assert.ok(sourceProofOnly.suppressed_nav_chrome_samples.some((item) => /publicsearch\.us/i.test(item.source_url)));
    assert.strictEqual(sourceProofOnly.free_public_deals.length, 1);
    assert.ok(sourceProofOnly.free_public_deals.every((deal) => deal.quality_bucket === 'SOURCE_PROOF_ONLY'));
    assert.ok(sourceProofOnly.free_public_deals.every((deal) => deal.usable_for_gabriel === true));
    assert.ok(sourceProofOnly.free_public_deals.every((deal) => deal.maps_url === null));
    assert.ok(sourceProofOnly.free_public_deals[0].best_link_to_click_first.includes('dallascounty.org'));
    assert.ok(sourceProofOnly.free_public_deals[0].missing_fields.includes('complete property address'));
    assert.strictEqual(sourceProofOnly.board_blocker_summary, '');

    const navChromeSuppression = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Denton', county: 'Denton', state: 'TX' },
      mock_source_adapter_results: [{
        source_id: 'tx_denton_county_foreclosure_notices',
        source_name: 'Denton County Foreclosure Notices',
        source_family: 'preforeclosure_trustee_notice',
        source_url: 'https://www.dentoncounty.gov/foreclosure-notices',
        status: 'needs_manual_review',
        candidate_count: 0,
        discovered_links: [
          { url: 'https://www.dentoncounty.gov/copyright', label: 'Foreclosure copyright notice' },
          { url: 'https://www.dentoncounty.gov/tax-assessor', label: 'Trustee sale tax assessor page' },
          { url: 'https://search.dentoncounty.gov/search/', label: 'Foreclosure notice search portal' },
          { url: 'https://www.dentoncounty.gov/foreclosure-notices', label: 'Notice of Substitute Trustee Sale' },
          { url: 'https://www.dentoncounty.gov/Documents/foreclosure-notice.pdf', label: 'Official document without an address' }
        ]
      }]
    });
    assert.strictEqual(navChromeSuppression.suppressed_nav_chrome_count, 3);
    assert.strictEqual(navChromeSuppression.diagnostics.source_adapter.suppressed_nav_chrome_count, 3);
    assert.strictEqual(navChromeSuppression.diagnostics.source_adapter.suppressed_nav_chrome_by_source_id.tx_denton_county_foreclosure_notices, 3);
    assert.strictEqual(navChromeSuppression.suppressed_nav_chrome_samples.length, 3);
    assert.ok(navChromeSuppression.free_public_deals.every((deal) => !/(?:copyright|tax-assessor|search\.dentoncounty\.gov)/i.test(deal.source_url)));
    assert.ok(navChromeSuppression.free_public_deals.some((deal) => deal.source_url === 'https://www.dentoncounty.gov/foreclosure-notices'));
    assert.ok(navChromeSuppression.free_public_deals.some((deal) => deal.source_document_url.endsWith('/foreclosure-notice.pdf')));
    assert.ok(navChromeSuppression.free_public_deals.every((deal) => deal.quality_bucket === 'SOURCE_PROOF_ONLY'));

    const foreclosureEvidenceRows = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      mock_source_adapter_results: [{
        source_id: 'tx_dallas_county_clerk_foreclosure_notices',
        source_name: 'Dallas County Clerk Foreclosure Notices',
        source_family: 'preforeclosure_trustee_notice',
        source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
        status: 'needs_manual_review',
        candidate_count: 0,
        evidence_links_found: 2,
        discovered_links: [
          {
            url: 'https://www.dallascounty.org/Assets/uploads/docs/county-clerk/foreclosures/555-proof-st-notice.pdf',
            label: 'Notice of Substitute Trustee Sale - Property Address: 555 Proof St, Dallas, TX 75208 - Sale Date: July 2, 2026',
            link_type: 'document_link',
            classification: 'pdf_document'
          },
          {
            url: 'https://dallas.tx.publicsearch.us/',
            label: 'Dallas County PublicSearch foreclosure record portal',
            link_type: 'county_notice_page',
            classification: 'generic_portal'
          }
        ],
        document_hunter_summary: {
          source_url_checked: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
          discovered_url_count: 2,
          direct_document_url_count: 1,
          document_urls_found_count: 1,
          candidate_count: 0,
          evidence_links_found: 2
        }
      }]
    });
    assert.strictEqual(foreclosureEvidenceRows.foreclosure_evidence_links_count, 2);
    assert.strictEqual(foreclosureEvidenceRows.foreclosure_document_links_count, 1);
    assert.strictEqual(foreclosureEvidenceRows.foreclosure_rows_from_evidence_count, 2);
    assert.strictEqual(foreclosureEvidenceRows.foreclosure_rows_with_address_count, 1);
    assert.strictEqual(foreclosureEvidenceRows.foreclosure_rows_with_sale_date_count, 1);
    assert.strictEqual(foreclosureEvidenceRows.foreclosure_parser_zero_candidate_count, 1);
    assert.strictEqual(foreclosureEvidenceRows.free_public_deals.length, 2);
    assert.strictEqual(foreclosureEvidenceRows.free_public_deals[0].normalized_address, '555 Proof St, Dallas, TX 75208');
    assert.strictEqual(foreclosureEvidenceRows.free_public_deals[0].sale_date_or_event_date, 'July 2, 2026');
    assert.ok(foreclosureEvidenceRows.free_public_deals[0].source_document_url.endsWith('555-proof-st-notice.pdf'));
    assert.strictEqual(foreclosureEvidenceRows.free_public_deals[0].best_link_to_click_first, foreclosureEvidenceRows.free_public_deals[0].source_document_url);
    assert.strictEqual(foreclosureEvidenceRows.free_public_deals[0].contact_route_if_visible, '');
    assert.strictEqual(foreclosureEvidenceRows.free_public_deals[0].verified_sold_comp_count, 0);
    assert.ok(foreclosureEvidenceRows.free_public_deals.some((deal) => deal.quality_bucket === 'SOURCE_PROOF_ONLY' && !deal.normalized_address));

    const pdfNoticeRows = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      mock_source_adapter_results: [{
        source_id: 'tx_dallas_county_clerk_foreclosure_notices',
        source_name: 'Dallas County Clerk Foreclosure Notices',
        source_family: 'preforeclosure_trustee_notice',
        source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
        status: 'available',
        candidate_count: 2,
        candidates: [{
          normalized_address: '9100 Hunter Rd, Dallas, TX 75228',
          source_family: 'preforeclosure_trustee_notice',
          source_name: 'Dallas County Clerk Foreclosure Notices',
          source_url: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/Dallas_1.pdf',
          source_document_url: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/Dallas_1.pdf',
          motivation_type: 'preforeclosure_trustee_notice',
          motivation_evidence_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE | Property Address: 9100 Hunter Rd Dallas, TX 75228',
          status_evidence_text: 'Sale Date: 07/02/2026',
          sale_date: '07/02/2026',
          owner_name_candidate: 'Hunter Buyer'
        }, {
          source_family: 'preforeclosure_trustee_notice',
          source_name: 'Dallas County Clerk Foreclosure Notices',
          source_url: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/Dallas_1.pdf',
          source_document_url: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/Dallas_1.pdf',
          motivation_type: 'preforeclosure_trustee_notice',
          motivation_evidence_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE',
          status_evidence_text: 'Sale Date: 07/02/2026',
          sale_date: '07/02/2026'
        }],
        document_hunter_summary: {
          candidate_count: 2,
          pdf_notice_documents_fetched: 1,
          pdf_notice_documents_parsed: 1,
          pdf_notice_rows_extracted: 2,
          pdf_notice_rows_with_address: 1,
          pdf_notice_rows_with_sale_date: 2,
          pdf_notice_parse_failures: 0
        }
      }]
    }, { fetch_impl: fetchImpl });
    assert.strictEqual(pdfNoticeRows.pdf_notice_documents_fetched, 1);
    assert.strictEqual(pdfNoticeRows.pdf_notice_documents_parsed, 1);
    assert.strictEqual(pdfNoticeRows.pdf_notice_rows_extracted, 2);
    assert.strictEqual(pdfNoticeRows.pdf_notice_rows_with_address, 1);
    assert.strictEqual(pdfNoticeRows.pdf_notice_rows_with_sale_date, 2);
    assert.strictEqual(pdfNoticeRows.pdf_notice_parse_failures, 0);
    assert.strictEqual(pdfNoticeRows.diagnostics.source_adapter.source_adapter_candidate_count, 2);
    const inspectNowPdfRow = pdfNoticeRows.free_public_deals.find((deal) => deal.normalized_address === '9100 Hunter Rd, Dallas, TX 75228');
    assert.ok(inspectNowPdfRow);
    assert.strictEqual(inspectNowPdfRow.quality_bucket, 'INSPECT_NOW');
    assert.strictEqual(inspectNowPdfRow.source_document_url, 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/Dallas_1.pdf');
    assert.strictEqual(inspectNowPdfRow.best_link_to_click_first, inspectNowPdfRow.source_document_url);
    assert.strictEqual(inspectNowPdfRow.owner_name_if_visible, 'Hunter Buyer');
    assert.ok(inspectNowPdfRow.call_prep);
    assert.strictEqual(inspectNowPdfRow.call_readiness, 'NEEDS_CONTACT_ROUTE');
    assert.strictEqual(inspectNowPdfRow.call_prep.contact_status, 'CONTACT_LOOKUP_REQUIRED');
    assert.strictEqual(inspectNowPdfRow.call_prep.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
    assert.strictEqual(inspectNowPdfRow.MAO_lock_state, 'MAO_LOCKED_NO_ARV');
    assert.ok(inspectNowPdfRow.call_prep.MAO_lock_reason.length > 10);
    assert.ok(inspectNowPdfRow.call_prep.seller_questions.length >= 4);
    assert.ok(inspectNowPdfRow.call_prep.seller_questions[0].includes('9100 Hunter Rd, Dallas, TX 75228'));
    assert.ok(inspectNowPdfRow.call_prep.seller_questions.some((question) => question.includes('07/02/2026')));
    assert.ok(inspectNowPdfRow.call_prep.missing_for_call.some((item) => /contact/i.test(item)));
    assert.strictEqual(inspectNowPdfRow.next_best_action, 'FIND_CONTACT_ROUTE');
    assert.strictEqual(pdfNoticeRows.call_ready_count, 0);
    assert.ok(pdfNoticeRows.needs_contact_route_count >= 1);
    const incompletePdfRow = pdfNoticeRows.free_public_deals.find((deal) => !deal.normalized_address);
    assert.ok(incompletePdfRow);
    assert.strictEqual(incompletePdfRow.quality_bucket, 'SOURCE_PROOF_ONLY');
    assert.strictEqual(incompletePdfRow.maps_url, null);
    assert.strictEqual(incompletePdfRow.contact_route_if_visible, '');
    assert.strictEqual(incompletePdfRow.verified_sold_comp_count, 0);

    // OCR partial address (street + city + TX, zip unreadable) from an
    // official document becomes an actionable NEEDS_ZIP_REVIEW row with the
    // real source county - never INSPECT_NOW, never a fake precise map pin.
    const zipReviewRows = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      mock_source_adapter_results: [{
        source_id: 'tx_rockwall_county_foreclosure_notices',
        source_name: 'Rockwall County Foreclosure Notices',
        source_family: 'preforeclosure_trustee_notice',
        source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
        status: 'available',
        candidate_count: 2,
        candidates: [{
          property_address: '4016 Poplar Point Dr Rockwall, TX',
          county: 'Rockwall',
          source_family: 'preforeclosure_trustee_notice',
          source_name: 'Rockwall County Foreclosure Notices',
          source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
          source_document_url: 'https://www.rockwallcountytexas.com/Archive.aspx?ADID=7689',
          motivation_type: 'preforeclosure_trustee_notice',
          motivation_evidence_text: 'NOTICE OF TRUSTEE SALE | Property Address: 4016 Poplar Point Dr Rockwall, TX (OCR)',
          risk_flags: ['OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED']
        }, {
          property_address: '116 Comanc He Dr Greenville, TX 75402',
          county: 'Hunt',
          source_family: 'preforeclosure_trustee_notice',
          source_name: 'Hunt County Foreclosure EasyDocs',
          source_url: 'https://apps.huntcounty.net/foreclosures/listDocs-new.asp?year=2026',
          source_document_url: 'https://apps.huntcounty.net/foreclosures/LinkedDir/2026/2026-08-04-foreclosure-01.pdf',
          motivation_type: 'preforeclosure_trustee_notice',
          motivation_evidence_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE | Property Address: 116 Comanc He Dr Greenville, TX 75402 (OCR)',
          risk_flags: ['OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED']
        }, {
          property_address: '116 Greenville, TX 75402',
          county: 'Hunt',
          source_family: 'preforeclosure_trustee_notice',
          source_name: 'Hunt County Foreclosure EasyDocs',
          source_url: 'https://apps.huntcounty.net/foreclosures/listDocs-new.asp?year=2026',
          source_document_url: 'https://apps.huntcounty.net/foreclosures/LinkedDir/2026/2026-08-04-foreclosure-02.pdf',
          motivation_type: 'preforeclosure_trustee_notice',
          motivation_evidence_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE | 116 Greenville, TX 75402 (OCR)',
          risk_flags: ['OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED']
        }, {
          source_family: 'preforeclosure_trustee_notice',
          source_name: 'Rockwall County Foreclosure Notices',
          source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
          source_document_url: 'https://www.rockwallcountytexas.com/Archive.aspx?ADID=7688',
          motivation_type: 'preforeclosure_trustee_notice',
          motivation_evidence_text: 'NOTICE OF TRUSTEE SALE (no readable address)'
        }]
      }]
    }, { fetch_impl: fetchImpl });
    const zipReviewRow = zipReviewRows.free_public_deals.find((deal) => deal.quality_bucket === 'NEEDS_ZIP_REVIEW' && /4016 Poplar Point/i.test(deal.partial_address || deal.raw_address_text || ''));
    assert.ok(zipReviewRow, 'partial street+city+TX from official doc must surface as NEEDS_ZIP_REVIEW');
    assert.strictEqual(zipReviewRow.partial_address, '4016 Poplar Point Dr Rockwall, TX');
    assert.strictEqual(zipReviewRow.normalized_address, '', 'partial identity must not fake a complete address');
    assert.strictEqual(zipReviewRow.maps_url, null, 'no precise map pin without a zip');
    assert.ok(/query=4016/.test(zipReviewRow.maps_search_url_review_needed), 'review-labeled maps search link present');
    assert.strictEqual(zipReviewRow.county, 'Rockwall', 'row must carry the source county, not the market county');
    assert.strictEqual(zipReviewRow.next_best_action, 'VERIFY_ZIP_FROM_SOURCE_DOCUMENT');
    assert.ok(zipReviewRow.missing_fields.some((item) => /zip/i.test(item)));
    assert.ok(zipReviewRow.risk_flags.includes('ZIP_MISSING_REVIEW_REQUIRED'));
    assert.ok(zipReviewRow.risk_flags.includes('OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED'));
    assert.strictEqual(zipReviewRow.usable_for_gabriel, true);
    assert.ok(zipReviewRows.needs_zip_review_count >= 1);
    const ocrReviewRow = zipReviewRows.free_public_deals.find((deal) => /116 Comanc He Dr Greenville/i.test(deal.partial_address));
    assert.ok(ocrReviewRow, 'OCR-mangled but real address shape must surface as a review row');
    assert.strictEqual(ocrReviewRow.quality_bucket, 'NEEDS_ZIP_REVIEW');
    assert.strictEqual(ocrReviewRow.normalized_address, '', 'OCR street spelling must never be guessed into a canonical address');
    assert.strictEqual(ocrReviewRow.partial_address, '116 Comanc He Dr Greenville, TX 75402');
    assert.strictEqual(ocrReviewRow.maps_url, null, 'no precise map pin for OCR review rows');
    assert.ok(/query=116/.test(ocrReviewRow.maps_search_url_review_needed), 'OCR review row gets a review search link only');
    assert.strictEqual(ocrReviewRow.next_best_action, 'VERIFY_ADDRESS_FROM_SOURCE_DOCUMENT');
    assert.ok(ocrReviewRow.missing_fields.some((item) => /verified street spelling/i.test(item)));
    assert.ok(ocrReviewRow.risk_flags.includes('OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED'));
    assert.ok(!ocrReviewRow.risk_flags.includes('ZIP_FROM_US_CENSUS_GEOCODER'));
    assert.ok(!ocrReviewRow.risk_flags.includes('ZIP_MISSING_REVIEW_REQUIRED'), 'zip is visible, so zip-missing flag should not be set');
    const junkOcrRow = zipReviewRows.free_public_deals.find((deal) => /116 Greenville, TX 75402/.test(deal.partial_address || deal.raw_address_text || ''));
    assert.ok(junkOcrRow, 'junk OCR text should still surface as a proof row');
    assert.strictEqual(junkOcrRow.quality_bucket, 'SOURCE_PROOF_ONLY');
    assert.strictEqual(junkOcrRow.next_best_action, 'VERIFY_PROPERTY_IDENTITY');
    const noAddressRow = zipReviewRows.free_public_deals.find((deal) => deal.quality_bucket === 'SOURCE_PROOF_ONLY' && !deal.partial_address);
    assert.ok(noAddressRow, 'rows with no readable street stay source-proof');
    assert.ok(zipReviewRow.rank_score > noAddressRow.rank_score, 'zip-review rows outrank plain proof rows');

    // A leading instrument-number-like prefix is quarantined, never repaired.
    // The raw OCR text stays visible only through the review workflow.
    const prefixQuarantineRows = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      source_records: [{
        normalized_address: '05825 320 Leopold Trl Greenville, TX 75402',
        raw_address_text: '05825 320 Leopold Trl Greenville, TX 75402',
        county: 'Hunt',
        source_family: 'preforeclosure_trustee_notice',
        source_name: 'Hunt County Foreclosure EasyDocs',
        source_url: 'https://apps.huntcounty.net/foreclosures/listDocs-new.asp?year=2026',
        source_document_url: 'https://apps.huntcounty.net/foreclosures/LinkedDir/2026/notice-1.pdf',
        motivation_type: 'preforeclosure_trustee_notice',
        motivation_evidence_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE',
        status_evidence_text: 'Sale Date: 08/04/2026',
        contact_route_if_visible: '(888) 313-1969'
      }, {
        normalized_address: '320 Leopold Trl, Greenville, TX 75402',
        county: 'Hunt',
        source_family: 'preforeclosure_trustee_notice',
        source_url: 'https://apps.huntcounty.net/foreclosures/listDocs-new.asp?year=2026',
        source_document_url: 'https://apps.huntcounty.net/foreclosures/LinkedDir/2026/notice-2.pdf',
        motivation_type: 'preforeclosure_trustee_notice',
        status_evidence_text: 'Sale Date: 08/04/2026'
      }]
    }, { fetch_impl: fetchImpl });
    const quarantinedPrefix = prefixQuarantineRows.free_public_deals.find((deal) => deal.address_prefix_suspected === true);
    assert.ok(quarantinedPrefix, 'two-number prefix must be quarantined');
    assert.strictEqual(quarantinedPrefix.normalized_address, '', 'no digits may be stripped into a canonical address');
    assert.strictEqual(quarantinedPrefix.partial_address, '05825 320 Leopold Trl Greenville, TX 75402', 'raw prefix text must remain verbatim');
    assert.strictEqual(quarantinedPrefix.quality_bucket, 'NEEDS_ZIP_REVIEW');
    assert.strictEqual(quarantinedPrefix.call_readiness, 'NEEDS_PROPERTY_IDENTITY');
    assert.strictEqual(quarantinedPrefix.maps_url, null);
    assert.ok(/query=05825/.test(quarantinedPrefix.maps_search_url_review_needed));
    assert.strictEqual(quarantinedPrefix.next_best_action, 'VERIFY_ADDRESS_FROM_SOURCE_DOCUMENT');
    assert.ok(quarantinedPrefix.risk_flags.includes('ADDRESS_PREFIX_SUSPECTED_VERIFY_DOCUMENT'));
    assert.ok(quarantinedPrefix.risk_flags.includes('OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED'));
    assert.ok(quarantinedPrefix.missing_fields.some((item) => /verified street number/i.test(item)));
    const untouchedNormalAddress = prefixQuarantineRows.free_public_deals.find((deal) => deal.normalized_address === '320 Leopold Trl, Greenville, TX 75402');
    assert.ok(untouchedNormalAddress, 'normal address must remain available');
    assert.strictEqual(untouchedNormalAddress.quality_bucket, 'INSPECT_NOW');
    assert.strictEqual(untouchedNormalAddress.address_prefix_suspected, false);

    // Only byte-identical Census matched addresses merge. The richer row keeps
    // its proof while both document URLs remain visible for audit.
    const censusDuplicateRows = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      source_records: [{
        normalized_address: '1111 Yellowjacket Ln, Rockwall, TX 75087',
        census_matched_address: '1111 E YELLOW JACKET LN, ROCKWALL, TX, 75087',
        source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
        source_document_url: 'https://www.rockwallcountytexas.com/Archive.aspx?ADID=1001',
        source_family: 'preforeclosure_trustee_notice',
        motivation_type: 'preforeclosure_trustee_notice',
        motivation_evidence_text: 'NOTICE OF TRUSTEE SALE',
        status_evidence_text: 'Sale Date: 08/04/2026'
      }, {
        normalized_address: '1111 East Yellow Jacket Ln, Rockwall, TX 75087',
        census_matched_address: '1111 E YELLOW JACKET LN, ROCKWALL, TX, 75087',
        source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
        source_document_url: 'https://www.rockwallcountytexas.com/Archive.aspx?ADID=1002',
        source_family: 'preforeclosure_trustee_notice',
        motivation_type: 'preforeclosure_trustee_notice',
        motivation_evidence_text: 'NOTICE OF TRUSTEE SALE',
        status_evidence_text: 'Sale Date: 08/04/2026',
        contact_route_if_visible: '(888) 313-1969'
      }]
    }, { fetch_impl: fetchImpl });
    assert.strictEqual(censusDuplicateRows.free_public_deals.length, 1, 'Census-exact duplicates must collapse to one row');
    const mergedCensusRow = censusDuplicateRows.free_public_deals[0];
    assert.strictEqual(mergedCensusRow.merged_duplicate_count, 1);
    assert.deepStrictEqual(mergedCensusRow.source_document_urls, [
      'https://www.rockwallcountytexas.com/Archive.aspx?ADID=1002',
      'https://www.rockwallcountytexas.com/Archive.aspx?ADID=1001'
    ]);

    const noCensusDuplicateRows = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      source_records: [{
        normalized_address: '1111 Yellowjacket Ln, Rockwall, TX 75087',
        source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
        source_document_url: 'https://www.rockwallcountytexas.com/Archive.aspx?ADID=1003',
        source_family: 'preforeclosure_trustee_notice',
        motivation_evidence_text: 'NOTICE OF TRUSTEE SALE',
        status_evidence_text: 'Sale Date: 08/04/2026'
      }, {
        normalized_address: '1111 East Yellow Jacket Ln, Rockwall, TX 75087',
        source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
        source_document_url: 'https://www.rockwallcountytexas.com/Archive.aspx?ADID=1004',
        source_family: 'preforeclosure_trustee_notice',
        motivation_evidence_text: 'NOTICE OF TRUSTEE SALE',
        status_evidence_text: 'Sale Date: 08/04/2026'
      }]
    }, { fetch_impl: fetchImpl });
    assert.strictEqual(noCensusDuplicateRows.free_public_deals.length, 2, 'rows without Census matches must not merge');

    // US Census geocoder zip resolution: a partial with sale-date evidence and
    // a confirmed federal address-range match becomes a full INSPECT_NOW row;
    // a partial without evidence keeps the review bucket but shows the
    // suggested zip; an unresolved partial is untouched. Never a guessed zip.
    const futureSaleDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const censusResolver = async (partial) => {
      const street = String(partial.street_or_partial || '');
      if (street.startsWith('4016 Poplar Point')) {
        return {
          resolved: true, zip: '75032', matched_address: '4016 POPLAR POINT DR, ROCKWALL, TX, 75032',
          normalized_address: '4016 Poplar Point Dr, Rockwall, TX 75032', city: 'Rockwall', state: 'TX',
          source: 'us_census_geocoder'
        };
      }
      if (street.startsWith('3609 Kings')) {
        return {
          resolved: true, zip: '75119', matched_address: '3609 KINGS DR, ENNIS, TX, 75119',
          normalized_address: '3609 Kings Dr, Ennis, TX 75119', city: 'Ennis', state: 'TX',
          source: 'us_census_geocoder'
        };
      }
      return { resolved: false, reason: 'no_census_match' };
    };
    const censusCandidateBase = {
      source_family: 'preforeclosure_trustee_notice',
      source_name: 'Rockwall County Foreclosure Notices',
      source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
      motivation_type: 'preforeclosure_trustee_notice',
      risk_flags: ['OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED']
    };
    const censusRows = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      enable_census_zip_resolution: true,
      mock_source_adapter_results: [{
        source_id: 'tx_rockwall_county_foreclosure_notices',
        source_name: 'Rockwall County Foreclosure Notices',
        source_family: 'preforeclosure_trustee_notice',
        source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
        status: 'available',
        candidate_count: 3,
        candidates: [
          Object.assign({}, censusCandidateBase, {
            property_address: '4016 Poplar Point Dr Rockwall, TX',
            county: 'Rockwall',
            source_document_url: 'https://www.rockwallcountytexas.com/Archive.aspx?ADID=7689',
            sale_date_or_event_date: futureSaleDate,
            motivation_evidence_text: `NOTICE OF TRUSTEE SALE ${futureSaleDate} | 4016 Poplar Point Dr Rockwall, TX (OCR)`
          }),
          Object.assign({}, censusCandidateBase, {
            property_address: '3609 Kings Dr Ennis, TX',
            county: 'Ellis',
            source_document_url: 'https://www.rockwallcountytexas.com/Archive.aspx?ADID=7690',
            // No sale-date and no status-pattern words: promotion must not happen.
            motivation_evidence_text: 'County posting reference 7690 | 3609 Kings Dr Ennis, TX (OCR)'
          }),
          Object.assign({}, censusCandidateBase, {
            property_address: '121 Stallion St Waxahachie, TX',
            county: 'Ellis',
            source_document_url: 'https://www.rockwallcountytexas.com/Archive.aspx?ADID=7691',
            motivation_evidence_text: 'County posting reference 7691 | 121 Stallion St Waxahachie, TX (OCR)'
          })
        ]
      }]
    }, { fetch_impl: fetchImpl, census_zip_resolver_impl: censusResolver });
    assert.strictEqual(censusRows.census_zip_enabled, true);
    assert.strictEqual(censusRows.census_zip_lookups, 3);
    assert.strictEqual(censusRows.census_zip_resolved_full_address, 0);
    assert.strictEqual(censusRows.census_zip_suggested_review, 2);
    assert.strictEqual(censusRows.census_zip_unresolved, 1);
    const reviewRow = censusRows.free_public_deals.find((deal) => /4016 Poplar Point Dr Rockwall/.test(deal.partial_address));
    assert.ok(reviewRow, 'census-resolved OCR review row must stay visible');
    assert.strictEqual(reviewRow.quality_bucket, 'NEEDS_ZIP_REVIEW');
    assert.strictEqual(reviewRow.normalized_address, '', 'suggestion must not fake a complete address');
    assert.strictEqual(reviewRow.census_zip_suggestion, '75032');
    assert.ok(reviewRow.risk_flags.includes('ZIP_SUGGESTED_BY_US_CENSUS_GEOCODER'));
    assert.ok(reviewRow.risk_flags.includes('OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED'));
    assert.strictEqual(reviewRow.next_best_action, 'VERIFY_ZIP_FROM_SOURCE_DOCUMENT');
    assert.ok(!reviewRow.risk_flags.includes('ZIP_FROM_US_CENSUS_GEOCODER'));
    const suggestedRow = censusRows.free_public_deals.find((deal) => deal.partial_address === '3609 Kings Dr Ennis, TX');
    assert.ok(suggestedRow, 'census-resolved partial without evidence must stay on the board');
    assert.strictEqual(suggestedRow.quality_bucket, 'NEEDS_ZIP_REVIEW', 'no evidence -> stays in review bucket');
    assert.strictEqual(suggestedRow.normalized_address, '', 'suggestion must not fake a complete address');
    assert.strictEqual(suggestedRow.census_zip_suggestion, '75119');
    assert.ok(suggestedRow.risk_flags.includes('ZIP_SUGGESTED_BY_US_CENSUS_GEOCODER'));
    assert.strictEqual(suggestedRow.next_best_action, 'VERIFY_ZIP_FROM_SOURCE_DOCUMENT');
    const untouchedRow = censusRows.free_public_deals.find((deal) => deal.partial_address === '121 Stallion St Waxahachie, TX');
    assert.ok(untouchedRow, 'unresolved partial must stay on the board');
    assert.strictEqual(untouchedRow.quality_bucket, 'NEEDS_ZIP_REVIEW');
    assert.ok(!untouchedRow.census_zip_suggestion, 'no suggestion invented when census has no match');
    assert.strictEqual(untouchedRow.census_zip_status, 'no_census_match');

    // Default off: the same input without the flag never calls the resolver.
    const censusOffRows = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      mock_source_adapter_results: [{
        source_id: 'tx_rockwall_county_foreclosure_notices',
        source_name: 'Rockwall County Foreclosure Notices',
        source_family: 'preforeclosure_trustee_notice',
        source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
        status: 'available',
        candidate_count: 1,
        candidates: [Object.assign({}, censusCandidateBase, {
          property_address: '4016 Poplar Point Dr Rockwall, TX',
          county: 'Rockwall',
          source_document_url: 'https://www.rockwallcountytexas.com/Archive.aspx?ADID=7689',
          sale_date_or_event_date: futureSaleDate,
          motivation_evidence_text: 'NOTICE OF TRUSTEE SALE | 4016 Poplar Point Dr Rockwall, TX (OCR)'
        })]
      }]
    }, { fetch_impl: fetchImpl, census_zip_resolver_impl: async () => { throw new Error('must not be called'); } });
    assert.strictEqual(censusOffRows.census_zip_enabled, false);
    assert.strictEqual(censusOffRows.census_zip_lookups, 0);

    const landingFallback = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      mock_source_adapter_results: [{
        source_id: 'tx_dallas_county_clerk_foreclosure_notices',
        source_name: 'Dallas County Clerk Foreclosure Notices',
        source_family: 'preforeclosure_trustee_notice',
        source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
        status: 'needs_manual_review',
        candidate_count: 0,
        document_hunter_summary: {
          source_url_checked: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
          candidate_count: 0
        }
      }]
    });
    assert.strictEqual(landingFallback.free_public_deals.length, 0);
    assert.strictEqual(landingFallback.suppressed_nav_chrome_count, 1);
    assert.strictEqual(landingFallback.suppressed_nav_chrome_samples[0].reason, 'missing_foreclosure_keyword_evidence');

    const listingRadarRows = await dealBoard.runFreePublicDealBoardPreview({
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
      mock_source_adapter_results: [{
        source_id: 'tx_dallas_listing_radar',
        source_name: 'Dallas Listing Radar',
        source_family: 'public_listing_radar',
        status: 'available',
        candidates: [
          {
            normalized_address: '123 Main St, Dallas, TX 75208',
            raw_address_text: '123 Main St, Dallas, TX 75208',
            source_url: 'https://www.zillow.com/homedetails/123-Main-St-Dallas-TX-75208/123456_zpid/',
            source_classification: 'exact_property_record',
            motivation_type: 'public_listing_distress_signal',
            motivation_evidence_text: 'Cash only fixer listed on Zillow.',
            status_evidence_text: 'For sale. Price cut visible on listing.',
            address_provenance: 'ADDRESS_FROM_LISTING_URL_SLUG',
            listing_radar_status: 'LISTING_SOURCE_CHECKED',
            asking_price: '$199,000'
          },
          {
            normalized_address: '321 Pine St, Dallas, TX 75208',
            raw_address_text: '321 Pine St, Dallas, TX 75208',
            source_url: 'https://www.zillow.com/homedetails/321-Pine-St-Dallas-TX-75208/999_zpid/',
            source_classification: 'exact_property_record',
            motivation_type: 'public_listing_distress_signal',
            motivation_evidence_text: 'Property-specific public listing URL found.',
            listing_radar_status: 'BLOCKED_PUBLIC_SOURCE',
            blocked_sources: [{ source: 'public_listing_page', url: 'https://www.zillow.com/homedetails/321-Pine-St-Dallas-TX-75208/999_zpid/', reason: 'http_403' }],
            risk_flags: ['BLOCKED_PUBLIC_SOURCE']
          }
        ]
      }]
    }, { fetch_impl: fetchImpl });
    const radarInspect = listingRadarRows.free_public_deals.find((deal) => deal.normalized_address === '123 Main St, Dallas, TX 75208');
    assert.ok(radarInspect, 'listing radar complete-address row should survive board gates');
    assert.strictEqual(radarInspect.quality_bucket, 'INSPECT_NOW');
    assert.strictEqual(radarInspect.zillow_url, 'https://www.zillow.com/homedetails/123-Main-St-Dallas-TX-75208/123456_zpid/');
    assert.strictEqual(radarInspect.address_provenance, 'ADDRESS_FROM_LISTING_URL_SLUG');
    assert.strictEqual(radarInspect.listing_radar_status, 'LISTING_SOURCE_CHECKED');
    assert.strictEqual(radarInspect.contact_route_if_visible, '');
    assert.ok(radarInspect.missing_fields.includes('visible contact route'));
    const radarBlocked = listingRadarRows.free_public_deals.find((deal) => deal.normalized_address === '321 Pine St, Dallas, TX 75208');
    assert.ok(radarBlocked, 'blocked property-specific listing should remain visible as a source-proof row');
    assert.strictEqual(radarBlocked.quality_bucket, 'SOURCE_PROOF_ONLY');
    assert.strictEqual(radarBlocked.listing_radar_status, 'BLOCKED_PUBLIC_SOURCE');
    assert.strictEqual(radarBlocked.blocked_sources[0].reason, 'http_403');

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
    assert.ok(fetchHits.length <= 12 + 8 + 4 + result.free_public_deals.length + pdfNoticeRows.free_public_deals.length + zipReviewRows.free_public_deals.length * 2 + prefixQuarantineRows.free_public_deals.length * 2 + censusDuplicateRows.free_public_deals.length * 2 + noCensusDuplicateRows.free_public_deals.length * 2 + censusRows.free_public_deals.length * 2 + censusOffRows.free_public_deals.length * 2 + listingRadarRows.free_public_deals.length + 4 + 8);

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
