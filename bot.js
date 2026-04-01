require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express     = require('express');
const cron        = require('node-cron');
 
const db      = require('./db');
const ai      = require('./ai');
const { generateLeadsPDF, generateSinglePropertyPDF } = require('./pdf');
const { sendDealToBuyer, sendSellerOutreach, testConnection } = require('./email');
 
const TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = process.env.BOT_OWNER_ID;
const PORT     = process.env.PORT || 3000;
const RAILWAY_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : null;
 
// Use webhook if we have a public URL, otherwise polling
const USE_WEBHOOK = !!RAILWAY_URL;
 
let bot;
if (USE_WEBHOOK) {
  bot = new TelegramBot(TOKEN, { webHook: { port: PORT } });
} else {
  bot = new TelegramBot(TOKEN, { polling: true });
}
 
function isOwner(msg) {
  if (!OWNER_ID) return true;
  return String(msg.from.id) === String(OWNER_ID);
}
function guard(msg) {
  if (!isOwner(msg)) { bot.sendMessage(msg.chat.id, 'Unauthorized.'); return false; }
  return true;
}
const send = (chatId, text, opts = {}) =>
  bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...opts }).catch(e => console.error('Send error:', e.message));
const sendDoc = (chatId, buffer, filename, caption = '') =>
  bot.sendDocument(chatId, buffer, { caption }, { filename, contentType: 'application/pdf' });
function typing(chatId) { bot.sendChatAction(chatId, 'typing').catch(()=>{}); }
 
// /start or /help
bot.onText(/\/(start|help)/, async (msg) => {
  if (!guard(msg)) return;
  send(msg.chat.id, `<b>WholesaleOS Bot</b> — Gabriel's Deal Machine
 
<b>FIND LEADS</b>
/leads Dallas 50 — find 50 leads in Dallas County
/leads Tarrant 100 Pre-FC — specific category
/leads Collin 200 — up to 200 leads PDF delivered
 
<b>MANAGE LEADS</b>
/pipeline — view deal pipeline
/lead [keyword] — view lead details
/status [lead] [status] — update lead status
 
<b>BUYERS</b>
/buyers — list all buyers
/match [lead] — match lead to buyers
/send [lead] [buyer] — send deal to buyer
 
<b>EMAIL</b>
/reach [lead] — send outreach to seller
 
<b>CALENDAR</b>
/calendar — upcoming events
/remind 2026-04-15 Offer deadline Garland
 
<b>SETTINGS</b>
/stats — dashboard summary
/mode free — switch to Llama free
/mode premium — switch to Claude paid
/test — test all connections`);
});
 
// /stats
bot.onText(/\/stats/, async (msg) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  const s = db.getStats();
  const upcoming = db.getUpcomingEvents(7);
  let text = `<b>WholesaleOS Dashboard</b>\n\n`;
  text += `Total Leads: <b>${s.total_leads}</b>\n`;
  text += `New Leads: <b>${s.new_leads}</b>\n`;
  text += `Under Contract: <b>${s.under_contract}</b>\n`;
  text += `Closed Deals: <b>${s.closed_deals}</b>\n`;
  text += `Fees Collected: <b>$${s.fees_collected.toLocaleString()}</b>\n`;
  text += `Pipeline Fees: <b>$${s.fees_pipeline.toLocaleString()}</b>\n`;
  text += `Active Buyers: <b>${s.active_buyers}</b>\n\n`;
  text += `AI Mode: <b>${ai.MODE() === 'premium' ? 'Claude Premium' : 'Llama 3.3 Free'}</b>\n\n`;
  if (upcoming.length > 0) {
    text += `<b>Upcoming (7 days)</b>\n`;
    upcoming.slice(0, 5).forEach(e => {
      const icon = e.type === 'call' ? '📞' : e.type === 'offer' ? '📋' : '🎉';
      text += `${icon} ${e.date} — ${e.title}\n`;
    });
  }
  send(msg.chat.id, text);
});
 
// /mode
bot.onText(/\/mode (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const mode = match[1].trim().toLowerCase();
  if (!['free', 'premium'].includes(mode)) return send(msg.chat.id, 'Use /mode free or /mode premium');
  process.env.AI_MODE = mode;
  db.setSetting('ai_mode', mode);
  send(msg.chat.id, `Switched to <b>${mode === 'premium' ? 'Claude Premium' : 'Llama 3.3 Free'}</b>`);
});
 
