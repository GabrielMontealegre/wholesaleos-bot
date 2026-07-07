'use strict';

// Fixture sale dates must stay in the future - hardcoded dates rot as the calendar advances.
const FUTURE_SALE_DATE = (() => { const d = new Date(Date.now() + 60 * 24 * 3600 * 1000); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`; })();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'pdf-parse') {
    return async (buffer) => {
      const text = Buffer.from(buffer).toString('utf8');
      if (/BROKEN_PDF/i.test(text)) throw new Error('pdf_parse_failed');
      return { text };
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');
const foreclosureAcquisitionAdapter = require('../modules/sources/dallas-foreclosure-acquisition-adapter');
const previewScript = require('../scripts/preview-dallas-foreclosure-source');

function makeResponse(body, contentType = 'text/html; charset=UTF-8', status = 200) {
  const buffer = Buffer.from(String(body || ''), 'utf8');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return /^content-type$/i.test(name) ? contentType : '';
      }
    },
    async text() {
      return buffer.toString('utf8');
    },
    async arrayBuffer() {
      return buffer;
    }
  };
}

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

const urls = {
  countyPage: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
  doc1: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/Dallas_1.pdf',
  doc2: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/Dallas_2.pdf',
  staleDoc: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/Dallas_stale.pdf',
  brokenDoc: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/Dallas_broken.pdf',
  publicSearchDoc: 'https://dallas.tx.publicsearch.us/documents/notice-1.pdf',
  unsafeDoc: 'https://evil.example/not-approved.pdf'
};

const fixtures = {
  countyPage: `
    <html>
      <head><title>County Clerk | Recording Division - Find Foreclosure Notices</title></head>
      <body>
        <p>If you are unable to locate a Notice filed on or after February 24, 2026, please use our Public Search site: https://dallas.tx.publicsearch.us/</p>
        <a href="${urls.doc1}">Dallas_1.pdf</a>
        <a href="${urls.doc2}">Dallas_2.pdf</a>
      </body>
    </html>
  `,
  countyPageNoDocs: `
    <html>
      <head><title>County Clerk | Recording Division - Find Foreclosure Notices</title></head>
      <body>
        <p>Foreclosure Notices only. No direct document links here.</p>
      </body>
    </html>
  `,
  doc1: `
    NOTICE OF SUBSTITUTE TRUSTEE SALE
    Property Address: 7421 Birch Ave, Dallas, TX 75228
    Borrower: Jane Doe
    Sale Date: ${FUTURE_SALE_DATE}
    Case Number: 2026-12345
    Parcel: 123456789
    Foreclosure sale notice. Investor special - cash only.
  `,
  doc2: `
    NOTICE OF SUBSTITUTE TRUSTEE SALE
    Property Address: 7423 Birch Ave, Dallas, TX 75228
    Borrower: John Smith
    Sale Date: ${FUTURE_SALE_DATE}
    Case Number: 2026-12346
    Parcel: 987654321
    Foreclosure sale notice. As-is fixer upper.
  `,
  staleDoc: `
    NOTICE OF SUBSTITUTE TRUSTEE SALE
    Property Address: 7425 Birch Ave, Dallas, TX 75228
    Borrower: No Date Buyer
    Sale Date: 01/02/2026
    Case Number: 2026-12347
    Parcel: 111222333
    Foreclosure sale notice. Cash only.
  `,
  brokenDoc: 'BROKEN_PDF'
};

function fetchImpl(url) {
  const key = cleanText(url);
  if (key === urls.countyPage) return Promise.resolve(makeResponse(fixtures.countyPage));
  if (key === `${urls.countyPage}?no_docs=1`) return Promise.resolve(makeResponse(fixtures.countyPageNoDocs));
  if (key === urls.doc1) return Promise.resolve(makeResponse(fixtures.doc1, 'application/pdf'));
  if (key === urls.doc2) return Promise.resolve(makeResponse(fixtures.doc2, 'application/pdf'));
  if (key === urls.staleDoc) return Promise.resolve(makeResponse(fixtures.staleDoc, 'application/pdf'));
  if (key === urls.brokenDoc) return Promise.resolve(makeResponse(fixtures.brokenDoc, 'application/pdf'));
  if (key === urls.publicSearchDoc) return Promise.resolve(makeResponse(fixtures.doc1, 'application/pdf'));
  throw new Error(`Unexpected fetch url: ${url}`);
}

function runPreview(options = {}) {
  const job = {
    job_id: options.job_id || 'dallas_foreclosure_live_preview_test',
    discovery_batch_id: options.discovery_batch_id || 'dallas_foreclosure_live_preview_test',
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX',
    source_families: ['preforeclosure_trustee_notice'],
    source_acquisition_enabled: true,
    acquisition_core_enabled: true,
    source_url: options.source_url || urls.countyPage,
    source_document_url: options.source_document_url || '',
    source_text: options.source_text || '',
    source_html: options.source_html || '',
    input_file: options.input_file || '',
    source_acquisition_mode: options.source_acquisition_mode || 'live_preview'
  };
  return sourceAcquisitionOrchestrator.runAcquisitionCore(job, {
    fetch_impl: fetchImpl,
    source_url: job.source_url,
    source_document_url: job.source_document_url,
    source_text: job.source_text,
    source_html: job.source_html,
    input_file: job.input_file
  });
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-foreclosure-preview-'));
  const dbPath = path.join(tmpDir, 'db.json');
  fs.writeFileSync(dbPath, JSON.stringify({ leads: [] }, null, 2));
  process.env.DB_PATH = dbPath;

  const live = await runPreview();
  assert.strictEqual(live.status, 'available');
  assert.strictEqual(live.should_ingest, false);
  assert.strictEqual(live.preview_only, true);
  assert.ok(Array.isArray(live.adapter_results));
  assert.ok(live.adapter_results[0]);
  const preview = live.adapter_results[0].diagnostics.live_source_preview;
  assert.ok(preview);
  assert.strictEqual(preview.source_url_checked, urls.countyPage);
  assert.strictEqual(typeof preview.publicsearch_pointer_found, 'boolean');
  assert.strictEqual(
    preview.publicsearch_preview_mode,
    preview.publicsearch_pointer_found ? 'portal_preview_only' : ''
  );
  assert.ok(preview.document_urls_found.includes(urls.doc1));
  assert.ok(preview.document_urls_found.includes(urls.doc2));
  assert.ok(preview.document_urls_parsed.includes(urls.doc1));
  assert.ok(preview.document_urls_parsed.includes(urls.doc2));
  assert.strictEqual(preview.stale_sale_date_count, 0);
  assert.ok(preview.evidence_snippets.length >= 1);
  assert.ok(live.candidates_found >= 1);
  assert.ok(live.cards.every((card) => card.preview_only === true));
  assert.ok(live.cards.every((card) => card.should_ingest === false));

  const directDoc = await runPreview({
    source_document_url: urls.publicSearchDoc
  });
  const directPreview = directDoc.adapter_results[0].diagnostics.live_source_preview;
  assert.strictEqual(directPreview.publicsearch_pointer_found, true);
  assert.ok(directPreview.document_urls_found.includes(urls.publicSearchDoc));
  assert.ok(directPreview.document_urls_parsed.includes(urls.publicSearchDoc));
  assert.ok(directDoc.candidates_found >= 1);

  const noDocs = await runPreview({ source_url: `${urls.countyPage}?no_docs=1` });
  const noDocsPreview = noDocs.adapter_results[0].diagnostics.live_source_preview;
  assert.strictEqual(noDocsPreview.document_urls_found_count, 0);
  assert.strictEqual(noDocsPreview.candidate_count, 0);
  assert.strictEqual(noDocs.status, 'needs_manual_review');

  const stale = await runPreview({
    source_document_url: urls.staleDoc
  });
  const stalePreview = stale.adapter_results[0].diagnostics.live_source_preview;
  assert.ok(stalePreview.stale_sale_date_count >= 1);
  assert.strictEqual(stale.candidates_found, 0);
  assert.ok(stalePreview.blocked_rejected_reasons.stale_sale_date >= 1);

  const unsafe = await foreclosureAcquisitionAdapter.runDallasForeclosureAcquisitionAdapter({
    source_url: urls.countyPage,
    source_document_url: urls.unsafeDoc,
    fetch_impl: fetchImpl
  });
  assert.ok(unsafe.diagnostics);
  assert.strictEqual(unsafe.preview_only, true);
  assert.ok(unsafe.diagnostics.live_source_preview);
  assert.ok(unsafe.diagnostics.live_source_preview.document_urls_skipped.some((item) => /not_dallas_official_or_linked_source/i.test(item.reason)));

  const broken = await runPreview({
    source_document_url: urls.brokenDoc
  });
  const brokenPreview = broken.adapter_results[0].diagnostics.live_source_preview;
  assert.ok(brokenPreview.document_urls_skipped.some((item) => /needs_file_adapter|pdf_parse_failed|unsupported/i.test(item.reason)));
  assert.strictEqual(broken.should_ingest, false);

  assert.strictEqual(
    previewScript.normalizePreviewInputs(['node', 'script', '--source-document-url', urls.publicSearchDoc]).inputMode,
    'direct_document_url'
  );

  const noticeTxt = path.join(tmpDir, 'publicsearch-notice.txt');
  fs.writeFileSync(noticeTxt, 'NOTICE OF SUBSTITUTE TRUSTEE SALE | Property Address: 7427 Birch Ave, Dallas, TX 75228 | Borrower: File Input Buyer | Sale Date: ' + FUTURE_SALE_DATE + ' | Case Number: 2026-12348 | Parcel: 444555666 | Cash only. Investor special.');
  const filePreview = await runPreview({
    input_file: noticeTxt
  });
  assert.strictEqual(filePreview.preview_only, true);
  assert.strictEqual(filePreview.should_ingest, false);
  assert.ok(filePreview.adapter_results[0].diagnostics.input_mode === 'local_file' || filePreview.input_mode === 'local_file');
  assert.ok(filePreview.adapter_results[0].diagnostics.input_file_meta);
  assert.strictEqual(filePreview.adapter_results[0].diagnostics.input_file_meta.basename, 'publicsearch-notice.txt');
  assert.ok(filePreview.adapter_results[0].diagnostics.input_file_meta.file_sha256);
  assert.ok(filePreview.adapter_results[0].diagnostics.live_source_preview.input_file_meta);
  assert.strictEqual(filePreview.adapter_results[0].diagnostics.live_source_preview.input_file_meta.basename, 'publicsearch-notice.txt');
  assert.ok(filePreview.candidates_found >= 1);
  assert.ok(Array.isArray(filePreview.cards) && filePreview.cards.length >= 1);

  const storedDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  assert.deepStrictEqual(storedDb.leads, []);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('dallas foreclosure live source preview tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
