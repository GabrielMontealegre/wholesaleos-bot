// scraper.js — Real buyer and deal discovery engine
// Sources: Craigslist, HUD Homes, FSBO, Landwatch
// Comps:   Redfin, Realtor.com, Rentometer, Zillow
'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');

// ── ScraperAPI wrapper ───────────────────────────────────────────────────────
// Set SCRAPERAPI_KEY in Railway Variables to enable proxy-based scraping
// Free tier: 1,000 requests/month — sign up at scraperapi.com
function scraperGet(url, options={}) {
  const apiKey = process.env.SCRAPERAPI_KEY;
  if (apiKey) {
    // Route through ScraperAPI residential proxy
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}&render=false`;
    return axios.get(proxyUrl, { timeout: options.timeout || 30000 });
  }
  // Fallback: direct request (works for non-blocked sites)
  return axios.get(url, { headers: HEADERS, timeout: options.timeout || 15000 });
}

// ── Hot markets (daily scrape) ───────────────────────────────────────────────
const HOT_MARKETS = [
  { city:'losangeles', state:'CA', label:'Los Angeles, CA' },
  { city:'phoenix',    state:'AZ', label:'Phoenix, AZ' },
  { city:'dallas',     state:'TX', label:'Dallas, TX' },
  { city:'houston',    state:'TX', label:'Houston, TX' },
  { city:'atlanta',    state:'GA', label:'Atlanta, GA' },
  { city:'miami',      state:'FL', label:'Miami, FL' },
  { city:'tampa',      state:'FL', label:'Tampa, FL' },
  { city:'orlando',    state:'FL', label:'Orlando, FL' },
  { city:'lasvegas',   state:'NV', label:'Las Vegas, NV' },
  { city:'denver',     state:'CO', label:'Denver, CO' },
  { city:'charlotte',  state:'NC', label:'Charlotte, NC' },
  { city:'nashville',  state:'TN', label:'Nashville, TN' },
  { city:'sandiego',   state:'CA', label:'San Diego, CA' },
  { city:'chicago',    state:'IL', label:'Chicago, IL' },
  { city:'seattle',    state:'WA', label:'Seattle, WA' },
];

// All-state markets (twice-weekly)
const ALL_STATE_MARKETS = [
  {city:'birmingham',state:'AL'},{city:'anchorage',state:'AK'},{city:'tucson',state:'AZ'},
  {city:'littlerock',state:'AR'},{city:'sacramento',state:'CA'},{city:'boulder',state:'CO'},
  {city:'hartford',state:'CT'},{city:'wilmington',state:'DE'},{city:'jacksonville',state:'FL'},
  {city:'savannah',state:'GA'},{city:'honolulu',state:'HI'},{city:'boise',state:'ID'},
  {city:'springfield',state:'IL'},{city:'indianapolis',state:'IN'},{city:'desmoines',state:'IA'},
  {city:'kansascity',state:'KS'},{city:'louisville',state:'KY'},{city:'neworleans',state:'LA'},
  {city:'portland',state:'ME'},{city:'baltimore',state:'MD'},{city:'boston',state:'MA'},
  {city:'detroit',state:'MI'},{city:'minneapolis',state:'MN'},{city:'jackson',state:'MS'},
  {city:'kansascity',state:'MO'},{city:'billings',state:'MT'},{city:'omaha',state:'NE'},
  {city:'reno',state:'NV'},{city:'manchester',state:'NH'},{city:'newjersey',state:'NJ'},
  {city:'albuquerque',state:'NM'},{city:'buffalo',state:'NY'},{city:'raleigh',state:'NC'},
  {city:'fargo',state:'ND'},{city:'columbus',state:'OH'},{city:'oklahomacity',state:'OK'},
  {city:'portland',state:'OR'},{city:'philadelphia',state:'PA'},{city:'providence',state:'RI'},
  {city:'columbia',state:'SC'},{city:'siouxfalls',state:'SD'},{city:'memphis',state:'TN'},
  {city:'sanantonio',state:'TX'},{city:'saltlake',state:'UT'},{city:'burlington',state:'VT'},
  {city:'richmond',state:'VA'},{city:'spokane',state:'WA'},{city:'charleston',state:'WV'},
  {city:'milwaukee',state:'WI'},{city:'cheyenne',state:'WY'},
];

const HEADERS = {
  'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':'en-US,en;q=0.5',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function cleanPhone(raw) {
  if (!raw) return '';
  const d = raw.replace(/\D/g,'');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0]==='1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return raw.trim();
}
function extractEmail(t){ const m=t.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/); return m?m[0]:''; }
function extractPhone(t){ const m=t.match(/(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/); return m?cleanPhone(m[0]):''; }

// ── Craigslist Buyer Scraper ─────────────────────────────────────────────────
async function scrapeCraigslistBuyers(markets) {
  const buyers=[], seen=new Set();
  const queries=['I+buy+houses+cash','cash+buyer+houses','we+buy+homes','buying+investment+properties'];

  for (const market of markets) {
    for (const q of queries.slice(0,2)) {
      try {
        const url=`https://${market.city}.craigslist.org/search/rea?query=${q}&sort=date`;
        const res=await scraperGet(url,{timeout:20000});
        const $=cheerio.load(res.data);
        const posts=[];
        $('li.cl-static-search-result,.result-row').each(function(){
          const title=$(this).find('.label,.result-title').text().trim();
          const link=$(this).find('a').attr('href')||'';
          if(title&&link) posts.push({title,link,market});
        });
        for (const post of posts.slice(0,8)) {
          try {
            await sleep(700);
            const fullUrl=post.link.startsWith('http')?post.link:`https://${market.city}.craigslist.org${post.link}`;
            const pRes=await scraperGet(fullUrl,{timeout:20000});
            const p$=cheerio.load(pRes.data);
            const body=p$('#postingbody,.body').text();
            const phone=extractPhone(body);
            const email=extractEmail(body);
            const key=`${phone||''}${email||''}`;
            if(seen.has(key)||(!phone&&!email)) continue;
            seen.add(key);
            const maxPriceMatch=body.match(/\$[\d,]+k?/gi);
            const rawMax=maxPriceMatch?maxPriceMatch[0]:'';
            const maxPrice=rawMax?parseInt(rawMax.replace(/[$,]/gi,''))*(rawMax.toLowerCase().includes('k')?1000:1):300000;
            const name=post.title.replace(/[^a-zA-Z\s]/g,'').trim().slice(0,40)||'Cash Buyer';
            buyers.push({
              name:`${name} — ${market.label}`,
              type:post.title.toLowerCase().includes('land')?'Land Buyer':post.title.toLowerCase().includes('commercial')?'Commercial Buyer':'Cash Buyer',
              contact:name, phone, email,
              markets:[market.label], state:market.state,
              maxPrice:maxPrice||300000, minARV:0,
              preferred:['FSBO','Pre-FC','REO'],
              rehab:body.toLowerCase().includes('as-is')||body.toLowerCase().includes('any condition')?'Heavy':'Medium',
              source:'Craigslist', sourceUrl:fullUrl,
              notes:post.title.slice(0,120),
              created:new Date().toISOString(), score:70,
            });
          } catch(e2){/*skip*/}
        }
        await sleep(1200);
      } catch(e){console.log(`CL buyers ${market.city}: ${e.message}`);}
    }
  }
  return buyers;
}

