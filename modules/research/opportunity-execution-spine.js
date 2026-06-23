'use strict';

const crypto = require('crypto');

const OPPORTUNITY_STAGES = Object.freeze({
  DISCOVERED: 'DISCOVERED',
  IDENTITY_READY: 'IDENTITY_READY',
  EVIDENCE_READY: 'EVIDENCE_READY',
  CONTACT_READY: 'CONTACT_READY',
  CONVERSATION: 'CONVERSATION',
  COMP_READY: 'COMP_READY',
  OFFER_APPROVED: 'OFFER_APPROVED',
  UNDER_CONTRACT: 'UNDER_CONTRACT',
  DISPOSITION: 'DISPOSITION',
  TITLE: 'TITLE',
  ASSIGNED: 'ASSIGNED',
  CLOSED: 'CLOSED',
  LOST: 'LOST'
});

const OPPORTUNITY_TASKS = Object.freeze({
  RESOLVE_PROPERTY_IDENTITY: 'RESOLVE_PROPERTY_IDENTITY',
  VERIFY_PROPERTY_SOURCE: 'VERIFY_PROPERTY_SOURCE',
  VERIFY_MOTIVATION_EVIDENCE: 'VERIFY_MOTIVATION_EVIDENCE',
  VERIFY_CURRENT_STATUS: 'VERIFY_CURRENT_STATUS',
  ACQUIRE_VERIFIED_CONTACT: 'ACQUIRE_VERIFIED_CONTACT',
  CALL_SELLER: 'CALL_SELLER',
  SEND_VERIFIED_OUTREACH: 'SEND_VERIFIED_OUTREACH',
  RESEARCH_VERIFIED_SOLD_COMPS: 'RESEARCH_VERIFIED_SOLD_COMPS',
  CAPTURE_REPAIR_EVIDENCE: 'CAPTURE_REPAIR_EVIDENCE',
  REVIEW_DRAFT_OFFER: 'REVIEW_DRAFT_OFFER'
});

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function uniqueText(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(cleanText(value)).digest('hex').slice(0, 16)}`;
}

function readinessFromPacket(packet) {
  packet = packet || {};
  const source = packet.source_evidence || {};
  const motivation = packet.motivation_evidence || {};
  const status = packet.current_status || {};
  const contact = packet.contact || {};
  const comps = packet.comps || {};
  const repairs = packet.repairs || {};
  const mao = packet.mao || {};
  const offer = packet.offer_recommendation || {};
  const identityReady = source.identity_ready === true &&
    !!cleanText(packet.property && packet.property.property_key) &&
    !!cleanText(packet.property && packet.property.normalized_address);
  const sourceReady = source.property_specific === true;
  const motivationReady = motivation.verbatim === true &&
    !!cleanText(motivation.exact_phrase) &&
    !!cleanText(motivation.source_url);
  const statusReady = status.verified_visible_source === true &&
    !!cleanText(status.value || status.evidence_text);
  const evidenceReady = identityReady && sourceReady && motivationReady && statusReady;
  const contactOutreachReady = contact.outreach_allowed === true && contact.verified === true;
  const contactCallReady = contact.call_allowed === true && contact.verified === true;
  const compReady = Number(comps.verified_count || 0) >= 3 &&
    !!(packet.arv && packet.arv.range);
  const repairReady = Number(repairs.amount || 0) > 0 && repairs.assumption_only !== true;
  const maoReady = !!mao.range;
  const offerReviewReady = offer.status === 'REVIEW_REQUIRED' &&
    !!offer.maximum_contract_price_range;

  return {
    identity_ready: identityReady,
    property_source_ready: sourceReady,
    motivation_ready: motivationReady,
    current_status_ready: statusReady,
    evidence_ready: evidenceReady,
    contact_outreach_ready: contactOutreachReady,
    contact_call_ready: contactCallReady,
    comp_ready: compReady,
    repair_ready: repairReady,
    mao_ready: maoReady,
    offer_review_ready: offerReviewReady,
    conversation_complete: false,
    offer_approved: false,
    contract_executed: false,
    buyer_selected: false,
    title_opened: false,
    assignment_executed: false,
    closing_complete: false
  };
}

function stageFromReadiness(readiness) {
  if (!readiness.identity_ready) return OPPORTUNITY_STAGES.DISCOVERED;
  if (!readiness.evidence_ready) return OPPORTUNITY_STAGES.IDENTITY_READY;
  if (!readiness.contact_outreach_ready) return OPPORTUNITY_STAGES.EVIDENCE_READY;
  return OPPORTUNITY_STAGES.CONTACT_READY;
}

function task(type, priority, blockedBy) {
  return {
    type,
    priority,
    blocked_by: uniqueText(blockedBy)
  };
}

function tasksFromReadiness(readiness) {
  const tasks = [];
  if (!readiness.identity_ready) {
    tasks.push(task(OPPORTUNITY_TASKS.RESOLVE_PROPERTY_IDENTITY, 1));
  }
  if (!readiness.property_source_ready) {
    tasks.push(task(
      OPPORTUNITY_TASKS.VERIFY_PROPERTY_SOURCE,
      1,
      readiness.identity_ready ? [] : ['complete property identity']
    ));
  }
  if (!readiness.motivation_ready) {
    tasks.push(task(OPPORTUNITY_TASKS.VERIFY_MOTIVATION_EVIDENCE, 1, ['property-specific source']));
  }
  if (!readiness.current_status_ready) {
    tasks.push(task(OPPORTUNITY_TASKS.VERIFY_CURRENT_STATUS, 1, ['property-specific source']));
  }
  if (readiness.evidence_ready && !readiness.contact_outreach_ready) {
    tasks.push(task(OPPORTUNITY_TASKS.ACQUIRE_VERIFIED_CONTACT, 1));
  }
  if (readiness.contact_call_ready) {
    tasks.push(task(OPPORTUNITY_TASKS.CALL_SELLER, 1));
  } else if (readiness.contact_outreach_ready) {
    tasks.push(task(OPPORTUNITY_TASKS.SEND_VERIFIED_OUTREACH, 1));
  }
  if (readiness.contact_outreach_ready && !readiness.comp_ready) {
    tasks.push(task(OPPORTUNITY_TASKS.RESEARCH_VERIFIED_SOLD_COMPS, 2));
  }
  if (readiness.comp_ready && !readiness.repair_ready) {
    tasks.push(task(OPPORTUNITY_TASKS.CAPTURE_REPAIR_EVIDENCE, 2));
  }
  if (readiness.offer_review_ready) {
    tasks.push(task(OPPORTUNITY_TASKS.REVIEW_DRAFT_OFFER, 2, ['seller conversation']));
  }
  return tasks.sort((a, b) => a.priority - b.priority);
}

function stageReason(stage, readiness) {
  if (stage === OPPORTUNITY_STAGES.DISCOVERED) return 'Complete canonical property identity required.';
  if (stage === OPPORTUNITY_STAGES.IDENTITY_READY) return 'Property identity exists; source, motivation, or current-status evidence remains incomplete.';
  if (stage === OPPORTUNITY_STAGES.EVIDENCE_READY) return 'Identity and evidence are ready; verified contact route is missing.';
  if (readiness.contact_call_ready) return 'Verified phone is ready for seller call.';
  return 'Verified outreach route is ready; direct phone remains unavailable.';
}

function buildOpportunityExecutionState(packet) {
  packet = packet || {};
  const property = packet.property || {};
  const source = packet.source_evidence || {};
  const readiness = readinessFromPacket(packet);
  const stage = stageFromReadiness(readiness);
  const tasks = tasksFromReadiness(readiness);
  const identitySeed = cleanText(property.property_key) ||
    cleanText(property.normalized_address) ||
    cleanText(source.source_url) ||
    cleanText(packet.packet_id);

  return {
    opportunity_id: hashId('opp', identitySeed),
    opportunity_version: 1,
    stage,
    stage_reason: stageReason(stage, readiness),
    property: {
      property_key: cleanText(property.property_key),
      normalized_address: cleanText(property.normalized_address),
      source_url: cleanText(source.source_url || property.source_url)
    },
    readiness,
    execution: {
      next_action: tasks.length ? tasks[0].type : 'NONE',
      tasks,
      completed_steps: uniqueText([
        readiness.identity_ready ? 'PROPERTY_IDENTITY' : '',
        readiness.evidence_ready ? 'EVIDENCE' : '',
        readiness.contact_outreach_ready ? 'CONTACT' : '',
        readiness.comp_ready ? 'COMPS' : '',
        readiness.repair_ready ? 'REPAIRS' : '',
        readiness.mao_ready ? 'MAO' : ''
      ])
    },
    projections: {
      deal_packet_id: cleanText(packet.packet_id),
      deal_packet_status: cleanText(packet.packet_status),
      dossier_id: cleanText(packet.dossier_preview && packet.dossier_preview.dossier_id)
    },
    lock_states: uniqueText(packet.lock_states),
    risk_flags: uniqueText(packet.risk_flags),
    missing_evidence: uniqueText(packet.missing_evidence),
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_TASKS,
  readinessFromPacket,
  stageFromReadiness,
  tasksFromReadiness,
  buildOpportunityExecutionState
};
