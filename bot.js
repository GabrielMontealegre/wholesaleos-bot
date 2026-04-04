require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express     = require('express');
const cron        = require('node-cron');

const db      = require('./db');
const ai      = require('./ai');
const { selectMarketsForWeek, getMarketData } = require('./markets');
const { generateLeadsPDF, generateSinglePropertyPDF } = require('./pdf');
const { sendDealToBuyer, sendSellerOutreach, testConnection } = require('./email');

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = process.env.BOT_OWNER_ID;
const PORT     = process.env.PORT || 3000;
const RAILWAY_URL = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null;
const USE_WEBHOOK = !!RAILWAY_URL;

let bot;
if (USE_WEBHOOK) {
  bot = new TelegramBot(TOKEN, { webHook: false });
} else {
  bot = new TelegramBot(TOKEN, { polling: true });
}

function isOwner(msg) { return !OWNER_ID || String(msg.from.id) === String(OWNER_ID); }
function guard(msg) { if (!isOwner(msg)) { bot.sendMessage(msg.chat.id, 'Unauthorized.'); return false; } return true; }
const send = (chatId, text, opts={}) => bot.sendMessage(chatId, text, { parse_mode:'HTML', ...opts }).catch(e => console.error('Send error:', e.message));
const sendDoc = (chatId, buf, filename, caption='') => bot.sendDocument(chatId, buf, { caption }, { filename, contentType:'application/pdf' });
function typing(chatId) { bot.sendChatAction(chatId, 'typing').catch(()=>{}); }

// ── Core lead generation function (reused by bot commands + crons) ────────
async function runLeadSearch(county, state, count, cats, chatId=null) {
  const notify = msg => chatId ? send(chatId, msg) : console.log(msg);
  notify(`Searching <b>${county} County, ${state}</b> for <b>${count} leads</b>...\nAI: <b>${ai.MODE()==='premium'?'Claude':'Llama 3.3 Free'}</b>`);
  if (chatId) bot.sendChatAction(chatId, 'upload_document');

  const allLeads = [], allAnalyses = [];
  const batchSize = 20, batches = Math.ceil(count/batchSize);
  const market = getMarketData(county, state);

  for (let b = 0; b < batches; b++) {
    const bCount = Math.min(batchSize, count - b*batchSize);
    if (chatId) bot.sendChatAction(chatId, 'upload_document');
    const rawLeads = await ai.generateLeadList(county, state, bCount, cats);

    for (const rawLead of rawLeads) {
      if (db.leadExists(rawLead.address)) continue;
      let analysis = {};
      try { analysis = await ai.analyzeProperty({...rawLead, county, state}); } catch(e) { console.error('Analysis:', e.message); }

      const finalArv   = (analysis.arv   > 50000) ? analysis.arv   : (rawLead.arv   > 50000 ? rawLead.arv   : market.arv);
      const finalRep   = (analysis.repairs> 1000) ? analysis.repairs : (rawLead.repairs>0 ? rawLead.repairs : Math.round((rawLead.sqft||1400)*42));
      const finalOffer = (analysis.offer  > 10000) ? analysis.offer  : (rawLead.offer  > 10000 ? rawLead.offer  : Math.round((finalArv*0.70-finalRep)*0.94));
      const finalSpread= finalArv - finalOffer - finalRep;

      const saved = db.addLead({
        ...rawLead, state, county,
        arv: Math.round(finalArv), offer: Math.round(finalOffer), repairs: Math.round(finalRep),
        repair_class: analysis.repair_class || rawLead.repair_class || 'MEDIUM',
        mao: Math.round(finalArv*0.70-finalRep),
        fee_lo: analysis.fee_lo || rawLead.fee_lo || Math.round(finalSpread*0.35),
        fee_hi: analysis.fee_hi || rawLead.fee_hi || Math.round(finalSpread*0.55),
        spread: Math.round(finalSpread),
        risk: analysis.risk || rawLead.risk || 'Medium',
        why_good_deal: analysis.why_good_deal || rawLead.why_good_deal || `${rawLead.category||'Distressed'} property at discount in ${county} County.`,
        distress_signals: analysis.distress_signals || rawLead.distress_signals || [rawLead.category||'Motivated Seller'],
        motivation: analysis.motivation || rawLead.motivation || [],
        investment_strategy: analysis.investment_strategy || rawLead.investment_strategy || 'Wholesale Assignment',
        script: analysis.script || rawLead.script || '',
        offer_email: analysis.offer_email || rawLead.offer_email || '',
        negotiation_text: analysis.negotiation_text || rawLead.negotiation_text || '',
        strategy_note: analysis.strategy_note || '',
        profit_note: analysis.profit_note || rawLead.profit_note || '',
        arv_note: analysis.arv_note || rawLead.arv_note || '',
      });
      allLeads.push(saved); allAnalyses.push(analysis);
    }
    if (b < batches-1) notify(`Batch ${b+1}/${batches} — ${allLeads.length} leads so far...`);
  }

  if (!allLeads.length) return { leads: [], analyses: [] };

  // Real buyer scrape for this market (no fake buyers)
  try {
    const scraper = require('./scraper');
    const buyers  = await scraper.scrapeCraigslistBuyers({ clRegion: county.toLowerCase().replace(/\s/g,''), county, state });
    const added   = buyers.length > 0 ? db.addBuyersBulk(buyers) : 0;
    if (added > 0) {
      db.addNotification('buyer', `${added} real buyers found`, `Scraped ${added} cash buyers for ${county} County, ${state}`, {county, state});
    }
  } catch(e) { console.error('Buyer scrape error:', e.message); }

  // Track scanned market + notification
  db.addScannedMarket(state, county);
  db.addNotification('deal', `${allLeads.length} leads added`, `${county} County, ${state} — ${allLeads.length} new wholesale leads`, {county, state, count: allLeads.length});

  allLeads.sort((a,b) => (b.spread||0)-(a.spread||0));
  return { leads: allLeads, analyses: allAnalyses };
}

