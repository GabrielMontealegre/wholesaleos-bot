'use strict';

// OCR notice extraction for OPEN, OFFICIAL scanned notice documents.
// Pipeline: PDF buffer -> rendered page PNGs (headless Chromium + the pdf.js
// build bundled with pdf-parse, no new dependencies) -> tesseract.js OCR ->
// the county-configurable TX trustee notice extractor.
//
// Honesty rules:
// - OCR output is CANDIDATE text; rows exist only when the strict extractor
//   parses a complete street address from it - garbled lines yield nothing.
// - Every OCR row carries the OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED risk
//   flag and Low confidence; OCR rows never invent contacts.
// - Only official/open documents are OCRed; caps bound docs, pages, and time.
// - OCR cache lives in the git-ignored .cache directory.

const fs = require('fs');
const path = require('path');

const txTrusteeNoticeExtractor = require('./tx-trustee-notice-text-extractor');

const DEFAULT_CAPS = Object.freeze({
  max_docs: 5,
  max_pages_per_doc: 3,
  max_ms_per_doc: 30000,
  max_pdf_bytes: 6 * 1024 * 1024,
  render_scale: 2.5,
  retry_render_scale: 3.5
});

const OCR_RISK_FLAG = 'OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeCaps(caps) {
  const merged = Object.assign({}, DEFAULT_CAPS, caps || {});
  merged.max_docs = Math.max(0, Math.min(Number(merged.max_docs) || DEFAULT_CAPS.max_docs, 5));
  merged.max_pages_per_doc = Math.max(1, Math.min(Number(merged.max_pages_per_doc) || DEFAULT_CAPS.max_pages_per_doc, 3));
  merged.max_ms_per_doc = Math.max(5000, Math.min(Number(merged.max_ms_per_doc) || DEFAULT_CAPS.max_ms_per_doc, 30000));
  return merged;
}

function bundledPdfJsPaths() {
  const base = path.join(__dirname, '..', '..', 'node_modules', 'pdf-parse', 'lib', 'pdf.js');
  try {
    const versions = fs.readdirSync(base).filter((name) => /^v\d/.test(name)).sort();
    const chosen = versions.includes('v2.0.550') ? 'v2.0.550' : versions[versions.length - 1];
    if (!chosen) return null;
    const pdfPath = path.join(base, chosen, 'build', 'pdf.js');
    const workerPath = path.join(base, chosen, 'build', 'pdf.worker.js');
    if (!fs.existsSync(pdfPath) || !fs.existsSync(workerPath)) return null;
    return { pdfPath, workerPath };
  } catch (error) {
    return null;
  }
}

function ocrCacheDir(options) {
  const dir = cleanText(options && options.cache_dir) || path.join(__dirname, '..', '..', '.cache', 'ocr');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Render up to max_pages of a PDF buffer to PNG buffers inside headless
// Chromium using the bundled pdf.js. Injectable via options.render_impl.
async function renderPdfPagesToPngs(pdfBuffer, caps, options = {}) {
  if (typeof options.render_impl === 'function') return options.render_impl(pdfBuffer, caps);
  const pdfjs = bundledPdfJsPaths();
  if (!pdfjs) throw new Error('bundled_pdfjs_unavailable');
  let playwright = options.playwright_impl;
  if (!playwright) playwright = require('playwright');
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ path: pdfjs.pdfPath });
    const workerCode = fs.readFileSync(pdfjs.workerPath, 'utf8');
    const dataUrls = await page.evaluate(async ({ pdfBase64, workerCode, maxPages, scale, preprocess }) => {
      const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
      const raw = atob(pdfBase64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      const out = [];
      const pages = Math.min(doc.numPages, maxPages);
      for (let n = 1; n <= pages; n += 1) {
        const pdfPage = await doc.getPage(n);
        const viewport = pdfPage.getViewport(scale);
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        if (preprocess) {
          // Simple safe preprocessing: grayscale + contrast boost.
          const flat = document.createElement('canvas');
          flat.width = canvas.width;
          flat.height = canvas.height;
          const ctx = flat.getContext('2d');
          ctx.filter = 'grayscale(1) contrast(1.6)';
          ctx.drawImage(canvas, 0, 0);
          out.push(flat.toDataURL('image/png'));
        } else {
          out.push(canvas.toDataURL('image/png'));
        }
      }
      return out;
    }, {
      pdfBase64: pdfBuffer.toString('base64'),
      workerCode,
      maxPages: caps.max_pages_per_doc,
      scale: caps.render_scale,
      preprocess: caps.preprocess === true
    });
    return dataUrls.map((dataUrl) => Buffer.from(String(dataUrl).split(',')[1] || '', 'base64'));
  } finally {
    await browser.close().catch(() => {});
  }
}

