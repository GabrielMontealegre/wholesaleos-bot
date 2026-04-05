// comms.js — Twilio SMS + Browser Dialer + Bulk Email Engine
// Handles all outbound/inbound communications for WholesaleOS
'use strict';

const { v4: uuidv4 } = require('uuid');

// ── Twilio client (lazy init) ─────────────────────────────────────────────
function getTwilio() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  const twilio = require('twilio');
  return twilio(sid, token);
}

function getTwilioPhone() {
  return process.env.TWILIO_PHONE_NUMBER || '';
}

function isTwilioConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

// ── AI Text Generator ─────────────────────────────────────────────────────
// Generates humanized, unique messages — never sounds like a template

function generateHumanizedSMS(lead) {
  const name    = lead.owner_name ? lead.owner_name.split(' ')[0] : null;
  const street  = (lead.address || '').split(',')[0];
  const city    = (lead.address || '').split(',')[1]?.trim() || '';

  // 8 rotating openers — Gabriel's natural voice
  const openers = [
    `Hey${name ? ' ' + name : ''}, my name is Gabriel`,
    `Hi${name ? ' ' + name : ''}, this is Gabriel`,
    `${name ? name + ', ' : ''}hope you're doing well — I'm Gabriel`,
    `Good day${name ? ' ' + name : ''}! I'm Gabriel`,
    `Hey there${name ? ' ' + name : ''}, Gabriel here`,
    `${name ? 'Hi ' + name + ',' : 'Hi,'} Gabriel Montealegre here`,
    `${name ? name + ' — ' : ''}Quick note from Gabriel`,
    `Hello${name ? ' ' + name : ''}! Gabriel here`,
  ];

  const opener = openers[Math.floor(Math.random() * openers.length)];

  // 6 rotating body styles — same intent, different words
  const bodies = [
    ` with Montsan REI. I came across your property on ${street}${city ? ' in ' + city : ''} and would love to chat about making you a cash offer. No agents, no repairs, no hassle — we close on your timeline. Would you be open to a quick call?`,
    ` — local cash buyer. I saw your property at ${street} and I'm genuinely interested. We buy as-is, close fast, no fees. Is this something you'd be open to discussing?`,
    ` from Montsan REI. Your property on ${street} caught my attention and I'd love to make you a fair cash offer. We're not agents — just investors who close quickly. Mind if we connect?`,
    `. I'm a cash buyer and I'm interested in ${street}. We handle everything, close in 2 weeks or on your schedule. No pressure at all — just want to see if it makes sense for both of us.`,
    ` with Montsan REI. I'd love to make a cash offer on your home at ${street}. Quick close, no repairs needed, zero commissions. Would a quick call work for you?`,
    `. I buy homes in ${city || 'your area'} for cash and your property at ${street} is exactly what I look for. Flexible closing, no realtor fees. Is now a good time to connect?`,
  ];

  const body = bodies[Math.floor(Math.random() * bodies.length)];

  return opener + body + ' — Gabriel';
}

