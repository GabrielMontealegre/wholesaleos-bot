const fetch = require('node-fetch');

// Source: New Orleans Code Enforcement All Violations (Socrata)
// Date filter: violationdate within last 60 days
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    var cutoffStr = cutoff.toISOString().slice(0, 10);

    var offset = Math.floor(Math.random() * 500);
    var url = 'https://data.nola.gov/resource/3ehi-je3s.json' +
      '?$limit=100&$offset=' + offset +
      '&$where=violationdate%20%3E%3D%20%27' + cutoffStr + '%27' +
      '&$order=violationdate%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.location || '').trim();
      if (!address) return;

      results.push({
        address:       address,
        city:          'New Orleans',
        state:         'LA',
        source:        'New Orleans Code Enforcement',
        motivation:    8,
        violations:    1,
        violationdate: item.violationdate || null
      });
    });
    return results;

  } catch(err) {
    console.error('NOLA source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
