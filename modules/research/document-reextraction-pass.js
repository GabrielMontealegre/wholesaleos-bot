'use strict';

const propertyIdentity = require('./property-identity');
const enrichmentScheduler = require('./enrichment-scheduler');
const enrichmentLedger = require('./enrichment-ledger');
const txTrusteeNoticeExtractor = require('./tx-trustee-notice-text-extractor');
const ocrNoticeExtraction = require('./ocr-notice-extraction');
const txCountyForeclosureSourceProfiles = require('../sources/tx-county-foreclosure-source-profiles');

const LANE = 'document_reextraction';
const MAX_ROWS_PER_BATCH = 5;
const MAX_PDF_BYTES = 6 * 1024 * 1024;
const RECOVERY_FLAG = 'DOCUMENT_REEXTRACTED_FROM_STORED_SOURCE';
const OCR_REVIEW_FLAG = 'OCR_EXTRACTED_TEXT_REVIEW_RECOMMENDED';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
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

function mapsSearchUrl(value) {
  const query = cleanText(value);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

function hostFromUrl(value) {
  try {
    return new URL(cleanText(value)).hostname.toLowerCase();
  } catch (error) {
    return '';
  }
}

function documentUrlsForRow(row) {
  return prependUnique(row && row.source_document_urls, [row && row.source_document_url], 3);
}

function candidateRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!documentUrlsForRow(row).length) return false;
    const bucket = cleanText(row && row.quality_bucket).toUpperCase();
    if (bucket === 'SOURCE_PROOF_ONLY' || bucket === 'REJECTED_GENERIC') return true;
    return !cleanText(row && row.normalized_address);
  });
}

function profileForRow(row, market) {
  const state = cleanText(row && row.state || market && market.state).toUpperCase();
  if (state !== 'TX') return null;
  const county = cleanText(row && row.county || market && market.county).toLowerCase();
  const hosts = documentUrlsForRow(row).concat([row && row.source_url])
    .map(hostFromUrl)
    .filter(Boolean);
  const profiles = Array.isArray(txCountyForeclosureSourceProfiles.PROFILES)
    ? txCountyForeclosureSourceProfiles.PROFILES
    : [];
  const matched = profiles.find((profile) => {
    const profileCounty = cleanText(profile && profile.county).toLowerCase();
    if (county && profileCounty === county) return true;
    const officialHosts = Array.isArray(profile && profile.official_hosts) ? profile.official_hosts : [];
    return hosts.some((host) => officialHosts.some((official) => {
      const officialHost = cleanText(official).toLowerCase();
      return officialHost && (host === officialHost || host.endsWith(`.${officialHost}`));
    }));
  });
  if (matched) return Object.assign({}, matched);
  return {
    county: cleanText(row && row.county || market && market.county),
    state: 'TX',
    city_names: prependUnique([], [row && row.city, market && market.city], 10),
    max_rows: 5
  };
}

async function responseBuffer(response) {
  if (!response) return Buffer.alloc(0);
  if (typeof response.buffer === 'function') return response.buffer();
  if (typeof response.arrayBuffer === 'function') return Buffer.from(await response.arrayBuffer());
  if (typeof response.text === 'function') return Buffer.from(await response.text());
  return Buffer.alloc(0);
}

async function fetchPdfBuffer(url, options) {
  const fetchImpl = options.fetch_impl || options.fetchImpl || global.fetch || require('node-fetch');
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 WholesaleOS document re-extraction (official-source verification)',
      Accept: 'application/pdf,text/plain,*/*'
    }
  });
  const status = Number(response && response.status || 0) || 0;
  if (response && response.ok === false) {
    return { status: 'blocked', reason_code: `http_${status || 'error'}`, reason_text: `Document fetch returned HTTP ${status || 'error'}.` };
  }
  const buffer = await responseBuffer(response);
  if (!buffer.length) return { status: 'failed', reason_code: 'empty_document_response', reason_text: 'Document fetch returned no bytes.' };
  if (buffer.length > MAX_PDF_BYTES) {
    return { status: 'blocked', reason_code: 'document_too_large_for_reextraction', reason_text: 'Stored source document is over the safe 6MB re-extraction cap.' };
  }
  return { status: 'ok', buffer };
}

async function pdfTextFromBuffer(buffer, options) {
  const pdfParse = options.pdf_parse_impl || require('pdf-parse');
  const parsed = await pdfParse(buffer);
  return cleanText(parsed && parsed.text);
}

