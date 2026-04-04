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
//  HUD HOMESTORE — Government foreclosure listings, always free
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeHUDHomestore(states) {
  const leads = [];
  const targetStates = states || ['TX','FL','GA','AZ','NC','OH','MI','IL','CA','NV','CO','TN','MO','IN','PA','VA','WA'];

  for (const state of targetStates) {
    try {
      // HUD has a public search that returns real foreclosure listings
      const url = `https://www.hudhomestore.gov/Listing/PropertyListing.aspx?sState=${state}&iBedrooms=0&sBaths=0&sPropertyType=SFR&sPropCond=&sHudHomeType=&iIncentive=0&sListingId=&iBuyerType=0&iPage=1&sCity=&sZip=&sCounty=`;
      const res = await scraperGet(url, { timeout: 25000 });
      const $ = cheerio.load(res.data);

      // Parse HUD table rows
      $('tr[class*="SearchResult"], tr:has(td[id*="tdAddress"])').each(function () {
        try {
          const cells = $(this).find('td');
          if (cells.length < 4) return;
          const address = $(cells[0]).text().trim() || $(cells[1]).text().trim();
          const city    = $(cells[1]).text().trim();
          const priceText = $(this).text().match(/\$[\d,]+/);
          const price   = priceText ? parseInt(priceText[0].replace(/[$,]/g,'')) : 0;
          const beds    = parseInt($(this).text().match(/(\d+)\s*BR/)?.[1] || '0');
          if (!address || address.length < 5) return;

          leads.push({
            id: uuidv4(),
            address: `${address}, ${city}, ${state}`,
            listPrice: price,
            beds, baths: 0,
            state,
            category: 'HUD / REO',
            source: 'HUD Homestore',
            sourceUrl: `https://www.hudhomestore.gov/Listing/PropertyListing.aspx?sState=${state}`,
            status: 'Review Queue',
            verified: false,
            distressType: 'Government Foreclosure — HUD REO',
            created: new Date().toISOString(),
          });
        } catch(e) {}
      });

      // Also try the newer HUD listing format
      $('[class*="property"], .listing-row, [id*="property"]').each(function () {
        const text = $(this).text();
        const addrMatch = text.match(/\d+\s+[A-Za-z\s]+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl)\b/i);
        const priceMatch = text.match(/\$[\d,]+/);
        if (addrMatch && priceMatch) {
          leads.push({
            id: uuidv4(),
            address: `${addrMatch[0].trim()}, ${state}`,
            listPrice: parseInt(priceMatch[0].replace(/[$,]/g,'')),
            state,
            category: 'HUD / REO',
            source: 'HUD Homestore',
            sourceUrl: url,
            status: 'Review Queue',
            verified: false,
            created: new Date().toISOString(),
          });
        }
      });

      await sleep(2000);
    } catch(e) {
      console.log(`HUD ${state}: ${e.message}`);
    }
  }
  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════
//  COOK COUNTY (CHICAGO) — Socrata Open Data API — Free, no key needed
// ═══════════════════════════════════════════════════════════════════════════

