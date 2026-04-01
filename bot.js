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

const USE_WEBHOOK = !!RAILWAY_URL;

let bot;
if (USE_WEBHOOK) {
  bot = new TelegramBot(TOKEN, { webHook: false });
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

bot.onText(/\/(start|help)/, async (msg) => {
  if (!guard(msg)) return;
  send(msg.chat.id, `<b>WholesaleOS Bot</b> — Gabriel's Deal Machine\n\n<b>FIND LEADS</b>\n/leads Dallas 50\n/leads San Diego 100\n/leads Tarrant 200\n\n<b>MANAGE</b>\n/pipeline\n/lead [address]\n/status [lead] [status]\n/clearleads — remove fake leads\n\n<b>BUYERS</b>\n/buyers\n/match [lead]\n/send [lead] [buyer]\n\n<b>EMAIL</b>\n/reach [lead]\n\n<b>CALENDAR</b>\n/calendar\n/remind 2026-04-15 Offer deadline\n\n<b>SETTINGS</b>\n/stats\n/mode free\n/mode premium\n/test`);
});

bot.onText(/\/stats/, async (msg) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  const s = db.getStats();
  const upcoming = db.getUpcomingEvents(7);
  let text = `<b>WholesaleOS Dashboard</b>\n\nTotal Leads: <b>${s.total_leads}</b>\nNew: <b>${s.new_leads}</b>\nUnder Contract: <b>${s.under_contract}</b>\nClosed: <b>${s.closed_deals}</b>\nFees Collected: <b>$${s.fees_collected.toLocaleString()}</b>\nPipeline: <b>$${s.fees_pipeline.toLocaleString()}</b>\nBuyers: <b>${s.active_buyers}</b>\nAI: <b>${ai.MODE() === 'premium' ? 'Claude Premium' : 'Llama 3.3 Free'}</b>\n\n`;
  if (upcoming.length > 0) {
    text += `<b>Upcoming</b>\n`;
    upcoming.slice(0,5).forEach(e => { text += `${e.type==='close'?'🎉':e.type==='offer'?'📋':'📞'} ${e.date} — ${e.title}\n`; });
  }
  send(msg.chat.id, text);
});

bot.onText(/\/mode (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const mode = match[1].trim().toLowerCase();
  if (!['free','premium'].includes(mode)) return send(msg.chat.id, 'Use /mode free or /mode premium');
  process.env.AI_MODE = mode;
  db.setSetting('ai_mode', mode);
  send(msg.chat.id, `Switched to <b>${mode === 'premium' ? 'Claude Premium' : 'Llama 3.3 Free'}</b>`);
});

bot.onText(/\/test/, async (msg) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  send(msg.chat.id, 'Testing all connections...');
  let aiOk = false;
  try { const r = await ai.ask('Reply OK', '', 10); aiOk = r.toLowerCase().includes('ok'); } catch {}
  const emailTest = await testConnection();
  const dbLeads = db.getLeads().length;
  send(msg.chat.id, `<b>Connection Test Results</b>\n\n${aiOk?'✅':'❌'} AI (${ai.MODE()}): ${aiOk?'Connected':'Error'}\n${emailTest.success?'✅':'❌'} Gmail: ${emailTest.success?'Connected':emailTest.error}\n✅ Database: ${dbLeads} leads\n✅ Telegram: Connected\n\n${aiOk&&emailTest.success?'🟢 All systems ready!':'🔴 Some connections need attention.'}`);
});

bot.onText(/\/pipeline/, async (msg) => {
  if (!guard(msg)) return;
  const leads = db.getLeads();
  const stages = ['New Lead','Contacted','Offer Sent','Negotiating','Under Contract','Closed'];
  let text = '<b>Deal Pipeline</b>\n\n';
  stages.forEach(stage => {
    const items = leads.filter(l => l.status === stage);
    if (!items.length) return;
    const icons = {'New Lead':'🆕','Contacted':'📞','Offer Sent':'📋','Negotiating':'🤝','Under Contract':'✍️','Closed':'✅'};
    text += `${icons[stage]} <b>${stage}</b> (${items.length})\n`;
    items.slice(0,3).forEach(l => { text += `  • ${l.address.split(',')[0]} — $${(l.fee_lo||0).toLocaleString()}\n`; });
    if (items.length > 3) text += `  <i>...and ${items.length-3} more</i>\n`;
    text += '\n';
  });
  if (!leads.length) text += '<i>No leads yet. Use /leads to find deals.</i>';
  send(msg.chat.id, text);
});

