'use strict';

const MONEY = ['ask', 'value_fixed', 'repairs', 'buyer_number', 'our_offer', 'fee_estimate_low', 'fee_estimate_high'];
function fail(code) { throw Object.assign(Error('assistant_snapshot_' + code), { code: 'assistant_snapshot_' + code, status: 400 }); }
function field(value, key) {
  const descriptor = value && Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('fields_invalid');
  return descriptor.value;
}
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== keys.length) fail('fields_invalid');
  for (const key of keys) field(value, key);
}
function text(value, max = 500, nullable = false, multiline = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(value) || /[\u202a-\u202e\u2066-\u2069]/.test(value)) fail('field_invalid');
}
function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) fail('id_invalid'); }
function list(value, check, max = 1000) {
  if (!Array.isArray(value) || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail('array_invalid');
  for (let i = 0; i < value.length; i++) check(field(value, String(i)));
}
function timestamp(value, limit, code = 'date_invalid') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail(code);
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at > limit || new Date(at).toISOString().slice(0, 19) !== value.slice(0, 19)) fail(code);
  return at;
}
function day(value, limit = Infinity) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('date_invalid');
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at > limit || new Date(at).toISOString().slice(0, 10) !== value) fail('date_invalid');
}
function reportedAt(value, limit) { if (typeof value === 'string' && value.length === 10) day(value, limit); else timestamp(value, limit); }
function money(value) { if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)) fail('money_invalid'); }
function flag(value) { if (value !== null && typeof value !== 'boolean') fail('field_invalid'); }

// This validates only the additive v2 fields. Existing v1 fields and transport
// remain under the current importer until the full v2 integration is wired.
function validateV2Fields(snapshot, { now, existingIds = [] } = {}) {
  const clock = timestamp(now, Infinity, 'clock_invalid');
  if (field(snapshot, 'version') !== 2) fail('version_invalid');
  const generated = timestamp(field(snapshot, 'generated_at'), clock, 'generated_at_invalid');
  const seen = new Set();
  list(existingIds, value => { id(value); if (seen.has(value)) fail('duplicate_id'); seen.add(value); }, 10000);
  const unique = value => { id(value); if (seen.has(value)) fail('duplicate_id'); seen.add(value); };
  list(field(snapshot, 'open_items'), item => {
    record(item, ['id', 'tier', 'status', 'title', 'who', 'happened', 'numbers', 'suggestion', 'options', 'pick', 'due', 'refs']);
    unique(item.id);
    if (!Number.isSafeInteger(item.tier) || item.tier < 1 || item.tier > 5) fail('field_invalid');
    text(item.status, 80); text(item.title, 300); text(item.suggestion, 8000, true, true);
    list(item.who, person => { record(person, ['name', 'role', 'channel']); text(person.name, 200); text(person.role, 300); text(person.channel, 80, true); }, 100);
    list(item.happened, event => { record(event, ['at', 'text']); reportedAt(event.at, generated); text(event.text, 4000, false, true); });
    record(item.numbers, MONEY); for (const key of MONEY) money(item.numbers[key]);
    if (item.numbers.fee_estimate_low !== null && item.numbers.fee_estimate_high !== null && item.numbers.fee_estimate_low > item.numbers.fee_estimate_high) fail('money_invalid');
    record(item.options, ['A', 'B', 'C']);
    for (const key of ['A', 'B', 'C']) { const option = item.options[key]; record(option, ['label', 'consequence']); text(option.label, 200); text(option.consequence, 2000, false, true); }
    if (item.pick !== null && !['A', 'B', 'C'].includes(item.pick)) fail('field_invalid');
    if (item.due !== null) day(item.due);
    record(item.refs, ['thread', 'draft']); text(item.refs.thread, 2048, true); text(item.refs.draft, 200, true);
  });
  const agents = new Set();
  list(field(snapshot, 'agents'), agent => {
    record(agent, ['id', 'name', 'brokerage', 'emails', 'phones', 'markets', 'properties', 'contacted', 'answered', 'response_hours', 'last_touch']);
    unique(agent.id); agents.add(agent.id); text(agent.name, 200); text(agent.brokerage, 300, true);
    for (const key of ['emails', 'phones', 'markets', 'properties']) list(agent[key], value => text(value, key === 'emails' ? 320 : 300), 100);
    flag(agent.contacted); flag(agent.answered); money(agent.response_hours);
    if (agent.last_touch !== null) reportedAt(agent.last_touch, generated);
  });
  const refs = new Set();
  list(field(snapshot, 'outreach'), row => {
    record(row, ['ref', 'priority', 'address', 'market', 'agent_id', 'next_step', 'follow_up_on', 'contacted', 'answered', 'last_answer_summary']);
    id(row.ref); if (refs.has(row.ref)) fail('duplicate_id'); refs.add(row.ref);
    if (!Number.isSafeInteger(row.priority) || row.priority < 1) fail('rank_invalid');
    text(row.address, 300, true); text(row.market, 300, true); text(row.next_step, 2000, true, true); text(row.last_answer_summary, 4000, true, true);
    if (row.agent_id !== null) { id(row.agent_id); if (!agents.has(row.agent_id)) fail('reference_invalid'); }
    if (row.follow_up_on !== null) day(row.follow_up_on);
    flag(row.contacted); flag(row.answered);
  });
}
module.exports = { validateV2Fields };
