'use strict';

const leadEvidence = require('./lead-evidence');

function cleanText(value) {
  return leadEvidence.cleanText(value);
}

function uniqueList(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function hasStrategy(job, names) {
  const set = new Set((Array.isArray(job && job.strategies) ? job.strategies : []).map(cleanText));
  return names.some((name) => set.has(name));
}

function locationTerms(job) {
  const city = cleanText(job && (job.city || Array.isArray(job.cities) && job.cities[0])) || 'Dallas';
  const state = cleanText(job && (job.state || job.market_state)) || 'TX';
  const county = cleanText(job && (job.county || job.market_county));
  return { city, state, county, cityState: [city, state].filter(Boolean).join(' ') };
}

function addGroup(out, id, source, criterion, query, options) {
  const text = cleanText(query);
  if (!text) return;
  if (!options.includeAuction && /\b(auction|realauction|hubzu)\b/i.test(text)) return;
  if (!options.includeReo && /\b(REO|bank[- ]?owned|real estate owned)\b/i.test(text)) return;
  if (/\b(OpenData|archive|dataset|socrata|arcgis)\b/i.test(text)) return;
  if (/\b(sold only|sold history|sold archive)\b/i.test(text)) return;
  out.push({
    id,
    source,
    criterion,
    query: text,
    purpose: 'discovery_primary'
  });
}

function planGeminiQueryGroups(job, options = {}) {
  const loc = locationTerms(job);
  const includeAuction = (job && job.include_auction === true) || options.include_auction === true;
  const includeReo = (job && job.exclude_reo === false) || options.include_reo === true;
  const max = Math.max(1, Math.min(Number(options.max_query_groups || job && job.max_gemini_query_groups || 16) || 16, 20));
  const groups = [];
  const fixer = hasStrategy(job, ['fixer', 'ugly', 'as_is', 'needs_tlc', 'needs_work', 'investor_special', 'cash_only']);
  const price = hasStrategy(job, ['price_cut', 'price_reduction', 'long_dom', 'stale_listing']);
  const fsbo = hasStrategy(job, ['fsbo']);
  if (fixer || !Array.isArray(job && job.strategies) || !job.strategies.length) {
    addGroup(groups, 'redfin_investor_special', 'redfin', 'investor special', `site:redfin.com/TX/${loc.city} "${loc.cityState}" "investor special" "for sale"`, { includeAuction, includeReo });
    addGroup(groups, 'redfin_cash_only', 'redfin', 'cash only', `site:redfin.com/TX/${loc.city} "${loc.cityState}" "cash only" "for sale"`, { includeAuction, includeReo });
    addGroup(groups, 'redfin_as_is', 'redfin', 'as-is', `site:redfin.com/TX/${loc.city} "${loc.cityState}" "as-is" "for sale"`, { includeAuction, includeReo });
    addGroup(groups, 'redfin_needs_work', 'redfin', 'needs work', `site:redfin.com/TX/${loc.city} "${loc.cityState}" "needs work" OR "needs TLC"`, { includeAuction, includeReo });
    addGroup(groups, 'realtor_investor_special', 'realtor', 'investor special', `site:realtor.com/realestateandhomes-detail "${loc.cityState}" "investor special"`, { includeAuction, includeReo });
    addGroup(groups, 'realtor_cash_only', 'realtor', 'cash only', `site:realtor.com/realestateandhomes-detail "${loc.cityState}" "cash only"`, { includeAuction, includeReo });
    addGroup(groups, 'realtor_as_is', 'realtor', 'as-is', `site:realtor.com/realestateandhomes-detail "${loc.cityState}" "as-is"`, { includeAuction, includeReo });
    addGroup(groups, 'zillow_fixer', 'zillow', 'fixer', `site:zillow.com/homedetails "${loc.cityState}" fixer`, { includeAuction, includeReo });
  }
  if (/^(TX|Texas)$/i.test(loc.state)) {
    addGroup(groups, 'har_as_is', 'har', 'as-is', `site:har.com/homedetail "${loc.cityState}" "as-is"`, { includeAuction, includeReo });
    if (price) addGroup(groups, 'har_price_reduced', 'har', 'price reduced', `site:har.com/homedetail "${loc.cityState}" "price reduced"`, { includeAuction, includeReo });
  }
  if (price) {
    addGroup(groups, 'redfin_price_reduced', 'redfin', 'price reduced', `site:redfin.com/TX/${loc.city} "${loc.cityState}" "price reduced" fixer`, { includeAuction, includeReo });
    addGroup(groups, 'realtor_back_on_market', 'realtor', 'back on market', `site:realtor.com/realestateandhomes-detail "${loc.cityState}" "back on market"`, { includeAuction, includeReo });
  }
  if (fsbo) {
    addGroup(groups, 'fsbo_as_is', 'fsbo', 'FSBO as-is', `"${loc.cityState}" FSBO "as-is" "for sale by owner"`, { includeAuction, includeReo });
  }
  if (includeAuction) {
    addGroup(groups, 'auction_property', 'auction', 'auction', `site:auction.com/details "${loc.cityState}" property`, { includeAuction, includeReo });
  }
  return uniqueList(groups.map((group) => JSON.stringify(group))).map((value) => JSON.parse(value)).slice(0, max);
}

function queriesForPrompt(job, options) {
  return planGeminiQueryGroups(job, options).map((group) => group.query);
}

module.exports = {
  planGeminiQueryGroups,
  queriesForPrompt
};
