'use strict';

const { fitSummary, propertyType } = require('./buyer-fit');
const activity = require('../records/record-activity');
const STATUSES = Object.freeze(['new', 'messaged', 'emailed', 'commented', 'replied', 'not_a_fit']);
const MAX_ITEMS = 50;
const MAX_ITEM_BYTES = 8192;
const MAX_REQUEST_BYTES = 256 * 1024;
const ITEM_FIELDS = new Set(['name', 'platform', 'group_name', 'group_id', 'profile_url', 'source_url',
  'what_they_buy', 'deal_type', 'states', 'areas', 'email', 'phone', 'drafted_message', 'captured_at',
  'uid', 'buy_box', 'classification', 'post_age', 'post_url', 'contact_published', 'ref']);
const BOX_NUMBERS = ['price_min', 'price_max', 'arv_min', 'arv_max', 'all_in_max', 'beds_min', 'baths_min', 'sqft_min', 'sqft_max', 'year_min'];
const BOX_TEXT = ['pct_arv', 'construction', 'flood', 'rehab_tolerance', 'funding', 'close_speed', 'capacity'];
const BOX_FIELDS = new Set(['state', 'areas', 'zips', 'types', 'exclusions', 'wants_sent', ...BOX_NUMBERS, ...BOX_TEXT]);
const TYPES = new Set(['house', 'duplex', '2-4 units', 'townhome', 'condo', 'land', 'mobile home on land']);

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

function text(value, maximum, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('find_field_invalid');
  const result = value.trim();
  if (required && !result) fail('find_field_required');
  return result;
}

function list(value, max, length) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) fail('find_list_invalid');
  return [...new Set(value.map((entry) => text(entry, length, true)))];
}

function facebookUrl(value, groupId, kind) {
  let url;
  try { url = new URL(text(value, 2048, true)); } catch (_) { fail('find_url_invalid'); }
  if (url.protocol !== 'https:' || !['facebook.com', 'www.facebook.com'].includes(url.hostname) ||
      url.username || url.password || url.port || url.hash) fail('find_url_invalid');
  const shape = kind === 'profile' ? /^\/groups\/(\d+)\/user\/(\d+)\/?$/ : /^\/groups\/(\d+)\/search\/?$/;
  const match = url.pathname.match(shape);
  if (!match || match[1] !== groupId) fail('find_url_invalid');
  if (kind === 'profile' && url.search) fail('find_url_invalid');
  if (kind === 'source' && (!url.searchParams.get('q') || [...url.searchParams.keys()].some((key) => key !== 'q'))) fail('find_url_invalid');
  return { url: url.href, uid: kind === 'profile' ? match[2] : null };
}

function publicUrl(value, platform) {
  let url;
  try { url = new URL(text(value, 2048, true)); } catch (_) { fail('find_url_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      !url.hostname.includes('.') || /^(localhost|127\.|0\.|192\.168\.|10\.)/.test(url.hostname)) fail('find_url_invalid');
  if (platform === 'craigslist' && !/^(?:[a-z0-9-]+\.)?craigslist\.org$/.test(url.hostname)) fail('find_url_invalid');
  return url.href;
}

function postUrl(value, platform, groupId) {
  if (!value) return '';
  const href = publicUrl(value, platform);
  const url = new URL(href);
  if (platform === 'facebook' && (!['facebook.com', 'www.facebook.com'].includes(url.hostname) ||
      !new RegExp('^/groups/' + groupId + '/(?:posts|permalink)/\\d+/?$').test(url.pathname))) fail('find_url_invalid');
  return href;
}

function buyBox(input) {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !BOX_FIELDS.has(key))) fail('find_buy_box_invalid');
  const result = {};
  for (const key of BOX_NUMBERS) {
    if (input[key] == null) continue;
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < 0 || input[key] > 1000000000) fail('find_buy_box_invalid');
    result[key] = input[key];
  }
  for (const [min, max] of [['price_min', 'price_max'], ['arv_min', 'arv_max'], ['sqft_min', 'sqft_max']]) {
    if (result[min] != null && result[max] != null && result[min] > result[max]) fail('find_buy_box_invalid');
  }
  for (const key of BOX_TEXT) if (input[key] != null) result[key] = text(input[key], 200);
  if (input.state != null) {
    result.state = text(input.state, 2, true).toUpperCase();
    if (!/^[A-Z]{2}$/.test(result.state)) fail('find_state_invalid');
  }
  for (const key of ['areas', 'zips', 'types', 'exclusions', 'wants_sent']) if (input[key] != null) result[key] = list(input[key], 50, 100);
  if (result.types) result.types = result.types.map(propertyType);
  if ((result.zips || []).some((zip) => !/^\d{5}$/.test(zip)) || (result.types || []).some((type) => !TYPES.has(type))) fail('find_buy_box_invalid');
  return result;
}

