// buybox.js — Buy box extraction, expansion, matching engine

const db = require('../db');

// ── Buy box structure ─────────────────────────────────────────────────────
function createBuyBox(data) {
  return {
    id: 'BB' + Date.now() + Math.random().toString(36).slice(2,5),
    name: data.name || 'Unknown Investor',
    contact: data.contact || '',
    phone: data.phone || '',
    email: data.email || '',
    state: data.state || 'TX',
    county: data.county || '',
    strategy: data.strategy || 'Wholesale Assignment',
    propertyTypes: data.propertyTypes || ['SFR'],
    minARV: data.minARV || 0,
    maxPrice: data.maxPrice || 999999,
    maxRepairs: data.maxRepairs || 100000,
    minSpread: data.minSpread || 10000,
    rehabLevel: data.rehabLevel || 'Any',
    preferredCategories: data.preferredCategories || ['Pre-FC','REO','FSBO'],
    minBeds: data.minBeds || 2,
    maxBeds: data.maxBeds || 6,
    closingDays: data.closingDays || 21,
    notes: data.notes || '',
    source: data.source || 'Manual',
    active: true,
    created: new Date().toISOString().slice(0,10),
    matched_deals: 0,
  };
}

// ── Dedup logic ───────────────────────────────────────────────────────────
function buyBoxExists(box) {
  const existing = getBuyBoxes();
  return existing.some(b =>
    (b.phone && b.phone === box.phone) ||
    (b.email && b.email === box.email) ||
    (b.name && b.name.toLowerCase() === (box.name||'').toLowerCase() &&
     b.state === box.state && b.county === box.county)
  );
}

function getBuyBoxes() {
  return (db.readDB().buyboxes || []);
}

function addBuyBox(data) {
  const box = createBuyBox(data);
  if (buyBoxExists(box)) return null;
  const dbData = db.readDB();
  if (!dbData.buyboxes) dbData.buyboxes = [];
  dbData.buyboxes.push(box);
  db.writeDB(dbData);
  return box;
}

function addBuyBoxesBulk(boxes) {
  let added = 0;
  boxes.forEach(b => { if (addBuyBox(b)) added++; });
  return added;
}

// ── Extract buy boxes from buyers database ────────────────────────────────
function extractFromBuyers() {
  const buyers = db.getBuyers();
  let extracted = 0;
  buyers.forEach(buyer => {
    const box = {
      name: buyer.name,
      contact: buyer.contact,
      phone: buyer.phone,
      email: buyer.email,
      state: buyer.state || 'TX',
      county: buyer.county || '',
      strategy: buyer.type === 'Fix & Flip Investor' ? 'Fix and Flip' :
                buyer.type === 'Buy & Hold Landlord' ? 'Buy and Hold' : 'Wholesale Assignment',
      propertyTypes: ['SFR'],
      minARV: buyer.minARV || 0,
      maxPrice: buyer.maxPrice || 500000,
      maxRepairs: buyer.rehab === 'Light' ? 30000 : buyer.rehab === 'Medium' ? 60000 : 100000,
      minSpread: 10000,
      rehabLevel: buyer.rehab || 'Any',
      preferredCategories: buyer.preferred || ['Pre-FC','REO'],
      closingDays: 21,
      notes: buyer.notes || '',
      source: 'Auto-extracted from buyer',
    };
    if (addBuyBox(box)) extracted++;
  });
  return extracted;
}

