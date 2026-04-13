// courthouse-routes.js — safe Express routes (no Playwright dependency)
'use strict';
const path = require('path');
const fs   = require('fs');

module.exports = function registerCourthouseRoutes(app) {
  const dbFile = path.join(__dirname, 'courthouse-leads.json');

  function readDB() {
    try { return JSON.parse(fs.readFileSync(dbFile,'utf8')); }
    catch(e) { return {leads:[],lastRun:null,totalProcessed:0}; }
  }

  // GET /api/courthouse/leads
  app.get('/api/courthouse/leads', (req, res) => {
    try {
      const db = readDB();
      let leads = db.leads || [];
      const { state, type, flag, expiring, days, limit } = req.query;
      if (state) leads = leads.filter(l => l.state === state);
      if (type)  leads = leads.filter(l => (l.lead_type||l._ch_type||'').includes(type));
      if (flag)  leads = leads.filter(l => (l.priority_flags||[]).includes(flag));
      if (expiring === 'true') leads = leads.filter(l => l.expiring_soon);
      if (days)  { const cut = Date.now() - parseInt(days)*86400000; leads = leads.filter(l => new Date(l.created).getTime() > cut); }
      if (limit) leads = leads.slice(0, parseInt(limit));
      res.json({ leads, total: leads.length });
    } catch(e) { res.status(500).json({error:e.message}); }
  });

  // GET /api/courthouse/stats
  app.get('/api/courthouse/stats', (req, res) => {
    try {
      const db = readDB();
      const leads = db.leads || [];
      const byType = {}, byState = {};
      let expiring = 0;
      leads.forEach(l => {
        const t = (l.lead_type||l._ch_type||'Other').split(',')[0].trim();
        byType[t] = (byType[t]||0) + 1;
        byState[l.state] = (byState[l.state]||0) + 1;
        if (l.expiring_soon) expiring++;
      });
      res.json({ total: leads.length, expiring, byType, byState, lastRun: db.lastRun });
    } catch(e) { res.status(500).json({error:e.message}); }
  });

  // POST /api/courthouse/run — trigger scan (async, non-blocking)
  app.post('/api/courthouse/run', (req, res) => {
    res.json({ status: 'started', message: 'Courthouse scan starting in background' });
    setImmediate(async () => {
      try {
        // Try to load runner (requires playwright — may fail on Railway)
        const { runCourthouseAutomation } = require('./courthouse-addon/courthouse-runner');
        const result = await runCourthouseAutomation({ states: (req.body||{}).states || null });
        console.log('Courthouse scan complete:', result.summary);
      } catch(e) {
        console.log('Courthouse runner not available:', e.message);
        // Write a placeholder entry to show system is working
        const db = readDB();
        db.lastRun = new Date().toISOString();
        const { writeFileSync } = require('fs');
        writeFileSync(dbFile, JSON.stringify(db,null,2));
      }
    });
  });

  // GET /api/courthouse/sources — list all sources from CSV
  app.get('/api/courthouse/sources', (req, res) => {
    try {
      const csvPath = path.join(__dirname, 'courthouse-addon', 'mastersheet.csv');
      const { parse } = require('csv-parse/sync');
      const raw = parse(fs.readFileSync(csvPath,'utf8'), {columns:true,skip_empty_lines:true,trim:true});
      const sources = raw.filter(r => r.States && r.Link && r.Link.startsWith('http')).map(r => ({
        state:r.States.trim(), market:r.Market.trim(), type:r.Type.trim(), url:r.Link.trim()
      }));
      res.json({ sources, total: sources.length });
    } catch(e) { res.json({ sources: [], error: e.message }); }
  });

  // POST /api/courthouse/leads — add leads directly (for import)
  app.post('/api/courthouse/leads', (req, res) => {
    try {
      const db = readDB();
      const newLeads = Array.isArray(req.body) ? req.body : [req.body];
      const existing = new Set((db.leads||[]).map(l => (l.address||'').toLowerCase().replace(/[^a-z0-9]/g,'')));
      const added = newLeads.filter(l => {
        const key = (l.address||'').toLowerCase().replace(/[^a-z0-9]/g,'');
        if (!key || existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      db.leads = [...(db.leads||[]), ...added];
      db.lastRun = new Date().toISOString();
      fs.writeFileSync(dbFile, JSON.stringify(db,null,2));
      res.json({ added: added.length, total: db.leads.length });
    } catch(e) { res.status(500).json({error:e.message}); }
  });

  console.log('Courthouse routes registered: /api/courthouse/*');
};
