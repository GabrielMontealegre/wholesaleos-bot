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

const screenshotComp = require('../modules/research/screenshot-comp-evidence');
const dealBoard = require('../modules/research/free-public-deal-board');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-shotcomp-'));
const dbPath = path.join(tmpDir, 'db.json');
process.env.DB_PATH = dbPath;
fs.writeFileSync(dbPath, JSON.stringify({ leads: [] }, null, 2));

const SUBJECT = '3723 Barnabus Rd, Dallas, TX 75241';
const KEY = SUBJECT.toLowerCase();

function comp(n, overrides) {
  return Object.assign({
    address: `${3700 + n} Barnabus Rd, Dallas, TX 75241`,
    comp_address: `${3700 + n} Barnabus Rd, Dallas, TX 75241`,
    sold_status: 'sold',
    sold_price: 240000 + n * 1000,
    sold_date: '05/10/2026',
    source_url: `https://www.zillow.com/homedetails/comp-${n}_zpid/`,
    evidence_text: `Sold 05/10/2026 for $${240 + n},000 at ${3700 + n} Barnabus Rd`,
    confidence: 'Medium',
    risk_flags: []
  }, overrides || {});
}

function fakePlaywrightServing(pagesByUrl) {
  return {
    chromium: {
      launch: async () => ({
        newContext: async () => ({
          newPage: async () => ({
            setDefaultTimeout() {},
            close: async () => {},
            currentUrl: '',
            async goto(url) { this.currentUrl = url; return { status: () => (pagesByUrl[url] && pagesByUrl[url].status) || 200 }; },
            async textContent() { return (pagesByUrl[this.currentUrl] && pagesByUrl[this.currentUrl].text) || ''; },
            async screenshot(opts) { fs.writeFileSync(opts.path, 'png'); }
          })
        }),
        close: async () => {}
      })
    }
  };
}

