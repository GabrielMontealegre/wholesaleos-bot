'use strict';

// Dashboard Deal Queue service.
// Runs capped free public deal board batches and accumulates DEDUPED rows in
// a snapshot store so the Dashboard can show a growing daily queue.
//
// The snapshot store (deal-board-snapshots.json) is NOT lead ingestion:
// nothing here touches saved leads, Analyzer, Dossier, or Pipeline. Rows are
// preview evidence Gabriel can act on; deleting the file loses nothing but a
// cache.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const freePublicDealBoardPreviewService = require('./free-public-deal-board-preview-service');

const DB_PATH = process.env.DB_PATH || './data/db.json';
const SNAPSHOT_FILE = path.resolve(
  process.env.DEAL_BOARD_SNAPSHOTS_PATH ||
  path.join(path.dirname(path.resolve(DB_PATH)), 'deal-board-snapshots.json')
);

const MAX_ROWS_PER_MARKET = 500;
const MAX_BATCHES_PER_MARKET = 60;
const MIN_BATCH_LIMIT = 5;
const MAX_BATCH_LIMIT = 25;

// Queue lanes: every registered free adapter, requested EXPLICITLY so the
// orchestrator also runs contact-first lanes that are auto_select:false.
// County foreclosure lanes come straight from the profile registry.
const txCountyForeclosureSourceProfiles = require('../sources/tx-county-foreclosure-source-profiles');
const DEFAULT_QUEUE_SOURCE_IDS = Object.freeze([
  'tx_dallas_county_clerk_foreclosure_notices',
  'tx_dallas_craigslist_owner_posts',
  'tx_dallas_fsbo_contact_first'
].concat(txCountyForeclosureSourceProfiles.PROFILES.map((profile) => profile.source_id)));

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function snapshotFilePath() {
  return path.resolve(
    process.env.DEAL_BOARD_SNAPSHOTS_PATH ||
    path.join(path.dirname(path.resolve(process.env.DB_PATH || './data/db.json')), 'deal-board-snapshots.json')
  );
}

function readStore() {
  const file = snapshotFilePath();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data && typeof data === 'object' && data.markets && typeof data.markets === 'object') return data;
  } catch (error) { /* first run or unreadable - start fresh */ }
  return { version: 1, store_kind: 'deal_board_snapshots_not_saved_leads', updated_at: null, markets: {} };
}