// ── /start or /help ───────────────────────────────────────────────────────
bot.onText(/\/(start|help)/, async (msg) => {
  if (!guard(msg)) return;
  send(msg.chat.id, `<b>WholesaleOS Bot</b> — Nationwide Deal Machine\n\n<b>FIND LEADS (all 50 states)</b>\n/leads Dallas TX 50\n/leads San Diego CA 100\n/leads Cuyahoga OH 200\n/leads Harris TX 400\n\n<b>MANAGE</b>\n/pipeline — deal pipeline\n/lead [address] — view lead\n/status [lead] [status]\n/clearleads — remove duplicates\n\n<b>BUYERS</b>\n/buyers — buyer database\n/match [lead] — find buyers\n/send [lead] [buyer]\n\n<b>SCANNING</b>\n/scan — run 4-market nationwide scan now\n/markets — show best markets this week\n\n<b>SETTINGS</b>\n/stats — full dashboard\n/mode free|premium\n/test — test connections`);
});

// ── /stats ────────────────────────────────────────────────────────────────
bot.onText(/\/stats/, async (msg) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  const s = db.getStats();
  const tree = db.getLeadsByStateCounty();
  const states = Object.keys(tree);
  let text = `<b>WholesaleOS — Nationwide Dashboard</b>\n\n`;
  text += `Total Leads: <b>${s.total_leads}</b> across <b>${states.length}</b> states\n`;
  text += `New: <b>${s.new_leads}</b> | Under Contract: <b>${s.under_contract}</b>\n`;
  text += `Pipeline Fees: <b>$${s.fees_pipeline.toLocaleString()}</b>\n`;
  text += `Buyers: <b>${s.active_buyers}</b> | AI: <b>${ai.MODE()==='premium'?'Claude':'Llama Free'}</b>\n\n`;
  states.slice(0,5).forEach(st => {
    const counties = Object.keys(tree[st]);
    const total = counties.reduce((s,c) => s+tree[st][c].length, 0);
    text += `📍 ${st}: ${total} leads (${counties.join(', ')})\n`;
  });
  send(msg.chat.id, text);
});

// ── /mode ─────────────────────────────────────────────────────────────────
bot.onText(/\/mode (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const mode = match[1].trim().toLowerCase();
  if (!['free','premium'].includes(mode)) return send(msg.chat.id, 'Use /mode free or /mode premium');
  process.env.AI_MODE = mode;
  db.setSetting('ai_mode', mode);
  send(msg.chat.id, `Switched to <b>${mode==='premium'?'Claude Premium':'Llama 3.3 Free'}</b>`);
});

// ── /test ─────────────────────────────────────────────────────────────────
bot.onText(/\/test/, async (msg) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  send(msg.chat.id, 'Testing all connections...');
  let aiOk = false;
  try { const r = await ai.ask('Reply OK','',10); aiOk = r.toLowerCase().includes('ok'); } catch {}
  const emailTest = await testConnection();
  const dbLeads = db.getLeads().length;
  send(msg.chat.id, `<b>Connection Test</b>\n\n${aiOk?'✅':'❌'} AI (${ai.MODE()}): ${aiOk?'Connected':'Error'}\n${emailTest.success?'✅':'❌'} Gmail: ${emailTest.success?'Connected':emailTest.error}\n✅ Database: ${dbLeads} leads\n✅ Telegram: Connected\n\n${aiOk&&emailTest.success?'🟢 All systems ready!':'🔴 Check connections above'}`);
});

