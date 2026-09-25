'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const notice = require('../modules/research/official-notice-dossier');
const lifecycle = require('../modules/research/lead-lifecycle-status');
const grouping = require('../modules/research/property-identity-grouping');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-cycle-48-'));
const snapshotFile = path.join(directory, 'deal-board-snapshots.json');
const dbFile = path.join(directory, 'db.json');
const evidenceFile = path.join(directory, 'ellis-county-evidence.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = snapshotFile;
process.env.DB_PATH = dbFile;
const service = require('../modules/research/deal-board-queue-service');
const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const documentUrl = 'https://www.co.ellis.tx.us/Archive.aspx?ADID=5233';
const address = '3808 Kings Dr, Ennis, TX 75119';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nAAAAABJRU5ErkJggg==', 'base64');
const bbox = { x0: 1, y0: 1, x1: 50, y1: 20 };

function line(text, confidence = 92) { return { text, confidence, bbox }; }
function makeRow(extra = {}) {
  return Object.assign({
    queue_key: 'proof|3808', normalized_address: address, city: 'Ennis', county: 'Ellis', state: 'TX',
    source_document_url: documentUrl, source_structured_address_verified: true,
    property_identity_source_only: true, source_proof_text: 'Official notice names 3808 Kings Dr, Ennis, TX 75119.',
    preview_only: true, not_a_saved_lead: true, ready_to_offer: 'NO'
  }, extra);
}

function hooks() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
  const context = { window: {}, document: { readyState: 'loading', addEventListener() {} },
    MutationObserver: function MutationObserver() {}, setInterval() {}, setTimeout() {},
    fetch() { throw new Error('fixture_network_forbidden'); } };
  vm.runInNewContext(source, context);
  return context.window.__wosPublicDealsTestHooks;
}

