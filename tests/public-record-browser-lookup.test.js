'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'pdf-parse') return async (buffer) => ({ text: Buffer.from(buffer).toString('utf8') });
  return originalLoad.call(this, request, parent, isMain);
};

const browserLookup = require('../modules/research/public-record-browser-lookup');
const dallasProfile = require('../modules/sources/dallas-county-free-lookup-profile');
const dealBoard = require('../modules/research/free-public-deal-board');

function fakePlaywright(pageFactory) {
  return {
    chromium: {
      launch: async () => ({
        newContext: async () => ({ newPage: async () => pageFactory() }),
        close: async () => {}
      })
    }
  };
}

function profileWith(searchResult) {
  return {
    county: 'Test',
    state: 'TX',
    appraisal_source_name: 'Test appraisal search',
    appraisal_source_url: 'https://appraisal.example.gov/search',
    browserAppraisalSearch: async () => searchResult
  };
}

const ROW = { normalized_address: '3723 Barnabus Rd, Dallas, TX 75241', city: 'Dallas' };
const KEY = '3723 barnabus rd, dallas, tx 75241';

(async () => {
  const basicPage = () => ({ setDefaultTimeout() {}, close: async () => {} });

  // 1) owner + mailing + facts -> OFFICIAL_LOOKUP_READY; owner + mailing -> MAILING_READY.
  const readyRun = await browserLookup.runPublicRecordBrowserLookup({ rows: [ROW] }, {
    playwright_impl: fakePlaywright(basicPage),
    county_profile: profileWith({
      status: 'owner_found',
      owner_name: 'MAIL OWNER LLC',
      mailing_address: 'PO Box 99, Dallas, TX 75200',
      property_type: 'RESIDENTIAL',
      appraised_value: '$153,440',
      record_url: 'https://appraisal.example.gov/detail?id=1',
      evidence_text: 'Owner: MAIL OWNER LLC | PO Box 99 | RESIDENTIAL | $153,440'
    })
  });
  const ready = readyRun.results.get(KEY);
  assert.strictEqual(ready.official_lookup_status, 'OFFICIAL_LOOKUP_READY');
  assert.strictEqual(ready.owner_record.owner_name, 'MAIL OWNER LLC');
  assert.strictEqual(ready.owner_record.is_entity, true);
  assert.strictEqual(ready.owner_record.owner_role, 'owner_of_record_per_appraisal_search');
  assert.strictEqual(ready.mailing_route.value, 'PO Box 99, Dallas, TX 75200');
  assert.ok(ready.appraisal_clues[0].risk_flags.includes('assessed_value_is_not_arv'));
  assert.strictEqual(ready.next_official_lookup_action, 'SEND_LETTER_TO_OWNER_MAILING_ADDRESS');

  const mailingRun = await browserLookup.runPublicRecordBrowserLookup({ rows: [ROW] }, {
    playwright_impl: fakePlaywright(basicPage),
    county_profile: profileWith({
      status: 'owner_found',
      owner_name: 'JANE OWNER',
      mailing_address: '123 Elsewhere St, Dallas, TX 75201',
      record_url: 'https://appraisal.example.gov/detail?id=2',
      evidence_text: 'Owner: JANE OWNER'
    })
  });
  assert.strictEqual(mailingRun.results.get(KEY).official_lookup_status, 'MAILING_READY');

  // 2) owner without mailing -> OWNER_CLUE_ONLY.
  const clueRun = await browserLookup.runPublicRecordBrowserLookup({ rows: [ROW] }, {
    playwright_impl: fakePlaywright(basicPage),
    county_profile: profileWith({
      status: 'owner_found',
      owner_name: 'KILLER CAPITAL CONSULTANTS LLC',
      record_url: 'https://appraisal.example.gov/detail?id=3',
      evidence_text: 'grid row'
    })
  });
  const clue = clueRun.results.get(KEY);
  assert.strictEqual(clue.official_lookup_status, 'OWNER_CLUE_ONLY');
  assert.strictEqual(clue.next_official_lookup_action, 'SEARCH_OWNER_ENTITY_FOR_PUBLIC_CONTACT');

  // 3) CAPTCHA/blocked -> OFFICIAL_LOOKUP_BLOCKED, reported not bypassed.
  const blockedRun = await browserLookup.runPublicRecordBrowserLookup({ rows: [ROW] }, {
    playwright_impl: fakePlaywright(basicPage),
    county_profile: profileWith({ status: 'blocked', blocked_reason: 'captcha_wall', source_url: 'https://appraisal.example.gov/search' })
  });
  const blocked = blockedRun.results.get(KEY);
  assert.strictEqual(blocked.official_lookup_status, 'OFFICIAL_LOOKUP_BLOCKED');
  assert.ok(blocked.browser_blocked_sources.some((item) => item.reason === 'captcha_wall'));
  assert.strictEqual(blocked.owner_record, null);

  // 4) nothing found -> OFFICIAL_LOOKUP_NOT_FOUND.
  const notFoundRun = await browserLookup.runPublicRecordBrowserLookup({ rows: [ROW] }, {
    playwright_impl: fakePlaywright(basicPage),
    county_profile: profileWith({ status: 'no_visible_owner' })
  });
  assert.strictEqual(notFoundRun.results.get(KEY).official_lookup_status, 'OFFICIAL_LOOKUP_NOT_FOUND');

  // 5) browser runtime failure -> blocked with reason, no crash.
  const runtimeRun = await browserLookup.runPublicRecordBrowserLookup({ rows: [ROW] }, {
    playwright_impl: { chromium: { launch: async () => { throw new Error('no chromium'); } } },
    county_profile: profileWith({ status: 'owner_found', owner_name: 'X' })
  });
  const runtimeBlocked = runtimeRun.results.get(KEY);
  assert.strictEqual(runtimeBlocked.official_lookup_status, 'OFFICIAL_LOOKUP_BLOCKED');
  assert.ok(runtimeBlocked.browser_blocked_sources[0].reason.startsWith('browser_launch_failed'));
  assert.strictEqual(runtimeRun.browser_runtime_available, false);

  // 6) caps: only max_rows distinct rows are looked up.
  let lookups = 0;
  const manyRows = Array.from({ length: 9 }, (_, i) => ({ normalized_address: `${i + 1} Cap St, Dallas, TX 7520${i}`, city: 'Dallas' }));
  await browserLookup.runPublicRecordBrowserLookup({ rows: manyRows, caps: { max_rows: 6 } }, {
    playwright_impl: fakePlaywright(basicPage),
    county_profile: {
      appraisal_source_url: 'https://x.gov',
      browserAppraisalSearch: async () => { lookups += 1; return { status: 'no_visible_owner' }; }
    }
  });
  assert.strictEqual(lookups, 6);

  // 7) Dallas profile parses the DCAD results grid; blocked detail page reported.
  const dcadPage = {
    setDefaultTimeout() {},
    close: async () => {},
    urlValue: 'https://www.dallascad.org/SearchAddr.aspx',
    url() { return this.urlValue; },
    async goto(url) {
      this.urlValue = url;
      if (/AcctDetailRes/.test(url)) return { status: () => 403 };
      return { status: () => 200 };
    },
    async fill() {},
    async click() {},
    async waitForLoadState() {},
    async textContent() { return /AcctDetailRes/.test(this.urlValue) ? '403 - Forbidden: Access is denied.' : 'Find Property By Street Address results below'; },
    async $$eval(selector, fn) {
      return [{
        href: 'AcctDetailRes.aspx?ID=00000636964000000',
        link_text: '3723 BARNABUS DR',
        cells: ['1', '3723 BARNABUS DR', 'DALLAS', 'KILLER CAPITAL CONSULTANTS LLC', '$153,440', 'RESIDENTIAL']
      }];
    }
  };
  const dallasResult = await dallasProfile.browserAppraisalSearch(dcadPage, {
    full_address: '3723 Barnabus Rd, Dallas, TX 75241',
    street_number: '3723',
    street_name: 'Barnabus',
    city: 'Dallas'
  }, { timeout_ms: 10000 });
  assert.strictEqual(dallasResult.status, 'owner_found');
  assert.strictEqual(dallasResult.owner_name, 'KILLER CAPITAL CONSULTANTS LLC');
  assert.strictEqual(dallasResult.appraised_value, '$153,440');
  assert.strictEqual(dallasResult.property_type, 'RESIDENTIAL');
  assert.strictEqual(dallasResult.account_reference, '00000636964000000');
  assert.strictEqual(dallasResult.address_suffix_mismatch, true);
  assert.strictEqual(dallasResult.mailing_address, '');
  assert.ok(dallasResult.blocked_sources.some((item) => /detail_page_blocked/.test(item.reason)));

  // 8) Board wiring: owner lands, appraised value never unlocks ARV, CALL_READY logic untouched.
  const boardResult = await dealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    enable_official_browser_lookup: true,
    source_records: [{
      headline: '3723 Barnabus Rd, Dallas, TX 75241',
      address: '3723 Barnabus Rd, Dallas, TX 75241',
      source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
      source_family: 'preforeclosure_trustee_notice',
      motivation_type: 'preforeclosure_trustee_notice',
      motivation_evidence_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE'
    }]
  }, {
    fetch_impl: async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html>ok</html>', arrayBuffer: async () => Buffer.from('') }),
    public_record_browser_lookup_impl: async ({ rows }) => ({
      rows_hunted: rows.length,
      browser_runtime_available: true,
      results: new Map([[rows[0].normalized_address.toLowerCase(), {
        official_lookup_status: 'OWNER_CLUE_ONLY',
        official_property_record_url: 'https://www.dallascad.org/AcctDetailRes.aspx?ID=00000636964000000',
        owner_record: {
          owner_name: 'KILLER CAPITAL CONSULTANTS LLC',
          owner_role: 'owner_of_record_per_appraisal_search',
          is_entity: true,
          source_url: 'https://www.dallascad.org/SearchAddr.aspx',
          evidence_text: 'DCAD grid row',
          confidence: 'High',
          risk_flags: []
        },
        mailing_route: null,
        property_facts: [{ fact_kind: 'property_type', value: 'RESIDENTIAL', source_url: 'https://www.dallascad.org/SearchAddr.aspx', evidence_text: 'grid', confidence: 'High', risk_flags: [] }],
        appraisal_clues: [{ clue_kind: 'county_appraised_value', value: '$153,440', source_url: 'https://www.dallascad.org/SearchAddr.aspx', evidence_text: 'grid', confidence: 'High', risk_flags: ['assessed_value_is_not_arv', 'not_a_sold_comp'] }],
        browser_sources_checked: [{ source: 'Dallas Central Appraisal District address search', target: 'https://www.dallascad.org/SearchAddr.aspx' }],
        browser_blocked_sources: [],
        next_official_lookup_action: 'SEARCH_OWNER_ENTITY_FOR_PUBLIC_CONTACT',
        preview_only: true
      }]])
    })
  });
  const boardRow = boardResult.free_public_deals.find((deal) => deal.normalized_address === '3723 Barnabus Rd, Dallas, TX 75241');
  assert.ok(boardRow);
  assert.strictEqual(boardRow.official_lookup_status, 'OWNER_CLUE_ONLY');
  assert.strictEqual(boardRow.owner_record.owner_name, 'KILLER CAPITAL CONSULTANTS LLC');
  assert.strictEqual(boardRow.owner_name_if_visible, 'KILLER CAPITAL CONSULTANTS LLC');
  assert.ok(boardRow.owner_or_entity_clues.some((item) => item.clue_kind === 'appraisal_owner_of_record'));
  assert.strictEqual(boardRow.call_prep.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
  assert.strictEqual(boardRow.MAO_lock_state, 'MAO_LOCKED_NO_ARV');
  assert.ok(/not ARV and not a sold comp/i.test(boardRow.why_still_locked));
  assert.strictEqual(boardRow.call_readiness, 'NEEDS_CONTACT_ROUTE');
  assert.strictEqual(boardRow.call_prep.official_lookup_status, 'OWNER_CLUE_ONLY');
  assert.strictEqual(boardResult.owner_clue_only_count, 1);
  assert.strictEqual(boardResult.browser_runtime_available, true);
  assert.strictEqual(boardResult.preview_only, true);
  assert.strictEqual(boardResult.should_ingest, false);

  // 9) Lookup stays off unless explicitly enabled.
  const offResult = await dealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    source_records: [{
      headline: '3723 Barnabus Rd, Dallas, TX 75241',
      address: '3723 Barnabus Rd, Dallas, TX 75241',
      source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
      source_family: 'preforeclosure_trustee_notice',
      motivation_type: 'preforeclosure_trustee_notice',
      motivation_evidence_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE'
    }]
  }, {
    fetch_impl: async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html>ok</html>', arrayBuffer: async () => Buffer.from('') }),
    public_record_browser_lookup_impl: async () => { throw new Error('should not run'); }
  });
  assert.strictEqual(offResult.official_browser_lookup_enabled, false);

  console.log('public record browser lookup tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