// ── /leads ────────────────────────────────────────────────────────────────
bot.onText(/\/leads (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].trim().split(/\s+/);
  const numIdx = parts.findIndex(p => !isNaN(parseInt(p)) && parseInt(p) > 0);
  let county, count, state, cats;

  if (numIdx > 0) {
    const countyParts = parts.slice(0, numIdx);
    // Check if last county part is a state code (2 uppercase letters)
    const lastPart = countyParts[countyParts.length-1];
    if (/^[A-Z]{2}$/.test(lastPart)) {
      state = lastPart;
      county = countyParts.slice(0,-1).join(' ');
    } else {
      county = countyParts.join(' ');
      state = null;
    }
    count = Math.min(parseInt(parts[numIdx])||20, 400);
    cats  = parts.slice(numIdx+1).filter(p=>p.length>1);
  } else {
    county = parts.join(' ').replace(/\d+/g,'').trim() || 'Dallas';
    count = 20; state = null; cats = [];
  }
  if (!cats.length) cats = ['Pre-FC','REO','Long DOM','FSBO','Probate','Auction','Tax Delinquent'];

  // Auto-detect state if not provided
  if (!state) {
    const CA = ['San Diego','Los Angeles','LA','Orange','Riverside','Sacramento','San Francisco','Alameda','Santa Clara','San Bernardino','Ventura','Kern','Fresno'];
    const FL = ['Miami-Dade','Broward','Palm Beach','Hillsborough','Orange','Pinellas','Duval','Polk'];
    const GA = ['Fulton','DeKalb','Gwinnett','Clayton','Cobb','Chatham'];
    const OH = ['Cuyahoga','Franklin','Hamilton','Summit','Montgomery','Stark'];
    const MI = ['Wayne','Oakland','Macomb','Genesee','Kent'];
    const IL = ['Cook','DuPage','Lake','Will','Kane'];
    const AZ = ['Maricopa','Pima','Pinal'];
    const NC = ['Mecklenburg','Wake','Guilford','Forsyth','Durham'];
    const NV = ['Clark','Washoe'];
    const TN = ['Shelby','Davidson','Hamilton','Knox'];
    if (CA.includes(county)) state='CA';
    else if (FL.some(c=>county.includes(c))) state='FL';
    else if (GA.includes(county)) state='GA';
    else if (OH.includes(county)) state='OH';
    else if (MI.includes(county)) state='MI';
    else if (IL.includes(county)) state='IL';
    else if (AZ.includes(county)) state='AZ';
    else if (NC.includes(county)) state='NC';
    else if (NV.includes(county)) state='NV';
    else if (TN.includes(county)) state='TN';
    else state='TX';
  }

  try {
    const { leads, analyses } = await runLeadSearch(county, state, count, cats, msg.chat.id);
    if (!leads.length) return send(msg.chat.id, 'No new leads found. Send /clearleads then try again.');

    send(msg.chat.id, `Found <b>${leads.length} leads</b> — generating PDF...`);
    bot.sendChatAction(msg.chat.id, 'upload_document');
    const pdfBuffer = await generateLeadsPDF(leads, analyses, `${county} County, ${state} — ${leads.length} Wholesale Leads`);
    await sendDoc(msg.chat.id, pdfBuffer, `${county}_${state}_${leads.length}_Leads.pdf`,
      `<b>${county} County, ${state} — ${leads.length} Leads</b>\nSorted by spread. Total est. fees: $${leads.reduce((s,l)=>s+(l.fee_lo||0),0).toLocaleString()}+`);

    let summary = `\n<b>Top 5 — ${county} County, ${state}</b>\n\n`;
    leads.slice(0,5).forEach((l,i) => {
      summary += `<b>${i+1}. ${l.address.split(',')[0]}</b>\nARV: $${(l.arv||0).toLocaleString()} | Spread: $${(l.spread||0).toLocaleString()} | ${l.category} | ${l.risk}\n\n`;
    });
    send(msg.chat.id, summary);
  } catch(err) {
    console.error('Lead error:', err);
    send(msg.chat.id, `Error: ${err.message}\n\nTry /test to check connections.`);
  }
});

