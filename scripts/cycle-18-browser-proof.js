'use strict';

// Local synthetic harness: real packet service and dashboard JS, no production server.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const proof = path.resolve(root, process.env.CYCLE_BROWSER_PROOF_DIR || 'exports/cycle-18-proof');
const harnessPage = process.env.CYCLE_BROWSER_PROOF_PAGE === 'dashboard' ? 'dashboard' : 'findme_scout';
fs.mkdirSync(proof, { recursive: true });
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'cycle18-synthetic-'));
process.env.DB_PATH = path.join(isolated, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(isolated, 'snapshot.json');
process.env.MANUAL_EVIDENCE_PACKETS_PATH = path.join(isolated, 'packets.json');
process.env.MANUAL_EVIDENCE_SCREENSHOTS_DIR = path.join(isolated, 'images');
const today = new Date().toISOString().slice(0, 10);
const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const row = {
  queue_key: 'SYNTHETIC-TEST-ONLY', synthetic_test_data: true,
  headline: 'SYNTHETIC TEST ONLY - not a real lead', normalized_address: '100 Synthetic St, Dallas, TX 75201',
  ...market, source_family: 'preforeclosure_trustee_notice', quality_bucket: 'INSPECT_NOW',
  owner_clue: 'SYNTHETIC TEST PERSON', row_state: 'MAIL_READY',
  owner_record: { owner_name: 'SYNTHETIC TEST PERSON', owner_role: 'owner_of_record' },
  mailing_route: { route_kind: 'mailing_address', value: '100 Synthetic St, Dallas, TX 75201', source_kind: 'official_public_record', source_url: 'https://county.example.gov/SYNTHETIC', evidence_text: 'SYNTHETIC TEST ONLY mailing evidence.' },
  source_url: 'https://county.example.gov/SYNTHETIC', source_document_url: 'https://county.example.gov/SYNTHETIC.pdf',
  last_seen_at: today, status_evidence_text: 'SYNTHETIC TEST ONLY - current event status unconfirmed',
  lifecycle_status: { status: 'FRESH', quarantined: false },
  missing_fields: ['3 verified sold comps', 'current sale status'], preview_only: true, should_ingest: false, not_a_saved_lead: true
};
const snapshot = { version: 1, markets: { 'dallas|dallas|tx': { market, rows: [row] } } };
fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify(snapshot));
const service = require('../modules/research/manual-evidence-packet-service');
const express = require('express');
const app = express();
const upload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: service.MAX_UPLOAD_BYTES } });
let uploadCount = 0;
app.get('/', (req, res) => res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cycle 20 SYNTHETIC TEST ONLY</title><style>body{margin:0;font:14px Arial;background:#fafafa;color:#191919}h1{font-size:20px;padding:16px;margin:0;background:#ffeb9c}*,*:before,*:after{box-sizing:border-box}#content{max-width:1400px;margin:auto}</style></head><body><h1>SYNTHETIC TEST ONLY - not a real lead</h1><main id="content"></main><script>window.APP={page:' + JSON.stringify(harnessPage) + '};window._uid="synthetic-test-operator";</script><script src="/dashboard/wos-public-deals.js"></script></body></html>'));
app.get('/dashboard/wos-public-deals.js', (req, res) => res.sendFile(path.join(root, 'dashboard/wos-public-deals.js')));
app.get('/api/dashboard/free-public-deal-board/latest', (req, res) => res.json({ ok: true, has_snapshot: true, market, rows: [row], counts: {}, source_coverage: [], auto_run: { enabled: false }, manual_evidence_packet: service.latestManualEvidenceSnapshot({ market }, { today_iso: today }) }));
app.post('/api/dashboard/free-public-deal-board/manual-evidence/upload', upload.single('screenshot'), async (req, res) => {
  uploadCount++;
  try { res.json(await service.uploadScreenshot({ ...req.body, market: JSON.parse(req.body.market), filename: req.file?.originalname, buffer: req.file?.buffer }, { ocr_impl: async () => 'SYNTHETIC TEST ONLY 100 Synthetic St, Dallas, TX 75201' })); }
  catch (error) { res.status(error.status || 400).json({ ok: false, error: error.message, code: error.code }); }
});
app.use((req, res) => res.status(404).json({ error: 'No batch, contact, production or other endpoints exist in this isolated harness.' }));

async function main() {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  let browserRuntime;
  try {
    const launched = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
    browser = launched.browser;
    browserRuntime = launched.runtime;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    const external = [];
    await context.route('**/*', (route) => { if (route.request().url().startsWith(url + '/')) return route.continue(); external.push(route.request().url()); return route.abort(); });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await page.locator('.wos-packet-readiness').waitFor();
    const card = page.locator('.wos-manual-evidence-card').first();
    assert((await card.innerText()).includes('Can contact: YES'));
    assert((await card.innerText()).includes('Can value: NO'));
    await page.screenshot({ path: path.join(proof, 'synthetic-desktop-packet.png'), fullPage: true });
    const slot = card.locator('.wos-manual-upload-slot').first();
    await slot.locator('.wos-manual-source-url').fill('https://county.example.gov/SYNTHETIC');
    await slot.locator('input[type=file]').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') });
    await slot.locator('.wos-manual-upload').click();
    await page.getByText(/Could not upload:/).waitFor();
    await card.screenshot({ path: path.join(proof, 'synthetic-failed-upload.png') });
    const imagePage = await context.newPage();
    await imagePage.setContent('<h1>SYNTHETIC TEST ONLY</h1><p>100 Synthetic St, Dallas, TX 75201</p>');
    const png = await imagePage.screenshot(); await imagePage.close();
    for (let i = 0; i < 2; i++) {
      const s = page.locator('.wos-manual-upload-slot').first();
      await s.locator('.wos-manual-source-url').fill('https://county.example.gov/SYNTHETIC');
      await s.locator('input[type=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
      await s.locator('.wos-manual-upload').click();
      await page.locator('.wos-manual-proposal').nth(i).waitFor();
    }
    await page.reload();
    await page.locator('.wos-manual-proposal').nth(1).waitFor();
    assert((await page.locator('.wos-packet-readiness').innerText()).includes('Can value: NO'));
    assert.strictEqual(fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8'), JSON.stringify(snapshot));
    await page.locator('.wos-manual-evidence-card').screenshot({ path: path.join(proof, 'synthetic-desktop-persistence.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.wos-packet-readiness').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(proof, 'synthetic-mobile-packet.png') });
    await page.locator('.wos-manual-proposal').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(proof, 'synthetic-mobile-upload.png') });
    const overflow = await page.locator('.wos-manual-evidence-card').evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    assert.strictEqual(overflow, false, 'Packet must fit mobile width');
    assert.deepStrictEqual(errors, []); assert.deepStrictEqual(external, []);
    fs.writeFileSync(path.join(proof, 'browser-results.json'), JSON.stringify({ data_kind: 'SYNTHETIC_TEST_ONLY', page: harnessPage, runtime: browserRuntime, failed_upload_rejected: true, duplicate_unconfirmed_uploads_count: 2, duplicate_uploads_do_not_unlock_comps: true, persistence_after_refresh: true, snapshot_unchanged: true, upload_requests: uploadCount, page_errors: errors, external_requests: external, mobile_overflow: overflow }, null, 2));
    console.log('Local browser proof passed; 4 screenshots captured; no external requests.');
  } finally { if (browser) await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
