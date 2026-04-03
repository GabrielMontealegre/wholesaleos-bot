// ai.js — AI engine with real deal intelligence and humanized outreach
require('dotenv').config();
const Groq      = require('groq-sdk');
const Anthropic = require('@anthropic-ai/sdk');
const { getMarketData, selectMarketsForWeek } = require('./markets');

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
  const res = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages, max_tokens: maxTokens, temperature: 0.3 });
  return res.choices[0].message.content.trim();
}

async function askClaude(prompt, systemPrompt, maxTokens) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: maxTokens,
    system: systemPrompt || 'You are an expert real estate wholesale analyst.',
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0].text.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────
const CATEGORIES    = ['Pre-FC','REO','Long DOM','FSBO','Probate','Auction','Tax Delinquent'];
const SELLER_TYPES  = ['Owner','Bank REO','Estate','Sheriff','Agent'];
const DISTRESS_SIGNALS = [
  'Owner 90+ days behind on mortgage payments, NOD filed',
  'Bank-owned REO — needs to liquidate quickly',
  'Estate sale — heirs want fast cash settlement',
  'Listed 120+ days with three price reductions',
  'Owner relocated out of state, two mortgage payments',
  'Divorce proceeding — court-ordered sale by deadline',
  'Tax lien filed, delinquent 2+ years, sale imminent',
  'Vacant 8+ months, property deteriorating',
  'Pre-foreclosure — auction scheduled in 45 days',
  'FSBO 90+ days — agent refused, owner flexible',
  'Probate property — multiple heirs, want quick resolution',
  'Investment property abandoned — landlord exiting market',
];

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Deal classification ───────────────────────────────────────────────────
function classifyDeal(arv, offer, repairs, rentEstimate = 0) {
  const spread  = arv - offer - repairs;
  const equity  = arv - offer;
  const repPct  = repairs / arv;
  const cashFlow = rentEstimate > 0 ? rentEstimate - Math.round((offer * 0.006) + (repairs / 120)) : 0;

  if (arv === 0) return 'Wholesale';
  if (repPct < 0.08 && cashFlow > 300)  return 'Rental Hold';
  if (repPct < 0.15 && spread > 60000)  return 'Fix & Flip';
  if (equity > arv * 0.30 && offer < arv * 0.65) return 'Creative Finance';
  if (spread > 20000)                   return 'Wholesale';
  return 'Wholesale';
}

