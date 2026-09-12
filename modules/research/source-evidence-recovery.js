'use strict';

const distressEvidenceModel = require('./distress-evidence-model');
const leadLifecycleStatus = require('./lead-lifecycle-status');

const EVIDENCE_FIELDS = Object.freeze([
  'source_proof_text',
  'motivation_evidence_text',
  'status_evidence_text'
]);

const MONTHS = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
});

const DATE_TEXT = '(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\/\\d{1,2}\\/\\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4})';
const DATE_RULES = Object.freeze([
  { field: 'sale_date_or_event_date', pattern: new RegExp(`\\b(?:sale|auction|event)\\s+date\\s*(?:is|:|-|of|on)?\\s*(${DATE_TEXT})`, 'i') },
  { field: 'notice_date', pattern: new RegExp(`\\bnotice\\s+date\\s*(?:is|:|-|of|on)?\\s*(${DATE_TEXT})`, 'i') },
  { field: 'filing_date', pattern: new RegExp(`\\b(?:filing\\s+date\\s*(?:is|:|-|of|on)?|filed\\s+on)\\s*(${DATE_TEXT})`, 'i') },
  { field: 'source_published_at', pattern: new RegExp(`\\b(?:posting\\s+date\\s*(?:is|:|-|of|on)?|posted\\s+on|publication\\s+date\\s*(?:is|:|-|of|on)?|published\\s+on)\\s*(${DATE_TEXT})`, 'i') }
]);

const MONEY_RE = /\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?/g;
const NON_DEBT_LABELS = Object.freeze([
  ['minimum_bid', /\bminimum\s+bid\s*(?:is|:|-|of)?\s*$/i],
  ['opening_bid', /\bopening\s+bid\s*(?:is|:|-|of)?\s*$/i],
  ['assessed_value', /\b(?:assessed|appraised)\s+value\s*(?:is|:|-|of)?\s*$/i],
  ['public_estimate', /\b(?:public\s+estimate|estimated\s+value)\s*(?:is|:|-|of)?\s*$/i],
  ['listing_price', /\b(?:listing|asking)\s+price\s*(?:is|:|-|of)?\s*$/i]
]);

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function validIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateToIso(value) {
  const text = cleanText(value);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return validIsoDate(Number(match[3]), Number(match[1]), Number(match[2]));
  match = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!match) return '';
  const month = MONTHS[match[1].toLowerCase()];
  return month ? validIsoDate(Number(match[3]), month, Number(match[2])) : '';
}

function evidenceSegments(row) {
  const output = [];
  for (const field of EVIDENCE_FIELDS) {
    const text = String(row && row[field] == null ? '' : row[field]).trim();
    if (!text) continue;
    text.split(/\r?\n|\s+\|\s+|(?<=[.;])\s+/).map(cleanText).filter(Boolean).forEach((phrase) => {
      output.push({ evidence_field: field, evidence_text: phrase.slice(0, 500) });
    });
  }
  return output;
}

function recoverDates(row, segments) {
  const recovered = [];
  for (const segment of segments) {
    for (const rule of DATE_RULES) {
      if (cleanText(row && row[rule.field])) continue;
      const match = segment.evidence_text.match(rule.pattern);
      const iso = match && dateToIso(match[1]);
      if (!iso) continue;
      row[rule.field] = iso;
      recovered.push({
        field: rule.field,
        value: iso,
        evidence_field: segment.evidence_field,
        evidence_text: segment.evidence_text
      });
    }
  }
  return recovered;
}

function debtTypeForPrefix(prefix) {
  const matches = Object.entries(distressEvidenceModel.DEFINITIONS)
    .filter(([, definition]) => definition.semantic_role === 'debt' && definition.debt_pattern)
    .filter(([, definition]) => definition.debt_pattern.test(prefix))
    .map(([type]) => type);
  return matches.length === 1 ? matches[0] : '';
}

function amountTypeForPrefix(prefix) {
  const nonDebt = NON_DEBT_LABELS.filter(([, pattern]) => pattern.test(prefix)).map(([type]) => type);
  const debt = debtTypeForPrefix(prefix);
  const matches = nonDebt.concat(debt ? [debt] : []);
  return matches.length === 1 ? matches[0] : 'unknown_source_amount';
}

function rootField(definition, fallback) {
  return (definition.fields || []).find((field) => !field.includes('.')) || fallback;
}

function factForAmount(baseRow, type, amount, evidenceText) {
  const definition = distressEvidenceModel.DEFINITIONS[type];
  const candidate = Object.assign({}, baseRow);
  delete candidate.distress_evidence;
  const field = rootField(definition, type);
  const evidenceField = (definition.evidence_fields || []).find((name) => !name.includes('.')) || `${type}_evidence_text`;
  candidate[field] = amount;
  candidate[evidenceField] = evidenceText;
  return distressEvidenceModel.moneyFactsForRow(candidate)
    .find((fact) => fact.amount_type === type && fact.exact_amount === amount) || null;
}