function rowsFromText(text, row, market, documentUrl) {
  const profile = profileForRow(row, market);
  if (!profile) return [];
  const cityNames = prependUnique(profile.city_names, [row && row.city, market && market.city], 30);
  return txTrusteeNoticeExtractor.extractTrusteeNoticeRows(text, Object.assign({}, profile, {
    city_names: cityNames,
    max_rows: 5
  }), {
    source_url: cleanText(row && row.source_url),
    source_proof_url: documentUrl,
    source_reference: `stored official ${cleanText(profile.county) || cleanText(row && row.county) || 'county'} document re-extraction`
  }).map((item) => withVisibleCity(item, cityNames));
}

async function rowsFromOcr(buffer, row, market, documentUrl, options) {
  const profile = profileForRow(row, market);
  if (!profile) return [];
  const result = await ocrNoticeExtraction.runOcrNoticeExtraction({
    documents: [{
      url: documentUrl,
      buffer,
      source_url: cleanText(row && row.source_url),
      profile: Object.assign({}, profile, {
        city_names: prependUnique(profile.city_names, [row && row.city, market && market.city], 30),
        max_rows: 5
      })
    }],
    caps: Object.assign({}, ocrNoticeExtraction.DEFAULT_CAPS, {
      max_docs: 1,
      max_pages_per_doc: 3,
      render_scale: 3,
      retry_render_scale: 4
    }, options.ocr_caps || {})
  }, Object.assign({}, options, {
    tesseract_params: Object.assign({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1'
    }, options.tesseract_params || {})
  }));
  return Array.isArray(result && result.rows) ? result.rows : [];
}

function withVisibleCity(item, cityNames) {
  const copy = Object.assign({}, item || {});
  if (cleanText(copy.city)) return copy;
  const address = cleanText(copy.address || copy.property_address || copy.partial_address);
  const cities = (Array.isArray(cityNames) ? cityNames : []).map(cleanText).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const city of cities) {
    const re = new RegExp(`\\b${String(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s+(?:TX|Texas|[A-Z]{2})\\s+\\d{5}(?:-\\d{4})?\\b`, 'i');
    if (re.test(address)) {
      copy.city = city;
      break;
    }
  }
  return copy;
}

function completeAddressForExtraction(item) {
  const address = cleanText(item && (item.address || item.property_address));
  const parsed = propertyIdentity.parseAddress(address);
  if (parsed.complete) return parsed.full_address;
  const city = cleanText(item && item.city);
  const state = cleanText(item && item.state);
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (!city || !state || !zipMatch) return '';
  const cityRe = new RegExp(`\\b${String(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s+${String(state).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${zipMatch[1]}(?:-\\d{4})?\\s*$`, 'i');
  const street = cleanText(address.replace(cityRe, ''));
  const formatted = propertyIdentity.parseAddress([street, city, `${state} ${zipMatch[1]}`].join(', '));
  return formatted.complete ? formatted.full_address : '';
}

function bestExtraction(rows) {
  const items = (Array.isArray(rows) ? rows : []).map((item) => {
    const address = cleanText(item && (item.address || item.property_address));
    const partial = cleanText(item && item.partial_address) || address;
    const completeAddress = completeAddressForExtraction(item);
    return {
      row: item,
      address: completeAddress || address,
      partial,
      complete: !!completeAddress,
      ocr: item && item.ocr_source === true
    };
  }).filter((item) => item.address || item.partial);
  items.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (a.ocr !== b.ocr) return a.ocr ? 1 : -1;
    return b.partial.length - a.partial.length;
  });
  return items[0] || null;
}

function evidenceText(extracted, documentUrl) {
  return cleanText([
    'Document re-extraction recovered evidence from a stored official source document.',
    cleanText(extracted && (extracted.source_proof_text || extracted.source_text || extracted.raw_text)),
    documentUrl
  ].filter(Boolean).join(' | ')).slice(0, 1000);
}

