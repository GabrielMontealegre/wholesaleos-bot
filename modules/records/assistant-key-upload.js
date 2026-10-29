'use strict';
const express = require('express');
const keys = require('./assistant-upload-keys');
const snapshots = require('./assistant-snapshot');
const HEADER = 'X-WOS-Assistant-Upload-Key';
function createAssistantKeyUpload({ db, limiter, now = () => new Date().toISOString() }) {
  if (typeof db?.readDBStrict !== 'function' || typeof db?.writeDB !== 'function' || typeof limiter !== 'function') throw Error('assistant_key_upload_dependencies_required');
  const raw = express.raw({ type: 'application/octet-stream', limit: snapshots.MAX_BYTES });
  const deny = (res, status, code) => res.status(status).json({ ok: false, code });
  return function assistantKeyUpload(req, res, next) {
    if (req.get(HEADER) === undefined) return next();
    // Terminate only this exact POST; an upload credential is never a session.
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST' || !['', '/'].includes(req.path)) return deny(res, 401, 'assistant_upload_key_missing_or_revoked');
    return limiter(req, res, () => {
      if (req.get('cookie') || req.get('origin') || req.get('authorization')) return deny(res, 403, 'assistant_upload_key_context_invalid');
      let at;
      try {
        at = now();
        const store = db.readDBStrict(), identity = keys.authenticateKey(store, req.get(HEADER), { now: at });
        const users = Array.isArray(store.users) ? store.users.filter(user => user && user.id === identity.operatorId) : [];
        if (users.length !== 1 || users[0].role !== 'admin') return deny(res, 401, 'assistant_upload_key_missing_or_revoked');
        if (!req.is('application/octet-stream')) return deny(res, 415, 'assistant_snapshot_content_type_required');
        raw(req, res, failure => {
          if (failure) return deny(res, failure.type === 'entity.too.large' ? 413 : 400, failure.type === 'entity.too.large' ? 'assistant_snapshot_file_too_large' : 'assistant_snapshot_file_invalid');
          try {
            // Recheck after the asynchronous body read: revocation/role changes win.
            const before = db.readDBStrict(), checkedAt = now(), current = keys.authenticateKey(before, req.get(HEADER), { now: checkedAt });
            const active = Array.isArray(before.users) ? before.users.filter(user => user && user.id === current.operatorId) : [];
            if (current.operatorId !== identity.operatorId || active.length !== 1 || active[0].role !== 'admin') return deny(res, 401, 'assistant_upload_key_missing_or_revoked');
            const sha = req.get('X-WOS-Assistant-Request');
            const after = snapshots.appendKeySnapshot(before, req.body, { now: checkedAt, operatorId: current.operatorId, filename: req.get('X-WOS-Assistant-Filename'), fileSha256: sha });
            if (after !== before) db.writeDB(after);
            const receipt = after.assistant_snapshots.find(row => row.id === snapshots.keyReceiptId(current.operatorId, sha));
            const counts = Object.fromEntries(['deals', 'buyers', 'texts', 'calls', 'emails_waiting'].map(name => [name, receipt.snapshot[name].length]));
            return res.json({ ok: true, imported_at: receipt.imported_at, counts, duplicate: after === before });
          } catch (error) { return safeError(res, error); }
        });
      } catch (error) { return safeError(res, error); }
    });
  };
  function safeError(res, error) {
    const code = typeof error?.code === 'string' ? error.code : '';
    const known = /^assistant_snapshot_(?:fields_invalid|field_invalid|id_invalid|date_invalid|clock_invalid|money_invalid|source_file_invalid|source_url_invalid|schema_invalid|version_invalid|generated_at_invalid|duplicate_id|reference_invalid|array_invalid|rank_invalid|file_invalid|file_too_large|store_invalid|actor_required|filename_invalid|request_invalid|request_conflict)$/.test(code) || /^assistant_upload_key_(?:missing_or_revoked|store_invalid|clock_invalid)$/.test(code);
    return deny(res, known ? error.status || 400 : 503, known ? code : 'assistant_key_upload_unavailable');
  }
}
module.exports = { createAssistantKeyUpload };
