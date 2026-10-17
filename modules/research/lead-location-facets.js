'use strict';
const filters = require('../../dashboard/wos-list-filters');
function text(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''; }
function location(row) {
  return {state: text(row && row.state).toUpperCase(), county: text(row && row.county).replace(/ county$/i, ''), city: text(row && (row.city || row.property_city))};
}
function selection(query) {
  if (['state','county','city'].some(field => query[field] != null && typeof query[field] !== 'string')) {
    const error = new Error('lead_location_filter_invalid'); error.status = 400; throw error;
  }
  const raw = {state: text(query.state).toUpperCase(), county: text(query.county), city: text(query.city)};
  const normalized = filters.normalize(raw);
  if (Object.keys(raw).some(field => raw[field] && !normalized[field])) {
    const error = new Error('lead_location_filter_invalid'); error.status = 400; throw error;
  }
  return normalized;
}
function matches(row, value) { return filters.matches(location(row), value); }
function counts(rows) {
  const groups = new Map();
  for (const row of rows) {
    const item = location(row);
    if (!/^[A-Z]{2}$/.test(item.state)) continue;
    if (!item.county) item.city = '';
    const key = JSON.stringify([item.state, item.county.toLowerCase(), item.city.toLowerCase()]);
    if (!groups.has(key)) groups.set(key, {...item, count: 0});
    groups.get(key).count++;
  }
  return [...groups.values()].sort((a,b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county) || a.city.localeCompare(b.city));
}
module.exports = {location, selection, matches, counts};
