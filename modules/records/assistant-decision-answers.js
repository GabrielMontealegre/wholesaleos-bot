'use strict';
const crypto = require('node:crypto');
const { latestSnapshot } = require('./assistant-snapshot');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const FIELDS = ['id', 'source_kind', 'operator_id', 'snapshot_id', 'item_id', 'choice', 'note', 'answered_at', 'request_id'];
function fail(code, status = code === 'store_invalid' ? 503 : 400) { throw Object.assign(Error('assistant_answer_' + code), { code: 'assistant_answer_' + code, status }); }
function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== fields.length ||
      fields.some(key => !Object.hasOwn(value, key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) fail('fields_invalid');
}
function actor(value) { if (typeof value !== 'string' || !value || value.trim() !== value || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) fail('actor_required', 403); }
function time(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail('clock_invalid');
  const at = Date.parse(value);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 19) !== value.slice(0, 19)) fail('clock_invalid');
  return at;
}
function inputFields(input) {
  exact(input, ['snapshot_id', 'item_id', 'choice', 'note', 'request_id']);
  if (typeof input.snapshot_id !== 'string' || !HASH.test(input.snapshot_id) || typeof input.item_id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(input.item_id) ||
      !['A', 'B', 'C'].includes(input.choice) || typeof input.note !== 'string' || input.note.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(input.note) ||
      typeof input.request_id !== 'string' || !UUID.test(input.request_id)) fail('field_invalid');
}
function answerId(operatorId, requestId) {
  actor(operatorId);
  if (typeof requestId !== 'string' || !UUID.test(requestId)) fail('field_invalid');
  return crypto.createHash('sha256').update(JSON.stringify(['assistant-decision-answer-v1', operatorId, requestId])).digest('hex');
}
function context(store, { operatorId, now }) {
  actor(operatorId); const clock = time(now);
  let latest;
  try { latest = latestSnapshot(store, { operatorId, now }); } catch (_) { fail('store_invalid'); }
  const descriptor = Object.getOwnPropertyDescriptor(store, 'assistant_decision_answers');
  if (descriptor && !Object.hasOwn(descriptor, 'value')) fail('store_invalid');
  const rows = descriptor ? descriptor.value : [];
  if (!Array.isArray(rows) || Reflect.ownKeys(rows).length !== rows.length + 1) fail('store_invalid');
  const snapshots = new Map((store.assistant_snapshots || []).map(row => [row.id, row])), ids = new Set();
  let previousTime = -Infinity;
  for (let index = 0; index < rows.length; index++) {
    const field = Object.getOwnPropertyDescriptor(rows, String(index));
    if (!field || !Object.hasOwn(field, 'value')) fail('store_invalid');
    const row = field.value;
    try {
      exact(row, FIELDS); actor(row.operator_id);
      inputFields({ snapshot_id: row.snapshot_id, item_id: row.item_id, choice: row.choice, note: row.note, request_id: row.request_id });
      const source = snapshots.get(row.snapshot_id), at = time(row.answered_at);
      if (row.source_kind !== 'owner_decision_answer' || row.id !== answerId(row.operator_id, row.request_id) || ids.has(row.id) ||
          at > clock || at < previousTime || !source || source.operator_id !== row.operator_id || source.snapshot.version !== 2 ||
          at < time(source.imported_at) || !source.snapshot.open_items.some(item => item.id === row.item_id)) fail('store_invalid');
      ids.add(row.id); previousTime = at;
    } catch (_) { fail('store_invalid'); }
  }
  return { latest, rows, clock };
}
function appendAnswer(store, input, options = {}) {
  actor(options.operatorId); inputFields(input);
  const { latest, rows, clock } = context(store, options), id = answerId(options.operatorId, input.request_id);
  const previous = rows.find(row => row.id === id);
  if (previous) {
    if (['snapshot_id', 'item_id', 'choice', 'note', 'request_id'].some(key => previous[key] !== input[key])) fail('request_conflict', 409);
    return store;
  }
  if (!latest || latest.id !== input.snapshot_id || latest.snapshot.version !== 2 || !latest.snapshot.open_items.some(item => item.id === input.item_id)) fail('snapshot_stale', 409);
  const answer = { id, source_kind: 'owner_decision_answer', operator_id: options.operatorId, snapshot_id: latest.id,
    item_id: input.item_id, choice: input.choice, note: input.note, answered_at: new Date(clock).toISOString(), request_id: input.request_id };
  return { ...store, assistant_decision_answers: rows.concat(answer) };
}
function publicAnswer(row) {
  return { id: row.id, snapshot_id: row.snapshot_id, item_id: row.item_id, choice: row.choice, note: row.note, answered_at: row.answered_at };
}
function readAnswers(store, { operatorId, now, after = null, limit = 100 } = {}) {
  const { rows } = context(store, { operatorId, now });
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || after !== null && (typeof after !== 'string' || !HASH.test(after))) fail('query_invalid');
  const owned = rows.filter(row => row.operator_id === operatorId), index = after === null ? -1 : owned.findIndex(row => row.id === after);
  if (after !== null && index < 0) fail('query_invalid');
  const selected = owned.slice(index + 1, index + 1 + limit), more = index + 1 + selected.length < owned.length;
  return { items: selected.map(publicAnswer), next_after: more ? selected[selected.length - 1].id : null };
}
module.exports = { appendAnswer, readAnswers, answerId, publicAnswer };