// ── Lead generation (AI + guaranteed fallback) ────────────────────────────
function generateFallbackLeads(county, state, count) {
  const market = getMarketData(county, state);
  const leads = [];
  const used   = new Set();
  const zipBase = market.zip_prefix?.[0] || '750';

  for (let i = 0; i < count; i++) {
    let address, attempts = 0;
    do {
      const num    = rndInt(100, 9999);
      const street = rnd(market.streets);
      const city   = rnd(market.neighborhoods);
      const zip    = zipBase + String(rndInt(0,99)).padStart(2,'0');
      address = `${num} ${street}, ${city}, ${state} ${zip}`;
      attempts++;
    } while (used.has(address) && attempts < 20);
    used.add(address);

    const beds = rndInt(2, 5);
    const baths = rndInt(1, Math.min(beds, 3));
    const sqft  = rndInt(850, 3200);
    const year  = rndInt(1950, 2010);
    const dom   = rndInt(25, 200);
    const cat   = rnd(CATEGORIES);
    const discPct = rndInt(12, 38) / 100;
    const arv   = Math.max(60000, Math.round(market.arv + rndInt(-80000,100000) + (beds-3)*18000 + (sqft-1400)*28));
    const asking = Math.round(arv * (1 - discPct));
    const age    = 2026 - year;
    const repCost = age < 20 ? 20 : age < 35 ? 38 : age < 50 ? 55 : 72;
    const repairs = Math.round(sqft * repCost);
    const mao    = Math.round(arv * 0.70 - repairs);
    const offer  = Math.round(mao * 0.94);
    const spread = Math.max(5000, arv - offer - repairs);
    const feeLo  = Math.round(Math.max(7500, spread * 0.35));
    const feeHi  = Math.round(feeLo * 1.7);
    const distress = rnd(DISTRESS_SIGNALS);
    const rentEst  = Math.round(arv * 0.005 + rndInt(-200, 300));
    const strategy = classifyDeal(arv, offer, repairs, rentEst);
    const discPctDisplay = Math.round((arv - asking) / arv * 100);

    leads.push({
      address, type: 'SFR', beds, baths, sqft, year,
      zip: zipBase + String(rndInt(0,99)).padStart(2,'0'),
      county, state, category: cat,
      list_price: `$${asking.toLocaleString()}`, dom,
      seller_type: rnd(SELLER_TYPES),
      phone: `(${rndInt(200,989)}) ${rndInt(200,989)}-${rndInt(1000,9999)}`,
      status: cat==='REO'?'REO':cat==='Auction'?'Auction':'Pre-Foreclosure',
      distress, reductions: dom > 60 ? `Reduced $${rndInt(5,30)}K from original list` : 'N/A',
      source_url: rnd(['foreclosurelistings.com','redfin.com','zillow.com','foreclosure.com','hubzu.com']),
      source_platform: 'AI Generated',
      lot: `${rndInt(3500,15000).toLocaleString()} sqft`, ownership: `Owned ${rndInt(3,28)} years`,
      arv, offer, repairs, repair_class: repCost < 30 ? 'LIGHT' : repCost < 55 ? 'MEDIUM' : 'HEAVY',
      mao, fee_lo: feeLo, fee_hi: feeHi, spread,
      risk: spread > 65000 ? 'Low' : spread > 30000 ? 'Medium' : 'High',
      rent_estimate: rentEst,
      deal_classification: strategy,
      equity_pct: Math.round((arv - offer) / arv * 100),
      why_good_deal: `${cat} property listed at ${discPctDisplay}% below ARV with ${repCost < 30 ? 'light' : 'medium'} rehab. Assignment spread $${spread.toLocaleString()}. Best exit: ${strategy}.`,
      distress_signals: [cat, distress.slice(0,55), `${dom} days on market`],
      investment_strategy: strategy,
    });
  }
  return leads;
}

async function generateLeadList(county, state, count, categories) {
  try {
    const market = getMarketData(county, state);
    const sys = `You are a real estate data researcher. Generate wholesale leads for ${county} County, ${state}. Respond ONLY with a valid JSON array.`;
    const prompt = `Generate exactly ${count} wholesale leads for ${county} County, ${state}.
Focus: ${(categories||[]).slice(0,4).join(', ')}
Use these neighborhoods: ${market.neighborhoods.slice(0,5).join(', ')}
ARV range: $${(market.arv*0.7).toLocaleString()} - $${(market.arv*1.4).toLocaleString()}
Return JSON array only: [{"address":"...","type":"SFR","beds":3,"baths":2,"sqft":1450,"year":1978,"zip":"00000","county":"${county}","category":"Pre-FC","list_price":"$200,000","dom":75,"seller_type":"Owner","phone":"(214) 555-1234","status":"Pre-Foreclosure","distress":"Owner behind on payments","reductions":"Reduced $15K","source_url":"zillow.com","lot":"6,000 sqft","ownership":"12 years"}]`;
    const raw   = await ask(prompt, sys, 4000);
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length >= Math.min(count, 5)) return parsed;
    }
  } catch(e) { console.log(`AI lead gen failed: ${e.message}`); }
  return generateFallbackLeads(county, state, count);
}

