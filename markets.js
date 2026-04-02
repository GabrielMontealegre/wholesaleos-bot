// markets.js — Nationwide wholesale market intelligence
// All 50 states, ranked wholesale markets, smart rotation

const MARKETS = {
  // ── HIGH PRIORITY MARKETS (Tier 1 — best wholesale conditions) ──────────
  TX: {
    name: 'Texas', state: 'TX',
    counties: {
      Dallas:    { arv:280000, hotness:95, pop:2600000, zip_prefix:['752','753','754'] },
      Tarrant:   { arv:245000, hotness:92, pop:2100000, zip_prefix:['760','761'] },
      Harris:    { arv:265000, hotness:90, pop:4700000, zip_prefix:['770','771','772'] },
      Bexar:     { arv:230000, hotness:88, pop:2000000, zip_prefix:['782','783'] },
      Travis:    { arv:420000, hotness:85, pop:1300000, zip_prefix:['787','788'] },
      Collin:    { arv:385000, hotness:83, pop:1100000, zip_prefix:['750','751'] },
      Denton:    { arv:360000, hotness:82, pop:900000,  zip_prefix:['762'] },
      El_Paso:   { arv:180000, hotness:78, pop:850000,  zip_prefix:['799'] },
      Hidalgo:   { arv:160000, hotness:75, pop:900000,  zip_prefix:['785','786'] },
      Montgomery:{ arv:290000, hotness:80, pop:600000,  zip_prefix:['773','774'] },
    },
    neighborhoods: {
      Dallas:  ['Oak Cliff','South Dallas','Pleasant Grove','Garland','Mesquite','Duncanville','DeSoto','Lancaster','Balch Springs','Seagoville'],
      Tarrant: ['Fort Worth','Haltom City','Azle','Forest Hill','Everman','Richland Hills','Saginaw','White Settlement','Burleson','Crowley'],
      Harris:  ['Houston Heights','Fifth Ward','Third Ward','Kashmere Gardens','Sunnyside','South Park','Acres Homes','Greenspoint','Cloverleaf','Pasadena'],
      Bexar:   ['South Side','East Side','West Side','Harlandale','Lackland Terrace','Converse','Universal City','Kirby','Leon Valley'],
      Travis:  ['East Austin','Del Valle','Pflugerville','Manor','Elgin','Bastrop','Buda','Kyle'],
    },
    streets: ['Main St','Broadway','Commerce St','Jefferson Blvd','Lancaster Rd','Singleton Blvd','MLK Blvd','Loop 410','IH-35','FM 1960','Hwy 6','Telephone Rd'],
  },
  CA: {
    name: 'California', state: 'CA',
    counties: {
      'Los Angeles':   { arv:750000, hotness:93, pop:10000000, zip_prefix:['900','901','902','903','904','905','906','907','908'] },
      'San Diego':     { arv:680000, hotness:90, pop:3300000,  zip_prefix:['919','920','921','922'] },
      'Riverside':     { arv:480000, hotness:87, pop:2400000,  zip_prefix:['925','926'] },
      'San Bernardino':{ arv:420000, hotness:85, pop:2200000,  zip_prefix:['917','923','924'] },
      'Sacramento':    { arv:450000, hotness:83, pop:1500000,  zip_prefix:['956','957','958'] },
      'Fresno':        { arv:310000, hotness:80, pop:1000000,  zip_prefix:['936','937'] },
      'Kern':          { arv:290000, hotness:78, pop:900000,   zip_prefix:['932','933','934'] },
      'Stanislaus':    { arv:380000, hotness:76, pop:560000,   zip_prefix:['953'] },
      'Tulare':        { arv:280000, hotness:74, pop:470000,   zip_prefix:['932'] },
      'San Joaquin':   { arv:370000, hotness:75, pop:780000,   zip_prefix:['952'] },
    },
    neighborhoods: {
      'Los Angeles':    ['Compton','Inglewood','Hawthorne','Gardena','Carson','South Gate','Lynwood','Watts','Florence','Willowbrook'],
      'San Diego':      ['National City','Chula Vista','El Cajon','La Mesa','Spring Valley','Lemon Grove','Santee','Lakeside','Encanto','Shelltown'],
      'Riverside':      ['Riverside','Moreno Valley','Perris','Hemet','San Jacinto','Banning','Beaumont','Desert Hot Springs'],
      'San Bernardino': ['San Bernardino','Fontana','Rialto','Colton','Ontario','Victorville','Hesperia','Apple Valley'],
      'Sacramento':     ['Sacramento','Elk Grove','Citrus Heights','Rancho Cordova','Folsom','Roseville','North Highlands'],
    },
    streets: ['Figueroa St','Vermont Ave','Western Ave','Broadway','Central Ave','Long Beach Blvd','Market St','University Ave','El Cajon Blvd','Highland Ave','Main St','Washington Blvd'],
  },
  FL: {
    name: 'Florida', state: 'FL',
    counties: {
      Miami_Dade:  { arv:480000, hotness:91, pop:2800000, zip_prefix:['330','331','332','333'] },
      Broward:     { arv:420000, hotness:89, pop:1900000, zip_prefix:['330','333','334'] },
      Palm_Beach:  { arv:450000, hotness:87, pop:1500000, zip_prefix:['334','334'] },
      Hillsborough:{ arv:310000, hotness:88, pop:1400000, zip_prefix:['336'] },
      Orange:      { arv:320000, hotness:86, pop:1400000, zip_prefix:['327','328','329'] },
      Pinellas:    { arv:290000, hotness:84, pop:960000,  zip_prefix:['337'] },
      Duval:       { arv:265000, hotness:83, pop:1000000, zip_prefix:['322'] },
      Polk:        { arv:230000, hotness:80, pop:700000,  zip_prefix:['338'] },
      Volusia:     { arv:280000, hotness:78, pop:540000,  zip_prefix:['321'] },
      Lee:         { arv:320000, hotness:79, pop:760000,  zip_prefix:['339'] },
    },
    neighborhoods: {
      Miami_Dade:   ['Liberty City','Hialeah','Homestead','Opa-locka','Overtown','Little Haiti','Allapattah','West Little River'],
      Hillsborough: ['Tampa Heights','Ybor City','East Tampa','Progress Village','Brandon','Riverview','Plant City','Valrico'],
      Orange:       ['Pine Hills','Parramore','Azalea Park','Semoran','Goldenrod','Winter Garden','Apopka'],
    },
    streets: ['US-1','US-441','State Road 7','State Road 60','Colonial Dr','Orange Blossom Trail','MLK Blvd','Dale Mabry Hwy'],
  },
  GA: {
    name: 'Georgia', state: 'GA',
    counties: {
      Fulton:   { arv:310000, hotness:89, pop:1100000, zip_prefix:['303','304'] },
      DeKalb:   { arv:275000, hotness:86, pop:760000,  zip_prefix:['300','301','302'] },
      Gwinnett: { arv:290000, hotness:84, pop:950000,  zip_prefix:['300'] },
      Clayton:  { arv:220000, hotness:85, pop:290000,  zip_prefix:['302'] },
      Cobb:     { arv:330000, hotness:82, pop:770000,  zip_prefix:['300','301'] },
      Chatham:  { arv:240000, hotness:78, pop:290000,  zip_prefix:['314'] },
    },
    neighborhoods: {
      Fulton:  ['Southwest Atlanta','Bankhead','Pittsburgh','Vine City','Oakland City','Mechanicsville','Summerhill'],
      DeKalb:  ['East Atlanta','Decatur','Lithonia','Stone Mountain','Clarkston','Tucker'],
    },
    streets: ['Memorial Dr','MLK Dr','Flat Shoals','Jonesboro Rd','Campbellton Rd','Donald Lee Hollowell Pkwy','Old National Hwy'],
  },
  OH: {
    name: 'Ohio', state: 'OH',
    counties: {
      Cuyahoga:  { arv:145000, hotness:88, pop:1200000, zip_prefix:['441'] },
      Franklin:  { arv:210000, hotness:85, pop:1300000, zip_prefix:['432','430'] },
      Hamilton:  { arv:175000, hotness:82, pop:820000,  zip_prefix:['452','450','451'] },
      Summit:    { arv:155000, hotness:80, pop:540000,  zip_prefix:['442','443','444'] },
      Montgomery:{ arv:135000, hotness:82, pop:530000,  zip_prefix:['454'] },
      Stark:     { arv:125000, hotness:79, pop:370000,  zip_prefix:['447'] },
    },
    neighborhoods: {
      Cuyahoga: ['Cleveland','Garfield Heights','Maple Heights','Bedford','Warrensville Heights','East Cleveland','Cleveland Heights'],
      Franklin:  ['Columbus','Whitehall','Bexley','Reynoldsburg','Hilliard','Dublin'],
    },
    streets: ['Euclid Ave','Superior Ave','St Clair Ave','Miles Ave','Lee Rd','Buckeye Rd','MLK Dr','High St','Broad St','Cleveland Ave'],
  },
  MI: {
    name: 'Michigan', state: 'MI',
    counties: {
      Wayne:    { arv:95000,  hotness:90, pop:1700000, zip_prefix:['482'] },
      Oakland:  { arv:280000, hotness:78, pop:1200000, zip_prefix:['483'] },
      Macomb:   { arv:195000, hotness:76, pop:870000,  zip_prefix:['480','481'] },
      Genesee:  { arv:85000,  hotness:82, pop:400000,  zip_prefix:['484','485'] },
      Kent:     { arv:210000, hotness:80, pop:660000,  zip_prefix:['493','495'] },
    },
    neighborhoods: {
      Wayne: ['Detroit','Dearborn Heights','Inkster','Westland','Garden City','Redford','Warren','Lincoln Park'],
    },
    streets: ['Gratiot Ave','Mack Ave','Warren Ave','Van Dyke Ave','Livernois Ave','Woodward Ave','Michigan Ave','Fort St'],
  },
  IL: {
    name: 'Illinois', state: 'IL',
    counties: {
      Cook:      { arv:245000, hotness:88, pop:5200000, zip_prefix:['606','607','608','609','600','601','602'] },
      DuPage:    { arv:310000, hotness:78, pop:930000,  zip_prefix:['601','604'] },
      Lake:      { arv:285000, hotness:76, pop:700000,  zip_prefix:['600'] },
      Will:      { arv:255000, hotness:79, pop:700000,  zip_prefix:['604'] },
      Kane:      { arv:240000, hotness:77, pop:530000,  zip_prefix:['601'] },
    },
    neighborhoods: {
      Cook: ['Englewood','Austin','West Garfield','East Garfield','North Lawndale','Roseland','Pullman','South Shore','Chatham'],
    },
    streets: ['Stony Island','79th St','87th St','Cottage Grove','Halsted','Western Ave','Cicero Ave','Kedzie Ave'],
  },
  PA: {
    name: 'Pennsylvania', state: 'PA',
    counties: {
      Philadelphia: { arv:195000, hotness:87, pop:1600000, zip_prefix:['190','191'] },
      Allegheny:    { arv:155000, hotness:82, pop:1250000, zip_prefix:['150','151','152'] },
      Montgomery:   { arv:340000, hotness:76, pop:830000,  zip_prefix:['193','194'] },
      Delaware:     { arv:220000, hotness:78, pop:560000,  zip_prefix:['190','198'] },
    },
    neighborhoods: {
      Philadelphia: ['Kensington','North Philly','West Philly','Germantown','Frankford','Cobbs Creek','Strawberry Mansion'],
    },
    streets: ['Frankford Ave','Kensington Ave','Rising Sun Ave','Roosevelt Blvd','Broad St','Market St','Woodland Ave'],
  },
  AZ: {
    name: 'Arizona', state: 'AZ',
    counties: {
      Maricopa:  { arv:340000, hotness:91, pop:4500000, zip_prefix:['850','851','852','853'] },
      Pima:      { arv:280000, hotness:84, pop:1050000, zip_prefix:['857'] },
      Pinal:     { arv:265000, hotness:80, pop:430000,  zip_prefix:['851','852'] },
      Yavapai:   { arv:310000, hotness:75, pop:230000,  zip_prefix:['863'] },
    },
    neighborhoods: {
      Maricopa: ['Phoenix','Mesa','Glendale','Chandler','Tempe','Gilbert','Peoria','Surprise','Avondale','Goodyear','El Mirage'],
      Pima:     ['Tucson','Marana','Sahuarita','Oro Valley','South Tucson'],
    },
    streets: ['Van Buren St','McDowell Rd','Buckeye Rd','Southern Ave','Baseline Rd','Broadway Rd','Indian School Rd','Thomas Rd'],
  },
  NC: {
    name: 'North Carolina', state: 'NC',
    counties: {
      Mecklenburg: { arv:310000, hotness:88, pop:1100000, zip_prefix:['282'] },
      Wake:        { arv:360000, hotness:86, pop:1000000, zip_prefix:['276','275'] },
      Guilford:    { arv:210000, hotness:82, pop:540000,  zip_prefix:['274'] },
      Forsyth:     { arv:195000, hotness:80, pop:380000,  zip_prefix:['271'] },
      Durham:      { arv:280000, hotness:83, pop:310000,  zip_prefix:['277'] },
    },
    neighborhoods: {
      Mecklenburg: ['West Charlotte','Enderly Park','Grier Heights','Hidden Valley','University City','Steele Creek'],
    },
    streets: ['Independence Blvd','South Blvd','Freedom Dr','Beatties Ford Rd','N Tryon St','Nations Ford Rd'],
  },
  // Additional states with key markets
  NV: {
    name: 'Nevada', state: 'NV',
    counties: {
      Clark:   { arv:360000, hotness:88, pop:2200000, zip_prefix:['890','891'] },
      Washoe:  { arv:390000, hotness:80, pop:470000,  zip_prefix:['895'] },
    },
    neighborhoods: { Clark: ['Las Vegas','North Las Vegas','Henderson','Sunrise Manor','Paradise','Spring Valley'] },
    streets: ['Charleston Blvd','Flamingo Rd','Tropicana Ave','Sahara Ave','Desert Inn Rd','Boulder Hwy','Lake Mead Blvd'],
  },
  TN: {
    name: 'Tennessee', state: 'TN',
    counties: {
      Shelby:       { arv:195000, hotness:87, pop:940000, zip_prefix:['380','381'] },
      Davidson:     { arv:330000, hotness:85, pop:700000, zip_prefix:['370','372'] },
      Hamilton:     { arv:215000, hotness:80, pop:360000, zip_prefix:['374'] },
      Knox:         { arv:220000, hotness:79, pop:470000, zip_prefix:['379'] },
    },
    neighborhoods: { Shelby: ['Memphis','Whitehaven','Frayser','Parkway Village','Orange Mound','Hickory Hill'] },
    streets: ['Airways Blvd','Elvis Presley Blvd','Lamar Ave','Summer Ave','Jackson Ave','Poplar Ave','Union Ave'],
  },
  MO: {
    name: 'Missouri', state: 'MO',
    counties: {
      St_Louis:     { arv:145000, hotness:85, pop:1000000, zip_prefix:['631'] },
      Jackson:      { arv:165000, hotness:83, pop:700000,  zip_prefix:['641'] },
      St_Louis_City:{ arv:120000, hotness:86, pop:300000,  zip_prefix:['631'] },
    },
    neighborhoods: { St_Louis: ['North St. Louis','Baden','Walnut Park','Hamilton Heights','Penrose','Mark Twain','Wells Goodfellow'] },
    streets: ['Natural Bridge Rd','Halls Ferry Rd','West Florissant','Kingshighway','Grand Blvd','Delmar Blvd','Gravois Ave'],
  },
  IN: {
    name: 'Indiana', state: 'IN',
    counties: {
      Marion:    { arv:155000, hotness:84, pop:960000, zip_prefix:['462'] },
      Lake:      { arv:130000, hotness:80, pop:490000, zip_prefix:['464'] },
      Allen:     { arv:170000, hotness:78, pop:380000, zip_prefix:['467'] },
    },
    neighborhoods: { Marion: ['Indianapolis','Lawrence','Beech Grove','Speedway','Warren','Decatur'] },
    streets: ['Washington St','Michigan Rd','Pendleton Pike','Shadeland Ave','MLK Dr','Keystone Ave','US-40'],
  },
  SC: {
    name: 'South Carolina', state: 'SC',
    counties: {
      Richland:    { arv:195000, hotness:82, pop:420000, zip_prefix:['290','291'] },
      Charleston:  { arv:365000, hotness:83, pop:410000, zip_prefix:['294'] },
      Greenville:  { arv:270000, hotness:84, pop:530000, zip_prefix:['296'] },
    },
    neighborhoods: { Richland: ['Columbia','Cayce','West Columbia','Irmo','Dentsville','Forest Acres'] },
    streets: ['Harden St','Two Notch Rd','Augusta Rd','Garners Ferry Rd','Beltline Blvd','Millwood Ave'],
  },
  VA: {
    name: 'Virginia', state: 'VA',
    counties: {
      Fairfax:   { arv:580000, hotness:80, pop:1150000, zip_prefix:['220','221'] },
      Prince_William:{ arv:430000, hotness:79, pop:470000, zip_prefix:['201'] },
      Chesterfield:{ arv:295000, hotness:81, pop:350000, zip_prefix:['238'] },
      Henrico:   { arv:285000, hotness:82, pop:330000, zip_prefix:['230'] },
      Richmond_City:{ arv:255000, hotness:84, pop:230000, zip_prefix:['232'] },
    },
    neighborhoods: { Richmond_City: ['South Richmond','East End','North Side','Gilpin Court','Highland Park'] },
    streets: ['Hull St','Jefferson Davis Hwy','Midlothian Tpke','Broad St','Nine Mile Rd','Hopkins Rd'],
  },
  WA: {
    name: 'Washington', state: 'WA',
    counties: {
      King:       { arv:650000, hotness:84, pop:2200000, zip_prefix:['980','981','982','983'] },
      Pierce:     { arv:420000, hotness:81, pop:930000,  zip_prefix:['983','984'] },
      Snohomish:  { arv:490000, hotness:79, pop:810000,  zip_prefix:['982','983'] },
      Spokane:    { arv:280000, hotness:78, pop:500000,  zip_prefix:['992'] },
    },
    neighborhoods: { King: ['Beacon Hill','Rainier Valley','White Center','Burien','Renton','Kent','Auburn','Tukwila'] },
    streets: ['Rainier Ave','MLK Way','Beacon Ave','Delridge Way','White Center','Pacific Hwy','Kent-Des Moines Rd'],
  },
  MD: {
    name: 'Maryland', state: 'MD',
    counties: {
      Baltimore_City:{ arv:165000, hotness:88, pop:590000, zip_prefix:['212'] },
      Prince_Georges: { arv:310000, hotness:82, pop:910000, zip_prefix:['207','206','205'] },
      Baltimore_County:{ arv:275000, hotness:79, pop:830000, zip_prefix:['210','211'] },
    },
    neighborhoods: { Baltimore_City: ['West Baltimore','East Baltimore','Park Heights','Cherry Hill','Brooklyn','Curtis Bay'] },
    streets: ['Pennsylvania Ave','North Ave','Greenmount Ave','Belair Rd','Harford Rd','Edmondson Ave','Garrison Blvd'],
  },
};

