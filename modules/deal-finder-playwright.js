const { chromium } = require('playwright');

async function findDeals(state = 'Texas', limit = 25) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const deals = [];

  try {
  await page.goto(
    'https://data.cityofnewyork.us/resource/jz4z-kudi.json?$limit=' + limit,
    { timeout: 60000 }
  );

  const data = await page.evaluate(() => document.body.innerText);
  const json = JSON.parse(data);

  json.forEach((item, i) => {
    deals.push({
      address: item.respondent || `NYC Violation ${i}`,
      city: "New York",
      state: "NY",
      motivation: 8,
      source: "NYC Code Violation"
    });
  });

} catch (err) {
  console.error('Scraper error:', err.message);
}

  await browser.close();
  return deals;
}

module.exports = { findDeals };
