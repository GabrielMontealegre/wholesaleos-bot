// outreach.js — AI outreach engine with human tone and learning system

const db = require('../db');

// ── Lead quality scoring ──────────────────────────────────────────────────
function scoreLeadQuality(lead) {
  let score = 0;
  const reasons = [];

  // Spread score (0-30 pts)
  const spread = lead.spread || 0;
  const arv = lead.arv || 1;
  const equityPct = Math.round((arv - (lead.offer||0)) / arv * 100);
  if (spread > 80000)      { score += 30; reasons.push('Exceptional spread $' + Math.round(spread/1000) + 'K'); }
  else if (spread > 50000) { score += 22; reasons.push('Strong spread $' + Math.round(spread/1000) + 'K'); }
  else if (spread > 25000) { score += 14; reasons.push('Decent spread $' + Math.round(spread/1000) + 'K'); }
  else if (spread > 10000) { score += 6;  reasons.push('Thin spread'); }

  // Distress score (0-25 pts)
  const cat = (lead.category||'').toLowerCase();
  if (['pre-fc','pre-foreclosure'].includes(cat)) { score += 25; reasons.push('Pre-foreclosure urgency'); }
  else if (cat === 'reo')                         { score += 20; reasons.push('Bank-owned REO'); }
  else if (cat === 'probate')                     { score += 18; reasons.push('Probate — estate sale'); }
  else if (cat === 'tax delinquent')              { score += 16; reasons.push('Tax delinquent'); }
  else if (cat === 'auction')                     { score += 15; reasons.push('Auction timeline'); }
  else if (cat === 'fsbo')                        { score += 12; reasons.push('FSBO — flexible seller'); }
  else if (cat === 'long dom')                    { score += 10; reasons.push('Long days on market'); }

  // Days on market (0-15 pts)
  const dom = lead.dom || 0;
  if (dom > 120)      { score += 15; reasons.push('120+ days — motivated'); }
  else if (dom > 60)  { score += 10; reasons.push('60+ days on market'); }
  else if (dom > 30)  { score += 5; }

  // Data completeness (0-15 pts)
  if (lead.phone)   { score += 5; }
  if (lead.email)   { score += 5; }
  if (lead.arv > 0 && lead.offer > 0) { score += 5; }

  // Risk modifier
  if (lead.risk === 'Low')    score += 10;
  else if (lead.risk === 'High') score -= 10;

  // Vacancy/motivation signals
  const distress = (lead.distress_signals||[]).join(' ').toLowerCase();
  if (distress.includes('vacant')) { score += 8; reasons.push('Vacant property'); }
  if (distress.includes('relocat')) { score += 5; reasons.push('Owner relocated'); }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  let label, color, emoji;
  if (score >= 65)      { label = 'High Quality'; color = '#34c759'; emoji = '🔥'; }
  else if (score >= 35) { label = 'Medium Quality'; color = '#ff9500'; emoji = '⚡'; }
  else                  { label = 'Low Quality'; color = '#86868b'; emoji = '❄️'; }

  return { score, label, color, emoji, reasons };
}

// ── Tone learning system ──────────────────────────────────────────────────
function saveToneEdit(original, edited, context) {
  if (!original || original.trim() === edited.trim()) return;
  const dbData = db.readDB();
  if (!dbData.tone_learning) dbData.tone_learning = [];
  dbData.tone_learning.push({
    id: 'T' + Date.now(),
    original: original.slice(0,500),
    edited: edited.slice(0,500),
    context: context || 'general',
    created: new Date().toISOString(),
  });
  if (dbData.tone_learning.length > 100) dbData.tone_learning = dbData.tone_learning.slice(-100);
  db.writeDB(dbData);
}

function getToneLearnings() {
  return (db.readDB().tone_learning || []).slice(-20);
}

function getAutoSendEnabled() {
  const learnings = getToneLearnings();
  if (learnings.length < 10) return false;
  return true;
}

// ── Human-tone message generators ────────────────────────────────────────
const SMS_OPENERS = [
  "Hey, hope you're doing well.",
  "Hi there, quick question for you.",
  "Hey, I came across something and wanted to reach out.",
  "Hi, hope I'm not catching you at a bad time.",
  "Hey, I was in the area and noticed something.",
];

