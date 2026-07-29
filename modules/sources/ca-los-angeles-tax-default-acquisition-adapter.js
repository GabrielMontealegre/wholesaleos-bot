'use strict';

const propertyCandidate = require('../research/property-candidate');
const propertyIdentity = require('../research/property-identity');
const losAngelesProfiles = require('./ca-los-angeles-tax-default-source-profiles');
const documentLedger = require('./tx-county-foreclosure-acquisition-adapter');

const SOURCE_ID = 'ca_los_angeles_tax_default_auction_book';
const SOURCE_FAMILY = 'tax_default_auction_book';
const MAX_ROWS = 25;
const MAX_PAGES_PER_BATCH = 5;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

const ITEM_AIN_RE = /\b\d{1,5}\s+\d{4}-\d{3}-\d{3}\b/g;
const ITEM_AIN_PREFIX_RE = /^\s*(\d{1,5})\s+(\d{4}-\d{3}-\d{3})\s*/i;
const MINIMUM_BID_RE = /^(\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?)(.*)$/;
const COMPLETE_ADDRESS_RE = /\b(\d{1,7}\s+[A-Za-z0-9][A-Za-z0-9 .#'/-]{0,120}?\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b(?:\s+(?:unit|no|#)\s*[A-Za-z0-9-]+)?)\s+([A-Z][A-Za-z .'-]{1,60})\s+CA\s+(\d{5}(?:-\d{4})?)\b/i;
const PARTIAL_ADDRESS_RE = /\b(\d{1,7}\s+[A-Za-z0-9][A-Za-z0-9 .#'/-]{0,120}?\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b(?:\s+(?:unit|no|#)\s*[A-Za-z0-9-]+)?)\b/i;
const CITY_HEADER_RE = /\bCITY[-\s]+([A-Z][A-Z .'-]{1,60}?)(?=\s+(?:VACANT LOT|COUNTY OF LOS ANGELES|\d{1,7}\s|$))/i;
const VACANT_LOT_RE = /\bVACANT\s+LOT\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function boundedInt(value, fallback, maximum) {
  const number = Number(value);
  return Math.max(1, Math.min(Number.isFinite(number) ? Math.floor(number) : fallback, maximum));
}

function profileForSourceId(sourceId) {
  const id = cleanText(sourceId || SOURCE_ID);
  return losAngelesProfiles.PROFILES.find((profile) => profile.source_id === id) || null;
}

function hostOf(value) {
  try {
    return new URL(cleanText(value)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (error) {
    return '';
  }
}

function officialHost(profile, value) {
  const host = hostOf(value);
  return !!host && (profile.official_hosts || []).some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function postingMonth(now) {
  const date = now instanceof Date ? now : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function pageLedgerUrl(profile, pageNumber) {
  return `${profile.document_url}#page=${pageNumber}`;
}

function pageTextFromPdfPage(pageData) {
  return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((content) => {
    let text = '';
    let lastY = null;
    for (const item of content.items || []) {
      const value = item && item.str || '';
      const y = item && item.transform && item.transform[5];
      if (lastY === null || y === lastY) text += value;
      else text += `\n${value}`;
      lastY = y;
    }
    return text;
  });
}

async function parsePdfPages(buffer, options = {}) {
  const pdfParse = options.pdf_parse_impl || require('pdf-parse');
  const pageTexts = [];
  const parsed = await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const text = await pageTextFromPdfPage(pageData);
      pageTexts.push(text);
      return text;
    }
  });
  const explicitPages = Array.isArray(parsed && parsed.page_texts)
    ? parsed.page_texts
    : Array.isArray(parsed && parsed.pages_text)
      ? parsed.pages_text
      : Array.isArray(parsed && parsed.pages)
        ? parsed.pages
        : pageTexts;
  return {
    pages: (explicitPages.length ? explicitPages : [parsed && parsed.text || '']).map((text) => String(text || '')),
    numpages: Number(parsed && parsed.numpages || explicitPages.length || pageTexts.length) || explicitPages.length || pageTexts.length || 1
  };
}

async function fetchNoticePdf(profile, options = {}) {
  const fetchImpl = options.fetch_impl || options.fetchImpl || global.fetch || require('node-fetch');
  if (typeof fetchImpl !== 'function') return { ok: false, blocked_reason: 'fetch_unavailable', buffer: null };
  const controller = new AbortController();
  const timeoutMs = boundedInt(options.timeout_ms, 10000, 15000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(profile.document_url, {
      headers: {
        accept: 'application/pdf,*/*',
        referer: profile.source_url,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
      },
      signal: controller.signal
    });
    const finalUrl = cleanText(response && response.url) || profile.document_url;
    if (!officialHost(profile, finalUrl)) return { ok: false, blocked_reason: 'unsafe_redirect_rejected', buffer: null };
    if (!response.ok) return { ok: false, blocked_reason: `http_${Number(response.status || 0)}`, buffer: null };
    const length = Number(response.headers && response.headers.get && response.headers.get('content-length') || 0) || 0;
    if (length > MAX_PDF_BYTES) return { ok: false, blocked_reason: 'pdf_too_large', buffer: null };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_PDF_BYTES) return { ok: false, blocked_reason: 'pdf_too_large', buffer: null };
    return { ok: true, final_url: finalUrl, buffer };
  } catch (error) {
    return {
      ok: false,
      blocked_reason: error && error.name === 'AbortError' ? 'fetch_timeout' : `fetch_failed:${cleanText(error && error.message).slice(0, 80) || 'unknown'}`,
      buffer: null
    };
  } finally {
    clearTimeout(timer);
  }
}

function startOfPageBlocks(pageText) {
  const lines = String(pageText || '').replace(/\r/g, '\n').split(/\n/).map(cleanText).filter(Boolean);
  const text = lines.join(' ');
  const starts = [];
  let match;
  ITEM_AIN_RE.lastIndex = 0;
  while ((match = ITEM_AIN_RE.exec(text))) starts.push(match.index);
  return starts.map((start, index) => cleanText(text.slice(start, starts[index + 1] || text.length))).filter(Boolean);
}

function visibleMoney(value) {
  const text = cleanText(value).replace(/\s+/g, '');
  return /^\$\d[\d,]*(?:\.\d{2})?$/.test(text) ? text : '';
}

function splitAuctionRowColumns(block) {
  const source = cleanText(block);
  const header = source.match(ITEM_AIN_PREFIX_RE);
  if (!header) return null;
  const columns = {
    item_number: cleanText(header[1]),
    apn: cleanText(header[2]),
    minimum_bid: '',
    nsb_number: '',
    improvement_flag: '',
    bid_parse_status: 'missing',
    row_text: cleanText(source.slice(header[0].length))
  };
  const moneyMatch = columns.row_text.match(MINIMUM_BID_RE);
  if (!moneyMatch) return columns;
  let tail = String(moneyMatch[2] || '').trimStart();
  columns.minimum_bid = cleanText(moneyMatch[1]);
  columns.bid_parse_status = 'parsed';
  if (/^[,.]/.test(tail)) {
    columns.minimum_bid = '';
    columns.bid_parse_status = 'ambiguous';
    return columns;
  }
  if (/^[YN]\b/i.test(tail) || /^[YN]\d/i.test(tail)) {
    columns.improvement_flag = tail.charAt(0).toUpperCase();
    tail = tail.slice(1).trimStart();
  }
  const nsbMatch = tail.match(/^(\d{3,})(?:\b|\s|[A-Za-z])/);
  if (/^\d/.test(tail)) {
    if (!nsbMatch) {
      columns.minimum_bid = '';
      columns.bid_parse_status = 'ambiguous';
      return columns;
    }
    columns.nsb_number = cleanText(nsbMatch[1]);
    tail = tail.slice(nsbMatch[1].length).trimStart();
  }
  columns.row_text = cleanText(tail || columns.row_text);
  return columns;
}

function extractAddressFromBlock(block) {
  const text = cleanText(block);
  const cityHeaderMatch = text.match(/CITY[-\s]+([A-Z][A-Z .'-]{1,60})/i);
  if (cityHeaderMatch) {
    const afterCity = cleanText(text.slice(cityHeaderMatch.index + cityHeaderMatch[0].length));
    const fullMatch = afterCity.match(/^\s*(\d{1,7}\s+[A-Za-z0-9][A-Za-z0-9 .#'/-]{0,60}\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b(?:\s+(?:unit|no|#)\s*[A-Za-z0-9-]+)?)\s+([A-Za-z][A-Za-z .'-]{1,60})\s+CA\s+(\d{5}(?:-\d{4})?)\b/i);
    if (fullMatch) return propertyIdentity.canonicalAddress(`${cleanText(fullMatch[1])}, ${cleanText(fullMatch[2])}, CA ${cleanText(fullMatch[3])}`);
  }
  const partial = text.match(PARTIAL_ADDRESS_RE);
  const city = cleanText((text.match(CITY_HEADER_RE) || [])[1]);
  if (partial && city) return propertyIdentity.canonicalAddress(`${cleanText(partial[1])}, ${city}, CA`);
  return partial ? cleanText(partial[1]) : '';
}

function extractCityFromBlock(block) {
  const text = cleanText(block);
  const cityHeaderMatch = text.match(/CITY[-\s]+([A-Z][A-Z .'-]{1,60})/i);
  if (cityHeaderMatch) return cleanText(cityHeaderMatch[1]);
  const fullMatch = text.match(/\b(\d{1,7}\s+[A-Za-z0-9][A-Za-z0-9 .#'/-]{0,60}\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop)\b(?:\s+(?:unit|no|#)\s*[A-Za-z0-9-]+)?)\s+([A-Za-z][A-Za-z .'-]{1,60})\s+CA\s+\d{5}(?:-\d{4})?\b/i);
  if (fullMatch) return cleanText(fullMatch[2]);
  return cleanText((text.match(CITY_HEADER_RE) || [])[1]);
}

function parseAuctionBookRowsFromText(text, profile = profileForSourceId(SOURCE_ID)) {
  return startOfPageBlocks(text).map((block) => {
    const source = cleanText(block);
    const columns = splitAuctionRowColumns(source);
    if (!columns) return null;
    const apn = cleanText(columns.apn);
    const amount = visibleMoney(columns.minimum_bid);
    const address = extractAddressFromBlock(source);
    const city = extractCityFromBlock(source);
    const addressEligible = cleanText(columns.bid_parse_status) !== 'ambiguous';
    const completeAddress = addressEligible && propertyIdentity.isCompleteAddress(address) ? propertyIdentity.canonicalAddress(address) : '';
    const rowText = cleanText(columns.row_text || source);
    const improvementFlag = cleanText(columns.improvement_flag);
    const vacantFromOwnRowText = VACANT_LOT_RE.test(rowText);
    const vacantLot = improvementFlag === 'N' ? true : improvementFlag === 'Y' ? false : vacantFromOwnRowText ? true : null;
    const propertyKind = vacantLot === true ? 'vacant_lot' : improvementFlag === 'Y' ? 'improved' : '';
    const sourceText = cleanText(source);
    return {
      item_number: cleanText(columns.item_number),
      apn,
      owner_name: '',
      street_address: completeAddress || '',
      city: cleanText((completeAddress ? propertyIdentity.parseAddress(completeAddress).city : '') || city),
      minimum_bid: amount,
      minimum_bid_evidence_text: amount ? `Minimum bid shown in Los Angeles County auction book: ${amount}` : '',
      nsb_number: cleanText(columns.nsb_number),
      improvement_flag: improvementFlag,
      bid_parse_status: cleanText(columns.bid_parse_status),
      source_text: sourceText,
      source_proof_text: sourceText,
      raw_text: sourceText,
      property_kind_if_visible: propertyKind,
      vacant_lot_if_visible: vacantLot,
      is_complete_address: !!completeAddress,
      property_address: completeAddress || '',
      raw_address_text: completeAddress || address || sourceText,
      source_row_reference: apn
    };
  }).filter(Boolean);
}

function candidateFromAuctionRow(row, profile, context = {}) {
  const apn = cleanText(row && row.apn);
  const ownerName = cleanText(row && row.owner_name);
  const completeAddress = cleanText(row && row.property_address);
  const rawAddress = cleanText(row && row.raw_address_text);
  const amount = visibleMoney(row && row.minimum_bid);
  const city = cleanText(row && row.city);
  const sourceText = cleanText(row && row.source_text);
  const evidence = [
    'Los Angeles County 2026A tax-defaulted auction book',
    apn ? `APN: ${apn}` : '',
    cleanText(row && row.nsb_number) ? `NSB#: ${cleanText(row && row.nsb_number)}` : '',
    cleanText(row && row.improvement_flag) ? `IMP: ${cleanText(row && row.improvement_flag)}` : '',
    ownerName ? `Owner clue: ${ownerName}` : '',
    completeAddress ? `Property address: ${completeAddress}` : '',
    !completeAddress && rawAddress ? `Source text: ${rawAddress}` : '',
    amount ? `Minimum bid: ${amount}` : ''
  ].filter(Boolean).join(' | ');
  const rawAddressText = completeAddress || rawAddress;
  const normalizedAddress = completeAddress || '';
  const candidate = propertyCandidate.normalizePropertyCandidate({
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: SOURCE_FAMILY,
    source_type: 'official_tax_default_auction_book',
    source_classification: 'official_source_record',
    official_source: true,
    source_url: profile.source_url,
    source_document_url: profile.document_url,
    source_row_reference: apn,
    parcel_or_account: apn,
    apn,
    normalized_address: normalizedAddress,
    property_address: completeAddress || '',
    raw_address_text: rawAddressText,
    city: city || profile.city,
    county: profile.county,
    state: profile.state,
    owner_name_candidate: ownerName,
    owner_name: ownerName,
    motivation_type: SOURCE_FAMILY,
    motivation_phrase: 'Los Angeles County tax-defaulted auction book',
    motivation_evidence_text: evidence,
    source_proof_text: sourceText ? sourceText.slice(0, 1200) : evidence,
    current_status: 'Los Angeles County tax-defaulted auction book',
    status_evidence_text: 'Los Angeles County Treasurer and Tax Collector 2026A resolution list online auction sale.',
    minimum_bid: amount,
    minimum_bid_evidence_text: amount ? `Minimum bid shown in Los Angeles County auction book: ${amount}` : '',
    nsb_number: cleanText(row && row.nsb_number),
    improvement_flag: cleanText(row && row.improvement_flag),
    risk_flags: amount ? ['MINIMUM_BID_NOT_ARV_OR_MAO'] : [],
    program: '2026A Online Auction',
    property_kind_if_visible: cleanText(row && row.property_kind_if_visible),
    vacant_lot_if_visible: row && row.vacant_lot_if_visible === true ? true : row && row.vacant_lot_if_visible === false ? false : null,
    retrieved_at: cleanText(context.captured_at) || nowIso(),
    preview_only: true,
    should_ingest: false,
    not_a_saved_lead: true
  }, {
    acquisition_run_id: cleanText(context.acquisition_run_id),
    city: city || profile.city,
    state: profile.state
  });
  candidate.normalized_address = normalizedAddress;
  candidate.property_address = completeAddress || '';
  candidate.raw_address_text = rawAddressText;
  candidate.city = city || profile.city;
  candidate.county = profile.county;
  candidate.state = profile.state;
  candidate.parcel_or_account = apn;
  candidate.source_row_reference = apn;
  candidate.minimum_bid = amount;
  candidate.minimum_bid_evidence_text = amount ? `Minimum bid shown in Los Angeles County auction book: ${amount}` : '';
  candidate.nsb_number = cleanText(row && row.nsb_number);
  candidate.improvement_flag = cleanText(row && row.improvement_flag);
  candidate.program = '2026A Online Auction';
  candidate.property_kind_if_visible = cleanText(row && row.property_kind_if_visible);
  candidate.vacant_lot_if_visible = row && row.vacant_lot_if_visible === true ? true : row && row.vacant_lot_if_visible === false ? false : null;
  candidate.risk_flags = Array.from(new Set([].concat(candidate.risk_flags || [], amount ? ['MINIMUM_BID_NOT_ARV_OR_MAO'] : [])));
  candidate.preview_only = true;
  candidate.should_ingest = false;
  candidate.not_a_saved_lead = true;
  return candidate;
}

function resetCompletedAuctionCycle(ledger, profile, totalPages, month) {
  if (!ledger || !ledger.documents || totalPages <= 0) return 0;
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

async function runCaLosAngelesTaxDefaultAcquisitionAdapter(options = {}) {
  const profile = profileForSourceId(options.source_id);
  if (!profile) {
    return {
      source_id: cleanText(options.source_id),
      status: 'not_configured',
      attempted: false,
      candidates: [],
      cards: [],
      diagnostics: { adapter_available: false },
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    };
  }
  if (!officialHost(profile, profile.source_url) || !officialHost(profile, profile.document_url)) {
    return {
      source_id: profile.source_id,
      source_name: profile.source_name,
      source_family: SOURCE_FAMILY,
      status: 'needs_manual_review',
      attempted: true,
      blocked_reason: 'official_host_validation_failed',
      candidates: [],
      cards: [],
      candidate_count: 0,
      diagnostics: { adapter_available: true, official_host_validation_failed: true },
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    };
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const month = postingMonth(now);
  const context = {
    acquisition_run_id: cleanText(options.acquisition_run_id),
    captured_at: cleanText(options.captured_at) || now.toISOString()
  };
  const pdf = await fetchNoticePdf(profile, options);
  const ledger = documentLedger.readDocumentLedger(options, profile);
  if (!pdf.ok) {
    documentLedger.recordDocumentLedgerAttempt(ledger, profile.document_url, month, 'hard_failed');
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
      blocked_reason: pdf.blocked_reason,
      candidates: [],
      cards: [],
      candidate_count: 0,
      diagnostics: {
        pages_discovered: 0,
        pages_processed: 0,
        pages_ledger_skipped: 0,
        docs_discovered: 0,
        docs_processed: 0,
        docs_ledger_skipped: 0,
        pdf_notice_documents_fetched: 0,
        pdf_notice_documents_parsed: 0,
        pdf_notice_rows_extracted: 0,
        pdf_notice_rows_with_address: 0,
        pdf_notice_rows_with_sale_date: 0,
        pdf_notice_parse_failures: 0
      },
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    };
  }

  let parsed;
  try {
    parsed = await parsePdfPages(pdf.buffer, options);
  } catch (error) {
    documentLedger.recordDocumentLedgerAttempt(ledger, profile.document_url, month, 'hard_failed');
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
      blocked_reason: `pdf_parse_failed:${cleanText(error && error.message).slice(0, 80) || 'unknown'}`,
      candidates: [],
      cards: [],
      candidate_count: 0,
      diagnostics: {
        pages_discovered: 0,
        pages_processed: 0,
        pages_ledger_skipped: 0,
        docs_discovered: 0,
        docs_processed: 0,
        docs_ledger_skipped: 0,
        pdf_notice_documents_fetched: 0,
        pdf_notice_documents_parsed: 0,
        pdf_notice_rows_extracted: 0,
        pdf_notice_rows_with_address: 0,
        pdf_notice_rows_with_sale_date: 0,
        pdf_notice_parse_failures: 1
      },
      preview_only: true,
      should_ingest: false,
      no_global_mutation: true
    };
  }

  const totalPages = Math.max(1, parsed.pages.length);
  const inventoryRotationResetCount = resetCompletedAuctionCycle(ledger, profile, totalPages, month);
  const selectedPages = [];
  let ledgerSkipped = 0;
  for (let pageNumber = 1; pageNumber <= totalPages && selectedPages.length < MAX_PAGES_PER_BATCH; pageNumber += 1) {
    const pageUrl = pageLedgerUrl(profile, pageNumber);
    if (documentLedger.documentAlreadyRead(ledger, pageUrl, month)) {
      ledgerSkipped += 1;
      continue;
    }
    selectedPages.push({ page_number: pageNumber, text: parsed.pages[pageNumber - 1] || '' });
    documentLedger.recordDocumentLedgerAttempt(ledger, pageUrl, month, 'done');
  }
  documentLedger.writeDocumentLedger(ledger, now, options, profile);

  const rows = [];
  for (const page of selectedPages) {
    for (const row of parseAuctionBookRowsFromText(page.text, profile)) {
      rows.push(Object.assign({ page_number: page.page_number }, row));
      if (rows.length >= MAX_ROWS) break;
    }
    if (rows.length >= MAX_ROWS) break;
  }
  const candidates = rows.slice(0, MAX_ROWS).map((row) => candidateFromAuctionRow(row, profile, context));
  const cards = candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, {
    acquisition_run_id: context.acquisition_run_id,
    city: candidate.city || profile.city,
    state: profile.state
  }));
  const blockedReason = candidates.length ? '' : 'no_property_rows_from_public_pdf';
  return {
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: SOURCE_FAMILY,
    source_url: profile.source_url,
    county: profile.county,
    state: profile.state,
    status: candidates.length ? 'available' : 'needs_manual_review',
    attempted: true,
    message: candidates.length ? `${candidates.length} Los Angeles County auction book rows.` : profile.blocked_note,
    blocked_reason: blockedReason,
    candidates,
    cards,
    candidate_count: candidates.length,
    discovered_links: [profile.document_url],
    document_urls_found: [profile.document_url],
    document_urls_parsed: selectedPages.length ? [profile.document_url] : [],
    diagnostics: {
      pages_discovered: totalPages,
      pages_processed: selectedPages.length,
      pages_ledger_skipped: ledgerSkipped,
      inventory_rotation_reset_count: inventoryRotationResetCount,
      rows_extracted: candidates.length,
      apn_only_rows: candidates.filter((candidate) => !cleanText(candidate.property_address)).length,
      docs_discovered: totalPages,
      docs_processed: selectedPages.length,
      docs_ledger_skipped: ledgerSkipped,
      pdf_notice_documents_fetched: 1,
      pdf_notice_documents_parsed: selectedPages.length,
      pdf_notice_rows_extracted: candidates.length,
      pdf_notice_rows_with_address: candidates.filter((candidate) => !!cleanText(candidate.normalized_address)).length,
      pdf_notice_rows_with_sale_date: 0,
      pdf_notice_parse_failures: 0,
      document_url: profile.document_url
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
  profileForSourceId,
  officialHost,
  parsePdfPages,
  fetchNoticePdf,
  parseAuctionBookRowsFromText,
  candidateFromAuctionRow,
  resetCompletedAuctionCycle,
  runCaLosAngelesTaxDefaultAcquisitionAdapter
};
