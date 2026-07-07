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

const previewScript = require('../scripts/preview-dallas-foreclosure-source');
const sourceAcquisitionOrchestrator = require('../modules/research/source-acquisition-orchestrator');
const foreclosureAcquisitionAdapter = require('../modules/sources/dallas-foreclosure-acquisition-adapter');
const sourceAcquisitionScore = require('../modules/research/source-acquisition-score');
const leadEvidence = require('../modules/research/lead-evidence');

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function makeResponse(body, contentType = 'text/html; charset=UTF-8', status = 200, finalUrl = '') {
  const buffer = Buffer.from(String(body || ''), 'utf8');
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl,
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

function buildJob(overrides = {}) {
  return Object.assign({
    job_id: 'publicsearch_input_test',
    discovery_batch_id: 'publicsearch_input_test',
    city: 'Dallas',
    county: 'Dallas',
    state: 'TX',
    source_families: ['preforeclosure_trustee_notice'],
    source_acquisition_enabled: true,
    acquisition_core_enabled: true,
    source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
    source_document_url: '',
    source_text: '',
    source_html: '',
    input_file: '',
    source_acquisition_mode: 'live_preview'
  }, overrides);
}

async function runCore(overrides = {}, options = {}) {
  return sourceAcquisitionOrchestrator.runAcquisitionCore(
    buildJob(overrides),
    Object.assign({
      source_url: overrides.source_url || 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
      source_document_url: overrides.source_document_url || '',
      source_text: overrides.source_text || '',
      source_html: overrides.source_html || '',
      input_file: overrides.input_file || '',
      fetch_impl: options.fetch_impl
    }, options)
  );
}

function createTempFile(tmpDir, name, content) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

const countyPageUrl = 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php';
const countyPageHtml = `
  <html>
    <head><title>County Clerk | Recording Division - Find Foreclosure Notices</title></head>
    <body>
      <p>PublicSearch pointer: https://dallas.tx.publicsearch.us/</p>
    </body>
  </html>
`;

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-publicsearch-input-'));
  const dbPath = path.join(tmpDir, 'db.json');
  fs.writeFileSync(dbPath, JSON.stringify({ leads: [] }, null, 2));
  process.env.DB_PATH = dbPath;

  const files = {
    txt: createTempFile(tmpDir, 'notice.txt', [
      'NOTICE OF SUBSTITUTE TRUSTEE SALE | Property Address: 7421 Birch Ave, Dallas, TX 75228 | Borrower: Text Input Buyer | Sale Date: ' + FUTURE_SALE_DATE + ' | Case Number: 2026-12345 | Parcel: 123456789 | Cash only. Investor special.'
    ].join('\n')),
    html: createTempFile(tmpDir, 'notice.html', `
      <html><body>
        <table>
          <tr>
            <td>NOTICE OF SUBSTITUTE TRUSTEE SALE | Property Address: 7423 Birch Ave, Dallas, TX 75228 | Borrower: HTML Input Buyer | Sale Date: ${FUTURE_SALE_DATE} | Case Number: 2026-12346 | Parcel: 987654321 | As-is fixer upper.</td>
          </tr>
        </table>
      </body></html>
    `),
    csv: createTempFile(tmpDir, 'notice.csv', [
      'Property Address,Borrower,Sale Date,Case Number,Parcel,Notes',
      '"7425 Birch Ave, Dallas, TX 75228",CSV Input Buyer,' + FUTURE_SALE_DATE + ',2026-12347,111222333,"Hard money only, bring all offers."'
    ].join('\n')),
    pdf: createTempFile(tmpDir, 'notice.pdf', 'NOTICE OF SUBSTITUTE TRUSTEE SALE | Property Address: 7427 Birch Ave, Dallas, TX 75228 | Borrower: PDF Input Buyer | Sale Date: ' + FUTURE_SALE_DATE + ' | Case Number: 2026-12348 | Parcel: 444555666 | Fixer upper. Cash only.'),
    brokenPdf: createTempFile(tmpDir, 'broken.pdf', 'BROKEN_PDF')
  };

  const localTxt = await runCore({ input_file: files.txt });
  assert.strictEqual(localTxt.preview_only, true);
  assert.strictEqual(localTxt.should_ingest, false);
  assert.strictEqual(localTxt.adapter_results[0].diagnostics.input_mode, 'local_file');
  assert.strictEqual(localTxt.adapter_results[0].diagnostics.input_file_meta.basename, 'notice.txt');
  assert.ok(localTxt.adapter_results[0].diagnostics.input_file_meta.file_sha256);
  assert.ok(localTxt.adapter_results[0].diagnostics.live_source_preview.input_file_meta);
  assert.strictEqual(localTxt.adapter_results[0].diagnostics.live_source_preview.input_file_meta.basename, 'notice.txt');
  assert.ok(localTxt.candidates.length >= 1);
  assert.ok(localTxt.cards.length >= 1);
  assert.strictEqual(localTxt.candidates[0].next_best_worker, sourceAcquisitionScore.NEXT_BEST_WORKERS.SKIP_TRACE);
  assert.strictEqual(localTxt.candidates[0].lead_evidence.exact_source_phrase_verbatim, true);
  assert.ok(localTxt.candidates[0].lead_evidence.exact_source_phrase);
  assert.strictEqual(leadEvidence.dealFinderGroup(localTxt.candidates[0].lead_evidence), 'Research / Reference');
  assert.ok(!JSON.stringify(localTxt).includes(tmpDir));

  const stdinParsed = previewScript.normalizePreviewInputs(['node', 'script', '--source-text-stdin'], [
    'NOTICE OF SUBSTITUTE TRUSTEE SALE',
    'Property Address: 7431 Birch Ave, Dallas, TX 75228',
    'Borrower: Stdin Buyer',
    'Sale Date: ' + FUTURE_SALE_DATE + '',
    'Case Number: 2026-12350',
    'Parcel: 222333444',
    'Cash only.'
  ].join('\n'));
  assert.strictEqual(stdinParsed.inputMode, 'stdin_text');
  assert.ok(cleanText(stdinParsed.sourceText).includes('NOTICE OF SUBSTITUTE TRUSTEE SALE'));
  assert.throws(() => previewScript.normalizePreviewInputs(['node', 'script', '--input-file', files.txt, '--source-text-stdin'], 'text'), /conflicting_input_modes/);
  assert.strictEqual(previewScript.normalizePreviewInputs(['node', 'script', '--source-document-url', 'https://dallas.tx.publicsearch.us/documents/notice.pdf']).inputMode, 'direct_document_url');

  const txtFile = await runCore({ input_file: files.txt });
  const htmlFile = await runCore({ input_file: files.html });
  const csvFile = await runCore({ input_file: files.csv });
  const pdfFile = await runCore({ input_file: files.pdf });
  for (const result of [txtFile, htmlFile, csvFile, pdfFile]) {
    assert.strictEqual(result.preview_only, true);
    assert.strictEqual(result.should_ingest, false);
    assert.ok(result.candidates.length >= 1);
    assert.ok(result.adapter_results[0].diagnostics.input_file_meta);
    assert.ok(result.adapter_results[0].diagnostics.input_file_meta.basename);
    assert.ok(result.adapter_results[0].diagnostics.input_file_meta.file_sha256);
  }
  const brokenPdf = await runCore({ input_file: files.brokenPdf });
  assert.strictEqual(brokenPdf.candidates_found, 0);
  assert.strictEqual(brokenPdf.adapter_results[0].diagnostics.blocked_reasons.pdf_parse_failed, 1);

  const phraseMissing = await runCore({
    input_file: createTempFile(tmpDir, 'phrase-missing.txt', [
      'NOTICE OF SUBSTITUTE TRUSTEE SALE | Property Address: 7433 Birch Ave, Dallas, TX 75228 | Borrower: Missing Phrase Buyer | Sale Date: ' + FUTURE_SALE_DATE + ' | Case Number: 2026-12351 | Parcel: 555666777'
    ].join('\n'))
  });
  assert.ok(phraseMissing.candidates[0].lead_evidence.missing_evidence.includes('exact source-backed wholesale phrase'));

  const statusMissing = await runCore({
    input_file: createTempFile(tmpDir, 'status-missing.txt', [
      'NOTICE OF SUBSTITUTE TRUSTEE SALE | Property Address: 7435 Birch Ave, Dallas, TX 75228 | Borrower: Missing Status Buyer | Investor special - cash only. | Case Number: 2026-12352 | Parcel: 888999000'
    ].join('\n'))
  });
  assert.strictEqual(statusMissing.candidates[0].current_status, 'Current or plausibly current');
  assert.ok(!cleanText(statusMissing.candidates[0].sale_date));

  const directDoc = await runCore({
    source_document_url: 'https://dallas.tx.publicsearch.us/documents/notice-1.pdf',
    source_url: countyPageUrl
  }, {
    fetch_impl: (url) => {
      if (String(url) === countyPageUrl) {
        return Promise.resolve(makeResponse(countyPageHtml, 'text/html; charset=UTF-8', 200, countyPageUrl));
      }
      if (String(url) === 'https://dallas.tx.publicsearch.us/documents/notice-1.pdf') {
        return Promise.resolve(makeResponse([
          'NOTICE OF SUBSTITUTE TRUSTEE SALE',
          'Property Address: 7441 Birch Ave, Dallas, TX 75228',
          'Borrower: Direct Doc Buyer',
          'Sale Date: ' + FUTURE_SALE_DATE + '',
          'Case Number: 2026-12353',
          'Parcel: 333444555',
          'Cash only.'
        ].join('\n'), 'application/pdf', 200, 'https://dallas.tx.publicsearch.us/documents/notice-1.pdf'));
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    }
  });
  assert.strictEqual(directDoc.preview_only, true);
  assert.ok(directDoc.candidates.length >= 1);

  const portalShell = await runCore({
    source_url: 'https://dallas.tx.publicsearch.us/'
  });
  assert.strictEqual(portalShell.adapter_results[0].blocked_reason, 'portal_preview_only');
  assert.strictEqual(portalShell.preview_only, true);
  assert.strictEqual(portalShell.should_ingest, false);

  const unsafeUrl = await foreclosureAcquisitionAdapter.runDallasForeclosureAcquisitionAdapter({
    source_url: countyPageUrl,
    source_document_url: 'https://evil.example/not-approved.pdf',
    fetch_impl: (url) => {
      if (String(url) === countyPageUrl) {
        return Promise.resolve(makeResponse(countyPageHtml, 'text/html; charset=UTF-8', 200, countyPageUrl));
      }
      return Promise.resolve(makeResponse('NOT PDF', 'application/pdf', 200, String(url)));
    }
  });
  assert.ok(unsafeUrl.diagnostics.live_source_preview.document_urls_skipped.some((item) => /not_dallas_official_or_linked_source/i.test(item.reason)));

  const redirectBlocked = await foreclosureAcquisitionAdapter.runDallasForeclosureAcquisitionAdapter({
    source_url: countyPageUrl,
    source_document_url: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/redirect.pdf',
    fetch_impl: (url) => {
      if (String(url) === countyPageUrl) {
        return Promise.resolve(makeResponse(countyPageHtml, 'text/html; charset=UTF-8', 200, countyPageUrl));
      }
      if (String(url) === 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/March/redirect.pdf') {
        return Promise.resolve(makeResponse('REDIRECT PDF', 'application/pdf', 200, 'https://evil.example/redirect.pdf'));
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    }
  });
  assert.ok(redirectBlocked.diagnostics.live_source_preview.document_urls_skipped.some((item) => /redirect_host_not_allowed/i.test(item.reason)));

  const pdfBroken = await runCore({ input_file: createTempFile(tmpDir, 'broken.pdf', 'BROKEN_PDF') });
  assert.ok(pdfBroken.adapter_results[0].diagnostics.input_file_meta);
  assert.strictEqual(pdfBroken.should_ingest, false);
  assert.ok(pdfBroken.adapter_results[0].diagnostics.blocked_reasons.pdf_parse_failed || pdfBroken.adapter_results[0].diagnostics.blocked_reasons.needs_file_adapter || pdfBroken.adapter_results[0].diagnostics.blocked_reasons.no_property_rows_found);

  const oversize = createTempFile(tmpDir, 'too-big.txt', Buffer.alloc(6 * 1024 * 1024 + 1, 'a'));
  const oversizeResult = await runCore({ input_file: oversize });
  assert.strictEqual(oversizeResult.adapter_results[0].diagnostics.blocked_reasons.file_too_large, 1);

  const unsupported = createTempFile(tmpDir, 'notice.exe', 'binary');
  const unsupportedResult = await runCore({ input_file: unsupported });
  assert.strictEqual(unsupportedResult.adapter_results[0].diagnostics.blocked_reasons.unsupported_file_type, 1);

  const stale = await runCore({
    input_file: createTempFile(tmpDir, 'stale.txt', [
      'NOTICE OF SUBSTITUTE TRUSTEE SALE | Property Address: 7443 Birch Ave, Dallas, TX 75228 | Borrower: Stale Buyer | Sale Date: 01/02/2026 | Case Number: 2026-12354 | Parcel: 111000222 | Cash only.'
    ].join('\n'))
  });
  assert.strictEqual(stale.candidates_found, 0);
  assert.ok(stale.adapter_results[0].diagnostics.blocked_reasons.stale_sale_date >= 1);

  const storedDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  assert.deepStrictEqual(storedDb.leads, []);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  assert.strictEqual(fs.existsSync(tmpDir), false);
  console.log('dallas foreclosure publicsearch input tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
