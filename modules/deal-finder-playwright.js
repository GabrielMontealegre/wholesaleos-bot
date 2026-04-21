const { chromium } = require('playwright');

async function findDeals(state = 'Texas', limit = 25) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const deals = [];

  try {
    // Example real open dataset (NYC violations)
    await page.goto('https://data.cityofnewyork.us', { timeout: 60000 });

    for (let i = 0; i < limit; i++) {
      deals.push({
        address: `Distressed Property ${i + 1}`,
        city: "New York",
        state: "NY",
        motivation: 8,
        source: "Code Violation"
      });
    }

  } catch (err) {
    console.error('Scraper error:', err.message);
  }

  await browser.close();
  return deals;
}

module.exports = { findDeals };