const EMAIL_GREETINGS = [
  "Hi there,", "Hello,", "Hi,", "Good morning,", "Hey there,",
];

const EMAIL_OPENERS = [
  "I hope this finds you well.",
  "Hope you're having a good week.",
  "I wanted to reach out about something.",
  "I came across your property and figured I'd reach out directly.",
  "I noticed your property and wanted to get in touch.",
];

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateSellerSMS(lead, quality) {
  const addr = lead.address?.split(',')[0] || 'your property';
  const q = quality || scoreLeadQuality(lead);

  const variants = {
    high: [
      `${rnd(SMS_OPENERS)} I came across ${addr} and I'm genuinely interested — would you be open to a quick chat?`,
      `Hey, I saw ${addr} and I think there might be something we can work out. Would you have 5 minutes to talk?`,
      `Hi, I'm a local real estate investor and your property at ${addr} caught my attention. Any chance you'd be open to a conversation?`,
    ],
    medium: [
      `${rnd(SMS_OPENERS)} I noticed ${addr} and was curious — is it still something you're looking to move on?`,
      `Hi, I saw your property at ${addr} and wanted to see if you'd considered any offers. No pressure at all.`,
      `Hey, I came across ${addr} and just wanted to check — would you be open to hearing from a local buyer?`,
    ],
    low: [
      `Hi, I'm a local investor and I noticed ${addr}. If you're ever considering selling, I'd love to chat.`,
      `Hey, I came across your property at ${addr} and wanted to say hi. Feel free to reach out anytime.`,
      `Hi, just a quick note — I'm a local buyer interested in properties in your area. No rush, just wanted to connect.`,
    ],
  };

  const tier = q.score >= 65 ? 'high' : q.score >= 35 ? 'medium' : 'low';
  return rnd(variants[tier]);
}

function generateSellerEmail(lead, quality) {
  const addr = lead.address?.split(',')[0] || 'the property';
  const city = lead.address?.split(',')[1]?.trim() || lead.county || 'your area';
  const q = quality || scoreLeadQuality(lead);
  const greeting = rnd(EMAIL_GREETINGS);
  const opener = rnd(EMAIL_OPENERS);

  const subjects = [
    `Quick question about ${addr}`,
    `Regarding ${addr} — local buyer`,
    `Interested in ${addr}`,
    `${addr} — would love to connect`,
    `A note about your property on ${addr.split(' ').slice(-2).join(' ')}`,
  ];

  let body;
  if (q.score >= 65) {
    body = `${greeting}\n\n${opener}\n\nMy name is Gabriel Montealegre and I invest in real estate in ${city}. I came across your property at ${addr} and I'm genuinely interested in learning more about it.\n\nI work with cash and can move quickly if the numbers make sense for both of us. I'm not an agent — just a local investor looking to have a straightforward conversation.\n\nWould you be open to a quick call this week? Even just 10 minutes.\n\nNo pressure either way — I just figured a direct conversation is easier than going back and forth.\n\nBest,\nGabriel Montealegre\nMontsan Real Estate Investment\nmontsan.rei@gmail.com`;
  } else if (q.score >= 35) {
    body = `${greeting}\n\n${opener}\n\nI'm Gabriel, a local real estate investor based in the area. I noticed your property at ${addr} and wanted to reach out directly.\n\nI buy properties in various situations — sometimes people are looking to sell quickly, sometimes they just want to explore options. Either way, I'm happy to have a no-pressure conversation.\n\nIf you're open to it, I'd love to connect and learn a bit more about the property and what you're looking for.\n\nFeel free to reply here or give me a call anytime.\n\nBest,\nGabriel Montealegre\nMontsan Real Estate Investment\nmontsan.rei@gmail.com`;
  } else {
    body = `${greeting}\n\n${opener}\n\nMy name is Gabriel and I invest in real estate locally. I came across ${addr} and wanted to introduce myself.\n\nIf you ever think about selling — now or down the road — I'd be happy to have a casual conversation. No agents, no fees, no pressure.\n\nJust wanted to put my name out there. Feel free to reach out whenever it makes sense.\n\nBest,\nGabriel Montealegre\nMontsan Real Estate Investment\nmontsan.rei@gmail.com`;
  }

  return { subject: rnd(subjects), body };
}

