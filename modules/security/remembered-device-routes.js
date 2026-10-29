'use strict';
const devices = require('./remembered-devices');
const sessions = require('./dashboard-session');
function noStore(req, res, next) { res.set('Cache-Control', 'no-store'); next(); }
function actionAllowed(req) {
  try { const origin = new URL(req.get('origin')), expected = new URL(req.protocol + '://' + req.get('host')).origin; return origin.origin === expected && origin.href === origin.origin + '/' && req.get('X-WOS-Device-Action') === '1'; }
  catch { return false; }
}
function requireDevicePayload(req, res, next) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, code: 'remembered_device_method_invalid' });
  if (req.get('transfer-encoding') || Number(req.get('content-length') || 0) !== 0) return res.status(400).json({ ok: false, code: 'remembered_device_body_invalid' });
  next();
}
function registerRememberedDeviceRoutes(app, { db, requireAuth, now = Date.now }) {
  if (typeof requireAuth !== 'function' || typeof db?.readDBStrict !== 'function' || typeof db?.writeDB !== 'function' || typeof now !== 'function') throw Error('remembered_device_dependencies_required');
  function current(req) { return typeof req.rememberedDeviceId === 'string' && /^[a-f0-9]{32}$/.test(req.rememberedDeviceId) ? req.rememberedDeviceId : null; }
  function error(res, failure) {
    const known = /^remembered_device_(?:actor_invalid|clock_invalid|store_invalid|not_found|request_invalid)$/.test(failure?.code || '');
    return res.status(known ? failure.status || 400 : 503).json({ ok: false, code: known ? failure.code : 'remembered_device_unavailable' });
  }
  app.get('/api/auth/devices', noStore, requireAuth, requireDevicePayload, (req, res) => {
    try { res.json({ ok: true, devices: devices.listDevices(db.readDBStrict(), { userId: req.currentUser.id, now: now(), currentId: current(req) }) }); }
    catch (failure) { error(res, failure); }
  });
  app.post('/api/auth/devices/:id/revoke', noStore, requireAuth, requireDevicePayload, (req, res) => {
    if (!actionAllowed(req)) return res.status(403).json({ ok: false, code: 'remembered_device_origin_required' });
    if (!/^[a-f0-9]{32}$/.test(req.params.id)) return res.status(400).json({ ok: false, code: 'remembered_device_request_invalid' });
    try {
      const before = db.readDBStrict(), after = devices.revokeDevice(before, { userId: req.currentUser.id, id: req.params.id, now: now() });
      if (after !== before) db.writeDB(after);
      const isCurrent = current(req) === req.params.id;
      if (isCurrent) res.setHeader('Set-Cookie', sessions.clearCookie());
      res.json({ ok: true, current_device: isCurrent });
    } catch (failure) { error(res, failure); }
  });
}
module.exports = { noStore, requireDevicePayload, actionAllowed, registerRememberedDeviceRoutes };