function recoverMoney(row, segments, existingFacts) {
  const recovered = [];
  const existingAmounts = new Set((existingFacts || [])
    .filter((fact) => fact && fact.exact_amount !== distressEvidenceModel.MISSING_AMOUNT_TEXT)
    .map((fact) => cleanText(fact.exact_amount || fact.amount))
    .filter(Boolean));
  for (const segment of segments) {
    const matches = Array.from(segment.evidence_text.matchAll(MONEY_RE));
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const previousEnd = index ? matches[index - 1].index + matches[index - 1][0].length : 0;
      const nextStart = index + 1 < matches.length ? matches[index + 1].index : segment.evidence_text.length;
      const prefix = segment.evidence_text.slice(previousEnd, match.index);
      const evidenceText = cleanText(segment.evidence_text.slice(previousEnd, nextStart));
      const type = amountTypeForPrefix(prefix);
      const amount = cleanText(match[0]);
      if (existingAmounts.has(amount)) continue;
      const fact = factForAmount(row, type, amount, evidenceText);
      if (!fact) continue;
      const definition = distressEvidenceModel.DEFINITIONS[type];
      const field = rootField(definition, type);
      const evidenceField = (definition.evidence_fields || [])[0] || `${type}_evidence_text`;
      if (!cleanText(row[field])) {
        row[field] = amount;
        row[evidenceField] = evidenceText;
      }
      recovered.push(Object.assign({}, fact, {
        recovered_from_field: segment.evidence_field,
        recovered_phrase: evidenceText
      }));
    }
  }
  const typedAmounts = new Set(recovered.filter((fact) => fact.amount_type !== 'unknown_source_amount').map((fact) => fact.exact_amount));
  const seen = new Set();
  return recovered.filter((fact) => {
    if (fact.amount_type === 'unknown_source_amount' && typedAmounts.has(fact.exact_amount)) return false;
    const key = `${fact.amount_type}|${fact.exact_amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeMoneyFacts(existing, recovered) {
  const facts = [];
  const seen = new Set();
  for (const fact of [].concat(existing || [], recovered || [])) {
    if (!fact || fact.exact_amount === distressEvidenceModel.MISSING_AMOUNT_TEXT) continue;
    const key = `${cleanText(fact.amount_type)}|${cleanText(fact.exact_amount || fact.amount)}|${cleanText(fact.evidence_text)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
  }
  return facts;
}

function recoverRow(input, options = {}) {
  const row = JSON.parse(JSON.stringify(input || {}));
  const nowIso = cleanText(options.now_iso) || new Date().toISOString();
  const lifecycleBefore = leadLifecycleStatus.computeLifecycleStatus(row, nowIso);
  const existingFacts = row.distress_evidence && Array.isArray(row.distress_evidence.money_facts)
    ? row.distress_evidence.money_facts
    : distressEvidenceModel.moneyFactsForRow(row);
  const segments = evidenceSegments(row);
  const recoveredDates = recoverDates(row, segments);
  const recoveredMoneyFacts = recoverMoney(row, segments, existingFacts);
  const mergedFacts = mergeMoneyFacts(existingFacts, recoveredMoneyFacts);
  row.distress_evidence = distressEvidenceModel.buildDistressEvidence(Object.assign({}, row, {
    distress_evidence: mergedFacts.length ? { money_facts: mergedFacts } : null
  }));
  row.lifecycle_status = leadLifecycleStatus.computeLifecycleStatus(row, nowIso);
  row.source_evidence_recovery = {
    mode: 'stored_text_only_no_network',
    recovered_dates: recoveredDates,
    recovered_money_fact_count: recoveredMoneyFacts.length,
    recovered_money_types: Array.from(new Set(recoveredMoneyFacts.map((fact) => fact.amount_type))),
    lifecycle_before: lifecycleBefore.status,
    lifecycle_after: row.lifecycle_status.status
  };
  return {
    row,
    recovered_dates: recoveredDates,
    recovered_money_facts: recoveredMoneyFacts,
    lifecycle_before: lifecycleBefore,
    lifecycle_after: row.lifecycle_status
  };
}

function recoverRows(rows, options) {
  return (Array.isArray(rows) ? rows : []).map((row) => recoverRow(row, options));
}

module.exports = {
  EVIDENCE_FIELDS,
  dateToIso,
  evidenceSegments,
  recoverRow,
  recoverRows
};
