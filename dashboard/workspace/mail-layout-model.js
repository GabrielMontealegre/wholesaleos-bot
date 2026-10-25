'use strict';
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./email-model') : root.WOSEmailModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WOSMailLayoutModel = api;
})(typeof window !== 'undefined' ? window : null, function (email) {
  var CATEGORIES = ['primary', 'buyers', 'sellers_agents', 'alerts', 'reports'];
  var ROLES = ['', 'holder', 'buyer', 'partner', 'seller', 'title', 'attorney', 'lender', 'agent', 'other', 'jv'];
  function normalize(value) { return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function identity(message) {
    if (!message || message.source_kind !== 'connected_mailbox') return null;
    var fields = ['id', 'date', 'from', 'to', 'cc', 'subject', 'direction', 'message_id', 'in_reply_to', 'threadId'];
    if (fields.some(function (key) { return message[key] !== undefined && (typeof message[key] !== 'string' || message[key].length > 4096); })) return null;
    return JSON.stringify(fields.map(function (key) { return message[key] || ''; }));
  }
  function safeText(value, max) {
    return typeof value === 'string' && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
  }
  function openedSnippet(metadata, body, options) {
    if (!identity(metadata) || identity(body) !== identity(metadata) || body.body_origin !== 'parsed_mime_text' || !safeText(body.body, 2 * 1024 * 1024)) return null;
    try { if (email.list([metadata], options).threads.length !== 1) return null; } catch (_) { return null; }
    var value = body.body.replace(/\s+/g, ' ').trim().slice(0, 500);
    return value ? { id: metadata.id, identity: identity(metadata), snippet: value, origin: 'parsed_mime_text' } : null;
  }
  function snippet(message, messages, opened) {
    var value = message.snippet;
    var copies = messages.filter(function (row) { return row && row.id === message.id; });
    if (copies.some(function (row) { return row.source_kind !== 'connected_mailbox' || row.snippet !== value || row.snippet_origin !== message.snippet_origin; })) return '';
    if (message.snippet_origin === 'gmail_provider_snippet' && safeText(value, 4096) && value.trim()) return value.replace(/\s+/g, ' ').trim().slice(0, 500);
    var saved = opened && typeof opened.get === 'function' && opened.get(message.id);
    return saved && saved.origin === 'parsed_mime_text' && saved.identity === identity(message) &&
      copies.every(function (row) { return identity(row) === saved.identity; }) && safeText(saved.snippet, 500) ? saved.snippet : '';
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
      return Object.assign({}, thread, { display_category: category(thread, messages), snippet: snippet(thread.latest, messages, options.openedSnippets) });
    }).filter(function (thread) {
      var haystack = normalize([thread.sender, thread.latest.from, thread.latest.subject, thread.snippet].filter(function (value) { return typeof value === 'string'; }).join(' '));
      return (!role || (role === 'jv' ? ['holder', 'partner'].includes(thread.role) : thread.role === role)) && terms.every(function (term) { return haystack.includes(term); });
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
  return { project: project, openedSnippet: openedSnippet };
});
