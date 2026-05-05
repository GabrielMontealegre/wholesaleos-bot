'use strict';
// modules/agents/hot-lead-alert.js
// Fires immediately when a lead scores >= 70 (HOT)
// Also handles AI outreach message generation for sellers

const { scoreHotLead } = require('./hot-lead-scorer');
const { ask } = require('../../ai');

// ── Telegram Alert ──────────────────────────────────────────────────────
async function sendHotLeadAlert(lead, scoreResult) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.BOT_OWNER_ID;
  if (!token || !chatId) return { skipped: true, reason: 'no telegram config' };

  const emoji = scoreResult.hot_emoji || '🔥';
  const score = scoreResult.hot_score || 0;
  const signals = (scoreResult.hot_signals || []).join(' + ');
  const addr = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
  const mapsUrl = 'https://maps.google.com/?q=' + encodeURIComponent(addr);
  const dashUrl = 'https://wholesaleos-bot-production.up.railway.app/dashboard/';

  const msg = emoji + ' HOT LEAD ALERT\n' +
    'Score: ' + score + '/100\n' +
    'Signals: ' + signals + '\n\n' +
    addr + '\n' +
    (lead.county ? 'County: ' + lead.county + '\n' : '') +
    (lead.arv ? 'Est ARV: $' + lead.arv.toLocaleString() + '\n' : '') +
    (lead.mao ? 'MAO: $' + lead.mao.toLocaleString() + '\n' : '') +
    '\n' + mapsUrl + '\n' +
    dashUrl;

  try {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(token);
    await bot.sendMessage(chatId, msg);
    return { sent: true };
  } catch(e) {
    console.error('[hot-alert] telegram error:', e.message);
    return { sent: false, error: e.message };
  }
}

// ── AI Seller Outreach Message Generator ────────────────────────────────
// Generates human-sounding, source-specific outreach
// type: 'sms_seller' | 'email_seller' | 'bulk_buyer'
async function generateOutreachMessage(lead, type, extra) {
  extra = extra || {};

  const addr = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
  const source = lead.source_details || lead.source || lead.category || 'property situation';
  const motivation = (lead.hot_signals || lead.motivation || 'motivated to sell').toString();
  const arv = lead.arv ? '$' + lead.arv.toLocaleString() : 'not yet assessed';
  const mao = lead.mao ? '$' + lead.mao.toLocaleString() : 'pending analysis';

  // Source-specific context
  const sourceContext = {
    foreclosure: 'They are facing foreclosure. They need to sell fast to protect their credit and avoid the sheriff sale. Approach with urgency but empathy — they are stressed.',
    tax_delinquent: 'They have unpaid property taxes and may lose the property at a tax auction. They need cash quickly. Be direct about helping them avoid losing the property.',
    probate: 'This is an estate or inherited property. The heirs often want a fast, clean sale to settle the estate. Be respectful — someone passed away.',
    fire_damaged: 'The property has fire damage. The owner likely cannot afford repairs and wants out quickly. Lead with understanding their situation.',
    vacant: 'The property is vacant or abandoned. The owner is not living there and may have relocated. They want to stop carrying costs.',
    code_violation: 'The city has cited this property for violations. Daily fines are accumulating. The owner needs to sell or fix — selling to us solves both problems instantly.',
    auction: 'This property is heading to auction. There is a hard deadline. Time pressure is real and the owner knows it.',
    default: 'This owner has a distressed property situation and may be open to a fast cash offer.',
  };

  var sourceKey = 'default';
  var signals = lead.hot_signals || [];
  if (Array.isArray(signals)) {
    ['foreclosure','tax_delinquent','probate','fire_damaged','vacant','code_violation','auction'].forEach(function(k) {
      if (signals.some(function(s) { return s.toLowerCase().indexOf(k.replace('_',' ')) > -1 || s.toLowerCase().indexOf(k) > -1; })) sourceKey = k;
    });
  }
  var ctx = sourceContext[sourceKey] || sourceContext.default;

  var systemPrompt, userPrompt;

  if (type === 'sms_seller') {
    systemPrompt = 'You are Gabriel Montealegre, a real estate investor in Los Cabos, Mexico who buys properties across the US. ' +
      'Write a SHORT (under 160 chars), casual, human SMS. NO corporate speak. NO generic phrases like "cash offer" or "hassle-free". ' +
      'Sound like a real person who just noticed this property and wants to help. Use first person. No emojis unless natural. ' +
      'Context: ' + ctx;
    userPrompt = 'Write 1 SMS to the owner of ' + addr + '. Source: ' + source + '. Motivation: ' + motivation + '. ' +
      'Must feel completely human and unique — not like a template.';
  } else if (type === 'email_seller') {
    systemPrompt = 'You are Gabriel Montealegre, a real estate investor. Write a short personal email (150-250 words). ' +
      'Subject line first, then body. Very human, conversational, specific to their situation. ' +
      'NO generic wholesaler language. Reference their actual situation without being intrusive. ' +
      'Sign as Gabriel Montealegre, Montsan Real Estate Investment. ' +
      'Context: ' + ctx;
    userPrompt = 'Write an email to the owner of ' + addr + '. Source: ' + source + '. Situation: ' + motivation + '. ' +
      'Make them feel like Gabriel personally researched their property, not a mass mailer.';
  } else if (type === 'bulk_buyer') {
    // Blind deal outreach to buyers — no address revealed
    var deals = extra.deals || [lead];
    var dealSummaries = deals.slice(0,5).map(function(d, i) {
      return (i+1) + '. ' + (d.state||'') + ' ' + (d.county||d.city||'') + ' — ' +
        (d.category||d.source||'Distressed') + ' — ' +
        (d.arv ? 'Est ARV $' + Math.round(d.arv/1000) + 'K' : 'ARV TBD') + ' — ' +
        (d.mao ? 'MAO $' + Math.round(d.mao/1000) + 'K' : '') +
        (d.spread ? ' / Spread $' + Math.round(d.spread/1000) + 'K' : '');
    }).join('\n');

    systemPrompt = 'You are Gabriel Montealegre, a real estate wholesaler. Write a SHORT, punchy email to a cash buyer. ' +
      'You are showing them available deals WITHOUT revealing the addresses. They can request more info. ' +
      'Sound excited but professional. 100-150 words max. Include a clear CTA to reply or call.';
    userPrompt = 'Write a buyer outreach email for these deals:\n' + dealSummaries + '\n\n' +
      'Buyer context: ' + (extra.buyerName||'Investor') + ', buys in ' + (extra.buyerState||'multiple states') + '.';
  }

  try {
    var result = await ask(userPrompt, systemPrompt, 300);
    return { ok: true, message: result, type: type, lead_id: lead.id };
  } catch(e) {
    console.error('[hot-alert] AI error:', e.message);
    return { ok: false, error: e.message };
  }
}

// Called by db.addLead() and daily cron
async function processNewLead(lead) {
  try {
    var score = scoreHotLead(lead);
    if (score.hot_score >= 70) {
      console.log('[hot-alert] HOT lead detected: ' + lead.id + ' score=' + score.hot_score);
      sendHotLeadAlert(lead, score).catch(function(e) {
        console.error('[hot-alert] alert failed:', e.message);
      });
    }
    return score;
  } catch(e) {
    console.error('[hot-alert] processNewLead error:', e.message);
    return null;
  }
}

module.exports = { sendHotLeadAlert, generateOutreachMessage, processNewLead };