function validateItems(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'items')) fail('find_request_invalid');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_REQUEST_BYTES) fail('find_request_too_large', 413);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > MAX_ITEMS) fail('find_item_limit');
  return body.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !ITEM_FIELDS.has(key))) fail('find_item_invalid');
    if (Buffer.byteLength(JSON.stringify(item)) > MAX_ITEM_BYTES) fail('find_item_too_large', 413);
    if (!['facebook', 'craigslist', 'manual'].includes(item.platform) || !['house', 'land'].includes(item.deal_type)) fail('find_type_invalid');
    const groupId = text(item.group_id, 30, item.platform === 'facebook');
    if (item.platform === 'facebook' && !/^\d+$/.test(groupId)) fail('find_group_invalid');
    const profile = item.platform === 'facebook' ? facebookUrl(item.profile_url, groupId, 'profile') : {
      url: item.profile_url ? publicUrl(item.profile_url, item.platform) : '', uid: text(item.uid, 100)
    };
    const source = item.platform === 'facebook' ? facebookUrl(item.source_url, groupId, 'source') : { url: publicUrl(item.source_url, item.platform) };
    const classification = text(item.classification, 60) || 'unknown';
    if (!/^(?:end_buyer(?:_strict|_stale)?|(?:middleman|caution|not_buyer)_[a-z0-9_]+|out_of_market|unknown)$/.test(classification)) fail('find_classification_invalid');
    const published = item.contact_published || {};
    if (typeof published !== 'object' || Array.isArray(published) || Object.keys(published).some((key) => !['email', 'phone'].includes(key))) fail('find_contact_invalid');
    if ((published.email && item.email && normalizedEmail(published.email) !== normalizedEmail(item.email)) ||
        (published.phone && item.phone && normalizedPhone(published.phone) !== normalizedPhone(item.phone))) fail('find_contact_invalid');
    const captured = text(item.captured_at, 40, true);
    const at = Date.parse(captured);
    const dateParts = captured.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
    if (!dateParts || !Number.isFinite(at) || Number(dateParts[3]) > new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]), 0)).getUTCDate() || at > Date.parse(now) + 300000) fail('find_capture_date_invalid');
    const states = list(item.states, 20, 2).map((value) => value.toUpperCase());
    if (states.some((value) => !/^[A-Z]{2}$/.test(value))) fail('find_state_invalid');
    const email = text(published.email || item.email, 254);
    const phone = text(published.phone || item.phone, 40);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('find_contact_invalid');
    if (phone && !/^[+\d().\-\s]{7,40}$/.test(phone)) fail('find_contact_invalid');
    return {
      name: text(item.name, 120, true), platform: item.platform, uid: profile.uid,
      group_name: text(item.group_name, 200, item.platform === 'facebook'), group_id: groupId,
      profile_url: profile.url, source_url: source.url,
      what_they_buy: text(item.what_they_buy, 500, true), deal_type: item.deal_type,
      states, areas: list(item.areas, 20, 80), email, phone,
      drafted_message: text(item.drafted_message, 600), captured_at: new Date(at).toISOString(),
      classification, buy_box: buyBox(item.buy_box), post_age: text(item.post_age, 100),
      post_url: postUrl(item.post_url, item.platform, groupId),
      contact_published: { email, phone }, ref: activity.ref(item.ref)
    };
  });
}

function normalizedEmail(value) { return String(value || '').trim().toLowerCase(); }
function normalizedPhone(value) { const digits = String(value || '').replace(/\D/g, ''); return digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits; }
function duplicateIndex(buyers, item) {
  const exact = buyers.findIndex((buyer) => item.uid && buyer.assistant_find && buyer.assistant_find.platform === item.platform && buyer.assistant_find.uid === item.uid);
  if (exact >= 0) return { index: exact, basis: 'platform_uid' };
  for (const [field, normalize] of [['email', normalizedEmail], ['phone', normalizedPhone]]) {
    const value = normalize(item[field]);
    if (!value || (field === 'phone' && value.length < 7)) continue;
    const index = buyers.findIndex((buyer) => normalize(buyer[field] || (buyer.assistant_find || {})[field]) === value);
    if (index >= 0) return { index, basis: field };
  }
  return { index: -1 };
}

function newFind(item, now) {
  return Object.assign({}, item, { status: 'new', approval: 'pending', first_seen_at: now, last_seen_at: now,
    consent: { profile: 'public want posted; not contacted', email: 'public want posted; not contacted', phone: 'public want posted; not contacted' }, history: [] });
}

