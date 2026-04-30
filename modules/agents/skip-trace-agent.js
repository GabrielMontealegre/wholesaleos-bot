// modules/agents/skip-trace-agent.js
// Skip trace using SpyDialer (phone lookup) + axios/cheerio scraping
// No Playwright needed — works on $5 Railway plan
// Daily cron: 0 6 * * * — traces top 300 leads by motivation score with no phone
'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const db      = require('../../db');

const DELAY_MS = 3500; // be polite between requests
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

// ── Headers that look like a real browser ────────────────────────────────
var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

// ── SpyDialer phone reverse (works via API-style endpoint) ───────────────
async function spyDialerLookup(address, city, state) {
  try {
    var query = encodeURIComponent(address + " " + city + " " + state);
    var url = "https://www.spydialer.com/default.aspx";
    var res = await axios.get(url, {
      headers: HEADERS,
      timeout: 15000,
      params: { q: address + " " + city + " " + state }
    });
    var $ = cheerio.load(res.data);
    var phones = [];
    // SpyDialer result phone patterns
    $("[class*=phone],[class*=result],[class*=number]").each(function() {
      var txt = $(this).text().trim();
      var m = txt.match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g);
      if (m) phones = phones.concat(m);
    });
    return { phones: phones, source: "SpyDialer" };
  } catch(e) {
    console.error("[skip-trace] SpyDialer error:", e.message);
    return null;
  }
}

// ── CyberBackgroundChecks — highest quality free source ─────────────────
async function cyberBgCheck(address, city, state) {
  try {
    var slug = (address + "-" + city + "-" + state)
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-");
    var url = "https://www.cyberbackgroundchecks.com/address/" + slug;
    var res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    var $ = cheerio.load(res.data);
    var data = { phones: [], name: null, relatives: [], source: "CyberBackgroundChecks" };
    // Name
    var nameEl = $(".name, .person-name, h1, h2").first().text().trim();
    if (nameEl && nameEl.length > 3 && nameEl.length < 60) data.name = nameEl;
    // Phones — find all phone-formatted strings
    $("body").text().match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g)
      && ($("body").text().match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g))
      .forEach(function(p) { if (data.phones.indexOf(p) === -1) data.phones.push(p); });
    // Relatives
    $("[class*=relative],[class*=associate],[class*=family]").each(function() {
      var t = $(this).text().trim();
      if (t.length > 2 && t.length < 60) data.relatives.push(t);
    });
    return data;
  } catch(e) {
    console.error("[skip-trace] CyberBgCheck error:", e.message);
    return null;
  }
}

// ── TruePeopleSearch ─────────────────────────────────────────────────────
async function truePeopleSearch(address, city, state) {
  try {
    var url = "https://www.truepeoplesearch.com/results?streetaddress=" +
      encodeURIComponent(address) + "&citystatezip=" + encodeURIComponent(city + " " + state);
    var res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    var $ = cheerio.load(res.data);
    var data = { phones: [], name: null, relatives: [], age: null, source: "TruePeopleSearch" };
    // Name — first result card
    var nameEl = $(".card-title, .name, h2.h4").first().text().trim();
    if (nameEl && nameEl.length > 2 && nameEl.length < 60) data.name = nameEl;
    // Age
    var ageTxt = $("[class*=age]").first().text().trim();
    if (ageTxt) { var ageMatch = ageTxt.match(/\d+/); if (ageMatch) data.age = parseInt(ageMatch[0]); }
    // Phones
    $("[itemprop=telephone], .phone, [class*=phone]").each(function() {
      var t = $(this).text().trim().replace(/\s+/g, "");
      if (/^[\(]?\d{3}[\)\s.-]?\d{3}[\s.-]?\d{4}$/.test(t)) {
        if (data.phones.indexOf(t) === -1) data.phones.push(t);
      }
    });
    // Fallback: scan body text for phone patterns
    if (data.phones.length === 0) {
      var bodyPhones = $("body").text().match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g) || [];
      data.phones = [...new Set(bodyPhones)].slice(0, 5);
    }
    // Relatives
    $("[class*=relative],[class*=assoc]").each(function() {
      var t = $(this).text().trim();
      if (t.length > 2 && t.length < 60) data.relatives.push(t);
    });
    return data;
  } catch(e) {
    console.error("[skip-trace] TruePeopleSearch error:", e.message);
    return null;
  }
}

