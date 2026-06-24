'use strict';

const crypto = require('crypto');

const WORK_ORDER_TYPES = Object.freeze({
  VERIFY_PROPERTY_IDENTITY: 'VERIFY_PROPERTY_IDENTITY',
  VERIFY_MOTIVATION_SOURCE: 'VERIFY_MOTIVATION_SOURCE',
  FIND_CONTACT_ROUTE: 'FIND_CONTACT_ROUTE',
  CALL_SELLER: 'CALL_SELLER',
  SEND_SELLER_OUTREACH: 'SEND_SELLER_OUTREACH',
  RUN_COMP_RESEARCH: 'RUN_COMP_RESEARCH',
  CAPTURE_REPAIR_EVIDENCE: 'CAPTURE_REPAIR_EVIDENCE',
  CALCULATE_ARV: 'CALCULATE_ARV',
  CALCULATE_MAO: 'CALCULATE_MAO',
  DRAFT_OFFER: 'DRAFT_OFFER',
  MATCH_BUYERS: 'MATCH_BUYERS',
  SELECT_TITLE_COMPANY: 'SELECT_TITLE_COMPANY',
  PREPARE_CONTRACT: 'PREPARE_CONTRACT',
  SCHEDULE_FOLLOW_UP: 'SCHEDULE_FOLLOW_UP',
  MARK_LOW_EVIDENCE: 'MARK_LOW_EVIDENCE'
});

