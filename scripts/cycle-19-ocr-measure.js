'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const baselineDir = path.join(root, 'exports', 'cycle-18-baseline');
const outDir = path.join(root, 'exports', 'cycle-19-ocr-runtime');
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const cleanText = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
global.fetch = async () => { throw new Error('NETWORK_DISABLED_CYCLE_19_CACHE_ONLY_MEASUREMENT'); };

const manifest = require('../exports/cycle-18-baseline/manifest.json');
const finalMeasurement = require('../exports/cycle-18-baseline/final-measurement.json');
const profiles = require('../modules/sources/tx-county-foreclosure-source-profiles').PROFILES;
const ocr = require('../modules/research/ocr-notice-extraction');
const candidate = require('../modules/research/property-candidate');
const queue = require('../modules/research/lead-operations-queue');

const boardFile = path.join(root, 'modules', 'research', 'free-public-deal-board.js');
const observed = new Module(boardFile, module);
observed.filename = boardFile;
observed.paths = Module._nodeModulePaths(path.dirname(boardFile));
observed._compile(fs.readFileSync(boardFile, 'utf8') + '\nmodule.exports.observedCandidateRecord = candidateRecord; module.exports.observedCardRecord = cardRecord;\n', boardFile);
const board = observed.exports;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function lineFor(file, needle) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(needle));
  return index >= 0 ? `${file}:${index + 1}` : file;
}

function confidenceBucket(score) {
  const n = Number(score) || 0;
  if (n >= 75) return 'high';
  if (n >= 45) return 'medium';
  if (n > 0) return 'low_rejected';
  return 'none';
}