// /test
bot.onText(/\/test/, async (msg) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  send(msg.chat.id, 'Testing all connections...');
  let aiOk = false;
  try { const r = await ai.ask('Reply OK', '', 10); aiOk = r.toLowerCase().includes('ok'); } catch {}
  const emailTest = await testConnection();
  const dbLeads = db.getLeads().length;
  const aiIcon    = aiOk ? '✅' : '❌';
  const emailIcon = emailTest.success ? '✅' : '❌';
  send(msg.chat.id, `<b>Connection Test Results</b>\n\n${aiIcon} AI (${ai.MODE()}): ${aiOk ? 'Connected' : 'Error — check API key'}\n${emailIcon} Gmail: ${emailTest.success ? 'Connected' : emailTest.error}\n✅ Database: ${dbLeads} leads loaded\n✅ Telegram: Connected\n\n${aiOk && emailTest.success ? '🟢 All systems ready!' : '🔴 Some connections need attention.'}`);
});
 
// /pipeline
bot.onText(/\/pipeline/, async (msg) => {
  if (!guard(msg)) return;
  const leads = db.getLeads();
  const stages = ['New Lead','Contacted','Offer Sent','Negotiating','Under Contract','Closed'];
  let text = '<b>Deal Pipeline</b>\n\n';
  stages.forEach(stage => {
    const items = leads.filter(l => l.status === stage);
    if (items.length === 0) return;
    const icons = {'New Lead':'🆕','Contacted':'📞','Offer Sent':'📋','Negotiating':'🤝','Under Contract':'✍️','Closed':'✅'};
    text += `${icons[stage]} <b>${stage}</b> (${items.length})\n`;
    items.slice(0, 3).forEach(l => { text += `  • ${l.address.split(',')[0]} — $${(l.fee||0).toLocaleString()}\n`; });
    if (items.length > 3) text += `  <i>...and ${items.length - 3} more</i>\n`;
    text += '\n';
  });
  if (leads.length === 0) text += '<i>No leads yet. Use /leads to find deals.</i>';
  send(msg.chat.id, text);
});
 
// /lead
bot.onText(/\/lead (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const keyword = match[1].trim();
  const leads = db.getLeads();
  const lead = leads.find(l => l.id === keyword || l.address?.toLowerCase().includes(keyword.toLowerCase()));
  if (!lead) return send(msg.chat.id, `Lead not found: ${keyword}`);
  let text = `<b>${lead.address}</b>\n\n`;
  text += `${lead.type} | ${lead.beds}BD/${lead.baths}BA | ${lead.sqft?.toLocaleString()} sqft\n`;
  text += `Category: <b>${lead.category}</b> | Status: <b>${lead.status}</b>\n`;
  text += `DOM: <b>${lead.dom} days</b> | Risk: <b>${lead.risk}</b>\n\n`;
  text += `ARV: <b>$${(lead.arv||0).toLocaleString()}</b>\n`;
  text += `Offer: <b>$${(lead.offer||0).toLocaleString()}</b>\n`;
  text += `Fee: <b>$${(lead.fee_lo||0).toLocaleString()} – $${(lead.fee_hi||0).toLocaleString()}</b>\n\n`;
  text += `Phone: ${lead.phone || 'N/A'}\n`;
  if (lead.notes) text += `\nNotes: ${lead.notes}\n`;
  text += `\n<i>ID: ${lead.id}</i>`;
  send(msg.chat.id, text);
});
 
