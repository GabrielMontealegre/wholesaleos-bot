'use strict';

const crypto = require('crypto');
const finds = require('./assistant-finds');
const pairing = require('../security/dashboard-pairing');
const imports = require('./buyer-find-import');
const reviewedDeals = require('../deals/reviewed-deals');
const REQUESTS_PER_HOUR = 12;

function registerAssistantFindRoutes(app, { db, requireAdmin, pairingOptions = {}, now = () => new Date().toISOString() }) {
  const requests = new Map();
  const previews = new Map();
  function expirePreviews(at) {
    for (const [id, entry] of previews) if (entry.expires <= at) previews.delete(id);
  }
  function agentOnly(req, res, next) {
    try {
      const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
      const at = Date.parse(now());
      const verified = pairing.verifyAgent(match ? match[1] : '', 'assistant_finds:write', { ...pairingOptions, now: at });
      if (!verified.ok) return res.status(401).json({ code: 'find_agent_required' });
      for (const [key, value] of requests) if (value.until <= at) requests.delete(key);
      const key = verified.payload.nonce;
      const entry = requests.get(key) || { count: 0, until: at + 3600000 };
      if (entry.count >= REQUESTS_PER_HOUR) {
        res.set('Retry-After', String(Math.ceil((entry.until - at) / 1000)));
        return res.status(429).json({ code: 'find_rate_limited' });
      }
      entry.count += 1;
      requests.set(key, entry);
      req.currentUser = { id: verified.user.id };
      next();
    } catch (_) { return res.status(401).json({ code: 'find_agent_required' }); }
  }
  function failure(res, error) {
    const known = error && /^find_[a-z_]+$/.test(error.code || '');
    return res.status(known ? error.status || 400 : 503).json({ code: known ? error.code : 'find_store_unavailable' });
  }
  app.post('/api/assistant/finds', agentOnly, (req, res) => {
    try {
      const at = now();
      const items = finds.validateItems(req.body, at);
      const result = finds.ingest(db.readDBStrict(), items, {
        now: at, operatorId: req.currentUser.id, actorLabel: 'Assistant', channel: 'assistant_dropbox', createId: () => 'BF' + crypto.randomUUID()
      });
      db.writeDB(result.store);
      res.set('Cache-Control', 'no-store');
      res.json({ results: result.results });
    } catch (error) { failure(res, error); }
  });
  app.all('/api/assistant/finds', (req, res) => res.status(405).set('Allow', 'POST').json({ code: 'find_dropbox_write_only' }));
  app.get('/api/dashboard/buyers-found', requireAdmin, (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json({ ...finds.listFinds(db.readDBStrict(), { now: now() }), capabilities: { can_import: true } });
    } catch (error) { failure(res, error); }
  });
  app.post('/api/dashboard/buyers-found/import/preview', requireAdmin, (req, res) => {
    try {
      const at = now();
      expirePreviews(Date.parse(at));
      if (previews.size >= 20) return res.status(429).json({ code: 'find_preview_limit' });
      const plan = imports.prepareImport(db.readDBStrict(), req.body, { now: at });
      const id = crypto.randomUUID();
      previews.set(id, { plan, actor: req.currentUser.id, expires: Date.parse(at) + 300000 });
      res.set('Cache-Control', 'no-store').json({ preview_id: id, ...plan.summary });
    } catch (error) { failure(res, error); }
  });
  app.post('/api/dashboard/buyers-found/import/commit', requireAdmin, (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.preview_id !== 'string' ||
          typeof body.bulk_approve !== 'boolean' || Object.keys(body).some(key => !['preview_id', 'bulk_approve'].includes(key))) {
        return res.status(400).json({ code: 'find_import_request_invalid' });
      }
      const at = now();
      expirePreviews(Date.parse(at));
      const preview = previews.get(body.preview_id);
      if (!preview || preview.actor !== req.currentUser.id) return res.status(409).json({ code: 'find_preview_required' });
      const result = imports.commitImport(db.readDBStrict(), preview.plan, {
        now: at, operatorId: req.currentUser.id, createId: () => 'BF' + crypto.randomUUID(), bulkApprove: body.bulk_approve
      });
      db.writeDB(result.store);
      previews.delete(body.preview_id);
      res.set('Cache-Control', 'no-store').json(result.summary);
    } catch (error) { failure(res, error); }
  });
  app.patch('/api/dashboard/buyers-found/:id', requireAdmin, (req, res) => {
    try {
      const context = { now: now(), operatorId: req.currentUser.id };
      const updated = reviewedDeals.synchronizeMatchReferences(finds.update(db.readDBStrict(), req.params.id, req.body, context), context);
      db.writeDB(updated);
      res.json({ ok: true });
    } catch (error) { failure(res, error); }
  });
  // Do not echo parser errors: they can contain the submitted contact data.
  app.use(['/api/assistant/finds', '/api/dashboard/buyers-found'], (error, req, res, next) => {
    if (res.headersSent) return next(error);
    return res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'find_request_invalid' });
  });
}

module.exports = { registerAssistantFindRoutes, REQUESTS_PER_HOUR };
