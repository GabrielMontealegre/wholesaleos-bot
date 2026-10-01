'use strict';

const { normalizeSourceDate } = require('./normalize-source-date');

const RESOLVER_VERSION = 1;
const CHAPTER_51_TRUSTEE_SALE_ADAPTERS = Object.freeze({
  tx_dallas_county_clerk_foreclosure_notices: Object.freeze({
    hosts: Object.freeze(['dallascounty.org', 'www.dallascounty.org', 'dallas.tx.publicsearch.us']),
    fields: Object.freeze(['sale_date', 'auction_date', 'sale_date_or_event_date', 'date_of_sale', 'trustee_sale_date', 'foreclosure_sale_date'])
  }),
  tx_ellis_county_foreclosure_notices: Object.freeze({
    hosts: Object.freeze(['co.ellis.tx.us', 'elliscountytx.gov', 'www.elliscountytx.gov']),
    fields: Object.freeze(['sale_date', 'auction_date', 'sale_date_or_event_date', 'date_of_sale', 'trustee_sale_date', 'foreclosure_sale_date'])
  })
});
const NAMED_DATE_RE = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi;
const SALE_LABEL_RE = /\b(?:sale date|date of sale|trustee sale date|foreclosure sale date)\s*[:#-]?\s*/gi;

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function iso(year, month, day) {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function validReadings(text) {
  const match = clean(text).match(/^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/);
  if (!match) return [];
  const first = Number(match[1]);
  const second = Number(match[3]);
  const year = Number(match[4]);
  return [...new Set([iso(year, first, second), iso(year, second, first)].filter(Boolean))];
}

function officialHost(adapterId, sourceUrl) {
  const adapter = CHAPTER_51_TRUSTEE_SALE_ADAPTERS[clean(adapterId)];
  if (!adapter) return false;
  try {
    const parsed = new URL(clean(sourceUrl));
    return parsed.protocol === 'https:' && adapter.hosts.includes(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

function labelledSaleValue(documentText, raw) {
  const text = clean(documentText);
  if (!text || !raw) return false;
  for (const match of text.matchAll(SALE_LABEL_RE)) {
    const following = text.slice(match.index + match[0].length, match.index + match[0].length + raw.length + 4);
    if (following.startsWith(raw) && !/\d/.test(following[raw.length] || '')) return true;
  }
  return false;
}

function namedSaleDates(documentText, indexSaleDateText) {
  const found = [];
  const doc = clean(documentText);
  for (const match of doc.matchAll(SALE_LABEL_RE)) {
    const following = doc.slice(match.index + match[0].length, match.index + match[0].length + 45);
    const named = following.match(new RegExp(`^(${NAMED_DATE_RE.source})`, 'i'));
    if (named) found.push({ iso: normalizeSourceDate(named[1]).iso, excerpt: `${match[0]}${named[1]}` });
  }
  const index = clean(indexSaleDateText);
  for (const match of index.matchAll(SALE_LABEL_RE)) {
    const following = index.slice(match.index + match[0].length, match.index + match[0].length + 45);
    const named = following.match(new RegExp(`^(${NAMED_DATE_RE.source})`, 'i'));
    if (named) found.push({ iso: normalizeSourceDate(named[1]).iso, excerpt: `${match[0]}${named[1]}` });
  }
  return found.filter((item) => item.iso);
}

function legalChapter51SaleDay(value) {
  const [year, month, day] = value.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstTuesday = 1 + (2 - first.getUTCDay() + 7) % 7;
  const exception = (month === 1 && firstTuesday === 1) || (month === 7 && firstTuesday === 4);
  return day === firstTuesday + (exception ? 1 : 0);
}

function resolveSourceSaleDate(input = {}) {
  const raw = clean(input.raw_text);
  const readings = validReadings(raw);
  const result = (status, reason, resolvedIso = '', ruleIds = [], excerpt = raw) => ({
    status, resolved_iso: resolvedIso, rule_ids: ruleIds, reason,
    evidence_excerpt: clean(excerpt).slice(0, 180), valid_readings_iso: readings
  });
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2}$/.test(raw)) return result('AMBIGUOUS', 'two_digit_year');
  if (!/^\d{1,2}([/-])\d{1,2}\1\d{4}$/.test(raw)) return result('INVALID', 'not_supported_numeric_date');
  if (!readings.length) return result('INVALID', 'invalid_calendar_date');

  const conclusions = [];
  if (readings.length === 1) conclusions.push({ iso: readings[0], rule: 'single_valid_reading', excerpt: raw });
  const named = namedSaleDates(input.document_text, input.index_sale_date_text);
  const distinctNamed = [...new Set(named.map((item) => item.iso))];
  if (distinctNamed.length > 1) return result('AMBIGUOUS', 'conflicting_named_dates', '', [], named.map((item) => item.excerpt).join(' | '));
  if (distinctNamed.length === 1) conclusions.push({ iso: distinctNamed[0], rule: 'same_source_named_date', excerpt: named[0].excerpt });

  const adapter = CHAPTER_51_TRUSTEE_SALE_ADAPTERS[clean(input.source_adapter_id)];
  if (adapter && officialHost(input.source_adapter_id, input.source_url) &&
      adapter.fields.includes(clean(input.raw_field)) && labelledSaleValue(input.document_text, raw) && readings.length === 2) {
    const monthFirst = iso(Number(raw.slice(-4)), Number(raw.split(/[/-]/)[0]), Number(raw.split(/[/-]/)[1]));
    const dayFirst = readings.find((value) => value !== monthFirst);
    const monthLegal = legalChapter51SaleDay(monthFirst);
    const dayLegal = legalChapter51SaleDay(dayFirst);
    if (monthLegal && !dayLegal) conclusions.push({ iso: monthFirst, rule: 'tx_prop_code_51_002_sale_day', excerpt: `Sale Date: ${raw}` });
    else if (dayLegal && !monthLegal) return result('AMBIGUOUS', 'only_day_first_is_sale_day');
  }
  if (conclusions.some((item) => !readings.includes(item.iso)) || new Set(conclusions.map((item) => item.iso)).size > 1) {
    return result('AMBIGUOUS', 'rule_conflict', '', [], conclusions.map((item) => item.excerpt).join(' | '));
  }
  if (!conclusions.length) return result('AMBIGUOUS', 'date_order_unproven');
  return result('RESOLVED', '', conclusions[0].iso, conclusions.map((item) => item.rule), conclusions.map((item) => item.excerpt).join(' | '));
}

function saleDateStaleness(value, referenceDate, proof = {}) {
  const raw = clean(value);
  const ref = normalizeSourceDate(clean(referenceDate instanceof Date ? referenceDate.toISOString().slice(0, 10) : referenceDate).slice(0, 10));
  const native = normalizeSourceDate(raw);
  if (native.iso) return { stale: !!ref.iso && native.iso < ref.iso, stale_basis: native.iso < ref.iso ? 'resolved_date_past' : '', invalid_sale_date: false, resolution: null };
  const resolution = resolveSourceSaleDate(Object.assign({}, proof, { raw_text: raw }));
  if (resolution.status === 'RESOLVED') return { stale: !!ref.iso && resolution.resolved_iso < ref.iso, stale_basis: resolution.resolved_iso < ref.iso ? 'resolved_date_past' : '', invalid_sale_date: false, resolution };
  const stale = !!ref.iso && resolution.valid_readings_iso.length > 0 && resolution.valid_readings_iso.every((date) => date < ref.iso);
  return { stale, stale_basis: stale ? 'all_readings_past' : '', invalid_sale_date: resolution.status === 'INVALID', resolution };
}

module.exports = { RESOLVER_VERSION, CHAPTER_51_TRUSTEE_SALE_ADAPTERS, resolveSourceSaleDate, saleDateStaleness, validReadings };
