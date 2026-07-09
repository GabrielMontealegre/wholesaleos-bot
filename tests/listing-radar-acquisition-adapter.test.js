'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (/(?:^|[\\/])agents[\\/](?:comp-agent|skip-trace-agent)$/.test(String(request))) {
    throw new Error(`Legacy agent must not load: ${request}`);
  }
  return originalLoad.call(this, request, parent, isMain);
};

const radar = require('../modules/sources/listing-radar-acquisition-adapter');

function htmlResponse(status, html, finalUrl) {
  return {
    ok: status >= 200 && status < 400,
    status,
    url: finalUrl || '',
    headers: { get: () => 'text/html' },
    async text() { return html; }
  };
}

(async () => {
  try {
    const acceptedUrls = [
      'https://www.zillow.com/homedetails/123-Main-St-Dallas-TX-75208/123456_zpid/',
      'https://www.zillow.com/homedetails/123-Main-St-Dallas-TX-75208/123456_zpid/?utm_source=search',
      'https://www.redfin.com/TX/Dallas/123-Main-St-75208/home/123456',
      'https://www.realtor.com/realestateandhomes-detail/123-Main-St_Dallas_TX_75208_M12345',
      'https://www.auction.com/details/123-Main-St-Dallas-TX-75208-123456',
      'https://public.realauction.com/index.cfm?zaction=auction&zmethod=details&AID=12345'
    ];
    for (const url of acceptedUrls) {
      assert.strictEqual(radar.isAcceptedListingUrl(url), true, `should accept ${url}`);
    }

    const rejectedUrls = [
      'https://www.zillow.com/dallas-tx/',
      'https://www.zillow.com/b/dallas-tx-building/abc123/',
      'https://www.zillow.com/homes/for_sale/Dallas-TX/',
      'https://www.redfin.com/state/Texas/for-sale-by-owner',
      'https://www.realtor.com/realestateandhomes-search/Dallas_TX',
      'https://www.auction.com/residential/tx/dallas-county/',
      'https://www.zillow.com/user/acct/login/',
      'https://example.com/property/123-main'
    ];
    for (const url of rejectedUrls) {
      assert.strictEqual(radar.isAcceptedListingUrl(url), false, `should reject ${url}`);
    }

    const zillowAddress = radar.extractAddressFromListingUrl('https://www.zillow.com/homedetails/123-Main-St-Dallas-TX-75208/123456_zpid/');
    assert.strictEqual(zillowAddress.normalized_address, '123 Main St, Dallas, TX 75208');
    assert.strictEqual(zillowAddress.address_provenance, 'ADDRESS_FROM_LISTING_URL_SLUG');
    const redfinAddress = radar.extractAddressFromListingUrl('https://www.redfin.com/TX/Fort-Worth/456-Oak-Ave-76102/home/888');
    assert.strictEqual(redfinAddress.normalized_address, '456 Oak Ave, Fort Worth, TX 76102');
    const malformedAddress = radar.extractAddressFromListingUrl('https://www.zillow.com/homedetails/not-a-real-listing/123_zpid/');
    assert.strictEqual(malformedAddress.normalized_address, '');

    const groups = radar.buildListingRadarQueryGroups({ city: 'Dallas', state: 'TX' });
    assert.strictEqual(groups.length, 6);
    assert.ok(groups.every((group) => group.max_results <= 2));
    assert.ok(groups.every((group) => /"Dallas, TX"|site:redfin\.com\/TX\/Dallas/.test(group.query)), 'queries must target quoted market or Redfin city path');
    assert.ok(groups.every((group) => !/auction\.com|realauction\.com/i.test(group.query)), 'auction groups should not burn query slots');
    assert.ok(groups.some((group) => group.query === 'site:zillow.com/homedetails "Dallas, TX" fixer'));
    assert.ok(groups.some((group) => group.query === 'site:zillow.com/homedetails "Dallas, TX" "price cut"'));
    assert.ok(groups.some((group) => group.query === 'site:redfin.com/TX/Dallas "fixer"'));
    assert.ok(groups.some((group) => group.query === 'site:realtor.com/realestateandhomes-detail "Dallas, TX" foreclosure'));
    for (const group of groups) {
      const query = group.query.replace(/"Dallas, TX"/g, '').replace(/site:\S+/g, '').trim();
      assert.ok(!/fixer.+cash only|cash only.+as-is|foreclosure.+price cut|fixer.+needs TLC|auction.+cash only/i.test(query), `query must use one distress term/phrase: ${group.query}`);
    }

    const successPage = await radar.fetchListingPageEvidence(
      'https://www.zillow.com/homedetails/123-Main-St-Dallas-TX-75208/123456_zpid/',
      {
        page_fetch_impl: async () => htmlResponse(200, '<title>123 Main St Dallas TX 75208</title><body>$199,000 3 beds 2 baths 1,420 sqft For sale. Cash only fixer, needs TLC. Listed by Jane Agent.</body>')
      }
    );
    assert.strictEqual(successPage.status, 'fetched');
    assert.ok(/For sale/i.test(successPage.status_evidence_text));
    assert.ok(/fixer|needs TLC|Cash only/i.test(successPage.motivation_evidence_text));
    assert.strictEqual(successPage.asking_price, '$199,000');
    assert.strictEqual(successPage.beds, 3);
    assert.strictEqual(successPage.baths, 2);
    assert.strictEqual(successPage.sqft, 1420);

    const blockedPage = await radar.fetchListingPageEvidence(
      'https://www.zillow.com/homedetails/321-Pine-St-Dallas-TX-75208/999_zpid/',
      { page_fetch_impl: async () => htmlResponse(403, '') }
    );
    assert.strictEqual(blockedPage.blocked, true);
    assert.strictEqual(blockedPage.blocked_reason, 'http_403');

    const run = await radar.runListingRadarAcquisitionAdapter({
      city: 'Dallas',
      county: 'Dallas',
      state: 'TX',
      max_results: 10,
      max_page_fetches: 2,
      query_groups: [{
        query_group: 'listing_radar_test_all_results',
        provider_family: 'public_listing_radar',
        purpose: 'listing_radar',
        query: 'mock listing radar',
        max_results: 10
      }],
      env: {
        NODE_ENV: 'test',
        ENABLE_SEARCH_PROVIDER: 'true',
        SEARCH_PROVIDER: 'mock'
      },
      mock_search_results: [
        {
          title: '123 Main St Dallas TX 75208 | Zillow',
          snippet: 'For sale. Cash only fixer. Public listing page.',
          url: 'https://www.zillow.com/homedetails/123-Main-St-Dallas-TX-75208/123456_zpid/'
        },
        {
          title: '321 Pine St Dallas TX 75208 | Zillow',
          snippet: 'Price cut. For sale.',
          url: 'https://www.zillow.com/homedetails/321-Pine-St-Dallas-TX-75208/999_zpid/'
        },
        {
          title: 'Dallas homes for sale',
          snippet: 'Generic search page.',
          url: 'https://www.zillow.com/dallas-tx/'
        },
        {
          title: 'Zillow building',
          snippet: 'Generic building page.',
          url: 'https://www.zillow.com/b/dallas-tx-building/abc123/'
        },
        {
          title: 'Redfin Texas',
          snippet: 'Generic Redfin state page.',
          url: 'https://www.redfin.com/state/Texas/for-sale-by-owner'
        },
        {
          title: 'Realtor search',
          snippet: 'Generic search.',
          url: 'https://www.realtor.com/realestateandhomes-search/Dallas_TX'
        },
        {
          title: 'Auction search',
          snippet: 'Generic auction search.',
          url: 'https://www.auction.com/residential/tx/dallas-county/'
        },
        {
          title: 'Example page',
          snippet: 'Unsupported host.',
          url: 'https://example.com/property/123-main'
        },
        {
          title: 'Login',
          snippet: 'Login page.',
          url: 'https://www.zillow.com/user/acct/login/'
        }
      ],
      page_fetch_impl: async (url) => {
        if (/321-Pine/i.test(url)) return htmlResponse(403, '');
        return htmlResponse(200, '<title>123 Main St Dallas TX</title><body>$199,000 3 beds 2 baths 1,420 sqft For sale. Cash only fixer.</body>');
      }
    });

    assert.strictEqual(run.preview_only, true);
    assert.strictEqual(run.should_ingest, false);
    assert.strictEqual(run.no_global_mutation, true);
    assert.strictEqual(run.source_id, radar.SOURCE_ID);
    assert.ok(run.diagnostics.query_group_count <= 6, 'query cap must be enforced');
    assert.strictEqual(run.diagnostics.listing_radar_page_fetches_used, 2, 'page fetch cap must be enforced');
    assert.ok(run.candidates.length >= 1, 'accepted property-specific URLs become candidates');
    assert.ok(!run.candidates.some((candidate) => /\/dallas-tx\/?$/i.test(candidate.source_url)), 'generic category URL must not survive as a candidate');
    assert.strictEqual(run.diagnostics.listing_radar_accepted_count, 2);
    assert.ok(run.diagnostics.listing_radar_rejected_count >= 6);
    assert.strictEqual(run.diagnostics.rejected_url_samples.length, 5, 'rejected samples must be capped at 5');
    assert.ok(run.diagnostics.rejected_url_samples.every((sample) => sample.source_url.length <= 120));
    assert.ok(run.diagnostics.rejected_reason_counts.generic_zillow_url >= 2);
    const main = run.candidates.find((candidate) => candidate.normalized_address === '123 Main St, Dallas, TX 75208');
    assert.ok(main);
    assert.strictEqual(main.address_provenance, 'ADDRESS_FROM_LISTING_URL_SLUG');
    assert.strictEqual(main.contact_route, '', 'must not fake visible contact');
    assert.strictEqual(main.contact_verified, false);
    assert.strictEqual(main.source_classification, 'exact_property_record');
    const blocked = run.candidates.find((candidate) => candidate.normalized_address === '321 Pine St, Dallas, TX 75208');
    assert.ok(blocked);
    assert.strictEqual(blocked.listing_radar_status, radar.BLOCKED_PUBLIC_SOURCE);
    assert.strictEqual(blocked.blocked_sources[0].reason, 'http_403');

    console.log('listing radar acquisition adapter tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
