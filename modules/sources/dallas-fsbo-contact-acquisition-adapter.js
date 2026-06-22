'use strict';

const callReadyDealPacket = require('../research/call-ready-deal-packet');
const propertyCandidate = require('../research/property-candidate');
const propertyIdentity = require('../research/property-identity');
const searchProviderWorker = require('../research/search-provider-worker');
const searchSnippetEvidence = require('../research/search-snippet-evidence');
const sourceEvidenceAdapter = require('../research/source-evidence-adapter');

const SOURCE_ID = 'tx_dallas_fsbo_contact_first';
const SOURCE_NAME = 'Dallas FSBO / owner-contact listing sources';
const SOURCE_FAMILY = 'fsbo';
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_MAX_PAGE_FETCHES = 4;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_PAGE_BYTES = 512 * 1024;
const ALLOWED_CONTACT_HOSTS = [
  'fsbo.com',
  'forsalebyowner.com',
  'zillow.com',
  'realtor.com',
  'redfin.com',
  'har.com',
  'homes.com'
];

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function boundedInt(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(Math.floor(number), maximum);
}

function nowIso() {
  return new Date().toISOString();
}

function sourceHost(value) {
  try {
    return new URL(cleanText(value)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function isAllowedContactSourceUrl(value) {
  const host = sourceHost(value);
  if (!host || /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/i.test(host)) return false;
  return ALLOWED_CONTACT_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function decodeHtml(value) {
  return cleanText(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function metaContent(html, key) {
  const source = String(html || '');
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return decodeHtml(match[1]);
  }
  return '';
}

function normalizePhone(value) {
  const digits = cleanText(value).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (digits.length !== 10) return '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function evidenceWindow(text, matchText) {
  const value = cleanText(text);
  const match = cleanText(matchText);
  if (!value || !match) return '';
  const sentence = value
    .split(/(?<=[.!?;|])\s+/)
    .map(cleanText)
    .find((part) => part.toLowerCase().includes(match.toLowerCase()));
  if (sentence) return sentence;
  const index = value.toLowerCase().indexOf(match.toLowerCase());
  if (index < 0) return match;
  return cleanText(value.slice(Math.max(0, index - 70), Math.min(value.length, index + match.length + 90)));
}

function extractVisibleContactEvidence(input) {
  input = input || {};
  const sourceUrl = cleanText(input.source_url);
  const visibleText = cleanText([
    input.title,
    input.snippet,
    input.page_title,
    input.page_description,
    input.page_visible_text
  ].filter(Boolean).join(' '));
  const html = String(input.page_html || '');
  const phoneMatch = visibleText.match(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/);
  const telMatch = html.match(/href=["']tel:([^"']+)["']/i);
  const phoneRaw = cleanText(phoneMatch && phoneMatch[0] || telMatch && telMatch[1]);
  const phone = normalizePhone(phoneRaw);
  const emailMatch = visibleText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  const mailtoMatch = html.match(/href=["']mailto:([^"'?]+)[^"']*["']/i);
  const email = cleanText(emailMatch && emailMatch[0] || mailtoMatch && mailtoMatch[1]).toLowerCase();
  const contactFormMatch = html.match(/<(?:form|a|button)\b[^>]*(?:lead|inquiry|reply|message|seller|owner|listing-contact|property-contact)[^>]*>/i);
  const contactTextMatch = visibleText.match(/\b(contact (?:seller|owner|agent)|send (?:a )?message|email (?:seller|owner)|reply to (?:seller|owner))\b/i);
  if (phone) {
    const rawEvidence = phoneMatch ? evidenceWindow(visibleText, phoneMatch[0]) : `tel:${cleanText(telMatch && telMatch[1])}`;
    if (/\b(owner|seller|agent|listing|contact|call|text|phone)\b/i.test(rawEvidence)) {
      return {
        contact_route: 'Direct Phone',
        contact_phone: phone,
        contact_email: '',
        contact_source_url: sourceUrl,
        contact_evidence_text: rawEvidence,
        contact_verification_status: 'verified_visible_source',
        contact_verified: true
      };
    }
  }
  if (email) {
    const rawEvidence = emailMatch ? evidenceWindow(visibleText, emailMatch[0]) : `mailto:${email}`;
    if (/\b(owner|seller|agent|listing|contact|email)\b/i.test(rawEvidence)) {
      return {
        contact_route: 'Direct Email',
        contact_phone: '',
        contact_email: email,
        contact_source_url: sourceUrl,
        contact_evidence_text: rawEvidence,
        contact_verification_status: 'verified_visible_source',
        contact_verified: true
      };
    }
  }
  if (contactFormMatch || contactTextMatch) {
    const evidence = contactTextMatch ? evidenceWindow(visibleText, contactTextMatch[0]) : 'Public contact form visible on source page.';
    return {
      contact_route: /reply/i.test(evidence) ? 'Public Reply' : 'Public Contact Form',
      contact_phone: '',
      contact_email: '',
      contact_source_url: sourceUrl,
      contact_evidence_text: evidence,
      contact_verification_status: 'verified_visible_source',
      contact_verified: true
    };
  }
  return {
    contact_route: 'Manual Lookup Needed',
    contact_phone: '',
    contact_email: '',
    contact_source_url: '',
    contact_evidence_text: '',
    contact_verification_status: 'not_verified',
    contact_verified: false
  };
}

async function fetchContactPageEvidence(sourceUrl, options = {}) {
  const url = cleanText(sourceUrl);
  const fetchImpl = options.fetch_impl || options.fetchImpl || global.fetch;
  if (!isAllowedContactSourceUrl(url)) {
    return { status: 'unsafe_host_rejected', source_url: url, contact_verified: false };
  }
  if (typeof fetchImpl !== 'function') {
    return { status: 'fetch_unavailable', source_url: url, contact_verified: false };
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = boundedInt(options.timeout_ms, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1' },
      signal: controller ? controller.signal : undefined
    });
    const finalUrl = cleanText(response && response.url) || url;
    if (!isAllowedContactSourceUrl(finalUrl)) {
      return { status: 'unsafe_redirect_rejected', source_url: url, final_source_url: finalUrl, contact_verified: false };
    }
    const contentLength = Number(response && response.headers && response.headers.get && response.headers.get('content-length') || 0) || 0;
    if (contentLength > MAX_PAGE_BYTES) {
      return { status: 'oversize_rejected', source_url: url, final_source_url: finalUrl, contact_verified: false };
    }
    if (!response || !response.ok) {
      return { status: `http_${response && response.status || 0}`, source_url: url, final_source_url: finalUrl, contact_verified: false };
    }
    const html = String(await response.text() || '').slice(0, MAX_PAGE_BYTES);
    const pageTitle = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const pageDescription = metaContent(html, 'description') || metaContent(html, 'og:description');
    const pageVisibleText = stripHtml(html).slice(0, 12000);
    return Object.assign({
      status: 'fetched',
      source_url: url,
      final_source_url: finalUrl,
      http_status: response.status,
      page_title: pageTitle,
      page_description: pageDescription,
      page_visible_text: pageVisibleText,
      page_html: html
    }, extractVisibleContactEvidence({
      source_url: finalUrl,
      page_title: pageTitle,
      page_description: pageDescription,
      page_visible_text: pageVisibleText,
      page_html: html
    }));
  } catch (error) {
    return {
      status: /abort|timeout/i.test(cleanText(error && error.message)) ? 'timed_out' : 'fetch_failed',
      source_url: url,
      error: cleanText(error && error.message).slice(0, 160),
      contact_verified: false
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function candidateFromSearchCard(card, pageEvidence, context = {}) {
  card = card || {};
  pageEvidence = pageEvidence || {};
  const sourceUrl = cleanText(pageEvidence.final_source_url || card.canonical_source_url || card.source_url);
  const title = cleanText(card.source_title || card.title || pageEvidence.page_title);
  const snippet = cleanText([
    card.source_snippet,
    card.search_result_snippet,
    pageEvidence.page_description,
    pageEvidence.page_visible_text
  ].filter(Boolean).join(' ')).slice(0, 12000);
  const propertySpecific = searchSnippetEvidence.isPropertySpecificSearchUrl(sourceUrl, title, snippet);
  const sourceClassification = propertySpecific ? 'exact_property_record' : sourceEvidenceAdapter.classifySourceUrl(sourceUrl);
  const phrase = searchSnippetEvidence.extractVisiblePhraseCandidate(title, snippet, {
    source_title: title,
    source_snippet: snippet,
    source_domain: sourceHost(sourceUrl)
  });
  const status = searchSnippetEvidence.extractVisibleStatusCandidate(title, snippet, {
    source_title: title,
    source_snippet: snippet,
    source_domain: sourceHost(sourceUrl)
  });
  const rawAddress = cleanText(card.display_address || card.address || card.possible_address || card.address_or_source_text);
  const canonicalAddress = propertyIdentity.canonicalAddress(Object.assign({}, card, {
    normalized_address: card.display_address || card.address || card.possible_address || card.address_or_source_text,
    address: card.address || card.possible_address,
    property_address: card.property_address || card.possible_address,
    display_address: card.display_address || card.possible_address,
    possible_address: card.possible_address || card.address,
    source_url: sourceUrl,
    source_title: title,
    source_snippet: snippet,
    city: context.city || 'Dallas',
    state: context.state || 'TX'
  }));
  const normalizedAddress = propertyIdentity.isCompleteAddress(canonicalAddress) && cleanText(canonicalAddress)
    ? canonicalAddress
    : (propertyIdentity.isCompleteAddress(rawAddress) ? rawAddress : canonicalAddress);
  const contact = extractVisibleContactEvidence({
    source_url: sourceUrl,
    title,
    snippet,
    page_title: pageEvidence.page_title,
    page_description: pageEvidence.page_description,
    page_visible_text: pageEvidence.page_visible_text,
    page_html: pageEvidence.page_html
  });
  const sourceProofText = cleanText([
    phrase.text,
    status.text,
    contact.contact_evidence_text
  ].filter(Boolean).join(' | '));
  return propertyCandidate.normalizePropertyCandidate({
    source_id: SOURCE_ID,
    source_name: SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    candidate_origin: 'dallas_fsbo_contact_adapter',
    source_url: sourceUrl,
    source_classification: sourceClassification,
    source_type: 'public listing source',
    normalized_address: normalizedAddress,
    motivation_type: 'FSBO / public seller contact',
    motivation_phrase: phrase.visible ? phrase.text : '',
    motivation_evidence_text: phrase.visible ? phrase.text : '',
    current_status: status.promoted ? status.text : '',
    status_evidence_text: status.visible ? status.text : '',
    status_verified_visible: status.promoted === true,
    source_proof_text: sourceProofText,
    source_excerpt: cleanText([title, card.source_snippet].filter(Boolean).join(' | ')),
    contact_route: contact.contact_route,
    contact_phone: contact.contact_phone,
    contact_email: contact.contact_email,
    contact_source_url: contact.contact_source_url,
    contact_evidence_text: contact.contact_evidence_text,
    contact_verification_status: contact.contact_verification_status,
    contact_verified: contact.contact_verified === true,
    asking_price: card.asking_price,
    beds: card.beds,
    baths: card.baths,
    sqft: card.sqft,
    year_built: card.year_built,
    retrieved_at: card.retrieved_at || nowIso(),
    missing_evidence: []
      .concat(!propertySpecific ? ['property-specific source URL'] : [])
      .concat(!propertyIdentity.isCompleteAddress(normalizedAddress) ? ['complete canonical address'] : [])
      .concat(!phrase.visible ? ['verbatim source-backed motivation'] : [])
      .concat(!status.promoted ? ['visible current status evidence'] : [])
      .concat(!contact.contact_verified ? ['verified public contact route'] : [])
  }, {
    acquisition_run_id: context.acquisition_run_id,
    city: context.city || 'Dallas',
    state: context.state || 'TX'
  });
}

function statusCounts(packets) {
  return (Array.isArray(packets) ? packets : []).reduce((out, packet) => {
    const status = cleanText(packet && packet.packet_status) || 'UNKNOWN';
    out[status] = (out[status] || 0) + 1;
    return out;
  }, {});
}

async function runDallasFsboContactAcquisitionAdapter(options = {}) {
  const maxResults = boundedInt(options.max_results, DEFAULT_MAX_RESULTS, DEFAULT_MAX_RESULTS);
  const maxPageFetches = boundedInt(options.max_page_fetches, DEFAULT_MAX_PAGE_FETCHES, DEFAULT_MAX_PAGE_FETCHES);
  const context = {
    acquisition_run_id: cleanText(options.acquisition_run_id),
    city: cleanText(options.city) || 'Dallas',
    county: cleanText(options.county) || 'Dallas',
    state: cleanText(options.state) || 'TX'
  };
  const queryGroups = Array.isArray(options.query_groups) && options.query_groups.length
    ? options.query_groups.slice(0, 4)
    : searchProviderWorker.buildContactFirstSearchQueries({
      search_mode: 'contact_first_acquisition',
      city: context.city,
      county: context.county,
      state: context.state
    });
  const searchResult = await searchProviderWorker.runSearchProvider({
    market: context.city,
    city: context.city,
    county: context.county,
    state: context.state,
    search_mode: 'contact_first_acquisition'
  }, {
    query_groups: queryGroups,
    env: options.env,
    fetchImpl: options.search_fetch_impl || options.searchFetchImpl,
    mock_results: options.mock_search_results,
    max_results: maxResults
  });
  const reviewedCards = Array.isArray(searchResult.cards) ? searchResult.cards.slice(0, maxResults) : [];
  const executedAttempts = Array.isArray(searchResult.provider_attempts) ? searchResult.provider_attempts : [];
  const sourceCards = [];
  const candidates = [];
  const rejected = [];
  const pageFetches = [];
  const pageFetchSkips = [];
  let pageFetchCount = 0;

  for (const card of reviewedCards) {
    const sourceUrl = cleanText(card && (card.canonical_source_url || card.source_url));
    const propertySpecific = searchSnippetEvidence.isPropertySpecificSearchUrl(sourceUrl, card && card.source_title, card && card.source_snippet);
    if (!propertySpecific || !isAllowedContactSourceUrl(sourceUrl)) {
      rejected.push({
        source_url: sourceUrl,
        reason: !propertySpecific ? 'generic_or_non_property_source' : 'unsafe_or_unsupported_host'
      });
      continue;
    }
    sourceCards.push(card);
    let pageEvidence = {
      status: 'not_fetched',
      source_url: sourceUrl,
      contact_verified: false
    };
    if (pageFetchCount < maxPageFetches) {
      pageFetchCount += 1;
      pageEvidence = await fetchContactPageEvidence(sourceUrl, {
        fetch_impl: options.page_fetch_impl || options.pageFetchImpl,
        timeout_ms: options.timeout_ms
      });
      pageFetches.push({
        source_url: sourceUrl,
        status: pageEvidence.status,
        http_status: pageEvidence.http_status || null,
        contact_verified: pageEvidence.contact_verified === true
      });
    } else {
      pageFetchSkips.push({
        source_url: sourceUrl,
        reason: 'max_page_fetches_reached'
      });
    }
    const candidate = candidateFromSearchCard(card, pageEvidence, context);
    if (!propertyIdentity.isCompleteAddress(candidate.normalized_address)) {
      rejected.push({ source_url: sourceUrl, reason: 'missing_complete_address' });
      continue;
    }
    candidates.push(candidate);
  }

  const cards = candidates.map((candidate) => propertyCandidate.candidateToFindMeCard(candidate, context));
  const packets = candidates.map((candidate) => callReadyDealPacket.buildCallReadyDealPacket(Object.assign({}, candidate, {
    status_verified_visible: !!candidate.current_status && !!candidate.status_evidence_text
  }), { context }));
  const diagnostics = {
    query_groups_planned: queryGroups.map((group) => group.query_group),
    query_groups_used: executedAttempts.map((attempt) => attempt.query_group).filter(Boolean),
    query_group_count: executedAttempts.length,
    provider: searchResult.provider,
    provider_status: searchResult.status,
    provider_readiness: searchResult.readiness,
    provider_result_count: Number(searchResult.result_count || 0) || 0,
    source_results_reviewed: reviewedCards.length,
    property_specific_results_reviewed: sourceCards.length,
    page_fetch_cap: maxPageFetches,
    page_fetches_used: pageFetchCount,
    page_fetches: pageFetches,
    page_fetch_skips: pageFetchSkips,
    page_fetch_skipped_count: pageFetchSkips.length,
    rejected_results: rejected,
    rejected_reason_counts: rejected.reduce((out, item) => {
      out[item.reason] = (out[item.reason] || 0) + 1;
      return out;
    }, {}),
    accepted_results: sourceCards.map((card) => ({
      source_url: cleanText(card && card.source_url),
      reason: 'property_specific_and_allowed',
      page_fetch_status: pageFetches.find((item) => cleanText(item.source_url) === cleanText(card && card.source_url))?.status || 'not_fetched'
    })),
    packet_status_counts: statusCounts(packets),
    call_ready_count: packets.filter((packet) => packet.packet_status === callReadyDealPacket.PACKET_STATUSES.CALL_READY).length,
    outreach_ready_count: packets.filter((packet) => packet.packet_status === callReadyDealPacket.PACKET_STATUSES.OUTREACH_READY).length,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
  return {
    source_id: SOURCE_ID,
    source_name: SOURCE_NAME,
    source_family: SOURCE_FAMILY,
    status: candidates.length ? 'available' : cleanText(searchResult.status) || 'no_candidates',
    attempted: searchResult.attempted === true,
    candidates,
    cards,
    packets,
    diagnostics,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  SOURCE_ID,
  SOURCE_NAME,
  SOURCE_FAMILY,
  ALLOWED_CONTACT_HOSTS,
  isAllowedContactSourceUrl,
  extractVisibleContactEvidence,
  fetchContactPageEvidence,
  candidateFromSearchCard,
  runDallasFsboContactAcquisitionAdapter
};
