'use strict';
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./email-model') : root.WOSEmailModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WOSMailLayoutModel = api;
})(typeof window !== 'undefined' ? window : null, function (email) {
  var CATEGORIES = ['primary', 'buyers', 'sellers_agents', 'alerts', 'reports'];
  var ROLES = ['', 'holder', 'buyer', 'partner', 'seller', 'title', 'attorney', 'lender', 'agent', 'other'];
  function normalize(value) { return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function snippet(message, messages) {
    var value = message.snippet;
    if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) return '';
    var copies = messages.filter(function (row) { return row && row.id === message.id; });
    if (copies.some(function (row) { return row.source_kind !== 'connected_mailbox' || row.snippet !== value; })) return '';
    return value.slice(0, 500);
  }
  function category(thread, messages) {
    if (thread.category === 'alerts') return 'alerts';
    if (thread.role === 'buyer') return 'buyers';
    if (thread.role === 'seller' || thread.role === 'agent') return 'sellers_agents';
    var allReports = thread.messages.every(function (message) {
      var copies = messages.filter(function (row) { return row && row.id === message.id; });
      return copies.length && copies.every(function (row) {
        return row.source_kind === 'connected_mailbox' && Array.isArray(row.labels) &&
          row.labels.some(function (label) { return label === 'WOS/Reports' || label === 'WOS Action'; });
      });
    });
    return allReports ? 'reports' : 'primary';
  }
  function project(messages, options) {
    options = options || {};
    var selected = options.category === undefined ? 'primary' : options.category;
    var query = options.query === undefined ? '' : options.query;
    var role = options.role === undefined ? '' : options.role;
    var page = options.page === undefined ? 1 : options.page;
    var size = options.pageSize === undefined ? 50 : options.pageSize;
    if (!CATEGORIES.includes(selected) || !ROLES.includes(role) || typeof query !== 'string' || query.length > 300 ||
        /[\x00-\x1f\x7f]/.test(query) || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 50) {
      throw new TypeError('mail_layout_filter_invalid');
    }
    var source = email.list(messages, { now: options.now });
    var terms = normalize(query).split(' ').filter(Boolean);
    var rows = source.threads.map(function (thread) {
      return Object.assign({}, thread, { display_category: category(thread, messages), snippet: snippet(thread.latest, messages) });
    }).filter(function (thread) {
      var haystack = normalize([thread.sender, thread.latest.from, thread.latest.subject, thread.snippet].filter(function (value) { return typeof value === 'string'; }).join(' '));
      return (!role || thread.role === role) && terms.every(function (term) { return haystack.includes(term); });
    });
    var counts = {};
    CATEGORIES.forEach(function (key) { counts[key] = rows.filter(function (row) { return row.display_category === key; }).length; });
    var matching = rows.filter(function (row) { return row.display_category === selected; });
    var pages = Math.max(1, Math.ceil(matching.length / size)), current = Math.min(page, pages), start = (current - 1) * size;
    return { rows: matching.slice(start, start + size), categories: counts, category: selected, role: role,
      query: query, page: current, pages: pages, page_size: size,
      range: { start: matching.length ? start + 1 : 0, end: Math.min(start + size, matching.length), total: matching.length, scope: 'loaded_threads' },
      total_loaded_threads: source.threads.length, matching_loaded_threads: rows.length,
      counts_scope: 'loaded_threads', folder_total: null, can_load_older: false,
      unavailable: source.unavailable, duplicate_count: source.duplicate_count, source_kind: 'derived_workflow' };
  }
  return { project: project };
});
