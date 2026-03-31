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

bot.onText(/\/(start|help)/, async (msg) => {
  if (!guard(msg)) return;
  send(msg.chat.id, `<b>WholesaleOS Bot</b> — Gabriel's Deal Machine

<b>FIND LEADS</b>
/leads Dallas 50
/leads Tarrant 100 Pre-FC
/leads Collin 200

<b>MANAGE</b>
/pipeline
/lead [keyword]
/status [lead] [status]

<b>BUYERS</b>
/buyers
/match [lead]
/send [lead] [buyer]

<b>EMAIL</b>
/reach [lead]

<b>CALENDAR</b>
/calendar
/remind 2026-04-15 Offer deadline

<b>SETTINGS</b>
/stats
/mode free
/mode premium
/test`);
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
    items.slice(0,3).forEach(l => { text += `  • ${l.address.split(',')[0]} — $${(l.fee||0).toLocaleString()}\n`; });
    if (items.length > 3) text += `  <i>...and ${items.length-3} more</i>\n`;
    text += '\n';
  });
  if (!leads.length) text += '<i>No leads yet.</i>';
  send(msg.chat.id, text);
});

bot.onText(/\/lead (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const leads = db.getLeads();
  const lead = leads.find(l => l.id === match[1].trim() || l.address?.toLowerCase().includes(match[1].trim().toLowerCase()));
  if (!lead) return send(msg.chat.id, 'Lead not found.');
  send(msg.chat.id, `<b>${lead.address}</b>\n\n${lead.type} | ${lead.beds}BD/${lead.baths}BA | ${lead.sqft?.toLocaleString()} sqft\nCategory: <b>${lead.category}</b> | Status: <b>${lead.status}</b>\nDOM: <b>${lead.dom}d</b> | Risk: <b>${lead.risk}</b>\n\nARV: <b>$${(lead.arv||0).toLocaleString()}</b>\nOffer: <b>$${(lead.offer||0).toLocaleString()}</b>\nFee: <b>$${(lead.fee_lo||0).toLocaleString()}–$${(lead.fee_hi||0).toLocaleString()}</b>\n\nPhone: ${lead.phone||'N/A'}\n\n<i>ID: ${lead.id}</i>`);
});

bot.onText(/\/leads (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].trim().split(/\s+/);
  const county = parts[0] || 'Dallas';
  const count  = Math.min(parseInt(parts[1])||20, 400);
  const cats   = parts.slice(2).length > 0 ? parts.slice(2) : ['Pre-FC','REO','Long DOM','FSBO','Probate','Auction','Tax Delinquent'];
  send(msg.chat.id, `Searching <b>${county} County</b> for <b>${count} leads</b>...\nAI: <b>${ai.MODE()==='premium'?'Claude':'Llama 3.3 Free'}</b>\n\nThis takes 1-3 min. PDF coming.`);
  bot.sendChatAction(msg.chat.id, 'upload_document');
  try {
    const allLeads = [], allAnalyses = [];
    const batchSize = 20, batches = Math.ceil(count/batchSize);
    for (let b = 0; b < batches; b++) {
      const bCount = Math.min(batchSize, count - b*batchSize);
      bot.sendChatAction(msg.chat.id, 'upload_document');
      const rawLeads = await ai.generateLeadList(county, 'TX', bCount, cats);
      for (const rawLead of rawLeads) {
        if (db.leadExists(rawLead.address)) continue;
        let analysis = {};
        try { analysis = await ai.analyzeProperty({...rawLead, county}); } catch {}
        const saved = db.addLead({...rawLead, arv:analysis.arv||0, offer:analysis.offer||0, repairs:analysis.repairs||0, fee_lo:analysis.fee_lo||10000, fee_hi:analysis.fee_hi||20000, risk:analysis.risk||'Medium', motivation:analysis.motivation||[]});
        allLeads.push(saved); allAnalyses.push(analysis);
      }
      if (b < batches-1) send(msg.chat.id, `Batch ${b+1}/${batches} — ${allLeads.length} leads so far...`);
    }
    if (!allLeads.length) return send(msg.chat.id, 'No new leads found. Try a different county.');
    send(msg.chat.id, `Found <b>${allLeads.length} leads</b> — generating PDF...`);
    bot.sendChatAction(msg.chat.id, 'upload_document');
    const pdfBuffer = await generateLeadsPDF(allLeads, allAnalyses, `${county} County — ${allLeads.length} Wholesale Leads`);
    await sendDoc(msg.chat.id, pdfBuffer, `${county}_${allLeads.length}_Leads.pdf`, `<b>${county} — ${allLeads.length} Leads</b>\nTotal est. fees: $${allLeads.reduce((s,l)=>s+(l.fee_lo||0),0).toLocaleString()}+`);
    let summary = `\n<b>Top 5 — ${county}</b>\n\n`;
    allLeads.slice(0,5).forEach((l,i) => { summary += `<b>${i+1}. ${l.address.split(',')[0]}</b>\nARV: $${(l.arv||0).toLocaleString()} | Fee: $${(l.fee_lo||0).toLocaleString()}-$${(l.fee_hi||0).toLocaleString()} | ${l.category} | ${l.risk}\n\n`; });
    send(msg.chat.id, summary);
  } catch (err) { send(msg.chat.id, `Error: ${err.message}`); }
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
  const lead = leads.find(l => l.id === match[1].trim() || l.address?.toLowerCase().includes(match[1].trim().toLowerCase()));
  if (!lead) return send(msg.chat.id, 'Lead not found.');
  const matches = db.matchBuyersToLead(lead);
  if (!matches.length) return send(msg.chat.id, 'No matching buyers.');
  let text = `<b>Matches for ${lead.address.split(',')[0]}</b>\n\n`;
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
    send(msg.chat.id, result.success ? `Deal sent to <b>${buyer.name}</b> at ${buyer.email}!` : `Email failed: ${result.error}`);
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

bot.onText(/\/addlead (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].split('|').map(p => p.trim());
  if (parts.length < 8) return send(msg.chat.id, 'Need 8+ fields.');
  typing(msg.chat.id);
  const lead = {address:parts[0], type:parts[1]||'SFR', beds:parseInt(parts[2])||3, baths:parseInt(parts[3])||2, sqft:parseInt(parts[4])||1400, year:parseInt(parts[5])||1975, category:parts[6]||'Motivated', list_price:parts[7]||'Unknown', dom:parseInt(parts[8])||60, seller_type:parts[9]||'Owner', phone:parts[10]||'', county:parts[11]||'Dallas', zip:(parts[0].match(/\d{5}/)||['00000'])[0]};
  send(msg.chat.id, `Analyzing <b>${lead.address}</b>...`);
  const analysis = await ai.analyzeProperty(lead);
  const saved = db.addLead({...lead, arv:analysis.arv, offer:analysis.offer, repairs:analysis.repairs, fee_lo:analysis.fee_lo, fee_hi:analysis.fee_hi, risk:analysis.risk, motivation:analysis.motivation});
  send(msg.chat.id, `Added!\n\n<b>${saved.address}</b>\nARV: <b>$${(analysis.arv||0).toLocaleString()}</b>\nOffer: <b>$${(analysis.offer||0).toLocaleString()}</b>\nFee: <b>$${(analysis.fee_lo||0).toLocaleString()}–$${(analysis.fee_hi||0).toLocaleString()}</b>\nRisk: <b>${analysis.risk||'Medium'}</b>\n\n<i>${analysis.script||'Call seller directly.'}</i>`);
});

