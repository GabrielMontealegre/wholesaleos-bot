// modules/agents/comp-agent.js
// Real comps via RentCast AVM API (free tier, works from Railway server)
// Set RENTCAST_API_KEY in Railway env vars (free at rentcast.io)
'use strict';

const axios = require('axios');
const db    = require('../../db');
const { ask } = require('../../ai');

const RENTCAST_KEY = process.env.RENTCAST_API_KEY || '';

// ── RentCast AVM — real automated valuation ──────────────────────────────
async function getRentCastAVM(address, city, state, zip) {
  if (!RENTCAST_KEY) throw new Error('RENTCAST_API_KEY not set in Railway env vars');
  const fullAddr = [address, city, state, zip].filter(Boolean).join(', ');
  const url = 'https://api.rentcast.io/v1/avm/value';
  const res = await axios.get(url, {
    params: { address: fullAddr, propertyType: 'Single Family', compCount: 5 },
    headers: { 'X-Api-Key': RENTCAST_KEY, 'Accept': 'application/json' },
    timeout: 20000
  });
  return res.data;
}

// ── RentCast comparable sales ─────────────────────────────────────────────
async function getRentCastComps(address, city, state, zip) {
  if (!RENTCAST_KEY) throw new Error('RENTCAST_API_KEY not set in Railway env vars');
  const fullAddr = [address, city, state, zip].filter(Boolean).join(', ');
  const url = 'https://api.rentcast.io/v1/avm/value';
  const res = await axios.get(url, {
    params: { address: fullAddr, propertyType: 'Single Family', compCount: 5 },
    headers: { 'X-Api-Key': RENTCAST_KEY, 'Accept': 'application/json' },
    timeout: 20000
  });
  const d = res.data;
  const comps = (d.comparables || []).map(function(c) {
    return {
      address: c.formattedAddress || c.address,
      price:   c.price || c.lastSalePrice,
      sqft:    c.squareFootage,
      beds:    c.bedrooms,
      baths:   c.bathrooms,
      soldDate: c.lastSaleDate,
      distance: c.distance,
      source:  'RentCast'
    };
  });
  return { avm: d.price, low: d.priceRangeLow, high: d.priceRangeHigh, comps };
}

// ── LLaMA analysis of comps → final ARV recommendation ───────────────────
async function analyzeWithLLaMA(lead, avm, comps) {
  const compStr = comps.slice(0, 5).map(function(c, i) {
    return (i+1) + '. ' + (c.address||'Unknown') + ' — $' + (c.price||0).toLocaleString()
      + (c.sqft ? ' | ' + c.sqft + 'sqft' : '')
      + (c.beds ? ' | ' + c.beds + 'bd/' + (c.baths||'?') + 'ba' : '')
      + (c.soldDate ? ' | Sold: ' + c.soldDate.slice(0,10) : '')
      + (c.distance ? ' | ' + c.distance.toFixed(2) + ' mi' : '');
  }).join('\n');
  const prompt = 'Address: ' + lead.address + ', ' + lead.city + ', ' + lead.state + '\n'
    + 'RentCast AVM: $' + (avm||0).toLocaleString() + '\n'
    + 'Comparable sales:\n' + compStr + '\n'
    + 'Property type: SFR | Lead type: ' + (lead.source||'Unknown') + '\n\n'
    + 'Based on these comps, give me a conservative ARV for a wholesale deal. '
    + 'Reply ONLY with JSON: {"arv":number,"confidence":"low|medium|high","arv_note":"1 sentence","repairs_estimate":number}'
    + ' — numbers only, no $ signs in JSON values.';
  try {
    const resp = await ask(prompt, 'You are a real estate analyst. Return only valid JSON.', 500);
    var clean = resp.replace(/\x60\x60\x60json|\x60\x60\x60/g,'').trim();
    return JSON.parse(clean);
  } catch(e) {
    // Fallback: use RentCast AVM directly
    return { arv: avm, confidence: 'medium', arv_note: 'Based on RentCast AVM', repairs_estimate: 25000 };
  }
}

// ── Main: fetch comps for one lead ───────────────────────────────────────
async function fetchCompsForLead(leadId) {
  const lead = (db.getLeads() || []).find(function(l) { return l.id === leadId; });
  if (!lead) return { error: 'Lead not found' };
  if (!lead.address) return { error: 'No address on lead' };
  if (!RENTCAST_KEY) return {
    error: 'RENTCAST_API_KEY not configured',
    fix: 'Add RENTCAST_API_KEY to Railway environment variables (free at rentcast.io)',
    arv: null
  };
  console.log('[comp-agent] Fetching comps for:', lead.address, lead.city, lead.state);
  try {
    const { avm, low, high, comps } = await getRentCastComps(
      lead.address, lead.city, lead.state, lead.zip
    );
    const analysis = await analyzeWithLLaMA(lead, avm, comps);
    const arv      = analysis.arv || avm;
    const repairs  = analysis.repairs_estimate || lead.repairs || 25000;
    const mao      = Math.round(arv * 0.70 - repairs);
    const offer    = Math.round(mao * 0.94);
    const spread   = mao - offer;
    const fee_lo   = Math.round(spread * 0.35);
    const fee_hi   = Math.round(spread * 0.55);
    // Save updated ARV to lead permanently
    db.updateLead(leadId, {
      arv, mao, offer, spread, repairs, fee_lo, fee_hi,
      comps_fetched_at: new Date().toISOString(),
      arv_source: 'RentCast',
      arv_confidence: analysis.confidence,
      arv_note: analysis.arv_note,
      analysisStatus: 'complete',
    });
    console.log('[comp-agent] Done:', lead.address, '| ARV: $' + arv.toLocaleString());
    return {
      ok: true,
      lead_id: leadId,
      arv, mao, offer, spread, repairs, fee_lo, fee_hi,
      arv_source: 'RentCast',
      arv_confidence: analysis.confidence,
      arv_note: analysis.arv_note,
      arv_range: { low, high },
      comp_count: comps.length,
      comps: comps.slice(0, 5),
      arv_summary: 'ARV $' + arv.toLocaleString() + ' (' + analysis.confidence + ' confidence)'
        + ' | ' + comps.length + ' comps via RentCast'
        + (analysis.arv_note ? ' — ' + analysis.arv_note : ''),
    };
  } catch(e) {
    console.error('[comp-agent] Error:', e.message);
    return { error: e.message, lead_id: leadId };
  }
}

module.exports = { fetchCompsForLead };