function writeStore(store) {
  const file = snapshotFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  store.updated_at = nowIso();
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

function marketKey(market) {
  return [
    cleanText(market && market.city).toLowerCase() || 'unknown',
    cleanText(market && market.county).toLowerCase(),
    cleanText(market && market.state).toLowerCase()
  ].join('|');
}

function rowPhone(deal) {
  const route = (Array.isArray(deal.free_contact_routes) ? deal.free_contact_routes : [])
    .find((item) => item && item.route_kind === 'phone');
  return route ? cleanText(route.value).replace(/\D/g, '') : '';
}

function dedupeKeyForDeal(deal) {
  const address = cleanText(deal.normalized_address).toLowerCase();
  if (address) return `addr|${address}`;
  const doc = cleanText(deal.source_document_url).toLowerCase();
  const src = cleanText(deal.source_url).toLowerCase();
  const phone = rowPhone(deal);
  const body = cleanText(`${deal.headline}|${deal.motivation_evidence_text}|${deal.source_proof_text}`).toLowerCase();
  return `proof|${crypto.createHash('sha1').update([doc, src, phone, body].join('|')).digest('hex').slice(0, 20)}`;
}

function projectRowForQueue(deal, dedupeKey, seenAt) {
  return {
    queue_key: dedupeKey,
    headline: cleanText(deal.headline),
    normalized_address: cleanText(deal.normalized_address),
    city: cleanText(deal.city),
    county: cleanText(deal.county),
    state: cleanText(deal.state),
    quality_bucket: cleanText(deal.quality_bucket),
    source_family: cleanText(deal.source_family),
    source_url: cleanText(deal.source_url),
    source_document_url: cleanText(deal.source_document_url),
    best_link_to_click_first: cleanText(deal.best_link_to_click_first),
    maps_url: cleanText(deal.maps_url) || null,
    zillow_url: cleanText(deal.zillow_url) || null,
    redfin_url: cleanText(deal.redfin_url) || null,
    realtor_url: cleanText(deal.realtor_url) || null,
    auction_url: cleanText(deal.auction_url) || null,
    official_property_record_url: cleanText(deal.official_property_record_url) || null,
    owner_clue: deal.owner_record && cleanText(deal.owner_record.owner_name)
      ? `${cleanText(deal.owner_record.owner_name)}${deal.owner_record.is_entity ? ' [entity]' : ''}`
      : cleanText(((deal.owner_or_entity_clues || [])[0] || {}).value),
    official_lookup_status: cleanText(deal.official_lookup_status),
    contact_status: cleanText(deal.free_contact_status || (deal.call_prep && deal.call_prep.contact_status)),
    best_contact: (() => {
      const route = (Array.isArray(deal.free_contact_routes) ? deal.free_contact_routes : []).find((item) => item && cleanText(item.value));
      if (route) return `${cleanText(route.value)} (${cleanText(route.route_type)})`;
      const visible = cleanText(deal.contact_route_if_visible);
      return /^manual/i.test(visible) ? '' : visible;
    })(),
    comp_status: cleanText(deal.free_comp_status || deal.comp_status),
    screenshot_comp_status: cleanText(deal.screenshot_comp_status),
    next_comp_action: cleanText(deal.next_comp_action),
    verified_sold_comp_count: Number(deal.verified_sold_comp_count || 0) || 0,
    verified_comps: Array.isArray(deal.verified_sold_comps) ? deal.verified_sold_comps.slice(0, 3).map((comp) => ({
      comp_address: cleanText(comp.comp_address || comp.address),
      sold_price: Number(comp.sold_price) || 0,
      sold_date: cleanText(comp.sold_date),
      source_url: cleanText(comp.source_url)
    })) : [],
    arv_lock_reason: cleanText(deal.arv_lock_reason || (deal.call_prep && deal.call_prep.ARV_lock_reason)),
    mao_lock_reason: cleanText(deal.mao_lock_reason || (deal.call_prep && deal.call_prep.MAO_lock_reason)),
    appraisal_clue: cleanText(((deal.appraisal_clues || [])[0] || {}).value),
    ARV_lock_state: cleanText(deal.call_prep && deal.call_prep.ARV_lock_state || deal.ARV_lock_state),
    MAO_lock_state: cleanText(deal.MAO_lock_state || (deal.call_prep && deal.call_prep.MAO_lock_state)),
    call_readiness: cleanText(deal.call_readiness),
    next_best_action: cleanText(deal.next_best_action),
    missing_fields: Array.isArray(deal.missing_fields) ? deal.missing_fields.slice(0, 8) : [],
    seller_questions: deal.call_prep && Array.isArray(deal.call_prep.seller_questions) ? deal.call_prep.seller_questions.slice(0, 8) : [],
    blocked_sources: [].concat(deal.blocked_sources || [], deal.browser_blocked_sources || [])
      .map((item) => ({ source: cleanText(item && item.source), reason: cleanText(item && item.reason) })).slice(0, 6),
    first_seen_at: seenAt,
    last_seen_at: seenAt,
    times_seen: 1,
    preview_only: true,
    not_a_saved_lead: true
  };
}

function ocrSummaryFromPreview(preview) {
  const adapterResults = preview && preview.diagnostics && preview.diagnostics.source_adapter &&
    Array.isArray(preview.diagnostics.source_adapter.source_adapter_results)
    ? preview.diagnostics.source_adapter.source_adapter_results
    : [];
  const totals = {
    ocr_documents_attempted: 0,
    ocr_documents_succeeded: 0,
    ocr_rows_extracted: 0,
    ocr_rows_with_address: 0,
    ocr_rows_with_sale_date: 0,
    ocr_skipped_oversize: 0,
    ocr_failures: 0
  };
  let any = false;
  for (const result of adapterResults) {
    const ocr = result && (result.ocr || (result.diagnostics && result.diagnostics.ocr));
    if (!ocr) continue;
    any = true;
    for (const key of Object.keys(totals)) totals[key] += Number(ocr[key] || 0) || 0;
  }
  return any ? totals : null;
}

function sourceCoverageFromPreview(preview) {
  const adapterResults = preview && preview.diagnostics && preview.diagnostics.source_adapter &&
    Array.isArray(preview.diagnostics.source_adapter.source_adapter_results)
    ? preview.diagnostics.source_adapter.source_adapter_results
    : [];
  return adapterResults.map((result) => ({
    source_id: cleanText(result && result.source_id),
    source_name: cleanText(result && result.source_name),
    county: cleanText(result && result.county || (result && result.diagnostics && result.diagnostics.county)),
    status: cleanText(result && result.status),
    candidate_count: Number(result && result.candidate_count || 0) || 0,
    blocked_reason: cleanText(result && result.blocked_reason)
  })).filter((item) => item.source_id);
}

function queueCounts(rows) {
  const today = nowIso().slice(0, 10);
  return {
    total_rows: rows.length,
    today_rows: rows.filter((row) => String(row.first_seen_at).slice(0, 10) === today || String(row.last_seen_at).slice(0, 10) === today).length,
    address_rows: rows.filter((row) => row.normalized_address).length,
    call_ready: rows.filter((row) => row.contact_status === 'CALL_READY').length,
    outreach_ready: rows.filter((row) => row.contact_status === 'OUTREACH_READY').length,
    inspect_now: rows.filter((row) => row.quality_bucket === 'INSPECT_NOW').length,
    needs_contact: rows.filter((row) => row.normalized_address && row.contact_status !== 'CALL_READY' && row.contact_status !== 'OUTREACH_READY').length,
    needs_comps: rows.filter((row) => row.normalized_address && row.verified_sold_comp_count < 3).length,
    source_proof_only: rows.filter((row) => row.quality_bucket === 'SOURCE_PROOF_ONLY').length,
    owner_clues: rows.filter((row) => row.owner_clue).length
  };
}

async function runDealBoardBatch(input = {}, options = {}) {
  const market = Object.assign({ city: 'Dallas', county: 'Dallas', state: 'TX' }, input.market || {});
  const limit = Math.max(MIN_BATCH_LIMIT, Math.min(Number(input.limit) || MAX_BATCH_LIMIT, MAX_BATCH_LIMIT));
  const previewImpl = typeof options.preview_impl === 'function'
    ? options.preview_impl
    : freePublicDealBoardPreviewService.runFreePublicDealBoardServerPreview;
  const preview = await previewImpl({
    market,
    limit,
    source_ids: Array.isArray(input.source_ids) && input.source_ids.length ? input.source_ids : DEFAULT_QUEUE_SOURCE_IDS.slice(),
    enable_official_browser_lookup: input.enable_official_browser_lookup !== false,
    enable_free_public_hunters: input.enable_free_public_hunters !== false
  }, { env: options.env || process.env });

  const deals = Array.isArray(preview && preview.free_public_deals) ? preview.free_public_deals : [];
  const runAt = nowIso();
  const store = readStore();
  const key = marketKey(market);
  const bucket = store.markets[key] || { market, rows: [], batches: [] };
  const byKey = new Map(bucket.rows.map((row) => [row.queue_key, row]));
  const PRESERVE_FIELDS = [
    'source_document_url', 'best_link_to_click_first', 'maps_url', 'zillow_url',
    'redfin_url', 'realtor_url', 'auction_url', 'official_property_record_url',
    'owner_clue', 'official_lookup_status', 'best_contact', 'appraisal_clue', 'source_url'
  ];
  let newRows = 0;
  let refreshedRows = 0;
  for (const deal of deals) {
    const dedupeKey = dedupeKeyForDeal(deal);
    const existing = byKey.get(dedupeKey);
    if (existing) {
      const refreshed = projectRowForQueue(deal, dedupeKey, runAt);
      refreshed.first_seen_at = existing.first_seen_at;
      refreshed.times_seen = (Number(existing.times_seen) || 1) + 1;
      // Never lose evidence a previous sighting already carried.
      for (const field of PRESERVE_FIELDS) {
        if (!cleanText(refreshed[field]) && cleanText(existing[field])) refreshed[field] = existing[field];
      }
      if ((!refreshed.verified_comps || !refreshed.verified_comps.length) && Array.isArray(existing.verified_comps) && existing.verified_comps.length) {
        refreshed.verified_comps = existing.verified_comps;
        refreshed.verified_sold_comp_count = Number(existing.verified_sold_comp_count) || existing.verified_comps.length;
      }
      byKey.set(dedupeKey, refreshed);
      refreshedRows += 1;
    } else {
      byKey.set(dedupeKey, projectRowForQueue(deal, dedupeKey, runAt));
      newRows += 1;
    }
  }
  bucket.rows = Array.from(byKey.values())
    .sort((a, b) => (b.normalized_address ? 1 : 0) - (a.normalized_address ? 1 : 0) || String(b.last_seen_at).localeCompare(String(a.last_seen_at)))
    .slice(0, MAX_ROWS_PER_MARKET);
  const counts = queueCounts(bucket.rows);
  const batch = {
    run_at: runAt,
    limit,
    batch_rows: deals.length,
    new_rows: newRows,
    refreshed_rows: refreshedRows,
    rejected_generic_count: Number(preview && preview.rejected_generic_count || 0) || 0,
    browser_runtime_available: !!(preview && preview.browser_runtime_available),
    official_lookup_blocked_count: Number(preview && preview.official_lookup_blocked_count || 0) || 0,
    board_blocker_summary: cleanText(preview && preview.board_blocker_summary),
    source_coverage: sourceCoverageFromPreview(preview),
    ocr: ocrSummaryFromPreview(preview)
  };
  bucket.batches = [batch].concat(bucket.batches || []).slice(0, MAX_BATCHES_PER_MARKET);
  bucket.market = market;
  store.markets[key] = bucket;
  writeStore(store);
  return {
    ok: true,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    snapshot_kind: 'deal_board_snapshot_not_saved_leads',
    market,
    batch,
    counts,
    rows: bucket.rows.slice(0, 100)
  };
}

function latestDealBoardSnapshot(input = {}) {
  const market = Object.assign({ city: 'Dallas', county: 'Dallas', state: 'TX' }, input.market || {});
  const store = readStore();
  const bucket = store.markets[marketKey(market)];
  if (!bucket || !Array.isArray(bucket.rows)) {
    return {
      ok: true,
      preview_only: true,
      snapshot_kind: 'deal_board_snapshot_not_saved_leads',
      market,
      has_snapshot: false,
      counts: queueCounts([]),
      batch: null,
      daily: { batches_today: 0, address_rows_today: 0, ocr_address_rows_today: 0 },
      auto_run: getAutoRunStatus(market),
      rows: []
    };
  }
  const today = nowIso().slice(0, 10);
  const batchesToday = (bucket.batches || []).filter((item) => String(item.run_at).slice(0, 10) === today);
  return {
    ok: true,
    preview_only: true,
    snapshot_kind: 'deal_board_snapshot_not_saved_leads',
    market,
    has_snapshot: true,
    counts: queueCounts(bucket.rows),
    batch: (bucket.batches || [])[0] || null,
    batches_today: batchesToday.length,
    daily: {
      batches_today: batchesToday.length,
      address_rows_today: bucket.rows.filter((row) => row.normalized_address && String(row.first_seen_at).slice(0, 10) === today).length,
      ocr_address_rows_today: batchesToday.reduce((sum, item) => sum + Number(item.ocr && item.ocr.ocr_rows_with_address || 0), 0)
    },
    auto_run: getAutoRunStatus(market),
    rows: bucket.rows.slice(0, 100)
  };
}

// ---------------------------------------------------------------------------
// Background batch jobs.
// The 11-lane batch (plus OCR) outlives Railway's HTTP edge timeout, so the
// run endpoint starts a job and returns immediately; the dashboard polls.
// Job state is a preview-run ledger only - never lead data.

const JOB_TTL_MS = 60 * 60 * 1000;
const jobs = new Map();

function jobsFilePath() {
  return path.resolve(
    process.env.DEAL_BOARD_JOBS_PATH ||
    path.join(path.dirname(path.resolve(process.env.DB_PATH || './data/db.json')), 'deal-board-jobs.json')
  );
}

function persistJobs() {
  try {
    const file = jobsFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      store_kind: 'deal_board_batch_jobs_not_saved_leads',
      updated_at: nowIso(),
      jobs: Array.from(jobs.values())
    }, null, 2));
  } catch (error) { /* job ledger is best-effort */ }
}

function pruneJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && new Date(job.started_at).getTime() < cutoff) jobs.delete(id);
  }
}

function activeJobForMarket(key) {
  for (const job of jobs.values()) {
    if (job.market_key === key && job.status === 'running') return job;
  }
  return null;
}

function publicJob(job) {
  return job ? Object.assign({}, job) : null;
}

function startDealBoardBatchJob(input = {}, options = {}) {
  pruneJobs();
  const market = Object.assign({ city: 'Dallas', county: 'Dallas', state: 'TX' }, input.market || {});
  const key = marketKey(market);
  const existing = activeJobForMarket(key);
  if (existing) {
    return { ok: true, already_running: true, job: publicJob(existing), preview_only: true };
  }
  const job = {
    job_id: `dbj_${crypto.createHash('sha1').update(`${key}|${Date.now()}|${Math.random()}`).digest('hex').slice(0, 12)}`,
    market,
    market_key: key,
    status: 'running',
    stage: 'running_free_public_batch',
    started_at: nowIso(),
    finished_at: null,
    error: '',
    result_summary: null,
    preview_only: true,
    not_a_saved_lead: true
  };
  jobs.set(job.job_id, job);
  persistJobs();
  const runImpl = typeof options.run_impl === 'function' ? options.run_impl : runDealBoardBatch;
  Promise.resolve()
    .then(() => runImpl(input, options))
    .then((result) => {
      job.status = 'done';
      job.stage = 'done';
      job.finished_at = nowIso();
      job.result_summary = {
        batch: result && result.batch || null,
        counts: result && result.counts || null
      };
      persistJobs();
    })
    .catch((error) => {
      job.status = 'failed';
      job.stage = 'failed';
      job.finished_at = nowIso();
      job.error = cleanText(error && error.message).slice(0, 200) || 'batch_failed';
      persistJobs();
    });
  return { ok: true, already_running: false, job: publicJob(job), preview_only: true };
}

