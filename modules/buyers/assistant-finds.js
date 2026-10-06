'use strict';

const STATUSES = Object.freeze(['new', 'messaged', 'replied', 'not_a_fit']);
const MAX_ITEMS = 25;
const MAX_ITEM_BYTES = 8192;
const MAX_REQUEST_BYTES = 128 * 1024;
const ITEM_FIELDS = new Set(['name', 'platform', 'group_name', 'group_id', 'profile_url', 'source_url',
  'what_they_buy', 'deal_type', 'states', 'areas', 'email', 'phone', 'drafted_message', 'captured_at']);

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

function validateItems(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'items')) fail('find_request_invalid');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_REQUEST_BYTES) fail('find_request_too_large', 413);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > MAX_ITEMS) fail('find_item_limit');
  return body.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !ITEM_FIELDS.has(key))) fail('find_item_invalid');
    if (Buffer.byteLength(JSON.stringify(item)) > MAX_ITEM_BYTES) fail('find_item_too_large', 413);
    if (item.platform !== 'facebook' || !['house', 'land'].includes(item.deal_type)) fail('find_type_invalid');
    const groupId = text(item.group_id, 30, true);
    if (!/^\d+$/.test(groupId)) fail('find_group_invalid');
    const profile = facebookUrl(item.profile_url, groupId, 'profile');
    const source = facebookUrl(item.source_url, groupId, 'source');
    const captured = text(item.captured_at, 40, true);
    const at = Date.parse(captured);
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(captured) || !Number.isFinite(at) || at > Date.parse(now) + 300000) fail('find_capture_date_invalid');
    const states = list(item.states, 20, 2).map((value) => value.toUpperCase());
    if (states.some((value) => !/^[A-Z]{2}$/.test(value))) fail('find_state_invalid');
    const email = text(item.email, 254);
    const phone = text(item.phone, 40);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('find_contact_invalid');
    if (phone && !/^[+\d().\-\s]{7,40}$/.test(phone)) fail('find_contact_invalid');
    return {
      name: text(item.name, 120, true), platform: 'facebook', uid: profile.uid,
      group_name: text(item.group_name, 200, true), group_id: groupId,
      profile_url: profile.url, source_url: source.url,
      what_they_buy: text(item.what_they_buy, 500, true), deal_type: item.deal_type,
      states, areas: list(item.areas, 20, 80), email, phone,
      drafted_message: text(item.drafted_message, 600, true), captured_at: new Date(at).toISOString()
    };
  });
}

function ingest(store, items, { now, operatorId, createId }) {
  const buyers = Array.isArray(store.buyers) ? store.buyers.slice() : [];
  const results = [];
  for (const item of items) {
    const index = buyers.findIndex((buyer) => buyer.assistant_find && buyer.assistant_find.platform === item.platform && buyer.assistant_find.uid === item.uid);
    if (index >= 0) {
      buyers[index] = Object.assign({}, buyers[index], {
        assistant_find: Object.assign({}, buyers[index].assistant_find, { last_seen_at: now })
      });
      results.push({ id: buyers[index].id, result: 'duplicate' });
      continue;
    }
    const id = createId();
    buyers.push({
      id, name: item.name, status: 'Unverified', verified: false,
      source: 'assistant: Facebook post', source_url: item.source_url,
      created: now, created_by: operatorId,
      assistant_find: Object.assign({}, item, {
        status: 'new', first_seen_at: now, last_seen_at: now,
        consent: { profile: 'public want posted; not contacted', email: 'public want posted; not contacted', phone: 'public want posted; not contacted' },
        history: []
      })
    });
    results.push({ id, result: 'created' });
  }
  return { store: Object.assign({}, store, { buyers }), results };
}

function update(store, id, input, { now, operatorId }) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length ||
      Object.keys(input).some((key) => !['status', 'drafted_message'].includes(key))) fail('find_update_invalid');
  if (input.status !== undefined && !STATUSES.includes(input.status)) fail('find_status_invalid');
  const draft = input.drafted_message === undefined ? undefined : text(input.drafted_message, 600, true);
  const buyers = (store.buyers || []).slice();
  const index = buyers.findIndex((buyer) => buyer.id === id && buyer.assistant_find);
  if (index < 0) fail('find_not_found', 404);
  const find = Object.assign({}, buyers[index].assistant_find);
  if (draft !== undefined) Object.assign(find, { drafted_message: draft, draft_updated_at: now, draft_updated_by: operatorId });
  if (input.status !== undefined && input.status !== find.status) {
    find.history = (find.history || []).concat({ from: find.status, to: input.status, at: now, operator_id: operatorId });
    find.status = input.status;
  }
  buyers[index] = Object.assign({}, buyers[index], { assistant_find: find });
  return Object.assign({}, store, { buyers });
}

function listFinds(store, { now }) {
  const items = (store.buyers || []).filter((buyer) => buyer.assistant_find).map((buyer) => ({
    id: buyer.id, ...buyer.assistant_find,
    trust_label: 'Found by assistant from a public post - not verified'
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