bot.onText(/\/lead (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const leads = db.getLeads();
  const lead = leads.find(l => l.id === match[1].trim() || l.address?.toLowerCase().includes(match[1].trim().toLowerCase()));
  if (!lead) return send(msg.chat.id, 'Lead not found.');
  send(msg.chat.id, `<b>${lead.address}</b>\n\n${lead.type||'SFR'} | ${lead.beds||'?'}BD/${lead.baths||'?'}BA | ${(lead.sqft||0).toLocaleString()} sqft\nCategory: <b>${lead.category}</b> | Status: <b>${lead.status}</b>\nDOM: <b>${lead.dom||0}d</b> | Risk: <b>${lead.risk||'Medium'}</b>\n\nARV: <b>$${(lead.arv||0).toLocaleString()}</b>\nOffer: <b>$${(lead.offer||0).toLocaleString()}</b>\nFee: <b>$${(lead.fee_lo||0).toLocaleString()}–$${(lead.fee_hi||0).toLocaleString()}</b>\n\nPhone: ${lead.phone||'N/A'}\n\n<i>ID: ${lead.id}</i>`);
});

bot.onText(/\/leads (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].trim().split(/\s+/);
  const numIdx = parts.findIndex(p => !isNaN(parseInt(p)) && parseInt(p) > 0);
  let county, count, cats;
  if (numIdx > 0) {
    county = parts.slice(0, numIdx).join(' ');
    count  = Math.min(parseInt(parts[numIdx]) || 20, 400);
    cats   = parts.slice(numIdx+1).filter(p => p.length > 1);
  } else {
    county = parts.join(' ').replace(/\d+/g,'').trim() || 'Dallas';
    count  = 20;
    cats   = [];
  }
  if (!cats.length) cats = ['Pre-FC','REO','Long DOM','FSBO','Probate','Auction','Tax Delinquent'];
  const CA = ['San Diego','Los Angeles','LA','Orange','Riverside','Sacramento','San Francisco','Alameda','Santa Clara','San Bernardino','Ventura','Kern'];
  const FL = ['Miami','Broward','Palm Beach','Hillsborough','Pinellas'];
  const state = CA.includes(county) ? 'CA' : FL.includes(county) ? 'FL' : 'TX';

  send(msg.chat.id, `Searching <b>${county} County</b> for <b>${count} leads</b>...\nAI: <b>${ai.MODE()==='premium'?'Claude':'Llama 3.3 Free'}</b>\n\nThis takes 1-3 min. PDF coming.`);
  bot.sendChatAction(msg.chat.id, 'upload_document');

  try {
    const allLeads = [], allAnalyses = [];
    const batchSize = 20, batches = Math.ceil(count/batchSize);
    const arvBase = {Dallas:280000,Tarrant:240000,Collin:380000,'San Diego':680000,'Los Angeles':750000,LA:750000};

    for (let b = 0; b < batches; b++) {
      const bCount = Math.min(batchSize, count - b*batchSize);
      bot.sendChatAction(msg.chat.id, 'upload_document');
      const rawLeads = await ai.generateLeadList(county, state, bCount, cats);

      for (const rawLead of rawLeads) {
        if (db.leadExists(rawLead.address)) continue;
        let analysis = {};
        try { analysis = await ai.analyzeProperty({...rawLead, county, state}); } catch(e) { console.error('Analysis error:', e.message); }

        const baseArv = arvBase[county] || 270000;
        const sqft = rawLead.sqft || 1400;
        const age = 2026 - (rawLead.year || 1975);
        const estArv = Math.round(baseArv + ((rawLead.beds||3)-3)*18000 + (sqft-1400)*32);
        const estRep = age < 15 ? sqft*22 : age < 30 ? sqft*38 : sqft*52;

        const finalArv   = (analysis.arv   > 50000) ? analysis.arv   : estArv;
        const finalRep   = (analysis.repairs > 1000) ? analysis.repairs : Math.round(estRep);
        const finalOffer = (analysis.offer  > 10000) ? analysis.offer  : Math.round((finalArv*0.70 - finalRep)*0.94);
        const finalFeeL  = analysis.fee_lo || 10000;
        const finalFeeH  = analysis.fee_hi || 25000;

        const saved = db.addLead({
          ...rawLead, state,
          arv: finalArv, offer: finalOffer, repairs: finalRep,
          repair_class: analysis.repair_class || 'MEDIUM',
          mao: Math.round(finalArv*0.70 - finalRep),
          fee_lo: finalFeeL, fee_hi: finalFeeH,
          spread: Math.round(finalArv - finalOffer - finalRep),
          risk: analysis.risk || 'Medium',
          why_good_deal: analysis.why_good_deal || `${rawLead.category||'Distressed'} property at ${Math.round((finalArv-finalOffer)/finalArv*100)}% below ARV in ${county} County.`,
          distress_signals: analysis.distress_signals || [rawLead.category||'Motivated Seller'],
          motivation: analysis.motivation || [],
          investment_strategy: analysis.investment_strategy || 'Wholesale Assignment',
          script: analysis.script || `Hi, I'm Gabriel — local cash buyer. I can close in 14 days on ${rawLead.address?.split(',')[0]}. Is this still available?`,
          offer_email: analysis.offer_email || '',
          negotiation_text: analysis.negotiation_text || '',
          strategy_note: analysis.strategy_note || '',
          profit_note: analysis.profit_note || '',
          arv_note: analysis.arv_note || ''
        });
        allLeads.push(saved); allAnalyses.push(analysis);
      }
      if (b < batches-1) send(msg.chat.id, `Batch ${b+1}/${batches} — ${allLeads.length} leads so far...`);
    }

    if (!allLeads.length) return send(msg.chat.id, 'No new leads found. Send /clearleads then try again.');
    allLeads.sort((a,b) => (b.fee_hi||0) - (a.fee_hi||0));

    send(msg.chat.id, `Found <b>${allLeads.length} leads</b> — generating PDF...`);
    bot.sendChatAction(msg.chat.id, 'upload_document');
    const pdfBuffer = await generateLeadsPDF(allLeads, allAnalyses, `${county} County — ${allLeads.length} Wholesale Leads`);
    await sendDoc(msg.chat.id, pdfBuffer, `${county}_${allLeads.length}_Leads.pdf`,
      `<b>${county} County — ${allLeads.length} Leads</b>\nTotal est. fees: $${allLeads.reduce((s,l)=>s+(l.fee_lo||0),0).toLocaleString()}+`);

    let summary = `\n<b>Top 5 — ${county} County</b>\n\n`;
    allLeads.slice(0,5).forEach((l,i) => {
      summary += `<b>${i+1}. ${l.address.split(',')[0]}</b>\nARV: $${(l.arv||0).toLocaleString()} | Fee: $${(l.fee_lo||0).toLocaleString()}-$${(l.fee_hi||0).toLocaleString()} | ${l.category} | ${l.risk}\n\n`;
    });
    send(msg.chat.id, summary);
  } catch (err) {
    console.error('Lead error:', err);
    send(msg.chat.id, `Error: ${err.message}\n\nTry /test to check connections.`);
  }
});