// ── /markets — show best markets for this week ────────────────────────────
bot.onText(/\/markets/, async (msg) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  const scanned = db.getScannedMarkets();
  const markets = selectMarketsForWeek(8, scanned);
  let text = `<b>Best Markets This Week</b>\n\n`;
  markets.forEach((m,i) => {
    text += `<b>${i+1}. ${m.county} County, ${m.stateName}</b>\nARV: $${m.arv.toLocaleString()} | Hotness: ${m.hotness}/100 | Pop: ${(m.pop/1000000).toFixed(1)}M\n`;
    text += `Run: /leads ${m.county} ${m.state} 50\n\n`;
  });
  send(msg.chat.id, text);
});

// ── /scan — run manual nationwide scan ────────────────────────────────────
bot.onText(/\/scan/, async (msg) => {
  if (!guard(msg)) return;
  send(msg.chat.id, '🔍 Starting nationwide scan — selecting 4 best markets...\nThis takes 5-10 minutes.');
  runNationwideScan(msg.chat.id);
});

// ── /clearleads ───────────────────────────────────────────────────────────
bot.onText(/\/clearleads/, async (msg) => {
  if (!guard(msg)) return;
  const { clearFakeLeads } = require('./db');
  const removed = clearFakeLeads();
  send(msg.chat.id, `Cleaned ${removed} generic leads.\n${db.getLeads().length} leads remaining.\n\nRun /leads or /scan to get fresh leads.`);
});

// ── /pipeline ─────────────────────────────────────────────────────────────
bot.onText(/\/pipeline/, async (msg) => {
  if (!guard(msg)) return;
  const leads = db.getLeads();
  const stages = ['New Lead','Contacted','Offer Sent','Negotiating','Under Contract','Closed'];
  let text = '<b>Deal Pipeline</b>\n\n';
  stages.forEach(stage => {
    const items = leads.filter(l => l.status===stage);
    if (!items.length) return;
    const icons = {'New Lead':'🆕','Contacted':'📞','Offer Sent':'📋','Negotiating':'🤝','Under Contract':'✍️','Closed':'✅'};
    text += `${icons[stage]} <b>${stage}</b> (${items.length})\n`;
    items.slice(0,3).forEach(l => { text += `  • ${l.address.split(',')[0]} — $${(l.spread||l.fee_lo||0).toLocaleString()} spread\n`; });
    if (items.length>3) text += `  <i>...and ${items.length-3} more</i>\n`;
    text += '\n';
  });
  if (!leads.length) text += '<i>No leads yet. Use /leads or /scan.</i>';
  send(msg.chat.id, text);
});

// ── /lead ─────────────────────────────────────────────────────────────────
bot.onText(/\/lead (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const leads = db.getLeads();
  const lead = leads.find(l => l.id===match[1].trim() || l.address?.toLowerCase().includes(match[1].trim().toLowerCase()));
  if (!lead) return send(msg.chat.id, 'Lead not found.');
  send(msg.chat.id, `<b>${lead.address}</b>\n\n${lead.type||'SFR'} | ${lead.beds||'?'}BD/${lead.baths||'?'}BA | ${(lead.sqft||0).toLocaleString()} sqft\nCategory: <b>${lead.category}</b> | Status: <b>${lead.status}</b>\nDOM: <b>${lead.dom||0}d</b> | Risk: <b>${lead.risk||'Medium'}</b>\n\nARV: <b>$${(lead.arv||0).toLocaleString()}</b>\nOffer: <b>$${(lead.offer||0).toLocaleString()}</b>\nSpread: <b>$${(lead.spread||0).toLocaleString()}</b>\nFee: <b>$${(lead.fee_lo||0).toLocaleString()}–$${(lead.fee_hi||0).toLocaleString()}</b>\n\nPhone: ${lead.phone||'N/A'}\n\n<i>${lead.why_good_deal||''}</i>\n\nID: ${lead.id}`);
});

// ── /buyers ───────────────────────────────────────────────────────────────
bot.onText(/\/buyers/, async (msg) => {
  if (!guard(msg)) return;
  const buyers = db.getBuyers();
  if (!buyers.length) return send(msg.chat.id, 'No buyers yet. Run /leads or /scan to auto-populate buyers.');
  let text = `<b>Buyers Database (${buyers.length})</b>\n\n`;
  buyers.slice(0,10).forEach(b => { text += `<b>${b.name}</b>\n${b.type} | ${b.contact} | Max: $${(b.maxPrice||0).toLocaleString()}\n\n`; });
  if (buyers.length>10) text += `<i>...and ${buyers.length-10} more. See dashboard for full list.</i>`;
  send(msg.chat.id, text);
});

