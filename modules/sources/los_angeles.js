const fetch = require('node-fetch');

async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    var cutoffStr = cutoff.toISOString().slice(0, 10);
    var offset = Math.floor(Math.random() * 500);

    var url = 'https://data.lacity.org/resource/2uz8-3tj3.json' +
      '?$limit=100&$offset=' + offset +
      '&$where=date%20%3E%3D%20%27' + cutoffStr + '%27' +
      '&$order=date%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.address || '').trim();
      if (!address) return;
      results.push({
        address:    address,
        city:       item.city || 'Los Angeles',
        state:      'CA',
        source:     'Los Angeles Code Violation',
        motivation: 8,
        violations: 1,
        date:  item.date || null
      });
    });
    return results.slice(0, limit);
  } catch(err) {
    console.error('Los Angeles source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
