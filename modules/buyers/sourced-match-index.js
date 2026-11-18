'use strict';

const finds = require('./assistant-finds');
const fit = require('./buyer-fit');
const deals = require('../deals/reviewed-deals');
const activity = require('../records/record-activity');
const eligibility = require('../research/operational-lead-eligibility');

const REPORT_MAX_AGE_DAYS = 90;
const FIND_INPUT = ['name', 'platform', 'group_name', 'group_id', 'profile_url', 'source_url', 'what_they_buy',
  'deal_type', 'states', 'areas', 'captured_at', 'uid', 'buy_box', 'classification', 'post_url', 'buyer_type'];
const DEAL_INPUT = ['kind', 'deal_kind', 'platform', 'source_url', 'address', 'zip', 'city', 'county', 'state',
  'beds', 'baths', 'sqft', 'year_built', 'lot_size', 'property_type', 'latitude', 'longitude', 'asking_price',
  'starting_bid', 'repair_estimate', 'comps', 'closing_date', 'auction_date', 'posted_at', 'captured_at'];
function own(object, key) {
  const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function pick(object, keys) { return Object.fromEntries(keys.filter(key => own(object, key) !== undefined).map(key => [key, own(object, key)])); }
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')) ? time : null;
}
function uniqueRows(rows) {
  const list = Array.isArray(rows) ? rows : [], ids = new Map(), refs = new Map();
  for (const row of list) {
    const id = own(row, 'id'), ref = activity.reference(row || {});
    ids.set(id, (ids.get(id) || 0) + 1); refs.set(ref, (refs.get(ref) || 0) + 1);
  }
  return list.filter(row => typeof own(row, 'id') === 'string' && row.id && ids.get(row.id) === 1 &&
    typeof activity.reference(row) === 'string' && refs.get(activity.reference(row)) === 1);
}

