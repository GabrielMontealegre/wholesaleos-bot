const fetch = require('node-fetch');

async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    var cutoffStr = cutoff.toISOString().slice(0, 10);
    var offset = Math.floor(Math.random() * 500);

    var url = 'https://data.wprdc.org/api/3/action/datastore_search?resource_id=c4b55df5-dc71-4a7f-89af-42d45a01d50a' +
      '?$limit=100&$offset=' + offset +
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
        city:       item.city || 'Pittsburgh',
        state:      'PA',
        source:     'Allegheny Tax Lien',
        motivation: 9,
        violations: 1,
        freshness: 'unknown'
      });
    });
    return results.slice(0, limit);
  } catch(err) {
    console.error('Pittsburgh source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
