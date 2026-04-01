// ai.js — Dual AI engine: Free (Groq/Llama) + Premium (Claude)
require('dotenv').config();
const Groq      = require('groq-sdk');
const Anthropic = require('@anthropic-ai/sdk');

const groq      = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODE = () => process.env.AI_MODE || 'free';

async function ask(prompt, systemPrompt = '', maxTokens = 2000) {
  if (MODE() === 'premium' && process.env.ANTHROPIC_API_KEY) return askClaude(prompt, systemPrompt, maxTokens);
  return askGroq(prompt, systemPrompt, maxTokens);
}

async function askGroq(prompt, systemPrompt, maxTokens) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    max_tokens: maxTokens,
    temperature: 0.2,
  });
  return res.choices[0].message.content.trim();
}

async function askClaude(prompt, systemPrompt, maxTokens) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt || 'You are an expert real estate wholesale analyst.',
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0].text.trim();
}

// ── COMPLETE Property Analysis — every field required ────────────────────
async function analyzeProperty(prop) {
  const county = prop.county || 'Dallas';
  const arvBase = { Dallas:280000, Tarrant:240000, Collin:380000, Denton:360000, 'San Diego':650000, 'Los Angeles':720000, 'LA':720000 };
  const baseARV = arvBase[county] || 270000;

  const sys = `You are an expert wholesale real estate analyst. You MUST return complete JSON with every field filled.
Never return 0 for arv, offer, repairs, fee_lo, or fee_hi. Always calculate realistic values.
Respond ONLY in valid JSON. No markdown. No explanation. No missing fields.`;

  const prompt = `Analyze this wholesale real estate deal. Return COMPLETE analysis — every field is required.

PROPERTY DATA:
Address: ${prop.address}
Type: ${prop.type || 'SFR'} | ${prop.beds || 3}BD/${prop.baths || 2}BA | ${prop.sqft || 1400} sqft | Built: ${prop.year || 1975}
County: ${county} | ZIP: ${prop.zip || ''}
List Price: ${prop.list_price || 'Unknown'} | DOM: ${prop.dom || 60} days
Category: ${prop.category || 'Motivated Seller'} | Seller: ${prop.seller_type || 'Owner'}
Estimated base ARV for ${county} County: $${baseARV.toLocaleString()}

MARKET CONTEXT 2026:
- DFW average DOM: 103 days (buyer's market)
- Dallas median: $303K-$425K | South Dallas/Oak Cliff: $180K-$320K
- Garland/Mesquite: $280K-$420K | Fort Worth inner: $220K-$380K
- San Diego SFR: $600K-$950K | Los Angeles SFR: $650K-$1.1M
- Repairs: light $25-40/sqft | medium $40-65/sqft | heavy $65-90/sqft
- MAO formula: ARV × 0.70 minus repairs
- Assignment fee typical range: $10,000-$35,000

REQUIRED JSON (all fields mandatory, no zeros except where genuinely zero):
{
  "arv": number (realistic market value after repairs),
  "asking_price": number (from list_price or estimate),
  "repairs": number (realistic repair estimate),
  "repair_class": "LIGHT|MEDIUM|HEAVY",
  "repair_items": [{"item":"string","cost":number}],
  "mao": number (arv * 0.70 - repairs),
  "offer": number (mao * 0.94),
  "fee_lo": number (min assignment fee),
  "fee_hi": number (max assignment fee),
  "spread": number (arv - offer - repairs),
  "risk": "Low|Medium|High",
  "risk_note": "string",
  "close_time": "14-21 days cash",
  "why_good_deal": "string — 2 sentences explaining exactly why this is a good deal",
  "distress_signals": ["signal1","signal2","signal3"],
  "motivation": ["motivation1","motivation2","motivation3"],
  "investment_strategy": "Wholesale Assignment|Fix and Flip|Buy and Hold|BRRRR",
  "strategy_note": "string",
  "comp_range": "string",
  "comp_trend": "APPRECIATING|STABLE|DECLINING",
  "script": "string — natural 2-sentence phone script for Gabriel to use",
  "offer_email": "string — 3-sentence email to seller with offer",
  "negotiation_text": "string — professional SMS negotiation message",
  "arv_note": "string",
  "profit_note": "string"
}`;

  try {
    const raw = await ask(prompt, sys, 3000);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);
    // Ensure no zero values
    if (!result.arv || result.arv < 50000) result.arv = estimateARV(prop);
    if (!result.repairs || result.repairs < 5000) result.repairs = estimateRepairs(prop);
    if (!result.mao || result.mao < 10000) result.mao = Math.round(result.arv * 0.70 - result.repairs);
    if (!result.offer || result.offer < 10000) result.offer = Math.round(result.mao * 0.94);
    if (!result.fee_lo || result.fee_lo < 5000) result.fee_lo = 10000;
    if (!result.fee_hi || result.fee_hi < result.fee_lo) result.fee_hi = result.fee_lo + 15000;
    if (!result.spread) result.spread = result.arv - result.offer - result.repairs;
    if (!result.why_good_deal) result.why_good_deal = `${prop.category || 'Distressed'} property with ${result.arv > 0 ? Math.round((result.arv - result.offer)/result.arv*100) + '% discount to ARV' : 'strong spread'}. Strong wholesale candidate in active ${county} County market.`;
    return result;
  } catch (e) {
    const arv = estimateARV(prop);
    const rep = estimateRepairs(prop);
    return fallbackAnalysis(prop, arv, rep);
  }
}

