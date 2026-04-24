const fetch = require('node-fetch');

// Source: Atlanta Open Data — Code Enforcement Cases
// API: opendata.atlantaga.gov (Socrata) — no key required
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var url = 'https://opendata.atlantaga.gov/resource/9uns-hy63.json?$limit=' + limit +
      '&$order=open_date DESC';
    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.address || item.property_address || item.location_address || '').trim();
      if (!address) return;

      results.push({
        address:    address,
        city:       'Atlanta',
        state:      'GA',
        source:     'Atlanta Code Enforcement',
        motivation: 7,
        violations: parseInt(item.number_of_violations || item.violation_count || '1', 10) || 1
      });
    });
    return results;

  } catch(err) {
    console.error('Atlanta source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
