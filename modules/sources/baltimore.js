const fetch = require('node-fetch');

// Source: Open Baltimore — Housing / building violations
// API: data.baltimorecity.gov (Socrata) — no key required
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var url = 'https://data.baltimorecity.gov/resource/wsfq-mvij.json?$limit=' + limit +
      '&$order=noticedate%20DESC';
    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.address || item.location || '').trim();
      if (!address) return;

      results.push({
        address:    address,
        city:       'Baltimore',
        state:      'MD',
        source:     'Baltimore Housing Violation',
        motivation: 8,
        violations: 1
      });
    });
    return results;

  } catch(err) {
    console.error('Baltimore source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