bot.on('message', async (msg) => {
  if (!guard(msg)) return;
  if (!msg.text || msg.text.startsWith('/')) return;
  const t = msg.text.toLowerCase();
  if (t.includes('free')) { process.env.AI_MODE='free'; return send(msg.chat.id, 'Switched to Llama Free'); }
  if (t.includes('premium')||t.includes('claude')) { process.env.AI_MODE='premium'; return send(msg.chat.id, 'Switched to Claude Premium'); }
  if (t.includes('pipeline')) return bot.emit('text', msg, ['/pipeline','/pipeline']);
  if (t.includes('buyers')) return bot.emit('text', msg, ['/buyers','/buyers']);
  if (t.includes('stats')) return bot.emit('text', msg, ['/stats','/stats']);
  if (t.includes('calendar')) return bot.emit('text', msg, ['/calendar','/calendar']);
  send(msg.chat.id, '/leads Dallas 50\n/pipeline\n/buyers\n/stats\n/help');
});

cron.schedule('0 8 * * *', async () => {
  if (!OWNER_ID) return;
  const stats = db.getStats(), events = db.getUpcomingEvents(3);
  let text = `Good morning Gabriel!\n\nPipeline: ${stats.under_contract} under contract | $${stats.fees_pipeline.toLocaleString()} fees\n\n`;
  if (events.length) { text += '<b>Next 3 days:</b>\n'; events.forEach(e => { text += `${e.date} — ${e.title}\n`; }); }
  send(OWNER_ID, text);
});

const app = express();
app.use(express.json());

if (USE_WEBHOOK) {
  bot.setWebHook(`${RAILWAY_URL}/bot${TOKEN}`);
  app.post(`/bot${TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
}

app.get('/', (_, res) => res.json({status:'WholesaleOS Running', leads:db.getLeads().length, mode:ai.MODE()}));
app.get('/health', (_, res) => res.json({ok:true}));
app.listen(PORT, () => console.log(`WholesaleOS Bot started on port ${PORT}`));

console.log('WholesaleOS Telegram Bot is running...');
console.log(`AI Mode: ${ai.MODE()}`);
console.log(`Gmail: ${process.env.GMAIL_USER}`);
console.log(`Mode: ${USE_WEBHOOK ? 'Webhook' : 'Polling'}`);
