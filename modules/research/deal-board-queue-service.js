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
const censusZipResolution = require('./census-zip-resolution');
const propertyIdentity = require('./property-identity');

const DB_PATH = process.env.DB_PATH || './data/db.json';
const SNAPSHOT_FILE = path.resolve(
  process.env.DEAL_BOARD_SNAPSHOTS_PATH ||
  path.join(path.dirname(path.resolve(DB_PATH)), 'deal-board-snapshots.json')
);

const MAX_ROWS_PER_MARKET = 500;
const MAX_BATCHES_PER_MARKET = 60;
const MIN_BATCH_LIMIT = 5;
const MAX_BATCH_LIMIT = 25;
const MAX_STORED_CENSUS_BACKFILLS_PER_BATCH = 5;

// Queue lanes: every registered free adapter, requested EXPLICITLY so the
// orchestrator also runs contact-first lanes that are auto_select:false.
// County foreclosure lanes come straight from the profile registry.
const txCountyForeclosureSourceProfiles = require('../sources/tx-county-foreclosure-source-profiles');
const DALLAS_QUEUE_SOURCE_IDS = Object.freeze([
  'tx_dallas_county_clerk_foreclosure_notices',
  'tx_dallas_craigslist_owner_posts',
  'tx_dallas_fsbo_contact_first'
]);
const TX_COUNTY_FORECLOSURE_SOURCE_IDS = Object.freeze(txCountyForeclosureSourceProfiles.PROFILES.map((profile) => profile.source_id));
const DEFAULT_QUEUE_SOURCE_IDS = Object.freeze(DALLAS_QUEUE_SOURCE_IDS.concat(TX_COUNTY_FORECLOSURE_SOURCE_IDS));

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function cloneSnapshotRow(row) {
  const copy = Object.assign({}, row || {});
  for (const key of ['risk_flags', 'missing_fields', 'source_document_urls', 'verified_comps', 'seller_questions']) {
    if (Array.isArray(copy[key])) copy[key] = copy[key].slice();
  }
  return copy;
}

function prependUnique(values, additions, limit) {
  const seen = new Set();
  return [].concat(additions || [], values || [])
    .map(cleanText)
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, limit);
}

function mapsSearchUrlForReview(value) {
  const query = cleanText(value);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

function validDateIso(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Notice dates are evidence, not estimates. Only two unambiguous formats can
// influence urgency; every other source string remains visible but unsorted.
function parseSaleDateIso(value) {
  const text = cleanText(value);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return validDateIso(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return validDateIso(Number(match[3]), Number(match[1]), Number(match[2]));
  return null;
}

function currentDateIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function repairSaleDateUrgency(row, todayIso = currentDateIso()) {
  const verbatim = cleanText(row && row.sale_date_or_event_date);
  const iso = parseSaleDateIso(verbatim || cleanText(row && row.sale_date_iso));
  row.sale_date_or_event_date = verbatim || null;
  row.sale_date_iso = iso;
  if (!iso || iso >= todayIso) return false;
  row.risk_flags = prependUnique(row.risk_flags, ['SALE_DATE_PASSED_VERIFY_STATUS'], 6);
  row.next_best_action = 'VERIFY_SALE_STATUS_FROM_SOURCE_DOCUMENT';
  return true;
}

function suspectedPrefixText(row) {
  const normalized = cleanText(row && row.normalized_address);
  const partial = cleanText(row && row.partial_address);
  const headline = cleanText(row && row.headline);
  return [normalized, partial, headline].find((value) => /^\d{3,}\s+\d{1,5}\s/.test(value)) || '';
}

// Snapshot rows can outlive parser fixes. Preserve the visible OCR text, but
// remove unsafe call/map readiness until the source document is checked.
function quarantineSuspectedPrefixRow(row) {
  const original = suspectedPrefixText(row);
  if (!original) return false;
  row.partial_address = original;
  row.headline = original;
  row.normalized_address = '';
  row.maps_url = null;
  row.maps_search_url_review_needed = cleanText(row.maps_search_url_review_needed) || mapsSearchUrlForReview(original);
  row.quality_bucket = 'NEEDS_ZIP_REVIEW';
  row.risk_flags = prependUnique(row.risk_flags, [
    'ADDRESS_PREFIX_SUSPECTED_VERIFY_DOCUMENT',
    'OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED'
  ], 6);
  row.next_best_action = 'VERIFY_ADDRESS_FROM_SOURCE_DOCUMENT';
  row.contact_status = 'ADDRESS_VERIFICATION_REQUIRED';
  row.call_readiness = 'NEEDS_PROPERTY_IDENTITY';
  row.missing_fields = prependUnique(row.missing_fields, [
    'verified street number and spelling (check source document)'
  ], 8);
  return true;
}

function officialCountyHosts() {
  const profiles = Array.isArray(txCountyForeclosureSourceProfiles.PROFILES)
    ? txCountyForeclosureSourceProfiles.PROFILES
    : [];
  return profiles.flatMap((profile) => (Array.isArray(profile.official_hosts) ? profile.official_hosts : [])
    .map((host) => ({ county: cleanText(profile.county), host: cleanText(host).toLowerCase() }))
    .filter((entry) => entry.county && entry.host));
}

const OFFICIAL_COUNTY_HOSTS = Object.freeze(officialCountyHosts());

function hostFromUrl(value) {
  try {
    return new URL(cleanText(value)).hostname.toLowerCase();
  } catch (error) {
    return '';
  }
}

function repairCountyFromSourceHost(row) {
  const host = hostFromUrl(cleanText(row && row.source_document_url) || cleanText(row && row.source_url));
  if (!host) return false;
  const counties = Array.from(new Set(OFFICIAL_COUNTY_HOSTS
    .filter((entry) => host === entry.host || host.endsWith(`.${entry.host}`))
    .map((entry) => entry.county)));
  if (counties.length !== 1 || counties[0] === cleanText(row.county)) return false;
  row.county = counties[0];
  return true;
}

function repairStoredSnapshotRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    quarantineSuspectedPrefixRow(row);
    repairCountyFromSourceHost(row);
    repairSaleDateUrgency(row);
    return row;
  });
}