const READINESS_OUTCOMES = Object.freeze({
  OFFER_READY: 'OFFER_READY',
  CALL_READY_NUMBERS_LOCKED: 'CALL_READY_NUMBERS_LOCKED',
  OUTREACH_READY_NUMBERS_LOCKED: 'OUTREACH_READY_NUMBERS_LOCKED',
  RESEARCH_NEEDED: 'RESEARCH_NEEDED',
  DEAD_OR_LOW_EVIDENCE: 'DEAD_OR_LOW_EVIDENCE'
});

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function uniqueText(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(cleanText(value)).digest('hex').slice(0, 14)}`;
}

function readiness(opportunity) {
  return opportunity && opportunity.readiness && typeof opportunity.readiness === 'object'
    ? opportunity.readiness
    : {};
}

function evidence(opportunity) {
  return opportunity && opportunity.evidence && typeof opportunity.evidence === 'object'
    ? opportunity.evidence
    : {};
}

function hasContactProof(opportunity) {
  const contact = evidence(opportunity).contact_proof || {};
  return contact.verified === true && cleanText(contact.route_type) !== 'NONE';
}

function hasSourcePointer(opportunity) {
  const identity = opportunity.identity || {};
  const sourceProof = evidence(opportunity).source_proof || {};
  return uniqueText([].concat(identity.source_urls || []).concat(sourceProof.source_url)).length > 0;
}

function hasAddress(opportunity) {
  return !!cleanText(opportunity.identity && opportunity.identity.normalized_address);
}

function hasMotivationProof(opportunity) {
  const motivation = evidence(opportunity).motivation || {};
  return !!cleanText(motivation.exact_phrase || motivation.type);
}

function isLowEvidence(opportunity) {
  return !hasAddress(opportunity) &&
    !hasSourcePointer(opportunity) &&
    !hasMotivationProof(opportunity) &&
    !hasContactProof(opportunity);
}

function order(type, priority, owner, label, reason, details = {}) {
  const body = Object.assign({
    type,
    priority,
    status: 'OPEN',
    owner,
    reason,
    required_input: '',
    output_expected: '',
    blocked_by: [],
    unlocks: [],
    can_run_now: false,
    safe_to_auto_run: false,
    estimated_value_impact: 'medium',
    user_visible_label: label
  }, details);
  body.blocked_by = uniqueText(body.blocked_by);
  body.unlocks = uniqueText(body.unlocks);
  body.id = hashId('wo', [
    type,
    priority,
    owner,
    label,
    reason,
    body.required_input,
    body.output_expected,
    body.blocked_by.join('|')
  ].join('|'));
  return body;
}

function numbersLockedReason(state) {
  if (!state.comp_ready) return 'ARV is locked until 3 verified sold comps exist.';
  if (!state.repair_ready) return 'MAO is locked until repair evidence or explicit repair input exists.';
  if (!state.mao_ready) return 'Offer is locked until ARV and repair evidence support MAO.';
  if (!state.offer_ready) return 'Offer still needs operator review.';
  return '';
}

function sellerQuestionToUnlockNumbers(state) {
  if (!state.repair_ready) {
    return 'What repairs does the property need, and what would you estimate those repairs cost?';
  }
  if (!state.comp_ready) {
    return 'What nearby homes have sold recently that you think are most comparable?';
  }
  return 'What price would let you move forward if we can close on your timeline?';
}

function addIdentityOrders(orders, opportunity, state) {
  if (!state.identity_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.VERIFY_PROPERTY_IDENTITY,
      10,
      'Gabriel',
      'Verify full property address',
      'Complete identity is required before call, comps, offer, buyer, or title work.',
      {
        required_input: 'Complete street, city, state, and ZIP from a property-specific source or Gabriel input.',
        output_expected: 'Canonical normalized address and property key.',
        unlocks: ['source verification', 'contact verification', 'comp research'],
        can_run_now: true,
        estimated_value_impact: 'high'
      }
    ));
  }
  if (!state.source_ready || !state.motivation_ready || !state.current_status_ready) {
    const blockers = []
      .concat(!state.identity_ready ? ['complete property identity'] : [])
      .concat(!state.source_ready ? ['property-specific source proof'] : [])
      .concat(!state.motivation_ready ? ['verbatim motivation evidence'] : [])
      .concat(!state.current_status_ready ? ['visible current-status evidence'] : []);
    orders.push(order(
      WORK_ORDER_TYPES.VERIFY_MOTIVATION_SOURCE,
      20,
      hasSourcePointer(opportunity) ? 'system' : 'future_provider',
      'Verify source, motivation, and status',
      'Source and motivation must be proven before the deal deserves seller work.',
      {
        required_input: 'Property-specific source URL or source text.',
        output_expected: 'Source-backed motivation phrase and current status.',
        blocked_by: blockers,
        unlocks: ['contact acquisition', 'seller outreach'],
        can_run_now: hasSourcePointer(opportunity),
        safe_to_auto_run: false,
        estimated_value_impact: 'high'
      }
    ));
  }
}

function addContactOrders(orders, state) {
  if (!state.contact_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.FIND_CONTACT_ROUTE,
      30,
      'future_provider',
      'Find verified contact route',
      'Gabriel needs a source-backed phone, email, form, or reply route before outreach.',
      {
        required_input: 'Identity-ready property and source proof.',
        output_expected: 'Verified phone, email, form, or public reply route with provenance.',
        blocked_by: state.identity_ready ? [] : ['complete property identity'],
        unlocks: ['call seller', 'seller outreach'],
        can_run_now: state.identity_ready,
        safe_to_auto_run: false,
        estimated_value_impact: 'high'
      }
    ));
    return;
  }
  if (state.call_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.CALL_SELLER,
      40,
      'Gabriel',
      'Call seller',
      'Verified phone exists. Gabriel can call while numbers stay locked.',
      {
        required_input: 'Call-ready deal packet and verified phone evidence.',
        output_expected: 'Seller motivation, timeline, condition, and price notes.',
        unlocks: ['repair evidence', 'follow-up', 'draft offer inputs'],
        can_run_now: true,
        safe_to_auto_run: false,
        estimated_value_impact: 'very_high'
      }
    ));
  } else if (state.outreach_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.SEND_SELLER_OUTREACH,
      40,
      'Gabriel',
      'Send seller outreach',
      'Only email, form, or reply route is verified. Phone remains missing.',
      {
        required_input: 'Outreach-ready deal packet and source-backed route.',
        output_expected: 'Seller response or follow-up task.',
        unlocks: ['seller conversation', 'phone lookup'],
        can_run_now: true,
        safe_to_auto_run: false,
        estimated_value_impact: 'high'
      }
    ));
  }
}

function addNumberOrders(orders, state) {
  if (!state.comp_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.RUN_COMP_RESEARCH,
      50,
      'future_provider',
      'Research verified sold comps',
      'ARV is locked until 3 verified sold comps exist.',
      {
        required_input: 'Complete identity and property-specific source.',
        output_expected: 'At least 3 different verified sold comps, excluding subject property.',
        blocked_by: state.identity_ready ? [] : ['complete property identity'],
        unlocks: ['ARV'],
        can_run_now: state.identity_ready,
        safe_to_auto_run: false,
        estimated_value_impact: 'very_high'
      }
    ));
  }
  if (!state.repair_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.CAPTURE_REPAIR_EVIDENCE,
      60,
      state.contact_ready ? 'Gabriel' : 'future_provider',
      'Capture repair evidence',
      'MAO is locked until repair evidence or explicit repair input exists.',
      {
        required_input: 'Seller answers, photos, inspection notes, or explicit manual repair estimate.',
        output_expected: 'Repair evidence or manual repair estimate.',
        blocked_by: state.contact_ready ? [] : ['verified contact route'],
        unlocks: ['MAO', 'offer range'],
        can_run_now: state.contact_ready,
        safe_to_auto_run: false,
        estimated_value_impact: 'high'
      }
    ));
  }
  if (state.comp_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.CALCULATE_ARV,
      70,
      'system',
      'Calculate ARV',
      'Verified comps exist, so ARV can be calculated without inventing values.',
      {
        required_input: '3 verified sold comps.',
        output_expected: 'Evidence-backed ARV range.',
        unlocks: ['MAO'],
        can_run_now: true,
        safe_to_auto_run: true,
        estimated_value_impact: 'high'
      }
    ));
  }
  if (state.arv_ready && state.repair_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.CALCULATE_MAO,
      80,
      'system',
      'Calculate MAO',
      'ARV and repair evidence exist, so MAO can be calculated.',
      {
        required_input: 'Evidence-backed ARV and repair evidence.',
        output_expected: 'Draft MAO range.',
        unlocks: ['draft offer'],
        can_run_now: true,
        safe_to_auto_run: true,
        estimated_value_impact: 'very_high'
      }
    ));
  }
  if (state.mao_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.DRAFT_OFFER,
      90,
      'Gabriel',
      'Draft offer',
      'MAO exists. Gabriel can review strategy and decide what to offer.',
      {
        required_input: 'MAO, seller conversation context, and desired assignment spread.',
        output_expected: 'Operator-reviewed offer range and approach.',
        unlocks: ['buyer match', 'contract prep'],
        can_run_now: state.contact_ready,
        safe_to_auto_run: false,
        estimated_value_impact: 'very_high'
      }
    ));
  }
}

function addDispositionOrders(orders, state) {
  if (!state.offer_ready) return;
  if (!state.buyer_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.MATCH_BUYERS,
      100,
      'Gabriel',
      'Match buyers',
      'Offer-ready deals need a buyer path before disposition.',
      {
        required_input: 'Offer-ready deal packet and buyer criteria.',
        output_expected: 'Buyer match or buyer outreach list.',
        unlocks: ['assignment strategy'],
        can_run_now: true,
        safe_to_auto_run: false,
        estimated_value_impact: 'very_high'
      }
    ));
  }
  if (!state.title_ready) {
    orders.push(order(
      WORK_ORDER_TYPES.SELECT_TITLE_COMPANY,
      110,
      'Gabriel',
      'Select title company',
      'Title path is missing for contract and closing workflow.',
      {
        required_input: 'Market, seller situation, and preferred title partners.',
        output_expected: 'Selected title company or title contact.',
        unlocks: ['contract prep', 'closing workflow'],
        can_run_now: true,
        safe_to_auto_run: false,
        estimated_value_impact: 'high'
      }
    ));
  }
  orders.push(order(
    WORK_ORDER_TYPES.PREPARE_CONTRACT,
    120,
    'Gabriel',
    'Prepare contract packet',
    'Contract should wait until offer, buyer path, and title path are clear.',
    {
      required_input: 'Accepted offer strategy, buyer path, title company, and seller terms.',
      output_expected: 'Contract-ready packet.',
      blocked_by: []
        .concat(state.buyer_ready ? [] : ['buyer match'])
        .concat(state.title_ready ? [] : ['title company']),
      unlocks: ['seller signature', 'assignment'],
      can_run_now: state.buyer_ready && state.title_ready,
      safe_to_auto_run: false,
      estimated_value_impact: 'very_high'
    }
  ));
}

function addFollowUpOrder(orders, state) {
  if (!state.contact_ready || state.offer_ready) return;
  orders.push(order(
    WORK_ORDER_TYPES.SCHEDULE_FOLLOW_UP,
    130,
    'Gabriel',
    'Schedule follow-up',
    'Contact exists but numbers or offer are still locked.',
    {
      required_input: 'Seller contact route and missing evidence list.',
      output_expected: 'Follow-up reminder tied to missing numbers or seller answers.',
      unlocks: ['repair evidence', 'seller response'],
      can_run_now: true,
      safe_to_auto_run: false,
      estimated_value_impact: 'medium'
    }
  ));
}

function outcomeFrom(state, lowEvidence) {
  if (lowEvidence) return READINESS_OUTCOMES.DEAD_OR_LOW_EVIDENCE;
  if (!state.identity_ready || !state.source_ready || !state.motivation_ready || !state.current_status_ready) {
    return READINESS_OUTCOMES.RESEARCH_NEEDED;
  }
  if (state.offer_ready) return READINESS_OUTCOMES.OFFER_READY;
  if (state.call_ready && (!state.comp_ready || !state.repair_ready || !state.mao_ready || !state.offer_ready)) {
    return READINESS_OUTCOMES.CALL_READY_NUMBERS_LOCKED;
  }
  if (state.outreach_ready && (!state.comp_ready || !state.repair_ready || !state.mao_ready || !state.offer_ready)) {
    return READINESS_OUTCOMES.OUTREACH_READY_NUMBERS_LOCKED;
  }
  return READINESS_OUTCOMES.RESEARCH_NEEDED;
}

function buildOpportunityWorkOrders(opportunity) {
  opportunity = opportunity || {};
  const state = readiness(opportunity);
  const lowEvidence = isLowEvidence(opportunity);
  const orders = [];

  if (lowEvidence) {
    orders.push(order(
      WORK_ORDER_TYPES.MARK_LOW_EVIDENCE,
      5,
      'system',
      'Mark low evidence',
      'No address, source, motivation, or contact proof exists. This is not worth Gabriel time yet.',
      {
        required_input: 'New source proof or complete property identity.',
        output_expected: 'Dead or low-evidence disposition until stronger source appears.',
        unlocks: ['research only if new evidence appears'],
        can_run_now: true,
        safe_to_auto_run: false,
        estimated_value_impact: 'low'
      }
    ));
  } else {
    addIdentityOrders(orders, opportunity, state);
    addContactOrders(orders, state);
    addNumberOrders(orders, state);
    addDispositionOrders(orders, state);
    addFollowUpOrder(orders, state);
  }

  orders.sort((a, b) => a.priority - b.priority || a.type.localeCompare(b.type));
  const outcome = outcomeFrom(state, lowEvidence);
  const topThree = orders.slice(0, 3);
  const paidDataTypes = new Set([
    WORK_ORDER_TYPES.FIND_CONTACT_ROUTE,
    WORK_ORDER_TYPES.RUN_COMP_RESEARCH
  ]);
  const systemLater = orders.filter((item) => item.owner === 'system' || item.owner === 'future_provider');
  const canDoNow = orders.filter((item) => item.owner === 'Gabriel' && item.can_run_now === true);

  return {
    readiness_outcome: outcome,
    work_orders: orders,
    next_3_tasks: topThree,
    what_gabriel_can_do_now: canDoNow.map((item) => item.user_visible_label),
    what_system_can_do_later: systemLater.map((item) => item.user_visible_label),
    what_requires_paid_data: orders
      .filter((item) => paidDataTypes.has(item.type))
      .map((item) => item.user_visible_label),
    why_numbers_are_locked: numbersLockedReason(state),
    seller_question_to_unlock_numbers: sellerQuestionToUnlockNumbers(state),
    low_evidence_reasons: lowEvidence ? ['missing address', 'missing source', 'missing motivation', 'missing contact'] : [],
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  WORK_ORDER_TYPES,
  READINESS_OUTCOMES,
  buildOpportunityWorkOrders
};
