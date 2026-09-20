'use strict';

const fieldProvenance = require('./field-provenance');
const distressEvidenceModel = require('./distress-evidence-model');

const FIELD_STATUSES = Object.freeze({
  VERIFIED: 'VERIFIED',
  CLUE: 'CLUE',
  UNKNOWN: 'UNKNOWN'
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function valueAt(source, path) {
  return String(path || '').split('.').reduce((current, part) => current == null ? undefined : current[part], source);
}

function firstValue(source, paths) {
  for (const path of paths || []) {
    const value = valueAt(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function firstText(source, paths) {
  for (const path of paths || []) {
    const value = cleanText(valueAt(source, path));
    if (value) return value;
  }
  return '';
}

function sourceKindFor(source, sourceUrl) {
  const explicit = fieldProvenance.sourceKind(source && source.source_kind);
  if (explicit) return explicit;
  const url = cleanText(sourceUrl);
  if (/\.gov(?:\/|$)|(?:^|\.)gov\//i.test(url)) return 'official_public_record';
  if (/\.pdf(?:$|[?#])/i.test(url)) return 'public_source_document';
  return url ? 'public_web_page' : '';
}

function emptyField() {
  return {
    value: null,
    status: FIELD_STATUSES.UNKNOWN,
    provenance: fieldProvenance.withProvenance({}, {})
  };
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return true;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return cleanText(value) !== '';
}

function field(value, provenance, status) {
  const normalized = fieldProvenance.withProvenance(
    provenance && provenance.details && typeof provenance.details === 'object' ? provenance.details : {},
    provenance || {}
  );
  if (!hasValue(value) || !fieldProvenance.hasProvenance(normalized)) return emptyField();
  return {
    value,
    status: status === FIELD_STATUSES.CLUE ? FIELD_STATUSES.CLUE : FIELD_STATUSES.VERIFIED,
    provenance: normalized
  };
}

function provenanceFrom(deal, options = {}) {
  const nested = options.source_object && typeof options.source_object === 'object' ? options.source_object : {};
  const sourceUrl = firstText(nested, ['source_url', 'official_source_url']) ||
    firstText(deal, options.url_paths || []) ||
    firstText(deal, ['source_document_url', 'source_url']);
  const evidenceText = firstText(nested, ['evidence_text']) ||
    firstText(deal, options.evidence_paths || []);
  return {
    source_kind: sourceKindFor(nested, sourceUrl) || sourceKindFor(deal, sourceUrl),
    source_url: sourceUrl,
    evidence_text: evidenceText,
    details: options.details || {}
  };
}

function directField(deal, valuePaths, options = {}) {
  return field(
    firstValue(deal, valuePaths),
    provenanceFrom(deal, options),
    options.status
  );
}

function moneyNumber(value) {
  const text = cleanText(value);
  if (!text || !/[0-9]/.test(text)) return null;
  const number = Number(text.replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function moneyFactField(fact, deal) {
  if (!fact || !cleanText(fact.exact_amount || fact.amount)) return emptyField();
  const sourceUrl = cleanText(fact.official_source_url) || firstText(deal, ['source_document_url', 'source_url']);
  return field({
    amount_type: cleanText(fact.amount_type),
    amount: cleanText(fact.exact_amount || fact.amount),
    numeric_amount: moneyNumber(fact.exact_amount || fact.amount)
  }, {
    source_kind: sourceKindFor(deal, sourceUrl),
    source_url: sourceUrl,
    evidence_text: cleanText(fact.evidence_text),
    details: {
      source_document_or_page: cleanText(fact.source_document_or_page),
      source_date: cleanText(fact.source_date),
      verification_state: cleanText(fact.verification_state)
    }
  });
}

function aggregateFactField(facts, deal) {
  const fields = (facts || []).map((fact) => moneyFactField(fact, deal)).filter((item) => item.status !== FIELD_STATUSES.UNKNOWN);
  if (!fields.length) return emptyField();
  return field(fields.map((item) => item.value), Object.assign({}, fields[0].provenance, {
    details: { amount_types: fields.map((item) => item.value.amount_type) }
  }));
}

function yearsHeldField(priorSaleDate, deal) {
  if (!priorSaleDate || priorSaleDate.status === FIELD_STATUSES.UNKNOWN) return emptyField();
  const timestamp = Date.parse(priorSaleDate.value);
  if (!Number.isFinite(timestamp)) return emptyField();
  const asOfTimestamp = Date.parse(firstText(deal, ['last_checked_at', 'source_date'])) || Date.now();
  const years = Math.max(0, Math.floor((asOfTimestamp - timestamp) / (365.2425 * 24 * 60 * 60 * 1000)));
  return field(years, {
    source_kind: priorSaleDate.provenance.source_kind,
    source_url: priorSaleDate.provenance.source_url,
    evidence_text: `Derived from prior sale date: ${cleanText(priorSaleDate.value)}.`,
    details: { derived_from: ['ownership.prior_sale_date'] }
  }, FIELD_STATUSES.CLUE);
}

function listingSource(deal) {
  const sourceUrl = firstText(deal, ['listing_source_url', 'listed_price_source_url', 'source_url']);
  const label = [
    firstText(deal, ['source_family', 'source_type', 'listing_source_name', 'provider_family']),
    sourceUrl
  ].join(' ');
  if (!/listing|marketplace|fsbo|zillow|redfin|realtor|land.?bank/i.test(label)) return null;
  return {
    source_kind: sourceKindFor(deal, sourceUrl),
    source_url: sourceUrl,
    evidence_text: firstText(deal, ['listing_evidence_text', 'listed_price_evidence_text', 'source_proof_text', 'status_evidence_text'])
  };
}

function listingField(deal, paths, evidencePaths, source) {
  if (!source) return emptyField();
  return field(firstValue(deal, paths), {
    source_kind: source.source_kind,
    source_url: source.source_url,
    evidence_text: firstText(deal, evidencePaths) || source.evidence_text
  }, FIELD_STATUSES.CLUE);
}

function compList(deal) {
  const values = Array.isArray(deal && deal.verified_sold_comps)
    ? deal.verified_sold_comps
    : Array.isArray(deal && deal.verified_comps) ? deal.verified_comps : [];
  return values.filter((comp) => fieldProvenance.compHasProvenance(comp) && !(comp.comp_grid && comp.comp_grid.accepted === false));
}

function nearestCompField(comps) {
  const sorted = comps.slice().sort((a, b) => {
    const aDistance = Number.isFinite(Number(a && a.distance_miles)) ? Number(a.distance_miles) : Number.POSITIVE_INFINITY;
    const bDistance = Number.isFinite(Number(b && b.distance_miles)) ? Number(b.distance_miles) : Number.POSITIVE_INFINITY;
    return aDistance - bDistance || String(b && b.sold_date || '').localeCompare(String(a && a.sold_date || ''));
  });
  const comp = sorted[0];
  if (!comp) return emptyField();
  return field({
    address: cleanText(comp.comp_address || comp.address),
    parcel_id: cleanText(comp.parcel_id || comp.apn || comp.pin),
    price: Number(comp.sold_price) || null,
    date: cleanText(comp.sold_date),
    distance_miles: Number.isFinite(Number(comp.distance_miles)) ? Number(comp.distance_miles) : null
  }, comp);
}

function verifiedArvField(comps, deal) {
  if (comps.length < 3) return emptyField();
  const explicit = firstValue(deal, ['arv_range.median', 'verified_arv', 'arv']);
  const prices = comps.map((comp) => Number(comp.sold_price) || 0).filter((price) => price > 0).sort((a, b) => a - b);
  const value = moneyNumber(explicit) || (prices.length >= 3
    ? (prices.length % 2 ? prices[Math.floor(prices.length / 2)] : Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2))
    : null);
  if (!value) return emptyField();
  const source = comps[0];
  return field(value, {
    source_kind: source.source_kind,
    source_url: source.source_url,
    evidence_text: `ARV proxy derived from ${prices.length} verified sold comps; median sold price ${value}.`,
    details: { derived_from: ['verified_sold_comps'], verified_sold_comp_count: prices.length }
  }, FIELD_STATUSES.CLUE);
}

function booleanOverlay(deal, fieldName, patterns) {
  const direct = deal && deal[fieldName];
  const labels = [].concat(deal && deal.distress_types || [], deal && deal.motivation_type || [], deal && deal.source_family || []).map(cleanText).join(' ');
  const value = typeof direct === 'boolean' ? direct : patterns.test(labels) ? true : null;
  return field(value, provenanceFrom(deal, {
    evidence_paths: [`${fieldName}_evidence_text`, 'motivation_evidence_text', 'source_proof_text', 'status_evidence_text']
  }));
}

function buildLeverageDossier(deal) {
  deal = deal || {};
  const owner = deal.owner_record && typeof deal.owner_record === 'object' ? deal.owner_record : {};
  const story = deal.property_story && typeof deal.property_story === 'object' ? deal.property_story : {};
  const ownerProvenance = { source_object: owner, evidence_paths: ['owner_record.evidence_text'] };
  const storyProvenance = { source_object: story, evidence_paths: ['property_story.evidence_text'] };
  const addressProvenance = {
    evidence_paths: ['subject_address_recovery.evidence_text', 'document_reextraction_evidence_text', 'source_proof_text', 'motivation_evidence_text'],
    url_paths: ['subject_address_recovery.source_url', 'document_reextraction_source_url', 'source_document_url', 'source_url']
  };
  const moneyFacts = distressEvidenceModel.moneyFactsForRow(deal);
  const facts = (type) => moneyFacts.filter((fact) => cleanText(fact.amount_type) === type);
  const listing = listingSource(deal);
  const priorSaleDate = directField(deal, ['property_story.last_recorded_sale_date', 'prior_sale_date', 'last_sold_date'], storyProvenance);
  const comps = compList(deal);
  const listedPrice = listingField(deal, ['listing_price', 'listed_price', 'asking_price'], ['listing_price_evidence_text', 'listed_price_evidence_text', 'asking_price_evidence_text'], listing);

  return {
    identity: {
      normalized_address: directField(deal, ['normalized_address'], addressProvenance),
      parcel_id: directField(deal, ['parcel_id', 'apn', 'pin', 'owner_record.parcel_id'], ownerProvenance),
      legal_description: directField(deal, ['legal_description'], { evidence_paths: ['legal_description_evidence_text', 'source_proof_text'] }),
      beds: directField(deal, ['bedrooms', 'beds'], { evidence_paths: ['bedrooms_evidence_text', 'beds_evidence_text'], url_paths: ['property_facts_source_url'] }),
      baths: directField(deal, ['bathrooms', 'baths'], { evidence_paths: ['bathrooms_evidence_text', 'baths_evidence_text'], url_paths: ['property_facts_source_url'] }),
      sqft: directField(deal, ['living_area', 'sqft', 'property_story.living_area'], storyProvenance),
      year_built: directField(deal, ['year_built', 'property_story.year_built'], storyProvenance),
      lot_size: directField(deal, ['lot_size', 'lot_size_sqft'], { evidence_paths: ['lot_size_evidence_text'], url_paths: ['property_facts_source_url'] }),
      property_type: directField(deal, ['property_kind', 'property_kind_if_visible', 'land_use', 'property_story.land_use'], storyProvenance)
    },
    ownership: {
      owner_of_record: directField(deal, ['owner_record.owner_name', 'owner_name_if_visible'], ownerProvenance),
      owner_role: directField(deal, ['owner_record.owner_role'], ownerProvenance),
      prior_sale_price: directField(deal, ['property_story.last_recorded_sale_price', 'prior_sale_price', 'last_sold_price'], storyProvenance),
      prior_sale_date: priorSaleDate,
      deed_type: directField(deal, ['deed_type', 'property_story.deed_type'], storyProvenance),
      years_held: yearsHeldField(priorSaleDate, deal)
    },
    debt: {
      original_loan_amount: directField(deal, ['original_loan_amount', 'original_principal_amount'], { evidence_paths: ['original_loan_amount_evidence_text', 'original_principal_amount_evidence_text'], url_paths: ['source_document_url'] }),
      lien_amounts: aggregateFactField(facts('lien_amount'), deal),
      tax_due: aggregateFactField(facts('tax_due'), deal),
      judgment_amount: aggregateFactField(facts('judgment_amount'), deal),
      minimum_bid: aggregateFactField(facts('minimum_bid'), deal),
      unknown_source_amount: aggregateFactField(facts('unknown_source_amount'), deal)
    },
    listing: {
      list_price: listedPrice,
      list_date: listingField(deal, ['list_date', 'listing_date_if_visible'], ['listing_date_evidence_text', 'source_proof_text'], listing),
      days_on_market: listingField(deal, ['days_on_market', 'DOM'], ['days_on_market_evidence_text', 'source_proof_text'], listing),
      price_change_history: listingField(deal, ['price_change_history'], ['price_change_history_evidence_text', 'source_proof_text'], listing),
      listing_agent_name: listingField(deal, ['listing_agent_name'], ['listing_agent_evidence_text', 'source_proof_text'], listing),
      listing_brokerage: listingField(deal, ['listing_brokerage', 'brokerage'], ['listing_agent_evidence_text', 'source_proof_text'], listing),
      listing_status: listingField(deal, ['listing_status', 'source_listing_status'], ['status_evidence_text', 'source_proof_text'], listing)
    },
    rent: {
      rent_estimate: directField(deal, ['rent_estimate'], { evidence_paths: ['rent_estimate_evidence_text'], url_paths: ['rent_source_url'], status: FIELD_STATUSES.CLUE }),
      rent_comp_count: directField(deal, ['rent_comp_count'], { evidence_paths: ['rent_estimate_evidence_text'], url_paths: ['rent_source_url'], status: FIELD_STATUSES.CLUE }),
      rent_source: directField(deal, ['rent_source'], { evidence_paths: ['rent_estimate_evidence_text'], url_paths: ['rent_source_url'], status: FIELD_STATUSES.CLUE })
    },
    distress_overlay: {
      vacant: booleanOverlay(deal, 'vacant', /\bvacan/),
      tax_delinquent: booleanOverlay(deal, 'tax_delinquent', /tax.?delin|tax.?lien|tax.?sale/),
      pre_foreclosure: booleanOverlay(deal, 'pre_foreclosure', /pre.?foreclos|trustee|foreclosure/),
      code_violation: booleanOverlay(deal, 'code_violation', /code.?viol|code.?enforce/),
      probate: booleanOverlay(deal, 'probate', /probate|estate|heir/),
      absentee: booleanOverlay(deal, 'absentee', /absentee|non.?owner.?occupied/)
    },
    neighborhood_proof: {
      nearest_recent_sale: nearestCompField(comps)
    },
    condition: {
      photo_urls: directField(deal, ['photo_urls'], { evidence_paths: ['condition_evidence_text', 'source_proof_text'], url_paths: ['listing_source_url', 'source_url'], status: FIELD_STATUSES.CLUE }),
      as_is_keyword_hits: directField(deal, ['as_is_keyword_hits'], { evidence_paths: ['condition_evidence_text', 'motivation_evidence_text'], url_paths: ['listing_source_url', 'source_url'], status: FIELD_STATUSES.CLUE }),
      condition_evidence_text: directField(deal, ['condition_evidence_text'], { evidence_paths: ['condition_evidence_text'], url_paths: ['listing_source_url', 'source_url'], status: FIELD_STATUSES.CLUE })
    },
    valuation: {
      verified_arv: verifiedArvField(comps, deal),
      verified_sold_comp_count: field(comps.length, comps[0] || {}, FIELD_STATUSES.CLUE),
      listing_price_proxy: listedPrice
    }
  };
}

function amountFromField(entry) {
  if (!entry || entry.status === FIELD_STATUSES.UNKNOWN) return null;
  if (Array.isArray(entry.value)) {
    const values = entry.value.map((item) => moneyNumber(item && (item.numeric_amount != null ? item.numeric_amount : item.amount))).filter((value) => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  if (entry.value && typeof entry.value === 'object') return moneyNumber(entry.value.numeric_amount != null ? entry.value.numeric_amount : entry.value.amount);
  return moneyNumber(entry.value);
}

function equityEstimate(dossier) {
  dossier = dossier || {};
  const debt = dossier.debt || {};
  const loan = amountFromField(debt.original_loan_amount);
  const liens = amountFromField(debt.lien_amounts);
  const tax = amountFromField(debt.tax_due);
  const judgment = amountFromField(debt.judgment_amount);
  const debtParts = [];
  if (loan !== null) debtParts.push({ type: 'original_loan_amount', amount: loan });
  else if (liens !== null) debtParts.push({ type: 'lien_amount', amount: liens });
  if (tax !== null) debtParts.push({ type: 'tax_due', amount: tax });
  if (judgment !== null) debtParts.push({ type: 'judgment_amount', amount: judgment });
  const estimatedDebt = debtParts.length ? debtParts.reduce((sum, part) => sum + part.amount, 0) : null;

  const verifiedArv = amountFromField(dossier.valuation && dossier.valuation.verified_arv);
  const listPrice = amountFromField(dossier.listing && dossier.listing.list_price);
  const valueReference = verifiedArv !== null ? verifiedArv : listPrice;
  const basis = verifiedArv !== null ? 'verified_arv' : listPrice !== null ? 'list_price_proxy' : 'unknown';
  if (estimatedDebt === null || valueReference === null) {
    return {
      estimated_debt: estimatedDebt,
      value_reference: valueReference,
      equity_estimate: null,
      equity_basis: basis,
      equity_confidence: basis,
      room_to_offer: 'UNKNOWN',
      status: FIELD_STATUSES.UNKNOWN,
      debt_basis: debtParts
    };
  }
  const estimate = valueReference - estimatedDebt;
  const ratio = valueReference > 0 ? estimate / valueReference : null;
  return {
    estimated_debt: estimatedDebt,
    value_reference: valueReference,
    equity_estimate: estimate,
    equity_basis: basis,
    equity_confidence: basis,
    room_to_offer: ratio === null ? 'UNKNOWN' : estimate <= 0 ? 'NONE' : ratio >= 0.3 ? 'LIKELY' : 'TIGHT',
    status: FIELD_STATUSES.CLUE,
    debt_basis: debtParts
  };
}

module.exports = {
  FIELD_STATUSES,
  buildLeverageDossier,
  equityEstimate
};
