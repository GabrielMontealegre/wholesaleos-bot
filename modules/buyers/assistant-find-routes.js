'use strict';

const crypto = require('crypto');
const finds = require('./assistant-finds');
const pairing = require('../security/dashboard-pairing');
const REQUESTS_PER_HOUR = 12;

function registerAssistantFindRoutes(app, { db, requireAdmin, pairingOptions = {}, now = () => new Date().toISOString() }) {
  const requests = new Map();
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
        now: at, operatorId: req.currentUser.id, createId: () => 'BF' + crypto.randomUUID()
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
      res.json(finds.listFinds(db.readDBStrict(), { now: now() }));
    } catch (error) { failure(res, error); }
  });
  app.patch('/api/dashboard/buyers-found/:id', requireAdmin, (req, res) => {
    try {
      const updated = finds.update(db.readDBStrict(), req.params.id, req.body, { now: now(), operatorId: req.currentUser.id });
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
