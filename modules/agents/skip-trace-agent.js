// modules/agents/skip-trace-agent.js
// Skip trace via SpyDialer API + TruePeopleSearch axios scrape
// No Playwright — works on $5 Railway plan (512MB)
// Daily: top 300 leads by motivation score with no phone
// On-demand: called when a lead is opened
'use strict';
const axios  = require('axios');
const cheerio = require('cheerio');
const db     = require('../../db');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── SpyDialer: reverse phone lookup (phone-focused) ─────────────────────────
// Note: SpyDialer works when we already HAVE a phone and need the name
// For address-to-phone, TruePeopleSearch is the primary source

// ── TruePeopleSearch: address → owner name + phones ─────────────────────────
async function scrapeTPSByAddress(address, city, state) {
  try {
    var zip = '';
    var citystate = encodeURIComponent((city||'') + ' ' + (state||'')).trim();
    var addrEnc = encodeURIComponent(address||'');
    var url = 'https://www.truepeoplesearch.com/find/resident?streetaddress=' + addrEnc + '&citystatezip=' + citystate;
    var res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    var $ = cheerio.load(res.data);
    var results = [];
    // Each person result
    $('.card-summary').each(function() {
      var name = $(this).find('.h4, .card-name, [data-link-to-do]').first().text().trim();
      var phones = [];
      $(this).find('.content-value').each(function() {
        var t = $(this).text().trim();
        if (/^[\(\d\+]/.test(t) && t.length >= 10) phones.push(t.replace(/[^0-9\+]/g,''));
      });
      var age = '';
      var ageMatch = $(this).text().match(/Age\s*(\d+)/);
      if (ageMatch) age = ageMatch[1];
      var relatives = [];
      $(this).find('.relative-name, .associates a').each(function() {
        var rn = $(this).text().trim();
        if (rn) relatives.push(rn);
      });
      if (name) results.push({ name, phones, age, relatives, source: 'TruePeopleSearch' });
    });
    return results;
  } catch(e) {
    console.error('[skip-trace] TPS error:', e.message);
    return [];
  }
}

// ── FastPeopleSearch fallback ────────────────────────────────────────────────
async function scrapeFPSByAddress(address, city, state) {
  try {
    var addrSlug = (address||'').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
    var citySlug = (city||'').toLowerCase().replace(/\s+/g,'-');
    var url = 'https://www.fastpeoplesearch.com/address/' + addrSlug + '_' + citySlug + '_' + (state||'');
    var res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    var $ = cheerio.load(res.data);
    var results = [];
    $('.card-block, .person-card').each(function() {
      var name = $(this).find('h2, .name, h3').first().text().trim();
      var phones = [];
      $(this).find('.phone, [href^="tel:"]').each(function() {
        var p = ($(this).attr('href')||'').replace('tel:','') || $(this).text().replace(/[^0-9]/g,'');
        if (p.length >= 10) phones.push(p);
      });
      var age = '';
      var ageM = $(this).text().match(/Age\s*(\d+)/);
      if (ageM) age = ageM[1];
      if (name) results.push({ name, phones, age, relatives: [], source: 'FastPeopleSearch' });
    });
    return results;
  } catch(e) {
    console.error('[skip-trace] FPS error:', e.message);
    return [];
  }
}

// ── CyberBackgroundChecks fallback ──────────────────────────────────────────
async function scrapeCBCByAddress(address, city, state) {
  try {
    var q = encodeURIComponent((address||'') + ' ' + (city||'') + ' ' + (state||'')).trim();
    var url = 'https://www.cyberbackgroundchecks.com/address/' + q;
    var res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    var $ = cheerio.load(res.data);
    var results = [];
    $('.person, .result-block').each(function() {
      var name = $(this).find('h2, h3, .name').first().text().trim();
      var phones = [];
      $(this).find('.phone, [href^="tel:"], .phone-number').each(function() {
        var p = ($(this).attr('href')||'').replace('tel:','') || $(this).text().replace(/[^0-9]/g,'');
        if (p.length >= 10) phones.push(p);
      });
      if (name) results.push({ name, phones, age: '', relatives: [], source: 'CyberBackgroundChecks' });
    });
    return results;
  } catch(e) {
    console.error('[skip-trace] CBC error:', e.message);
    return [];
  }
}

// ── Main skip trace: try all sources in order ────────────────────────────────
async function skipTraceLead(leadId) {
  var lead = db.getLeads().find(function(l) { return l.id === leadId; });
  if (!lead) return { error: 'Lead not found' };
  if (!lead.address) return { error: 'No address' };
  console.log('[skip-trace] Tracing:', lead.address, lead.city, lead.state);

  var results = [];
  var source = '';

  // 1. Try TruePeopleSearch first
  results = await scrapeTPSByAddress(lead.address, lead.city, lead.state);
  if (results.length) { source = 'TruePeopleSearch'; }

  // 2. FastPeopleSearch
  if (!results.length) {
    await sleep(1500);
    results = await scrapeFPSByAddress(lead.address, lead.city, lead.state);
    if (results.length) source = 'FastPeopleSearch';
  }

  // 3. CyberBackgroundChecks
  if (!results.length) {
    await sleep(1500);
    results = await scrapeCBCByAddress(lead.address, lead.city, lead.state);
    if (results.length) source = 'CyberBackgroundChecks';
  }

  var ts = new Date().toISOString();

  if (!results.length) {
    db.updateLead(leadId, { skip_trace_attempted: ts, skip_trace_result: 'not_found' });
    return { found: false, leadId, message: 'No results found on any source' };
  }

  // Pick the best result: most phones + most data
  results.sort(function(a, b) { return (b.phones.length + (b.age?1:0) + b.relatives.length) - (a.phones.length + (a.age?1:0) + a.relatives.length); });
  var best = results[0];

  // Format all phones — mobile (10-digit US) first
  var phones = best.phones.filter(function(p) { return p.replace(/\D/g,'').length === 10 || p.replace(/\D/g,'').length === 11; });
  var primary = phones[0] || '';

  var updates = {
    owner_name:          best.name || lead.owner_name || '',
    phone:               primary,
    phone_list:          phones,
    owner_age:           best.age || '',
    relatives:           best.relatives || [],
    skip_trace_source:   source,
    skip_trace_date:     ts,
    skip_trace_result:   'found',
    skip_trace_all:      results,
    added_at:            lead.added_at || lead.created_at || ts,
  };
  db.updateLead(leadId, updates);

  console.log('[skip-trace] Found:', best.name, 'phones:', phones.length, 'source:', source);
  return { found: true, leadId, name: best.name, phone: primary, phones, age: best.age, relatives: best.relatives, source, all_results: results };
}

// ── Daily batch: top 300 by motivation, no phone ────────────────────────────
async function runDailySkipTrace() {
  console.log('[skip-trace] Starting daily batch...');
  var leads = db.getLeads()
    .filter(function(l) { return !l.phone && l.address; })
    .sort(function(a, b) {
      var scoreA = (b.motivation_score||0)*2 + (b.priorityScore||0);
      var scoreB = (a.motivation_score||0)*2 + (a.priorityScore||0);
      return scoreA - scoreB;
    })
    .slice(0, 300);

  var found = 0, notFound = 0;
  for (var i = 0; i < leads.length; i++) {
    try {
      var r = await skipTraceLead(leads[i].id);
      if (r.found) found++; else notFound++;
      // Polite delay — 3-5 seconds between requests
      await sleep(3000 + Math.floor(Math.random() * 2000));
    } catch(e) {
      console.error('[skip-trace] batch error on', leads[i].id, e.message);
      notFound++;
    }
  }
  console.log('[skip-trace] Daily done. Found:', found, 'Not found:', notFound);
  return { found, notFound, total: leads.length };
}

module.exports = { skipTraceLead, runDailySkipTrace };
