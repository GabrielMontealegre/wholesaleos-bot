// bot.js — WholesaleOS Telegram Bot
// Gabriel's wholesale automation system
// Commands: /leads /pipeline /buyers /send /add /calendar /stats /mode /help

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express     = require('express');
const cron        = require('node-cron');

const db      = require('./db');
const ai      = require('./ai');
const { generateLeadsPDF, generateSinglePropertyPDF } = require('./pdf');
const { sendDealToBuyer, sendSellerOutreach, sendContractEmail, testConnection } = require('./email');

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = process.env.BOT_OWNER_ID;  // Only you can use the bot
const bot      = new TelegramBot(TOKEN, { polling: true });

// ── Security: only owner can use bot ──────────────────────────────────────
function isOwner(msg) {
  if (!OWNER_ID) return true; // Allow all if no owner set (dev mode)
  return String(msg.from.id) === String(OWNER_ID);
}

function guard(msg) {
  if (!isOwner(msg)) {
    bot.sendMessage(msg.chat.id, '⛔ Unauthorized. This bot is private.');
    return false;
  }
  return true;
}

// ── Send helpers ───────────────────────────────────────────────────────────
const send = (chatId, text, opts = {}) =>
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...opts });

const sendDoc = (chatId, buffer, filename, caption = '') =>
  bot.sendDocument(chatId, buffer, { caption }, { filename, contentType: 'application/pdf' });

function typing(chatId) {
  bot.sendChatAction(chatId, 'typing');
}

// ═══════════════════════════════════════════════════════════════════════════
//  COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

// /start or /help
bot.onText(/\/(start|help)/, async (msg) => {
  if (!guard(msg)) return;
  send(msg.chat.id, `
🏠 *WholesaleOS Bot — Gabriel's Deal Machine*

*FIND LEADS*
\`/leads Dallas 50\` — find 50 leads in Dallas County
\`/leads Tarrant 100 Pre-FC\` — specific category
\`/leads Collin 200\` — up to 200 leads (PDF delivered)

*MANAGE LEADS*
\`/pipeline\` — view your deal pipeline
\`/add\` — add a lead manually
\`/lead 123\` — view lead details by ID
\`/status 123 Contacted\` — update lead status

*BUYERS*
\`/buyers\` — list all buyers
\`/match 123\` — match lead to buyers
\`/send 123 Marcus\` — send deal to buyer by name

*EMAIL*
\`/email 123 buyers\` — email deal to all matching buyers
\`/reach 123\` — send outreach email to seller

*CALENDAR*
\`/calendar\` — upcoming events
\`/remind Dallas April 15 Offer deadline Garland\`

*STATS & SETTINGS*
\`/stats\` — your dashboard summary
\`/mode free\` — switch to Llama (free)
\`/mode premium\` — switch to Claude (paid, better)
\`/test\` — test all connections

Type any command to get started. Ask me anything.`);
});

// /stats — dashboard summary
bot.onText(/\/stats/, async (msg) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  const s = db.getStats();
  const upcoming = db.getUpcomingEvents(7);
  let text = `📊 *WholesaleOS Dashboard*\n\n`;
  text += `📋 Total Leads: *${s.total_leads}*\n`;
  text += `🆕 New Leads: *${s.new_leads}*\n`;
  text += `📝 Under Contract: *${s.under_contract}*\n`;
  text += `✅ Closed Deals: *${s.closed_deals}*\n`;
  text += `💰 Fees Collected: *$${s.fees_collected.toLocaleString()}*\n`;
  text += `🔄 Pipeline Fees: *$${s.fees_pipeline.toLocaleString()}*\n`;
  text += `👥 Active Buyers: *${s.active_buyers}*\n\n`;
  text += `🤖 AI Mode: *${ai.MODE() === 'premium' ? 'Claude (Premium)' : 'Llama 3.3 (Free)'}*\n\n`;
  if (upcoming.length > 0) {
    text += `📅 *Upcoming (7 days)*\n`;
    upcoming.slice(0, 5).forEach(e => {
      const icon = e.type === 'call' ? '📞' : e.type === 'offer' ? '📋' : '🎉';
      text += `${icon} ${e.date} — ${e.title}\n`;
    });
  }
  send(msg.chat.id, text);
});