function generateCallScript(lead, quality) {
  const addr = lead.address?.split(',')[0] || 'the property';
  const q = quality || scoreLeadQuality(lead);
  const cat = lead.category || '';

  let situationNote = '';
  if (cat === 'Pre-FC' || cat.includes('Foreclosure')) situationNote = 'Note: Seller may be under time pressure. Lead with empathy, not urgency.';
  else if (cat === 'Probate') situationNote = 'Note: This may be an estate. Be extra respectful — they may be grieving.';
  else if (cat === 'FSBO') situationNote = 'Note: Owner chose not to use an agent. They value directness and saving money.';
  else if (cat === 'Auction') situationNote = 'Note: Auction timeline creates urgency on their end. Be solution-focused.';

  return `CALL SCRIPT — ${addr}
${q.emoji} ${q.label} (Score: ${q.score}/100)
${situationNote ? '\n⚠️ ' + situationNote : ''}

─────────────────────────────────
OPENER (always ask permission first)
─────────────────────────────────
"Hi, may I speak with the owner of the property on ${addr}?"

[If asked who you are]:
"My name is Gabriel — I'm a local real estate investor. I had a quick question about the property if you have just a couple minutes?"

[If they say yes]:
"Thank you so much, I appreciate it."

─────────────────────────────────
BUILD RAPPORT (30-60 seconds)
─────────────────────────────────
"I came across the property and it caught my attention. How long have you owned it?"

[Listen, acknowledge]

"That's great. Are you still living there, or is it vacant right now?"

─────────────────────────────────
SOFT QUALIFICATION
─────────────────────────────────
"I don't want to be too forward, but I wanted to ask — have you had any thoughts about selling it at some point?"

[If yes]:
"That's great to hear. What's your situation like — are you in a rush, or is it more of a when-the-time-is-right thing?"

[If no]:
"Totally understand, no pressure at all. Would it be okay if I kept your number in case anything changes? Sometimes my clients are looking for specific areas."

─────────────────────────────────
IF INTERESTED — SOFT DISCOVERY
─────────────────────────────────
"Just so I understand your situation — is there a mortgage still on it, or do you own it free and clear?"

"And what are you hoping to get out of it, roughly? Just want to make sure anything I put together makes sense for you."

─────────────────────────────────
CLOSING
─────────────────────────────────
[If motivated]:
"That's really helpful, thank you. Based on what you've told me, I'd love to come take a quick look — would that work for you this week?"

[If not ready]:
"No worries at all. I'll send you a quick text with my number — reach out whenever you're ready. I'm not going anywhere."

─────────────────────────────────
OBJECTION HANDLING
─────────────────────────────────
"I'm not interested" → "Totally understand, I appreciate you picking up. If anything changes, feel free to reach out."

"I already have an agent" → "No problem at all — I sometimes work alongside agents. Just wanted to introduce myself."

"What's your offer?" → "I'd love to give you a real number, but I'd need to see the property first to be fair to you. Could we set up a quick walkthrough?"

"Is this a scam?" → "Completely fair question. I'm a local investor — I can send you my info and you can look me up. Happy to meet in person too."`;
}

function generateBuyerSMS(lead, buyer) {
  const city = lead.address?.split(',')[1]?.trim() || lead.county || 'the area';
  const type = lead.type || 'SFR';
  const beds = lead.beds || '?';
  const sqft = lead.sqft || '?';
  const name = buyer.contact?.split(' ')[0] || buyer.name?.split(' ')[0] || 'there';
  return `Hey ${name}, Gabriel here. Got a ${type} in ${city} — ${beds}bd, ~${sqft}sqft, solid spread. Might fit your box. Want me to send details?`;
}

