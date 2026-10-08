'use strict';
const deals = require('./reviewed-deals');
const activity = require('../records/record-activity');
function registerReviewedDealRoutes(app, { db, requireAdmin, now = () => new Date().toISOString() }) {
  function failure(res, e) { const known = /^find_deal_[a-z_]+$/.test(e.code || ''); res.status(known ? e.status || 400 : 503).json({ code: known ? e.code : 'deal_store_unavailable' }); }
  app.get('/api/dashboard/todays-deals', requireAdmin, (req, res) => {
    try { res.set('Cache-Control', 'no-store').json(deals.list(db.readDBStrict(), { now: now(), includeHidden: req.query.hidden === 'true', jv: req.query.jv === 'true', state: String(req.query.state || '').slice(0, 2), county: String(req.query.county || '').slice(0, 80), city: String(req.query.city || '').slice(0, 80), recordId: String(req.query.record_id || '').slice(0, 128) })); } catch (e) { failure(res, e); }
  });
  app.patch('/api/dashboard/todays-deals/:id', requireAdmin, (req, res) => {
    try { const result = deals.update(db.readDBStrict(), req.params.id, req.body, { now: now(), operatorId: req.currentUser.id }); db.writeDB(result); res.json({ ok: true }); } catch (e) { failure(res, e); }
  });
  app.get('/api/dashboard/todays-deals/:id/jv-draft', requireAdmin, (req, res) => {
    try { const store = db.readDBStrict(); const deal = (store.reviewed_deals || []).find(d => d.id === req.params.id); if (!deal || deal.deal_kind !== 'jv') return res.status(404).json({ code: 'find_deal_not_found' }); res.set('Cache-Control', 'no-store').attachment('jv-term-sheet.txt').type('text/plain').send(deals.jvDraft(deal, deals.evaluate(deal, store.buyers, now()))); } catch (e) { failure(res, e); }
  });
  app.post('/api/dashboard/todays-deals/:id/jv-draft', requireAdmin, (req, res) => {
    try {
      if (!req.body || Object.keys(req.body).length) return res.status(400).json({ code:'find_deal_draft_request_invalid' });
      const context = { now:now(),operatorId:req.currentUser.id }; const original = db.readDBStrict();
      const deal = (original.reviewed_deals || []).find(d => d.id === req.params.id);
      if (!deal || deal.deal_kind !== 'jv') return res.status(404).json({code:'find_deal_not_found'});
      let store = activity.assign(original,'deal',deal.id);
      store = activity.recordEvent(store,'deal',deal.id,'jv_generated','Working JV draft generated; not signed.',context);
      const record = store.reviewed_deals.find(d => d.id === deal.id); db.writeDB(store);
      res.attachment('jv-term-sheet.txt').type('text/plain').send(deals.jvDraft(record,deals.evaluate(record,store.buyers,context.now)));
    } catch(e) { failure(res,e); }
  });
  app.use('/api/dashboard/todays-deals', (error,req,res,next) => {
    res.status(error.type==='entity.too.large'?413:400).json({code:'find_deal_request_invalid'});
  });
}
module.exports = { registerReviewedDealRoutes };