(async () => {
  const shotDir = path.join(tmpDir, 'shots');

  // 1) Extractor mock returns 3 valid comps -> COMP_READY with evidence links.
  const readyRun = await screenshotComp.runScreenshotCompEvidence({
    rows: [{ normalized_address: SUBJECT, zillow_url: 'https://www.zillow.com/homedetails/subject_zpid/' }]
  }, {
    playwright_impl: fakePlaywrightServing({ 'https://www.zillow.com/homedetails/subject_zpid/': { text: 'sold listings page' } }),
    extractor_impl: async () => [comp(1), comp(2), comp(3)],
    screenshot_dir: shotDir
  });
  const ready = readyRun.results.get(KEY);
  assert.strictEqual(ready.screenshot_comp_status, 'COMP_READY');
  assert.strictEqual(ready.verified_comps.length, 3);
  assert.ok(ready.comp_evidence_links.length >= 1);
  assert.ok(ready.comp_evidence_links[0].screenshot_path.startsWith(shotDir), 'screenshots only in the given temp/cache dir');
  assert.ok(fs.existsSync(ready.comp_evidence_links[0].screenshot_path));
  assert.strictEqual(ready.next_comp_action, 'REVIEW_VERIFIED_COMPS_AND_CALCULATE_ARV');

  // 2) 1-2 comps -> COMP_PARTIAL; subject comp and incomplete comps rejected.
  const partialRun = await screenshotComp.runScreenshotCompEvidence({
    rows: [{ normalized_address: SUBJECT, zillow_url: 'https://www.zillow.com/homedetails/subject_zpid/' }]
  }, {
    playwright_impl: fakePlaywrightServing({ 'https://www.zillow.com/homedetails/subject_zpid/': { text: 'sold' } }),
    extractor_impl: async () => [
      comp(1),
      comp(9, { comp_address: SUBJECT, address: SUBJECT }),           // subject - rejected outright
      comp(2, { sold_price: 0 }),                                     // missing sold price - candidate only
      comp(3, { sold_date: '' })                                      // missing sold date - candidate only
    ],
    screenshot_dir: shotDir
  });
  const partial = partialRun.results.get(KEY);
  assert.strictEqual(partial.screenshot_comp_status, 'COMP_PARTIAL');
  assert.strictEqual(partial.verified_comps.length, 1);
  assert.ok(!partial.verified_comps.some((c) => c.comp_address === SUBJECT));
  assert.ok(!partial.screenshot_comp_candidates.some((c) => c.comp_address === SUBJECT), 'subject never listed as comp candidate');
  assert.ok(partial.screenshot_comp_candidates.some((c) => c.missing_fields.includes('Sold price')));
  assert.ok(partial.screenshot_comp_candidates.some((c) => c.missing_fields.includes('Sold date')));

  // 3) Uncertain AI/OCR output stays candidate-only even when fields look complete.
  const uncertainRun = await screenshotComp.runScreenshotCompEvidence({
    rows: [{ normalized_address: SUBJECT, zillow_url: 'https://www.zillow.com/homedetails/subject_zpid/' }]
  }, {
    playwright_impl: fakePlaywrightServing({ 'https://www.zillow.com/homedetails/subject_zpid/': { text: 'sold' } }),
    extractor_impl: async () => [comp(1, { confidence: 'Low (OCR uncertain)' })],
    screenshot_dir: shotDir
  });
  const uncertain = uncertainRun.results.get(KEY);
  assert.strictEqual(uncertain.screenshot_comp_status, 'COMP_CANDIDATES_ONLY');
  assert.strictEqual(uncertain.verified_comps.length, 0);
  assert.ok(uncertain.screenshot_comp_candidates[0].missing_fields.some((m) => /uncertain/i.test(m)));

  // 4) CAPTCHA/login/403 pages -> COMP_BLOCKED_PUBLIC_SOURCE, reported not bypassed.
  const blockedRun = await screenshotComp.runScreenshotCompEvidence({
    rows: [{ normalized_address: SUBJECT, zillow_url: 'https://www.zillow.com/homedetails/blocked_zpid/', redfin_url: 'https://www.redfin.com/TX/home/403' }]
  }, {
    playwright_impl: fakePlaywrightServing({
      'https://www.zillow.com/homedetails/blocked_zpid/': { text: 'Press & Hold to confirm you are a human' },
      'https://www.redfin.com/TX/home/403': { status: 403, text: '' }
    }),
    extractor_impl: async () => { throw new Error('extractor must not run on blocked pages'); },
    screenshot_dir: shotDir
  });
  const blocked = blockedRun.results.get(KEY);
  assert.strictEqual(blocked.screenshot_comp_status, 'COMP_BLOCKED_PUBLIC_SOURCE');
  assert.strictEqual(blocked.verified_comps.length, 0);
  assert.ok(blocked.blocked_sources.some((b) => b.reason === 'captcha_or_login_wall'));
  assert.ok(blocked.blocked_sources.some((b) => b.reason === 'http_403'));

  // 5) Deterministic text extractor reads visible sold cards.
  const visible = screenshotComp.extractCompCandidatesFromVisibleText(
    'Recently sold: $245,000 Sold on 05/10/2026 3720 Barnabus Rd, Dallas, TX 75241 3 bd 2 ba 1,450 sqft',
    { source_url: 'https://www.zillow.com/homedetails/x_zpid/' }
  );
  assert.strictEqual(visible.length, 1);
  assert.strictEqual(visible[0].sold_price, 245000);
  assert.strictEqual(visible[0].sold_date, '05/10/2026');
  assert.ok(/3720 Barnabus Rd/.test(visible[0].comp_address));

  // 6) Board wiring: COMP_READY unlocks ARV honestly, MAO stays locked without repair evidence;
  //    partial evidence never unlocks ARV.
  const boardRecord = {
    headline: SUBJECT,
    address: SUBJECT,
    source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
    source_family: 'preforeclosure_trustee_notice',
    motivation_type: 'preforeclosure_trustee_notice',
    motivation_evidence_text: 'NOTICE OF SUBSTITUTE TRUSTEE SALE'
  };
  const fetchStub = async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html>ok</html>', arrayBuffer: async () => Buffer.from('') });
  const evidenceImpl = (comps) => async ({ rows }) => ({
    rows_processed: rows.length,
    results: new Map([[rows[0].normalized_address.toLowerCase(), {
      screenshot_comp_status: comps.length >= 3 ? 'COMP_READY' : comps.length ? 'COMP_PARTIAL' : 'COMP_NOT_FOUND',
      verified_comps: comps,
      screenshot_comp_candidates: [],
      comp_evidence_links: [{ source_url: 'https://www.zillow.com/homedetails/x_zpid/', screenshot_path: path.join(shotDir, 'x.png') }],
      blocked_sources: [],
      next_comp_action: comps.length >= 3 ? 'REVIEW_VERIFIED_COMPS_AND_CALCULATE_ARV' : 'FIND_REMAINING_VERIFIED_COMPS',
      preview_only: true
    }]])
  });

  const boardReady = await dealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    enable_screenshot_comp_evidence: true,
    source_records: [boardRecord]
  }, { fetch_impl: fetchStub, screenshot_comp_evidence_impl: evidenceImpl([comp(1), comp(2), comp(3)]) });
  const readyRow = boardReady.free_public_deals.find((deal) => deal.normalized_address === SUBJECT);
  assert.strictEqual(readyRow.screenshot_comp_status, 'COMP_READY');
  assert.strictEqual(readyRow.verified_sold_comp_count, 3);
  assert.strictEqual(readyRow.ARV_lock_state, 'ARV_UNLOCKED_VERIFIED_COMPS');
  assert.strictEqual(readyRow.MAO_lock_state, 'MAO_LOCKED_NO_REPAIR_EVIDENCE', 'MAO stays locked without repair evidence');
  assert.ok(readyRow.arv_lock_reason.length > 5);
  assert.ok(readyRow.mao_lock_reason.length > 5);
  assert.strictEqual(boardReady.comp_ready_count, 1);
  assert.strictEqual(boardReady.arv_unlocked_count, 1);

  const boardPartial = await dealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    enable_screenshot_comp_evidence: true,
    source_records: [boardRecord]
  }, { fetch_impl: fetchStub, screenshot_comp_evidence_impl: evidenceImpl([comp(1), comp(2)]) });
  const partialRow = boardPartial.free_public_deals.find((deal) => deal.normalized_address === SUBJECT);
  assert.strictEqual(partialRow.verified_sold_comp_count, 2);
  assert.strictEqual(partialRow.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS', 'ARV never unlocks below 3 verified comps');
  assert.strictEqual(partialRow.MAO_lock_state, 'MAO_LOCKED_NO_ARV');
  assert.strictEqual(boardPartial.comp_partial_count, 1);
  assert.strictEqual(boardPartial.arv_unlocked_count, 0);

  // 7) Layer stays off unless explicitly enabled.
  const offBoard = await dealBoard.runFreePublicDealBoardPreview({
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    source_records: [boardRecord]
  }, { fetch_impl: fetchStub, screenshot_comp_evidence_impl: async () => { throw new Error('should not run'); } });
  assert.strictEqual(offBoard.screenshot_comp_enabled, false);

  // 8) Dashboard queue + UI carry the comp fields; screenshots dir is git-ignored.
  const uiSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
  assert.ok(uiSource.includes('screenshot_comp_status'));
  assert.ok(uiSource.includes('verified_comps'));
  assert.ok(uiSource.includes('next_comp_action'));
  const queueSource = fs.readFileSync(path.join(__dirname, '..', 'modules', 'research', 'deal-board-queue-service.js'), 'utf8');
  assert.ok(queueSource.includes('screenshot_comp_status'));
  assert.ok(queueSource.includes('arv_lock_reason'));
  const gitignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.ok(/^\.cache\/$/m.test(gitignore), 'screenshot cache dir must be git-ignored');

  // 9) No DB mutation anywhere in this layer.
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(dbPath, 'utf8')).leads, []);

  console.log('screenshot comp evidence tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