function applyExtractionToRow(row, extraction, market, documentUrl, nowIso) {
  const extracted = extraction.row || {};
  const evidence = evidenceText(extracted, documentUrl);
  const recoveredText = extraction.address || extraction.partial;
  const canonical = extraction.complete ? propertyIdentity.canonicalAddress(extraction.address) : '';
  const isOcrReview = extraction.ocr || (Array.isArray(row.risk_flags) && row.risk_flags.includes(OCR_REVIEW_FLAG));
  row.document_reextraction_status = extraction.complete && !isOcrReview ? 'complete_address_recovered' : 'needs_zip_review_recovered';
  row.document_reextraction_reason = extraction.complete && !isOcrReview ? 'strict_document_text_address' : 'human_verify_reextracted_document_text';
  row.document_reextraction_at = nowIso;
  row.document_reextraction_source_url = documentUrl;
  row.document_reextraction_evidence_text = evidence;
  row.source_document_url = cleanText(row.source_document_url) || documentUrl;
  row.source_document_urls = documentUrlsForRow(row);
  row.source_url = cleanText(row.source_url || extracted.source_url);
  row.county = cleanText(extracted.county || row.county || market.county);
  row.city = cleanText(extracted.city || row.city || market.city);
  row.state = cleanText(extracted.state || row.state || market.state);
  row.source_row_reference = cleanText(row.source_row_reference || extracted.source_row_reference || extracted.case_number);
  row.motivation_evidence_text = cleanText(row.motivation_evidence_text || extracted.source_proof_text || extracted.source_text);
  row.status_evidence_text = cleanText(row.status_evidence_text || extracted.status_evidence_text || extracted.current_status);
  row.sale_date_or_event_date = cleanText(row.sale_date_or_event_date || extracted.sale_date || extracted.auction_date);
  row.foreclosure_type = cleanText(row.foreclosure_type || extracted.foreclosure_type);
  row.filing_period = cleanText(row.filing_period || extracted.filing_period);
  row.filing_period_evidence_text = cleanText(row.filing_period_evidence_text || extracted.filing_period_evidence_text);
  row.risk_flags = prependUnique(row.risk_flags, isOcrReview ? [RECOVERY_FLAG, OCR_REVIEW_FLAG] : [RECOVERY_FLAG], 6);
  if (extraction.complete && !isOcrReview) {
    row.normalized_address = canonical;
    row.partial_address = '';
    row.headline = cleanText(row.headline && row.headline !== 'Public distressed opportunity' ? row.headline : canonical) || canonical;
    row.maps_url = mapsSearchUrl(canonical);
    row.maps_search_url_review_needed = null;
    row.quality_bucket = (row.status_evidence_text || row.sale_date_or_event_date) ? 'INSPECT_NOW' : 'SOURCE_PROOF_ONLY';
    row.next_best_action = row.quality_bucket === 'INSPECT_NOW' ? 'FIND_CONTACT_ROUTE' : 'VERIFY_SOURCE_PROOF';
  } else {
    row.normalized_address = '';
    row.partial_address = recoveredText;
    row.headline = recoveredText;
    row.maps_url = null;
    row.maps_search_url_review_needed = mapsSearchUrl(recoveredText);
    row.quality_bucket = 'NEEDS_ZIP_REVIEW';
    row.contact_status = 'ADDRESS_VERIFICATION_REQUIRED';
    row.next_best_action = isOcrReview ? 'VERIFY_ADDRESS_FROM_SOURCE_DOCUMENT' : 'VERIFY_ZIP_FROM_SOURCE_DOCUMENT';
    row.missing_fields = prependUnique(row.missing_fields, [
      isOcrReview ? 'verified street spelling (check source document)' : 'zip (verify from the source document)'
    ], 8);
  }
  row.preview_only = true;
  row.not_a_saved_lead = true;
  return row;
}

async function reextractRow(row, market, options, documentTextCache) {
  const documentUrl = documentUrlsForRow(row)[0];
  if (!documentUrl) return { status: 'not_found', reason_code: 'missing_source_document_url', reason_text: 'No stored source document URL is available.' };
  if (typeof options.document_reextraction_impl === 'function') {
    return options.document_reextraction_impl(row, { market, document_url: documentUrl });
  }
  let cached = documentTextCache.get(documentUrl);
  if (!cached) {
    const fetched = await fetchPdfBuffer(documentUrl, options);
    if (fetched.status !== 'ok') {
      documentTextCache.set(documentUrl, fetched);
      return fetched;
    }
    try {
      const text = await pdfTextFromBuffer(fetched.buffer, options);
      cached = { status: 'ok', buffer: fetched.buffer, text };
    } catch (error) {
      cached = {
        status: 'failed',
        buffer: fetched.buffer,
        text: '',
        reason_code: 'pdf_text_parse_failed',
        reason_text: `PDF text parse failed: ${cleanText(error && error.message).slice(0, 120)}`
      };
    }
    documentTextCache.set(documentUrl, cached);
  }
  let extractedRows = cached.text ? rowsFromText(cached.text, row, market, documentUrl) : [];
  if (!extractedRows.length && cached.buffer && cleanText(row && row.state || market && market.state).toUpperCase() === 'TX') {
    try {
      extractedRows = await rowsFromOcr(cached.buffer, row, market, documentUrl, options);
    } catch (error) {
      if (cached.status === 'failed') return cached;
      return {
        status: 'failed',
        reason_code: 'ocr_reextraction_failed',
        reason_text: `OCR re-extraction failed: ${cleanText(error && error.message).slice(0, 120)}`
      };
    }
  }
  const extraction = bestExtraction(extractedRows);
  if (!extraction) {
    if (cached.status === 'failed') return cached;
    return { status: 'not_found', reason_code: 'no_recoverable_address_in_document', reason_text: 'Strict document re-extraction found no recoverable address.' };
  }
  const forceReview = extraction.ocr || (Array.isArray(row && row.risk_flags) && row.risk_flags.includes(OCR_REVIEW_FLAG));
  const completeReady = extraction.complete && !forceReview;
  return {
    status: completeReady ? 'complete_address_recovered' : 'needs_zip_review_recovered',
    reason_code: completeReady ? 'COMPLETE_ADDRESS_RECOVERED' : 'NEEDS_ZIP_REVIEW_RECOVERED',
    reason_text: completeReady
      ? 'Strict document text re-extraction recovered a complete source address.'
      : 'Document text recovered an address shape requiring human verification.',
    extraction,
    source_url: documentUrl
  };
}

