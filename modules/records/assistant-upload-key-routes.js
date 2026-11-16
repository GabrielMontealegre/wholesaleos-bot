'use strict';
const crypto = require('node:crypto');
const keys = require('./assistant-upload-keys');
const ROUTE = '/api/dashboard/assistant-upload-keys';
const CREATE_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CODES = new Set(['actor_required', 'clock_invalid', 'store_invalid', 'entropy_required', 'identity_conflict', 'not_found', 'missing_or_revoked']);
function noStore(req, res, next) { res.set('Cache-Control', 'no-store'); next(); }
function requireKeyPayload(req, res, next) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, code: 'assistant_upload_key_method_invalid' });
  if (req.get('transfer-encoding') || Number(req.get('content-length') || 0) !== 0) return res.status(400).json({ ok: false, code: 'assistant_upload_key_body_invalid' });
  next();
}
function actionGuard(req, res, next) {
  try {
    const origin = new URL(req.get('origin')), expected = new URL(req.protocol + '://' + req.get('host')).origin;
    if (origin.origin !== expected || origin.href !== origin.origin + '/' || req.get('X-WOS-Assistant-Key-Action') !== '1') throw Error();
  } catch (_) { return res.status(403).json({ ok: false, code: 'assistant_upload_key_origin_required' }); }
  next();
}
function registerAssistantUploadKeyRoutes(app, { db, requireAdmin, now = () => new Date().toISOString(), randomBytes = crypto.randomBytes }) {
  if (typeof requireAdmin !== 'function' || typeof db?.readDBStrict !== 'function' || typeof db?.writeDB !== 'function' || typeof now !== 'function' || typeof randomBytes !== 'function') throw Error('assistant_upload_key_dependencies_required');
  function error(res, failure) {
    const suffix = typeof failure?.code === 'string' && failure.code.replace(/^assistant_upload_key_/, '');
    const known = CODES.has(suffix) && failure.code === 'assistant_upload_key_' + suffix;
    res.status(known ? failure.status || 400 : 503).json({ ok: false, code: known ? failure.code : 'assistant_upload_key_unavailable' });
  }
  app.get(ROUTE, noStore, requireAdmin, requireKeyPayload, (req, res) => {
    try { res.json({ ok: true, keys: keys.listKeys(db.readDBStrict(), { operatorId: req.currentUser?.id, now: now() }) }); }
    catch (failure) { error(res, failure); }
  });
  app.post(ROUTE, noStore, requireAdmin, requireKeyPayload, actionGuard, (req, res) => {
    const requestId = req.get('X-WOS-Assistant-Request');
    if (typeof requestId !== 'string' || !CREATE_UUID.test(requestId)) return res.status(400).json({ ok: false, code: 'assistant_upload_key_request_invalid' });
    try {
      const operatorId = req.currentUser?.id, at = now(), before = db.readDBStrict();
      const identity = crypto.createHash('sha256').update(JSON.stringify(['assistant_key_create_transport_v1', operatorId, requestId])).digest().subarray(0, 16);
      const secret = randomBytes(32);
      if (!Buffer.isBuffer(secret) || secret.length !== 32) throw Error();
      const created = keys.createKey(before, { operatorId, now: at, entropy: Buffer.concat([identity, secret]) });
      db.writeDB(created.store);
      const row = created.store.assistant_upload_keys[created.store.assistant_upload_keys.length - 1];
      res.json({ ok: true, key: created.key, id: row.id, created_at: row.created_at });
    } catch (failure) { error(res, failure); }
  });
  app.post(ROUTE + '/:id/revoke', noStore, requireAdmin, requireKeyPayload, actionGuard, (req, res) => {
    try {
      const before = db.readDBStrict(), after = keys.revokeKey(before, { operatorId: req.currentUser?.id, id: req.params.id, now: now() });
      if (after !== before) db.writeDB(after);
      res.json({ ok: true });
    } catch (failure) { error(res, failure); }
  });
}
module.exports = { registerAssistantUploadKeyRoutes, requireKeyPayload, noStore };
