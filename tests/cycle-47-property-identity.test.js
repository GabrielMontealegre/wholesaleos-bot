'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const vm = require('vm');
const grouping = require('../modules/research/property-identity-grouping');

const NOW = '2026-09-24T12:00:00.000Z';
const KINGS = '3808 Kings Dr, Ennis, TX 75119';
const VENUE = '101 W Main St, Waxahachie, TX 75165';
const KEYS = [
  'proof|67e7b52881b7f184ac3f',
  'addr|101 w main st, waxahachie, tx 75165',
  'proof|73492db9c8b2e7a82b1e',
  'proof|da98031678528a11313e',
  'proof|ecf4b1339ba68b416a3c'
];

function row(key, address = KINGS, extra = {}) {
  return Object.assign({
    queue_key: key, normalized_address: address, county: 'Ellis', state: 'TX',
    source_family: 'county_foreclosure_notice', source_document_url: `https://official.example/${encodeURIComponent(key)}.pdf`,
    source_proof_text: `Place of sale: ${VENUE}. Property address: ${address}.`,
    sale_venue_address: VENUE, sale_venue_evidence_text: `Place of sale: ${VENUE}.`,
    source_structured_address_verified: true, property_identity_source_only: true,
    first_seen_at: '2026-09-01T00:00:00.000Z', sale_date_iso: '2026-10-01',
    preview_only: true, not_a_saved_lead: true, ready_to_offer: 'NO',
    evidence_marker: `evidence:${key}`
  }, extra);
}

function dashboardHooks() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
  const context = {
    window: {}, document: { readyState: 'loading', addEventListener() {} },
    MutationObserver: function MutationObserver() {},
    setInterval() {}, setTimeout() {},
    fetch() { throw new Error('network_forbidden'); }
  };
  vm.runInNewContext(source, context);
  return context.window.__wosPublicDealsTestHooks;
}