function emptyDiagnostics(enabled) {
  return {
    enabled: enabled === true,
    lane: LANE,
    selected_count: 0,
    skipped_count: 0,
    attempted_count: 0,
    complete_address_recovered_count: 0,
    needs_zip_review_recovered_count: 0,
    no_recovery_count: 0,
    blocked_count: 0,
    failed_count: 0,
    reason_counts: {},
    recovered_queue_keys: []
  };
}

function increment(target, key) {
  const normalized = cleanText(key) || 'unknown';
  target[normalized] = (Number(target[normalized]) || 0) + 1;
}

async function runDocumentReextractionPass(rows, input = {}, options = {}) {
  const enabled = input.enabled !== false && options.enable_document_reextraction !== false;
  const diagnostics = emptyDiagnostics(enabled);
  if (!enabled) return diagnostics;
  const nowIso = cleanText(input.now_iso) || new Date().toISOString();
  const market = input.market || {};
  const candidates = candidateRows(rows);
  const limit = Math.max(0, Math.min(Number(input.max_rows || options.max_document_reextraction_rows) || MAX_ROWS_PER_BATCH, MAX_ROWS_PER_BATCH));
  const selection = enrichmentScheduler.selectRowsForEnrichment(candidates, {
    lane: LANE,
    limit,
    now_iso: nowIso,
    market_policy: {}
  });
  diagnostics.selected_count = selection.selected.length;
  diagnostics.skipped_count = selection.skipped.length;
  const documentTextCache = new Map();
  for (const row of selection.selected) {
    diagnostics.attempted_count += 1;
    const documentUrl = documentUrlsForRow(row)[0];
    let outcome;
    try {
      outcome = await reextractRow(row, market, options, documentTextCache);
    } catch (error) {
      outcome = { status: 'failed', reason_code: 'document_reextraction_failed', reason_text: cleanText(error && error.message) || 'Document re-extraction failed.' };
    }
    increment(diagnostics.reason_counts, outcome.reason_code || outcome.status);
    let ledgerOutcome = 'NOT_FOUND';
    if (outcome.status === 'complete_address_recovered') {
      applyExtractionToRow(row, outcome.extraction, market, documentUrl, nowIso);
      diagnostics.complete_address_recovered_count += 1;
      diagnostics.recovered_queue_keys = prependUnique(diagnostics.recovered_queue_keys, [row.queue_key], 10);
      ledgerOutcome = 'FOUND';
    } else if (outcome.status === 'needs_zip_review_recovered') {
      applyExtractionToRow(row, outcome.extraction, market, documentUrl, nowIso);
      diagnostics.needs_zip_review_recovered_count += 1;
      diagnostics.recovered_queue_keys = prependUnique(diagnostics.recovered_queue_keys, [row.queue_key], 10);
      ledgerOutcome = 'FOUND';
    } else if (outcome.status === 'blocked') {
      diagnostics.blocked_count += 1;
      ledgerOutcome = 'BLOCKED';
    } else if (outcome.status === 'failed') {
      diagnostics.failed_count += 1;
      ledgerOutcome = 'FAILED';
    } else {
      diagnostics.no_recovery_count += 1;
    }
    enrichmentLedger.appendAttempt(row, {
      lane: LANE,
      attempted_at: nowIso,
      outcome: ledgerOutcome,
      reason_code: cleanText(outcome.reason_code || outcome.status || 'NO_RECOVERY'),
      reason_text: cleanText(outcome.reason_text || 'Document re-extraction attempted.'),
      source_url: documentUrl,
      cost_usd: 0
    });
  }
  return diagnostics;
}

module.exports = {
  LANE,
  MAX_ROWS_PER_BATCH,
  candidateRows,
  runDocumentReextractionPass
};