// /mode — switch AI engine
bot.onText(/\/mode (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const mode = match[1].trim().toLowerCase();
  if (!['free', 'premium'].includes(mode)) {
    return send(msg.chat.id, '❌ Use `/mode free` or `/mode premium`');
  }
  process.env.AI_MODE = mode;
  db.setSetting('ai_mode', mode);
  const icon = mode === 'premium' ? '🧠' : '🦙';
  send(msg.chat.id, `${icon} Switched to *${mode === 'premium' ? 'Claude (Premium)' : 'Llama 3.3 on Groq (Free)'}* mode`);
});

// /test — test all connections
bot.onText(/\/test/, async (msg) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  send(msg.chat.id, '🔧 Testing all connections...');

  // Test AI
  let aiOk = false;
  try {
    const r = await ai.ask('Reply with just the word OK', '', 10);
    aiOk = r.toLowerCase().includes('ok');
  } catch {}

  // Test email
  const emailTest = await testConnection();

  const aiIcon    = aiOk        ? '✅' : '❌';
  const emailIcon = emailTest.success ? '✅' : '❌';
  const dbLeads   = db.getLeads().length;

  send(msg.chat.id, `*Connection Test Results*\n\n${aiIcon} AI (${ai.MODE()}): ${aiOk ? 'Connected' : 'Error — check API key'}\n${emailIcon} Gmail: ${emailTest.success ? 'Connected' : emailTest.error}\n✅ Database: ${dbLeads} leads loaded\n✅ Telegram: Connected (you can see this!)\n\n${aiOk && emailTest.success ? '🟢 All systems ready!' : '🔴 Some connections need attention.'}`);
});

// /pipeline — deal pipeline
bot.onText(/\/pipeline/, async (msg) => {
  if (!guard(msg)) return;
  const leads = db.getLeads();
  const stages = ['New Lead', 'Contacted', 'Offer Sent', 'Negotiating', 'Under Contract', 'Closed'];
  let text = '📊 *Deal Pipeline*\n\n';
  stages.forEach(stage => {
    const items = leads.filter(l => l.status === stage);
    if (items.length === 0) return;
    const icon = { 'New Lead': '🆕', 'Contacted': '📞', 'Offer Sent': '📋', 'Negotiating': '🤝', 'Under Contract': '✍️', 'Closed': '✅' }[stage];
    text += `${icon} *${stage}* (${items.length})\n`;
    items.slice(0, 3).forEach(l => {
      text += `  • ${l.address.split(',')[0]} — $${(l.fee || 0).toLocaleString()} fee\n`;
    });
    if (items.length > 3) text += `  _...and ${items.length - 3} more_\n`;
    text += '\n';
  });
  if (leads.length === 0) text += '_No leads yet. Use /leads to find deals._';
  send(msg.chat.id, text);
});

// /lead [id] — view single lead
bot.onText(/\/lead (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const id = match[1].trim();
  const leads = db.getLeads();
  const lead = leads.find(l => l.id === id || l.address?.toLowerCase().includes(id.toLowerCase()));
  if (!lead) return send(msg.chat.id, `❌ Lead not found. Use /pipeline to see IDs.`);

  let text = `🏠 *${lead.address}*\n\n`;
  text += `📍 ${lead.type} | ${lead.beds}BD/${lead.baths}BA | ${lead.sqft?.toLocaleString()} sqft\n`;
  text += `📊 Category: *${lead.category}* | Status: *${lead.status}*\n`;
  text += `📅 DOM: *${lead.dom} days* | Risk: *${lead.risk}*\n\n`;
  text += `💰 ARV: *$${(lead.arv || 0).toLocaleString()}*\n`;
  text += `💵 Offer: *$${(lead.offer || 0).toLocaleString()}*\n`;
  text += `🎯 Assignment Fee: *$${(lead.fee_lo || 0).toLocaleString()} – $${(lead.fee_hi || 0).toLocaleString()}*\n\n`;
  text += `📞 Phone: ${lead.phone || 'N/A'}\n`;
  text += `👤 Seller: ${lead.seller_type || 'Unknown'}\n`;
  if (lead.notes) text += `\n📝 Notes: ${lead.notes}\n`;
  text += `\n_ID: ${lead.id}_\n`;
  text += `\nActions: /match ${lead.id} | /reach ${lead.id} | /status ${lead.id} Contacted`;
  send(msg.chat.id, text);
});

