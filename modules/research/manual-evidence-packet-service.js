'use strict';

// Operator-supplied screenshot evidence stays separate from deal-board rows.
// It can propose fields and, after explicit confirmation, can be evaluated by
// the existing contact and comp gates. This module never fetches research URLs.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const disclosureStateCompResolution = require('./disclosure-state-comp-resolution');
const leadOperationsState = require('./lead-operations-state');
const screenshotCompEvidence = require('./screenshot-comp-evidence');

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const SOURCE_KIND = 'operator_supplied_screenshot';
const EVIDENCE_TYPES = Object.freeze([
  'subject_property',
  'sold_comp',
  'county_appraisal_record',
  'auction_status',
  'skip_trace'
]);
const CONTACT_CLASSIFICATIONS = Object.freeze([
  'possible_owner_contact',
  'possible_household_or_relative_contact',
  'trustee_servicer_or_attorney_contact',
  'unknown_unverified_contact'
]);
const LIVE_MARKETS = Object.freeze([
  { key: 'dallas', city: 'Dallas', county: 'Dallas', state: 'TX', sample_limit: 3 },
  { key: 'san_antonio', city: 'San Antonio', county: 'Bexar', state: 'TX', sample_limit: 2 },
  { key: 'houston', city: 'Houston', county: 'Harris', state: 'TX', sample_limit: 2 },
  { key: 'detroit', city: 'Detroit', county: 'Wayne', state: 'MI', sample_limit: 2 },
  { key: 'san_diego', city: 'San Diego', county: 'San Diego', state: 'CA', sample_limit: 2 },
  { key: 'los_angeles', city: 'Los Angeles', county: 'Los Angeles', state: 'CA', sample_limit: 2 }
]);

const FIELD_ALLOWLIST = Object.freeze({
  subject_property: ['normalized_address', 'property_kind', 'beds', 'baths', 'sqft', 'year_built', 'lot_size', 'latitude', 'longitude', 'zestimate', 'list_price', 'asking_price', 'source_url'],
  sold_comp: ['comp_address', 'parcel_id', 'sold_status', 'sold_price', 'sold_date', 'source_url', 'similarity_basis', 'land_use', 'property_kind', 'distance_miles', 'latitude', 'longitude', 'beds', 'baths', 'sqft', 'year_built', 'lot_size'],
  county_appraisal_record: ['normalized_address', 'owner_name', 'taxpayer_name', 'parcel_id', 'assessed_value', 'tax_value', 'year_built', 'land_use', 'source_url'],
  auction_status: ['normalized_address', 'sale_date', 'status', 'minimum_bid', 'redemption_amount', 'source_url'],
  skip_trace: ['owner_name', 'contact_value', 'contact_route_kind', 'contact_classification', 'seller_owner_confirmed', 'source_url']
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function nowIso(options) {
  return typeof options.now_impl === 'function' ? cleanText(options.now_impl()) : new Date().toISOString();
}

function normalizeMarket(value) {
  const market = value && typeof value === 'object' ? value : {};
  return {
    city: cleanText(market.city),
    county: cleanText(market.county),
    state: cleanText(market.state).toUpperCase()
  };
}

function marketKey(market) {
  const value = normalizeMarket(market);
  return [value.city.toLowerCase() || 'unknown', value.county.toLowerCase(), value.state.toLowerCase()].join('|');
}

function packetFilePath() {
  return path.resolve(
    process.env.MANUAL_EVIDENCE_PACKETS_PATH ||
    path.join(path.dirname(path.resolve(process.env.DB_PATH || './data/db.json')), 'manual-evidence-packets.json')
  );
}

function screenshotCacheDir() {
  return path.resolve(
    process.env.MANUAL_EVIDENCE_SCREENSHOTS_DIR ||
    path.join(__dirname, '..', '..', '.cache', 'manual-evidence-packets')
  );
}

function dealSnapshotFilePath() {
  return path.resolve(
    process.env.DEAL_BOARD_SNAPSHOTS_PATH ||
    path.join(path.dirname(path.resolve(process.env.DB_PATH || './data/db.json')), 'deal-board-snapshots.json')
  );
}

function emptyPacketStore() {
  return {
    version: 1,
    store_kind: 'manual_evidence_packets_not_saved_leads',
    updated_at: null,
    markets: {}
  };
}

function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function readPacketStore() {
  const store = readJson(packetFilePath(), emptyPacketStore());
  if (!store.markets || typeof store.markets !== 'object') store.markets = {};
  return store;
}

function writePacketStore(store) {
  const file = packetFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  store.updated_at = new Date().toISOString();
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
  fs.renameSync(temporary, file);
}

function readDealSnapshotStore() {
  return readJson(dealSnapshotFilePath(), { version: 1, markets: {} });
}

function serviceError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.status_code = statusCode;
  return error;
}

function safeFilename(value) {
  return path.basename(cleanText(value) || 'screenshot').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'screenshot';
}

function imageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.subarray(1, 4).toString('ascii') === 'PNG') return { mime: 'image/png', extension: '.png' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', extension: '.jpg' };
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', extension: '.webp' };
  return null;
}

