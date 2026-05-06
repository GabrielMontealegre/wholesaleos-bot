// courthouse-addon/scraper.js v2
// Playwright scraper — Accela, Acclaim, Tyler Tech, and custom portals
// Reads mastersheet.csv, scrapes each portal, saves leads to db
'use strict';

const db  = require('../db');
const path = require('path');
const fs   = require('fs');

// ── Playwright loader ──────────────────────────────────────────────────────
let _pw = null;
function getPW() {
  if (_pw) return _pw;
  try { _pw = require('playwright'); return _pw; }
  catch(e) { console.error('[scraper] Playwright not available:', e.message); return null; }
}

// ── Parse mastersheet.csv ──────────────────────────────────────────────────
function readMastersheet() {
  var csvPath = path.join(__dirname, 'mastersheet.csv');
  var csv = fs.readFileSync(csvPath, 'utf8');
  var lines = csv.split('\n').filter(l => l.trim() && !l.startsWith('IMPORT'));
  var rows = [];
  lines.slice(1).forEach(function(line) {
    var inQ=false, cur='', parts=[];
    for(var i=0;i<line.length;i++){
      var c=line[i];
      if(c==='"'){inQ=!inQ;}
      else if(c===','&&!inQ){parts.push(cur.trim());cur='';}
      else{cur+=c;}
    }
    parts.push(cur.trim());
    if(parts[3]&&parts[3].startsWith('http')) rows.push({state:parts[0],market:parts[1],type:parts[2],url:parts[3]});
  });
  return rows;
}

// ── Classify portal type ───────────────────────────────────────────────────
function classifyPortal(url) {
  var u = (url||'').toLowerCase();
  if(u.indexOf('arcgis')>-1||u.indexOf('hub.arcgis')>-1) return 'arcgis';
  if(u.match(/data\.[a-z]+\.(gov|org)/)||u.indexOf('/resource/')>-1||u.indexOf('catalog.data.gov')>-1||u.indexOf('opendata')>-1) return 'socrata';
  if(u.indexOf('aca-prod.accela')>-1||u.indexOf('citizenaccess')>-1||u.indexOf('aca.') >-1) return 'accela';
  if(u.indexOf('acclaim')>-1||u.indexOf('acclaimweb')>-1) return 'acclaim';
  if(u.indexOf('tylerhost')>-1||u.indexOf('tylertech')>-1||u.indexOf('odyssey')>-1||u.indexOf('publicaccess')>-1||u.indexOf('tylerpaw')>-1) return 'tyler';
  if(u.indexOf('energov')>-1) return 'energov';
  return 'custom';
}

// ── Common: extract addresses from page text ───────────────────────────────
function extractAddressesFromText(text, limit) {
  limit = limit || 60;
  var matches = text.match(/\d+\s+[A-Z][A-Za-z0-9\s]{2,30}(?:ST|AVE|BLVD|DR|LN|RD|WAY|CT|PL|STREET|AVENUE|BOULEVARD|DRIVE|LANE|ROAD|TERRACE|TER|CIRCLE|CIR|HIGHWAY|HWY|PKWY|PARKWAY)\b/gi) || [];
  return [...new Set(matches.map(a=>a.toUpperCase().trim()))].slice(0, limit);
}

// ── Launch browser with stealth settings ──────────────────────────────────
async function launchBrowser() {
  var pw = getPW();
  if (!pw) throw new Error('Playwright not available');
  return pw.chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
           '--disable-blink-features=AutomationControlled','--window-size=1280,900']
  });
}