// /leads
bot.onText(/\/leads (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts  = match[1].trim().split(/\s+/);
  // Smart multi-word county: find the number, everything before = county, after = categories
  const numIdx = parts.findIndex(p => !isNaN(parseInt(p)) && parseInt(p) > 0);
  let county, count, cats;
  if (numIdx > 0) {
    county = parts.slice(0, numIdx).join(' ');
    count  = Math.min(parseInt(parts[numIdx]) || 20, 400);
    const catWords = ['Pre-FC','REO','FSBO','Probate','Auction'];
    cats = parts.slice(numIdx+1).filter(p => p.length > 1);
    if (!cats.length) cats = ['Pre-FC','REO','Long DOM','FSBO','Probate','Auction','Tax Delinquent'];
  } else {
    county = parts.join(' ').replace(/\d+/g,'').trim() || 'Dallas';
    count  = 20;
    cats   = ['Pre-FC','REO','Long DOM','FSBO','Probate','Auction','Tax Delinquent'];
  }
  const CA_COUNTIES = ['San Diego','Los Angeles','LA','Orange','Riverside','Sacramento','San Francisco','Alameda','Contra Costa','Santa Clara','San Bernardino','Ventura','Kern'];
  const FL_COUNTIES = ['Miami','Broward','Palm Beach','Hillsborough','Orange','Pinellas'];
  const state = CA_COUNTIES.includes(county) ? 'CA' : FL_COUNTIES.includes(county) ? 'FL' : 'TX';
  send(msg.chat.id, `Searching <b>${county} County</b> for <b>${count} leads</b>...\nAI Mode: <b>${ai.MODE() === 'premium' ? 'Claude' : 'Llama 3.3 Free'}</b>\n\nThis takes 1-3 minutes. PDF coming soon.`);
  bot.sendChatAction(msg.chat.id, 'upload_document');
  try {
    const allLeads = []; const allAnalyses = [];
    const batchSize = 20; const batches = Math.ceil(count / batchSize);
    for (let b = 0; b < batches; b++) {
      const bCount = Math.min(batchSize, count - b * batchSize);
      bot.sendChatAction(msg.chat.id, 'upload_document');
      const rawLeads = await ai.generateLeadList(county, state, bCount, cats);
      for (const rawLead of rawLeads) {
        if (db.leadExists(rawLead.address)) continue;
        let analysis = {};
        try { analysis = await ai.analyzeProperty({ ...rawLead, county, state }); } catch(e) { console.error('Analysis error:', e.message); }
        // Ensure ARV is never 0 — use fallback if needed
        const arv = analysis.arv && analysis.arv > 10000 ? analysis.arv : null;
        const { estimateARV, estimateRepairs } = (() => {
          const base = {Dallas:280000,Tarrant:240000,Collin:380000,'San Diego':680000,'Los Angeles':750000,LA:750000};
          let a = base[county] || 270000;
          a += ((rawLead.beds||3)-3)*18000 + ((rawLead.sqft||1400)-1400)*32;
          const age = 2026-(rawLead.year||1975);
          const r = age<15?Math.round((rawLead.sqft||1400)*22):age<30?Math.round((rawLead.sqft||1400)*38):Math.round((rawLead.sqft||1400)*52);
          return { estimateARV: a, estimateRepairs: r };
        })();
        const finalArv = arv || estimateARV;
        const finalRep = (analysis.repairs && analysis.repairs > 1000) ? analysis.repairs : estimateRepairs;
        const finalOffer = analysis.offer && analysis.offer > 10000 ? analysis.offer : Math.round(finalArv*0.70 - finalRep) * 0.94;
        const fullLead = {
          ...rawLead,
          arv: Math.round(finalArv), offer: Math.round(finalOffer),
          repairs: Math.round(finalRep), repair_class: analysis.repair_class||'MEDIUM',
          mao: Math.round(finalArv*0.70 - finalRep),
          fee_lo: analysis.fee_lo||10000, fee_hi: analysis.fee_hi||20000,
          spread: Math.round(finalArv - finalOffer - finalRep),
          risk: analysis.risk||'Medium', motivation: analysis.motivation||[],
          why_good_deal: analysis.why_good_deal||'', distress_signals: analysis.distress_signals||[],
          investment_strategy: analysis.investment_strategy||'Wholesale Assignment',
          script: analysis.script||'', offer_email: analysis.offer_email||'',
          negotiation_text: analysis.negotiation_text||'', strategy_note: analysis.strategy_note||'',
          profit_note: analysis.profit_note||'', arv_note: analysis.arv_note||''
        };
        const saved = db.addLead(fullLead);
        allLeads.push(saved); allAnalyses.push(analysis);
      }
      if (b < batches - 1) send(msg.chat.id, `Batch ${b+1}/${batches} done — ${allLeads.length} leads so far...`);
    }
    if (allLeads.length === 0) return send(msg.chat.id, 'No new leads found. Try a different county or category.');
    allLeads.sort((a,b) => ((b.fee_hi||0) - (a.risk==='High'?5000:0)) - ((a.fee_hi||0) - (b.risk==='High'?5000:0)));
    send(msg.chat.id, `Found <b>${allLeads.length} leads</b> — generating PDF...`);
    bot.sendChatAction(msg.chat.id, 'upload_document');
    const pdfBuffer = await generateLeadsPDF(allLeads, allAnalyses, `${county} County — ${allLeads.length} Wholesale Leads`);
    await sendDoc(msg.chat.id, pdfBuffer, `${county}_${allLeads.length}_Leads.pdf`, `<b>${county} County — ${allLeads.length} Leads</b>\nRanked best to least best.\nTotal est. fees: $${allLeads.reduce((s,l)=>s+(l.fee_lo||0),0).toLocaleString()}+`);
    let summary = `\n<b>Top 5 Deals — ${county} County</b>\n\n`;
    allLeads.slice(0,5).forEach((l,i) => {
      summary += `<b>${i+1}. ${l.address.split(',')[0]}</b>\n`;
      summary += `   ARV: $${(l.arv||0).toLocaleString()} | Fee: $${(l.fee_lo||0).toLocaleString()}-$${(l.fee_hi||0).toLocaleString()} | ${l.category} | Risk: ${l.risk}\n\n`;
    });
    send(msg.chat.id, summary);
  } catch (err) {
    console.error('Lead search error:', err);
    send(msg.chat.id, `Error: ${err.message}\n\nTry /test to check connections.`);
  }
});
 
