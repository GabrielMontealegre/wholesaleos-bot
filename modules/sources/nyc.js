const fetch = require('node-fetch');

async function findDeals(state = 'NY', limit = 20) {
  try {
    const url = `https://data.cityofnewyork.us/resource/wvxf-dwi5.json?$limit=${limit}`;

    const resp = await fetch(url);
    const json = await resp.json();

    return json.map((item) => {
      const data = item.address || item;

      const housenumber = data.housenumber || data.house_number;
      const streetname = data.streetname || data.street_name;
      const boro = data.boro || data.borough;

      const address =
        housenumber && streetname
          ? `${housenumber} ${streetname}`
          : streetname || "Unknown Address";

      return {
        address,
        city: boro || "New York",
        state: "NY",
        motivation: 8,
        source: "NYC Code Violation",
        raw: item
      };
    });

  } catch (err) {
    console.error("NYC scraper error:", err);
    return [];
  }
}

module.exports = { findDeals };
