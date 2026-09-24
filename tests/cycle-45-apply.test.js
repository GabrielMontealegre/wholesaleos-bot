'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const service = require('../modules/research/county-appraisal-evidence-service');
const queue = require('../modules/research/deal-board-queue-service');

const subject = '3808 Kings Dr, Ennis, TX 75119';
const later = '3809 Kings Dr, Ennis, TX 75119';
const now = '2026-09-23T12:00:00.000Z';
function row(key, county, address, extra = {}) {
  return Object.assign({ queue_key: key, county, city: county === 'Ellis' ? 'Ennis' : 'Dallas', state: 'TX',
    normalized_address: address, address_state: 'complete_source_address',
    source_event_date: '2026-10-06', sale_date_iso: '2026-10-06',
    source_url: 'https://www.elliscad.org/property-search', preview_only: true, not_a_saved_lead: true,
    arv_status: 'LOCKED', arv_range: null, ready_to_offer: 'NO', verified_sold_comp_count: 0,
    confirmed_strict_comp_count: 0, lot_size: 4791,
    lifecycle_status: { status: 'FRESH', quarantined: false } }, extra);
}
function source(pid, number) {
  return { pid, pyear: '2027', valueyear: '2026', geoid: `G${pid}`,
    fileasname: 'PUBLIC OWNER', ownerid: `O${pid}`, streetnum: number, streetname: 'KINGS',
    streetseco: 'DR', city: 'ENNIS', state: 'TX', zip: '75119',
    owneraddrd: `${number} Kings Dr`, owneraddrc: 'Ennis', owneraddrs: 'TX', owneraddrz: '75119',
    legaldescr: 'LOT 12 0.1148 AC', statecd: 'A1', legalacre: '0.1148', ownerappra: '246266',
    deeddt: '20230629', instrument: '2319326', imprvactua: '2023' };
}
function csv(records) {
  const fields = Object.keys(records[0]);
  return [fields.join(','), ...records.map((record) => fields.map((field) => record[field]).join(','))].join('\n');
}
function setup(records, rows) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle45-'));
  const snapshot = path.join(directory, 'deal-board-snapshots.json');
  const bulk = path.join(directory, 'ellis.csv');
  const db = path.join(directory, 'db.json');
  fs.writeFileSync(snapshot, JSON.stringify({ version: 1, markets: {
    'dallas|dallas|tx': { rows, batches: [] }
  } }));
  fs.writeFileSync(bulk, csv(records));
  fs.writeFileSync(db, JSON.stringify({ leads: [] }));
  return { directory, snapshot, bulk, db };
}
async function run() {
  const originalPath = process.env.DEAL_BOARD_SNAPSHOTS_PATH;
  const originalFetch = global.fetch;
  const fsWrite = fs.writeFileSync;
  const fsRename = fs.renameSync;
  const fsUnlink = fs.unlinkSync;
  const fixture = setup([source('292247', '3808')], [
    row('ellis', 'Ellis', subject), row('dallas', 'Dallas', '400 Main St, Dallas, TX 75201'),
    row('unknown', '', later), row('elllis-no-match', 'Ellis', later)
  ]);
  const temporaryDirectories = [fixture.directory];
  try {
    process.env.DEAL_BOARD_SNAPSHOTS_PATH = fixture.snapshot;
    const noFile = service.preview({ snapshot_file: fixture.snapshot, now_iso: now });
    assert.strictEqual(noFile.state, 'no county file ingested');
    assert.strictEqual(noFile.total_rows, 4);
    assert.strictEqual(noFile.county_distribution['Ellis County, TX'].rows_total, 2);
    assert.strictEqual(noFile.county_distribution['Dallas County, TX'].rows_total, 1);
    assert.strictEqual(noFile.county_distribution['unknown/unset county'].rows_total, 1);
    assert.strictEqual(noFile.ellis.yield, null);
    const crossMarket = setup([source('292247', '3808')], [row('ellis', 'Ellis', subject)]);
    temporaryDirectories.push(crossMarket.directory);
    const crossStore = JSON.parse(fs.readFileSync(crossMarket.snapshot, 'utf8'));
    crossStore.markets['houston|harris|tx'] = { rows: [row('other', '', later)], batches: [] };
    fs.writeFileSync(crossMarket.snapshot, JSON.stringify(crossStore));
    const crossPreview = service.preview({ snapshot_file: crossMarket.snapshot, now_iso: now });
    assert.strictEqual(crossPreview.total_rows, 2);
    assert.strictEqual(crossPreview.markets['houston|harris|tx'].rows_total, 1);
    assert.strictEqual(Object.values(crossPreview.county_distribution).reduce((sum, part) => sum + part.rows_total, 0), 2);
    const staged = await service.stageFile({ snapshot_file: fixture.snapshot, file_path: fixture.bulk,
      county: 'Ellis', state: 'TX', operator_id: 'operator', now_iso: now });
    assert.strictEqual(staged.indexed_snapshot_records, 1);
    const before = [fixture.snapshot, fixture.db, service.files(fixture.snapshot).stage]
      .map((file) => fs.readFileSync(file).toString('hex'));
    const writes = [];
    fs.writeFileSync = (...args) => { writes.push('write'); return fsWrite(...args); };
    fs.renameSync = (...args) => { writes.push('rename'); return fsRename(...args); };
    fs.unlinkSync = (...args) => { writes.push('unlink'); return fsUnlink(...args); };
    global.fetch = () => { throw new Error('preview_network_forbidden'); };
    const preview = service.preview({ snapshot_file: fixture.snapshot, now_iso: now });
    assert.deepStrictEqual(writes, []);
    assert.deepStrictEqual([fixture.snapshot, fixture.db, service.files(fixture.snapshot).stage]
      .map((file) => fs.readFileSync(file).toString('hex')), before);
    fs.writeFileSync = fsWrite; fs.renameSync = fsRename; fs.unlinkSync = fsUnlink;
    assert.strictEqual(preview.state, 'ready_for_explicit_apply');
    assert.strictEqual(preview.ellis.exact_match, 1);
    assert.strictEqual(preview.ellis.no_match, 1);
    assert.strictEqual(preview.county_distribution['Dallas County, TX'].not_applicable_wrong_county, 1);
    assert.strictEqual(preview.county_distribution['unknown/unset county'].not_applicable_wrong_county, 1);
    assert.strictEqual(preview.ellis.yield.owner_of_record, 1);
    assert.strictEqual(preview.ellis.yield.mailing_address, 1);
    assert.strictEqual(preview.ellis.yield.mail_ready, 1);
    assert.strictEqual(preview.ellis.equity_clue_distribution.UNKNOWN, 1);
    assert.strictEqual(preview.ellis.ranked_candidates.length, 0);
    assert(preview.ellis.conflicts.some((item) => item.field === 'lot_size' && item.prior_value === 4791 &&
      item.official_value === 5001 && item.source_won === 'official_public_record'));
    assert.strictEqual(Object.values(preview.county_distribution).reduce((sum, part) => sum + part.rows_total, 0), 4);
    const filesBeforeBadHash = fs.readdirSync(fixture.directory).sort();
    assert.throws(() => service.apply({ snapshot_file: fixture.snapshot, county: 'Ellis', state: 'TX',
      file_hash: '0'.repeat(64), operator_id: 'operator' }), (caught) => caught.status_code === 409);
    assert.deepStrictEqual(fs.readdirSync(fixture.directory).sort(), filesBeforeBadHash);
    const applied = service.apply({ snapshot_file: fixture.snapshot, county: 'Ellis', state: 'TX',
      file_hash: preview.ingest_provenance.file_hash, operator_id: 'operator', now_iso: now });
    assert.strictEqual(applied.rows_applied, 1);
    const evidencePath = service.files(fixture.snapshot).evidence;
    const firstBytes = fs.readFileSync(evidencePath, 'utf8');
    const second = service.apply({ snapshot_file: fixture.snapshot, county: 'Ellis', state: 'TX',
      file_hash: preview.ingest_provenance.file_hash, operator_id: 'operator', now_iso: '2026-09-24T12:00:00.000Z' });
    assert.strictEqual(second.idempotent, true);
    assert.strictEqual(fs.readFileSync(evidencePath, 'utf8'), firstBytes);
    const evidence = service.readEvidence(fixture.snapshot);
    assert.strictEqual(evidence.write_log.length, 1);
    assert.strictEqual(evidence.write_log[0].who, 'operator');
    assert.strictEqual(evidence.write_log[0].when, now);
    assert.strictEqual(evidence.write_log[0].file_hash, preview.ingest_provenance.file_hash);
    const originalSnapshotBytes = fs.readFileSync(fixture.snapshot, 'utf8');
    const latest = queue.latestDealBoardSnapshot({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' } });
    const enriched = latest.rows.find((item) => item.queue_key === 'ellis');
    assert(enriched);
    assert.strictEqual(enriched.owner_record.owner_name, 'PUBLIC OWNER');
    assert.strictEqual(enriched.contact_state, 'MAIL_READY');
    assert.strictEqual(enriched.property_state, 'NEEDS_PROPERTY_FACTS');
    assert.strictEqual(enriched.lot_size, 5001);
    assert.strictEqual(enriched.appraisal_conflicts.filter((item) => item.field === 'lot_size').length, 1);
    assert.strictEqual(enriched.appraisal_conflicts[0].prior_value, 4791);
    assert.strictEqual(enriched.county_appraisal_field_provenance.owner_of_record.applied_at, now);
    assert.strictEqual(enriched.arv_status, 'LOCKED');
    assert.strictEqual(enriched.arv_range, null);
    assert.strictEqual(enriched.ready_to_offer, 'NO');
    assert.strictEqual(enriched.free_contact_routes, undefined);
    assert.strictEqual(enriched.phone, undefined);
    assert.strictEqual(enriched.verified_sold_comp_count, 0);
    assert.strictEqual(enriched.confirmed_strict_comp_count, 0);
    for (const field of ['amount_owed', 'payoff', 'tax_due', 'lien_amount', 'sold_price']) {
      assert.strictEqual(enriched[field], undefined);
    }
    assert.strictEqual(fs.readFileSync(fixture.snapshot, 'utf8'), originalSnapshotBytes);
    assert.strictEqual(fs.readFileSync(fixture.db, 'utf8'), '{"leads":[]}');
    assert.strictEqual(latest.rows.find((item) => item.queue_key === 'dallas').county_appraisal_record, undefined);
    fs.writeFileSync(fixture.snapshot, JSON.stringify({ version: 1, markets: {
      'dallas|dallas|tx': { rows: [row('ellis', 'Ellis', subject)], batches: [] }
    } }));
    const refreshed = queue.latestDealBoardSnapshot({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' } });
    assert.strictEqual(refreshed.rows[0].owner_record.owner_name, 'PUBLIC OWNER');
    assert.strictEqual(refreshed.rows[0].contact_state, 'MAIL_READY');
    assert.strictEqual(refreshed.rows[0].county_appraisal_record.applied_at, now);
    assert(service.preview({ snapshot_file: fixture.snapshot, now_iso: now }).state.includes('restage required'));
    const competing = row('ellis', 'Ellis', subject, {
      mailing_route: { value: 'PO BOX 9', source_url: 'https://public.example/prior' },
      property_story: { assessed_value: '250000', source_url: 'https://public.example/prior' }
    });
    const compared = service.enrich(competing, evidence.records[0].record, now, now, 'operator');
    assert(compared.appraisal_conflicts.some((item) => item.field === 'mailing_route.value' &&
      item.prior_value === 'PO BOX 9' && item.source_won === 'official_public_record'));
    assert(compared.appraisal_conflicts.some((item) => item.field === 'property_story.assessed_value' &&
      item.prior_value === '250000' && item.official_value === 246266));
    const ranked = setup([source('292247', '3808'), source('292248', '3809'), source('292249', '3810')], [
      row('first', 'Ellis', subject), row('second', 'Ellis', later),
      row('third', 'Ellis', '3810 Kings Dr, Ennis, TX 75119')
    ]);
    temporaryDirectories.push(ranked.directory);
    await service.stageFile({ snapshot_file: ranked.snapshot, file_path: ranked.bulk,
      county: 'Ellis', state: 'TX', operator_id: 'operator', now_iso: now });
    const rankedStage = service.files(ranked.snapshot).stage;
    const rankedData = JSON.parse(fs.readFileSync(rankedStage, 'utf8'));
    for (const record of rankedData.records.slice(0, 2)) {
      record.year_built = 1990;
      record.owner_occupied = false;
      record.deed_history = [{ date: '2010-01-01', grantee: 'PUBLIC OWNER', grantor: 'PREVIOUS OWNER' }];
    }
    fs.writeFileSync(rankedStage, JSON.stringify(rankedData));
    const two = service.preview({ snapshot_file: ranked.snapshot, now_iso: now });
    assert.strictEqual(two.ellis.qualifying_candidate_count, 2);
    assert.strictEqual(two.ellis.ranked_candidates.length, 2);
    assert(two.ellis.ranking_note.includes('2 of 2'));
    const ambiguous = setup([source('292247', '3808'), source('292248', '3808')], [row('ellis', 'Ellis', subject)]);
    temporaryDirectories.push(ambiguous.directory);
    const stagedAmbiguous = await service.stageFile({ snapshot_file: ambiguous.snapshot, file_path: ambiguous.bulk,
      county: 'Ellis', state: 'TX', operator_id: 'operator', now_iso: now });
    assert.strictEqual(stagedAmbiguous.indexed_snapshot_records, 2);
    const ambiguousPreview = service.preview({ snapshot_file: ambiguous.snapshot, now_iso: now });
    assert.strictEqual(ambiguousPreview.ellis.ambiguous_match, 1);
    assert.strictEqual(ambiguousPreview.ellis.exact_match, 0);
    assert.strictEqual(service.apply({ snapshot_file: ambiguous.snapshot, county: 'Ellis', state: 'TX',
      file_hash: ambiguousPreview.ingest_provenance.file_hash, operator_id: 'operator', now_iso: now }).rows_applied, 0);
    const none = setup([source('292247', '3808')], [row('dallas', 'Dallas', subject)]);
    temporaryDirectories.push(none.directory);
    await service.stageFile({ snapshot_file: none.snapshot, file_path: none.bulk,
      county: 'Ellis', state: 'TX', operator_id: 'operator', now_iso: now });
    const nonePreview = service.preview({ snapshot_file: none.snapshot, now_iso: now });
    assert.strictEqual(nonePreview.ellis.rows_total, 0);
    assert.strictEqual(nonePreview.ellis.yield.owner_of_record, 0);
    assert.strictEqual(nonePreview.ellis.ranked_candidates.length, 0);
    assert.strictEqual(nonePreview.county_distribution['Dallas County, TX'].not_applicable_wrong_county, 1);
    assert(nonePreview.ellis.ranking_note.includes('0 of 0'));
    const revisions = setup([source('292247', '3808')], [row('ellis', 'Ellis', subject)]);
    temporaryDirectories.push(revisions.directory);
    await service.stageFile({ snapshot_file: revisions.snapshot, file_path: revisions.bulk,
      county: 'Ellis', state: 'TX', operator_id: 'operator', now_iso: now });
    const firstHash = service.preview({ snapshot_file: revisions.snapshot, now_iso: now }).ingest_provenance.file_hash;
    service.apply({ snapshot_file: revisions.snapshot, county: 'Ellis', state: 'TX',
      file_hash: firstHash, operator_id: 'operator', now_iso: now });
    fs.writeFileSync(revisions.bulk, csv([Object.assign(source('292247', '3808'), { ownerappra: '240000' })]));
    await service.stageFile({ snapshot_file: revisions.snapshot, file_path: revisions.bulk,
      county: 'Ellis', state: 'TX', operator_id: 'operator', now_iso: '2026-09-24T12:00:00.000Z' });
    const secondHash = service.preview({ snapshot_file: revisions.snapshot, now_iso: now }).ingest_provenance.file_hash;
    assert.notStrictEqual(firstHash, secondHash);
    service.apply({ snapshot_file: revisions.snapshot, county: 'Ellis', state: 'TX',
      file_hash: secondHash, operator_id: 'operator', now_iso: '2026-09-24T12:00:00.000Z' });
    const revisionLog = service.readEvidence(revisions.snapshot).write_log;
    assert.strictEqual(revisionLog.length, 2);
    assert.strictEqual(revisionLog[0].file_hash, firstHash);
    assert.strictEqual(revisionLog[1].file_hash, secondHash);
    const expanding = setup([source('292247', '3808'), source('292248', '3809')], [row('first', 'Ellis', subject)]);
    temporaryDirectories.push(expanding.directory);
    await service.stageFile({ snapshot_file: expanding.snapshot, file_path: expanding.bulk,
      county: 'Ellis', state: 'TX', operator_id: 'operator', now_iso: now });
    const expandingHash = service.preview({ snapshot_file: expanding.snapshot, now_iso: now }).ingest_provenance.file_hash;
    service.apply({ snapshot_file: expanding.snapshot, county: 'Ellis', state: 'TX',
      file_hash: expandingHash, operator_id: 'operator', now_iso: now });
    const expansionStore = JSON.parse(fs.readFileSync(expanding.snapshot, 'utf8'));
    expansionStore.markets['dallas|dallas|tx'].rows.push(row('second', 'Ellis', later));
    fs.writeFileSync(expanding.snapshot, JSON.stringify(expansionStore));
    await service.stageFile({ snapshot_file: expanding.snapshot, file_path: expanding.bulk,
      county: 'Ellis', state: 'TX', operator_id: 'operator', now_iso: '2026-09-24T12:00:00.000Z' });
    const added = service.apply({ snapshot_file: expanding.snapshot, county: 'Ellis', state: 'TX',
      file_hash: expandingHash, operator_id: 'operator', now_iso: '2026-09-24T12:00:00.000Z' });
    assert.strictEqual(added.rows_applied, 1);
    const expandedEvidence = service.readEvidence(expanding.snapshot);
    assert.strictEqual(expandedEvidence.records.length, 2);
    assert.strictEqual(expandedEvidence.records.find((item) => item.record.parcel_id === '292247').applied_at, now);
    assert.strictEqual(expandedEvidence.write_log.length, 2);
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'modules/research/county-appraisal-evidence-service.js'), 'utf8');
    assert(!/prod-container\.trueprodigyapi\.com|Authorization\s*:/i.test(moduleSource));
    assert(!/readPortalRecord|fetch\s*\(/.test(moduleSource));
    assert(serverSource.includes("'/api/dashboard/research-queue/county-appraisal-preview', requireAdmin"));
    assert(serverSource.includes("'/api/dashboard/research-queue/county-appraisal-apply', requireAdmin"));
    assert(fs.readFileSync(path.join(__dirname, '..', 'dashboard/wos-public-deals.js'), 'utf8')
      .includes('County appraised value (clue only - not an ARV, not a sold comp, not an amount owed)'));
    process.stdout.write('cycle-45 county appraisal preview/apply: PASS\n');
  } finally {
    fs.writeFileSync = fsWrite; fs.renameSync = fsRename; fs.unlinkSync = fsUnlink;
    global.fetch = originalFetch;
    if (originalPath === undefined) delete process.env.DEAL_BOARD_SNAPSHOTS_PATH;
    else process.env.DEAL_BOARD_SNAPSHOTS_PATH = originalPath;
    for (const directory of temporaryDirectories) fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch((caught) => { process.stderr.write(`${caught.stack}\n`); process.exitCode = 1; });
