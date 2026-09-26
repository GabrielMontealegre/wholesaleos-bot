'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const service = require('../modules/research/county-appraisal-evidence-service');
const { probeProcessSpawn } = require('./helpers/process-capability');

const NODE_NOW = '2026-09-24T12:00:00.000Z';
const OWNER = 'WITTE JACOB & ADRIANA';
const MAIL = '3808 Kings Dr Ennis TX 75119-1789';
const SOURCE_FIELDS = ['pid', 'pyear', 'valueyear', 'geoid', 'fileasname', 'ownerid', 'streetnum',
  'streetname', 'streetseco', 'city', 'state', 'zip', 'owneraddrd', 'owneraddrc', 'owneraddrs',
  'owneraddrz', 'legaldescr', 'statecd', 'legalacre', 'ownerappra', 'deeddt', 'instrument', 'imprvactua'];
function row(key, address, extra = {}) {
  return Object.assign({ queue_key: key, county: 'Ellis', state: 'TX', normalized_address: address,
    address_state: 'complete_source_address', preview_only: true, not_a_saved_lead: true,
    source_url: 'https://www.elliscad.org/property-search', lifecycle_status: { status: 'FRESH', quarantined: false },
    ready_to_offer: 'NO', lot_size: 4791 }, extra);
}
function source(pid, number, extra = {}) {
  return Object.assign({ pid, pyear: '2027', valueyear: '2026', geoid: '25.2976.907.012.00.103',
    fileasname: OWNER, ownerid: 'OWNER-ID', streetnum: number, streetname: 'KINGS', streetseco: 'DR',
    city: 'ENNIS', state: 'TX', zip: '75119', owneraddrd: '3808 Kings Dr', owneraddrc: 'Ennis',
    owneraddrs: 'TX', owneraddrz: '75119-1789',
    legaldescr: 'LOT 12 BLK G CHRISTIAN MEADOWS PH 2 0.1148 AC', statecd: 'A1',
    legalacre: '0.1148', ownerappra: '246266', deeddt: '20230629', instrument: '2319326',
    imprvactua: '2023' }, extra);
}
function csv(records) {
  return [SOURCE_FIELDS.join(','), ...records.map((record) => SOURCE_FIELDS.map((field) =>
    String(record[field] == null ? '' : record[field]).replace(/[\r\n,]/g, ' ')).join(','))].join('\n');
}
async function fixture(rows, records) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle46-'));
  const snapshot = path.join(directory, 'deal-board-snapshots.json');
  const bulk = path.join(directory, 'ellis.csv');
  const db = path.join(directory, 'db.json');
  fs.writeFileSync(snapshot, JSON.stringify({ version: 1, markets: { 'dallas|dallas|tx': { rows, batches: [] } } }));
  fs.writeFileSync(bulk, csv(records));
  fs.writeFileSync(db, '{"leads":[]}');
  await service.stageFile({ snapshot_file: snapshot, file_path: bulk, county: 'Ellis', state: 'TX',
    operator_id: 'fixture-operator' });
  return { directory, snapshot, db, stage: service.files(snapshot).stage, evidence: service.files(snapshot).evidence };
}
function audit(f, queueKey) {
  return service.audit({ snapshot_file: f.snapshot, county: 'Ellis', state: 'TX',
    queue_key: queueKey, now_iso: NODE_NOW });
}
function validateParcel(detail) {
  assert.strictEqual(detail.county_side.parcel_id, '292247');
  assert.strictEqual(detail.county_side.geo_id, '25.2976.907.012.00.103');
  assert.strictEqual(detail.county_side.legal_description, 'LOT 12 BLK G CHRISTIAN MEADOWS PH 2 0.1148 AC');
}
async function checkUnauthenticatedRoute(f) {
  const port = 39000 + (process.pid % 10000);
  const base = `http://127.0.0.1:${port}`;
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true,
    env: Object.assign({}, process.env, { PORT: String(port), DB_PATH: f.db,
      DEAL_BOARD_SNAPSHOTS_PATH: f.snapshot, WOS_ENABLE_BACKGROUND_INGESTION: 'false',
      WOS_ADMIN_PIN: 'fixture-only-pin', WOS_SESSION_SECRET: crypto.randomBytes(48).toString('base64url') }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += String(chunk); });
  child.stderr.on('data', (chunk) => { output += String(chunk); });
  try {
    const until = Date.now() + 45000;
    while (Date.now() < until) {
      if (child.exitCode != null) throw new Error(`fixture server exited ${child.exitCode}: ${output.slice(-500)}`);
      try { if ((await fetch(`${base}/health`)).ok) break; } catch (_) {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (const suffix of ['', '&queue_key=kings']) {
      const response = await fetch(`${base}/api/dashboard/research-queue/county-appraisal-audit?county=Ellis&state=TX${suffix}`);
      assert([401, 403].includes(response.status));
      const body = await response.text();
      assert(!body.includes(OWNER));
      assert(!body.includes(MAIL));
      assert(!body.includes('292247'));
    }
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
async function run() {
  if (!(await probeProcessSpawn()).available) {
    console.log('SKIPPED: process spawn not permitted in this runner');
    return;
  }
  const fixtures = [];
  const original = { fetch: global.fetch, write: fs.writeFileSync, rename: fs.renameSync,
    unlink: fs.unlinkSync, mkdir: fs.mkdirSync, httpGet: http.get, httpRequest: http.request,
    httpsGet: https.get, httpsRequest: https.request, log: console.log };
  try {
    const rows = [
      row('kings', '3808 Kings Dr, Ennis, TX 75119'),
      row('suffix', '3808 Kings Ct, Ennis, TX 75119'),
      row('number', '3809 Kings Dr, Ennis, TX 75119'),
      row('unit', '3808 Kings Dr Apt 2, Ennis, TX 75119'),
      row('incomplete', 'Kings Dr, Ennis, TX 75119', { address_state: 'needs_zip_review' }),
      row('outside', '400 Main St, Dallas, TX 75201', { county: 'Dallas' }),
      row('already-mail', '3808 Kings Dr, Ennis, TX 75119', { mailing_route: {
        value: 'PO BOX 8, DALLAS, TX 75201', source_kind: 'official_public_record',
        source_url: 'https://public.example/owner', evidence_text: 'Official mailing route.' } })
    ];
    const f = await fixture(rows, [source('292247', '3808')]);
    fixtures.push(f);
    const bytes = [f.snapshot, f.db, f.stage].map((file) => fs.readFileSync(file).toString('hex'));
    const events = [];
    fs.writeFileSync = () => { events.push('write'); throw new Error('audit_write_forbidden'); };
    fs.renameSync = () => { events.push('rename'); throw new Error('audit_rename_forbidden'); };
    fs.unlinkSync = () => { events.push('unlink'); throw new Error('audit_unlink_forbidden'); };
    fs.mkdirSync = () => { events.push('mkdir'); throw new Error('audit_mkdir_forbidden'); };
    global.fetch = () => { events.push('fetch'); throw new Error('audit_network_forbidden'); };
    http.get = http.request = https.get = https.request = () => {
      events.push('network'); throw new Error('audit_network_forbidden');
    };
    console.log = (...values) => { events.push(`log:${values.join(' ')}`); };
    const index = audit(f);
    const detail = audit(f, 'kings').detail;
    const outside = audit(f, 'outside').detail;
    fs.writeFileSync = original.write; fs.renameSync = original.rename;
    fs.unlinkSync = original.unlink; fs.mkdirSync = original.mkdir; global.fetch = original.fetch;
    http.get = original.httpGet; http.request = original.httpRequest;
    https.get = original.httpsGet; https.request = original.httpsRequest; console.log = original.log;
    assert.deepStrictEqual(events, []);
    assert.deepStrictEqual([f.snapshot, f.db, f.stage].map((file) => fs.readFileSync(file).toString('hex')), bytes);
    assert.strictEqual(fs.existsSync(f.evidence), false);
    assert.strictEqual(index.row_count, 6);
    assert.strictEqual(index.identity_counts.rows_total, 6);
    assert.strictEqual(index.identity_counts.properties_total, 5);
    assert(!JSON.stringify(index.rows).includes('property_identity_key'),
      'audit index must not expose the derived address identity; detail may');
    const serialized = JSON.stringify(index).toUpperCase();
    assert(!serialized.includes(OWNER));
    assert(!serialized.includes('WITTE'));
    assert(!serialized.includes(MAIL.toUpperCase()));
    assert(!serialized.includes('3808 KINGS DR'));
    assert(JSON.stringify(detail).includes(OWNER));
    assert(JSON.stringify(detail).includes('3808 Kings Dr'));
    assert(!JSON.stringify(detail.near_misses).includes(OWNER));
    assert(!JSON.stringify(detail.near_misses).includes(MAIL));
    assert.strictEqual(detail.match_verdict, 'EXACT');
    assert.strictEqual(detail.match_reason_code, 'exact_canonical_match');
    assert(detail.comparison.every((part) => part.result === 'MATCH'));
    validateParcel(detail);
    assert.throws(() => validateParcel({ county_side: { parcel_id: 'wrong' } }));
    assert.strictEqual(detail.raw_field_echo.latest_deed_date.raw, '20230629');
    assert.strictEqual(detail.raw_field_echo.latest_deed_date.parsed, '2023-06-29');
    assert.strictEqual(detail.equity_clue, 'UNKNOWN');
    assert.strictEqual(detail.equity_clue_reason_code, 'insufficient_history');
    assert.strictEqual(detail.conflict_count, 1);
    assert.strictEqual(detail.conflicts.filter((item) => item.field === 'lot_size').length, 1);
    assert.strictEqual(detail.conflicts[0].prior_value, 4791);
    assert.strictEqual(detail.would_apply_preview.not_applied, true);
    assert(detail.would_apply_preview.fields.some((item) => item.field === 'lot_size' && item.would_be === 5001));
    assert.strictEqual(index.rows.find((r) => r.queue_key === 'suffix').match_reason_code, 'suffix_mismatch');
    assert.strictEqual(audit(f, 'suffix').detail.near_misses[0].differing_component, 'suffix_mismatch');
    assert.strictEqual(index.rows.find((r) => r.queue_key === 'number').match_reason_code, 'street_number_mismatch');
    assert.strictEqual(index.rows.find((r) => r.queue_key === 'unit').match_reason_code, 'unit_present_one_side');
    assert.strictEqual(index.rows.find((r) => r.queue_key === 'incomplete').match_reason_code, 'row_address_incomplete');
    assert.strictEqual(outside.match_verdict, 'NOT_APPLICABLE_WRONG_COUNTY');
    assert.strictEqual(outside.county_side, null);
    assert.strictEqual(index.rows.find((r) => r.queue_key === 'already-mail').mail_ready_block_reason_code,
      'already_has_mailing_route');
    const sourceText = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const route = sourceText.match(/app\.get\('\/api\/dashboard\/research-queue\/county-appraisal-audit'[\s\S]*?\n\}\);/);
    assert(route && route[0].includes('requireAdmin'));
    assert(!route[0].includes('Authorization'));
    assert(!route[0].includes('prod-container.trueprodigyapi.com'));
    assert(!route[0].includes('fetch('));
    const b = await fixture([row('blank', '3808 Kings Dr, Ennis, TX 75119')],
      [source('292247', '3808', { deeddt: '' })]);
    fixtures.push(b);
    assert.strictEqual(audit(b, 'blank').detail.equity_clue_reason_code, 'deed_date_present_but_field_empty');
    assert.strictEqual(audit(b, 'blank').detail.raw_field_echo.latest_deed_date.parse_status, 'empty');
    const u = await fixture([row('bad-date', '3808 Kings Dr, Ennis, TX 75119')],
      [source('292247', '3808', { deeddt: 'NOT-A-DATE' })]);
    fixtures.push(u);
    assert.strictEqual(audit(u, 'bad-date').detail.equity_clue_reason_code, 'deed_date_unparsable');
    assert.strictEqual(audit(u, 'bad-date').detail.raw_field_echo.latest_deed_date.parse_status, 'unparsable');
    const wrong = await fixture([row('wrong-parcel', '3808 Kings Dr, Ennis, TX 75119', { parcel_id: '292247' })],
      [source('292999', '3808')]);
    fixtures.push(wrong);
    assert.strictEqual(audit(wrong, 'wrong-parcel').detail.match_verdict, 'NO_MATCH');
    assert.strictEqual(audit(wrong, 'wrong-parcel').detail.match_reason_code, 'parcel_or_geo_conflict');
    const missingProvenance = await fixture([row('missing-route', '3808 Kings Dr, Ennis, TX 75119')],
      [source('292247', '3808')]);
    fixtures.push(missingProvenance);
    const stageData = JSON.parse(fs.readFileSync(missingProvenance.stage, 'utf8'));
    stageData.records[0].source_url = '';
    stageData.records[0].bulk_source_url = '';
    fs.writeFileSync(missingProvenance.stage, JSON.stringify(stageData));
    assert.strictEqual(audit(missingProvenance, 'missing-route').detail.mail_ready_block_reason_code,
      'mailing_address_missing_provenance');
    await checkUnauthenticatedRoute(f);
    console.log('cycle-46 county match audit E1-E17: PASS');
  } finally {
    global.fetch = original.fetch; fs.writeFileSync = original.write; fs.renameSync = original.rename;
    fs.unlinkSync = original.unlink; fs.mkdirSync = original.mkdir;
    http.get = original.httpGet; http.request = original.httpRequest;
    https.get = original.httpsGet; https.request = original.httpsRequest; console.log = original.log;
    for (const f of fixtures) fs.rmSync(f.directory, { recursive: true, force: true });
  }
}
run().catch((caught) => {
  if (require('./helpers/process-capability').processSpawnDenied(caught)) {
    console.log('SKIPPED: process spawn not permitted in this runner');
    return;
  }
  console.error(caught);
  process.exitCode = 1;
});
