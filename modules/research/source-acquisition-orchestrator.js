'use strict';

const sourceCatalog = require('../sources/source-catalog');
const propertyCandidate = require('./property-candidate');

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
    candidates,
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

async function runAcquisitionCore(job, options = {}) {
  job = job || {};
  const startedAt = nowIso();
  const catalog = sourceCatalog.buildSourceCatalog(job);
  const shouldRunMock = !!(asArray(job.mock_acquisition_candidates).length || asArray(options.mock_acquisition_candidates).length || job.source_acquisition_mode === 'mock');
  const adapterResults = [];
  if (shouldRunMock) adapterResults.push(mockAdapter(job, options));
  const context = {
    acquisition_run_id: job.discovery_batch_id || job.job_id,
    city: job.city,
    state: job.state,
    zip: job.zip
  };
  const candidates = adapterResults
    .flatMap((result) => asArray(result.candidates).map((candidate) => Object.assign({}, candidate, {
      candidate_origin: candidate.candidate_origin || 'acquisition_core',
      source_id: candidate.source_id || result.source_id
    })))
    .map((candidate) => propertyCandidate.normalizePropertyCandidate(candidate, context));
  const cards = candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, context));
  return {
    status: shouldRunMock ? 'available' : 'not_configured',
    provider: 'Acquisition Core',
    attempted: shouldRunMock,
    started_at: startedAt,
    finished_at: nowIso(),
    catalog_source_count: catalog.length,
    source_families: Array.from(new Set(catalog.map((source) => source.source_family).filter(Boolean))).slice(0, 20),
    adapter_results: adapterResults.map((result) => ({
      source_id: cleanText(result.source_id),
      status: cleanText(result.status),
      candidate_count: asArray(result.candidates).length
    })),
    candidates_found: candidates.length,
    cards,
    candidates,
    next_best_worker_counts: workerCounts(candidates),
    confidence_buckets: confidenceBuckets(candidates),
    preview_only: true,
    should_ingest: false,
    persist_scope: 'batch_only',
    safety: 'Acquisition Core candidate discovery only; no auto-ingestion and no downstream worker execution.'
  };
}

module.exports = {
  runAcquisitionCore
};