function getDealBoardJob(jobId) {
  pruneJobs();
  const job = jobs.get(cleanText(jobId));
  return job ? { ok: true, job: publicJob(job) } : { ok: false, error: 'job_not_found' };
}

// ---------------------------------------------------------------------------
// Daily auto-run: capped, per-market, server-side scheduler for the same
// preview-only background batches. Default OFF; state persists in the job
// ledger file so a deploy restores an enabled schedule.

const MIN_AUTO_RUN_INTERVAL_MINUTES = 20;
const DAILY_AUTO_RUN_CAP = 24;
const autoRunState = new Map();
const autoRunTimers = new Map();

function autoRunFilePath() {
  return path.resolve(
    process.env.DEAL_BOARD_AUTO_RUN_PATH ||
    path.join(path.dirname(path.resolve(process.env.DB_PATH || './data/db.json')), 'deal-board-auto-run.json')
  );
}

function persistAutoRun() {
  try {
    const file = autoRunFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      store_kind: 'deal_board_auto_run_schedule_not_saved_leads',
      updated_at: nowIso(),
      markets: Array.from(autoRunState.values())
    }, null, 2));
  } catch (error) { /* schedule persistence is best-effort */ }
}

function loadAutoRunFromDisk(options) {
  try {
    const data = JSON.parse(fs.readFileSync(autoRunFilePath(), 'utf8'));
    for (const entry of Array.isArray(data && data.markets) ? data.markets : []) {
      if (!entry || !entry.market_key) continue;
      autoRunState.set(entry.market_key, entry);
      if (entry.enabled) scheduleAutoRunTimer(entry, options || {});
    }
  } catch (error) { /* no schedule yet */ }
}

