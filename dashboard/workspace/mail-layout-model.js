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
  function sameMessage(metadata, body, options) {
    if (!identity(metadata) || identity(body) !== identity(metadata)) return false;
    try { return email.list([metadata], options).threads.length === 1; } catch (_) { return false; }
  }
  function openedSnippet(metadata, body, options) {
    if (!sameMessage(metadata, body, options) || body.body_origin !== 'parsed_mime_text' || !safeText(body.body, 2 * 1024 * 1024)) return null;
    var value = body.body.replace(/\s+/g, ' ').trim().slice(0, 500);
    return value ? { id: metadata.id, identity: identity(metadata), snippet: value, origin: 'parsed_mime_text' } : null;
  }
  function attachmentManifest(metadata, body, options) {
    if (!sameMessage(metadata, body, options) || body.attachment_manifest_origin !== 'parsed_mime_metadata' || !Array.isArray(body.attachment_manifest) || body.attachment_manifest.length > 50) return null;
    var fields = ['part_index', 'filename', 'content_type', 'size_bytes', 'disposition', 'related'];
    if (Array.from(body.attachment_manifest).some(function (part, index) {
      return !part || Object.keys(part).some(function (key) { return !fields.includes(key); }) || part.part_index !== index ||
        !(part.filename === null || (safeText(part.filename, 200) && part.filename.length && !/[\\/\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(part.filename) && !['.', '..'].includes(part.filename))) ||
        !(part.content_type === null || (safeText(part.content_type, 127) && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(part.content_type))) ||
        !(part.size_bytes === null || (Number.isSafeInteger(part.size_bytes) && part.size_bytes >= 0 && part.size_bytes <= 2 * 1024 * 1024)) ||
        !(part.disposition === null || ['attachment', 'inline'].includes(part.disposition)) || !(part.related === null || typeof part.related === 'boolean');
    })) return null;
    return body.attachment_manifest.map(function (part) { return Object.assign({}, part); });
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
  function labelReceipt(message) {
    var field = Object.getOwnPropertyDescriptor(message, 'provider_labels');
    var value = field && Object.hasOwn(field, 'value') && field.value;
    if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
        Object.keys(value).length !== 3) return null;
    var fields = ['origin', 'scope', 'names'].map(function (key) { return Object.getOwnPropertyDescriptor(value, key); });
    if (fields.some(function (entry) { return !entry || !Object.hasOwn(entry, 'value'); }) ||
        fields[0].value !== 'imap_gmail_labels' || fields[1].value !== 'message') return null;
    var names = fields[2].value;
    if (!Array.isArray(names) || names.length > 100) return null;
    var copied = [];
    for (var index = 0; index < names.length; index++) {
      var entry = Object.getOwnPropertyDescriptor(names, String(index));
      if (!entry || !Object.hasOwn(entry, 'value') || typeof entry.value !== 'string' ||
          !entry.value.trim() || entry.value.length > 200 || /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(entry.value)) return null;
      copied.push(entry.value);
    }
    if (new Set(copied).size !== copied.length) return null;
    return { key: JSON.stringify(copied.sort()), names: copied, report: copied.includes('WOS/Reports') || copied.includes('WOS Action') };
  }
  function openedLabels(metadata, body, messages, options) {
    if (!sameMessage(metadata, body, options) || !Array.isArray(messages) || messages.length > 50 ||
        Array.from(messages).some(function (row) { return !row; })) return null;
    var receipt = labelReceipt(metadata), opened = labelReceipt(body);
    if (!receipt || !opened || receipt.key !== opened.key) return null;
    var copies = messages.filter(function (row) { return row.id === metadata.id; });
    if (!copies.length || copies.some(function (row) {
      var copy = labelReceipt(row);
      return identity(row) !== identity(metadata) || !copy || copy.key !== receipt.key;
    })) return null;
    return opened.names.slice();
  }
  function category(thread, messages) {
    if (thread.category === 'alerts') return 'alerts';
    if (thread.role === 'buyer') return 'buyers';
    if (thread.role === 'seller' || thread.role === 'agent') return 'sellers_agents';
    var allReports = thread.messages.every(function (message) {
      var copies = messages.filter(function (row) { return row && row.id === message.id; });
      var receipt = labelReceipt(message);
      // Per-message provider receipts are not folder labels, REST names or person roles.
      return receipt && receipt.report && copies.length && copies.every(function (row) {
        var copy = row.source_kind === 'connected_mailbox' && labelReceipt(row);
        return copy && copy.key === receipt.key;
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
  return { project: project, openedSnippet: openedSnippet, attachmentManifest: attachmentManifest, openedLabels: openedLabels };
});