async function getCookCountyForeclosures() {
  const leads = [];
  try {
    // Cook County publishes foreclosure data via Socrata (free, no auth)
    const url = 'https://datacatalog.cookcountyil.gov/resource/tx2p-k2g9.json?$limit=200&$order=filing_date DESC';
    const res = await axios.get(url, { headers: { 'Accept': 'application/json' }, timeout: 15000 });
    const data = Array.isArray(res.data) ? res.data : [];

    for (const row of data) {
      if (!row.property_address) continue;
      leads.push({
        id: uuidv4(),
        address: `${row.property_address}, ${row.municipality || 'Chicago'}, IL`,
        state: 'IL', county: 'Cook',
        category: 'Pre-FC',
        distressType: 'Pre-Foreclosure — Cook County',
        filingDate: row.filing_date,
        caseNumber: row.case_number,
        lender: row.plaintiff,
        source: 'Cook County Open Data',
        sourceUrl: 'https://datacatalog.cookcountyil.gov',
        status: 'Review Queue',
        verified: false,
        created: new Date().toISOString(),
      });
    }
  } catch(e) {
    console.log(`Cook County API: ${e.message}`);
  }
  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WAYNE COUNTY DETROIT — Tax delinquent auction list (public)
// ═══════════════════════════════════════════════════════════════════════════

async function getWayneCountyAuctions() {
  const leads = [];
  try {
    const url = 'https://www.waynecounty.com/elected/treasurer/tax-auction.aspx';
    const res = await scraperGet(url, { timeout: 20000 });
    const $ = cheerio.load(res.data);

    // Wayne County publishes auction lists as downloadable files or tables
    $('table tr').each(function () {
      const cells = $(this).find('td');
      if (cells.length < 3) return;
      const address = $(cells[0]).text().trim();
      const priceText = $(cells).filter(function(){ return $(this).text().includes('$'); }).first().text();
      const price = parseInt(priceText.replace(/[^0-9]/g,'')) || 0;
      if (address && address.length > 5 && address.match(/\d/)) {
        leads.push({
          id: uuidv4(),
          address: `${address}, Detroit, MI`,
          state: 'MI', county: 'Wayne',
          listPrice: price,
          category: 'Tax Delinquent',
          distressType: 'Tax Auction — Wayne County',
          source: 'Wayne County Treasurer',
          sourceUrl: url,
          status: 'Review Queue',
          verified: false,
          created: new Date().toISOString(),
        });
      }
    });

    // Also look for linked auction lists
    $('a[href*=".pdf"], a[href*="auction"], a[href*="delinquent"]').each(function () {
      const href = $(this).attr('href') || '';
      const text = $(this).text().trim();
      if (href && text) {
        console.log(`Wayne County auction file: ${text} — ${href}`);
      }
    });
  } catch(e) {
    console.log(`Wayne County: ${e.message}`);
  }
  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLARK COUNTY (LAS VEGAS) — ArcGIS Open API
// ═══════════════════════════════════════════════════════════════════════════

async function getClarkCountyProperties() {
  const leads = [];
  try {
    // Clark County exposes assessor data via ArcGIS REST API
    const url = 'https://maps.clarkcountynv.gov/arcgis/rest/services/MapServices/Assessor/MapServer/0/query?where=ASSESSED_VALUE+%3C+100000+AND+PROPERTY_TYPE+%3D+%27SFR%27&outFields=APN%2CSITUSADDRESS%2CCITY%2CASSESSED_VALUE%2COWNER_NAME%2CLAST_SALE_DATE%2CLAST_SALE_AMOUNT&f=json&resultRecordCount=200';
    const res = await axios.get(url, { headers: { 'Accept': 'application/json' }, timeout: 15000 });
    const features = res.data?.features || [];

    for (const f of features) {
      const a = f.attributes || {};
      if (!a.SITUSADDRESS) continue;
      leads.push({
        id: uuidv4(),
        address: `${a.SITUSADDRESS}, ${a.CITY || 'Las Vegas'}, NV`,
        state: 'NV', county: 'Clark',
        owner: a.OWNER_NAME || '',
        assessedValue: a.ASSESSED_VALUE || 0,
        lastSalePrice: a.LAST_SALE_AMOUNT || 0,
        lastSaleDate: a.LAST_SALE_DATE || '',
        category: 'Low Equity / Distressed',
        source: 'Clark County ArcGIS',
        sourceUrl: 'https://maps.clarkcountynv.gov',
        status: 'Review Queue',
        verified: false,
        created: new Date().toISOString(),
      });
    }
  } catch(e) {
    console.log(`Clark County ArcGIS: ${e.message}`);
  }
  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MARICOPA COUNTY (PHOENIX) — Public property search
// ═══════════════════════════════════════════════════════════════════════════

async function getMaricopaForeclosures() {
  const leads = [];
  try {
    // Maricopa County Treasurer publishes tax lien sale lists
    const url = 'https://treasurer.maricopa.gov/propertytax/taxliensale.aspx';
    const res = await scraperGet(url, { timeout: 20000 });
    const $ = cheerio.load(res.data);

    $('table tr').each(function () {
      const cells = $(this).find('td');
      if (cells.length < 3) return;
      const address = $(cells[0]).text().trim() || $(cells[1]).text().trim();
      const amount = parseInt($(cells).last().text().replace(/[^0-9]/g,'')) || 0;
      if (address && address.match(/\d{3,}/)) {
        leads.push({
          id: uuidv4(),
          address: `${address}, Phoenix, AZ`,
          state: 'AZ', county: 'Maricopa',
          taxOwed: amount,
          category: 'Tax Delinquent',
          distressType: 'Tax Lien Sale — Maricopa County',
          source: 'Maricopa County Treasurer',
          sourceUrl: url,
          status: 'Review Queue',
          verified: false,
          created: new Date().toISOString(),
        });
      }
    });
  } catch(e) {
    console.log(`Maricopa: ${e.message}`);
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

      // Connected Investors public member profiles
      $('[class*="member"], [class*="investor"], [class*="profile-card"], .user-card').each(function () {
        const name = $(this).find('[class*="name"], h2, h3, .username').first().text().trim();
        const location = $(this).find('[class*="location"], [class*="city"]').first().text().trim();
        const buyType = $(this).find('[class*="type"], [class*="looking"]').first().text().trim();
        const phone = $(this).find('[class*="phone"]').first().text().trim();
        const email = $(this).find('[class*="email"]').first().text().trim();
        const link = $(this).find('a').first().attr('href') || '';

        if (!name || seen.has(name)) return;
        seen.add(name);

        buyers.push({
          id: uuidv4(),
          name: name || `Cash Buyer — ${state}`,
          type: buyType.toLowerCase().includes('flip') ? 'Fix & Flip Investor' :
                buyType.toLowerCase().includes('rent') ? 'Buy & Hold Landlord' : 'Cash Buyer',
          contact: name,
          phone: phone || '',
          email: email || '',
          markets: [location || state],
          state,
          maxPrice: 500000,
          minARV: 0,
          preferred: ['FSBO', 'Pre-FC', 'REO', 'Tax Delinquent'],
          rehab: 'Medium',
          source: 'Connected Investors',
          sourceUrl: link.startsWith('http') ? link : `https://connectedinvestors.com${link}`,
          notes: buyType,
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
//  BIGGER POCKETS — Public marketplace buyer posts
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeBiggerPockets(markets) {
  const buyers = [];
  const seen = new Set();

  try {
    // BiggerPockets has a public marketplace section
    const url = 'https://www.biggerpockets.com/buy/investment-property';
    const res = await scraperGet(url, { timeout: 25000 });
    const $ = cheerio.load(res.data);

    $('[class*="listing"], [class*="property-card"], article, [data-type="buyer"]').each(function () {
      const name = $(this).find('[class*="user"], [class*="author"], h2, h3').first().text().trim();
      const location = $(this).find('[class*="location"], [class*="market"]').first().text().trim();
      const budget = $(this).find('[class*="budget"], [class*="price"]').first().text().trim();
      const desc = $(this).find('p, [class*="description"]').first().text().trim();

      if (!name || seen.has(name) || name.length < 3) return;
      seen.add(name);

      const budgetNum = parseInt((budget.match(/[\d,]+/) || ['300000'])[0].replace(/,/g,'')) || 300000;

      buyers.push({
        id: uuidv4(),
        name,
        type: 'Cash Buyer',
        contact: name,
        markets: [location || 'Multiple Markets'],
        state: (location.match(/,\s*([A-Z]{2})/) || [])[1] || '',
        maxPrice: budgetNum,
        minARV: 0,
        preferred: ['FSBO', 'Pre-FC', 'REO'],
        rehab: 'Medium',
        source: 'BiggerPockets',
        sourceUrl: 'https://www.biggerpockets.com',
        notes: desc.slice(0, 150),
        created: new Date().toISOString(),
        score: 75,
      });
    });

    // Also try forums for "looking to buy" posts
    const forumUrl = 'https://www.biggerpockets.com/forums/88'; // Deals & Networking
    const forumRes = await scraperGet(forumUrl, { timeout: 25000 });
    const f$ = cheerio.load(forumRes.data);

    f$('[class*="post"], article, [class*="thread"]').each(function () {
      const title = f$(this).find('h2, h3, [class*="title"]').first().text().trim().toLowerCase();
      if (!title.includes('buy') && !title.includes('looking') && !title.includes('seeking')) return;
      const author = f$(this).find('[class*="author"], [class*="user"]').first().text().trim();
      const link = f$(this).find('a').first().attr('href') || '';
      if (!author || seen.has(author)) return;
      seen.add(author);

      buyers.push({
        id: uuidv4(),
        name: author,
        type: 'Cash Buyer',
        contact: author,
        markets: ['Multiple Markets'],
        state: '',
        maxPrice: 400000,
        minARV: 0,
        preferred: ['FSBO', 'Pre-FC', 'Wholesale'],
        rehab: 'Medium',
        source: 'BiggerPockets Forum',
        sourceUrl: link.startsWith('http') ? link : `https://www.biggerpockets.com${link}`,
        notes: title.slice(0, 100),
        created: new Date().toISOString(),
        score: 70,
      });
    });
  } catch(e) {
    console.log(`BiggerPockets: ${e.message}`);
  }
  return buyers;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROPWIRE CSV IMPORT — Parse and enrich any Propwire export
// ═══════════════════════════════════════════════════════════════════════════

function parsePropwireCSV(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim().toLowerCase());
  const leads = [];

  // Propwire column name mappings
  const colMap = {
    address:     ['property address','address','situs address','street address','prop address'],
    city:        ['city','situs city','property city'],
    state:       ['state','situs state','property state'],
    zip:         ['zip','zipcode','zip code','postal code'],
    county:      ['county','county name'],
    beds:        ['beds','bedrooms','bed count','# beds'],
    baths:       ['baths','bathrooms','bath count','# baths'],
    sqft:        ['sqft','square feet','living sqft','sq ft','square footage'],
    year:        ['year built','yr built','year','build year'],
    owner:       ['owner name','owner','taxpayer name','owner 1 last','owner full name'],
    phone:       ['phone','phone number','owner phone','mobile phone'],
    email:       ['email','owner email','email address'],
    equity:      ['equity','estimated equity','est equity'],
    estValue:    ['estimated value','est value','assessed value','market value','appraised value'],
    lastSale:    ['last sale date','sale date','last sold date'],
    lastSaleAmt: ['last sale amount','sale amount','last sold price','sale price'],
    mortgage:    ['open mortgage','mortgage balance','loan balance'],
    category:    ['lead type','property type','list type','distress type','status'],
    vacant:      ['vacant','vacancy','occupancy'],
    absentee:    ['absentee owner','absentee','owner occupied'],
    mailAddress: ['mailing address','mail address','owner mailing address'],
  };

  function findCol(key) {
    const candidates = colMap[key] || [key];
    for (const c of candidates) {
      const idx = headers.findIndex(h => h.includes(c) || c.includes(h));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const cols = {};
  for (const key of Object.keys(colMap)) {
    cols[key] = findCol(key);
  }

  for (const line of lines.slice(1)) {
    try {
      // Handle quoted CSV fields
      const fields = [];
      let field = '', inQuote = false;
      for (const char of line + ',') {
        if (char === '"') { inQuote = !inQuote; continue; }
        if (char === ',' && !inQuote) { fields.push(field.trim()); field = ''; continue; }
        field += char;
      }

      const get = (key) => cols[key] >= 0 ? (fields[cols[key]] || '').trim() : '';

      const addr = get('address');
      if (!addr || addr.length < 5) continue;

      const city = get('city');
      const state = get('state');
      const zip = get('zip');
      const county = get('county');
      const beds = parseInt(get('beds')) || 0;
      const baths = parseFloat(get('baths')) || 0;
      const sqft = parseInt(get('sqft').replace(/,/g,'')) || 0;
      const year = parseInt(get('year')) || 0;
      const estValue = parseInt(get('estValue').replace(/[$,]/g,'')) || 0;
      const equity = parseInt(get('equity').replace(/[$,]/g,'')) || 0;
      const lastSaleAmt = parseInt(get('lastSaleAmt').replace(/[$,]/g,'')) || 0;
      const owner = get('owner');
      const phone = get('phone').replace(/[^0-9]/g,'');
      const email = get('email');
      const categoryRaw = get('category') || 'FSBO';
      const isVacant = get('vacant').toLowerCase().includes('y') || get('vacant').toLowerCase().includes('vacant');
      const isAbsentee = get('absentee').toLowerCase().includes('y') || get('absentee').toLowerCase().includes('absentee');

      // Map Propwire categories to WholesaleOS categories
      const category =
        categoryRaw.toLowerCase().includes('pre') || categoryRaw.toLowerCase().includes('foreclosure') ? 'Pre-FC' :
        categoryRaw.toLowerCase().includes('reo') || categoryRaw.toLowerCase().includes('bank') ? 'REO' :
        categoryRaw.toLowerCase().includes('tax') || categoryRaw.toLowerCase().includes('delinquent') ? 'Tax Delinquent' :
        categoryRaw.toLowerCase().includes('vacant') || isVacant ? 'Vacant Property' :
        categoryRaw.toLowerCase().includes('absentee') || isAbsentee ? 'Absentee Owner' :
        categoryRaw.toLowerCase().includes('probate') || categoryRaw.toLowerCase().includes('inherit') ? 'Probate' :
        categoryRaw.toLowerCase().includes('land') ? 'Land Deal' :
        categoryRaw.toLowerCase().includes('high equity') ? 'High Equity' :
        categoryRaw.toLowerCase().includes('tired') ? 'Tired Landlord' :
        'FSBO';

      // Estimate ARV from assessed/market value
      const arv = estValue || lastSaleAmt || 0;
      // MAO formula: ARV × 0.70 - repairs
      const estRepairs = sqft ? Math.round(sqft * (year < 1990 ? 45 : year < 2000 ? 30 : 20)) : 25000;
      const mao = arv > 0 ? Math.round(arv * 0.70 - estRepairs) : 0;
      const offer = mao > 0 ? Math.round(mao * 0.94) : 0;
      const spread = arv > 0 && offer > 0 ? arv - offer - estRepairs : 0;

      // Build Zillow and Redfin deep links
      const fullAddress = [addr, city, state, zip].filter(Boolean).join(', ');
      const zillowUrl = `https://www.zillow.com/homes/${encodeURIComponent(fullAddress)}_rb/`;
      const redfinUrl = `https://www.redfin.com/search?searchType=4&market=search&query=${encodeURIComponent(fullAddress)}`;
      const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${encodeURIComponent(fullAddress)}&key=`;

      // Format phone
      const fPhone = phone.length === 10 ? `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6)}` :
                     phone.length === 11 ? `(${phone.slice(1,4)}) ${phone.slice(4,7)}-${phone.slice(7)}` : phone;

      leads.push({
        id: uuidv4(),
        address: [addr, city, state, zip].filter(Boolean).join(', '),
        county: county || '',
        state: state || '',
        zip: zip || '',
        beds, baths, sqft, year,
        owner_name: owner || '',
        phone: fPhone,
        email: email || '',
        category,
        distressType: categoryRaw,
        isVacant, isAbsentee,
        arv,
        repairs: estRepairs,
        mao,
        offer,
        spread: Math.max(0, spread),
        fee_lo: spread > 0 ? Math.round(spread * 0.35) : 0,
        fee_hi: spread > 0 ? Math.round(spread * 0.55) : 0,
        lastSalePrice: lastSaleAmt,
        lastSaleDate: get('lastSale'),
        equity,
        estValue,
        dom: 0,
        status: 'New Lead',
        source: 'Propwire',
        zillowUrl,
        redfinUrl,
        streetViewUrl,
        verified: true, // Propwire data is verified
        dealType: spread > arv * 0.25 ? 'Wholesale' :
                  category === 'Land Deal' ? 'Land Deal' : 'Review Needed',
        created: new Date().toISOString(),
        userId: 'admin',
      });
    } catch(e) {
      // Skip malformed rows
    }
  }
  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN ORCHESTRATOR — Run all free data sources
// ═══════════════════════════════════════════════════════════════════════════

async function runAllFreeSources(options = {}) {
  const results = { leads: [], buyers: [], errors: [] };
  const states = options.states || ['TX','FL','GA','AZ','CA','NC','TN','NV','CO','OH','MI','IL','MO','IN','PA'];

  console.log('[DataSources] Starting all free data sources...');

  // Run in parallel with error isolation
  const tasks = [
    scrapeHUDHomestore(states).then(r => { results.leads.push(...r); console.log(`HUD: ${r.length} leads`); }).catch(e => results.errors.push(`HUD: ${e.message}`)),
    getCookCountyForeclosures().then(r => { results.leads.push(...r); console.log(`Cook County: ${r.length} leads`); }).catch(e => results.errors.push(`Cook: ${e.message}`)),
    getWayneCountyAuctions().then(r => { results.leads.push(...r); console.log(`Wayne County: ${r.length} leads`); }).catch(e => results.errors.push(`Wayne: ${e.message}`)),
    getClarkCountyProperties().then(r => { results.leads.push(...r); console.log(`Clark County: ${r.length} leads`); }).catch(e => results.errors.push(`Clark: ${e.message}`)),
    getMaricopaForeclosures().then(r => { results.leads.push(...r); console.log(`Maricopa: ${r.length} leads`); }).catch(e => results.errors.push(`Maricopa: ${e.message}`)),
    scrapeConnectedInvestors(states).then(r => { results.buyers.push(...r); console.log(`Connected Investors: ${r.length} buyers`); }).catch(e => results.errors.push(`CI: ${e.message}`)),
    scrapeBiggerPockets().then(r => { results.buyers.push(...r); console.log(`BiggerPockets: ${r.length} buyers`); }).catch(e => results.errors.push(`BP: ${e.message}`)),
  ];

  await Promise.allSettled(tasks);

  console.log(`[DataSources] Complete: ${results.leads.length} leads, ${results.buyers.length} buyers, ${results.errors.length} errors`);
  return results;
}

module.exports = {
  COUNTY_SOURCES,
  scrapeHUDHomestore,
  getCookCountyForeclosures,
  getWayneCountyAuctions,
  getClarkCountyProperties,
  getMaricopaForeclosures,
  scrapeConnectedInvestors,
  scrapeBiggerPockets,
  parsePropwireCSV,
  runAllFreeSources,
};
