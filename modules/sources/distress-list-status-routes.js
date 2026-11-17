'use strict';

const { buildSourceCounts } = require('./distress-list-source-counts');

function registerDistressListStatusRoutes(app, { requireAdmin, listOutcomes }) {
  if (typeof requireAdmin !== 'function' || typeof listOutcomes !== 'function') throw Error('distress_status_dependencies_required');
  app.get('/api/dashboard/public-distress-sources', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, requireAdmin, (req, res) => {
    try { return res.json({ ok: true, ...buildSourceCounts(listOutcomes()) }); }
    catch (_) { return res.status(503).json({ ok: false, error: 'public_distress_status_unavailable' }); }
  });
}

module.exports = { registerDistressListStatusRoutes };
