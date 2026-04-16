// modules/runtime-cache.js
// Lightweight in-memory cache for processed lead IDs and scan snapshots.
// TTL default 10 min (matches window._cache convention in current-rules.md).
'use strict';

var _store = {};
var TTL = 10 * 60 * 1000; // 10 min

function set(key, value) {
  _store[key] = { value: value, ts: Date.now() };
}

function get(key) {
  var entry = _store[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) { delete _store[key]; return null; }
  return entry.value;
}

function has(key) { return get(key) !== null; }

function del(key) { delete _store[key]; }

// Prune expired entries (call periodically to avoid unbounded growth)
function prune() {
  var now = Date.now();
  Object.keys(_store).forEach(function(k) {
    if (now - _store[k].ts > TTL) delete _store[k];
  });
}

// Auto-prune every 15 min
setInterval(prune, 15 * 60 * 1000);

module.exports = { set: set, get: get, has: has, del: del, prune: prune };