'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const vm = require('vm');

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
          suppressed_nav_chrome_by_source_id: {
            tx_dallas_county_clerk_foreclosure_notices: 3
          },
          suppressed_nav_chrome_samples: Array.from({ length: 6 }, (_, index) => ({
            source_url: `https://publicsearch.example.test/search/${index}/${'x'.repeat(140)}`,
            reason: 'bare_search_portal_root',
            source_id: 'tx_dallas_county_clerk_foreclosure_notices'
          })),
          source_adapter_results: [
            { source_id: 'tx_dallas_county_clerk_foreclosure_notices', source_name: 'Dallas County Clerk Foreclosure Notices', status: 'available', candidate_count: 2, blocked_reason: '', diagnostics: { docs_discovered: 10, docs_processed: 5 } },
            { source_id: 'tx_dallas_craigslist_owner_posts', source_name: 'Dallas Craigslist owner posts', status: 'needs_manual_review', candidate_count: 0, blocked_reason: 'no_recent_owner_posts_found', diagnostics: { docs_discovered: 0, docs_processed: 0 } }
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
  'queue must explicitly request all default free lanes including every county profile');
  assert.ok(!previewCalls[0].source_ids.includes('tx_dallas_listing_radar'), 'Listing Radar is kept registered but mothballed from the default daily queue');
  assert.ok(previewCalls[0].source_ids.includes('tx_hunt_county_foreclosure_notices'));
  assert.ok(previewCalls[0].source_ids.includes('tx_navarro_county_foreclosure_notices'));
  assert.ok(previewCalls[0].source_ids.includes('tx_hill_county_foreclosure_notices'));
  assert.ok(previewCalls[0].source_ids.includes('tx_van_zandt_county_foreclosure_notices'));
  assert.ok(previewCalls[0].source_ids.includes('tx_bell_county_foreclosure_notices'));
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
  assert.strictEqual(run1.batch.source_coverage[0].docs_discovered, 10);
  assert.strictEqual(run1.batch.source_coverage[0].docs_processed, 5);
  assert.strictEqual(run1.batch.source_coverage[0].suppressed_nav_chrome_count, 3);
  assert.strictEqual(run1.batch.source_coverage[1].blocked_reason, 'no_recent_owner_posts_found');
  assert.strictEqual(run1.batch.suppressed_nav_chrome_samples.length, 5, 'stored suppression samples must stay bounded');
  assert.ok(run1.batch.suppressed_nav_chrome_samples.every((sample) => sample.source_url.length <= 120));
  assert.ok(run1.batch.suppressed_nav_chrome_samples.every((sample) => sample.reason === 'bare_search_portal_root'));

  // Volume caps: foreclosure adapter parses more PDFs per preview now.
  const foreclosureAdapter = require('../modules/sources/dallas-foreclosure-acquisition-adapter');
  assert.ok(foreclosureAdapter.LIVE_PREVIEW_MAX_FILES >= 5, 'PDF parse cap must be raised to at least 5');
  assert.ok(foreclosureAdapter.LIVE_PREVIEW_MAX_FILES <= 6, 'PDF parse cap must stay bounded');
  assert.ok(foreclosureAdapter.LIVE_PREVIEW_MAX_ROWS >= 25, 'row cap must allow a full batch');
  const stored = JSON.parse(fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8'));
  assert.strictEqual(stored.store_kind, 'deal_board_snapshots_not_saved_leads');
  assert.strictEqual(stored.markets['dallas|dallas|tx'].batches[0].suppressed_nav_chrome_samples.length, 5, 'stored batch must retain bounded suppression samples');
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
    {
      run_impl: async (input, options) => {
        await slowRun;
        return queueService.runDealBoardBatch(input, {
          preview_impl: previewImpl,
          census_zip_resolver_impl: async () => ({ resolved: false, reason: 'test_no_network' })
        });
      }
    }
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

  // 3d) Snapshot integrity repair applies to persisted rows, not just new
  // preview output. Reads return a repaired copy; the next batch persists it.
  const integritySnapshotPath = path.join(tmpDir, 'snapshot-integrity.json');
  process.env.DEAL_BOARD_SNAPSHOTS_PATH = integritySnapshotPath;
  const integrityMarket = { city: 'Dallas', county: 'Dallas', state: 'TX' };
  const seenAt = '2026-07-12T08:00:00.000Z';
  function storedRow(overrides) {
    return Object.assign({
      queue_key: `stored|${Math.random().toString(16).slice(2)}`,
      headline: '100 Example St, Dallas, TX 75201',
      normalized_address: '100 Example St, Dallas, TX 75201',
      partial_address: '',
      maps_url: 'https://maps.example.test/pin',
      maps_search_url_review_needed: null,
      city: 'Dallas',
      county: 'Dallas',
      state: 'TX',
      quality_bucket: 'INSPECT_NOW',
      source_url: 'https://unknown.example.test/notices',
      source_document_url: 'https://unknown.example.test/notices/example.pdf',
      contact_status: 'CALL_READY',
      call_readiness: 'CALL_READY',
      next_best_action: 'CALL_SELLER',
      missing_fields: [],
      risk_flags: [],
      first_seen_at: seenAt,
      last_seen_at: seenAt,
      times_seen: 1,
      preview_only: true,
      not_a_saved_lead: true
    }, overrides || {});
  }
  const yellowA = storedRow({
    queue_key: 'stored|yellow-a',
    headline: '1111 Yellow Jacket Ln, Rockwall, TX 75032',
    normalized_address: '1111 Yellow Jacket Ln, Rockwall, TX 75032',
    county: 'Dallas',
    source_document_url: 'https://www.rockwallcountytexas.com/DocumentCenter/View/101',
    first_seen_at: '2026-07-01T08:00:00.000Z',
    owner_clue: 'Richer evidence'
  });
  const yellowB = storedRow({
    queue_key: 'stored|yellow-b',
    headline: '1111 Yellow Jacket Ln, Rockwall, TX 75032',
    normalized_address: '1111 Yellow Jacket Ln, Rockwall, TX 75032',
    county: 'Dallas',
    source_document_url: 'https://www.rockwallcountytexas.com/DocumentCenter/View/102',
    first_seen_at: '2026-07-02T08:00:00.000Z'
  });
  const prefixRow = storedRow({
    queue_key: 'stored|prefix',
    headline: '05825 320 Leopold Trl, Greenville, TX 75402',
    normalized_address: '05825 320 Leopold Trl, Greenville, TX 75402',
    city: 'Greenville',
    county: 'Hunt',
    source_document_url: 'https://apps.huntcounty.net/foreclosures/showdoc.asp?id=1'
  });
  const storedIntegrity = {
    version: 1,
    store_kind: 'deal_board_snapshots_not_saved_leads',
    updated_at: seenAt,
    markets: {
      'dallas|dallas|tx': {
        market: integrityMarket,
        rows: [
          prefixRow,
          yellowA,
          yellowB,
          storedRow({ queue_key: 'stored|rockwall', normalized_address: '309 Mohan Dr, Royse City, TX 75189', headline: '309 Mohan Dr, Royse City, TX 75189', county: 'Dallas', city: 'Royse City', source_document_url: 'https://www.rockwallcountytexas.com/DocumentCenter/View/103' }),
          storedRow({ queue_key: 'stored|hunt', normalized_address: '116 Comanche Dr, Greenville, TX 75402', headline: '116 Comanche Dr, Greenville, TX 75402', county: 'Dallas', city: 'Greenville', source_document_url: 'https://apps.huntcounty.net/foreclosures/showdoc.asp?id=2' }),
          storedRow({ queue_key: 'stored|unproven', normalized_address: '400 Example St, Dallas, TX 75201', headline: '400 Example St, Dallas, TX 75201', county: 'Dallas', source_document_url: '', source_url: 'https://unverified.example.test/property/400' }),
          storedRow({ queue_key: 'stored|six', normalized_address: '500 Example St, Dallas, TX 75201', headline: '500 Example St, Dallas, TX 75201' }),
          storedRow({ queue_key: 'stored|seven', normalized_address: '600 Example St, Dallas, TX 75201', headline: '600 Example St, Dallas, TX 75201' })
        ],
        batches: []
      }
    }
  };
  fs.writeFileSync(integritySnapshotPath, JSON.stringify(storedIntegrity, null, 2));
  const diskBeforeRead = fs.readFileSync(integritySnapshotPath, 'utf8');
  const repairedRead = queueService.latestDealBoardSnapshot({ market: integrityMarket });
  const readPrefix = repairedRead.rows.find((row) => row.queue_key === 'stored|prefix');
  assert.strictEqual(readPrefix.normalized_address, '');
  assert.strictEqual(readPrefix.partial_address, '05825 320 Leopold Trl, Greenville, TX 75402');
  assert.strictEqual(readPrefix.headline, '05825 320 Leopold Trl, Greenville, TX 75402');
  assert.strictEqual(readPrefix.maps_url, null);
  assert.ok(readPrefix.maps_search_url_review_needed);
  assert.strictEqual(readPrefix.quality_bucket, 'NEEDS_ZIP_REVIEW');
  assert.strictEqual(readPrefix.contact_status, 'ADDRESS_VERIFICATION_REQUIRED');
  assert.strictEqual(readPrefix.call_readiness, 'NEEDS_PROPERTY_IDENTITY');
  assert.ok(readPrefix.risk_flags.includes('ADDRESS_PREFIX_SUSPECTED_VERIFY_DOCUMENT'));
  assert.strictEqual(repairedRead.rows.find((row) => row.queue_key === 'stored|rockwall').county, 'Rockwall');
  assert.strictEqual(repairedRead.rows.find((row) => row.queue_key === 'stored|hunt').county, 'Hunt');
  assert.strictEqual(repairedRead.rows.find((row) => row.queue_key === 'stored|unproven').county, 'Dallas', 'no official host proof must not change county');
  assert.strictEqual(fs.readFileSync(integritySnapshotPath, 'utf8'), diskBeforeRead, 'read path must not write the snapshot');

  let censusCalls = 0;
  const censusResolver = async (input) => {
    censusCalls += 1;
    const street = input.street_or_partial;
    if (street.includes('Yellow Jacket')) return { resolved: true, matched_address: '1111 Yellow Jacket Ln, Rockwall, TX 75032' };
    return { resolved: true, matched_address: `Census ${street}` };
  };
  const emptyPreview = async () => ({ free_public_deals: [], rejected_generic_count: 0 });
  const repairedBatch = await queueService.runDealBoardBatch(
    { market: integrityMarket, limit: 25 },
    { preview_impl: emptyPreview, census_zip_resolver_impl: censusResolver }
  );
  assert.strictEqual(censusCalls, 5, 'stored Census backfill must cap lookups at five per batch');
  assert.strictEqual(repairedBatch.rows.length, 7, 'only exact Census duplicates may collapse');
  const persistedPrefix = repairedBatch.rows.find((row) => row.queue_key === 'stored|prefix');
  assert.strictEqual(persistedPrefix.normalized_address, '');
  assert.strictEqual(persistedPrefix.maps_url, null);
  assert.strictEqual(persistedPrefix.next_best_action, 'VERIFY_ADDRESS_FROM_SOURCE_DOCUMENT');
  assert.ok(persistedPrefix.missing_fields.includes('verified street number and spelling (check source document)'));
  const mergedYellow = repairedBatch.rows.find((row) => row.census_matched_address === '1111 Yellow Jacket Ln, Rockwall, TX 75032');
  assert.ok(mergedYellow);
  assert.strictEqual(mergedYellow.merged_duplicate_count, 1);
  assert.strictEqual(mergedYellow.first_seen_at, '2026-07-01T08:00:00.000Z');
  assert.strictEqual(mergedYellow.source_document_urls.length, 2);
  assert.strictEqual(repairedBatch.rows.find((row) => row.queue_key === 'stored|rockwall').county, 'Rockwall');
  assert.strictEqual(repairedBatch.rows.find((row) => row.queue_key === 'stored|hunt').county, 'Hunt');

  const flagsAfterFirstBatch = persistedPrefix.risk_flags.slice();
  const idempotentBatch = await queueService.runDealBoardBatch(
    { market: integrityMarket, limit: 25 },
    { preview_impl: emptyPreview, census_zip_resolver_impl: censusResolver }
  );
  const idempotentPrefix = idempotentBatch.rows.find((row) => row.queue_key === 'stored|prefix');
  assert.deepStrictEqual(idempotentPrefix.risk_flags, flagsAfterFirstBatch, 'second repair must not duplicate flags');
  assert.strictEqual(idempotentBatch.rows.length, repairedBatch.rows.length, 'second repair must keep row count stable');

  const unresolvedRows = [storedRow({ normalized_address: '700 Example St, Dallas, TX 75201', census_matched_address: null })];
  const unresolvedCalls = await queueService.backfillCensusKeysForStoredRows(unresolvedRows, {
    census_zip_resolver_impl: async () => ({ resolved: false, reason: 'no_census_match' })
  });
  assert.strictEqual(unresolvedCalls, 1);
  assert.strictEqual(unresolvedRows[0].census_matched_address, null, 'unresolved Census rows must remain separate');

  // 3e) Sale-date urgency is source-backed only: known date formats sort,
  // while any other source text remains visible but cannot become a deadline.
  function relativeDateIso(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function usDate(iso) {
    return `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
  }
  const yesterday = relativeDateIso(-1);
  const inThreeDays = relativeDateIso(3);
  const saleSnapshotPath = path.join(tmpDir, 'sale-date-urgency.json');
  process.env.DEAL_BOARD_SNAPSHOTS_PATH = saleSnapshotPath;
  const saleMarket = { city: 'Dallas', county: 'Dallas', state: 'TX' };
  const pastSaleRow = storedRow({
    queue_key: 'stored|passed-sale',
    headline: '500 Past Sale St, Dallas, TX 75201',
    normalized_address: '500 Past Sale St, Dallas, TX 75201',
    sale_date_or_event_date: yesterday,
    sale_date_iso: null,
    next_best_action: 'CALL_SELLER'
  });
  fs.writeFileSync(saleSnapshotPath, JSON.stringify({
    version: 1,
    store_kind: 'deal_board_snapshots_not_saved_leads',
    updated_at: seenAt,
    markets: { 'dallas|dallas|tx': { market: saleMarket, rows: [pastSaleRow], batches: [] } }
  }, null, 2));
  const saleDiskBeforeRead = fs.readFileSync(saleSnapshotPath, 'utf8');
  const saleRead = queueService.latestDealBoardSnapshot({ market: saleMarket });
  assert.strictEqual(saleRead.rows[0].sale_date_iso, yesterday);
  assert.ok(saleRead.rows[0].risk_flags.includes('SALE_DATE_PASSED_VERIFY_STATUS'));
  assert.strictEqual(saleRead.rows[0].next_best_action, 'VERIFY_SALE_STATUS_FROM_SOURCE_DOCUMENT');
  assert.strictEqual(fs.readFileSync(saleSnapshotPath, 'utf8'), saleDiskBeforeRead, 'read-time sale repair must not write the snapshot');
  assert.strictEqual(queueService.parseSaleDateIso(inThreeDays), inThreeDays);
  assert.strictEqual(queueService.parseSaleDateIso(usDate(inThreeDays)), inThreeDays);
  assert.strictEqual(queueService.parseSaleDateIso('sale on the first Tuesday'), null);

  const salePreview = async () => ({
    free_public_deals: [
      mockDeal({ headline: '101 ISO Sale St, Dallas, TX 75201', normalized_address: '101 ISO Sale St, Dallas, TX 75201', sale_date_or_event_date: inThreeDays }),
      mockDeal({ headline: '102 US Sale St, Dallas, TX 75201', normalized_address: '102 US Sale St, Dallas, TX 75201', sale_date_or_event_date: usDate(inThreeDays) }),
      mockDeal({ headline: '103 Text Sale St, Dallas, TX 75201', normalized_address: '103 Text Sale St, Dallas, TX 75201', sale_date_or_event_date: 'first Tuesday in August' })
    ],
    rejected_generic_count: 0
  });
  const saleBatch = await queueService.runDealBoardBatch(
    { market: saleMarket, limit: 25 },
    { preview_impl: salePreview, census_zip_resolver_impl: async () => ({ resolved: false, reason: 'test_no_network' }) }
  );
  const isoSale = saleBatch.rows.find((row) => row.normalized_address === '101 ISO Sale St, Dallas, TX 75201');
  const usSale = saleBatch.rows.find((row) => row.normalized_address === '102 US Sale St, Dallas, TX 75201');
  const textSale = saleBatch.rows.find((row) => row.normalized_address === '103 Text Sale St, Dallas, TX 75201');
  assert.strictEqual(isoSale.sale_date_or_event_date, inThreeDays);
  assert.strictEqual(isoSale.sale_date_iso, inThreeDays);
  assert.strictEqual(usSale.sale_date_or_event_date, usDate(inThreeDays));
  assert.strictEqual(usSale.sale_date_iso, inThreeDays);
  assert.strictEqual(textSale.sale_date_or_event_date, 'first Tuesday in August');
  assert.strictEqual(textSale.sale_date_iso, null);
  const persistedPastSale = saleBatch.rows.find((row) => row.queue_key === 'stored|passed-sale');
  assert.ok(persistedPastSale.risk_flags.includes('SALE_DATE_PASSED_VERIFY_STATUS'));
  assert.strictEqual(persistedPastSale.next_best_action, 'VERIFY_SALE_STATUS_FROM_SOURCE_DOCUMENT');
  const stableSaleBatch = await queueService.runDealBoardBatch(
    { market: saleMarket, limit: 25 },
    { preview_impl: async () => ({ free_public_deals: [], rejected_generic_count: 0 }), census_zip_resolver_impl: async () => ({ resolved: false, reason: 'test_no_network' }) }
  );
  const stablePastSale = stableSaleBatch.rows.find((row) => row.queue_key === 'stored|passed-sale');
  assert.strictEqual(stablePastSale.risk_flags.filter((flag) => flag === 'SALE_DATE_PASSED_VERIFY_STATUS').length, 1, 'passed-date flags must not duplicate');
  assert.strictEqual(stableSaleBatch.rows.length, saleBatch.rows.length, 'second batch must not change sale-date row count');

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
  assert.ok(indexHtml.includes('/dashboard/wos-public-deals.js?v=8'), 'dashboard must load the cache-busted public deals script');
  const uiSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
  assert.ok(uiSource.includes('Best Public Deals'));
  assert.ok(uiSource.includes("Today\\'s Deal Desk"));
  assert.ok(uiSource.includes('Open Deal Finder'));
  assert.ok(uiSource.includes('Next auction'));
  assert.ok(uiSource.includes('ARV_lock_state') && uiSource.includes('MAO_lock_state'));
  assert.ok(uiSource.includes('next_best_action'));
  assert.ok(uiSource.includes('seller_questions'));
  assert.ok(uiSource.includes(queueServiceRoute('/latest')) && uiSource.includes(queueServiceRoute('/run')));
  assert.ok(uiSource.includes('not saved leads'));
  assert.ok(uiSource.includes('Source coverage'), 'dashboard must render the source coverage table');
  assert.ok(uiSource.includes('docs read'), 'coverage table must show docs read counts');
  assert.ok(uiSource.includes('blocked_reason'), 'coverage table must show blocked reasons');
  assert.ok(uiSource.includes('Rejected sample'), 'coverage table must show rejected URL samples');
  assert.ok(uiSource.includes('rejected_url_samples'), 'coverage table must read rejected URL samples');
  assert.ok(uiSource.includes('today_rows'), 'dashboard must show daily rows');
  assert.ok(/type="checkbox" id="wos-public-deals-auto"(?![^>]*checked)/.test(uiSource), 'auto-refresh must exist and default OFF');
  assert.ok(uiSource.includes('Auto-refresh every 20 min'), 'auto-refresh interval must be 20 minutes');
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
  assert.ok(uiSource.includes('sale_date_iso'), 'dashboard must consume the normalized sale-date key');
  assert.ok(uiSource.includes('Sale date passed - verify status'), 'dashboard must render passed-sale verification badge');
  assert.ok(uiSource.includes('sortTopDealsRows'), 'dashboard must use the urgency comparator');
  assert.ok(uiSource.includes("window.APP && window.APP.page"), 'addon must read the active page');
  assert.ok(uiSource.includes("page === 'dashboard'"), 'addon must have a dashboard branch');
  assert.ok(uiSource.includes("page === 'findme_scout'"), 'addon must have a Deal Finder branch');
  assert.ok(uiSource.includes('removeSection'), 'addon must remove itself on non-target pages');
  assert.ok(uiSource.includes('dataset.wosTarget'), 'addon must stamp the mounted target on the section');
  assert.ok(uiSource.includes('fetchInFlight'), 'addon must guard the initial snapshot fetch');
  assert.ok(uiSource.includes('mountForCurrentPage'), 'addon must refresh from the current page state');
  assert.ok(uiSource.includes("contact_status === 'ADDRESS_VERIFICATION_REQUIRED'"), 'Dashboard top urgent must exclude address-verification rows');
  assert.ok(uiSource.includes("riskFlags.indexOf('ADDRESS_PREFIX_SUSPECTED_VERIFY_DOCUMENT')"), 'Dashboard top urgent must exclude prefix-suspected rows');
  assert.ok(uiSource.includes("riskFlags.indexOf('SALE_DATE_PASSED_VERIFY_STATUS')"), 'Dashboard top urgent must exclude passed-sale rows');
  assert.ok(uiSource.includes("chip('Actionable now'"), 'Dashboard card must show current actionable inventory before today-only activity');
  assert.ok(uiSource.includes("return 'CALL_READY'"), 'Dashboard urgent rows must label call-ready context');
  assert.ok(uiSource.includes("return 'Sale in '"), 'Dashboard urgent rows must label sale urgency context');
  assert.ok(uiSource.includes("return row.quality_bucket || 'REVIEW'"), 'Dashboard urgent rows must label their bucket context');
  assert.ok(uiSource.includes('}).slice(0, 3)'), 'Dashboard top urgent must take up to three clean rows without padding');
  assert.ok(uiSource.includes('mount nothing') || uiSource.includes('remove #wos-public-deals') || uiSource.includes('removeSection();'), 'addon must include a mount-nothing fallback');
  const uiContext = {
    window: {},
    document: { readyState: 'loading', addEventListener: () => {} },
    MutationObserver: function MutationObserver() {},
    setInterval: () => {},
    setTimeout: () => {},
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) })
  };
  vm.runInNewContext(uiSource, uiContext);
  const orderedRows = uiContext.window.__wosPublicDealsTestHooks.sortTopDealsRows([
    { headline: 'dateless', quality_bucket: 'INSPECT_NOW', contact_status: '', sale_date_iso: '' },
    { headline: 'passed', quality_bucket: 'INSPECT_NOW', contact_status: '', sale_date_iso: yesterday },
    { headline: 'upcoming', quality_bucket: 'INSPECT_NOW', contact_status: '', sale_date_iso: inThreeDays },
    { headline: 'call-ready', quality_bucket: 'INSPECT_NOW', contact_status: 'CALL_READY', sale_date_iso: '' }
  ]);
  assert.deepStrictEqual(orderedRows.map((row) => row.headline), ['call-ready', 'upcoming', 'dateless', 'passed']);
  const cleanUrgentRows = uiContext.window.__wosPublicDealsTestHooks.topUrgentAddresses([
    {
      partial_address: '02971 424 Cookston Ln, Royse City, TX 75189',
      quality_bucket: 'NEEDS_ZIP_REVIEW',
      contact_status: 'ADDRESS_VERIFICATION_REQUIRED',
      risk_flags: ['ADDRESS_PREFIX_SUSPECTED_VERIFY_DOCUMENT']
    },
    {
      normalized_address: '100 Call Ready St, Dallas, TX 75201',
      quality_bucket: 'INSPECT_NOW',
      contact_status: 'CALL_READY',
      risk_flags: []
    },
    {
      normalized_address: '200 Auction St, Dallas, TX 75202',
      quality_bucket: 'INSPECT_NOW',
      contact_status: '',
      sale_date_iso: inThreeDays,
      risk_flags: []
    },
    {
      partial_address: '300 Review St, Dallas, TX',
      quality_bucket: 'NEEDS_ZIP_REVIEW',
      contact_status: '',
      risk_flags: []
    }
  ]);
  assert.deepStrictEqual(
    cleanUrgentRows.map((row) => row.normalized_address || row.partial_address),
    ['100 Call Ready St, Dallas, TX 75201', '200 Auction St, Dallas, TX 75202', '300 Review St, Dallas, TX']
  );
  assert.ok(!cleanUrgentRows.some((row) => /02971 424 Cookston/.test(row.partial_address || '')), 'quarantined prefix row must never appear in Dashboard top urgent');
  assert.strictEqual(uiContext.window.__wosPublicDealsTestHooks.urgentContextLabel(cleanUrgentRows[0]), 'CALL_READY');
  assert.strictEqual(uiContext.window.__wosPublicDealsTestHooks.urgentContextLabel(cleanUrgentRows[1]), 'Sale in 3 days');
  assert.strictEqual(uiContext.window.__wosPublicDealsTestHooks.urgentContextLabel(cleanUrgentRows[2]), 'NEEDS_ZIP_REVIEW');

  // 7) The section must survive the app's content.innerHTML rewrites.
  assert.ok(uiSource.includes('MutationObserver'), 'section must re-mount when the app wipes #content');
  assert.ok(uiSource.includes('keepMounted'), 'section must keep itself mounted');
  assert.ok(/lastData/.test(uiSource), 'section must re-render from the cached snapshot after a wipe');
  assert.ok(uiSource.includes('fetch(API_LATEST'), 'addon must fetch only when the cache is empty');
  assert.ok(uiSource.includes("Today\\'s Deal Desk") && uiSource.includes('Dashboard summary for what is urgent now.'), 'dashboard summary card must be present');

  function queueServiceRoute(suffix) {
    return '/api/dashboard/free-public-deal-board' + suffix;
  }

  console.log('dashboard public deal queue tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