// ── /match ────────────────────────────────────────────────────────────────
bot.onText(/\/match (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  const leads = db.getLeads();
  const lead = leads.find(l => l.id===match[1].trim() || l.address?.toLowerCase().includes(match[1].trim().toLowerCase()));
  if (!lead) return send(msg.chat.id, 'Lead not found.');
  const matches = db.matchBuyersToLead(lead);
  if (!matches.length) return send(msg.chat.id, 'No matching buyers. Run /scan to auto-populate buyers.');
  let text = `<b>Matches for ${lead.address.split(',')[0]}</b>\nARV: $${(lead.arv||0).toLocaleString()} | Spread: $${(lead.spread||0).toLocaleString()}\n\n`;
  matches.slice(0,5).forEach(b => { text += `<b>${b.name}</b>\n${b.type} | ${b.contact} — ${b.phone}\n\n`; });
  send(msg.chat.id, text);
});

// ── /status ───────────────────────────────────────────────────────────────
bot.onText(/\/status (.+?) (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const leads = db.getLeads();
  const lead = leads.find(l => l.id===match[1].trim() || l.address?.toLowerCase().includes(match[1].trim().toLowerCase()));
  if (!lead) return send(msg.chat.id, 'Lead not found.');
  const statuses = ['New Lead','Contacted','Offer Sent','Negotiating','Under Contract','Closed','Dead'];
  const matched = statuses.find(s => s.toLowerCase().includes(match[2].trim().toLowerCase()));
  if (!matched) return send(msg.chat.id, `Valid: ${statuses.join(', ')}`);
  db.updateLead(lead.id, {status:matched});
  send(msg.chat.id, `Updated to <b>${matched}</b>`);
});

// ── /calendar & /remind ───────────────────────────────────────────────────
bot.onText(/\/calendar/, async (msg) => {
  if (!guard(msg)) return;
  const events = db.getUpcomingEvents(30);
  if (!events.length) return send(msg.chat.id, 'No events.\n/remind 2026-04-15 Offer deadline Dallas');
  let text = '<b>Calendar — 30 Days</b>\n\n';
  events.forEach(e => { text += `${e.type==='close'?'🎉':e.type==='offer'?'📋':'📞'} <b>${e.date}</b> — ${e.title}\n`; });
  send(msg.chat.id, text);
});

bot.onText(/\/remind (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].trim().split(/\s+/);
  const date  = parts.find(p => /\d{4}-\d{2}-\d{2}/.test(p)) || parts[0];
  const title = parts.filter(p => !p.match(/\d{4}-\d{2}-\d{2}/)).join(' ');
  const evt   = db.addEvent({date, title, type:title.toLowerCase().includes('clos')?'close':title.toLowerCase().includes('offer')?'offer':'call', time:''});
  send(msg.chat.id, `Added: ${evt.date} — ${evt.title}`);
});

// ── Natural language fallback ─────────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!guard(msg)) return;
  if (!msg.text || msg.text.startsWith('/')) return;
  const t = msg.text.toLowerCase();
  if (t.includes('free')) { process.env.AI_MODE='free'; return send(msg.chat.id,'Switched to Llama Free'); }
  if (t.includes('premium')||t.includes('claude')) { process.env.AI_MODE='premium'; return send(msg.chat.id,'Switched to Claude Premium'); }
  send(msg.chat.id, '/leads Dallas TX 50\n/leads San Diego CA 100\n/scan — auto nationwide\n/markets — best this week\n/pipeline\n/buyers\n/stats\n/help');
});

// ══════════════════════════════════════════════════════════
//  AUTOMATED SCANNING SYSTEM
// ══════════════════════════════════════════════════════════

