'use strict';

const assert = require('assert');

const freePublicDealBoard = require('../modules/research/free-public-deal-board');
const queueService = require('../modules/research/deal-board-queue-service');
const leadOperationsQueue = require('../modules/research/lead-operations-queue');
const leadOperationsState = require('../modules/research/lead-operations-state');
const mailExport = require('../scripts/export-mail-ready-rows');

const NOW = '2026-08-12T12:00:00.000Z';

function route(kind, value, overrides) {
  return Object.assign({
    route_kind: kind,
    value,
    source_kind: 'official_public_record',
    source_url: 'https://county.example.gov/property/1',
    evidence_text: `${kind} is visible on the official public record.`
  }, overrides || {});
}

function row(overrides) {
  return Object.assign({
    queue_key: 'row-default',
    normalized_address: '100 Main St, Example, TX 75001',
    county: 'Example',
    source_url: 'https://county.example.gov/property/1',
    free_contact_status: 'CONTACT_SEARCH_EXHAUSTED_FREE',
    free_contact_routes: [],
    owner_record: { owner_name: 'JANE DOE', owner_role: 'owner_of_record' },
    verified_sold_comp_count: 0,
    lifecycle_status: { status: 'FRESH', quarantined: false },
    first_seen_at: '2026-08-11T12:00:00.000Z',
    last_seen_at: '2026-08-12T10:00:00.000Z'
  }, overrides || {});
}

function assertState(expected, deal, reasonPattern, actionPattern) {
  const state = leadOperationsState.rowStateForDeal(deal);
  assert.strictEqual(state.row_state, expected);
  assert.match(state.row_state_reason, reasonPattern);
  assert.match(state.next_action, actionPattern);
  return state;
}