// /leads [county] [count] [category?] — FIND LEADS AND GENERATE PDF
bot.onText(/\/leads (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts  = match[1].trim().split(/\s+/);
  const county = parts[0] || 'Dallas';
  const count  = Math.min(parseInt(parts[1]) || 20, 400);
  const cats   = parts.slice(2).length > 0
    ? parts.slice(2)
    : ['Pre-FC', 'REO', 'Long DOM', 'FSBO', 'Probate', 'Auction', 'Tax Delinquent'];

  send(msg.chat.id, `🔍 Searching *${county} County* for *${count} leads*...\nAI Mode: *${ai.MODE() === 'premium' ? 'Claude' : 'Llama 3.3 (Free)'}*\n\nThis will take 1-3 minutes. I'll send the PDF when ready.`);
  bot.sendChatAction(msg.chat.id, 'upload_document');

  try {
    const allLeads    = [];
    const allAnalyses = [];
    const batchSize   = 20; // Generate in batches of 20
    const batches     = Math.ceil(count / batchSize);

    for (let b = 0; b < batches; b++) {
      const bCount = Math.min(batchSize, count - b * batchSize);
      bot.sendChatAction(msg.chat.id, 'upload_document');

      // Generate lead list via AI
      const rawLeads = await ai.generateLeadList(county, 'TX', bCount, cats);

      for (const rawLead of rawLeads) {
        // Skip duplicates
        if (db.leadExists(rawLead.address)) continue;

        // AI analyze each lead
        let analysis = {};
        try {
          analysis = await ai.analyzeProperty({ ...rawLead, county });
        } catch {}

        // Merge data
        const fullLead = {
          ...rawLead,
          arv:     analysis.arv     || 0,
          offer:   analysis.offer   || 0,
          repairs: analysis.repairs || 0,
          fee_lo:  analysis.fee_lo  || 10000,
          fee_hi:  analysis.fee_hi  || 20000,
          risk:    analysis.risk    || 'Medium',
          motivation: analysis.motivation || [],
        };

        // Save to DB
        const saved = db.addLead(fullLead);
        allLeads.push(saved);
        allAnalyses.push(analysis);
      }

      if (b < batches - 1) {
        send(msg.chat.id, `📊 Batch ${b + 1}/${batches} complete — ${allLeads.length} leads so far...`);
      }
    }

    if (allLeads.length === 0) {
      return send(msg.chat.id, '⚠️ No new leads generated. Try a different county or category.');
    }

    // Sort best to least best (by fee high to low, then risk)
    allLeads.sort((a, b) => {
      const scoreA = (a.fee_hi || 0) - (a.risk === 'High' ? 5000 : a.risk === 'Low' ? -5000 : 0);
      const scoreB = (b.fee_hi || 0) - (b.risk === 'High' ? 5000 : b.risk === 'Low' ? -5000 : 0);
      return scoreB - scoreA;
    });

    send(msg.chat.id, `✅ Found *${allLeads.length} leads* — generating PDF...`);
    bot.sendChatAction(msg.chat.id, 'upload_document');

    const pdfBuffer = await generateLeadsPDF(
      allLeads,
      allAnalyses,
      `${county} County — ${allLeads.length} Wholesale Leads`
    );

    await sendDoc(
      msg.chat.id,
      pdfBuffer,
      `${county}_${allLeads.length}_Leads_${new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit'})}.pdf`,
      `🏠 *${county} County — ${allLeads.length} Leads*\nRanked best to least best.\n💰 Total est. fees: $${allLeads.reduce((s,l) => s + (l.fee_lo||0), 0).toLocaleString()}+`
    );

    // Also send top 5 in chat
    let summary = `\n🏆 *Top 5 Deals — ${county} County*\n\n`;
    allLeads.slice(0, 5).forEach((l, i) => {
      summary += `*${i + 1}. ${l.address.split(',')[0]}*\n`;
      summary += `   ARV: $${(l.arv||0).toLocaleString()} | Fee: $${(l.fee_lo||0).toLocaleString()}-$${(l.fee_hi||0).toLocaleString()} | ${l.category} | Risk: ${l.risk}\n\n`;
    });
    summary += `_Use /lead [address keyword] for full details on any lead_`;
    send(msg.chat.id, summary);

  } catch (err) {
    console.error('Lead search error:', err);
    send(msg.chat.id, `❌ Error finding leads: ${err.message}\n\nTry /test to check connections.`);
  }
});