// OCR a PNG buffer to text via tesseract.js. Injectable via options.ocr_impl.
async function ocrPngToText(pngBuffer, options = {}) {
  if (typeof options.ocr_impl === 'function') return options.ocr_impl(pngBuffer);
  const Tesseract = require('tesseract.js');
  const result = await Tesseract.recognize(pngBuffer, 'eng', { cachePath: ocrCacheDir(options) });
  return {
    text: String(result && result.data && result.data.text || ''),
    confidence: Number(result && result.data && result.data.confidence || 0) || 0
  };
}

// Deterministic OCR text cleanup - STRUCTURAL fixes only, never data.
// Labels are normalized (they are not property facts); numeric-shaped tokens
// get standard character-class substitutions (T/O/I/l confusions) and are
// kept ONLY when the result matches a real Texas zip shape - otherwise the
// original garble stays and the extractor correctly refuses it.
function cleanupOcrText(text) {
  let out = String(text || '');
  out = out.replace(/\b(?:Adress|Addres|Adres|Adar|Addross|Addrass)\b/gi, 'Address');
  out = out.replace(/\b(?:Propert[vy]|Praperty|Proporty|Peoperty)\b/gi, 'Property');
  out = out.replace(/\bT\s?X\b/g, 'TX');
  out = out.replace(/\b([TIlO0-9]{5})\b/g, (token) => {
    if (/^\d{5}$/.test(token)) return token;
    const repaired = token.replace(/T/g, '7').replace(/O/g, '0').replace(/[Il]/g, '1');
    return /^7[3-9]\d{3}$/.test(repaired) ? repaired : token;
  });
  return out;
}

function rowConfidenceLevel(row, textQuality) {
  if (cleanText(row.address) && cleanText(row.sale_date) && textQuality >= 75) return 'medium';
  return 'low';
}

function tagOcrRow(row, meta) {
  return Object.assign({}, row, {
    extraction_method: 'ocr_trustee_notice_extraction',
    extraction_confidence: rowConfidenceLevel(row, meta.confidence) === 'medium' ? 'Medium' : 'Low',
    ocr_confidence: meta.confidence,
    ocr_confidence_level: rowConfidenceLevel(row, meta.confidence),
    ocr_source: true,
    ocr_pass: meta.pass || 1,
    risk_flags: [].concat(row.risk_flags || [], OCR_RISK_FLAG),
    missing_evidence: [].concat(row.missing_evidence || [], 'human review of OCR-read notice text'),
    source_reference: cleanText(`${row.source_reference || ''} (OCR of scanned official document)`)
  });
}

