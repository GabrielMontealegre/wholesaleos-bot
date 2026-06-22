#!/usr/bin/env node
'use strict';

const previewService = require('../modules/research/call-ready-preview-service');
const CAPS = Object.freeze(Object.assign({}, previewService.PREVIEW_CAPS, { timeout_ms: 5000 }));

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
  return previewService.buildCallReadyPreviewJob({
    city: cleanText(readArg(argv, 'city', 'Dallas')) || 'Dallas',
    county: cleanText(readArg(argv, 'county', 'Dallas County')) || 'Dallas County',
    state: cleanText(readArg(argv, 'state', 'TX')) || 'TX'
  });
}

async function runPreview(argv = process.argv, options = {}) {
  const job = buildPreviewJob(argv);
  const result = await previewService.runCallReadyPreview(job, options);
  return Object.assign({
    mode: 'local_preview_only',
    market: `${job.city}, ${job.state}`
  }, result, {
    caps: CAPS,
    packet_count: result.call_ready_packet_count,
    packets: result.call_ready_packets,
    acquisition_status: result.status,
    preview_only: result.preview_only === true,
    should_ingest: result.should_ingest === true,
    no_global_mutation: true
  });
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
