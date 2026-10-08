'use strict';
const records = require('./record-activity');
function registerRecordActivityRoutes(app, { db, requireAdmin, now = () => new Date().toISOString() }) {
  function error(res, e) { const known = /^find_[a-z_]+$/.test(e.code || ''); res.status(known ? e.status || 400 : 503).json({ code: known ? e.code : 'record_store_unavailable' }); }
  app.get('/api/dashboard/record-activity', requireAdmin, (req, res) => {
    try {
      const q = req.query;
      for (const k of ['from', 'to']) if (q[k]) {
        const parsed = Date.parse(q[k] + 'T00:00:00Z');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(q[k]) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== q[k]) return res.status(400).json({ code: 'find_activity_date_invalid' });
      }
      for (const k of ['from_ts','to_ts']) if(q[k] && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(q[k]) || !Number.isFinite(Date.parse(q[k])) || new Date(q[k]).toISOString().slice(0,10)!==q[k].slice(0,10))) return res.status(400).json({code:'find_activity_date_invalid'});
      res.set('Cache-Control', 'no-store').json({ ...records.listActivity(db.readDBStrict(), { reference: String(q.ref || '').slice(0, 60), type: String(q.type || '').slice(0, 40), from: q.from, to: q.to, fromTs:q.from_ts,toTs:q.to_ts,limit: q.limit, recordKind: String(q.kind || '').slice(0, 10), recordId: String(q.id || '').slice(0, 128) }), types: records.TYPES });
    } catch (e) { error(res, e); }
  });
  app.get('/api/dashboard/record-search', requireAdmin, (req, res) => {
    try { res.set('Cache-Control', 'no-store').json({ items: records.search(db.readDBStrict(), String(req.query.q || '')) }); } catch (e) { error(res, e); }
  });
  app.get('/api/dashboard/record-refs', requireAdmin, (_, res) => {
    try { const s = db.readDBStrict(); res.set('Cache-Control', 'no-store').json({ missing: { deals: (s.reviewed_deals || []).filter(r => !r.record_ref).length, buyers: (s.buyers || []).filter(r => !r.record_ref).length, leads: (s.leads || []).filter(r => !r.record_ref).length, matches: (s.record_matches || []).filter(r => !r.record_ref).length }, deal_reserve: records.sequenceFloorStatus(s), assignment_is_explicit: true }); } catch (e) { error(res, e); }
  });
  app.post('/api/dashboard/record-refs/assign', requireAdmin, (req, res) => {
    try {
      if (!req.body || req.body.confirm !== true || Object.keys(req.body).some(k => !['confirm', 'kinds'].includes(k))) return res.status(400).json({ code: 'find_ref_confirmation_required' });
      const kinds = req.body.kinds || ['buyer', 'deal', 'match'];
      if (!Array.isArray(kinds) || !kinds.length || kinds.some(k => !['buyer', 'deal', 'match'].includes(k))) return res.status(400).json({ code: 'find_ref_kinds_invalid' });
      const context = { now: now(), operatorId: req.currentUser.id };
      const before = db.readDBStrict();
      const result = records.assignMissing(before, context, kinds);
      if (result.count > 500) return res.status(409).json({ code: 'find_ref_operation_limit' });
      records.assertBoundedReferenceChanges(before, result.store);
      let backup = null;
      if (result.store !== before) {
        backup = db.backupReferenceStore(before);
        db.writeDB(result.store);
      }
      res.json({ ok: true, assigned: result.count, counts: result.counts, backup, legacy_leads_unchanged: true, facts_unchanged: true });
    } catch (e) { error(res, e); }
  });
  app.post('/api/dashboard/record-refs/lead/:id', requireAdmin, (req, res) => {
    try {
      if (!req.body || req.body.confirm !== true || Object.keys(req.body).some(k => k !== 'confirm')) return res.status(400).json({ code: 'find_ref_confirmation_required' });
      const before = db.readDBStrict();
      const updated = records.assignOnAction(before, 'lead', req.params.id, { now: now(), operatorId: req.currentUser.id });
      if (updated !== before) db.writeDB(updated);
      const lead = (updated.leads || []).find(row => String(row.id) === req.params.id);
      res.json({ ok: true, record_ref: lead.record_ref });
    } catch (e) { error(res, e); }
  });
  app.use(['/api/dashboard/record-refs','/api/dashboard/record-activity','/api/dashboard/record-search'], (error,req,res,next) => {
    res.status(error.type==='entity.too.large'?413:400).json({code:'find_activity_request_invalid'});
  });
}
module.exports = { registerRecordActivityRoutes };