// ── Accela scraper ─────────────────────────────────────────────────────────
// All Accela portals share the same platform (aca-prod.accela.com or citizenaccess)
// Strategy: navigate directly to enforcement search, submit empty search, parse grid
async function scrapeAccela(page, url, market, state, type) {
  var leads = [];
  try {
    // Navigate and wait for page to settle
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(3000);

    // Dismiss any CAPTCHA or disclaimer pages by clicking through
    var disclaimerBtn = page.locator('input[value="Continue"], button:has-text("Continue"), input[value="I Agree"], button:has-text("I Agree")').first();
    if (await disclaimerBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
      await disclaimerBtn.click();
      await page.waitForTimeout(2000);
    }

    // Click Search button (empty search returns recent records)
    var searchBtns = ['#ctl00_PlaceHolderMain_btnNewSearch',
      'input[value="Search"]', 'button:has-text("Search")',
      'a:has-text("Search")', '#btnSearch'];
    for (var sel of searchBtns) {
      try {
        var btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 }).catch(()=>false)) {
          await btn.click();
          await page.waitForTimeout(4000);
          break;
        }
      } catch(e) {}
    }

    // Try pagination to get more results — click "All" or increase page size
    var allLink = page.locator('a:has-text("All"), select[name*="PageSize"], #ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList_ddlPageSize');
    if (await allLink.isVisible({ timeout: 1500 }).catch(()=>false)) {
      try { await allLink.selectOption({label:'100'}); await page.waitForTimeout(2000); } catch(e) {}
    }

    // Extract data from Accela result grid — multiple possible selectors
    var gridData = await page.evaluate(function() {
      // Accela uses tables with class containing "Grid" or id containing "grid"
      var tables = Array.from(document.querySelectorAll('table'));
      var bestTable = tables.find(t => (t.id||'').match(/grid|list|result/i) || (t.className||'').match(/grid|result|aca/i)) || tables[1];
      if (!bestTable) return [];
      var rows = Array.from(bestTable.querySelectorAll('tr'));
      return rows.map(function(r){
        var cells = Array.from(r.querySelectorAll('td'));
        return cells.map(function(c){return c.textContent.replace(/\s+/g,' ').trim();});
      }).filter(function(r){return r.length>1 && r.some(function(c){return /\d/.test(c);});});
    });

    // Extract addresses from grid data
    gridData.forEach(function(cells) {
      var addrCell = cells.find(function(c){return /^\d+\s+[A-Za-z]/.test(c)&&c.length>8;});
      if (addrCell) {
        leads.push({address: addrCell.split('\n')[0].trim().toUpperCase(), city: market.split(',')[0], state: state});
      }
    });

    // Fallback: extract addresses from full page text
    if (leads.length === 0) {
      var text = await page.evaluate(()=>document.body.innerText);
      extractAddressesFromText(text, 50).forEach(addr => leads.push({address:addr,city:market.split(',')[0],state:state}));
    }

  } catch(e) { console.error('[accela] '+market+':', e.message.slice(0,100)); }
  return leads;
}

// ── Acclaim scraper ────────────────────────────────────────────────────────
// Acclaim Web is a consistent platform: same UI across all counties
// Strategy: open search, select "Mortgage/Lien/Deed" doc types, search last 30 days
async function scrapeAcclaim(page, url, market, state, type) {
  var leads = [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(3000);

    // Handle disclaimer/accept page
    var acceptBtn = page.locator('button:has-text("Accept"), input[value="Accept"], a:has-text("Accept"), button:has-text("I Agree")').first();
    if (await acceptBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
      await acceptBtn.click();
      await page.waitForTimeout(2000);
    }

    // Acclaim search form — set date range for last 30 days
    var today = new Date();
    var past30 = new Date(today - 30*24*3600000);
    var fmt = function(d){return (d.getMonth()+1)+'/'+d.getDate()+'/'+d.getFullYear();};

    // Fill date range
    var dateFrom = page.locator('input[id*="FromDate"], input[name*="fromDate"], input[placeholder*="From"]').first();
    var dateTo   = page.locator('input[id*="ToDate"],   input[name*="toDate"],   input[placeholder*="To"]').first();
    if (await dateFrom.isVisible({ timeout: 2000 }).catch(()=>false)) {
      await dateFrom.fill(fmt(past30));
      await page.waitForTimeout(300);
    }
    if (await dateTo.isVisible({ timeout: 2000 }).catch(()=>false)) {
      await dateTo.fill(fmt(today));
      await page.waitForTimeout(300);
    }

    // Submit search
    var searchBtn = page.locator('button:has-text("Search"), input[value="Search"], input[type="submit"]').first();
    if (await searchBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
      await searchBtn.click();
      await page.waitForTimeout(4000);
    }

    // Extract results — Acclaim shows a table with Legal Description / Address
    var text = await page.evaluate(()=>document.body.innerText);
    extractAddressesFromText(text, 60).forEach(addr => {
      leads.push({address:addr, city:market.split(',')[0], state:state});
    });

    // Also try structured extraction
    var tableData = await page.evaluate(function(){
      var rows = Array.from(document.querySelectorAll('table tr, .result-row, .search-result'));
      return rows.map(function(r){return r.textContent.replace(/\s+/g,' ').trim();}).filter(function(t){return t.length>10;});
    });
    tableData.forEach(function(row){
      var m = row.match(/\d+\s+[A-Z][A-Za-z\s]{3,25}(?:ST|AVE|BLVD|DR|LN|RD|WAY|CT|PL|STREET|AVENUE|DRIVE|ROAD)\b/i);
      if(m) leads.push({address:m[0].toUpperCase().trim(), city:market.split(',')[0], state:state});
    });

  } catch(e) { console.error('[acclaim] '+market+':', e.message.slice(0,100)); }
  return [...new Map(leads.map(l=>[l.address,l])).values()].slice(0,60);
}

