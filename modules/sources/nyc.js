const fetch = require('node-fetch');

async function findDeals(state, limit) {
  state = state || 'NY';
  limit = limit || 20;
  try {
    var url = 'https://data.cityofnewyork.us/resource/wvxf-dwi5.json?$limit=' + limit;
    var resp = await fetch(url);
    var json = await resp.json();

    return json.map(function(item) {
      var data = item.address || item;
      var housenumber = data.housenumber || data.house_number || '';
      var streetname  = data.streetname  || data.street_name  || '';
      var boro        = data.boro        || data.borough       || 'New York';
      var address     = (housenumber && streetname)
        ? (housenumber + ' ' + streetname)
        : (streetname || 'Unknown Address');

      return {
        address:    address,
        city:       boro,
        state:      'NY',
        source:     'NYC Code Violation',
        motivation: 8,
        score:      8,
        violations: 1,
        raw:        item
      };
    });

  } catch(err) {
    console.error('NYC scraper error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
