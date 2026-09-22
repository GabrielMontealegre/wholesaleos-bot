'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle37-dossier-'));
process.env.DB_PATH = path.join(tmp, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmp, 'snapshots.json');
process.env.MANUAL_EVIDENCE_PACKETS_PATH = path.join(tmp, 'packets.json');
process.env.MANUAL_EVIDENCE_SCREENSHOTS_DIR = path.join(tmp, 'screenshots');
fs.mkdirSync(process.env.MANUAL_EVIDENCE_SCREENSHOTS_DIR, { recursive: true });
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }));

const manual = require('../modules/research/manual-evidence-packet-service');
const leadState = require('../modules/research/lead-operations-state');
const leverage = require('../modules/research/property-leverage-dossier');

const ROOT = path.resolve(__dirname, '..');
const MARKET = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const MARKET_KEY = 'dallas|dallas|tx';
const QUEUE_KEY = 'ellis-3808-kings-dr';
const TODAY = '2026-09-22';
const SOURCE_URL = 'https://www.co.ellis.tx.us/notices/2026-10-06-foreclosure.pdf';
const subject = {
  queue_key: QUEUE_KEY,
  normalized_address: '3808 Kings Dr, Ennis, TX 75119',
  address_state: 'complete_source_address',
  source_structured_address_verified: true,
  city: 'Ennis', county: 'Ellis', state: 'TX', zip: '75119',
  bedrooms: 3, bathrooms: 2, living_area: 1600,
  latitude: 32.3293, longitude: -96.6253,
  source_name: 'Ellis County Foreclosure Notices',
  source_document_url: SOURCE_URL,
  source_url: SOURCE_URL,
  source_event_date: '2026-10-06',
  sale_date_or_event_date: '2026-10-06',
  status_evidence_text: 'Property is listed in the Ellis County foreclosure notice for the October 6, 2026 sale.',
  source_proof_text: 'Property: 3808 Kings Dr, Ennis, TX 75119. Sale date: October 6, 2026.',
  free_contact_routes: [],
  lifecycle_status: { status: 'FRESH', quarantined: false },
  preview_only: true, should_ingest: false, not_a_saved_lead: true
};

function confirmedByGabriel() {
  return { confirmed: true, confirmed_by: 'gabriel', confirmed_at: '2026-09-22T12:00:00.000Z' };
}

function subjectItem(confirmFields) {
  const confirmations = {};
  for (const name of confirmFields || []) confirmations[name] = confirmedByGabriel();
  return {
    evidence_id: 'subject-facts-1', evidence_type: 'subject_property',
    screenshot_id: '10000000-0000-4000-8000-000000000001',
    source_name: 'Zillow property detail', captured_at: '2026-09-22T11:00:00.000Z',
    fields: {
      property_kind: 'single family', year_built: '1994', lot_size: '7200',
      source_url: 'https://www.zillow.com/homedetails/3808-Kings-Dr-Ennis-TX-75119/'
    },
    field_confirmations: confirmations,
    operator_confirmed: false
  };
}

function comp(index, overrides) {
  return {
    evidence_id: `comp-${index}`, evidence_type: 'sold_comp',
    screenshot_id: `20000000-0000-4000-8000-00000000000${index}`,
    source_name: index % 2 ? 'Zillow sold result' : 'Redfin sold result',
    captured_at: '2026-09-22T11:30:00.000Z', operator_confirmed: true,
    operator_confirmation: confirmedByGabriel(),
    fields: Object.assign({
      comp_address: `${3810 + index * 2} Kings Dr, Ennis, TX 75119`, sold_status: 'sold',
      sold_price: String(210000 + index * 10000), sold_date: '2026-07-15',
      source_url: `https://www.zillow.com/homedetails/ellis-comp-${index}/`,
      similarity_basis: 'same single-family property type, similar living area, beds, baths, age and lot',
      property_kind: 'single family', land_use: 'single family', beds: '3', baths: '2', sqft: '1580',
      year_built: '1996', lot_size: '7000',
      latitude: String(32.3293 + index * 0.001), longitude: String(-96.6253 + index * 0.001)
    }, overrides || {})
  };
}

function packet(items) { return { evidence_items: items || [] }; }
function evaluate(items, row) { return manual.evaluatePacket(packet(items), Object.assign({}, subject, row || {}), { today_iso: TODAY }); }
function named(name, fn) { fn(); return name; }

