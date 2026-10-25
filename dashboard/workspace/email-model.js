'use strict';
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WOSEmailModel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  var ROLES = new Set(['holder', 'buyer', 'partner', 'seller', 'title', 'attorney', 'lender', 'agent', 'other']);
  var LISTING_DOMAINS = new Set(['redfin.com', 'zillow.com', 'realtor.com', 'trulia.com']);

  function instant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
    var number = Date.parse(value);
    return Number.isFinite(number) && new Date(number).toISOString().slice(0, 19) === value.slice(0, 19) ? number : null;
  }

  function text(value, max) { return typeof value === 'string' ? value.slice(0, max) : ''; }

  // A display category, never evidence of a human identity, role or buyer status.
  // Only an exact automated sender on a listing domain goes to Alerts. Ordinary
  // agents on those domains, unknown senders and mixed threads remain in People.
  function category(message) {
    var header = text(message && message.from, 4096), mailbox = null;
    if (!/[\r\n]/.test(header)) {
      var bracket = header.match(/^[^<>]*<([^<>\s]+)>\s*$/);
      mailbox = bracket ? bracket[1] : /^[^<>\s]+@[^<>\s]+$/.test(header) ? header : null;
    }
    var match = mailbox && mailbox.toLowerCase().match(/^([^@]+)@([^@]+)$/);
    var automated = false;
    if (message && message.source_kind === 'connected_mailbox' && match && /^(?:no-?reply|notifications?|alerts?|listings?|updates?|recommendations?)$/.test(match[1])) {
      var host = match[2];
      automated = LISTING_DOMAINS.has(host) || Array.from(LISTING_DOMAINS).some(function (domain) { return host.endsWith('.' + domain); });
    }
    return { kind: automated ? 'alerts' : 'people', source_kind: 'derived_workflow',
      reason: automated ? 'recognized_automated_listing_sender' : 'not_a_recognized_automated_listing_sender', person_verified: false };
  }

  function role(message, options) {
    var context = message && message.conversation;
    var at = instant(context && context.role_recorded_at), now = instant(options && options.now);
    if (!context || message.source_kind !== 'connected_mailbox' || message.link_status !== 'linked' || at === null || now === null || at > now ||
        !['operator_input', 'imported_report'].includes(context.role_source_kind) || !ROLES.has(context.role)) return '';
    return context.role;
  }

  function sender(message) {
    var name = text(message && message.sender_name, 200).trim();
    if (name && !/[\x00-\x1f<>]/.test(name)) return name;
    if (message && message.source_kind === 'connected_mailbox' && message.direction === 'out') return 'You';
    return 'Sender name not recorded';
  }

  function unreadState(message) {
    var read = message.read, unread = message.unread;
    if (typeof read === 'boolean' && typeof unread === 'boolean' && read === unread) return null;
    if (typeof unread === 'boolean') return unread;
    return typeof read === 'boolean' ? !read : null;
  }

  function groupedUnread(messages) {
    var states = messages.map(unreadState);
    return states.includes(true) ? true : states.every(function (value) { return value === false; }) ? false : null;
  }

  function list(messages, options) {
    var now = instant(options && options.now);
    if (now === null) throw new TypeError('email_view_clock_invalid');
    if (!Array.isArray(messages) || messages.length > 50) throw new TypeError('email_view_list_invalid');
    var identities = new Map(), unavailable = [], duplicateCount = 0;
    messages.forEach(function (message, index) {
      var at = instant(message && message.date);
      if (!message || message.source_kind !== 'connected_mailbox' || typeof message.id !== 'string' || !message.id || message.id.length > 1000 ||
          at === null || at > now) {
        unavailable.push({ index: index, reason: 'message_source_or_reference_unavailable' });
        return;
      }
      if (!identities.has(message.id)) identities.set(message.id, []);
      identities.get(message.id).push({ message: message, index: index, at: at });
    });
    var groups = new Map();
    identities.forEach(function (entries) {
      var signatures = new Set(entries.map(function (entry) {
        var m = entry.message;
        return JSON.stringify([m.thread_key, m.from, m.sender_name, m.subject, m.date, m.source_kind, m.conversation, m.link_status, m.direction]);
      }));
      if (signatures.size > 1) {
        entries.forEach(function (entry) { unavailable.push({ index: entry.index, reason: 'conflicting_message_reference' }); });
        return;
      }
      duplicateCount += entries.length - 1;
      var entry = Object.assign({}, entries[0]);
      var unread = groupedUnread(entries.map(function (item) { return item.message; }));
      entry.message = Object.assign({}, entry.message, { unread: unread, read: unread === null ? null : !unread });
      var key = /^[a-f0-9]{64}$/.test(entry.message.thread_key || '') ? entry.message.thread_key : 'isolated:' + entry.index;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    var threads = [];
    groups.forEach(function (entries, key) {
      entries.sort(function (a, b) { return a.at - b.at || a.message.id.localeCompare(b.message.id); });
      var latest = entries[entries.length - 1].message;
      threads.push({ key: key, messages: entries.map(function (entry) { return entry.message; }), latest: latest,
        category: entries.every(function (entry) { return category(entry.message).kind === 'alerts'; }) ? 'alerts' : 'people',
        sender: sender(latest), role: role(latest, options), unread: groupedUnread(entries.map(function (entry) { return entry.message; })) });
    });
    threads.sort(function (a, b) { return instant(b.latest.date) - instant(a.latest.date) || a.key.localeCompare(b.key); });
    return { threads: threads, unavailable: unavailable, duplicate_count: duplicateCount,
      source_kind: 'derived_workflow', now: options.now, person_verified: false };
  }

  return { list: list, category: category, sender: sender, role: role };
});
