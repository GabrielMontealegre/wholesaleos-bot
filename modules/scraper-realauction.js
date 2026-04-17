// modules/scraper-realauction.js
// Scrapes realauction.com for tax-delinquent and pre-foreclosure auction listings.
// Extends existing ingestion pipeline — does NOT rebuild scraper system.
// Integrates via POST /api/datasources/run-source?source=realauction
'use strict';
const https = require('https');
const { validateLead } = require('./lead-validator');

// State abbreviation map for normalizing realauction.com state names
const STATE_MAP = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
  'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
  'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
  'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
  'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY'
};

function fetchPage(url) {
  return new Promise(function(resolve, reject) {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WholesaleOS/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    };
    https.get(url, opts, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve(data); });
    }).on('error', reject).on('timeout', function() { reject(new Error('timeout')); });
  });
}

// Parse HTML listings from realauction.com search results
function parseListings(html, stateAbbr) {
  const listings = [];
  // realauction.com uses table rows with class 'result-row' or similar
  // Pattern: <tr class="...">, each cell contains parcel, city, auction date, type
  const rowRe = /<tr[^>]*class="[^"]*(?:result|auction|property)[^"]*"[^>]*>([sS]*?)<\/tr>/gi;
  const tdRe = /<td[^>]*>([sS]*?)<\/td>/gi;
  const stripHtml = function(s) { return s.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim(); };
  let rowMatch;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    let tdMatch;
    while ((tdMatch = tdRe.exec(rowHtml)) !== null) cells.push(stripHtml(tdMatch[1]));
    if (cells.length < 3) continue;
    // Extract link
    const linkMatch = rowMatch[0].match(/href="([^"]+)"/);
    const link = linkMatch ? 'https://www.realauction.com' + linkMatch[1] : '';
    listings.push({ cells, link, stateAbbr });
  }
  return listings;
}

// Normalize a raw listing row to WholesaleOS lead schema
// address field = MASKED (parcel ID only — no full street address exposed to buyers)
function normalizeListing(listing, stateAbbr) {
  const cells = listing.cells;
  if (!cells || cells.length < 3) return null;
  // realauction.com columns vary by county but typically:
  // [0]=Case/Parcel, [1]=City, [2]=Auction Date, [3]=Type, [4]=Opening Bid
  const parcel     = (cells[0] || '').replace(/[^A-Z0-9\-]/gi,'').slice(0,20);
  const city       = (cells[1] || '').split(',')[0].trim();
  const auctionDate = cells[2] || '';
  const auctionType = cells[3] || 'Tax Deed';
  const openingBid  = parseFloat((cells[4]||'0').replace(/[^0-9.]/g,'')) || 0;

  if (!city || city.length < 2) return null;
  if (!parcel || parcel.length < 3) return null;

  // MASKED address — parcel ID only, never full street address
  const maskedAddress = parcel + ', ' + city + ', ' + stateAbbr;

  return {
    address:         maskedAddress,
    city:            city,
    state:           stateAbbr,
    zip:             '',
    source_platform: 'realauction',
    source_url:      listing.link || '',
    category:        'Tax ' + auctionType,
    type:            'SFR',
    status:          'New Lead',
    list_price:      openingBid,
    arv:             0,
    repairs:         0,
    offer:           0,
    spread:          0,
    mao:             0,
    auction_date:    auctionDate,
    auction_type:    auctionType,
    distress:        'Tax Delinquent',
    _source_module:  'realauction'
  };
}

/**
 * scrapeRealAuction(stateAbbr)
 * Returns { imported, rejected, leads }
 * stateAbbr: e.g. 'TX', 'FL'
 */
async function scrapeRealAuction(stateAbbr, existingAddresses) {
  const results = { imported: 0, rejected: [], leads: [] };
  const state = (stateAbbr || '').toUpperCase();
  if (!state || state.length !== 2) {
    results.rejected.push({ reason: 'invalid_state: ' + stateAbbr });
    return results;
  }

  const url = 'https://www.realauction.com/auctions/search?state=' + state + '&type=tax';
  let html;
  try { html = await fetchPage(url); }
  catch(e) {
    results.rejected.push({ reason: 'fetch_failed: ' + e.message });
    return results;
  }

  const listings = parseListings(html, state);
  const seen = new Set(existingAddresses || []);

  for (const listing of listings) {
    const lead = normalizeListing(listing, state);
    if (!lead) { results.rejected.push({ reason: 'parse_failed', raw: listing.cells.slice(0,3) }); continue; }

    const vr = validateLead(lead, seen);
    if (!vr.valid) { results.rejected.push({ address: lead.address, reason: vr.reason }); continue; }

    seen.add(lead.address.toLowerCase().replace(/\s+/g,' '));
    results.leads.push(lead);
    results.imported++;
  }
  return results;
}

module.exports = { scrapeRealAuction };