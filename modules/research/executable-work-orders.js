'use strict';

const callReadyDealPacket = require('./call-ready-deal-packet');
const canonicalOpportunityKernel = require('./canonical-opportunity-kernel');
const compResearchProvider = require('./comp-research-provider');
const opportunityExecutionSpine = require('./opportunity-execution-spine');
const propertyCandidate = require('./property-candidate');
const propertyIdentity = require('./property-identity');
const searchProviderWorker = require('./search-provider-worker');
const searchSnippetEvidence = require('./search-snippet-evidence');
const fsboContactAdapter = require('../sources/dallas-fsbo-contact-acquisition-adapter');
const craigslistAdapter = require('../sources/dallas-craigslist-owner-acquisition-adapter');

const EXECUTABLE_WORK_ORDER_CAPS = Object.freeze({
  max_items: 1,
  max_provider_calls: 4,
  max_page_fetches: 4,
  max_comp_candidates: 6,
  max_verified_sold_comps: 3,
  timeout_ms: 8000,
  retries: 0
});

const REPAIR_CLUE_RE = /\b(fixer|needs\s+tlc|fire\s+damage|foundation|full\s+rehab|as-?is|cosmetic|needs\s+work|repair(?:s)?\s+needed)\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function uniqueText(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function numberValue(value) {
  const number = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function marketFrom(value) {
  value = value && typeof value === 'object' ? value : {};
  return {
    city: cleanText(value.city) || 'Dallas',
    county: cleanText(value.county) || 'Dallas',
    state: cleanText(value.state) || 'TX'
  };
}

function subjectAddress(packet, item) {
  return propertyIdentity.canonicalAddress(cleanText(
    (packet && packet.property && packet.property.normalized_address) ||
    (item && (item.address || item.normalized_address)) ||
    ''
  ));
}

function streetProbe(address) {
  const parsed = propertyIdentity.parseAddress(cleanText(address));
  return cleanText(parsed.street)
    .toLowerCase()
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(drive)\b/g, 'dr')
    .replace(/\b(lane)\b/g, 'ln')
    .replace(/\b(court)\b/g, 'ct')
    .replace(/\b(place)\b/g, 'pl')
    .replace(/\b(boulevard)\b/g, 'blvd')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameCompleteAddress(left, right) {
  const a = propertyIdentity.canonicalAddress(left);
  const b = propertyIdentity.canonicalAddress(right);
  if (!propertyIdentity.isCompleteAddress(a) || !propertyIdentity.isCompleteAddress(b)) return false;
  return propertyIdentity.canonicalPropertyKey({ normalized_address: a }) ===
    propertyIdentity.canonicalPropertyKey({ normalized_address: b });
}

function resultAddress(card) {
  const explicit = propertyIdentity.canonicalAddress(cleanText(
    card && (card.display_address || card.address || card.possible_address || card.property_address)
  ));
  if (propertyIdentity.isCompleteAddress(explicit)) return explicit;
  const fromUrl = propertyIdentity.addressFromPropertyUrl(card && (card.source_url || card.url), card && (card.source_title || card.title));
  return fromUrl && fromUrl.complete ? fromUrl.full_address : '';
}

function sourceMatchesSubject(card, address) {
  const found = resultAddress(card);
  if (found) return sameCompleteAddress(found, address);
  const probe = streetProbe(address);
  if (!probe) return false;
  const text = cleanText([
    card && card.source_title,
    card && card.source_snippet,
    card && card.source_url,
    card && card.url
  ].join(' ')).toLowerCase().replace(/[-_]+/g, ' ');
  return text.includes(probe);
}

function firstPropertySourceCard(cards, address) {
  return (Array.isArray(cards) ? cards : []).find((card) => {
    const url = cleanText(card && (card.source_url || card.url));
    if (!isHttpUrl(url)) return false;
    const propertySpecific = card.property_specific_source === true ||
      card.search_result_property_specific === true ||
      searchSnippetEvidence.isPropertySpecificSearchUrl(url, card.source_title || card.title, card.source_snippet || card.snippet);
    return propertySpecific && sourceMatchesSubject(card, address);
  }) || null;
}

function sourceQueryFor(address, market) {
  const parsed = propertyIdentity.parseAddress(address);
  return cleanText([
    `"${address}"`,
    parsed.street ? `"${parsed.street}"` : '',
    market.city,
    market.state,
    'Zillow Realtor Redfin HAR Auction foreclosure active for sale as-is fixer'
  ].join(' '));
}

function compQueryFor(address, market) {
  const parsed = propertyIdentity.parseAddress(address);
  return cleanText([
    `"${parsed.street || address}"`,
    market.city,
    market.state,
    'sold price sold date nearby homes'
  ].join(' '));
}

async function runBoundedSearch(input, options) {
  options = options || {};
  const result = await searchProviderWorker.runSearchProvider(input, {
    env: options.env || process.env,
    fetchImpl: options.fetch_impl || options.fetchImpl,
    query: input.query,
    purpose: input.purpose,
    query_group: input.query_group,
    provider_family: input.provider_family,
    expected_url_pattern: input.expected_url_pattern,
    max_results: input.max_results,
    mock_results: input.mock_results
  });
  return result || {};
}

function sourceCandidateFromCard(card, address, market) {
  const sourceUrl = cleanText(card && (card.source_url || card.url));
  const title = cleanText(card && (card.source_title || card.title));
  const snippet = cleanText(card && (card.source_snippet || card.snippet));
  const phrase = cleanText(card && (card.exact_source_phrase || card.matched_source_phrase || card.exact_source_phrase_candidate));
  const status = cleanText(card && (card.listing_status || card.current_status || card.status_candidate_text));
  const statusVisible = card && (card.status_candidate_promoted === true || card.current_status_promoted === true || /\b(active|for sale|listed|new listing|price cut|price reduced)\b/i.test(status));
  return propertyCandidate.normalizePropertyCandidate({
    candidate_origin: 'executable_work_orders_preview',
    source_family: 'selected_property_source_search',
    source_name: 'Selected deal source verification',
    source_url: sourceUrl,
    source_title: title,
    source_snippet: snippet,
    source_classification: 'exact_property_record',
    source_type: 'public property source',
    source_proof_text: cleanText([title, snippet].join(' | ')),
    source_excerpt: cleanText([title, snippet].join(' | ')),
    normalized_address: address,
    motivation_type: phrase ? 'visible_source_phrase' : '',
    motivation_phrase: phrase,
    motivation_evidence_text: phrase,
    current_status: statusVisible ? status : '',
    status_evidence_text: status,
    status_verified_visible: statusVisible === true,
    missing_evidence: []
      .concat(!phrase ? ['verbatim source-backed motivation'] : [])
      .concat(!statusVisible ? ['visible current status evidence'] : [])
  }, market);
}

async function fetchAcceptedSourcePage(sourceUrl, options) {
  const fetchImpl = options.fetch_impl || options.fetchImpl;
  if (!fetchImpl) {
    return { status: 'fetch_unavailable', source_url: sourceUrl, contact_verified: false };
  }
  if (craigslistAdapter.isCraigslistOwnerPostUrl(sourceUrl)) {
    const page = await craigslistAdapter.fetchCraigslistPage(sourceUrl, {
      fetch_impl: fetchImpl,
      kind: 'post',
      timeout_ms: EXECUTABLE_WORK_ORDER_CAPS.timeout_ms
    });
    const candidate = craigslistAdapter.candidateFromCraigslistPost({
      source_url: cleanText(page.final_source_url || sourceUrl),
      html: page.html,
      title: page.title,
      body: page.body || page.visible_text
    }, {
      acquisition_run_id: 'executable_work_orders_preview'
    });
    return Object.assign({}, page, {
      page_title: page.title,
      page_visible_text: cleanText(page.body || page.visible_text),
      candidate
    });
  }
  if (fsboContactAdapter.isAllowedContactSourceUrl(sourceUrl)) {
    return fsboContactAdapter.fetchContactPageEvidence(sourceUrl, {
      fetch_impl: fetchImpl,
      timeout_ms: EXECUTABLE_WORK_ORDER_CAPS.timeout_ms
    });
  }
  return { status: 'unsupported_source_host', source_url: sourceUrl, contact_verified: false };
}

function mergeCandidateEvidence(base, extra) {
  base = base || {};
  extra = extra || {};
  return Object.assign({}, base, Object.keys(extra).reduce((out, key) => {
    const value = extra[key];
    if (Array.isArray(value)) out[key] = value.length ? value : base[key];
    else if (value !== undefined && value !== null && cleanText(value) !== '') out[key] = value;
    return out;
  }, {}));
}

function contactFieldsFromPage(page, sourceUrl) {
  page = page || {};
  if (page.candidate) {
    return {
      contact_route: page.candidate.contact_route,
      contact_role: page.candidate.contact_role,
      contact_phone: page.candidate.contact_phone,
      contact_email: page.candidate.contact_email,
      contact_source_url: page.candidate.contact_source_url || sourceUrl,
      contact_evidence_text: page.candidate.contact_evidence_text,
      contact_verification_status: page.candidate.contact_verification_status,
      contact_verified: page.candidate.contact_verified === true
    };
  }
  return {
    contact_route: page.contact_route,
    contact_role: page.contact_role,
    contact_phone: page.contact_phone,
    contact_email: page.contact_email,
    contact_source_url: page.contact_source_url || sourceUrl,
    contact_evidence_text: page.contact_evidence_text,
    contact_verification_status: page.contact_verification_status,
    contact_verified: page.contact_verified === true
  };
}

function repairCluesFromText(text, sourceUrl) {
  const source = cleanText(text);
  if (!source) return [];
  const clues = [];
  let match = null;
  const re = new RegExp(REPAIR_CLUE_RE.source, 'ig');
  while ((match = re.exec(source)) !== null && clues.length < 5) {
    const start = Math.max(0, match.index - 80);
    const end = Math.min(source.length, match.index + match[0].length + 80);
    clues.push({
      clue: cleanText(match[0]).toLowerCase(),
      evidence_text: source.slice(start, end).trim(),
      source_url: sourceUrl,
      amount: null
    });
  }
  return clues;
}

function priceFromText(text) {
  const match = cleanText(text).match(/\$\s*([1-9]\d{1,2}(?:,\d{3})+)/);
  return match ? numberValue(match[1]) : 0;
}

function dateFromText(text) {
  const source = cleanText(text);
  const iso = source.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const slash = source.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/);
  if (slash) return `${slash[3]}-${String(slash[1]).padStart(2, '0')}-${String(slash[2]).padStart(2, '0')}`;
  const named = source.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-3]?\d),?\s+(20\d{2})\b/i);
  if (!named) return '';
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = months.findIndex((prefix) => named[1].toLowerCase().startsWith(prefix)) + 1;
  return `${named[3]}-${String(month).padStart(2, '0')}-${String(named[2]).padStart(2, '0')}`;
}