function sourceAddressLooksComplete(row) {
  return /\bTX\b\s+\d{5}(?:-\d{4})?\b/i.test(cleanText(row.address || row.property_address));
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function profileForCounty(county) {
  return profiles.find((profile) => cleanText(profile.county).toLowerCase() === cleanText(county).toLowerCase());
}

function manifestDocFor(documentUrl, county) {
  return manifest.documents.find((doc) => doc.county === county && doc.url === documentUrl);
}

function candidateTrace(raw, profile, market) {
  const normalized = candidate.normalizePropertyCandidate({
    ...raw,
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: 'preforeclosure_trustee_notice',
    motivation_type: 'preforeclosure_trustee_notice',
    motivation_evidence_text: raw.source_proof_text,
    status_evidence_text: raw.sale_date ? `Sale Date: ${raw.sale_date}` : raw.status_evidence_text
  }, { city: '', state: 'TX' });
  const directRecord = board.observedCandidateRecord(normalized, profile);
  const directDeal = board.dealFromRecord(directRecord, { market });
  const card = candidate.candidateToFindMeCard(normalized, { city: '', state: 'TX' });
  const cardRecord = board.observedCardRecord(card, profile);
  const cardDeal = board.dealFromRecord(cardRecord, { market });
  const losses = [];
  if (cleanText(raw.address) && !cleanText(directDeal.normalized_address)) {
    losses.push({
      stage: 'extraction_to_board',
      file_line: lineFor('modules/research/ocr-notice-extraction.js', 'normalized_address:'),
      classification: 'PREVENTABLE',
      reason: 'OCR text is source evidence but cannot become a normalized address without human review.'
    });
  }
  if (!cleanText(directDeal.normalized_address)) {
    losses.push({
      stage: 'board_to_queue',
      file_line: lineFor('modules/research/free-public-deal-board.js', 'property_identity_source_only'),
      classification: 'PREVENTABLE',
      reason: 'Source-only identity cannot borrow unrelated courthouse or trustee addresses.'
    });
  }
  return {
    county: raw.county || profile.county,
    source_document_url: cleanText(raw.source_document_url || raw.source_proof_url),
    raw_address: cleanText(raw.address || raw.property_address),
    raw_sale_date: cleanText(raw.sale_date || raw.auction_date),
    extraction_method: cleanText(raw.extraction_method),
    candidate_normalized_address: cleanText(normalized.normalized_address),
    card_normalized_address: cleanText(cardDeal.normalized_address),
    board_normalized_address: cleanText(directDeal.normalized_address),
    board_quality_bucket: cleanText(directDeal.quality_bucket),
    queue_segment: queue.segmentKey(directDeal),
    candidate_and_card_agree: cleanText(cardDeal.normalized_address) === cleanText(directDeal.normalized_address),
    losses
  };
}

async function measureCounty(county) {
  const profile = profileForCounty(county);
  const docs = finalMeasurement.documents
    .filter((doc) => doc.county === county && doc.fetch_status === 'PDF_CAPTURED' && Number(doc.text_chars || 0) === 0)
    .map((doc) => {
      const captured = manifestDocFor(doc.document_url, county);
      const bodyPath = captured && captured.body_file ? path.join(baselineDir, captured.body_file) : '';
      const buffer = bodyPath && fs.existsSync(bodyPath) ? fs.readFileSync(bodyPath) : null;
      return {
        url: doc.document_url,
        buffer,
        profile,
        body_sha256: buffer ? sha256(buffer) : '',
        body_file: captured && captured.body_file,
        text_parse_status: doc.parse_status,
        text_chars: doc.text_chars,
        pages: doc.pages
      };
    });
  const summary = {
    documents_in_cache: docs.length,
    documents_processed: 0,
    documents_missing_cache_body: docs.filter((doc) => !doc.buffer).length,
    documents_attempted: 0,
    documents_succeeded: 0,
    documents_skipped_oversize: 0,
    documents_failed: 0,
    pages_rendered: 0,
    rows_extracted: 0,
    rows_with_complete_source_supported_address: 0,
    rows_left_partial: 0,
    confidence_distribution: { high: 0, medium: 0, low_rejected: 0, none: 0 },
    document_confidence_distribution: { high: 0, medium: 0, low_rejected: 0, none: 0 },
    runtime_ms: 0,
    peak_rss_kb: 0,
    reason_counts: {}
  };
  const attempts = [];
  const rows = [];
  const started = performance.now();
  for (const batch of chunk(docs.filter((doc) => doc.buffer), 5)) {
    summary.documents_processed += batch.length;
    const run = await ocr.runOcrNoticeExtraction({
      documents: batch,
      caps: { max_docs: 5, max_pages_per_doc: 3, max_ms_per_doc: 30000 }
    });
    summary.documents_attempted += run.diagnostics.ocr_documents_attempted || 0;
    summary.documents_succeeded += run.diagnostics.ocr_documents_succeeded || 0;
    summary.documents_skipped_oversize += run.diagnostics.ocr_skipped_oversize || 0;
    summary.documents_failed += run.diagnostics.ocr_failures || 0;
    summary.pages_rendered += run.diagnostics.ocr_pages_rendered || 0;
    summary.rows_extracted += run.rows.length;
    for (const row of run.rows) {
      if (sourceAddressLooksComplete(row)) summary.rows_with_complete_source_supported_address += 1;
      else summary.rows_left_partial += 1;
      summary.confidence_distribution[confidenceBucket(row.ocr_confidence)] += 1;
      rows.push(candidateTrace(row, profile, { city: 'Dallas', county: 'Dallas', state: 'TX' }));
    }
    for (const attempt of run.attempts) {
      const reason = attempt.status === 'ocr_done' && !attempt.rows
        ? 'ocr_completed_no_source_supported_rows'
        : attempt.status === 'ocr_failed'
          ? cleanText(attempt.reason) || 'ocr_failed'
          : attempt.status;
      summary.reason_counts[reason] = (summary.reason_counts[reason] || 0) + 1;
      attempts.push(attempt);
      if (attempt.status === 'ocr_done') summary.document_confidence_distribution[confidenceBucket(attempt.confidence)] += 1;
    }
  }
  summary.runtime_ms = Math.round(performance.now() - started);
  summary.peak_rss_kb = process.resourceUsage().maxRSS;
  return { county, profile_source_id: profile && profile.source_id, summary, rows, attempts };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const counties = [];
  for (const county of ['Navarro', 'Rockwall']) counties.push(await measureCounty(county));
  const allRows = counties.flatMap((county) => county.rows);
  const rowsByCounty = new Set(allRows.map((row) => row.county));
  const huntRows = JSON.parse(fs.readFileSync(path.join(baselineDir, 'final-measurement.json'))).rows
    .filter((row) => row.county === 'Hunt' && cleanText(row.deal && row.deal.normalized_address))
    .slice(0, 3)
    .map((row) => ({
      county: 'Hunt',
      source_document_url: row.document_url,
      raw_address: cleanText(row.raw && row.raw.address),
      candidate_normalized_address: cleanText(row.candidate && row.candidate.normalized_address),
      board_normalized_address: cleanText(row.deal && row.deal.normalized_address),
      queue_segment: row.segment,
      losses: []
    }));
  const criterion5Met = huntRows.length + allRows.length >= 6 && new Set(['Hunt'].concat(Array.from(rowsByCounty))).size >= 3;
  const report = {
    generated_at: new Date().toISOString(),
    scope: 'CACHE_ONLY_OCR_MEASUREMENT_NAVARRO_ROCKWALL_NO_REFETCH_NO_PRODUCTION',
    runtime_resolution_pre_change_observation: {
      default_launch: 'failed: missing chromium_headless_shell-1234 executable',
      explicit_installed_chromium_1117: 'succeeded when launched outside the sandbox before code changes'
    },
    counties,
    criterion_5: {
      met: criterion5Met,
      hunt_property_traces_used: huntRows.length,
      navarro_rockwall_property_traces_used: allRows.length,
      county_count_with_property_rows: new Set(['Hunt'].concat(Array.from(rowsByCounty))).size,
      note: criterion5Met
        ? 'Six source-backed property-row traces across at least three counties are present.'
        : 'Six source-backed property-row traces across three counties are still not supported by the frozen evidence.'
    },
    traces: huntRows.concat(allRows).slice(0, 12)
  };
  save(path.join(outDir, 'ocr-yield.json'), report);
  console.log(JSON.stringify({
    navarro: counties[0].summary,
    rockwall: counties[1].summary,
    criterion_5: report.criterion_5,
    output: path.relative(root, path.join(outDir, 'ocr-yield.json'))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
