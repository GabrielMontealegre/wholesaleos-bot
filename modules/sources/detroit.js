const fetch = require('node-fetch');

// Source: Detroit Open Data — Blight violations
// Date filter: ticket_issued_time within last 60 days
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);

    // Fetch more to allow for date filtering
    var offset = Math.floor(Math.random() * 500);
    var url = 'https://data.detroitmi.gov/resource/s7dm-byad.json' +
      '?$limit=100&$offset=' + offset +
      '&$order=ticket_issued_time%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.violation_address || item.address || '').trim();
      if (!address) return;

      // Date filter: skip records older than 60 days
      if (item.ticket_issued_time) {
        var ts = new Date(item.ticket_issued_time);
        if (!isNaN(ts) && ts < cutoff) return;
      }

      results.push({
        address:     address,
        city:        'Detroit',
        state:       'MI',
        source:      'Detroit Blight Violation',
        motivation:  8,
        violations:  1,
        issueddate:  item.ticket_issued_time || null
      });
    });
    return results.slice(0, limit);

  } catch(err) {
    console.error('Detroit source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
