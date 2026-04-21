const fetch = require('node-fetch');

async function findDeals(state = 'NY', limit = 5) {
  const deals = [];

  try {
    const url = `https://data.cityofnewyork.us/resource/wvxf-dwi5.json?$limit=${limit}`;

    const resp = await fetch(url);
    const json = await resp.json();

    console.log("NYC DATA SAMPLE:", json[0]);

    json.forEach((item) => {

      // ✅ FIX: address is inside a nested object now
      const addr = item.address || {};

      const address =
        (addr.housenumber && addr.streetname)
          ? `${addr.housenumber} ${addr.streetname}`
          : (addr.streetname && addr.boro)
            ? `${addr.streetname}, ${addr.boro}`
            : addr.zip
              ? `ZIP ${addr.zip}`
              : null;

      deals.push({
        address: address || "Unknown Address",
        city: addr.boro || item.city || "New York",
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
