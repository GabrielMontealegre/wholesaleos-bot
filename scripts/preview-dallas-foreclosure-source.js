#!/usr/bin/env node
'use strict';

const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');

function readArg(name, fallback = '') {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

function cleanText(value) {
  return String(value == null ? '' : value).trim();
}

async function main() {
  const sourceUrl = cleanText(readArg('source-url', 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php'));
  const sourceDocumentUrl = cleanText(readArg('source-document-url', ''));
  const sourceText = cleanText(readArg('source-text', ''));
  const sourceHtml = cleanText(readArg('source-html', ''));

  const job = {
    job_id: 'dallas_foreclosure_preview_cli',
    discovery_batch_id: 'dallas_foreclosure_preview_cli',
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX',
    source_families: ['preforeclosure_trustee_notice'],
    source_acquisition_enabled: true,
    acquisition_core_enabled: true,
    source_url: sourceUrl,
    source_document_url: sourceDocumentUrl,
    source_text: sourceText,
    source_html: sourceHtml,
    source_acquisition_mode: 'live_preview'
  };

  const result = await sourceAcquisitionOrchestrator.runAcquisitionCore(job, {
    source_url: sourceUrl,
    source_document_url: sourceDocumentUrl,
    source_text: sourceText,
    source_html: sourceHtml
  });

  const adapterDiagnostics = Array.isArray(result.adapter_results) && result.adapter_results[0] && result.adapter_results[0].diagnostics || {};
  const preview = adapterDiagnostics.live_source_preview || {};
  const output = {
    acquisition_core_status: result.status,
    source_ids_attempted: result.source_ids_attempted,
    source_families_attempted: result.source_families_attempted,
    candidates_found: result.candidates_found,
    cards_found: Array.isArray(result.cards) ? result.cards.length : 0,
    preview_only: result.preview_only,
    should_ingest: result.should_ingest,
    live_source_preview: preview,
    diagnostics: adapterDiagnostics
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
