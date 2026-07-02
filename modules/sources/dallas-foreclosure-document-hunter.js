'use strict';

const crypto = require('crypto');

const foreclosureNoticeAdapter = require('./dallas-foreclosure-notice-adapter');
const realFileParser = require('./dallas-real-file-parser');
const searchProviderWorker = require('../research/search-provider-worker');
const propertyCandidate = require('../research/property-candidate');
const sourceEvidenceAdapter = require('../research/source-evidence-adapter');

const SOURCE_ID = foreclosureNoticeAdapter.SOURCE_ID;
const SOURCE_URL = foreclosureNoticeAdapter.SOURCE_URL;
const SOURCE_NAME = 'Dallas County Clerk Foreclosure Notices';
const SOURCE_FAMILY = 'preforeclosure_trustee_notice';
const MAX_DISCOVERY_RESULTS = 10;
const MAX_DISCOVERED_URLS = 20;
const MAX_DIRECT_DOCUMENT_URLS = 3;
const MAX_CANDIDATES = 10;

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

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(cleanText(value)).digest('hex').slice(0, 16)}`;
}

function uniqueCleanList(values, limit) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function urlHost(value) {
  try {
    return new URL(cleanText(value)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (error) {
    return '';
  }
}

function isPublicSearchPortalUrl(value) {
  try {
    const parsed = new URL(cleanText(value));
    return parsed.hostname.replace(/^www\./i, '').toLowerCase() === 'dallas.tx.publicsearch.us' && /^(?:\/?|\/(?:search|advanced|property-alert|cart|signin|register))(?:[?#].*)?$/i.test(parsed.pathname || '/');
  } catch (error) {
    return false;
  }
}

function isOfficialCountyForeclosureUrl(value) {
  try {
    const parsed = new URL(cleanText(value));
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    if (parsed.hostname.replace(/^www\./i, '').toLowerCase() !== 'dallascounty.org') return false;
    return /foreclos|recording|county-clerk|publicsearch/i.test(parsed.pathname || '');
  } catch (error) {
    return false;
  }
}

function isDirectDocumentUrl(value) {
  const classification = sourceEvidenceAdapter.classifySourceUrl(value);
  if (classification !== 'pdf_document' && classification !== 'exact_property_record') return false;
  const host = urlHost(value);
  return host === 'dallascounty.org' || host === 'dallas.tx.publicsearch.us';
}

function rankDiscoveryUrl(item) {
  if (!item) return 0;
  if (item.reason && /portal_shell|unsafe_host|generic_source|not_allowed|blocked/i.test(item.reason)) return 0;
  if (item.classification === 'pdf_document' || item.classification === 'exact_property_record') return 3;
  if (item.classification === 'county_search_page' || item.classification === 'list_page' || item.is_official_county_page) return 2;
  if (item.classification === 'generic_portal') return 1;
  return 0;
}

function classifyDiscoveryUrl(url) {
  const cleanUrl = cleanText(url);
  const classification = sourceEvidenceAdapter.classifySourceUrl(cleanUrl);
  if (!cleanUrl) {
    return { url: '', classification: 'missing_source_url', accepted: false, reason: 'missing_source_url' };
  }
  if (isPublicSearchPortalUrl(cleanUrl)) {
    return { url: cleanUrl, classification: 'publicsearch_portal_shell', accepted: false, reason: 'portal_preview_only' };
  }
  const host = urlHost(cleanUrl);
  if (host !== 'dallascounty.org' && host !== 'dallas.tx.publicsearch.us') {
    return { url: cleanUrl, classification: classification || 'unsafe', accepted: false, reason: 'unsafe_host' };
  }
  if (isDirectDocumentUrl(cleanUrl)) {
    return { url: cleanUrl, classification, accepted: true, reason: '' };
  }
  if (isOfficialCountyForeclosureUrl(cleanUrl)) {
    return { url: cleanUrl, classification: classification || 'county_search_page', accepted: true, reason: '', is_official_county_page: true };
  }
  if (classification === 'county_search_page' || classification === 'list_page' || classification === 'generic_portal') {
    return { url: cleanUrl, classification, accepted: true, reason: '' };
  }
  return { url: cleanUrl, classification: classification || 'unknown', accepted: false, reason: 'generic_source' };
}

function collectSearchUrls(searchResult) {
  const raw = [];
  const cards = Array.isArray(searchResult && searchResult.cards) ? searchResult.cards : [];
  const results = Array.isArray(searchResult && searchResult.results) ? searchResult.results : [];
  const sourceUrls = Array.isArray(searchResult && searchResult.source_urls) ? searchResult.source_urls : [];
  for (const card of cards) {
    raw.push({
      url: cleanText(card && (card.source_url || card.canonical_source_url || card.displayed_url || card.url)),
      label: cleanText(card && (card.source_title || card.source_snippet || card.displayed_url || card.title)) || 'Search result',
      search_result_rank: Number(card && card.provider_result_rank || 0) || 0,
      source_classification: cleanText(card && card.search_result_classification),
      source_domain: cleanText(card && card.source_domain)
    });
  }
  for (const result of results) {
    raw.push({
      url: cleanText(result && (result.url || result.displayed_url || result.source_url)),
      label: cleanText(result && (result.title || result.snippet || result.displayed_url || result.url)) || 'Search result',
      search_result_rank: Number(result && result.rank || 0) || 0,
      source_classification: cleanText(result && result.search_result_classification),
      source_domain: cleanText(result && result.source_domain)
    });
  }
  for (const url of sourceUrls) {
    raw.push({
      url: cleanText(url),
      label: 'Search result url',
      search_result_rank: 0,
      source_classification: cleanText(searchResult && searchResult.provider_output_format)
    });
  }

  const map = new Map();
  for (const item of raw) {
    const classification = classifyDiscoveryUrl(item.url);
    const key = classification.url.toLowerCase();
    if (!key) continue;
    const discovered = Object.assign({}, item, classification, {
      rank_score: rankDiscoveryUrl(classification)
    });
    const existing = map.get(key);
    if (!existing || discovered.rank_score > existing.rank_score || (discovered.rank_score === existing.rank_score && discovered.search_result_rank < existing.search_result_rank)) {
      map.set(key, discovered);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.rank_score - a.rank_score || a.search_result_rank - b.search_result_rank || a.url.localeCompare(b.url));
}

function toLinkItem(item, override = {}) {
  return {
    url: cleanText(item && item.url),
    label: cleanText(override.label || item && item.label || item && item.title || item && item.source_title || 'Discovered source'),
    link_type: override.link_type || (item && item.classification === 'pdf_document' ? 'document_link' : item && item.classification === 'exact_property_record' ? 'property_record_link' : item && item.is_official_county_page ? 'county_notice_page' : 'discovered_link'),
    classification: cleanText(item && item.classification),
    accepted: item && item.accepted === true,
    reason: cleanText(item && item.reason),
    source_domain: cleanText(item && item.source_domain),
    search_result_rank: Number(item && item.search_result_rank || 0) || 0
  };
}

function normalizeCandidateList(candidates, context) {
  const seen = new Map();
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const candidate = propertyCandidate.normalizePropertyCandidate(raw, context);
    const addressKey = cleanText(candidate.normalized_address || candidate.property_address).toLowerCase();
    const key = addressKey || cleanText([
      candidate.source_url || candidate.source_document_url,
      candidate.source_row_reference || candidate.parcel_or_account
    ].filter(Boolean).join('|')).toLowerCase() || candidate.candidate_id;
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, candidate);
      continue;
    }
    const existingRank = Number(existing.identity_confidence || 0) + Number(existing.source_confidence || 0) + Number(existing.motivation_confidence || 0) + Number(existing.contact_confidence || 0) + (cleanText(existing.source_document_url) ? 25 : 0);
    const currentRank = Number(candidate.identity_confidence || 0) + Number(candidate.source_confidence || 0) + Number(candidate.motivation_confidence || 0) + Number(candidate.contact_confidence || 0) + (cleanText(candidate.source_document_url) ? 25 : 0);
    if (currentRank >= existingRank) seen.set(key, candidate);
  }
  return Array.from(seen.values());
}

function countByPredicate(list, predicate) {
  let count = 0;
  for (const item of Array.isArray(list) ? list : []) {
    if (predicate(item)) count += 1;
  }
  return count;
}

async function runDallasForeclosureDocumentHunter(options = {}) {
  const source = Object.assign({
    source_id: SOURCE_ID,
    source_name: SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    source_url: SOURCE_URL,
    source_document_url: '',
    official_source: true
  }, options.source || {});
  const sourceUrl = isOfficialCountyForeclosureUrl(options.source_url || source.source_url || SOURCE_URL)
    ? cleanText(options.source_url || source.source_url || SOURCE_URL)
    : SOURCE_URL;
  const sourceDocumentUrl = cleanText(options.source_document_url || source.source_document_url || '');
  const capturedAt = cleanText(options.captured_at) || nowIso();
  const maxRows = boundedInt(options.max_rows || options.max_candidates || MAX_CANDIDATES, MAX_CANDIDATES, MAX_CANDIDATES);
  const maxFiles = boundedInt(options.max_files || MAX_DIRECT_DOCUMENT_URLS, MAX_DIRECT_DOCUMENT_URLS, MAX_DIRECT_DOCUMENT_URLS);
  const maxSearchResults = boundedInt(options.max_results || MAX_DISCOVERY_RESULTS, MAX_DISCOVERY_RESULTS, MAX_DISCOVERY_RESULTS);
  const queryGroups = Array.isArray(options.query_groups) && options.query_groups.length
    ? options.query_groups
    : searchProviderWorker.buildSourceDocumentDiscoveryQueryGroups({
      search_mode: 'source_document_discovery',
      city: options.city || source.city || 'Dallas',
      county: options.county || source.county || 'Dallas',
      state: options.state || source.state || 'TX',
      source_preferences: ['dallascounty.org', 'dallas.tx.publicsearch.us']
    });
  const searchInput = {
    market: options.market || options.city || source.city || 'Dallas',
    city: options.city || source.city || 'Dallas',
    county: options.county || source.county || 'Dallas',
    state: options.state || source.state || 'TX',
    search_mode: 'source_document_discovery',
    source_preferences: ['dallascounty.org', 'dallas.tx.publicsearch.us']
  };
  const searchResult = await searchProviderWorker.runSearchProvider(searchInput, {
    query_groups: queryGroups,
    env: options.env,
    fetch_impl: options.fetch_impl,
    mock_search_results: options.mock_search_results,
    max_results: maxSearchResults
  });
  const discoveredSearchUrls = collectSearchUrls(searchResult);
  const directDiscoveryLinks = discoveredSearchUrls.filter((item) => item.accepted && isDirectDocumentUrl(item.url));
  const officialSearchPageLinks = discoveredSearchUrls.filter((item) => item.accepted && !isDirectDocumentUrl(item.url));
  const officialPreview = await foreclosureNoticeAdapter.runDallasForeclosureNoticeAdapter({
    source,
    source_url: sourceUrl,
    max_rows: maxRows,
    max_files: maxFiles,
    timeout_ms: options.timeout_ms || options.timeout || 10000,
    captured_at: capturedAt,
    fetch_impl: options.fetch_impl
  });
  const publicsearchPointerFound = !!(officialPreview.publicsearch_pointer_found || discoveredSearchUrls.some((item) => item.classification === 'publicsearch_portal_shell') || /publicsearch\.us/i.test(sourceDocumentUrl));
  const allowDiscoveryLinks = !!officialPreview.publicsearch_pointer_found && !sourceDocumentUrl;
  const allowOfficialPreviewArtifacts = !sourceDocumentUrl;
  const explicitDirectDoc = sourceDocumentUrl && isDirectDocumentUrl(sourceDocumentUrl)
    ? [{
      url: sourceDocumentUrl,
      label: 'Gabriel-provided direct document URL',
      link_type: 'document_link',
      classification: sourceEvidenceAdapter.classifySourceUrl(sourceDocumentUrl),
      accepted: true,
      reason: '',
      source_domain: urlHost(sourceDocumentUrl),
      search_result_rank: 0,
      rank_score: 3
    }]
    : [];
  const docLinks = uniqueCleanList([].concat(
    allowDiscoveryLinks ? directDiscoveryLinks.map((item) => item.url) : [],
    explicitDirectDoc.map((item) => item.url)
  ), MAX_DIRECT_DOCUMENT_URLS)
    .map((url) => ({ url, label: 'Automated source document hunter', link_type: 'document_link' }));
  const parserResult = docLinks.length
    ? await realFileParser.runDallasRealFileParser({
      source,
      source_url: sourceUrl,
      evidence_links: docLinks,
      max_candidates: Math.max(1, maxRows - Number(officialPreview.candidates && officialPreview.candidates.length || 0)),
      max_files: maxFiles,
      timeout_ms: options.timeout_ms || options.timeout || 10000,
      captured_at: capturedAt,
      fetch_impl: options.fetch_impl
    })
    : { candidates: [], attempts: [], blocked_reason: '' };

  const combinedCandidates = normalizeCandidateList([].concat(
    allowOfficialPreviewArtifacts && Array.isArray(officialPreview.candidates) ? officialPreview.candidates : [],
    Array.isArray(parserResult.candidates) ? parserResult.candidates : []
  ), {
    acquisition_run_id: options.acquisition_run_id || options.discovery_batch_id || options.job_id || hashId('dh', [sourceUrl, sourceDocumentUrl, capturedAt].join('|')),
    city: options.city || source.city || 'Dallas',
    state: options.state || source.state || 'TX'
  }).slice(0, maxRows);
  const cards = combinedCandidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, {
    acquisition_run_id: candidate.acquisition_run_id,
    city: candidate.city || options.city || source.city || 'Dallas',
    state: candidate.state || options.state || source.state || 'TX'
  }));
  const parsedAttempts = Array.isArray(parserResult.attempts) ? parserResult.attempts : [];
  const documentUrlsParsed = uniqueCleanList([].concat(
    allowOfficialPreviewArtifacts && Array.isArray(officialPreview.document_urls_parsed) ? officialPreview.document_urls_parsed : [],
    parsedAttempts.filter((attempt) => attempt.status === 'parsed').map((attempt) => attempt.url)
  ), MAX_DIRECT_DOCUMENT_URLS);
  const documentUrlsSkipped = [].concat(
    allowOfficialPreviewArtifacts && Array.isArray(officialPreview.document_urls_skipped) ? officialPreview.document_urls_skipped : [],
    parsedAttempts.filter((attempt) => attempt.status !== 'parsed').map((attempt) => ({
      url: cleanText(attempt.url),
      reason: cleanText(attempt.blocked_reason || attempt.status)
    }))
  ).filter((item) => cleanText(item && item.url));
  const combinedDiscoveredLinks = uniqueCleanList([].concat(
    allowOfficialPreviewArtifacts && Array.isArray(officialPreview.discovered_links) ? officialPreview.discovered_links.map((link) => link && link.url ? link.url : link) : [],
    discoveredSearchUrls.map((item) => item.url),
    sourceDocumentUrl
  ), MAX_DISCOVERED_URLS).map((url) => {
    const searchItem = discoveredSearchUrls.find((item) => item.url === url);
    const officialLink = allowOfficialPreviewArtifacts && Array.isArray(officialPreview.discovered_links) ? officialPreview.discovered_links.find((link) => cleanText(link && link.url ? link.url : link) === url) : null;
    const chosen = officialLink || searchItem || classifyDiscoveryUrl(url);
    return toLinkItem(chosen, {
      label: officialLink && officialLink.label ? officialLink.label : searchItem && searchItem.label ? searchItem.label : isDirectDocumentUrl(url) ? 'Automated source document hunter' : 'Official source page'
    });
  });
  const blockedReasons = Object.assign({}, officialPreview.blocked_reason ? { [officialPreview.blocked_reason]: 1 } : {}, parserResult.blocked_reason ? { [parserResult.blocked_reason]: 1 } : {}, searchResult.rejected_url_class_counts || {}, discoveredSearchUrls.reduce((out, item) => {
    if (!item.accepted && item.reason) out[item.reason] = (out[item.reason] || 0) + 1;
    return out;
  }, {}));
  const sourcePreview = {
    source_url_checked: sourceUrl,
    source_document_url_checked: sourceDocumentUrl,
    publicsearch_pointer_found: publicsearchPointerFound,
    publicsearch_preview_mode: publicsearchPointerFound ? 'portal_preview_only' : '',
    document_urls_found: uniqueCleanList([].concat(
      allowOfficialPreviewArtifacts ? Array.isArray(officialPreview.document_urls_found) ? officialPreview.document_urls_found : [] : [],
      directDiscoveryLinks.map((item) => item.url),
      explicitDirectDoc.map((item) => item.url)
    ), MAX_DISCOVERED_URLS),
    document_urls_found_count: 0,
    document_urls_parsed: documentUrlsParsed,
    document_urls_parsed_count: documentUrlsParsed.length,
    document_urls_skipped: documentUrlsSkipped,
    document_urls_skipped_count: documentUrlsSkipped.length,
    candidate_count: combinedCandidates.length,
    stale_sale_date_count: allowOfficialPreviewArtifacts ? Number(officialPreview.stale_sale_date_count || 0) || 0 : 0,
    blocked_rejected_reasons: blockedReasons,
    evidence_snippets: uniqueCleanList(combinedCandidates.map((candidate) => candidate.source_proof_text || candidate.motivation_evidence_text || candidate.motivation_phrase), 10),
    parsed_addresses: uniqueCleanList(combinedCandidates.map((candidate) => candidate.normalized_address || candidate.property_address), 10),
    parsed_owners: uniqueCleanList(combinedCandidates.map((candidate) => candidate.owner_name_candidate), 10),
    parsed_sale_dates: uniqueCleanList(combinedCandidates.map((candidate) => candidate.sale_date || candidate.event_date), 10),
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
  sourcePreview.document_urls_found_count = sourcePreview.document_urls_found.length;
  const documentHunterSummary = {
    source_url_checked: sourcePreview.source_url_checked,
    source_document_url_checked: sourcePreview.source_document_url_checked,
    publicsearch_pointer_found: publicsearchPointerFound,
    search_provider_status: cleanText(searchResult.status),
    search_provider_readiness: cleanText(searchResult.readiness || (searchResult.env_diagnostics && searchResult.env_diagnostics.readiness)),
    search_provider_selected: cleanText(searchResult.provider),
    query_groups_used: Array.isArray(searchResult.query_groups_used) ? searchResult.query_groups_used.map(cleanText).filter(Boolean) : queryGroups.map((group) => cleanText(group.query_group)),
    query_plan: Array.isArray(searchResult.query_plan) ? searchResult.query_plan.map((item) => Object.assign({}, item, {
      provider: cleanText(item && item.provider),
      provider_family: cleanText(item && item.provider_family),
      purpose: cleanText(item && item.purpose),
      query_group: cleanText(item && item.query_group),
      attempt_key: cleanText(item && item.attempt_key),
      expected_url_pattern: cleanText(item && item.expected_url_pattern),
      query: cleanText(item && item.query),
      status: cleanText(item && item.status)
    })) : [],
    search_results_found: Number(searchResult.search_results_found || searchResult.result_count || 0) || 0,
    search_result_demotion_counts: Object.assign({}, searchResult.result_demotion_counts || {}),
    rejected_url_class_counts: Object.assign({}, searchResult.rejected_url_class_counts || {}),
    discovered_url_count: combinedDiscoveredLinks.length,
    direct_document_url_count: docLinks.length,
    document_urls_found_count: sourcePreview.document_urls_found_count,
    document_urls_parsed_count: sourcePreview.document_urls_parsed_count,
    document_urls_skipped_count: sourcePreview.document_urls_skipped_count,
    candidate_count: combinedCandidates.length,
    pdf_notice_documents_fetched: Number(parserResult.pdf_notice_documents_fetched || 0) || 0,
    pdf_notice_documents_parsed: Number(parserResult.pdf_notice_documents_parsed || 0) || 0,
    pdf_notice_rows_extracted: Number(parserResult.pdf_notice_rows_extracted || 0) || 0,
    pdf_notice_rows_with_address: Number(parserResult.pdf_notice_rows_with_address || 0) || 0,
    pdf_notice_rows_with_sale_date: Number(parserResult.pdf_notice_rows_with_sale_date || 0) || 0,
    pdf_notice_parse_failures: Number(parserResult.pdf_notice_parse_failures || 0) || 0,
    evidence_links_found: combinedDiscoveredLinks.length,
    phrase_candidate_seen: countByPredicate(combinedCandidates, (candidate) => !!cleanText(candidate.motivation_phrase || candidate.motivation_evidence_text)),
    status_candidate_seen: countByPredicate(combinedCandidates, (candidate) => !!cleanText(candidate.current_status || candidate.status_evidence_text)),
    exact_phrases_promoted: countByPredicate(combinedCandidates, (candidate) => !!cleanText(candidate.motivation_phrase)),
    property_url_but_missing_phrase: countByPredicate(combinedCandidates, (candidate) => !!cleanText(candidate.normalized_address || candidate.property_address) && !cleanText(candidate.motivation_phrase)),
    property_url_but_missing_status: countByPredicate(combinedCandidates, (candidate) => !!cleanText(candidate.normalized_address || candidate.property_address) && !cleanText(candidate.current_status)),
    exact_property_page_rejected_reason: Object.assign({}, searchResult.rejected_url_class_counts || {}, blockedReasons),
    phrase_candidate_rejected_reason: countByPredicate(combinedCandidates, (candidate) => !cleanText(candidate.motivation_phrase)) ? { no_exact_phrase: countByPredicate(combinedCandidates, (candidate) => !cleanText(candidate.motivation_phrase)) } : {},
    status_candidate_rejected_reason: countByPredicate(combinedCandidates, (candidate) => !cleanText(candidate.current_status)) ? { missing_status: countByPredicate(combinedCandidates, (candidate) => !cleanText(candidate.current_status)) } : {},
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    blocked_rejected_reasons: blockedReasons
  };
  const warnings = []
    .concat(Array.isArray(searchResult.warnings) ? searchResult.warnings : [])
    .concat(Array.isArray(officialPreview.warnings) ? officialPreview.warnings : [])
    .concat(Array.isArray(parserResult.warnings) ? parserResult.warnings : [])
    .filter(Boolean);
  return {
    source_id: SOURCE_ID,
    source_name: source.source_name || SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    source_url: sourceUrl,
    source_document_url: sourceDocumentUrl,
    attempted: true,
    status: combinedCandidates.length ? 'available' : 'needs_manual_review',
    message: combinedCandidates.length
      ? `Dallas foreclosure document hunter found ${combinedCandidates.length} property candidate(s) from official and discovered source documents.`
      : 'Dallas foreclosure document hunter did not find a callable candidate from official and discovered source documents.',
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true,
    publicsearch_pointer_found: publicsearchPointerFound,
    publicsearch_preview_mode: sourcePreview.publicsearch_preview_mode,
    search_provider_status: documentHunterSummary.search_provider_status,
    search_provider_readiness: documentHunterSummary.search_provider_readiness,
    search_provider_selected: documentHunterSummary.search_provider_selected,
    search_provider_query_groups_used: documentHunterSummary.query_groups_used,
    search_provider_query_plan: documentHunterSummary.query_plan,
    search_provider_result_demotion_counts: documentHunterSummary.search_result_demotion_counts,
    search_provider_rejected_url_class_counts: documentHunterSummary.rejected_url_class_counts,
    search_results_found: documentHunterSummary.search_results_found,
    discovered_links: combinedDiscoveredLinks,
    document_urls_found: sourcePreview.document_urls_found,
    document_urls_parsed: documentUrlsParsed,
    document_urls_skipped: documentUrlsSkipped,
    pdf_notice_documents_fetched: documentHunterSummary.pdf_notice_documents_fetched,
    pdf_notice_documents_parsed: documentHunterSummary.pdf_notice_documents_parsed,
    pdf_notice_rows_extracted: documentHunterSummary.pdf_notice_rows_extracted,
    pdf_notice_rows_with_address: documentHunterSummary.pdf_notice_rows_with_address,
    pdf_notice_rows_with_sale_date: documentHunterSummary.pdf_notice_rows_with_sale_date,
    pdf_notice_parse_failures: documentHunterSummary.pdf_notice_parse_failures,
    source_preview: sourcePreview,
    document_hunter_summary: documentHunterSummary,
    candidates: combinedCandidates,
    cards,
    candidate_count: combinedCandidates.length,
    blocked_reason: combinedCandidates.length ? '' : (officialPreview.blocked_reason || parserResult.blocked_reason || 'no_callable_document_hunter_candidates'),
    warnings
  };
}

module.exports = {
  SOURCE_ID,
  SOURCE_URL,
  SOURCE_NAME,
  SOURCE_FAMILY,
  runDallasForeclosureDocumentHunter,
  buildSourceDocumentDiscoveryQueryGroups: searchProviderWorker.buildSourceDocumentDiscoveryQueryGroups,
  classifyDiscoveryUrl,
  isPublicSearchPortalUrl,
  isOfficialCountyForeclosureUrl,
  isDirectDocumentUrl
};
