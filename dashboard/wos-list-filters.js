'use strict';
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.wosListFilters = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
  const fields = ['state', 'county', 'city'];
  function text(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''; }
  function key(value) { return text(value).toLowerCase(); }
  function countyKey(value) { return key(value).replace(/ county$/, ''); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function normalize(input) {
    const state = text(input && input.state).toUpperCase();
    const county = state ? text(input && input.county).slice(0,80) : '';
    return {state: /^[A-Z]{2}$/.test(state) ? state : '', county: /^[A-Z]{2}$/.test(state) ? county : '', city: /^[A-Z]{2}$/.test(state) && county ? text(input && input.city).slice(0,80) : ''};
  }
  function change(selection, field, value) {
    const next = {...normalize(selection)};
    if (!fields.includes(field)) return next;
    next[field] = value;
    if (field === 'state') { next.county = ''; next.city = ''; }
    if (field === 'county') next.city = '';
    return normalize(next);
  }
  function matches(row, selection) {
    const value = normalize(selection);
    return (!value.state || key(row.state) === key(value.state)) &&
      (!value.county || countyKey(row.county) === countyKey(value.county)) &&
      (!value.city || key(row.city) === key(value.city));
  }
  function restore(tab, storage, hash) {
    try {
      const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
      if (params.get('filters') === tab) return normalize(Object.fromEntries(fields.map(field => [field, params.get(field)])));
      return normalize(JSON.parse(storage.getItem('wos:list-filters:' + tab) || '{}'));
    } catch (_) { return normalize({}); }
  }
  function persist(tab, selection, storage, history, location) {
    const value = normalize(selection);
    try { storage.setItem('wos:list-filters:' + tab, JSON.stringify(value)); } catch (_) {}
    const params = new URLSearchParams({filters: tab});
    fields.forEach(field => { if (value[field]) params.set(field, value[field]); });
    try { history.replaceState(null, '', location.pathname + location.search + '#' + params); } catch (_) {}
  }
  function initialTab(hash, search) {
    const route = new URLSearchParams(String(hash || '').replace(/^#/, '')).get('filters');
    return !new URLSearchParams(search || '').has('record_ref') && ['todays_deals','jv'].includes(route) ? route : '';
  }
  function render({catalog, selection, rows, tab, note}) {
    const value = normalize(selection), counties = catalog ? catalog.counties.filter(c => c.state === value.state) : [];
    const cities = [...new Set(rows.filter(row => value.state && value.county && matches(row, {...value, city: ''})).map(row => text(row.city)).filter(Boolean))].sort();
    function select(field, values, disabled) {
      const label = field[0].toUpperCase() + field.slice(1);
      const selected = value[field];
      if (selected && !values.some(v => v.value === selected)) values = [{value: selected, label: selected + ' (no loaded records)'}, ...values];
      return '<label>' + label + '<select class="form-select" data-list-filter="' + field + '"' + (disabled ? ' disabled' : '') + ' aria-label="' + label + '"><option value="">' + ({state:'All states',county:'All counties',city:'All cities'})[field] + '</option>' + values.map(v => '<option value="' + esc(v.value) + '"' + (v.empty ? ' data-empty="true" style="color:#9aa5b5"' : '') + (selected === v.value ? ' selected' : '') + '>' + esc(v.label) + '</option>').join('') + '</select></label>';
    }
    return '<div class="wos-location-filters" data-list-filters="' + esc(tab) + '">' +
      select('state', (catalog ? catalog.states : []).map(s => ({value:s.code,label:s.name})), !catalog) +
      select('county', counties.map(c => { const count = rows.filter(row => matches(row, {state:value.state,county:c.name})).reduce((n,row) => n + (Number.isSafeInteger(row.count) && row.count >= 0 ? row.count : 1),0); return {value:c.name,label:c.name + ' (' + count + ')',empty:count===0}; }), !catalog || !value.state) +
      select('city', cities.map(city => ({value:city,label:city})), !value.county) +
      '<div class="wos-filter-chips">' + fields.filter(field => value[field]).map(field => '<button type="button" class="btn" data-list-filter-remove="' + field + '" aria-label="Remove ' + field + ' filter">' + esc(value[field]) + ' &times;</button>').join('') +
      '<button type="button" class="btn" data-list-filter-clear>Clear location filters</button></div>' +
      (note === false ? '' : '<small>' + (catalog ? 'County rankings unavailable; alphabetical until source data is established. Counts exclude hidden deals unless included.' : 'County directory unavailable. Other deal filters remain usable.') + '</small>') + '</div>';
  }
  return {normalize, change, matches, restore, persist, initialTab, render};
});
