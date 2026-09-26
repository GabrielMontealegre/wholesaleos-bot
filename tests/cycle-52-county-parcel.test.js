'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const profile = require('../modules/sources/county-appraisal-profiles').profileForCounty('Ellis', 'TX');
const parcels = require('../modules/sources/county-parcel-service');
const evidence = require('../modules/research/county-parcel-evidence-service');
const appraisal = require('../modules/research/county-appraisal-evidence-service');
const packet = require('../modules/research/manual-evidence-packet-service');
const queue = require('../modules/research/deal-board-queue-service');

const address = '3808 Kings Dr, Ennis, TX 75119';
const now = '2026-09-26T12:00:00.000Z';
const sourceUrl = 'https://maps.co.ellis.tx.us/arcgis/rest/services/External/External_Web_Map/MapServer/1047/query?f=json';
const feature = {
  attributes: {
    pid: 292247, geoid: '25.2976.907.012.00.103', streetnum: '3808', streetpref: null,
    streetname: 'KINGS', streetsuff: 'DR', streetseco: null, city: 'ENNIS', state: 'TX', zip: '75119',
    fileasname: 'WITTE JACOB & ADRIANA', ownerid: 'PUBLIC-ID', owneraddrd: '3808 Kings Dr',
    owneraddru: null, owneraddrc: 'Ennis', owneraddrs: 'TX', owneraddrz: '75119-1789',
    yearbuilt: 2023, legalacre: 0.1148, statecd: 'A1', landstat_1: 'REAL RES SINGLE-FAMILY IMP',
    legaldescr: 'LOT 12 BLK G CHRISTIAN MEADOWS PH 2 0.1148 AC', abstractsu: 'CHRISTIAN MEADOWS PH 2',
    marketarea: 'ENN16', ownerappra: 244317, ownerimpro: 189317, ownerlandv: 55000,
    deeddt: Date.parse('2023-06-29T00:00:00Z'), instrument: '2319326',
    Source: 'https://www.elliscad.com/gis-data', SourceDate: Date.parse('2026-09-01T00:00:00Z')
  },
  geometry: { rings: [[[-96.631, 32.3665], [-96.6308, 32.3665],
    [-96.6308, 32.3667], [-96.631, 32.3667], [-96.631, 32.3665]]] }
};
function row(key, extra = {}) {
  return Object.assign({ queue_key: key, county: 'Ellis', state: 'TX', normalized_address: address,
    address_state: 'complete_source_address', preview_only: true, not_a_saved_lead: true,
    source_event_date: '2026-10-06', sale_date_iso: '2026-10-06',
    source_url: 'https://www.elliscad.org/property-search',
    arv_status: 'LOCKED', ready_to_offer: 'NO', confirmed_strict_comp_count: 0,
    verified_sold_comp_count: 0, lifecycle_status: { status: 'FRESH', quarantined: false } }, extra);
}
function success(features = [feature], exceededTransferLimit = false) {
  return { status: 200, ok: true, json: async () => ({ features, exceededTransferLimit }) };
}
function fixture(rows) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle52-'));
  const snapshot = path.join(directory, 'deal-board-snapshots.json');
  const db = path.join(directory, 'db.json');
  fs.writeFileSync(snapshot, JSON.stringify({ markets: { 'dallas|dallas|tx': { rows, batches: [] } } }));
  fs.writeFileSync(db, '{"leads":[]}');
  return { directory, snapshot, db };
}
async function run() {
  const originalSnapshot = process.env.DEAL_BOARD_SNAPSHOTS_PATH;
  const originalFetch = global.fetch;
  const home = fixture([row('first', { year_built: 2000 }), row('neighbor', {
    normalized_address: '3809 Kings Dr, Ennis, TX 75119' })]);
  try {
    global.fetch = () => { throw new Error('test_network_forbidden'); };
    process.env.DEAL_BOARD_SNAPSHOTS_PATH = home.snapshot;
    const record = parcels.recordFromFeature(feature, profile, sourceUrl);
    assert.strictEqual(record.parcel_id, '292247');
    assert.strictEqual(record.year_built, 2023);
    assert.strictEqual(record.lot_size_acres, 0.1148);
    assert.strictEqual(record.state_code, 'A1');
    assert.strictEqual(record.property_type, 'Single Family Residence');
    assert.strictEqual(record.owner_of_record, 'WITTE JACOB & ADRIANA');
    assert.strictEqual(record.mailing_address, '3808 Kings Dr, Ennis, TX 75119-1789');
    assert.strictEqual(record.source_reference_url, 'https://www.elliscad.com/gis-data');
    assert.strictEqual(record.source_date, '2026-09-01T00:00:00.000Z');
    assert(Math.abs(record.latitude - 32.3666) < 0.00001);
    assert(Math.abs(record.longitude - -96.6309) < 0.00001);
    assert.strictEqual(record.coordinate_source, 'official_county_parcel_polygon_centroid');
    for (const field of ['living_area', 'beds', 'baths']) assert(!Object.hasOwn(record, field));
    const ready = packet.subjectGridReadiness(appraisal.enrich(row('first'), record, now, now, 'operator'));
    assert.deepStrictEqual(ready.missing, ['living_area', 'bedrooms', 'bathrooms']);
    assert.strictEqual(ready.ready, false);
    assert.strictEqual(packet.subjectGridReadiness(Object.assign({}, row('first'), {
      living_area: 1374, bedrooms: 3, bathrooms: 2, year_built: 2023,
      lot_size: 5001, property_kind: 'Single Family Residence', latitude: 32.3666, longitude: -96.6309
    })).ready, true);
    const index = evidence.indexRecords([record], profile);
    assert.strictEqual(evidence.matchRow(row('first'), index).status, 'matched');
    assert.strictEqual(evidence.matchRow(row('different', { normalized_address: '3809 Kings Dr, Ennis, TX 75119' }), index).status, 'no_match');
    assert.strictEqual(evidence.matchRow(row('parcel', { parcel_id: '292247' }), index).status, 'matched');
    assert.strictEqual(evidence.matchRow(row('conflict', { parcel_id: '292247', normalized_address: '3809 Kings Dr, Ennis, TX 75119' }), index).reason, 'parcel_address_conflict');
    assert.strictEqual(evidence.matchRow(row('ambiguous'), evidence.indexRecords([record, {
      ...record, parcel_id: '292248'
    }], profile)).status, 'ambiguous');
    assert.strictEqual(evidence.matchRow(row('wrong', { county: 'Dallas' }), index).status, 'no_match');

    const beforeSnapshot = fs.readFileSync(home.snapshot);
    const beforeDb = fs.readFileSync(home.db);
    const confirmedPacketStore = { markets: { 'dallas|dallas|tx': { packets: { first: { evidence_items: [{
      evidence_type: 'subject_property', fields: { sqft: '1500' },
      field_confirmations: { sqft: { confirmed: true, confirmed_by: 'operator', confirmed_at: now } }
    }] } } } } };
    const options = { packet_store: confirmedPacketStore, fetch_impl: async (url, request) => {
      assert.strictEqual(new URL(url).host, profile.arcgis_parcel_service.host);
      assert.strictEqual(request.headers.Authorization, undefined);
      assert.strictEqual(request.redirect, 'manual');
      assert(url.includes('where='));
      return success();
    }, rate_state: new Map(), blocked_state: new Map() };
    const first = await evidence.sync({ snapshot_file: home.snapshot, county: 'Ellis', state: 'TX',
      operator_id: 'operator', now_iso: now }, options);
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.matched, 1);
    assert.strictEqual(first.no_match, 1);
    assert.strictEqual(first.records_applied, 1);
    assert.strictEqual(first.gained.owner_of_record, 1);
    assert.strictEqual(first.gained.mailing_address, 1);
    assert.strictEqual(first.gained.mail_ready, 1);
    assert.strictEqual(first.gained.lot_size, 1);
    assert.strictEqual(first.gained.property_kind, 1);
    assert.strictEqual(first.gained.coordinates, 1);
    assert.strictEqual(first.after.ready_count, 0);
    assert.deepStrictEqual(first.after.missing, {
      living_area: 1, bedrooms: 2, bathrooms: 2, year_built: 1, lot_size: 1, property_type: 1, coordinates: 1
    });
    assert.strictEqual(fs.readFileSync(home.snapshot).equals(beforeSnapshot), true);
    assert.strictEqual(fs.readFileSync(home.db).equals(beforeDb), true);
    const persisted = fs.readFileSync(evidence.storePath(home.snapshot), 'utf8');
    const again = await evidence.sync({ snapshot_file: home.snapshot, county: 'Ellis', state: 'TX',
      operator_id: 'operator', now_iso: now }, { ...options, rate_state: new Map() });
    assert.strictEqual(again.idempotent, true);
    assert.strictEqual(again.records_applied, 0);
    assert.strictEqual(fs.readFileSync(evidence.storePath(home.snapshot), 'utf8'), persisted);
    assert.strictEqual(evidence.readStore(home.snapshot).write_log.length, 1);
    const latest = queue.latestDealBoardSnapshot({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' } });
    const enriched = latest.rows.find((item) => item.queue_key === 'first');
    assert.strictEqual(enriched.year_built, 2023);
    assert.strictEqual(enriched.contact_state, 'MAIL_READY');
    assert.strictEqual(enriched.property_state, 'NEEDS_COMPS');
    assert.strictEqual(enriched.subject_grid_readiness.ready, false);
    assert.deepStrictEqual(enriched.subject_grid_readiness.missing, ['living_area', 'bedrooms', 'bathrooms']);
    assert.strictEqual(enriched.arv_status, 'LOCKED');
    assert.strictEqual(enriched.ready_to_offer, 'NO');
    assert.strictEqual(enriched.verified_sold_comp_count, 0);
    assert.strictEqual(enriched.confirmed_strict_comp_count, 0);
    assert.strictEqual(enriched.phone, undefined);
    assert.strictEqual(enriched.free_contact_routes, undefined);
    assert.strictEqual(enriched.living_area, undefined);
    assert.strictEqual(enriched.bedrooms, undefined);
    assert.strictEqual(enriched.bathrooms, undefined);
    assert.strictEqual(enriched.appraisal_conflicts.filter((item) => item.field === 'year_built').length, 1);
    assert.strictEqual(enriched.appraisal_conflicts.find((item) => item.field === 'year_built').prior_value, 2000);
    assert.strictEqual(enriched.county_appraisal_field_provenance.latitude.source_date, record.source_date);
    assert.strictEqual(new URL(enriched.county_appraisal_field_provenance.latitude.source_url).host,
      profile.arcgis_parcel_service.host);
    for (const field of ['amount_owed', 'payoff', 'tax_due', 'lien_amount', 'sold_price']) assert.strictEqual(enriched[field], undefined);
    assert.strictEqual(enriched.property_story.assessed_value, '244317');
    assert.strictEqual(enriched.room_to_offer, 'UNKNOWN');

    let clock = 10000;
    const waits = [];
    let pages = 0;
    const paged = await parcels.fetchCandidates([row('first')], profile, {
      now_impl: () => clock, wait_impl: async (ms) => { waits.push(ms); clock += ms; },
      rate_state: new Map(), blocked_state: new Map(), fetch_impl: async () => {
        pages += 1;
        return success(pages === 1 ? [feature] : [], pages === 1);
      }
    });
    assert.strictEqual(paged.request_count, 2);
    assert.deepStrictEqual(waits, [3000]);
    assert.strictEqual(paged.records.length, 1);
    for (const status of [403, 429]) {
      let calls = 0;
      const blockedState = new Map();
      const blocked = await parcels.fetchCandidates([row('first')], profile, {
        rate_state: new Map(), blocked_state: blockedState,
        fetch_impl: async () => { calls += 1; return { status, ok: false }; }
      });
      assert.strictEqual(blocked.status, 'blocked');
      assert.strictEqual(blocked.reason, `http_${status}`);
      assert.strictEqual(calls, 1);
      const repeated = await parcels.fetchCandidates([row('first')], profile, {
        rate_state: new Map(), blocked_state: blockedState,
        fetch_impl: async () => { throw new Error('blocked must not retry'); }
      });
      assert.strictEqual(repeated.request_count, 0);
    }
    const exhausted = await parcels.fetchCandidates([row('first')], profile, {
      now_impl: () => 100000, rate_state: new Map([['TX|Ellis', Array(60).fill(99999)]]),
      blocked_state: new Map(), fetch_impl: async () => { throw new Error('rate limit must stop'); }
    });
    assert.strictEqual(exhausted.status, 'rate_limited');
    const arcgisError = await parcels.fetchCandidates([row('first')], profile, {
      rate_state: new Map(), blocked_state: new Map(), fetch_impl: async () => ({
        status: 200, ok: true, json: async () => ({ error: { code: 400, message: 'Invalid field' } })
      })
    });
    assert.strictEqual(arcgisError.status, 'failed');
    assert.strictEqual(arcgisError.reason, 'arcgis_error_400');

    const source = fs.readFileSync(path.join(__dirname, '../modules/sources/county-parcel-service.js'), 'utf8');
    const evidenceSource = fs.readFileSync(path.join(__dirname, '../modules/research/county-parcel-evidence-service.js'), 'utf8');
    assert(!/prod-container\.trueprodigyapi\.com|Authorization\s*:/i.test(source + evidenceSource));
    assert(!/structure.?footprints|footprint.?area/i.test(source + evidenceSource));
    assert(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8')
      .includes("'/api/dashboard/research-queue/county-parcel-sync', requireAdmin"));
    assert(fs.readFileSync(path.join(__dirname, '../dashboard/wos-public-deals.js'), 'utf8')
      .includes('Living area, bedrooms and bathrooms are not published by Ellis County.'));
    process.stdout.write('cycle-52 county parcel: N1-N12 PASS\n');
  } finally {
    global.fetch = originalFetch;
    if (originalSnapshot === undefined) delete process.env.DEAL_BOARD_SNAPSHOTS_PATH;
    else process.env.DEAL_BOARD_SNAPSHOTS_PATH = originalSnapshot;
    fs.rmSync(home.directory, { recursive: true, force: true });
  }
}
run().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
