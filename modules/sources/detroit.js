const fetch = require('node-fetch');

// Source: Detroit Open Data — Blight violations with real addresses
// API: data.detroitmi.gov (Socrata) — no key required
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var url = 'https://data.detroitmi.gov/resource/s7dm-byad.json?$limit=' + limit +
      '&$order=ticket_issued_time%20DESC';
    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.violation_address || item.address || '').trim();
      if (!address) return;

      results.push({
        address:    address,
        city:       'Detroit',
        state:      'MI',
        source:     'Detroit Blight Violation',
        motivation: 8,
        violations: 1
      });
    });
    return results;

  } catch(err) {
    console.error('Detroit source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