function normalizeEvidenceType(value) {
  const type = cleanText(value).toLowerCase().replace(/[\s-]+/g, '_');
  return EVIDENCE_TYPES.includes(type) ? type : '';
}

function normalizeFields(type, value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const fields = {};
  for (const key of FIELD_ALLOWLIST[type] || []) {
    if (key === 'seller_owner_confirmed') {
      fields[key] = input[key] === true || /^(1|true|yes|on)$/i.test(cleanText(input[key]));
      continue;
    }
    const text = cleanText(input[key]);
    if (text) fields[key] = text.slice(0, 500);
  }
  if (fields.contact_classification && !CONTACT_CLASSIFICATIONS.includes(fields.contact_classification)) {
    fields.contact_classification = 'unknown_unverified_contact';
  }
  if (fields.contact_route_kind && !/^(phone|email|form|reply_link)$/i.test(fields.contact_route_kind)) {
    fields.contact_route_kind = '';
  }
  return fields;
}

function fieldEvidence(fields, provenance) {
  const out = {};
  Object.keys(fields || {}).forEach((key) => {
    out[key] = {
      value: fields[key],
      source_kind: SOURCE_KIND,
      captured_at: provenance.captured_at,
      source_name: provenance.source_name,
      screenshot_id: provenance.screenshot_id,
      operator_confirmed: provenance.operator_confirmed === true
    };
  });
  return out;
}

function packetBucket(store, market, create) {
  const key = marketKey(market);
  if (!store.markets[key] && create) {
    store.markets[key] = { market: normalizeMarket(market), packets: {} };
  }
  return store.markets[key] || null;
}