function generateBuyerEmail(lead, buyer) {
  const city = lead.address?.split(',')[1]?.trim() || lead.county || 'the area';
  const state = lead.state || 'TX';
  const type = lead.type || 'SFR';
  const beds = lead.beds || '?';
  const baths = lead.baths || '?';
  const sqft = (lead.sqft||0).toLocaleString();
  const arv = ((lead.arv||0)/1000).toFixed(0);
  const repairs = ((lead.repairs||0)/1000).toFixed(0);
  const spread = ((lead.spread||0)/1000).toFixed(0);
  const feeLo = ((lead.fee_lo||0)/1000).toFixed(0);
  const feeHi = ((lead.fee_hi||0)/1000).toFixed(0);
  const cat = lead.category || 'Off-Market';
  const dom = lead.dom || 0;
  const repClass = lead.repair_class || 'Medium';
  const name = buyer.contact?.split(' ')[0] || 'there';

  return {
    subject: `Deal Alert — ${type} in ${city}, ${state} | ARV $${arv}K — Matches Your Buy Box`,
    body: `Hey ${name},\n\nI've got a deal I think you'll want to look at — it lines up with what you're typically looking for.\n\nHere's the quick summary:\n\n📍 Location: ${city}, ${state}\n🏠 Property: ${type} — ${beds}BD / ${baths}BA — ${sqft} sqft\n📋 Situation: ${cat} — ${dom} days on market\n\n💰 Numbers:\n• ARV: $${arv}K\n• Repairs: $${repairs}K (${repClass})\n• Spread: $${spread}K\n• Assignment fee: $${feeLo}K–$${feeHi}K\n\nI'm keeping the address off this initial message — happy to share full details once I know you're interested.\n\nDoes this look like something worth a closer look?\n\nGabriel Montealegre\nMontsan Real Estate Investment\nmontsan.rei@gmail.com`
  };
}

function generateBuyerIntroEmail(buyer) {
  const name = buyer.contact?.split(' ')[0] || buyer.name?.split(' ')[0] || 'there';
  const market = buyer.county || buyer.markets?.[0] || 'your market';
  return {
    subject: `Introduction — Off-Market Wholesale Deals in ${market}`,
    body: `Hey ${name},\n\nMy name is Gabriel Montealegre — I'm a real estate wholesaler based in the U.S. and I source off-market investment properties nationwide.\n\nI came across your information and wanted to introduce myself. I work with cash buyers, flippers, and landlords to connect them with deals before they hit the market.\n\nI'd love to understand what you're looking for so I can send you deals that actually fit your criteria — not just random properties.\n\nA few quick questions if you have a minute:\n\n1. What areas are you most active in right now?\n2. What property types do you prefer? (SFR, multi-family, land, etc.)\n3. What's your typical price range?\n4. How quickly can you close once you find the right deal?\n5. What rehab level works for you — light, medium, or heavy?\n6. Do you prefer wholesale assignments or double closes?\n\nNo pressure at all — just want to make sure anything I send is worth your time.\n\nFeel free to reply here or call me directly. Looking forward to connecting.\n\nBest,\nGabriel Montealegre\nMontsan Real Estate Investment\nmontsan.rei@gmail.com`
  };
}

function getOutreachHistory(leadId) {
  return (db.readDB().outreach_history || []).filter(o => o.leadId === leadId);
}

function saveOutreachRecord(leadId, type, message, status='sent') {
  const dbData = db.readDB();
  if (!dbData.outreach_history) dbData.outreach_history = [];
  const record = { id: 'O'+Date.now(), leadId, type, message, status, created: new Date().toISOString() };
  dbData.outreach_history.push(record);
  if (dbData.outreach_history.length > 1000) dbData.outreach_history = dbData.outreach_history.slice(-1000);
  db.writeDB(dbData);
  return record;
}

function updateOutreachStatus(id, status, response='') {
  const dbData = db.readDB();
  const rec = (dbData.outreach_history||[]).find(o => o.id === id);
  if (rec) { rec.status = status; rec.response = response; rec.updated = new Date().toISOString(); }
  db.writeDB(dbData);
}

module.exports = {
  scoreLeadQuality, saveToneEdit, getToneLearnings, getAutoSendEnabled,
  generateSellerSMS, generateSellerEmail, generateBuyerSMS, generateBuyerEmail,
  generateBuyerIntroEmail, generateCallScript,
  getOutreachHistory, saveOutreachRecord, updateOutreachStatus,
};
