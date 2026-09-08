'use strict';

// Reads the frozen cache only. No county request, enrichment or snapshot write.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { spawnSync, execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'exports/cycle-18-baseline');
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name)));
const baseline = read('baseline-measurement.json');
const final = read('final-measurement.json');
const manifest = read('manifest.json');
const embedded = read('embedded-manifest.json');
const profiles = require('../modules/sources/tx-county-foreclosure-source-profiles').PROFILES;
if (baseline.corpus_sha256 !== final.corpus_sha256) throw new Error('Different corpus');

function benchmark(mode) {
  const file = path.join(root, 'modules/research/tx-trustee-notice-text-extractor.js');
  const code = mode === 'before' ? execFileSync('git', ['show', '643b995:modules/research/tx-trustee-notice-text-extractor.js'], { cwd: root, encoding: 'utf8', windowsHide: true }) : fs.readFileSync(file, 'utf8');
  const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file)); loaded._compile(code, file);
  const docs = final.documents.filter((d) => d.text_file).map((d) => ({ ...d, text: read(d.text_file).text || '', profile: profiles.find((p) => p.county === d.county) }));
  const times = []; let rowCount = 0;
  for (let pass = 0; pass < 11; pass++) {
    const start = performance.now(); let count = 0;
    for (const doc of docs) if (doc.profile) count += loaded.exports.extractTrusteeNoticeRows(doc.text, doc.profile, { source_proof_url: doc.document_url }).length;
    if (pass) times.push(performance.now() - start);
    rowCount = count;
  }
  times.sort((a, b) => a - b);
  return { scope: 'EXTRACTOR_ONLY_SAME_59_CACHED_PDF_TEXTS', warmup_passes: 1, measured_passes: 10, rows_per_pass: rowCount, median_ms: +times[5].toFixed(3), max_ms: +Math.max(...times).toFixed(3), peak_process_rss_kb: process.resourceUsage().maxRSS };
}
if (process.argv.includes('--benchmark')) {
  console.log(JSON.stringify(benchmark(process.argv[3])));
  process.exit(0);
}
const lifecycle = require('../modules/research/lead-lifecycle-status');
const packet = require('../modules/research/manual-evidence-packet-service');
const increment = (counts, key) => { counts[key] = (counts[key] || 0) + 1; };
function metrics(report, county) {
  const docs = report.documents.filter((d) => !county || d.county === county);
  const rows = report.rows.filter((r) => !county || r.county === county);
  if (docs.every((d) => d.fetch_status !== 'PDF_CAPTURED')) return { status: 'UNREACHABLE', reason: 'No PDF captured under frozen allowlist; not evidence of a county access block.', unique_properties: null, complete_addresses: null, partial_or_apn_only: null, owner_identity: null, phone_routes: null, email_routes: null, mailing_routes: null, qualifying_comps: null, rejected_comps: null, lifecycle: null, missing_evidence: null, can_contact: null, can_value: null, ready_to_offer: null };
  const missing = {}; const states = {}; const axes = { can_contact: 0, can_value: 0, ready_to_offer: 0 };
  for (const item of rows) {
    for (const field of item.deal.missing_fields || []) increment(missing, field);
    increment(states, lifecycle.computeLifecycleStatus(item.deal, '2026-09-07').status);
    const readiness = packet.evaluatePacket({}, item.deal, { today_iso: '2026-09-07' }).readiness;
    for (const key of Object.keys(axes)) axes[key] += readiness[key].status === 'YES' ? 1 : 0;
  }
  return { status: 'MEASURED_TEXT_LAYER_ONLY', extracted_rows: rows.length,
    unique_properties: null, unique_properties_reason: 'Incomplete identities and unmeasured scan pages prevent a whole-corpus unique-property count.',
    distinct_nonempty_address_strings: new Set(rows.map((r) => r.deal.normalized_address).filter(Boolean)).size,
    complete_addresses: rows.filter((r) => r.deal.normalized_address).length, partial_or_apn_only: rows.filter((r) => !r.deal.normalized_address).length,
    owner_identity: 0, owner_identity_basis: 'No parcel owner proof in this source-only measurement; grantor/trustor clues are not verified current ownership.',
    phone_routes: 0, email_routes: 0, mailing_routes: 0, qualifying_comps: 0, rejected_comps: 0, rejected_comp_reasons: {},
    route_and_comp_basis: 'No supported seller routes or sold-comp candidates present on measured rows; enrichment was NOT run.',
    lifecycle: states, lifecycle_caveat: 'Computed from extracted fields only. Visual inspection confirms Sep 1 dates on all three complete properties; missing date extraction is not proof of current availability.',
    missing_evidence: missing, ...axes };
}
const timings = {};
for (const phase of ['before', 'after']) {
  const run = spawnSync(process.execPath, [__filename, '--benchmark', phase], { timeout: 300000, windowsHide: true, cwd: root, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr || run.error?.message || 'Benchmark failed');
  timings[phase] = JSON.parse(run.stdout);
}
const counties = [...new Set(manifest.documents.map((d) => d.county))].map((county) => {
  const docs = manifest.documents.filter((d) => d.county === county);
  const captured = final.documents.filter((d) => d.county === county);
  return { county, configured_market_family: 'Dallas', state: 'TX', source_timestamps: docs.map((d) => ({ url: d.url, captured_at: d.captured_at, ledger_attempted_at: d.ledger_attempted_at, embedded_captured_at: embedded.find((e) => e.parent_url === d.url)?.captured_at || null })), documents: docs.length,
    captured_pdfs: captured.filter((d) => d.fetch_status === 'PDF_CAPTURED').length,
    scans_with_ocr_unmeasured: captured.filter((d) => d.parse_status === 'PARSED' && d.text_chars === 0).length,
    before: metrics(baseline, county), after: metrics(final, county) };
});
const history = read(manifest.historical_reference.file);
const result = {
  kind: 'FROZEN_LOCAL_MEASUREMENT_NOT_LIVE_LEADS', generated_at: new Date().toISOString(), corpus_sha256: final.corpus_sha256,
  ledger_updated_at: manifest.ledger_updated_at, source_capture_started_at: manifest.started_at, root_capture_frozen_at: manifest.frozen_at,
  live_markets: Object.fromEntries(['Dallas', 'San Antonio', 'Detroit', 'San Diego', 'Los Angeles', 'Houston'].map((market) => [market, { status: 'UNREACHABLE', counts: null, reason: manifest.live_inventory.reason }])),
  before: metrics(baseline), after: metrics(final), counties,
  manual_address_accuracy: { denominator: 'All nonempty normalized board addresses in the frozen text-layer measurement; compared visually against source property locations.', before: { correct_rows: 1, total_rows: 4, incorrect_property_rows: 3, distinct_supported_properties: 1 }, after: { correct_rows: 4, total_rows: 4, incorrect_property_rows: 0, distinct_supported_properties: 3 }, all_pdf_property_recall: null, recall_reason: '33 scanned PDFs not OCR-processed; no complete manual property ground truth.' },
  extraction_benchmark: timings,
  unchanged_pdf_parse: { total_runtime_ms: +final.documents.reduce((n, d) => n + (d.runtime_ms || 0), 0).toFixed(3), largest_worker_peak_rss_kb: Math.max(...final.documents.map((d) => d.max_rss_kb || 0)), scope: 'Same cached pdf-parse outputs reused both phases; no change to parsing or OCR settings.' },
  burden: { new_dependencies: 0, installation: 'None', license: 'Repository JavaScript; existing pdf-parse MIT, Playwright Apache-2.0 and Tesseract.js Apache-2.0 unchanged.', new_provider_cost: 0, infrastructure: 'Existing local CPU/RAM and cached disk still cost resources; no production infrastructure benchmark or dollar estimate is available.' },
  historical_reference: { ...manifest.historical_reference, generated_at: history.generated_at, exported_rows: history.rows.length, board_rows: history.full_result.free_public_deals.length,
    counters: Object.fromEntries(['usable_deal_count', 'inspect_now_count', 'call_ready_count', 'free_call_ready_count', 'free_mail_ready_count', 'free_comp_ready_count', 'free_comp_partial_count', 'needs_contact_route_count', 'official_lookup_rows', 'official_lookup_ready_count', 'foreclosure_rows_from_evidence_count', 'foreclosure_rows_with_address_count', 'pdf_notice_rows_extracted', 'pdf_notice_rows_with_address'].map((key) => [key, history.full_result[key]])), not_current_inventory: true },
  trace_limit: 'Actual extracted property rows exist only for Hunt County. Administrative/scan traces in other counties are document traces, not fabricated property rows.',
  source_expansion: 'NOT_RUN: frozen address-integrity scope selected before implementation.'
};
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ benchmark: timings, accuracy: result.manual_address_accuracy, history_keys: Object.keys(history) }, null, 2));
