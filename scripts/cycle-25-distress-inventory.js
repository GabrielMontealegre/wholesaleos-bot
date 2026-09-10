'use strict';

const fs = require('fs');
const path = require('path');

const distressEvidenceModel = require('../modules/research/distress-evidence-model');
const leadLifecycleStatus = require('../modules/research/lead-lifecycle-status');
const manualEvidencePacketService = require('../modules/research/manual-evidence-packet-service');
const propertyIdentity = require('../modules/research/property-identity');

const MARKETS = Object.freeze([
  { city: 'Dallas', county: 'Dallas', state: 'TX' },
  { city: 'Detroit', county: 'Wayne', state: 'MI' },
  { city: 'San Diego', county: 'San Diego', state: 'CA' },
  { city: 'Los Angeles', county: 'Los Angeles', state: 'CA' },
  { city: 'San Antonio', county: 'Bexar', state: 'TX' },
  { city: 'Houston', county: 'Harris', state: 'TX' }
]);

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function marketKey(market) {
  return [market.city, market.county, market.state].map((value) => cleanText(value).toLowerCase()).join('|');
}

function nullCounts(market) {
  return {
    market,
    total_rows: null,
    complete_verified_addresses: null,
    distress_reason_present: null,
    amount_type_counts: Object.fromEntries(distressEvidenceModel.AMOUNT_TYPES.map((type) => [type, null])),
    source_date_present: null,
    stale: null,
    sale_passed: null,
    date_unknown: null,
    zillow_research_ready: null,
    redfin_research_ready: null,
    public_estimate_present: null,
    arv_unlocked: null
  };
}

function measuredCounts(market, rows, todayIso) {
  const counts = nullCounts(market);
  counts.total_rows = rows.length;
  counts.complete_verified_addresses = 0;
  counts.distress_reason_present = 0;
  counts.amount_type_counts = Object.fromEntries(distressEvidenceModel.AMOUNT_TYPES.map((type) => [type, 0]));
  counts.source_date_present = 0;
  counts.stale = 0;
  counts.sale_passed = 0;
  counts.date_unknown = 0;
  counts.zillow_research_ready = 0;
  counts.redfin_research_ready = 0;
  counts.public_estimate_present = 0;
  counts.arv_unlocked = 0;
  for (const row of rows) {
    const distress = distressEvidenceModel.buildDistressEvidence(row);
    const lifecycle = leadLifecycleStatus.computeLifecycleStatus(row, todayIso);
    const links = manualEvidencePacketService.researchLinks(row);
    if (propertyIdentity.isCompleteAddress(cleanText(row.normalized_address)) && row.source_structured_address_verified !== false) counts.complete_verified_addresses += 1;
    if (distress.distress_reason) counts.distress_reason_present += 1;
    distress.money_facts.forEach((fact) => {
      if (fact.amount_type && fact.exact_amount !== distressEvidenceModel.MISSING_AMOUNT_TEXT) counts.amount_type_counts[fact.amount_type] += 1;
    });
    if (distress.source_date_present) counts.source_date_present += 1;
    if (lifecycle.status === 'AGING' && lifecycle.reason_code === 'SOURCE_DATED_OVER_30_DAYS') counts.stale += 1;
    if (lifecycle.status === 'SALE_PASSED') counts.sale_passed += 1;
    if (lifecycle.status === 'DATE_UNKNOWN_REVERIFY') counts.date_unknown += 1;
    if (links.some((link) => /zillow/i.test(link.label))) counts.zillow_research_ready += 1;
    if (links.some((link) => /redfin/i.test(link.label))) counts.redfin_research_ready += 1;
    if (distress.money_facts.some((fact) => fact.amount_type === 'public_estimate')) counts.public_estimate_present += 1;
    if (/^ARV_UNLOCKED_VERIFIED_COMPS$/i.test(cleanText(row.ARV_lock_state))) counts.arv_unlocked += 1;
  }
  return counts;
}

function buildInventory() {
  const snapshotPath = path.resolve(process.env.DEAL_BOARD_SNAPSHOTS_PATH || path.join('data', 'deal-board-snapshots.json'));
  const outputPath = path.resolve('exports', 'cycle-25-distress-inventory', 'inventory.json');
  const generatedAt = new Date().toISOString();
  let result;
  if (!fs.existsSync(snapshotPath)) {
    result = {
      cycle: 25,
      status: 'UNREACHABLE',
      reason: `Local deal-board snapshot store does not exist at ${snapshotPath}. The production Railway volume was not contacted.`,
      production_contacted: false,
      snapshot_path: snapshotPath,
      generated_at: generatedAt,
      markets: MARKETS.map(nullCounts)
    };
  } else {
    const store = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    result = {
      cycle: 25,
      status: 'MEASURED_LOCAL_SNAPSHOT',
      reason: '',
      production_contacted: false,
      snapshot_path: snapshotPath,
      generated_at: generatedAt,
      markets: MARKETS.map((market) => {
        const bucket = store && store.markets && store.markets[marketKey(market)];
        return measuredCounts(market, bucket && Array.isArray(bucket.rows) ? bucket.rows : [], generatedAt);
      })
    };
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (require.main === module) process.stdout.write(`${JSON.stringify(buildInventory(), null, 2)}\n`);

module.exports = { MARKETS, buildInventory, measuredCounts };
