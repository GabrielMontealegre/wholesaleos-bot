// ai.js — Dual AI engine: Free (Groq/Llama) + Premium (Claude)
// Switch with: AI_MODE=free or AI_MODE=premium in Railway variables

require('dotenv').config();
const Groq       = require('groq-sdk');
const Anthropic  = require('@anthropic-ai/sdk');

const groq      = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODE = () => process.env.AI_MODE || 'free';

// ── Core AI call (routes to Groq or Claude based on mode) ─────────────────
async function ask(prompt, systemPrompt = '', maxTokens = 2000) {
  if (MODE() === 'premium' && process.env.ANTHROPIC_API_KEY) {
    return askClaude(prompt, systemPrompt, maxTokens);
  }
  return askGroq(prompt, systemPrompt, maxTokens);
}

async function askGroq(prompt, systemPrompt, maxTokens) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  const res = await groq.chat.completions.create({
    model:      'llama-3.3-70b-versatile',
    messages,
    max_tokens:  maxTokens,
    temperature: 0.3,
  });
  return res.choices[0].message.content.trim();
}

async function askClaude(prompt, systemPrompt, maxTokens) {
  const res = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens:  maxTokens,
    system:      systemPrompt || 'You are an expert real estate wholesale analyst.',
    messages:  [{ role: 'user', content: prompt }],
  });
  return res.content[0].text.trim();
}

// ── Property Analysis ──────────────────────────────────────────────────────
async function analyzeProperty(prop) {
  const sys = `You are Gabriel's expert real estate wholesale analyst for the DFW Texas market.
You produce detailed wholesale deal analysis with ARV, MAO, repair estimates, strategy, and call scripts.
Always respond in valid JSON only. No markdown. No explanation outside the JSON.`;

  const prompt = `Analyze this property for wholesaling in DFW Texas market Q1 2026.

Property: ${prop.address}
Type: ${prop.type || 'SFR'} | ${prop.beds || 3}BD/${prop.baths || 2}BA | ${prop.sqft || 1400} sqft
Built: ${prop.year || 1975} | County: ${prop.county || 'Dallas'} | ZIP: ${prop.zip}
List Price: ${prop.list_price || 'Unknown'} | DOM: ${prop.dom || 60} days
Category: ${prop.category || 'Motivated Seller'} | Seller: ${prop.seller_type || 'Unknown'}

DFW market context 2026:
- Average DOM: 103 days (buyer's market)
- Dallas proper median: $303K-$425K
- South Dallas/Oak Cliff ARV: $180K-$320K
- Garland/Mesquite ARV: $280K-$420K
- Fort Worth inner ARV: $220K-$380K
- Repair costs: $25-40/sqft light, $40-65/sqft medium, $65-90/sqft heavy
- Rental rates SFR: $1,500-$2,100/mo
- Texas = non-judicial foreclosure, first Tuesday courthouse auction
- Foundation inspection ALWAYS required in DFW clay soil

Respond with this exact JSON structure:
{
  "arv": number,
  "repairs": number,
  "repair_class": "LIGHT|MEDIUM|HEAVY",
  "mao": number,
  "offer": number,
  "fee_lo": number,
  "fee_hi": number,
  "close_time": "string",
  "risk": "Low|Medium|High",
  "risk_note": "string max 100 chars",
  "motivation": ["bullet1", "bullet2", "bullet3", "bullet4"],
  "strategies": [
    {"name": "Wholesale Assignment", "rating": "BEST|GOOD|POSSIBLE", "why": "string"},
    {"name": "Fix and Flip", "rating": "BEST|GOOD|POSSIBLE", "why": "string"},
    {"name": "Buy and Hold", "rating": "BEST|GOOD|POSSIBLE", "why": "string"}
  ],
  "repair_items": [
    {"item": "string", "cost": number, "note": "string"}
  ],
  "comp_range": "string",
  "comp_trend": "string",
  "comp_note": "string",
  "approach_type": "string",
  "approach_how": "string max 120 chars",
  "approach_q": "string with 5 numbered questions",
  "script": "string max 200 chars — what to say when calling",
  "arv_note": "string",
  "profit_note": "string",
  "fee_note": "string"
}`;

  try {
    const raw = await ask(prompt, sys, 3000);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);
    // Calculate MAO if AI didn't
    if (!result.mao) result.mao = Math.round(result.arv * 0.70 - result.repairs);
    if (!result.offer) result.offer = Math.round(result.mao * 0.94);
    return result;
  } catch (e) {
    // Fallback calculation if AI parsing fails
    const arv = estimateARV(prop);
    const rep = estimateRepairs(prop);
    return fallbackAnalysis(prop, arv, rep);
  }
}

