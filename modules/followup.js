// modules/followup.js — Automated follow-up sequences
// Day 1: Call + text | Day 3: Text | Day 7: Call | Day 14: Email | Day 21: Call+text | Day 30: Email
// Messages are property-specific and context-aware

require('dotenv').config();
const db = require('../db');
const { sendEmail } = require('../email');

const OWNER = {
  name: 'Gabriel Montealegre',
  company: 'Montsan Real Estate Investment',
  email: process.env.GMAIL_USER || 'montsan.rei@gmail.com',
  phone: 'your phone number',
};

// Timezone mapping for seller call safety
const STATE_TZ = {
  CA: 'America/Los_Angeles', TX: 'America/Chicago',
  FL: 'America/New_York',   NY: 'America/New_York',
  AZ: 'America/Phoenix',    CO: 'America/Denver',
  WA: 'America/Los_Angeles', OR: 'America/Los_Angeles',
  NV: 'America/Los_Angeles', GA: 'America/New_York',
};

function getSellerTimezone(lead) {
  const state = (lead.address?.match(/\b([A-Z]{2})\b/) || [])[1] || 'TX';
  return STATE_TZ[state] || 'America/Chicago';
}

function isSafeToCall(lead) {
  const tz = getSellerTimezone(lead);
  const sellerHour = parseInt(new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', hour12: false }));
  return sellerHour >= 8 && sellerHour < 20;
}

function getSellerLocalTime(lead) {
  const tz = getSellerTimezone(lead);
  return new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
}

// Generate dynamic property-specific messages
function generateMessages(lead) {
  const addr = lead.address?.split(',')[0] || 'your property';
  const arv  = lead.arv ? `$${lead.arv.toLocaleString()}` : 'strong market value';
  const cat  = lead.category || 'motivated seller';
  const isPreFC = cat.toLowerCase().includes('pre-fc') || cat.toLowerCase().includes('foreclosure');
  const isREO   = cat.toLowerCase().includes('reo');
  const isFSBO  = cat.toLowerCase().includes('fsbo');

  return [
    {
      day: 1, type: 'call+text',
      call: `Hi, this is Gabriel with Montsan Real Estate. I'm reaching out about your property at ${addr}. We buy homes with cash and can close in as little as 14 days with no fees, no commissions, and no repairs. I'd love to make you a fair offer. Please call me back at your convenience.`,
      text: `Hi, this is Gabriel from Montsan REI. I left a voicemail about ${addr}. We buy homes cash, close fast, no fees. Happy to chat whenever works for you. 📞`,
    },
    {
      day: 3, type: 'text',
      text: `Gabriel here from Montsan REI — following up on ${addr}. ${isPreFC ? 'I understand the foreclosure situation can be stressful. I may be able to help you avoid it and walk away with cash.' : isREO ? 'I specialize in bank-owned properties and can close quickly.' : 'Still very interested in your property.'} Any questions, just reply or call. No pressure at all.`,
    },
    {
      day: 7, type: 'call',
      call: `Hi, Gabriel Montealegre from Montsan Real Estate again. I've been thinking about your property at ${addr} and I genuinely believe I can put a fair offer together for you. The market is ${arv} and I want to make sure you get a real solution, not just a lowball. Can we talk for 10 minutes this week?`,
    },
    {
      day: 14, type: 'email',
      subject: `Your property at ${addr} — Cash Offer Still Available`,
      body: `Hi,\n\nI've reached out a couple times about your property at ${addr} and I want to make sure you know the offer is still on the table.\n\nHere is what I can offer:\n• Cash purchase — no financing delays\n• Close in 14-21 days on your timeline\n• No agent commissions or fees\n• Buy as-is — no repairs needed\n• We handle all the paperwork\n\nI understand selling a home is a big decision. If now isn't the right time, that's completely fine. But if you'd like to explore your options, I'd love to have a no-pressure conversation.\n\nBest regards,\n${OWNER.name}\n${OWNER.company}\n${OWNER.email}`,
    },
    {
      day: 21, type: 'call+text',
      call: `Hi, one more call from Gabriel at Montsan Real Estate about ${addr}. I know I've reached out a few times and I appreciate your patience. I have a buyer who is specifically interested in this area and I'd love to present your property. If you're open to it, a 10-minute call could be very valuable. Thank you.`,
      text: `Final follow-up from Gabriel — Montsan REI. ${addr}. Our cash offer is still available if timing ever works. No pressure, just wanted you to know. Take care. 🏠`,
    },
    {
      day: 30, type: 'email',
      subject: `Closing thought — ${addr}`,
      body: `Hi,\n\nThis will be my last follow-up about your property at ${addr}.\n\nI've genuinely enjoyed learning about this property and I believe we could have put together a win-win deal. If your situation ever changes — whether it's 3 months or 3 years from now — please don't hesitate to reach out.\n\nMontsan Real Estate is always buying in your area and we'd be happy to reconnect.\n\nWishing you all the best,\n${OWNER.name}\n${OWNER.company}\n${OWNER.email}`,
    },
  ];
}

// Schedule follow-up sequence for a lead
function scheduleFollowUps(leadId) {
  const db_data = db.readDB();
  const lead = db_data.leads.find(l => l.id === leadId);
  if (!lead) return;

  const messages = generateMessages(lead);
  const today = new Date();

  const sequence = messages.map(m => {
    const date = new Date(today);
    date.setDate(date.getDate() + m.day);
    return {
      id:       `FU_${leadId}_D${m.day}_${Date.now()}`,
      leadId,
      day:      m.day,
      type:     m.type,
      nextDate: date.toISOString().slice(0, 10),
      status:   'pending',
      ...m,
    };
  });

  if (!db_data.followups) db_data.followups = [];
  // Remove old sequence for this lead
  db_data.followups = db_data.followups.filter(f => f.leadId !== leadId);
  db_data.followups.push(...sequence);
  db.writeDB(db_data);

  return sequence;
}

// Process due follow-ups — called by daily cron
async function processDueFollowUps(bot, ownerId) {
  const db_data = db.readDB();
  if (!db_data.followups) return;

  const today = new Date().toISOString().slice(0, 10);
  const due = db_data.followups.filter(f => f.status === 'pending' && f.nextDate <= today);

  if (due.length === 0) return;

  let summary = `🔔 *Follow-Ups Due Today (${due.length})*\n\n`;

  for (const fu of due) {
    const lead = db_data.leads?.find(l => l.id === fu.leadId);
    if (!lead) continue;

    const safe = isSafeToCall(lead);
    const sellerTime = getSellerLocalTime(lead);
    const sellerTZ = getSellerTimezone(lead);

    summary += `*${lead.address?.split(',')[0] || 'Unknown'}*\n`;
    summary += `Type: ${fu.type} | Day ${fu.day}\n`;
    summary += `📞 ${lead.phone || 'No phone'}\n`;
    summary += `Seller time: ${sellerTime} (${sellerTZ.split('/')[1]})\n`;
    summary += safe ? `✅ Safe to call now\n` : `⚠️ Outside calling hours — wait until 8AM seller time\n`;

    if (fu.type.includes('text') || fu.type.includes('call')) {
      summary += `💬 Message: _${(fu.text || fu.call || '').slice(0, 100)}..._\n`;
    }

    if (fu.type === 'email' && lead.email) {
      try {
        await sendEmail({ to: lead.email, subject: fu.subject || `Following up — ${lead.address?.split(',')[0]}`, body: fu.body || fu.call || '' });
        fu.status = 'done';
        summary += `📧 Email sent to ${lead.email}\n`;
      } catch (e) {
        summary += `❌ Email failed: ${e.message}\n`;
      }
    }

    summary += '\n';
  }

  // Save updates
  db.writeDB(db_data);

  // Send to Telegram
  if (bot && ownerId) {
    bot.sendMessage(ownerId, summary, { parse_mode: 'Markdown' }).catch(() => {});
  }

  return due.length;
}

module.exports = { scheduleFollowUps, processDueFollowUps, generateMessages, isSafeToCall, getSellerLocalTime, getSellerTimezone };
