// outreach.js — AI outreach engine with learning system
// Stores edits, learns tone, generates human messages

const db = require('../db');

// ── Tone learning system ──────────────────────────────────────────────────
function saveToneEdit(original, edited, context) {
  const dbData = db.readDB();
  if (!dbData.tone_learning) dbData.tone_learning = [];
  // Only store if meaningfully different
  if (original.trim() === edited.trim()) return;
  const similarity = computeSimilarity(original, edited);
  dbData.tone_learning.push({
    id: 'T' + Date.now(),
    original: original.slice(0, 500),
    edited: edited.slice(0, 500),
    context: context || 'general',
    similarity,
    created: new Date().toISOString(),
  });
  // Keep last 100 edits
  if (dbData.tone_learning.length > 100) dbData.tone_learning = dbData.tone_learning.slice(-100);
  db.writeDB(dbData);
}

function computeSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  return Math.round(intersection / Math.max(wordsA.size, wordsB.size) * 100);
}

function getToneLearnings() {
  return (db.readDB().tone_learning || []).slice(-20);
}

function getToneContext() {
  const learnings = getToneLearnings();
  if (!learnings.length) return '';
  // Extract patterns from edits
  const patterns = [];
  learnings.forEach(l => {
    if (l.similarity < 70) {
      patterns.push(`Changed: "${l.original.slice(0,60)}" → "${l.edited.slice(0,60)}"`);
    }
  });
  if (!patterns.length) return '';
  return `\n\nLEARNED TONE PREFERENCES (apply these):\n${patterns.slice(-5).join('\n')}`;
}

function getAutoSendEnabled() {
  const learnings = getToneLearnings();
  // Enable auto-send after 10+ edits with high similarity (AI learned the style)
  if (learnings.length < 10) return false;
  const avgSimilarity = learnings.reduce((s,l) => s + l.similarity, 0) / learnings.length;
  return avgSimilarity > 85;
}

// ── Message generation ────────────────────────────────────────────────────
function generateSellerSMS(lead) {
  const toneCtx = getToneContext();
  const name = lead.owner_name ? ` ${lead.owner_name.split(' ')[0]}` : '';
  const addr = lead.address?.split(',')[0] || 'your property';
  const offer = (lead.offer || 0).toLocaleString();
  return `Hi${name}, my name is Gabriel. I came across ${addr} and I'm a local cash buyer. I can offer $${offer} and close in 14 days — no repairs, no agents, no fees. Would you be open to a quick chat?`;
}

function generateSellerEmail(lead) {
  const toneCtx = getToneContext();
  const addr = lead.address || 'your property';
  const offer = (lead.offer || 0).toLocaleString();
  const arv = (lead.arv || 0).toLocaleString();
  return {
    subject: `Cash Offer — ${addr.split(',')[0]}`,
    body: `Hi,\n\nI hope this message finds you well. My name is Gabriel Montealegre and I invest in real estate in your area.\n\nI came across your property at ${addr} and I'd love to make you a straightforward cash offer.\n\nOffer: $${offer}\nClose: 14 days (or your timeline)\nCondition: As-is — no repairs needed\nFees: Zero agent commissions or closing costs\n\nI work with a network of investors and can move quickly. This is a genuine offer with no obligations.\n\nWould you be open to a 10-minute call this week?\n\nBest regards,\nGabriel Montealegre\nMontsan Real Estate Investment\n(Your phone number)\nmontsan.rei@gmail.com`
  };
}

function generateBuyerSMS(lead, buyer) {
  const addr = lead.address?.split(',')[0] || 'a property';
  const arv = ((lead.arv||0)/1000).toFixed(0);
  const offer = ((lead.offer||0)/1000).toFixed(0);
  const fee = ((lead.fee_lo||0)/1000).toFixed(0);
  return `Hey ${buyer.contact?.split(' ')[0] || buyer.name?.split(' ')[0] || 'there'}, Gabriel here. Got a deal in ${lead.county||'your area'} — ${addr}. ARV $${arv}K, price $${offer}K, assignment $${fee}K+. Fits your box. Interested?`;
}

