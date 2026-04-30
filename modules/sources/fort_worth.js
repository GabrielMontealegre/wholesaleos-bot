const fetch = require('node-fetch');

async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    var cutoffStr = cutoff.toISOString().slice(0, 10);
    var offset = Math.floor(Math.random() * 500);

    var url = 'https://data.fortworthtexas.gov/resource/spnu-bq4u.json' +
      '?$limit=100&$offset=' + offset +
      '&$where=date_entered%20%3E%3D%20%27' + cutoffStr + '%27' +
      '&$order=date_entered%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.address || '').trim();
      if (!address) return;
      results.push({
        address:    address,
        city:       item.city || 'Fort Worth',
        state:      'TX',
        source:     'Fort Worth Code Violation',
        motivation: 7,
        violations: 1,
        date_entered:  item.date_entered || null
      });
    });
    return results.slice(0, limit);
  } catch(err) {
    console.error('Fort Worth source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
