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

  // 2) Email/form -> OUTREACH_READY.
  const emailRun = await contactHunter.runFreePublicContactHunter({
    rows: [{ normalized_address: '10 Test St, Dallas, TX 75201', source_document_url: 'https://example.dallascounty.org/notice.html', city: 'Dallas' }]
  }, {
    fetch_impl: async () => makeResponse('<html>Reply to listing: contact seller at owner.reply@example.com</html>'),
    env: { ENABLE_SEARCH_PROVIDER: 'false' }
  });
  const emailResult = emailRun.results.get('10 test st, dallas, tx 75201');
  assert.strictEqual(emailResult.free_contact_status, 'OUTREACH_READY');
  assert.ok(emailResult.free_contact_routes.some((route) => route.route_kind === 'email' && route.value === 'owner.reply@example.com'));

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

  // 7) Board wiring: mock hunter impls, statuses land on rows and call_prep, no mutations.
  const boardResult = await dealBoard.runFreePublicDealBoardPreview({
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
    fetch_impl: async () => makeResponse('<html>ok</html>'),
    free_contact_hunter_impl: async ({ rows }) => ({
      rows_hunted: rows.length,
      results: new Map([[rows[0].normalized_address.toLowerCase(), {
        free_contact_status: 'CALL_READY',
        free_contact_routes: [{ route_kind: 'phone', value: '(888) 313-1969', route_type: 'trustee_servicer_or_official', source_url: noticePdfUrl, evidence_text: 'For Sale Information: (888) 313-1969', confidence: 'Medium', risk_flags: ['not_confirmed_owner_contact'] }],
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
        verified_comps: [{ comp_address: '3720 Barnabus Rd, Dallas, TX 75241', sold_status: 'sold', sold_price: 245000, sold_date: '05/10/2026', source_url: 'https://www.zillow.com/homedetails/comp-a_zpid/' }],
        comp_candidates: [],
        free_searches_run: [{ source: 'public_search', target: 'sold comps' }],
        blocked_sources: [],
        preview_only: true
      }]])
    })
  });
  const boardRow = boardResult.free_public_deals.find((deal) => deal.normalized_address === '3723 Barnabus Rd, Dallas, TX 75241');
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

  // 8) Hunters stay off unless explicitly enabled.
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
