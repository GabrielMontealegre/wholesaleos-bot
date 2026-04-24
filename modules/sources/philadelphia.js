const fetch = require('node-fetch');

// Source: OpenDataPhilly — Property code violations
// API: phl.carto.com — no key required
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var url = 'https://phl.carto.com/api/v2/sql?q=' +
      encodeURIComponent(
        'SELECT address, violationcodetitle, casestatus FROM li_violations ' +
        'WHERE casestatus = \'OPEN\' ORDER BY violationdate DESC LIMIT ' + limit
      ) + '&format=json';
    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!json || !Array.isArray(json.rows)) return [];

    var results = [];
    json.rows.forEach(function(item) {
      var address = (item.address || '').trim();
      if (!address) return;

      results.push({
        address:    address,
        city:       'Philadelphia',
        state:      'PA',
        source:     'Philadelphia Code Violation',
        motivation: 7,
        violations: 1
      });
    });
    return results;

  } catch(err) {
    console.error('Philadelphia source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
