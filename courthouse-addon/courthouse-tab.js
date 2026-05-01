// courthouse-tab.js — standalone courthouse automation entry point
// patch_v4.js has been removed. This file is the real entry point.
'use strict';

var runner = null;
function getRunner() {
  if (runner) return runner;
  try {
    runner = require('./courthouse-runner');
    return runner;
  } catch(e) {
    console.error('[courthouse-tab] runner load error: ' + e.message);
    return null;
  }
}

// Called from server.js to register courthouse API routes
function registerCourthouseRoutes(app) {
  // POST /api/courthouse/run — manual trigger
  app.post('/api/courthouse/run', async function(req, res) {
    var r = getRunner();
    if (!r) return res.json({ ok: false, error: 'courthouse runner not available' });
    var states = req.body.states || null;
    try {
      var result = await r.runCourthouseAutomation({ states: states });
      res.json({ ok: true, summary: result.summary, leads: result.leads.length });
    } catch(e) {
      res.json({ ok: false, error: e.message });
    }
  });

  // GET /api/courthouse/status — health check
  app.get('/api/courthouse/status', function(req, res) {
    var r = getRunner();
    res.json({ ok: true, available: !!r, module: 'courthouse-runner' });
  });

  console.log('[courthouse-tab] routes registered: POST /api/courthouse/run, GET /api/courthouse/status');
}

module.exports = { registerCourthouseRoutes };
