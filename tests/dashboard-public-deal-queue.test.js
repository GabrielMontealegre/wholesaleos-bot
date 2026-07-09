'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, parent, isMain);
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-queue-'));
process.env.DB_PATH = path.join(tmpDir, 'db.json');
process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(tmpDir, 'deal-board-snapshots.json');
fs.writeFileSync(process.env.DB_PATH, JSON.stringify({ leads: [] }, null, 2));

const queueService = require('../modules/research/deal-board-queue-service');

function mockDeal(overrides) {
  return Object.assign({
    headline: '3723 Barnabus Rd, Dallas, TX 75241',
    normalized_address: '3723 Barnabus Rd, Dallas, TX 75241',
    city: 'Dallas',
    state: 'TX',
    quality_bucket: 'INSPECT_NOW',
    source_family: 'preforeclosure_trustee_notice',
    source_url: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
    source_document_url: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/May/Dallas_1.pdf',
    best_link_to_click_first: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/May/Dallas_1.pdf',
    maps_url: 'https://maps.example/q',
    free_contact_status: 'CALL_READY',
    free_contact_routes: [{ route_kind: 'phone', value: '(888) 313-1969', route_type: 'trustee_servicer_or_official' }],
    owner_record: { owner_name: 'KILLER CAPITAL CONSULTANTS LLC', is_entity: true },
    official_lookup_status: 'OWNER_CLUE_ONLY',
    appraisal_clues: [{ value: '$153,440' }],
    verified_sold_comp_count: 0,
    call_prep: {
      contact_status: 'VISIBLE_PUBLIC_CONTACT',
      ARV_lock_state: 'ARV_LOCKED_NO_VERIFIED_COMPS',
      MAO_lock_state: 'MAO_LOCKED_NO_ARV',
      seller_questions: ['Am I speaking with the owner of 3723 Barnabus Rd, Dallas, TX 75241?']
    },
    MAO_lock_state: 'MAO_LOCKED_NO_ARV',
    call_readiness: 'CALL_READY',
    next_best_action: 'RUN_COMP_RESEARCH',
    missing_fields: ['3 verified sold comps'],
    blocked_sources: []
  }, overrides || {});
}

