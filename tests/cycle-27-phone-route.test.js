'use strict';

const assert = require('assert');
const http = require('http');
const https = require('https');

let networkCalls = 0;
const networkTargets = [];
global.fetch = async (...args) => {
  networkCalls += 1;
  networkTargets.push(String(args[0]));
  throw new Error('network_forbidden_in_cycle_27_phone_route_test');
};
for (const transport of [http, https]) {
  transport.get = () => {
    networkCalls += 1;
    networkTargets.push(`${transport === http ? 'http' : 'https'}.get`);
    throw new Error('network_forbidden_in_cycle_27_phone_route_test');
  };
  transport.request = () => {
    networkCalls += 1;
    networkTargets.push(`${transport === http ? 'http' : 'https'}.request`);
    throw new Error('network_forbidden_in_cycle_27_phone_route_test');
  };
}

const scheduler = require('../modules/research/enrichment-scheduler');
const dealBoard = require('../modules/research/free-public-deal-board');
const leadState = require('../modules/research/lead-operations-state');
const readiness = require('../scripts/cycle-27-phone-route-readiness');

const NOW = '2026-09-12T12:00:00.000Z';

function ownerPhone(value = '(214) 555-0100') {
  return {
    route_kind: 'phone',
    value,
    route_type: 'owner_phone',
    source_kind: 'official_public_record',
    source_url: 'https://county.example.gov/owner/1',
    evidence_text: `Owner of record phone: ${value}.`,
    seller_contact_eligibility: 'SELLER_CONTACT_ELIGIBLE'
  };
}

function trusteePhone() {
  return {
    route_kind: 'phone',
    value: '(214) 555-0199',
    route_type: 'trustee_servicer_or_official',
    source_kind: 'public_source_document',
    source_url: 'https://county.example.gov/notice.pdf',
    evidence_text: 'Substitute trustee sale information: (214) 555-0199.',
    seller_contact_eligibility: 'RESEARCH_ONLY'
  };
}

function ownerEmail() {
  return {
    route_kind: 'email',
    value: 'owner@example.test',
    route_type: 'owner_email',
    source_kind: 'official_public_record',
    source_url: 'https://county.example.gov/owner/1',
    evidence_text: 'Owner of record email: owner@example.test.',
    seller_contact_eligibility: 'SELLER_CONTACT_ELIGIBLE'
  };
}

function row(overrides = {}) {
  return Object.assign({
    queue_key: 'fixture|phone-row',
    normalized_address: '100 Phone Proof St, Dallas, TX 75201',
    source_document_url: 'https://county.example.gov/notice.pdf',
    source_date: '2026-09-10',
    owner_record: { owner_name: 'JANE OWNER' },
    free_contact_routes: [],
    enrichment_ledger: { attempts: [], dropped_count: 0 }
  }, overrides);
}