function compCandidateFromResult(result, subjectAddress) {
  result = result || {};
  const sourceUrl = cleanText(result.url || result.source_url);
  const text = cleanText([result.title, result.source_title, result.snippet, result.source_snippet].join(' '));
  const address = propertyIdentity.canonicalAddress(cleanText(result.possible_address || result.display_address || result.address || result.property_address)) ||
    resultAddress({ source_url: sourceUrl, source_title: result.title || result.source_title });
  const soldPrice = numberValue(result.sold_price || result.price) || priceFromText(text);
  const soldDate = cleanText(result.sold_date || result.sale_date || result.closed_date) || dateFromText(text);
  const statusText = cleanText(result.sold_status || result.status || text);
  if (!address || sameCompleteAddress(address, subjectAddress)) return null;
  return {
    comp_address: address,
    sold_status: /\b(sold|closed)\b/i.test(statusText) ? 'sold' : cleanText(result.sold_status || result.status),
    sold_price: soldPrice,
    sold_date: soldDate,
    source_url: sourceUrl,
    source_title: cleanText(result.title || result.source_title),
    source_type: 'public sold property page',
    distance_miles: result.distance_miles || result.distance || null,
    why_included: 'Public sold-comp search result.'
  };
}

function packetToCandidateInput(packet, item) {
  packet = packet || {};
  item = item || {};
  return {
    candidate_origin: 'executable_work_orders_preview',
    source_family: 'selected_property',
    source_name: 'Selected property input',
    normalized_address: packet.property && packet.property.normalized_address,
    address_evidence_text: packet.property && packet.property.address_evidence_text,
    address_evidence_source: packet.property && packet.property.address_evidence_source,
    source_url: packet.source_evidence && packet.source_evidence.source_url || packet.property && packet.property.source_url,
    source_classification: packet.property && packet.property.source_classification,
    source_type: packet.source_evidence && packet.source_evidence.source_type,
    source_proof_text: packet.source_evidence && packet.source_evidence.evidence_text,
    motivation_type: packet.motivation_evidence && packet.motivation_evidence.type,
    motivation_phrase: packet.motivation_evidence && packet.motivation_evidence.exact_phrase,
    motivation_evidence_text: packet.motivation_evidence && packet.motivation_evidence.exact_phrase,
    current_status: packet.current_status && packet.current_status.value,
    status_evidence_text: packet.current_status && packet.current_status.evidence_text,
    status_verified_visible: packet.current_status && packet.current_status.verified_visible_source === true,
    contact_route: packet.contact && packet.contact.route_label,
    contact_phone: packet.contact && packet.contact.phone,
    contact_email: packet.contact && packet.contact.email,
    contact_source_url: packet.contact && packet.contact.source_url,
    contact_evidence_text: packet.contact && packet.contact.evidence_text,
    contact_verification_status: packet.contact && packet.contact.verification_status,
    contact_verified: packet.contact && packet.contact.verified === true,
    verified_sold_comps: packet.comps && packet.comps.verified_sold_comps || item.verified_sold_comps || [],
    subject_sale_evidence: packet.comps && packet.comps.subject_sale_evidence || item.subject_sale_evidence || [],
    candidate_sold_comps: packet.comps && packet.comps.candidate_sold_comps || item.candidate_sold_comps || [],
    market_support: packet.comps && packet.comps.market_support || item.market_support || [],
    manual_repair_estimate: item.manual_repair_estimate,
    desired_assignment_fee: item.desired_assignment_fee
  };
}