// ── FastPeopleSearch ─────────────────────────────────────────────────────
async function fastPeopleSearch(address, city, state) {
  try {
    var slug = address.toLowerCase().replace(/\s+/g, "-") + "-" +
      city.toLowerCase().replace(/\s+/g, "-") + "-" + state.toUpperCase();
    var url = "https://www.fastpeoplesearch.com/address/" + slug;
    var res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    var $ = cheerio.load(res.data);
    var data = { phones: [], name: null, relatives: [], source: "FastPeopleSearch" };
    var nameEl = $(".card-title, .name, h2").first().text().trim();
    if (nameEl && nameEl.length > 2 && nameEl.length < 60) data.name = nameEl;
    $("[itemprop=telephone],[class*=phone],.phone-number").each(function() {
      var t = $(this).text().trim();
      if (t.match(/\d{3}/) && data.phones.indexOf(t) === -1) data.phones.push(t);
    });
    if (data.phones.length === 0) {
      var bp = $("body").text().match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g) || [];
      data.phones = [...new Set(bp)].slice(0, 5);
    }
    return data;
  } catch(e) {
    console.error("[skip-trace] FastPeopleSearch error:", e.message);
    return null;
  }
}

// ── Merge all results, best data wins ────────────────────────────────────
function mergeResults(results) {
  var merged = { phones: [], name: null, relatives: [], age: null, sources: [] };
  results.filter(Boolean).forEach(function(r) {
    if (r.source) merged.sources.push(r.source);
    // Name: prefer longer, more complete names
    if (r.name && (!merged.name || r.name.length > merged.name.length)) merged.name = r.name;
    // Age
    if (r.age && !merged.age) merged.age = r.age;
    // Phones: deduplicate, normalize
    (r.phones || []).forEach(function(p) {
      var norm = p.replace(/[^\d]/g, "");
      if (norm.length === 10 && merged.phones.indexOf(norm) === -1) {
        merged.phones.push(norm);
      }
    });
    // Relatives
    (r.relatives || []).forEach(function(rel) {
      if (merged.relatives.indexOf(rel) === -1 && rel.length > 2) merged.relatives.push(rel);
    });
  });
  // Format phones: (XXX) XXX-XXXX
  merged.phones = merged.phones.slice(0, 6).map(function(p) {
    return "(" + p.slice(0,3) + ") " + p.slice(3,6) + "-" + p.slice(6);
  });
  merged.relatives = merged.relatives.slice(0, 5);
  return merged;
}

// ── Main: skip trace one lead ─────────────────────────────────────────────
async function skipTraceLead(leadId) {
  var lead = (db.getLeads() || []).find(function(l) { return l.id === leadId; });
  if (!lead) return { error: "Lead not found" };
  if (!lead.address) return { error: "No address" };
  var city  = lead.city  || "";
  var state = lead.state || "";
  console.log("[skip-trace] Tracing:", lead.address, city, state);
  // Run all sources in parallel
  var results = await Promise.allSettled([
    truePeopleSearch(lead.address, city, state),
    cyberBgCheck(lead.address, city, state),
    fastPeopleSearch(lead.address, city, state),
  ]);
  var data = mergeResults(results.map(function(r) {
    return r.status === "fulfilled" ? r.value : null;
  }));
  // Save to lead
  var updates = {
    skip_trace_date:    new Date().toISOString(),
    skip_trace_sources: data.sources,
    skip_trace_attempted: true,
  };
  if (data.phones.length > 0) {
    updates.phone       = data.phones[0];
    updates.phone_all   = data.phones;
  }
  if (data.name)      updates.owner_name = data.name;
  if (data.age)       updates.owner_age  = data.age;
  if (data.relatives && data.relatives.length) updates.relatives = data.relatives;
  db.updateLead(leadId, updates);
  console.log("[skip-trace] Done:", lead.address,
    "| Phone:", data.phones[0] || "none",
    "| Name:", data.name || "none",
    "| Sources:", data.sources.join(","));
  return {
    ok: true,
    lead_id: leadId,
    phone:   data.phones[0] || null,
    phones:  data.phones,
    name:    data.name,
    age:     data.age,
    relatives: data.relatives,
    sources: data.sources,
  };
}

// ── Daily batch: top 300 by motivation score with no phone ───────────────
async function runDailySkipTrace() {
  console.log("[skip-trace] Starting daily batch...");
  var leads = (db.getLeads() || [])
    .filter(function(l) { return !l.phone && !l.skip_trace_attempted && l.address; })
    .sort(function(a, b) {
      var scoreB = (b.motivation_score || 0) + (b.score || 0);
      var scoreA = (a.motivation_score || 0) + (a.score || 0);
      return scoreB - scoreA;
    })
    .slice(0, 300);
  console.log("[skip-trace] Queued:", leads.length, "leads");
  var found = 0, failed = 0;
  for (var i = 0; i < leads.length; i++) {
    try {
      var result = await skipTraceLead(leads[i].id);
      if (result && result.phone) found++;
      await sleep(DELAY_MS + Math.floor(Math.random() * 2000));
    } catch(e) {
      console.error("[skip-trace] Batch error on", leads[i].id, e.message);
      failed++;
    }
  }
  console.log("[skip-trace] Batch done:", found, "phones found,", failed, "errors");
  return { done: leads.length, found: found, failed: failed };
}

module.exports = { skipTraceLead, runDailySkipTrace };