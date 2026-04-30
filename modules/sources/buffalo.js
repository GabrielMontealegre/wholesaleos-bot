const fetch = require('node-fetch');

async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    var cutoffStr = cutoff.toISOString().slice(0, 10);
    var offset = Math.floor(Math.random() * 500);

    var url = 'https://data.buffalony.gov/resource/n3mc-s7hw.json' +
      '?$limit=100&$offset=' + offset +
      '&$where=case_date%20%3E%3D%20%27' + cutoffStr + '%27' +
      '&$order=case_date%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.parcel_address || '').trim();
      if (!address) return;
      results.push({
        address:    address,
        city:       item.city || 'Buffalo',
        state:      'NY',
        source:     'Buffalo Housing Violation',
        motivation: 7,
        violations: 1,
        case_date:  item.case_date || null
      });
    });
    return results.slice(0, limit);
  } catch(err) {
    console.error('Buffalo source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
