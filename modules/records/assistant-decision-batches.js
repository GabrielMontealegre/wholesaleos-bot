'use strict';
const { latestSnapshot } = require('./assistant-snapshot');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const RECEIPT = /^[a-f0-9]{64}$/;
const INPUT = ['request_id', 'round', 'revision', 'submitted_at', 'overall_note', 'choices'];
function fail(code, status = 400) { throw Object.assign(Error('assistant_batch_' + code), { code: 'assistant_batch_' + code, status }); }
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('fields_invalid');
  const own = Reflect.ownKeys(value);
  if (keys && (own.length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))) fail('fields_invalid');
  if (own.some(key => typeof key !== 'string' || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) fail('fields_invalid');
}
function array(value, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail('array_invalid');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) || {}, 'value')) fail('array_invalid');
}
function actor(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) fail('actor_required', 403);
}
function time(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail('time_invalid');
  const at = Date.parse(value);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 19) !== value.slice(0, 19)) fail('time_invalid');
  return at;
}
function note(value, max) {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(value)) fail('note_invalid');
}
function copy(input) {
  return { request_id: input.request_id, round: input.round, revision: input.revision, submitted_at: input.submitted_at,
    overall_note: input.overall_note, choices: input.choices.map(choice => ({ id: choice.id, choice: choice.choice,
      choice_label: choice.choice_label, note: choice.note, from_voice: choice.from_voice })) };
}
function validate(input, receipt, acceptedAt) {
  record(input, INPUT);
  if (typeof input.request_id !== 'string' || !UUID.test(input.request_id) || typeof input.round !== 'string' || !RECEIPT.test(input.round) ||
      !Number.isSafeInteger(input.revision) || input.revision < 0 || input.revision >= Number.MAX_SAFE_INTEGER) fail('field_invalid');
  if (!receipt || receipt.snapshot.version !== 2 || receipt.id !== input.round) fail('round_stale', 409);
  const submitted = time(input.submitted_at);
  if (submitted < time(receipt.imported_at) || submitted > time(acceptedAt)) fail('time_invalid');
  note(input.overall_note, 4000); array(input.choices, 100);
  const ids = new Set();
  for (const row of input.choices) {
    record(row, ['id', 'choice', 'choice_label', 'note', 'from_voice']);
    if (typeof row.id !== 'string' || ids.has(row.id)) fail('choice_invalid');
    ids.add(row.id);
    const item = receipt.snapshot.open_items.find(item => item.id === row.id);
    if (!item) fail('choice_invalid');
    note(row.note, 2000);
    // Voice evidence is not present in the current snapshot contract.
    if (row.from_voice !== false) fail('voice_unverified');
    if (row.choice === null) {
      if (row.choice_label !== null || !row.note.trim()) fail('choice_invalid');
    } else if (!['A', 'B', 'C'].includes(row.choice) || row.choice_label !== item.options[row.choice].label) fail('choice_invalid');
  }
  if (!input.choices.length && !input.overall_note.trim()) fail('empty_batch');
  return copy(input);
}
function context(store, options) {
  actor(options.operatorId); const clock = time(options.now);
  let latest, rows;
  try {
    record(store);
    latest = latestSnapshot(store, options);
    rows = Object.hasOwn(store, 'assistant_decision_batches') ? store.assistant_decision_batches : [];
    array(rows, 10000);
    const seen = new Map(), revisions = new Map(); let previousAt = -Infinity;
    for (const row of rows) {
      record(row, ['operator_id', 'revision', 'accepted_at', 'input']); actor(row.operator_id);
      const at = time(row.accepted_at);
      if (at > clock || at < previousAt) fail('store_invalid');
      previousAt = at;
      record(row.input, INPUT);
      const receipt = (store.assistant_snapshots || []).find(receipt => receipt.id === row.input.round && receipt.operator_id === row.operator_id);
      validate(row.input, receipt, row.accepted_at);
      const key = JSON.stringify([row.operator_id, row.input.round]), revision = revisions.get(key) || 0;
      const requests = seen.get(row.operator_id) || new Set();
      if (requests.has(row.input.request_id) || row.input.revision !== revision || row.revision !== revision + 1) fail('store_invalid');
      requests.add(row.input.request_id); seen.set(row.operator_id, requests); revisions.set(key, row.revision);
    }
  } catch (_) { fail('store_invalid', 503); }
  return { latest, rows, clock };
}
function appendBatch(store, input, options = {}) {
  const { latest, rows, clock } = context(store, options);
  record(input, INPUT);
  // Recover identical UUIDs before requiring the currently active round.
  const previous = rows.find(row => row.operator_id === options.operatorId && row.input.request_id === input.request_id);
  if (previous) {
    const receipt = store.assistant_snapshots.find(row => row.id === previous.input.round && row.operator_id === options.operatorId);
    const normalized = validate(input, receipt, options.now);
    if (JSON.stringify(normalized) !== JSON.stringify(copy(previous.input))) fail('request_conflict', 409);
    return store;
  }
  const normalized = validate(input, latest, options.now);
  const owned = rows.filter(row => row.operator_id === options.operatorId && row.input.round === input.round);
  const revision = owned.length ? owned[owned.length - 1].revision : 0;
  if (input.revision !== revision) fail('revision_conflict', 409);
  if (rows.length >= 10000) fail('capacity_reached', 409);
  const row = { operator_id: options.operatorId, revision: revision + 1, accepted_at: new Date(clock).toISOString(), input: normalized };
  return { ...store, assistant_decision_batches: rows.concat(row) };
}
function readBatches(store, options = {}) {
  const { rows } = context(store, options);
  const limit = options.limit === undefined ? 100 : options.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('query_invalid');
  return rows.filter(row => row.operator_id === options.operatorId).slice(-limit).map(row => ({
    revision: row.revision, accepted_at: row.accepted_at, batch: copy(row.input)
  }));
}
module.exports = { appendBatch, readBatches };
