// modules/agents/seller-script-agent.js
// Generates tailored seller call scripts for each lead using LLaMA 3.3
// Called: on-demand via GET /api/leads/:id/seller-script
'use strict';

const db      = require('../../db');
const { ask } = require('../../ai');

// Lead-type specific question banks (LLM adds to these, doesn't use them exclusively)
const BASE_QUESTIONS = {
  'Pre-FC': [
    'When exactly was your Notice of Default filed — and has a sale date been set?',
    'What is the total amount you are behind on the mortgage right now?',
    'Have you talked to your lender about a loan modification or forbearance?',
    'Are there any other liens on the property besides the mortgage?',
    'Is the property occupied right now, or is it vacant?',
  ],
  'Tax Delinquent': [
    'How many years of back taxes are owed, and what is the total amount?',
    'Have you received a notice from the county about a tax sale date?',
    'Are there any other liens or judgments on the property besides the taxes?',
    'Is the property currently rented out or owner-occupied?',
    'Do you have the ability to pay off the taxes if given some time?',
  ],
  'Code Violation': [
    'How many open code violations are on the property, and which departments filed them?',
    'Have you gotten any fines or daily penalties accumulating?',
    'How long have the violations been open — months or years?',
    'Has the city threatened to condemn the property or place a lien?',
    'What would it take to fix the violations — do you have any contractor estimates?',
  ],
  'Probate': [
    'Are all heirs in agreement that the property should be sold?',
    'Is the estate currently in probate court, or is that process completed?',
    'Is the property occupied right now, or has it been vacant since the passing?',
    'Are there any mortgages, liens, or debts tied to this property?',
    'What is your timeline — do you need this resolved within a certain number of months?',
  ],
  'REO': [
    'Is this property bank-owned or has it been through foreclosure auction?',
    'Do you have asset management authority to negotiate price directly?',
    'What condition is the property in — has there been an inspection?',
    'What is the bank's minimum net requirement for this asset?',
    'How long has this been sitting in the REO inventory?',
  ],
  'Fire Damaged': [
    'Was the fire recent, and has an insurance claim been filed?',
    'Is there a payout from insurance still pending, or was the claim settled?',
    'Has the fire department cleared the property as safe to enter?',
    'Are there any active liens or outstanding mortgage on the property?',
    'Are you open to selling as-is in its current condition?',
  ],
  'default': [
    'How long have you owned the property, and what is your reason for selling?',
    'Is there a mortgage on the property — and if so, are payments current?',
    'Are there any liens, judgments, or title issues you are aware of?',
    'What condition is the property in — has anything been updated recently?',
    'What is your ideal timeline for closing?',
  ],
};

function detectLeadCategory(lead) {
  var src = ((lead.source || '') + ' ' + (lead.lead_type || '') + ' ' + ((lead.violations || []).join(' '))).toLowerCase();
  if (src.includes('pre-fc') || src.includes('preforeclosure') || src.includes('foreclosure') || src.includes('nod')) return 'Pre-FC';
  if (src.includes('tax') || src.includes('delinquent') || src.includes('lien')) return 'Tax Delinquent';
  if (src.includes('code') || src.includes('violation') || src.includes('blight')) return 'Code Violation';
  if (src.includes('probate') || src.includes('estate') || src.includes('heir')) return 'Probate';
  if (src.includes('reo') || src.includes('bank owned') || src.includes('bank-owned')) return 'REO';
  if (src.includes('fire') || src.includes('burned') || src.includes('damage')) return 'Fire Damaged';
  return 'default';
}

async function generateSellerScript(leadId) {
  var lead = db.getLeads().find(function(l) { return l.id === leadId; });
  if (!lead) return { error: 'Lead not found' };

  var category = detectLeadCategory(lead);
  var baseQs   = BASE_QUESTIONS[category] || BASE_QUESTIONS['default'];

  var prompt =
    'You are an expert real estate wholesaler coach. Generate a tailored seller call script for this specific lead.\n\n' +
    'LEAD DATA:\n' +
    'Address: ' + (lead.address||'Unknown') + ', ' + (lead.city||'') + ', ' + (lead.state||'') + '\n' +
    'Lead category: ' + category + '\n' +
    'Source: ' + (lead.source||'Unknown') + '\n' +
    'Open violations: ' + ((lead.violations||[]).join(', ')||'None listed') + '\n' +
    'ARV: ' + (lead.arv ? '$' + lead.arv.toLocaleString() : 'Unknown') + '\n' +
    'Motivation score: ' + (lead.motivation_score||lead.motivation||'Unknown') + '/10\n' +
    'Days on market / age: ' + (lead.daysOnMarket||lead.freshness||'Unknown') + '\n' +
    'Owner name: ' + (lead.owner_name||'Unknown') + '\n' +
    'Phone: ' + (lead.phone||'No phone yet') + '\n\n' +
    'BASELINE QUESTIONS (improve/customize these, add 2-3 more that are specific to this exact lead):\n' +
    baseQs.map(function(q,i){return (i+1)+'. '+q;}).join('\n') + '\n\n' +
    'Generate a JSON response with:\n' +
    '1. opening_line: A warm, natural opening sentence using the property address (not owner name if unknown)\n' +
    '2. questions: Array of 7-9 questions, ordered from rapport-building to deal-qualifying\n' +
    '3. objection_handlers: Object with keys "not_interested", "already_listed", "want_full_price" — each a 1-sentence response\n' +
    '4. closing_line: A non-pushy closing that sets next steps\n' +
    '5. key_intel: What specific information YOU most need to find out on this call (2-3 bullet points)\n\n' +
    'Respond ONLY in valid JSON. No markdown. No extra text.\n' +
    'Example format:\n' +
    '{"opening_line":"Hi, I am calling about the property at 123 Main St — is this a good time?","questions":["Q1...","Q2..."],"objection_handlers":{"not_interested":"I completely understand — I just wanted to see if a fair cash offer would make sense given the situation.","already_listed":"That is great — we can still move fast if the listing does not work out.","want_full_price":"I respect that — our value is speed and certainty, no repairs or commissions needed."},"closing_line":"I will send you a written offer by tomorrow — does email or text work better for you?","key_intel":["Confirm if NOD has been filed","Find out total owed vs ARV"]}';

  try {
    var raw = await ask(prompt, 'You are a real estate wholesaler coach. Respond only with valid JSON.', 2000);
    var clean = raw.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(clean);

    // Cache on lead
    db.updateLead(leadId, {
      seller_script: parsed,
      seller_script_category: category,
      seller_script_generated_at: new Date().toISOString(),
    });

    return { ok: true, lead_id: leadId, category, script: parsed };
  } catch(e) {
    console.error('[seller-script] parse error:', e.message);
    // Return base questions as fallback
    return {
      ok: true,
      lead_id: leadId,
      category,
      fallback: true,
      script: {
        opening_line: 'Hi, I am reaching out about the property at ' + (lead.address||'your property') + ' — is this a good time to talk?',
        questions: baseQs,
        objection_handlers: {
          not_interested: 'I completely understand — I just wanted to see if a fair cash offer would make sense given the situation.',
          already_listed: 'That is great — we can still move quickly if the listing does not work out.',
          want_full_price: 'I respect that — our value is speed and certainty, no repairs or agent commissions needed.',
        },
        closing_line: 'I will send you a written offer within 24 hours — does email or text work better for you?',
        key_intel: ['Confirm motivation and timeline', 'Find out total liens and mortgage balance', 'Understand property condition'],
      },
    };
  }
}

module.exports = { generateSellerScript, detectLeadCategory };