// ── Tyler Tech / Odyssey scraper ──────────────────────────────────────────
// Tyler portals: PublicAccess, Odyssey, TylerPAW — all county court systems
// Strategy: search probate/civil case type, extract party addresses
async function scrapeTyler(page, url, market, state, type) {
  var leads = [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(3000);

    // Handle disclaimer
    var continueBtn = page.locator('input[value="Continue"], a:has-text("Continue"), button:has-text("Continue")').first();
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
      await continueBtn.click();
      await page.waitForTimeout(2000);
    }

    // Tyler: select case type = Probate or Civil, search last 30 days
    var caseTypeSelect = page.locator('select[id*="caseType"], select[name*="CaseType"], select[id*="Category"]').first();
    if (await caseTypeSelect.isVisible({ timeout: 2000 }).catch(()=>false)) {
      try {
        await caseTypeSelect.selectOption({label:'Probate'});
        await page.waitForTimeout(500);
      } catch(e) {
        try { await caseTypeSelect.selectOption({index:1}); } catch(e2){}
      }
    }

    // Set date range
    var today = new Date();
    var past30 = new Date(today - 30*24*3600000);
    var fmt = function(d){return (d.getMonth()+1)+'/'+d.getDate()+'/'+d.getFullYear();};
    var df = page.locator('input[id*="DateFrom"], input[name*="dateFrom"], input[id*="Filed"]').first();
    if (await df.isVisible({ timeout: 1500 }).catch(()=>false)) { await df.fill(fmt(past30)); }

    // Search
    var searchBtn = page.locator('input[value="Search"], button:has-text("Search"), input[id*="btnSearch"]').first();
    if (await searchBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
      await searchBtn.click();
      await page.waitForTimeout(5000);
    }

    // Extract case rows — Tyler shows party name and case details
    var text = await page.evaluate(()=>document.body.innerText);
    extractAddressesFromText(text, 60).forEach(addr => {
      leads.push({address:addr, city:market.split(',')[0], state:state});
    });

    // Structured extraction from Tyler result table
    var caseData = await page.evaluate(function(){
      var rows = Array.from(document.querySelectorAll('table.results tr, #SearchResults tr, table tr'));
      return rows.slice(1,61).map(function(r){
        var cells = Array.from(r.querySelectorAll('td'));
        return cells.map(function(c){return c.textContent.trim();});
      }).filter(function(r){return r.length>2;});
    });
    caseData.forEach(function(cells){
      var addrCell = cells.find(function(c){return /^\d+\s+[A-Za-z]/.test(c)&&c.length>8;});
      if(addrCell) leads.push({address:addrCell.toUpperCase().trim(),city:market.split(',')[0],state:state});
    });

  } catch(e) { console.error('[tyler] '+market+':', e.message.slice(0,100)); }
  return [...new Map(leads.map(l=>[l.address,l])).values()].slice(0,60);
}

// ── EnerGov scraper (Cape Coral and similar) ─────────────────────────────
async function scrapeEnerGov(page, url, market, state, type) {
  var leads = [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(3000);
    // EnerGov uses Angular SPA — search and extract
    var text = await page.evaluate(()=>document.body.innerText);
    extractAddressesFromText(text, 50).forEach(addr => leads.push({address:addr,city:market.split(',')[0],state:state}));
  } catch(e) { console.error('[energov] '+market+':', e.message.slice(0,100)); }
  return leads;
}

// ── Custom/generic scraper ────────────────────────────────────────────────
async function scrapeCustom(page, url, market, state, type) {
  var leads = [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(3000);
    var text = await page.evaluate(()=>document.body.innerText);
    extractAddressesFromText(text, 60).forEach(addr => leads.push({address:addr,city:market.split(',')[0],state:state}));
  } catch(e) { console.error('[custom] '+market+':', e.message.slice(0,100)); }
  return leads;
}

