'use strict';

const fs = require('fs');
const path = require('path');

const contactRouteRoles = require('../modules/research/contact-route-roles');
const leadOperationsState = require('../modules/research/lead-operations-state');

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function invalidated(row, route) {
  const value = cleanText(route && route.value);
  const flags = Array.isArray(route && route.risk_flags) ? route.risk_flags.map(cleanText) : [];
  const invalidatedRoutes = Array.isArray(row && row.contact_workflow_invalidated_routes)
    ? row.contact_workflow_invalidated_routes
    : [];
  return route && route.operator_disproved === true || flags.includes('OPERATOR_WRONG_NUMBER_REPORTED') ||
    Boolean(value && invalidatedRoutes.some((item) => cleanText(item && item.value) === value));
}

function blankCounts() {
  return {
    rows: 0,
    qualifying_seller_phone_routes: 0,
    qualifying_seller_email_routes: 0,
    taxpayer_mailing_routes: 0,
    non_seller_institutional_routes_by_role: {},
    ambiguous_or_unknown_routes: 0,
    rows_with_no_route: 0,
    readiness_before: {},
    readiness_after: {}
  };
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function measureRows(rows) {
  const counts = blankCounts();
  counts.rows = rows.length;
  rows.forEach((row) => {
    const routes = (Array.isArray(row && row.free_contact_routes) ? row.free_contact_routes : [])
      .filter((route) => route && cleanText(route.value) && !invalidated(row, route));
    const mailing = row && row.mailing_route && cleanText(row.mailing_route.value);
    if (!routes.length && !mailing) counts.rows_with_no_route += 1;
    if (mailing && cleanText(row && row.owner_record && row.owner_record.owner_role) === 'taxpayer_of_record') {
      counts.taxpayer_mailing_routes += 1;
    }
    routes.forEach((route) => {
      const classified = contactRouteRoles.classifyRoute(route);
      const eligibility = contactRouteRoles.sellerContactEligibility(route);
      if (eligibility.status === contactRouteRoles.SELLER_CONTACT_ELIGIBLE) {
        if (cleanText(route.route_kind) === 'phone') counts.qualifying_seller_phone_routes += 1;
        if (/^(email|form|reply_link)$/.test(cleanText(route.route_kind))) counts.qualifying_seller_email_routes += 1;
      } else if (classified.role === 'unknown' || classified.role === 'other_source_stated_role') {
        counts.ambiguous_or_unknown_routes += 1;
      } else {
        increment(counts.non_seller_institutional_routes_by_role, classified.role);
      }
    });
    const oldState = routes.some((route) => cleanText(route.route_kind) === 'phone')
      ? 'CALL_READY'
      : routes.some((route) => /^(email|form|reply_link)$/.test(cleanText(route.route_kind)))
        ? 'OUTREACH_READY'
        : mailing ? 'MAIL_READY' : 'NO_ROUTE';
    increment(counts.readiness_before, oldState);
    increment(counts.readiness_after, leadOperationsState.rowStateForDeal(row).row_state);
  });
  return counts;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const snapshotPath = process.env.DEAL_BOARD_SNAPSHOTS_PATH || path.join(root, 'data', 'deal-board-snapshots.json');
  const outputPath = path.join(root, 'exports', 'cycle-22-contact-routes', 'measurement.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  let report;
  if (!fs.existsSync(snapshotPath)) {
    report = {
      cycle: 22,
      status: 'UNREACHABLE',
      reason: 'No local deal-board snapshot store exists in this checkout; the snapshot lives only on the Railway volume. Production was not contacted.',
      snapshot_path_checked: snapshotPath,
      production_contacted: false,
      markets: {},
      dallas: null
    };
  } else {
    const store = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const markets = {};
    Object.keys(store.markets || {}).sort().forEach((key) => {
      const entry = store.markets[key] || {};
      markets[key] = measureRows(Array.isArray(entry.rows) ? entry.rows : []);
    });
    report = {
      cycle: 22,
      status: 'MEASURED_LOCAL_SNAPSHOT',
      snapshot_path_checked: snapshotPath,
      production_contacted: false,
      markets,
      dallas: markets['dallas|dallas|tx'] || null
    };
  }

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) main();

module.exports = { measureRows };
