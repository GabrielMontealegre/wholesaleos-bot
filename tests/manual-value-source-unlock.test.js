'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-manual-value-'));
process.env.DB_PATH = path.join(tempDir, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tempDir, 'deal-board-snapshots.json');
process.env.MANUAL_EVIDENCE_PACKETS_PATH = path.join(tempDir, 'manual-evidence-packets.json');
process.env.MANUAL_EVIDENCE_SCREENSHOTS_DIR = path.join(tempDir, 'screenshots');
fs.mkdirSync(process.env.MANUAL_EVIDENCE_SCREENSHOTS_DIR, { recursive: true });
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }));

const compPolicy = require('../modules/research/market-comp-policy');
const leadState = require('../modules/research/lead-operations-state');
const manualEvidence = require('../modules/research/manual-evidence-packet-service');
const queueService = require('../modules/research/deal-board-queue-service');
const leverage = require('../modules/research/property-leverage-dossier');

const MARKET = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const MARKET_KEY = 'dallas|dallas|tx';
const ROW_KEY = 'ellis-3808-kings-dr';
const subject = {
  queue_key: ROW_KEY,
  normalized_address: '3808 Kings Dr, Ennis, TX 75119',
  city: 'Ennis', county: 'Ellis', state: 'TX',
  property_kind: 'single family', bedrooms: 3, bathrooms: 2,
  living_area: 1600, year_built: 1994, lot_size: 7200,
  latitude: 32.3293, longitude: -96.6253,
  free_contact_routes: [], lifecycle_status: { status: 'FRESH', quarantined: false },
  source_document_url: 'https://ellis.example.gov/notices/3808-kings.pdf',
  source_proof_text: 'Subject property address printed in the official notice.',
  preview_only: true, should_ingest: false, not_a_saved_lead: true
};

function confirmation(overrides) {
  return Object.assign({ confirmed: true, confirmed_by: 'gabriel', confirmed_at: '2026-09-21T12:00:00.000Z' }, overrides || {});
}

function comp(index, confirmationValue, overrides) {
  const fields = Object.assign({
    comp_address: `${3810 + index} Kings Dr, Ennis, TX 75119`,
    sold_status: 'sold', sold_price: `$${210000 + index * 10000}`,
    sold_date: '2026-07-15', source_url: `https://www.zillow.com/homedetails/comp-${index}/`,
    similarity_basis: 'same single-family property type and similar size',
    property_kind: 'single family', land_use: 'single family',
    beds: '3', baths: '2', sqft: '1580', year_built: '1996', lot_size: '7000',
    latitude: String(32.3293 + index * 0.001), longitude: String(-96.6253 + index * 0.001)
  }, overrides || {});
  return {
    evidence_id: `comp-${index}`, evidence_type: 'sold_comp', screenshot_id: `00000000-0000-4000-8000-00000000000${index}`,
    source_name: 'Zillow sold result', captured_at: '2026-09-21T11:00:00.000Z',
    operator_confirmed: confirmationValue && confirmationValue.confirmed === true,
    operator_confirmation: confirmationValue, fields
  };
}

function packet(items) { return { evidence_items: items || [] }; }

function project(items, rowOverride) {
  const row = Object.assign({}, subject, rowOverride || {});
  const summary = manualEvidence.manualCompEvaluation(packet(items), row, { today_iso: '2026-09-21' });
  Object.assign(row, {
    confirmed_strict_comp_count: summary.confirmed_strict_comp_count,
    confirmed_but_grid_rejected_count: summary.confirmed_but_grid_rejected_count,
    unconfirmed_candidate_count: summary.unconfirmed_candidate_count,
    subject_grid_readiness: summary.subject_grid_readiness,
    verified_comps: summary.verified_comps
  });
  return { row, summary, contact: leadState.contactStateForDeal(row), property: leadState.propertyStateForDeal(row) };
}

