// courthouse-addon/courthouse-runner.js
// Wraps scraper.js — called from server.js cron and API routes
'use strict';

const scraper = require('./scraper');

// Run all Playwright courthouse portals
// opts: { limit, state }
async function runCourthouseAutomation(opts) {
  opts = opts || {};
  console.log('[courthouse-runner] Starting courthouse scrape', JSON.stringify(opts));
  var result = await scraper.scrapeAllPortals(opts);
  console.log('[courthouse-runner] Done:', JSON.stringify({portals:result.portals, leads:result.leads}));
  return result;
}

module.exports = { runCourthouseAutomation, scrapeAllPortals: scraper.scrapeAllPortals };
