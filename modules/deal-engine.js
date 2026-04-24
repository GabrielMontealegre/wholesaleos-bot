const { findDeals: nycDeals }          = require('./sources/nyc');
const { findDeals: chicagoDeals }      = require('./sources/chicago');
const { findDeals: detroitDeals }      = require('./sources/detroit');
const { findDeals: philadelphiaDeals } = require('./sources/philadelphia');
const { findDeals: clevelandDeals }    = require('./sources/cleveland');
const { findDeals: baltimoreDeals }    = require('./sources/baltimore');
const { findDeals: austinDeals }       = require('./sources/austin');
const { findDeals: seattleDeals }      = require('./sources/seattle');
const { findDeals: nolaDeals }         = require('./sources/nola');
const logger = require('pino')({ level: 'info' });

// Batch 3+ sources will be added here:
// const { findDeals: atlantaDeals }   = require('./sources/atlanta');
// const { findDeals: houstonDeals }   = require('./sources/houston');
// const { findDeals: laDeals }        = require('./sources/la');

async function dealEngine(state, limit) {
  state = state || 'NY';
  limit = Number(limit) || 20;
  let allDeals = [];

  try {
    // 1. RUN ALL SOURCES IN PARALLEL — each source handles its own errors
    const perSource = Math.ceil(limit / 9); // distribute limit across 9 sources

    const results = await Promise.allSettled([
      nycDeals(state, perSource),
      chicagoDeals(state, perSource),
      detroitDeals(state, perSource),
      philadelphiaDeals(state, perSource),
      clevelandDeals(state, perSource),
      baltimoreDeals(state, perSource),
      austinDeals(state, perSource),
      seattleDeals(state, perSource),
      nolaDeals(state, perSource)
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

        logger.info('Deals before filter:', allDeals.length);

    // 2b. WHOLESALING FILTER
    var ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    var thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    allDeals = allDeals.filter(function(deal) {
      var src = (deal.source || '').toLowerCase();
      var vs  = (deal.violationstatus || '').toLowerCase();
      var cs  = (deal.currentstatus  || '').toLowerCase();

      if (vs === 'open') return true;
      if (cs.indexOf('open') > -1 || cs.indexOf('not complied') > -1) return true;

      var wt = ['violation','tax','lien','foreclosure','probate','auction'];
      if (wt.some(function(t){ return src.indexOf(t) > -1; })) return true;

      var ds = deal.inspectiondate || deal.issueddate || deal.violationdate ||
               deal.opened_date   || deal.opendate    || deal.noticedate || '';
      if (ds) {
        var ts = Date.parse(ds);
        if (!isNaN(ts) && ts >= ninetyDaysAgo) return true;
        return false;
      }
      deal.freshness = 'unknown';
      return true;
    });

    logger.info('Deals after filter:', allDeals.length);

    // 2c. PRIORITY SCORING
    allDeals = allDeals.map(function(deal) {
      var src = (deal.source || '').toLowerCase();
      var vs  = (deal.violationstatus || '').toLowerCase();
      var cs  = (deal.currentstatus  || '').toLowerCase();
      var ds  = deal.inspectiondate || deal.issueddate || deal.violationdate ||
                deal.opened_date   || deal.opendate    || deal.noticedate || '';
      var ps  = 0;

      if (vs === 'open') ps += 3;
      if (cs.indexOf('not complied') > -1) ps += 3;
      if (ds) { var ts2 = Date.parse(ds); if (!isNaN(ts2) && ts2 >= thirtyDaysAgo) ps += 2; }
      if (src.indexOf('foreclosure') > -1 || src.indexOf('auction') > -1) ps += 2;
      if (src.indexOf('tax') > -1 || src.indexOf('lien') > -1) ps += 1;

      deal.priorityScore = ps;
      deal.priority = ps >= 6 ? 'HIGH' : ps >= 3 ? 'MEDIUM' : 'LOW';
      return deal;
    });

// 3. DEDUPE ACROSS ALL SOURCES
    const seen = new Set();
    const deduped = allDeals.filter(function(deal) {
      const key = (deal.address + '-' + deal.city + '-' + deal.state + '-' + (deal.source||'')).toLowerCase();
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
    logger.error('Deal Engine Error:', err.message);
    return [];
  }
}


// Daily ingestion runner — calls dealEngine across target states
async function runDailyIngestion() {
  const states = ['NY','IL','PA','OH','MD'];
  for (const state of states) {
    try {
      await dealEngine(state, 50);
    } catch (e) {
      logger.error('Daily ingestion error:', state, e.message);
    }
  }
  logger.info('Daily ingestion complete');
}

module.exports = { dealEngine, runDailyIngestion };