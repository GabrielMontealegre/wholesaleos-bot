'use strict';

const propertyCandidate = require('../research/property-candidate');
const landBankProfiles = require('./mi-detroit-land-bank-source-profiles');
const documentLedger = require('./tx-county-foreclosure-acquisition-adapter');

const SOURCE_ID = 'mi_wayne_detroit_land_bank_listings';
const SOURCE_FAMILY = 'land_bank_public_sale';
const MAX_ROWS = 25;
const MAX_PAGES_PER_BATCH = 5;
const PAGE_SIZE = 5;
const MAX_DISCOVERED_PAGES = 100;

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function nowIso() {
  return new Date().toISOString();
}

function boundedInt(value, fallback, maximum) {
  const number = Number(value);
  return Math.max(1, Math.min(Number.isFinite(number) ? Math.floor(number) : fallback, maximum));
}

function postingMonth(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function profileForSourceId(sourceId) {
  const id = cleanText(sourceId || SOURCE_ID);
  return landBankProfiles.PROFILES.find((profile) => profile.source_id === id) || null;
}

function officialHost(profile, value) {
  try {
    const host = new URL(cleanText(value)).hostname.toLowerCase();
    return (profile.official_hosts || []).some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch (error) {
    return false;
  }
}

function pageLedgerUrl(profile, pageNumber) {
  return `${profile.api_url}?page=${pageNumber}&limit=${PAGE_SIZE}`;
}

function resetCompletedInventoryCycle(ledger, profile, totalPages, month) {
  if (!ledger || !ledger.documents) return 0;
  const pageUrls = new Set(Array.from({ length: totalPages }, (_, index) => pageLedgerUrl(profile, index + 1).toLowerCase()));
  const completed = Array.from(pageUrls).every((url) => documentLedger.documentAlreadyRead(ledger, url, month));
  if (!completed) return 0;
  for (const key of Object.keys(ledger.documents)) {
    const entry = ledger.documents[key] || {};
    if (cleanText(entry.posting_month) !== month) continue;
    if (pageUrls.has(cleanText(entry.document_url).toLowerCase())) delete ledger.documents[key];
  }
  return 1;
}

function displayedPrice(value) {
  const text = cleanText(value).replace(/[$,]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return '';
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return '';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function explicitPropertyKind(row) {
  const text = cleanText([row && row.name, row && row.marketable_feature, row && row.short_description].filter(Boolean).join(' '));
  if (/\b(?:side\s+lot|vacant\s+lot|vacant\s+land)\b/i.test(text)) return 'vacant_lot';
  if (cleanText(row && row.bedrooms) || cleanText(row && row.area)) return 'structure';
  return '';
}

function normalizedAddressFromListing(row) {
  const street = cleanText(row && row.property_name);
  const city = cleanText(row && row.city);
  const state = cleanText(row && row.state).toUpperCase();
  const zip = cleanText(row && row.zipcode);
  if (!/^\d{1,7}\s+[A-Za-z0-9][A-Za-z0-9 .#'/-]{1,100}$/.test(street) || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}(?:-\d{4})?$/.test(zip)) return '';
  return `${street}, ${city}, ${state} ${zip}`;
}

function detailUrlForListing(profile, row) {
  const identifier = cleanText(row && row.property_identifier);
  if (!/^[a-z0-9-]+$/i.test(identifier)) return '';
  return new URL(`/properties/${identifier}`, profile.source_url).toString();
}

function candidateFromListing(row, profile, context = {}) {
  const address = normalizedAddressFromListing(row);
  const detailUrl = detailUrlForListing(profile, row);
  if (!address || !detailUrl || !officialHost(profile, detailUrl)) return null;
  const program = cleanText(row && row.name);
  const listedPrice = displayedPrice(row && row.price);
  const listingDate = cleanText(row && row.sale_date);
  const offerDeadline = cleanText(row && row.offer_deadline);
  const auctionClosing = cleanText(row && row.auction_closing_time);
  const isAuction = /\bauction\b/i.test(cleanText([row && row.category_type, program].filter(Boolean).join(' ')));
  const eventDate = isAuction
    ? auctionClosing || offerDeadline || listingDate
    : offerDeadline || listingDate;
  const propertyKind = explicitPropertyKind(row);
  const evidence = [
    'Detroit Land Bank public sale listing',
    program ? `Program: ${program}` : '',
    listedPrice ? `Displayed listing price: ${listedPrice}` : '',
    eventDate ? `Source event date: ${eventDate}` : '',
    propertyKind ? `Property kind: ${propertyKind}` : ''
  ].filter(Boolean).join(' | ');
  const candidate = propertyCandidate.normalizePropertyCandidate({
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: SOURCE_FAMILY,
    source_type: 'public_land_bank_listing',
    source_classification: 'official_source_record',
    official_source: true,
    source_url: profile.source_url,
    source_document_url: detailUrl,
    source_row_reference: cleanText(row && (row.property_id || row.property_identifier)),
    normalized_address: address,
    property_address: address,
    source_url_address_candidate: address,
    raw_address_text: cleanText(row && row.address) || address,
    source_structured_address_verified: true,
    city: cleanText(row && row.city) || profile.city,
    county: profile.county,
    state: cleanText(row && row.state).toUpperCase() || profile.state,
    zip: cleanText(row && row.zipcode),
    motivation_type: SOURCE_FAMILY,
    motivation_phrase: 'Detroit Land Bank public sale listing',
    motivation_evidence_text: evidence,
    source_proof_text: evidence,
    current_status: program ? `${program} listing` : 'Public land bank listing',
    status_evidence_text: [program ? `${program} public listing` : '', eventDate ? `Source event date ${eventDate}` : ''].filter(Boolean).join(' | '),
    event_date: eventDate,
    listing_date_if_visible: listingDate,
    offer_deadline_if_visible: offerDeadline,
    auction_closing_at_if_visible: auctionClosing,
    listed_price: listedPrice,
    listed_price_evidence_text: listedPrice ? `Displayed listing price: ${listedPrice}` : '',
    program,
    property_kind_if_visible: propertyKind,
    vacant_lot_if_visible: propertyKind === 'vacant_lot' ? true : null,
    beds: cleanText(row && row.bedrooms),
    baths: cleanText(row && row.bathrooms),
    sqft: cleanText(row && row.area),
    risk_flags: listedPrice ? ['LISTED_PRICE_NOT_ARV_OR_MAO'] : [],
    retrieved_at: cleanText(context.captured_at) || nowIso(),
    preview_only: true,
    should_ingest: false
  }, {
    acquisition_run_id: cleanText(context.acquisition_run_id),
    city: profile.city,
    state: profile.state
  });
  // The public feed supplies street, city, state, and zip as separate fields.
  // Some Detroit street names have no suffix (for example "13905 Sussex").
  // Preserve that exact structured identity instead of guessing a suffix.
  candidate.normalized_address = address;
  candidate.property_address = address;
  candidate.raw_address_text = cleanText(row && row.address) || address;
  candidate.city = cleanText(row && row.city) || profile.city;
  candidate.county = profile.county;
  candidate.state = cleanText(row && row.state).toUpperCase() || profile.state;
  candidate.zip = cleanText(row && row.zipcode);
  candidate.source_structured_address_verified = true;
  candidate.not_a_saved_lead = true;
  return candidate;
}

function challengeText(value) {
  return /captcha|access\s+denied|verify\s+you\s+are\s+human|cloudflare\s+challenge|challenge-platform/i.test(cleanText(value));
}

async function fetchListingPage(profile, pageNumber, options = {}) {
  const fetchImpl = options.fetch_impl || options.fetchImpl || global.fetch || require('node-fetch');
  if (typeof fetchImpl !== 'function') return { ok: false, blocked_reason: 'fetch_unavailable', page_number: pageNumber, listings: [] };
  const controller = new AbortController();
  const timeoutMs = boundedInt(options.timeout_ms, 10000, 15000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const body = new URLSearchParams({
    bathrooms: '', bedrooms: '', category: '', district: '', fromsaledate: '',
    isJson: '1', limit: String(PAGE_SIZE), location: '', maxsqft: '', minsqft: '',
    page: String(pageNumber), sortorder: 'ASC', tosaledate: ''
  });
  try {
    const response = await fetchImpl(profile.api_url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        referer: profile.source_url,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
      },
      body: body.toString(),
      signal: controller.signal
    });
    const finalUrl = cleanText(response && response.url) || profile.api_url;
    if (!officialHost(profile, finalUrl)) return { ok: false, blocked_reason: 'unsafe_redirect_rejected', page_number: pageNumber, listings: [] };
    const text = await response.text();
    if (challengeText(text)) return { ok: false, blocked_reason: 'challenge_or_access_gate', page_number: pageNumber, listings: [] };
    if (!response.ok) return { ok: false, blocked_reason: `http_${Number(response.status || 0)}`, page_number: pageNumber, listings: [] };
    let payload;
    try { payload = JSON.parse(text); } catch (error) {
      return { ok: false, blocked_reason: 'invalid_json_response', page_number: pageNumber, listings: [] };
    }
    if (!payload || !Array.isArray(payload.listings)) return { ok: false, blocked_reason: 'invalid_listing_payload', page_number: pageNumber, listings: [] };
    return {
      ok: true,
      page_number: pageNumber,
      listings: payload.listings.slice(0, PAGE_SIZE),
      total_pages: boundedInt(payload.pagination && payload.pagination.last_page, 1, MAX_DISCOVERED_PAGES),
      total_listings: Math.max(0, Number(payload.pagination && payload.pagination.total || payload.listings.length) || 0),
      source_url: finalUrl
    };
  } catch (error) {
    const reason = error && error.name === 'AbortError' ? 'fetch_timeout' : `fetch_failed:${cleanText(error && error.message).slice(0, 80) || 'unknown'}`;
    return { ok: false, blocked_reason: reason, page_number: pageNumber, listings: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function runMiLandBankAcquisitionAdapter(options = {}) {
  const profile = profileForSourceId(options.source_id);
  if (!profile) {
    return {
      source_id: cleanText(options.source_id), status: 'not_configured', attempted: false,
      candidates: [], cards: [], diagnostics: { adapter_available: false },
      preview_only: true, should_ingest: false, no_global_mutation: true
    };
  }
  const now = options.now instanceof Date ? options.now : new Date();
  const month = postingMonth(now);
  const context = {
    acquisition_run_id: cleanText(options.acquisition_run_id),
    captured_at: cleanText(options.captured_at) || now.toISOString()
  };
  const ledger = documentLedger.readDocumentLedger(options, profile);
  const firstPage = await fetchListingPage(profile, 1, options);
  const firstPageLedgerUrl = pageLedgerUrl(profile, 1);
  if (!firstPage.ok) {
    documentLedger.recordDocumentLedgerAttempt(ledger, firstPageLedgerUrl, month, 'hard_failed');
    documentLedger.writeDocumentLedger(ledger, now, options, profile);
    return {
      source_id: profile.source_id,
      source_name: profile.source_name,
      source_family: SOURCE_FAMILY,
      source_url: profile.source_url,
      county: profile.county,
      state: profile.state,
      status: 'needs_manual_review',
      attempted: true,
      blocked_reason: firstPage.blocked_reason,
      candidates: [], cards: [], candidate_count: 0,
      diagnostics: { pages_discovered: 0, pages_processed: 0, pages_ledger_skipped: 0, inventory_rotation_reset_count: 0, docs_discovered: 0, docs_processed: 0, docs_ledger_skipped: 0 },
      preview_only: true, should_ingest: false, no_global_mutation: true
    };
  }

  const totalPages = firstPage.total_pages;
  const inventoryRotationResetCount = resetCompletedInventoryCycle(ledger, profile, totalPages, month);
  const selectedPages = [];
  const blockedPages = [];
  let networkPagesRead = 1;
  let ledgerSkipped = 0;
  const firstAlreadyRead = documentLedger.documentAlreadyRead(ledger, firstPageLedgerUrl, month);
  if (firstAlreadyRead) {
    ledgerSkipped += 1;
  } else {
    selectedPages.push(firstPage);
    documentLedger.recordDocumentLedgerAttempt(ledger, firstPageLedgerUrl, month, 'done');
  }

  for (let pageNumber = 2; pageNumber <= totalPages && networkPagesRead < MAX_PAGES_PER_BATCH; pageNumber += 1) {
    const ledgerUrl = pageLedgerUrl(profile, pageNumber);
    if (documentLedger.documentAlreadyRead(ledger, ledgerUrl, month)) {
      ledgerSkipped += 1;
      continue;
    }
    const page = await fetchListingPage(profile, pageNumber, options);
    networkPagesRead += 1;
    if (page.ok) {
      selectedPages.push(page);
      documentLedger.recordDocumentLedgerAttempt(ledger, ledgerUrl, month, 'done');
    } else {
      blockedPages.push({ page_number: pageNumber, reason: page.blocked_reason });
      documentLedger.recordDocumentLedgerAttempt(ledger, ledgerUrl, month, 'hard_failed');
    }
  }
  documentLedger.writeDocumentLedger(ledger, now, options, profile);

  const candidates = [];
  const seen = new Set();
  for (const page of selectedPages) {
    for (const listing of page.listings) {
      const candidate = candidateFromListing(listing, profile, context);
      if (!candidate) continue;
      const key = cleanText(candidate.source_document_url).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
      if (candidates.length >= MAX_ROWS) break;
    }
    if (candidates.length >= MAX_ROWS) break;
  }
  const cards = candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, {
    acquisition_run_id: context.acquisition_run_id,
    city: profile.city,
    state: profile.state
  }));
  const blockedReason = candidates.length
    ? ''
    : blockedPages.length
      ? blockedPages[0].reason
      : 'inventory_pages_exhausted_for_posting_month';
  return {
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: SOURCE_FAMILY,
    source_url: profile.source_url,
    county: profile.county,
    state: profile.state,
    status: candidates.length ? 'available' : 'needs_manual_review',
    attempted: true,
    message: candidates.length ? `${candidates.length} public Detroit Land Bank listings.` : profile.blocked_note,
    blocked_reason: blockedReason,
    candidates,
    cards,
    candidate_count: candidates.length,
    discovered_links: candidates.map((candidate) => candidate.source_document_url),
    document_urls_found: candidates.map((candidate) => candidate.source_document_url),
    diagnostics: {
      pages_discovered: totalPages,
      pages_processed: selectedPages.length,
      pages_ledger_skipped: ledgerSkipped,
      inventory_rotation_reset_count: inventoryRotationResetCount,
      network_pages_read: networkPagesRead,
      total_listings_reported: firstPage.total_listings,
      rows_extracted: candidates.length,
      blocked_pages: blockedPages,
      docs_discovered: totalPages,
      docs_processed: selectedPages.length,
      docs_ledger_skipped: ledgerSkipped
    },
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    captured_at: context.captured_at
  };
}

module.exports = {
  SOURCE_ID,
  SOURCE_FAMILY,
  MAX_ROWS,
  MAX_PAGES_PER_BATCH,
  PAGE_SIZE,
  profileForSourceId,
  displayedPrice,
  normalizedAddressFromListing,
  resetCompletedInventoryCycle,
  candidateFromListing,
  fetchListingPage,
  runMiLandBankAcquisitionAdapter
};