// ── Craigslist Deal Scraper ──────────────────────────────────────────────────
async function scrapeCraigslistDeals(markets) {
  const deals=[], seen=new Set();
  const cats=[{path:'/rea',label:'FSBO'},{path:'/lnd',label:'Land Deal'},{path:'/mhd',label:'Trailer Park'}];

  for (const market of markets) {
    for (const cat of cats) {
      try {
        const url=`https://${market.city}.craigslist.org/search${cat.path}?sort=date&postedToday=1`;
        const res=await scraperGet(url,{timeout:20000});
        const $=cheerio.load(res.data);
        const posts=[];
        $('li.cl-static-search-result,.result-row').each(function(){
          const title=$(this).find('.label,.result-title').text().trim();
          const link=$(this).find('a').attr('href')||'';
          const priceText=$(this).find('.priceinfo,.result-price').text().trim();
          const price=parseInt(priceText.replace(/[^0-9]/g,''))||0;
          if(title&&link&&price>10000) posts.push({title,link,price,market,cat});
        });
        for (const post of posts.slice(0,6)) {
          try {
            await sleep(700);
            const fullUrl=post.link.startsWith('http')?post.link:`https://${market.city}.craigslist.org${post.link}`;
            if(seen.has(fullUrl)) continue;
            seen.add(fullUrl);
            const pRes=await scraperGet(fullUrl,{timeout:20000});
            const p$=cheerio.load(pRes.data);
            const body=p$('#postingbody,.body').text();
            const phone=extractPhone(body);
            const email=extractEmail(body);
            const addrMatch=body.match(/\d+\s+[A-Za-z\s]+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Hwy)[.,\s]/i);
            const address=addrMatch?addrMatch[0].trim():post.title;
            deals.push({
              address, listPrice:post.price, phone, email,
              state:market.state, category:post.cat.label,
              source:'Craigslist', sourceUrl:fullUrl, sourceTitle:post.title,
              notes:body.slice(0,300),
              status:'Review Queue', verified:false,
              created:new Date().toISOString(),
            });
          } catch(e2){/*skip*/}
        }
        await sleep(1000);
      } catch(e){console.log(`CL deals ${market.city}/${cat.label}: ${e.message}`);}
    }
  }
  return deals;
}

