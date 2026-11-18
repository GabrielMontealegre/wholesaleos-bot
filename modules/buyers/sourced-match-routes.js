'use strict';

const { build } = require('./sourced-match-index');
const PATH = '/api/dashboard/sourced-matches';

function noStore(req, res, next) { res.set('Cache-Control', 'no-store'); next(); }
function requireReadPayload(req, res, next) {
  if (req.method !== 'GET') return res.status(405).json({ code: 'sourced_matches_method_invalid' });
  if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) > 0 || Object.keys(req.query || {}).length) {
    return res.status(400).json({ code: 'sourced_matches_request_invalid' });
  }
  next();
}

function register(app, { db, requireAdmin, now = () => new Date().toISOString() }) {
  if (!db || typeof db.readDBStrict !== 'function' || typeof requireAdmin !== 'function' || typeof now !== 'function') {
    throw new TypeError('Strict read, admin authorization and clock required');
  }
  app.get(PATH, noStore, requireAdmin, requireReadPayload, (req, res) => {
    try {
      const generatedAt = now();
      const snapshot = build(db.readDBStrict(), { now: generatedAt });
      return res.json({ ok: true, read_only: true, source_kind: 'derived_workflow', generated_at: generatedAt, ...snapshot });
    } catch (_) { return res.status(503).json({ ok: false, code: 'sourced_matches_unavailable' }); }
  });
}

module.exports = { PATH, register, noStore, requireReadPayload };