function packetForRow(store, market, queueKey, create) {
  const bucket = packetBucket(store, market, create);
  if (!bucket) return null;
  if (!bucket.packets || typeof bucket.packets !== 'object') bucket.packets = {};
  if (!bucket.packets[queueKey] && create) {
    bucket.packets[queueKey] = {
      queue_key: queueKey,
      market: normalizeMarket(market),
      screenshots: [],
      evidence_items: [],
      preview_only: true,
      should_ingest: false,
      not_a_saved_lead: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
  return bucket.packets[queueKey] || null;
}

function snapshotRow(market, queueKey, options = {}) {
  const store = options.snapshot_store || readDealSnapshotStore();
  const bucket = store && store.markets && store.markets[marketKey(market)];
  return bucket && Array.isArray(bucket.rows)
    ? bucket.rows.find((row) => cleanText(row && row.queue_key) === queueKey) || null
    : null;
}

function officialValueForField(row, key) {
  if (!row) return '';
  if (key === 'normalized_address') return cleanText(row.normalized_address || row.partial_address);
  if (key === 'owner_name') return cleanText(row.owner_record && row.owner_record.owner_name || row.owner_clue);
  if (key === 'taxpayer_name') return cleanText(row.owner_record && row.owner_record.taxpayer_name);
  if (key === 'sale_date') return cleanText(row.sale_date_or_event_date);
  if (key === 'list_price') return cleanText(row.listed_price);
  if (key === 'minimum_bid') return cleanText(row.minimum_bid);
  if (key === 'redemption_amount') return cleanText(row.delinquent_redemption_amount);
  if (key === 'assessed_value' || key === 'tax_value') return cleanText(row.property_story && row.property_story.assessed_value || row.appraisal_clue);
  if (key === 'parcel_id') return cleanText(row.owner_record && row.owner_record.parcel_id || row.source_row_reference);
  return '';
}

function comparable(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function conflictsForItem(item, row) {
  const conflicts = [];
  const fields = item && item.fields || {};
  Object.keys(fields).forEach((key) => {
    const official = officialValueForField(row, key);
    if (!official || !cleanText(fields[key]) || comparable(official) === comparable(fields[key])) return;
    conflicts.push({
      field: key,
      official_value: official,
      screenshot_value: fields[key],
      resolution: 'operator_review_required_no_automatic_overwrite'
    });
  });
  return conflicts;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function compCandidateFromItem(item) {
  const fields = item.fields || {};
  return {
    comp_address: cleanText(fields.comp_address),
    parcel_id: cleanText(fields.parcel_id),
    sold_status: cleanText(fields.sold_status),
    sold_price: screenshotCompEvidence.moneyToNumber(fields.sold_price),
    sold_date: cleanText(fields.sold_date),
    source_kind: SOURCE_KIND,
    source_url: cleanText(fields.source_url),
    evidence_text: `Operator confirmed screenshot from ${cleanText(item.source_name)}: ${cleanText(fields.comp_address || fields.parcel_id)} sold ${cleanText(fields.sold_date)} for ${cleanText(fields.sold_price)}. Similarity: ${cleanText(fields.similarity_basis)}.`,
    similarity_basis: cleanText(fields.similarity_basis),
    land_use: cleanText(fields.land_use),
    property_kind: cleanText(fields.property_kind || fields.land_use),
    distance_miles: cleanText(fields.distance_miles),
    latitude: cleanText(fields.latitude),
    longitude: cleanText(fields.longitude),
    beds: cleanText(fields.beds),
    baths: cleanText(fields.baths),
    sqft: cleanText(fields.sqft),
    year_built: cleanText(fields.year_built),
    lot_size: cleanText(fields.lot_size),
    screenshot_id: item.screenshot_id,
    source_name: item.source_name,
    captured_at: item.captured_at,
    operator_confirmed: true
  };
}

function subjectForCompGrid(row, confirmedItems) {
  const subject = Object.assign({}, row || {});
  const subjectItem = confirmedItems.find((entry) => entry.evidence_type === 'subject_property');
  const fields = subjectItem && subjectItem.fields || {};
  const mappings = {
    property_kind: ['property_kind', 'property_kind_if_visible', 'land_use'],
    beds: ['beds', 'bedrooms'],
    baths: ['baths', 'bathrooms'],
    sqft: ['sqft', 'living_area'],
    year_built: ['year_built'],
    lot_size: ['lot_size', 'lot_size_sqft'],
    latitude: ['latitude', 'geocoded_latitude'],
    longitude: ['longitude', 'geocoded_longitude']
  };
  Object.keys(mappings).forEach((target) => {
    const hasOfficial = mappings[target].some((name) => cleanText(row && row[name]));
    if (!hasOfficial && cleanText(fields[target])) subject[target] = fields[target];
  });
  return subject;
}

function evaluatePacket(packet, row, options = {}) {
  const items = Array.isArray(packet && packet.evidence_items) ? packet.evidence_items : [];
  const confirmed = items.filter((item) => item && item.operator_confirmed === true);
  const compGridSubject = subjectForCompGrid(row, confirmed);
  const verifiedComps = [];
  const rejectedComps = [];
  for (const item of confirmed.filter((entry) => entry.evidence_type === 'sold_comp')) {
    const candidate = compCandidateFromItem(item);
    candidate.comp_grid = disclosureStateCompResolution.evaluateStrictCompGrid(candidate, compGridSubject, options);
    candidate.distance_miles = candidate.comp_grid.distance_miles;
    candidate.rural_comp_warning = candidate.comp_grid.rural_exception_warning;
    const rejectedReason = disclosureStateCompResolution.rejectReason(candidate, compGridSubject, {
      today_iso: cleanText(options.today_iso) || new Date().toISOString().slice(0, 10)
    });
    if (rejectedReason) rejectedComps.push(Object.assign({}, candidate, { rejected_reason: rejectedReason }));
    else verifiedComps.push(candidate);
  }
  const usedComps = verifiedComps.slice(0, 3);
  const prices = usedComps.map((comp) => comp.sold_price).filter((price) => price > 0);
  const arvUnlocked = prices.length >= 3;
  const arvRange = arvUnlocked ? {
    low: Math.min(...prices),
    high: Math.max(...prices),
    median: median(prices),
    count: prices.length,
    basis: SOURCE_KIND,
    label: 'Preliminary ARV range from operator-confirmed screenshot sold comps. Review before any offer.'
  } : null;

  const manualRoutes = [];
  for (const item of confirmed.filter((entry) => entry.evidence_type === 'skip_trace')) {
    const fields = item.fields || {};
    if (fields.contact_classification !== 'possible_owner_contact' || fields.seller_owner_confirmed !== true) continue;
    if (!/^(phone|email|form|reply_link)$/i.test(cleanText(fields.contact_route_kind)) || !cleanText(fields.contact_value) || !/^https?:\/\//i.test(cleanText(fields.source_url))) continue;
    manualRoutes.push({
      route_kind: cleanText(fields.contact_route_kind).toLowerCase(),
      route_type: 'operator_confirmed_owner_or_seller_contact',
      value: cleanText(fields.contact_value),
      source_kind: SOURCE_KIND,
      source_url: cleanText(fields.source_url),
      evidence_text: `Operator confirmed this ${cleanText(fields.contact_route_kind)} as an owner or seller route from ${cleanText(item.source_name)} screenshot ${cleanText(item.screenshot_id)}.`,
      risk_flags: ['OPERATOR_SUPPLIED_SCREENSHOT_CONTACT'],
      screenshot_id: item.screenshot_id,
      operator_confirmed: true
    });
  }
  const projectedRow = Object.assign({}, row || {}, {
    free_contact_routes: [].concat(Array.isArray(row && row.free_contact_routes) ? row.free_contact_routes : [], manualRoutes),
    verified_sold_comp_count: Math.max(Number(row && row.verified_sold_comp_count) || 0, usedComps.length),
    verified_comps: usedComps.length ? usedComps : (Array.isArray(row && row.verified_comps) ? row.verified_comps : []),
    ARV_lock_state: arvUnlocked ? 'ARV_UNLOCKED_VERIFIED_COMPS' : cleanText(row && row.ARV_lock_state) || 'ARV_LOCKED_NO_VERIFIED_COMPS'
  });
  const projectedState = leadOperationsState.rowStateForDeal(projectedRow);
  const clues = [];
  confirmed.forEach((item) => {
    const fields = item.fields || {};
    ['zestimate', 'list_price', 'asking_price', 'minimum_bid', 'redemption_amount', 'tax_value', 'assessed_value'].forEach((key) => {
      if (!cleanText(fields[key])) return;
      clues.push({ field: key, value: fields[key], label: 'CLUE_ONLY_NOT_ARV', screenshot_id: item.screenshot_id, source_name: item.source_name });
    });
  });
  const conflicts = items.flatMap((item) => conflictsForItem(item, row));
  return {
    confirmed_evidence_count: confirmed.length,
    verified_screenshot_comps: usedComps,
    rejected_screenshot_comps: rejectedComps,
    comp_grid_comps: usedComps.length || rejectedComps.length
      ? usedComps.concat(rejectedComps)
      : (Array.isArray(row && row.verified_comps) ? row.verified_comps : []),
    verified_sold_comp_count: usedComps.length,
    arv_status: arvUnlocked ? 'ARV_UNLOCKED_VERIFIED_COMPS' : 'ARV_LOCKED_NEEDS_3_VERIFIED_SOLD_COMPS',
    arv_evidence_basis: arvUnlocked ? SOURCE_KIND : '',
    arv_range: arvRange,
    contact_routes_accepted: manualRoutes,
    projected_row_state: projectedState.row_state,
    projected_row_state_reason: projectedState.row_state_reason,
    clue_values_not_arv: clues,
    conflicts
  };
}

function slug(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function researchLinks(row) {
  const address = cleanText(row && (row.normalized_address || row.partial_address || row.headline));
  const partial = !cleanText(row && row.normalized_address) && !!address;
  const encoded = encodeURIComponent(address);
  const parts = address.split(',').map(cleanText);
  const street = slug(parts[0]);
  const city = slug(parts[1] || row && row.city);
  const state = slug(cleanText(row && row.state));
  const owner = cleanText(row && (row.owner_clue || row.owner_record && (row.owner_record.owner_name || row.owner_record.taxpayer_name)));
  const warning = partial ? 'partial address - verify before trusting results' : '';
  const links = [];
  function push(label, url, kind) {
    if (!url || !/^https?:\/\//i.test(url)) return;
    links.push({ label: warning ? `${label} (partial address - verify first)` : label, url, link_kind: kind || 'human_research_only', warning });
  }
  if (address) {
    push('Zillow subject search', `https://www.zillow.com/homes/${encoded}_rb/`);
    push('Redfin subject search', `https://www.redfin.com/search?q=${encoded}`);
    push('Realtor.com subject search', `https://www.realtor.com/realestateandhomes-search/${encoded}`);
    push('Google Maps', `https://www.google.com/maps/search/?api=1&query=${encoded}`);
    if (street && city && state) push('CyberBackgroundChecks address search', `https://www.cyberbackgroundchecks.com/address/${street}/${city}/${state}`);
  }
  if (owner) push('CyberBackgroundChecks name search', `https://www.google.com/search?q=${encodeURIComponent(`site:cyberbackgroundchecks.com/detail "${owner}" "${cleanText(row && row.city)} ${cleanText(row && row.state)}"`)}`);
  push('County source proof', cleanText(row && (row.source_document_url || row.source_url)), 'source_proof');
  push('County property record', cleanText(row && row.official_property_record_url), 'official_property_record');
  if (cleanText(row && row.auction_url) && (cleanText(row && row.sale_date_or_event_date) || /auction|foreclosure|tax/i.test(cleanText(row && row.source_family)))) {
    push('Auction or sale status', cleanText(row.auction_url), 'source_backed_auction_status');
  }
  return links;
}

function leadOrigin(row) {
  const source = cleanText(`${row && row.source_family} ${row && row.motivation_type}`).toLowerCase();
  if (/probate/.test(source)) return 'probate';
  if (/\blien\b/.test(source)) return 'lien';
  if (/land[_ -]?bank/.test(source)) return 'land bank public sale';
  if (/tax[_ -]?default|power[_ -]?to[_ -]?sell|tax[_ -]?sale/.test(source)) return 'tax-default public notice';
  if (/foreclosure|trustee|preforeclosure/.test(source)) return 'pre-foreclosure public notice';
  return cleanText(row && row.source_family) || 'public source record';
}

function whyWorthChecking(row) {
  return cleanText(
    row && row.why_this_might_be_a_deal ||
    row && row.status_evidence_text ||
    row && row.filing_period_evidence_text ||
    row && row.sale_date_or_event_date ||
    row && row.source_proof_text ||
    row && row.why_call_ready_or_blocked
  ) || 'Source-backed public record. Review the source proof before acting.';
}

function lifecycleRank(row) {
  const value = cleanText(row && row.lifecycle_status && (row.lifecycle_status.status || row.lifecycle_status.lifecycle_status)).toUpperCase();
  if (value === 'FRESH') return 0;
  if (value === 'AGING') return 1;
  return 2;
}

function futureSale(row, today) {
  const value = cleanText(row && row.sale_date_iso);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= today ? value : '';
}

function rowStateRank(row) {
  const order = ['CALL_READY', 'OUTREACH_READY', 'MAIL_READY', 'NEEDS_CONTACT_SEARCH', 'NEEDS_SKIP_TRACE', 'NEEDS_COMPS', 'TITLE_NEEDED', 'LOCKED'];
  const index = order.indexOf(cleanText(row && row.row_state).toUpperCase());
  return index < 0 ? order.length : index;
}

function deterministicSampleRows(rows, market, options = {}) {
  const definition = LIVE_MARKETS.find((entry) => marketKey(entry) === marketKey(market));
  const limit = Number(options.limit || definition && definition.sample_limit || 2);
  const today = cleanText(options.today_iso) || new Date().toISOString().slice(0, 10);
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => cleanText(row && row.queue_key) && cleanText(row && (row.normalized_address || row.partial_address || row.headline)))
    .slice()
    .sort((a, b) => {
      const lifecycle = lifecycleRank(a) - lifecycleRank(b);
      if (lifecycle) return lifecycle;
      const aSale = futureSale(a, today);
      const bSale = futureSale(b, today);
      if (!!aSale !== !!bSale) return aSale ? -1 : 1;
      if (aSale && bSale && aSale !== bSale) return aSale.localeCompare(bSale);
      const state = rowStateRank(a) - rowStateRank(b);
      if (state) return state;
      return cleanText(a.queue_key).localeCompare(cleanText(b.queue_key));
    })
    .slice(0, Math.max(0, limit));
}

function publicPacket(packet, row, options) {
  const safe = packet ? JSON.parse(JSON.stringify(packet)) : {
    queue_key: cleanText(row && row.queue_key),
    screenshots: [],
    evidence_items: [],
    preview_only: true,
    should_ingest: false,
    not_a_saved_lead: true
  };
  safe.screenshots = Array.isArray(safe.screenshots) ? safe.screenshots : [];
  safe.evidence_items = Array.isArray(safe.evidence_items) ? safe.evidence_items : [];
  safe.evidence_items.forEach((item) => { item.conflicts = conflictsForItem(item, row); });
  safe.evaluation = evaluatePacket(safe, row, options);
  return safe;
}

function sampleItem(row, packetStore, market, options) {
  const packet = packetForRow(packetStore, market, cleanText(row.queue_key), false);
  const address = cleanText(row.normalized_address || row.partial_address || row.headline);
  return {
    queue_key: cleanText(row.queue_key),
    headline: cleanText(row.headline),
    address,
    address_state: cleanText(row.normalized_address) ? 'complete_source_address' : 'partial_address_verify_first',
    lead_origin: leadOrigin(row),
    source_proof_url: cleanText(row.source_document_url || row.source_url),
    why_worth_checking: whyWorthChecking(row),
    row_state: cleanText(row.row_state),
    row_state_reason: cleanText(row.row_state_reason),
    missing_evidence: Array.isArray(row.missing_fields) ? row.missing_fields.slice() : [],
    research_links: researchLinks(row),
    packet: publicPacket(packet, row, options)
  };
}

function latestManualEvidenceSnapshot(input = {}, options = {}) {
  const market = normalizeMarket(input.market);
  const packetStore = input.packet_store || readPacketStore();
  let rows = Array.isArray(input.rows) ? input.rows : null;
  if (!rows) {
    const snapshotStore = input.snapshot_store || readDealSnapshotStore();
    const bucket = snapshotStore.markets && snapshotStore.markets[marketKey(market)];
    rows = bucket && Array.isArray(bucket.rows) ? bucket.rows : [];
  }
  const selected = deterministicSampleRows(rows, market, options);
  const definition = LIVE_MARKETS.find((entry) => marketKey(entry) === marketKey(market));
  return {
    enabled: !!definition,
    sample_mode: true,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    not_a_saved_lead: true,
    market,
    desired_count: definition ? definition.sample_limit : 0,
    selected_count: selected.length,
    empty_reason: selected.length ? '' : 'No qualifying stored rows exist for this market. Nothing was substituted from another market.',
    items: selected.map((row) => sampleItem(row, packetStore, market, options)),
    outbound_research_requests: 0
  };
}

function sampleModeForAllMarkets(input = {}, options = {}) {
  const snapshotStore = input.snapshot_store || readDealSnapshotStore();
  const packetStore = input.packet_store || readPacketStore();
  return {
    sample_mode: true,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    markets: LIVE_MARKETS.map((market) => latestManualEvidenceSnapshot({ market, snapshot_store: snapshotStore, packet_store: packetStore }, options)),
    outbound_research_requests: 0
  };
}

function extractAddressProposal(text, state) {
  const states = { TX: 'TX|Texas', CA: 'CA|California', MI: 'MI|Michigan' };
  const pattern = states[cleanText(state).toUpperCase()] || cleanText(state).toUpperCase();
  if (!pattern) return '';
  const match = String(text || '').match(new RegExp(`\\b\\d{1,7}\\s+[A-Za-z0-9 .'#-]{3,70},?\\s+[A-Za-z .'-]{2,40},?\\s+(?:${pattern})\\s+\\d{5}\\b`, 'i'));
  return cleanText(match && match[0]);
}

function proposalFieldsFromText(type, text, context = {}) {
  const source = String(text || '');
  if (type === 'sold_comp') {
    return screenshotCompEvidence.extractCompCandidatesFromVisibleText(source, {
      state: context.state,
      source_url: cleanText(context.source_url)
    }).map((comp) => normalizeFields(type, Object.assign({}, comp, {
      sold_price: comp.sold_price ? `$${Number(comp.sold_price).toLocaleString('en-US')}` : '',
      similarity_basis: ''
    })));
  }
  const fields = {};
  const address = extractAddressProposal(source, context.state);
  if (address) fields.normalized_address = address;
  if (context.source_url) fields.source_url = cleanText(context.source_url);
  if (type === 'skip_trace') {
    const phone = source.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/);
    const email = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (phone) { fields.contact_value = cleanText(phone[0]); fields.contact_route_kind = 'phone'; }
    else if (email) { fields.contact_value = cleanText(email[0]); fields.contact_route_kind = 'email'; }
    fields.contact_classification = 'unknown_unverified_contact';
    fields.seller_owner_confirmed = false;
  }
  if (type === 'county_appraisal_record') {
    const assessed = source.match(/(?:assessed|appraised|tax)\s+value[^$\d]{0,20}(\$[\d,]+)/i);
    if (assessed) fields.assessed_value = cleanText(assessed[1]);
  }
  if (type === 'auction_status') {
    const date = source.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
    const bid = source.match(/(?:minimum|min\.?\s+bid)[^$\d]{0,20}(\$[\d,]+)/i);
    if (date) fields.sale_date = cleanText(date[0]);
    if (bid) fields.minimum_bid = cleanText(bid[1]);
  }
  if (type === 'subject_property') {
    const zestimate = source.match(/zestimate[^$\d]{0,20}(\$[\d,]+)/i);
    const listPrice = source.match(/(?:list|asking)\s+price[^$\d]{0,20}(\$[\d,]+)/i);
    if (zestimate) fields.zestimate = cleanText(zestimate[1]);
    if (listPrice) fields.list_price = cleanText(listPrice[1]);
  }
  return [normalizeFields(type, fields)];
}

async function ocrBuffer(buffer, options = {}) {
  if (typeof options.ocr_impl === 'function') return cleanText(await options.ocr_impl(buffer));
  const Tesseract = require('tesseract.js');
  const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
  return cleanText(result && result.data && result.data.text);
}

function packetResponse(market, queueKey, options = {}) {
  const row = snapshotRow(market, queueKey, options);
  if (!row) return latestManualEvidenceSnapshot({ market }, options);
  return {
    ok: true,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    manual_evidence_item: sampleItem(row, readPacketStore(), market, options)
  };
}

async function uploadScreenshot(input = {}, options = {}) {
  const market = normalizeMarket(input.market);
  const queueKey = cleanText(input.queue_key);
  const type = normalizeEvidenceType(input.evidence_type);
  const sourceName = cleanText(input.source_name);
  const buffer = input.buffer;
  if (!queueKey) throw serviceError('queue_key is required', 'manual_evidence_queue_key_required', 400);
  if (!type) throw serviceError('evidence_type is invalid', 'manual_evidence_type_invalid', 400);
  if (!sourceName) throw serviceError('source_name is required', 'manual_evidence_source_name_required', 400);
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw serviceError('screenshot file is required', 'manual_evidence_file_required', 400);
  if (buffer.length > MAX_UPLOAD_BYTES) throw serviceError('screenshot exceeds the 8MB limit', 'manual_evidence_file_too_large', 413);
  const detected = imageType(buffer);
  if (!detected) throw serviceError('file content is not a supported PNG, JPG, or WebP image', 'manual_evidence_file_magic_invalid', 415);
  const row = snapshotRow(market, queueKey, options);
  if (!row) throw serviceError('The selected snapshot row was not found.', 'manual_evidence_row_not_found', 404);

  const capturedAt = cleanText(input.captured_at) || nowIso(options);
  const screenshotId = crypto.randomUUID();
  const sourceUrl = cleanText(input.source_url);
  let ocrText = '';
  let ocrFailed = false;
  try { ocrText = await ocrBuffer(buffer, options); }
  catch (error) { ocrFailed = true; }
  const proposals = proposalFieldsFromText(type, ocrText, { state: market.state, source_url: sourceUrl });
  const normalizedProposals = proposals.length ? proposals : [normalizeFields(type, { source_url: sourceUrl })];
  const metadata = {
    screenshot_id: screenshotId,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    filename: safeFilename(input.filename),
    mime: detected.mime,
    byte_size: buffer.length,
    captured_at: capturedAt,
    source_name: sourceName
  };
  const evidenceItems = normalizedProposals.map((fields) => {
    const evidenceId = crypto.randomUUID();
    const provenance = { screenshot_id: screenshotId, captured_at: capturedAt, source_name: sourceName, operator_confirmed: false };
    return {
      evidence_id: evidenceId,
      evidence_type: type,
      screenshot_id: screenshotId,
      source_kind: SOURCE_KIND,
      captured_at: capturedAt,
      source_name: sourceName,
      operator_confirmed: false,
      proposal_status: ocrFailed
        ? 'ocr_failed_manual_entry_required'
        : Object.keys(fields).some((key) => key !== 'source_url')
          ? 'ocr_proposal_needs_confirmation'
          : 'ocr_no_usable_fields_manual_entry_required',
      fields,
      field_evidence: fieldEvidence(fields, provenance),
      conflicts: conflictsForItem({ fields }, row)
    };
  });
  const cacheDir = screenshotCacheDir();
  const imageFile = path.join(cacheDir, `${screenshotId}${detected.extension}`);
  fs.mkdirSync(cacheDir, { recursive: true });
  let fileWritten = false;
  try {
    fs.writeFileSync(imageFile, buffer, { flag: 'wx' });
    fileWritten = true;
    const store = readPacketStore();
    const packet = packetForRow(store, market, queueKey, true);
    packet.screenshots = (Array.isArray(packet.screenshots) ? packet.screenshots : []).concat([metadata]);
    packet.evidence_items = (Array.isArray(packet.evidence_items) ? packet.evidence_items : []).concat(evidenceItems);
    packet.updated_at = capturedAt;
    writePacketStore(store);
  } catch (error) {
    if (fileWritten) {
      try { fs.unlinkSync(imageFile); } catch (cleanupError) { /* best effort */ }
    }
    throw error;
  }
  return packetResponse(market, queueKey, options);
}

function recordEvidenceProposal(input = {}, options = {}) {
  const market = normalizeMarket(input.market);
  const queueKey = cleanText(input.queue_key);
  const evidenceId = cleanText(input.evidence_id);
  if (!queueKey || !evidenceId) throw serviceError('queue_key and evidence_id are required', 'manual_evidence_identity_required', 400);
  const row = snapshotRow(market, queueKey, options);
  if (!row) throw serviceError('The selected snapshot row was not found.', 'manual_evidence_row_not_found', 404);
  const store = readPacketStore();
  const packet = packetForRow(store, market, queueKey, false);
  const item = packet && Array.isArray(packet.evidence_items)
    ? packet.evidence_items.find((entry) => cleanText(entry && entry.evidence_id) === evidenceId)
    : null;
  if (!item) throw serviceError('The selected screenshot proposal was not found.', 'manual_evidence_proposal_not_found', 404);
  if (!Array.isArray(packet.screenshots) || !packet.screenshots.some((shot) => cleanText(shot && shot.screenshot_id) === cleanText(item.screenshot_id))) {
    throw serviceError('The proposal has no matching screenshot metadata.', 'manual_evidence_screenshot_not_found', 404);
  }
  const fields = normalizeFields(item.evidence_type, input.fields);
  const confirmed = input.operator_confirmed === true;
  item.fields = fields;
  item.operator_confirmed = confirmed;
  item.confirmed_at = confirmed ? nowIso(options) : '';
  item.confirmed_by = confirmed ? cleanText(options.operator_id) || 'admin' : '';
  item.proposal_status = confirmed ? 'operator_confirmed' : 'operator_confirmation_required';
  item.field_evidence = fieldEvidence(fields, {
    screenshot_id: item.screenshot_id,
    captured_at: item.captured_at,
    source_name: item.source_name,
    operator_confirmed: confirmed
  });
  item.conflicts = conflictsForItem(item, row);
  packet.updated_at = nowIso(options);
  writePacketStore(store);
  return packetResponse(market, queueKey, options);
}

module.exports = {
  MAX_UPLOAD_BYTES,
  SOURCE_KIND,
  EVIDENCE_TYPES,
  CONTACT_CLASSIFICATIONS,
  LIVE_MARKETS,
  packetFilePath,
  screenshotCacheDir,
  imageType,
  normalizeFields,
  proposalFieldsFromText,
  researchLinks,
  leadOrigin,
  deterministicSampleRows,
  evaluatePacket,
  latestManualEvidenceSnapshot,
  sampleModeForAllMarkets,
  uploadScreenshot,
  recordEvidenceProposal
};
