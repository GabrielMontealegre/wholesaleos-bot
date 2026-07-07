'use strict';

const sourceCatalog = require('../sources/source-catalog');
const propertyCandidate = require('./property-candidate');
const sourceAdapterRegistry = require('../sources/source-adapter-registry');

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function mockAdapter(job, options) {
  const candidates = asArray(options.mock_acquisition_candidates).length
    ? options.mock_acquisition_candidates
    : asArray(job.mock_acquisition_candidates);
  return {
    source_id: 'mock_source_acquisition_adapter',
    status: 'available',
    attempted: true,
    candidates,
    cards: candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(propertyCandidate.normalizePropertyCandidate(candidate, {
      acquisition_run_id: job.discovery_batch_id || job.job_id,
      city: job.city,
      state: job.state,
      zip: job.zip
    }), {
      acquisition_run_id: job.discovery_batch_id || job.job_id,
      city: job.city,
      state: job.state,
      zip: job.zip
    })),
    diagnostics: {
      mocked: true,
      candidate_count: candidates.length
    }
  };
}

function workerCounts(candidates) {
  return candidates.reduce((out, candidate) => {
    const worker = cleanText(candidate.next_best_worker || 'NONE') || 'NONE';
    out[worker] = (out[worker] || 0) + 1;
    return out;
  }, {});
}

function confidenceBuckets(candidates) {
  return candidates.reduce((out, candidate) => {
    const bucket = cleanText(candidate.confidence_bucket || 'unknown') || 'unknown';
    out[bucket] = (out[bucket] || 0) + 1;
    return out;
  }, {});
}

