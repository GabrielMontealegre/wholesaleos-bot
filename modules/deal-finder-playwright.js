const fetch = require('node-fetch');

async function findDeals(state = 'NY', limit = 5) {
  const deals = [];

  try {
    // NYC Open Data — Housing Maintenance Code Violations
    const url = `https://data.cityofnewyork.us/resource/wvxf-dwi5.json?$limit=${limit}`;

    const resp = await fetch(url);
    const json = await resp.json();

    // Debug (you can still see raw data in logs)
    console.log("NYC DATA SAMPLE:", json[0]);

    json.forEach((item, i) => {

      // ✅ SAFE ADDRESS EXTRACTION (FIXED)
      const address =
        item.street_address ||
        item.address ||
        item.violation_location ||
        item.location ||
        item.street_name ||
        (item.house_number && item.street_name
          ? `${item.house_number} ${item.street_name}`
          : null);

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
