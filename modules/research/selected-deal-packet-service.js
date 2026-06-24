'use strict';

const callReadyDealPacket = require('./call-ready-deal-packet');
const canonicalOpportunityKernel = require('./canonical-opportunity-kernel');
const executableWorkOrders = require('./executable-work-orders');
const opportunityExecutionSpine = require('./opportunity-execution-spine');
const propertyCandidate = require('./property-candidate');
const propertyIdentity = require('./property-identity');
const sourceEvidenceAdapter = require('./source-evidence-adapter');
const craigslistAdapter = require('../sources/dallas-craigslist-owner-acquisition-adapter');
const fsboContactAdapter = require('../sources/dallas-fsbo-contact-acquisition-adapter');

const SELECTED_DEAL_PACKET_CAPS = Object.freeze({
  max_items: 3,
  max_page_fetches: 4,
  max_page_bytes: 512 * 1024,
  timeout_ms: 8000,
  retries: 0
});

class SelectedDealPacketInputError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SelectedDealPacketInputError';
    this.code = code || 'invalid_selected_deal_packet_input';
    this.status_code = 400;
  }
}

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function numberValue(value) {
  const number = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function uniqueText(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function marketFrom(input) {
  const market = input && input.market && typeof input.market === 'object' ? input.market : {};
  return {
    city: cleanText(market.city) || 'Dallas',
    county: cleanText(market.county) || 'Dallas',
    state: cleanText(market.state) || 'TX'
  };
}

function selectedItems(input) {
  const items = Array.isArray(input && input.items) ? input.items : [];
  if (!items.length) {
    throw new SelectedDealPacketInputError('At least one selected property URL or address is required.', 'items_required');
  }
  if (items.length > SELECTED_DEAL_PACKET_CAPS.max_items) {
    throw new SelectedDealPacketInputError(`Maximum ${SELECTED_DEAL_PACKET_CAPS.max_items} selected properties allowed.`, 'max_items_exceeded');
  }
  return items.map((item) => item && typeof item === 'object' ? item : {});
}

function shouldExecuteWorkOrders(input, options, itemCount) {
  if (input && input.execute_work_orders === false) return false;
  if (options && options.execute_work_orders === false) return false;
  if (input && input.execute_work_orders === true) return true;
  if (options && options.execute_work_orders === true) return true;
  return itemCount === 1;
}

function completeAddress(value) {
  const address = propertyIdentity.canonicalAddress(cleanText(value));
  return propertyIdentity.isCompleteAddress(address) ? address : '';
}

function addressEvidenceFromPage(page, sourceUrl) {
  page = page || {};
  const pageAddress = craigslistAdapter.extractCompleteAddress(
    page.page_html,
    page.page_title,
    page.page_visible_text
  );
  if (propertyIdentity.isCompleteAddress(pageAddress && pageAddress.address)) {
    return {
      address: propertyIdentity.canonicalAddress(pageAddress.address),
      evidence_text: cleanText(pageAddress.evidence || pageAddress.address),
      evidence_source: cleanText(pageAddress.basis) || 'visible_page_evidence'
    };
  }
  const urlAddress = propertyIdentity.addressFromPropertyUrl(sourceUrl, page.page_title);
  if (urlAddress.complete) {
    return {
      address: urlAddress.full_address,
      evidence_text: sourceUrl,
      evidence_source: 'property_url'
    };
  }
  return { address: '', evidence_text: '', evidence_source: '' };
}

function addressEvidenceForItem(item, page, sourceUrl) {
  const supplied = completeAddress(item.address || item.normalized_address);
  const pageEvidence = addressEvidenceFromPage(page, sourceUrl);
  if (supplied && pageEvidence.address) {
    const suppliedKey = propertyIdentity.canonicalPropertyKey({ normalized_address: supplied });
    const pageKey = propertyIdentity.canonicalPropertyKey({ normalized_address: pageEvidence.address });
    if (suppliedKey && pageKey && suppliedKey !== pageKey) {
      return {
        address: '',
        evidence_text: '',
        evidence_source: '',
        mismatch: true,
        supplied_address: supplied,
        source_address: pageEvidence.address
      };
    }
  }
  if (supplied) {
    return {
      address: supplied,
      evidence_text: supplied,
      evidence_source: 'supplied_complete_address',
      mismatch: false
    };
  }
  return Object.assign({ mismatch: false }, pageEvidence);
}

function exactPropertyUrl(value) {
  const sourceUrl = cleanText(value);
  return sourceUrl && sourceEvidenceAdapter.classifySourceUrl(sourceUrl) === 'exact_property_record'
    ? sourceUrl
    : '';
}

function pageFetchKind(sourceUrl) {
  if (craigslistAdapter.isCraigslistOwnerPostUrl(sourceUrl)) return 'craigslist';
  if (fsboContactAdapter.isAllowedContactSourceUrl(sourceUrl)) return 'public_listing';
  return '';
}

async function fetchSelectedPage(sourceUrl, options) {
  const kind = pageFetchKind(sourceUrl);
  if (kind === 'craigslist') {
    const result = await craigslistAdapter.fetchCraigslistPage(sourceUrl, {
      fetch_impl: options.fetch_impl,
      kind: 'post',
      timeout_ms: SELECTED_DEAL_PACKET_CAPS.timeout_ms
    });
    return {
      kind,
      status: cleanText(result.status),
      source_url: cleanText(result.final_source_url || result.source_url || sourceUrl),
      http_status: Number(result.http_status || 0) || 0,
      page_title: cleanText(result.title),
      page_visible_text: cleanText(result.body || result.visible_text),
      page_html: String(result.html || ''),
      raw: result
    };
  }
  if (kind === 'public_listing') {
    const result = await fsboContactAdapter.fetchContactPageEvidence(sourceUrl, {
      fetch_impl: options.fetch_impl,
      timeout_ms: SELECTED_DEAL_PACKET_CAPS.timeout_ms
    });
    return {
      kind,
      status: cleanText(result.status),
      source_url: cleanText(result.final_source_url || result.source_url || sourceUrl),
      http_status: Number(result.http_status || 0) || 0,
      page_title: cleanText(result.page_title),
      page_description: cleanText(result.page_description),
      page_visible_text: cleanText(result.page_visible_text),
      page_html: String(result.page_html || ''),
      raw: result
    };
  }
  return {
    kind: '',
    status: 'unsupported_fetch_host',
    source_url: sourceUrl,
    http_status: 0,
    page_title: '',
    page_description: '',
    page_visible_text: '',
    page_html: '',
    raw: {}
  };
}

function candidateFromAddressOnly(item, market) {
  const address = cleanText(item.address || item.normalized_address);
  return propertyCandidate.normalizePropertyCandidate({
    candidate_origin: 'selected_deal_packet_preview',
    source_family: 'selected_property',
    source_name: 'Selected property input',
    normalized_address: address,
    source_url: '',
    source_classification: 'missing_source_url',
    motivation_type: '',
    motivation_phrase: '',
    motivation_evidence_text: '',
    current_status: '',
    status_evidence_text: '',
    contact_route: 'Manual Lookup Needed',
    missing_evidence: [
      'property-specific source URL',
      'verbatim source-backed motivation',
      'visible current status evidence',
      'verified public contact route'
    ]
  }, market);
}

function candidateFromFetchedPage(item, page, addressEvidence, market) {
  const sourceUrl = cleanText(page.source_url || item.url);
  if (page.kind === 'craigslist') {
    const candidate = craigslistAdapter.candidateFromCraigslistPost({
      source_url: sourceUrl,
      html: page.page_html,
      title: page.page_title,
      body: page.page_visible_text
    }, {
      acquisition_run_id: 'selected_deal_packet_preview',
      city: market.city,
      state: market.state
    });
    const candidateAddress = completeAddress(candidate.normalized_address);
    return propertyCandidate.normalizePropertyCandidate(Object.assign({}, candidate, {
      normalized_address: candidateAddress || addressEvidence.address,
      address_evidence_text: candidateAddress
        ? cleanText(candidate.source_proof_text).match(/Address:\s*([^|]+)/i)?.[1] || candidateAddress
        : addressEvidence.evidence_text,
      address_evidence_source: candidateAddress
        ? 'craigslist_visible_page_evidence'
        : addressEvidence.evidence_source
    }), market);
  }
  return fsboContactAdapter.candidateFromSearchCard({
    canonical_source_url: sourceUrl,
    source_url: sourceUrl,
    source_title: page.page_title,
    source_snippet: cleanText([page.page_description, page.page_visible_text].filter(Boolean).join(' ')),
    display_address: addressEvidence.address,
    address: addressEvidence.address,
    retrieved_at: new Date().toISOString()
  }, page.raw, {
    acquisition_run_id: 'selected_deal_packet_preview',
    city: market.city,
    state: market.state
  });
}

function packetInputFor(candidate, item, input) {
  const repairEstimate = numberValue(item.manual_repair_estimate || input.manual_repair_estimate);
  const assignmentFee = numberValue(item.desired_assignment_fee || input.desired_assignment_fee);
  return Object.assign({}, candidate, {
    address_evidence_text: cleanText(candidate.address_evidence_text),
    address_evidence_source: cleanText(candidate.address_evidence_source),
    verified_sold_comps: Array.isArray(item.verified_sold_comps) ? item.verified_sold_comps : [],
    candidate_sold_comps: Array.isArray(item.candidate_sold_comps) ? item.candidate_sold_comps : [],
    market_support: Array.isArray(item.market_support) ? item.market_support : [],
    manual_repair_estimate: repairEstimate,
    desired_assignment_fee: assignmentFee
  });
}

function packetWithOperatorInputs(packet, item, input) {
  const repairEstimate = numberValue(item.manual_repair_estimate || input.manual_repair_estimate);
  const assignmentFee = numberValue(item.desired_assignment_fee || input.desired_assignment_fee);
  return Object.assign({}, packet, {
    operator_inputs: {
      manual_repair_estimate: repairEstimate || null,
      desired_assignment_fee: assignmentFee || null
    },
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  });
}

async function runSelectedDealPacketPreview(input = {}, options = {}) {
  const items = selectedItems(input);
  const market = marketFrom(input);
  const executeWorkOrders = shouldExecuteWorkOrders(input, options, items.length);
  if (executeWorkOrders && items.length > executableWorkOrders.EXECUTABLE_WORK_ORDER_CAPS.max_items) {
    throw new SelectedDealPacketInputError(
      `Executable work orders V1 supports ${executableWorkOrders.EXECUTABLE_WORK_ORDER_CAPS.max_items} selected property per preview.`,
      'max_executable_items_exceeded'
    );
  }
  const fetchImpl = options.fetch_impl || options.fetchImpl || global.fetch;
  const packets = [];
  const opportunities = [];
  const canonicalOpportunities = [];
  const canonicalOpportunitiesBeforeExecution = [];
  const executableResults = [];
  const itemResults = [];
  const rejectedItems = [];
  let pageFetches = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const rawUrl = cleanText(item.url || item.source_url);
    const sourceUrl = exactPropertyUrl(rawUrl);
    const suppliedAddress = cleanText(item.address || item.normalized_address);

    if (rawUrl && !sourceUrl) {
      rejectedItems.push({
        index,
        url: rawUrl,
        reason: 'generic_or_non_property_source'
      });
      continue;
    }
    if (!sourceUrl && !suppliedAddress) {
      rejectedItems.push({
        index,
        url: '',
        reason: 'property_url_or_address_required'
      });
      continue;
    }

    let candidate;
    let page = {
      kind: '',
      status: sourceUrl ? 'not_fetched' : 'address_only',
      source_url: sourceUrl,
      http_status: 0
    };
    let addressEvidence = {
      address: completeAddress(suppliedAddress),
      evidence_text: completeAddress(suppliedAddress),
      evidence_source: completeAddress(suppliedAddress) ? 'supplied_complete_address' : '',
      mismatch: false
    };

    if (sourceUrl && pageFetches < SELECTED_DEAL_PACKET_CAPS.max_page_fetches) {
      pageFetches += 1;
      page = await fetchSelectedPage(sourceUrl, { fetch_impl: fetchImpl });
      addressEvidence = addressEvidenceForItem(item, page, sourceUrl);
      if (addressEvidence.mismatch) {
        rejectedItems.push({
          index,
          url: sourceUrl,
          reason: 'supplied_address_source_mismatch',
          supplied_address: addressEvidence.supplied_address,
          source_address: addressEvidence.source_address
        });
        continue;
      }
      candidate = candidateFromFetchedPage(item, page, addressEvidence, market);
      const suppliedCompleteAddress = completeAddress(suppliedAddress);
      const fetchedCompleteAddress = completeAddress(candidate.normalized_address);
      if (suppliedCompleteAddress && fetchedCompleteAddress) {
        const suppliedKey = propertyIdentity.canonicalPropertyKey({ normalized_address: suppliedCompleteAddress });
        const fetchedKey = propertyIdentity.canonicalPropertyKey({ normalized_address: fetchedCompleteAddress });
        if (suppliedKey && fetchedKey && suppliedKey !== fetchedKey) {
          rejectedItems.push({
            index,
            url: sourceUrl,
            reason: 'supplied_address_source_mismatch',
            supplied_address: suppliedCompleteAddress,
            source_address: fetchedCompleteAddress
          });
          continue;
        }
      }
      if (!addressEvidence.address && fetchedCompleteAddress) {
        addressEvidence = {
          address: fetchedCompleteAddress,
          evidence_text: cleanText(candidate.address_evidence_text || fetchedCompleteAddress),
          evidence_source: cleanText(candidate.address_evidence_source || 'visible_page_evidence'),
          mismatch: false
        };
      }
    } else {
      candidate = candidateFromAddressOnly(item, market);
    }

    candidate = Object.assign({}, candidate, {
      normalized_address: addressEvidence.address || candidate.normalized_address,
      address_evidence_text: addressEvidence.evidence_text,
      address_evidence_source: addressEvidence.evidence_source
    });
    let packet = packetWithOperatorInputs(
      callReadyDealPacket.buildCallReadyDealPacket(packetInputFor(candidate, item, input)),
      item,
      input
    );
    let opportunity = opportunityExecutionSpine.buildOpportunityExecutionState(packet);
    let canonicalOpportunity = canonicalOpportunityKernel.buildCanonicalOpportunity({
      packet,
      execution_state: opportunity
    }, { market });
    let executionResult = null;
    if (executeWorkOrders) {
      executionResult = await executableWorkOrders.executeOpportunityWorkOrders({
        input,
        item,
        market,
        packet,
        canonical_opportunity: canonicalOpportunity
      }, {
        env: options.env || process.env,
        fetch_impl: fetchImpl,
        fetchImpl,
        source_mock_results: options.source_mock_results,
        comp_mock_results: options.comp_mock_results
      });
      canonicalOpportunitiesBeforeExecution.push(executionResult.canonical_opportunity_before_execution);
      packet = packetWithOperatorInputs(executionResult.packet_after_execution || packet, item, input);
      opportunity = opportunityExecutionSpine.buildOpportunityExecutionState(packet);
      canonicalOpportunity = executionResult.canonical_opportunity_after_execution || canonicalOpportunityKernel.buildCanonicalOpportunity({
        packet,
        execution_state: opportunity
      }, { market });
      executableResults.push(executionResult);
    }
    packets.push(packet);
    opportunities.push(opportunity);
    canonicalOpportunities.push(canonicalOpportunity);
    itemResults.push({
      index,
      source_url: sourceUrl,
      fetch_status: page.status,
      http_status: page.http_status,
      address_evidence_source: addressEvidence.evidence_source,
      normalized_address: packet.property.normalized_address,
      packet_id: packet.packet_id,
      packet_status: packet.packet_status,
      opportunity_id: opportunity.opportunity_id,
      opportunity_stage: opportunity.stage,
      canonical_opportunity_id: canonicalOpportunity.opportunity_id,
      canonical_stage: canonicalOpportunity.money_path.current_stage,
      canonical_next_action: canonicalOpportunity.money_path.next_best_action,
      executable_work_orders_ran: !!executionResult,
      next_action: opportunity.execution.next_action,
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    });
  }

  return {
    ok: true,
    market,
    caps: SELECTED_DEAL_PACKET_CAPS,
    items_received: items.length,
    page_fetches: pageFetches,
    packet_count: packets.length,
    packets,
    opportunity_count: opportunities.length,
    opportunities,
    canonical_opportunities_before_execution: canonicalOpportunitiesBeforeExecution,
    canonical_opportunity_count: canonicalOpportunities.length,
    canonical_opportunities: canonicalOpportunities,
    executed_work_orders: executableResults.flatMap((result) => result.executed_work_orders || []),
    evidence_found: executableResults.flatMap((result) => result.evidence_found || []),
    comps_found: executableResults.map((result) => result.comps_found).filter(Boolean),
    contacts_found: executableResults.flatMap((result) => result.contacts_found || []),
    source_pages_checked: executableResults.flatMap((result) => result.source_pages_checked || []),
    canonical_opportunity_before_execution: executableResults[0] && executableResults[0].canonical_opportunity_before_execution || null,
    canonical_opportunity_after_execution: executableResults[0] && executableResults[0].canonical_opportunity_after_execution || null,
    updated_work_orders: executableResults[0] && executableResults[0].updated_work_orders || [],
    remaining_locks: executableResults[0] && executableResults[0].remaining_locks || [],
    what_gabriel_can_do_now: executableResults[0] && executableResults[0].what_gabriel_can_do_now || [],
    what_system_still_needs: executableResults[0] && executableResults[0].what_system_still_needs || [],
    what_requires_paid_data: executableResults[0] && executableResults[0].what_requires_paid_data || [],
    item_results: itemResults,
    rejected_items: rejectedItems,
    diagnostics: {
      packet_status_counts: packets.reduce((counts, packet) => {
        const status = cleanText(packet.packet_status) || 'UNKNOWN';
        counts[status] = Number(counts[status] || 0) + 1;
        return counts;
      }, {}),
      opportunity_stage_counts: opportunities.reduce((counts, opportunity) => {
        const stage = cleanText(opportunity.stage) || 'UNKNOWN';
        counts[stage] = Number(counts[stage] || 0) + 1;
        return counts;
      }, {}),
      canonical_stage_counts: canonicalOpportunities.reduce((counts, opportunity) => {
        const stage = cleanText(opportunity.money_path && opportunity.money_path.current_stage) || 'UNKNOWN';
        counts[stage] = Number(counts[stage] || 0) + 1;
        return counts;
      }, {}),
      executable_work_orders_enabled: executeWorkOrders,
      executable_work_orders_ran: executableResults.length > 0,
      executable_work_order_caps: executableWorkOrders.EXECUTABLE_WORK_ORDER_CAPS,
      executable_work_order_diagnostics: executableResults.map((result) => result.diagnostics || {}),
      rejection_reasons: uniqueText(rejectedItems.map((item) => item.reason)),
      legacy_comp_agent_invoked: false,
      legacy_skip_trace_agent_invoked: false,
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    },
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  SELECTED_DEAL_PACKET_CAPS,
  SelectedDealPacketInputError,
  completeAddress,
  addressEvidenceFromPage,
  exactPropertyUrl,
  runSelectedDealPacketPreview
};