async function run() {
  const fixture = { document_url: documentUrl, subject_address: address, proposed_at: '2026-09-24T12:00:00.000Z', pages: [{
    text: 'Property address: 3808 KINGS DR ENNIS TX 75119\nDate of Sale: OCTOBER 6, 2026',
    confidence: 90,
    lines: [line('Property address: 3808 KINGS DR'), line('Date of Sale: OCTOBER 6, 2026'),
      line('Original Trustee: JANE DOE'), line('As Clerk’s File No.: 2319327'),
      line('Original Principal Amount: $300,000.00'), line('LEGAL DESCRIPTION: Lot 12, Block G,'),
      line('Mortgage Servicer: LAKEVIEW LOAN SERVICING, LLC')]
  }] };
  const parsed = notice.extractNoticeProposals(fixture);
  const byField = Object.fromEntries(parsed.proposals.map((proposal) => [proposal.field, proposal]));
  for (const field of ['sale_date', 'trustee_or_substitute_trustee', 'deed_of_trust_instrument_or_volume_page', 'original_principal_amount']) {
    assert(byField[field], `G1: ${field} proposal`);
    assert.strictEqual(byField[field].confirmed, false);
    assert.strictEqual(byField[field].confidence, 92);
    assert.deepStrictEqual(byField[field].crop_bbox, bbox);
    assert.strictEqual(byField[field].document_url, documentUrl);
  }
  assert.strictEqual(byField.original_principal_amount.value, '$300,000.00');
  assert(!byField.property_legal_description, 'G5: incomplete legal description is absent');
  assert.strictEqual(notice.extractNoticeProposals(Object.assign({}, fixture, { subject_address: '3809 Kings Dr, Ennis, TX 75119' })).proposals.length, 0,
    'G5: fields from another property cannot cross over');
  assert(parsed.proposals.every((proposal) => proposal.confirmed === false && !proposal.confirmed_by));
  assert.throws(() => notice.confirmField(byField.sale_date, { confirmed_at: '2026-09-24T12:00:00Z', crop_available: true }),
    /identity_and_time_required/, 'G2');
  assert.throws(() => notice.confirmField(byField.sale_date, { operator_id: 'operator', confirmed_at: '2026-09-24T12:00:00Z', crop_available: false }),
    /crop_required/, 'G4');
  const low = Object.assign({}, byField.sale_date, { confidence_status: 'LOW_CONFIDENCE', crop_ref: byField.sale_date.id });
  assert.throws(() => notice.confirmField(low, { operator_id: 'operator', confirmed_at: '2026-09-24T12:00:00Z', crop_available: true }),
    /crop_review_required/, 'G4');
  assert.strictEqual(notice.confirmField(low, { operator_id: 'operator', confirmed_at: '2026-09-24T12:00:00Z', crop_available: true, crop_viewed: true }).confirmed, true);
  const lowParsed = notice.extractNoticeProposals(Object.assign({}, fixture, { pages: [{
    text: fixture.pages[0].text, confidence: 40,
    lines: [line('Property address: 3808 KINGS DR', 40), line('Date of Sale: OCTOBER 6, 2026', 40)]
  }] }));
  assert.strictEqual(lowParsed.proposals[0].confidence_status, 'LOW_CONFIDENCE', 'G4');

  assert.strictEqual(lifecycle.computeLifecycleStatus(makeRow(), '2026-09-24').reason_code, 'NO_SOURCE_DATE_EVIDENCE', 'G3');
  assert.strictEqual(lifecycle.computeLifecycleStatus(makeRow({ notice_proposals: parsed.proposals }), '2026-09-24').reason_code,
    'NO_SOURCE_DATE_EVIDENCE', 'G3: proposals do not clear quarantine');
  assert.strictEqual(notice.saleAssessment(makeRow({ notice_proposals: parsed.proposals }), [], { today: '2026-09-24' }).sale_status,
    'UNKNOWN', 'G9');
  assert.strictEqual(notice.saleAssessment(makeRow(), [], { today: '2026-09-24', archive_contains_document: false }).sale_status,
    'NOT_FOUND_IN_CURRENT_ARCHIVE', 'G10');
  assert.strictEqual(notice.archiveContainsDocument('<a href="Archive.aspx?ADID=5233">October</a>', documentUrl), true, 'G10');
  assert.strictEqual(notice.archiveContainsDocument('<a href="Archive.aspx?ADID=5221">September</a>', documentUrl), false, 'G10');
  assert.strictEqual(notice.archiveContainsDocument('<h1>Archive Center</h1>', documentUrl), null, 'G10: empty listing is not absence');
  assert.strictEqual(notice.archiveDocumentForDate('<a href="Archive.aspx?ADID=5233">Sale Date: October 06, 2026</a>', '2026-10-06'),
    documentUrl, 'G10: one dated official document');
  assert.strictEqual(notice.archiveDocumentForDate('<a href="Archive.aspx?ADID=5233">October 6, 2026</a><a href="Archive.aspx?ADID=5234">October 6, 2026</a>', '2026-10-06'),
    '', 'G10: an ambiguous date cannot choose a document');
  const older = makeRow({ property_identity_key: 'address|3808', notice_confirmations: [{
    field: 'sale_date', value: '2026-10-06', source_line: 'Date of Sale: OCTOBER 6, 2026', confirmed: true
  }] });
  const newer = makeRow({ queue_key: 'proof|newer', property_identity_key: 'address|3808', notice_confirmations: [{
    field: 'sale_date', value: '2026-11-03', source_line: 'Date of Sale: NOVEMBER 3, 2026', confirmed: true
  }] });
  assert.deepStrictEqual(notice.saleAssessment(older, [], { today: '2026-09-24' }), { sale_status: 'SCHEDULED', days_until_sale: 12 }, 'G9');
  assert.strictEqual(notice.saleAssessment(older, [older, newer], { today: '2026-09-24' }).sale_status, 'SUPERSEDED_BY_NEWER_NOTICE', 'G11');
  assert.strictEqual([older, newer].length, 2, 'G11: older row retained');

  let clock = 0;
  const waits = [];
  let requests = 0;
  const budget = { times: [], tail: Promise.resolve(), stopped: false };
  const client = notice.createOfficialClient({ now_impl: () => clock, sleep_impl: async (ms) => { waits.push(ms); clock += ms; },
    budget_impl: budget,
    request_impl: async () => { requests += 1; return { status: requests === 2 ? 429 : 200, headers: {}, body: Buffer.from('ok') }; } });
  await client.get(documentUrl);
  await assert.rejects(client.get(documentUrl), /blocked_429/, 'G12');
  await assert.rejects(client.get(documentUrl), /stopped_after_block/, 'G12');
  assert.deepStrictEqual(waits, [3000]);
  assert.strictEqual(requests, 2);
  assert.deepStrictEqual(client.events, [{ type: 'blocked', reason: 'official_notice_blocked_429' }], 'G12: block event recorded');
  const forbiddenClient = notice.createOfficialClient({ budget_impl: { times: [], tail: Promise.resolve(), stopped: false },
    request_impl: async () => ({ status: 403, headers: {}, body: Buffer.alloc(0) }) });
  await assert.rejects(forbiddenClient.get(documentUrl), /blocked_403/, 'G12: 403 stops');
  assert.deepStrictEqual(forbiddenClient.events, [{ type: 'blocked', reason: 'official_notice_blocked_403' }]);
  const shared = { times: [], tail: Promise.resolve(), stopped: false };
  const sharedOptions = { budget_impl: shared, now_impl: () => clock,
    sleep_impl: async (ms) => { waits.push(ms); clock += ms; },
    request_impl: async () => ({ status: 200, headers: {}, body: Buffer.from('ok') }) };
  await notice.createOfficialClient(sharedOptions).get(documentUrl);
  await notice.createOfficialClient(sharedOptions).get(documentUrl);
  assert.strictEqual(shared.times[1] - shared.times[0], 3000, 'G12: separate scans share the budget');
  await assert.rejects(notice.createOfficialClient({ request_impl() { throw new Error('must_not_fetch'); } })
    .get('https://www.zillow.com/homedetails/1'), /host_not_allowed/, 'G13');
  assert.strictEqual(notice.officialUrl('https://www.elliscountytx.gov/ArchiveCenter/ViewFile/Item/5233').startsWith('https:'), true);

  const store = { version: 1, markets: { 'dallas|dallas|tx': {
    market, rows: [makeRow({ sale_date_or_event_date: 'source date not yet verified' })], batches: []
  } } };
  fs.writeFileSync(snapshotFile, JSON.stringify(store));
  fs.writeFileSync(dbFile, JSON.stringify({ leads: [] }));
  fs.writeFileSync(evidenceFile, JSON.stringify({ records: [{ id: 'staged-not-applied' }] }));
  const evidenceBefore = fs.readFileSync(evidenceFile);
  const dbBefore = fs.readFileSync(dbFile);
  const scanFixture = { matched_subject: true, proposals: parsed.proposals, crops: parsed.proposals.map((proposal) => ({ id: proposal.id, png })), page_confidences: [90] };
  const fetched = [];
  const response = await service.recordNoticeScan({ market, queue_key: 'proof|3808', document_url: documentUrl }, {
    client_impl: { async get(url) { fetched.push(url); return url.includes('AMID=60')
      ? { url, body: Buffer.from('<a href="Archive.aspx?ADID=5233">October</a>') }
      : { url, body: Buffer.from('%PDF-fixture') }; } },
    scan_impl: async () => scanFixture
  });
  assert.strictEqual(response.proposals.length, parsed.proposals.length);
  assert(response.proposals.every((proposal) => proposal.confirmed === false && service.readNoticeCrop(proposal.crop_ref)), 'G1/G2 crops saved');
  assert(fetched.every((url) => notice.officialUrl(url)), 'G13 official host only');
  assert.strictEqual(service.latestDealBoardSnapshot({ market }).rows[0].quarantine_reason_code, 'NO_SOURCE_DATE_EVIDENCE', 'G3');
  const confirmed = service.recordNoticeFieldConfirmation({ market, queue_key: 'proof|3808', proposal_id: byField.sale_date.id }, {
    operator_id: 'gabriel', now_impl: () => '2026-09-24T12:00:00.000Z'
  });
  assert.strictEqual(confirmed.confirmed_field, 'sale_date');
  const after = service.latestDealBoardSnapshot({ market });
  assert.strictEqual(after.rows[0].sale_date_iso, '2026-10-06', 'G3');
  assert.strictEqual(after.rows[0].sale_date_or_event_date, '2026-10-06', 'G3: confirmed date survives read repair');
  assert.notStrictEqual(after.rows[0].quarantine_reason_code, 'NO_SOURCE_DATE_EVIDENCE', 'G3');
  assert.strictEqual(after.rows[0].notice_sale_assessment.sale_status, 'SCHEDULED', 'G9');
  assert.strictEqual(after.rows[0].notice_sale_assessment.days_until_sale >= 0, true);
  assert.strictEqual(after.rows[0].ready_to_offer, 'NO', 'G15');
  const archiveStore = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  archiveStore.markets['dallas|dallas|tx'].rows[0].source_document_url = 'https://www.co.ellis.tx.us/Archive.aspx?AMID=60';
  archiveStore.markets['dallas|dallas|tx'].rows[0].sale_date_or_event_date = '2026-10-06';
  fs.writeFileSync(snapshotFile, JSON.stringify(archiveStore));
  const fromListing = await service.recordNoticeScan({ market, queue_key: 'proof|3808' }, {
    client_impl: { async get(url) { return url.includes('AMID=60')
      ? { url, body: Buffer.from('<a href="Archive.aspx?ADID=5233">Sale Date: October 06, 2026</a>') }
      : { url, body: Buffer.from('%PDF-fixture') }; } },
    scan_impl: async () => ({ matched_subject: true, proposals: [], crops: [], page_confidences: [90] })
  });
  assert.strictEqual(fromListing.matched_subject, true, 'G10: stored archive listing resolves only by exact dated link');
  assert.strictEqual(service.latestDealBoardSnapshot({ market }).rows[0].notice_scan.document_url, documentUrl);
  assert.deepStrictEqual(fs.readFileSync(evidenceFile), evidenceBefore, 'G14 staged ownership not applied');
  assert.deepStrictEqual(fs.readFileSync(dbFile), dbBefore, 'G14 saved leads unchanged');
  assert.strictEqual(after.full_snapshot_identity_counts.rows_total, 1, 'G16');
  assert.strictEqual(after.full_snapshot_identity_counts.properties_total, 1, 'G16');
  assert(after.full_snapshot_identity_counts.properties_total <= after.full_snapshot_identity_counts.rows_total);
  assert.strictEqual(grouping.groupRows([makeRow(), makeRow({ queue_key: 'proof|second' })]).counts.properties_total, 1);

  const ui = hooks();
  const clueCard = ui.manualEvidenceCard({ queue_key: 'proof|3808', address,
    source_event_date: '2026-10-06', official_notice: { sale_assessment: { sale_status: 'UNKNOWN' },
      proposals: parsed.proposals, confirmations: [] }, packet: { evaluation: { readiness: {} } } });
  assert(clueCard.includes('Date in source excerpt (unconfirmed)') &&
    clueCard.includes('Unknown until the notice date is confirmed.'), 'G9: old event copy cannot imply scheduled');
  assert.strictEqual(ui.upcomingSaleRow([makeRow({ sale_date_iso: '2026-10-06',
    notice_sale_assessment: { sale_status: 'UNKNOWN' } })]), null, 'G9: unconfirmed Ellis date is not next auction');
  const html = ui.officialNoticeDossierHtml({ proposals: parsed.proposals, confirmations: [],
    sale_assessment: { sale_status: 'UNKNOWN' }, county_appraised_value: 430000, document_url: documentUrl },
    { can_contact: { status: 'NO', reason: 'No seller route.' }, can_value: { status: 'NO', reason: 'Three comps missing.' },
      ready_to_offer: { status: 'NO', reason: 'Missing verified evidence.' } }, makeRow());
  assert(html.includes('WHAT WE VERIFIED') && html.includes('WHAT IS A CLUE') && html.includes('WHAT IS NOT KNOWN'), 'G6 dossier');
  assert(!/cancelled/i.test(html), 'G10 absence never means cancellation');
  assert(html.includes('Current payoff: Not published.'), 'G7');
  assert(html.includes('Possible equity: UNKNOWN'), 'G8');
  assert(!/amount owed|current balance|current debt/i.test(html), 'G6 no amount conflation');
  assert(html.includes('Original loan amount when the loan was made'), 'G6');
  assert(html.includes('(not the current payoff)'), 'G6: proposed original amount is not payoff');
  const principalHtml = ui.officialNoticeDossierHtml({ proposals: [], confirmations: [
    Object.assign({}, byField.original_principal_amount, { confirmed: true }),
    { field: 'deed_of_trust_date', value: '2023-06-29', confirmed: true },
    Object.assign({}, byField.deed_of_trust_instrument_or_volume_page, { confirmed: true })
  ], sale_assessment: { sale_status: 'UNKNOWN' } }, {}, makeRow());
  assert(principalHtml.includes('Loan date: 2023-06-29; recorded document: 2319327. This is NOT the current payoff.'),
    'G6: a confirmed principal shows its separately confirmed context');
  assert(html.includes('UNCONFIRMED') && html.includes('Can contact') && html.includes('Can value') && html.includes('Ready to offer'), 'G2/G15');
  assert(!html.includes('Ready to offer: YES'), 'G15');
  const chips = ui.fullIdentityCountChips({ full_snapshot_identity_counts: after.full_snapshot_identity_counts });
  for (const name of ['All-market source rows', 'All-market properties', 'Internal address mismatches', 'Sale-venue mixups', 'Identity unresolved']) {
    assert(chips.includes(name), `G16: ${name}`);
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'research', 'official-notice-dossier.js'), 'utf8');
  assert(!/assessed_value\s*[-+*/]|market_value\s*[-+*/]|original_principal_amount\s*[-+*/]/.test(source), 'G7 no payoff derivation');
  assert(!/require\(['"]\.\.\/sources|require\(['"]\.\/paid/.test(source), 'G13 no other provider');
  for (const gate of ['disclosure-state-comp-resolution.js', 'strict-comp-grid-config.js', 'lead-operations-state.js',
    'lead-lifecycle-status.js', 'property-address-evidence.js']) {
    assert(fs.existsSync(path.join(__dirname, '..', 'modules', 'research', gate)), `G15 gate still present: ${gate}`);
  }
  assert(!fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').includes('notice_scan_auto_confirm'), 'G2');
  console.log('cycle-48 notice extraction G1-G16: PASS');
}

run().finally(() => {
  const target = path.resolve(directory);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('fixture_cleanup_outside_tmp');
  fs.rmSync(target, { recursive: true, force: true });
}).catch((error) => { console.error(error); process.exitCode = 1; });