(async () => {
  // 1) Run creates a snapshot file, not saved leads. Limit clamps enforced.
  let previewCalls = [];
  const previewImpl = async (input) => {
    previewCalls.push(input);
    return {
      free_public_deals: [
        mockDeal({}),
        mockDeal({
          headline: 'Dallas County Clerk Foreclosure Notices - source proof 1',
          normalized_address: '',
          quality_bucket: 'SOURCE_PROOF_ONLY',
          free_contact_status: '',
          free_contact_routes: [],
          owner_record: null,
          official_lookup_status: '',
          call_readiness: '',
          next_best_action: 'VERIFY_PROPERTY_IDENTITY',
          missing_fields: ['complete property address']
        })
      ],
      rejected_generic_count: 4,
      browser_runtime_available: false,
      official_lookup_blocked_count: 1,
      board_blocker_summary: '',
      diagnostics: {
        source_adapter: {
          source_adapter_results: [
            { source_id: 'tx_dallas_county_clerk_foreclosure_notices', source_name: 'Dallas County Clerk Foreclosure Notices', status: 'available', candidate_count: 2, blocked_reason: '' },
            { source_id: 'tx_dallas_craigslist_owner_posts', source_name: 'Dallas Craigslist owner posts', status: 'needs_manual_review', candidate_count: 0, blocked_reason: 'no_recent_owner_posts_found' }
          ]
        }
      }
    };
  };

  const run1 = await queueService.runDealBoardBatch({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, limit: 99 }, { preview_impl: previewImpl });
  assert.strictEqual(previewCalls[0].limit, 25, 'limit must clamp to max 25');
  const countyProfiles = require('../modules/sources/tx-county-foreclosure-source-profiles');
  assert.deepStrictEqual(previewCalls[0].source_ids, [
    'tx_dallas_county_clerk_foreclosure_notices',
    'tx_dallas_craigslist_owner_posts',
    'tx_dallas_fsbo_contact_first'
  ].concat(countyProfiles.PROFILES.map((profile) => profile.source_id)),
  'queue must explicitly request all registered free lanes including every county profile');
  assert.ok(previewCalls[0].source_ids.includes('tx_ellis_county_foreclosure_notices'));
  assert.ok(previewCalls[0].source_ids.includes('tx_kaufman_county_foreclosure_notices'));
  assert.ok(previewCalls[0].source_ids.includes('tx_parker_county_foreclosure_notices'));
  assert.ok(previewCalls[0].source_ids.includes('tx_rockwall_county_foreclosure_notices'));
  assert.ok(previewCalls[0].source_ids.includes('tx_johnson_county_foreclosure_notices'));
  assert.strictEqual(run1.ok, true);
  assert.strictEqual(run1.snapshot_kind, 'deal_board_snapshot_not_saved_leads');
  assert.strictEqual(run1.batch.new_rows, 2);
  assert.strictEqual(run1.counts.total_rows, 2);
  assert.strictEqual(run1.counts.call_ready, 1);
  assert.strictEqual(run1.counts.inspect_now, 1);
  assert.strictEqual(run1.counts.needs_comps, 1);
  assert.ok(fs.existsSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH), 'snapshot file must exist');
  assert.strictEqual(run1.counts.today_rows, 2, 'today count must track fresh rows');
  assert.strictEqual(run1.batch.source_coverage.length, 2, 'batch must carry per-source coverage');
  assert.strictEqual(run1.batch.source_coverage[0].candidate_count, 2);
  assert.strictEqual(run1.batch.source_coverage[1].blocked_reason, 'no_recent_owner_posts_found');

  // Volume caps: foreclosure adapter parses more PDFs per preview now.
  const foreclosureAdapter = require('../modules/sources/dallas-foreclosure-acquisition-adapter');
  assert.ok(foreclosureAdapter.LIVE_PREVIEW_MAX_FILES >= 5, 'PDF parse cap must be raised to at least 5');
  assert.ok(foreclosureAdapter.LIVE_PREVIEW_MAX_FILES <= 6, 'PDF parse cap must stay bounded');
  assert.ok(foreclosureAdapter.LIVE_PREVIEW_MAX_ROWS >= 25, 'row cap must allow a full batch');
  const stored = JSON.parse(fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8'));
  assert.strictEqual(stored.store_kind, 'deal_board_snapshots_not_saved_leads');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf8')).leads, [], 'no saved-lead mutation');
  assert.ok(run1.rows.every((row) => row.not_a_saved_lead === true && row.preview_only === true));

  // limit clamps up to the minimum too
  await queueService.runDealBoardBatch({ limit: 1 }, { preview_impl: previewImpl });
  assert.strictEqual(previewCalls[1].limit, 5, 'limit must clamp to min 5');

  // 2) Dedupe: re-running with the same deals adds zero new rows and bumps times_seen.
  const run2 = await queueService.runDealBoardBatch({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, limit: 25 }, { preview_impl: previewImpl });
  assert.strictEqual(run2.batch.new_rows, 0);
  assert.ok(run2.batch.refreshed_rows >= 2);
  assert.strictEqual(run2.counts.total_rows, 2);
  const barnabus = run2.rows.find((row) => row.normalized_address === '3723 Barnabus Rd, Dallas, TX 75241');
  assert.ok(barnabus.times_seen >= 2);

  // Evidence fields survive a refresh from a weaker duplicate sighting.
  const weakerPreview = async () => ({
    free_public_deals: [mockDeal({ source_document_url: '', best_link_to_click_first: '', owner_record: null, appraisal_clues: [] })],
    rejected_generic_count: 0
  });
  const run2b = await queueService.runDealBoardBatch({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, limit: 25 }, { preview_impl: weakerPreview });
  const barnabusAfterWeak = run2b.rows.find((row) => row.normalized_address === '3723 Barnabus Rd, Dallas, TX 75241');
  assert.ok(/May\/Dallas_1\.pdf/.test(barnabusAfterWeak.source_document_url), 'document url must survive weaker refresh');
  assert.strictEqual(barnabusAfterWeak.owner_clue, 'KILLER CAPITAL CONSULTANTS LLC [entity]', 'owner clue must survive weaker refresh');
  assert.strictEqual(barnabus.owner_clue, 'KILLER CAPITAL CONSULTANTS LLC [entity]');
  assert.strictEqual(barnabus.ARV_lock_state, 'ARV_LOCKED_NO_VERIFIED_COMPS');
  assert.strictEqual(barnabus.MAO_lock_state, 'MAO_LOCKED_NO_ARV');
  assert.strictEqual(barnabus.next_best_action, 'RUN_COMP_RESEARCH');
  assert.ok(barnabus.seller_questions.length >= 1);

  // Distinct proof rows with different bodies do NOT collapse into one key.
  const keyA = queueService.dedupeKeyForDeal({ headline: 'proof A', source_url: 'https://a.gov', motivation_evidence_text: 'notice A' });
  const keyB = queueService.dedupeKeyForDeal({ headline: 'proof B', source_url: 'https://b.gov', motivation_evidence_text: 'notice B' });
  assert.notStrictEqual(keyA, keyB);

  // 3) latest returns the accumulated snapshot; unknown market is empty and honest.
  const latest = queueService.latestDealBoardSnapshot({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' } });
  assert.strictEqual(latest.has_snapshot, true);
  assert.strictEqual(latest.counts.total_rows, 2);
  assert.ok(latest.batch);
  const empty = queueService.latestDealBoardSnapshot({ market: { city: 'Austin', county: 'Travis', state: 'TX' } });
  assert.strictEqual(empty.has_snapshot, false);
  assert.strictEqual(empty.counts.total_rows, 0);
  assert.deepStrictEqual(empty.rows, []);

  // 3b) Background jobs: run returns immediately, one active job per market,
  //     status transitions to done and latest reflects the batch afterward.
  process.env.DEAL_BOARD_JOBS_PATH = path.join(tmpDir, 'deal-board-jobs.json');
  let resolveSlowRun;
  const slowRun = new Promise((resolve) => { resolveSlowRun = resolve; });
  const started = queueService.startDealBoardBatchJob(
    { market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, limit: 25 },
    { run_impl: async (input, options) => { await slowRun; return queueService.runDealBoardBatch(input, { preview_impl: previewImpl }); } }
  );
  assert.strictEqual(started.ok, true);
  assert.strictEqual(started.already_running, false);
  assert.strictEqual(started.job.status, 'running');
  assert.ok(started.job.job_id.startsWith('dbj_'));
  assert.strictEqual(started.job.not_a_saved_lead, true);

  const duplicate = queueService.startDealBoardBatchJob({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' } }, {});
  assert.strictEqual(duplicate.already_running, true, 'only one active job per market');
  assert.strictEqual(duplicate.job.job_id, started.job.job_id);

  const otherMarket = queueService.startDealBoardBatchJob(
    { market: { city: 'Austin', county: 'Travis', state: 'TX' } },
    { run_impl: async () => ({ batch: { new_rows: 0 }, counts: queueService.queueCounts([]) }) }
  );
  assert.strictEqual(otherMarket.already_running, false, 'other markets can run in parallel');

  const runningStatus = queueService.getDealBoardJob(started.job.job_id);
  assert.strictEqual(runningStatus.job.status, 'running');
  resolveSlowRun();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const doneStatus = queueService.getDealBoardJob(started.job.job_id);
  assert.strictEqual(doneStatus.job.status, 'done');
  assert.ok(doneStatus.job.result_summary.batch);
  assert.ok(doneStatus.job.result_summary.counts.total_rows >= 2);
  assert.strictEqual(queueService.getDealBoardJob('dbj_nope').ok, false);
  assert.ok(fs.existsSync(process.env.DEAL_BOARD_JOBS_PATH), 'job ledger persisted');
  assert.strictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_BOARD_JOBS_PATH, 'utf8')).store_kind, 'deal_board_batch_jobs_not_saved_leads');

  // failed job path
  const failing = queueService.startDealBoardBatchJob(
    { market: { city: 'Waco', county: 'McLennan', state: 'TX' } },
    { run_impl: async () => { throw new Error('lane exploded'); } }
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  const failedStatus = queueService.getDealBoardJob(failing.job.job_id);
  assert.strictEqual(failedStatus.job.status, 'failed');
  assert.ok(/lane exploded/.test(failedStatus.job.error));

  // OCR summary aggregation from adapter results into the batch.
  const ocrPreview = async () => ({
    free_public_deals: [],
    rejected_generic_count: 0,
    diagnostics: {
      source_adapter: {
        source_adapter_results: [
          { source_id: 'tx_rockwall_county_foreclosure_notices', source_name: 'Rockwall', county: 'Rockwall', status: 'available', candidate_count: 1, blocked_reason: '', ocr: { ocr_documents_attempted: 2, ocr_documents_succeeded: 1, ocr_rows_extracted: 1, ocr_rows_with_address: 1, ocr_rows_with_sale_date: 1, ocr_skipped_oversize: 1, ocr_failures: 0 } }
        ]
      }
    }
  });
  const ocrBatch = await queueService.runDealBoardBatch({ market: { city: 'Plano', county: 'Collin', state: 'TX' }, limit: 25 }, { preview_impl: ocrPreview });
  assert.ok(ocrBatch.batch.ocr);
  assert.strictEqual(ocrBatch.batch.ocr.ocr_documents_attempted, 2);
  assert.strictEqual(ocrBatch.batch.ocr.ocr_rows_with_address, 1);

  // 3c) Daily auto-run: default off, clamped interval, persisted state,
  //     tick respects daily cap and the one-active-job rule.
  process.env.DEAL_BOARD_AUTO_RUN_PATH = path.join(tmpDir, 'deal-board-auto-run.json');
  const initialAuto = queueService.getAutoRunStatus({ city: 'Dallas', county: 'Dallas', state: 'TX' });
  assert.strictEqual(initialAuto.enabled, false, 'auto-run defaults OFF');
  assert.strictEqual(initialAuto.not_a_saved_lead, true);

  const enabled = queueService.setAutoRun({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, enabled: true, interval_minutes: 5 }, {});
  assert.strictEqual(enabled.auto_run.enabled, true);
  assert.strictEqual(enabled.auto_run.interval_minutes, queueService.MIN_AUTO_RUN_INTERVAL_MINUTES, 'interval clamps to the 20-minute floor');
  assert.ok(enabled.auto_run.next_run_at, 'next run ETA visible');
  assert.strictEqual(enabled.auto_run.daily_cap, queueService.DAILY_AUTO_RUN_CAP);
  assert.ok(fs.existsSync(process.env.DEAL_BOARD_AUTO_RUN_PATH), 'schedule persisted');
  assert.strictEqual(JSON.parse(fs.readFileSync(process.env.DEAL_BOARD_AUTO_RUN_PATH, 'utf8')).store_kind, 'deal_board_auto_run_schedule_not_saved_leads');

  const disabled = queueService.setAutoRun({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, enabled: false }, {});
  assert.strictEqual(disabled.auto_run.enabled, false);
  assert.strictEqual(disabled.auto_run.next_run_at, null);

  // latest exposes auto_run + daily progress.
  const latestWithDaily = queueService.latestDealBoardSnapshot({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' } });
  assert.ok(latestWithDaily.auto_run, 'latest must expose auto-run state');
  assert.strictEqual(latestWithDaily.auto_run.enabled, false);
  assert.ok(latestWithDaily.daily, 'latest must expose daily progress');
  assert.ok(latestWithDaily.daily.batches_today >= 1);
  assert.ok(latestWithDaily.daily.address_rows_today >= 1);
  assert.strictEqual(typeof latestWithDaily.daily.ocr_address_rows_today, 'number');

  // 4) Server routes exist and are admin-protected; no legacy agents involved.
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(/app\.get\('\/api\/dashboard\/free-public-deal-board\/latest',\s*requireAdmin/.test(serverSource));
  assert.ok(/app\.post\('\/api\/dashboard\/free-public-deal-board\/run',\s*requireAdmin/.test(serverSource));
  assert.ok(/app\.get\('\/api\/dashboard\/free-public-deal-board\/job\/:id',\s*requireAdmin/.test(serverSource), 'job status route must be admin-protected');
  assert.ok(/startDealBoardBatchJob/.test(serverSource), 'run route must start a background job');
  assert.ok(/app\.post\('\/api\/dashboard\/free-public-deal-board\/auto-run',\s*requireAdmin/.test(serverSource), 'auto-run route must be admin-protected');
  assert.ok(/loadAutoRunFromDisk/.test(serverSource), 'server must restore the schedule on boot');
  const queueSource = fs.readFileSync(path.join(__dirname, '..', 'modules', 'research', 'deal-board-queue-service.js'), 'utf8');
  assert.ok(!/comp-agent|skip-trace-agent/.test(queueSource), 'no legacy agents');

  // 5) Dashboard renders the section: script tag wired, UI shows required fields.
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('/dashboard/wos-public-deals.js'), 'dashboard must load the public deals script');
  const uiSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
  assert.ok(uiSource.includes('Best Public Deals'));
  assert.ok(uiSource.includes('ARV_lock_state') && uiSource.includes('MAO_lock_state'));
  assert.ok(uiSource.includes('next_best_action'));
  assert.ok(uiSource.includes('seller_questions'));
  assert.ok(uiSource.includes(queueServiceRoute('/latest')) && uiSource.includes(queueServiceRoute('/run')));
  assert.ok(uiSource.includes('not saved leads'));
  assert.ok(uiSource.includes('Source coverage'), 'dashboard must render the source coverage table');
  assert.ok(uiSource.includes('blocked_reason'), 'coverage table must show blocked reasons');
  assert.ok(uiSource.includes('today_rows'), 'dashboard must show daily rows');
  assert.ok(/type="checkbox" id="wos-public-deals-auto"(?![^>]*checked)/.test(uiSource), 'auto-refresh must exist and default OFF');
  assert.ok(uiSource.includes('20 * 60 * 1000'), 'auto-refresh interval must be 20 minutes');
  assert.ok(uiSource.includes("/job/"), 'dashboard must poll the background job endpoint');
  assert.ok(uiSource.includes('Batch running'), 'dashboard must show running progress');
  assert.ok(uiSource.includes('ocr_documents_attempted'), 'dashboard must show OCR diagnostics');
  assert.ok(uiSource.includes('/auto-run'), 'dashboard toggle must drive the server-side schedule');
  assert.ok(uiSource.includes('address_rows_today'), 'dashboard must show daily progress');
  assert.ok(uiSource.includes('next_run_at'), 'dashboard must show next run ETA');
  assert.ok(uiSource.includes('last_error'), 'dashboard must surface the last auto-run error');
  assert.ok(uiSource.includes('ocr_text_quality_score'), 'dashboard must show OCR quality score');

  // 6) The three operator panels exist: Daily Deal Machine, ZIP Review, Top Deals.
  assert.ok(uiSource.includes('Daily Deal Machine'), 'dashboard must render the Daily Deal Machine panel');
  assert.ok(uiSource.includes('ZIP Review'), 'dashboard must render the ZIP Review panel');
  assert.ok(uiSource.includes('Top Deals'), 'dashboard must render the Top Deals panel');
  assert.ok(uiSource.includes('VERIFY_ZIP_FROM_SOURCE_DOCUMENT'), 'ZIP Review panel must show the verify-from-document action');
  assert.ok(uiSource.includes('Never guess or fake a zip'), 'ZIP Review panel must carry the no-fake-zip warning');
  assert.ok(uiSource.includes('maps_search_url_review_needed'), 'ZIP Review panel must use the review-labeled maps search link');
  assert.ok(uiSource.includes('Source blockers'), 'Daily Deal Machine must list source blockers');
  assert.ok(uiSource.includes('batches_today'), 'Daily Deal Machine must show batches today');
  assert.ok(uiSource.includes('ocr_address_rows_today'), 'Daily Deal Machine must show OCR rows today');
  assert.ok(uiSource.includes('CALL_READY first'), 'Top Deals must order CALL_READY rows first');

  // 7) The section must survive the app's content.innerHTML rewrites.
  assert.ok(uiSource.includes('MutationObserver'), 'section must re-mount when the app wipes #content');
  assert.ok(uiSource.includes('keepMounted'), 'section must keep itself mounted');
  assert.ok(/lastData/.test(uiSource), 'section must re-render from the cached snapshot after a wipe');

  function queueServiceRoute(suffix) {
    return '/api/dashboard/free-public-deal-board' + suffix;
  }

  console.log('dashboard public deal queue tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