// /clearleads — remove duplicate/fake leads and reset
bot.onText(/\/clearleads/, async (msg) => {
  if (!guard(msg)) return;
  const { clearFakeLeads } = require('./db');
  const removed = clearFakeLeads();
  const remaining = db.getLeads().length;
  send(msg.chat.id, `Cleaned up ${removed} generic/duplicate leads.\n\n${remaining} leads remaining in database.\n\nNow run /leads to get fresh real leads.`);
});
 
// /buyers
bot.onText(/\/buyers/, async (msg) => {
  if (!guard(msg)) return;
  const buyers = db.getBuyers();
  if (buyers.length === 0) return send(msg.chat.id, 'No buyers yet.\n\nAdd one:\n/addbuyer Name|Type|Contact|Phone|Email|$100K-$400K');
  let text = `<b>Buyers Database (${buyers.length})</b>\n\n`;
  buyers.forEach(b => {
    text += `<b>${b.name}</b>\n${b.contact} | ${b.phone}\nMax: $${(b.maxPrice||0).toLocaleString()} | ${b.status}\n\n`;
  });
  send(msg.chat.id, text);
});
 
// /addbuyer
bot.onText(/\/addbuyer (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].split('|').map(p => p.trim());
  if (parts.length < 4) return send(msg.chat.id, 'Format: /addbuyer Name|Type|Contact|Phone|Email|$100K-$400K');
  const prices = (parts[5]||'$100K-$400K').match(/\d+/g)||['100','400'];
  const buyer = { name: parts[0], type: parts[1]||'Cash Buyer', contact: parts[2], phone: parts[3], email: parts[4]||'', maxPrice: parseInt(prices[1]||'400')*1000, minARV: parseInt(prices[0]||'100')*1000, markets: 'DFW Metro', criteria: parts[5]||'' };
  const saved = db.addBuyer(buyer);
  send(msg.chat.id, `Buyer added!\n\n<b>${saved.name}</b>\n${saved.contact} | ${saved.phone}`);
});
 
// /match
bot.onText(/\/match (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  const keyword = match[1].trim();
  const leads = db.getLeads();
  const lead = leads.find(l => l.id === keyword || l.address?.toLowerCase().includes(keyword.toLowerCase()));
  if (!lead) return send(msg.chat.id, `Lead not found: ${keyword}`);
  const matches = db.matchBuyersToLead(lead);
  if (matches.length === 0) return send(msg.chat.id, `No matching buyers for ARV $${(lead.arv||0).toLocaleString()}`);
  let text = `<b>Buyer Matches</b>\n${lead.address.split(',')[0]}\nARV: $${(lead.arv||0).toLocaleString()} | Fee: $${(lead.fee_lo||0).toLocaleString()}-$${(lead.fee_hi||0).toLocaleString()}\n\n`;
  matches.forEach(b => { text += `<b>${b.name}</b>\n${b.contact} — ${b.phone}\n/send ${lead.id.slice(-6)} ${b.name.split(' ')[0]}\n\n`; });
  send(msg.chat.id, text);
});
 
