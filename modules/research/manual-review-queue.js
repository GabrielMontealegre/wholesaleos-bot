'use strict';

const crypto = require('crypto');
const db = require('../../db');

const MAX_QUEUE_ROWS = 500;
const OPEN_STATUSES = new Set(['open', 'reviewed', 'resolved', 'bad_source']);

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function safeLower(value) {
  return cleanText(value).toLowerCase();
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(cleanText(value)).digest('hex').slice(0, 16)}`;
}

function normalizeUrl(value) {
  const text = cleanText(value);
  if (!isHttpUrl(text)) return text;
  try {
    const parsed = new URL(text);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch (_) {
    return text.replace(/\/$/, '');
  }
}

function sourceDomain(value) {
  try {
    return new URL(cleanText(value)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function normalizeQueue(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && cleanText(item.id))
    .filter((item) => {
      const key = cleanText(item.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => Object.assign({}, item, {
      status: OPEN_STATUSES.has(cleanText(item.status)) ? cleanText(item.status) : 'open'
    }))
    .sort((a, b) => cleanText(b.updated_at || b.created_at).localeCompare(cleanText(a.updated_at || a.created_at)))
    .slice(0, MAX_QUEUE_ROWS);
}

function readQueue() {
  const data = db.readDB();
  return normalizeQueue(data.reviewQueue || []);
}

function writeQueue(queue) {
  const data = db.readDB();
  data.reviewQueue = normalizeQueue(queue);
  db.writeDB(data);
  return data.reviewQueue;
}

function blockerTypeForCard(card) {
  const status = cleanText(card && card.status);
  const text = [
    card && card.source_classification,
    card && card.source_quality,
    card && card.market_match,
    card && card.source_url_canonicalization_note,
    card && card.next_action,
    card && card.next_best_action,
    card && card.why_card_exists,
    Array.isArray(card && card.missing_evidence) ? card.missing_evidence.join(' ') : ''
  ].map(cleanText).join(' ');
  if (/Needs Address Repair/i.test(status) || /usable property address|address/i.test(text)) return 'needs_address_repair';
  if (/source.address conflict|source\/address conflict/i.test(text)) return 'source_address_conflict';
  if (/wrong market|market mismatch|selected market match/i.test(text)) return 'wrong_market';
  if (/captcha|paywall|login|rate.?limit|access/i.test(text)) return 'access_blocked';
  if (/search|generic|homepage|category|not exact property proof/i.test(text)) return 'generic_search_source';
  if (/Needs Source Proof/i.test(status)) return 'needs_source_proof';
  return 'manual_review';
}

function blockerReasonForCard(card) {
  const missing = Array.isArray(card && card.missing_evidence) ? card.missing_evidence.map(cleanText).filter(Boolean) : [];
  const explanations = Array.isArray(card && card.quality_explanations) ? card.quality_explanations.map(cleanText).filter(Boolean) : [];
  const note = cleanText(card && (card.source_url_canonicalization_note || card.why_card_exists || card.next_action || card.next_best_action));
  return explanations.concat(missing).concat(note ? [note] : []).filter(Boolean).slice(0, 8).join('; ') ||
    'Blocked Deal Finder card needs manual source/address review.';
}

function recommendedActionFor(blockerType) {
  if (blockerType === 'needs_address_repair') return 'Repair the property address from the source URL, title, snippet, or public page before comps/outreach.';
  if (blockerType === 'source_address_conflict') return 'Verify whether the source URL and address refer to the same property before creating a dossier.';
  if (blockerType === 'wrong_market') return 'Confirm selected market. Do not add to this call batch unless the property is in-market.';
  if (blockerType === 'access_blocked') return 'Use a public, accessible property-specific source. Do not bypass login, paywall, CAPTCHA, or rate-limit pages.';
  if (blockerType === 'generic_search_source') return 'Find an exact property detail page or official property source before calling.';
  return 'Find property-specific source proof or archive as bad source.';
}

function rowFromScoutCard(job, card) {
  const originalUrl = cleanText(card && (card.original_source_url || card.source_url_original || card.source_url || card.canonical_source_url));
  const resolvedUrl = cleanText(card && (card.canonical_source_url || card.source_url));
  const blockerType = blockerTypeForCard(card);
  const market = cleanText(job && (job.location || job.market)) || cleanText(card && card.location);
  const idSeed = [
    'scout',
    job && job.job_id,
    card && card.card_id,
    normalizeUrl(originalUrl || resolvedUrl),
    card && (card.display_address || card.address_or_source_text || card.source_title)
  ].join('|');
  return {
    id: hashId('mrq', idSeed),
    created_at: nowIso(),
    updated_at: nowIso(),
    source: 'Deal Finder',
    source_kind: cleanText(card && card.source_kind),
    scout_job_id: cleanText(job && job.job_id),
    scout_card_id: cleanText(card && card.card_id),
    market,
    original_url: normalizeUrl(originalUrl),
    resolved_url: normalizeUrl(resolvedUrl),
    title: cleanText(card && (card.source_title || card.display_address || card.address_or_source_text)),
    snippet: cleanText(card && (card.why_this_might_be_a_deal || card.why_it_matters || card.why_card_exists)),
    detected_address: cleanText(card && (card.display_address || card.address_or_source_text || card.address)),
    source_domain: sourceDomain(resolvedUrl || originalUrl),
    blocker_type: blockerType,
    blocker_reason: blockerReasonForCard(card),
    recommended_manual_action: recommendedActionFor(blockerType),
    candidate_text: cleanText(card && (card.address_or_source_text || card.display_address || card.source_title)),
    source_urls: []
      .concat(originalUrl ? [normalizeUrl(originalUrl)] : [])
      .concat(resolvedUrl && resolvedUrl !== originalUrl ? [normalizeUrl(resolvedUrl)] : [])
      .concat(Array.isArray(card && card.provider_source_urls) ? card.provider_source_urls.map(normalizeUrl) : [])
      .filter(Boolean)
      .filter((url, index, list) => list.indexOf(url) === index)
      .slice(0, 10),
    source_classification: cleanText(card && card.source_classification),
    source_quality: cleanText(card && card.source_quality),
    market_match: cleanText(card && card.market_match),
    status: 'open',
    linked_dossier_id: '',
    preview_only: true,
    should_ingest: false
  };
}

function shouldQueueScoutCard(card) {
  const status = cleanText(card && card.status);
  const text = [
    status,
    card && card.source_classification,
    card && card.source_quality,
    card && card.market_match,
    Array.isArray(card && card.missing_evidence) ? card.missing_evidence.join(' ') : ''
  ].map(cleanText).join(' ');
  return /Needs Source Proof|Needs Address Repair|Source\/Address Conflict|Support Signal Only|generic|search|homepage|category|Market mismatch|wrong market|captcha|paywall|login|rate.?limit/i.test(text);
}

function addRows(rows) {
  const incoming = (Array.isArray(rows) ? rows : []).filter((row) => row && cleanText(row.id));
  if (!incoming.length) return { added: 0, deduped: 0, queue: readQueue() };
  const queue = readQueue();
  const existing = new Map(queue.map((row, index) => [cleanText(row.id), index]));
  let added = 0;
  let deduped = 0;
  incoming.forEach((row) => {
    const safe = Object.assign({}, row, {
      updated_at: nowIso(),
      status: OPEN_STATUSES.has(cleanText(row.status)) ? cleanText(row.status) : 'open',
      preview_only: true,
      should_ingest: false
    });
    if (existing.has(safe.id)) {
      queue[existing.get(safe.id)] = Object.assign({}, queue[existing.get(safe.id)], safe, {
        created_at: queue[existing.get(safe.id)].created_at || safe.created_at
      });
      deduped += 1;
    } else {
      queue.unshift(safe);
      existing.set(safe.id, 0);
      added += 1;
    }
  });
  return { added, deduped, queue: writeQueue(queue) };
}

function addScoutBlockers(job, cards) {
  const rows = (Array.isArray(cards) ? cards : [])
    .filter(shouldQueueScoutCard)
    .map((card) => rowFromScoutCard(job, card));
  const result = addRows(rows);
  return {
    added: result.added,
    deduped: result.deduped,
    checked: Array.isArray(cards) ? cards.length : 0,
    queued: rows.length,
    queue_count: result.queue.length,
    rows
  };
}

function updateStatus(id, status, extras) {
  const safeStatus = cleanText(status);
  if (!OPEN_STATUSES.has(safeStatus)) {
    const err = new Error('Unsupported manual review status.');
    err.status = 400;
    throw err;
  }
  const queue = readQueue();
  const idx = queue.findIndex((row) => cleanText(row.id) === cleanText(id));
  if (idx < 0) {
    const err = new Error('Manual review row not found.');
    err.status = 404;
    throw err;
  }
  queue[idx] = Object.assign({}, queue[idx], extras || {}, {
    status: safeStatus,
    updated_at: nowIso()
  });
  return writeQueue(queue).find((row) => cleanText(row.id) === cleanText(id));
}

function summary(queue) {
  const rows = Array.isArray(queue) ? queue : readQueue();
  return {
    count: rows.length,
    open: rows.filter((row) => row.status === 'open').length,
    needs_source_proof: rows.filter((row) => row.blocker_type === 'needs_source_proof' || row.blocker_type === 'generic_search_source').length,
    needs_address_repair: rows.filter((row) => row.blocker_type === 'needs_address_repair').length,
    wrong_market: rows.filter((row) => row.blocker_type === 'wrong_market').length,
    access_blocked: rows.filter((row) => row.blocker_type === 'access_blocked').length
  };
}

module.exports = {
  readQueue,
  addRows,
  addScoutBlockers,
  updateStatus,
  summary,
  rowFromScoutCard,
  shouldQueueScoutCard
};