const baseline = project([]);
assert.strictEqual(baseline.contact.contact_state, 'LOCKED');
assert.strictEqual(baseline.property.property_state, 'NEEDS_COMPS');
assert.strictEqual(compPolicy.compPolicyForMarket({ state: 'TX' }).comp_lane_enabled, false);
assert.strictEqual(compPolicy.compPolicyForMarket({ state: 'TX' }).manual_value_lane_enabled, true);
const prioritized = manualEvidence.deterministicSampleRows([
  Object.assign({}, subject, { queue_key: 'locked-first-alphabetically', property_state: 'LOCKED' }),
  Object.assign({}, subject, { property_state: 'NEEDS_COMPS' })
], MARKET, { limit: 1, today_iso: '2026-09-21' });
assert.strictEqual(prioritized[0].queue_key, ROW_KEY, 'the independent property-work row must be visible in the bounded operator sample');

const one = project([comp(1, confirmation())]);
assert.strictEqual(one.summary.confirmed_strict_comp_count, 1);
assert.strictEqual(one.property.property_state, 'NEEDS_COMPS');
const two = project([comp(1, confirmation()), comp(2, confirmation())]);
assert.strictEqual(two.summary.confirmed_strict_comp_count, 2);
assert.strictEqual(two.property.property_state, 'NEEDS_COMPS');
const three = project([comp(1, confirmation()), comp(2, confirmation()), comp(3, confirmation())]);
assert.strictEqual(three.summary.confirmed_strict_comp_count, 3);
assert.strictEqual(three.property.property_state, 'PROPERTY_READY');
assert.strictEqual(three.contact.contact_state, 'LOCKED');
assert.deepStrictEqual(three.row.free_contact_routes, []);

assert.strictEqual(project([comp(1, confirmation({ confirmed_by: '' }))]).summary.confirmed_strict_comp_count, 0);
assert.strictEqual(project([comp(1, confirmation({ confirmed_at: '' }))]).summary.confirmed_strict_comp_count, 0);
assert.strictEqual(project([comp(1, confirmation({ confirmed: false }))]).summary.confirmed_strict_comp_count, 0);
const unconfirmed = project([comp(1, null), comp(2, null), comp(3, null)]);
assert.strictEqual(unconfirmed.property.property_state, 'NEEDS_COMPS');
assert.strictEqual(unconfirmed.summary.unconfirmed_candidate_count, 3);

const distanceRejected = project([
  comp(1, confirmation()), comp(2, confirmation()),
  comp(3, confirmation(), { latitude: '33.0000', longitude: '-96.6253' })
]);
assert.strictEqual(distanceRejected.property.property_state, 'NEEDS_COMPS');
assert.strictEqual(distanceRejected.summary.confirmed_strict_comp_count, 2);
assert.strictEqual(distanceRejected.summary.confirmed_but_grid_rejected_count, 1);
assert.ok(distanceRejected.summary.grid_rejection_reasons[0]);
assert.ok(distanceRejected.summary.rejected_comps[0].comp_grid.criteria.some((criterion) => criterion.criterion === 'distance' && criterion.status !== 'APPLIED_PASS'));

const missingYear = project([comp(1, confirmation())], { year_built: '' });
assert.ok(missingYear.summary.subject_grid_readiness.missing.includes('year_built'));
assert.strictEqual(missingYear.summary.confirmed_strict_comp_count, 0);
assert.strictEqual(missingYear.summary.confirmed_but_grid_rejected_count, 1);
assert.strictEqual(missingYear.summary.rejected_comps[0].rejected_reason, 'subject_grid_year_built_not_applied');
assert.ok(missingYear.summary.rejected_comps[0].comp_grid.criteria.some((criterion) => criterion.status === 'NOT_APPLIED'));

const dossier = leverage.buildLeverageDossier(three.row);
const equity = leverage.equityEstimate(dossier);
assert.strictEqual(equity.equity_estimate, null);
assert.strictEqual(equity.status, 'UNKNOWN');

const countedRows = ['LIKELY', 'TIGHT', 'NONE', 'UNKNOWN'].map((room, index) => ({ queue_key: `row-${index}`, room_to_offer: room, property_state: ['PROPERTY_READY', 'NEEDS_COMPS', 'NEEDS_VALUE_SOURCE', 'LOCKED'][index], row_state: 'LOCKED' }));
const counts = queueService.queueCounts(countedRows);
assert.strictEqual(counts.room_to_offer_likely + counts.room_to_offer_tight + counts.room_to_offer_none + counts.room_to_offer_unknown, countedRows.length);
assert.strictEqual(Object.values(counts.property_state_counts).reduce((sum, value) => sum + value, 0), countedRows.length);
assert.strictEqual(counts.room_to_offer_unknown, 1);

