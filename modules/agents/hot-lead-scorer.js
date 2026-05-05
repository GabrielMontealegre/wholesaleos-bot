'use strict';

// modules/agents/hot-lead-scorer.js
// Scores leads based on SITUATION signals, not property value
// Based on 74,000+ wholesale outcome research — top signals that predict contracts
// Score >= 70 = HOT (immediate alert), 45-69 = WARM, < 45 = COLD

const SIGNALS = {
  // Tier 1 — Highest urgency (immediate legal/financial pressure)
  foreclosure:     { points: 35, label: 'Pre-Foreclosure', keywords: ['foreclosure','pre-fc','pre_fc','lis pendens','notice of default','nod'] },
  tax_delinquent:  { points: 28, label: 'Tax Delinquent', keywords: ['tax delinquent','tax lien','delinquent tax','unpaid tax','tax sale'] },
  fire_damaged:    { points: 30, label: 'Fire Damaged', keywords: ['fire','fire damage','fire damaged','burned','burnt'] },
  demolition:      { points: 32, label: 'Demolition Order', keywords: ['demolition','demo order','condemned','unsafe structure','unsafe building'] },
  // Tier 2 — High motivation (life events + financial distress)
  probate:         { points: 22, label: 'Probate/Estate', keywords: ['probate','estate','inherited','inheritance','deceased owner','death'] },
  vacant:          { points: 18, label: 'Vacant/Abandoned', keywords: ['vacant','abandoned','abandon','vacated','unoccupied'] },
  code_violation:  { points: 15, label: 'Code Violation', keywords: ['code violation','code enforcement','violation','blight','blighted'] },
  auction:         { points: 20, label: 'Auction Timeline', keywords: ['auction','sheriff sale','tax auction','trustee sale'] },
  // Tier 3 — Moderate signals
  absentee:        { points: 12, label: 'Absentee Owner', keywords: ['absentee','non-owner','out of state','investor owned'] },
  lien:            { points: 14, label: 'Lien', keywords: ['lien','mechanic lien','hoa lien','judgment lien'] },
  divorce:         { points: 16, label: 'Divorce/Distress', keywords: ['divorce','separation','distress'] },
  water_sewer:     { points: 10, label: 'Utility Issue', keywords: ['water lien','sewer','utility'] },
};

function scoreHotLead(lead) {
  const text = [
    lead.motivation || '',
    lead.violations || '',
    lead.source_details || '',
    lead.source || '',
    lead.category || '',
    lead.lead_type || '',
    (lead.good_deal_reasons || []).join(' '),
    (lead.violations_list || []).join(' '),
  ].join(' ').toLowerCase();

  let score = 0;
  const signals = [];
  const matched = [];

  Object.entries(SIGNALS).forEach(function([key, sig]) {
    var hit = sig.keywords.some(function(kw) { return text.indexOf(kw) > -1; });
    if (hit) {
      score += sig.points;
      signals.push(sig.label);
      matched.push(key);
    }
  });

  // Stacking bonus — multiple signals = exponential motivation
  if (matched.length >= 3) score += 25;
  else if (matched.length === 2) score += 12;

  // Priority boost from existing field
  if (lead.priority === 'HIGH') score += 10;
  if (lead.motivation_score > 75) score += 8;

  // Speed bonus — newer leads score higher (within 24h = fresh courthouse data)
  var created = new Date(lead.created_at || lead.createdAt || lead.created || Date.now());
  var hoursOld = (Date.now() - created.getTime()) / 3600000;
  if (hoursOld < 24)  score += 10;
  else if (hoursOld < 72) score += 5;

  // Cap at 100
  score = Math.min(100, Math.max(0, score));

  var tier, emoji, color;
  if (score >= 70)      { tier = 'HOT';  emoji = '🔥'; color = '#ef4444'; }
  else if (score >= 45) { tier = 'WARM'; emoji = '⚡'; color = '#f59e0b'; }
  else                  { tier = 'COLD'; emoji = '❄️'; color = '#6b7280'; }

  return {
    hot_score:    score,
    hot_tier:     tier,
    hot_emoji:    emoji,
    hot_color:    color,
    hot_signals:  signals,
    hot_signal_count: matched.length,
    hot_scored_at: new Date().toISOString(),
  };
}

function isHotLead(lead) {
  var s = scoreHotLead(lead);
  return s.hot_score >= 70;
}

module.exports = { scoreHotLead, isHotLead, SIGNALS };
