'use strict';

const {
  buildDallasCompCaptureLinks,
  summarizeDallasCompCapture
} = require('./dallas-comp-capture-agent');

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function pick(source, keys) {
  for (const key of keys) {
    const parts = String(key).split('.');
    let current = source;
    for (const part of parts) {
      if (current == null) break;
      current = current[part];
    }
    if (current !== undefined && current !== null && cleanText(current) !== '') return current;
  }
  return '';
}

function parseMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 0 ? value : 0;
  const text = cleanText(value).replace(/,/g, '');
  const match = text.match(/\$?\s*(-?\d+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 0 ? value : 0;
  const n = Number(cleanText(value).replace(/,/g, '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function hasValue(value) {
  return cleanText(value) !== '';
}

function fullDallasAddress(input = {}) {
  const address = cleanText(pick(input, ['address', 'property_address', 'situs_address', 'street_address', 'full_address']));
  const city = cleanText(pick(input, ['city', 'property_city', 'situs_city'])) || 'Dallas';
  const state = cleanText(pick(input, ['state', 'property_state', 'situs_state'])) || 'TX';
  const zip = cleanText(pick(input, ['zip', 'zipcode', 'postal_code', 'property_zip', 'situs_zip']));
  return [address, city, state, zip].filter(Boolean).join(', ').replace(/,\s*(\d{5}(?:-\d{4})?)$/, ' $1');
}

function isDallasAddress(value) {
  const text = cleanText(value);
  if (!text || !/\d/.test(text)) return false;
  if (/\b(contact|directory|page not found|skip main navigation|privacy|login|phone)\b/i.test(text)) return false;
  return /\b(st|street|ave|avenue|dr|drive|rd|road|ln|lane|ct|court|cir|circle|blvd|boulevard|way|trl|trail|pkwy|parkway|pl|place|ter|terrace|hwy|highway|loop)\b/i.test(text);
}

function buildDallasCompResearchLinks(input = {}) {
  const previewLinks = buildDallasCompCaptureLinks(input);
  const full = fullDallasAddress(input);
  const address = cleanText(pick(input, ['address', 'property_address', 'situs_address', 'street_address', 'full_address']));
  const city = cleanText(pick(input, ['city', 'property_city', 'situs_city'])) || 'Dallas';
  const state = cleanText(pick(input, ['state', 'property_state', 'situs_state'])) || 'TX';
  const zip = cleanText(pick(input, ['zip', 'zipcode', 'postal_code', 'property_zip', 'situs_zip']));
  const parcel = cleanText(pick(input, ['parcel', 'apn', 'account_number', 'tax_account']));
  const quotedAddress = address ? `"${address}"` : '';
  const soldContext = [quotedAddress, city, state, zip, 'sold comps'].filter(Boolean).join(' ');
  const fullContext = [address, city, state, zip].filter(Boolean).join(' ');
  const dcadContext = parcel || [address, zip].filter(Boolean).join(' ');
  return {
    property: {
      zillow: previewLinks.property.zillow || (full ? `https://www.zillow.com/homes/${encodeURIComponent(full)}_rb/` : ''),
      redfin: previewLinks.property.redfin || (full ? `https://www.redfin.com/search?searchType=4&query=${encodeURIComponent(full)}` : ''),
      realtor: previewLinks.property.realtor || (full ? `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(full)}` : ''),
      google_maps: previewLinks.property.google_maps || (full ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}` : ''),
      dcad: previewLinks.property.dcad || 'https://www.dallascad.org/SearchAddr.aspx',
      dcad_search: previewLinks.property.dcad_search || (dcadContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:dallascad.org ${dcadContext}`)}` : 'https://www.dallascad.org/SearchAddr.aspx'),
      dallas_gis: fullContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:dallascounty.org GIS parcel ${fullContext}`)}` : 'https://www.dallascounty.org/departments/pubworks/GIS.php'
    },
    sold_comp_links: {
      zillow: previewLinks.sold.zillow || (soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:zillow.com/homedetails ${soldContext}`)}` : ''),
      redfin: previewLinks.sold.redfin || (soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:redfin.com ${soldContext}`)}` : ''),
      realtor: previewLinks.sold.realtor || (soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:realtor.com/realestateandhomes-detail ${soldContext}`)}` : '')
    },
    nearby_sale_links: {
      zillow: soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:zillow.com/homedetails ${soldContext} nearby sold`)}` : '',
      redfin: soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:redfin.com ${soldContext} sold nearby`)}` : '',
      realtor: soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:realtor.com/realestateandhomes-detail ${soldContext} sold nearby`)}` : '',
      google: soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`${soldContext} Dallas nearby sold properties`)}` : ''
    },
    basis: {
      address,
      city,
      state,
      zip,
      parcel
    }
  };
}

