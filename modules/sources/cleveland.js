const fetch = require('node-fetch');

// Source: Cuyahoga County Land Bank / Tax Delinquent Properties
// NOTE: no date field available in this API — date filtering skipped
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var url = 'https://data.cuyahogacounty.gov/resource/fzp3-tv2q.json?$limit=' + limit +
      '&$order=delinquency_year%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var street = (item.property_address || item.address || '').trim();
      if (!street) return;

      results.push({
        address:    street,
        city:       item.city || 'Cleveland',
        state:      'OH',
        source:     'Cuyahoga Tax Delinquent',
        motivation: 9,
        violations: 1
      });
    });
    return results;

  } catch(err) {
    console.error('Cleveland source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
