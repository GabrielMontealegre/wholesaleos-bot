'use strict';
const express = require('express');
const crypto = require('node:crypto');
const { appendSnapshot, latestSnapshot, requestReceiptId, MAX_BYTES } = require('./assistant-snapshot');
const CODES = new Set(['fields_invalid', 'field_invalid', 'id_invalid', 'date_invalid', 'clock_invalid', 'money_invalid',
  'source_file_invalid', 'source_url_invalid', 'schema_invalid', 'version_invalid', 'generated_at_invalid', 'duplicate_id',
  'reference_invalid', 'array_invalid', 'rank_invalid', 'file_invalid', 'file_too_large', 'store_invalid', 'actor_required', 'filename_invalid', 'request_invalid', 'request_conflict']);
function requireSnapshotPayload(req, res, next) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, code: 'assistant_snapshot_method_invalid' });
  if (req.method === 'GET' && (req.get('transfer-encoding') || Number(req.get('content-length') || 0) !== 0)) return res.status(400).json({ ok: false, code: 'assistant_snapshot_file_invalid' });
  if (req.method === 'POST' && !req.is('application/octet-stream')) return res.status(415).json({ ok: false, code: 'assistant_snapshot_content_type_required' });
  next();
}
function registerAssistantSnapshotRoutes(app, { db, requireAdmin, now = () => new Date().toISOString() }) {
  if (typeof requireAdmin !== 'function' || typeof db?.readDBStrict !== 'function' || typeof db?.writeDB !== 'function') throw Error('assistant_snapshot_dependencies_required');
  const route = '/api/dashboard/assistant-snapshots';
  const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  function error(res, failure) {
    const suffix = typeof failure?.code === 'string' && failure.code.replace(/^assistant_snapshot_/, '');
    const known = CODES.has(suffix) && failure.code === 'assistant_snapshot_' + suffix;
    res.status(known ? failure.status || 400 : 503).json({ ok: false, code: known ? failure.code : 'assistant_snapshot_unavailable' });
  }
  function uploadGuard(req, res, next) {
    try {
      const origin = new URL(req.get('origin'));
      const expected = new URL(req.protocol + '://' + req.get('host')).origin;
      if (origin.origin !== expected || origin.href !== origin.origin + '/' ||
          req.get('X-WOS-Assistant-Import') !== '1') return res.status(403).json({ ok: false, code: 'assistant_snapshot_origin_required' });
    } catch (_) { return res.status(403).json({ ok: false, code: 'assistant_snapshot_origin_required' }); }
    if (!req.is('application/octet-stream')) return res.status(415).json({ ok: false, code: 'assistant_snapshot_content_type_required' });
    next();
  }
  app.get(route, noStore, requireAdmin, (req, res) => {
    try { const latest = latestSnapshot(db.readDBStrict(), { now: now(), operatorId: req.currentUser?.id }); res.json({ ok: true, latest,
      viewer_scope: crypto.createHash('sha256').update(JSON.stringify(['assistant-device-scope-v1', req.currentUser.id])).digest('hex'),
      capabilities: { can_import: true, schema: 'wos-assistant-snapshot', version: 1, max_bytes: MAX_BYTES } }); }
    catch (failure) { error(res, failure); }
  });
  app.post(route, noStore, requireAdmin, uploadGuard, express.raw({ type: 'application/octet-stream', limit: MAX_BYTES }), (req, res) => {
    try {
      const at = now(), operatorId = req.currentUser?.id, before = db.readDBStrict();
      const requestId = req.get('X-WOS-Assistant-Request') || undefined;
      const after = appendSnapshot(before, req.body, { now: at, operatorId, filename: req.get('X-WOS-Assistant-Filename'), requestId });
      if (after !== before) db.writeDB(after);
      const receipt = after === before ? after.assistant_snapshots.find(row => row.id === requestReceiptId(operatorId, requestId)) : after.assistant_snapshots[after.assistant_snapshots.length - 1];
      res.json({ ok: true, id: receipt.id, imported_at: receipt.imported_at, generated_at: receipt.generated_at, file_sha256: receipt.file_sha256 });
    } catch (failure) { error(res, failure); }
  }, (failure, req, res, next) => {
    if (failure?.type === 'entity.too.large') return res.status(413).json({ ok: false, code: 'assistant_snapshot_file_too_large' });
    error(res, failure);
  });
}
module.exports = { registerAssistantSnapshotRoutes, requireSnapshotPayload };