// A read of trusted backend JSON, not an HTTP-payload approval/authentication API.
function build(store, { now } = {}) {
  const nowTime = instant(now);
  if (nowTime == null) throw new TypeError('Valid injected now required');
  if (!store || !Array.isArray(own(store, 'users')) || !Array.isArray(own(store, 'buyers')) || !Array.isArray(own(store, 'reviewed_deals'))) {
    throw new TypeError('Canonical stored collections required');
  }
  const operators = new Set((Array.isArray(store?.users) ? store.users : []).map(user => own(user, 'id')).filter(id => typeof id === 'string' && id));
  const buyers = [], rejected = { buyers: 0, deals: 0 };
  const originalBuyers = Array.isArray(store?.buyers) ? store.buyers : [];
  for (const row of uniqueRows(originalBuyers)) {
    try {
      const find = own(row, 'assistant_find'), reference = activity.reference(row);
      if (!/^BUY-\d{4}$/.test(reference) || !eligibility.buyerEligible(row) || own(find, 'approval') !== 'approved' || !fit.approvedForMatching(row) ||
          !['end_buyer', 'end_buyer_strict'].includes(own(find, 'classification'))) continue;
      const source = finds.validateItems({ items: [pick(find, FIND_INPUT)] }, now)[0];
      const captured = instant(source.captured_at);
      if (captured == null || captured > nowTime || nowTime - captured > REPORT_MAX_AGE_DAYS * 86400000 ||
          row.name !== source.name || row.source_url && ![source.source_url, source.post_url].includes(row.source_url)) continue;
      const approvals = (Array.isArray(find.history) ? find.history : []).filter(event => own(event, 'kind') === 'approval');
      if (!approvals.length || approvals.some(event => instant(own(event, 'at')) == null || instant(event.at) > nowTime ||
          !operators.has(own(event, 'operator_id')))) continue;
      const lastTime = Math.max(...approvals.map(event => instant(event.at)));
      const latest = approvals.filter(event => instant(event.at) === lastTime);
      if (lastTime < captured || latest.some(event => own(event, 'to') !== 'approved')) continue;
      const box = source.buy_box;
      if (!(box.state || source.states.length) || !(box.areas?.length || source.areas.length || box.zips?.length) || !box.types?.length) continue;
      buyers.push({ id: row.id, record_ref: reference, name: source.name,
        assistant_find: { ...source, approval: 'approved' }, source });
    } catch (_) { /* Malformed evidence is absent, never a weak match. */ }
  }
  rejected.buyers = originalBuyers.length - buyers.length;
  buyers.sort((a, b) => a.id.localeCompare(b.id));
  const byBuyer = new Map(buyers.map(buyer => [buyer.id, { buyer_id: buyer.id, buyer_ref: buyer.record_ref, matches: [] }]));
  const byDeal = [];
  const originalDeals = Array.isArray(store?.reviewed_deals) ? store.reviewed_deals : [];
  for (const row of uniqueRows(originalDeals)) {
    try {
      const reference = activity.reference(row);
      if (!/^WOS-[A-Z]{2}-\d{4}$/.test(reference) || ['dead', 'closed', 'expired'].includes(own(row, 'status')) || own(row, 'approval') === 'rejected') continue;
      const validated = deals.validate(pick(row, DEAL_INPUT), now);
      if (instant(validated.captured_at) > nowTime || !fit.propertyType(validated.property_type)) continue;
      const reviewedAt = instant(own(row, 'evidence_reviewed_at'));
      const reviewed = operators.has(own(row, 'evidence_reviewed_by')) && reviewedAt != null && reviewedAt <= nowTime && reviewedAt >= instant(validated.captured_at);
      const deal = { ...validated, id: row.id, record_ref: reference, approval: own(row, 'approval'), status: own(row, 'status'),
        comp_exclusions: Array.isArray(own(row, 'comp_exclusions')) ? row.comp_exclusions : [],
        ...(reviewed ? { evidence_reviewed_at: row.evidence_reviewed_at, evidence_reviewed_by: row.evidence_reviewed_by } : {}) };
      const evaluation = deals.evaluate(deal, [], now);
      if (evaluation.status === 'expired') continue;
      const label = evaluation.value.tier === 'Verified' ? 'Verified value' : evaluation.value.tier === 'Preliminary' && !evaluation.value.price_basis_label ? 'Preliminary value' : 'Value not verified';
      const output = { deal_id: row.id, deal_ref: reference, value_label: label, matches: [] };
      for (const buyer of buyers) {
        const box = buyer.source.buy_box;
        const result = fit.fitLead(buyer, validated);
        if (!result.fits || result.unknown.length) continue;
        // Keep current numeric/ARV/flood rule checks, but never substitute a negotiable
        // above-price candidate for the strict B19 price-range match.
        const candidate = deals.evaluate(deal, [buyer], now).matches.find(match => match.id === buyer.id);
        if (!candidate) continue;
        const fields = [...Object.keys(box), ...(box.state ? [] : ['states']), ...(box.areas?.length ? [] : ['areas'])]
          .filter(field => box[field] != null || buyer.source[field]?.length);
        const source = { source_kind: 'assistant_report', source_url: buyer.source.post_url || buyer.source.source_url,
          captured_at: buyer.source.captured_at, evidence_text: buyer.source.what_they_buy, buyer_ref: buyer.record_ref };
        output.matches.push({ buyer_id: buyer.id, buyer_ref: buyer.record_ref, reasons: result.reasons,
          criteria: fields.sort().map(field => ({ field, value: box[field] ?? buyer.source[field], source: { ...source } })),
          value_label: label, checks: candidate.check_items, source: { ...source } });
      }
      output.matches.sort((a, b) => b.criteria.length - a.criteria.length || b.source.captured_at.localeCompare(a.source.captured_at) || a.buyer_id.localeCompare(b.buyer_id));
      for (const match of output.matches) byBuyer.get(match.buyer_id).matches.push({ deal_id: row.id, deal_ref: reference,
        value_label: label, reasons: match.reasons.slice(), criteria: match.criteria, checks: match.checks.slice() });
      byDeal.push(output);
    } catch (_) { /* Retain explicit coverage of rejected stored rows below. */ }
  }
  rejected.deals = originalDeals.length - byDeal.length;
  byDeal.sort((a, b) => a.deal_id.localeCompare(b.deal_id));
  const buyerViews = [...byBuyer.values()];
  for (const view of buyerViews) view.matches.sort((a, b) => a.deal_id.localeCompare(b.deal_id));
  return { scope: 'approved_sourced_reported_criteria_only', report_max_age_days: REPORT_MAX_AGE_DAYS,
    coverage: { rejected_buyers: rejected.buyers, rejected_deals: rejected.deals, deed_purchases: 'not_integrated', signups: 'not_integrated' },
    by_deal: byDeal, by_buyer: buyerViews };
}

module.exports = { build, REPORT_MAX_AGE_DAYS };
