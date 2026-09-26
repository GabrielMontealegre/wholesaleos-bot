'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle-50-'));
const snapshotPath = path.join(tempDir, 'deal-board-snapshots.json');
const dbPath = path.join(tempDir, 'db.json');
const packetPath = path.join(tempDir, 'manual-evidence-packets.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = snapshotPath;
process.env.DB_PATH = dbPath;
process.env.MANUAL_EVIDENCE_PACKET_PATH = packetPath;
fs.writeFileSync(dbPath, JSON.stringify({ leads: [] }));
fs.writeFileSync(packetPath, JSON.stringify({ version: 1, packets: {} }));

const { normalizeSourceDate } = require('../modules/research/normalize-source-date');
const addressLinks = require('../modules/research/address-derived-research-links');
const service = require('../modules/research/deal-board-queue-service');
const lifecycle = require('../modules/research/lead-lifecycle-status');
const discovery = require('../modules/research/discovery-layer');
const state = require('../modules/research/lead-operations-state');
const packetService = require('../modules/research/manual-evidence-packet-service');
const grid = require('../modules/research/disclosure-state-comp-resolution');

const subjectAddress = '3808 Kings Dr, Ennis, TX 75119';
const venueAddress = '101 W Main St, Waxahachie, TX 75165';
const verifiedRow = (extra = {}) => Object.assign({
  queue_key: 'cycle50|subject', normalized_address: subjectAddress,
  address_state: 'complete_source_address', source_structured_address_verified: true,
  property_identity_source_only: true, source_document_url: 'https://ellis.example/notices/subject.pdf',
  source_proof_text: `Property address: ${subjectAddress}. Notice date and property details are published here.`,
  source_family: 'tx_foreclosure_notice', city: 'Ennis', county: 'Ellis', state: 'TX',
  preview_only: true, should_ingest: false, not_a_saved_lead: true,
  ready_to_offer: 'NO', arv_status: 'ARV_LOCKED', verified_sold_comp_count: 0
}, extra);

function uiHooks() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
  const context = { window: {}, document: { readyState: 'loading', addEventListener() {} },
    MutationObserver: function () {}, setInterval() {}, setTimeout() {}, fetch() { throw new Error('network_forbidden'); } };
  vm.runInNewContext(source, context);
  return context.window.__wosPublicDealsTestHooks;
}

function gateView(row) {
  const packet = { queue_key: row.queue_key, evidence_items: [], screenshots: [] };
  const evaluation = packetService.evaluatePacket(packet, row);
  return {
    contact_state: state.contactStateForDeal(row),
    property_state: state.propertyStateForDeal(row),
    can_contact: evaluation.readiness.can_contact.status,
    can_value: evaluation.readiness.can_value.status,
    ready_to_offer: row.ready_to_offer,
    arv_status: row.arv_status,
    arv_range: row.arv_range,
    comp_count: row.verified_sold_comp_count
  };
}