function generateHumanizedEmail(lead) {
  const name   = lead.owner_name || 'there';
  const first  = name.split(' ')[0];
  const street = (lead.address || '').split(',')[0];
  const city   = (lead.address || '').split(',')[1]?.trim() || '';
  const state  = lead.state || '';

  const subjects = [
    `Interested in your property on ${street}`,
    `Quick question about ${street}`,
    `Cash offer for ${street} — no agents needed`,
    `${street} — is this still available?`,
    `I'd love to make an offer on ${street}`,
    `Your property on ${street} caught my eye`,
  ];

  const greetings = [
    `Hi ${first},`,
    `Hello ${first},`,
    `Good day ${first},`,
    `${first}, hope you're doing well.`,
  ];

  const intros = [
    `My name is Gabriel Montealegre and I'm a local real estate investor based in the area. I came across your property at ${street}${city ? ' in ' + city : ''}${state ? ', ' + state : ''} and I'm genuinely interested in making you a cash offer.`,
    `I'm Gabriel, a cash buyer with Montsan REI. Your property at ${street} caught my attention and I wanted to reach out directly — no agents, no middlemen.`,
    `My name is Gabriel with Montsan REI. I invest in properties across${city ? ' ' + city + ' and' : ''} the surrounding areas, and your home at ${street} is exactly the type of property I look for.`,
  ];

  const value_props = [
    `Here's what I can offer:\n\n• Cash purchase — no financing contingencies\n• Close in as little as 14 days, or on your timeline\n• Buy as-is — no repairs or cleaning needed\n• Zero realtor commissions or hidden fees\n• Simple, straightforward process`,
    `What makes working with me different:\n\n• I'm a cash buyer — no banks, no delays\n• We close when YOU are ready\n• Property sold exactly as it sits — no repairs\n• No commissions, no closing costs on your end\n• I handle all the paperwork`,
    `Why sellers choose to work with me:\n\n• Cash in hand — fast and certain\n• Flexible closing date — your schedule, not mine\n• No showings, no open houses, no strangers walking through\n• No agent fees eating into your proceeds\n• Honest and straightforward from day one`,
  ];

  const closings = [
    `I'm not here to pressure you — just to see if there's a fit. Even if you're not sure you want to sell, I'm happy to have a no-obligation conversation.\n\nWould you have 10 minutes for a quick call this week?`,
    `There's absolutely no obligation here. I just want to see if what I can offer makes sense for your situation.\n\nIf you're open to it, I'd love to set up a quick 10-minute call.`,
    `I completely understand if the timing isn't right or if you're not sure about selling. No pressure at all — I just wanted to make sure you knew you had an option.\n\nIf you'd like to chat, I'm available anytime.`,
  ];

  const subject  = subjects[Math.floor(Math.random() * subjects.length)];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  const intro    = intros[Math.floor(Math.random() * intros.length)];
  const vp       = value_props[Math.floor(Math.random() * value_props.length)];
  const closing  = closings[Math.floor(Math.random() * closings.length)];

  const body = `${greeting}\n\n${intro}\n\n${vp}\n\n${closing}\n\nBest regards,\nGabriel Montealegre\nMontsan REI\nReal Estate Investor`;

  return { subject, body };
}

// ── SEND SINGLE SMS ───────────────────────────────────────────────────────
async function sendSMS(to, body, leadId, db) {
  const client = getTwilio();
  if (!client) throw new Error('Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER to Railway variables.');

  // Clean phone number
  const cleaned = to.replace(/[^0-9]/g, '');
  const phone   = cleaned.length === 10 ? '+1' + cleaned : cleaned.length === 11 ? '+' + cleaned : '+' + cleaned;

  const msg = await client.messages.create({
    body,
    from: getTwilioPhone(),
    to:   phone,
  });

  // Log in DB
  if (db) {
    const dbData = db.readDB();
    if (!dbData.smsLog) dbData.smsLog = [];
    dbData.smsLog.push({
      id:        uuidv4(),
      sid:       msg.sid,
      leadId,
      to:        phone,
      body,
      direction: 'outbound',
      status:    msg.status,
      created:   new Date().toISOString(),
    });
    db.writeDB(dbData);
  }

  return { ok: true, sid: msg.sid, status: msg.status };
}

// ── BULK SMS ──────────────────────────────────────────────────────────────
async function sendBulkSMS(leads, db, options = {}) {
  const results = { sent: 0, failed: 0, skipped: 0, errors: [] };
  const delay   = options.delay || 1200; // ms between sends — avoid rate limits

  for (const lead of leads) {
    if (!lead.phone) { results.skipped++; continue; }
    try {
      const body = options.customMessage || generateHumanizedSMS(lead);
      await sendSMS(lead.phone, body, lead.id, db);
      results.sent++;
      // Mark lead as contacted
      if (db) {
        const dbData = db.readDB();
        const idx = (dbData.leads || []).findIndex(l => l.id === lead.id);
        if (idx >= 0) {
          dbData.leads[idx].lastSMSSent = new Date().toISOString();
          dbData.leads[idx].status = dbData.leads[idx].status === 'New Lead' ? 'Contacted' : dbData.leads[idx].status;
          db.writeDB(dbData);
        }
      }
      await new Promise(r => setTimeout(r, delay));
    } catch(e) {
      results.failed++;
      results.errors.push({ lead: lead.address, error: e.message });
    }
  }

  return results;
}

