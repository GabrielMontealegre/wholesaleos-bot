'use strict';

const searchProviderWorker = require('./search-provider-worker');
const sourceAcquisitionOrchestrator = require('./source-acquisition-orchestrator');

const PREVIEW_CAPS = Object.freeze({
  max_queries: 4,
  max_results: 10,
  max_page_fetches: 4,
  retries: 0
});

function cleanText(value) {
  return String(value == null ? '' : value).trim();
}

function previewTimeoutMs(env) {
  const cfg = searchProviderWorker.searchProviderConfig(env || process.env);
  return Math.max(1000, Number(cfg.timeout_ms || 0) || 0);
}

function buildCallReadyPreviewJob(input = {}) {
  return {
    job_id: 'call_ready_deal_packet_preview',
    discovery_batch_id: 'call_ready_deal_packet_preview',
    city: cleanText(input.city) || 'Dallas',
    county: cleanText(input.county) || 'Dallas County',
    state: cleanText(input.state) || 'TX',
    source_ids: ['tx_dallas_fsbo_contact_first'],
    source_families: ['fsbo'],
    source_acquisition_enabled: true,
    acquisition_core_enabled: true,
    source_acquisition_mode: 'contact_first_preview',
    preview_only: true,
    should_ingest: false
  };
}

function buildCallReadyPreviewCaps(env) {
  return Object.freeze({
    max_queries: PREVIEW_CAPS.max_queries,
    max_results: PREVIEW_CAPS.max_results,
    max_page_fetches: PREVIEW_CAPS.max_page_fetches,
    retries: PREVIEW_CAPS.retries,
    timeout_ms: previewTimeoutMs(env)
  });
}

async function runCallReadyPreview(input = {}, options = {}) {
  const env = options.env || process.env;
  const job = buildCallReadyPreviewJob(input);
  const caps = buildCallReadyPreviewCaps(env);
  const result = await sourceAcquisitionOrchestrator.runAcquisitionCore(job, {
    env,
    search_fetch_impl: options.search_fetch_impl,
    page_fetch_impl: options.page_fetch_impl,
    mock_search_results: options.mock_search_results,
    max_results: caps.max_results,
    max_page_fetches: caps.max_page_fetches,
    timeout_ms: caps.timeout_ms
  });
  const searchProviderReadiness = searchProviderWorker.buildLiveSearchProviderReadiness(env);
  const diagnostics = Object.assign({}, result && result.diagnostics || {}, {
    caps,
    search_provider_readiness: searchProviderReadiness,
    search_provider_status: result && result.provider_status ? result.provider_status : '',
    acquisition_status: result && result.status ? result.status : '',
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  });
  return Object.assign({}, result, {
    caps,
    search_provider_readiness: searchProviderReadiness,
    diagnostics,
    acquisition_status: result && result.status ? result.status : '',
    packet_count: Number(result && result.call_ready_packet_count || 0) || 0,
    packets: Array.isArray(result && result.call_ready_packets) ? result.call_ready_packets : [],
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  });
}

module.exports = {
  PREVIEW_CAPS,
  buildCallReadyPreviewJob,
  buildCallReadyPreviewCaps,
  runCallReadyPreview
};
