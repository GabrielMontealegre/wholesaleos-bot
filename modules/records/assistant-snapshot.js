'use strict';
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const MAX_BYTES = 1024 * 1024;
const STAGES = ['finding_buyer', 'offer_out', 'under_contract', 'buyer_assigned', 'closed', 'dead'];
const MONEY = ['ask', 'seller_number', 'our_offer', 'target', 'value_fixed', 'repairs', 'buyer_number', 'fee_estimate_low', 'fee_estimate_high'];
const REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function fail(code, status = code === 'store_invalid' ? 503 : 400) { throw Object.assign(Error('assistant_snapshot_' + code), { code: 'assistant_snapshot_' + code, status }); }
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key))) fail('fields_invalid');
}
function text(value, max = 500, { nullable = false, multiline = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(value) ||
      /[\u202a-\u202e\u2066-\u2069]/.test(value)) fail('field_invalid');
}
function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) fail('id_invalid'); }
function validActor(value) { return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value); }
function requestReceiptId(operatorId, requestId) {
  if (!validActor(operatorId)) fail('actor_required', 403);
  if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) fail('request_invalid');
  return crypto.createHash('sha256').update(JSON.stringify(['assistant_snapshot_transport_v1', operatorId, requestId])).digest('hex');
}
function time(value, limit = Infinity, code = 'date_invalid') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail(code);
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at > limit || new Date(at).toISOString().slice(0, 19) !== value.slice(0, 19)) fail(code);
  return at;
}
function day(value, limit, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(Date.parse(value)).toISOString().slice(0, 10) !== value || value > new Date(limit).toISOString().slice(0, 10)) fail('date_invalid');
}
function array(value, max, check) {
  if (!Array.isArray(value) || value.length > max) fail('array_invalid');
  for (let i = 0; i < value.length; i++) { if (!Object.hasOwn(value, i)) fail('array_invalid'); check(value[i]); }
}
function money(value) { if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)) fail('money_invalid'); }
function choice(value, choices, nullable = false) { if (!(nullable && value === null) && !choices.includes(value)) fail('field_invalid'); }
function sourceFile(value) {
  if (typeof value !== 'string' || value.length > 200 || !/^deal-brains\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/.test(value) || value.includes('..')) fail('source_file_invalid');
}
function sourceURL(value) {
  if (value === null) return;
  text(value, 2048);
  try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail('source_url_invalid'); }
  catch (_) { fail('source_url_invalid'); }
}
function validate(snapshot, now, { storedReplies = false } = {}) {
  object(snapshot, ['schema', 'version', 'generated_at', 'deals', 'buyers', 'texts', 'calls', 'emails_waiting']);
  if (snapshot.schema !== 'wos-assistant-snapshot') fail('schema_invalid');
  if (snapshot.version !== 1) fail('version_invalid');
  const generated = time(snapshot.generated_at, now, 'generated_at_invalid'), ids = new Set(), dealIds = new Set();
  function unique(value) { id(value); if (ids.has(value)) fail('duplicate_id'); ids.add(value); }
  function dealRef(value) { if (value !== null) { id(value); if (!dealIds.has(value)) fail('reference_invalid'); } }
  array(snapshot.deals, 1000, deal => {
    object(deal, ['id', 'name', 'stage', 'people', 'numbers', 'next_seller', 'next_buyer', 'needs_gabriel', 'updated_at', 'log', 'source_file']);
    unique(deal.id); dealIds.add(deal.id); text(deal.name, 300); choice(deal.stage, STAGES); sourceFile(deal.source_file);
    time(deal.updated_at, generated); text(deal.next_seller, 2000, { nullable: true, multiline: true });
    text(deal.next_buyer, 2000, { nullable: true, multiline: true }); text(deal.needs_gabriel, 2000, { nullable: true, multiline: true });
    array(deal.people, 100, person => { object(person, ['name', 'role', 'phone', 'email']); text(person.name, 200); text(person.role, 300); text(person.phone, 80, { nullable: true }); text(person.email, 320, { nullable: true }); });
    object(deal.numbers, MONEY);
    for (const key of MONEY.filter(key => key !== 'buyer_number')) money(deal.numbers[key]);
    object(deal.numbers.buyer_number, ['amount', 'buyer']); money(deal.numbers.buyer_number.amount); text(deal.numbers.buyer_number.buyer, 200, { nullable: true });
    if (deal.numbers.fee_estimate_low !== null && deal.numbers.fee_estimate_high !== null && deal.numbers.fee_estimate_low > deal.numbers.fee_estimate_high) fail('money_invalid');
    array(deal.log, 1000, event => { object(event, ['at', 'text']); if (typeof event.at === 'string' && event.at.length === 10) day(event.at, generated); else time(event.at, generated); text(event.text, 4000, { multiline: true }); });
  });
  array(snapshot.buyers, 1000, buyer => {
    if (storedReplies && buyer && ![Object.prototype, null].includes(Object.getPrototypeOf(buyer))) fail('fields_invalid');
    const reply = storedReplies && buyer && typeof buyer === 'object' && Object.hasOwn(buyer, 'last_reply_at');
    object(buyer, ['id', 'name', 'company', 'areas', 'buy_box', 'pof', 'approval', 'last_contact', 'deals_sent', 'phone', 'email', 'source_url', ...(reply ? ['last_reply_at'] : [])]);
    if (reply) {
      const descriptor = Object.getOwnPropertyDescriptor(buyer, 'last_reply_at');
      if (!Object.hasOwn(descriptor, 'value')) fail('field_invalid');
      time(descriptor.value, now);
    }
    unique(buyer.id); text(buyer.name, 200); text(buyer.company, 300, { nullable: true }); text(buyer.buy_box, 4000, { nullable: true, multiline: true });
    array(buyer.areas, 100, area => text(area, 200)); if (buyer.pof !== null && typeof buyer.pof !== 'boolean') fail('field_invalid');
    choice(buyer.approval, ['approved', 'pending', 'rejected'], true); day(buyer.last_contact, generated, true);
    const refs = new Set(); array(buyer.deals_sent, 1000, ref => { dealRef(ref); if (ref === null || refs.has(ref)) fail('reference_invalid'); refs.add(ref); });
    text(buyer.phone, 80, { nullable: true }); text(buyer.email, 320, { nullable: true }); sourceURL(buyer.source_url);
  });
  array(snapshot.texts, 1000, message => {
    object(message, ['id', 'to_name', 'role', 'phone', 'text', 'deal', 'status', 'drafted_at']); unique(message.id);
    text(message.to_name, 200); text(message.role, 300); text(message.phone, 80, { nullable: true }); text(message.text, 8000, { multiline: true });
    dealRef(message.deal); choice(message.status, ['drafted', 'sent', 'replied']); day(message.drafted_at, generated);
  });
  array(snapshot.calls, 1000, call => {
    object(call, ['name', 'role', 'phone', 'why', 'questions', 'deal', 'rank']); text(call.name, 200); text(call.role, 300); text(call.phone, 80, { nullable: true }); text(call.why, 2000, { multiline: true });
    array(call.questions, 3, question => text(question, 1000)); dealRef(call.deal); if (!Number.isSafeInteger(call.rank) || call.rank < 1) fail('rank_invalid');
  });
  array(snapshot.emails_waiting, 1000, message => {
    object(message, ['who', 'role', 'subject', 'deal', 'draft_ref', 'rank']); text(message.who, 200); text(message.role, 300); text(message.subject, 500);
    dealRef(message.deal); if (message.draft_ref !== null && (typeof message.draft_ref !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(message.draft_ref))) fail('reference_invalid');
    if (!Number.isSafeInteger(message.rank) || message.rank < 1) fail('rank_invalid');
  });
}
function decodeSnapshot(bytes, { now } = {}) {
  const clock = time(now, Infinity, 'clock_invalid');
  if (!Buffer.isBuffer(bytes) || !bytes.length) fail('file_invalid');
  if (bytes.length > MAX_BYTES) fail('file_too_large', 413);
  let snapshot;
  try { snapshot = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch (_) { fail('file_invalid'); }
  validate(snapshot, clock);
  return { snapshot, file_sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function receipts(store) {
  if (!store || typeof store !== 'object' || Array.isArray(store) || Reflect.ownKeys(store).some(key => typeof key !== 'string' || !Object.hasOwn(Object.getOwnPropertyDescriptor(store, key), 'value'))) fail('store_invalid', 503);
  const value = Object.hasOwn(store, 'assistant_snapshots') ? store.assistant_snapshots : undefined;
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail('store_invalid', 503);
  const seen = new Set(), fields = ['id', 'source_kind', 'imported_at', 'file_sha256', 'generated_at', 'filename', 'operator_id', 'snapshot'];
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) fail('store_invalid', 503);
    const row = value[index];
    if (!row || typeof row !== 'object' || Array.isArray(row) || Reflect.ownKeys(row).length !== fields.length ||
        fields.some(key => !Object.hasOwn(row, key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(row, key), 'value')) ||
        row.source_kind !== 'assistant_snapshot_import' || typeof row.id !== 'string' || !/^[a-f0-9]{64}$/.test(row.id) || seen.has(row.id) ||
        typeof row.file_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.file_sha256) ||
        !validActor(row.operator_id) ||
        typeof row.filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.json$/.test(row.filename) || row.filename.includes('..')) fail('store_invalid');
    // Read compatibility ships before a later writer accepts the additive D064 field.
    try { validate(row.snapshot, time(row.imported_at), { storedReplies: true }); if (row.generated_at !== row.snapshot.generated_at) fail('store_invalid'); }
    catch (_) { fail('store_invalid'); }
    seen.add(row.id);
  }
  return value;
}
function appendSnapshot(store, bytes, { now, operatorId, filename, requestId } = {}) {
  if (!validActor(operatorId)) fail('actor_required', 403);
  if (typeof filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.json$/.test(filename) || filename.includes('..')) fail('filename_invalid');
  const transportId = requestId === undefined ? null : requestReceiptId(operatorId, requestId);
  const previous = receipts(store), decoded = decodeSnapshot(bytes, { now }), imported_at = new Date(time(now)).toISOString();
  if (requestId !== undefined) {
    const prior = previous.find(row => row.id === transportId);
    if (prior) {
      if (prior.operator_id !== operatorId || prior.file_sha256 !== decoded.file_sha256 || prior.filename !== filename) fail('request_conflict', 409);
      return store;
    }
  }
  if (previous.some(row => time(row.imported_at, Infinity, 'store_invalid') > Date.parse(imported_at))) fail('clock_invalid', 409);
  const receipt = { id: transportId || crypto.createHash('sha256').update(JSON.stringify([previous.length, imported_at, operatorId, decoded.file_sha256])).digest('hex'),
    source_kind: 'assistant_snapshot_import', imported_at, file_sha256: decoded.file_sha256, generated_at: decoded.snapshot.generated_at, filename, operator_id: operatorId, snapshot: decoded.snapshot };
  return { ...store, assistant_snapshots: previous.concat(receipt) };
}
function latestSnapshot(store, { operatorId, now } = {}) {
  if (!validActor(operatorId)) fail('actor_required', 403);
  const clock = time(now, Infinity, 'clock_invalid');
  const rows = receipts(store).filter(row => row.operator_id === operatorId);
  if (rows.some(row => time(row.imported_at) > clock)) fail('store_invalid');
  return rows.length ? rows[rows.length - 1] : null;
}
module.exports = { decodeSnapshot, appendSnapshot, latestSnapshot, requestReceiptId, MAX_BYTES };
