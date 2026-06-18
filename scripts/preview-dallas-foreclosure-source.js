#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');

function readArg(argv, name, fallback = '') {
  const idx = argv.indexOf(`--${name}`);
  if (idx < 0) return fallback;
  const next = argv[idx + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

function cleanText(value) {
  return String(value == null ? '' : value).trim();
}

async function readStdinText() {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('error', reject);
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.resume();
  });
}

function normalizePreviewInputs(argv = process.argv, stdinText = '') {
  const sourceUrl = cleanText(readArg(argv, 'source-url', 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php'));
  const inputFile = cleanText(readArg(argv, 'input-file', ''));
  const sourceDocumentUrl = cleanText(readArg(argv, 'source-document-url', ''));
  const sourceText = cleanText(readArg(argv, 'source-text', ''));
  const sourceHtml = cleanText(readArg(argv, 'source-html', ''));
  const useStdinText = argv.includes('--source-text-stdin');
  const modes = [];
  if (inputFile) modes.push('input-file');
  if (useStdinText) modes.push('source-text-stdin');
  if (sourceDocumentUrl) modes.push('source-document-url');
  if (sourceText) modes.push('source-text');
  if (sourceHtml) modes.push('source-html');
  if (modes.length > 1) {
    throw new Error('conflicting_input_modes');
  }
  const normalizedText = useStdinText ? cleanText(stdinText) : sourceText;
  return {
    sourceUrl,
    inputFile,
    sourceDocumentUrl,
    sourceText: normalizedText,
    sourceHtml,
    inputMode: inputFile
      ? 'local_file'
      : useStdinText
        ? 'stdin_text'
        : sourceDocumentUrl
          ? 'direct_document_url'
          : sourceText
            ? 'legacy_source_text'
            : sourceHtml
              ? 'legacy_source_html'
              : 'official_county_page'
  };
}

function buildPreviewJob(inputs) {
  inputs = inputs || {};
  return {
    job_id: 'dallas_foreclosure_preview_cli',
    discovery_batch_id: 'dallas_foreclosure_preview_cli',
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX',
    source_families: ['preforeclosure_trustee_notice'],
    source_acquisition_enabled: true,
    acquisition_core_enabled: true,
    source_url: inputs.sourceUrl,
    source_document_url: inputs.sourceDocumentUrl,
    source_text: inputs.sourceText,
    source_html: inputs.sourceHtml,
    input_file: inputs.inputFile,
    source_acquisition_mode: 'live_preview'
  };
}

async function runPreview(inputs) {
  const job = buildPreviewJob(inputs);
  const result = await sourceAcquisitionOrchestrator.runAcquisitionCore(job, {
    source_url: inputs.sourceUrl,
    source_document_url: inputs.sourceDocumentUrl,
    source_text: inputs.sourceText,
    source_html: inputs.sourceHtml,
    input_file: inputs.inputFile
  });

  const adapterDiagnostics = Array.isArray(result.adapter_results) && result.adapter_results[0] && result.adapter_results[0].diagnostics || {};
  const preview = adapterDiagnostics.live_source_preview || {};
  return {
    acquisition_core_status: result.status,
    input_mode: inputs.inputMode,
    input_file: inputs.inputFile ? path.basename(inputs.inputFile) : '',
    source_ids_attempted: result.source_ids_attempted,
    source_families_attempted: result.source_families_attempted,
    candidates_found: result.candidates_found,
    cards_found: Array.isArray(result.cards) ? result.cards.length : 0,
    preview_only: result.preview_only,
    should_ingest: result.should_ingest,
    live_source_preview: preview,
    diagnostics: adapterDiagnostics
  };
}

async function main(argv = process.argv) {
  const preliminary = normalizePreviewInputs(argv, '');
  const stdinText = preliminary.inputMode === 'stdin_text' ? await readStdinText() : '';
  const inputs = normalizePreviewInputs(argv, stdinText);
  const output = await runPreview(inputs);
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  return output;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

module.exports = {
  readArg,
  readStdinText,
  normalizePreviewInputs,
  buildPreviewJob,
  runPreview,
  main
};
