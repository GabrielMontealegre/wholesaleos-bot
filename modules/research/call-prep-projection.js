'use strict';

// Call-prep projection for public deal board rows.
// County-agnostic: reads only canonical deal fields, invents nothing.
// Questions are questions for the seller, never asserted facts.

const PLACEHOLDER_CONTACT_RE = /^(?:manual\s+lookup\s+needed|manual\s+verification\s+needed|unknown|n\/?a|none)$/i;
const enrichmentLedger = require('./enrichment-ledger');
const paidFallbackRegistry = require('./paid-provider-fallback-registry');

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function visibleContactRoute(deal) {
  const route = cleanText(deal && deal.contact_route_if_visible);
  if (!route || PLACEHOLDER_CONTACT_RE.test(route)) return '';
  return route;
}

function contactStatus(deal) {
  return visibleContactRoute(deal) ? 'VISIBLE_PUBLIC_CONTACT' : 'CONTACT_LOOKUP_REQUIRED';
}

function arvLock(deal) {
  const verified = Number(deal && deal.verified_sold_comp_count || 0) || 0;
  if (verified >= 3) {
    return { state: 'ARV_UNLOCKED_VERIFIED_COMPS', reason: `${verified} verified sold comps with source URLs.` };
  }
  return {
    state: 'ARV_LOCKED_NO_VERIFIED_COMPS',
    reason: verified > 0
      ? `Only ${verified} verified sold comp${verified === 1 ? '' : 's'}; 3 are required to unlock ARV.`
      : 'No verified sold comps yet; 3 sold comps with full address, sold price, sold date, and source URL are required.'
  };
}

function maoLock(deal, arv) {
  if (arv.state !== 'ARV_UNLOCKED_VERIFIED_COMPS') {
    return { state: 'MAO_LOCKED_NO_ARV', reason: 'MAO needs ARV first; ARV is locked until 3 verified sold comps exist.' };
  }
  const repairEvidence = cleanText(deal && (deal.repair_evidence_text || deal.repair_evidence)) || (Array.isArray(deal && deal.repair_evidence_items) && deal.repair_evidence_items.length);
  if (!repairEvidence) {
    return { state: 'MAO_LOCKED_NO_REPAIR_EVIDENCE', reason: 'MAO needs repair evidence from the source or an explicit manual repair input.' };
  }
  return { state: 'MAO_READY_TO_CALCULATE', reason: 'ARV unlocked and repair evidence present.' };
}

function sellerQuestions(deal) {
  const address = cleanText(deal && deal.normalized_address);
  if (!address) return [];
  const questions = [`Am I speaking with the owner of ${address}?`];
  const motivation = cleanText(deal && deal.motivation_type).toLowerCase();
  const saleDate = cleanText(deal && (deal.sale_date || deal.event_date || deal.auction_date || deal.sale_date_or_event_date));
  if (/foreclosure|trustee|preforeclosure|auction|sheriff|tax/.test(motivation)) {
    questions.push(saleDate
      ? `Public notice shows a sale date of ${saleDate} - is that sale still going forward?`
      : 'Is the property still headed to a foreclosure or trustee sale, and has a sale date been set?');
    questions.push('Would you consider selling before the sale to protect your equity?');
  } else {
    questions.push('Are you still looking to sell the property?');
  }
  questions.push('What condition is the property in - any major repairs needed?');
  questions.push('What do you owe on the property, and what would you need to walk away?');
  questions.push('If the numbers worked, how quickly would you want to close?');
  return questions;
}

function callReadiness(deal) {
  const address = cleanText(deal && deal.normalized_address);
  const route = visibleContactRoute(deal);
  if (address && route) return 'CALL_READY';
  if (address) return 'NEEDS_CONTACT_ROUTE';
  return 'NEEDS_PROPERTY_IDENTITY';
}

function missingForCall(deal) {
  return []
    .concat(!cleanText(deal && deal.normalized_address) ? ['complete property address'] : [])
    .concat(!visibleContactRoute(deal) ? ['visible public contact route (or paid skip trace)'] : []);
}

function buildCallPrep(deal) {
  const arv = arvLock(deal);
  const mao = maoLock(deal, arv);
  return {
    call_readiness: callReadiness(deal),
    contact_status: contactStatus(deal),
    contact_route_if_visible: visibleContactRoute(deal),
    contact_unlock_action: visibleContactRoute(deal) ? '' : 'FIND_CONTACT_ROUTE or PAID_SKIP_TRACE_REQUIRED',
    comp_status: cleanText(deal && deal.comp_status) || 'missing_verified_sold_comps',
    verified_sold_comp_count: Number(deal && deal.verified_sold_comp_count || 0) || 0,
    ARV_lock_state: arv.state,
    ARV_lock_reason: arv.reason,
    MAO_lock_state: mao.state,
    MAO_lock_reason: mao.reason,
    seller_questions: sellerQuestions(deal),
    missing_for_call: missingForCall(deal),
    lifecycle_status: deal && deal.lifecycle_status || null,
    enrichment_ledger_summary: enrichmentLedger.ledgerSummary(deal || {}),
    paid_fallback_options: paidFallbackRegistry.availableFallbacksForRow(deal || {}),
    preview_only: true
  };
}

module.exports = {
  buildCallPrep,
  visibleContactRoute
};
