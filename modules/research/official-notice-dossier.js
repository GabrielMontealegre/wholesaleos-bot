'use strict';

const crypto = require('crypto');
const https = require('https');
const cheerio = require('cheerio');
const { launchChromiumWithResolvedBrowser } = require('./playwright-browser-resolver');
const ocr = require('./ocr-notice-extraction');

const OFFICIAL_HOSTS = new Set(['co.ellis.tx.us', 'www.co.ellis.tx.us', 'elliscountytx.gov', 'www.elliscountytx.gov']);
const FIELD_NAMES = Object.freeze([
  'sale_date', 'sale_time', 'sale_location', 'county', 'trustee_or_substitute_trustee',
  'mortgagee_or_beneficiary', 'mortgage_servicer', 'deed_of_trust_date',
  'deed_of_trust_instrument_or_volume_page', 'original_principal_amount',
  'property_legal_description', 'notice_publication_date'
]);
const LOW_CONFIDENCE_THRESHOLD = 45;
const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
const CURRENT_PAYOFF_TEXT = 'Not published. Only the loan servicer can state the current payoff.';
const SHARED_REQUEST_BUDGET = { times: [], tail: Promise.resolve(), stopped: false };

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function officialUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !OFFICIAL_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) return '';
    return url.href;
  } catch (_) { return ''; }
}

function dateIso(value) {
  const text = clean(value);
  const match = /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2}),?\s+(20\d{2})\b/i.exec(text);
  if (!match) return '';
  const month = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'].indexOf(match[1].toUpperCase()) + 1;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
}

function subjectStreet(value) {
  const street = clean(value).split(',')[0].toUpperCase();
  return /^\d{1,6}(?:\s+[A-Z0-9]+){1,6}\s+(?:ST|STREET|DR|DRIVE|AVE|AVENUE|RD|ROAD|BLVD|BOULEVARD|LN|LANE|CT|COURT)$/.test(street)
    ? street : '';
}

function matchesSubject(pages, address) {
  const street = subjectStreet(address);
  if (!street) return false;
  const variants = [street, street.replace(/\bDRIVE\b/, 'DR').replace(/\bSTREET\b/, 'ST').replace(/\bROAD\b/, 'RD').replace(/\bAVENUE\b/, 'AVE')];
  const text = pages.map((page) => clean(page.text).toUpperCase()).join(' ');
  return variants.some((variant) => text.includes(variant));
}

function textLines(page) {
  if (!Array.isArray(page.lines)) return [];
  const segments = [];
  for (const line of page.lines) {
    const words = Array.isArray(line.words) ? line.words.filter((word) => clean(word.text) && word.bbox).sort((a, b) => a.bbox.x0 - b.bbox.x0) : [];
    if (!words.length) {
      if (clean(line.text)) segments.push({ text: clean(line.text), confidence: Number(line.confidence || page.confidence || 0), bbox: line.bbox || null });
      continue;
    }
    let group = [];
    function flush() {
      if (!group.length) return;
      segments.push({ text: group.map((word) => clean(word.text)).join(' '),
        confidence: Math.round(group.reduce((sum, word) => sum + Number(word.confidence || 0), 0) / group.length),
        bbox: { x0: Math.min(...group.map((word) => word.bbox.x0)), y0: Math.min(...group.map((word) => word.bbox.y0)),
          x1: Math.max(...group.map((word) => word.bbox.x1)), y1: Math.max(...group.map((word) => word.bbox.y1)) } });
      group = [];
    }
    for (const word of words) {
      if (group.length && word.bbox.x0 - group[group.length - 1].bbox.x1 > 100) flush();
      group.push(word);
    }
    flush();
  }
  return segments.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
}

function valueAfterLabel(lines, label, options = {}) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = label.exec(line.text);
    if (!match) continue;
    let value = clean(line.text.slice(match.index + match[0].length));
    if (options.cut_at_other_label) value = clean(value.split(/\b(?:Property address|Date of Sale|Earliest Time Sale Will Begin|Original Trustee|Substitute Trustee|Mortgage Servicer|Current Mortgagee)\s*:/i)[0]);
    if (!value && options.next_line && line.bbox) {
      const next = lines.slice(index + 1).find((candidate) => candidate.bbox &&
        Math.abs(candidate.bbox.x0 - line.bbox.x0) < 130 &&
        candidate.bbox.y0 > line.bbox.y0 && candidate.bbox.y0 - line.bbox.y0 < 110);
      if (next) return { value: next.text, line: next };
    }
    if (value) return { value, line };
  }
  return null;
}

