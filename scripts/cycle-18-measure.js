'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Module = require('module');
const { hash } = require('./cycle-18-corpus');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'exports/cycle-18-baseline');
process.env.DB_PATH = path.join(out, 'isolated-unused-db.json');
global.fetch = async () => { throw new Error('NETWORK_DISABLED_IN_LOCAL_MEASUREMENT'); };
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

async function parseOne() {
  const body = fs.readFileSync(process.argv[3]);
  const before = performance.now();
  try {
    const parsed = await require('pdf-parse')(body);
    save(process.argv[4], { text: parsed.text, pages: parsed.numpages, status: 'PARSED', runtime_ms: performance.now() - before, max_rss_kb: process.resourceUsage().maxRSS });
  } catch (error) { save(process.argv[4], { status: 'FAILED', reason: error.message, runtime_ms: performance.now() - before, max_rss_kb: process.resourceUsage().maxRSS }); }
}

function measure() {
  const manifestBody = fs.readFileSync(path.join(out, 'manifest.json'));
  const embeddedBody = fs.readFileSync(path.join(out, 'embedded-manifest.json'));
  const manifest = JSON.parse(manifestBody);
  const embedded = JSON.parse(embeddedBody);
  const fingerprint = hash(Buffer.concat([manifestBody, embeddedBody]));
  const lockFile = path.join(out, 'corpus-lock.json');
  if (fs.existsSync(lockFile) && JSON.parse(fs.readFileSync(lockFile)).sha256 !== fingerprint) throw new Error('Frozen manifest changed');
  if (!fs.existsSync(lockFile)) save(lockFile, { sha256: fingerprint, frozen_at: new Date().toISOString(), document_count: manifest.documents.length });
  const { PROFILES } = require('../modules/sources/tx-county-foreclosure-source-profiles');
  const { extractTrusteeNoticeRows } = require('../modules/research/tx-trustee-notice-text-extractor');
  const { normalizePropertyCandidate } = require('../modules/research/property-candidate');
  // Expose the actual private transport mapper for observation; do not fork its logic.
  const boardFile = path.join(root, 'modules/research/free-public-deal-board.js');
  const boardModule = new Module(boardFile, module);
  boardModule.filename = boardFile; boardModule.paths = Module._nodeModulePaths(path.dirname(boardFile));
  boardModule._compile(fs.readFileSync(boardFile, 'utf8') + '\nmodule.exports.observedCandidateRecord = candidateRecord;\n', boardFile);
  const board = boardModule.exports;
  const queue = require('../modules/research/lead-operations-queue');
  const documents = []; const rows = [];
  fs.mkdirSync(path.join(out, 'text'), { recursive: true });
  for (const [index, doc] of manifest.documents.entries()) {
    const captured = embedded.find((item) => item.parent_url === doc.url) || doc;
    const result = { county: doc.county, document_url: doc.url, source_timestamp: doc.captured_at, ledger_status: doc.ledger_status, fetch_status: captured.fetch_status, reason: captured.reason, rows: [] };
    if (captured.fetch_status === 'PDF_CAPTURED') {
      const bodyFile = path.join(out, captured.body_file);
      if (hash(fs.readFileSync(bodyFile)) !== captured.content_sha256) throw new Error('Frozen body changed');
      const textFile = path.join(out, 'text', captured.content_sha256 + '.json');
      if (!fs.existsSync(textFile) || JSON.parse(fs.readFileSync(textFile)).reason === 'EPERM') {
        const run = spawnSync(process.execPath, [__filename, '--parse', bodyFile, textFile], { timeout: 30000, encoding: 'utf8', windowsHide: true });
        if (!fs.existsSync(textFile)) save(textFile, { status: 'FAILED', reason: run.error?.code || `worker_exit_${run.status}` });
      }
      const parsed = JSON.parse(fs.readFileSync(textFile));
      Object.assign(result, { parse_status: parsed.status, pages: parsed.pages, text_chars: parsed.text?.trim().length || 0, parse_reason: parsed.reason, runtime_ms: parsed.runtime_ms, max_rss_kb: parsed.max_rss_kb, text_file: path.relative(out, textFile) });
      const profile = PROFILES.find((p) => p.county === doc.county);
      if (profile && parsed.text) {
        const extracted = extractTrusteeNoticeRows(parsed.text, profile, { source_url: profile.source_url, source_proof_url: captured.url });
        for (const [rowIndex, raw] of extracted.entries()) {
          const candidate = normalizePropertyCandidate({ ...raw, source_id: profile.source_id, source_name: profile.source_name, source_family: 'preforeclosure_trustee_notice', motivation_type: 'preforeclosure_trustee_notice', motivation_evidence_text: raw.source_proof_text, status_evidence_text: raw.sale_date ? `Sale Date: ${raw.sale_date}` : raw.status_evidence_text }, { acquisition_run_id: 'FROZEN_LOCAL_MEASUREMENT', city: '', state: 'TX' });
          const record = board.observedCandidateRecord(candidate, profile);
          const deal = board.dealFromRecord(record, { market: { city: 'Dallas', county: 'Dallas', state: 'TX' } });
          const item = { trace_id: `${index + 1}:${rowIndex + 1}`, county: doc.county, document_url: captured.url, raw, candidate, record, deal, segment: queue.segmentKey(deal), enrichment: 'NOT_RUN_OFFLINE_NO_PARCEL_OR_CONTACT_CORPUS' };
          rows.push(item); result.rows.push(item.trace_id);
        }
      }
    }
    documents.push(result);
    console.log(`${index + 1}/66 ${doc.county}: ${result.parse_status || result.fetch_status} chars=${result.text_chars || 0} rows=${result.rows.length}`);
  }
  const groups = {};
  for (const doc of documents) {
    const group = groups[doc.county] ||= { documents: 0, pdf_captured: 0, unreachable_documents: 0, parsed_rows: 0, complete_address_rows: 0, partial_rows: 0, owner_clue_rows: 0, can_contact: 0, can_value: 0, ready_to_offer: 0 };
    group.documents++; group.pdf_captured += doc.fetch_status === 'PDF_CAPTURED' ? 1 : 0; group.unreachable_documents += doc.fetch_status === 'PDF_CAPTURED' ? 0 : 1;
  }
  for (const row of rows) { const g = groups[row.county]; g.parsed_rows++; g.complete_address_rows += row.deal.normalized_address ? 1 : 0; g.partial_rows += row.deal.normalized_address ? 0 : 1; g.owner_clue_rows += row.candidate.owner_name_candidate ? 1 : 0; }
  const report = { corpus_sha256: fingerprint, measured_at: new Date().toISOString(), scope: 'LOCAL_FROZEN_TEXT_LAYER_EXTRACTION_ONLY_NOT_LIVE', live_inventory: manifest.live_inventory, county_summary: groups, documents, rows };
  save(path.join(out, process.argv.includes('--final') ? 'final-measurement.json' : 'baseline-measurement.json'), report);
  console.log(JSON.stringify(groups, null, 2));
}

function fixtures() {
  const report = JSON.parse(fs.readFileSync(path.join(out, 'baseline-measurement.json')));
  const names = ['03', '07', '10', '17', '18'];
  const docs = report.documents.filter((doc) => doc.county === 'Hunt' && names.some((n) => doc.document_url.includes(`foreclosure-${n}.pdf`)));
  const target = path.join(root, 'tests/fixtures/cycle-18-notices.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  save(target, { kind: 'REAL_PUBLIC_PDF_TEXT_FROZEN_NOT_LIVE_LEADS', corpus_sha256: report.corpus_sha256,
    documents: docs.map((doc) => ({ url: doc.document_url, captured_at: doc.source_timestamp, text: JSON.parse(fs.readFileSync(path.join(out, doc.text_file))).text })) });
  console.log(`Generated ${docs.length} real PDF text fixtures`);
}

if (process.argv.includes('--parse')) parseOne().catch((error) => { console.error(error); process.exitCode = 1; });
else if (process.argv.includes('--fixtures')) fixtures();
else measure();
