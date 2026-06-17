'use strict';

const crypto = require('crypto');

const foreclosureNoticeAdapter = require('./dallas-foreclosure-notice-adapter');
const leadEvidence = require('../research/lead-evidence');
const propertyCandidate = require('../research/property-candidate');
const sourceEvidenceAdapter = require('../research/source-evidence-adapter');

const SOURCE_ID = foreclosureNoticeAdapter.SOURCE_ID;
const SOURCE_URL = foreclosureNoticeAdapter.SOURCE_URL;
const SOURCE_NAME = 'Dallas County Clerk Foreclosure Notices';
const SOURCE_FAMILY = 'preforeclosure_trustee_notice';
const MAX_ROWS = 25;
const MAX_FILES = 6;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function boundedInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function textFromHtml(html) {
  return cleanText(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:tr|p|div|li|h\d|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '));
}

function normalizeSourceRecords(records) {
  return (Array.isArray(records) ? records : []).map((record, index) => {
    const item = record || {};
    return {
      index,
      property_address: cleanText(item.property_address || item.address || item.normalized_address),
      sale_date: cleanText(item.sale_date || item.auction_date || item.event_date),
      source_row_reference: cleanText(item.source_row_reference || item.row_reference || item.case_number || item.parcel_or_account || item.parcel_id),
      source_proof_text: cleanText(item.source_proof_text || item.source_text || item.raw_text || item.description),
      source_proof_url: cleanText(item.source_proof_url || item.source_record_url || item.source_document_url || item.source_url),
      source_document_url: cleanText(item.source_document_url || item.source_record_url || item.source_proof_url || item.source_url),
      contact_route: cleanText(item.contact_route || item.public_contact_route),
      contact_phone: cleanText(item.contact_phone || item.phone),
      contact_email: cleanText(item.contact_email || item.email),
      owner_name: cleanText(item.owner_name || item.borrower_name || item.owner_name_candidate),
      case_number: cleanText(item.case_number || item.cause_number),
      parcel_or_account: cleanText(item.parcel_or_account || item.parcel_id || item.account_number),
      amount_or_judgment: cleanText(item.amount_or_judgment || item.judgment_amount || item.opening_bid || item.tax_amount),
      source_reference: cleanText(item.source_reference || item.source_title || item.source_name || SOURCE_NAME)
    };
  });
}

function buildCombinedSourceText(sourceText, sourceHtml, records) {
  const pieces = [];
  const htmlText = sourceHtml ? textFromHtml(sourceHtml) : '';
  if (sourceText) pieces.push(cleanText(sourceText));
  if (htmlText && htmlText !== cleanText(sourceText)) pieces.push(htmlText);
  for (const record of records) {
    pieces.push([
      record.property_address,
      record.sale_date,
      record.source_row_reference,
      record.source_proof_text,
      record.owner_name,
      record.case_number,
      record.parcel_or_account,
      record.amount_or_judgment,
      record.contact_route,
      record.contact_phone,
      record.contact_email
    ].filter(Boolean).join(' | '));
  }
  return pieces.map(cleanText).filter(Boolean).join('\n');
}

function normalizedAddressKey(value) {
  return cleanText(value).toLowerCase().replace(/[^\w\s#/-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function sourceHash(value) {
  return crypto.createHash('sha1').update(cleanText(value)).digest('hex').slice(0, 16);
}

function extractWholesalePhrase(text) {
  const sourceText = cleanText(text);
  if (!sourceText) return '';
  const segments = sourceText
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map(cleanText)
    .filter(Boolean);
  for (const segment of segments) {
    if (leadEvidence.WHOLESALE_PHRASE_RE.test(segment)) return segment;
  }
  const match = sourceText.match(leadEvidence.WHOLESALE_PHRASE_RE);
  return match ? cleanText(match[0]) : '';
}

function extractCurrentStatus(text, rawCandidate) {
  const candidateText = cleanText([
    rawCandidate && rawCandidate.workflow_status,
    rawCandidate && rawCandidate.status,
    text
  ].filter(Boolean).join(' '));
  if (!candidateText) return 'Manual Verification Needed';
  if (/\b(sold|closed|off[- ]?market|historical)\b/i.test(candidateText)) return 'Historical';
  if (/\b(active|listed|for sale|new listing|available|foreclosure sale|auction date|back on(?: the)? market|price reduced|price cut)\b/i.test(candidateText)) {
    return 'Current or plausibly current';
  }
  if (/\b(notice of sale|trustee sale|foreclosure notice|pre[- ]?foreclosure)\b/i.test(candidateText)) {
    return 'Current or plausibly current';
  }
  return rawCandidate && rawCandidate.workflow_status === 'Source Repair Needed'
    ? 'Manual Verification Needed'
    : 'Current or plausibly current';
}

function candidateFromRaw(rawCandidate, context, sourceMeta) {
  const raw = rawCandidate || {};
  const proofText = cleanText(raw.source_proof_text || raw.source_reference || raw.raw_text);
  const phrase = extractWholesalePhrase([proofText, raw.motivation_phrase, raw.workflow_status, raw.event_type].filter(Boolean).join(' '));
  const officialSourceUrl = cleanText(context.source_url || SOURCE_URL);
  const sourceUrl = cleanText(raw.source_proof_url || raw.source_document_url || context.source_document_url || officialSourceUrl || SOURCE_URL);
  const documentUrl = cleanText(raw.source_document_url || context.source_document_url || sourceUrl);
  const contactRoute = cleanText(raw.contact_route || raw.public_contact_route) || 'Manual Lookup Needed';
  const currentStatus = extractCurrentStatus([proofText, raw.event_type, raw.sale_date].filter(Boolean).join(' '), raw);
  const sourceClassification = documentUrl && /\.(pdf|xlsx?|csv)(?:$|[?#])/i.test(documentUrl) ? 'pdf_document' : 'official_property_notice';
  const baseCandidate = {
    candidate_origin: 'dallas_foreclosure_acquisition',
    source_id: SOURCE_ID,
    source_name: SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    source_type: 'official foreclosure notice',
    source_classification: sourceClassification,
    official_source: true,
    source_url: sourceUrl,
    official_source_url: officialSourceUrl,
    source_document_url: documentUrl,
    property_address: cleanText(raw.property_address || raw.address),
    address: cleanText(raw.property_address || raw.address),
    source_row_reference: cleanText(raw.source_row_reference || raw.case_number || raw.parcel_or_account),
    owner_name_candidate: cleanText(raw.owner_name || raw.borrower_name),
    motivation_type: SOURCE_FAMILY,
    motivation_phrase: phrase || cleanText(raw.motivation_phrase || raw.event_type || 'Foreclosure notice'),
    motivation_evidence_text: proofText || cleanText(raw.source_reference),
    current_status: currentStatus,
    status_evidence_text: cleanText([raw.sale_date, raw.workflow_status, proofText].filter(Boolean).join(' | ')),
    event_date: cleanText(raw.sale_date),
    sale_date: cleanText(raw.sale_date),
    amount_or_judgment: cleanText(raw.amount_or_judgment),
    parcel_or_account: cleanText(raw.parcel_or_account),
    contact_route: contactRoute,
    contact_name: cleanText(raw.contact_name),
    contact_phone: cleanText(raw.contact_phone),
    contact_email: cleanText(raw.contact_email),
    source_proof_text: proofText || cleanText(raw.source_reference),
    source_proof_url: sourceUrl,
    source_reference: cleanText(raw.source_reference || SOURCE_NAME),
    retrieved_at: cleanText(raw.captured_at || context.captured_at || nowIso()),
    missing_evidence: Array.isArray(raw.missing_evidence) ? raw.missing_evidence.slice() : [],
    preview_only: true,
    should_ingest: false
  };
  if (!baseCandidate.source_proof_text) baseCandidate.source_proof_text = [baseCandidate.source_row_reference, baseCandidate.motivation_phrase, baseCandidate.current_status].filter(Boolean).join(' | ');
  if (!baseCandidate.amount_or_judgment) baseCandidate.amount_or_judgment = cleanText(raw.opening_bid || raw.minimum_bid || raw.tax_amount || raw.judgment_amount);
  if (!baseCandidate.parcel_or_account) baseCandidate.parcel_or_account = cleanText(raw.parcel_id || raw.account_number);
  if (!baseCandidate.owner_name_candidate) baseCandidate.owner_name_candidate = cleanText(raw.owner_name || raw.borrower_name);
  const normalized = propertyCandidate.normalizePropertyCandidate(baseCandidate, {
    acquisition_run_id: cleanText(context.acquisition_run_id || context.run_id || sourceHash(`${sourceMeta.source_id}|${context.captured_at || nowIso()}`)),
    city: 'Dallas',
    state: 'TX'
  });
  normalized.retrieved_at = baseCandidate.retrieved_at;
  normalized.official_source = true;
  normalized.source_family = SOURCE_FAMILY;
  normalized.source_id = SOURCE_ID;
  normalized.source_name = SOURCE_NAME;
  normalized.source_url = sourceUrl;
  normalized.official_source_url = officialSourceUrl;
  normalized.source_document_url = documentUrl;
  normalized.source_classification = sourceClassification;
  normalized.source_reference = baseCandidate.source_reference;
  normalized.source_row_reference = baseCandidate.source_row_reference;
  normalized.source_proof_url = sourceUrl;
  normalized.source_proof_text = baseCandidate.source_proof_text;
  normalized.source_diagnostics = {
    source_url_classification: sourceEvidenceAdapter.classifySourceUrl(sourceUrl),
    document_url_classification: sourceEvidenceAdapter.classifySourceUrl(documentUrl),
    source_hash: sourceHash([sourceUrl, documentUrl, baseCandidate.source_proof_text].join('|')),
    phrase_visible: !!phrase,
    status_visible: !!cleanText(baseCandidate.current_status),
    contact_route_visible: contactRoute !== 'Manual Lookup Needed'
  };
  return normalized;
}

function mergeRecordIntoCandidate(candidate, records) {
  const key = normalizedAddressKey(candidate.normalized_address || candidate.property_address || candidate.address);
  const matchingRecord = records.find((record) => {
    const recordKey = normalizedAddressKey(record.property_address);
    return recordKey && key && recordKey === key;
  }) || records.find((record) => {
    const candidateRef = cleanText(candidate.source_row_reference || candidate.case_number || candidate.parcel_or_account).toLowerCase();
    const recordRef = cleanText(record.source_row_reference || record.case_number || record.parcel_or_account).toLowerCase();
    return candidateRef && recordRef && candidateRef === recordRef;
  }) || null;
  if (!matchingRecord) return candidate;
  return propertyCandidate.normalizePropertyCandidate(Object.assign({}, candidate, {
    contact_route: matchingRecord.contact_route || candidate.contact_route,
    contact_phone: matchingRecord.contact_phone || candidate.contact_phone,
    contact_email: matchingRecord.contact_email || candidate.contact_email,
    source_document_url: matchingRecord.source_document_url || candidate.source_document_url,
    source_row_reference: matchingRecord.source_row_reference || candidate.source_row_reference,
    owner_name_candidate: matchingRecord.owner_name || candidate.owner_name_candidate,
    amount_or_judgment: matchingRecord.amount_or_judgment || candidate.amount_or_judgment,
    parcel_or_account: matchingRecord.parcel_or_account || candidate.parcel_or_account,
    source_proof_text: [candidate.source_proof_text, matchingRecord.source_proof_text].filter(Boolean).join(' | '),
    source_proof_url: candidate.source_proof_url || matchingRecord.source_document_url || matchingRecord.source_proof_url
  }), {
    acquisition_run_id: candidate.acquisition_run_id,
    city: candidate.city || 'Dallas',
    state: candidate.state || 'TX'
  });
}

function diagnosticsFromCandidates(candidates, rawBlocks, records, sourceText, sourceHtml, sourceUrl, sourceDocumentUrl, sourceLinks) {
  const counts = {
    record_count: Array.isArray(records) ? records.length : 0,
    raw_block_count: Array.isArray(rawBlocks) ? rawBlocks.length : 0,
    candidates_found: Array.isArray(candidates) ? candidates.length : 0,
    phrase_candidate_seen: 0,
    status_candidate_seen: 0,
    property_url_but_missing_phrase: 0,
    property_url_but_missing_status: 0,
    phrase_candidate_rejected_reason: {},
    status_candidate_rejected_reason: {},
    exact_property_page_rejected_reason: {},
    blocked_reasons: {},
    source_url_classification: sourceEvidenceAdapter.classifySourceUrl(sourceUrl),
    source_document_url_classification: sourceEvidenceAdapter.classifySourceUrl(sourceDocumentUrl),
    source_hash: sourceHash([sourceUrl, sourceDocumentUrl, sourceText, sourceHtml].join('|')),
    evidence_links_found: Array.isArray(sourceLinks) ? sourceLinks.length : 0,
    exact_phrases_promoted: 0,
    exact_phrases_rejected: 0,
    current_status_promoted: 0,
    current_status_rejected: 0,
    source_repair_needed: 0
  };
  for (const rawBlock of Array.isArray(rawBlocks) ? rawBlocks : []) {
    const text = [
      rawBlock.source_proof_text,
      rawBlock.source_reference,
      rawBlock.workflow_status,
      rawBlock.event_type,
      rawBlock.sale_date,
      rawBlock.current_status
    ].filter(Boolean).join(' ');
    const phrase = extractWholesalePhrase(text);
    const statusVisible = !!cleanText(rawBlock.sale_date || rawBlock.current_status || rawBlock.workflow_status);
    if (phrase) counts.phrase_candidate_seen += 1;
    if (statusVisible) counts.status_candidate_seen += 1;
    if (phrase && statusVisible) counts.exact_phrases_promoted += 1;
    if (phrase && !statusVisible) counts.property_url_but_missing_status += 1;
    if (statusVisible && !phrase) counts.property_url_but_missing_phrase += 1;
  }
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const missing = Array.isArray(candidate.missing_evidence) ? candidate.missing_evidence : [];
    if (missing.includes('exact source-backed wholesale phrase')) counts.exact_phrases_rejected += 1;
    if (missing.includes('current listing status')) counts.current_status_rejected += 1;
    if (missing.includes('exact property-detail source URL')) counts.exact_property_page_rejected_reason.source_url_missing = (counts.exact_property_page_rejected_reason.source_url_missing || 0) + 1;
    if (missing.includes('exact source-backed wholesale phrase')) counts.phrase_candidate_rejected_reason.no_exact_phrase = (counts.phrase_candidate_rejected_reason.no_exact_phrase || 0) + 1;
    if (missing.includes('current listing status')) counts.status_candidate_rejected_reason.missing_status = (counts.status_candidate_rejected_reason.missing_status || 0) + 1;
    if (candidate.source_diagnostics && candidate.source_diagnostics.source_url_classification !== 'exact_property_record') {
      counts.exact_property_page_rejected_reason.non_property_detail_source = (counts.exact_property_page_rejected_reason.non_property_detail_source || 0) + 1;
    }
    if (candidate.next_best_worker === 'MANUAL_REVIEW') counts.source_repair_needed += 1;
    if (candidate.next_best_worker === 'PIPELINE') counts.current_status_promoted += 1;
  }
  return counts;
}

async function runDallasForeclosureAcquisitionAdapter(options = {}) {
  const source = Object.assign({
    source_id: SOURCE_ID,
    source_name: SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    source_url: SOURCE_URL,
    source_document_url: '',
    official_source: true
  }, options.source || {});
  const sourceUrl = cleanText(options.source_url || source.source_url || SOURCE_URL);
  const sourceDocumentUrl = cleanText(options.source_document_url || source.source_document_url || '');
  const capturedAt = cleanText(options.captured_at) || nowIso();
  const maxRows = boundedInt(options.max_rows || options.max_candidates || options.maxRows, MAX_ROWS, MAX_ROWS);
  const maxFiles = boundedInt(options.max_files || options.maxFiles, MAX_FILES, MAX_FILES);
  const records = normalizeSourceRecords(options.records);
  const sourceText = cleanText(options.source_text || '');
  const sourceHtml = cleanText(options.source_html || '');
  const explicitLinks = Array.isArray(options.evidence_links) ? options.evidence_links.slice(0, maxFiles) : [];
  const htmlLinks = sourceHtml
    ? foreclosureNoticeAdapter.discoverForeclosureEvidenceLinksFromHtml(sourceHtml, sourceUrl).slice(0, maxFiles)
    : [];
  const sourceLinks = Array.from(new Set([]
    .concat(explicitLinks)
    .concat(htmlLinks)
    .concat(sourceDocumentUrl ? [sourceDocumentUrl] : [])
    .concat(sourceUrl ? [sourceUrl] : [])
    .map(cleanText)
    .filter(Boolean))).slice(0, maxFiles);
  const combinedText = buildCombinedSourceText(sourceText, sourceHtml, records);
  const cacheKey = sourceHash([sourceUrl, sourceDocumentUrl, combinedText, JSON.stringify(records)].join('|'));
  const cache = options.cache && typeof options.cache.get === 'function' && typeof options.cache.set === 'function' ? options.cache : null;
  if (cache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  if (!combinedText) {
    const result = {
      source_id: SOURCE_ID,
      source_name: SOURCE_NAME,
      source_family: SOURCE_FAMILY,
      source_url: sourceUrl,
      source_document_url: sourceDocumentUrl,
      status: 'needs_manual_review',
      attempted: false,
      message: 'Phase 1 foreclosure adapter only parses supplied text, HTML, or records. Live fetch is disabled in this build.',
      blocked_reason: 'source_text_or_records_required',
      preview_only: true,
      should_ingest: false,
      candidates: [],
      cards: [],
      diagnostics: {
        source_hash: cacheKey,
        source_url_classification: sourceEvidenceAdapter.classifySourceUrl(sourceUrl),
        source_document_url_classification: sourceEvidenceAdapter.classifySourceUrl(sourceDocumentUrl),
        evidence_links_found: sourceLinks.length,
        record_count: records.length,
        raw_block_count: 0,
        candidates_found: 0,
        source_repair_needed: 0,
        phrase_candidate_seen: 0,
        status_candidate_seen: 0,
        exact_phrases_promoted: 0,
        property_url_but_missing_phrase: 0,
        property_url_but_missing_status: 0,
        exact_property_page_rejected_reason: { source_text_missing: 1 },
        phrase_candidate_rejected_reason: { source_text_missing: 1 },
        status_candidate_rejected_reason: { source_text_missing: 1 },
        blocked_reasons: { source_text_missing: 1 }
      },
      warnings: ['Source text or records are required for this phase.']
    };
    if (cache) cache.set(cacheKey, result);
    return result;
  }

  const rawCandidates = foreclosureNoticeAdapter.extractForeclosureNoticeCandidatesFromText(combinedText, {
    source_url: sourceUrl,
    source_proof_url: sourceDocumentUrl || sourceUrl,
    source_reference: 'Dallas County Clerk foreclosure notice preview',
    max_rows: maxRows,
    captured_at: capturedAt
  });
  const enrichedRawCandidates = rawCandidates.map((candidate) => {
    const matchingRecord = records.find((record) => normalizedAddressKey(record.property_address) && normalizedAddressKey(candidate.property_address) === normalizedAddressKey(record.property_address))
      || records.find((record) => cleanText(record.source_row_reference || record.case_number || record.parcel_or_account).toLowerCase() === cleanText(candidate.case_number || candidate.parcel_id).toLowerCase())
      || null;
    return Object.assign({}, candidate, matchingRecord ? {
      contact_route: matchingRecord.contact_route || candidate.contact_route,
      contact_phone: matchingRecord.contact_phone || candidate.contact_phone,
      contact_email: matchingRecord.contact_email || candidate.contact_email,
      source_document_url: matchingRecord.source_document_url || sourceDocumentUrl || sourceUrl,
      source_row_reference: matchingRecord.source_row_reference || candidate.case_number || candidate.parcel_id,
      owner_name: matchingRecord.owner_name || candidate.owner_name,
      amount_or_judgment: matchingRecord.amount_or_judgment || candidate.judgment_amount || candidate.opening_bid,
      parcel_or_account: matchingRecord.parcel_or_account || candidate.parcel_id,
      source_reference: [candidate.source_reference, matchingRecord.source_reference].filter(Boolean).join(' | ')
    } : {});
  });
  const candidates = enrichedRawCandidates.map((candidate) => candidateFromRaw(candidate, {
    acquisition_run_id: options.acquisition_run_id || options.discovery_batch_id || options.job_id || cacheKey,
    captured_at: capturedAt,
    source_url: sourceUrl,
    source_document_url: sourceDocumentUrl || sourceUrl
  }, source)).slice(0, maxRows);
  const finalCandidates = candidates.map((candidate) => mergeRecordIntoCandidate(candidate, records));
  const cards = finalCandidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, {
    acquisition_run_id: candidate.acquisition_run_id,
    city: 'Dallas',
    state: 'TX'
  }));
  const diagnostics = diagnosticsFromCandidates(finalCandidates, enrichedRawCandidates, records, combinedText, sourceHtml, sourceUrl, sourceDocumentUrl, sourceLinks);
  const result = {
    source_id: SOURCE_ID,
    source_name: SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    source_url: sourceUrl,
    source_document_url: sourceDocumentUrl,
    status: finalCandidates.length ? 'available' : 'needs_manual_review',
    attempted: true,
    message: finalCandidates.length
      ? `Dallas foreclosure adapter found ${finalCandidates.length} property candidate(s) from supplied source evidence.`
      : 'Dallas foreclosure adapter did not find a callable candidate from supplied source evidence.',
    preview_only: true,
    should_ingest: false,
    candidates: finalCandidates,
    cards,
    candidate_count: finalCandidates.length,
    diagnostics,
    evidence_links_found: diagnostics.evidence_links_found,
    blocked_reason: finalCandidates.length ? '' : 'no_callable_foreclosure_candidates_from_supplied_evidence',
    warnings: finalCandidates.length ? [] : ['No foreclosure property candidate met the current evidence gate.']
  };
  if (cache) cache.set(cacheKey, result);
  return result;
}

module.exports = {
  SOURCE_ID,
  SOURCE_URL,
  SOURCE_NAME,
  SOURCE_FAMILY,
  runDallasForeclosureAcquisitionAdapter
};
