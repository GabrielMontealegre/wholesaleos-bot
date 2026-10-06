'use strict';

const END_BUYERS = new Set(['end_buyer', 'end_buyer_strict', 'end_buyer_stale', 'unknown']);
function approvedForMatching(buyer) {
  const find = buyer && buyer.assistant_find;
  return !find || (find.approval === 'approved' && END_BUYERS.has(find.classification));
}
function norm(value) { return String(value || '').trim().toLowerCase().replace(/\s+county$/, '').replace(/\s+/g, ' '); }
function propertyType(value) {
  const key = norm(value);
  return ({ sfr: 'house', sfh: 'house', 'single family': 'house', 'single-family': 'house',
    'single family residential': 'house', 'single family residence': 'house', 'single-family home': 'house',
    '2-4 units': '2-4 units', '2–4 units': '2-4 units', townhouse: 'townhome',
    'vacant land': 'land', 'mobile home on land': 'mobile home on land' })[key] || key;
}
function positive(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null; }

function fitLead(buyer, lead) {
  if (!approvedForMatching(buyer)) return { fits: false, reasons: ['Buyer approval required'], unknown: [] };
  const find = buyer.assistant_find || {};
  const box = find.buy_box || {};
  const reasons = [];
  const unknown = [];
  let mismatch = false;
  function compare(label, requested, known, matches) {
    if (!requested) return;
    if (!known) { unknown.push(label + ' not known'); return; }
    if (matches) reasons.push(label + ' fits');
    else { mismatch = true; reasons.push(label + ' differs'); }
  }
  const states = box.state ? [box.state] : find.states || [];
  const areas = box.areas && box.areas.length ? box.areas : find.areas || [];
  const location = [lead.city, lead.county, lead.metro, lead.market && lead.market.city, lead.market && lead.market.county].filter(Boolean).map(norm);
  compare('State', states.length, lead.state, states.map(norm).includes(norm(lead.state)));
  compare('Area', areas.length, location.length, areas.map(norm).some((area) => location.includes(area)));
  const zip = String(lead.zip || lead.zip_code || '').slice(0, 5);
  compare('ZIP', box.zips && box.zips.length, /^\d{5}$/.test(zip), (box.zips || []).includes(zip));
  const types = box.types || [];
  const type = propertyType(lead.property_type || lead.property_kind_if_visible || lead.type);
  compare('Property type', types.length, type, types.map(propertyType).includes(type));
  const price = [lead.asking_price, lead.list_price, lead.price].map(positive).find((value) => value !== null);
  compare('Price', box.price_min != null || box.price_max != null, price,
    (box.price_min == null || price >= box.price_min) && (box.price_max == null || price <= box.price_max));
  return { fits: !mismatch && reasons.length > 0, reasons, unknown };
}

function fitSummary(buyer, leads) {
  const reasons = {};
  const unknown = {};
  let count = 0;
  for (const lead of leads || []) {
    const fit = fitLead(buyer, lead);
    if (!fit.fits) continue;
    count++;
    fit.reasons.forEach((reason) => { reasons[reason] = (reasons[reason] || 0) + 1; });
    fit.unknown.forEach((reason) => { unknown[reason] = (unknown[reason] || 0) + 1; });
  }
  return { count, reasons, unknown, approval_required: !approvedForMatching(buyer), scope: 'Known area, ZIP, type and price only; value not verified' };
}

function matchingBuyer(buyer) {
  const find = buyer.assistant_find;
  if (!find) return buyer;
  const box = find.buy_box || {};
  return Object.assign({}, buyer, { status: 'Active', state: box.state || (find.states || [])[0] || '',
    states: box.state ? [box.state] : find.states || [], cities: box.areas || find.areas || [],
    buyTypes: box.types || [], minPrice: box.price_min, maxPrice: box.price_max,
    minARV: box.arv_min, trust_label: 'Verified source - approved by operator' });
}

function boxAllowed(box, buyers) {
  const email = String(box.email || '').trim().toLowerCase();
  const phone = String(box.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const related = (buyers || []).filter((buyer) => buyer.assistant_find && (
    (box.buyer_id && box.buyer_id === buyer.id) ||
    (email && email === String(buyer.email || buyer.assistant_find.email || '').trim().toLowerCase()) ||
    (phone.length >= 7 && phone === String(buyer.phone || buyer.assistant_find.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''))
  ));
  return related.every(approvedForMatching);
}

module.exports = { approvedForMatching, fitLead, fitSummary, propertyType, matchingBuyer, boxAllowed };