function rowEvidenceScore(row) {
  return [
    'source_document_url', 'source_url', 'best_link_to_click_first', 'maps_url',
    'official_property_record_url', 'owner_clue', 'best_contact', 'appraisal_clue',
    'zillow_url', 'redfin_url', 'realtor_url', 'auction_url'
  ].reduce((score, field) => score + (cleanText(row && row[field]) ? 1 : 0), 0) +
    (Array.isArray(row && row.source_document_urls) ? row.source_document_urls.length : 0);
}

function documentUrlsForRow(row) {
  return prependUnique(row && row.source_document_urls, [row && row.source_document_url], 3);
}

function earliestTimestamp(left, right) {
  const a = cleanText(left);
  const b = cleanText(right);
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

async function backfillCensusKeysForStoredRows(rows, options = {}) {
  const resolver = typeof options.census_zip_resolver_impl === 'function'
    ? options.census_zip_resolver_impl
    : censusZipResolution.resolveZipFromCensus;
  const requestedLookups = Number(options.max_census_backfill_lookups);
  const maxLookups = Math.max(0, Math.min(
    Number.isFinite(requestedLookups) ? requestedLookups : MAX_STORED_CENSUS_BACKFILLS_PER_BATCH,
    MAX_STORED_CENSUS_BACKFILLS_PER_BATCH
  ));
  let lookups = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (lookups >= maxLookups || cleanText(row.census_matched_address) || !propertyIdentity.isCompleteAddress(cleanText(row.normalized_address))) continue;
    lookups += 1;
    try {
      const outcome = await resolver({
        street_or_partial: cleanText(row.normalized_address),
        city: cleanText(row.city),
        state: cleanText(row.state) || 'TX'
      }, { fetchImpl: options.fetch_impl });
      if (outcome && outcome.resolved && cleanText(outcome.matched_address)) {
        row.census_matched_address = cleanText(outcome.matched_address);
        row.census_zip_status = 'backfilled_for_dedupe';
      }
    } catch (error) { /* keep unresolved snapshot rows separate */ }
  }
  return lookups;
}

function collapseStoredCensusExactDuplicates(rows) {
  const byCensusAddress = new Map();
  const output = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const matchedAddress = typeof row.census_matched_address === 'string' ? row.census_matched_address : '';
    if (!matchedAddress) {
      output.push(row);
      continue;
    }
    const existing = byCensusAddress.get(matchedAddress);
    if (!existing) {
      byCensusAddress.set(matchedAddress, row);
      output.push(row);
      continue;
    }
    const richer = rowEvidenceScore(row) > rowEvidenceScore(existing) ? row : existing;
    const other = richer === row ? existing : row;
    const index = output.indexOf(existing);
    if (richer !== existing && index >= 0) output[index] = richer;
    byCensusAddress.set(matchedAddress, richer);
    richer.source_document_urls = prependUnique(
      documentUrlsForRow(other),
      documentUrlsForRow(richer),
      3
    );
    richer.source_document_url = cleanText(richer.source_document_url) || cleanText(other.source_document_url) || null;
    richer.first_seen_at = earliestTimestamp(existing.first_seen_at, row.first_seen_at);
    richer.last_seen_at = cleanText(existing.last_seen_at) >= cleanText(row.last_seen_at)
      ? existing.last_seen_at
      : row.last_seen_at;
    richer.times_seen = (Number(existing.times_seen) || 1) + (Number(row.times_seen) || 1);
    richer.merged_duplicate_count = (Number(existing.merged_duplicate_count) || 0) +
      (Number(row.merged_duplicate_count) || 0) + 1;
  }
  return output;
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