// /buyers — list buyers
bot.onText(/\/buyers/, async (msg) => {
  if (!guard(msg)) return;
  const buyers = db.getBuyers();
  if (buyers.length === 0) {
    return send(msg.chat.id, '👥 No buyers yet.\n\nUse /addbuyer to add one:\n`/addbuyer DFW Acquisitions LLC | Cash Buyer | Marcus Johnson | (214) 555-9001 | marcus@dfwacq.com | $150K-$400K`');
  }
  let text = `👥 *Buyers Database (${buyers.length})*\n\n`;
  buyers.forEach((b, i) => {
    const icon = b.type === 'Hedge Fund' ? '🏦' : '💼';
    text += `${icon} *${b.name}*\n`;
    text += `   ${b.contact} | ${b.phone}\n`;
    text += `   Max: $${(b.maxPrice || 0).toLocaleString()} | ${b.markets || 'DFW'}\n`;
    text += `   _${b.status}_ | Closings: ${b.closings || 0}\n\n`;
  });
  text += `Use /match [lead-id] to find buyers for a deal`;
  send(msg.chat.id, text);
});

// /addbuyer — add a buyer
bot.onText(/\/addbuyer (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].split('|').map(p => p.trim());
  if (parts.length < 4) {
    return send(msg.chat.id, `Format: /addbuyer Name | Type | Contact | Phone | Email | PriceRange\nExample: /addbuyer DFW Acquisitions | Cash Buyer | Marcus | (214) 555-0001 | marcus@email.com | $150K-$400K`);
  }
  const priceRange = parts[5] || '$100K-$500K';
  const prices = priceRange.match(/\d+/g) || ['100', '500'];
  const buyer = {
    name:     parts[0],
    type:     parts[1] || 'Cash Buyer',
    contact:  parts[2],
    phone:    parts[3],
    email:    parts[4] || '',
    maxPrice: parseInt(prices[1] || '400') * 1000,
    minARV:   parseInt(prices[0] || '100') * 1000,
    markets:  'DFW Metro',
    preferred: 'SFR',
    criteria: priceRange,
  };
  const saved = db.addBuyer(buyer);
  send(msg.chat.id, `✅ Buyer added!\n\n*${saved.name}*\n${saved.contact} | ${saved.phone}\nBuy box: ${priceRange}\nID: ${saved.id}`);
});

// /match [lead-id] — match lead to buyers
bot.onText(/\/match (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  typing(msg.chat.id);
  const keyword = match[1].trim();
  const leads = db.getLeads();
  const lead = leads.find(l => l.id === keyword || l.address?.toLowerCase().includes(keyword.toLowerCase()));
  if (!lead) return send(msg.chat.id, `❌ Lead not found: ${keyword}`);

  const matches = db.matchBuyersToLead(lead);
  if (matches.length === 0) {
    return send(msg.chat.id, `⚠️ No matching buyers for ARV $${(lead.arv||0).toLocaleString()}.\n\nAdd buyers with /addbuyer or adjust price range.`);
  }

  let text = `🎯 *Buyer Matches — ${lead.address.split(',')[0]}*\n`;
  text += `ARV: $${(lead.arv||0).toLocaleString()} | Fee: $${(lead.fee_lo||0).toLocaleString()}-$${(lead.fee_hi||0).toLocaleString()}\n\n`;
  matches.forEach(b => {
    const icon = b.type === 'Hedge Fund' ? '🏦' : '💼';
    text += `${icon} *${b.name}*\n`;
    text += `   ${b.contact} — ${b.phone}\n`;
    text += `   Use: /send ${lead.id.slice(-6)} ${b.name.split(' ')[0]}\n\n`;
  });
  send(msg.chat.id, text);
});

