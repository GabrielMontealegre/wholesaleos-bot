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
const DEFAULT_QUEUE_SOURCE_IDS = Object.freeze([
  'tx_dallas_county_clerk_foreclosure_notices',
  'tx_dallas_craigslist_owner_posts',
  'tx_dallas_fsbo_contact_first',
  'tx_tarrant_county_foreclosure_notices',
  'tx_collin_county_foreclosure_notices',
  'tx_denton_county_foreclosure_notices'
]);

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
    source_coverage: sourceCoverageFromPreview(preview)
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
      rows: []
    };
  }
  return {
    ok: true,
    preview_only: true,
    snapshot_kind: 'deal_board_snapshot_not_saved_leads',
    market,
    has_snapshot: true,
    counts: queueCounts(bucket.rows),
    batch: (bucket.batches || [])[0] || null,
    batches_today: (bucket.batches || []).filter((item) => String(item.run_at).slice(0, 10) === nowIso().slice(0, 10)).length,
    rows: bucket.rows.slice(0, 100)
  };
}

module.exports = {
  MAX_BATCH_LIMIT,
  MIN_BATCH_LIMIT,
  DEFAULT_QUEUE_SOURCE_IDS,
  snapshotFilePath,
  dedupeKeyForDeal,
  queueCounts,
  runDealBoardBatch,
  latestDealBoardSnapshot
};