function checkPureGrouping() {
  const sourceRows = KEYS.map((key, index) => row(key, KINGS, {
    first_seen_at: `2026-09-0${index + 1}T00:00:00.000Z`,
    source_family: index === 1 ? 'county_trustee_notice' : 'county_foreclosure_notice',
    source_document_urls: [`https://official.example/${index}.pdf`],
    evidence_marker: `unique:${index}`
  }));
  const original = JSON.stringify(sourceRows);
  const result = grouping.groupRows(sourceRows, NOW);
  assert.strictEqual(result.groups.length, 1, 'F1: five source rows are one property');
  assert.strictEqual(result.groups[0].member_count, 5);
  assert.deepStrictEqual(result.groups[0].member_queue_keys, KEYS);
  assert.strictEqual(result.groups[0].property_identity_key,
    'address|3808|KINGS|DR|ENNIS|TX|75119');
  assert.strictEqual(JSON.stringify(sourceRows), original, 'F2: grouping is pure');
  const byKey = new Map(result.rows.map((item) => [item.queue_key, item]));
  assert.strictEqual(byKey.size, 5, 'F2: all five keys resolve');
  KEYS.forEach((key, index) => {
    assert.strictEqual(byKey.get(key).evidence_marker, `unique:${index}`);
    assert.deepStrictEqual(byKey.get(key).source_document_urls, sourceRows[index].source_document_urls);
  });
  assert.strictEqual(byKey.get(KEYS[1]).queue_key_address_mismatch, true, 'F3');
  assert.strictEqual(byKey.get(KEYS[1]).queue_key_contaminated_by, 'sale_venue', 'F3');
  assert.strictEqual(byKey.get(KEYS[1]).queue_key_embedded_address,
    '101 w main st, waxahachie, tx 75165');
  assert.strictEqual(byKey.get(KEYS[1]).queue_key, KEYS[1], 'F3: key unchanged');
  assert.strictEqual(byKey.get(KEYS[1]).property_identity_key,
    byKey.get(KEYS[0]).property_identity_key, 'F4: identity comes from sourced address');
  assert.strictEqual(result.groups[0].primary_member, KEYS[0], 'F8: earliest source wins tie');
  assert(result.groups[0].primary_selection_reason.includes('earliest'), 'F8: plain explanation');
  assert.deepStrictEqual(result.groups[0].source_families,
    ['county_foreclosure_notice', 'county_trustee_notice']);
  assert.strictEqual(result.counts.queue_key_address_mismatch, 1);
  assert.strictEqual(result.counts.sale_venue_contaminated, 1);

  const distinct = grouping.groupRows(sourceRows.concat(row('census|3609 KINGS DR, ENNIS, TX, 75119',
    '3609 Kings Dr, Ennis, TX 75119')), NOW);
  assert.strictEqual(distinct.groups.length, 2, 'F5: one digit must not collide');
  assert.notStrictEqual(distinct.rows[0].property_identity_key, distinct.rows[5].property_identity_key);
  const unresolved = grouping.groupRows([
    row('proof|unresolved-1', '', { source_structured_address_verified: false }),
    row('proof|unresolved-2', '', { source_structured_address_verified: false })
  ], NOW);
  assert.strictEqual(unresolved.counts.identity_unresolved, 2, 'F6');
  assert.strictEqual(unresolved.groups.length, 2, 'F6: unresolved rows never group');
  assert(unresolved.rows.every((item) => item.property_identity_key === null));
  const staged = grouping.groupRows([
    row('staged-1', KINGS, { county_appraisal_record: { parcel_id: '292247', county: 'Ellis', state: 'TX',
      source_kind: 'official_public_record', applied_at: null } }),
    row('staged-2', '3808 King Dr, Ennis, TX 75119', { county_appraisal_record: { parcel_id: '292247', county: 'Ellis', state: 'TX',
      source_kind: 'official_public_record', applied_at: null } })
  ], NOW);
  assert.strictEqual(staged.groups.length, 2, 'F7: staged parcel is not identity evidence');
  const applied = grouping.groupRows(staged.rows.map((item) => Object.assign({}, item, {
    county_appraisal_record: { parcel_id: '292247', county: 'Ellis', state: 'TX',
      source_kind: 'official_public_record', applied_at: NOW }
  })), NOW);
  assert.strictEqual(applied.groups.length, 1, 'F7: applied county parcel groups rows');
  assert.strictEqual(applied.groups[0].property_identity_key, 'parcel|TX|ELLIS|292247');
  const addressPreferred = grouping.groupRows([
    row('early-partial', '', { first_seen_at: '2026-01-01', county_appraisal_record: {
      parcel_id: '292247', county: 'Ellis', state: 'TX', source_kind: 'official_public_record', applied_at: NOW } }),
    row('later-complete', KINGS, { first_seen_at: '2026-02-01', county_appraisal_record: {
      parcel_id: '292247', county: 'Ellis', state: 'TX', source_kind: 'official_public_record', applied_at: NOW } })
  ], NOW);
  assert.strictEqual(addressPreferred.groups[0].primary_member, 'later-complete', 'F8: complete sourced address wins');
  const evidencePreferred = grouping.groupRows([
    row('older-less-evidence', KINGS, { first_seen_at: '2026-01-01',
      source_proof_text: '', sale_venue_evidence_text: '', property_identity_source_only: false }),
    row('newer-more-evidence', KINGS, { first_seen_at: '2026-02-01',
      source_row_reference: 'notice-12' })
  ], NOW);
  assert.strictEqual(evidencePreferred.groups[0].primary_member, 'newer-more-evidence', 'F8: source evidence wins');
  assert.strictEqual(result.counts.rows_total, 5, 'F11');
  assert.strictEqual(result.counts.properties_total, 1, 'F11');
  assert.strictEqual(result.counts.duplicate_collapse_ratio, 0.8, 'F11');
  assert(result.counts.properties_total <= result.counts.rows_total);
  assert.strictEqual(grouping.groupRows([], NOW).counts.properties_total, 0);

  const quarantine = grouping.rowDiagnostics(row('quarantine', KINGS, {
    sale_date_iso: '2026-01-01', lifecycle_status: { status: 'SALE_PASSED', quarantined: true },
    quarantined_at: '2026-02-01T00:00:00.000Z', quarantine_reason_code: 'SALE_DATE_BEFORE_TODAY'
  }), NOW);
  assert.strictEqual(quarantine.quarantine_reason_code, 'SALE_DATE_BEFORE_TODAY', 'F9');
  assert(quarantine.quarantine_reason_text.includes('before'), 'F9');
  assert(quarantine.what_would_clear_it.includes('newer dated official repost'), 'F9');
  assert.strictEqual(quarantine.quarantined_at, '2026-02-01T00:00:00.000Z');
  assert.strictEqual(grouping.rowDiagnostics(row('missing-time', KINGS, { sale_date_iso: '2026-01-01' }), NOW).quarantined_at, null,
    'F9: do not fabricate quarantine timestamp');
  assert.strictEqual(grouping.rowDiagnostics(row('never-set', KINGS, { address_state_history: 'never_set' }), NOW).address_state_reason_code,
    'never_set', 'F10');
  assert.strictEqual(grouping.rowDiagnostics(row('refreshed', KINGS, { address_state_history: 'cleared_by_refresh' }), NOW).address_state_reason_code,
    'cleared_by_refresh', 'F10');
  assert.strictEqual(grouping.rowDiagnostics(row('legacy', KINGS), NOW).address_state_reason_code,
    'prior_state_history_unknown', 'F10: legacy history is unknown');
  assert.strictEqual(grouping.rowDiagnostics(row('legacy', KINGS), NOW).address_state_display, 'not recorded');
  assert.strictEqual(sourceRows[0].address_state, undefined, 'F10: no gate is inferred');
  assert(result.rows.every((item) => item.ready_to_offer === 'NO' && item.preview_only && item.not_a_saved_lead), 'F13');
  return { sourceRows, result };
}

