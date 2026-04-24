const { findDeals: nycDeals }          = require('./sources/nyc');
const { findDeals: chicagoDeals }      = require('./sources/chicago');
const { findDeals: detroitDeals }      = require('./sources/detroit');
const { findDeals: philadelphiaDeals } = require('./sources/philadelphia');
const { findDeals: clevelandDeals }    = require('./sources/cleveland');
const { findDeals: baltimoreDeals }    = require('./sources/baltimore');

// Batch 2+ sources will be added here:
// const { findDeals: atlantaDeals }   = require('./sources/atlanta');
// const { findDeals: houstonDeals }   = require('./sources/houston');
// const { findDeals: laDeals }        = require('./sources/la');

async function dealEngine(state, limit) {
  state = state || 'NY';
  limit = Number(limit) || 20;
  let allDeals = [];

  try {
    // 1. RUN ALL SOURCES IN PARALLEL — each source handles its own errors
    const perSource = Math.ceil(limit / 6); // distribute limit across 6 sources

    const results = await Promise.allSettled([
      nycDeals(state, perSource),
      chicagoDeals(state, perSource),
      detroitDeals(state, perSource),
      philadelphiaDeals(state, perSource),
      clevelandDeals(state, perSource),
      baltimoreDeals(state, perSource)
    ]);

    results.forEach(function(r) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        allDeals = allDeals.concat(r.value);
      }
    });

    // 2. FILTER — remove any records with missing or invalid address
    allDeals = allDeals.filter(function(deal) {
      return deal.address && deal.address.trim().length > 3;
    });

    // 3. DEDUPE ACROSS ALL SOURCES
    const seen = new Set();
    const deduped = allDeals.filter(function(deal) {
      const key = (deal.address + '-' + deal.city + '-' + deal.state).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 4. SCORE — hook for existing AI scoring system
    const scored = deduped.map(function(deal) {
      return Object.assign({}, deal, {
        score: typeof deal.score === 'number' ? deal.score : (deal.motivation || 5)
      });
    });

    return scored.slice(0, limit);

  } catch (err) {
    console.error('Deal Engine Error:', err.message);
    return [];
  }
}

module.exports = { dealEngine };
