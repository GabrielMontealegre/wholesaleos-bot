/**
 * courthouse-routes.js — Express routes for Courthouse Deals tab
 *
 * ADD TO server.js (one line):
 *   require('./courthouse-addon/courthouse-routes')(app);
 *
 * This is the ONLY change needed to server.js.
 * All courthouse data stays in its own DB file.
 */

'use strict';

const path = require('path');

module.exports = function registerCourthouseRoutes(app) {
  const CourthouseDB      = require('./courthouse-addon/courthouse-db');
  const { runCourthouseAutomation, priorityScore } = require('./courthouse-addon/courthouse-runner');

  const db = new CourthouseDB(path.join(__dirname, 'courthouse-addon', 'courthouse-leads.json'));

  // ── GET /api/courthouse/leads ──────────────────────────────────
  app.get('/api/courthouse/leads', (req, res) => {
    try {
      const { state, type, flag, expiring, days, limit } = req.query;
      const filters = {
        state:    state    || null,
        type:     type     || null,
        flag:     flag     || null,
        expiring: expiring === 'true',
        daysBack: days ? parseInt(days) : null,
      };
      let leads = db.getLeads(filters);
      leads.sort((a, b) => priorityScore(b) - priorityScore(a));
      if (limit) leads = leads.slice(0, parseInt(limit));
      res.json({ leads, total: leads.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/courthouse/stats ──────────────────────────────────
  app.get('/api/courthouse/stats', (req, res) => {
    try {
      res.json(db.getStats());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/courthouse/run ───────────────────────────────────
  // Trigger a manual courthouse scan
  app.post('/api/courthouse/run', async (req, res) => {
    const { states } = req.body || {};
    res.json({ status: 'started', message: 'Courthouse scan running in background' });
    setImmediate(() => {
      runCourthouseAutomation({ states: states || null })
        .then(r => console.log('Courthouse scan complete:', r.summary))
        .catch(err => console.error('Courthouse scan error:', err.message));
    });
  });

  // ── GET /api/courthouse/sources ───────────────────────────────
  app.get('/api/courthouse/sources', (req, res) => {
    try {
      const { parse } = require('csv-parse/sync');
      const fs = require('fs');
      const csvPath = path.join(__dirname, 'courthouse-addon', 'mastersheet.csv');
      const raw = parse(fs.readFileSync(csvPath, 'utf8'), {
        columns: true, skip_empty_lines: true, trim: true
      });
      const sources = raw.filter(r => r.States && r.Link).map(r => ({
        state:  r.States, market: r.Market, type: r.Type, url: r.Link
      }));
      res.json({ sources, total: sources.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log('Courthouse routes registered: /api/courthouse/*');
};