function collectCompLists(input) {
  const keys = [
    'comps',
    'draft_comps',
    'manual_comps',
    'research_comps',
    'accepted_comps',
    'approved_comps',
    'structured_comps',
    'comp_slots',
    'property_intelligence.comps',
    'comp_evidence'
  ];
  const out = [];
  keys.forEach((key) => {
    const value = pickRaw(input, key);
    if (!Array.isArray(value)) return;
    value.forEach((item) => {
      if (item && typeof item === 'object') out.push(item);
    });
  });
  return out;
}

function pickRaw(source, dottedKey) {
  const parts = String(dottedKey).split('.');
  let current = source;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current;
}

function normalizeComp(comp = {}, index) {
  const price = parseMoney(pick(comp, ['sold_price', 'sale_price', 'price', 'list_price', 'amount']));
  const sqft = parseNumber(pick(comp, ['sqft', 'square_feet', 'living_area']));
  const status = cleanText(pick(comp, ['status', 'sale_status', 'listing_status', 'sold_list_status']));
  const sourceUrl = cleanText(pick(comp, ['source_url', 'url', 'listing_url']));
  return {
    index,
    address: cleanText(pick(comp, ['address', 'title', 'property_address'])),
    price,
    sqft,
    beds: parseNumber(pick(comp, ['beds', 'bedrooms'])),
    baths: parseNumber(pick(comp, ['baths', 'bathrooms'])),
    source: cleanText(pick(comp, ['source', 'site'])) || 'manual',
    source_url: sourceUrl,
    status,
    sold_date: cleanText(pick(comp, ['sold_date', 'sale_date', 'date'])),
    verified: comp.verified === true || comp.verification_status === 'verified',
    unverified: comp.unverified === true || comp.verified !== true,
    ppsf: price > 0 && sqft > 0 ? Math.round(price / sqft) : null
  };
}

function compEvidence(input = {}) {
  const comps = collectCompLists(input).map(normalizeComp).filter((comp) => comp.price > 0 || comp.address || comp.source_url);
  const prices = comps.map((comp) => comp.price).filter((price) => price > 0);
  const sqftComps = comps.filter((comp) => comp.price > 0 && comp.sqft > 0);
  const soldComps = comps.filter((comp) => /sold|closed/i.test(comp.status || '') || comp.verified);
  return { comps, prices, sqftComps, soldComps };
}

function rangeFrom(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    low: sorted[0],
    mid: Math.round(sum / sorted.length),
    high: sorted[sorted.length - 1],
    count: sorted.length
  };
}

function missingCompEvidence(evidence, input) {
  const missing = [];
  if (evidence.comps.length < 3) missing.push('at_least_3_verified_comps');
  if (evidence.prices.length < 3) missing.push('sold_or_list_prices');
  if (evidence.sqftComps.length < 3) missing.push('sqft_for_price_per_sqft');
  if (!evidence.comps.some((comp) => comp.source_url)) missing.push('source_urls');
  if (evidence.soldComps.length < 3) missing.push('verified_sold_status');
  if (!isDallasAddress(pick(input, ['address', 'property_address', 'situs_address', 'street_address', 'full_address']))) missing.push('verified_property_address');
  return Array.from(new Set(missing));
}