function buildPacket(candidateInput, item, input) {
  return callReadyDealPacket.buildCallReadyDealPacket(Object.assign({}, candidateInput, {
    verified_sold_comps: candidateInput.verified_sold_comps || [],
    subject_sale_evidence: candidateInput.subject_sale_evidence || [],
    candidate_sold_comps: candidateInput.candidate_sold_comps || [],
    market_support: candidateInput.market_support || [],
    repair_estimate: numberValue(candidateInput.repair_estimate || item.manual_repair_estimate || input.manual_repair_estimate),
    manual_repair_estimate: numberValue(candidateInput.manual_repair_estimate || item.manual_repair_estimate || input.manual_repair_estimate),
    desired_assignment_fee: numberValue(candidateInput.desired_assignment_fee || item.desired_assignment_fee || input.desired_assignment_fee)
  }));
}

function canonicalFor(packet, market) {
  const executionState = opportunityExecutionSpine.buildOpportunityExecutionState(packet);
  return canonicalOpportunityKernel.buildCanonicalOpportunity({
    packet,
    execution_state: executionState
  }, { market });
}

async function executeOpportunityWorkOrders(context = {}, options = {}) {
  const input = context.input || {};
  const item = context.item || {};
  const market = marketFrom(context.market || input.market);
  const beforePacket = context.packet || {};
  const beforeOpportunity = context.canonical_opportunity || canonicalFor(beforePacket, market);
  const address = subjectAddress(beforePacket, item);
  const providerCalls = [];
  const pageChecks = [];
  const executed = [];
  const evidenceFound = [];
  const contactsFound = [];
  const repairEvidence = [];
  const errors = [];
  let candidateInput = packetToCandidateInput(beforePacket, item);

  if (!propertyIdentity.isCompleteAddress(address)) {
    return {
      executed_work_orders: [],
      evidence_found: [],
      comps_found: [],
      contacts_found: [],
      source_pages_checked: [],
      canonical_opportunity_before_execution: beforeOpportunity,
      canonical_opportunity_after_execution: beforeOpportunity,
      packet_after_execution: beforePacket,
      updated_work_orders: beforeOpportunity.work_orders || [],
      remaining_locks: beforeOpportunity.locks || [],
      what_gabriel_can_do_now: beforeOpportunity.operator_view && beforeOpportunity.operator_view.what_gabriel_can_do_now || [],
      what_system_still_needs: ['complete property identity'],
      what_requires_paid_data: beforeOpportunity.operator_view && beforeOpportunity.operator_view.what_requires_paid_data || [],
      diagnostics: {
        status: 'blocked_needs_complete_address',
        provider_call_count: 0,
        page_fetch_count: 0,
        preview_only: true,
        should_ingest: false,
        no_global_mutation: true
      },
      errors
    };
  }

  const sourceSearch = await runBoundedSearch({
    query: sourceQueryFor(address, market),
    purpose: 'executable_work_order_source_verification',
    query_group: 'selected_property_source_verification',
    provider_family: 'property_source',
    expected_url_pattern: 'property-specific public source URL',
    max_results: 4,
    mock_results: input.source_mock_results || options.source_mock_results,
    city: market.city,
    county: market.county,
    state: market.state,
    market: `${market.city}, ${market.state}`
  }, options);
  providerCalls.push({
    type: 'VERIFY_PROPERTY_SOURCE',
    status: cleanText(sourceSearch.status),
    query: sourceSearch.query,
    result_count: Number(sourceSearch.result_count || 0) || 0,
    query_groups_used: sourceSearch.query_groups_used || []
  });
  executed.push({
    type: 'VERIFY_PROPERTY_SOURCE',
    status: sourceSearch.status === 'provider_available' ? 'completed' : 'incomplete',
    provider_status: cleanText(sourceSearch.status),
    evidence_added: false
  });

  const sourceCard = firstPropertySourceCard(sourceSearch.cards, address);
  if (sourceCard) {
    const sourceCandidate = sourceCandidateFromCard(sourceCard, address, market);
    candidateInput = mergeCandidateEvidence(candidateInput, sourceCandidate);
    evidenceFound.push({
      type: 'property_source',
      source_url: sourceCandidate.source_url,
      motivation_phrase: sourceCandidate.motivation_phrase,
      current_status: sourceCandidate.current_status,
      evidence_text: sourceCandidate.source_proof_text
    });
    executed[executed.length - 1].evidence_added = true;

    if (pageChecks.length < EXECUTABLE_WORK_ORDER_CAPS.max_page_fetches) {
      const page = await fetchAcceptedSourcePage(sourceCandidate.source_url, options).catch((error) => {
        errors.push(cleanText(error && error.message) || 'source page fetch failed');
        return { status: 'fetch_failed', source_url: sourceCandidate.source_url };
      });
      pageChecks.push({
        source_url: sourceCandidate.source_url,
        status: cleanText(page.status),
        http_status: page.http_status || null
      });
      const pageText = cleanText([
        page.page_title,
        page.page_description,
        page.page_visible_text,
        page.body,
        page.visible_text
      ].join(' '));
      const clues = repairCluesFromText(pageText || sourceCandidate.source_proof_text, sourceCandidate.source_url);
      repairEvidence.push(...clues);
      if (page.candidate) candidateInput = mergeCandidateEvidence(candidateInput, page.candidate);
      const contact = contactFieldsFromPage(page, sourceCandidate.source_url);
      if (contact.contact_verified === true && (contact.contact_phone || contact.contact_email || /reply|form/i.test(contact.contact_route))) {
        candidateInput = mergeCandidateEvidence(candidateInput, contact);
        contactsFound.push({
          route: contact.contact_route,
          phone: contact.contact_phone || '',
          email: contact.contact_email || '',
          source_url: contact.contact_source_url,
          evidence_text: contact.contact_evidence_text
        });
      }
      if (clues.length) {
        evidenceFound.push({
          type: 'repair_evidence',
          source_url: sourceCandidate.source_url,
          clues
        });
      }
    }
  }

  executed.push({
    type: 'FIND_CONTACT_ROUTE',
    status: contactsFound.length ? 'completed' : 'incomplete',
    evidence_added: contactsFound.length > 0,
    next_action: contactsFound.length ? '' : 'Paid skip trace or another public contact source required.'
  });
  executed.push({
    type: 'CAPTURE_REPAIR_EVIDENCE',
    status: repairEvidence.length ? 'completed_no_amount' : 'incomplete',
    evidence_added: repairEvidence.length > 0,
    next_action: repairEvidence.length ? 'Repair clues captured. MAO still needs dollar repair estimate.' : 'Ask seller for repair scope and cost.'
  });

  const compSearch = await runBoundedSearch({
    query: compQueryFor(address, market),
    purpose: 'executable_work_order_comp_research',
    query_group: 'selected_property_sold_comp_search',
    provider_family: 'public_sold_comps',
    expected_url_pattern: 'property-specific sold comp source URL',
    max_results: EXECUTABLE_WORK_ORDER_CAPS.max_comp_candidates,
    mock_results: input.comp_mock_results || options.comp_mock_results,
    city: market.city,
    county: market.county,
    state: market.state,
    market: `${market.city}, ${market.state}`
  }, options);
  providerCalls.push({
    type: 'RUN_COMP_RESEARCH',
    status: cleanText(compSearch.status),
    query: compSearch.query,
    result_count: Number(compSearch.result_count || 0) || 0,
    query_groups_used: compSearch.query_groups_used || []
  });
  const compRows = (Array.isArray(compSearch.results) ? compSearch.results : [])
    .map((result) => compCandidateFromResult(result, address))
    .filter(Boolean)
    .slice(0, EXECUTABLE_WORK_ORDER_CAPS.max_comp_candidates);
  const compState = compResearchProvider.canonicalizeCompResearchState({
    normalized_address: address,
    source_url: candidateInput.source_url,
    repair_estimate: numberValue(item.manual_repair_estimate || input.manual_repair_estimate)
  }, {
    candidates: compRows
  });
  const verifiedComps = (compState.verified_sold_comps || []).slice(0, EXECUTABLE_WORK_ORDER_CAPS.max_verified_sold_comps);
  if (verifiedComps.length) {
    candidateInput.verified_sold_comps = verifiedComps;
    candidateInput.candidate_sold_comps = compState.candidate_sold_comps || [];
    candidateInput.market_support = compState.market_support || [];
  }
  executed.push({
    type: 'RUN_COMP_RESEARCH',
    status: verifiedComps.length >= 3 ? 'completed' : 'incomplete',
    provider_status: cleanText(compSearch.status),
    evidence_added: verifiedComps.length > 0,
    verified_sold_comp_count: verifiedComps.length,
    missing: verifiedComps.length >= 3 ? [] : ['3 verified sold comps']
  });

  const afterPacket = buildPacket(candidateInput, item, input);
  const afterOpportunity = canonicalFor(afterPacket, market);
  return {
    executed_work_orders: executed,
    evidence_found: evidenceFound,
    comps_found: {
      verified_sold_comps: verifiedComps,
      candidate_sold_comps: compState.candidate_sold_comps || [],
      market_support: compState.market_support || [],
      verified_count: verifiedComps.length,
      provider_status: cleanText(compSearch.status)
    },
    contacts_found: contactsFound,
    source_pages_checked: pageChecks,
    canonical_opportunity_before_execution: beforeOpportunity,
    canonical_opportunity_after_execution: afterOpportunity,
    packet_after_execution: afterPacket,
    updated_work_orders: afterOpportunity.work_orders || [],
    remaining_locks: afterOpportunity.locks || [],
    what_gabriel_can_do_now: afterOpportunity.operator_view && afterOpportunity.operator_view.what_gabriel_can_do_now || [],
    what_system_still_needs: afterOpportunity.operator_view && afterOpportunity.operator_view.what_is_missing || [],
    what_requires_paid_data: afterOpportunity.operator_view && afterOpportunity.operator_view.what_requires_paid_data || [],
    diagnostics: {
      status: 'completed_preview',
      provider_calls: providerCalls,
      provider_call_count: providerCalls.length,
      page_fetch_count: pageChecks.length,
      caps: EXECUTABLE_WORK_ORDER_CAPS,
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true,
      legacy_comp_agent_invoked: false,
      legacy_skip_trace_agent_invoked: false
    },
    errors
  };
}

module.exports = {
  EXECUTABLE_WORK_ORDER_CAPS,
  executeOpportunityWorkOrders,
  repairCluesFromText,
  compCandidateFromResult
};