function parsePage(page) {
  const lines = textLines(page);
  const rules = [
    ['sale_date', /\bDate of Sale\s*:/i, { date: true }],
    ['sale_time', /\bEarliest Time Sale Will Begin\s*:/i, { pattern: /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i }],
    ['sale_location', /\b(?:Place of Sale|Sale Location)\s*:/i, {}],
    ['county', /\bProperty County\s*:/i, { pattern: /\bELLIS\b/i }],
    ['trustee_or_substitute_trustee', /\b(?:Original Trustee|Substitute Trustee)\s*:/i, { cut_at_other_label: true, next_line: true }],
    ['mortgagee_or_beneficiary', /\bCurrent Mortgagee\s*:/i, { cut_at_other_label: true, next_line: true }],
    ['mortgage_servicer', /\bMortgage Servicer\s*:/i, { cut_at_other_label: true, next_line: true }],
    ['deed_of_trust_date', /\bDeed of Trust Date\s*:/i, { date: true, next_line: true, cut_at_other_label: true }],
    ['deed_of_trust_instrument_or_volume_page', /\b(?:As Clerk[’']?s File No\.|Instrument No\.|Volume\s*\/\s*Page)\s*:/i, { pattern: /\b\d{5,12}\b/ }],
    ['original_principal_amount', /\b(?:Original Principal Amount|Original Note Amount|Original Loan Amount)\s*:/i, { pattern: /\$\s*[\d,]+(?:\.\d{2})?/ }],
    ['property_legal_description', /\bLEGAL DESCRIPTION\s*:/i, {}],
    ['notice_publication_date', /\b(?:Notice Publication Date|Date of Publication)\s*:/i, { date: true }]
  ];
  const found = [];
  for (const [field, label, options] of rules) {
    const result = valueAfterLabel(lines, label, options);
    if (!result || !result.line.bbox) continue;
    let value = options.date ? dateIso(result.value) : result.value;
    if (options.pattern) {
      const match = options.pattern.exec(value);
      value = match ? clean(match[0]) : '';
    }
    if (!value || /^(?:unknown|not available|n\/?a)$/i.test(value)) continue;
    if (field === 'property_legal_description' && !/[.;]$/.test(value)) continue;
    if (['trustee_or_substitute_trustee', 'mortgagee_or_beneficiary', 'mortgage_servicer'].includes(field) && !/[A-Za-z]{3}/.test(value)) continue;
    found.push({ field, value, source_line: result.line.text, confidence: Math.round(result.line.confidence), bbox: result.line.bbox });
  }
  for (const line of lines) {
    if (!line.bbox || !/\$\s*[\d,]+(?:\.\d{2})?/.test(line.text)) continue;
    const typed = [
      ['judgment_amount', /\bjudgment\s*(?:amount|of)?\s*:/i],
      ['minimum_bid', /\bminimum\s*bid\s*:/i],
      ['tax_due', /\btax(?:es)?\s*due\s*:/i],
      ['lien_amount', /\blien\s*amount\s*:/i]
    ].find((entry) => entry[1].test(line.text));
    const amount = /\$\s*[\d,]+(?:\.\d{2})?/.exec(line.text);
    if (amount && !/\b(?:Original Principal Amount|Original Note Amount|Original Loan Amount)\b/i.test(line.text)) {
      found.push({ field: 'stated_amounts_on_notice', amount_type: typed ? typed[0] : 'unknown_source_amount',
        value: clean(amount[0]), source_line: line.text, confidence: Math.round(line.confidence), bbox: line.bbox });
    }
  }
  return found;
}

function extractNoticeProposals(input) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const documentUrl = officialUrl(input.document_url);
  if (!documentUrl) throw new Error('official_notice_url_required');
  if (!matchesSubject(pages, input.subject_address)) return { matched_subject: false, proposals: [] };
  const proposals = [];
  const seen = new Set();
  for (const [index, page] of pages.entries()) {
    if (!matchesSubject([page], input.subject_address)) continue;
    for (const entry of parsePage(page)) {
      const key = `${entry.field}|${entry.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      proposals.push({ id: crypto.randomUUID(), field: entry.field, value: entry.value,
        amount_type: entry.amount_type || null, source_line: entry.source_line,
        confidence: entry.confidence, confidence_status: entry.confidence < LOW_CONFIDENCE_THRESHOLD ? 'LOW_CONFIDENCE' : 'OCR_PROPOSAL',
        page_number: index + 1, crop_bbox: entry.bbox, crop_ref: null,
        document_url: documentUrl, confirmed: false, proposed_at: input.proposed_at || new Date().toISOString() });
    }
  }
  return { matched_subject: true, proposals };
}

async function cropRegions(png, boxes, options = {}) {
  if (typeof options.crop_impl === 'function') return options.crop_impl(png, boxes);
  const playwright = options.playwright_impl || require('playwright');
  const launched = await launchChromiumWithResolvedBrowser(playwright, { headless: true }, options);
  try {
    const page = await (await launched.browser.newContext()).newPage();
    await page.setContent('<html><body></body></html>');
    const urls = await page.evaluate(async ({ imageBase64, boxes }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${imageBase64}`;
      await image.decode();
      return boxes.map((box) => {
        const x = Math.max(0, Math.floor(box.x0) - 12);
        const y = Math.max(0, Math.floor(box.y0) - 12);
        const width = Math.min(image.width - x, Math.ceil(box.x1 - box.x0) + 24);
        const height = Math.min(image.height - y, Math.ceil(box.y1 - box.y0) + 24);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
        return canvas.toDataURL('image/png');
      });
    }, { imageBase64: png.toString('base64'), boxes });
    return urls.map((url) => Buffer.from(url.split(',')[1], 'base64'));
  } finally { await launched.browser.close().catch(() => {}); }
}

async function scanPdf(input, options = {}) {
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length > MAX_DOCUMENT_BYTES || input.buffer.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('official_notice_pdf_missing_invalid_or_oversize');
  }
  const caps = Object.assign({}, ocr.DEFAULT_CAPS, { max_pages_per_doc: 3 });
  const pngs = await ocr.renderPdfPagesToPngs(input.buffer, caps, options);
  const pages = [];
  for (const png of pngs) pages.push(await ocr.ocrPngToText(png, options));
  const result = extractNoticeProposals(Object.assign({}, input, { pages }));
  const crops = [];
  for (const [index, png] of pngs.entries()) {
    const proposed = result.proposals.filter((proposal) => proposal.page_number === index + 1);
    if (!proposed.length) continue;
    const buffers = await cropRegions(png, proposed.map((proposal) => proposal.crop_bbox), options);
    proposed.forEach((proposal, position) => crops.push({ id: proposal.id, png: buffers[position] }));
  }
  return Object.assign(result, { crops, page_confidences: pages.map((page) => page.confidence) });
}

