const fetch = require('node-fetch');

// Source: Austin Code Complaint Cases (Socrata)
// Date filter: opened_date within last 60 days
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    var cutoffStr = cutoff.toISOString().slice(0, 10);

    var offset = Math.floor(Math.random() * 500);
    var url = 'https://data.austintexas.gov/resource/6wtj-zbtb.json' +
      '?$limit=100&$offset=' + offset +
      '&$where=status%20!%3D%20%27Closed%27%20AND%20opened_date%20%3E%3D%20%27' + cutoffStr + '%27' +
      '&$order=opened_date%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.address || '').trim();
      if (!address) return;

      results.push({
        address:     address,
        city:        (item.city  || 'Austin').trim(),
        state:       (item.state || 'TX').trim(),
        source:      'Austin Code Complaint',
        motivation:  7,
        violations:  1,
        opened_date: item.opened_date || null
      });
    });
    return results;

  } catch(err) {
    console.error('Austin source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