function normalizeSourceFamily(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function sourceMatchesRequestedFamily(source, requestedFamilies) {
  if (!Array.isArray(requestedFamilies) || !requestedFamilies.length) return true;
  const haystack = [
    source.source_family,
    source.source_category,
    source.source_name,
    source.source_id,
    source.adapter_id,
    source.adapter_family
  ].map(cleanText).join(' ').toLowerCase();
  return requestedFamilies.some((family) => {
    const needle = normalizeSourceFamily(family);
    return !!needle && haystack.includes(needle);
  });
}

function selectAcquisitionSources(job, catalog) {
  const requestedIds = asArray(job.source_ids || job.sourceIds || []).map(cleanText).filter(Boolean);
  const requestedFamilies = asArray(job.source_families || job.sourceFamilies || []).map(cleanText).filter(Boolean);
  const explicitlyRequested = requestedIds.length > 0 || requestedFamilies.length > 0;
  const registeredIds = new Set(sourceAdapterRegistry.listRegisteredSourceIds());
  let selected = (Array.isArray(catalog) ? catalog : []).filter((source) => {
    if (!registeredIds.has(source.source_id)) return false;
    if (!explicitlyRequested && source.auto_select === false) return false;
    if (requestedIds.length && !requestedIds.includes(source.source_id)) return false;
    return sourceMatchesRequestedFamily(source, requestedFamilies);
  });
  if (!selected.length && !explicitlyRequested) {
    selected = (Array.isArray(catalog) ? catalog : []).filter((source) => registeredIds.has(source.source_id));
  }
  if (!selected.length && !explicitlyRequested) {
    selected = (Array.isArray(catalog) ? catalog : []).filter((source) => /dallas county clerk foreclosure notices/i.test(source.source_name || source.source_id));
  }
  return selected.slice(0, 12);
}

function normalizeAdapterResult(result) {
  const candidateList = asArray(result && result.candidates);
  const packetList = asArray(result && result.packets);
  return {
    source_id: cleanText(result && result.source_id),
    source_name: cleanText(result && result.source_name),
    county: cleanText(result && result.county),
    ocr: result && (result.ocr || (result.diagnostics && result.diagnostics.ocr)) || null,
    status: cleanText(result && result.status),
    attempted: result && result.attempted === true,
    candidate_count: candidateList.length,
    packet_count: packetList.length,
    call_ready_count: packetList.filter((packet) => cleanText(packet && packet.packet_status) === 'CALL_READY').length,
    outreach_ready_count: packetList.filter((packet) => cleanText(packet && packet.packet_status) === 'OUTREACH_READY').length,
    blocked_reason: cleanText(result && result.blocked_reason),
    message: cleanText(result && result.message),
    evidence_links_found: Number(result && result.evidence_links_found || result && result.diagnostics && result.diagnostics.evidence_links_found || 0) || 0,
    source_url_classification: cleanText(result && result.diagnostics && result.diagnostics.source_url_classification),
    source_document_url_classification: cleanText(result && result.diagnostics && result.diagnostics.source_document_url_classification),
    diagnostics: result && result.diagnostics ? result.diagnostics : {},
    document_hunter_summary: result && result.document_hunter_summary ? result.document_hunter_summary : result && result.diagnostics && result.diagnostics.document_hunter_summary ? result.diagnostics.document_hunter_summary : null,
    discovered_links: asArray(result && result.discovered_links),
    document_urls_found: asArray(result && result.document_urls_found),
    document_urls_parsed: asArray(result && result.document_urls_parsed),
    document_urls_skipped: asArray(result && result.document_urls_skipped),
    source_preview: result && result.source_preview ? result.source_preview : result && result.diagnostics && result.diagnostics.live_source_preview ? result.diagnostics.live_source_preview : null,
    candidate_ids: candidateList.map((candidate) => cleanText(candidate.candidate_id || candidate.id)).filter(Boolean)
  };
}

async function runAcquisitionCore(job, options = {}) {
  job = job || {};
  const startedAt = nowIso();
  const catalog = sourceCatalog.buildSourceCatalog(job);
  const shouldRunMock = !!(asArray(job.mock_acquisition_candidates).length || asArray(options.mock_acquisition_candidates).length || job.source_acquisition_mode === 'mock');
  const context = {
    acquisition_run_id: job.discovery_batch_id || job.job_id,
    city: job.city,
    state: job.state,
    zip: job.zip
  };
  let adapterResults = [];
  let sourceIdsAttempted = [];
  let sourceFamiliesAttempted = [];
  let rawCandidates = [];
  let cards = [];
  let packets = [];

  if (shouldRunMock) {
    const mocked = mockAdapter(job, options);
    adapterResults = [mocked];
    rawCandidates = asArray(mocked.candidates);
    cards = asArray(mocked.cards);
  } else {
    const selectedSources = selectAcquisitionSources(job, catalog);
    sourceIdsAttempted = selectedSources.map((source) => source.source_id);
    sourceFamiliesAttempted = Array.from(new Set(selectedSources.map((source) => source.source_family).filter(Boolean)));
    for (const source of selectedSources) {
      const adapter = sourceAdapterRegistry.adapterForSourceId(source.source_id);
      if (!adapter || typeof adapter.run !== 'function') {
        adapterResults.push(normalizeAdapterResult({
          source_id: source.source_id,
          source_name: source.source_name,
          status: 'not_configured',
          attempted: false,
          candidates: [],
          diagnostics: { adapter_available: false }
        }));
        continue;
      }
      const result = await sourceAdapterRegistry.discoverSource(source.source_id, Object.assign({}, options, {
        source,
        source_id: source.source_id,
        source_family: source.source_family,
        source_name: source.source_name,
        source_url: options.source_url || source.source_url,
        source_document_url: options.source_document_url || source.source_document_url || '',
        acquisition_run_id: job.discovery_batch_id || job.job_id,
        city: job.city,
        state: job.state,
        zip: job.zip,
        captured_at: startedAt
      }));
      adapterResults.push(normalizeAdapterResult(result));
      const candidates = asArray(result && result.candidates).map((candidate) => propertyCandidate.normalizePropertyCandidate(candidate, context));
      rawCandidates.push(...candidates);
      cards.push(...(asArray(result && result.cards).length ? result.cards : candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, context))));
      packets.push(...asArray(result && result.packets));
    }
  }

  const candidates = rawCandidates.map((candidate) => propertyCandidate.normalizePropertyCandidate(candidate, context));
  const normalizedCards = cards.length
    ? cards.map((card) => card && card.property_candidate ? propertyCandidate.candidateToFindMeCard(propertyCandidate.normalizePropertyCandidate(card.property_candidate, context), context) : card)
    : candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, context));

  const hasAttemptedAdapters = shouldRunMock || adapterResults.some((result) => result.attempted === true);
  const anyAvailable = adapterResults.some((result) => result.status === 'available');
  const anyCandidates = candidates.length > 0;
  const status = shouldRunMock
    ? 'available'
    : anyAvailable || anyCandidates
      ? 'available'
      : hasAttemptedAdapters
        ? 'needs_manual_review'
        : 'not_configured';

  const diagnostics = {
    selected_source_count: sourceIdsAttempted.length,
    source_ids_attempted: sourceIdsAttempted,
    source_families_attempted: sourceFamiliesAttempted,
    adapter_results: adapterResults,
    candidate_count: candidates.length,
    card_count: normalizedCards.length,
    packet_count: packets.length,
    mock_mode: shouldRunMock,
    source_catalog_count: catalog.length
  };
  const documentHunterSummary = adapterResults.map((result) => result && result.document_hunter_summary).find((summary) => summary && typeof summary === 'object') || null;

  return {
    status,
    provider: 'Acquisition Core',
    attempted: hasAttemptedAdapters,
    started_at: startedAt,
    finished_at: nowIso(),
    catalog_source_count: catalog.length,
    source_families: Array.from(new Set(catalog.map((source) => source.source_family).filter(Boolean))).slice(0, 20),
    source_ids_attempted: sourceIdsAttempted,
    source_families_attempted: sourceFamiliesAttempted,
    adapter_results: adapterResults,
    candidates_found: candidates.length,
    cards: normalizedCards,
    candidates,
    call_ready_packets: packets,
    call_ready_packet_count: packets.length,
    next_best_worker_counts: workerCounts(candidates),
    confidence_buckets: confidenceBuckets(candidates),
    diagnostics,
    document_hunter_summary: documentHunterSummary,
    preview_only: true,
    should_ingest: false,
    persist_scope: 'batch_only',
    safety: 'Acquisition Core candidate discovery only; no auto-ingestion and no downstream worker execution.'
  };
}

module.exports = {
  runAcquisitionCore
};