function sourceQualityScore(input) {
  const text = cleanText(pick(input, [
    'source_confidence',
    'extraction_confidence',
    'source_truth.confidence',
    'dallas_verified_acquisition.confidence_level',
    'sheriff_tax_sale_acquisition.confidence_level'
  ])).toLowerCase();
  const numeric = Number(pick(input, ['source_confidence_score', 'confidence_score', 'dallas_verified_acquisition.confidence_score']));
  if (Number.isFinite(numeric) && numeric > 0) return Math.max(0, Math.min(20, numeric > 20 ? Math.round(numeric / 5) : numeric));
  if (/high|verified|strong/.test(text)) return 20;
  if (/medium|moderate/.test(text)) return 14;
  if (/repair|failed/.test(text)) return 2;
  if (/low|weak/.test(text)) return 6;
  return hasValue(pick(input, ['source_url', 'source_record_url', 'evidence.source_url'])) ? 10 : 4;
}

function timingPressureScore(input) {
  const saleDate = cleanText(pick(input, ['sale_date', 'auction_date', 'filing_date', 'notice_date', 'evidence.filing_or_sale_date']));
  const caseNumber = cleanText(pick(input, ['case_number', 'cause_number', 'evidence.case_number']));
  if (!saleDate && !caseNumber) return 0;
  if (!saleDate) return 7;
  const time = Date.parse(saleDate);
  if (!Number.isFinite(time)) return 8;
  const days = Math.ceil((time - Date.now()) / 86400000);
  if (days >= 0 && days <= 14) return 15;
  if (days > 14 && days <= 45) return 12;
  if (days > 45 && days <= 120) return 8;
  return 5;
}

function amountPressureScore(input) {
  const amount = parseMoney(pick(input, [
    'amount_owed',
    'tax_due',
    'judgment_amount',
    'minimum_bid',
    'minimum_bid_amount',
    'lien_amount',
    'evidence.amount_or_judgment'
  ]));
  if (amount >= 50000) return 15;
  if (amount >= 20000) return 12;
  if (amount >= 5000) return 8;
  return amount > 0 ? 5 : 0;
}

function propertyCompletenessScore(input) {
  let score = 0;
  if (isDallasAddress(pick(input, ['address', 'property_address', 'situs_address', 'street_address', 'full_address']))) score += 10;
  if (hasValue(pick(input, ['parcel', 'apn', 'account_number', 'tax_account', 'evidence.parcel_apn']))) score += 5;
  return score;
}

function compCompletenessScore(evidence) {
  let score = 0;
  if (evidence.comps.length >= 1) score += 4;
  if (evidence.comps.length >= 3) score += 5;
  if (evidence.prices.length >= 3) score += 4;
  if (evidence.sqftComps.length >= 3) score += 3;
  if (evidence.soldComps.length >= 3) score += 2;
  if (evidence.comps.some((comp) => comp.source_url)) score += 2;
  return Math.min(20, score);
}

function distressConfidenceScore(input) {
  const text = [
    pick(input, ['distress_category', 'source_category', 'category', 'source_type', 'lead_type']),
    Array.isArray(input.distress_types) ? input.distress_types.join(' ') : '',
    Array.isArray(input.repair_flags) ? input.repair_flags.join(' ') : ''
  ].filter(Boolean).join(' ').toLowerCase();
  if (/tax|sheriff|foreclosure|auction|code|violation|nuisance|probate|lien|delinquent/.test(text)) return 5;
  return 0;
}

function titleTaxConfidenceScore(input) {
  let score = 0;
  if (hasValue(pick(input, ['parcel', 'apn', 'account_number', 'tax_account', 'evidence.parcel_apn']))) score += 3;
  if (hasValue(pick(input, ['tax_due', 'judgment_amount', 'minimum_bid', 'case_number', 'cause_number']))) score += 2;
  return score;
}

