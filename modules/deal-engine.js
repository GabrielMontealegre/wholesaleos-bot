const { findDeals: nycDeals } = require('./sources/nyc');

// Later we will add:
// const { findDeals: laDeals } = require('./sources/la');
// const { findDeals: miamiDeals } = require('./sources/miami');
// const { findDeals: texasDeals } = require('./sources/texas');

async function dealEngine(state = 'NY', limit = 20) {
  let allDeals = [];

  try {
    // 1. RUN SOURCES (start with NYC only for now)
    let nyc = await nycDeals(state, limit);

    allDeals = allDeals.concat(nyc);

    // 2. NORMALIZE (already mostly done in scrapers)

    // 3. DEDUPE ACROSS ALL SOURCES
    const seen = new Set();

    const deduped = allDeals.filter((deal) => {
      const key = `${deal.address}-${deal.city}-${deal.state}`;

      if (seen.has(key)) return false;
      seen.add(key);

      return true;
    });

    // 4. APPLY EXISTING SCORING SYSTEM HOOK
    const scored = deduped.map((deal) => ({
      ...deal,
      score: deal.motivation || 5 // placeholder hook for your existing AI scoring system
    }));

    return scored.slice(0, limit);

  } catch (err) {
    console.error("Deal Engine Error:", err);
    return [];
  }
}

module.exports = { dealEngine };
