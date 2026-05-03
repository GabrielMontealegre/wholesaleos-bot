'use strict';
var fetch = require('node-fetch');
var db = require('../../db');

// Comp Agent — fetches real ARV from Redfin + Zillow open data
// Runs daily at 4AM UTC. Also called on-demand via POST /api/leads/reanalyze

async function fetchRedfin(address, city, state) {
  var query = encodeURIComponent(address + ' ' + city + ' ' + state);
  var url = 'https://www.redfin.com/stingray/api/gis?al=1&market=nashville&num_homes=5&ord=redfin-recommended-asc&page_number=1&poly=&region_id=&region_type=&sf=1,2,3,4,5,6&start=0&status=9&uipt=1,2,3,4,5,6&v=8&render=csv&location=' + query;
  try {
    var res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      },
      timeout: 12000
    });
    if (!res.ok) return null;
    var text = await res.text();
    // Redfin returns CSV-like data; parse price from it
    var priceMatch = text.match(/\$(\d[\d,]+)/);
    if (priceMatch) {
      return parseInt(priceMatch[1].replace(/,/g, ''));
    }
    return null;
  } catch(e) {
    return null;
  }
}

async function fetchZillowEstimate(address, city, state, zip) {
  // Use Zillow's public search API
  var query = encodeURIComponent(address + ' ' + city + ' ' + state + ' ' + (zip||''));
  var url = 'https://www.zillow.com/homes/' + query.replace(/%20/g, '-') + '_rb/';
  try {
    var res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WholesaleOS/1.0)' },
      timeout: 10000
    });
    if (!res.ok) return null;
    var html = await res.text();
    // Extract Zestimate from JSON-LD
    var match = html.match(/"zestimate":(\d+)/);
    if (match) return parseInt(match[1]);
    match = html.match(/"price":(\d+)/);
    if (match) return parseInt(match[1]);
    return null;
  } catch(e) { return null; }
}

async function fetchAttomValue(address, state, zip) {
  // ATTOM public AVM endpoint (no key needed for basic)
  try {
    var encoded = encodeURIComponent(address);
    var res = await fetch('https://api.gateway.attomdata.com/propertyapi/v1.0.0/avm/detail?address1=' + encoded + '&address2=' + encodeURIComponent((zip||state)), {
      headers: { 'Accept': 'application/json', 'apikey': process.env.ATTOM_API_KEY||'' },
      timeout: 8000
    });
    if (!res.ok) return null;
    var data = await res.json();
    if (data && data.property && data.property[0] && data.property[0].avm) {
      return data.property[0].avm.amount && data.property[0].avm.amount.value;
    }
    return null;
  } catch(e) { return null; }
}

function estimateRepairs(violations, motivation) {
  var v = (violations || []).join(' ').toLowerCase() + ' ' + (motivation||'').toLowerCase();
  if (v.indexOf('fire') > -1) return 45000;
  if (v.indexOf('demo') > -1 || v.indexOf('unsafe') > -1 || v.indexOf('hazard') > -1) return 35000;
  if (v.indexOf('vacant') > -1 || v.indexOf('abandon') > -1) return 25000;
  if (v.indexOf('blight') > -1) return 20000;
  return 12000; // default light rehab for code violations
}

function calcDeal(arv, repairs) {
  if (!arv || arv <= 0) return null;
  var mao    = Math.round(arv * 0.70 - repairs);
  var offer  = Math.round(mao * 0.94);
  var spread = mao - offer;
  var feeL   = Math.round(spread * 0.35);
  var feeH   = Math.round(spread * 0.55);
  return { arv: arv, mao: mao, offer: offer, spread: spread, fee_lo: feeL, fee_hi: feeH, repairs: repairs };
}

async function analyzeLead(lead) {
  var arv = null;

  // Try Zillow first
  arv = await fetchZillowEstimate(lead.address, lead.city, lead.state, lead.zip);

  // Fallback to Redfin
  if (!arv || arv < 10000) {
    arv = await fetchRedfin(lead.address, lead.city, lead.state);
  }

  // Fallback to ATTOM if key exists
  if (!arv || arv < 10000) {
    arv = await fetchAttomValue(lead.address, lead.state, lead.zip);
  }

  if (!arv || arv < 10000) {
    return { analyzed: false, reason: 'no_arv_found' };
  }

  var violations = Array.isArray(lead.violations) ? lead.violations : [lead.violations||''];
  var repairs = estimateRepairs(violations, lead.motivation);
  var deal = calcDeal(arv, repairs);

  if (!deal || deal.mao <= 0) {
    return { analyzed: false, reason: 'mao_negative', arv: arv };
  }

  return {
    analyzed: true,
    arv: deal.arv,
    mao: deal.mao,
    offer: deal.offer,
    spread: deal.spread,
    fee_lo: deal.fee_lo,
    fee_hi: deal.fee_hi,
    repairs: deal.repairs,
    analysisStatus: 'complete',
    lead_type: 'deal_ready',
    comps_fetched_at: new Date().toISOString()
  };
}

async function runCompAgent(opts) {
  opts = opts || {};
  var batchSize = opts.batchSize || 50;
  var maxLeads  = opts.maxLeads  || 500;
  var force     = opts.force     || false;

  console.log('[comp-agent] starting batch=' + batchSize + ' max=' + maxLeads);

  var allLeads = db.getLeads ? db.getLeads() : [];
  if (!allLeads || !allLeads.length) {
    // Try db.read()
    try { var dbData = require('../../db').readDB ? require('../../db').readDB() : null; allLeads = dbData && dbData.leads ? dbData.leads : []; } catch(e) {}
  }

  // Prioritize: no ARV, highest motivation score
  var targets = allLeads
    .filter(function(l) {
      if (!l.address || !l.city || !l.state) return false;
      if (!force && l.arv && l.arv > 0) return false; // already has ARV
      if (l.analysisStatus === 'complete' && !force) return false;
      return true;
    })
    .sort(function(a, b) { return (b.motivation_score||0) - (a.motivation_score||0); })
    .slice(0, maxLeads);

  console.log('[comp-agent] targets: ' + targets.length + ' leads need ARV');

  var updated = 0; var failed = 0;
  for (var i = 0; i < targets.length; i++) {
    var lead = targets[i];
    try {
      var result = await analyzeLead(lead);
      if (result.analyzed) {
        db.updateLead(lead.id, result);
        updated++;
        if (updated % 10 === 0) console.log('[comp-agent] updated ' + updated + '/' + targets.length);
      } else {
        failed++;
      }
    } catch(e) {
      failed++;
      console.error('[comp-agent] error on ' + lead.id + ': ' + e.message);
    }
    // Small delay to avoid rate limiting
    var t = Date.now(); while(Date.now()-t < 500){}
  }

  console.log('[comp-agent] done. updated=' + updated + ' failed=' + failed);
  return { updated: updated, failed: failed, total: targets.length };
}

module.exports = { runCompAgent: runCompAgent, analyzeLead: analyzeLead };