// ── Dedup leads array ─────────────────────────────────────────────────────
function dedupLeads(leads) {
  return [...new Map(leads.map(l=>[l.address+l.state,l])).values()];
}

// ── Save leads to db ──────────────────────────────────────────────────────
function motivationFromType(type) {
  var t = (type||'').toLowerCase();
  if(t.indexOf('foreclos')>-1) return {mot:'pre_foreclosure', score:90};
  if(t.indexOf('probate')>-1)  return {mot:'probate',         score:85};
  if(t.indexOf('lien')>-1)     return {mot:'tax_lien',        score:80};
  if(t.indexOf('tax')>-1)      return {mot:'tax_lien',        score:80};
  if(t.indexOf('fire')>-1)     return {mot:'fire_damaged',    score:88};
  if(t.indexOf('bankrupt')>-1) return {mot:'bankruptcy',      score:87};
  return {mot:'code_violation', score:65};
}

function saveLeads(leads, row) {
  var added = 0;
  var m = motivationFromType(row.type);
  leads.forEach(function(lead) {
    if(!lead.address||lead.address.length<8) return;
    // Basic address validity check — must have a number
    if(!/\d/.test(lead.address)) return;
    try {
      db.addLead({
        address:        lead.address,
        city:           lead.city || row.market.split(',')[0],
        state:          lead.state || row.state,
        zip:            lead.zip || '',
        county:         row.market,
        source:         'courthouse:'+row.market,
        source_url:     row.url,
        source_details: row.type,
        violations:     [row.type],
        motivation:     m.mot,
        motivation_score: m.score,
        lead_type:      'raw',
        arv:            null,
        repairs:        null,
      });
      added++;
    } catch(e) { console.error('[scraper] addLead error:', e.message.slice(0,60)); }
  });
  return added;
}

// ── Main: scrape all Playwright-needed portals ────────────────────────────
async function scrapeAllPortals(opts) {
  opts = opts || {};
  var limit   = opts.limit   || 999;
  var stateFilter = opts.state || null;
  var browser = null;
  var results = [];

  try {
    browser = await launchBrowser();
    var rows = readMastersheet();
    var pwTypes = ['accela','acclaim','tyler','custom','energov'];
    var targets = rows.filter(function(r){
      var t = classifyPortal(r.url);
      if(pwTypes.indexOf(t)===-1) return false;
      if(stateFilter && r.state !== stateFilter) return false;
      return true;
    }).slice(0, limit);

    console.log('[scraper] Starting Playwright scrape of', targets.length, 'portals');

    for(var i=0; i<targets.length; i++) {
      var row = targets[i];
      var type = classifyPortal(row.url);
      console.log('[scraper] ['+(i+1)+'/'+targets.length+'] '+row.market+' ('+type+')');
      var page = await browser.newPage();
      await page.setExtraHTTPHeaders({'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'});
      await page.setViewportSize({width:1280, height:900});
      var leads = [];
      try {
        if(type==='accela')  leads = await scrapeAccela(page,  row.url, row.market, row.state, row.type);
        else if(type==='acclaim') leads = await scrapeAcclaim(page, row.url, row.market, row.state, row.type);
        else if(type==='tyler')   leads = await scrapeTyler(page,   row.url, row.market, row.state, row.type);
        else if(type==='energov') leads = await scrapeEnerGov(page, row.url, row.market, row.state, row.type);
        else                      leads = await scrapeCustom(page,  row.url, row.market, row.state, row.type);
      } catch(e) { console.error('[scraper] Error on '+row.market+':', e.message.slice(0,100)); }
      await page.close().catch(()=>{});
      leads = dedupLeads(leads);
      var added = saveLeads(leads, row);
      console.log('[scraper]', row.market, ': found', leads.length, 'addresses,', added, 'new leads saved');
      results.push({market:row.market, type:type, found:leads.length, saved:added});
      // Polite delay between portals to avoid rate limiting
      await new Promise(r=>setTimeout(r, 2500));
    }
  } catch(e) {
    console.error('[scraper] Fatal:', e.message);
  } finally {
    if(browser) await browser.close().catch(()=>{});
  }

  var totalSaved = results.reduce(function(s,r){return s+r.saved;},0);
  console.log('[scraper] Done. Portals:', results.length, '| Total leads saved:', totalSaved);
  return { ok:true, portals:results.length, leads:totalSaved, results:results };
}

module.exports = { scrapeAllPortals, readMastersheet, classifyPortal };