// ── Property analysis ─────────────────────────────────────────────────────
async function analyzeProperty(prop) {
  if (prop.why_good_deal && prop.arv > 50000 && prop.offer > 10000) {
    return {
      arv: prop.arv, repairs: prop.repairs, repair_class: prop.repair_class,
      repair_items: [], mao: prop.mao, offer: prop.offer,
      fee_lo: prop.fee_lo, fee_hi: prop.fee_hi, spread: prop.spread,
      risk: prop.risk, risk_note: prop.why_good_deal, close_time: '14-21 days cash',
      why_good_deal: prop.why_good_deal,
      distress_signals: prop.distress_signals || [],
      motivation: prop.motivation || [],
      investment_strategy: prop.investment_strategy || classifyDeal(prop.arv, prop.offer, prop.repairs, prop.rent_estimate),
      strategy_note: 'Best exit: wholesale assignment to active cash buyer.',
      comp_range: `$${Math.round(prop.arv*0.88).toLocaleString()} – $${Math.round(prop.arv*1.12).toLocaleString()}`,
      comp_trend: 'STABLE',
      script: prop.script, offer_email: prop.offer_email,
      negotiation_text: prop.negotiation_text,
      arv_note: prop.arv_note, profit_note: prop.profit_note,
    };
  }
  try {
    const market = getMarketData(prop.county||'Dallas', prop.state||'TX');
    const sys = `You are a wholesale real estate analyst. Return ONLY valid JSON.`;
    const prompt = `Analyze: ${prop.address}
County: ${prop.county||'Unknown'} ${prop.state||'TX'} | ARV: $${market.arv.toLocaleString()}
${prop.beds||3}BD/${prop.baths||2}BA | ${prop.sqft||1400}sqft | Built ${prop.year||1975}
List: ${prop.list_price||'Unknown'} | DOM: ${prop.dom||60} | Category: ${prop.category||'Motivated'}
Last sale: ${prop.lastSalePrice ? '$'+prop.lastSalePrice.toLocaleString() : 'Unknown'} (${prop.lastSaleYear||'unknown year'})
Rent estimate: ${prop.rent_estimate ? '$'+prop.rent_estimate+'/mo' : 'Unknown'}
Avg comps: ${prop.avgCompPrice ? '$'+prop.avgCompPrice.toLocaleString() : 'Unknown'}
Return JSON: {"arv":number,"repairs":number,"repair_class":"LIGHT|MEDIUM|HEAVY","mao":number,"offer":number,"fee_lo":number,"fee_hi":number,"spread":number,"risk":"Low|Medium|High","risk_note":"string","close_time":"string","why_good_deal":"2 sentences","distress_signals":["s1","s2","s3"],"motivation":["m1","m2"],"investment_strategy":"string","strategy_note":"string","comp_range":"string","comp_trend":"STABLE","script":"natural 2-sentence call script","offer_email":"3-sentence email","negotiation_text":"SMS","arv_note":"string","profit_note":"string"}`;
    const raw   = await ask(prompt, sys, 2000);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) { const r = JSON.parse(match[0]); if (r.arv > 50000) return r; }
  } catch(e) {}
  const arv = estimateARV(prop);
  const rep = estimateRepairs(prop);
  return fallbackAnalysis(prop, arv, rep);
}