(async () => {
  const dateUnknown = row({ source_date: '' });
  for (const lane of ['public_search', 'county_appraisal', 'document_reextraction']) {
    const out = scheduler.selectRowsForEnrichment([dateUnknown], {
      lane,
      limit: 1,
      now_iso: NOW,
      market_policy: {},
      terminal_source_url_for_row: (item) => item.source_document_url
    });
    assert.strictEqual(out.selected.length, 1, `${lane} supplies evidence on DATE_UNKNOWN_REVERIFY`);
    assert.strictEqual(out.selected_reasons[0].reason, 'date_unknown_evidence_supply_only');
  }

  for (const lane of ['official_browser_lookup', 'row_source_document', 'sold_comp', 'business_entity_registry']) {
    const out = scheduler.selectRowsForEnrichment([dateUnknown], {
      lane,
      limit: 1,
      now_iso: NOW,
      market_policy: {}
    });
    assert.strictEqual(out.selected.length, 0, `${lane} stays blocked on DATE_UNKNOWN_REVERIFY`);
    assert.strictEqual(out.skipped[0].skip_reason, 'lifecycle_date_unknown_reverify');
  }

  const hardQuarantines = [
    row({ queue_key: 'fixture|sale-passed', sale_date_iso: '2026-09-01' }),
    row({ queue_key: 'fixture|source-gone', source_no_longer_listed: true }),
    row({
      queue_key: 'fixture|duplicate',
      census_matched_address: '100 PHONE PROOF ST, DALLAS, TX 75201',
      evidence_score: 1,
      duplicate_candidates: [{
        queue_key: 'fixture|richer',
        census_matched_address: '100 PHONE PROOF ST, DALLAS, TX 75201',
        evidence_score: 10
      }]
    }),
    { queue_key: 'fixture|unverifiable', enrichment_ledger: { attempts: [] } }
  ];
  for (const blockedRow of hardQuarantines) {
    for (const lane of scheduler.DATE_UNKNOWN_EVIDENCE_LANES) {
      assert.strictEqual(scheduler.selectRowsForEnrichment([blockedRow], {
        lane,
        limit: 1,
        now_iso: NOW,
        market_policy: {},
        terminal_source_url_for_row: (item) => item.source_document_url
      }).selected.length, 0, `${lane} must not run on ${blockedRow.queue_key}`);
    }
  }

  const quarantinedWithPhone = row({ source_date: '', free_contact_routes: [ownerPhone()] });
  assert.strictEqual(leadState.rowStateForDeal(Object.assign({}, quarantinedWithPhone, {
    lifecycle_status: { status: 'DATE_UNKNOWN_REVERIFY', quarantined: true }
  })).row_state, 'LOCKED', 'a phone never makes a date-unknown row callable');

  const freshWithPhone = row({ free_contact_routes: [ownerPhone()] });
  assert.strictEqual(leadState.rowStateForDeal(Object.assign({}, freshWithPhone, {
    lifecycle_status: { status: 'FRESH', quarantined: false }
  })).row_state, 'CALL_READY');

  const freshTrusteePhone = row({ free_contact_routes: [trusteePhone()] });
  assert.notStrictEqual(leadState.rowStateForDeal(Object.assign({}, freshTrusteePhone, {
    lifecycle_status: { status: 'FRESH', quarantined: false }
  })).row_state, 'CALL_READY', 'a trustee number is research-only');

  const fixtureRows = [
    freshWithPhone,
    freshTrusteePhone,
    row({ queue_key: 'fixture|email-only', free_contact_routes: [ownerEmail()] }),
    dateUnknown,
    quarantinedWithPhone
  ];
  const measured = readiness.measureRows({ city: 'Dallas', county: 'Dallas', state: 'TX' }, fixtureRows, NOW);
  assert.strictEqual(measured.total_rows, 5);
  assert.strictEqual(measured.rows_with_seller_eligible_phone, 2);
  assert.strictEqual(measured.rows_with_research_only_phone, 1);
  assert.strictEqual(measured.rows_with_email_but_no_seller_phone, 1, 'email remains optional and does not count as a phone');
  assert.strictEqual(measured.rows_with_verified_phone_blocked_only_by_date_unknown, 1);
  assert.strictEqual(measured.call_ready_now, 1);

  const boardResult = await dealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    enable_free_public_hunters: true,
    source_records: [{
      headline: '100 Phone Proof St, Dallas, TX 75201',
      address: '100 Phone Proof St, Dallas, TX 75201',
      source_url: 'https://county.example.gov/notice',
      source_document_url: 'https://county.example.gov/notice',
      source_family: 'preforeclosure_trustee_notice',
      motivation_type: 'preforeclosure_trustee_notice',
      motivation_evidence_text: 'Official notice with no published date.'
    }]
  }, {
    fetch_impl: async () => ({
      ok: true,
      status: 200,
      url: 'https://county.example.gov/notice',
      headers: { get: (name) => /^content-type$/i.test(name) ? 'text/html; charset=UTF-8' : '' },
      async text() { return '<html><body>Official notice fixture.</body></html>'; },
      async arrayBuffer() { return Buffer.from('Official notice fixture.'); }
    }),
    free_contact_hunter_impl: async ({ rows }) => ({
      rows_hunted: rows.length,
      results: new Map(rows.map((item) => [item.normalized_address.toLowerCase(), {
        free_contact_status: 'CALL_READY',
        free_contact_routes: [ownerPhone()],
        owner_or_entity_clues: [{
          clue_kind: 'owner_or_borrower_name', value: 'JANE OWNER', source_kind: 'official_public_record',
          source_url: 'https://county.example.gov/owner/1', evidence_text: 'Owner of record: JANE OWNER.'
        }],
        mailing_route: null,
        free_searches_run: [{ source: 'public_search', target: 'fixture query' }],
        blocked_sources: [],
        next_free_action: 'CALL_VISIBLE_ROUTE_AND_ASK_FOR_OWNER_PATH',
        why_call_ready_or_blocked: 'Seller-eligible owner phone found with source evidence.'
      }])),
      attempt_records: []
    }),
    census_zip_resolver_impl: async () => ({ resolved: false, reason: 'test_no_network' }),
    public_parcel_owner_lookup_impl: async () => ({ rows_hunted: 0, results: new Map(), attempt_records: [] }),
    business_entity_owner_resolution_impl: async () => ({ rows_hunted: 0, results: new Map(), attempt_records: [] })
  });
  const boardRow = boardResult.free_public_deals.find((item) => item.normalized_address === '100 Phone Proof St, Dallas, TX 75201');
  assert.ok(boardRow, 'date-unknown fixture remains visible for evidence gathering');
  assert.strictEqual(boardResult.enrichment_selected_contact_count, 1, 'the real board path selects the row for phone evidence');
  assert.strictEqual(boardResult.date_unknown_contact_evidence_selected_count, 1);
  assert.strictEqual(boardRow.free_contact_routes.some((route) => route.route_kind === 'phone'), true);
  assert.strictEqual(boardRow.lifecycle_status.quarantined, true);
  assert.strictEqual(boardRow.row_state, 'LOCKED', 'a gathered phone cannot bypass freshness quarantine');
  assert.strictEqual(networkCalls, 0, `readiness measurement and scheduler tests make zero network calls: ${networkTargets.join(', ')}`);

  console.log('cycle 27 phone route tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