function autoRunEntry(market) {
  const key = marketKey(market);
  if (!autoRunState.has(key)) {
    autoRunState.set(key, {
      market,
      market_key: key,
      enabled: false,
      interval_minutes: MIN_AUTO_RUN_INTERVAL_MINUTES,
      daily_cap: DAILY_AUTO_RUN_CAP,
      day: nowIso().slice(0, 10),
      runs_today: 0,
      last_run_at: null,
      next_run_at: null,
      last_error: '',
      preview_only: true,
      not_a_saved_lead: true
    });
  }
  const entry = autoRunState.get(key);
  const today = nowIso().slice(0, 10);
  if (entry.day !== today) {
    entry.day = today;
    entry.runs_today = 0;
  }
  return entry;
}

function clearAutoRunTimer(key) {
  const timer = autoRunTimers.get(key);
  if (timer) clearInterval(timer);
  autoRunTimers.delete(key);
}

function autoRunTick(entry, options) {
  const today = nowIso().slice(0, 10);
  if (entry.day !== today) {
    entry.day = today;
    entry.runs_today = 0;
  }
  if (!entry.enabled) return;
  if (entry.runs_today >= entry.daily_cap) {
    entry.last_error = '';
    entry.next_run_at = `${today}T23:59:59Z (daily cap ${entry.daily_cap} reached)`;
    persistAutoRun();
    return;
  }
  const startResult = startDealBoardBatchJob({ market: entry.market, limit: MAX_BATCH_LIMIT }, options || {});
  if (startResult.already_running) {
    entry.last_error = '';
  } else {
    entry.runs_today += 1;
    entry.last_run_at = nowIso();
  }
  entry.next_run_at = new Date(Date.now() + entry.interval_minutes * 60000).toISOString();
  persistAutoRun();
}