// ── Deep outreach generation with real deal data ──────────────────────────
async function generateDeepOutreach(lead, intel) {
  // intel = { comps, avgCompPrice, rentEstimate, lastSalePrice, lastSaleYear, zestimate }
  const arv    = lead.arv || intel?.avgCompPrice || lead.arv || 0;
  const offer  = lead.offer || Math.round(arv * 0.65);
  const repairs = lead.repairs || Math.round(arv * 0.12);
  const spread = Math.max(0, arv - offer - repairs);
  const feeLo  = lead.fee_lo || Math.round(spread * 0.35);
  const feeHi  = lead.fee_hi || Math.round(spread * 0.55);
  const equity = Math.round((arv - offer) / arv * 100);
  const rentEst = lead.rent_estimate || intel?.rentEstimate || 0;
  const lastSale = intel?.lastSalePrice || lead.lastSalePrice || 0;
  const lastYear = intel?.lastSaleYear || lead.lastSaleYear || '';
  const dom    = lead.dom || 60;
  const cat    = lead.category || 'Motivated Seller';
  const addr   = (lead.address||'').split(',')[0];
  const strategy = lead.deal_classification || classifyDeal(arv, offer, repairs, rentEst);
  const compSrc = intel?.compSource || 'comparable sales';

  // Build deal intelligence summary for AI
  const dealContext = `
Property: ${lead.address}
Category: ${cat} | Type: ${lead.type||'SFR'} | ${lead.beds||3}BD/${lead.baths||2}BA | ${lead.sqft||0} sqft | Built ${lead.year||'Unknown'}
Days on Market: ${dom} | ${dom > 90 ? 'VERY long time — motivated' : dom > 60 ? 'Extended market time' : 'Recent listing'}
List Price: ${lead.list_price||'Unknown'} | ARV (${compSrc}): $${arv.toLocaleString()}
Avg Comp Price: $${(intel?.avgCompPrice||arv).toLocaleString()} | Zestimate: ${intel?.zestimate ? '$'+intel.zestimate.toLocaleString() : 'N/A'}
${lastSale > 0 ? `Last Purchased: ${lastYear} for $${lastSale.toLocaleString()} — owner has ${Math.round((arv-lastSale)/lastSale*100)}% appreciation` : ''}
Repair Estimate: $${repairs.toLocaleString()} (${lead.repair_class||'MEDIUM'})
MAO (70% rule): $${(lead.mao||Math.round(arv*0.7-repairs)).toLocaleString()} | Our Offer: $${offer.toLocaleString()}
Equity: ${equity}% below ARV | Spread: $${spread.toLocaleString()} | Fee Range: $${feeLo.toLocaleString()}–$${feeHi.toLocaleString()}
${rentEst > 0 ? `Rent Estimate: $${rentEst}/mo | Cash flow potential: $${Math.max(0,rentEst-Math.round(offer*0.006)).toLocaleString()}/mo` : ''}
Deal Classification: ${strategy}
Distress Signals: ${(lead.distress_signals||[lead.distress||cat]).join(', ')}
Distress Notes: ${lead.distress||'Motivated seller situation'}`;

  const sys = `You are Gabriel Montealegre, owner of Montsan Real Estate Investment. You are a real estate wholesaler in ${lead.state||'TX'}.
Write naturally — like a real person, not a robot. Never sound like a template. Reference specific deal details.
Never mention the assignment fee to the seller. Never make an offer in the first SMS contact.`;

  try {
    const prompt = `Based on this deal intelligence, generate 3 outreach pieces:

${dealContext}

1. SMS (first contact, build rapport, 2-3 sentences max, NO offer, NO price, just human connection + soft question)
2. Email (subject + body, 150-200 words, warm but professional, reference specific property details, explain why you're interested, make the offer feel logical not pushy)
3. Call Script (structured guide with: Opening → Rapport → Pain discovery questions → Value proposition → Soft close. Include 4-5 specific questions to ask. Reference the ${dom} days on market and ${cat} situation. Include objection handling.)

Return JSON: {"sms":"...","email_subject":"...","email_body":"...","call_script":"...","talking_points":["p1","p2","p3"],"questions_to_ask":["q1","q2","q3","q4"],"deal_summary":"2 sentences why this is a good deal","motivation_indicators":["m1","m2","m3"]}`;

    const raw   = await ask(prompt, sys, 2500);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const result = JSON.parse(match[0]);
      if (result.sms && result.email_body) {
        return { ...result, arv, offer, repairs, spread, feeLo, feeHi, equity, rentEst, strategy, dealContext };
      }
    }
  } catch(e) { console.log('Deep outreach AI failed:', e.message); }

  // Fallback — still specific and detailed
  const motivationNote = dom > 90 ? `This property has been sitting for ${dom} days — the seller is clearly motivated.` :
                         cat === 'Pre-FC' ? 'Owner is behind on payments and facing foreclosure — time pressure is real.' :
                         cat === 'Probate' ? 'Estate sale — heirs typically want a fast, clean close.' :
                         'Seller has been on market longer than average, suggesting flexibility.';

  return {
    sms: `Hi, my name is Gabriel — I'm a local real estate investor in ${lead.county||lead.state}. I came across your property on ${addr} and I'm genuinely interested. Is it still available? Would you be open to a quick chat?`,
    email_subject: `Cash offer for your property at ${addr}`,
    email_body: `Hi,\n\nI'm Gabriel Montealegre with Montsan Real Estate Investment. I came across your property at ${lead.address} and I'm very interested in making a cash offer.\n\nHere's why this property caught my attention: it's been listed at ${lead.list_price||'a competitive price'} with ${dom} days on market. Based on comparable sales in ${lead.county||'the area'} — which are averaging around $${(intel?.avgCompPrice||arv).toLocaleString()} — I believe we can put together an offer that works for both of us.\n\nI'm offering $${offer.toLocaleString()} cash. We can close in as little as 14 days, no repairs needed, no agent commissions.\n\nWould you be open to a 10-minute conversation?\n\nBest,\nGabriel Montealegre\nMontsan Real Estate Investment\n${process.env.GMAIL_USER||'montsan.rei@gmail.com'}`,
    call_script: `OPENING:\n"Hi, is this the owner of ${addr}? My name is Gabriel — I'm a local cash buyer in ${lead.state}. I'm not an agent, I actually buy houses myself. Do you have 5 minutes?"\n\nRAPPORT:\n- "How long have you owned the property?"\n- "Are you living there or is it a rental?"\n\nPAIN DISCOVERY (${motivationNote}):\n- "What's the main reason you're considering selling?"\n- "Have you had other offers? What happened with those?"\n- "What's your ideal timeline for closing?"\n- "Are there any repairs or updates you haven't been able to make?"\n\nVALUE PROPOSITION:\n"I buy properties as-is for cash. No repairs, no agents, no 60-day closings. I can close in 14 days and you don't pay any fees."\n\nSOFT CLOSE:\n"Based on what you've told me, I think we can make this work. If the numbers line up, would you be open to receiving a written offer this week?"\n\nOBJECTIONS:\n- "I need more" → "I understand. Tell me your number and let's see if we can get close."\n- "I'm working with an agent" → "No problem — I can work with agents. What's your timeline?"\n- "Let me think about it" → "Of course. Can I follow up in 2 days?"`,
    talking_points: [`${dom} days on market — seller has motivation`, `ARV of $${arv.toLocaleString()} based on ${compSrc}`, `${strategy} opportunity — strong numbers`, `Fast close, no repairs, no commissions`],
    questions_to_ask: ['What is your ideal closing timeline?', 'Are there any liens or back taxes on the property?', 'Have you received any other offers?', 'What would you do with the cash if we closed quickly?'],
    deal_summary: `${cat} property at ${equity}% below ARV with $${spread.toLocaleString()} assignment spread. ${strategy} exit. ${motivationNote}`,
    motivation_indicators: [cat, `${dom} days on market`, lead.distress||'Below market pricing'],
    arv, offer, repairs, spread, feeLo, feeHi, equity, rentEst, strategy, dealContext,
  };
}

