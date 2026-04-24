const fetch = require('node-fetch');

// Source: Houston Open Data — 311 Code Enforcement Complaints
// API: cohgis.houstontx.gov / Houston Open Data (Socrata) — no key required
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var url = 'https://data.houstontx.gov/resource/wkm4-hbek.json?$limit=' + limit +
      '&$where=ticket_status=%27OPEN%27&$order=created_date DESC';
    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.street_address || item.address || item.sr_location || '').trim();
      if (!address) return;

      results.push({
        address:    address,
        city:       'Houston',
        state:      'TX',
        source:     'Houston 311 Code Enforcement',
        motivation: 7,
        violations: 1
      });
    });
    return results;

  } catch(err) {
    console.error('Houston source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