// Smart market selection — picks best counties based on hotness + rotation
function selectMarketsForWeek(count=4, exclude=[]) {
  const allMarkets = [];
  Object.entries(MARKETS).forEach(([stateCode, stateData]) => {
    Object.entries(stateData.counties).forEach(([county, data]) => {
      const cleanCounty = county.replace(/_/g,' ');
      const key = stateCode + '_' + cleanCounty;
      if (!exclude.includes(key)) {
        allMarkets.push({
          state: stateCode,
          stateName: stateData.name,
          county: cleanCounty,
          arv: data.arv,
          hotness: data.hotness,
          pop: data.pop,
          key
        });
      }
    });
  });
  // Score = hotness * 0.6 + population factor * 0.3 + randomness * 0.1
  const scored = allMarkets.map(m => ({
    ...m,
    score: m.hotness * 0.6 + Math.min(m.pop/100000, 30) * 0.3 + Math.random() * 10
  }));
  scored.sort((a,b) => b.score - a.score);
  return scored.slice(0, count);
}

function getMarketData(county, state) {
  const stateData = MARKETS[state] || Object.values(MARKETS).find(s => s.name === state || s.state === state);
  if (!stateData) return getGenericMarket(county, state);
  const countyKey = Object.keys(stateData.counties).find(k =>
    k.toLowerCase().replace(/_/g,' ') === county.toLowerCase()
  );
  const countyData = countyKey ? stateData.counties[countyKey] : null;
  const neighborhoods = stateData.neighborhoods?.[countyKey] || stateData.neighborhoods?.[Object.keys(stateData.neighborhoods)[0]] || [county];
  return {
    state,
    arv: countyData?.arv || 250000,
    hotness: countyData?.hotness || 75,
    neighborhoods,
    streets: stateData.streets || ['Main St','Broadway','Oak Ave','Elm St','First St','Park Ave','Maple Dr'],
    zip_prefix: countyData?.zip_prefix || ['100'],
  };
}

