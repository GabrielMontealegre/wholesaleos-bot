// courthouse-addon/scraper.js
// Playwright scraper for Accela, Acclaim, Tyler Tech, and custom portals
// Reads mastersheet.csv, scrapes each portal, saves leads to db
'use strict';

const db     = require('../db');
const path   = require('path');
const fs     = require('fs');
const axios  = require('axios');

// ── Playwright availability check ─────────────────────────────────────────
let pw = null;
function getPlaywright() {
  if (pw) return pw;
  try { pw = require('playwright'); return pw; }
  catch(e) { console.error('[scraper] Playwright not available:', e.message); return null; }
}

// ── Read mastersheet ──────────────────────────────────────────────────────
function readMastersheet() {
  var csvPath = path.join(__dirname, 'mastersheet.csv');
  var csv = fs.readFileSync(csvPath, 'utf8');
  var lines = csv.split('\n').filter(function(l){ return l.trim(); });
  var rows = [];
  lines.slice(1).forEach(function(line) {
    var inQ = false; var cur = ''; var parts = [];
    for(var i=0;i<line.length;i++) {
      var c = line[i];
      if(c==='"'){inQ=!inQ;}
      else if(c===','&&!inQ){parts.push(cur.trim());cur='';}
      else{cur+=c;}
    }
    parts.push(cur.trim());
    if(parts[3]) rows.push({state:parts[0],market:parts[1],type:parts[2],url:parts[3]});
  });
  return rows;
}

// ── Classify portal type ──────────────────────────────────────────────────
function classifyPortal(url) {
  var u = url.toLowerCase();
  if(u.indexOf('arcgis')>-1) return 'arcgis';
  if(u.indexOf('/resource/')>-1||u.indexOf('.json')>-1||u.match(/data\.[a-z]+\.(gov|org)/)) return 'socrata';
  if(u.indexOf('accela')>-1||u.indexOf('citizenaccess')>-1||u.indexOf('aca-prod')>-1) return 'accela';
  if(u.indexOf('acclaim')>-1) return 'acclaim';
  if(u.indexOf('tyler')>-1||u.indexOf('odyssey')>-1||u.indexOf('judiciallink')>-1) return 'tyler';
  return 'custom';
}

// ── Accela scraper ────────────────────────────────────────────────────────
async function scrapeAccela(page, url, market, state) {
  var leads = [];
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    // Try to find and click 'Search' without filters to get all recent cases
    var searchBtn = await page.$('input[value="Search"], button:has-text("Search"), #ctl00_PlaceHolderMain_btnNewSearch');
    if(searchBtn) {
      await searchBtn.click();
      await page.waitForTimeout(3000);
    }
    // Extract rows from results table
    var rows = await page.$$eval('table.ACA_Grid_HeaderBackGroundColor tr, .PermitList tr, table#tbl_worklist tr', function(rows) {
      return rows.map(function(r) {
        var cells = Array.from(r.querySelectorAll('td'));
        return cells.map(function(c){ return c.textContent.trim(); });
      }).filter(function(r){ return r.length > 2 && r.some(function(c){ return c.match(/\d{3,}|\d+\s+[A-Z]/i); }); });
    });
    rows.slice(0, 50).forEach(function(cells) {
      var addr = cells.find(function(c){ return c.match(/^\d+\s+[A-Z]/i); }) || '';
      if(addr.length > 5) leads.push({ address: addr.toUpperCase(), city: market.split(',')[0], state: state });
    });
  } catch(e) { console.error('[accela] '+market+':', e.message); }
  return leads;
}

// ── Acclaim scraper ───────────────────────────────────────────────────────
async function scrapeAcclaim(page, url, market, state) {
  var leads = [];
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    // Acclaim: search for recent filings
    var searchInput = await page.$('input[name*="search"], input[id*="search"], input[placeholder*="Search"]');
    if(searchInput) {
      await searchInput.fill('');
      var goBtn = await page.$('input[type="submit"], button[type="submit"]');
      if(goBtn) { await goBtn.click(); await page.waitForTimeout(3000); }
    }
    // Extract addresses from results
    var addrs = await page.$$eval('.search-result, .result-item, table tr', function(els) {
      return els.map(function(el){ return el.textContent; })
        .map(function(t){ var m=t.match(/\d+\s+[A-Za-z][\w\s]{3,30}(?:ST|AVE|BLVD|DR|LN|RD|WAY|CT|PL)/i); return m?m[0].toUpperCase():null; })
        .filter(Boolean);
    });
    addrs.slice(0,50).forEach(function(addr){
      leads.push({address:addr,city:market.split(',')[0],state:state});
    });
  } catch(e) { console.error('[acclaim] '+market+':', e.message); }
  return leads;
}

