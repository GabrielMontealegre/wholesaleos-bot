'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'pdf-parse') {
    return async (buffer) => ({ text: Buffer.from(buffer).toString('utf8') });
  }
  return originalLoad.call(this, request, parent, isMain);
};

const contactHunter = require('../modules/research/free-public-contact-hunter');
const compHunter = require('../modules/research/free-public-comp-hunter');
const dealBoard = require('../modules/research/free-public-deal-board');

function makeResponse(body, contentType = 'text/html; charset=UTF-8', status = 200, finalUrl = '') {
  const buffer = Buffer.from(String(body || ''), 'utf8');
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl,
    headers: { get: (name) => (/^content-type$/i.test(name) ? contentType : /^set-cookie$/i.test(name) ? 'sid=test' : '') },
    async text() { return buffer.toString('utf8'); },
    async arrayBuffer() { return buffer; }
  };
}

(async () => {
  const noticePdfUrl = 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/May/Dallas_1.pdf';
  const noticePdfText = [
    'NOTICE OF SUBSTITUTE TRUSTEE SALE',
    'Deed of Trust executed by ROY EXAMPLE AND BETTY EXAMPLE, grantor',
    'For Sale Information: (888) 313-1969',
    'For Reinstatement Requests: 1-866-874-5860'
  ].join('\n');

  // 1) Visible phone in trusted source document -> CALL_READY, labeled non-owner.
  const phoneRun = await contactHunter.runFreePublicContactHunter({
    rows: [{ normalized_address: '3723 Barnabus Rd, Dallas, TX 75241', source_document_url: noticePdfUrl, city: 'Dallas' }]
  }, {
    fetch_impl: async (url) => {
      if (String(url) === noticePdfUrl) return makeResponse(noticePdfText, 'application/pdf');
      throw new Error(`unexpected:${url}`);
    },
    env: { ENABLE_SEARCH_PROVIDER: 'false' }
  });
  const phoneResult = phoneRun.results.get('3723 barnabus rd, dallas, tx 75241');
  assert.ok(phoneResult);
  assert.strictEqual(phoneResult.free_contact_status, 'CALL_READY');
  const phoneRoute = phoneResult.free_contact_routes.find((route) => route.route_kind === 'phone');
  assert.ok(phoneRoute);
  assert.strictEqual(phoneRoute.route_type, 'trustee_servicer_or_official');
  assert.ok(phoneRoute.risk_flags.includes('not_confirmed_owner_contact'));
  assert.ok(phoneRoute.source_url === noticePdfUrl);
  assert.ok(/sale information/i.test(phoneRoute.evidence_text));
  assert.ok(phoneResult.owner_or_entity_clues.some((clue) => /roy example/i.test(clue.value)));
  assert.ok(!phoneResult.owner_or_entity_clues.some((clue) => /trustee|mers|bank/i.test(clue.value)));
  assert.strictEqual(phoneResult.preview_only, true);

  // 2) Email/form -> OUTREACH_READY; telemetry emails and mixed-separator
  // digit runs are never treated as contact routes.
  const emailRun = await contactHunter.runFreePublicContactHunter({
    rows: [{ normalized_address: '10 Test St, Dallas, TX 75201', source_document_url: 'https://notices.dallascounty.org/notice.html', city: 'Dallas' }]
  }, {
    fetch_impl: async () => makeResponse('<html>Reply to listing: contact seller at owner.reply@sellermail.com. Telemetry: a0dfc4d25bb843acb944ff1d115fd1b2@o168728.ingest.sentry.io ref 469.572 1775 build.</html>'),
    env: { ENABLE_SEARCH_PROVIDER: 'false' }
  });
  const emailResult = emailRun.results.get('10 test st, dallas, tx 75201');
  assert.strictEqual(emailResult.free_contact_status, 'OUTREACH_READY');
  assert.ok(emailResult.free_contact_routes.some((route) => route.route_kind === 'email' && route.value === 'owner.reply@sellermail.com'));
  assert.ok(!emailResult.free_contact_routes.some((route) => /sentry/i.test(route.value)));
  assert.ok(!emailResult.free_contact_routes.some((route) => route.route_kind === 'phone'));

  // 3) Mailing-only via county profile -> MAIL_READY.
  const mailRun = await contactHunter.runFreePublicContactHunter({
    rows: [{ normalized_address: '11 Mail Ave, Dallas, TX 75202', city: 'Dallas' }]
  }, {
    fetch_impl: async () => { throw new Error('no pages'); },
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    county_profile: {
      county: 'Dallas',
      state: 'TX',
      appraisal_source_url: 'https://www.dallascad.org/SearchAddr.aspx',
      appraisalLookup: async () => ({
        status: 'owner_found',
        owner_name: 'MAIL OWNER LLC',
        mailing_address: 'PO Box 99, Dallas, TX 75200',
        source_url: 'https://www.dallascad.org/AcctDetail.aspx?ID=1',
        evidence_text: 'Owner: MAIL OWNER LLC Mailing: PO Box 99'
      })
    }
  });
  const mailResult = mailRun.results.get('11 mail ave, dallas, tx 75202');
  assert.strictEqual(mailResult.free_contact_status, 'MAIL_READY');
  assert.strictEqual(mailResult.mailing_route.value, 'PO Box 99, Dallas, TX 75200');
  assert.ok(mailResult.owner_or_entity_clues.some((clue) => clue.clue_kind === 'appraisal_owner_of_record'));
  assert.strictEqual(mailResult.next_free_action, 'SEND_LETTER_TO_OWNER_MAILING_ADDRESS');

  // 4) Nothing found, searches ran -> CONTACT_SEARCH_EXHAUSTED_FREE with search log.
  const emptyRun = await contactHunter.runFreePublicContactHunter({
    rows: [{ normalized_address: '12 Empty Rd, Dallas, TX 75203', source_document_url: 'https://example.dallascounty.org/empty.html', city: 'Dallas' }]
  }, {
    fetch_impl: async () => makeResponse('<html>No contacts here.</html>'),
    env: { ENABLE_SEARCH_PROVIDER: 'false' }
  });
  const emptyResult = emptyRun.results.get('12 empty rd, dallas, tx 75203');
  assert.strictEqual(emptyResult.free_contact_status, 'CONTACT_SEARCH_EXHAUSTED_FREE');
  assert.ok(emptyResult.free_searches_run.length >= 1);
  assert.strictEqual(emptyResult.next_free_action, 'DECIDE_PAID_SKIP_TRACE');

  // 5) CAPTCHA page -> blocked source reported, no bypass, no routes.
  const blockedRun = await contactHunter.runFreePublicContactHunter({
    rows: [{ normalized_address: '13 Blocked Ln, Dallas, TX 75204', source_document_url: 'https://example.dallascounty.org/blocked.html', city: 'Dallas' }]
  }, {
    fetch_impl: async () => makeResponse('<html>Please complete this captcha to continue. Call 555-123-4567.</html>'),
    env: { ENABLE_SEARCH_PROVIDER: 'false' }
  });
  const blockedResult = blockedRun.results.get('13 blocked ln, dallas, tx 75204');
  assert.ok(blockedResult.blocked_sources.some((item) => item.reason === 'captcha_or_login_wall'));
  assert.strictEqual(blockedResult.free_contact_routes.length, 0);
  assert.strictEqual(blockedResult.next_free_action, 'RETRY_BLOCKED_SOURCES_MANUALLY_IN_BROWSER');

  // 6) Comp hunter: verified comp accepted, subject comp rejected, caps respected.
  const soldPage = (address) => `
    <html>
      <script type="application/ld+json">{"@type":"SingleFamilyResidence","address":{"streetAddress":"${address.split(',')[0]}","addressLocality":"Dallas","addressRegion":"TX","postalCode":"75241"}}</script>
      <body>Sold on 05/10/2026 for. Sold price $245,000 recorded.</body>
    </html>`;
  const compQueries = [];
  const compRun = await compHunter.runFreePublicCompHunter({
    rows: [{ normalized_address: '3723 Barnabus Rd, Dallas, TX 75241', city: 'Dallas' }]
  }, {
    fetch_impl: async (url) => {
      if (/serper/i.test(String(url))) throw new Error('no serper in test');
      if (/comp-a/.test(String(url))) return makeResponse(soldPage('3720 Barnabus Rd, Dallas, TX 75241'));
      if (/subject/.test(String(url))) return makeResponse(soldPage('3723 Barnabus Rd, Dallas, TX 75241'));
      return makeResponse('<html>nothing sold here</html>');
    },
    env: { ENABLE_SEARCH_PROVIDER: 'true', SEARCH_PROVIDER: 'serper', SERPER_API_KEY: 'test-key', SERPER_QUERY_MODE: 'free' },
    mock_search_results: [
      { title: 'Sold: 3720 Barnabus Rd', snippet: 'Sold 05/10/2026 for $245,000', url: 'https://www.zillow.com/homedetails/comp-a_zpid/' },
      { title: 'Sold: 3723 Barnabus Rd (subject)', snippet: 'Sold', url: 'https://www.zillow.com/homedetails/subject_zpid/' }
    ]
  });
  const compResult = compRun.results.get('3723 barnabus rd, dallas, tx 75241');
  assert.ok(compResult);
  assert.strictEqual(compResult.free_comp_status, 'COMP_PARTIAL');
  assert.strictEqual(compResult.verified_comps.length, 1);
  assert.strictEqual(compResult.verified_comps[0].sold_price, 245000);
  assert.ok(/zillow\.com\/homedetails\/comp-a/.test(compResult.verified_comps[0].source_url));
  assert.ok(compResult.comp_candidates.some((candidate) => candidate.rejected_reason === 'subject_property_not_a_comp'));

  // 7) TX board wiring: comp lane is skipped by policy before any comp fetch/impl call.
  let txCompImplCalls = 0;
  let txSoldCompFetches = 0;
  const txBoardResult = await dealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    enable_free_public_hunters: true,
    source_records: [{
      headline: '3723 Barnabus Rd, Dallas, TX 75241',
      address: '3723 Barnabus Rd, Dallas, TX 75241',
      source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
      source_document_url: noticePdfUrl,
      source_family: 'preforeclosure_trustee_notice',
      motivation_type: 'preforeclosure_trustee_notice',
      motivation_evidence_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE'
    }]
  }, {
    fetch_impl: async (url) => {
      if (/zillow|redfin|realtor|homedetails|sold/i.test(String(url))) txSoldCompFetches += 1;
      return makeResponse('<html>ok</html>');
    },
    free_contact_hunter_impl: async ({ rows }) => ({
      rows_hunted: rows.length,
      results: new Map([[rows[0].normalized_address.toLowerCase(), {
        free_contact_status: 'CONTACT_SEARCH_EXHAUSTED_FREE',
        free_contact_routes: [],
        owner_or_entity_clues: [],
        mailing_route: null,
        free_searches_run: [{ source: 'row_source_document', target: noticePdfUrl }],
        blocked_sources: [],
        next_free_action: 'PAID_SKIP_TRACE_REQUIRED',
        why_call_ready_or_blocked: 'No free public owner contact found.',
        preview_only: true
      }]])
    }),
    free_comp_hunter_impl: async () => {
      txCompImplCalls += 1;
      throw new Error('TX comp hunter should be skipped by market policy');
    }
  });
  const txBoardRow = txBoardResult.free_public_deals.find((deal) => deal.normalized_address === '3723 Barnabus Rd, Dallas, TX 75241');
  assert.ok(txBoardRow);
  assert.strictEqual(txCompImplCalls, 0);
  assert.strictEqual(txSoldCompFetches, 0);
  assert.strictEqual(txBoardRow.free_comp_status, 'SKIPPED_POLICY');
  assert.strictEqual(txBoardRow.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
  assert.strictEqual(txBoardRow.arv_lock_reason, 'ARV_LOCKED_NON_DISCLOSURE_STATE_MLS_REQUIRED');
  assert.ok(txBoardRow.enrichment_ledger.attempts.some((attempt) => attempt.lane === 'sold_comp' && attempt.outcome === 'SKIPPED_POLICY'));

  // 8) MI board wiring: mock hunter impls, statuses land on rows and call_prep, no mutations.
  const boardResult = await dealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    enable_free_public_hunters: true,
    source_records: [{
      headline: '13905 Sussex St, Detroit, MI 48227',
      address: '13905 Sussex St, Detroit, MI 48227',
      source_url: 'https://buildingdetroit.org/properties/13905-sussex',
      source_document_url: noticePdfUrl,
      source_family: 'land_bank_public_sale',
      motivation_type: 'land_bank_public_sale',
      motivation_evidence_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE'
    }]
  }, {
    fetch_impl: async () => makeResponse('<html>ok</html>'),
    free_contact_hunter_impl: async ({ rows }) => ({
      rows_hunted: rows.length,
      results: new Map([[rows[0].normalized_address.toLowerCase(), {
        free_contact_status: 'CALL_READY',
        free_contact_routes: [{ route_kind: 'phone', value: '(888) 313-1969', route_type: 'trustee_servicer_or_official', source_kind: 'public_source_document', source_url: noticePdfUrl, evidence_text: 'For Sale Information: (888) 313-1969', confidence: 'Medium', risk_flags: ['not_confirmed_owner_contact'] }],
        owner_or_entity_clues: [{ clue_kind: 'borrower_name_in_notice', value: 'ROY EXAMPLE', source_url: noticePdfUrl, evidence_text: 'grantor ROY EXAMPLE', confidence: 'Medium', risk_flags: [] }],
        mailing_route: null,
        free_searches_run: [{ source: 'row_source_document', target: noticePdfUrl }],
        blocked_sources: [],
        next_free_action: 'CALL_VISIBLE_ROUTE_AND_ASK_FOR_OWNER_PATH',
        why_call_ready_or_blocked: 'Visible trustee sale-information phone with evidence.',
        preview_only: true
      }]])
    }),
    free_comp_hunter_impl: async ({ rows }) => ({
      rows_hunted: rows.length,
      results: new Map([[rows[0].normalized_address.toLowerCase(), {
        free_comp_status: 'COMP_PARTIAL',
        verified_comps: [{ comp_address: '3720 Barnabus Rd, Dallas, TX 75241', sold_status: 'sold', sold_price: 245000, sold_date: '05/10/2026', source_kind: 'public_web_page', source_url: 'https://www.zillow.com/homedetails/comp-a_zpid/', evidence_text: 'Sold 05/10/2026 for $245,000' }],
        comp_candidates: [],
        free_searches_run: [{ source: 'public_search', target: 'sold comps' }],
        blocked_sources: [],
        preview_only: true
      }]])
    })
  });
  const boardRow = boardResult.free_public_deals.find((deal) => deal.normalized_address === '13905 Sussex St, Detroit, MI 48227');
  assert.ok(boardRow);
  assert.strictEqual(boardRow.free_contact_status, 'CALL_READY');
  assert.strictEqual(boardRow.call_readiness, 'CALL_READY');
  assert.ok(/\(888\) 313-1969/.test(boardRow.contact_route_if_visible));
  assert.ok(/trustee/.test(boardRow.contact_route_if_visible));
  assert.strictEqual(boardRow.free_comp_status, 'COMP_PARTIAL');
  assert.strictEqual(boardRow.verified_sold_comp_count, 1);
  assert.strictEqual(boardRow.call_prep.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
  assert.strictEqual(boardRow.MAO_lock_state, 'MAO_LOCKED_NO_ARV');
  assert.strictEqual(boardRow.call_prep.free_contact_status, 'CALL_READY');
  assert.strictEqual(boardRow.call_prep.next_free_action, 'CALL_VISIBLE_ROUTE_AND_ASK_FOR_OWNER_PATH');
  assert.ok(boardRow.owner_or_entity_clues.length >= 1);
  assert.strictEqual(boardResult.free_call_ready_count, 1);
  assert.strictEqual(boardResult.free_comp_partial_count, 1);
  assert.strictEqual(boardResult.preview_only, true);
  assert.strictEqual(boardResult.should_ingest, false);

  // 8b) Cycle 8 wiring: official parcel owner + entity route + disclosure-state comps.
  const cycle8Result = await dealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Detroit', county: 'Wayne', state: 'MI' },
    enable_free_public_hunters: true,
    source_records: [{
      headline: '13905 Sussex St, Detroit, MI 48227',
      address: '13905 Sussex St, Detroit, MI 48227',
      source_url: 'https://buildingdetroit.org/properties/13905-sussex',
      source_family: 'land_bank_public_sale',
      motivation_type: 'land_bank_public_sale',
      motivation_evidence_text: 'Public land bank sale row',
      status_evidence_text: 'Active public listing'
    }]
  }, {
    fetch_impl: async () => makeResponse('<html>ok</html>'),
    free_contact_hunter_impl: async ({ rows }) => ({
      rows_hunted: rows.length,
      results: new Map([[rows[0].normalized_address.toLowerCase(), {
        free_contact_status: 'CONTACT_SEARCH_EXHAUSTED_FREE',
        free_contact_routes: [],
        owner_or_entity_clues: [],
        mailing_route: null,
        free_searches_run: [],
        blocked_sources: [],
        next_free_action: 'DECIDE_PAID_SKIP_TRACE',
        why_call_ready_or_blocked: 'No public phone found.',
        preview_only: true
      }]]),
      attempt_records: []
    }),
    public_parcel_owner_lookup_impl: async ({ rows }) => ({
      rows_hunted: rows.length,
      results: new Map([[rows[0].normalized_address.toLowerCase(), {
        status: 'owner_found',
        owner_record: {
          owner_name: 'Example Holdings LLC',
          mailing_address: 'PO BOX 10 DETROIT MI 48201',
          parcel_id: 'W-123',
          is_entity: true,
          source_kind: 'official_public_record',
          source_url: 'https://services2.arcgis.com/parcel/query',
          evidence_text: 'Owner: Example Holdings LLC | Mailing: PO BOX 10 DETROIT MI 48201'
        },
        mailing_route: {
          route_kind: 'mailing_address',
          route_type: 'owner_mailing_address',
          value: 'PO BOX 10 DETROIT MI 48201',
          source_kind: 'official_public_record',
          source_url: 'https://services2.arcgis.com/parcel/query',
          evidence_text: 'Owner mailing address on public parcel record.',
          confidence: 'High',
          risk_flags: ['mail_only_route']
        }
      }]]),
      attempt_records: [{ row_key: rows[0].normalized_address.toLowerCase(), lane: 'county_appraisal', attempted_at: new Date().toISOString(), outcome: 'FOUND', reason_code: 'OFFICIAL_OWNER_RECORD_FOUND', reason_text: 'Owner found.', source_url: 'https://services2.arcgis.com/parcel/query', cost_usd: 0 }]
    }),
    business_entity_owner_resolution_impl: async ({ rows }) => ({
      rows_hunted: rows.length,
      results: new Map([[rows[0].normalized_address.toLowerCase(), {
        status: 'agent_found',
        entity_name: 'Example Holdings LLC',
        entity_status: 'Active',
        registered_agent_name: 'Jane Agent',
        registered_agent_address: '44 Agent Way Detroit MI 48201',
        source_kind: 'official_public_record',
        source_url: 'https://cofs.lara.state.mi.us/entity/example',
        evidence_text: 'Registered Agent: Jane Agent',
        entity_contacts: [{
          route_kind: 'phone',
          route_type: 'registered_agent_or_filing_phone_not_owner',
          value: '(313) 555-1212',
          source_kind: 'official_public_record',
          source_url: 'https://cofs.lara.state.mi.us/entity/example',
          evidence_text: 'Phone: (313) 555-1212',
          confidence: 'Low',
          risk_flags: ['registered_agent_not_owner', 'verify_before_dialing']
        }]
      }]]),
      attempt_records: [{ row_key: rows[0].normalized_address.toLowerCase(), lane: 'business_entity_registry', attempted_at: new Date().toISOString(), outcome: 'FOUND', reason_code: 'REGISTERED_AGENT_RECORD_FOUND', reason_text: 'Agent found.', source_url: 'https://cofs.lara.state.mi.us/entity/example', cost_usd: 0 }]
    }),
    disclosure_comp_resolution_impl: async ({ rows }) => ({
      rows_hunted: rows.length,
      results: new Map([[rows[0].normalized_address.toLowerCase(), {
        free_comp_status: 'COMP_READY',
        verified_comps: [
          { comp_address: '14001 Sussex St, Detroit, MI 48227', sold_status: 'sold', sold_price: 210000, sold_date: '2026-01-15', source_kind: 'official_public_record', source_url: 'https://services2.arcgis.com/sales/query?1', evidence_text: 'Recorded sale price: $210000' },
          { comp_address: '14011 Sussex St, Detroit, MI 48227', sold_status: 'sold', sold_price: 220000, sold_date: '2026-03-15', source_kind: 'official_public_record', source_url: 'https://services2.arcgis.com/sales/query?2', evidence_text: 'Recorded sale price: $220000' },
          { comp_address: '14021 Sussex St, Detroit, MI 48227', sold_status: 'sold', sold_price: 230000, sold_date: '2026-04-15', source_kind: 'official_public_record', source_url: 'https://services2.arcgis.com/sales/query?3', evidence_text: 'Recorded sale price: $230000' }
        ],
        comp_candidates: [],
        free_searches_run: [{ source: 'disclosure_state_public_sales_api', target: 'https://services2.arcgis.com/sales/query' }],
        blocked_sources: [],
        preview_only: true
      }]]),
      attempt_records: [{ row_key: rows[0].normalized_address.toLowerCase(), lane: 'sold_comp', attempted_at: new Date().toISOString(), outcome: 'FOUND', reason_code: 'COMP_READY', reason_text: '3 comps found.', source_url: 'https://services2.arcgis.com/sales/query', cost_usd: 0 }]
    })
  });
  const cycle8Row = cycle8Result.free_public_deals.find((deal) => deal.normalized_address === '13905 Sussex St, Detroit, MI 48227');
  assert.ok(cycle8Row);
  assert.strictEqual(cycle8Row.owner_record.owner_name, 'Example Holdings LLC');
  assert.strictEqual(cycle8Row.mailing_route.source_kind, 'official_public_record');
  assert.strictEqual(cycle8Row.business_entity_resolution.registered_agent_name, 'Jane Agent');
  assert.strictEqual(cycle8Row.row_state, 'CALL_READY');
  assert.strictEqual(cycle8Row.free_contact_status, 'CALL_READY');
  assert.strictEqual(cycle8Row.free_comp_status, 'COMP_READY');
  assert.strictEqual(cycle8Row.ARV_lock_state, 'ARV_UNLOCKED_VERIFIED_COMPS');
  assert.strictEqual(cycle8Row.verified_sold_comp_count, 3);
  assert.ok(cycle8Row.verified_sold_comps.every((comp) => comp.source_kind === 'official_public_record'));

  // 9) Hunters stay off unless explicitly enabled.
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
    fetch_impl: async () => makeResponse('<html>ok</html>'),
    free_contact_hunter_impl: async () => { throw new Error('should not run'); },
    free_comp_hunter_impl: async () => { throw new Error('should not run'); }
  });
  assert.strictEqual(offResult.free_hunters_enabled, false);
  assert.strictEqual(offResult.free_call_ready_count, 0);

  console.log('free public contact + comp hunter tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
