const fetch = require('node-fetch');

async function findDeals(state = 'NY', limit = 5) {
  const deals = [];

  try {
    // NYC Open Data — Housing Maintenance Code Violations
    const url = `https://data.cityofnewyork.us/resource/wvxf-dwi5.json?$limit=${limit}`;

    const resp = await fetch(url);
    const json = await resp.json();

    // DEBUG: log first record so we see fields in Railway logs
    console.log("NYC DATA SAMPLE:", json[0]);

    json.forEach((item, i) => {

      // ✅ FIX: smarter address extraction (no fake placeholders)
      const address =
        (item.house_number && item.street_name)
          ? `${item.house_number} ${item.street_name}`
          : item.violation_location
          || item.address
          || item.location
          || item.street
          || null;

      deals.push({
        address: address || "Unknown Address",
        city: item.borough || item.city || "New York",
        state: "NY",
        motivation: 8,
        source: "NYC Code Violation"
      });
    });

    return deals;

  } catch (err) {
    console.error("Deal finder error:", err);
    return [];
  }
}

module.exports = { findDeals };