async function runNationwideScan(chatId=null) {
  const notify = msg => chatId ? send(chatId, msg) : console.log('[SCAN]', msg);
  try {
    const scanned = db.getScannedMarkets();
    const markets = selectMarketsForWeek(4, scanned);
    notify(`🌎 Scanning <b>${markets.length}</b> markets:\n${markets.map(m=>`• ${m.county}, ${m.stateName}`).join('\n')}`);

    let totalLeads = 0, totalBuyers = 0;
    for (const market of markets) {
      try {
        notify(`Scanning ${market.county} County, ${market.stateName}...`);
        const cats = ['Pre-FC','REO','Long DOM','FSBO','Probate','Auction','Tax Delinquent'];
        const { leads } = await runLeadSearch(market.county, market.state, 20, cats, null);
        totalLeads += leads.length;
        if (chatId) bot.sendChatAction(chatId, 'typing');
        await new Promise(r => setTimeout(r, 2000));
      } catch(e) { console.error(`Scan error for ${market.county}:`, e.message); }
    }

    const buyers = db.getBuyers().length;
    const summary = `✅ <b>Nationwide Scan Complete</b>\n\n📊 ${totalLeads} new leads added\n💼 ${buyers} total buyers in database\n📍 Markets: ${markets.map(m=>m.county+', '+m.state).join(' | ')}\n\nCheck your dashboard for ranked leads.`;
    notify(summary);
    db.addNotification('scan', 'Nationwide scan complete', `${totalLeads} leads added across ${markets.length} markets`);
  } catch(e) { notify(`Scan error: ${e.message}`); }
}

// ── CRONS ─────────────────────────────────────────────────────────────────

// Daily 7AM briefing (MST)
cron.schedule('0 14 * * *', async () => {
  if (!OWNER_ID) return;
  const stats = db.getStats(), events = db.getUpcomingEvents(3);
  const unread = db.getNotifications(true).length;
  let text = `Good morning Gabriel! 🌅\n\n📊 <b>Today's Summary</b>\nLeads: ${stats.total_leads} | Pipeline: $${stats.fees_pipeline.toLocaleString()}\n${unread > 0 ? `🔔 ${unread} new notifications` : '✅ All caught up'}\n\n`;
  if (events.length) { text += '<b>Upcoming:</b>\n'; events.forEach(e => { text += `${e.date} — ${e.title}\n`; }); }
  text += '\n/leads [County] [State] [count] to find deals\n/scan for auto nationwide scan';
  send(OWNER_ID, text);
});

// 4x per week scan (Mon, Tue, Thu, Sat at 6AM MST = 1PM UTC)
cron.schedule('0 13 * * 1,2,4,6', async () => {
  console.log('[CRON] Starting scheduled nationwide scan...');
  if (OWNER_ID) send(OWNER_ID, '🔄 Scheduled nationwide scan starting...');
  await runNationwideScan(OWNER_ID || null);
});

// Daily buyer scrape at 6AM MST (1PM UTC) — 15 hot markets
cron.schedule('0 13 * * *', async () => {
  console.log('[CRON] Daily buyer scrape starting...');
  try {
    const scraper = require('./scraper');
    const added   = await scraper.runDailyBuyerScrape(db);
    if (added > 0) {
      db.addNotification('buyer', `${added} new buyers found`, `Daily Craigslist + Connected Investors scrape complete`);
      if (OWNER_ID) send(OWNER_ID, `💼 Daily buyer scrape: ${added} new cash buyers added to database`);
    }
  } catch(e) { console.error('[CRON] Buyer scrape error:', e.message); }
});

// Weekly all-50-states buyer scrape — every Wednesday at 7AM MST (2PM UTC)
cron.schedule('0 14 * * 3', async () => {
  console.log('[CRON] Weekly all-states buyer scrape starting...');
  try {
    const scraper = require('./scraper');
    const added   = await scraper.runWeeklyBuyerScrape(db);
    if (added > 0) {
      db.addNotification('buyer', `${added} buyers added (weekly scan)`, 'All 50 states Craigslist scrape complete');
      if (OWNER_ID) send(OWNER_ID, `🗺 Weekly buyer scrape: ${added} new buyers added from all 50 states`);
    }
  } catch(e) { console.error('[CRON] Weekly buyer scrape error:', e.message); }
});

// Daily deal scrape at 7AM MST (2PM UTC) — Craigslist + HUD + FSBO
cron.schedule('0 14 * * *', async () => {
  console.log('[CRON] Daily deal scrape starting...');
  try {
    const scraper = require('./scraper');
    const { validated, reviewQueue } = await scraper.runDailyDealScrape(db);
    // Save validated deals
    for (const deal of validated) {
      try { db.saveLead({ ...deal, id: require('crypto').randomUUID(), status: 'New', created: new Date().toISOString().slice(0,10) }); } catch(e2) {}
    }
    // Save review queue to DB
    if (reviewQueue.length > 0) {
      const dbData = db.readDB();
      if (!dbData.reviewQueue) dbData.reviewQueue = [];
      dbData.reviewQueue = [...reviewQueue.map(d => ({ ...d, id: require('crypto').randomUUID(), queuedAt: new Date().toISOString() })), ...dbData.reviewQueue].slice(0, 500);
      db.writeDB(dbData);
    }
    if (validated.length > 0 || reviewQueue.length > 0) {
      db.addNotification('deal', `${validated.length} deals scraped`, `${validated.length} validated, ${reviewQueue.length} need review`);
      if (OWNER_ID) send(OWNER_ID, `🏠 Daily deal scrape: ${validated.length} new deals added, ${reviewQueue.length} need your review`);
    }
  } catch(e) { console.error('[CRON] Deal scrape error:', e.message); }
});

