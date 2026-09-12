'use strict';

const AMOUNT_TYPES = Object.freeze([
  'tax_due',
  'mortgage_arrears',
  'lien_amount',
  'judgment_amount',
  'redemption_amount',
  'minimum_bid',
  'opening_bid',
  'assessed_value',
  'public_estimate',
  'listing_price',
  'unknown_source_amount'
]);

const BID_MEANING = 'Auction starting amount; not confirmed total debt, payoff, ARV, or offer price.';
const PUBLIC_ESTIMATE_MEANING = 'Public estimate - not ARV.';
const MISSING_AMOUNT_TEXT = 'Not published in source';

const DEFINITIONS = Object.freeze({
  tax_due: {
    semantic_role: 'debt',
    operator_label: 'Tax due',
    plain_english_meaning: 'Tax amount the official source explicitly states is due.',
    fields: ['tax_due', 'tax_amount', 'source_details.tax_due'],
    evidence_fields: ['tax_due_evidence_text', 'tax_amount_evidence_text'],
    debt_pattern: /\b(?:tax(?:es)?\s+(?:due|owed|delinquent)|delinquent\s+tax(?:es)?|amount\s+due\s+for\s+tax(?:es)?)\b/i
  },
  mortgage_arrears: {
    semantic_role: 'debt',
    operator_label: 'Mortgage arrears',
    plain_english_meaning: 'Mortgage amount the official source explicitly states is past due or in arrears.',
    fields: ['mortgage_arrears'],
    evidence_fields: ['mortgage_arrears_evidence_text'],
    debt_pattern: /\b(?:mortgage\s+(?:arrears|amount\s+due|past\s+due)|past\s+due\s+mortgage|loan\s+arrears)\b/i
  },
  lien_amount: {
    semantic_role: 'debt',
    operator_label: 'Lien amount',
    plain_english_meaning: 'Lien amount or balance explicitly stated by the official source.',
    fields: ['lien_amount', 'tax_lien_amount'],
    evidence_fields: ['lien_amount_evidence_text', 'tax_lien_amount_evidence_text'],
    debt_pattern: /\b(?:lien\s+(?:amount|balance|due)|amount\s+of\s+(?:the\s+)?lien|tax\s+lien)\b/i
  },
  judgment_amount: {
    semantic_role: 'debt',
    operator_label: 'Judgment amount',
    plain_english_meaning: 'Judgment amount explicitly stated by the official source.',
    fields: ['judgment_amount'],
    evidence_fields: ['judgment_amount_evidence_text'],
    debt_pattern: /\b(?:judgment\s+(?:amount|balance|due)|judgment\s+in\s+the\s+amount\s+of|amount\s+of\s+(?:the\s+)?judgment)\b/i
  },
  redemption_amount: {
    semantic_role: 'debt',
    operator_label: 'Redemption amount',
    plain_english_meaning: 'Amount the official source explicitly states is required to redeem or pay off the stated obligation.',
    fields: ['redemption_amount', 'delinquent_redemption_amount'],
    evidence_fields: ['redemption_amount_evidence_text', 'delinquent_redemption_amount_evidence_text'],
    debt_pattern: /\b(?:redemption\s+(?:amount|balance|due)|amount\s+(?:required\s+)?to\s+redeem|payoff\s+amount)\b/i
  },
  minimum_bid: {
    semantic_role: 'bid',
    operator_label: 'Minimum bid',
    plain_english_meaning: BID_MEANING,
    fields: ['minimum_bid', 'minimum_bid_amount'],
    evidence_fields: ['minimum_bid_evidence_text']
  },
  opening_bid: {
    semantic_role: 'bid',
    operator_label: 'Opening bid',
    plain_english_meaning: BID_MEANING,
    fields: ['opening_bid'],
    evidence_fields: ['opening_bid_evidence_text']
  },
  assessed_value: {
    semantic_role: 'value_context',
    operator_label: 'Assessed value',
    plain_english_meaning: 'Public assessment value context - not debt, ARV, or an offer price.',
    fields: ['assessed_value', 'appraised_value', 'property_story.assessed_value'],
    evidence_fields: ['assessed_value_evidence_text', 'appraised_value_evidence_text']
  },
  public_estimate: {
    semantic_role: 'value_context',
    operator_label: 'Public estimate',
    plain_english_meaning: PUBLIC_ESTIMATE_MEANING,
    fields: ['public_estimate', 'estimated_value', 'property_story.public_estimate'],
    evidence_fields: ['public_estimate_evidence_text', 'estimated_value_evidence_text']
  },
  listing_price: {
    semantic_role: 'value_context',
    operator_label: 'Listing price',
    plain_english_meaning: 'Published listing price context - not debt or ARV.',
    fields: ['listing_price', 'listed_price', 'property_story.listing_price'],
    evidence_fields: ['listing_price_evidence_text', 'listed_price_evidence_text']
  },
  unknown_source_amount: {
    semantic_role: 'unknown',
    operator_label: 'Unknown source amount',
    plain_english_meaning: 'The source publishes this amount without enough evidence to classify what it means. Do not treat it as debt, value, ARV, or an offer price.',
    fields: ['unknown_source_amount', 'amount_or_judgment', 'source_amount', 'amount_owed', 'violation_amount', 'source_truth.amount', 'source_details.amount_owed', '_courthouse_metadata.lien_amount'],
    evidence_fields: ['unknown_source_amount_evidence_text', 'amount_or_judgment_evidence_text', 'source_amount_evidence_text']
  }
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function firstText(row, fields) {
  for (const field of fields || []) {
    const value = cleanText(String(field).split('.').reduce((current, part) => current == null ? undefined : current[part], row));
    if (value) return value;
  }
  return '';
}

function commonEvidence(row) {
  return [
    row && row.source_proof_text,
    row && row.source_text,
    row && row.source_excerpt,
    row && row.source_page_text,
    row && row.motivation_evidence_text
  ].map(cleanText).filter(Boolean).join(' | ');
}

function officialSourceUrl(row) {
  return cleanText(row && (row.source_document_url || row.source_proof_url || row.source_url));
}

function sourceDate(row) {
  return cleanText(row && (
    row.source_date || row.sale_date_or_event_date || row.sale_date_iso || row.event_date ||
    row.sale_date || row.auction_date || row.notice_date || row.filing_date ||
    row.source_published_at || row.listing_date_if_visible
  ));
}

function sourcePage(row) {
  return cleanText(row && (
    row.source_document_or_page || row.source_row_reference || row.pdf_page_reference ||
    row.source_reference || row.filing_period
  ));
}

function canonicalFact(type, amount, row, evidenceText, verificationState) {
  const definition = DEFINITIONS[type];
  return {
    amount_type: type,
    semantic_role: definition.semantic_role,
    amount: cleanText(amount),
    exact_amount: cleanText(amount),
    operator_label: definition.operator_label,
    plain_english_meaning: definition.plain_english_meaning,
    evidence_text: cleanText(evidenceText),
    official_source_url: officialSourceUrl(row),
    source_document_or_page: sourcePage(row),
    source_date: sourceDate(row),
    as_of_date: cleanText(row && row.as_of_date),
    verification_state: cleanText(verificationState)
  };
}

function normalizedExistingFacts(row) {
  const facts = row && row.distress_evidence && Array.isArray(row.distress_evidence.money_facts)
    ? row.distress_evidence.money_facts
    : [];
  return facts.filter((fact) => AMOUNT_TYPES.includes(cleanText(fact && fact.amount_type)))
    .map((fact) => {
      const type = cleanText(fact.amount_type);
      const definition = DEFINITIONS[type];
      return {
        amount_type: type,
        semantic_role: definition.semantic_role,
        amount: cleanText(fact.amount || fact.exact_amount),
        exact_amount: cleanText(fact.exact_amount || fact.amount),
        operator_label: definition.operator_label,
        plain_english_meaning: definition.plain_english_meaning,
        evidence_text: cleanText(fact.evidence_text),
        official_source_url: cleanText(fact.official_source_url),
        source_document_or_page: cleanText(fact.source_document_or_page),
        source_date: cleanText(fact.source_date),
        as_of_date: cleanText(fact.as_of_date),
        verification_state: cleanText(fact.verification_state)
      };
    }).filter((fact) => fact.amount);
}

function moneyFactsForRow(row) {
  const existing = normalizedExistingFacts(row);
  if (existing.length) return existing;
  const facts = [];
  const usedValues = new Set();
  const sharedEvidence = commonEvidence(row);

  for (const type of AMOUNT_TYPES.filter((value) => value !== 'unknown_source_amount')) {
    const definition = DEFINITIONS[type];
    const amount = firstText(row, definition.fields);
    if (!amount) continue;
    const specificEvidence = firstText(row, definition.evidence_fields);
    const evidenceText = specificEvidence || sharedEvidence;
    if (definition.debt_pattern && !definition.debt_pattern.test(evidenceText)) {
      facts.push(canonicalFact('unknown_source_amount', amount, row, evidenceText,
        'source_amount_type_unverified'));
    } else {
      facts.push(canonicalFact(type, amount, row, evidenceText,
        evidenceText ? 'source_labeled' : 'source_field_without_evidence_text'));
    }
    usedValues.add(amount);
  }

  const legacy = firstText(row, DEFINITIONS.unknown_source_amount.fields);
  if (legacy && !usedValues.has(legacy)) {
    const evidenceText = firstText(row, DEFINITIONS.unknown_source_amount.evidence_fields) || sharedEvidence;
    facts.push(canonicalFact('unknown_source_amount', legacy, row, evidenceText,
      'legacy_untyped_source_amount'));
  }

  const seen = new Set();
  return facts.filter((fact) => {
    const key = `${fact.amount_type}|${fact.exact_amount}|${fact.evidence_text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function missingAmountFact() {
  return {
    amount_type: 'unknown_source_amount',
    semantic_role: 'unknown',
    amount: MISSING_AMOUNT_TEXT,
    exact_amount: MISSING_AMOUNT_TEXT,
    operator_label: 'Published amount',
    plain_english_meaning: 'The source did not publish a usable money amount.',
    evidence_text: '',
    official_source_url: '',
    source_document_or_page: '',
    source_date: '',
    as_of_date: '',
    verification_state: 'not_published_in_source'
  };
}

function buildDistressEvidence(row) {
  const moneyFacts = moneyFactsForRow(row || {});
  const sourceDateValue = sourceDate(row || {});
  return {
    distress_reason: cleanText(row && (
      row.distress_reason || row.motivation_evidence_text || row.why_this_might_be_a_deal ||
      row.motivation_phrase || row.source_proof_text
    )),
    official_event_status: cleanText(row && (row.current_status || row.status_evidence_text)),
    status_evidence_text: cleanText(row && row.status_evidence_text),
    money_facts: moneyFacts.length ? moneyFacts : [missingAmountFact()],
    source_date: sourceDateValue,
    source_date_present: !!sourceDateValue,
    last_checked_at: cleanText(row && row.last_checked_at),
    official_source_url: officialSourceUrl(row || {})
  };
}

function debtMoneyFactsForRow(row) {
  return moneyFactsForRow(row).filter((fact) => fact.semantic_role === 'debt');
}

function valueContextFactsForRow(row) {
  return moneyFactsForRow(row).filter((fact) => fact.semantic_role === 'value_context');
}

module.exports = {
  AMOUNT_TYPES,
  BID_MEANING,
  PUBLIC_ESTIMATE_MEANING,
  MISSING_AMOUNT_TEXT,
  DEFINITIONS,
  buildDistressEvidence,
  debtMoneyFactsForRow,
  missingAmountFact,
  moneyFactsForRow,
  valueContextFactsForRow
};
