const fetch = require('node-fetch');

async function findDeals(state = 'NY', limit = 50) {
  const deals = [];

  try {
    const url = `https://data.cityofnewyork.us/resource/wvxf-dwi5.json?$limit=${limit}`;

    const resp = await fetch(url);
    const json = await resp.json();

    console.log("NYC DATA SAMPLE:", json[0]);

    // 🧠 STEP 1: normalize + dedupe by buildingid or address key
    const seen = new Map();

    json.forEach((item) => {
      const data = item.address || item;

      const housenumber = data.housenumber || data.house_number;
      const streetname = data.streetname || data.street_name;
      const boro = data.boro || data.borough;

      const address =
        (housenumber && streetname)
          ? `${housenumber} ${streetname}`
          : (streetname && boro)
            ? `${streetname}, ${boro}`
            : null;

      // 🧠 UNIQUE KEY (prevents duplicates)
      const key =
        data.buildingid ||
        data.bin ||
        address ||
        JSON.stringify(data);

      // 🚫 skip duplicates
      if (seen.has(key)) return;
      seen.set(key, true);

      deals.push({
        address: address || "Unknown Address",
        city: boro || "New York",
        state: "NY",
        motivation: 8,
        violations: 1, // we will upgrade later
        source: "NYC Code Violation"
      });
    });

    return deals.slice(0, 5);

  } catch (err) {
    console.error("Deal finder error:", err);
    return [];
  }
}

module.exports = { findDeals };