// ── HUD Homes Scraper ────────────────────────────────────────────────────────
async function scrapeHUDHomes() {
  const deals=[];
  const states=['FL','TX','GA','AZ','NC','OH','MI','IL','PA','MO'];
  for (const state of states) {
    try {
      const url=`https://www.hudhomestore.gov/Listing/PropertyListing.aspx?sState=${state}&iBedrooms=0&sBaths=0&sPropertyType=SFR&sPropCond=&sHudHomeType=&iIncentive=0&sListingId=&iBuyerType=0&iPage=1&sCity=&sZip=&sCounty=`;
      const res=await scraperGet(url,{timeout:25000});
      const $=cheerio.load(res.data);
      $('tr').each(function(){
        const cells=$(this).find('td');
        if(cells.length<4) return;
        const address=$(cells.eq(0)).text().trim();
        const city=$(cells.eq(1)).text().trim();
        const priceText=$(cells.eq(3)).text().trim();
        const price=parseInt(priceText.replace(/[^0-9]/g,''))||0;
        if(address&&price>0){
          deals.push({
            address:`${address}, ${city}, ${state}`,
            listPrice:price, state,
            category:'HUD / REO',
            source:'HUD Homes',
            sourceUrl:'https://www.hudhomestore.gov',
            status:'Review Queue', verified:false,
            created:new Date().toISOString(),
          });
        }
      });
      await sleep(1500);
    } catch(e){console.log(`HUD ${state}: ${e.message}`);}
  }
  return deals;
}

// ── FSBO Scraper ─────────────────────────────────────────────────────────────
async function scrapeFSBO() {
  const deals=[];
  const states=['FL','TX','GA','AZ','NC','TN','NV','CO','CA','OH'];
  for (const state of states) {
    try {
      const url=`https://www.forsalebyowner.com/real-estate/${state.toLowerCase()}/`;
      const res=await scraperGet(url,{timeout:20000});
      const $=cheerio.load(res.data);
      $('[class*="listing"],[class*="property-card"],article').each(function(){
        const address=$(this).find('[class*="address"],h2,h3').first().text().trim();
        const priceText=$(this).find('[class*="price"]').first().text().trim();
        const price=parseInt(priceText.replace(/[^0-9]/g,''))||0;
        const link=$(this).find('a').first().attr('href')||'';
        if(address&&price>20000){
          deals.push({
            address, listPrice:price,
            category:'FSBO', source:'FSBO.com',
            sourceUrl:link.startsWith('http')?link:`https://www.forsalebyowner.com${link}`,
            state, status:'Review Queue', verified:false,
            created:new Date().toISOString(),
          });
        }
      });
      await sleep(1500);
    } catch(e){console.log(`FSBO ${state}: ${e.message}`);}
  }
  return deals;
}

// ── Landwatch Scraper ────────────────────────────────────────────────────────
async function scrapeLandWatch() {
  const deals=[];
  const stateMap={CA:'california',TX:'texas',FL:'florida',AZ:'arizona',GA:'georgia',NC:'north-carolina',TN:'tennessee',NV:'nevada',CO:'colorado',OR:'oregon'};
  for (const [abbr,name] of Object.entries(stateMap)) {
    try {
      const url=`https://www.landwatch.com/${name}-land-for-sale`;
      const res=await scraperGet(url,{timeout:20000});
      const $=cheerio.load(res.data);
      $('[class*="propCard"],[class*="listing-card"],article').each(function(){
        const address=$(this).find('[class*="title"],h2,h3').first().text().trim();
        const priceText=$(this).find('[class*="price"]').first().text().trim();
        const price=parseInt(priceText.replace(/[^0-9]/g,''))||0;
        const acres=$(this).find('[class*="acres"],[class*="size"]').first().text().trim();
        const link=$(this).find('a').first().attr('href')||'';
        if(address&&price>5000){
          deals.push({
            address:address+(acres?` (${acres})`:''),
            listPrice:price, category:'Land Deal',
            source:'Landwatch',
            sourceUrl:link.startsWith('http')?link:`https://www.landwatch.com${link}`,
            state:abbr, status:'Review Queue', verified:false,
            created:new Date().toISOString(),
          });
        }
      });
      await sleep(1500);
    } catch(e){console.log(`Landwatch ${abbr}: ${e.message}`);}
  }
  return deals;
}

