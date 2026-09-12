'use strict';

const fs = require('fs');
const path = require('path');

const contactRouteRoles = require('../modules/research/contact-route-roles');
const enrichmentScheduler = require('../modules/research/enrichment-scheduler');
const fieldProvenance = require('../modules/research/field-provenance');
const leadLifecycleStatus = require('../modules/research/lead-lifecycle-status');
const leadOperationsState = require('../modules/research/lead-operations-state');
const propertyIdentity = require('../modules/research/property-identity');

const MARKETS = Object.freeze([
  { city: 'San Diego', county: 'San Diego', state: 'CA' },
  { city: 'Detroit', county: 'Wayne', state: 'MI' },
  { city: 'San Antonio', county: 'Bexar', state: 'TX' },
  { city: 'Dallas', county: 'Dallas', state: 'TX' }
]);

const LIFECYCLE_STATUSES = Object.freeze([
  'FRESH', 'AGING', 'SALE_PASSED', 'REPOSTED_OR_REPLACED',
  'SOURCE_NO_LONGER_LISTED', 'DATE_UNKNOWN_REVERIFY', 'UNVERIFIABLE'
]);

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function marketKey(market) {
  return [market.city, market.county, market.state].map((value) => cleanText(value).toLowerCase()).join('|');
}

function routeInvalidated(row, route) {
  const flags = Array.isArray(route && route.risk_flags) ? route.risk_flags.map(cleanText) : [];
  const invalidated = Array.isArray(row && row.contact_workflow_invalidated_routes)
    ? row.contact_workflow_invalidated_routes
    : [];
  const value = cleanText(route && route.value);
  return Boolean(route && route.operator_disproved === true) ||
    flags.includes('OPERATOR_WRONG_NUMBER_REPORTED') ||
    Boolean(value && invalidated.some((item) => cleanText(item && item.value) === value));
}

function phoneRoutes(row) {
  return (Array.isArray(row && row.free_contact_routes) ? row.free_contact_routes : []).filter((route) =>
    route && cleanText(route.route_kind) === 'phone' && cleanText(route.value) && !routeInvalidated(row, route)
  );
}

function sellerPhones(row) {
  return phoneRoutes(row).filter((route) =>
    fieldProvenance.routeHasProvenance(route) &&
    contactRouteRoles.sellerContactEligibility(route).status === contactRouteRoles.SELLER_CONTACT_ELIGIBLE
  );
}

function researchOnlyPhones(row) {
  return phoneRoutes(row).filter((route) =>
    contactRouteRoles.sellerContactEligibility(route).status !== contactRouteRoles.SELLER_CONTACT_ELIGIBLE
  );
}

function lifecycleCounts(value) {
  return Object.fromEntries(LIFECYCLE_STATUSES.map((status) => [status, value]));
}

function unavailableMarket(market) {
  return {
    market,
    total_rows: null,
    complete_verified_address_rows: null,
    lifecycle_status_counts: lifecycleCounts(null),
    rows_with_seller_eligible_phone: null,
    rows_with_research_only_phone: null,
    rows_with_email_but_no_seller_phone: null,
    rows_with_owner_or_taxpayer_identity: null,
    rows_with_verified_phone_blocked_only_by_date_unknown: null,
    rows_eligible_for_phone_evidence_lane: null,
    rows_that_could_reach_call_ready_if_phone_found: null,
    call_ready_now: null
  };
}

function identityKnown(row) {
  return leadOperationsState.identityKnown(row);
}

function emailButNoSellerPhone(row) {
  if (sellerPhones(row).length) return false;
  return (Array.isArray(row && row.free_contact_routes) ? row.free_contact_routes : []).some((route) =>
    /^(email|form|reply_link)$/.test(cleanText(route && route.route_kind)) &&
    fieldProvenance.routeHasProvenance(route) &&
    contactRouteRoles.sellerContactEligibility(route).status === contactRouteRoles.SELLER_CONTACT_ELIGIBLE
  );
}

function couldReachCallReadyWithPhone(row, nowIso) {
  const state = leadLifecycleStatus.computeLifecycleStatus(row, nowIso);
  if (state.quarantined || !cleanText(row && row.normalized_address)) return false;
  const syntheticPhone = {
    route_kind: 'phone',
    value: '(000) 000-0000',
    route_type: 'owner_phone',
    source_kind: 'official_public_record',
    source_url: 'https://fixture.invalid/owner-phone',
    evidence_text: 'Owner of record phone supplied for readiness measurement only.'
  };
  const projected = Object.assign({}, row, {
    lifecycle_status: state,
    free_contact_routes: [].concat(Array.isArray(row.free_contact_routes) ? row.free_contact_routes : [], [syntheticPhone])
  });
  return leadOperationsState.rowStateForDeal(projected).row_state === 'CALL_READY';
}

