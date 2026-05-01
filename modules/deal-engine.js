const { findDeals: nycDeals }          = require('./sources/nyc');
const { findDeals: chicagoDeals }      = require('./sources/chicago');
const { findDeals: detroitDeals }      = require('./sources/detroit');
const { findDeals: philadelphiaDeals } = require('./sources/philadelphia');
const { findDeals: clevelandDeals }    = require('./sources/cleveland');
const { findDeals: baltimoreDeals }    = require('./sources/baltimore');
const { findDeals: austinDeals }       = require('./sources/austin');
const { findDeals: seattleDeals }      = require('./sources/seattle');
const { findDeals: nolaDeals }         = require('./sources/nola');
const { findDeals: laDeals }           = require('./sources/los_angeles');
const { findDeals: bostonDeals }       = require('./sources/boston');
const { findDeals: kcDeals }           = require('./sources/kansas_city');
const { findDeals: fwDeals }           = require('./sources/fort_worth');
const { findDeals: buffaloDeals }      = require('./sources/buffalo');
const { findDeals: pittsburghDeals }   = require('./sources/pittsburgh');
const { findDeals: alleghenyDeals }    = require('./sources/allegheny');
const arcgisSources = require('./sources/arcgis_sources');
const openDataSources = require('./sources/open_data_sources');

// All active sources — add new sources here, no other file changes needed
const ALL_SOURCES = [
  { fn: nycDeals,          name: 'NYC' },
  { fn: chicagoDeals,      name: 'Chicago' },
  { fn: detroitDeals,      name: 'Detroit' },
  { fn: philadelphiaDeals, name: 'Philadelphia' },
  { fn: clevelandDeals,    name: 'Cleveland' },
  { fn: baltimoreDeals,    name: 'Baltimore' },
  { fn: austinDeals,       name: 'Austin' },
  { fn: seattleDeals,      name: 'Seattle' },
  { fn: nolaDeals,         name: 'New Orleans' },
  { fn: laDeals,           name: 'Los Angeles' },
  { fn: bostonDeals,       name: 'Boston' },
  { fn: kcDeals,           name: 'Kansas City' },
  { fn: fwDeals,           name: 'Fort Worth' },
  { fn: buffaloDeals,      name: 'Buffalo' },
  { fn: pittsburghDeals,   name: 'Pittsburgh' },
  { fn: alleghenyDeals,    name: 'Allegheny' },
];

async function dealEngine(state, limit) {
  state = state || 'NY';
  limit = Number(limit) || 20;
  let allDeals = [];

  try {
    const perSource = Math.ceil(limit / ALL_SOURCES.length);

    // Run all sources in parallel — each handles its own errors
    const results = await Promise.allSettled(
      ALL_SOURCES.map(function(s) { return s.fn(state, perSource); })
    );

    results.forEach(function(r) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        allDeals = allDeals.concat(r.value);
      }
    });

    console.log('Deals before filter:', allDeals.length);

    // Wholesaling filter
    var ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    var thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    allDeals = allDeals.filter(function(deal) {
      var src = (deal.source || '').toLowerCase();
      var vs  = (deal.violationstatus || '').toLowerCase();
      var cs  = (deal.currentstatus  || '').toLowerCase();
      if (vs === 'open') return true;
      if (cs.indexOf('open') > -1 || cs.indexOf('not complied') > -1) return true;
      var wt = ['violation','tax','lien','foreclosure','probate','auction','fire','blight'];
      if (wt.some(function(t){ return src.indexOf(t) > -1; })) return true;
      var ds = deal.inspectiondate || deal.issueddate || deal.violationdate ||
               deal.opened_date   || deal.opendate    || deal.noticedate || deal.date_case_opened ||
               deal.date_entered  || deal.case_date   || '';
      if (ds) {
        var ts = Date.parse(ds);
        if (!isNaN(ts) && ts >= ninetyDaysAgo) return true;
        return false;
      }
      deal.freshness = 'unknown';
      return true;
    });

    console.log('Deals after filter:', allDeals.length);

    // Address filter
    allDeals = allDeals.filter(function(deal) {
      return deal.address && deal.address.trim().length > 3;
    });

    // Priority scoring
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
      if (src.indexOf('fire') > -1) ps += 2;
      deal.priorityScore = ps;
      deal.priority = ps >= 6 ? 'HIGH' : ps >= 3 ? 'MEDIUM' : 'LOW';
      return deal;
    });

    // Deduplicate across all sources by address+city+state+source
    var seen = new Set();
    var deduped = allDeals.filter(function(deal) {
      var key = (deal.address + '-' + (deal.city||'') + '-' + (deal.state||'') + '-' + (deal.source||'')).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Score
    return deduped.map(function(deal) {
      return Object.assign({}, deal, {
        score: typeof deal.score === 'number' ? deal.score : (deal.motivation || 5)
      });
    }).slice(0, limit);

  } catch (err) {
    console.error('Deal Engine Error:', err.message);
    return [];
  }
}

async function runDailyIngestion() {
  const states = ['NY','IL','PA','OH','MD','CA','TX','MA','MO','WA','AZ','NC','TN'];
  for (const state of states) {
    try {
      await dealEngine(state, 50);
    } catch (e) {
      console.error('Daily ingestion error:', state, e.message);
    }
  }
  // ArcGIS sources
  try { await arcgisSources.fetchAllArcGIS(100); } catch(e) { console.error('[arcgis]', e.message); }
  // Open data sources
  try { await openDataSources.fetchAllOpenData(100); } catch(e) { console.error('[open-data]', e.message); }
  console.log('Daily ingestion complete');
}

module.exports = { dealEngine, runDailyIngestion };