function isDallasMarket(market) {
  return cleanText(market && market.state).toUpperCase() === 'TX' &&
    /dallas/i.test(`${cleanText(market && market.city)} ${cleanText(market && market.county)}`);
}

function defaultQueueSourceIdsForMarket(market) {
  const state = cleanText(market && market.state).toUpperCase() || 'TX';
  if (state !== 'TX') return [];
  const ids = [];
  if (isDallasMarket(market)) ids.push(...DALLAS_QUEUE_SOURCE_IDS);
  ids.push(...TX_COUNTY_FORECLOSURE_SOURCE_IDS);
  return Array.from(new Set(ids));
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
    partial_address: cleanText(deal.partial_address),
    maps_search_url_review_needed: cleanText(deal.maps_search_url_review_needed) || null,
    census_zip_suggestion: cleanText(deal.census_zip_suggestion) || null,
    census_matched_address: cleanText(deal.census_matched_address) || null,
    census_zip_status: cleanText(deal.census_zip_status) || null,
    sale_date_or_event_date: cleanText(deal.sale_date_or_event_date) || null,
    sale_date_iso: parseSaleDateIso(deal.sale_date_or_event_date),
    risk_flags: Array.isArray(deal.risk_flags) ? deal.risk_flags.slice(0, 6) : [],
    city: cleanText(deal.city),
    county: cleanText(deal.county),
    state: cleanText(deal.state),
    quality_bucket: cleanText(deal.quality_bucket),
    source_family: cleanText(deal.source_family),
    source_url: cleanText(deal.source_url),
    source_document_url: cleanText(deal.source_document_url),
    source_document_urls: Array.isArray(deal.source_document_urls)
      ? prependUnique(deal.source_document_urls, [deal.source_document_url], 3)
      : prependUnique([], [deal.source_document_url], 3),
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
  const sourceAdapterDiagnostics = preview && preview.diagnostics && preview.diagnostics.source_adapter || {};
  const adapterResults = Array.isArray(sourceAdapterDiagnostics.source_adapter_results)
    ? sourceAdapterDiagnostics.source_adapter_results
    : [];
  return adapterResults.map((result) => ({
    source_id: cleanText(result && result.source_id),
    source_name: cleanText(result && result.source_name),
    county: cleanText(result && result.county || (result && result.diagnostics && result.diagnostics.county)),
    status: cleanText(result && result.status),
    candidate_count: Number(result && result.candidate_count || 0) || 0,
    docs_discovered: Number(result && result.diagnostics && (result.diagnostics.docs_discovered || result.diagnostics.document_urls_found_count) || 0) || 0,
    docs_processed: Number(result && result.diagnostics && (result.diagnostics.docs_processed || result.diagnostics.document_urls_processed_count) || 0) || 0,
    docs_ledger_skipped: Number(result && result.diagnostics && result.diagnostics.docs_ledger_skipped || 0) || 0,
    suppressed_nav_chrome_count: Number(result && result.diagnostics && result.diagnostics.suppressed_nav_chrome_count ||
      sourceAdapterDiagnostics.suppressed_nav_chrome_by_source_id && sourceAdapterDiagnostics.suppressed_nav_chrome_by_source_id[cleanText(result && result.source_id)] || 0) || 0,
    blocked_reason: cleanText(result && result.blocked_reason),
    listing_radar_accepted_count: Number(result && result.diagnostics && result.diagnostics.listing_radar_accepted_count || 0) || 0,
    listing_radar_rejected_count: Number(result && result.diagnostics && result.diagnostics.listing_radar_rejected_count || 0) || 0,
    rejected_reason_counts: result && result.diagnostics && result.diagnostics.rejected_reason_counts || {},
    rejected_url_samples: Array.isArray(result && result.diagnostics && result.diagnostics.rejected_url_samples)
      ? result.diagnostics.rejected_url_samples.slice(0, 5).map((item) => ({
        source_url: cleanText(item && item.source_url),
        reason: cleanText(item && item.reason)
      }))
      : []
  })).filter((item) => item.source_id);
}