// documents: [{ url, buffer, profile }] - already fetched, official, open.
async function runOcrNoticeExtraction(input = {}, options = {}) {
  const caps = normalizeCaps(input.caps || options.caps);
  const documents = (Array.isArray(input.documents) ? input.documents : []).slice(0, caps.max_docs);
  const diagnostics = {
    ocr_documents_attempted: 0,
    ocr_documents_succeeded: 0,
    ocr_rows_extracted: 0,
    ocr_rows_with_address: 0,
    ocr_rows_with_sale_date: 0,
    ocr_skipped_oversize: 0,
    ocr_failures: 0,
    ocr_retry_documents: 0,
    ocr_retry_rows_extracted: 0,
    ocr_rows_rejected_low_confidence: 0,
    ocr_text_quality_score: 0,
    ocr_address_parse_failures: 0,
    ocr_date_parse_failures: 0
  };
  const rows = [];
  const attempts = [];
  const qualityScores = [];

  async function ocrPass(doc, passCaps, started) {
    const pngs = await renderPdfPagesToPngs(doc.buffer, passCaps, options);
    let text = '';
    let confidence = 0;
    for (const png of pngs) {
      if (Date.now() - started > caps.max_ms_per_doc) break;
      const ocr = await ocrPngToText(png, options);
      text += `\n${ocr.text}`;
      confidence = Math.max(confidence, ocr.confidence);
    }
    return { text, confidence };
  }

  function extractRows(text, doc, confidence, pass) {
    const profile = doc.profile || {};
    return txTrusteeNoticeExtractor.extractTrusteeNoticeRows(cleanupOcrText(text), {
      county: profile.county,
      state: profile.state || 'TX',
      city_names: profile.city_names,
      excluded_address_pattern: profile.excluded_address_pattern,
      max_rows: 10
    }, {
      source_url: cleanText(doc.source_url || profile.source_url),
      source_proof_url: doc.url,
      source_reference: `official ${cleanText(profile.county) || 'county'} County scanned notice (OCR)`
    }).map((row) => tagOcrRow(row, { confidence, pass }));
  }

  for (const doc of documents) {
    const url = cleanText(doc && doc.url);
    if (!url || !doc.buffer || !doc.buffer.length) continue;
    doc.url = url;
    if (doc.buffer.length > caps.max_pdf_bytes) {
      diagnostics.ocr_skipped_oversize += 1;
      attempts.push({ url, status: 'skipped_oversize' });
      continue;
    }
    diagnostics.ocr_documents_attempted += 1;
    const started = Date.now();
    try {
      // Pass 1: normal scale.
      const first = await ocrPass(doc, caps, started);
      let docRows = extractRows(first.text, doc, first.confidence, 1);
      let confidence = first.confidence;
      let passUsed = 1;
      // Pass 2 (retry): higher scale + grayscale/contrast, only when the
      // first pass found nothing and the per-doc time budget allows.
      if (!docRows.length && Date.now() - started < caps.max_ms_per_doc) {
        diagnostics.ocr_retry_documents += 1;
        const second = await ocrPass(doc, Object.assign({}, caps, { render_scale: caps.retry_render_scale, preprocess: true }), started);
        const retryRows = extractRows(second.text, doc, second.confidence, 2);
        if (retryRows.length) {
          docRows = retryRows;
          confidence = second.confidence;
          passUsed = 2;
          diagnostics.ocr_retry_rows_extracted += retryRows.length;
        }
      }
      // Reject rows whose OCR confidence is too low to trust at all.
      const kept = [];
      for (const row of docRows) {
        if ((Number(row.ocr_confidence) || 0) < 45) diagnostics.ocr_rows_rejected_low_confidence += 1;
        else kept.push(row);
      }
      diagnostics.ocr_documents_succeeded += 1;
      qualityScores.push(confidence);
      diagnostics.ocr_rows_extracted += kept.length;
      diagnostics.ocr_rows_with_address += kept.filter((row) => cleanText(row.address)).length;
      diagnostics.ocr_rows_with_sale_date += kept.filter((row) => cleanText(row.sale_date)).length;
      if (!kept.some((row) => cleanText(row.address))) diagnostics.ocr_address_parse_failures += 1;
      diagnostics.ocr_date_parse_failures += kept.filter((row) => cleanText(row.address) && !cleanText(row.sale_date)).length;
      attempts.push({ url, status: 'ocr_done', ms: Date.now() - started, confidence, pass: passUsed, rows: kept.length });
      for (const row of kept) rows.push(row);
    } catch (error) {
      diagnostics.ocr_failures += 1;
      attempts.push({ url, status: 'ocr_failed', reason: cleanText(error && error.message).slice(0, 80) });
    }
  }
  diagnostics.ocr_text_quality_score = qualityScores.length
    ? Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length)
    : 0;
  return { rows, diagnostics, attempts, preview_only: true, should_ingest: false };
}

module.exports = {
  DEFAULT_CAPS,
  OCR_RISK_FLAG,
  runOcrNoticeExtraction,
  renderPdfPagesToPngs,
  ocrPngToText,
  cleanupOcrText
};