const passed = [];
try {
  passed.push(named('01 baseline is property NEEDS_COMPS', () => {
    const value = evaluate([]);
    assert.strictEqual(value.projected_property_state, 'NEEDS_COMPS');
    assert.strictEqual(value.projected_contact_state, 'LOCKED');
  }));
  passed.push(named('02 unconfirmed subject fields stay excluded', () => {
    const value = evaluate([subjectItem([])]);
    assert.deepStrictEqual(value.subject_grid_readiness.missing.sort(), ['lot_size', 'property_type', 'year_built']);
  }));
  passed.push(named('03 one field confirmation applies only that field', () => {
    const value = evaluate([subjectItem(['property_kind'])]);
    assert.ok(!value.subject_grid_readiness.missing.includes('property_type'));
    assert.ok(value.subject_grid_readiness.missing.includes('year_built'));
  }));
  passed.push(named('04 a second missing fact remains blocking', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built'])]);
    assert.deepStrictEqual(value.subject_grid_readiness.missing, ['lot_size']);
    assert.strictEqual(value.readiness.can_value.status, 'NO');
  }));
  passed.push(named('05 all explicitly confirmed subject facts make the grid ready', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size'])]);
    assert.strictEqual(value.subject_grid_readiness.ready, true);
  }));
  passed.push(named('06 three unconfirmed comps count as zero', () => {
    const values = [1, 2, 3].map((index) => Object.assign(comp(index), { operator_confirmed: false, operator_confirmation: null }));
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size'])].concat(values));
    assert.strictEqual(value.verified_sold_comp_count, 0);
    assert.strictEqual(value.readiness.can_value.status, 'NO');
  }));
  passed.push(named('07 one confirmed comp keeps NEEDS_COMPS', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size']), comp(1)]);
    assert.strictEqual(value.verified_sold_comp_count, 1);
    assert.strictEqual(value.projected_property_state, 'NEEDS_COMPS');
  }));
  passed.push(named('08 two confirmed comps keep NEEDS_COMPS', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size']), comp(1), comp(2)]);
    assert.strictEqual(value.verified_sold_comp_count, 2);
    assert.strictEqual(value.projected_property_state, 'NEEDS_COMPS');
  }));
  passed.push(named('09 three qualifying comps make PROPERTY_READY', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size']), comp(1), comp(2), comp(3)]);
    assert.strictEqual(value.verified_sold_comp_count, 3);
    assert.strictEqual(value.projected_property_state, 'PROPERTY_READY');
    assert.strictEqual(value.readiness.can_value.status, 'YES');
    assert.deepStrictEqual(value.verified_screenshot_comps.map((item) => item.comp_address), ['3812 Kings Dr, Ennis, TX 75119', '3814 Kings Dr, Ennis, TX 75119', '3816 Kings Dr, Ennis, TX 75119']);
  }));
  passed.push(named('10 value readiness never unlocks contact', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size']), comp(1), comp(2), comp(3)]);
    assert.strictEqual(value.projected_contact_state, 'LOCKED');
    assert.strictEqual(value.contact_routes_accepted.length, 0);
    assert.strictEqual(value.readiness.can_contact.status, 'NO');
  }));
  passed.push(named('11 distance over one mile is rejected', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size']), comp(1, { latitude: '33.0000' })]);
    assert.strictEqual(value.confirmed_but_grid_rejected_count, 1);
    assert.ok(value.rejected_screenshot_comps[0].comp_grid.criteria.some((criterion) => criterion.criterion === 'distance' && criterion.status !== 'APPLIED_PASS'));
  }));
  passed.push(named('12 wrong property type is rejected', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size']), comp(1, { property_kind: 'condo', land_use: 'condo' })]);
    assert.strictEqual(value.confirmed_but_grid_rejected_count, 1);
    assert.ok(value.grid_rejection_reasons.some((reason) => /property_type/i.test(reason)));
  }));
  passed.push(named('13 stale sale is rejected', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size']), comp(1, { sold_date: '2024-01-15' })]);
    assert.strictEqual(value.confirmed_but_grid_rejected_count, 1);
    assert.ok(value.grid_rejection_reasons.some((reason) => /sale_outside_comp_window|stale/i.test(reason)));
  }));
  passed.push(named('14 missing comp similarity cannot silently pass', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size']), comp(1, { similarity_basis: '', property_kind: '', land_use: '', sqft: '', beds: '', baths: '' })]);
    assert.strictEqual(value.confirmed_strict_comp_count, 0);
    assert.strictEqual(value.confirmed_but_grid_rejected_count, 1);
  }));
  passed.push(named('15 quarantined duplicate is excluded from targeting', () => {
    const quarantined = Object.assign({}, subject, { queue_key: '3808-duplicate', lifecycle_status: { status: 'SUPERSEDED_DUPLICATE', quarantined: true } });
    const rows = manual.deterministicSampleRows([quarantined, subject], MARKET, { limit: 5, today_iso: TODAY });
    assert.deepStrictEqual(rows.map((row) => row.queue_key), [QUEUE_KEY]);
  }));
  passed.push(named('16 distress date and source remain verbatim', () => {
    assert.strictEqual(subject.sale_date_or_event_date, '2026-10-06');
    assert.strictEqual(subject.source_name, 'Ellis County Foreclosure Notices');
    assert.strictEqual(subject.source_document_url, SOURCE_URL);
  }));
  passed.push(named('17 money labels are distinct and honest', () => {
    const ui = fs.readFileSync(path.join(ROOT, 'dashboard', 'wos-public-deals.js'), 'utf8');
    ['Original loan amount at origination (NOT the current payoff)', 'Judgment amount', 'Published minimum bid', 'Property tax due', 'Recorded lien amount', 'Unlabelled amount from source — type unknown'].forEach((label) => assert.ok(ui.includes(label), label));
    const debtBlock = ui.slice(ui.indexOf('function debtFactsHtml'), ui.indexOf('function leverageDossierHtml'));
    assert.ok(!/amount owed|current debt/i.test(debtBlock));
  }));
  passed.push(named('18 room to offer stays UNKNOWN without typed debt', () => {
    const evaluation = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size']), comp(1), comp(2), comp(3)]);
    const row = Object.assign({}, subject, { verified_comps: evaluation.verified_screenshot_comps, arv_range: evaluation.arv_range });
    const equity = leverage.equityEstimate(leverage.buildLeverageDossier(row));
    assert.strictEqual(equity.equity_estimate, null);
    assert.strictEqual(equity.room_to_offer, 'UNKNOWN');
  }));
  passed.push(named('19 all operator research links remain clickable', () => {
    const urls = manual.researchLinks(subject).map((item) => item.url).join('\n');
    assert.match(urls, /zillow\.com/); assert.match(urls, /redfin\.com/); assert.match(urls, /realtor\.com/);
    assert.match(urls, /google\.com\/maps/); assert.match(urls, /cyberbackgroundchecks\.com/);
  }));
  passed.push(named('20 ready_to_offer never becomes YES and safety flags survive', () => {
    const value = evaluate([subjectItem(['property_kind', 'year_built', 'lot_size']), comp(1), comp(2), comp(3)]);
    assert.notStrictEqual(value.readiness.ready_to_offer.status, 'YES');
    assert.strictEqual(subject.preview_only, true);
    assert.strictEqual(subject.not_a_saved_lead, true);
    assert.strictEqual(leadState.contactStateForDeal(subject).contact_state, 'LOCKED');
  }));

  // Exercise the real field-level persistence endpoint without touching saved leads.
  fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify({ version: 1, markets: { [MARKET_KEY]: { market: MARKET, rows: [subject], batches: [] } } }, null, 2));
  const proposed = subjectItem([]);
  fs.writeFileSync(process.env.MANUAL_EVIDENCE_PACKETS_PATH, JSON.stringify({ version: 1, markets: { [MARKET_KEY]: { market: MARKET, packets: { [QUEUE_KEY]: { queue_key: QUEUE_KEY, market: MARKET, screenshots: [{ screenshot_id: proposed.screenshot_id, mime: 'image/png' }], evidence_items: [proposed] } } } } }, null, 2));
  for (const fieldName of ['property_kind', 'year_built', 'lot_size']) {
    manual.recordSubjectFactConfirmation({ market: MARKET, queue_key: QUEUE_KEY, evidence_id: proposed.evidence_id, field_name: fieldName, confirmed: true }, { operator_id: 'gabriel', now_impl: () => '2026-09-22T12:00:00.000Z' });
  }
  const stored = manual.readPacketStore().markets[MARKET_KEY].packets[QUEUE_KEY].evidence_items[0];
  assert.deepStrictEqual(Object.keys(stored.field_confirmations).sort(), ['lot_size', 'property_kind', 'year_built']);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')), { leads: [] });

  console.log(JSON.stringify({ fixture_count: passed.length, fixtures: passed, final_property_state: 'PROPERTY_READY', final_contact_state: 'LOCKED' }));
  console.log('cycle-37-single-property-dossier: 20/20 ok');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