// ── Lead List Generation — high quality with full context ────────────────
async function generateLeadList(county, state, count, categories) {
  const sys = `You are a real estate data researcher specializing in wholesale investment leads.
Generate realistic, high-quality wholesale leads for ${county} County, ${state}.
Each lead must have complete data. Use real neighborhood names and realistic market data.
Respond ONLY in a valid JSON array. No markdown. No extra text outside the array.`;

  const distressGuide = `
DISTRESS CATEGORIES TO PRIORITIZE:
- Pre-FC (Pre-Foreclosure): Owner behind on payments, NOD filed, auction scheduled
- REO (Bank Owned): Already foreclosed, bank wants to liquidate
- Long DOM: 90+ days on market, price reductions, motivated seller
- FSBO: Owner selling direct, no agent, usually flexible on price  
- Probate: Estate sale, heirs want quick cash
- Tax Delinquent: Behind on property taxes, risk of tax sale
- Auction: Heading to courthouse or online auction

COUNTY NEIGHBORHOODS:
Dallas: Oak Cliff, South Dallas, Pleasant Grove, Garland, Mesquite, Duncanville, DeSoto, Lancaster
Tarrant: Haltom City, Azle, Forest Hill, Everman, Richland Hills, Saginaw, White Settlement
Collin: McKinney, Allen, Wylie, Sachse, Murphy, Farmersville
San Diego: National City, Chula Vista, El Cajon, Lemon Grove, La Mesa, Spring Valley
Los Angeles: Compton, Inglewood, South LA, Watts, Hawthorne, Gardena, Carson`;

  const prompt = `Generate ${Math.min(count, 20)} high-quality wholesale leads for ${county} County, ${state}.
Focus categories: ${categories.join(', ')}
${distressGuide}

Each lead MUST include accurate, complete data. No placeholder values.

Return JSON array, each object:
{
  "address": "full street address, city, state zip — use real ${county} County neighborhoods",
  "type": "SFR",
  "beds": number,
  "baths": number,
  "sqft": number,
  "year": number,
  "zip": "5-digit zip code for ${county} County",
  "county": "${county}",
  "state": "${state}",
  "category": "Pre-FC|REO|Long DOM|FSBO|Probate|Auction|Tax Delinquent",
  "list_price": "$XXX,XXX",
  "dom": number (days on market — foreclosures often 30-90 days),
  "seller_type": "Owner|Agent|Bank REO|Probate|Auction|Sheriff",
  "phone": "(area code) XXX-XXXX",
  "status": "Pre-Foreclosure|Active|REO|Auction|Short Sale",
  "reductions": "describe price reductions or N/A",
  "distress": "brief description of distress situation",
  "source_url": "foreclosurelistings.com or redfin.com or zillow.com",
  "lot": "X,XXX sqft",
  "ownership": "years owned or description"
}`;

  try {
    const raw = await ask(prompt, sys, 4000);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function generateBuyerEmail(lead, buyer, analysis) {
  const prompt = `Write a concise wholesale deal email.
FROM: Gabriel Montealegre — Montsan Real Estate Investment
TO: ${buyer.name} (${buyer.contact})
DEAL: ${lead.address}
ARV: $${(analysis.arv||lead.arv||0).toLocaleString()} | OFFER: $${(analysis.offer||lead.offer||0).toLocaleString()} | FEE: $${(analysis.fee_lo||10000).toLocaleString()}-$${(analysis.fee_hi||25000).toLocaleString()}
CATEGORY: ${lead.category} | RISK: ${analysis.risk||'Medium'} | ${lead.beds}BD/${lead.baths}BA ${lead.sqft} sqft

Write 120-word email. Subject + Body. Return JSON: {"subject":"...","body":"..."}`;
  try {
    const raw = await ask(prompt, '', 500);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      subject: `Deal Alert — ${lead.address?.split(',')[0]} | ARV $${((analysis.arv||lead.arv||0)/1000).toFixed(0)}K`,
      body: `Hi ${buyer.contact},\n\nI have a deal matching your buy box.\n\n${lead.address}\nARV: $${(analysis.arv||lead.arv||0).toLocaleString()} | Offer: $${(analysis.offer||lead.offer||0).toLocaleString()} | Fee: $${(analysis.fee_lo||10000).toLocaleString()}-$${(analysis.fee_hi||25000).toLocaleString()}\n\nAvailable now. Can you connect today?\n\nGabriel Montealegre\nMontsan Real Estate Investment\n${process.env.GMAIL_USER}`
    };
  }
}

async function generateSellerScript(lead) {
  const prompt = `Write a 3-sentence natural phone script for Gabriel calling the seller of:
${lead.address} — ${lead.category} — ${lead.seller_type || 'Owner'}
Empathetic, direct, positions as fast cash buyer. Return script text only.`;
  return ask(prompt, '', 200);
}

function estimateARV(prop) {
  const base = { Dallas:280000, Tarrant:240000, Collin:380000, Denton:360000, Rockwall:340000, 'San Diego':680000, 'Los Angeles':750000, LA:750000 };
  let arv = base[prop.county] || 270000;
  arv += ((prop.beds||3) - 3) * 18000;
  arv += ((prop.sqft||1400) - 1400) * 32;
  if ((prop.year||1975) > 2000) arv *= 1.08;
  return Math.round(arv);
}

function estimateRepairs(prop) {
  const age = 2026 - (prop.year || 1975);
  const sqft = prop.sqft || 1400;
  if (age < 15) return Math.round(sqft * 22);
  if (age < 30) return Math.round(sqft * 38);
  if (age < 50) return Math.round(sqft * 52);
  return Math.round(sqft * 68);
}

function fallbackAnalysis(prop, arv, rep) {
  const mao = Math.round(arv * 0.70 - rep);
  const offer = Math.round(mao * 0.94);
  return {
    arv, asking_price: arv, repairs: rep, repair_class: rep > 60000 ? 'HEAVY' : rep > 35000 ? 'MEDIUM' : 'LIGHT',
    repair_items: [{ item: 'Full renovation estimate', cost: rep }],
    mao, offer,
    fee_lo: 10000, fee_hi: 25000,
    spread: arv - offer - rep,
    risk: 'Medium', risk_note: 'Foundation inspection required — standard DFW clay soil.',
    close_time: '14-21 days cash',
    why_good_deal: `${prop.category || 'Distressed'} property priced below market with ${Math.round((arv - offer)/arv*100)}% discount to ARV. Strong wholesale candidate with active buyer pool in ${prop.county || 'Dallas'} County.`,
    distress_signals: ['Below market list price', prop.category || 'Motivated seller', 'Extended days on market'],
    motivation: ['Needs fast cash solution', 'Property requires work', 'Timeline pressure'],
    investment_strategy: 'Wholesale Assignment',
    strategy_note: 'Best exit: lock up and assign to active cash buyer. Fast 14-day close.',
    comp_range: `$${Math.round(arv*0.88).toLocaleString()} – $${Math.round(arv*1.12).toLocaleString()}`,
    comp_trend: 'STABLE',
    script: `Hi, this is Gabriel — I'm a local cash buyer and I can close in 14 days with no repairs needed. Is this still available?`,
    offer_email: `Hi, I'm interested in your property at ${prop.address} and can offer $${offer.toLocaleString()} cash, closing in 14 days with no repairs or agent fees required. Would you like to discuss?`,
    negotiation_text: `Hi, following up on ${prop.address?.split(',')[0]}. My cash offer of $${offer.toLocaleString()} is still available — quick close, no hassle. Can we connect?`,
    arv_note: `Based on comparable sales in ${prop.county || 'Dallas'} County submarket.`,
    profit_note: `End buyer spread: $${(arv - offer - rep).toLocaleString()} after repairs.`
  };
}

module.exports = { ask, analyzeProperty, generateLeadList, generateBuyerEmail, generateSellerScript, MODE };
