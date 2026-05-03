'use strict';
var db = require('../../db');

// Skip Trace Agent — uses free public people search sites
// Requires Playwright (already in Dockerfile)
// Schedule: 0 3 * * * UTC — top 300 leads with no phone

async function scrapeWithPlaywright(address, city, state) {
  var playwright;
  try { playwright = require('playwright'); } catch(e) {
    console.error('[skip-trace] playwright not available: ' + e.message);
    return null;
  }

  var browser = null;
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    var context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    var page = await context.newPage();
    await page.setDefaultTimeout(20000);

    var result = await tryTruePeopleSearch(page, address, city, state);
    if (!result || !result.phone) {
      result = await tryFastPeopleSearch(page, address, city, state) || result;
    }

    await browser.close();
    return result;
  } catch(e) {
    console.error('[skip-trace] playwright error: ' + e.message);
    if (browser) { try { await browser.close(); } catch(e2) {} }
    return null;
  }
}

async function tryTruePeopleSearch(page, address, city, state) {
  try {
    var query = encodeURIComponent(address + ' ' + city + ' ' + state);
    var url = 'https://www.truepeoplesearch.com/find/resident?citystatezip=' + query;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    var result = await page.evaluate(function() {
      var out = { phone: null, owner_name: null, phones: [] };
      // Name
      var nameEl = document.querySelector('.card-block h2, .name, [data-link-to-details] h2');
      if (nameEl) out.owner_name = nameEl.textContent.trim();
      // Phones
      var phones = document.querySelectorAll('a[href^="tel:"]');
      phones.forEach(function(el) {
        var num = el.href.replace('tel:', '').trim();
        if (num.length >= 10) out.phones.push(num);
      });
      if (out.phones.length) out.phone = out.phones[0];
      return out;
    });

    return result;
  } catch(e) {
    console.error('[skip-trace] TruePeopleSearch error: ' + e.message);
    return null;
  }
}

async function tryFastPeopleSearch(page, address, city, state) {
  try {
    var addrSlug = (address + '-' + city + '-' + state).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    var url = 'https://www.fastpeoplesearch.com/address/' + addrSlug;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    var result = await page.evaluate(function() {
      var out = { phone: null, owner_name: null, phones: [] };
      var nameEl = document.querySelector('h2.fullname, .card-title, h3.name');
      if (nameEl) out.owner_name = nameEl.textContent.trim();
      var phones = document.querySelectorAll('a[href^="tel:"]');
      phones.forEach(function(el) {
        var num = el.href.replace('tel:', '').trim();
        if (num.length >= 10) out.phones.push(num);
      });
      if (out.phones.length) out.phone = out.phones[0];
      return out;
    });

    return result;
  } catch(e) {
    console.error('[skip-trace] FastPeopleSearch error: ' + e.message);
    return null;
  }
}

async function runSkipTraceAgent(opts) {
  opts = opts || {};
  var limit = opts.limit || 300;
  var force = opts.force || false;

  console.log('[skip-trace] starting, limit=' + limit);

  var allLeads;
  try {
    var dbModule = require('../../db');
    allLeads = dbModule.getLeads ? dbModule.getLeads() : [];
    if (!allLeads.length && dbModule.readDB) {
      var data = dbModule.readDB();
      allLeads = (data && data.leads) || [];
    }
  } catch(e) {
    console.error('[skip-trace] db error: ' + e.message);
    return { traced: 0, failed: 0 };
  }

  // Target: leads with no phone, highest motivation score first
  var targets = allLeads
    .filter(function(l) {
      if (!l.address || !l.city || !l.state) return false;
      if (!force && l.phone && l.phone.length > 7) return false;
      if (!force && l.skip_trace_attempted) return false;
      return true;
    })
    .sort(function(a, b) { return (b.motivation_score||0) - (a.motivation_score||0); })
    .slice(0, limit);

  console.log('[skip-trace] targets: ' + targets.length);

  var traced = 0; var failed = 0;
  for (var i = 0; i < targets.length; i++) {
    var lead = targets[i];
    try {
      var result = await scrapeWithPlaywright(lead.address, lead.city, lead.state);
      var update = { skip_trace_attempted: true, skip_trace_date: new Date().toISOString() };
      if (result && result.phone) {
        update.phone = result.phone;
        update.owner_name = result.owner_name || lead.owner_name || '';
        update.skip_trace_source = 'truepeoplesearch';
        traced++;
        console.log('[skip-trace] found phone for ' + lead.address + ': ' + result.phone);
      } else {
        failed++;
      }
      db.updateLead(lead.id, update);
    } catch(e) {
      console.error('[skip-trace] error on ' + lead.id + ': ' + e.message);
      failed++;
      try { db.updateLead(lead.id, { skip_trace_attempted: true }); } catch(e2) {}
    }
    // Rate limit: 3 seconds between requests
    var t = Date.now(); while(Date.now()-t < 3000) {}
  }

  console.log('[skip-trace] done. traced=' + traced + ' failed=' + failed);
  return { traced: traced, failed: failed, total: targets.length };
}

module.exports = { runSkipTraceAgent: runSkipTraceAgent };