// ── Redfin Comps ─────────────────────────────────────────────────────────────
async function getRedfinComps(address, state) {
  try {
    const geoUrl=`https://www.redfin.com/stingray/do/location-autocomplete?location=${encodeURIComponent(address+' '+state)}&v=2`;
    const geoRes=await scraperGet(geoUrl,{timeout:15000});
    const geoText=geoRes.data.toString().replace(/^[^{]*/,'');
    const geoData=JSON.parse(geoText);
    const row=geoData?.payload?.sections?.[0]?.rows?.[0];
    if(!row||!row.url) return null;

    const propRes=await scraperGet(`https://www.redfin.com${row.url}`,{timeout:15000});
    const $=cheerio.load(propRes.data);
    const price=parseInt($('[data-rf-test-id="abp-price"],.price').first().text().replace(/[^0-9]/g,''))||0;
    const beds=parseInt($('[data-rf-test-id="abp-beds"]').text())||0;
    const baths=parseFloat($('[data-rf-test-id="abp-baths"]').text())||0;
    const sqft=parseInt($('[data-rf-test-id="abp-sqFt"]').text().replace(/[^0-9]/g,''))||0;

    return {
      listPrice:price, beds, baths, sqft,
      arvEstimate:price,
      comps:[],
      sourceUrl:`https://www.redfin.com${row.url}`,
      dataSource:'Redfin',
    };
  } catch(e){
    console.log(`Redfin ${address}: ${e.message}`);
    return null;
  }
}

// ── Realtor.com backup ───────────────────────────────────────────────────────
async function getRealtorComps(address, state) {
  try {
    const slug=address.replace(/\s+/g,'-').replace(/[^a-zA-Z0-9-]/g,'');
    const url=`https://www.realtor.com/realestateandhomes-search/${slug}_${state}`;
    const res=await scraperGet(url,{timeout:15000});
    const $=cheerio.load(res.data);
    const priceText=$('[data-testid="list-price"],.price').first().text().trim();
    const price=parseInt(priceText.replace(/[^0-9]/g,''))||0;
    if(!price) return null;
    return {listPrice:price, arvEstimate:price, dataSource:'Realtor.com', sourceUrl:url};
  } catch(e){return null;}
}

// ── Rentometer ───────────────────────────────────────────────────────────────
async function getRentEstimate(address, beds) {
  try {
    const url=`https://www.rentometer.com/analysis/quick?address=${encodeURIComponent(address)}&bedrooms=${beds||3}`;
    const res=await axios.get(url,{headers:HEADERS,timeout:10000});
    if(res.data&&res.data.mean) return {rentEstimate:Math.round(res.data.mean),rentLow:res.data.percentile_25||0,rentHigh:res.data.percentile_75||0};
    return null;
  } catch(e){return null;}
}

// ── Zillow Property Data ─────────────────────────────────────────────────────
async function getZillowData(address, state) {
  try {
    const searchTerm=`${address} ${state}`;
    const url=`https://www.zillow.com/search/GetSearchPageState.htm?searchQueryState=${encodeURIComponent(JSON.stringify({pagination:{currentPage:1},usersSearchTerm:searchTerm,mapBounds:{west:-180,east:180,south:-90,north:90},isMapVisible:false,filterState:{sortSelection:{value:'globalrelevanceex'}},isListVisible:true}))}&wants={"cat1":["listResults"]}&requestId=1`;
    const res=await scraperGet(url,{timeout:15000});
    const results=res.data?.cat1?.searchResults?.listResults;
    if(!results||!results.length) return null;
    const prop=results[0];
    return {
      zillowPrice:prop.price||prop.unformattedPrice||0,
      zestimate:prop.zestimate||0,
      photoUrl:prop.imgSrc||prop.carouselPhotos?.[0]?.url||'',
      zillowUrl:prop.detailUrl?`https://www.zillow.com${prop.detailUrl}`:`https://www.zillow.com/homes/${encodeURIComponent(searchTerm)}_rb/`,
      beds:prop.beds||0, baths:prop.baths||0, sqft:prop.area||0,
      dataSource:'Zillow',
    };
  } catch(e){
    return {
      photoUrl:'',
      zillowUrl:`https://www.zillow.com/homes/${encodeURIComponent(address+' '+state)}_rb/`,
      dataSource:'Zillow (link only)',
    };
  }
}

// ── Lead Validator & Enricher ────────────────────────────────────────────────
async function validateAndEnrichLead(address, state) {
  if(!address||address.length<5) return {valid:false,reason:'No valid address'};
  try {
    const redfin=await getRedfinComps(address,state);
    const zillow=await getZillowData(address,state);
    const zillowUrl=zillow?.zillowUrl||`https://www.zillow.com/homes/${encodeURIComponent(address+' '+state)}_rb/`;
    const photoUrl=zillow?.photoUrl||'';
    const streetViewUrl=`https://maps.googleapis.com/maps/api/streetview?size=400x300&location=${encodeURIComponent(address+' '+state)}&key=`;

    if(redfin&&redfin.arvEstimate>0){
      const rent=await getRentEstimate(address,redfin.beds);
      return {
        valid:true,
        arvEstimate:redfin.arvEstimate,
        listPrice:redfin.listPrice,
        beds:redfin.beds, baths:redfin.baths, sqft:redfin.sqft,
        comps:redfin.comps||[],
        rentEstimate:rent?.rentEstimate||0,
        photoUrl, zillowUrl,
        streetViewUrl,
        redfinUrl:redfin.sourceUrl,
        dataSource:'Redfin + Zillow',
      };
    }

    const realtor=await getRealtorComps(address,state);
    if(realtor&&realtor.arvEstimate>0){
      return {
        valid:true,
        arvEstimate:realtor.arvEstimate,
        listPrice:realtor.listPrice,
        comps:[],rentEstimate:0,
        photoUrl, zillowUrl, streetViewUrl,
        realtorUrl:realtor.sourceUrl,
        dataSource:'Realtor.com + Zillow',
      };
    }

    // Cannot validate — but Zillow link still available
    return {
      valid:false,
      reason:'No comp data found on Redfin or Realtor.com',
      zillowUrl, photoUrl, streetViewUrl,
    };
  } catch(e){
    return {valid:false, reason:e.message};
  }
}

// ── Deal Classifier ──────────────────────────────────────────────────────────
function classifyDeal(lead) {
  const arv=lead.arv||lead.arvEstimate||0;
  const price=lead.offer||lead.listPrice||0;
  const repairs=lead.repairs||0;
  const rent=lead.rentEstimate||0;
  const equity=arv-price-repairs;
  const pct=arv>0?equity/arv:0;
  const cat=(lead.category||'').toLowerCase();

  if(cat.includes('land')) return {type:'Land Deal',reason:'Land listing — hold, subdivide, or develop'};
  if(cat.includes('trailer')||cat.includes('mobile')) return {type:'Trailer Park',reason:'Mobile home / trailer park opportunity'};
  if(cat.includes('hud')||cat.includes('reo')) return {type:'Wholesale / REO',reason:'Bank-owned — buy below market, assign or flip'};
  if(pct>=0.30&&price<arv*0.70) return {type:'Wholesale',reason:`${Math.round(pct*100)}% equity spread — strong assignment candidate`};
  if(repairs>0&&repairs<arv*0.25&&pct>=0.20) return {type:'Fix & Flip',reason:`Repairs at ${Math.round(repairs/arv*100)}% of ARV — flip margin exists`};
  if(rent>0&&rent*12>price*0.08) return {type:'Buy & Hold Rental',reason:`$${rent}/mo rent — ${Math.round(rent*12/price*100)}% gross yield`};
  if(pct<0.15&&(lead.dom||0)>90) return {type:'Creative Finance',reason:'Low equity but long DOM — seller may accept subject-to or seller financing'};
  if(pct>=0.15) return {type:'Wholesale',reason:`${Math.round(pct*100)}% equity — assignable deal`};
  return {type:'Review Needed',reason:'Insufficient data — manual review recommended'};
}

module.exports = {
  HOT_MARKETS, ALL_STATE_MARKETS,
  scrapeCraigslistBuyers, scrapeCraigslistDeals,
  scrapeHUDHomes, scrapeFSBO, scrapeLandWatch,
  getRedfinComps, getRealtorComps, getRentEstimate, getZillowData,
  validateAndEnrichLead, classifyDeal,
};
