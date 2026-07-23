'use strict';

const propertyCandidate = require('../research/property-candidate');
const taxDefaultProfiles = require('./ca-san-diego-tax-default-source-profiles');
const documentLedger = require('./tx-county-foreclosure-acquisition-adapter');

const SOURCE_ID = 'ca_san_diego_tax_default_power_to_sell';
const SOURCE_FAMILY = 'tax_default_power_to_sell';
const MAX_ROWS = 25;
const MAX_PAGES_PER_BATCH = 5;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const APN_RE = /\b\d{3}-\d{3}-\d{2}-\d{2}\b/;
const AMOUNT_RE = /\$\s*\d[\d,]*\.\d{2}\b/;
const STREET_NUMBER_RE = /\b\d{5}(?:#\d+)?/;
const STREET_TYPE_RE = /\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail)\b/i;

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
  return taxDefaultProfiles.PROFILES.find((profile) => profile.source_id === id) || null;
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

function resetCompletedNoticeCycle(ledger, profile, totalPages, month) {
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

function validAmount(value) {
  const text = cleanText(value).replace(/\s+/g, '');
  const match = text.match(/^\$\d[\d,]*\.\d{2}$/);
  if (!match) return '';
  const amount = Number(text.replace(/[$,]/g, ''));
  if (!Number.isFinite(amount) || amount < 0) return '';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isKnownCityHeader(line, profile) {
  const text = cleanText(line);
  if (!text || /\d|\$|:/.test(text) || APN_RE.test(text)) return '';
  if (/\b(?:notice|property|street|amount|redeem|parcel|assessee|county|section|tax-defaulted|office|online|phone|page)\b/i.test(text)) return '';
  const cities = (profile.city_names || []).map(cleanText).filter(Boolean);
  const match = cities.find((city) => text.toLowerCase() === city.toLowerCase());
  return match || '';
}

function logicalNoticeRows(text, profile) {
  const lines = String(text || '').split(/\r?\n/).map(cleanText).filter(Boolean);
  const rows = [];
  let currentCity = '';
  for (let index = 0; index < lines.length; index += 1) {
    const city = isKnownCityHeader(lines[index], profile);
    if (city) {
      currentCity = city;
      continue;
    }
    if (!APN_RE.test(lines[index])) continue;
    let rowText = lines[index];
    while (!AMOUNT_RE.test(rowText) && index + 1 < lines.length && !APN_RE.test(lines[index + 1])) {
      index += 1;
      rowText = `${rowText} ${lines[index]}`;
    }
    rows.push({ text: cleanText(rowText), city: currentCity });
  }
  return rows;
}

function parseNoticeRowText(rowText, city) {
  const source = cleanText(rowText);
  const apnMatch = source.match(APN_RE);
  const amountMatch = source.match(AMOUNT_RE);
  if (!apnMatch || !amountMatch) return null;
  const apn = apnMatch[0];
  const amount = validAmount(amountMatch[0]);
  const body = cleanText(source.slice(apnMatch.index + apn.length, amountMatch.index));
  const streetMatch = body.match(STREET_NUMBER_RE);
  if (!streetMatch) {
    return {
      apn,
      owner_name: body,
      street_address: '',
      city: cleanText(city),
      amount_to_redeem: amount,
      source_text: source
    };
  }
  return {
    apn,
    owner_name: cleanText(body.slice(0, streetMatch.index)),
    street_address: cleanText(body.slice(streetMatch.index)),
    city: cleanText(city),
    amount_to_redeem: amount,
    source_text: source
  };
}

function parseTaxDefaultNoticeRowsFromText(text, profile = profileForSourceId(SOURCE_ID)) {
  return logicalNoticeRows(text, profile || {}).map((row) => parseNoticeRowText(row.text, row.city)).filter(Boolean);
}

function streetHasRealNumber(street) {
  const text = cleanText(street);
  if (!text) return false;
  const match = text.match(/^\d{5}(?:#\d+)?/);
  if (!match) return false;
  return /[1-9]/.test(match[0].replace(/#\d+$/i, ''));
}

function structuredPartialAddress(row, profile) {
  const street = cleanText(row && row.street_address);
  const city = cleanText(row && row.city);
  const state = cleanText(profile && profile.state).toUpperCase();
  if (!streetHasRealNumber(street) || !city || !/^[A-Z]{2}$/.test(state) || !STREET_TYPE_RE.test(street)) return '';
  return `${street}, ${city}, ${state}`;
}

function candidateFromNoticeRow(row, profile, context = {}) {
  const partialAddress = structuredPartialAddress(row, profile);
  const amount = validAmount(row && row.amount_to_redeem);
  const ownerName = cleanText(row && row.owner_name);
  const apn = cleanText(row && row.apn);
  const sourceText = cleanText(row && row.source_text);
  const amountEvidence = amount ? `Delinquent redemption amount shown by San Diego TTC notice: ${amount}` : '';
  const evidence = [
    'San Diego County tax-defaulted power-to-sell notice',
    apn ? `APN: ${apn}` : '',
    ownerName ? `Assessee: ${ownerName}` : '',
    cleanText(row && row.street_address) ? `Source street: ${cleanText(row.street_address)}` : '',
    cleanText(row && row.city) ? `Source city: ${cleanText(row.city)}` : '',
    amountEvidence
  ].filter(Boolean).join(' | ');
  const candidate = propertyCandidate.normalizePropertyCandidate({
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: SOURCE_FAMILY,
    source_type: 'official_tax_default_power_to_sell_notice',
    source_classification: 'official_source_record',
    official_source: true,
    source_url: profile.source_url,
    source_document_url: profile.document_url,
    source_row_reference: apn,
    parcel_or_account: apn,
    apn,
    normalized_address: '',
    property_address: partialAddress,
    raw_address_text: partialAddress || cleanText(row && row.street_address),
    city: cleanText(row && row.city),
    county: profile.county,
    state: profile.state,
    owner_name_candidate: ownerName,
    owner_name: ownerName,
    motivation_type: SOURCE_FAMILY,
    motivation_phrase: 'San Diego County tax-defaulted power-to-sell notice',
    motivation_evidence_text: evidence,
    source_proof_text: sourceText || evidence,
    current_status: 'Tax-defaulted power-to-sell notice',
    status_evidence_text: 'San Diego TTC notice of impending power to sell tax-defaulted property.',
    delinquent_redemption_amount: amount,
    delinquent_redemption_amount_evidence_text: amountEvidence,
    risk_flags: ['REDEMPTION_AMOUNT_NOT_PRICE_OR_ARV'],
    retrieved_at: cleanText(context.captured_at) || nowIso(),
    preview_only: true,
    should_ingest: false,
    not_a_saved_lead: true
  }, {
    acquisition_run_id: cleanText(context.acquisition_run_id),
    city: cleanText(row && row.city),
    state: profile.state
  });
  candidate.normalized_address = '';
  candidate.property_address = partialAddress;
  candidate.raw_address_text = partialAddress || cleanText(row && row.street_address);
  candidate.city = cleanText(row && row.city);
  candidate.county = profile.county;
  candidate.state = profile.state;
  candidate.parcel_or_account = apn;
  candidate.owner_name_candidate = ownerName;
  candidate.delinquent_redemption_amount = amount;
  candidate.delinquent_redemption_amount_evidence_text = amountEvidence;
  candidate.risk_flags = Array.from(new Set([].concat(candidate.risk_flags || [], ['REDEMPTION_AMOUNT_NOT_PRICE_OR_ARV'])));
  candidate.preview_only = true;
  candidate.should_ingest = false;
  candidate.not_a_saved_lead = true;
  return candidate;
}

async function pageTextFromPdfPage(pageData) {
  const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
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
  const pages = (explicitPages.length ? explicitPages : [parsed && parsed.text || '']).map((text) => String(text || ''));
  return {
    pages,
    numpages: Number(parsed && parsed.numpages || pages.length) || pages.length
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
    return { ok: false, blocked_reason: error && error.name === 'AbortError' ? 'fetch_timeout' : `fetch_failed:${cleanText(error && error.message).slice(0, 80) || 'unknown'}`, buffer: null };
  } finally {
    clearTimeout(timer);
  }
}

async function runCaTaxDefaultNoticeAcquisitionAdapter(options = {}) {
  const profile = profileForSourceId(options.source_id);
  if (!profile) {
    return {
      source_id: cleanText(options.source_id), status: 'not_configured', attempted: false,
      candidates: [], cards: [], diagnostics: { adapter_available: false },
      preview_only: true, should_ingest: false, no_global_mutation: true
    };
  }
  if (!officialHost(profile, profile.source_url) || !officialHost(profile, profile.document_url)) {
    return {
      source_id: profile.source_id, source_name: profile.source_name, source_family: SOURCE_FAMILY,
      status: 'needs_manual_review', attempted: true, blocked_reason: 'official_host_validation_failed',
      candidates: [], cards: [], candidate_count: 0,
      diagnostics: { adapter_available: true, official_host_validation_failed: true },
      preview_only: true, should_ingest: false, no_global_mutation: true
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
      candidates: [], cards: [], candidate_count: 0,
      diagnostics: { pages_discovered: 0, pages_processed: 0, pages_ledger_skipped: 0, docs_discovered: 0, docs_processed: 0, docs_ledger_skipped: 0 },
      preview_only: true, should_ingest: false, no_global_mutation: true
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
      candidates: [], cards: [], candidate_count: 0,
      diagnostics: { pages_discovered: 0, pages_processed: 0, pages_ledger_skipped: 0, docs_discovered: 0, docs_processed: 0, docs_ledger_skipped: 0 },
      preview_only: true, should_ingest: false, no_global_mutation: true
    };
  }

  const totalPages = Math.max(1, parsed.pages.length);
  const inventoryRotationResetCount = resetCompletedNoticeCycle(ledger, profile, totalPages, month);
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
    for (const row of parseTaxDefaultNoticeRowsFromText(page.text, profile)) {
      rows.push(Object.assign({ page_number: page.page_number }, row));
      if (rows.length >= MAX_ROWS) break;
    }
    if (rows.length >= MAX_ROWS) break;
  }
  const candidates = rows.slice(0, MAX_ROWS).map((row) => candidateFromNoticeRow(row, profile, context));
  const cards = candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, {
    acquisition_run_id: context.acquisition_run_id,
    city: candidate.city || profile.city,
    state: profile.state
  }));
  const blockedReason = candidates.length ? '' : 'no_property_rows_from_official_documents';
  return {
    source_id: profile.source_id,
    source_name: profile.source_name,
    source_family: SOURCE_FAMILY,
    source_url: profile.source_url,
    county: profile.county,
    state: profile.state,
    status: candidates.length ? 'available' : 'needs_manual_review',
    attempted: true,
    message: candidates.length ? `${candidates.length} San Diego tax-default power-to-sell notice rows.` : profile.blocked_note,
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
  validAmount,
  parseTaxDefaultNoticeRowsFromText,
  structuredPartialAddress,
  candidateFromNoticeRow,
  parsePdfPages,
  fetchNoticePdf,
  resetCompletedNoticeCycle,
  runCaTaxDefaultNoticeAcquisitionAdapter
};
