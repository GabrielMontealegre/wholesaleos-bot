const fetch = require('node-fetch');

// Source: City of Chicago Building Violations (Socrata Open Data)
// Date filter: violation_date within last 60 days
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    var cutoffStr = cutoff.toISOString().slice(0, 10);

    var offset = Math.floor(Math.random() * 500);
    var url = 'https://data.cityofchicago.org/resource/22u3-xenr.json' +
      '?$limit=100&$offset=' + offset +
      '&$where=violation_status%3D%27OPEN%27%20AND%20violation_date%20%3E%3D%20%27' + cutoffStr + '%27' +
      '&$order=violation_date%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.address || '').trim();
      if (!address) return;

      results.push({
        address:        address,
        city:           'Chicago',
        state:          'IL',
        source:         'Chicago Building Violation',
        motivation:     7,
        violations:     parseInt(item.violation_count || '1', 10) || 1,
        violationdate:  item.violation_date || null
      });
    });
    return results;

  } catch(err) {
    console.error('Chicago source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