function acquisitionRank(score) {
  if (score >= 80) return 'priority';
  if (score >= 65) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function nextBestAction(input, evidence, missing) {
  if (missing.includes('verified_property_address')) return 'Verify property';
  if (!hasValue(pick(input, ['source_url', 'source_record_url', 'evidence.source_url', 'evidence.source_record_url']))) return 'Open DCAD';
  if (missing.includes('at_least_3_verified_comps') || missing.includes('verified_sold_status')) return 'Capture comps';
  if (missing.length) return 'Review comp evidence';
  return 'Review offer';
}

function propertySignals(input, evidence) {
  const signals = [];
  if (isDallasAddress(pick(input, ['address', 'property_address', 'situs_address', 'street_address', 'full_address']))) signals.push('Dallas property address present');
  if (hasValue(pick(input, ['parcel', 'apn', 'account_number', 'tax_account', 'evidence.parcel_apn']))) signals.push('Parcel/APN evidence present');
  if (hasValue(pick(input, ['source_url', 'source_record_url', 'evidence.source_url']))) signals.push('Source proof available');
  if (evidence.comps.length) signals.push(`${evidence.comps.length} operator-entered comp candidate${evidence.comps.length === 1 ? '' : 's'} available`);
  if (!signals.length) signals.push('Property evidence needs manual verification');
  return signals;
}

function generateDallasCompIntelligence(input = {}) {
  const links = buildDallasCompResearchLinks(input);
  const evidence = compEvidence(input);
  const previewSummary = summarizeDallasCompCapture(evidence.comps);
  const missing = missingCompEvidence(evidence, input);
  const ppsf = rangeFrom(evidence.sqftComps.map((comp) => comp.ppsf).filter((value) => value > 0));
  const prices = rangeFrom(evidence.prices);
  const verifiedPriceEvidence = evidence.soldComps.length >= 3 && evidence.prices.length >= 3;
  const scoreParts = {
    source_quality: sourceQualityScore(input),
    timing_pressure: timingPressureScore(input),
    amount_pressure: amountPressureScore(input),
    property_completeness: propertyCompletenessScore(input),
    comp_completeness: compCompletenessScore(evidence),
    neighborhood_confidence: links.basis.zip ? 5 : (links.basis.city ? 3 : 0),
    distress_confidence: distressConfidenceScore(input),
    title_tax_confidence: titleTaxConfidenceScore(input)
  };
  const valuationEvidenceScore = Object.values(scoreParts).reduce((total, value) => total + value, 0);
  const rank = acquisitionRank(valuationEvidenceScore);
  const repairEstimate = parseMoney(pick(input, ['repair_estimate', 'repairs', 'estimated_repairs'])) || null;
  const arvLow = verifiedPriceEvidence && prices ? prices.low : null;
  const arvMid = verifiedPriceEvidence && prices ? prices.mid : null;
  const arvHigh = verifiedPriceEvidence && prices ? prices.high : null;
  const maoEstimate = verifiedPriceEvidence && arvMid
    ? {
        conservative: Math.round(arvLow * 0.65 - (repairEstimate || 0)),
        moderate: Math.round(arvMid * 0.68 - (repairEstimate || 0)),
        aggressive: Math.round(arvHigh * 0.7 - (repairEstimate || 0)),
        basis: 'operator_entered_verified_comp_evidence'
      }
    : null;
  const spreadEstimate = verifiedPriceEvidence && maoEstimate && parseMoney(pick(input, ['asking_price', 'list_price', 'offer_price'])) > 0
    ? Math.round(arvMid - parseMoney(pick(input, ['asking_price', 'list_price', 'offer_price'])) - (repairEstimate || 0))
    : null;
  const compStatus = verifiedPriceEvidence ? 'verified' : (evidence.comps.length ? 'partial' : 'needs_review');
  const compConfidence = verifiedPriceEvidence && evidence.sqftComps.length >= 3 ? 'high' : (evidence.comps.length >= 2 && evidence.prices.length >= 2 ? 'medium' : 'low');
  const reasoning = [];
  reasoning.push(`Source quality score ${scoreParts.source_quality}/20.`);
  reasoning.push(evidence.comps.length ? `${evidence.comps.length} comp candidate(s) are present.` : 'No comp candidates are saved yet.');
  if (verifiedPriceEvidence) reasoning.push('Valuation fields use verified/operator-entered comp evidence only.');
  else reasoning.push('ARV/MAO remain null until at least 3 verified sold comps exist.');
  if (missing.length) reasoning.push(`Missing: ${missing.join(', ')}.`);
  return {
    version: 'dallas_comp_intelligence_v1',
    market: 'Dallas County, TX',
    address: links.basis.address,
    city: links.basis.city,
    state: links.basis.state,
    zip: links.basis.zip,
    parcel: links.basis.parcel,
    comp_status: compStatus,
    comp_confidence: compConfidence,
    confidence: compConfidence.charAt(0).toUpperCase() + compConfidence.slice(1),
    confidence_reason: reasoning.join(' '),
    sold_comp_links: links.sold_comp_links,
    nearby_sale_links: links.nearby_sale_links,
    research_links: links.property,
    links: {
      property: links.property,
      nearby_sold: links.nearby_sale_links,
      sold_comp_links: links.sold_comp_links
    },
    ppsf_range: verifiedPriceEvidence && ppsf ? ppsf : null,
    dom_context: { status: 'not_captured', dom: null, source: null },
    neighborhood_context: {
      status: links.basis.zip ? 'address_context_ready' : 'needs_zip_or_neighborhood_review',
      basis: links.basis
    },
    property_quality_signals: propertySignals(input, evidence),
    valuation_evidence_score: valuationEvidenceScore,
    comp_completeness_score: previewSummary.comp_completeness_score,
    capture_preview_summary: previewSummary,
    acquisition_score_parts: scoreParts,
    acquisition_rank: rank,
    acquisition_reasoning: reasoning,
    next_best_action: nextBestAction(input, evidence, missing),
    missing_comp_evidence: missing,
    arv_low: arvLow,
    arv_mid: arvMid,
    arv_high: arvHigh,
    mao_estimate: maoEstimate,
    repair_estimate: repairEstimate,
    spread_estimate: spreadEstimate,
    arv_guidance: verifiedPriceEvidence
      ? { status: 'evidence_based', label: 'Preliminary range from verified/operator-entered comp evidence only.', range_low: arvLow, range_high: arvHigh }
      : { status: 'needs_review', label: previewSummary.list_only ? 'Market support only. Needs verified sold comps before ARV.' : 'Needs manual comp review. Do not rely on this without verified sold comps.', range_low: null, range_high: null },
    mao_guidance: maoEstimate
      ? Object.assign({ status: 'evidence_based', note: 'Guidance uses existing verified comp evidence only; verify before offer.' }, maoEstimate)
      : { status: 'needs_review', conservative: null, moderate: null, aggressive: null, note: previewSummary.list_only ? 'Market support only. Do not derive MAO from list comps.' : 'Needs comp review.' },
    browser_capture_hooks: {
      local_comp_agent_ready: false,
      suggested_capture_sources: ['zillow', 'redfin', 'realtor'],
      one_lead_operator_triggered_only: true,
      no_background_loops: true,
      preview_only: true,
      max_candidates_per_capture: 5
    },
    safety: {
      no_fake_comps: true,
      no_fake_arv_mao: !verifiedPriceEvidence,
      no_scraping_loop: true,
      no_auto_save: true
    }
  };
}

module.exports = {
  generateDallasCompIntelligence,
  buildDallasCompResearchLinks,
  fullDallasAddress,
  compEvidence
};
