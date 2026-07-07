'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'pdf-parse') return async (buffer) => ({ text: Buffer.from(buffer).toString('utf8') });
  return originalLoad.call(this, request, parent, isMain);
};

const ocrExtraction = require('../modules/research/ocr-notice-extraction');
const countyAdapter = require('../modules/sources/tx-county-foreclosure-acquisition-adapter');

const CLEAN_NOTICE_OCR_TEXT = [
  'NOTICE OF SUBSTITUTE TRUSTEE SALE',
  'Deed of Trust executed by SAM SCANNED, grantor',
  'Property Address:',
  '88 Heath Ridge Ct',
  'Rockwall, TX 75087',
  'Sale Date: 08/04/2026',
  'Instrument Number: 2026-556677'
].join('\n');

const GARBLED_OCR_TEXT = 'NOTICE OF TRUSTEE SALE Report Adar 10 POPLAX OTT DA ROCKWALL T0322 Cie eeu';

const PROFILE = { county: 'Rockwall', state: 'TX', city_names: ['Rockwall', 'Heath', 'Fate'] };

function doc(url, bytes) {
  return { url, buffer: Buffer.alloc(bytes || 1000, 1), profile: PROFILE, source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices' };
}

(async () => {
  // 1) Clean OCR text -> address/date rows with OCR risk flag and Low confidence.
  const cleanRun = await ocrExtraction.runOcrNoticeExtraction({
    documents: [doc('https://www.rockwallcountytexas.com/Archive.aspx?ADID=7689')]
  }, {
    render_impl: async () => [Buffer.from('png')],
    ocr_impl: async () => ({ text: CLEAN_NOTICE_OCR_TEXT, confidence: 88 })
  });
  assert.strictEqual(cleanRun.diagnostics.ocr_documents_attempted, 1);
  assert.strictEqual(cleanRun.diagnostics.ocr_documents_succeeded, 1);
  assert.strictEqual(cleanRun.diagnostics.ocr_rows_extracted, 1);
  assert.strictEqual(cleanRun.diagnostics.ocr_rows_with_address, 1);
  assert.strictEqual(cleanRun.diagnostics.ocr_rows_with_sale_date, 1);
  const row = cleanRun.rows[0];
  assert.ok(/88 Heath Ridge Ct/.test(row.address));
  assert.strictEqual(row.sale_date, '08/04/2026');
  assert.strictEqual(row.county, 'Rockwall');
  assert.strictEqual(row.owner_name, 'SAM SCANNED');
  assert.strictEqual(row.extraction_confidence, 'Low');
  assert.ok(row.risk_flags.includes(ocrExtraction.OCR_RISK_FLAG));
  assert.ok(row.missing_evidence.some((item) => /human review/i.test(item)));
  assert.ok(/OCR of scanned official document/.test(row.source_reference));
  assert.strictEqual(cleanRun.preview_only, true);

  // 2) Garbled OCR text -> zero rows, never a fake address.
  const garbledRun = await ocrExtraction.runOcrNoticeExtraction({
    documents: [doc('https://www.rockwallcountytexas.com/Archive.aspx?ADID=7688')]
  }, {
    render_impl: async () => [Buffer.from('png')],
    ocr_impl: async () => ({ text: GARBLED_OCR_TEXT, confidence: 60 })
  });
  assert.strictEqual(garbledRun.diagnostics.ocr_documents_succeeded, 1);
  assert.strictEqual(garbledRun.diagnostics.ocr_rows_extracted, 0);
  assert.deepStrictEqual(garbledRun.rows, []);

  // 3) Oversize skipped; 4) render failure counted; caps limit docs to 5.
  const mixedRun = await ocrExtraction.runOcrNoticeExtraction({
    documents: [
      doc('https://x.gov/a', 10 * 1024 * 1024),
      doc('https://x.gov/fail'),
      doc('https://x.gov/1'), doc('https://x.gov/2'), doc('https://x.gov/3'), doc('https://x.gov/4')
    ]
  }, {
    render_impl: async (buffer) => {
      if (buffer.length === 1000) return [Buffer.from('png')];
      return [Buffer.from('png')];
    },
    ocr_impl: (() => {
      let calls = 0;
      return async () => {
        calls += 1;
        if (calls === 1) throw new Error('ocr engine crashed');
        return { text: GARBLED_OCR_TEXT, confidence: 50 };
      };
    })()
  });
  assert.strictEqual(mixedRun.diagnostics.ocr_skipped_oversize, 1);
  assert.strictEqual(mixedRun.diagnostics.ocr_failures, 1);
  assert.ok(mixedRun.diagnostics.ocr_documents_attempted <= 5);

  // 5) Adapter wiring: scanned no-text-layer doc goes to the OCR lane and rows merge in.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-ocr-'));
  process.env.DB_PATH = path.join(tmpDir, 'db.json');
  fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));
  let ocrLaneCalls = 0;
  const adapterRun = await countyAdapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_rockwall_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    mock_search_results: [],
    fetch_impl: async (url) => {
      const u = String(url);
      if (/792\/Foreclosure-Notices/.test(u)) return {
        ok: true, status: 200,
        headers: { get: (n) => (/content-type/i.test(n) ? 'text/html' : '') },
        text: async () => '<a href="/Archive.aspx?ADID=9001">Foreclosure Notice Sept</a>',
        arrayBuffer: async () => Buffer.from('')
      };
      if (/Archive\.aspx\?AMID=83/.test(u)) return {
        ok: true, status: 200,
        headers: { get: (n) => (/content-type/i.test(n) ? 'text/html' : '') },
        text: async () => '<html></html>',
        arrayBuffer: async () => Buffer.from('')
      };
      if (/ADID=9001/.test(u)) return {
        ok: true, status: 200,
        headers: { get: (n) => (/content-type/i.test(n) ? 'application/pdf' : '') },
        text: async () => '',
        arrayBuffer: async () => Buffer.alloc(5000, 32) // no text layer via mocked pdf-parse ('...' garbage)
      };
      throw new Error(`unexpected:${u}`);
    },
    ocr_extraction_impl: async ({ documents }) => {
      ocrLaneCalls += 1;
      assert.strictEqual(documents.length, 1);
      assert.ok(/ADID=9001/.test(documents[0].url));
      return {
        rows: [{
          address: '88 Heath Ridge Ct, Rockwall, TX 75087',
          property_address: '88 Heath Ridge Ct, Rockwall, TX 75087',
          county: 'Rockwall', state: 'TX',
          sale_date: '08/04/2026', auction_date: '08/04/2026',
          source_proof_text: 'OCR notice text',
          source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
          source_document_url: documents[0].url,
          source_proof_url: documents[0].url,
          risk_flags: [ocrExtraction.OCR_RISK_FLAG],
          extraction_confidence: 'Low',
          preview_only: true, should_ingest: false
        }],
        diagnostics: { ocr_documents_attempted: 1, ocr_documents_succeeded: 1, ocr_rows_extracted: 1, ocr_rows_with_address: 1, ocr_rows_with_sale_date: 1, ocr_skipped_oversize: 0, ocr_failures: 0 },
        attempts: [{ url: documents[0].url, status: 'ocr_done' }]
      };
    }
  });
  assert.strictEqual(ocrLaneCalls, 1);
  assert.strictEqual(adapterRun.candidates.length, 1);
  assert.ok(/88 Heath Ridge Ct/.test(adapterRun.candidates[0].normalized_address || adapterRun.candidates[0].property_address));
  assert.strictEqual(adapterRun.ocr.ocr_rows_with_address, 1);
  assert.strictEqual(adapterRun.status, 'available');

  // 6) OCR lane can be disabled and profiles can opt out.
  const disabledRun = await countyAdapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_rockwall_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    mock_search_results: [],
    enable_ocr: false,
    fetch_impl: async (url) => {
      const u = String(url);
      if (/792\/Foreclosure-Notices/.test(u)) return {
        ok: true, status: 200, headers: { get: () => 'text/html' },
        text: async () => '<a href="/Archive.aspx?ADID=9001">Foreclosure Notice Sept</a>',
        arrayBuffer: async () => Buffer.from('')
      };
      if (/AMID=83/.test(u)) return { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html></html>', arrayBuffer: async () => Buffer.from('') };
      if (/ADID=9001/.test(u)) return { ok: true, status: 200, headers: { get: (n) => (/content-type/i.test(n) ? 'application/pdf' : '') }, text: async () => '', arrayBuffer: async () => Buffer.alloc(5000, 32) };
      throw new Error(`unexpected:${u}`);
    },
    ocr_extraction_impl: async () => { throw new Error('must not run when disabled'); }
  });
  assert.strictEqual(disabledRun.candidates.length, 0);
  assert.ok(disabledRun.document_urls_skipped.some((item) => item.reason === 'pdf_scanned_no_text_layer'));

  // 7) No DB mutation.
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads, []);

  console.log('ocr notice extraction tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