// ── Buyer intro outreach ──────────────────────────────────────────────────
async function generateBuyerIntroOutreach(buyer) {
  const sys = `You are Gabriel Montealegre from Montsan Real Estate Investment. Write a natural, human first-contact message to a cash buyer. Goal: introduce yourself, start a relationship, and understand what they're looking for.`;
  try {
    const prompt = `Write a first-contact outreach message to this buyer:
Name: ${buyer.name} | Type: ${buyer.type} | Markets: ${(buyer.markets||[]).join(', ')}
Buy box: $${(buyer.minARV||0).toLocaleString()}–$${(buyer.maxPrice||0).toLocaleString()} | Rehab: ${buyer.rehab||'Medium'}
Source: ${buyer.source||'Direct outreach'}

Generate:
1. SMS (2-3 sentences, introduce yourself, mention you have deals in their market, ask one question about what they're looking for)
2. Email (subject + body, 100-150 words, warm intro, reference their specific market/buy box, ask to get on a call)

Return JSON: {"sms":"...","email_subject":"...","email_body":"..."}`;

    const raw   = await ask(prompt, sys, 800);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) { const r = JSON.parse(match[0]); if (r.sms) return r; }
  } catch(e) {}

  return {
    sms: `Hi ${buyer.name.split(' ')[0]}, I'm Gabriel with Montsan REI — I wholesale properties in ${(buyer.markets||[])[0]||'your target markets'}. I'm building my buyer network and wanted to connect. What types of deals are you actively looking for right now?`,
    email_subject: `Wholesale deals in ${(buyer.markets||[])[0]||'your market'} — let's connect`,
    email_body: `Hi ${buyer.name},\n\nMy name is Gabriel Montealegre — I'm the owner of Montsan Real Estate Investment and I focus on finding off-market wholesale deals.\n\nI came across your profile and saw you're active in ${(buyer.markets||[])[0]||'real estate investing'}. I wanted to reach out and introduce myself because I think we might be able to work well together.\n\nI typically find properties at significant discounts in your target markets. Before I send you any deals, I'd love to understand exactly what you're looking for — price range, condition, preferred areas, and timeline.\n\nWould you be open to a quick 10-minute call this week?\n\nBest,\nGabriel Montealegre\nMontsan Real Estate Investment\n${process.env.GMAIL_USER||'montsan.rei@gmail.com'}`,
  };
}

