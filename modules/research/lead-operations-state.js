'use strict';

const fieldProvenance = require('./field-provenance');

const ROW_STATES = Object.freeze({
  LOCKED: 'LOCKED',
  CALL_READY: 'CALL_READY',
  OUTREACH_READY: 'OUTREACH_READY',
  MAIL_READY: 'MAIL_READY',
  NEEDS_CONTACT_SEARCH: 'NEEDS_CONTACT_SEARCH',
  NEEDS_SKIP_TRACE: 'NEEDS_SKIP_TRACE',
  NEEDS_COMPS: 'NEEDS_COMPS',
  TITLE_NEEDED: 'TITLE_NEEDED',
  CLOSED_NOT_INTERESTED: 'CLOSED_NOT_INTERESTED'
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function routesForDeal(deal) {
  return Array.isArray(deal && deal.free_contact_routes) ? deal.free_contact_routes : [];
}

function routeDisprovedByOperator(deal, route) {
  const flags = Array.isArray(route && route.risk_flags) ? route.risk_flags.map(cleanText) : [];
  if (route && route.operator_disproved === true) return true;
  if (flags.includes('OPERATOR_WRONG_NUMBER_REPORTED')) return true;
  const invalidated = Array.isArray(deal && deal.contact_workflow_invalidated_routes)
    ? deal.contact_workflow_invalidated_routes
    : [];
  const value = cleanText(route && route.value);
  return Boolean(value && invalidated.some((item) => cleanText(item && item.value) === value));
}

function provenRoute(deal, matcher) {
  return routesForDeal(deal).find((route) => route && cleanText(route.value) &&
    !routeDisprovedByOperator(deal, route) &&
    matcher(cleanText(route.route_kind)) && fieldProvenance.routeHasProvenance(route)) || null;
}

function provenMailingRoute(deal) {
  const route = deal && deal.mailing_route;
  return route && cleanText(route.value) && fieldProvenance.routeHasProvenance(route) ? route : null;
}

function identityKnown(deal) {
  const owner = deal && deal.owner_record && typeof deal.owner_record === 'object' ? deal.owner_record : {};
  return Boolean(
    cleanText(owner.owner_name) ||
    cleanText(owner.taxpayer_name) ||
    cleanText(deal && deal.owner_name_if_visible) ||
    cleanText(deal && deal.owner_clue) ||
    (Array.isArray(deal && deal.owner_or_entity_clues) && deal.owner_or_entity_clues.some((clue) => cleanText(clue && clue.value)))
  );
}

function contactWorkflowComplete(deal) {
  const outcome = cleanText(deal && deal.contact_workflow_outcome).toLowerCase();
  if (outcome && outcome !== 'reached') return false;
  const status = cleanText(deal && (deal.contact_workflow_status || deal.operator_contact_status)).toUpperCase();
  return deal && deal.contact_workflow_complete === true || /^(CONTACTED|CONVERSATION_COMPLETE|CONTACT_COMPLETE)$/.test(status);
}

function freeContactLanesExhausted(deal) {
  const status = cleanText(deal && (deal.free_contact_status || deal.contact_status)).toUpperCase();
  if (/^(CONTACT_SEARCH_EXHAUSTED_FREE|BLOCKED|FAILED)$/.test(status)) return true;
  const ledger = deal && deal.enrichment_ledger && Array.isArray(deal.enrichment_ledger.attempts)
    ? deal.enrichment_ledger.attempts
    : [];
  const contactLanes = ['row_source_document', 'county_appraisal', 'public_search', 'official_browser_lookup'];
  return contactLanes.every((lane) => ledger.some((attempt) =>
    cleanText(attempt && attempt.lane) === lane &&
    /^(FOUND|NOT_FOUND|BLOCKED|FAILED|SKIPPED_POLICY)$/.test(cleanText(attempt && attempt.outcome))
  ));
}

function out(rowState, reason, nextAction) {
  return { row_state: rowState, row_state_reason: reason, next_action: nextAction };
}

function rowStateForDeal(deal) {
  deal = deal || {};
  const lifecycle = deal.lifecycle_status && typeof deal.lifecycle_status === 'object' ? deal.lifecycle_status : {};
  if (!cleanText(deal.normalized_address)) {
    return out(ROW_STATES.LOCKED, 'Property identity is incomplete.', 'Verify the complete property address from the public source.');
  }
  if (lifecycle.quarantined === true) {
    return out(ROW_STATES.LOCKED, cleanText(lifecycle.reason_text) || 'This row is quarantined and must be verified before outreach.', 'Verify the row status and source evidence before contacting anyone.');
  }

  const phone = provenRoute(deal, (kind) => kind === 'phone');
  const outreach = provenRoute(deal, (kind) => /^(email|form|reply_link)$/i.test(kind));
  const mailing = provenMailingRoute(deal);
  const workflowComplete = contactWorkflowComplete(deal);
  const compsReady = (Number(deal.verified_sold_comp_count) || 0) >= 3;
  const hasIdentity = identityKnown(deal);
  const contactOutcome = cleanText(deal.contact_workflow_outcome).toLowerCase();

  if (contactOutcome === 'not_interested' || cleanText(deal.contact_workflow_status).toUpperCase() === 'CLOSED_NOT_INTERESTED') {
    return out(ROW_STATES.CLOSED_NOT_INTERESTED, 'The operator recorded that this contact is not interested.', 'Do not continue outreach unless new source evidence changes the situation.');
  }

  if (!workflowComplete && phone) {
    return out(ROW_STATES.CALL_READY, 'A source-linked public phone route is visible.', 'Verify the source evidence, then call this contact.');
  }
  if (!workflowComplete && outreach) {
    return out(ROW_STATES.OUTREACH_READY, 'A source-linked public email, form, or reply route is visible.', 'Verify the source evidence, then use this outreach route.');
  }
  if (!workflowComplete && mailing) {
    const taxpayer = cleanText(deal.owner_record && deal.owner_record.owner_role) === 'taxpayer_of_record';
    return out(
      ROW_STATES.MAIL_READY,
      taxpayer
        ? 'A taxpayer-of-record mailing address is visible; the taxpayer may be a servicer or escrow company, not the owner.'
        : 'An owner-of-record mailing address is visible on an official public record.',
      taxpayer ? 'Review the taxpayer caveat, then prepare a letter.' : 'Verify the owner record, then prepare a letter.'
    );
  }

  if (!phone && !outreach && !mailing && hasIdentity && freeContactLanesExhausted(deal)) {
    return out(ROW_STATES.NEEDS_SKIP_TRACE, 'Identity is known, but the free public contact lanes are exhausted or blocked.', 'Review the evidence and decide whether this row warrants skip tracing.');
  }

  const contactRouteExists = Boolean(phone || outreach || mailing);
  if (contactRouteExists && !compsReady) {
    return out(ROW_STATES.NEEDS_COMPS, 'A sourced contact route exists, but fewer than 3 verified sold comps are available.', 'Research 3 verified sold comps before evaluating an offer.');
  }
  if (contactRouteExists && compsReady && hasIdentity) {
    return out(ROW_STATES.TITLE_NEEDED, 'Contact and comp evidence are ready; no verified public title workflow source exists yet.', 'Verify title and closing requirements with a qualified title company.');
  }
  if (!hasIdentity) {
    return out(ROW_STATES.LOCKED, 'The property is identified, but owner or taxpayer identity is not yet sourced.', 'Find an official owner or taxpayer record before outreach.');
  }
  return out(
    ROW_STATES.NEEDS_CONTACT_SEARCH,
    'Identity is known, but the free public contact search has not finished on this row.',
    'Let the free contact lanes run before considering paid skip tracing.'
  );
}

module.exports = {
  ROW_STATES,
  contactWorkflowComplete,
  freeContactLanesExhausted,
  identityKnown,
  rowStateForDeal
};
