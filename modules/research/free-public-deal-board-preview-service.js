'use strict';

const freePublicDealBoard = require('./free-public-deal-board');
const searchProviderWorker = require('./search-provider-worker');

const SERVER_PREVIEW_CAPS = Object.freeze({
  output_deals: 25,
  source_pages: freePublicDealBoard.DEFAULT_CAPS.source_pages,
  documents: freePublicDealBoard.DEFAULT_CAPS.documents,
  property_link_searches: freePublicDealBoard.DEFAULT_CAPS.property_link_searches,
  property_pages_fetched: freePublicDealBoard.DEFAULT_CAPS.property_pages_fetched,
  timeout_ms: freePublicDealBoard.DEFAULT_CAPS.timeout_ms,
  retries: 0
});

function cleanText(value) {
  return String(value == null ? '' : value).trim();
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function bounded(value, fallback, maximum) {
  return Math.max(1, Math.min(positiveInt(value, fallback), maximum));
}

function marketFrom(input = {}) {
  const source = input.market && typeof input.market === 'object' ? input.market : input;
  return {
    city: cleanText(source.city) || 'Dallas',
    county: cleanText(source.county) || 'Dallas',
    state: cleanText(source.state).toUpperCase() || 'TX'
  };
}

function buildFreePublicDealBoardPreviewCaps(input = {}, env) {
  const source = input.caps && typeof input.caps === 'object' ? input.caps : {};
  const providerReadiness = searchProviderWorker.buildLiveSearchProviderReadiness(env || process.env);
  const providerTimeout = Number(providerReadiness && providerReadiness.effective && providerReadiness.effective.timeout_ms || 0) || SERVER_PREVIEW_CAPS.timeout_ms;
  const requestedLimit = input.limit || input.output_deals || source.output_deals || source.limit;
  return Object.freeze({
    output_deals: bounded(requestedLimit, SERVER_PREVIEW_CAPS.output_deals, SERVER_PREVIEW_CAPS.output_deals),
    source_pages: bounded(source.source_pages, SERVER_PREVIEW_CAPS.source_pages, SERVER_PREVIEW_CAPS.source_pages),
    documents: bounded(source.documents || source.pdfs, SERVER_PREVIEW_CAPS.documents, SERVER_PREVIEW_CAPS.documents),
    property_link_searches: bounded(source.property_link_searches, SERVER_PREVIEW_CAPS.property_link_searches, SERVER_PREVIEW_CAPS.property_link_searches),
    property_pages_fetched: bounded(source.property_pages_fetched, SERVER_PREVIEW_CAPS.property_pages_fetched, SERVER_PREVIEW_CAPS.property_pages_fetched),
    timeout_ms: bounded(source.timeout_ms || providerTimeout, SERVER_PREVIEW_CAPS.timeout_ms, SERVER_PREVIEW_CAPS.timeout_ms),
    retries: 0
  });
}

function buildFreePublicDealBoardPreviewInput(input = {}, options = {}) {
  const env = options.env || process.env;
  const caps = buildFreePublicDealBoardPreviewCaps(input, env);
  return {
    market: marketFrom(input),
    limit: caps.output_deals,
    caps,
    enable_provider_search: true,
    enable_free_public_hunters: input.enable_free_public_hunters !== false,
    free_hunter_caps: input.free_hunter_caps,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

async function runFreePublicDealBoardServerPreview(input = {}, options = {}) {
  const env = options.env || process.env;
  const previewInput = buildFreePublicDealBoardPreviewInput(input, { env });
  const result = await freePublicDealBoard.runFreePublicDealBoardPreview(previewInput, {
    env,
    enable_provider_search: true,
    mock_source_adapter_records: options.mock_source_adapter_records,
    fetch_impl: options.fetch_impl || options.fetchImpl || global.fetch,
    fetchImpl: options.fetchImpl || options.fetch_impl || global.fetch
  });
  const readiness = searchProviderWorker.buildLiveSearchProviderReadiness(env);
  return Object.assign({}, result, {
    ok: true,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    search_provider_readiness: readiness,
    diagnostics: Object.assign({}, result && result.diagnostics || {}, {
      search_provider_readiness: readiness,
      caps: previewInput.caps,
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    })
  });
}

module.exports = {
  SERVER_PREVIEW_CAPS,
  buildFreePublicDealBoardPreviewCaps,
  buildFreePublicDealBoardPreviewInput,
  runFreePublicDealBoardServerPreview
};