function checkDashboard(rows, groups, counts) {
  const hooks = dashboardHooks();
  const panel = hooks.panelsForPage('findme_scout', {
    ok: true, counts: Object.assign({ total_rows: rows.length }, counts), rows,
    property_groups: groups, daily: {}, auto_run: { enabled: false },
    lead_operations_queue: {
      total_rows: rows.length, counts: { BLOCKED: rows.length },
      segments: [{ key: 'BLOCKED', count: rows.length, row_keys: rows.map((item) => item.queue_key) }]
    }
  }, rows, '');
  assert.strictEqual((panel.match(/class="wos-property-group"/g) || []).length, 1, 'F1: one property card');
  assert.strictEqual((panel.match(/class="wos-property-member"/g) || []).length, 5, 'F2: every source opens');
  for (const key of KEYS) assert(panel.includes(key), `F2: ${key} visible`);
  assert(panel.includes('5 sources'));
  assert(panel.includes('Distinct properties') && panel.includes('Source rows'), 'F11: separate counts');
  assert(panel.includes('internal ID was built from the courthouse address'), 'F3: plain warning');
  assert(panel.includes('Stored address status:') && panel.includes('not recorded'), 'F10');
  assert(!panel.includes('Ready to offer: YES'), 'F13');
}

function checkReadOnlySnapshot(sourceRows) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle47-'));
  const snapshot = path.join(directory, 'deal-board-snapshots.json');
  const evidence = path.join(directory, 'county-appraisal-evidence.json');
  const db = path.join(directory, 'db.json');
  const packet = path.join(directory, 'manual-evidence-packets.json');
  const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
  const store = { version: 1, markets: { 'dallas|dallas|tx': { market, rows: sourceRows, batches: [] } } };
  fs.writeFileSync(snapshot, JSON.stringify(store));
  fs.writeFileSync(evidence, JSON.stringify({ version: 1, records: [] }));
  fs.writeFileSync(db, JSON.stringify({ leads: [] }));
  fs.writeFileSync(packet, JSON.stringify({ version: 1, packets: {} }));
  const originalEnv = {
    DEAL_BOARD_SNAPSHOTS_PATH: process.env.DEAL_BOARD_SNAPSHOTS_PATH,
    MANUAL_EVIDENCE_PACKETS_PATH: process.env.MANUAL_EVIDENCE_PACKETS_PATH,
    DB_PATH: process.env.DB_PATH
  };
  const originals = { fetch: global.fetch, httpGet: http.get, httpRequest: http.request,
    httpsGet: https.get, httpsRequest: https.request, write: fs.writeFileSync };
  try {
    process.env.DEAL_BOARD_SNAPSHOTS_PATH = snapshot;
    process.env.MANUAL_EVIDENCE_PACKETS_PATH = packet;
    process.env.DB_PATH = db;
    const before = [snapshot, evidence, db, packet].map((file) => fs.readFileSync(file).toString('hex'));
    const events = [];
    global.fetch = () => { events.push('fetch'); throw new Error('network_forbidden'); };
    http.get = http.request = https.get = https.request = () => {
      events.push('network'); throw new Error('network_forbidden');
    };
    fs.writeFileSync = () => { events.push('write'); throw new Error('write_forbidden'); };
    const service = require('../modules/research/deal-board-queue-service');
    const result = service.latestDealBoardSnapshot({ market });
    assert.strictEqual(result.counts.rows_total, 5, 'F11: full market count');
    assert.strictEqual(result.counts.properties_total, 1, 'F11: full market distinct properties');
    assert.strictEqual(result.full_snapshot_identity_counts.rows_total, 5);
    assert.strictEqual(result.full_snapshot_identity_counts.properties_total, 1);
    assert.strictEqual(result.rows.length, 5, 'F2: all group members loaded');
    fs.writeFileSync = originals.write;
    assert.deepStrictEqual(events, [], 'F12/F14: no write or network');
    assert.deepStrictEqual([snapshot, evidence, db, packet].map((file) => fs.readFileSync(file).toString('hex')), before,
      'F12: snapshot, county evidence, db, packets unchanged');
  } finally {
    global.fetch = originals.fetch;
    http.get = originals.httpGet; http.request = originals.httpRequest;
    https.get = originals.httpsGet; https.request = originals.httpsRequest;
    fs.writeFileSync = originals.write;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('temp_cleanup_outside_tmpdir');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

const { sourceRows, result } = checkPureGrouping();
checkDashboard(result.rows, result.groups, result.counts);
checkReadOnlySnapshot(sourceRows);
console.log('cycle-47 property identity F1-F14: PASS');