// /send [lead-id] [buyer-name] — send deal to buyer
bot.onText(/\/send (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 2) return send(msg.chat.id, '❌ Format: /send [lead-id-or-address] [buyer-name]');

  const buyerKeyword = parts.slice(1).join(' ');
  const leadKeyword  = parts[0];

  const leads  = db.getLeads();
  const buyers = db.getBuyers();
  const lead   = leads.find(l => l.id === leadKeyword || l.id.endsWith(leadKeyword) || l.address?.toLowerCase().includes(leadKeyword.toLowerCase()));
  const buyer  = buyers.find(b => b.name?.toLowerCase().includes(buyerKeyword.toLowerCase()) || b.contact?.toLowerCase().includes(buyerKeyword.toLowerCase()));

  if (!lead)  return send(msg.chat.id, `❌ Lead not found: ${leadKeyword}`);
  if (!buyer) return send(msg.chat.id, `❌ Buyer not found: ${buyerKeyword}. Check /buyers`);
  if (!buyer.email) return send(msg.chat.id, `❌ ${buyer.name} has no email. Update their record.`);

  typing(msg.chat.id);
  send(msg.chat.id, `📧 Sending deal to *${buyer.name}*...`);

  try {
    const analysis = { arv: lead.arv, offer: lead.offer, repairs: lead.repairs, risk: lead.risk, fee_lo: lead.fee_lo, fee_hi: lead.fee_hi };
    const pdfBuffer = await generateSinglePropertyPDF(lead, analysis);
    const result = await sendDealToBuyer(buyer, lead, analysis, pdfBuffer);

    if (result.success) {
      send(msg.chat.id, `✅ Deal sent to *${buyer.name}* at ${buyer.email}!\n\nProperty: ${lead.address}\nARV: $${(lead.arv||0).toLocaleString()} | Fee: $${(lead.fee_lo||0).toLocaleString()}-$${(lead.fee_hi||0).toLocaleString()}\n\nPDF attached to email. Follow up in 24-48 hrs.`);
    } else {
      send(msg.chat.id, `❌ Email failed: ${result.error}\n\nCheck Gmail App Password in Railway variables.`);
    }
  } catch (err) {
    send(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

// /reach [lead-id] — send outreach to seller
bot.onText(/\/reach (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const keyword = match[1].trim();
  const leads = db.getLeads();
  const lead = leads.find(l => l.id === keyword || l.address?.toLowerCase().includes(keyword.toLowerCase()));
  if (!lead) return send(msg.chat.id, `❌ Lead not found.`);
  if (!lead.email) return send(msg.chat.id, `⚠️ No email for this seller. Call them at ${lead.phone || 'N/A'}`);

  typing(msg.chat.id);
  const script = await ai.generateSellerScript(lead);
  const result = await sendSellerOutreach(lead, script);

  if (result.success) {
    send(msg.chat.id, `✅ Outreach sent to seller at ${lead.email}!\n\nScript used:\n_${script}_`);
    db.updateLead(lead.id, { status: 'Contacted' });
  } else {
    send(msg.chat.id, `❌ Could not send email: ${result.error}`);
  }
});

// /status [lead-id] [new-status] — update lead status
bot.onText(/\/status (.+?) (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const keyword   = match[1].trim();
  const newStatus = match[2].trim();
  const validStatuses = ['New Lead', 'Contacted', 'Offer Sent', 'Negotiating', 'Under Contract', 'Closed', 'Dead'];

  const leads = db.getLeads();
  const lead  = leads.find(l => l.id === keyword || l.address?.toLowerCase().includes(keyword.toLowerCase()));
  if (!lead) return send(msg.chat.id, `❌ Lead not found.`);

  const matched = validStatuses.find(s => s.toLowerCase().includes(newStatus.toLowerCase()));
  if (!matched) return send(msg.chat.id, `❌ Valid statuses: ${validStatuses.join(', ')}`);

  db.updateLead(lead.id, { status: matched });
  send(msg.chat.id, `✅ *${lead.address.split(',')[0]}* updated to *${matched}*`);
});

// /add — interactive lead addition
bot.onText(/\/add$/, async (msg) => {
  if (!guard(msg)) return;
  send(msg.chat.id, `📝 *Add Lead*\n\nSend details in this format:\n\n\`/addlead 123 Main St, Dallas TX 75201 | SFR | 3 | 2 | 1400 | 1975 | Pre-FC | $180,000 | 90 | Owner | (214) 555-0001 | Dallas\`\n\nFields: Address | Type | Beds | Baths | Sqft | Year | Category | ListPrice | DOM | SellerType | Phone | County`);
});

// /addlead — manual lead addition with pipe-separated values
bot.onText(/\/addlead (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].split('|').map(p => p.trim());
  if (parts.length < 8) {
    return send(msg.chat.id, '❌ Need at least 8 fields. See /add for format.');
  }
  typing(msg.chat.id);

  const lead = {
    address:     parts[0],
    type:        parts[1] || 'SFR',
    beds:        parseInt(parts[2]) || 3,
    baths:       parseInt(parts[3]) || 2,
    sqft:        parseInt(parts[4]) || 1400,
    year:        parseInt(parts[5]) || 1975,
    category:    parts[6] || 'Motivated Seller',
    list_price:  parts[7] || 'Unknown',
    dom:         parseInt(parts[8]) || 60,
    seller_type: parts[9] || 'Owner',
    phone:       parts[10] || '',
    county:      parts[11] || 'Dallas',
    zip:         (parts[0].match(/\d{5}/) || ['00000'])[0],
    status:      'New Lead',
    source_url:  'Manual entry',
  };

  send(msg.chat.id, `🤖 Analyzing *${lead.address}*...`);
  const analysis = await ai.analyzeProperty(lead);
  const fullLead = { ...lead, arv: analysis.arv, offer: analysis.offer, repairs: analysis.repairs, fee_lo: analysis.fee_lo, fee_hi: analysis.fee_hi, risk: analysis.risk, motivation: analysis.motivation };
  const saved = db.addLead(fullLead);

  let text = `✅ *Lead Added + Analyzed!*\n\n`;
  text += `📍 ${saved.address}\n\n`;
  text += `💰 ARV: *$${(analysis.arv||0).toLocaleString()}*\n`;
  text += `💵 Suggested Offer: *$${(analysis.offer||0).toLocaleString()}*\n`;
  text += `🎯 Assignment Fee: *$${(analysis.fee_lo||0).toLocaleString()} – $${(analysis.fee_hi||0).toLocaleString()}*\n`;
  text += `⚠️ Risk: *${analysis.risk || 'Medium'}*\n\n`;
  text += `📞 Script: _${analysis.script || 'Call seller directly.'}_\n\n`;
  text += `ID: \`${saved.id}\`\nUse /match ${saved.id.slice(-6)} to find buyers`;
  send(msg.chat.id, text);
});

// /calendar — upcoming events
bot.onText(/\/calendar/, async (msg) => {
  if (!guard(msg)) return;
  const events = db.getUpcomingEvents(30);
  if (events.length === 0) {
    return send(msg.chat.id, `📅 No upcoming events.\n\nAdd one:\n\`/remind Dallas 2026-04-15 Offer deadline — Garland REO\``);
  }
  let text = `📅 *Calendar — Next 30 Days*\n\n`;
  events.forEach(e => {
    const icon = e.type === 'call' ? '📞' : e.type === 'offer' ? '📋' : '🎉';
    text += `${icon} *${e.date}* — ${e.title}\n`;
    if (e.time) text += `   🕐 ${e.time}\n`;
    text += '\n';
  });
  send(msg.chat.id, text);
});

// /remind — add calendar event
bot.onText(/\/remind (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const parts = match[1].trim().split(/\s+/);
  const date  = parts.find(p => /\d{4}-\d{2}-\d{2}/.test(p)) || parts[0];
  const title = parts.filter(p => !p.match(/\d{4}-\d{2}-\d{2}/)).join(' ');
  const type  = title.toLowerCase().includes('clos') ? 'close' : title.toLowerCase().includes('offer') ? 'offer' : 'call';
  const evt   = db.addEvent({ date, title, type, time: '' });
  send(msg.chat.id, `✅ Event added!\n📅 *${evt.date}* — ${evt.title}`);
});

// Natural language fallback — parse free-text commands
bot.on('message', async (msg) => {
  if (!guard(msg)) return;
  if (!msg.text || msg.text.startsWith('/')) return;

  const text = msg.text.toLowerCase();

  // Natural language: "find 200 leads in Dallas"
  if (text.includes('lead') || text.includes('find') || text.includes('search')) {
    const countMatch  = text.match(/(\d+)\s*(leads?|properties|deals)/i);
    const countyMatch = text.match(/(dallas|tarrant|collin|denton|rockwall|ellis|kaufman|johnson)/i);
    if (countMatch || countyMatch) {
      const count  = countMatch ? parseInt(countMatch[1]) : 20;
      const county = countyMatch ? countyMatch[1].charAt(0).toUpperCase() + countyMatch[1].slice(1) : 'Dallas';
      return bot.emit('text', msg, [`/leads ${county} ${count}`, `/leads ${county} ${count}`, county, String(count)]);
    }
  }

  // "switch to free" / "use premium"
  if (text.includes('free mode') || text.includes('switch to free') || text.includes('use free')) {
    process.env.AI_MODE = 'free';
    return send(msg.chat.id, '🦙 Switched to Llama 3.3 — Free mode');
  }
  if (text.includes('premium mode') || text.includes('switch to premium') || text.includes('use claude')) {
    process.env.AI_MODE = 'premium';
    return send(msg.chat.id, '🧠 Switched to Claude — Premium mode');
  }

  // "show pipeline" / "show buyers"
  if (text.includes('pipeline')) return bot.emit('text', msg, ['/pipeline', '/pipeline']);
  if (text.includes('buyers') || text.includes('buyer list')) return bot.emit('text', msg, ['/buyers', '/buyers']);
  if (text.includes('stats') || text.includes('dashboard') || text.includes('summary')) return bot.emit('text', msg, ['/stats', '/stats']);
  if (text.includes('calendar') || text.includes('upcoming') || text.includes('schedule')) return bot.emit('text', msg, ['/calendar', '/calendar']);

  // Fallback
  send(msg.chat.id, `Got it. Try these commands:\n\n• /leads Dallas 50\n• /pipeline\n• /buyers\n• /stats\n• /help`);
});

// ── Scheduled reminders (8am daily) ───────────────────────────────────────
cron.schedule('0 8 * * *', async () => {
  if (!OWNER_ID) return;
  const events  = db.getUpcomingEvents(3);
  const stats   = db.getStats();

  let text = `☀️ *Good morning Gabriel!*\n\n`;
  text += `📊 Pipeline: ${stats.under_contract} under contract | $${stats.fees_pipeline.toLocaleString()} fees\n\n`;
  if (events.length > 0) {
    text += `📅 *Next 3 days:*\n`;
    events.forEach(e => {
      const icon = e.type === 'call' ? '📞' : e.type === 'offer' ? '📋' : '🎉';
      text += `${icon} ${e.date} — ${e.title}\n`;
    });
  }
  text += `\nType /leads Dallas 50 to find new deals today.`;
  send(OWNER_ID, text);
});

// ── Express health check (keeps Railway alive) ─────────────────────────────
const app = express();
app.get('/', (_, res) => res.json({ status: 'WholesaleOS Bot Running', leads: db.getLeads().length, mode: ai.MODE() }));
app.get('/health', (_, res) => res.json({ ok: true }));
app.listen(process.env.PORT || 3000, () => console.log(`🏠 WholesaleOS Bot started on port ${process.env.PORT || 3000}`));

console.log('🤖 WholesaleOS Telegram Bot is running...');
console.log(`🧠 AI Mode: ${ai.MODE()}`);
console.log(`📧 Gmail: ${process.env.GMAIL_USER}`);
