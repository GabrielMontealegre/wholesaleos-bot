const { chromium } = require('playwright');
const db = require('../db');
const { validateLead } = require('./lead-validator');

async function findDeals(state, limit = 25) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 }
  });

  const page = await context.newPage();
  const leads = [];

  try {
    await page.goto(`https://www.zillow.com/homes/${state}_rb/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await page.waitForTimeout(5000);

    // scroll to load listings
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(1500);
    }

    const cards = await page.$$('[data-test="property-card"]');

    for (let i = 0; i < cards.length && leads.length < limit; i++) {
      try {
        const address = await cards[i]
          .$eval('[data-test="property-card-addr"]', el => el.innerText)
          .catch(() => null);

        const price = await cards[i]
          .$eval('[data-test="property-card-price"]', el => el.innerText)
          .catch(() => null);

        if (!address || !price) continue;

        const lead = {
          address,
          price,
          state,
          source: 'Playwright Zillow',
          status: 'New Lead'
        };

        const validation = validateLead(lead, new Set());

        if (validation.valid) {
          db.addLead(lead);
          leads.push(lead);
        }
      } catch (err) {}
    }
  } catch (err) {
    console.error('Deal finder error:', err.message);
  }

  await browser.close();
  return leads;
}

module.exports = { findDeals };