(() => {
  const locked = row({ normalized_address: '' });
  assertState('LOCKED', locked, /identity is incomplete/i, /complete property address/i);

  const phone = row({ free_contact_status: 'CALL_READY', free_contact_routes: [route('phone', '(214) 555-0100')] });
  assertState('CALL_READY', phone, /phone route/i, /call this contact/i);

  const email = row({ free_contact_status: 'OUTREACH_READY', free_contact_routes: [route('email', 'seller@example.com')] });
  assertState('OUTREACH_READY', email, /email, form, or reply route/i, /outreach route/i);

  const mailing = row({
    free_contact_status: 'MAIL_READY',
    mailing_route: route('mailing_address', 'PO Box 100, Example, TX 75001')
  });
  assertState('MAIL_READY', mailing, /owner-of-record mailing address/i, /prepare a letter/i);

  const contactSearch = row({
    free_contact_status: '',
    enrichment_ledger: { attempts: [] }
  });
  assertState('NEEDS_CONTACT_SEARCH', contactSearch, /free public contact search has not finished/i, /free contact lanes run/i);

  const skipTrace = row({
    queue_key: 'needs-skip-trace',
    free_contact_status: '',
    enrichment_ledger: {
      attempts: ['row_source_document', 'county_appraisal', 'public_search', 'official_browser_lookup']
        .map((lane) => ({ lane, outcome: 'NOT_FOUND', attempted_at: NOW }))
    }
  });
  assertState('NEEDS_SKIP_TRACE', skipTrace, /free public contact lanes are exhausted/i, /skip tracing/i);

  const needsComps = row({
    contact_workflow_complete: true,
    free_contact_status: 'CALL_READY',
    free_contact_routes: [route('phone', '(214) 555-0101')]
  });
  assertState('NEEDS_COMPS', needsComps, /fewer than 3 verified sold comps/i, /3 verified sold comps/i);

  const titleNeeded = row({
    contact_workflow_complete: true,
    free_contact_status: 'CALL_READY',
    free_contact_routes: [route('phone', '(214) 555-0102')],
    verified_sold_comp_count: 3
  });
  assertState('TITLE_NEEDED', titleNeeded, /no verified public title workflow source exists yet/i, /qualified title company/i);

  assert.notStrictEqual(leadOperationsState.rowStateForDeal(needsComps).row_state, 'TITLE_NEEDED', 'fewer than 3 comps must never reach title workflow');

  const quarantined = row({
    queue_key: 'row-quarantined',
    free_contact_status: 'CALL_READY',
    free_contact_routes: [route('phone', '(214) 555-0103')],
    lifecycle_status: { status: 'SALE_PASSED', quarantined: true, reason_text: 'Sale date passed.' }
  });
  assertState('LOCKED', quarantined, /sale date passed/i, /verify the row status/i);

  const sameInput = row({ free_contact_status: 'CALL_READY', free_contact_routes: [route('phone', '(214) 555-0104')] });
  assert.deepStrictEqual(
    freePublicDealBoard.rowStateForDeal(sameInput),
    queueService.rowStateForDeal(sameInput),
    'the board and persisted queue must use the same state function'
  );

  const ordered = leadOperationsQueue.buildLeadOperationsQueue([
    row({ queue_key: 'call-late', free_contact_status: 'CALL_READY', free_contact_routes: [route('phone', '1')], sale_date_iso: '2026-08-20' }),
    row({ queue_key: 'call-soon', free_contact_status: 'CALL_READY', free_contact_routes: [route('phone', '2')], sale_date_iso: '2026-08-14' }),
    row({ queue_key: 'call-tie-b', free_contact_status: 'CALL_READY', free_contact_routes: [route('phone', '3')], sale_date_iso: '2026-08-14' }),
    row({ queue_key: 'call-tie-a', free_contact_status: 'CALL_READY', free_contact_routes: [route('phone', '4')], sale_date_iso: '2026-08-14' }),
    Object.assign({}, contactSearch, { queue_key: 'needs-contact-search' }),
    skipTrace,
    quarantined,
    titleNeeded
  ], { today_iso: '2026-08-12' });
  const callKeys = ordered.segments.find((segment) => segment.key === 'CALL_READY').rows.map((item) => item.queue_key);
  assert.deepStrictEqual(callKeys, ['call-soon', 'call-tie-a', 'call-tie-b', 'call-late']);
  assert.deepStrictEqual(ordered.segments.find((segment) => segment.key === 'BLOCKED').rows.map((item) => item.queue_key), ['row-quarantined']);
  assert.ok(ordered.segments.filter((segment) => segment.key !== 'BLOCKED').every((segment) => !segment.rows.some((item) => item.queue_key === 'row-quarantined')));
  assert.deepStrictEqual(ordered.segment_order, ['CALL_READY', 'OUTREACH_READY', 'MAIL_READY', 'NEEDS_CONTACT_SEARCH', 'NEEDS_SKIP_TRACE', 'NEEDS_COMPS', 'TITLE_NEEDED', 'BLOCKED']);
  assert.strictEqual(ordered.counts.NEEDS_CONTACT_SEARCH, 1);
  assert.strictEqual(ordered.counts.NEEDS_SKIP_TRACE, 1);
  assert.deepStrictEqual(ordered.segments.find((segment) => segment.key === 'NEEDS_CONTACT_SEARCH').rows.map((item) => item.queue_key), ['needs-contact-search']);
  assert.deepStrictEqual(ordered.segments.find((segment) => segment.key === 'NEEDS_SKIP_TRACE').rows.map((item) => item.queue_key), ['needs-skip-trace']);
  assert.strictEqual(ordered.counts.TITLE_NEEDED, 1);
  const summarized = leadOperationsQueue.summarizeLeadOperationsQueue(ordered);
  assert.deepStrictEqual(summarized.segments.find((segment) => segment.key === 'CALL_READY').row_keys, callKeys);
  assert.ok(!JSON.stringify(summarized).includes('normalized_address'), 'transport summary must not duplicate full row payloads');

  const ownerMail = row({
    queue_key: 'owner-mail',
    free_contact_status: 'MAIL_READY',
    owner_record: { owner_name: 'JANE DOE', owner_role: 'owner_of_record' },
    mailing_route: route('mailing_address', 'PO Box 100, Example, TX 75001')
  });
  const taxpayerMail = row({
    queue_key: 'taxpayer-mail',
    free_contact_status: 'MAIL_READY',
    owner_record: { taxpayer_name: 'BANK NA TAX SERVICE', owner_role: 'taxpayer_of_record' },
    mailing_route: route('mailing_address', 'PO Box 200, Example, TX 75001')
  });
  const noProof = row({
    queue_key: 'no-proof',
    free_contact_status: 'MAIL_READY',
    mailing_route: { route_kind: 'mailing_address', value: 'PO Box 300, Example, TX 75001' }
  });
  const mailRows = mailExport.collectMailReadyRows([ownerMail, taxpayerMail, noProof]);
  assert.strictEqual(mailRows.length, 2, 'mail export must reject routes without provenance');
  assert.strictEqual(mailRows.find((item) => item.recipient_role === 'taxpayer_of_record').caveat, mailExport.TAXPAYER_CAVEAT);
  assert.ok(mailRows.every((item) => item.source_url));
  const csv = mailExport.csvForRows(mailRows);
  assert.match(csv, /recipient_name,recipient_role,mailing_address,property_address,county,motivation,sale_date,source_url,caveat/);
  assert.match(csv, /Taxpayer of record may be a servicer or escrow company, not the owner\./);

  console.log('lead operations queue tests passed');
})();