async function generateBuyerEmail(lead, buyer, analysis) {
  const arv   = analysis.arv || lead.arv || 0;
  const offer = analysis.offer || lead.offer || 0;
  const feeLo = analysis.fee_lo || lead.fee_lo || 10000;
  const feeHi = analysis.fee_hi || lead.fee_hi || 25000;
  try {
    const prompt = `Write a professional wholesale deal email.
FROM: Gabriel Montealegre, Montsan Real Estate Investment
TO: ${buyer.name} (${buyer.contact}) — ${buyer.type}
PROPERTY: ${lead.address}
ARV: $${arv.toLocaleString()} | Price: $${offer.toLocaleString()} | Assignment fee: $${feeLo.toLocaleString()}–$${feeHi.toLocaleString()}
Buyer buy box: ${buyer.notes||'Active investor in this area'}
Category: ${lead.category} | ${lead.beds}BD/${lead.baths}BA | ${lead.sqft}sqft | DOM: ${lead.dom}
Write 100-150 words. Subject + body. Reference their buy box specifically. Return JSON: {"subject":"...","body":"..."}`;
    const raw   = await ask(prompt, '', 600);
    const m     = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch(e) {}
  return {
    subject: `Deal Match: ${lead.address?.split(',')[0]} | ARV $${(arv/1000).toFixed(0)}K`,
    body: `Hi ${buyer.contact},\n\nThought of you immediately when this came across my desk.\n\n${lead.address}\nARV: $${arv.toLocaleString()} | Price: $${offer.toLocaleString()} | Fee: $${feeLo.toLocaleString()}–$${feeHi.toLocaleString()}\n${lead.beds}BD/${lead.baths}BA · ${lead.sqft} sqft · ${lead.category}\n\nMotivated seller, quick close possible. Fits your buy box in ${lead.county||'this market'}.\n\nWant the full package? Reply or call.\n\nGabriel Montealegre\nMontsan REI`,
  };
}

async function generateSellerScript(lead) {
  if (lead.script) return lead.script;
  return `Hi, this is Gabriel with Montsan Real Estate. I'm a local cash buyer — I saw your property at ${lead.address?.split(',')[0]} and I'd love to make you a fair cash offer. We close in 14 days, no repairs, no agent fees. Is that something you'd be open to talking about?`;
}

function estimateARV(prop) {
  const market = getMarketData(prop.county||'Dallas', prop.state||'TX');
  return Math.max(60000, Math.round(market.arv + ((prop.beds||3)-3)*18000 + ((prop.sqft||1400)-1400)*28));
}
function estimateRepairs(prop) {
  const age = 2026-(prop.year||1975); const sqft = prop.sqft||1400;
  return age<15?Math.round(sqft*20):age<30?Math.round(sqft*38):age<50?Math.round(sqft*55):Math.round(sqft*72);
}
function fallbackAnalysis(prop, arv, rep) {
  const mao = Math.round(arv*0.70-rep); const offer = Math.round(mao*0.94);
  const spread = Math.max(5000, arv-offer-rep);
  const rentEst = Math.round(arv * 0.005);
  const strategy = classifyDeal(arv, offer, rep, rentEst);
  return {
    arv, repairs:rep, repair_class:rep>80000?'HEAVY':rep>40000?'MEDIUM':'LIGHT',
    repair_items:[{item:'Full renovation estimate',cost:rep}],
    mao, offer, fee_lo:Math.round(spread*0.35), fee_hi:Math.round(spread*0.55), spread,
    risk:spread>65000?'Low':spread>30000?'Medium':'High',
    risk_note:'Standard inspection recommended.',
    close_time:'14-21 days cash',
    why_good_deal:`${prop.category||'Distressed'} property at ${Math.round((arv-offer)/arv*100)}% below ARV. ${strategy} opportunity in ${prop.county||'this'} County, ${prop.state||'TX'}.`,
    distress_signals:[prop.category||'Motivated Seller','Extended market time','Below market price'],
    motivation:['Needs quick cash solution','Property needs work','Timeline pressure'],
    investment_strategy: strategy,
    strategy_note:`Best exit: ${strategy}.`,
    comp_range:`$${Math.round(arv*0.88).toLocaleString()} – $${Math.round(arv*1.12).toLocaleString()}`,
    comp_trend:'STABLE',
    script:`Hi, I'm Gabriel — local cash buyer. I can close on ${prop.address?.split(',')[0]} in 14 days, cash, no repairs. Interested?`,
    offer_email:`Hi, I'd like to make a cash offer of $${offer.toLocaleString()} for your property at ${prop.address}. We close in 14 days, no agent fees, no repairs. Would you like to discuss?`,
    negotiation_text:`Hi, following up on ${prop.address?.split(',')[0]}. Cash offer of $${offer.toLocaleString()} is still available. Quick close, no hassle.`,
    arv_note:`Estimated based on ${prop.county||'local'} comparable sales.`,
    profit_note:`End buyer spread: $${spread.toLocaleString()} after repairs. Fee: $${Math.round(spread*0.35).toLocaleString()}–$${Math.round(spread*0.55).toLocaleString()}`,
  };
}

// ── Land deal generation ──────────────────────────────────────────────────
const LAND_SIGNALS = ['near new residential subdivision','adjacent to planned development','rezoning activity nearby','infrastructure expansion zone','population growth corridor','builder acquisition cluster','new highway interchange planned','commercial development expanding','solar farm acquisition target','agricultural land near city limits'];
function generateLandLeads(county, state, count=10) {
  const market = getMarketData(county, state);
  const leads  = [];
  const zonings = ['Residential Agricultural','Unzoned','Rural','Commercial-adjacent','Mixed Use Transitional'];
  const roads   = ['Paved road frontage','Dirt road access','Landlocked — easement needed','Highway frontage'];
  for (let i = 0; i < count; i++) {
    const acres  = (Math.random()*40+2).toFixed(1);
    const askPsf = Math.round((market.arv*0.008)+Math.random()*5000);
    const asking = Math.round(acres*askPsf);
    const estVal = Math.round(asking*(1.25+Math.random()*0.5));
    const spread = estVal - asking;
    const zipBase = market.zip_prefix?.[0]||'750';
    const city   = market.neighborhoods[Math.floor(Math.random()*market.neighborhoods.length)]||county;
    leads.push({
      address:`${Math.floor(Math.random()*9000+100)} County Rd, ${city}, ${state} ${zipBase}${String(Math.floor(Math.random()*99)).padStart(2,'0')}`,
      type:'Land', isLand:true, beds:0, baths:0, sqft:0, acres:parseFloat(acres), year:0,
      county, state, category:'Land — Development Opportunity',
      list_price:'$'+asking.toLocaleString(), dom:Math.floor(Math.random()*120+30),
      seller_type:'Owner', phone:`(${rndInt(200,989)}) ${rndInt(200,989)}-${rndInt(1000,9999)}`,
      status:'Active', zoning:zonings[i%zonings.length], road_access:roads[i%roads.length],
      arv:estVal, offer:Math.round(asking*0.82), repairs:0, asking_price:asking, spread,
      fee_lo:Math.round(spread*0.3), fee_hi:Math.round(spread*0.5),
      mao:Math.round(estVal*0.75), risk:'Medium', dev_score:Math.floor(Math.random()*40+60),
      growth_signals:[LAND_SIGNALS[i%LAND_SIGNALS.length],'Builder activity detected in county'],
      investment_strategy:'Land Deal', deal_classification:'Land Deal',
      why_good_deal:`${acres} acres in ${county} County. Development potential. Listed at ${Math.round((estVal-asking)/estVal*100)}% below estimated value.`,
      source:'AI Generated', source_platform:'AI Generated',
    });
  }
  return leads;
}

module.exports = { ask, analyzeProperty, generateLeadList, generateLandLeads, generateBuyerEmail, generateBuyerIntroOutreach, generateSellerScript, generateDeepOutreach, classifyDeal, selectMarketsForWeek, MODE };