// /send
bot.onText(/\/send (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 2) return send(msg.chat.id, 'Format: /send [lead] [buyer-name]');
  const buyerKeyword = parts.slice(1).join(' ');
  const leads = db.getLeads();
  const buyers = db.getBuyers();
  const lead  = leads.find(l => l.id === parts[0] || l.id.endsWith(parts[0]) || l.address?.toLowerCase().includes(parts[0].toLowerCase()));
  const buyer = buyers.find(b => b.name?.toLowerCase().includes(buyerKeyword.toLowerCase()) || b.contact?.toLowerCase().includes(buyerKeyword.toLowerCase()));
  if (!lead)  return send(msg.chat.id, `Lead not found: ${parts[0]}`);
  if (!buyer) return send(msg.chat.id, `Buyer not found: ${buyerKeyword}`);
  if (!buyer.email) return send(msg.chat.id, `${buyer.name} has no email.`);
  typing(msg.chat.id);
  send(msg.chat.id, `Sending deal to <b>${buyer.name}</b>...`);
  try {
    const analysis = { arv: lead.arv, offer: lead.offer, repairs: lead.repairs, risk: lead.risk, fee_lo: lead.fee_lo, fee_hi: lead.fee_hi };
    const pdfBuffer = await generateSinglePropertyPDF(lead, analysis);
    const result = await sendDealToBuyer(buyer, lead, analysis, pdfBuffer);
    if (result.success) {
      send(msg.chat.id, `Deal sent to <b>${buyer.name}</b> at ${buyer.email}!\n\nPDF attached. Follow up in 24-48 hrs.`);
    } else {
      send(msg.chat.id, `Email failed: ${result.error}`);
    }
  } catch (err) { send(msg.chat.id, `Error: ${err.message}`); }
});
 
// /reach
bot.onText(/\/reach (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const keyword = match[1].trim();
  const leads = db.getLeads();
  const lead = leads.find(l => l.id === keyword || l.address?.toLowerCase().includes(keyword.toLowerCase()));
  if (!lead) return send(msg.chat.id, 'Lead not found.');
  if (!lead.email) return send(msg.chat.id, `No email for this seller. Call: ${lead.phone||'N/A'}`);
  typing(msg.chat.id);
  const script = await ai.generateSellerScript(lead);
  const result = await sendSellerOutreach(lead, script);
  if (result.success) { send(msg.chat.id, `Outreach sent to ${lead.email}`); db.updateLead(lead.id, {status:'Contacted'}); }
  else send(msg.chat.id, `Email failed: ${result.error}`);
});
 
// /status
bot.onText(/\/status (.+?) (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const keyword = match[1].trim(); const newStatus = match[2].trim();
  const validStatuses = ['New Lead','Contacted','Offer Sent','Negotiating','Under Contract','Closed','Dead'];
  const leads = db.getLeads();
  const lead = leads.find(l => l.id === keyword || l.address?.toLowerCase().includes(keyword.toLowerCase()));
  if (!lead) return send(msg.chat.id, 'Lead not found.');
  const matched = validStatuses.find(s => s.toLowerCase().includes(newStatus.toLowerCase()));
  if (!matched) return send(msg.chat.id, `Valid statuses: ${validStatuses.join(', ')}`);
  db.updateLead(lead.id, {status: matched});
  send(msg.chat.id, `<b>${lead.address.split(',')[0]}</b> updated to <b>${matched}</b>`);
});
 
// /calendar
bot.onText(/\/calendar/, async (msg) => {
  if (!guard(msg)) return;
  const events = db.getUpcomingEvents(30);
  if (events.length === 0) return send(msg.chat.id, 'No upcoming events.\n\nAdd one: /remind 2026-04-15 Offer deadline Garland');
  let text = '<b>Calendar — Next 30 Days</b>\n\n';
  events.forEach(e => {
    const icon = e.type==='call'?'📞':e.type==='offer'?'📋':'🎉';
    text += `${icon} <b>${e.date}</b> — ${e.title}\n`;
    if (e.time) text += `   ${e.time}\n`;
    text += '\n';
  });
  send(msg.chat.id, text);
});
 
// /remind
bot.onText(/\/remind (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].trim().split(/\s+/);
  const date  = parts.find(p => /\d{4}-\d{2}-\d{2}/.test(p)) || parts[0];
  const title = parts.filter(p => !p.match(/\d{4}-\d{2}-\d{2}/)).join(' ');
  const type  = title.toLowerCase().includes('clos')?'close':title.toLowerCase().includes('offer')?'offer':'call';
  const evt   = db.addEvent({date, title, type, time:''});
  send(msg.chat.id, `Event added!\n${evt.date} — ${evt.title}`);
});
 