// Daily 2AM backup
cron.schedule('0 9 * * *', async () => {
  try {
    const leads = db.getLeads(), buyers = db.getBuyers();
    const today = new Date().toISOString().slice(0,10);
    const todayLeads = leads.filter(l => l.created===today);
    const dbData = db.readDB();
    if (!dbData.backups) dbData.backups = [];
    dbData.backups.push({ date: today, leads: todayLeads.length, buyers: buyers.length, total_leads: leads.length });
    if (dbData.backups.length > 90) dbData.backups = dbData.backups.slice(-90);
    db.writeDB(dbData);
    console.log(`[BACKUP] ${today}: ${todayLeads.length} new leads, ${leads.length} total`);
    db.addNotification('system', 'Daily backup complete', `${todayLeads.length} new leads today, ${leads.length} total`);
  } catch(e) { console.error('Backup error:', e.message); }
});

// ── FREE DATA SOURCES — Daily 7AM MST (2PM UTC) ───────────────────────────
cron.schedule('0 14 * * *', async () => {
  console.log('[CRON] Starting daily free data sources pull...');
  try {
    const ds = require('./modules/datasources');
    const results = await ds.runAllFreeSources();
    // Add to review queue
    const dbData = db.readDB();
    if (!dbData.reviewQueue) dbData.reviewQueue = [];
    const existingUrls = new Set(dbData.reviewQueue.map(r => r.sourceUrl).filter(Boolean));
    let leadsAdded = 0;
    for (const lead of results.leads) {
      if (!existingUrls.has(lead.sourceUrl) && !db.leadExists(lead.address)) {
        dbData.reviewQueue.push(lead);
        leadsAdded++;
      }
    }
    db.writeDB(dbData);
    // Add buyers
    let buyersAdded = 0;
    const existing = db.getBuyers().map(b => `${b.name||''}${b.phone||''}`);
    for (const buyer of results.buyers) {
      const key = `${buyer.name||''}${buyer.phone||''}`;
      if (!existing.includes(key) && key.length > 3) { db.addBuyer(buyer); buyersAdded++; }
    }
    db.addNotification('system', `Daily data pull complete`, `${leadsAdded} leads + ${buyersAdded} buyers. Sources: HUD, Cook County, Wayne County, Clark County, Maricopa, Connected Investors, BiggerPockets`);
    if (OWNER_ID && (leadsAdded + buyersAdded) > 0) {
      send(OWNER_ID, `📊 <b>Daily data pull complete</b>\n🏠 ${leadsAdded} new leads in Review Queue\n💼 ${buyersAdded} new buyers added\n\nCheck dashboard → Review Queue`);
    }
    console.log(`[CRON] Data pull: ${leadsAdded} leads, ${buyersAdded} buyers`);
  } catch(e) { console.error('[CRON] Data sources error:', e.message); }
});

cron.schedule('0 13 * * *', async () => {
  console.log('[CRON] Starting daily Craigslist buyer scrape — 15 hot markets...');
  try {
    const { scrapeCraigslistBuyers, HOT_MARKETS } = require('./modules/scraper');
    const buyers = await scrapeCraigslistBuyers(HOT_MARKETS);
    let added = 0;
    const existing = db.getBuyers().map(b => `${b.phone||''}${b.email||''}`);
    for (const b of buyers) {
      const key = `${b.phone||''}${b.email||''}`;
      if (key.length > 3 && !existing.includes(key)) {
        b.id = require('uuid').v4();
        db.addBuyer(b);
        added++;
      }
    }
    db.addNotification('buyer', `${added} real buyers found`, `Daily Craigslist scrape — 15 hot markets`);
    if (OWNER_ID && added > 0) send(OWNER_ID, `💼 <b>${added} new buyers found</b> from Craigslist today. Check Buyers tab.`);
    console.log(`[CRON] Buyer scrape complete: ${added} new buyers`);
  } catch(e) { console.error('[CRON] Buyer scrape error:', e.message); }
});

