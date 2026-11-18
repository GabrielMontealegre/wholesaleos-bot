'use strict';

const technical = require('./distress-list-profiles');
const policy = require('./distress-list-operational-policy.json');

function own(object, key) {
  const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')) ? time : null;
}

// These are operational profiles, not permission inferred from a format-compatible codec.
const PROFILES = Object.freeze(technical.PROFILES.map(profile => {
  const fixture = policy.fixture_sets.find(item => item.source_id === profile.source_id && item.kind === 'synthetic');
  const hasCorpus = Boolean(fixture && profile.reader_settings_evidence && profile.reader_settings_evidence.evidence_level === 'schema_only');
  const relation = policy.source_relations.find(item => item.source_id === profile.source_id);
  return Object.freeze({
    source_id: profile.source_id, source_name: profile.source_name, source_kind: profile.source_kind,
    source_family: profile.source_kind, source_url: profile.source_url, county: profile.county, state: profile.state,
    access: profile.access, manual_reason: profile.manual_reason,
    source_status: 'candidate', enabled: false, runnable: false, auto_select: false, preview_only: true, should_ingest: false,
    promotion_status: 'blocked_pending_validated_preview',
    reader: hasCorpus ? profile.reader : null,
    status: hasCorpus ? 'not_enabled' : 'needs_corpus',
    status_label: hasCorpus ? 'not enabled' : 'needs sample data',
    fixture_kind: hasCorpus ? 'synthetic' : null, fixture_path: hasCorpus ? fixture.path : null,
    ...(relation ? { related_source_id: relation.related_source_id, relation: relation.relation } : {})
  });
}));
const byId = new Map(PROFILES.map(profile => [profile.source_id, profile]));
function profileForSourceId(id) { return byId.get(clean(id)) || null; }

function catalogForMarket(input = {}) {
  const state = clean(input.state || 'TX').toUpperCase();
  const county = clean(input.county || input.market_county || 'Dallas').toLowerCase().replace(/ county$/, '');
  const ids = input.source_ids || input.sourceIds;
  const requested = new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []);
  return PROFILES.filter(profile => requested.has(profile.source_id) ||
    (profile.state === state && profile.county.toLowerCase().replace(/ county$/, '') === county));
}

function sourceRowUrl(profile, value) {
  if (typeof value !== 'string' || !technical.urlAllowedForProfile(profile, value)) return false;
  try {
    const url = new URL(value), source = new URL(profile.source_url);
    if (url.origin !== source.origin || url.username || url.password || url.hash || url.searchParams.has('returnCountOnly')) return false;
    return url.pathname === source.pathname + (profile.reader === 'arcgis_json' ? '/query' : '');
  } catch (_) { return false; }
}

// Eligibility only. The caller must supply a trusted preview-validation receipt;
// this does not authenticate receipts, grant owner approval, or mutate enabled state.
function canPromoteSource(profile, previewEvidence) {
  const canonical = profileForSourceId(own(profile, 'source_id'));
  const codec = canonical && technical.profileForSourceId(canonical.source_id);
  if (!canonical || !canonical.reader || !codec.runnable || canonical.access !== 'open' ||
      own(profile, 'source_url') !== canonical.source_url || own(profile, 'source_kind') !== canonical.source_kind ||
      own(profile, 'enabled') !== false || own(profile, 'promotion_status') !== canonical.promotion_status) return false;
  const evidence = previewEvidence, validation = own(evidence, 'validation');
  const captured = instant(own(evidence, 'captured_at')), reviewed = instant(own(validation, 'validated_at'));
  const schemaAt = instant(codec.reader_settings_evidence && codec.reader_settings_evidence.checked_at);
  if (own(evidence, 'source_id') !== canonical.source_id || own(evidence, 'kind') !== 'real_source_preview' ||
      own(evidence, 'synthetic') !== false || own(evidence, 'metadata_only') !== false || own(evidence, 'count_only') !== false ||
      captured == null || reviewed == null || reviewed < captured || (schemaAt != null && captured < schemaAt) ||
      own(validation, 'status') !== 'validated' || own(validation, 'validator') !== 'allowlisted_row_preview_v1' || own(validation, 'source_id') !== canonical.source_id ||
      own(validation, 'source_captured_at') !== evidence.captured_at || own(validation, 'source_url') !== own(evidence, 'source_url') ||
      !sourceRowUrl(codec, own(evidence, 'source_url'))) return false;
  const rows = own(evidence, 'rows');
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const references = new Set();
  return Array.from(rows).every(row => {
    const reference = own(row, 'row_reference'), fields = own(row, 'raw_fields');
    if (own(row, 'source_id') !== canonical.source_id || own(row, 'source_url') !== evidence.source_url ||
        own(row, 'captured_at') !== evidence.captured_at || own(row, 'synthetic') !== false ||
        typeof reference !== 'string' || !/^(?:feature [A-Za-z_][A-Za-z0-9_]*=[^\s]+|row \d+ \(line \d+\)|sheet .+ row \d+)$/.test(reference) ||
        references.has(reference) || !fields || Array.isArray(fields) || typeof fields !== 'object' ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(fields))) return false;
    const values = Object.values(Object.getOwnPropertyDescriptors(fields));
    if (!values.length || values.some(field => !Object.hasOwn(field, 'value') ||
        (field.value != null && !['string', 'number', 'boolean'].includes(typeof field.value)) ||
        (typeof field.value === 'number' && !Number.isFinite(field.value)))) return false;
    const idField = codec.reader_options && codec.reader_options.id_field;
    const id = own(fields, idField);
    if (codec.reader === 'arcgis_json' &&
        (!['string', 'number'].includes(typeof id) || reference !== `feature ${idField}=${String(id).trim()}`)) return false;
    references.add(reference); return true;
  });
}

module.exports = { PROFILES, profileForSourceId, catalogForMarket, canPromoteSource };
