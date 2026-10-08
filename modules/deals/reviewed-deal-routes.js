'use strict';
const deals = require('./reviewed-deals');
function registerReviewedDealRoutes(app, { db, requireAdmin, now = () => new Date().toISOString() }) {
  function failure(res, e) { const known = /^find_deal_[a-z_]+$/.test(e.code || ''); res.status(known ? e.status || 400 : 503).json({ code: known ? e.code : 'deal_store_unavailable' }); }
  app.get('/api/dashboard/todays-deals', requireAdmin, (req, res) => {
    try { res.set('Cache-Control', 'no-store').json(deals.list(db.readDBStrict(), { now: now(), includeHidden: req.query.hidden === 'true', jv: req.query.jv === 'true', state: String(req.query.state || '').slice(0, 2), county: String(req.query.county || '').slice(0, 80), city: String(req.query.city || '').slice(0, 80) })); } catch (e) { failure(res, e); }
  });
  app.patch('/api/dashboard/todays-deals/:id', requireAdmin, (req, res) => {
    try { const result = deals.update(db.readDBStrict(), req.params.id, req.body, { now: now(), operatorId: req.currentUser.id }); db.writeDB(result); res.json({ ok: true }); } catch (e) { failure(res, e); }
  });
  app.get('/api/dashboard/todays-deals/:id/jv-draft', requireAdmin, (req, res) => {
    try { const store = db.readDBStrict(); const deal = (store.reviewed_deals || []).find(d => d.id === req.params.id); if (!deal || deal.deal_kind !== 'jv') return res.status(404).json({ code: 'find_deal_not_found' }); res.set('Cache-Control', 'no-store').attachment('jv-term-sheet.txt').type('text/plain').send(deals.jvDraft(deal, deals.evaluate(deal, store.buyers, now()))); } catch (e) { failure(res, e); }
  });
}
module.exports = { registerReviewedDealRoutes };
