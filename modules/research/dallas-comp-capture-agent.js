'use strict';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function pick(source, keys) {
  source = source || {};
  for (var i = 0; i < keys.length; i++) {
    var parts = String(keys[i]).split('.');
    var current = source;
    for (var j = 0; j < parts.length; j++) {
      current = current && current[parts[j]] != null ? current[parts[j]] : null;
      if (current == null) break;
    }
    if (cleanText(current)) return current;
  }
  return '';
}

function parseNumber(value) {
  if (typeof value === 'number' && isFinite(value)) return value;
  var raw = cleanText(value).replace(/,/g, '');
  if (!raw) return 0;
  var match = raw.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseMoney(value) {
  var parsed = parseNumber(value);
  return parsed > 0 ? Math.round(parsed) : 0;
}

function parseDistance(value) {
  var text = cleanText(value);
  if (!text) return '';
  var match = text.match(/(\d+(?:\.\d+)?)\s*(mi|miles?|ft|feet|km)/i);
  return match ? cleanText(match[1] + ' ' + match[2]) : '';
}

function buildDallasCompCaptureContext(input) {
  input = input || {};
  var address = cleanText(pick(input, ['address', 'property_address', 'situs_address', 'street_address', 'full_address']));
  var city = cleanText(pick(input, ['city', 'property_city', 'situs_city'])) || 'Dallas';
  var state = cleanText(pick(input, ['state', 'property_state', 'situs_state'])) || 'TX';
  var zip = cleanText(pick(input, ['zip', 'zipcode', 'postal_code', 'property_zip', 'situs_zip']));
  var parcel = cleanText(pick(input, ['parcel', 'apn', 'parcel_apn', 'parcel_id', 'account_number', 'tax_account']));
  var county = cleanText(pick(input, ['county', 'property_county', 'source_county'])) || 'Dallas County';
  var full = [address, city, state, zip].filter(Boolean).join(', ').replace(/,\s*(\d{5}(?:-\d{4})?)$/, ' $1');
  return {
    address: address,
    city: city,
    state: state,
    zip: zip,
    parcel: parcel,
    county: county,
    full_address: cleanText(full)
  };
}

function isDallasCompCaptureEligible(input) {
  var ctx = buildDallasCompCaptureContext(input);
  if (!ctx.address) return false;
  var state = ctx.state.toUpperCase();
  var cityCounty = (ctx.city + ' ' + ctx.county + ' ' + ctx.full_address).toLowerCase();
  if (state !== 'TX') return false;
  return cityCounty.indexOf('dallas') > -1;
}

function buildDallasCompCaptureLinks(input) {
  var ctx = buildDallasCompCaptureContext(input);
  var propertyQuery = ctx.full_address || [ctx.address, ctx.city, ctx.state].filter(Boolean).join(', ');
  var soldQuery = [ctx.address, ctx.city, ctx.state, ctx.zip, 'sold comps'].filter(Boolean).join(' ');
  var dcadQuery = ctx.parcel || [ctx.address, ctx.zip].filter(Boolean).join(' ');
  return {
    context: ctx,
    eligible: isDallasCompCaptureEligible(ctx),
    property: {
      zillow: propertyQuery ? 'https://www.zillow.com/homes/' + encodeURIComponent(propertyQuery) + '_rb/' : '',
      redfin: propertyQuery ? 'https://www.redfin.com/search?searchType=4&query=' + encodeURIComponent(propertyQuery) : '',
      realtor: propertyQuery ? 'https://www.realtor.com/realestateandhomes-search/' + encodeURIComponent(propertyQuery) : '',
      google_maps: propertyQuery ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(propertyQuery) : '',
      dcad: 'https://www.dallascad.org/SearchAddr.aspx',
      dcad_search: dcadQuery ? 'https://www.google.com/search?q=' + encodeURIComponent('site:dallascad.org ' + dcadQuery) : 'https://www.dallascad.org/SearchAddr.aspx'
    },
    sold: {
      zillow: soldQuery ? 'https://www.google.com/search?q=' + encodeURIComponent('site:zillow.com/homedetails ' + soldQuery) : '',
      redfin: soldQuery ? 'https://www.google.com/search?q=' + encodeURIComponent('site:redfin.com ' + soldQuery) : '',
      realtor: soldQuery ? 'https://www.google.com/search?q=' + encodeURIComponent('site:realtor.com/realestateandhomes-detail ' + soldQuery) : ''
    }
  };
}

function normalizeDallasCompCandidate(raw, options) {
  raw = raw || {};
  options = options || {};
  var capturedAt = options.capturedAt || new Date().toISOString();
  var source = cleanText(raw.source || options.source || 'manual');
  var status = cleanText(raw.sale_list_status || raw.status || raw.sale_status || raw.listing_status);
  var sourceUrl = cleanText(raw.source_url || raw.url || raw.listing_url);
  var confidenceText = cleanText(raw.confidence || raw.confidence_level || raw.verification_label || (raw.confidence_score ? String(raw.confidence_score) : 'unverified'));
  return {
    candidate_id: cleanText(raw.candidate_id || ('dallas-comp-' + capturedAt + '-' + Math.random().toString(36).slice(2, 8))),
    address: cleanText(raw.address || raw.title || raw.property_address),
    sale_list_status: status,
    status: status,
    sold_list_price: parseMoney(raw.sold_list_price || raw.price || raw.sale_price || raw.sold_price || raw.list_price || raw.amount),
    price: parseMoney(raw.sold_list_price || raw.price || raw.sale_price || raw.sold_price || raw.list_price || raw.amount),
    beds: parseNumber(raw.beds || raw.bedrooms) || '',
    baths: parseNumber(raw.baths || raw.bathrooms) || '',
    sqft: parseNumber(raw.sqft || raw.square_feet || raw.living_area) || '',
    distance: parseDistance(raw.distance || raw.distance_text || raw.distance_miles),
    source: source,
    source_url: sourceUrl,
    url: sourceUrl,
    confidence: confidenceText || 'unverified',
    confidence_reason: cleanText(raw.confidence_reason || raw.reason || 'Visible-page capture only. Operator must verify sold status, distance, condition, and property match.'),
    captured_at: capturedAt,
    unverified: true,
    verified: false,
    snippet: cleanText(raw.snippet || ''),
    date: cleanText(raw.date || raw.sale_date || raw.sold_date || raw.list_date || ''),
    market_support_only: !/sold|closed/i.test(status)
  };
}

function summarizeDallasCompCapture(candidates) {
  candidates = Array.isArray(candidates) ? candidates.map(function(candidate) {
    return normalizeDallasCompCandidate(candidate, { capturedAt: candidate && candidate.captured_at });
  }) : [];
  var soldVerified = candidates.filter(function(candidate) {
    return candidate.verified === true && /sold|closed/i.test(candidate.sale_list_status || '');
  }).length;
  var soldVisible = candidates.filter(function(candidate) {
    return /sold|closed/i.test(candidate.sale_list_status || '');
  }).length;
  var listOnly = candidates.length > 0 && candidates.every(function(candidate) {
    return !/sold|closed/i.test(candidate.sale_list_status || '');
  });
  var fields = ['address', 'sale_list_status', 'price', 'beds', 'baths', 'sqft', 'source', 'source_url', 'captured_at'];
  var present = 0;
  candidates.forEach(function(candidate) {
    fields.forEach(function(field) {
      if (cleanText(candidate[field]) || (typeof candidate[field] === 'number' && candidate[field] > 0)) present += 1;
    });
  });
  var denominator = candidates.length ? (fields.length * candidates.length) : fields.length;
  var completeness = Math.max(0, Math.min(100, Math.round((present / denominator) * 100)));
  return {
    candidate_count: candidates.length,
    sold_visible_count: soldVisible,
    verified_sold_count: soldVerified,
    list_only: listOnly,
    comp_completeness_score: completeness,
    arv_ready: soldVerified >= 3,
    mao_ready: soldVerified >= 3,
    guidance_label: soldVerified >= 3
      ? 'Verified sold comp set ready for ARV/MAO review.'
      : (listOnly ? 'Market support only.' : 'Needs manual comp review.'),
    safety_label: soldVerified >= 3
      ? 'Verified sold comps exist. Review manually before value decisions.'
      : 'Do not calculate ARV or MAO from these preview comps yet.'
  };
}

module.exports = {
  buildDallasCompCaptureContext: buildDallasCompCaptureContext,
  buildDallasCompCaptureLinks: buildDallasCompCaptureLinks,
  isDallasCompCaptureEligible: isDallasCompCaptureEligible,
  normalizeDallasCompCandidate: normalizeDallasCompCandidate,
  summarizeDallasCompCapture: summarizeDallasCompCapture
};