function measureRows(market, rows, nowIso) {
  const result = unavailableMarket(market);
  result.total_rows = rows.length;
  result.complete_verified_address_rows = 0;
  result.lifecycle_status_counts = lifecycleCounts(0);
  result.rows_with_seller_eligible_phone = 0;
  result.rows_with_research_only_phone = 0;
  result.rows_with_email_but_no_seller_phone = 0;
  result.rows_with_owner_or_taxpayer_identity = 0;
  result.rows_with_verified_phone_blocked_only_by_date_unknown = 0;
  result.rows_eligible_for_phone_evidence_lane = 0;
  result.rows_that_could_reach_call_ready_if_phone_found = 0;
  result.call_ready_now = 0;

  const selection = enrichmentScheduler.selectRowsForEnrichment(rows, {
    lane: 'public_search',
    limit: Math.max(1, rows.length),
    now_iso: nowIso,
    market_policy: {}
  });
  result.rows_eligible_for_phone_evidence_lane = selection.selected.length;

  for (const row of rows) {
    const state = leadLifecycleStatus.computeLifecycleStatus(row, nowIso);
    result.lifecycle_status_counts[state.status] += 1;
    if (propertyIdentity.isCompleteAddress(cleanText(row && row.normalized_address))) result.complete_verified_address_rows += 1;
    if (sellerPhones(row).length) result.rows_with_seller_eligible_phone += 1;
    if (researchOnlyPhones(row).length) result.rows_with_research_only_phone += 1;
    if (emailButNoSellerPhone(row)) result.rows_with_email_but_no_seller_phone += 1;
    if (identityKnown(row)) result.rows_with_owner_or_taxpayer_identity += 1;
    if (leadOperationsState.rowStateForDeal(Object.assign({}, row, { lifecycle_status: state })).row_state === 'CALL_READY') {
      result.call_ready_now += 1;
    }
    if (state.status === 'DATE_UNKNOWN_REVERIFY' && sellerPhones(row).length) {
      const projected = Object.assign({}, row, { lifecycle_status: { status: 'FRESH', quarantined: false } });
      if (leadOperationsState.rowStateForDeal(projected).row_state === 'CALL_READY') {
        result.rows_with_verified_phone_blocked_only_by_date_unknown += 1;
      }
    }
    if (couldReachCallReadyWithPhone(row, nowIso)) result.rows_that_could_reach_call_ready_if_phone_found += 1;
  }
  return result;
}

function buildReport() {
  const root = path.resolve(__dirname, '..');
  const snapshotPath = path.resolve(process.env.DEAL_BOARD_SNAPSHOTS_PATH || path.join(root, 'data', 'deal-board-snapshots.json'));
  const outputPath = path.resolve(root, 'exports', 'cycle-27-phone-readiness', 'readiness.json');
  const generatedAt = new Date().toISOString();
  let report;
  if (!fs.existsSync(snapshotPath)) {
    report = {
      cycle: 27,
      target: 'FIRST_VERIFIED_SELLER_PHONE',
      email_required: false,
      status: 'UNREACHABLE',
      reason: `Local deal-board snapshot store does not exist at ${snapshotPath}. The production Railway volume was not contacted.`,
      production_contacted: false,
      snapshot_path: snapshotPath,
      generated_at: generatedAt,
      markets: MARKETS.map(unavailableMarket)
    };
  } else {
    const store = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    report = {
      cycle: 27,
      target: 'FIRST_VERIFIED_SELLER_PHONE',
      email_required: false,
      status: 'MEASURED_LOCAL_SNAPSHOT_READ_ONLY',
      reason: '',
      production_contacted: false,
      snapshot_path: snapshotPath,
      generated_at: generatedAt,
      markets: MARKETS.map((market) => {
        const bucket = store && store.markets && store.markets[marketKey(market)];
        return measureRows(market, bucket && Array.isArray(bucket.rows) ? bucket.rows : [], generatedAt);
      })
    };
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) process.stdout.write(`${JSON.stringify(buildReport(), null, 2)}\n`);

module.exports = {
  MARKETS,
  buildReport,
  measureRows,
  sellerPhones,
  researchOnlyPhones
};