// ── BULK EMAIL ────────────────────────────────────────────────────────────
async function sendBulkEmail(leads, gmailTransport, db, options = {}) {
  const results = { sent: 0, failed: 0, skipped: 0, errors: [] };
  const { google } = require('googleapis');
  const delay = options.delay || 2000;

  for (const lead of leads) {
    if (!lead.email) { results.skipped++; continue; }
    try {
      const { subject, body } = options.customEmail || generateHumanizedEmail(lead);
      const cfg = gmailTransport;
      if (!cfg) throw new Error('Gmail not configured');

      const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
      const parts = [
        'From: ' + cfg.user,
        'To: ' + lead.email,
        'Subject: ' + subject,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body,
      ];
      const raw = Buffer.from(parts.join('\n')).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });

      results.sent++;
      if (db) {
        const dbData = db.readDB();
        const idx = (dbData.leads || []).findIndex(l => l.id === lead.id);
        if (idx >= 0) {
          dbData.leads[idx].lastEmailSent = new Date().toISOString();
          dbData.leads[idx].status = dbData.leads[idx].status === 'New Lead' ? 'Contacted' : dbData.leads[idx].status;
          db.writeDB(dbData);
        }
      }
      await new Promise(r => setTimeout(r, delay));
    } catch(e) {
      results.failed++;
      results.errors.push({ lead: lead.address, error: e.message });
    }
  }

  return results;
}

// ── TWILIO BROWSER DIALER — Token Generation ──────────────────────────────
function generateDialerToken(identity) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const appSid = process.env.TWILIO_TWIML_APP_SID; // Optional — for browser calling

  if (!sid || !token) return null;

  try {
    const twilio    = require('twilio');
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant  = AccessToken.VoiceGrant;

    const accessToken = new AccessToken(sid, process.env.TWILIO_API_KEY || sid, process.env.TWILIO_API_SECRET || token, { identity: identity || 'gabriel' });
    const grant = new VoiceGrant({ outgoingApplicationSid: appSid, incomingAllow: true });
    accessToken.addGrant(grant);
    return accessToken.toJwt();
  } catch(e) {
    console.error('Dialer token error:', e.message);
    return null;
  }
}

// ── INBOUND SMS WEBHOOK ───────────────────────────────────────────────────
function handleInboundSMS(from, body, db) {
  if (!db) return;
  const dbData = db.readDB();
  if (!dbData.smsLog) dbData.smsLog = [];

  // Find lead by phone number
  const cleaned = from.replace(/[^0-9]/g, '');
  const lead = (dbData.leads || []).find(l => {
    const lp = (l.phone || '').replace(/[^0-9]/g, '');
    return lp && lp === cleaned;
  });

  dbData.smsLog.push({
    id:        uuidv4(),
    leadId:    lead?.id || null,
    from,
    body,
    direction: 'inbound',
    status:    'received',
    created:   new Date().toISOString(),
  });

  // Add notification
  if (dbData.notifications === undefined) dbData.notifications = [];
  dbData.notifications.unshift({
    id:      uuidv4(),
    type:    'sms',
    title:   'Reply received',
    message: `${from}: "${body.slice(0, 60)}"`,
    leadId:  lead?.id,
    read:    false,
    created: new Date().toISOString(),
  });

  db.writeDB(dbData);
  return lead;
}

// ── GET SMS CONVERSATION FOR A LEAD ──────────────────────────────────────
function getSMSConversation(leadId, db) {
  const dbData = db.readDB();
  const log    = dbData.smsLog || [];
  return log.filter(m => m.leadId === leadId).sort((a,b) => new Date(a.created) - new Date(b.created));
}

// ── GET ALL SMS CONVERSATIONS ─────────────────────────────────────────────
function getAllSMSConversations(db) {
  const dbData = db.readDB();
  const log    = dbData.smsLog || [];
  // Group by leadId / from number
  const groups = {};
  for (const msg of log) {
    const key = msg.leadId || msg.from || msg.to || 'unknown';
    if (!groups[key]) groups[key] = { key, messages: [], lastMessage: null, unread: 0 };
    groups[key].messages.push(msg);
    groups[key].lastMessage = msg;
    if (msg.direction === 'inbound') groups[key].unread++;
  }
  return Object.values(groups).sort((a,b) => new Date(b.lastMessage?.created || 0) - new Date(a.lastMessage?.created || 0));
}

module.exports = {
  isTwilioConfigured,
  getTwilioPhone,
  generateHumanizedSMS,
  generateHumanizedEmail,
  sendSMS,
  sendBulkSMS,
  sendBulkEmail,
  generateDialerToken,
  handleInboundSMS,
  getSMSConversation,
  getAllSMSConversations,
};
