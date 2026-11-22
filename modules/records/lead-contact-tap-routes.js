'use strict';

const records = require('./record-activity');
const { buildLeadContactBrief } = require('../research/lead-contact-brief');

function registerLeadContactTapRoutes(app, { db, requireAdmin, now = () => new Date().toISOString() }) {
  app.post('/api/dashboard/leads/:id/contact-tap', (_req, res, next) => {
    res.set('Cache-Control', 'no-store'); next();
  }, requireAdmin, (req, res) => {
    try {
      const input = req.body;
      if (!input || Object.keys(req.query || {}).length || !Object.hasOwn(input, 'confirm') || input.confirm !== true ||
          Object.keys(input).some(key => !['confirm', 'channel', 'number', 'request_id'].includes(key)) ||
          !['call', 'text'].includes(input.channel) || typeof input.number !== 'string' ||
          typeof input.request_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.request_id)) {
        return res.status(400).json({ code: 'contact_tap_invalid' });
      }
      const store = db.readDBStrict();
      if (!Array.isArray(store.leads) || !Array.isArray(store.users) ||
          (store.activities != null && !Array.isArray(store.activities))) throw Error();
      if (store.record_activity_sequence != null && (!Number.isSafeInteger(store.record_activity_sequence) || store.record_activity_sequence < 0) ||
          (store.activities || []).some(row => !row || row.record_sequence != null && (!Number.isSafeInteger(row.record_sequence) || row.record_sequence < 0))) throw Error();
      const actors = store.users.filter(user => user && user.id === req.currentUser.id && user.role === 'admin');
      if (actors.length !== 1) return res.status(403).json({ code: 'contact_tap_actor_required' });
      const leads = store.leads.filter(row => row && String(row.id) === req.params.id);
      if (leads.length !== 1) return res.status(409).json({ code: 'contact_tap_lead_unavailable' });
      const brief = buildLeadContactBrief(leads[0]);
      if (!brief.call_allowed || !brief.text_allowed || brief.phone.number !== input.number) {
        return res.status(409).json({ code: 'contact_tap_evidence_changed' });
      }
      const prior = (store.activities || []).filter(row => row && row.contact_request_id === input.request_id);
      if (prior.length) {
        if (prior.length !== 1 || prior[0].operator_id !== req.currentUser.id || prior[0].lead_id !== req.params.id ||
            prior[0].contact_channel !== input.channel || prior[0].contact_number !== input.number) {
          return res.status(409).json({ code: 'contact_tap_request_conflict' });
        }
        return res.json({ ok: true, duplicate: true, activity_id: prior[0].activity_id });
      }
      const timestamp = now();
      if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) throw Error();
      const result = records.recordEvent(store, 'lead', req.params.id, 'local_contact_requested',
        input.channel === 'call' ? 'Phone app requested; no call outcome recorded.' : 'Messages app requested; no text sent by the server.',
        { now: timestamp, operatorId: req.currentUser.id, channel: 'local_device' },
        { contact_request_id: input.request_id, contact_channel: input.channel, contact_number: brief.phone.number });
      db.writeDB(result);
      return res.json({ ok: true, duplicate: false, activity_id: result.activities.at(-1).activity_id });
    } catch (_) { return res.status(503).json({ code: 'contact_tap_unavailable' }); }
  });
}

module.exports = { registerLeadContactTapRoutes };