function scheduleAutoRunTimer(entry, options) {
  clearAutoRunTimer(entry.market_key);
  const timer = setInterval(() => {
    try {
      autoRunTick(entry, options);
    } catch (error) {
      entry.last_error = cleanText(error && error.message).slice(0, 120);
      persistAutoRun();
    }
  }, Math.max(entry.interval_minutes, MIN_AUTO_RUN_INTERVAL_MINUTES) * 60000);
  if (typeof timer.unref === 'function') timer.unref();
  autoRunTimers.set(entry.market_key, timer);
  entry.next_run_at = new Date(Date.now() + entry.interval_minutes * 60000).toISOString();
}

function setAutoRun(input = {}, options = {}) {
  const market = Object.assign({ city: 'Dallas', county: 'Dallas', state: 'TX' }, input.market || {});
  const entry = autoRunEntry(market);
  entry.enabled = input.enabled === true;
  entry.interval_minutes = Math.max(MIN_AUTO_RUN_INTERVAL_MINUTES, Math.min(Number(input.interval_minutes) || MIN_AUTO_RUN_INTERVAL_MINUTES, 240));
  if (entry.enabled) {
    scheduleAutoRunTimer(entry, options);
  } else {
    clearAutoRunTimer(entry.market_key);
    entry.next_run_at = null;
  }
  persistAutoRun();
  return { ok: true, auto_run: Object.assign({}, entry), preview_only: true };
}

function getAutoRunStatus(market) {
  const entry = autoRunEntry(Object.assign({ city: 'Dallas', county: 'Dallas', state: 'TX' }, market || {}));
  return Object.assign({}, entry);
}

module.exports = {
  MAX_BATCH_LIMIT,
  MIN_BATCH_LIMIT,
  DEFAULT_QUEUE_SOURCE_IDS,
  snapshotFilePath,
  jobsFilePath,
  dedupeKeyForDeal,
  queueCounts,
  runDealBoardBatch,
  latestDealBoardSnapshot,
  startDealBoardBatchJob,
  getDealBoardJob,
  setAutoRun,
  getAutoRunStatus,
  loadAutoRunFromDisk,
  MIN_AUTO_RUN_INTERVAL_MINUTES,
  DAILY_AUTO_RUN_CAP
};