function ingest(store, items, { now, operatorId, createId, actorLabel, channel }) {
  const buyers = Array.isArray(store.buyers) ? store.buyers.slice() : [];
  const results = [];
  for (const item of items) {
    const duplicate = duplicateIndex(buyers, item);
    const index = duplicate.index;
    if (index >= 0) {
      buyers[index] = Object.assign({}, buyers[index], {
        assistant_find: Object.assign({}, buyers[index].assistant_find || newFind(item, now), { last_seen_at: now,
          ...(duplicate.basis !== 'platform_uid' ? { possible_duplicate_of: buyers[index].id, duplicate_basis: duplicate.basis } : {}) })
      });
      results.push({ id: buyers[index].id, result: 'duplicate' });
      continue;
    }
    const id = createId();
    buyers.push({
      id, name: item.name, status: 'Unverified', verified: false,
      source: item.platform === 'facebook' ? 'assistant: Facebook post' : 'assistant: ' + item.platform, source_url: item.source_url,
      created: now, created_by: operatorId,
      assistant_find: newFind(item, now)
    });
    results.push({ id, result: 'created' });
  }
  let updated = Object.assign({}, store, { buyers });
  results.forEach((result, index) => {
    updated = activity.assign(updated, 'buyer', result.id, items[index].ref || '');
    if (result.result === 'created') {
      updated = activity.recordEvent(updated, 'buyer', result.id, 'found', 'Buyer find received; not verified or contacted.', { now, operatorId, actorLabel, channel });
      updated = activity.recordEvent(updated, 'buyer', result.id, 'imported', 'Buyer record imported, pending review.', { now, operatorId, actorLabel, channel });
    }
  });
  return { store: updated, results };
}

function update(store, id, input, { now, operatorId }) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length ||
      Object.keys(input).some((key) => !['status', 'drafted_message', 'approval', 'reason', 'channel'].includes(key))) fail('find_update_invalid');
  if (input.status !== undefined && !STATUSES.includes(input.status)) fail('find_status_invalid');
  if (input.approval !== undefined && !['approved', 'rejected'].includes(input.approval)) fail('find_approval_invalid');
  const reason = text(input.reason, 300);
  const channel = text(input.channel, 30);
  if (channel && !['facebook', 'email', 'phone', 'manual'].includes(channel)) fail('find_channel_invalid');
  const draft = input.drafted_message === undefined ? undefined : text(input.drafted_message, 600);
  const buyers = (store.buyers || []).slice();
  const index = buyers.findIndex((buyer) => buyer.id === id && buyer.assistant_find);
  if (index < 0) fail('find_not_found', 404);
  const find = Object.assign({}, buyers[index].assistant_find);
  if (input.approval !== undefined && input.approval !== find.approval) {
    find.history = (find.history || []).concat({ kind: 'approval', from: find.approval || 'pending', to: input.approval, reason, at: now, operator_id: operatorId, channel: 'dashboard' });
    find.approval = input.approval;
  }
  if (draft !== undefined) Object.assign(find, { drafted_message: draft, draft_updated_at: now, draft_updated_by: operatorId });
  if (input.status !== undefined && input.status !== find.status) {
    if (find.approval !== 'approved' && input.status !== 'not_a_fit' && input.status !== 'new') fail('find_approval_required', 409);
    find.history = (find.history || []).concat({ kind: 'outreach', from: find.status, to: input.status, at: now, operator_id: operatorId,
      channel: channel || ({ emailed: 'email', messaged: 'facebook', commented: 'facebook' })[input.status] || 'manual' });
    find.status = input.status;
  }
  buyers[index] = Object.assign({}, buyers[index], { assistant_find: find });
  let updated = activity.assign(Object.assign({}, store, { buyers }), 'buyer', id);
  const start = (store.buyers[index].assistant_find.history || []).length;
  (find.history || []).slice(start).forEach((entry, offset) => {
    const type = entry.kind === 'approval' ? entry.to : ({ messaged: 'message_sent', emailed: 'email_sent', replied: 'reply_received' })[entry.to] || 'status_change';
    updated = activity.recordEvent(updated, 'buyer', id, type, 'Operator recorded ' + entry.to + '.', { now, operatorId }, { channel: entry.channel, attribution: 'operator_report', history_origin: 'buyer:' + id + ':' + (start + offset) });
  });
  if (draft !== undefined) updated = activity.recordEvent(updated, 'buyer', id, 'message_drafted', 'Draft saved; not sent.', { now, operatorId });
  return updated;
}

function listFinds(store, { now }) {
  const items = (store.buyers || []).filter((buyer) => buyer.assistant_find).map((buyer) => ({
    id: buyer.id, ...buyer.assistant_find, record_ref: activity.reference(buyer), email_subject: buyer.record_ref ? '[' + buyer.record_ref + '] Buyer enquiry' : '',
    trust_label: buyer.assistant_find.approval === 'approved' ? 'Verified source - approved by operator' : 'Imported - not verified',
    fits: fitSummary(buyer, store.leads || [])
  })).sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at) || a.id.localeCompare(b.id));
  const week = new Date(now);
  week.setUTCHours(0, 0, 0, 0);
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  const weekStart = week.getTime();
  return { items, counts: {
    total: items.length,
    new_today: items.filter((item) => item.first_seen_at.slice(0, 10) === now.slice(0, 10)).length,
    messaged_this_week: items.filter((item) => (item.history || []).some((event) => event.to === 'messaged' && Date.parse(event.at) >= weekStart && event.at <= now)).length
  } };
}

module.exports = { STATUSES, MAX_ITEMS, MAX_ITEM_BYTES, MAX_REQUEST_BYTES, validateItems, ingest, update, listFinds };