bot.onText(/\/clearleads/, async (msg) => {
  if (!guard(msg)) return;
  const { clearFakeLeads } = require('./db');
  const removed = clearFakeLeads();
  send(msg.chat.id, `Cleaned ${removed} fake leads.\n${db.getLeads().length} leads remaining.\n\nNow run /leads to get fresh leads.`);
});

bot.onText(/\/buyers/, async (msg) => {
  if (!guard(msg)) return;
  const buyers = db.getBuyers();
  if (!buyers.length) return send(msg.chat.id, 'No buyers yet.\n/addbuyer Name|Type|Contact|Phone|Email|$100K-$400K');
  let text = `<b>Buyers (${buyers.length})</b>\n\n`;
  buyers.forEach(b => { text += `<b>${b.name}</b>\n${b.contact} | ${b.phone}\nMax: $${(b.maxPrice||0).toLocaleString()} | ${b.status}\n\n`; });
  send(msg.chat.id, text);
});

bot.onText(/\/addbuyer (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].split('|').map(p => p.trim());
  if (parts.length < 4) return send(msg.chat.id, 'Format: /addbuyer Name|Type|Contact|Phone|Email|$100K-$400K');
  const prices = (parts[5]||'$100K-$400K').match(/\d+/g)||['100','400'];
  const saved = db.addBuyer({name:parts[0], type:parts[1]||'Cash Buyer', contact:parts[2], phone:parts[3], email:parts[4]||'', maxPrice:parseInt(prices[1]||'400')*1000, minARV:parseInt(prices[0]||'100')*1000, markets:'DFW Metro', criteria:parts[5]||''});
  send(msg.chat.id, `Buyer added!\n<b>${saved.name}</b>\n${saved.contact} | ${saved.phone}`);
});

bot.onText(/\/match (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  const leads = db.getLeads();
  const lead = leads.find(l => l.id===match[1].trim() || l.address?.toLowerCase().includes(match[1].trim().toLowerCase()));
  if (!lead) return send(msg.chat.id, 'Lead not found.');
  const matches = db.matchBuyersToLead(lead);
  if (!matches.length) return send(msg.chat.id, 'No matching buyers.');
  let text = `<b>Matches for ${lead.address.split(',')[0]}</b>\nARV: $${(lead.arv||0).toLocaleString()}\n\n`;
  matches.forEach(b => { text += `<b>${b.name}</b>\n${b.contact} — ${b.phone}\n/send ${lead.id.slice(-6)} ${b.name.split(' ')[0]}\n\n`; });
  send(msg.chat.id, text);
});

