'use strict';

const crypto = require('crypto');

const opportunityExecutionSpine = require('./opportunity-execution-spine');
const opportunityWorkOrders = require('./opportunity-work-orders');

const KERNEL_LOCKS = Object.freeze({
  ARV_LOCKED_NO_VERIFIED_COMPS: 'ARV_LOCKED_NO_VERIFIED_COMPS',
  REPAIRS_LOCKED_NO_EVIDENCE: 'REPAIRS_LOCKED_NO_EVIDENCE',
  MAO_LOCKED_NO_ARV_OR_REPAIRS: 'MAO_LOCKED_NO_ARV_OR_REPAIRS',
  OFFER_LOCKED_NO_MAO: 'OFFER_LOCKED_NO_MAO',
  CALL_LOCKED_NO_PHONE: 'CALL_LOCKED_NO_PHONE',
  BUYER_LOCKED_NO_MATCH: 'BUYER_LOCKED_NO_MATCH',
  TITLE_LOCKED_NO_TITLE_COMPANY: 'TITLE_LOCKED_NO_TITLE_COMPANY'
});

const READINESS_WEIGHTS = Object.freeze({
  identity_ready: 10,
  source_ready: 10,
  motivation_ready: 10,
  current_status_ready: 10,
  contact_ready: 15,
  comp_ready: 15,
  repair_ready: 10,
  mao_ready: 10,
  buyer_ready: 5,
  title_ready: 5
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

function bool(value) {
  return value === true;
}

function arrayify(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function proofReady(proof) {
  if (!proof || typeof proof !== 'object') return false;
  return proof.ready === true || proof.verified === true || cleanText(proof.status) === 'ready';
}

function packetSourceTypes(packet) {
  const values = [
    packet.source_evidence && packet.source_evidence.source_type,
    packet.property && packet.property.source_classification
  ];
  return uniqueText(values);
}

function readinessFrom(packet, executionState) {
  const spineReadiness = executionState && executionState.readiness
    ? executionState.readiness
    : opportunityExecutionSpine.readinessFromPacket(packet);
  const sourceEvidence = packet.source_evidence || {};
  const contact = packet.contact || {};
  const offer = packet.offer_recommendation || {};
  const buyerProof = packet.buyer_proof || {};
  const titleProof = packet.title_proof || {};

  const contactReady = spineReadiness.contact_outreach_ready === true || contact.outreach_allowed === true;
  const callReady = spineReadiness.contact_call_ready === true || contact.call_allowed === true;
  const outreachReady = contactReady && !callReady;
  const buyerReady = proofReady(buyerProof) || packet.buyer_ready === true;
  const titleReady = proofReady(titleProof) || packet.title_ready === true;
  const offerReady = spineReadiness.offer_review_ready === true || cleanText(offer.status) === 'REVIEW_REQUIRED';

  return {
    identity_ready: spineReadiness.identity_ready === true,
    motivation_ready: spineReadiness.motivation_ready === true,
    contact_ready: contactReady,
    call_ready: callReady,
    outreach_ready: outreachReady,
    comp_ready: spineReadiness.comp_ready === true,
    arv_ready: packet.arv && cleanText(packet.arv.status) === 'PRELIMINARY_ARV_AVAILABLE' && !!packet.arv.range,
    repair_ready: spineReadiness.repair_ready === true,
    mao_ready: spineReadiness.mao_ready === true,
    offer_ready: offerReady,
    buyer_ready: buyerReady,
    title_ready: titleReady,
    closing_ready: packet.closing_ready === true
  };
}

function sourceReady(packet, readiness) {
  const source = packet.source_evidence || {};
  return readiness.identity_ready === true && source.property_specific === true && source.source_ready === true;
}

function currentStatusReady(packet, executionState) {
  const spineReadiness = executionState && executionState.readiness
    ? executionState.readiness
    : opportunityExecutionSpine.readinessFromPacket(packet);
  return spineReadiness.current_status_ready === true;
}

function progressPercentage(readiness, sourceIsReady, statusIsReady) {
  const values = {
    identity_ready: readiness.identity_ready,
    source_ready: sourceIsReady,
    motivation_ready: readiness.motivation_ready,
    current_status_ready: statusIsReady,
    contact_ready: readiness.contact_ready,
    comp_ready: readiness.comp_ready,
    repair_ready: readiness.repair_ready,
    mao_ready: readiness.mao_ready,
    buyer_ready: readiness.buyer_ready,
    title_ready: readiness.title_ready
  };
  return Object.keys(READINESS_WEIGHTS).reduce((sum, key) => {
    return sum + (values[key] ? READINESS_WEIGHTS[key] : 0);
  }, 0);
}

function currentStage(readiness, sourceIsReady, statusIsReady) {
  if (!readiness.identity_ready) return 'DISCOVERY';
  if (!sourceIsReady || !readiness.motivation_ready || !statusIsReady) return 'EVIDENCE_REVIEW';
  if (!readiness.contact_ready) return 'CONTACT_LOOKUP';
  if (!readiness.comp_ready) return readiness.call_ready ? 'READY_TO_CALL' : 'READY_FOR_OUTREACH';
  if (!readiness.repair_ready) return 'REPAIR_REVIEW';
  if (!readiness.mao_ready) return 'OFFER_PREP';
  if (!readiness.buyer_ready) return 'BUYER_MATCH';
  if (!readiness.title_ready) return 'TITLE_PREP';
  if (!readiness.closing_ready) return 'CLOSING_PREP';
  return 'CLOSED_READY';
}

function nextStage(stage) {
  if (stage === 'READY_FOR_OUTREACH' || stage === 'READY_TO_CALL') return 'COMP_RESEARCH';
  const order = [
    'DISCOVERY',
    'EVIDENCE_REVIEW',
    'CONTACT_LOOKUP',
    'READY_FOR_OUTREACH',
    'READY_TO_CALL',
    'COMP_RESEARCH',
    'REPAIR_REVIEW',
    'OFFER_PREP',
    'BUYER_MATCH',
    'TITLE_PREP',
    'CLOSING_PREP',
    'CLOSED_READY'
  ];
  const index = order.indexOf(stage);
  return index >= 0 && index + 1 < order.length ? order[index + 1] : 'NONE';
}

function missingEvidence(packet, readiness, sourceIsReady, statusIsReady) {
  const missing = []
    .concat(packet.missing_evidence || [])
    .concat(!readiness.identity_ready ? ['complete property identity'] : [])
    .concat(!sourceIsReady ? ['property-specific source proof'] : [])
    .concat(!readiness.motivation_ready ? ['verbatim motivation evidence'] : [])
    .concat(!statusIsReady ? ['visible current-status evidence'] : [])
    .concat(!readiness.contact_ready ? ['verified contact route'] : [])
    .concat(!readiness.comp_ready ? ['3 verified sold comps'] : [])
    .concat(!readiness.repair_ready ? ['repair evidence or manual repair input'] : [])
    .concat(!readiness.buyer_ready ? ['buyer match'] : [])
    .concat(!readiness.title_ready ? ['title company plan'] : []);
  return uniqueText(missing);
}

function canonicalLocks(packet, readiness) {
  const locks = []
    .concat(packet.lock_states || [])
    .concat(!readiness.arv_ready ? [KERNEL_LOCKS.ARV_LOCKED_NO_VERIFIED_COMPS] : [])
    .concat(!readiness.repair_ready ? [KERNEL_LOCKS.REPAIRS_LOCKED_NO_EVIDENCE] : [])
    .concat(!readiness.mao_ready ? [KERNEL_LOCKS.MAO_LOCKED_NO_ARV_OR_REPAIRS] : [])
    .concat(!readiness.offer_ready ? [KERNEL_LOCKS.OFFER_LOCKED_NO_MAO] : [])
    .concat(!readiness.call_ready ? [KERNEL_LOCKS.CALL_LOCKED_NO_PHONE] : [])
    .concat(!readiness.buyer_ready ? [KERNEL_LOCKS.BUYER_LOCKED_NO_MATCH] : [])
    .concat(!readiness.title_ready ? [KERNEL_LOCKS.TITLE_LOCKED_NO_TITLE_COMPANY] : []);
  return uniqueText(locks);
}

function nextAction(readiness, sourceIsReady, statusIsReady) {
  if (!readiness.identity_ready) {
    return {
      action: 'RESOLVE_PROPERTY_IDENTITY',
      label: 'Find the full address',
      reason: 'Gabriel cannot work the deal until the property identity is complete.'
    };
  }
  if (!sourceIsReady) {
    return {
      action: 'VERIFY_PROPERTY_SOURCE',
      label: 'Verify property-specific source',
      reason: 'Source must prove this exact property before outreach or offer work.'
    };
  }
  if (!readiness.motivation_ready) {
    return {
      action: 'VERIFY_MOTIVATION_EVIDENCE',
      label: 'Verify motivation evidence',
      reason: 'Motivation must be visible and source-backed.'
    };
  }
  if (!statusIsReady) {
    return {
      action: 'VERIFY_CURRENT_STATUS',
      label: 'Verify current status',
      reason: 'The system needs visible proof this is still a live opportunity.'
    };
  }
  if (!readiness.contact_ready) {
    return {
      action: 'ACQUIRE_VERIFIED_CONTACT',
      label: 'Find a verified contact route',
      reason: 'No source-backed phone, email, form, or reply route is ready.'
    };
  }
  if (readiness.call_ready) {
    return {
      action: 'CALL_SELLER',
      label: 'Call seller',
      reason: 'Verified phone exists. Comps can remain locked while Gabriel starts the conversation.'
    };
  }
  if (readiness.outreach_ready) {
    return {
      action: 'SEND_VERIFIED_OUTREACH',
      label: 'Send outreach',
      reason: 'Verified non-phone route exists. Direct phone still missing.'
    };
  }
  if (!readiness.comp_ready) {
    return {
      action: 'RESEARCH_VERIFIED_SOLD_COMPS',
      label: 'Research sold comps',
      reason: 'ARV and offer are locked until 3 verified sold comps exist.'
    };
  }
  if (!readiness.repair_ready) {
    return {
      action: 'CAPTURE_REPAIR_EVIDENCE',
      label: 'Capture repair evidence',
      reason: 'MAO is locked until repair evidence or explicit manual repair input exists.'
    };
  }
  if (!readiness.mao_ready) {
    return {
      action: 'REVIEW_MAO_INPUTS',
      label: 'Review MAO inputs',
      reason: 'Offer stays locked until ARV and repair inputs support MAO.'
    };
  }
  if (!readiness.buyer_ready) {
    return {
      action: 'MATCH_BUYER',
      label: 'Find buyer match',
      reason: 'Deal is not disposition-ready until a buyer path exists.'
    };
  }
  if (!readiness.title_ready) {
    return {
      action: 'SELECT_TITLE_COMPANY',
      label: 'Choose title company',
      reason: 'Title work is missing.'
    };
  }
  return {
    action: 'NONE',
    label: 'Ready for closing workflow',
    reason: 'Core money-path evidence is ready.'
  };
}

function readyChecklist(readiness, sourceIsReady, statusIsReady) {
  return [
    { key: 'identity_ready', label: 'Full property identity', ready: readiness.identity_ready },
    { key: 'source_ready', label: 'Property-specific source', ready: sourceIsReady },
    { key: 'motivation_ready', label: 'Source-backed motivation', ready: readiness.motivation_ready },
    { key: 'current_status_ready', label: 'Current status evidence', ready: statusIsReady },
    { key: 'contact_ready', label: 'Verified contact route', ready: readiness.contact_ready },
    { key: 'call_ready', label: 'Phone call ready', ready: readiness.call_ready },
    { key: 'comp_ready', label: '3 verified sold comps', ready: readiness.comp_ready },
    { key: 'repair_ready', label: 'Repair evidence', ready: readiness.repair_ready },
    { key: 'mao_ready', label: 'MAO unlocked', ready: readiness.mao_ready },
    { key: 'buyer_ready', label: 'Buyer match', ready: readiness.buyer_ready },
    { key: 'title_ready', label: 'Title company path', ready: readiness.title_ready }
  ];
}

function whatWeKnow(packet, readiness, sourceIsReady, statusIsReady) {
  const property = packet.property || {};
  const motivation = packet.motivation_evidence || {};
  const status = packet.current_status || {};
  const contact = packet.contact || {};
  const known = []
    .concat(property.normalized_address ? [`Address: ${property.normalized_address}`] : [])
    .concat(sourceIsReady ? [`Source: ${cleanText((packet.source_evidence || {}).source_url || property.source_url)}`] : [])
    .concat(readiness.motivation_ready ? [`Motivation: ${motivation.exact_phrase}`] : [])
    .concat(statusIsReady ? [`Status: ${status.value || status.evidence_text}`] : [])
    .concat(contact.route_type && contact.route_type !== 'NONE' ? [`Contact: ${contact.route_label || contact.route_type}`] : [])
    .concat(readiness.comp_ready ? ['Comps: 3+ verified sold comps'] : []);
  return uniqueText(known);
}

function actionButtons(readiness, sourceIsReady, statusIsReady) {
  const primary = nextAction(readiness, sourceIsReady, statusIsReady);
  const buttons = [primary.label];
  if (readiness.contact_ready && !readiness.comp_ready) buttons.push('Research comps');
  if (readiness.outreach_ready && !readiness.call_ready) buttons.push('Find phone');
  if (!readiness.buyer_ready) buttons.push('Find buyer');
  if (!readiness.title_ready) buttons.push('Pick title company');
  return uniqueText(buttons);
}

function badgeFor(readiness, stage) {
  if (stage === 'DISCOVERY') return 'NEEDS ADDRESS';
  if (stage === 'EVIDENCE_REVIEW') return 'NEEDS EVIDENCE';
  if (stage === 'CONTACT_LOOKUP') return 'NEEDS CONTACT';
  if (readiness.call_ready) return 'CALL READY';
  if (readiness.outreach_ready) return 'OUTREACH READY';
  return 'WORKFLOW READY';
}

function buildOperatorView(packet, readiness, sourceIsReady, statusIsReady, action, missing, stage) {
  const property = packet.property || {};
  const address = cleanText(property.normalized_address);
  const headline = address ? address : 'Opportunity needs full address';
  const whatKnown = whatWeKnow(packet, readiness, sourceIsReady, statusIsReady);
  return {
    headline,
    badge: badgeFor(readiness, stage),
    stage,
    short_summary: `${headline}: ${action.label}.`,
    next_action_label: action.label,
    next_action_reason: action.reason,
    readiness_checklist: readyChecklist(readiness, sourceIsReady, statusIsReady),
    missing_evidence_checklist: missing,
    risk_flags: uniqueText(packet.risk_flags),
    lock_states: canonicalLocks(packet, readiness),
    what_we_know: whatKnown,
    what_is_missing: missing,
    what_gabriel_should_do: action.reason,
    action_buttons: actionButtons(readiness, sourceIsReady, statusIsReady)
  };
}

function buildEvidence(packet) {
  packet = packet || {};
  const source = packet.source_evidence || {};
  return {
    motivation: packet.motivation_evidence || {},
    current_status: packet.current_status || {},
    source_proof: {
      source_url: cleanText(source.source_url || packet.property && packet.property.source_url),
      property_specific: source.property_specific === true,
      source_ready: source.source_ready === true,
      evidence_text: cleanText(source.evidence_text)
    },
    contact_proof: packet.contact || {},
    comp_proof: packet.comps || {},
    repair_proof: packet.repairs || {},
    title_proof: packet.title_proof || {},
    buyer_proof: packet.buyer_proof || {}
  };
}

function buildCanonicalOpportunity(input = {}, options = {}) {
  const packet = input.packet || input;
  const executionState = input.execution_state || input.opportunity || opportunityExecutionSpine.buildOpportunityExecutionState(packet);
  const readiness = readinessFrom(packet, executionState);
  const sourceIsReady = sourceReady(packet, readiness);
  const statusIsReady = currentStatusReady(packet, executionState);
  const action = nextAction(readiness, sourceIsReady, statusIsReady);
  const missing = missingEvidence(packet, readiness, sourceIsReady, statusIsReady);
  const stage = currentStage(readiness, sourceIsReady, statusIsReady);
  const progress = progressPercentage(readiness, sourceIsReady, statusIsReady);
  const sourceUrls = uniqueText([]
    .concat(packet.source_evidence && packet.source_evidence.source_url)
    .concat(packet.property && packet.property.source_url)
    .concat(arrayify(packet.source_urls)));
  const opportunityId = cleanText(executionState.opportunity_id) || hashId('opp', [
    packet.property && packet.property.property_key,
    packet.property && packet.property.normalized_address,
    sourceUrls[0],
    packet.packet_id
  ].join('|'));
  const legacyTaskQueue = Array.isArray(executionState.execution && executionState.execution.tasks)
    ? executionState.execution.tasks
    : [];

  const canonicalOpportunity = {
    opportunity_id: opportunityId,
    opportunity_version: 1,
    identity: {
      opportunity_id: opportunityId,
      property_key: cleanText(packet.property && packet.property.property_key),
      normalized_address: cleanText(packet.property && packet.property.normalized_address),
      city: cleanText(options.city || options.market && options.market.city),
      county: cleanText(options.county || options.market && options.market.county),
      state: cleanText(options.state || options.market && options.market.state),
      zip: cleanText(options.zip || options.market && options.market.zip),
      source_urls: sourceUrls,
      source_types: packetSourceTypes(packet)
    },
    evidence: buildEvidence(packet),
    readiness: Object.assign({}, readiness, {
      source_ready: sourceIsReady,
      current_status_ready: statusIsReady
    }),
    locks: canonicalLocks(packet, readiness),
    money_path: {
      progress_percentage: progress,
      current_stage: stage,
      next_stage: nextStage(stage),
      blocked_reason: missing[0] || '',
      next_best_action: action.action,
      next_best_action_label: action.label,
      next_best_action_reason: action.reason,
      task_queue: legacyTaskQueue
    },
    operator_view: buildOperatorView(packet, readiness, sourceIsReady, statusIsReady, action, missing, stage),
    audit: {
      preview_only: packet.preview_only !== false && executionState.preview_only !== false,
      should_ingest: false,
      no_global_mutation: true,
      created_from: uniqueText([packet.packet_id, executionState.opportunity_id]).join('|'),
      created_at: cleanText(options.now || packet.generated_at) || new Date().toISOString(),
      confidence_scores: packet.confidence_scores || {},
      risk_flags: uniqueText(packet.risk_flags)
    },
    packet_id: cleanText(packet.packet_id),
    packet_status: cleanText(packet.packet_status),
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
  const workOrderState = opportunityWorkOrders.buildOpportunityWorkOrders(canonicalOpportunity);
  canonicalOpportunity.readiness_outcome = workOrderState.readiness_outcome;
  canonicalOpportunity.work_orders = workOrderState.work_orders;
  canonicalOpportunity.work_order_summary = {
    next_3_tasks: workOrderState.next_3_tasks,
    what_gabriel_can_do_now: workOrderState.what_gabriel_can_do_now,
    what_system_can_do_later: workOrderState.what_system_can_do_later,
    what_requires_paid_data: workOrderState.what_requires_paid_data,
    why_numbers_are_locked: workOrderState.why_numbers_are_locked,
    seller_question_to_unlock_numbers: workOrderState.seller_question_to_unlock_numbers,
    low_evidence_reasons: workOrderState.low_evidence_reasons,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
  canonicalOpportunity.money_path = Object.assign({}, canonicalOpportunity.money_path, {
    readiness_outcome: workOrderState.readiness_outcome,
    task_queue: workOrderState.work_orders,
    legacy_execution_tasks: legacyTaskQueue
  });
  canonicalOpportunity.operator_view = Object.assign({}, canonicalOpportunity.operator_view, {
    top_outcome: workOrderState.readiness_outcome,
    next_3_tasks: workOrderState.next_3_tasks.map((item) => ({
      type: item.type,
      label: item.user_visible_label,
      owner: item.owner,
      can_run_now: item.can_run_now,
      reason: item.reason
    })),
    what_gabriel_can_do_now: workOrderState.what_gabriel_can_do_now,
    what_system_can_do_later: workOrderState.what_system_can_do_later,
    what_requires_paid_data: workOrderState.what_requires_paid_data,
    why_numbers_are_locked: workOrderState.why_numbers_are_locked,
    seller_question_to_unlock_numbers: workOrderState.seller_question_to_unlock_numbers,
    work_order_count: workOrderState.work_orders.length
  });
  return canonicalOpportunity;
}

module.exports = {
  KERNEL_LOCKS,
  READINESS_WEIGHTS,
  buildCanonicalOpportunity,
  readinessFrom,
  progressPercentage
};