const legacyFixtures = [
  [{}, 'LOCKED'],
  [Object.assign({}, subject, { free_contact_routes: [{ route_kind: 'phone', value: '2145550100', route_type: 'owner', source_url: 'https://county.example.gov/record', source_kind: 'official_public_record', evidence_text: 'Owner of record phone is published.' }], owner_record: { owner_name: 'JANE OWNER', owner_role: 'owner_of_record' } }), 'CALL_READY'],
  [Object.assign({}, subject, { owner_clue: 'Owner' }), 'NEEDS_CONTACT_SEARCH']
];
legacyFixtures.forEach(([fixture, expected]) => assert.strictEqual(leadState.rowStateForDeal(fixture).row_state, expected));

const uiSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.match(serverSource, /manual-evidence\/comp-confirmation', requireAdmin,/);
const mandatedLabel = 'Original loan amount at origination (NOT the current balance)';
assert.ok(uiSource.includes(mandatedLabel));
const debtRenderer = uiSource.slice(uiSource.indexOf('function debtFactsHtml'), uiSource.indexOf('function leverageDossierHtml'));
assert.ok(!/amount owed|payoff|current debt/i.test(debtRenderer));
assert.strictEqual((debtRenderer.match(/current balance/gi) || []).length, 1, 'current balance may appear only in the required NOT-current-balance warning');

assert.throws(() => manualEvidence.recordCompConfirmation({
  market: MARKET, queue_key: ROW_KEY, evidence_ids: ['comp-1', 'comp-2'], confirmed: true
}, { operator_id: 'gabriel' }), (error) => error.code === 'manual_comp_confirmation_single_only');

const snapshotStore = { version: 1, markets: { [MARKET_KEY]: { market: MARKET, rows: [subject], batches: [] } } };
fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify(snapshotStore, null, 2));
const storedComp = comp(1, null);
const packetStore = { version: 1, markets: { [MARKET_KEY]: { market: MARKET, packets: { [ROW_KEY]: { queue_key: ROW_KEY, market: MARKET, screenshots: [{ screenshot_id: storedComp.screenshot_id, mime: 'image/png' }], evidence_items: [storedComp] } } } } };
fs.writeFileSync(process.env.MANUAL_EVIDENCE_PACKETS_PATH, JSON.stringify(packetStore, null, 2));
assert.throws(() => manualEvidence.recordEvidenceProposal({
  market: MARKET, queue_key: ROW_KEY, evidence_id: storedComp.evidence_id, fields: storedComp.fields, operator_confirmed: true
}, { operator_id: 'gabriel' }), (error) => error.code === 'manual_comp_confirmation_endpoint_required');
const confirmed = manualEvidence.recordCompConfirmation({ market: MARKET, queue_key: ROW_KEY, evidence_id: storedComp.evidence_id, confirmed: true }, { operator_id: 'gabriel', now_impl: () => '2026-09-21T13:00:00.000Z' });
const confirmedItem = confirmed.manual_evidence_item.packet.evidence_items[0];
assert.deepStrictEqual(confirmedItem.operator_confirmation, { confirmed: true, confirmed_by: 'gabriel', confirmed_at: '2026-09-21T13:00:00.000Z' });
const unchanged = manualEvidence.recordCompConfirmation({ market: MARKET, queue_key: ROW_KEY, evidence_id: storedComp.evidence_id, confirmed: true }, { operator_id: 'gabriel', now_impl: () => '2026-09-21T14:00:00.000Z' });
assert.strictEqual(unchanged.manual_evidence_item.packet.evidence_items[0].operator_confirmation.confirmed_at, '2026-09-21T13:00:00.000Z');
const removed = manualEvidence.recordCompConfirmation({ market: MARKET, queue_key: ROW_KEY, evidence_id: storedComp.evidence_id, confirmed: false }, { operator_id: 'gabriel' });
assert.strictEqual(removed.manual_evidence_item.packet.evidence_items[0].operator_confirmation.confirmed, false);
assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads, []);

console.log(JSON.stringify({ baseline: baseline.property.property_state, confirmed_three: three.property.property_state, counts: counts.room_to_offer_counts }));
console.log('manual value source unlock tests passed');
