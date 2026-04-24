const fetch = require('node-fetch');

// Source: Open Baltimore — Housing / building violations
// Date filter: noticedate within last 60 days
async function findDeals(state, limit) {
  limit = limit || 20;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);

    var offset = Math.floor(Math.random() * 500);
    var url = 'https://data.baltimorecity.gov/resource/wsfq-mvij.json' +
      '?$limit=100&$offset=' + offset +
      '&$order=noticedate%20DESC';

    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    var json = await resp.json();
    if (!Array.isArray(json)) return [];

    var results = [];
    json.forEach(function(item) {
      var address = (item.address || item.location || '').trim();
      if (!address) return;

      // Date filter: skip records older than 60 days
      if (item.noticedate) {
        var ts = new Date(item.noticedate);
        if (!isNaN(ts) && ts < cutoff) return;
      }

      results.push({
        address:     address,
        city:        'Baltimore',
        state:       'MD',
        source:      'Baltimore Housing Violation',
        motivation:  8,
        violations:  1,
        noticedate:  item.noticedate || null
      });
    });
    return results.slice(0, limit);

  } catch(err) {
    console.error('Baltimore source error:', err.message);
    return [];
  }
}

module.exports = { findDeals };
