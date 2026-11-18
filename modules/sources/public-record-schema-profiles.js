'use strict';

const data = require('./public-record-schema-profiles.json');
const { normalizeSourceDate } = require('../research/normalize-source-date');
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const PROFILES = freeze(data.profiles);
function own(value, key) {
  const descriptor = value && Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function profileForId(id) { return PROFILES.find(profile => profile.profile_id === id) || null; }
function schemaProfilesForMarket({ state, county } = {}) {
  return PROFILES.filter(profile => profile.state === String(state || '').toUpperCase() &&
    (!profile.county || profile.county.toLowerCase() === String(county || '').replace(/ county$/i, '').toLowerCase()));
}
function validateSchemaFixture(id, fixture) {
  const profile = profileForId(id);
  const keys = ['synthetic', 'kind', 'profile_id', 'metadata_url', 'captured_date', 'fields'];
  if (!fixture || ![Object.prototype, null].includes(Object.getPrototypeOf(fixture)) || Object.keys(fixture).some(key => !keys.includes(key))) return false;
  if (!profile?.schema_fields || own(fixture, 'synthetic') !== true || own(fixture, 'kind') !== 'schema_only' ||
      own(fixture, 'profile_id') !== id || own(fixture, 'metadata_url') !== profile.metadata_url ||
      own(fixture, 'captured_date') !== profile.captured_date || normalizeSourceDate(profile.captured_date).iso !== profile.captured_date ||
      own(fixture, 'rows') !== undefined || own(fixture, 'features') !== undefined) return false;
  try {
    const url = new URL(profile.metadata_url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !profile.allowed_metadata_hosts.includes(url.hostname)) return false;
  } catch (_) { return false; }
  const fields = own(fixture, 'fields');
  if (!Array.isArray(fields) || fields.length !== profile.schema_fields.length) return false;
  const names = Array.from(fields).map(field => own(field, 'name'));
  return Array.from(fields).every(field => field && Object.keys(field).length === 1 && Object.hasOwn(field, 'name')) &&
    new Set(names).size === names.length && names.every(name => profile.schema_fields.includes(name));
}

// Schema metadata is deliberately never passed to the runnable profile registry.
// Neither a fixture nor caller-supplied enabled/disclosure flags can activate it.
function runtimeProfilesForMarket() { return []; }
module.exports = { PROFILES, profileForId, schemaProfilesForMarket, validateSchemaFixture, runtimeProfilesForMarket };
