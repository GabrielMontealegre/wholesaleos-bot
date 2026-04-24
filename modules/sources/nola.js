const fetch = require('node-fetch');

// Source: New Orleans Code Enforcement All Violations (Socrata)
// API: data.nola.gov/resource/3ehi-je3s.json
// Fields confirmed: location (full address), violation, caseid, violationdate
// Note: location field contains full address string e.g. '6218-6220 Wainwright Dr'
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var url = 'https://data.nola.gov/resource/3ehi-je3s.json' +
      '?$limit=' + limit +
      '&$order=violationdate%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.location || '').trim();
      if (!address) return; // skip missing address
      // location contains street address only — city is always New Orleans

      results.push({
        address:    address,
        city:       'New Orleans',
        state:      'LA',
        source:     'New Orleans Code Enforcement',
        motivation: 8,
        violations: 1
      });
    });
    return results;

  } catch(err) {
    console.error('NOLA source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