// ── Lead Search + Scraping Analysis ───────────────────────────────────────
async function generateLeadList(county, state, count, categories) {
  const sys = `You are a real estate wholesale lead researcher for the ${county} County, ${state} market.
Generate realistic wholesale investment leads based on actual market data and distress patterns.
Respond in valid JSON array only. No markdown. No extra text.`;

  const prompt = `Generate ${Math.min(count, 25)} wholesale leads for ${county} County, ${state}.
Categories to include: ${categories.join(', ')}

For each lead provide realistic data matching actual ${county} County market conditions 2026.
Include addresses from real neighborhoods in ${county} County.

Return a JSON array of objects, each with:
{
  "address": "realistic street address with city, state zip",
  "type": "SFR",
  "beds": number,
  "baths": number,
  "sqft": number,
  "year": number,
  "zip": "5-digit zip",
  "county": "${county}",
  "category": "Pre-FC|REO|Long DOM|FSBO|Auction|Probate|Tax Delinquent",
  "list_price": "$XXX,XXX",
  "dom": number,
  "seller_type": "Owner|Agent|Bank REO|Probate|Auction",
  "phone": "realistic phone number",
  "source_url": "foreclosurelistings.com or redfin.com or foreclosure.com",
  "lot": "X,XXX sqft",
  "reductions": "description or N/A",
  "status": "Pre-Foreclosure|Active|REO|Auction|Short Sale",
  "ownership": "description"
}`;

  try {
    const raw = await ask(prompt, sys, 4000);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

// ── Buyer Match Email ─────────────────────────────────────────────────────
async function generateBuyerEmail(lead, buyer, analysis) {
  const prompt = `Write a professional but direct wholesale real estate deal submission email.
FROM: Gabriel Montsan (montsan.rei@gmail.com)
TO: ${buyer.name} — ${buyer.contact}
PROPERTY: ${lead.address}
ARV: $${(analysis.arv||lead.arv||0).toLocaleString()} | OFFER: $${(analysis.offer||lead.offer||0).toLocaleString()} | ASSIGNMENT FEE: $${(analysis.fee_lo||lead.fee||0).toLocaleString()}-$${(analysis.fee_hi||15000).toLocaleString()}
CATEGORY: ${lead.category} | RISK: ${analysis.risk || lead.risk}
BEDS/BATHS: ${lead.beds}BD/${lead.baths}BA | SQFT: ${lead.sqft}
COUNTY: ${lead.county}

Write a concise 150-word email with:
- Subject line
- Brief deal summary with key numbers
- Why this fits their buy box
- Clear call to action
- Professional closing

Return as JSON: {"subject": "...", "body": "..."}`;

  try {
    const raw = await ask(prompt, '', 600);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      subject: `Investment Opportunity — ${lead.address}`,
      body: `Hi ${buyer.contact},\n\nI have a deal that matches your buy box.\n\n${lead.address}\nARV: $${(lead.arv||0).toLocaleString()} | Offer: $${(lead.offer||0).toLocaleString()} | Fee: $${(lead.fee||0).toLocaleString()}\n\nCan you connect today?\n\nGabriel Montsan\n${process.env.GMAIL_USER}`
    };
  }
}

// ── Seller Script Generator ───────────────────────────────────────────────
async function generateSellerScript(lead) {
  const prompt = `Write a short, natural-sounding phone script for Gabriel to call the seller of:
${lead.address} — ${lead.category} — ${lead.seller_type}
Motivation: ${lead.motivation?.join('. ') || 'Distressed seller'}

Script should be 3-4 sentences, conversational, empathetic, direct about being a cash buyer.
Return just the script text, no JSON, no quotes.`;
  return ask(prompt, '', 300);
}

// ── Fallback calculations ─────────────────────────────────────────────────
function estimateARV(prop) {
  const base = { 'Dallas': 280000, 'Tarrant': 240000, 'Collin': 380000, 'Denton': 360000, 'Rockwall': 340000 };
  let arv = base[prop.county] || 270000;
  arv += (prop.beds - 3) * 15000;
  arv += (prop.sqft - 1400) * 30;
  return Math.round(arv);
}

function estimateRepairs(prop) {
  const age = 2026 - (prop.year || 1975);
  if (age < 20) return 25000;
  if (age < 40) return 45000;
  return 65000;
}

function fallbackAnalysis(prop, arv, rep) {
  const mao = Math.round(arv * 0.70 - rep);
  return {
    arv, repairs: rep, mao,
    offer:       Math.round(mao * 0.94),
    repair_class: rep > 60000 ? 'HEAVY' : rep > 35000 ? 'MEDIUM' : 'LIGHT',
    fee_lo:      12000, fee_hi: 22000,
    risk:        'Medium',
    risk_note:   'Foundation inspection required — DFW clay soil standard.',
    close_time:  '14-21 days cash',
    motivation:  ['Distressed property requiring immediate action.', 'Texas non-judicial foreclosure moves fast.', 'Cash offer stops auction and puts money in seller pocket.'],
    strategies:  [{ name: 'Wholesale Assignment', rating: 'BEST', why: 'Fast exit, lock and assign to active DFW buyer.' }],
    comp_range:  `$${Math.round(arv*0.9).toLocaleString()} - $${Math.round(arv*1.1).toLocaleString()}`,
    comp_trend:  'BALANCED', comp_note: 'DFW 2026 buyer market — 103 day average DOM.',
    approach_type: prop.seller_type || 'Owner',
    approach_how: 'Call directly, lead with empathy, position as fast cash solution.',
    approach_q:  '1) Payoff amount? 2) Any other liens? 3) Taxes current? 4) Auction date? 5) Close in 14 days?',
    script:      'Hi, I am Gabriel — local cash buyer. I can close in 14 days and stop the auction. Can we talk?',
    profit_note: 'End buyer nets good spread at this price point.',
    fee_note:    'Standard DFW wholesale fee range.',
    arv_note:    'Based on comparable sales in this submarket.'
  };
}

module.exports = { ask, analyzeProperty, generateLeadList, generateBuyerEmail, generateSellerScript, MODE };