// ── CRAIGSLIST DEAL SCRAPER — Daily 6:30AM MST (1:30PM UTC) hot markets ─────
cron.schedule('30 13 * * *', async () => {
  console.log('[CRON] Starting daily deal scrape — Craigslist, HUD, FSBO, Landwatch...');
  try {
    const { scrapeCraigslistDeals, scrapeHUDHomes, scrapeFSBO, scrapeLandWatch, HOT_MARKETS } = require('./modules/scraper');
    const [clRes, hudRes, fsboRes, landRes] = await Promise.allSettled([
      scrapeCraigslistDeals(HOT_MARKETS),
      scrapeHUDHomes(),
      scrapeFSBO(),
      scrapeLandWatch(),
    ]);
    const allDeals = [
      ...(clRes.value||[]),
      ...(hudRes.value||[]),
      ...(fsboRes.value||[]),
      ...(landRes.value||[]),
    ];
    const dbData = db.readDB();
    if (!dbData.reviewQueue) dbData.reviewQueue = [];
    const existingUrls = new Set(dbData.reviewQueue.map(r => r.sourceUrl));
    let added = 0;
    for (const deal of allDeals) {
      if (!existingUrls.has(deal.sourceUrl)) {
        deal.id = require('uuid').v4();
        dbData.reviewQueue.push(deal);
        added++;
      }
    }
    db.writeDB(dbData);
    db.addNotification('deal', `${added} deals in Review Queue`, `From Craigslist, HUD, FSBO, Landwatch`);
    if (OWNER_ID && added > 0) send(OWNER_ID, `🏠 <b>${added} new deals</b> in Review Queue. Go to dashboard to review.`);
    console.log(`[CRON] Deal scrape complete: ${added} new deals queued`);
  } catch(e) { console.error('[CRON] Deal scrape error:', e.message); }
});

// ── ALL-50-STATE SCRAPE — Twice weekly Wed & Sun 7AM MST (2PM UTC) ───────────
cron.schedule('0 14 * * 0,3', async () => {
  console.log('[CRON] Starting full 50-state buyer + deal scrape...');
  try {
    const { scrapeCraigslistBuyers, scrapeCraigslistDeals, ALL_STATE_MARKETS } = require('./modules/scraper');
    if (OWNER_ID) send(OWNER_ID, '🌎 Full 50-state scrape starting — buyers + deals...');
    const [buyersRes, dealsRes] = await Promise.allSettled([
      scrapeCraigslistBuyers(ALL_STATE_MARKETS),
      scrapeCraigslistDeals(ALL_STATE_MARKETS),
    ]);
    const buyers = buyersRes.value || [];
    const deals  = dealsRes.value  || [];
    let buyersAdded = 0;
    const existing = db.getBuyers().map(b => `${b.phone||''}${b.email||''}`);
    for (const b of buyers) {
      const key = `${b.phone||''}${b.email||''}`;
      if (key.length > 3 && !existing.includes(key)) { b.id = require('uuid').v4(); db.addBuyer(b); buyersAdded++; }
    }
    const dbData = db.readDB();
    if (!dbData.reviewQueue) dbData.reviewQueue = [];
    const existingUrls = new Set(dbData.reviewQueue.map(r => r.sourceUrl));
    let dealsAdded = 0;
    for (const deal of deals) {
      if (!existingUrls.has(deal.sourceUrl)) { deal.id = require('uuid').v4(); dbData.reviewQueue.push(deal); dealsAdded++; }
    }
    db.writeDB(dbData);
    db.addNotification('system', `50-state scrape complete`, `${buyersAdded} buyers + ${dealsAdded} deals`);
    if (OWNER_ID) send(OWNER_ID, `✅ 50-state scrape done: <b>${buyersAdded} buyers</b> + <b>${dealsAdded} deals</b> added.`);
  } catch(e) { console.error('[CRON] 50-state scrape error:', e.message); }
});


// ── EXPRESS SERVER ────────────────────────────────────────────────────────
const app = require('./server');

if (USE_WEBHOOK) {
  app.post(`/bot${TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
  setTimeout(() => { bot.setWebHook(`${RAILWAY_URL}/bot${TOKEN}`); }, 2000);
}

try {
  app.listen(PORT, '0.0.0.0', () => { console.log(`WholesaleOS Bot started on port ${PORT}`); });
} catch(err) { console.error('Server start error:', err.message); }

console.log('WholesaleOS Nationwide Bot running...');
console.log(`AI Mode: ${ai.MODE()}`);
console.log(`Gmail: ${process.env.GMAIL_USER}`);
console.log(`Mode: ${USE_WEBHOOK ? 'Webhook' : 'Polling'}`);