bot.onText(/\/send (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 2) return send(msg.chat.id, 'Format: /send [lead] [buyer]');
  const leads = db.getLeads(), buyers = db.getBuyers();
  const lead  = leads.find(l => l.id===parts[0] || l.id.endsWith(parts[0]) || l.address?.toLowerCase().includes(parts[0].toLowerCase()));
  const buyer = buyers.find(b => b.name?.toLowerCase().includes(parts.slice(1).join(' ').toLowerCase()));
  if (!lead)  return send(msg.chat.id, 'Lead not found.');
  if (!buyer) return send(msg.chat.id, 'Buyer not found.');
  if (!buyer.email) return send(msg.chat.id, `${buyer.name} has no email.`);
  typing(msg.chat.id);
  send(msg.chat.id, `Sending to <b>${buyer.name}</b>...`);
  try {
    const analysis = {arv:lead.arv, offer:lead.offer, repairs:lead.repairs, risk:lead.risk, fee_lo:lead.fee_lo, fee_hi:lead.fee_hi};
    const pdfBuffer = await generateSinglePropertyPDF(lead, analysis);
    const result = await sendDealToBuyer(buyer, lead, analysis, pdfBuffer);
    send(msg.chat.id, result.success ? `Deal sent to <b>${buyer.name}</b>!` : `Email failed: ${result.error}`);
  } catch (err) { send(msg.chat.id, `Error: ${err.message}`); }
});

bot.onText(/\/reach (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const leads = db.getLeads();
  const lead = leads.find(l => l.id===match[1].trim() || l.address?.toLowerCase().includes(match[1].trim().toLowerCase()));
  if (!lead) return send(msg.chat.id, 'Lead not found.');
  if (!lead.email) return send(msg.chat.id, `No email. Call: ${lead.phone||'N/A'}`);
  typing(msg.chat.id);
  const script = await ai.generateSellerScript(lead);
  const result = await sendSellerOutreach(lead, script);
  if (result.success) { send(msg.chat.id, `Outreach sent to ${lead.email}`); db.updateLead(lead.id, {status:'Contacted'}); }
  else send(msg.chat.id, `Failed: ${result.error}`);
});

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

bot.onText(/\/calendar/, async (msg) => {
  if (!guard(msg)) return;
  const events = db.getUpcomingEvents(30);
  if (!events.length) return send(msg.chat.id, 'No events.\n/remind 2026-04-15 Offer deadline');
  let text = '<b>Calendar — 30 Days</b>\n\n';
  events.forEach(e => { text += `${e.type==='close'?'🎉':e.type==='offer'?'📋':'📞'} <b>${e.date}</b> — ${e.title}\n`; });
  send(msg.chat.id, text);
});

bot.onText(/\/remind (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].trim().split(/\s+/);
  const date  = parts.find(p => /\d{4}-\d{2}-\d{2}/.test(p)) || parts[0];
  const title = parts.filter(p => !p.match(/\d{4}-\d{2}-\d{2}/)).join(' ');
  const type  = title.toLowerCase().includes('clos')?'close':title.toLowerCase().includes('offer')?'offer':'call';
  const evt   = db.addEvent({date, title, type, time:''});
  send(msg.chat.id, `Added: ${evt.date} — ${evt.title}`);
});

bot.on('message', async (msg) => {
  if (!guard(msg)) return;
  if (!msg.text || msg.text.startsWith('/')) return;
  const t = msg.text.toLowerCase();
  if (t.includes('free')) { process.env.AI_MODE='free'; return send(msg.chat.id, 'Switched to Llama Free'); }
  if (t.includes('premium')||t.includes('claude')) { process.env.AI_MODE='premium'; return send(msg.chat.id, 'Switched to Claude Premium'); }
  send(msg.chat.id, '/leads San Diego 50\n/leads Dallas 50\n/pipeline\n/buyers\n/stats\n/help');
});

cron.schedule('0 8 * * *', async () => {
  if (!OWNER_ID) return;
  const stats = db.getStats(), events = db.getUpcomingEvents(3);
  let text = `Good morning Gabriel!\n\nLeads: ${stats.total_leads} | Pipeline: $${stats.fees_pipeline.toLocaleString()}\n\n`;
  if (events.length) { text += '<b>Next 3 days:</b>\n'; events.forEach(e => { text += `${e.date} — ${e.title}\n`; }); }
  send(OWNER_ID, text);
});

const app = require('./server');

if (USE_WEBHOOK) {
  app.post(`/bot${TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
  setTimeout(() => { bot.setWebHook(`${RAILWAY_URL}/bot${TOKEN}`); }, 2000);
}

try {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WholesaleOS Bot started on port ${PORT}`);
  });
} catch(err) {
  console.error('Server start error:', err.message);
}

console.log('WholesaleOS Telegram Bot is running...');
console.log(`AI Mode: ${ai.MODE()}`);
console.log(`Gmail: ${process.env.GMAIL_USER}`);
console.log(`Mode: ${USE_WEBHOOK ? 'Webhook' : 'Polling'}`);