function confirmField(proposal, input) {
  if (!proposal || !FIELD_NAMES.includes(proposal.field) && proposal.field !== 'stated_amounts_on_notice') throw new Error('notice_proposal_not_found');
  if (!clean(input.operator_id) || !/^\d{4}-\d\d-\d\dT/.test(clean(input.confirmed_at))) throw new Error('notice_confirmation_identity_and_time_required');
  if (!clean(proposal.crop_ref) || input.crop_available !== true) throw new Error('notice_crop_required_before_confirmation');
  if (proposal.confidence_status === 'LOW_CONFIDENCE' && input.crop_viewed !== true) throw new Error('notice_low_confidence_crop_review_required');
  if (proposal.confirmed) throw new Error('notice_proposal_already_confirmed');
  return Object.assign({}, proposal, { confirmed: true, confirmed_by: clean(input.operator_id), confirmed_at: clean(input.confirmed_at) });
}

function saleAssessment(row, siblings = [], input = {}) {
  const confirmed = Array.isArray(row.notice_confirmations) ? row.notice_confirmations : [];
  const sale = confirmed.find((item) => item.field === 'sale_date' && item.confirmed === true && dateIso(item.source_line) === item.value);
  const today = clean(input.today || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const sameIdentity = siblings.filter((item) => item !== row && clean(item.property_identity_key) && clean(item.property_identity_key) === clean(row.property_identity_key));
  const newer = sale && sameIdentity.some((item) => (item.notice_confirmations || []).some((candidate) =>
    candidate.confirmed === true && candidate.field === 'sale_date' && candidate.value > sale.value));
  if (newer) return { sale_status: 'SUPERSEDED_BY_NEWER_NOTICE', days_until_sale: null };
  if (input.archive_contains_document === false) return { sale_status: 'NOT_FOUND_IN_CURRENT_ARCHIVE', days_until_sale: null,
    clue: 'This document is absent from the current archive listing. This does not prove cancellation or postponement.' };
  if (!sale) return { sale_status: 'UNKNOWN', days_until_sale: null };
  const days = Math.round((Date.parse(`${sale.value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return days >= 0 ? { sale_status: 'SCHEDULED', days_until_sale: days } : { sale_status: 'DATE_PASSED', days_until_sale: null };
}

function createOfficialClient(options = {}) {
  const budget = options.budget_impl || SHARED_REQUEST_BUDGET;
  const events = [];
  let stopped = false;
  const now = options.now_impl || Date.now;
  const sleep = options.sleep_impl || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const requestImpl = options.request_impl || ((url) => new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'WholesaleOS official-notice-review/1' }, timeout: 20000 }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => { size += chunk.length; if (size > MAX_DOCUMENT_BYTES) req.destroy(new Error('official_notice_response_oversize')); else chunks.push(chunk); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('official_notice_timeout')));
  }));
  async function get(url) {
    if (stopped) throw new Error('official_notice_run_stopped_after_block');
    let target = officialUrl(url);
    if (!target) throw new Error('official_notice_host_not_allowed');
    for (let redirect = 0; redirect < 5; redirect += 1) {
      const request = budget.tail.catch(() => {}).then(async () => {
        if (budget.stopped) throw new Error('official_notice_run_stopped_after_block');
        const earliest = budget.times.length ? budget.times[budget.times.length - 1] + 3000 : 0;
        if (now() < earliest) await sleep(earliest - now());
        budget.times = budget.times.filter((at) => at > now() - 3600000);
        if (budget.times.length >= 60) {
          stopped = true;
          events.push({ type: 'blocked', reason: 'official_notice_hourly_limit' });
          throw new Error('official_notice_hourly_limit');
        }
        budget.times.push(now());
        const response = await requestImpl(target);
        if (response.status === 403 || response.status === 429) {
          stopped = true;
          budget.stopped = true;
          events.push({ type: 'blocked', reason: `official_notice_blocked_${response.status}` });
          throw new Error(`official_notice_blocked_${response.status}`);
        }
        if (/text\/html/i.test(clean(response.headers && response.headers['content-type'])) &&
            /(?:verify you are human|captcha|access denied|rate limit exceeded)/i.test(response.body.toString('utf8').slice(0, 20000))) {
          stopped = true;
          budget.stopped = true;
          events.push({ type: 'blocked', reason: 'official_notice_access_blocked' });
          throw new Error('official_notice_access_blocked');
        }
        return response;
      });
      budget.tail = request;
      const response = await request;
      if (response.status >= 300 && response.status < 400 && response.headers && response.headers.location) {
        const next = new URL(response.headers.location, target);
        if (next.protocol === 'http:' && OFFICIAL_HOSTS.has(next.hostname.toLowerCase())) next.protocol = 'https:';
        target = officialUrl(next.href);
        if (!target) throw new Error('official_notice_redirect_host_not_allowed');
        continue;
      }
      if (response.status !== 200) throw new Error(`official_notice_http_${response.status}`);
      return Object.assign({}, response, { url: target });
    }
    throw new Error('official_notice_too_many_redirects');
  }
  return { get, events };
}

function archiveContainsDocument(html, documentUrl) {
  const id = /(?:[?&]ADID=|\/Item\/)(\d+)\b/i.exec(clean(documentUrl));
  if (!id) return null;
  const links = archiveDocumentLinks(html);
  if (!links.length) return null;
  return links.some((item) => new RegExp(`(?:[?&]ADID=|/Item/)${id[1]}\\b`, 'i').test(item.url));
}

function archiveDocumentLinks(html) {
  const $ = cheerio.load(String(html || ''));
  const links = [];
  $('a[href]').each((_, anchor) => {
    const href = $(anchor).attr('href');
    if (!/(?:[?&]ADID=|\/Item\/)\d+\b/i.test(href || '')) return;
    let url = '';
    try { url = officialUrl(new URL(href, 'https://www.co.ellis.tx.us/').href); } catch (_) { /* invalid link */ }
    if (url) links.push({ url, date: dateIso($(anchor).text()) });
  });
  return links;
}

function archiveDocumentForDate(html, date) {
  if (!/^20\d\d-\d\d-\d\d$/.test(clean(date))) return '';
  const matches = archiveDocumentLinks(html).filter((item) => item.date === date);
  return matches.length === 1 ? matches[0].url : '';
}

module.exports = {
  CURRENT_PAYOFF_TEXT, FIELD_NAMES, LOW_CONFIDENCE_THRESHOLD,
  officialUrl, dateIso, extractNoticeProposals, scanPdf, confirmField,
  saleAssessment, createOfficialClient, archiveContainsDocument, archiveDocumentForDate
};
