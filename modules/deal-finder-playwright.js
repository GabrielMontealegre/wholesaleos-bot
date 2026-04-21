const fetch = require('node-fetch');

async function findDeals(state = 'NY', limit = 5) {
  const deals = [];

  try {
    const url = `https://data.cityofnewyork.us/resource/wvxf-dwi5.json?$limit=${limit}`;

    const resp = await fetch(url);
    const json = await resp.json();

    console.log("NYC DATA SAMPLE:", json[0]);

    json.forEach((item) => {

      // 🧠 FIX: handle BOTH formats (flat + nested)
      const data = item.address || item;

      const housenumber = data.housenumber || data.house_number;
      const streetname = data.streetname || data.street_name;
      const boro = data.boro || data.borough;

      const address =
        (housenumber && streetname)
          ? `${housenumber} ${streetname}`
          : (streetname && boro)
            ? `${streetname}, ${boro}`
            : (data.zip)
              ? `ZIP ${data.zip}`
              : null;

      deals.push({
        address: address || "Unknown Address",
        city: boro || item.city || "New York",
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
