'use strict';

const MONTHS = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function validIso(year, month, day) {
  if (year < 1 || year > 9999) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : '';
}

function parsed(iso, format) {
  return { iso, format_matched: format, confidence: 1, reason: '' };
}

function rejected(reason, format = '') {
  return { iso: '', format_matched: format, confidence: 0, reason };
}

function normalizeSourceDate(value) {
  const text = cleanText(value);
  if (!text) return rejected('incomplete_date');

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const iso = validIso(Number(match[1]), Number(match[2]), Number(match[3]));
    return iso ? parsed(iso, 'YYYY-MM-DD') : rejected('unrecognised_format', 'YYYY-MM-DD');
  }
  if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(text)) return rejected('ambiguous_numeric_order');

  match = text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (match) {
    const iso = validIso(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2]));
    const hasComma = text.indexOf(',') !== -1;
    return iso ? parsed(iso, hasComma ? 'Month D, YYYY' : 'Month D YYYY') : rejected('unrecognised_format', hasComma ? 'Month D, YYYY' : 'Month D YYYY');
  }
  match = text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2}),\s*(\d{4})$/i);
  if (match) {
    const monthName = Object.keys(MONTHS).find((name) => name.startsWith(match[1].toLowerCase().replace('.', '')));
    const iso = validIso(Number(match[3]), MONTHS[monthName], Number(match[2]));
    return iso ? parsed(iso, 'Mon D, YYYY') : rejected('unrecognised_format', 'Mon D, YYYY');
  }
  match = text.match(/^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i);
  if (match) {
    const iso = validIso(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1]));
    return iso ? parsed(iso, 'D Month YYYY') : rejected('unrecognised_format', 'D Month YYYY');
  }

  if (/\b(?:first|second|third|fourth|last|next|this|tomorrow|yesterday|coming|upcoming|business day|weekday|weekend)\b/i.test(text) ||
      /\b(?:of|from now|ago|in \d+ days?)\b/i.test(text)) {
    return rejected('relative_date_requires_inference');
  }
  if (/^\d{4}$/.test(text) || /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(text) ||
      /\b(?:through|thru|to|until|between)\b|\s[-–—]\s/i.test(text) ||
      /^(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?$/i.test(text)) {
    return rejected('incomplete_date');
  }
  return rejected('unrecognised_format');
}

module.exports = { normalizeSourceDate };
