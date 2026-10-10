'use strict';

const crypto = require('crypto');
const eligibility = require('../research/operational-lead-eligibility');
const COLLECTIONS = { deal: 'reviewed_deals', lead: 'leads', buyer: 'buyers', match: 'record_matches' };
const DEFAULT_ASSIGN_KINDS = ['buyer', 'deal', 'match'];
const DEAL_REFERENCE_FLOOR = 1030;
const STATE_CODES = 'AL AK AZ AR CA CO CT DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY DC AS GU MP PR VI XX'.split(' ');
function referenceSequences(store) {
  const sequences = { ...(store.record_reference_sequences || {}) };
  for (const value of Object.values(sequences)) if (!Number.isSafeInteger(value) || value < 0 || value > 9999) fail('find_ref_sequence_invalid', 409);
  for (const code of STATE_CODES) sequences['WOS-' + code] = Math.max(DEAL_REFERENCE_FLOOR, Number(sequences['WOS-' + code] || 0));
  for (const prefix of Object.keys(sequences)) if (/^WOS-[A-Z]{2}$/.test(prefix)) sequences[prefix] = Math.max(DEAL_REFERENCE_FLOOR, Number(sequences[prefix] || 0));
  return sequences;
}
function sequenceFloorStatus(store) {
  const sequences = store.record_reference_sequences || {};
  const prefixes = new Set(STATE_CODES.map(state => 'WOS-' + state));
  Object.keys(sequences).filter(prefix => /^WOS-[A-Z]{2}$/.test(prefix)).forEach(prefix => prefixes.add(prefix));
  const values = [...prefixes].map(prefix => sequences[prefix]);
  return { namespaces: prefixes.size, reserved: values.filter(value => Number.isSafeInteger(value) && value >= DEAL_REFERENCE_FLOOR).length, minimum: values.every(value => Number.isSafeInteger(value)) ? Math.min(...values) : null };
}
const TYPES = ['found', 'imported', 'approved', 'rejected', 'status_change', 'message_drafted', 'message_sent', 'email_drafted', 'email_sent', 'reply_received', 'bounce', 'call_note', 'jv_generated', 'document_added', 'expired', 'interaction_reported', 'reference_assigned', 'source_rechecked', 'conversation_updated'];
function fail(code, status = 400) { const e = new Error(code); e.code = code; e.status = status; throw e; }
function text(v, max = 2000) { if (v == null) return ''; if (typeof v !== 'string' || v.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)) fail('find_activity_invalid'); return v.trim(); }
function ref(v) { v = text(v, 20).toUpperCase(); if (v && !/^(?:WOS-[A-Z]{2}|BUY|M)-\d{4}$/.test(v)) fail('find_ref_invalid'); return v; }
function records(store) { return Object.entries(COLLECTIONS).flatMap(([kind, key]) => (store[key] || []).map(record => ({ kind, record }))); }
function reference(record) { return record.record_ref || record.reference_id || record.lead_reference_id || ''; }
function canonicalLegacy(kind, record) { const value = String(reference(record)).toUpperCase(); return (kind === 'buyer' ? /^BUY-\d{4}$/ : kind === 'match' ? /^M-\d{4}$/ : /^WOS-[A-Z]{2}-\d{4}$/).test(value) ? value : ''; }
function namespace(kind, record) { const state = String(record.state || '').toUpperCase(); return kind === 'buyer' ? 'BUY' : kind === 'match' ? 'M' : 'WOS-' + (/^[A-Z]{2}$/.test(state) ? state : 'XX'); }
function assign(store, kind, id, requested = '') {
  const key = COLLECTIONS[kind]; const rows = (store[key] || []).slice(); const index = rows.findIndex(r => String(r.id) === String(id));
  if (!key || index < 0) fail('find_ref_record_missing', 404);
  const record = rows[index]; const supplied = ref(requested); const prefix = namespace(kind, record);
  if (record.record_ref) { if (supplied && supplied !== record.record_ref) fail('find_ref_conflict', 409); return store; }
  if (supplied && !supplied.startsWith(prefix + '-')) fail('find_ref_kind_mismatch');
  const all = records(store); const used = new Set(all.filter(r => r.kind !== kind || String(r.record.id) !== String(id)).map(r => canonicalLegacy(r.kind,r.record)).filter(Boolean));
  const legacy = canonicalLegacy(kind,record);
  if (legacy && supplied && legacy !== supplied) fail('find_ref_conflict',409);
  const sequences = referenceSequences(store);
  let number = [...used].reduce((n, r) => r.startsWith(prefix + '-') ? Math.max(n, Number(r.slice(prefix.length + 1))) : n, Number(sequences[prefix] || (prefix.startsWith('WOS-') ? DEAL_REFERENCE_FLOOR : 0)));
  const next = supplied || legacy || prefix + '-' + String(number + 1).padStart(4, '0');
  if (used.has(next)) fail('find_ref_conflict', 409);
  if (!supplied && !legacy && number >= 9999) fail('find_ref_exhausted', 409);
  const issuedPrefix = next.slice(0,next.lastIndexOf('-')); number = Math.max(Number(sequences[issuedPrefix] || 0),Number(next.slice(-4)));
  rows[index] = { ...record, record_ref: next };
  return { ...store, [key]: rows, record_reference_sequences: { ...sequences, [issuedPrefix]: number } };
}
function actor(store, operatorId) { if (!operatorId) fail('find_activity_actor_required'); return (store.users || []).find(u => u.id === operatorId)?.name || String(operatorId); }
function append(store, entry, { now, operatorId, actorLabel, channel }) {
  if (!TYPES.includes(entry.type)) fail('find_activity_type_invalid');
  const sequence = (store.activities || []).reduce((n, a) => Math.max(n, Number(a.record_sequence || 0)), Number(store.record_activity_sequence || 0)) + 1;
  const row = { activity_id: 'LOG-' + sequence, record_sequence: sequence, ts: now, who: actorLabel || actor(store, operatorId), operator_id: operatorId,
    type: entry.type, channel: entry.channel || channel || 'dashboard', deal_ref: '', buyer_ref: '', match_ref: '', summary: '', ...entry };
  Object.assign(row, { created_at: row.ts, created_by: operatorId, note: row.summary });
  return { ...store, activities: (store.activities || []).concat(row), record_activity_sequence: sequence };
}
function recordEvent(store, kind, id, type, summary, context, extra = {}) {
  const record = (store[COLLECTIONS[kind]] || []).find(r => String(r.id) === String(id));
  if (!record) fail('find_activity_record_missing', 404);
  const links = kind === 'buyer' ? { buyer_id: id, buyer_ref: reference(record) } : kind === 'match' ? { match_id: id, match_ref: reference(record), deal_id:record.deal_id,buyer_id:record.buyer_id,deal_ref: record.deal_ref, buyer_ref: record.buyer_ref } : { deal_id: id, deal_ref: reference(record), ...(kind === 'lead' ? { lead_id: id } : {}) };
  return append(store, { ...links, type, summary, ...extra }, context);
}
function assignOnAction(store, kind, id, context) {
  const updated = assign(store, kind, id);
  return updated === store ? store : recordEvent(updated, kind, id, 'reference_assigned', 'Reference assigned; facts and workflow unchanged.', context);
}
function assertBoundedReferenceChanges(before, after) {
  const mutable = new Set(['buyers', 'reviewed_deals', 'record_matches', 'record_reference_sequences', 'activities', 'record_activity_sequence']);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!mutable.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key])) fail('find_ref_preservation_failed', 409);
  }
  for (const key of ['buyers', 'reviewed_deals', 'record_matches']) {
    const old = before[key] || []; const current = after[key] || [];
    if (old.length !== current.length) fail('find_ref_preservation_failed', 409);
    old.forEach((row, index) => {
      const { record_ref: previousRef, ...facts } = row;
      const { record_ref: currentRef, ...currentFacts } = current[index];
      if (JSON.stringify(facts) !== JSON.stringify(currentFacts) || previousRef && previousRef !== currentRef) fail('find_ref_preservation_failed', 409);
    });
  }
  const history = before.activities || []; const currentHistory = after.activities || [];
  if (JSON.stringify(currentHistory.slice(0, history.length)) !== JSON.stringify(history) || currentHistory.slice(history.length).some(row => row.type !== 'reference_assigned' || row.lead_id)) fail('find_ref_preservation_failed', 409);
}
function assignMissing(store, context, kinds = DEFAULT_ASSIGN_KINDS) {
  if (!Array.isArray(kinds) || !kinds.length || new Set(kinds).size !== kinds.length || kinds.some(kind => !COLLECTIONS[kind])) fail('find_ref_kinds_invalid');
  const selected = new Set(kinds);
  const used = new Set(); const sequences = referenceSequences(store);
  const all = records(store);
  for (const { kind, record } of all) if (record.record_ref || canonicalLegacy(kind,record)) {
    const value = ref(record.record_ref || canonicalLegacy(kind,record)); if (used.has(value)) fail('find_ref_conflict', 409); used.add(value);
    const prefix = value.slice(0, value.lastIndexOf('-')); sequences[prefix] = Math.max(Number(sequences[prefix] || 0), Number(value.slice(-4)));
  }
  const result = { ...store, record_reference_sequences: sequences }; const additions = []; let count = 0;
  const counts = Object.fromEntries(kinds.map(kind => [kind, 0]));
  let sequence = (store.activities || []).reduce((n, a) => Math.max(n, Number(a.record_sequence || 0)), Number(store.record_activity_sequence || 0));
  const who = actor(store, context.operatorId);
  for (const [kind, key] of Object.entries(COLLECTIONS)) {
    if (!selected.has(kind)) continue;
    result[key] = (store[key] || []).map(record => {
    if (!record.id || record.record_ref) return record;
    const prefix = namespace(kind, record); const legacy = canonicalLegacy(kind,record); const next = Number(sequences[prefix] || 0) + 1;
    if (!legacy && next > 9999) fail('find_ref_exhausted', 409);
    const value = legacy || prefix + '-' + String(next).padStart(4, '0'); if (!legacy) sequences[prefix] = next; count++; counts[kind]++; sequence++;
    const links = kind === 'buyer' ? { buyer_id: record.id, buyer_ref: value } : kind === 'match' ? { match_id: record.id, match_ref: value, deal_ref: record.deal_ref, buyer_ref: record.buyer_ref } : { deal_id: record.id, deal_ref: value, ...(kind === 'lead' ? { lead_id: record.id } : {}) };
    additions.push({ activity_id:'LOG-'+sequence,record_sequence:sequence,ts:context.now,created_at:context.now,created_by:context.operatorId,who,operator_id:context.operatorId,type:'reference_assigned',channel:'dashboard',deal_ref:'',buyer_ref:'',match_ref:'',summary:'Reference assigned; facts and workflow unchanged.',note:'Reference assigned; facts and workflow unchanged.',...links });
    return { ...record, record_ref: value };
    });
  }
  if (!count) return { store: JSON.stringify(sequences) === JSON.stringify(store.record_reference_sequences || {}) ? store : result, count: 0, counts };
  result.activities = (store.activities || []).concat(additions); result.record_activity_sequence = sequence;
  return { store: result, count, counts };
}
function matchId(dealId, buyerId) { return crypto.createHash('sha256').update(JSON.stringify([String(dealId), String(buyerId)])).digest('hex'); }
function matchReference(store, dealId, buyerId) { return (store.record_matches || []).find(m => m.id === matchId(dealId, buyerId))?.record_ref || ''; }
function registerMatch(store, dealId, buyerId, context) {
  const id = matchId(dealId, buyerId);
  if ((store.record_matches || []).some(r => r.id === id)) return store;
  const deal = (store.reviewed_deals || []).find(r => r.id === dealId); const buyer = (store.buyers || []).find(r => r.id === buyerId);
  if (!deal || !buyer) fail('find_activity_record_missing', 404);
  let result = { ...store, record_matches: (store.record_matches || []).concat({ id, deal_id: dealId, buyer_id: buyerId, deal_ref: reference(deal), buyer_ref: reference(buyer) }) };
  result = assign(result, 'match', id);
  return recordEvent(result, 'match', id, 'found', 'Buyer criteria match recorded; not a commitment or offer.', context);
}
function validateInteraction(input, now) {
  if (Buffer.byteLength(JSON.stringify(input || {})) > 8192) fail('find_item_too_large', 413);
  const allowed = ['kind', 'ts', 'who', 'channel', 'dir', 'with', 'ref', 'summary', 'type', 'body'];
  if (!input || input.kind !== 'interaction' || Object.keys(input).some(k => !allowed.includes(k))) fail('find_interaction_invalid');
  const ts = text(input.ts, 40); const time = Date.parse(ts);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(ts) || !Number.isFinite(time) || new Date(ts).toISOString().slice(0, 10) !== ts.slice(0, 10) || time > Date.parse(now) + 300000) fail('find_interaction_date_invalid');
  const type = input.type || 'interaction_reported';
  if (!TYPES.includes(type) || !['in', 'out', 'note'].includes(input.dir)) fail('find_interaction_invalid');
  const result = { kind: 'interaction', ts: new Date(ts).toISOString(), who: text(input.who, 120), channel: text(input.channel, 30), dir: input.dir, with: text(input.with, 500), ref: ref(input.ref), summary: text(input.summary, 2000), type, body: text(input.body, 4000) };
  if (!result.ref || !result.who || !result.channel || !result.summary) fail('find_interaction_invalid');
  return result;
}
function importInteraction(store, item, context) {
  const targets = records(store).filter(r => reference(r.record) === item.ref);
  if (targets.length !== 1) fail('find_interaction_ref_unknown', 409);
  const digest = crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex');
  if ((store.activities || []).some(a => a.import_digest === digest)) return { store, results: [{ id: digest, result: 'duplicate' }] };
  const target = targets[0]; const result = recordEvent(store, target.kind, target.record.id, item.type, item.summary, context, {
    ts: item.ts, who: item.who, channel: item.channel, direction: item.dir, with: item.with, body: item.body, import_digest: digest, attribution: 'imported_report', recorded_at: context.now
  });
  return { store: result, results: [{ id: digest, result: 'created' }] };
}
function listActivity(store, { reference: query = '', type = '', from = '', to = '', fromTs = '', toTs = '', limit = 50, recordKind = '', recordId = '' } = {}) {
  const leadRefs = new Map((store.leads || []).map(r => [String(r.id),reference(r)]));
  const dealRefs = new Map((store.reviewed_deals || []).map(r => [String(r.id),reference(r)]));
  const buyerRefs = new Map((store.buyers || []).map(r => [String(r.id),reference(r)]));
  const source = (store.activities || []).map(a => ({ ...a, type: typeof a.type === 'string' ? a.type : 'historical_note', ts: String(a.ts || a.created_at || ''), who: a.who || a.created_by || 'Not recorded', deal_ref:a.deal_ref || leadRefs.get(String(a.lead_id)) || dealRefs.get(String(a.deal_id)) || '', buyer_ref:a.buyer_ref || buyerRefs.get(String(a.buyer_id)) || '', summary: a.summary || [a.note, a.outcome].filter(Boolean).join(' | '), channel: a.channel || 'Not recorded', attribution: a.attribution || (a.record_sequence ? 'recorded_action' : 'legacy_record') }));
  // Legacy card histories remain visible without a read-time migration or deletion.
  for (const { kind, record } of records(store)) {
    if (recordKind && (kind !== recordKind || String(record.id) !== String(recordId))) continue;
    const history = kind === 'buyer' ? record.assistant_find?.history || [] : record.history || [];
    history.forEach((h, index) => {
      const origin = kind + ':' + record.id + ':' + index;
      if (source.some(a => a.history_origin === origin)) return;
      source.push({ activity_id: 'LEGACY-' + origin, ts: h.at || '', who: h.operator_id || 'Not recorded', type: h.kind === 'approval' ? h.to : 'status_change', channel: h.channel || 'Not recorded', deal_id: kind === 'deal' ? record.id : '', buyer_id: kind === 'buyer' ? record.id : '', deal_ref: kind === 'deal' ? reference(record) : '', buyer_ref: kind === 'buyer' ? reference(record) : '', summary: [h.to, h.reason].filter(Boolean).join(' | '), attribution: 'legacy_card_history' });
    });
  }
  const items = source.filter(a => (!query || [a.deal_ref, a.buyer_ref, a.match_ref].includes(query)) && (!type || a.type === type) && (!from || a.ts.slice(0, 10) >= from) && (!to || a.ts.slice(0, 10) <= to) && (!fromTs || Date.parse(a.ts) >= Date.parse(fromTs)) && (!toTs || Date.parse(a.ts) <= Date.parse(toTs)) && (!recordKind || String(a[recordKind === 'buyer' ? 'buyer_id' : recordKind === 'lead' ? 'lead_id' : recordKind === 'match' ? 'match_id' : 'deal_id']) === String(recordId)));
  items.sort((a, b) => b.ts.localeCompare(a.ts) || String(b.activity_id).localeCompare(String(a.activity_id)));
  return { total: items.length, items: items.slice(0, Math.min(100, Math.max(1, Number(limit) || 50))).map(({ body, with: contact, import_digest, ...display }) => display) };
}
function search(store, query) {
  const q = text(query, 80).toLowerCase(); if (q.length < 2) return [];
  return records(store).filter(({ record: r }) => [reference(r), r.reference_id, r.lead_reference_id, r.city, r.zip, r.assistant_find?.areas?.join(' ')].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 50).map(({ kind, record: r }) => ({ kind, id: r.id, ref: reference(r), deal_id:r.deal_id || '', city: r.city || '', zip: r.zip || '', label: kind === 'buyer' ? r.name : kind === 'match' ? 'Buyer criteria match' : kind === 'lead' && !eligibility.verifiedPropertyAddress(r) ? 'Stored record - address needs source proof' : r.address || r.normalized_address || 'Address not established', assistant_find: !!r.assistant_find }));
}
module.exports = { TYPES, ref, reference, assign, assignOnAction, assignMissing, assertBoundedReferenceChanges, sequenceFloorStatus, recordEvent, append, matchReference, registerMatch, validateInteraction, importInteraction, listActivity, search };
