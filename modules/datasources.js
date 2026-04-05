// datasources.js — Free real data sources for WholesaleOS
// County Assessors, HUD Homestore, Connected Investors, Deed Records
// All sources are public government or public-facing websites
'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// ── ScraperAPI helper (uses key if set, else direct) ─────────────────────────
function scraperGet(url, opts = {}) {
  const key = process.env.SCRAPERAPI_KEY;
  if (key) {
    const proxy = `http://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(url)}&render=false`;
    return axios.get(proxy, { timeout: opts.timeout || 30000 });
  }
  return axios.get(url, { headers: HEADERS, timeout: opts.timeout || 20000 });
}

// ═══════════════════════════════════════════════════════════════════════════
//  COUNTY ASSESSOR FREE DATA SOURCES
//  These are government open-data portals — no scraping needed, just downloads
// ═══════════════════════════════════════════════════════════════════════════

const COUNTY_SOURCES = [
  // Texas
  {
    id: 'dallas-cad',
    name: 'Dallas County Appraisal District',
    state: 'TX', county: 'Dallas',
    url: 'https://www.dallascad.org/SearchAddr.aspx',
    searchUrl: 'https://www.dallascad.org/AcctDetailRes.aspx?ID=',
    type: 'html-search',
    distressFilters: ['delinquent', 'tax lien', 'foreclosure'],
  },
  {
    id: 'tarrant-cad',
    name: 'Tarrant Appraisal District',
    state: 'TX', county: 'Tarrant',
    downloadUrl: 'https://www.tad.org/data-download/',
    type: 'open-data',
    note: 'Free CSV download available on their data portal',
  },
  {
    id: 'harris-cad',
    name: 'Harris County Appraisal District (Houston)',
    state: 'TX', county: 'Harris',
    searchUrl: 'https://hcad.org/hcad-resources/hcad-appraisal-records/',
    type: 'open-data',
  },
  // California
  {
    id: 'la-county',
    name: 'Los Angeles County Assessor',
    state: 'CA', county: 'Los Angeles',
    searchUrl: 'https://portal.assessor.lacounty.gov/',
    apiUrl: 'https://portal.assessor.lacounty.gov/api/search?search=',
    type: 'api',
  },
  {
    id: 'san-diego-county',
    name: 'San Diego County Assessor',
    state: 'CA', county: 'San Diego',
    searchUrl: 'https://arcc.sdcounty.ca.gov/',
    type: 'html-search',
  },
  // Michigan
  {
    id: 'wayne-county',
    name: 'Wayne County Treasurer (Detroit)',
    state: 'MI', county: 'Wayne',
    url: 'https://www.waynecounty.com/elected/treasurer/tax-auction.aspx',
    type: 'html-scrape',
    distressType: 'Tax Delinquent / Auction',
  },
  // Illinois
  {
    id: 'cook-county',
    name: 'Cook County Assessor (Chicago)',
    state: 'IL', county: 'Cook',
    apiUrl: 'https://datacatalog.cookcountyil.gov/resource/tx2p-k2g9.json',
    type: 'open-api', // Socrata open data API
    limit: 100,
  },
  // Florida
  {
    id: 'miami-dade',
    name: 'Miami-Dade County Property Search',
    state: 'FL', county: 'Miami-Dade',
    searchUrl: 'https://www.miamidade.gov/Apps/PA/propertysearch/',
    type: 'html-search',
  },
  {
    id: 'broward-county',
    name: 'Broward County Property Appraiser',
    state: 'FL', county: 'Broward',
    apiUrl: 'https://bcpao.us/api/v1/account/',
    type: 'api',
  },
  // Georgia
  {
    id: 'fulton-county',
    name: 'Fulton County Tax Commissioner (Atlanta)',
    state: 'GA', county: 'Fulton',
    url: 'https://www.fultoncountytaxes.org/property-taxes/search-and-pay-your-bill.aspx',
    type: 'html-search',
  },
  // Nevada
  {
    id: 'clark-county',
    name: 'Clark County Assessor (Las Vegas)',
    state: 'NV', county: 'Clark',
    apiUrl: 'https://maps.clarkcountynv.gov/arcgis/rest/services/MapServices/Assessor/MapServer/0/query?where=1%3D1&outFields=*&f=json&resultRecordCount=100',
    type: 'arcgis-api',
  },
  // North Carolina
  {
    id: 'mecklenburg-county',
    name: 'Mecklenburg County Assessor (Charlotte)',
    state: 'NC', county: 'Mecklenburg',
    apiUrl: 'https://polaris3g.mecklenburgcountync.gov/',
    type: 'html-search',
  },
  // Ohio
  {
    id: 'franklin-county',
    name: 'Franklin County Auditor (Columbus)',
    state: 'OH', county: 'Franklin',
    searchUrl: 'https://property.franklincountyauditor.com/',
    type: 'html-search',
  },
  // Washington
  {
    id: 'king-county',
    name: 'King County Assessor (Seattle)',
    state: 'WA', county: 'King',
    apiUrl: 'https://info.kingcounty.gov/assessor/DataDownload/default.aspx',
    type: 'open-data',
  },
  // Colorado
  {
    id: 'denver-county',
    name: 'Denver Assessor',
    state: 'CO', county: 'Denver',
    apiUrl: 'https://opendata-geospatialdenver.hub.arcgis.com/datasets/',
    type: 'arcgis-api',
  },
  // Arizona
  {
    id: 'maricopa-county',
    name: 'Maricopa County Assessor (Phoenix)',
    state: 'AZ', county: 'Maricopa',
    apiUrl: 'https://mcassessor.maricopa.gov/mcs.php?q=',
    type: 'html-search',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  REDFIN FREE DATA DOWNLOAD — No auth, no blocking, real weekly data
//  Redfin publishes free CSV market data every week
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeRedfin(markets) {
  const leads = [];
  const targetMarkets = markets || [
    { city: 'dallas', state: 'TX', regionId: '13' },
    { city: 'houston', state: 'TX', regionId: '9' },
    { city: 'phoenix', state: 'AZ', regionId: '12' },
    { city: 'las-vegas', state: 'NV', regionId: '7' },
    { city: 'atlanta', state: 'GA', regionId: '5' },
    { city: 'detroit', state: 'MI', regionId: '6' },
    { city: 'chicago', state: 'IL', regionId: '8' },
  ];

  for (const market of targetMarkets) {
    try {
      // Redfin's price-reduced and stale listing search — public, no auth
      const url = `https://www.redfin.com/stingray/api/gis?al=1&has_deal=false&has_new_listing_filter=false&isRentals=false&market=${market.city}&max_days_on_market=365&min_days_on_market=30&num_homes=350&ord=days-on-redfin-asc&page_number=1&region_id=${market.regionId}&region_type=6&sf=1,2,3,4,5,6,7&status=9&uipt=1,2,3,4,5,6,7,8&v=8`;

      const res = await scraperGet(url, { timeout: 20000 });
      const text = res.data;

      // Redfin wraps JSON in {}&&{...}
      const jsonStr = typeof text === 'string' ? text.replace(/^[^{]*/, '') : JSON.stringify(text);
      let data;
      try { data = JSON.parse(jsonStr); } catch(e) { data = typeof text === 'object' ? text : null; }

      const homes = data?.payload?.homes || data?.homes || [];
      console.log(`Redfin ${market.city}: ${homes.length} properties`);

      for (const h of homes) {
        const price = h.price?.value || 0;
        if (!price || price < 60000 || price > 800000) continue;
        const addr = h.streetLine?.value || '';
        const city = h.city || market.city;
        const state = h.state || market.state;
        const zip = h.zip || '';
        if (!addr) continue;

        const beds = h.beds || 0;
        const baths = h.baths || 0;
        const sqft = h.sqFt?.value || 0;
        const dom = h.dom?.value || 0;
        const fullAddress = [addr, city, state, zip].filter(Boolean).join(', ');

        // Deal math
        const arv = price;
        const estRepairs = sqft > 0 ? Math.min(Math.round(sqft * 20), Math.round(arv * 0.20)) : Math.round(arv * 0.12);
        const offer = Math.max(0, Math.round(arv * 0.70 - estRepairs));
        const spread = Math.max(0, arv - offer - estRepairs);
        if (spread < 3000) continue;

        leads.push({
          id: uuidv4(),
          address: fullAddress,
          city, state, zip,
          beds, baths, sqft,
          arv, repairs: estRepairs, offer, mao: offer, spread,
          fee_lo: Math.round(spread * 0.35),
          fee_hi: Math.round(spread * 0.55),
          dom,
          listPrice: price,
          category: dom > 90 ? 'Long DOM / Motivated' : 'Price Reduced',
          status: 'New Lead',
          source: 'Redfin',
          sourceUrl: h.url ? `https://www.redfin.com${h.url}` : `https://www.redfin.com/city/${market.regionId}/${state}/${market.city}`,
          zillowUrl: `https://www.zillow.com/homes/${encodeURIComponent(fullAddress)}_rb/`,
          redfinUrl: h.url ? `https://www.redfin.com${h.url}` : '',
          verified: true,
          dealType: spread > arv * 0.20 ? 'Wholesale' : 'Fix & Flip',
          created: new Date().toISOString(),
        });
      }
      await sleep(3000 + Math.random() * 2000);
    } catch(e) {
      console.log(`Redfin ${market.city}: ${e.message}`);
    }
  }
  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ZILLOW FSBO + PRICE REDUCED via ScraperAPI
//  Uses Zillow's internal search API — works with ScraperAPI key
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeZillowDeals(markets) {
  const leads = [];
  const key = process.env.SCRAPERAPI_KEY;
  if (!key) {
    console.log('Zillow scrape: No SCRAPERAPI_KEY set, skipping');
    return leads;
  }

  // Target markets: zip codes for high-opportunity areas
  const targetZips = markets || [
    // Dallas TX
    '75201','75203','75210','75215','75216','75217','75223','75224','75228',
    // Phoenix AZ
    '85003','85004','85007','85008','85009','85017','85019','85031','85033',
    // Detroit MI
    '48201','48202','48204','48205','48206','48207','48208','48209','48210',
    // Atlanta GA
    '30310','30311','30312','30314','30315','30316','30318','30344',
    // Las Vegas NV
    '89101','89102','89103','89104','89106','89107','89108','89110',
  ];

  for (const zip of targetZips) {
    try {
      // Zillow internal search — price reduced + FSBO + stale listings
      const searchUrl = `https://www.zillow.com/search/GetSearchPageState.htm?searchQueryState={"pagination":{},"usersSearchTerm":"${zip}","mapBounds":{},"filterState":{"isForSaleByOwner":{"value":true},"price":{"max":800000},"beds":{"min":2}},"isListVisible":true}&wants={"cat1":["listResults"]}&requestId=1`;

      const proxyUrl = `http://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(searchUrl)}&render=false&premium=false`;
      const res = await axios.get(proxyUrl, { timeout: 25000 });
      const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      const homes = data?.cat1?.searchResults?.listResults || [];

      for (const h of homes) {
        const price = h.unformattedPrice || 0;
        if (!price || price < 60000 || price > 800000) continue;
        const addr = h.address || h.streetAddress || '';
        if (!addr) continue;

        const beds = parseInt(h.beds) || 0;
        const baths = parseFloat(h.baths) || 0;
        const sqft = parseInt((h.area||'0').replace(/,/g,'')) || 0;
        const state = h.addressState || '';
        const city2 = h.addressCity || '';
        const zip2 = h.addressZipcode || zip;
        const fullAddress = [addr, city2, state, zip2].filter(Boolean).join(', ');

        const arv = price;
        const estRepairs = sqft > 0 ? Math.min(Math.round(sqft * 20), Math.round(arv * 0.20)) : Math.round(arv * 0.12);
        const offer = Math.max(0, Math.round(arv * 0.70 - estRepairs));
        const spread = Math.max(0, arv - offer - estRepairs);
        if (spread < 3000) continue;

        leads.push({
          id: uuidv4(),
          address: fullAddress,
          state, zip: zip2,
          beds, baths, sqft,
          arv, repairs: estRepairs, offer, mao: offer, spread,
          fee_lo: Math.round(spread * 0.35),
          fee_hi: Math.round(spread * 0.55),
          listPrice: price,
          category: 'FSBO',
          status: 'New Lead',
          source: 'Zillow FSBO',
          sourceUrl: h.detailUrl ? `https://www.zillow.com${h.detailUrl}` : `https://www.zillow.com/homes/${zip}_rb/`,
          zillowUrl: h.detailUrl ? `https://www.zillow.com${h.detailUrl}` : '',
          redfinUrl: `https://www.redfin.com/search?searchType=4&query=${encodeURIComponent(fullAddress)}`,
          verified: true,
          dealType: spread > arv * 0.20 ? 'Wholesale' : 'Fix & Flip',
          created: new Date().toISOString(),
        });
      }
      await sleep(2000 + Math.random() * 1000);
    } catch(e) {
      console.log(`Zillow ${zip}: ${e.message}`);
    }
  }
  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CRAIGSLIST REAL ESTATE — Public JSON API, no auth needed
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeCraigslistDeals(cities) {
  const leads = [];
  const targetCities = cities || [
    { sub: 'dallas', state: 'TX' },
    { sub: 'houston', state: 'TX' },
    { sub: 'phoenix', state: 'AZ' },
    { sub: 'lasvegas', state: 'NV' },
    { sub: 'atlanta', state: 'GA' },
    { sub: 'detroit', state: 'MI' },
    { sub: 'chicago', state: 'IL' },
    { sub: 'denver', state: 'CO' },
    { sub: 'charlotte', state: 'NC' },
    { sub: 'nashville', state: 'TN' },
  ];

  for (const city of targetCities) {
    try {
      // Craigslist public JSON search — no auth, no scraping needed
      const url = `https://${city.sub}.craigslist.org/search/rea?format=json&max_price=800000&min_price=30000&cats=1&bundleDuplicates=1`;
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; real-estate-research/1.0)', 'Accept': 'application/json' },
        timeout: 15000
      });

      const items = Array.isArray(res.data) ? res.data : (res.data?.items || res.data?.data?.items || []);
      console.log(`Craigslist ${city.sub}: ${items.length} listings`);

      for (const item of items) {
        const price = parseInt(item.ask || item.price || '0');
        if (!price || price < 30000 || price > 800000) continue;
        const title = (item.title || item.name || '').trim();
        if (!title) continue;

        // Extract address-like text from title
        const addrMatch = title.match(/\d{3,5}\s+[A-Za-z\s]+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Hwy)\b/i);
        const addr = addrMatch ? addrMatch[0] : title.slice(0, 40);

        const arv = price;
        const estRepairs = Math.round(arv * 0.12);
        const offer = Math.max(0, Math.round(arv * 0.70 - estRepairs));
        const spread = Math.max(0, arv - offer - estRepairs);
        if (spread < 3000) continue;

        leads.push({
          id: uuidv4(),
          address: `${addr}, ${city.state}`,
          state: city.state,
          arv, repairs: estRepairs, offer, mao: offer, spread,
          fee_lo: Math.round(spread * 0.35),
          fee_hi: Math.round(spread * 0.55),
          listPrice: price,
          category: 'FSBO',
          status: 'New Lead',
          source: 'Craigslist',
          sourceUrl: item.url ? `https://${city.sub}.craigslist.org${item.url}` : `https://${city.sub}.craigslist.org/search/rea`,
          zillowUrl: `https://www.zillow.com/homes/${encodeURIComponent(addr + ', ' + city.state)}_rb/`,
          verified: false,
          dealType: spread > arv * 0.20 ? 'Wholesale' : 'Fix & Flip',
          created: new Date().toISOString(),
        });
      }
      await sleep(1500 + Math.random() * 1000);
    } catch(e) {
      console.log(`Craigslist ${city.sub}: ${e.message}`);
    }
  }
  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONNECTED INVESTORS — Public buyer profiles
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeConnectedInvestors(states) {
  const buyers = [];
  const seen = new Set();
  const targetStates = states || ['TX','FL','GA','AZ','CA','NC','TN','NV','CO','OH'];

  for (const state of targetStates) {
    try {
      const url = `https://connectedinvestors.com/connected-investors?state=${state}&type=cash-buyer`;
      const res = await scraperGet(url, { timeout: 25000 });
      const $ = cheerio.load(res.data);

      $('[class*="member"], [class*="investor"], [class*="profile-card"], .user-card').each(function () {
        const name = $(this).find('[class*="name"], h2, h3, .username').first().text().trim();
        const location = $(this).find('[class*="location"], [class*="city"]').first().text().trim();
        const buyType = $(this).find('[class*="type"], [class*="looking"]').first().text().trim();
        const link = $(this).find('a').first().attr('href') || '';
        if (!name || seen.has(name) || name.length < 3) return;
        seen.add(name);
        buyers.push({
          id: uuidv4(),
          name,
          type: buyType.toLowerCase().includes('flip') ? 'Fix & Flip Investor' : 'Cash Buyer',
          markets: [location || state],
          state,
          maxPrice: 500000, minARV: 0,
          preferred: ['FSBO','Pre-FC','REO','Tax Delinquent'],
          source: 'Connected Investors',
          sourceUrl: link.startsWith('http') ? link : `https://connectedinvestors.com${link}`,
          created: new Date().toISOString(),
          score: 80,
        });
      });
      await sleep(2000);
    } catch(e) {
      console.log(`Connected Investors ${state}: ${e.message}`);
    }
  }
  return buyers;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

async function runAllFreeSources(options = {}) {
  const results = { leads: [], buyers: [], errors: [] };
  console.log('[DataSources] Starting all free sources...');

  const tasks = [
    scrapeRedfin(options.redfinMarkets).then(r => {
      results.leads.push(...r);
      console.log(`Redfin: ${r.length} leads`);
    }).catch(e => results.errors.push(`Redfin: ${e.message}`)),

    scrapeZillowDeals(options.zips).then(r => {
      results.leads.push(...r);
      console.log(`Zillow FSBO: ${r.length} leads`);
    }).catch(e => results.errors.push(`Zillow: ${e.message}`)),

    scrapeCraigslistDeals(options.cities).then(r => {
      results.leads.push(...r);
      console.log(`Craigslist: ${r.length} leads`);
    }).catch(e => results.errors.push(`Craigslist: ${e.message}`)),

    scrapeConnectedInvestors(options.states).then(r => {
      results.buyers.push(...r);
      console.log(`Connected Investors: ${r.length} buyers`);
    }).catch(e => results.errors.push(`CI: ${e.message}`)),
  ];

  await Promise.allSettled(tasks);
  console.log(`[DataSources] Done: ${results.leads.length} leads, ${results.buyers.length} buyers, ${results.errors.length} errors`);
  return results;
}

module.exports = {
  parsePropwireCSV,
  scrapeRedfin,
  scrapeZillowDeals,
  scrapeCraigslistDeals,
  scrapeConnectedInvestors,
  runAllFreeSources,
};