function run() {
  const accepted = [
    ['October 6, 2026', 'YYYY-named-long'], ['Oct 6, 2026', 'YYYY-named-short'],
    ['OCTOBER 6, 2026', 'YYYY-case-insensitive'], ['6 October 2026', 'YYYY-day-first'],
    ['October 6 2026', 'YYYY-no-comma'], ['2026-10-06', 'YYYY-ISO']
  ];
  for (const [text] of accepted) assert.strictEqual(normalizeSourceDate(text).iso, '2026-10-06', `K1 ${text}`);
  assert.strictEqual(normalizeSourceDate('06/10/2026').reason, 'ambiguous_numeric_order', 'K2 slash ambiguity');
  assert.strictEqual(normalizeSourceDate('10-06-2026').reason, 'ambiguous_numeric_order', 'K2 dash ambiguity');
  assert.strictEqual(normalizeSourceDate('first Tuesday of October 2026').reason, 'relative_date_requires_inference', 'K3 relative date');
  assert.strictEqual(normalizeSourceDate('October 2026').reason, 'incomplete_date', 'K4 month and year');
  assert.strictEqual(normalizeSourceDate('2026').reason, 'incomplete_date', 'K4 year only');

  const sourceDateRow = verifiedRow({ sale_date_or_event_date: 'October 6, 2026', source_date: 'Oct 1, 2026',
    reposted_source_date: 'September 30, 2026' });
  const verbatimBefore = JSON.stringify({ sale_date_or_event_date: sourceDateRow.sale_date_or_event_date,
    source_date: sourceDateRow.source_date, reposted_source_date: sourceDateRow.reposted_source_date });
  service.deriveSourceDates(sourceDateRow);
  assert.strictEqual(sourceDateRow.sale_date_iso, '2026-10-06', 'K5 sale date derived');
  assert.strictEqual(sourceDateRow.sale_date_source_field, 'sale_date_or_event_date', 'K5 source field recorded');
  assert.strictEqual(sourceDateRow.sale_date_format_matched, 'Month D, YYYY', 'K5 format recorded');
  assert.strictEqual(sourceDateRow.sale_date_parse_status, 'parsed', 'K5 status recorded');
  assert.strictEqual(sourceDateRow.source_date_iso, '2026-10-01', 'A2 source date alias');
  assert.strictEqual(sourceDateRow.reposted_source_date_iso, '2026-09-30', 'A2 repost date alias');
  assert.strictEqual(JSON.stringify({ sale_date_or_event_date: sourceDateRow.sale_date_or_event_date,
    source_date: sourceDateRow.source_date, reposted_source_date: sourceDateRow.reposted_source_date }), verbatimBefore, 'K5 verbatim source values unchanged');

  const future = verifiedRow({ sale_date_or_event_date: 'October 6, 2026' });
  const prior = lifecycle.computeLifecycleStatus(future, '2026-09-25T12:00:00Z');
  const after = service.lifecycleStatusWithNormalizedDates(future, '2026-09-25T12:00:00Z');
  assert.strictEqual(prior.reason_code, 'NO_SOURCE_DATE_EVIDENCE', 'K6 baseline is date-unknown');
  assert.strictEqual(after.status, 'FRESH', 'K6 future verbal date reaches FRESH');
  assert.strictEqual(after.reason_code, 'FUTURE_SALE_DATE', 'K6 existing future-date reason');
  assert.strictEqual(after.quarantined, false, 'K6 no longer quarantined');

  const ambiguous = verifiedRow({ sale_date_or_event_date: '06/10/2026' });
  const ambiguousStatus = service.lifecycleStatusWithNormalizedDates(ambiguous, '2026-09-25T12:00:00Z');
  assert.strictEqual(ambiguousStatus.status, 'DATE_UNKNOWN_REVERIFY', 'K7 ambiguous remains quarantined');
  assert.strictEqual(ambiguousStatus.reason_code, 'NO_SOURCE_DATE_EVIDENCE', 'K7 reason unchanged');
  assert.strictEqual(service.lifecycleStatusWithNormalizedDates(verifiedRow({ sale_date_or_event_date: 'September 1, 2026' }), '2026-09-25T12:00:00Z').status,
    'SALE_PASSED', 'K8 past date keeps existing rule');

  const staleMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}`;
  const linkRow = verifiedRow({ maps_url: staleMap, street_view_url: staleMap });
  const builtLinks = addressLinks.buildAddressResearchLinks(linkRow);
  const map = builtLinks.find((entry) => entry.label === 'Google Maps');
  const street = builtLinks.find((entry) => entry.label === 'Street View');
  assert(map.url.includes(encodeURIComponent(subjectAddress)) && !map.url.includes('101%20W%20Main') && !map.url.includes('Waxahachie'), 'K9 wrong venue map rebuilt from verified subject');
  assert(street.url.includes(encodeURIComponent(subjectAddress)) && !street.url.includes('101%20W%20Main') && !street.url.includes('Waxahachie'), 'K9 Street View rebuilt from verified subject');
  const hooks = uiHooks();
  const html = hooks.rowCard(Object.assign({}, linkRow, { subject_address_verified_for_research: true,
    research_links: builtLinks, discovery: discovery.buildDiscovery(linkRow) }), false);
  assert(html.includes(encodeURIComponent(subjectAddress)) && !html.includes(encodeURIComponent(venueAddress)), 'K9 actual card render path removes venue URL');

  const matchingMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(subjectAddress)}`;
  assert.strictEqual(addressLinks.safeStoredAddressUrl(matchingMap, subjectAddress), matchingMap, 'K10 canonically matching stored URL remains unchanged');
  const unverified = { normalized_address: '', partial_address: '3808 Kings Dr', headline: '3808 Kings Dr',
    maps_url: staleMap, source_document_url: 'https://ellis.example/source.pdf', city: 'Ennis', state: 'TX' };
  const unverifiedLinks = packetService.researchLinks(unverified);
  assert(!unverifiedLinks.some((entry) => /zillow|redfin|realtor|google maps|street view|cyberbackgroundchecks address/i.test(entry.label)), 'K11 no address-derived links without a verified subject address');
  assert(unverifiedLinks.some((entry) => entry.label === 'County source proof'), 'K11 non-address source document link retained');
  const noAddressHtml = hooks.rowCard(Object.assign({}, unverified, { queue_key: 'cycle50|unverified', research_links: unverifiedLinks }), false);
  assert(noAddressHtml.includes('No verified property address yet.') && !noAddressHtml.includes('101%20W%20Main'), 'K11 actual card placeholder and no stale map');

  const zeroEntry = (value) => ({ value, status: 'VERIFIED', provenance: {} });
  const dossierHtml = hooks.leverageDossierHtml({ leverage_dossier: { identity: {
    normalized_address: { value: subjectAddress, status: 'VERIFIED', provenance: {} },
    beds: zeroEntry(0), baths: zeroEntry('0'), sqft: zeroEntry(0), year_built: zeroEntry(NaN), lot_size: zeroEntry('0')
  } } });
  for (const label of ['Beds', 'Baths', 'Square feet', 'Year built', 'Lot size']) {
    assert(new RegExp(`${label}:<\\/b> Unknown`).test(dossierHtml), `K12 ${label} zero/null shows Unknown`);
  }
  assert(!/Beds:<\/b> 0|Baths:<\/b> 0|Square feet:<\/b> 0|Year built:<\/b> 0|Lot size:<\/b> 0/.test(dossierHtml), 'K12 impossible zero never rendered as a property fact');
  const validDossierHtml = hooks.leverageDossierHtml({ leverage_dossier: { identity: {
    normalized_address: { value: subjectAddress, status: 'VERIFIED', provenance: {} },
    beds: zeroEntry(3), baths: zeroEntry(2), sqft: zeroEntry(1374), year_built: zeroEntry(1998), lot_size: zeroEntry(6000)
  } } });
  for (const [label, value] of [['Beds', '3'], ['Baths', '2'], ['Square feet', '1,374'], ['Year built', '1,998'], ['Lot size', '6,000']]) {
    assert(new RegExp(`${label}:<\\/b> ${value}(?:<|\\s)`).test(validDossierHtml), `K12 valid ${label} remains visible`);
  }
  const fieldInput = hooks.manualFieldInput({ evidence_type: 'subject_property', fields: { beds: 0 } }, 'beds');
  assert(fieldInput.includes('placeholder="Unknown"') && !fieldInput.includes('value="0"'), 'K12 zero proposal is hidden in edit field');
  const zeroFactsDiscovery = hooks.discoveryHtml({ gap_ledger: [
    { field: 'beds', label: 'Bedrooms', current_status: 'CLUE', value: 0 },
    { field: 'baths', label: 'Bathrooms', current_status: 'CLUE', value: '0' },
    { field: 'living_area', label: 'Living area', current_status: 'CLUE', value: 0 }
  ] }, 'cycle50|zero-facts');
  assert(zeroFactsDiscovery.includes('Bedrooms:</b> Unknown') && zeroFactsDiscovery.includes('Bathrooms:</b> Unknown') &&
    zeroFactsDiscovery.includes('Living area:</b> Unknown') && !/Bedrooms:<\/b> 0|Bathrooms:<\/b> 0|Living area:<\/b> 0/.test(zeroFactsDiscovery),
    'K12 discovery panel hides zero property measurements');

  const gateFixtures = [
    verifiedRow({ sale_date_or_event_date: 'October 6, 2026' }),
    verifiedRow({ sale_date_or_event_date: '06/10/2026' }),
    verifiedRow({ sale_date_or_event_date: 'September 1, 2026' })
  ].map((row) => Object.assign(row, { free_contact_routes: [], beds: 3, baths: 2, living_area: 1374,
    year_built: 1998, lot_size: 6000, ready_to_offer: 'NO', arv_status: 'ARV_LOCKED', verified_sold_comp_count: 0 }));
  for (const gatesFixture of gateFixtures) {
    const gatesBefore = gateView(gatesFixture);
    service.deriveSourceDates(gatesFixture);
    assert.deepStrictEqual(gateView(gatesFixture), gatesBefore, 'K13/K14 date derivation leaves comp/contact/value/offer gates unchanged');
  }
  const gatesFixture = gateFixtures[0];
  const candidate = { comp_address: '100 Main St, Ennis, TX 75119', sold_price: 200000, sold_date: '2026-05-01',
    property_kind: 'single_family', living_area: 1374, beds: 3, baths: 2, distance_miles: 0.5 };
  const beforeGrid = grid.evaluateStrictCompGrid(candidate, gatesFixture, { today_iso: '2026-09-25' });
  service.deriveSourceDates(gatesFixture);
  const afterGrid = grid.evaluateStrictCompGrid(candidate, gatesFixture, { today_iso: '2026-09-25' });
  assert.deepStrictEqual(afterGrid, beforeGrid, 'K16 strict grid sees the same stored property facts');
  assert.strictEqual(gatesFixture.ready_to_offer, 'NO', 'K14 offer readiness never becomes YES');

  const snapshot = { version: 1, store_kind: 'deal_board_snapshots_not_saved_leads', markets: {
    'ennis|ellis|tx': { market: { city: 'Ennis', county: 'Ellis', state: 'TX' }, rows: [verifiedRow({ sale_date_or_event_date: 'October 6, 2026', maps_url: staleMap })], batches: [] }
  } };
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
  const snapshotBefore = fs.readFileSync(snapshotPath);
  const dbBefore = fs.readFileSync(dbPath);
  const packetBefore = fs.readFileSync(packetPath);
  const readResult = service.latestDealBoardSnapshot({ market: { city: 'Ennis', county: 'Ellis', state: 'TX' } });
  assert.strictEqual(readResult.full_snapshot_date_normalization_summary.newly_parsed_sale_date_count, 1, 'K15 full-snapshot read audit sees newly parsed date');
  assert.strictEqual(readResult.full_snapshot_date_normalization_summary.address_link_audit.rows_with_mismatched_address_links, 1, 'K15 full-snapshot audit catches venue URL');
  assert.deepStrictEqual(fs.readFileSync(snapshotPath), snapshotBefore, 'K15 latest read does not write snapshots');
  assert.deepStrictEqual(fs.readFileSync(dbPath), dbBefore, 'K15 latest read does not write saved-lead database');
  assert.deepStrictEqual(fs.readFileSync(packetPath), packetBefore, 'K15 latest read does not write evidence store');

  assert.strictEqual(readResult.rows[0].sale_date_or_event_date, 'October 6, 2026', 'K5 response preserves raw sale-date value');
  assert.strictEqual(readResult.rows[0].sale_date_iso, '2026-10-06', 'K6 normalized alias is returned by the real service');
  assert.strictEqual(readResult.rows[0].lifecycle_status.status, 'FRESH', 'K6 real response uses unchanged lifecycle rule');
  assert.strictEqual(readResult.rows[0].maps_url, staleMap, 'K15 stored map field is untouched in returned evidence');
  assert.strictEqual(readResult.rows[0].discovery.street_view_url.includes(encodeURIComponent(subjectAddress)), true, 'K9 service-generated Street View uses the subject address');

  console.log('PASS cycle-50-date-normalization-and-links (K1-K16)');
  fs.rmSync(tempDir, { recursive: true, force: true });
}

try {
  run();
} catch (error) {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