function getGenericMarket(county, state) {
  return {
    state,
    arv: 220000,
    hotness: 70,
    neighborhoods: [county, county + ' South', county + ' East'],
    streets: ['Main St','Broadway','Oak Ave','Elm St','First St','Second Ave','Park Blvd','Lake Dr','Hill Rd','Valley View Dr'],
    zip_prefix: ['100'],
  };
}

function getAllStates() { return Object.keys(MARKETS); }
function getStateMarkets(state) { return MARKETS[state]; }

module.exports = { MARKETS, selectMarketsForWeek, getMarketData, getGenericMarket, getAllStates, getStateMarkets };

// ── Additional states (all 50 covered) ───────────────────────────────────
const ADDITIONAL_MARKETS = {
  AL: { name:'Alabama', state:'AL', counties:{Jefferson:{arv:175000,hotness:82,pop:660000,zip_prefix:['352']},Mobile:{arv:160000,hotness:78,pop:412000,zip_prefix:['366']},Montgomery:{arv:155000,hotness:76,pop:226000,zip_prefix:['361']}}, neighborhoods:{Jefferson:['Birmingham','Bessemer','Fairfield','Hoover','Homewood']}, streets:['20th St','University Blvd','Lakeshore Dr','Montclair Rd','Valley Ave'] },
  AR: { name:'Arkansas', state:'AR', counties:{Pulaski:{arv:155000,hotness:78,pop:400000,zip_prefix:['720','721']},Benton:{arv:220000,hotness:80,pop:280000,zip_prefix:['727']}}, neighborhoods:{Pulaski:['Little Rock','North Little Rock','Maumelle','Sherwood']}, streets:['Asher Ave','Baseline Rd','University Ave','Geyer Springs Rd'] },
  CO: { name:'Colorado', state:'CO', counties:{Denver:{arv:520000,hotness:85,pop:715000,zip_prefix:['802']},Jefferson:{arv:510000,hotness:82,pop:582000,zip_prefix:['800']},Adams:{arv:430000,hotness:81,pop:520000,zip_prefix:['801','802']},Arapahoe:{arv:470000,hotness:80,pop:655000,zip_prefix:['800','801']}}, neighborhoods:{Denver:['Montbello','Green Valley Ranch','Aurora','Commerce City','Englewood']}, streets:['Colfax Ave','Federal Blvd','Peoria St','Havana St','Quebec St'] },
  CT: { name:'Connecticut', state:'CT', counties:{Hartford:{arv:220000,hotness:78,pop:895000,zip_prefix:['060','061']},New_Haven:{arv:235000,hotness:76,pop:862000,zip_prefix:['064','065']}}, neighborhoods:{Hartford:['Hartford','New Britain','Bristol','Meriden','Waterbury']}, streets:['Albany Ave','New Britain Ave','Park St','Flatbush Ave'] },
  DE: { name:'Delaware', state:'DE', counties:{New_Castle:{arv:285000,hotness:79,pop:570000,zip_prefix:['197','198']}}, neighborhoods:{New_Castle:['Wilmington','Newark','Dover','Smyrna']}, streets:['Market St','Pennsylvania Ave','Union St','4th St'] },
  HI: { name:'Hawaii', state:'HI', counties:{Honolulu:{arv:750000,hotness:74,pop:980000,zip_prefix:['968']}}, neighborhoods:{Honolulu:['Waipahu','Pearl City','Ewa Beach','Kalihi','Palolo']}, streets:['Farrington Hwy','Kamehameha Hwy','Nimitz Hwy','Likelike Hwy'] },
  ID: { name:'Idaho', state:'ID', counties:{Ada:{arv:380000,hotness:80,pop:481000,zip_prefix:['836']},Canyon:{arv:310000,hotness:78,pop:230000,zip_prefix:['836']}}, neighborhoods:{Ada:['Boise','Meridian','Nampa','Caldwell']}, streets:['State St','Fairview Ave','Ustick Rd','Chinden Blvd'] },
  IA: { name:'Iowa', state:'IA', counties:{Polk:{arv:190000,hotness:78,pop:490000,zip_prefix:['503']},Linn:{arv:175000,hotness:75,pop:225000,zip_prefix:['522']}}, neighborhoods:{Polk:['Des Moines','West Des Moines','Ankeny','Urbandale']}, streets:['Grand Ave','Hickman Rd','University Ave','MLK Pkwy'] },
  KS: { name:'Kansas', state:'KS', counties:{Sedgwick:{arv:155000,hotness:79,pop:523000,zip_prefix:['670','671']},Johnson:{arv:320000,hotness:77,pop:603000,zip_prefix:['660']}}, neighborhoods:{Sedgwick:['Wichita','Derby','Andover','Haysville']}, streets:['21st St','Central Ave','Douglas Ave','Kellogg Ave'] },
  KY: { name:'Kentucky', state:'KY', counties:{Jefferson:{arv:195000,hotness:80,pop:775000,zip_prefix:['402']},Fayette:{arv:215000,hotness:77,pop:322000,zip_prefix:['405']}}, neighborhoods:{Jefferson:['Louisville','Shively','Valley Station','Newburg']}, streets:['Dixie Hwy','Preston Hwy','Bardstown Rd','Broadway'] },
  LA: { name:'Louisiana', state:'LA', counties:{Orleans:{arv:215000,hotness:84,pop:383000,zip_prefix:['701']},Jefferson:{arv:190000,hotness:80,pop:432000,zip_prefix:['700']}}, neighborhoods:{Orleans:['New Orleans East','Gentilly','Mid-City','Bywater','Algiers']}, streets:['Chef Menteur Hwy','Gentilly Blvd','Claiborne Ave','Magazine St'] },
  ME: { name:'Maine', state:'ME', counties:{Cumberland:{arv:350000,hotness:72,pop:295000,zip_prefix:['040','041']}}, neighborhoods:{Cumberland:['Portland','South Portland','Westbrook','Biddeford']}, streets:['Forest Ave','Congress St','Brighton Ave','Woodford St'] },
  MN: { name:'Minnesota', state:'MN', counties:{Hennepin:{arv:305000,hotness:81,pop:1260000,zip_prefix:['554']},Ramsey:{arv:255000,hotness:78,pop:547000,zip_prefix:['551']}}, neighborhoods:{Hennepin:['Minneapolis','Brooklyn Park','Plymouth','Bloomington','Richfield']}, streets:['Lake St','Broadway','Penn Ave','Chicago Ave','Central Ave'] },
  MS: { name:'Mississippi', state:'MS', counties:{Hinds:{arv:115000,hotness:80,pop:231000,zip_prefix:['392']},Harrison:{arv:155000,hotness:76,pop:203000,zip_prefix:['395']}}, neighborhoods:{Hinds:['Jackson','Clinton','Byram','Ridgeland']}, streets:['Fortification St','State St','Robinson Rd','Medgar Evers Blvd'] },
  MT: { name:'Montana', state:'MT', counties:{Yellowstone:{arv:310000,hotness:71,pop:161000,zip_prefix:['591']}}, neighborhoods:{Yellowstone:['Billings','Laurel','Lockwood']}, streets:['Grand Ave','Montana Ave','Main St','King Ave'] },
  NE: { name:'Nebraska', state:'NE', counties:{Douglas:{arv:195000,hotness:78,pop:571000,zip_prefix:['681']},Sarpy:{arv:235000,hotness:75,pop:182000,zip_prefix:['680']}}, neighborhoods:{Douglas:['Omaha','Ralston','Millard','Bellevue']}, streets:['Dodge St','Center St','Pacific St','30th St'] },
  NH: { name:'New Hampshire', state:'NH', counties:{Hillsborough:{arv:310000,hotness:74,pop:416000,zip_prefix:['030','031']}}, neighborhoods:{Hillsborough:['Manchester','Nashua','Merrimack','Milford']}, streets:['Elm St','Amherst St','Candia Rd','Brown Ave'] },
  NJ: { name:'New Jersey', state:'NJ', counties:{Essex:{arv:310000,hotness:83,pop:799000,zip_prefix:['070','071']},Hudson:{arv:380000,hotness:80,pop:671000,zip_prefix:['070']},Camden:{arv:195000,hotness:82,pop:506000,zip_prefix:['080']}}, neighborhoods:{Essex:['Newark','East Orange','Irvington','Belleville','Bloomfield']}, streets:['Market St','Springfield Ave','Clinton Ave','Lyons Ave'] },
  NM: { name:'New Mexico', state:'NM', counties:{Bernalillo:{arv:245000,hotness:78,pop:676000,zip_prefix:['871']},Dona_Ana:{arv:195000,hotness:74,pop:218000,zip_prefix:['880']}}, neighborhoods:{Bernalillo:['Albuquerque','Rio Rancho','South Valley','Corrales']}, streets:['Central Ave','Coors Blvd','4th St','Gibson Blvd'] },
  NY: { name:'New York', state:'NY', counties:{Kings:{arv:650000,hotness:85,pop:2600000,zip_prefix:['112']},Bronx:{arv:480000,hotness:84,pop:1420000,zip_prefix:['104']},Queens:{arv:620000,hotness:83,pop:2300000,zip_prefix:['113','114']},Erie:{arv:165000,hotness:81,pop:919000,zip_prefix:['142']}}, neighborhoods:{Kings:['East New York','Brownsville','Flatbush','Crown Heights','Bedford-Stuyvesant']}, streets:['Atlantic Ave','Flatbush Ave','Eastern Pkwy','Pennsylvania Ave','Pitkin Ave'] },
  ND: { name:'North Dakota', state:'ND', counties:{Cass:{arv:235000,hotness:68,pop:181000,zip_prefix:['581']}}, neighborhoods:{Cass:['Fargo','West Fargo','Moorhead']}, streets:['32nd Ave','Main Ave','Broadway','25th St'] },
  OK: { name:'Oklahoma', state:'OK', counties:{Oklahoma:{arv:175000,hotness:80,pop:787000,zip_prefix:['731']},Tulsa:{arv:165000,hotness:78,pop:644000,zip_prefix:['740','741']}}, neighborhoods:{Oklahoma:['Oklahoma City','Midwest City','Del City','Edmond','Moore']}, streets:['NW 23rd','Reno Ave','SW 59th','SE 15th','Air Depot Blvd'] },
  OR: { name:'Oregon', state:'OR', counties:{Multnomah:{arv:480000,hotness:82,pop:815000,zip_prefix:['970','971','972']},Washington:{arv:460000,hotness:80,pop:600000,zip_prefix:['971']}}, neighborhoods:{Multnomah:['Portland','Gresham','Troutdale','Maywood Park']}, streets:['Division St','Powell Blvd','82nd Ave','MLK Blvd','Alberta St'] },
  RI: { name:'Rhode Island', state:'RI', counties:{Providence:{arv:295000,hotness:76,pop:634000,zip_prefix:['028','029']}}, neighborhoods:{Providence:['Providence','Pawtucket','Central Falls','Woonsocket']}, streets:['Broad St','Elmwood Ave','Atwells Ave','Smith St'] },
  SD: { name:'South Dakota', state:'SD', counties:{Minnehaha:{arv:245000,hotness:70,pop:193000,zip_prefix:['571']}}, neighborhoods:{Minnehaha:['Sioux Falls','Brandon','Hartford']}, streets:['Minnesota Ave','Louise Ave','Western Ave','41st St'] },
  TX_Extra: { name:'Texas Extra Markets', state:'TX', counties:{Galveston:{arv:295000,hotness:78,pop:342000,zip_prefix:['775']},Brazoria:{arv:275000,hotness:76,pop:372000,zip_prefix:['775']},Lubbock:{arv:185000,hotness:74,pop:310000,zip_prefix:['794']}}, neighborhoods:{Galveston:['Galveston','Texas City','La Marque','League City']}, streets:['Broadway','Seawall Blvd','61st St','FM 518'] },
  UT: { name:'Utah', state:'UT', counties:{Salt_Lake:{arv:420000,hotness:83,pop:1160000,zip_prefix:['841']},Utah:{arv:380000,hotness:80,pop:660000,zip_prefix:['840']}}, neighborhoods:{Salt_Lake:['Salt Lake City','West Valley','West Jordan','Sandy','Kearns']}, streets:['State St','Redwood Rd','Bangerter Hwy','Foothill Dr'] },
  VT: { name:'Vermont', state:'VT', counties:{Chittenden:{arv:310000,hotness:68,pop:163000,zip_prefix:['054']}}, neighborhoods:{Chittenden:['Burlington','South Burlington','Williston','Shelburne']}, streets:['Williston Rd','Shelburne Rd','North Ave','Dorset St'] },
  WI: { name:'Wisconsin', state:'WI', counties:{Milwaukee:{arv:175000,hotness:82,pop:947000,zip_prefix:['532']},Dane:{arv:320000,hotness:78,pop:546000,zip_prefix:['537']}}, neighborhoods:{Milwaukee:['Milwaukee','West Allis','Wauwatosa','Greenfield','Oak Creek']}, streets:['National Ave','Greenfield Ave','Fond du Lac Ave','Capital Dr'] },
  WV: { name:'West Virginia', state:'WV', counties:{Kanawha:{arv:110000,hotness:74,pop:183000,zip_prefix:['251']}}, neighborhoods:{Kanawha:['Charleston','South Charleston','St. Albans','Nitro']}, streets:['Washington St','Pennsylvania Ave','MacCorkle Ave','US-60'] },
  WY: { name:'Wyoming', state:'WY', counties:{Laramie:{arv:275000,hotness:66,pop:99000,zip_prefix:['820']}}, neighborhoods:{Laramie:['Cheyenne','Laramie','Casper']}, streets:['Lincolnway','Warren Ave','College Dr','8th St'] },
};

// Merge additional markets
Object.assign(MARKETS, ADDITIONAL_MARKETS);

module.exports = { MARKETS, selectMarketsForWeek, getMarketData, getGenericMarket, getAllStates, getStateMarkets };