// /addlead
bot.onText(/\/addlead (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].split('|').map(p => p.trim());
  if (parts.length < 8) return send(msg.chat.id, 'Need at least 8 fields. See /add for format.');
  typing(msg.chat.id);
  const lead = { address: parts[0], type: parts[1]||'SFR', beds: parseInt(parts[2])||3, baths: parseInt(parts[3])||2, sqft: parseInt(parts[4])||1400, year: parseInt(parts[5])||1975, category: parts[6]||'Motivated Seller', list_price: parts[7]||'Unknown', dom: parseInt(parts[8])||60, seller_type: parts[9]||'Owner', phone: parts[10]||'', county: parts[11]||'Dallas', zip: (parts[0].match(/\d{5}/)||['00000'])[0] };
  send(msg.chat.id, `Analyzing <b>${lead.address}</b>...`);
  const analysis = await ai.analyzeProperty(lead);
  const fullLead = { ...lead, arv: analysis.arv, offer: analysis.offer, repairs: analysis.repairs, fee_lo: analysis.fee_lo, fee_hi: analysis.fee_hi, risk: analysis.risk, motivation: analysis.motivation };
  const saved = db.addLead(fullLead);
  let text = `Lead Added!\n\n<b>${saved.address}</b>\n\nARV: <b>$${(analysis.arv||0).toLocaleString()}</b>\nOffer: <b>$${(analysis.offer||0).toLocaleString()}</b>\nFee: <b>$${(analysis.fee_lo||0).toLocaleString()} – $${(analysis.fee_hi||0).toLocaleString()}</b>\nRisk: <b>${analysis.risk||'Medium'}</b>\n\nScript: <i>${analysis.script||'Call seller directly.'}</i>\n\nID: ${saved.id}`;
  send(msg.chat.id, text);
});
 
// Natural language fallback
bot.on('message', async (msg) => {
  if (!guard(msg)) return;
  if (!msg.text || msg.text.startsWith('/')) return;
  const text = msg.text.toLowerCase();
  if (text.includes('free')) { process.env.AI_MODE='free'; return send(msg.chat.id, 'Switched to Llama 3.3 Free'); }
  if (text.includes('premium')||text.includes('claude')) { process.env.AI_MODE='premium'; return send(msg.chat.id, 'Switched to Claude Premium'); }
  if (text.includes('pipeline')) return bot.emit('text', msg, ['/pipeline','/pipeline']);
  if (text.includes('buyers')) return bot.emit('text', msg, ['/buyers','/buyers']);
  if (text.includes('stats')||text.includes('dashboard')) return bot.emit('text', msg, ['/stats','/stats']);
  if (text.includes('calendar')) return bot.emit('text', msg, ['/calendar','/calendar']);
  send(msg.chat.id, 'Commands:\n/leads Dallas 50\n/pipeline\n/buyers\n/stats\n/help');
});
 
// Daily morning briefing
cron.schedule('0 8 * * *', async () => {
  if (!OWNER_ID) return;
  const events = db.getUpcomingEvents(3);
  const stats  = db.getStats();
  let text = `Good morning Gabriel!\n\nPipeline: ${stats.under_contract} under contract | $${stats.fees_pipeline.toLocaleString()} fees\n\n`;
  if (events.length > 0) { text += '<b>Next 3 days:</b>\n'; events.forEach(e => { text += `${e.date} — ${e.title}\n`; }); }
  text += '\nType /leads Dallas 50 to find new deals today.';
  send(OWNER_ID, text);
});
 
// Express server — uses server.js which serves dashboard + all API routes
const app = require('./server');
 
if (USE_WEBHOOK) {
  app.post(`/bot${TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
  setTimeout(() => { bot.setWebHook(`${RAILWAY_URL}/bot${TOKEN}`); }, 2000);
}
 
const server = app.listen(PORT, () => console.log(`WholesaleOS Bot started on port ${PORT}`));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use — retrying in 3 seconds...`);
    setTimeout(() => {
      server.close();
      app.listen(PORT, () => console.log(`WholesaleOS Bot started on port ${PORT} (retry)`));
    }, 3000);
  } else {
    console.error('Server error:', err);
  }
});
 
console.log('WholesaleOS Telegram Bot is running...');
console.log(`AI Mode: ${ai.MODE()}`);
console.log(`Gmail: ${process.env.GMAIL_USER}`);
console.log(`Mode: ${USE_WEBHOOK ? 'Webhook' : 'Polling'}`);
