const fetch = require('node-fetch');

// Source: Seattle Code Complaints and Violations (Socrata)
// Date filter: opendate within last 60 days
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    var cutoffStr = cutoff.toISOString().slice(0, 10);

    var url = 'https://data.seattle.gov/resource/ez4a-iug7.json' +
      '?$limit=' + limit +
      '&$where=statuscurrent%20!%3D%20%27Completed%27%20AND%20opendate%20%3E%3D%20%27' + cutoffStr + '%27' +
      '&$order=opendate%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.originaladdress1 || '').trim();
      if (!address) return;

      results.push({
        address:    address,
        city:       (item.originalcity  || 'Seattle').trim(),
        state:      (item.originalstate || 'WA').trim(),
        source:     'Seattle Code Violation',
        motivation: 7,
        violations: 1,
        opendate:   item.opendate || null
      });
    });
    return results;

  } catch(err) {
    console.error('Seattle source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
