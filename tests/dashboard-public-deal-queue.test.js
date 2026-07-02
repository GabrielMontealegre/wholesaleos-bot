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

  // 4) Server routes exist and are admin-protected; no legacy agents involved.
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(/app\.get\('\/api\/dashboard\/free-public-deal-board\/latest',\s*requireAdmin/.test(serverSource));
  assert.ok(/app\.post\('\/api\/dashboard\/free-public-deal-board\/run',\s*requireAdmin/.test(serverSource));
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

  function queueServiceRoute(suffix) {
    return '/api/dashboard/free-public-deal-board' + suffix;
  }

  console.log('dashboard public deal queue tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
