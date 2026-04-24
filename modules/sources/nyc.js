const fetch = require('node-fetch');

async function findDeals(state, limit) {
  state = state || 'NY';
  limit = limit || 20;
  try {
    // Date filter: inspectiondate within last 60 days
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    var cutoffStr = cutoff.toISOString().slice(0, 10);

    var offset = Math.floor(Math.random() * 500);
    var url = 'https://data.cityofnewyork.us/resource/wvxf-dwi5.json' +
      '?$limit=100&$offset=' + offset +
      '&$where=inspectiondate%20%3E%3D%20%27' + cutoffStr + '%27' +
      '&$order=inspectiondate%20DESC';

    var resp = await fetch(url);
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var data = item.address || item;
      var housenumber = data.housenumber || data.house_number || '';
      var streetname  = data.streetname  || data.street_name  || '';
      var boro        = data.boro        || data.borough       || 'New York';
      var address     = (housenumber && streetname)
        ? (housenumber + ' ' + streetname)
        : (streetname || '');
      if (!address) return;

      results.push({
        address:       address,
        city:          boro,
        state:         'NY',
        source:        'NYC Code Violation',
        motivation:    8,
        score:         8,
        violations:    1,
        inspectiondate: item.inspectiondate || null,
        raw:           item
      });
    });
    return results.slice(0, limit);

  } catch(err) {
    console.error('NYC scraper error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