function generateBuyerEmail(lead, buyer) {
  const addr = lead.address || 'property';
  const arv = (lead.arv||0).toLocaleString();
  const offer = (lead.offer||0).toLocaleString();
  const repairs = (lead.repairs||0).toLocaleString();
  const feeLo = (lead.fee_lo||0).toLocaleString();
  const feeHi = (lead.fee_hi||0).toLocaleString();
  const spread = (lead.spread||0).toLocaleString();
  return {
    subject: `Deal Alert: ${addr.split(',')[0]} | ARV $${((lead.arv||0)/1000).toFixed(0)}K | Fits Your Buy Box`,
    body: `Hey ${buyer.contact?.split(' ')[0] || 'there'},\n\nThought of you when this one came across my desk — it checks the boxes for what you're looking for.\n\n📍 ${addr}\n\n💰 NUMBERS:\n• ARV: $${arv}\n• Price: $${offer}\n• Repairs est.: $${repairs} (${lead.repair_class||'Medium'})\n• Assignment fee: $${feeLo}–$${feeHi}\n• Total spread: $${spread}\n\n🏠 PROPERTY:\n• ${lead.beds||'?'}BD / ${lead.baths||'?'}BA | ${(lead.sqft||0).toLocaleString()} sqft | Built ${lead.year||'?'}\n• ${lead.category} | ${lead.dom||0} days on market\n\n✅ WHY IT'S A GOOD DEAL:\n${lead.why_good_deal || 'Strong wholesale opportunity with motivated seller.'}\n\nI can send the full analysis and photos. Are you interested?\n\nGabriel Montealegre\nMontsan Real Estate Investment\nmontsan.rei@gmail.com`
  };
}

function generateCallScript(lead) {
  const addr = lead.address?.split(',')[0] || 'your property';
  const offer = (lead.offer||0).toLocaleString();
  return `Hi, may I speak with the owner of ${addr}?

[If yes]: Great, my name is Gabriel Montealegre — I'm a local real estate investor. I came across your property and I'd love to make you a cash offer if you're open to it.

[If they ask how you found them]: I research properties in the area and yours came up on my radar.

[Your offer]: I can offer $${offer} cash, close in 14 days, buy it as-is — no repairs, no agent fees, no hassle. 

[Key questions]:
1. Are you the sole owner, or are there others involved?
2. Is there a mortgage on the property? Roughly how much is owed?
3. What's your timeline — are you flexible, or do you need to move quickly?
4. What would make this a good deal for you?

[Close]: Based on what you've told me, I'd like to move forward. Can I come see the property this week?`;
}

function getOutreachHistory(leadId) {
  return (db.readDB().outreach_history || []).filter(o => o.leadId === leadId);
}

function saveOutreachRecord(leadId, type, message, status='pending') {
  const dbData = db.readDB();
  if (!dbData.outreach_history) dbData.outreach_history = [];
  dbData.outreach_history.push({
    id: 'O' + Date.now(),
    leadId, type, message, status,
    created: new Date().toISOString(),
  });
  if (dbData.outreach_history.length > 1000) dbData.outreach_history = dbData.outreach_history.slice(-1000);
  db.writeDB(dbData);
}

function updateOutreachStatus(id, status, response='') {
  const dbData = db.readDB();
  const record = (dbData.outreach_history||[]).find(o => o.id === id);
  if (record) { record.status = status; record.response = response; record.updated = new Date().toISOString(); }
  db.writeDB(dbData);
}

module.exports = {
  saveToneEdit, getToneContext, getToneLearnings, getAutoSendEnabled,
  generateSellerSMS, generateSellerEmail, generateBuyerSMS, generateBuyerEmail,
  generateCallScript, getOutreachHistory, saveOutreachRecord, updateOutreachStatus,
};
