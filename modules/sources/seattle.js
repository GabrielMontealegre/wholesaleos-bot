const fetch = require('node-fetch');

// Source: Seattle Code Complaints and Violations (Socrata)
// API: data.seattle.gov/resource/ez4a-iug7.json
// Fields confirmed: originaladdress1, originalcity, originalstate, statuscurrent
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    // Filter: exclude completed cases to focus on active violations
    var url = 'https://data.seattle.gov/resource/ez4a-iug7.json' +
      '?$limit=' + limit +
      '&$where=statuscurrent%20!%3D%20%27Completed%27' +
      '&$order=opendate%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.originaladdress1 || '').trim();
      if (!address) return; // skip missing address

      results.push({
        address:    address,
        city:       (item.originalcity  || 'Seattle').trim(),
        state:      (item.originalstate || 'WA').trim(),
        source:     'Seattle Code Violation',
        motivation: 7,
        violations: 1
      });
    });
    return results;

  } catch(err) {
    console.error('Seattle source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