// ── Generate market buy boxes ─────────────────────────────────────────────
function generateMarketBuyBoxes(county, state, count=5) {
  const strategies = ['Wholesale Assignment','Fix and Flip','Buy and Hold','BRRRR'];
  const rehabLevels = ['Light','Medium','Heavy'];
  const { getMarketData } = require('../markets');
  const market = getMarketData(county, state);
  const boxes = [];

  for (let i = 0; i < count; i++) {
    const strategy = strategies[i % strategies.length];
    const rehab = rehabLevels[i % rehabLevels.length];
    const maxPricePct = strategy === 'Wholesale Assignment' ? 0.75 : strategy === 'Fix and Flip' ? 0.70 : 0.80;
    boxes.push({
      name: `${county} ${strategy} Investor ${i+1}`,
      contact: `Investor ${i+1}`,
      state, county,
      strategy,
      propertyTypes: ['SFR'],
      minARV: Math.round(market.arv * 0.5),
      maxPrice: Math.round(market.arv * maxPricePct),
      maxRepairs: rehab === 'Light' ? 25000 : rehab === 'Medium' ? 55000 : 95000,
      minSpread: strategy === 'Wholesale Assignment' ? 15000 : 25000,
      rehabLevel: rehab,
      preferredCategories: ['Pre-FC','REO','FSBO','Long DOM'],
      closingDays: strategy === 'Wholesale Assignment' ? 14 : 30,
      source: 'Auto-generated for market',
    });
  }
  return boxes;
}

// ── Match buy boxes to a lead ─────────────────────────────────────────────
function matchBuyBoxesToLead(lead) {
  const boxes = getBuyBoxes().filter(b => b.active);
  const matches = [];

  boxes.forEach(box => {
    let score = 0;
    const reasons = [];

    // Location match
    if (box.state && box.state === lead.state) { score += 25; reasons.push('State match'); }
    if (box.county && lead.county?.toLowerCase().includes(box.county.toLowerCase())) { score += 20; reasons.push('County match'); }

    // Price match
    if ((lead.arv||0) >= box.minARV) { score += 15; reasons.push('ARV in range'); }
    if ((lead.offer||0) <= box.maxPrice) { score += 15; reasons.push('Price in range'); }

    // Spread match
    if ((lead.spread||0) >= box.minSpread) { score += 10; reasons.push('Spread meets minimum'); }

    // Repair match
    if ((lead.repairs||0) <= box.maxRepairs) { score += 10; reasons.push('Repairs within budget'); }

    // Category match
    if (box.preferredCategories?.includes(lead.category)) { score += 5; reasons.push('Category preferred'); }

    if (score >= 40) matches.push({ ...box, score, reasons });
  });

  return matches.sort((a,b) => b.score - a.score);
}

// ── Recommendations for expanding buy boxes ───────────────────────────────
function getBuyBoxRecommendations() {
  return [
    { platform: 'BiggerPockets', type: 'Investor Network', url: 'biggerpockets.com', description: 'Largest RE investor community. Post deals, find buyers, extract buy boxes from forum posts.' },
    { platform: 'BatchLeads', type: 'Data Provider', url: 'batchleads.io', description: 'Skip tracing + cash buyer lists. Filter by recent cash purchases in your target counties.' },
    { platform: 'PropStream', type: 'MLS + Records', url: 'propstream.com', description: 'Access MLS data, recent cash transactions, and investor activity by zip code.' },
    { platform: 'Connected Investors', type: 'Buyer Database', url: 'connectedinvestors.com', description: 'Database of 1M+ investors. Filter by location and strategy to find buy boxes.' },
    { platform: 'ListSource', type: 'Absentee Owners', url: 'listsource.com', description: 'Absentee owner + cash buyer lists by county. Good source for landlord buy boxes.' },
    { platform: 'Public Records', type: 'Free Source', url: 'county recorder websites', description: 'Search recent cash sales (no mortgage recorded) in your county. These are your buyers.' },
    { platform: 'Auction.com', type: 'Auction Platform', url: 'auction.com', description: 'Active bidders on REO auctions are cash buyers with known buy boxes.' },
    { platform: 'ATTOM Data', type: 'Property Data API', url: 'attomdata.com', description: 'API access to all U.S. property records, cash transaction data, and investor profiles.' },
  ];
}

module.exports = {
  getBuyBoxes, addBuyBox, addBuyBoxesBulk, extractFromBuyers,
  generateMarketBuyBoxes, matchBuyBoxesToLead, getBuyBoxRecommendations,
  buyBoxExists,
};
