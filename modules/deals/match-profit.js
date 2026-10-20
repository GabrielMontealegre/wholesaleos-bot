'use strict';

const reports = require('../records/pipeline-reports');
const reviews = require('../records/pipeline-report-review');
const records = require('../records/record-activity');
const money = require('./pipeline-money');

// Reuse validated, exact-reference reports; never mine messages or match ceilings for prices.
function build(store, { now, policies = {} }) {
  let projected, reviewed, unavailable = false;
  try {
    projected = reports.project(store, { now, policies });
    reviewed = reviews.project(store, { now, items: projected.items });
    unavailable = projected.coverage.invalid_reports > 0 || projected.coverage.conflicting_report_ids > 0 || reviewed.coverage.invalid_reviews > 0;
  } catch {
    unavailable = true;
    projected = {items:[]};
    reviewed = {reviews:new Map()};
  }
  const pairs = new Map();
  for (const item of projected.items) {
    if (item.target.kind !== 'deal' || !item.buyer) continue;
    const key = JSON.stringify([item.target.id, item.buyer.id]);
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(item);
  }
  function forMatch(deal, candidate, evaluation) {
    const blank = reason => ({ ...money.calculate({}), reason, reported_only: true,
      buyer_confirmed: false, proof_of_funds: 'Not established',
      buyer_max: candidate?.max_price ?? null, field_provenance: {}, report_id: null });
    if (unavailable) return blank('Price report history needs review; no fallback price used.');
    const buyer=(store.buyers||[]).find(b=>b.id===candidate?.id);
    const current=row=>{const stamp=row?.assistant_find?.captured_at||row?.captured_at;return stamp==null||typeof stamp==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(stamp)&&Number.isFinite(Date.parse(stamp))&&Date.parse(stamp)<=Date.parse(now)&&new Date(stamp).toISOString().slice(0,19)===stamp.slice(0,19);};
    if (!candidate || !evaluation.matches.some(m => m.id === candidate.id) ||
        !current(deal) || !current(buyer) ||
        deal.approval !== 'approved' || ['dead', 'closed', 'expired'].includes(evaluation.status) ||
        evaluation.verdict === 'STALE') return blank('Current approved deal and buyer match required.');
    const items = pairs.get(JSON.stringify([deal.id, candidate.id])) || [];
    if (!items.length) return blank('No exact buyer/deal price report recorded.');
    if (items.length !== 1) return blank('Multiple current reports require price reconciliation.');
    const item = items[0], review = reviewed.reviews.get(item.id);
    if (item.target.ref !== records.reference(deal) || item.address_withheld ||
        item.group === 'closed' || review?.state === 'flagged' || review?.conflict)
      return blank('Report withheld, closed or flagged; review before using prices.');
    return { ...item.money, reason: item.money.missing.length ? 'Reported prices or total costs are incomplete.' :
      'Derived from one pending source report, not agreed prices or confirmed funds.',
      reported_only: true, buyer_confirmed: false, proof_of_funds: 'Not established',
      buyer_max: candidate.max_price ?? null, field_provenance: item.field_provenance,
      report_id: item.id };
  }
  return { forMatch };
}
module.exports = { build };
