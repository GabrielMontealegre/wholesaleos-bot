const fetch = require('node-fetch');

// Source: City of Chicago Building Violations (Socrata Open Data)
// API: data.cityofchicago.org — no key required
// Real building code violations with real addresses
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var url = 'https://data.cityofchicago.org/resource/22u3-xenr.json?$limit=' + limit +
      '&$where=violation_status%3D%27OPEN%27&$order=violation_date%20DESC';
    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.address || '').trim();
      if (!address) return; // skip if no address

      results.push({
        address:    address,
        city:       'Chicago',
        state:      'IL',
        source:     'Chicago Building Violation',
        motivation: 7,
        violations: parseInt(item.violation_count || '1', 10) || 1
      });
    });
    return results;

  } catch(err) {
    console.error('Chicago source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