function suppressedNavChromeSamplesFromPreview(preview) {
  const sourceAdapterDiagnostics = preview && preview.diagnostics && preview.diagnostics.source_adapter || {};
  const samples = Array.isArray(sourceAdapterDiagnostics.suppressed_nav_chrome_samples)
    ? sourceAdapterDiagnostics.suppressed_nav_chrome_samples
    : [];
  return samples.slice(0, 5).map((sample) => ({
    source_url: cleanText(sample && sample.source_url).slice(0, 120),
    reason: cleanText(sample && sample.reason),
    source_id: cleanText(sample && sample.source_id)
  })).filter((sample) => sample.source_url);
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
    needs_zip_review: rows.filter((row) => row.quality_bucket === 'NEEDS_ZIP_REVIEW').length,
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
  const explicitSourceIds = Array.isArray(input.source_ids) && input.source_ids.length ? input.source_ids : null;
  const defaultSourceIds = explicitSourceIds ? explicitSourceIds : defaultQueueSourceIdsForMarket(market);
  const runAt = nowIso();
  const store = readStore();
  const key = marketKey(market);
  const bucket = store.markets[key] || { market, rows: [], batches: [] };
  if (!explicitSourceIds && defaultSourceIds.length === 0) {
    const batch = {
      run_at: runAt,
      limit,
      batch_rows: 0,
      new_rows: 0,
      refreshed_rows: 0,
      rejected_generic_count: 0,
      browser_runtime_available: false,
      official_lookup_blocked_count: 0,
      board_blocker_summary: 'no_verified_source_lanes_for_this_market',
      source_coverage: [],
      suppressed_nav_chrome_samples: [],
      ocr: null
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
      counts: queueCounts([]),
      rows: bucket.rows.slice(0, 100)
    };
  }
  const preview = await previewImpl({
    market,
    limit,
    source_ids: defaultSourceIds,
    enable_official_browser_lookup: input.enable_official_browser_lookup !== false,
    enable_free_public_hunters: input.enable_free_public_hunters !== false,
    enable_census_zip_resolution: input.enable_census_zip_resolution !== false
  }, { env: options.env || process.env });

  const deals = Array.isArray(preview && preview.free_public_deals) ? preview.free_public_deals : [];
  const byKey = new Map(bucket.rows.map((row) => [row.queue_key, row]));
  const storedQueueKeys = new Set(byKey.keys());
  const PRESERVE_FIELDS = [
    'source_document_url', 'best_link_to_click_first', 'maps_url', 'zillow_url',
    'redfin_url', 'realtor_url', 'auction_url', 'official_property_record_url',
    'owner_clue', 'official_lookup_status', 'best_contact', 'appraisal_clue', 'source_url', 'source_document_urls',
    'sale_date_or_event_date', 'sale_date_iso'
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
  bucket.rows = repairStoredSnapshotRows(Array.from(byKey.values()));
  await backfillCensusKeysForStoredRows(
    bucket.rows.filter((row) => storedQueueKeys.has(row.queue_key)),
    options
  );
  bucket.rows = collapseStoredCensusExactDuplicates(bucket.rows)
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
    suppressed_nav_chrome_samples: suppressedNavChromeSamplesFromPreview(preview),
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
  // Read-time repairs are deliberately applied to a copy: the dashboard gets
  // safer rows immediately after deploy without turning a read into a write.
  const rows = repairStoredSnapshotRows(bucket.rows.map(cloneSnapshotRow));
  return {
    ok: true,
    preview_only: true,
    snapshot_kind: 'deal_board_snapshot_not_saved_leads',
    market,
    has_snapshot: true,
    counts: queueCounts(rows),
    batch: (bucket.batches || [])[0] || null,
    batches_today: batchesToday.length,
    daily: {
      batches_today: batchesToday.length,
      address_rows_today: rows.filter((row) => row.normalized_address && String(row.first_seen_at).slice(0, 10) === today).length,
      ocr_address_rows_today: batchesToday.reduce((sum, item) => sum + Number(item.ocr && item.ocr.ocr_rows_with_address || 0), 0)
    },
    auto_run: getAutoRunStatus(market),
    rows: rows.slice(0, 100)
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
  defaultQueueSourceIdsForMarket,
  MAX_STORED_CENSUS_BACKFILLS_PER_BATCH,
  snapshotFilePath,
  jobsFilePath,
  dedupeKeyForDeal,
  parseSaleDateIso,
  repairSaleDateUrgency,
  quarantineSuspectedPrefixRow,
  repairCountyFromSourceHost,
  backfillCensusKeysForStoredRows,
  collapseStoredCensusExactDuplicates,
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