// ── Tyler Tech / Odyssey scraper ──────────────────────────────────────────
async function scrapeTyler(page, url, market, state) {
  var leads = [];
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    // Tyler: search for recent civil/probate/lien filings
    var rows = await page.$$eval('table.results tr, .case-list tr, tr', function(rows) {
      return rows.map(function(r){
        var cells = Array.from(r.querySelectorAll('td,th'));
        return cells.map(function(c){return c.textContent.trim();});
      }).filter(function(r){return r.length>1;});
    });
    rows.slice(0,50).forEach(function(cells){
      var addr = cells.find(function(c){return c.match(/^\d+\s+[A-Z]/i);}) || '';
      if(addr.length>5) leads.push({address:addr.toUpperCase(),city:market.split(',')[0],state:state});
    });
  } catch(e) { console.error('[tyler] '+market+':', e.message); }
  return leads;
}

// ── Custom/generic scraper ────────────────────────────────────────────────
async function scrapeCustom(page, url, market, state) {
  var leads = [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    // Generic: find any address-like text on page
    var text = await page.evaluate(function(){ return document.body.innerText; });
    var addrMatches = text.match(/\d+\s+[A-Z][A-Z\s]{2,25}(?:ST|AVE|BLVD|DR|LN|RD|WAY|CT|PL|STREET|AVENUE|BOULEVARD|DRIVE|LANE|ROAD)\b/gi) || [];
    var unique = [...new Set(addrMatches)].slice(0,50);
    unique.forEach(function(addr){
      leads.push({address:addr.toUpperCase(),city:market.split(',')[0],state:state});
    });
  } catch(e) { console.error('[custom] '+market+':', e.message); }
  return leads;
}

// ── Save leads to db ──────────────────────────────────────────────────────
function saveLeads(leads, row) {
  var added = 0;
  leads.forEach(function(lead) {
    if(!lead.address||lead.address.length<5) return;
    try {
      db.addLead({
        address:    lead.address,
        city:       lead.city || row.market.split(',')[0],
        state:      lead.state || row.state,
        zip:        lead.zip || '',
        county:     row.market,
        source:     row.market + ' ' + row.type,
        source_url: row.url,
        source_details: row.type,
        violations: [row.type],
        motivation: row.type.toLowerCase().indexOf('foreclos')>-1 ? 'pre_foreclosure' :
                    row.type.toLowerCase().indexOf('probate')>-1  ? 'probate' :
                    row.type.toLowerCase().indexOf('lien')>-1     ? 'tax_lien' : 'code_violation',
        motivation_score: row.type.toLowerCase().indexOf('foreclos')>-1 ? 90 :
                          row.type.toLowerCase().indexOf('probate')>-1  ? 85 :
                          row.type.toLowerCase().indexOf('lien')>-1     ? 80 : 65,
        lead_type: 'raw',
        arv: null, repairs: null,
      });
      added++;
    } catch(e) {}
  });
  return added;
}

// ── Main: scrape all Playwright-needed portals ─────────────────────────────
async function scrapeAllPortals(limit) {
  limit = limit || 5;
  var playwright = getPlaywright();
  if(!playwright) return { error: 'Playwright not installed' };
  var rows = readMastersheet();
  // Only portals that need Playwright
  var pwRows = rows.filter(function(r) {
    var t = classifyPortal(r.url);
    return t==='accela'||t==='acclaim'||t==='tyler'||t==='custom';
  });
  console.log('[scraper] Starting Playwright scrape of', pwRows.length, 'portals');
  var browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  var total = 0;
  for(var i=0; i<Math.min(pwRows.length, limit); i++) {
    var row = pwRows[i];
    var type = classifyPortal(row.url);
    console.log('[scraper] Scraping', row.market, '('+type+')');
    var page = await browser.newPage();
    await page.setExtraHTTPHeaders({'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'});
    var leads = [];
    try {
      if(type==='accela') leads = await scrapeAccela(page, row.url, row.market, row.state);
      else if(type==='acclaim') leads = await scrapeAcclaim(page, row.url, row.market, row.state);
      else if(type==='tyler') leads = await scrapeTyler(page, row.url, row.market, row.state);
      else leads = await scrapeCustom(page, row.url, row.market, row.state);
    } catch(e) { console.error('[scraper] Error on', row.market, e.message); }
    await page.close();
    var added = saveLeads(leads, row);
    console.log('[scraper]', row.market, ':', leads.length, 'scraped,', added, 'saved');
    total += added;
    await new Promise(function(r){ setTimeout(r, 2000); });
  }
  await browser.close();
  console.log('[scraper] Done. Total leads saved:', total);
  return { ok: true, portals: Math.min(pwRows.length, limit), leads: total };
}

module.exports = { scrapeAllPortals, readMastersheet, classifyPortal };