const { chromium } = require('playwright');
const db = require('../db');
const { validateLead } = require('./lead-validator');

async function findDeals(state, limit = 25) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const leads = [];

  try {
    await page.goto('https://www.zillow.com', { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(2000);

    await page.fill('input[type="text"]', state);
    await page.keyboard.press('Enter');

    await page.waitForTimeout(4000);

    const cards = await page.$$('article');

    for (let i = 0; i < cards.length && leads.length < limit; i++) {
      try {
        const address = await cards[i].$eval('address', el => el.innerText).catch(()=>null);
        const price = await cards[i].$eval('[data-test="property-card-price"]', el => el.innerText).catch(()=>null);

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
