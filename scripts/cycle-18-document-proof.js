'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const root = path.resolve(__dirname, '..');
const baseline = path.join(root, 'exports/cycle-18-baseline');
const proof = path.join(root, 'exports/cycle-18-proof');
const manifest = require('../exports/cycle-18-baseline/manifest.json');
const embedded = require('../exports/cycle-18-baseline/embedded-manifest.json');
const ocr = require('../modules/research/ocr-notice-extraction');
async function main() {
  const firstScan = manifest.documents.find((d) => d.county === 'Navarro');
  let runtime;
  try { await ocr.renderPdfPagesToPngs(fs.readFileSync(path.join(baseline, firstScan.body_file)), ocr.DEFAULT_CAPS); runtime = { status: 'AVAILABLE' }; }
  catch (error) { runtime = { status: 'UNREACHABLE', reason: error.message, implication: 'Default installed Playwright expects an absent browser binary. OCR recovery yield is unmeasured, not zero. No download or product runtime change made.' }; }
  const playwright = require('playwright');
  const inspectionRuntime = { chromium: { launch: (options) => playwright.chromium.launch({ ...options, executablePath: path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1117/chrome-win/chrome.exe') }) } };
  const outputs = [];
  for (const n of ['07', '10', '17']) {
    const doc = embedded.find((d) => d.url.includes(`foreclosure-${n}.pdf`));
    const pages = await ocr.renderPdfPagesToPngs(fs.readFileSync(path.join(baseline, doc.body_file)), { ...ocr.DEFAULT_CAPS, max_pages_per_doc: 2, render_scale: 1.4 }, { playwright_impl: inspectionRuntime });
    for (const [index, png] of pages.entries()) {
      const file = `REAL-hunt-${n}-page-${index + 1}.png`;
      fs.writeFileSync(path.join(proof, file), png);
      outputs.push({ file, source_url: doc.url, source_content_sha256: doc.content_sha256, purpose: 'MANUAL_VISUAL_INSPECTION_ONLY_NOT_EXTRACTION' });
    }
  }
  fs.writeFileSync(path.join(proof, 'document-proof.json'), JSON.stringify({ default_ocr_runtime: runtime, outputs, inspection_runtime: 'Explicit installed Chromium for visual review only; scale 1.4 is display-only and does not change extraction settings.' }, null, 2));
  console.log(JSON.stringify({ runtime, rendered_pages: outputs.length }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
