'use strict';

const grid = require('../research/disclosure-state-comp-resolution');
const sourceDates = require('../research/normalize-source-date');
const addresses = require('../research/operational-lead-eligibility');
const buyerFit = require('../buyers/buyer-fit');
const limits = require('../buyers/assistant-finds');
const activity = require('../records/record-activity');
const PLATFORMS = ['facebook-wholesaler', 'xome', 'auction.com', 'hud', 'homepath', 'craigslist', 'county-auction', 'own-lead'];
const STAGES = ['found', 'vetted', 'holder_confirmed', 'contract_verified', 'jv_signed', 'buyer_committed', 'closed'];
const STATUS_LABELS = { found: 'Found', vetted: 'Vetted', holder_confirmed: 'Holder confirmed', contract_verified: 'Contract copy verified', jv_signed: 'JV signed', buyer_committed: 'Buyer committed', closed: 'Closed', expired: 'Expired', dead: 'Dead' };
const FIELDS = new Set(['kind', 'deal_kind', 'platform', 'source_url', 'address', 'zip', 'city', 'county', 'state', 'beds', 'baths', 'sqft', 'year_built', 'lot_size', 'property_type', 'latitude', 'longitude', 'asking_price', 'starting_bid', 'claimed_arv', 'claimed_rehab', 'repair_estimate', 'comps', 'arv_range', 'arv_tier', 'closing_date', 'auction_date', 'posted_at', 'captured_at', 'holder_contact', 'drafted_message', 'jv_split', 'verdict', 'verdict_reason', 'county_url']);
const COMP_FIELDS = new Set(['comp_address', 'sold_status', 'sold_price', 'last_list_price', 'sold_date', 'source_url', 'evidence_text', 'beds', 'baths', 'sqft', 'year_built', 'lot_size', 'property_type', 'latitude', 'longitude', 'price_basis']);
FIELDS.add('ref');
function fail(code, status = 400) { const e = new Error(code); e.code = code; e.status = status; throw e; }
function text(value, max = 300, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f<>]/.test(value)) fail('find_deal_field_invalid');
  value = value.trim(); if (required && !value) fail('find_deal_field_required'); return value;
}
function number(value, max = 1e9) { if (value == null) return null; if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) fail('find_deal_number_invalid'); return value; }
function url(value, required = false) {
  if (!value && !required) return '';
  let u; try { u = new URL(text(value, 2048, true)); } catch (_) { fail('find_deal_url_invalid'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) fail('find_deal_url_invalid');
  return u.href;
}
function instant(value, now, required = false) {
  value = text(value, 40, required); if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10) || Date.parse(value) > Date.parse(now) + 300000) fail('find_deal_timestamp_invalid');
  return new Date(value).toISOString();
}
function date(value) {
  value = text(value, 80); if (!value) return '';
  const result = sourceDates.normalizeSourceDate(value);
  if (!result.iso) fail('find_deal_date_unproven'); return result.iso;
}
function validate(item, now) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(k => !FIELDS.has(k))) fail('find_deal_item_invalid');
  if (Buffer.byteLength(JSON.stringify(item)) > limits.MAX_ITEM_BYTES) fail('find_item_too_large', 413);
  if (item.kind !== 'deal' || !PLATFORMS.includes(item.platform) || !['jv', 'own', 'auction', 'by_owner'].includes(item.deal_kind)) fail('find_deal_kind_invalid');
  const out = { kind: 'deal', deal_kind: item.deal_kind, platform: item.platform, source_kind: 'public_web_page', source_url: url(item.source_url, true), county_url: url(item.county_url),
    address: text(item.address, 250, true), city: text(item.city, 80, true), county: text(item.county, 80), state: text(item.state, 2, true).toUpperCase(), zip: text(item.zip, 5, true),
    property_type: text(item.property_type, 60), captured_at: instant(item.captured_at, now, true), posted_at: instant(item.posted_at, now),
    closing_date: date(item.closing_date), auction_date: date(item.auction_date), drafted_message: text(item.drafted_message, 600),
    verdict: text(item.verdict, 20), verdict_reason: text(item.verdict_reason, 300), claimed_arv_tier: text(item.arv_tier, 40), ref: activity.ref(item.ref) };
  if (!/^[A-Z]{2}$/.test(out.state) || !/^\d{5}$/.test(out.zip) || !require('../research/property-identity').isCompleteAddress(out.address)) fail('find_deal_address_invalid');
  for (const k of ['beds', 'baths', 'sqft', 'year_built', 'lot_size', 'asking_price', 'starting_bid', 'claimed_arv', 'claimed_rehab', 'repair_estimate', 'jv_split']) out[k] = number(item[k]);
  for (const k of ['latitude', 'longitude']) { out[k] = item[k] == null ? null : item[k]; if (out[k] != null && (typeof out[k] !== 'number' || !Number.isFinite(out[k]) || Math.abs(out[k]) > (k === 'latitude' ? 90 : 180))) fail('find_deal_number_invalid'); }
  if (out.jv_split != null && (out.jv_split <= 0 || out.jv_split > 1)) fail('find_deal_number_invalid');
  out.claimed_arv_range = item.arv_range == null ? null : { low: number(item.arv_range.low), high: number(item.arv_range.high) };
  if (item.arv_range && (Object.keys(item.arv_range).some(k => !['low', 'high'].includes(k)) || !(out.claimed_arv_range.high >= out.claimed_arv_range.low))) fail('find_deal_number_invalid');
  const contact = item.holder_contact || {};
  if (typeof contact !== 'object' || Array.isArray(contact) || Object.keys(contact).some(k => !['name', 'phone', 'email', 'profile_url'].includes(k))) fail('find_deal_contact_invalid');
  out.holder_contact = { name: text(contact.name, 120), phone: text(contact.phone, 40), email: text(contact.email, 254), profile_url: url(contact.profile_url) };
  if (out.holder_contact.phone && !/^[+\d().\-\s]{7,40}$/.test(out.holder_contact.phone) || out.holder_contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.holder_contact.email)) fail('find_deal_contact_invalid');
  if (!Array.isArray(item.comps) || item.comps.length > 8) fail('find_deal_comps_invalid');
  out.comps = item.comps.map(c => {
    if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => !COMP_FIELDS.has(k))) fail('find_deal_comps_invalid');
    const copy = { comp_address: text(c.comp_address, 250, true), sold_status: text(c.sold_status, 30), sold_date: date(c.sold_date), source_url: url(c.source_url, true), evidence_text: text(c.evidence_text, 600), property_type: text(c.property_type, 60), price_basis: text(c.price_basis, 30) || 'recorded_sale' };
    for (const k of ['sold_price', 'last_list_price', 'beds', 'baths', 'sqft', 'year_built', 'lot_size']) copy[k] = number(c[k]);
    for (const k of ['latitude', 'longitude']) { copy[k] = c[k] == null ? null : c[k]; if (copy[k] != null && (typeof copy[k] !== 'number' || !Number.isFinite(copy[k]) || Math.abs(copy[k]) > (k === 'latitude' ? 90 : 180))) fail('find_deal_comps_invalid'); }
    if (!['recorded_sale', 'texas_last_list_price'].includes(copy.price_basis)) fail('find_deal_comps_invalid');
    return copy;
  });
  return out;
}
function ingest(store, items, { now, operatorId, createId }) {
  const deals = (store.reviewed_deals || []).slice(); const results = [];
  for (const item of items) {
    const existing = deals.find(d => d.source_url === item.source_url && addresses.subjectAddress({ address: d.address }).toLowerCase() === item.address.toLowerCase());
    if (existing) { results.push({ id: existing.id, result: 'duplicate' }); continue; }
    const id = createId(); deals.push({ ...item, id, approval: 'pending', status: 'found', first_seen_at: now, created_by: operatorId, history: [] }); results.push({ id, result: 'created' });
  }
  let updated = { ...store, reviewed_deals: deals };
  results.forEach((result, index) => {
    updated = activity.assign(updated, 'deal', result.id, items[index].ref || '');
    if (result.result === 'created') {
      updated = activity.recordEvent(updated, 'deal', result.id, 'found', 'Deal proposal received; facts await review.', { now, operatorId });
      updated = activity.recordEvent(updated, 'deal', result.id, 'imported', 'Deal imported, pending review.', { now, operatorId });
    }
  });
  return { store: updated, results };
}
function compValue(deal, now) {
  const reasons = []; const valid = []; const seen = new Set(); let listTier = false;
  const row = { normalized_address: deal.address, latitude: deal.latitude, longitude: deal.longitude, property_kind: deal.property_type, living_area: deal.sqft, beds: deal.beds, baths: deal.baths, year_built: deal.year_built, lot_size: deal.lot_size };
  const cutoff = new Date(now); cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
  for (const original of deal.comps || []) {
    const c = { ...original, living_area: original.sqft, property_kind: original.property_type, similarity_basis: 'operator-reviewed strict property grid', source_kind: 'public_web_page', sold_price: original.price_basis === 'texas_last_list_price' ? original.last_list_price : original.sold_price };
    let reason = deal.evidence_reviewed_at && deal.evidence_reviewed_by ? '' : 'Operator comp review required';
    const key = c.comp_address.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!reason && seen.has(key)) reason = 'Duplicate comp';
    if (!reason && (!c.sold_date || c.sold_date < cutoff.toISOString().slice(0, 10) || c.sold_date > now.slice(0, 10))) reason = 'Sale must be within six months';
    if (!reason && (!require('../research/property-identity').isCompleteAddress(c.comp_address) || !c.evidence_text)) reason = 'Complete comp address and source text required';
    const canonical = require('../../scripts/lib/address-canonical').canonicalizeAddress;
    const subject = canonical(deal.address); const comp = canonical(c.comp_address);
    if (!reason && subject.number === comp.number && subject.street === comp.street && subject.city === comp.city && subject.state === comp.state) reason = 'Subject cannot be its own comp';
    if (!reason && require('../research/address-derived-research-links').classifyStoredAddressLink(c.source_url, c.comp_address).status === 'MISMATCH') reason = 'Comp source links to a different property';
    if (!reason && c.price_basis === 'texas_last_list_price' && deal.state !== 'TX') reason = 'List-price tier is Texas only';
    if (!reason) reason = grid.rejectReason(c, row, { now_iso: now, today_iso: now });
    if (reason) { reasons.push({ address: original.comp_address, reason }); continue; }
    seen.add(key); valid.push(c); if (c.price_basis === 'texas_last_list_price') listTier = true;
  }
  const prices = valid.map(c => c.sold_price).sort((a, b) => a - b);
  return { tier: prices.length < 2 ? 'Not established' : listTier ? 'Texas list-price' : prices.length >= 3 ? 'Verified' : 'Preliminary',
    range: prices.length < 2 ? null : { low: prices[0], high: prices[prices.length - 1] }, comps: valid, rejected: reasons };
}
function ceiling(buyer, value, repairs) {
  const box = buyer.assistant_find && buyer.assistant_find.buy_box || {};
  const percent = String(box.pct_arv || '').trim().match(/^(\d{1,2}(?:\.\d+)?)\s*%$/);
  const bounds = [box.price_max, buyer.maxPrice].filter(n => typeof n === 'number' && Number.isFinite(n) && n > 0);
  if (repairs != null && box.all_in_max > 0) bounds.push(box.all_in_max - repairs);
  if (percent && repairs != null && value.range) bounds.push(value.range.low * Number(percent[1]) / 100 - repairs);
  if (!bounds.length) return null;
  const max = Math.min(...bounds); return max > 0 ? Math.round(max) : null;
}
function evaluate(deal, buyers, now) {
  const value = compValue(deal, now); const asking = deal.asking_price > 0 ? deal.asking_price : deal.starting_bid > 0 ? deal.starting_bid : null;
  const matches = [];
  for (const buyer of buyers || []) {
    if (deal.approval !== 'approved') continue;
    if (!addresses.buyerEligible(buyer)) continue;
    if (!buyer.assistant_find && buyer.approval !== 'approved') continue;
    const normalized = buyer.assistant_find ? buyer : { ...buyer, assistant_find: { approval: 'approved', classification: 'end_buyer', states: buyer.states || (buyer.state ? [buyer.state] : []), areas: buyer.cities || [], buy_box: { types: buyer.buyTypes || [], price_max: buyer.maxPrice } } };
    const box = normalized.assistant_find.buy_box || {};
    if (box.pct_arv && !/^(?:[1-9]\d?(?:\.\d+)?)\s*%$/.test(String(box.pct_arv).trim())) continue;
    if (!(box.state || normalized.assistant_find.states && normalized.assistant_find.states.length) || !(box.areas && box.areas.length || normalized.assistant_find.areas && normalized.assistant_find.areas.length || box.zips && box.zips.length)) continue;
    // Geography/type fit is separate from the ceiling; above-ceiling deals remain negotiable.
    const geographic = { ...normalized, assistant_find: { ...normalized.assistant_find, buy_box: { ...box } } };
    delete geographic.assistant_find.buy_box.price_min; delete geographic.assistant_find.buy_box.price_max;
    const fit = buyerFit.fitLead(geographic, { state: deal.state, city: deal.city, county: deal.county, zip: deal.zip, property_type: deal.property_type });
    if (!fit.fits || fit.unknown.length) continue;
    const numericCriteria = [['beds_min', 'beds', 'min'], ['baths_min', 'baths', 'min'], ['sqft_min', 'sqft', 'min'], ['sqft_max', 'sqft', 'max'], ['year_min', 'year_built', 'min']];
    if (numericCriteria.some(([k, fact, direction]) => box[k] != null && (deal[fact] == null || (direction === 'min' ? deal[fact] < box[k] : deal[fact] > box[k])))) continue;
    if (box.arv_min != null && (!value.range || value.range.low < box.arv_min) || box.arv_max != null && (!value.range || value.range.high > box.arv_max)) continue;
    if (['construction', 'flood', 'rehab_tolerance'].some(k => box[k]) || (box.exclusions || []).length) continue;
    const max = ceiling(buyer, value, deal.repair_estimate);
    if (box.price_min != null && (asking == null || asking < box.price_min || max == null || max < box.price_min)) continue;
    if (max != null) matches.push({ id: buyer.id, buyer_ref: activity.reference(buyer), name: buyer.name || buyer.assistant_find.name, reasons: fit.reasons, max_price: max, buy_box: box,
      source_url: buyer.source_url || buyer.assistant_find && buyer.assistant_find.source_url || '',
      estimated_spread: asking == null || deal.deal_kind === 'jv' && deal.jv_split == null ? null : { low: Math.round((max - asking) * (deal.deal_kind === 'jv' ? deal.jv_split : 1)), high: Math.round((max - asking) * (deal.deal_kind === 'jv' ? deal.jv_split : 1)) },
      spread_missing: deal.deal_kind === 'jv' && deal.jv_split == null });
  }
  matches.sort((a, b) => b.max_price - a.max_price || a.id.localeCompare(b.id));
  const deadline = deal.closing_date || deal.auction_date;
  const posted = deal.posted_at ? Date.parse(deal.posted_at) : NaN;
  const expiry = deal.closing_date || (Number.isFinite(posted) ? new Date(posted + 14 * 86400000).toISOString().slice(0, 10) : '');
  const expired = deal.deal_kind === 'jv' ? !!expiry && expiry < now.slice(0, 10) : !!deadline && deadline < now.slice(0, 10);
  const days = deadline ? Math.ceil((Date.parse(deadline + 'T00:00:00Z') - Date.parse(now.slice(0, 10) + 'T00:00:00Z')) / 86400000) : null;
  const fresh = Number.isFinite(posted) && Date.parse(now) - posted <= 14 * 86400000 && posted <= Date.parse(now) && (!deal.closing_date || days >= 7);
  const checked = deal.rechecked_at && deal.rechecked_at.slice(0, 10) === now.slice(0, 10);
  const confirmed = deal.holder_confirmed_at && deal.holder_confirmed_at.slice(0, 10) === now.slice(0, 10);
  const best = matches[0]; const priceFits = asking != null && best && asking <= best.max_price * 1.1;
  const jvReasons = [];
  if (deal.approval !== 'approved') jvReasons.push('Approval required');
  if (!fresh) jvReasons.push('Posted within 14 days and at least 7 days to closing required');
  if (!checked || !confirmed) jvReasons.push('Today\'s recheck and holder availability confirmation required');
  if (!value.range || deal.repair_estimate == null) jvReasons.push('Reviewed comps and a repair estimate required');
  if (!best) jvReasons.push('Approved buyer with known area and price rule required');
  if (!priceFits) jvReasons.push('Asking must fit the buyer ceiling or be within 10% to negotiate');
  if (expired || ['dead', 'closed'].includes(deal.status)) jvReasons.push('Deal is no longer active');
  const verdict = expired ? 'STALE' : deal.status === 'dead' || deal.approval === 'rejected' ? 'NO' : !value.range || !best || asking == null || deal.repair_estimate == null ? 'POSSIBLE' : asking <= best.max_price ? 'GOOD' : asking <= best.max_price * 1.1 ? 'POSSIBLE' : 'OVERPRICED';
  const introduction_allowed = !!(deal.approval === 'approved' && !expired && deal.status !== 'dead' && checked && confirmed && deal.contract_verified_at && deal.jv_signed_at && !jvReasons.length);
  return { value, matches, asking, deadline, days_to_deadline: days, expires_on: expiry, status: expired && !['dead', 'closed'].includes(deal.status) ? 'expired' : deal.status,
    verdict, verdict_reason: expired ? 'Deadline has passed' : !value.range ? 'Review at least two recent comparable sales' : !best ? 'No approved buyer price rule matches yet' : asking == null ? 'Asking price not supplied' : deal.repair_estimate == null ? 'Repair estimate not supplied' : verdict === 'GOOD' ? 'Asking fits the recorded buyer ceiling' : verdict === 'OVERPRICED' ? 'Asking exceeds the buyer ceiling by more than 10%' : 'Negotiate within 10% of the buyer ceiling',
    jv_eligible: deal.deal_kind === 'jv' && !jvReasons.length, jv_reasons: jvReasons, introduction_allowed, ready_to_offer: 'UNKNOWN',
    next_action: expired ? 'Keep for history; verify whether a new deal exists.' : deal.approval !== 'approved' ? 'Review the source and comps, then approve or reject.' : !value.range ? 'Review the comparable sales.' : deal.deal_kind === 'jv' && !confirmed ? 'Ask the holder whether it is still available.' : !deal.contract_verified_at ? 'Review the contract copy and owner-of-record evidence.' : !deal.jv_signed_at && deal.deal_kind === 'jv' ? 'Have title review the JV terms before signing.' : 'Review the matched buyer and the next recorded stage.' };
}
function update(store, id, input, { now, operatorId }) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['action', 'status', 'reason', 'reviewed_comps', 'checks', 'evidence_url', 'drafted_message'].includes(k))) fail('find_deal_update_invalid');
  const index = (store.reviewed_deals || []).findIndex(d => d.id === id); if (index < 0) fail('find_deal_not_found', 404);
  const deal = { ...store.reviewed_deals[index] }; const from = deal.status; const action = input.action;
  const reason = text(input.reason, 300); const evidenceUrl = url(input.evidence_url);
  if (action === 'approve') { if (input.reviewed_comps !== true) fail('find_deal_review_required', 409); deal.approval = 'approved'; deal.evidence_reviewed_at = now; deal.evidence_reviewed_by = operatorId; }
  else if (action === 'reject') deal.approval = 'rejected';
  else if (action === 'recheck') { if (!evidenceUrl) fail('find_deal_evidence_required'); deal.rechecked_at = now; deal.recheck_url = evidenceUrl; }
  else if (action === 'availability') {
    if (deal.approval !== 'approved' || !evidenceUrl || !input.checks || input.checks.still_available !== true || Object.keys(input.checks).some(k => k !== 'still_available')) fail('find_deal_checks_required', 409);
    deal.holder_confirmed_at = now; deal.rechecked_at = now; deal.recheck_url = evidenceUrl;
  }
  else if (action === 'draft') deal.drafted_message = text(input.drafted_message, 600);
  else if (action === 'status') {
    const state = evaluate(deal, store.buyers, now);
    if (!['dead', ...STAGES].includes(input.status)) fail('find_deal_status_invalid');
    if (state.status === 'expired' || ['closed', 'dead'].includes(from)) fail('find_deal_terminal', 409);
    if (input.status !== 'dead' && STAGES.indexOf(input.status) !== STAGES.indexOf(from) + 1) fail('find_deal_transition_invalid', 409);
    if (input.status !== 'dead' && deal.approval !== 'approved') fail('find_deal_approval_required', 409);
    const required = { holder_confirmed: ['still_available'], contract_verified: ['seller_signature', 'assignable', 'closing_date', 'title_company', 'owner_record_matches'], jv_signed: ['signed', 'contract_interest', 'title_pays_fees'], buyer_committed: ['emd_at_title'], closed: ['title_closed'] }[input.status] || [];
    if (required.length && (!evidenceUrl || !input.checks || Object.keys(input.checks).some(k => !required.includes(k)) || required.some(k => input.checks[k] !== true))) fail('find_deal_checks_required', 409);
    if (input.status === 'vetted' && (!state.value.range || !state.matches.length || deal.repair_estimate == null)) fail('find_deal_vetting_required', 409);
    if (input.status === 'holder_confirmed') { deal.holder_confirmed_at = now; deal.rechecked_at = now; deal.recheck_url = evidenceUrl; }
    if (input.status === 'contract_verified') deal.contract_verified_at = now;
    if (input.status === 'jv_signed') deal.jv_signed_at = now;
    if (input.status === 'buyer_committed' && deal.deal_kind === 'jv' && !state.introduction_allowed) fail('find_deal_introduction_blocked', 409);
    deal.status = input.status;
  } else fail('find_deal_action_invalid');
  deal.history = (deal.history || []).concat({ action, from, to: action === 'status' ? deal.status : deal.approval, at: now, operator_id: operatorId, reason, evidence_url: evidenceUrl, ...(input.checks ? { checks: { ...input.checks } } : {}) });
  const rows = store.reviewed_deals.slice(); rows[index] = deal;
  let updated = activity.assign({ ...store, reviewed_deals: rows }, 'deal', id);
  const type = ({ approve: 'approved', reject: 'rejected', draft: 'message_drafted', status: 'status_change', recheck: 'source_rechecked', availability: 'source_rechecked' })[action];
  updated = activity.recordEvent(updated, 'deal', id, type, 'Operator recorded ' + (action === 'status' ? input.status : action) + '.', { now, operatorId }, { attribution: 'operator_report', history_origin: 'deal:' + id + ':' + (deal.history.length - 1) });
  return synchronizeMatchReferences(updated, { now, operatorId });
}
function synchronizeMatchReferences(store, context) {
  let updated = store;
  for (const deal of store.reviewed_deals || []) {
    const evaluation = evaluate(deal, store.buyers, context.now);
    if (evaluation.status === 'expired' && !(updated.activities || []).some(a => a.type === 'expired' && a.deal_id === deal.id && a.expiry_key === evaluation.expires_on)) {
      updated = activity.recordEvent(updated, 'deal', deal.id, 'expired', 'Workflow expiration observed from the stored deadline.', context, { who:'System', attribution:'derived_workflow', expiry_key:evaluation.expires_on });
    }
    for (const match of evaluation.matches) {
      updated = activity.assign(updated, 'buyer', match.id);
      updated = activity.registerMatch(updated, deal.id, match.id, context);
    }
  }
  return updated;
}
function list(store, { now, includeHidden = false, jv = false, state = '', county = '', city = '', recordId = '' }) {
  const all = (store.reviewed_deals || []).map(d => {
    const evaluation = evaluate(d, store.buyers, now);
    evaluation.matches = evaluation.matches.map(m => ({ ...m, match_ref: activity.matchReference(store, d.id, m.id) }));
    return { ...d, email_subject: d.record_ref ? '[' + d.record_ref + '] Deal enquiry' : '', evaluation };
  });
  const items = all.filter(d => (!recordId || d.id === recordId) && (!jv || d.evaluation.jv_eligible) && (includeHidden || !['STALE', 'NO'].includes(d.evaluation.verdict)) &&
    (!state || d.state.toLowerCase() === state.toLowerCase()) && (!county || d.county.toLowerCase().includes(county.toLowerCase())) && (!city || d.city.toLowerCase().includes(city.toLowerCase())));
  const rank = { GOOD: 0, POSSIBLE: 1, OVERPRICED: 2, STALE: 3, NO: 4 };
  const spread = d => { const estimate = (d.evaluation.matches[0] || {}).estimated_spread; return estimate ? estimate.low : -Infinity; };
  items.sort((a, b) => rank[a.evaluation.verdict] - rank[b.evaluation.verdict] || (spread(b) > spread(a) ? 1 : spread(b) < spread(a) ? -1 : 0) || (a.evaluation.deadline || '9999').localeCompare(b.evaluation.deadline || '9999') || a.id.localeCompare(b.id));
  return { items: items.slice(0, 100), counts: { total: all.length, shown: items.length, vetted_today: all.filter(d => d.approval === 'approved' && d.evidence_reviewed_at && d.evidence_reviewed_at.slice(0, 10) === now.slice(0, 10) && d.evaluation.value.range && d.evaluation.matches.length && !['STALE', 'NO'].includes(d.evaluation.verdict)).length, daily_target: 10, jv: all.filter(d => d.evaluation.jv_eligible).length }, status_labels: STATUS_LABELS };
}
function jvDraft(deal, evaluation) {
  return ['WORKING JV TERM SHEET - NOT A SIGNED AGREEMENT', 'Title company and counsel must review. This draft establishes no ownership, authority or legal compliance.',
    'Record reference: ' + (activity.reference(deal) || 'Not assigned'), 'Property: ' + deal.address, 'Holder: __________________', 'Co-holder: __________________', 'Contract interest and assignment authority: __________________',
    'Owner-of-record / contract signature / assignability / closing date checks: __________________', 'Title company: __________________',
    'Fee split proposed: ' + (deal.jv_split == null ? 'Not supplied' : deal.jv_split * 100 + '% to Gabriel'), 'Fees payable by title only at closing.',
    'Closing / expiration: ' + (evaluation.expires_on || 'Not supplied'), 'Buyer earnest money delivered to title: __________________', 'Signatures, date and title approval: __________________'].join('\n');
}
module.exports = { validate, ingest, update, evaluate, list, jvDraft, synchronizeMatchReferences, STAGES, STATUS_LABELS };
