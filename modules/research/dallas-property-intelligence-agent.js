'use strict';

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = cleanText(value).replace(/,/g, '');
  const match = text.match(/\$?\s*(-?\d+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isDallasAddress(value) {
  const text = cleanText(value);
  if (!text || !/\d/.test(text)) return false;
  if (/\b(contact|directory|page not found|skip main navigation|privacy|login)\b/i.test(text)) return false;
  return /\b(st|street|ave|avenue|dr|drive|rd|road|ln|lane|ct|court|cir|circle|blvd|boulevard|way|trl|trail|pkwy|parkway|pl|place|ter|terrace|hwy|highway)\b/i.test(text);
}

function fullDallasAddress(input = {}) {
  const address = cleanText(pick(input, ['address', 'property_address', 'situs_address', 'street_address']));
  const city = cleanText(pick(input, ['city', 'property_city', 'situs_city'])) || 'Dallas';
  const state = cleanText(pick(input, ['state', 'property_state', 'situs_state'])) || 'TX';
  const zip = cleanText(pick(input, ['zip', 'zipcode', 'postal_code', 'property_zip', 'situs_zip']));
  return [address, city, state, zip].filter(Boolean).join(', ');
}

function existingComps(input = {}) {
  const lists = [input.comps, input.draft_comps, input.manual_comps, input.research_comps, input.accepted_comps]
    .filter(Array.isArray);
  return lists.flat().filter(Boolean).slice(0, 5);
}

function compPrices(comps) {
  return comps.map((comp) => parseMoney(pick(comp, ['sold_price', 'sale_price', 'price', 'list_price'])))
    .filter((price) => price > 0)
    .slice(0, 5);
}

function compStatusFromEvidence(input) {
  const comps = existingComps(input);
  const prices = compPrices(comps);
  const verifiedCount = comps.filter((comp) => comp && (comp.verified === true || comp.status === 'verified')).length;
  if (comps.length >= 3 && prices.length >= 3 && verifiedCount >= 3) return 'verified';
  if (comps.length || prices.length) return 'partial';
  return 'needs_review';
}

function valuationFromEvidence(input) {
  const status = compStatusFromEvidence(input);
  const prices = compPrices(existingComps(input)).sort((a, b) => a - b);
  if (prices.length < 3) {
    return {
      comp_status: status,
      arv_range: null,
      estimated_mao: null,
      ppsf_range: null,
      valuation_confidence: 'low',
      missing_comp_evidence: missingCompEvidence(input)
    };
  }
  const low = prices[0];
  const high = prices[prices.length - 1];
  const midpoint = Math.round((low + high) / 2);
  return {
    comp_status: status,
    arv_range: { low, high, basis: 'existing_saved_comp_prices_only' },
    estimated_mao: {
      conservative: Math.round(low * 0.65),
      moderate: Math.round(midpoint * 0.68),
      aggressive: Math.round(high * 0.7),
      basis: 'existing_saved_comp_prices_only'
    },
    ppsf_range: null,
    valuation_confidence: status === 'verified' ? 'high' : 'medium',
    missing_comp_evidence: status === 'verified' ? [] : ['verified_sold_comp_status']
  };
}

function missingCompEvidence(input) {
  const missing = [];
  const comps = existingComps(input);
  const prices = compPrices(comps);
  if (comps.length < 3) missing.push('at_least_3_verified_comps');
  if (prices.length < 3) missing.push('sold_or_list_prices');
  if (!comps.some((comp) => pick(comp, ['sqft', 'square_feet']))) missing.push('sqft');
  if (!comps.some((comp) => pick(comp, ['source_url', 'url']))) missing.push('source_urls');
  if (!comps.some((comp) => comp && comp.verified === true)) missing.push('verified_sold_status');
  return Array.from(new Set(missing));
}

function researchLinks(input = {}) {
  const full = fullDallasAddress(input);
  const address = cleanText(pick(input, ['address', 'property_address', 'situs_address', 'street_address']));
  const city = cleanText(pick(input, ['city', 'property_city', 'situs_city'])) || 'Dallas';
  const state = cleanText(pick(input, ['state', 'property_state', 'situs_state'])) || 'TX';
  const zip = cleanText(pick(input, ['zip', 'zipcode', 'postal_code', 'property_zip', 'situs_zip']));
  const parcel = cleanText(pick(input, ['parcel', 'apn', 'account_number', 'tax_account']));
  const soldContext = [address, city, state, zip, 'sold comps'].filter(Boolean).join(' ');
  const dcadQuery = parcel || [address, zip].filter(Boolean).join(' ');
  return {
    property: {
      zillow: full ? `https://www.zillow.com/homes/${encodeURIComponent(full)}_rb/` : '',
      redfin: full ? `https://www.redfin.com/search?searchType=4&query=${encodeURIComponent(full)}` : '',
      realtor: full ? `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(full)}` : '',
      google_maps: full ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}` : '',
      dcad: 'https://www.dallascad.org/SearchAddr.aspx',
      dcad_search: dcadQuery ? `https://www.google.com/search?q=${encodeURIComponent(`site:dallascad.org ${dcadQuery}`)}` : 'https://www.dallascad.org/SearchAddr.aspx',
      dallas_gis: 'https://www.dallascounty.org/departments/pubworks/GIS.php'
    },
    comps: {
      zillow_sold: soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:zillow.com/homedetails ${soldContext}`)}` : '',
      redfin_sold: soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:redfin.com ${soldContext}`)}` : '',
      realtor_sold: soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`site:realtor.com/realestateandhomes-detail ${soldContext}`)}` : '',
      google_sold_comps: soldContext ? `https://www.google.com/search?q=${encodeURIComponent(`${soldContext} Dallas sold comparable sales`)}` : ''
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

function acquisitionDecision(input, valuation, links) {
  const validAddress = isDallasAddress(pick(input, ['address', 'property_address', 'situs_address', 'street_address']));
  const repairFlags = Array.isArray(input.repair_flags) ? input.repair_flags : [];
  const sourceTruth = input.source_truth || {};
  const sourceVerified = sourceTruth.verification_status === 'verified' || input.verification_status === 'verified' || input.source_verified === true;
  if (!validAddress || repairFlags.includes('missing_address') || repairFlags.includes('parser_failed')) {
    return { acquisition_status: 'needs_property_verification', next_best_action: links.property.dcad_search ? 'Open DCAD' : 'Verify property' };
  }
  if (repairFlags.length || input.actionability_status === 'Needs Repair') {
    return { acquisition_status: 'needs_property_verification', next_best_action: 'Repair source' };
  }
  if (valuation.comp_status === 'verified' && sourceVerified) {
    return { acquisition_status: 'ready_for_offer_review', next_best_action: 'Review offer' };
  }
  if (sourceVerified && valuation.comp_status !== 'verified') {
    return { acquisition_status: 'source_verified_needs_comps', next_best_action: 'Capture comps' };
  }
  if (valuation.comp_status === 'needs_review') {
    return { acquisition_status: 'needs_comp_review', next_best_action: links.property.zillow ? 'Open Zillow' : 'Capture comps' };
  }
  return { acquisition_status: 'needs_comp_review', next_best_action: 'Capture comps' };
}

function generateDallasPropertyIntelligence(input = {}) {
  const links = researchLinks(input);
  const valuation = valuationFromEvidence(input);
  const decision = acquisitionDecision(input, valuation, links);
  return {
    version: 'dallas_property_intelligence_v1',
    market: 'Dallas County, TX',
    address: cleanText(pick(input, ['address', 'property_address', 'situs_address', 'street_address'])),
    city: cleanText(pick(input, ['city', 'property_city', 'situs_city'])) || 'Dallas',
    state: cleanText(pick(input, ['state', 'property_state', 'situs_state'])) || 'TX',
    zip: cleanText(pick(input, ['zip', 'zipcode', 'postal_code', 'property_zip', 'situs_zip'])),
    parcel: cleanText(pick(input, ['parcel', 'apn', 'account_number', 'tax_account'])),
    links,
    comp_status: valuation.comp_status,
    arv_range: valuation.arv_range,
    estimated_mao: valuation.estimated_mao,
    ppsf_range: valuation.ppsf_range,
    valuation_confidence: valuation.valuation_confidence,
    missing_comp_evidence: valuation.missing_comp_evidence,
    acquisition_status: decision.acquisition_status,
    next_best_action: decision.next_best_action,
    safety: {
      no_scraping_loop: true,
      no_fake_comps: true,
      no_fake_arv_mao: valuation.arv_range === null,
      no_auto_save: true
    }
  };
}

module.exports = {
  generateDallasPropertyIntelligence,
  researchLinks,
  valuationFromEvidence,
  fullDallasAddress
};
