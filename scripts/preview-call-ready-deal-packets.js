#!/usr/bin/env node
'use strict';

const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');

const CAPS = Object.freeze({
  max_queries: 4,
  max_results: 10,
  max_page_fetches: 4,
  timeout_ms: 5000,
  retries: 0
});

function cleanText(value) {
  return String(value == null ? '' : value).trim();
}

function readArg(argv, name, fallback = '') {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) return true;
  return value;
}

function buildPreviewJob(argv = process.argv) {
  return {
    job_id: 'call_ready_deal_packet_preview',
    discovery_batch_id: 'call_ready_deal_packet_preview',
    city: cleanText(readArg(argv, 'city', 'Dallas')) || 'Dallas',
    county: cleanText(readArg(argv, 'county', 'Dallas')) || 'Dallas',
    state: cleanText(readArg(argv, 'state', 'TX')) || 'TX',
    source_ids: ['tx_dallas_fsbo_contact_first'],
    source_families: ['fsbo'],
    source_acquisition_enabled: true,
    acquisition_core_enabled: true,
    source_acquisition_mode: 'contact_first_preview',
    preview_only: true,
    should_ingest: false
  };
}

async function runPreview(argv = process.argv, options = {}) {
  const job = buildPreviewJob(argv);
  const result = await sourceAcquisitionOrchestrator.runAcquisitionCore(job, {
    env: options.env || process.env,
    search_fetch_impl: options.search_fetch_impl,
    page_fetch_impl: options.page_fetch_impl,
    mock_search_results: options.mock_search_results,
    max_results: CAPS.max_results,
    max_page_fetches: CAPS.max_page_fetches,
    timeout_ms: CAPS.timeout_ms
  });
  return {
    mode: 'local_preview_only',
    market: `${job.city}, ${job.state}`,
    caps: CAPS,
    acquisition_status: result.status,
    source_ids_attempted: result.source_ids_attempted,
    candidates_found: result.candidates_found,
    packet_count: result.call_ready_packet_count,
    packets: result.call_ready_packets,
    adapter_results: result.adapter_results,
    preview_only: result.preview_only === true,
    should_ingest: result.should_ingest === true,
    no_global_mutation: true
  };
}

async function main(argv = process.argv) {
  const output = await runPreview(argv);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

module.exports = {
  CAPS,
  readArg,
  buildPreviewJob,
  runPreview,
  main
};
