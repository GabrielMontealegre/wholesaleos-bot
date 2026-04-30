// modules/agents/comp-agent.js
// Real comps via Redfin (cheerio/axios) + Zillow JSON API + LLaMA 3.3 analysis
// Option B: no Playwright needed — axios requests work reliably on $5 Railway plan
'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const db      = require('../../db');
const { ask } = require('../../ai');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getRedfinComps(address, city, state) {
  try {
    const fullAddr = [address, city, state].filter(Boolean).join(', ');
    const geoUrl = 'https://www.redfin.com/stingray/do/location-autocomplete?location=' + encodeURIComponent(fullAddr) + '&v=2';
    const geoRes = await axios.get(geoUrl, { headers: HEADERS, timeout: 15000 });
    const raw = geoRes.data.toString().replace(/^[^{]*/, '');
    const geoData = JSON.parse(raw);
    const row = geoData && geoData.payload && geoData.payload.sections && geoData.payload.sections[0] && geoData.payload.sections[0].rows && geoData.payload.sections[0].rows[0];
    if (!row || !row.url) return null;
    await sleep(800 + Math.random() * 1200);
    const propRes = await axios.get('https://www.redfin.com' + row.url, { headers: HEADERS, timeout: 20000 });
    const $ = cheerio.load(propRes.data);
    const listPrice = parseInt($('[data-rf-test-id="abp-price"],.price-section .price').first().text().replace(/[^0-9]/g,'')) || 0;
    const beds  = parseInt($('[data-rf-test-id="abp-beds"]').first().text()) || 0;
    const baths = parseFloat($('[data-rf-test-id="abp-baths"]').first().text()) || 0;
    const sqft  = parseInt($('[data-rf-test-id="abp-sqFt"]').first().text().replace(/[^0-9]/g,'')) || 0;
    const propUrl = 'https://www.redfin.com' + row.url;
    // Try to get nearby sold comps
    let comps = [];
    try {
      await sleep(600 + Math.random() * 800);
      const soldUrl = 'https://www.redfin.com/stingray/api/gis?al=1&num_homes=8&ord=redfin-recommended-asc&sf=1,2,3,5,6,7&sold_within_days=180&start=0&status=9&uipt=1&v=8&region_id=' + (row.id || '') + '&region_type=2';
      const soldRes = await axios.get(soldUrl, { headers: { ...HEADERS, Referer: propUrl }, timeout: 15000 });
      const homes = (soldRes.data && soldRes.data.payload && soldRes.data.payload.homes) || [];
      comps = homes.slice(0, 6).map(function(h) {
        return {
          address: (h.streetLine && h.streetLine.value) || h.address || 'Unknown',
          price:   (h.price && h.price.value) || h.lastSalePrice || 0,
          sqft:    (h.sqFt && h.sqFt.value) || 0,
          beds:    h.beds || 0,
          baths:   h.baths || 0,
          soldDate: h.soldDate || h.lastSaleDate || '',
          pricePerSqft: (h.pricePerSqFt && h.pricePerSqFt.value) || 0,
          source:  'Redfin',
        };
      }).filter(function(c) { return c.price > 0; });
    } catch(e2) { console.error('[comp-agent] Redfin sold comps error:', e2.message); }
    return { subject: { listPrice, beds, baths, sqft, url: propUrl }, comps, source: 'Redfin' };
  } catch (e) {
    console.error('[comp-agent] Redfin error:', e.message);
    return null;
  }
}

async function getZillowComps(address, city, state) {
  try {
    const searchTerm = [address, city, state].filter(Boolean).join(' ');
    const searchState = JSON.stringify({
      pagination: { currentPage: 1 },
      usersSearchTerm: searchTerm,
      mapBounds: { west: -180, east: 180, south: -90, north: 90 },
      isMapVisible: false,
      filterState: {
        sortSelection: { value: 'globalrelevanceex' },
        isRecentlySold: { value: true },
        isForSaleByAgent: { value: false },
        isForSaleByOwner: { value: false },
        isNewConstruction: { value: false },
        isAuction: { value: false },
        isComingSoon: { value: false },
      },
      isListVisible: true,
    });
    const url = 'https://www.zillow.com/search/GetSearchPageState.htm?searchQueryState=' + encodeURIComponent(searchState) + '&wants={"cat1":["listResults"],"cat2":["total"]}&requestId=2';
    const res = await axios.get(url, {
      headers: { ...HEADERS, Referer: 'https://www.zillow.com/', Accept: 'application/json' },
      timeout: 20000,
    });
    const results = (res.data && res.data.cat1 && res.data.cat1.searchResults && res.data.cat1.searchResults.listResults) || [];
    if (!results.length) return null;
    const comps = results.slice(0, 6).map(function(h) {
      return {
        address:  h.address || h.streetAddress || 'Unknown',
        price:    h.price || h.unformattedPrice || 0,
        sqft:     h.area || h.livingArea || 0,
        beds:     h.beds || h.bedrooms || 0,
        baths:    h.baths || h.bathrooms || 0,
        soldDate: h.soldDate || h.dateSold || '',
        zestimate: h.zestimate || 0,
        pricePerSqft: h.area ? Math.round((h.price || h.unformattedPrice || 0) / h.area) : 0,
        source: 'Zillow',
      };
    }).filter(function(c) { return c.price > 0; });
    return { comps, source: 'Zillow' };
  } catch (e) {
    console.error('[comp-agent] Zillow error:', e.message);
    return null;
  }
}

function mergeComps(redfin, zillow) {
  var all = [];
  if (redfin && redfin.comps && redfin.comps.length) all = all.concat(redfin.comps);
  if (zillow && zillow.comps && zillow.comps.length) {
    zillow.comps.forEach(function(zc) {
      var dup = all.some(function(rc) {
        return rc.address && zc.address && rc.address.toLowerCase().indexOf(zc.address.toLowerCase().slice(0,8)) > -1;
      });
      if (!dup) all.push(zc);
    });
  }
  return all.filter(function(c) { return c.price > 50000; }).slice(0, 6);
}

async function analyzeCompsWithLLM(lead, comps, subjectData) {
  if (!comps.length) return null;
  var compSummary = comps.map(function(c, i) {
    return 'Comp ' + (i+1) + ': ' + c.address + ' — $' + c.price.toLocaleString() + ', ' + c.beds + 'bd/' + c.baths + 'ba, ' + (c.sqft||'?') + 'sqft, sold ' + (c.soldDate||'recently') + ', source: ' + c.source;
  }).join('\n');

  var prompt = 'You are a licensed real estate appraiser and wholesale investor analyst.\n\n' +
    'SUBJECT PROPERTY:\n' +
    'Address: ' + lead.address + ', ' + (lead.city||'') + ', ' + (lead.state||'') + '\n' +
    'Lead type: ' + (lead.lead_type||'raw') + '\n' +
    'Source/violation: ' + (lead.source||'') + ' — ' + ((lead.violations||[]).join(', ')||'N/A') + '\n' +
    'Estimated repairs: ' + (lead.repairs ? '$' + lead.repairs.toLocaleString() : 'Unknown') + '\n' +
    (subjectData ? 'Subject list price: $' + (subjectData.listPrice||'N/A') + ', Beds: ' + subjectData.beds + ', Baths: ' + subjectData.baths + ', Sqft: ' + subjectData.sqft + '\n' : '') +
    '\nRECENT SOLD COMPS (within 6 months, nearby):\n' + compSummary + '\n\n' +
    'TASK:\n' +
    '1. Calculate realistic ARV from comps. Weight recent sales higher. Adjust for sqft/bed differences.\n' +
    '2. Estimate repairs if unknown: light=$15k, medium=$35k, heavy=$65k based on lead type.\n' +
    '3. MAO = ARV x 0.70 - Repairs. Offer = MAO x 0.94. Spread = MAO - Offer. Fee_lo = Spread x 0.35. Fee_hi = Spread x 0.55.\n' +
    '4. Confidence: high (3+ comps within 0.25mi), medium (2 comps within 0.5mi), low (1 comp or >0.5mi).\n' +
    '\nRespond ONLY in this exact JSON (no markdown, no extra text):\n' +
    '{"arv":250000,"repairs":35000,"mao":140000,"offer":131600,"spread":8400,"fee_lo":2940,"fee_hi":4620,"arv_confidence":"high","comp_count":3,"arv_summary":"ARV $250k supported by 3 sales within 0.5mi averaging $248k.","comps_used":[{"address":"123 Main St","price":250000,"sqft":1200,"weight":"primary"}]}';

  try {
    var raw = await ask(prompt, 'You are a real estate analyst. Respond only with valid JSON. No markdown.', 1500);
    var clean = raw.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(clean);
    if (!parsed.arv || parsed.arv < 30000) return null;
    return parsed;
  } catch (e) {
    console.error('[comp-agent] LLM parse error:', e.message, 'raw:', (raw||'').slice(0,200));
    return null;
  }
}

async function fetchCompsForLead(leadId) {
  var lead = db.getLeads().find(function(l) { return l.id === leadId; });
  if (!lead) return { error: 'Lead not found' };
  if (!lead.address) return { error: 'No address on lead' };
  console.log('[comp-agent] Fetching comps for', lead.address, lead.city, lead.state);

  var results = await Promise.allSettled([
    getRedfinComps(lead.address, lead.city, lead.state),
    getZillowComps(lead.address, lead.city, lead.state),
  ]);
  var redfin = results[0].status === 'fulfilled' ? results[0].value : null;
  var zillow = results[1].status === 'fulfilled' ? results[1].value : null;
  var comps  = mergeComps(redfin, zillow);

  if (!comps.length) return { error: 'No comps found', lead_id: leadId };

  var analysis = await analyzeCompsWithLLM(lead, comps, redfin && redfin.subject);
  if (!analysis) return { error: 'LLM analysis failed', comps_raw: comps };

  var fullAddrEnc = encodeURIComponent([lead.address, lead.city, lead.state].filter(Boolean).join(', '));
  var addressSlug = (lead.address||'').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9-]/g,'');
  var citySlug    = (lead.city||'').replace(/\s+/g,'-');

  var updates = {
    arv:             analysis.arv,
    repairs:         analysis.repairs,
    mao:             analysis.mao,
    offer:           analysis.offer,
    spread:          analysis.spread,
    fee_lo:          analysis.fee_lo,
    fee_hi:          analysis.fee_hi,
    arv_confidence:  analysis.arv_confidence || 'medium',
    arv_summary:     analysis.arv_summary || '',
    comps:           comps,
    comps_used:      analysis.comps_used || [],
    comp_count:      comps.length,
    comps_fetched_at: new Date().toISOString(),
    analysisStatus:  'complete',
    lead_type:       'deal_ready',
    zillow_url:      'https://www.zillow.com/homes/' + addressSlug + '-' + citySlug + '-' + (lead.state||'') + '_rb/',
    redfin_url:      'https://www.redfin.com/search?location=' + fullAddrEnc,
    maps_url:        'https://maps.google.com/?q=' + fullAddrEnc,
    realauction_url: 'https://www.realauction.com',
  };
  db.updateLead(leadId, updates);
  console.log('[comp-agent] OK', lead.address, 'ARV $' + analysis.arv.toLocaleString(), comps.length + ' comps');
  return { ok: true, lead_id: leadId, address: lead.address, city: lead.city, state: lead.state,
    arv: analysis.arv, mao: analysis.mao, offer: analysis.offer, spread: analysis.spread,
    fee_lo: analysis.fee_lo, fee_hi: analysis.fee_hi, arv_summary: analysis.arv_summary,
    comp_count: comps.length, comps, comps_used: analysis.comps_used || [] };
}

async function runDailyCompBatch() {
  console.log('[comp-agent] Starting daily comp batch...');
  var leads = db.getLeads()
    .filter(function(l) { return !l.comps_fetched_at && l.address; })
    .sort(function(a,b) { return (b.motivation_score||0) - (a.motivation_score||0); })
    .slice(0, 100);
  var done = 0, failed = 0;
  for (var i = 0; i < leads.length; i++) {
    try {
      await fetchCompsForLead(leads[i].id);
      done++;
      await sleep(3000 + Math.random() * 2000);
    } catch(e) {
      console.error('[comp-agent] batch error', leads[i].id, e.message);
      failed++;
    }
  }
  console.log('[comp-agent] Daily batch done:', done, 'success,', failed, 'failed');
  return { done, failed };
}

module.exports = { fetchCompsForLead, runDailyCompBatch, getRedfinComps, getZillowComps };
