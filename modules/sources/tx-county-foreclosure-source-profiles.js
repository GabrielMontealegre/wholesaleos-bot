'use strict';

// TX county foreclosure source profiles (config, not code).
// Each profile drives the generic tx-county-foreclosure-acquisition-adapter.
// blocked_note documents what the county gates so rows and coverage can say
// it honestly instead of pretending the lane is empty.

const CURRENT_YEAR = new Date().getFullYear();

const PROFILES = [
  {
    source_id: 'tx_hunt_county_foreclosure_notices',
    source_name: 'Hunt County Foreclosure EasyDocs',
    county: 'Hunt',
    state: 'TX',
    source_url: `https://apps.huntcounty.net/foreclosures/listDocs-new.asp?year=${CURRENT_YEAR}`,
    human_portal_url: 'https://apps.huntcounty.net/foreclosures/',
    official_hosts: ['apps.huntcounty.net'],
    city_names: ['Greenville', 'Commerce', 'Quinlan', 'Caddo Mills', 'Royse City', 'Wolfe City', 'Celeste', 'Lone Oak', 'Campbell', 'West Tawakoni', 'Hawk Cove', 'Neylandville'],
    search_hints: [],
    blocked_note: 'Open Hunt County EasyDocs yearly foreclosure list; showdoc.asp pages wrap direct PDFs in public HTML object tags.'
  },
  {
    source_id: 'tx_navarro_county_foreclosure_notices',
    source_name: 'Navarro County Foreclosure EasyDocs',
    county: 'Navarro',
    state: 'TX',
    source_url: `http://navarro.easydocs.us/foreclosures/listDocs-new.asp?year=${CURRENT_YEAR}`,
    human_portal_url: 'http://navarro.easydocs.us/foreclosures/',
    official_hosts: ['navarro.easydocs.us'],
    city_names: ['Corsicana', 'Kerens', 'Blooming Grove', 'Dawson', 'Frost', 'Rice', 'Richland', 'Angus', 'Barry', 'Emhouse', 'Eureka', 'Goodlow', 'Mildred', 'Mustang', 'Navarro', 'Oak Valley', 'Powell', 'Retreat'],
    search_hints: [],
    blocked_note: 'Open Navarro EasyDocs yearly foreclosure list; showdoc.asp pages wrap direct PDFs in public HTML object tags.'
  },
  {
    source_id: 'tx_rains_county_foreclosure_notices',
    source_name: 'Rains County Foreclosure EasyDocs',
    county: 'Rains',
    state: 'TX',
    source_url: `http://rains.easydocs.us/foreclosures/listDocs-new.asp?year=${CURRENT_YEAR}`,
    human_portal_url: 'http://rains.easydocs.us/foreclosures/',
    official_hosts: ['rains.easydocs.us'],
    city_names: ['Emory', 'East Tawakoni', 'Point'],
    excluded_address_pattern: 'rains\\s+county\\s+(?:courthouse|annex)',
    search_hints: [],
    blocked_note: 'Open Rains County EasyDocs yearly foreclosure list; showdoc.asp pages wrap public notice PDFs in HTML object tags.'
  },
  {
    source_id: 'tx_hill_county_foreclosure_notices',
    source_name: 'Hill County Foreclosure Public Notices',
    county: 'Hill',
    state: 'TX',
    source_url: 'https://www.co.hill.tx.us/page/hill.Public.Notices.Foreclosures',
    human_portal_url: 'https://www.co.hill.tx.us/page/hill.Public.Notices.Foreclosures',
    official_hosts: ['co.hill.tx.us'],
    city_names: ['Hillsboro', 'Whitney', 'Itasca', 'Hubbard', 'Malone', 'Mount Calm', 'Bynum', 'Covington', 'Aquilla', 'Abbott', 'Penelope', 'Mertens', 'Carl\'s Corner'],
    search_hints: [],
    blocked_note: 'Official foreclosure page returned 403 from the server environment during verification; open manually or retry from a residential IP.'
  },
  {
    source_id: 'tx_van_zandt_county_foreclosure_notices',
    source_name: 'Van Zandt County Public Notices',
    county: 'Van Zandt',
    state: 'TX',
    source_url: 'https://www.vanzandtcounty.org/page/vanzandt.Public.Notices',
    human_portal_url: 'https://www.vanzandtcounty.org/page/vanzandt.Public.Notices',
    official_hosts: ['vanzandtcounty.org'],
    city_names: ['Canton', 'Wills Point', 'Grand Saline', 'Van', 'Edgewood', 'Fruitvale', 'Edom', 'Ben Wheeler', 'Martins Mill'],
    search_hints: [],
    blocked_note: 'Public notices page is open, but no direct current foreclosure document pattern was verified in the first pass.'
  },
  {
    source_id: 'tx_bell_county_foreclosure_notices',
    source_name: 'Bell County Clerk Foreclosures',
    county: 'Bell',
    state: 'TX',
    source_url: 'https://www.bellcountytx.com/county_government/county_clerk/foreclosures.php',
    human_portal_url: 'https://www.bellcountytx.com/county_government/county_clerk/foreclosures.php',
    official_hosts: ['bellcountytx.com'],
    city_names: ['Belton', 'Temple', 'Killeen', 'Harker Heights', 'Nolanville', 'Salado', 'Troy', 'Little River-Academy', 'Morgan\'s Point Resort', 'Rogers', 'Holland'],
    search_hints: [],
    blocked_note: 'Official foreclosure page returned 403 from the server environment during verification; open manually or retry from a residential IP.'
  },
  {
    source_id: 'tx_tarrant_county_foreclosure_notices',
    source_name: 'Tarrant County Clerk Foreclosure Notices',
    county: 'Tarrant',
    state: 'TX',
    source_url: 'https://www.tarrantcountytx.gov/en/county-clerk/real-estate-records/foreclosures.html',
    human_portal_url: 'https://tarrant.tx.publicsearch.us/',
    official_hosts: ['tarrantcountytx.gov', 'tarrantcounty.com'],
    city_names: ['Fort Worth', 'Arlington', 'Mansfield', 'Euless', 'Bedford', 'Hurst', 'North Richland Hills', 'Keller', 'Grapevine', 'Haltom City', 'Watauga', 'Saginaw', 'Benbrook', 'White Settlement', 'Crowley', 'Burleson', 'Azle', 'Southlake', 'Colleyville', 'Grand Prairie'],
    search_hints: ['site:tarrantcountytx.gov foreclosure notice pdf', 'Tarrant County Texas notice of substitute trustee sale filetype:pdf'],
    blocked_note: 'Notice documents live in the tarrant.tx.publicsearch.us portal (portal_preview_only - open manually).'
  },
  {
    source_id: 'tx_collin_county_foreclosure_notices',
    source_name: 'Collin County Foreclosure Notices',
    county: 'Collin',
    state: 'TX',
    source_url: 'https://www.collincountytx.gov/government/sales-and-auctions',
    human_portal_url: 'https://apps2.collincountytx.gov/ForeclosureNotices',
    official_hosts: ['collincountytx.gov'],
    city_names: ['McKinney', 'Plano', 'Frisco', 'Allen', 'Wylie', 'Prosper', 'Celina', 'Melissa', 'Anna', 'Princeton', 'Murphy', 'Fairview', 'Lucas', 'Farmersville', 'Richardson', 'Dallas'],
    search_hints: ['site:collincountytx.gov foreclosure notice pdf', 'Collin County Texas notice of trustee sale filetype:pdf'],
    blocked_note: 'apps2.collincountytx.gov/ForeclosureNotices is behind an Incapsula bot wall (open manually).'
  },
  {
    source_id: 'tx_ellis_county_foreclosure_notices',
    source_name: 'Ellis County Clerk Foreclosure Archive',
    county: 'Ellis',
    state: 'TX',
    source_url: 'https://co.ellis.tx.us/Archive.aspx?AMID=60',
    human_portal_url: 'https://co.ellis.tx.us/Archive.aspx?AMID=60',
    official_hosts: ['co.ellis.tx.us', 'elliscountytx.gov'],
    city_names: ['Waxahachie', 'Ennis', 'Midlothian', 'Red Oak', 'Ferris', 'Palmer', 'Italy', 'Maypearl', 'Ovilla', 'Milford', 'Bardwell', 'Alma', 'Garrett'],
    search_hints: ['site:co.ellis.tx.us foreclosure', 'Ellis County Texas notice of trustee sale filetype:pdf'],
    blocked_note: 'Open CivicPlus archive; current notice documents are image scans without a text layer - open the direct links (OCR is the future automation lever).'
  },
  {
    source_id: 'tx_kaufman_county_foreclosure_notices',
    source_name: 'Kaufman County Foreclosure Postings',
    county: 'Kaufman',
    state: 'TX',
    source_url: 'https://www.kaufmancounty.net/628/Foreclosures-2025',
    human_portal_url: 'https://www.kaufmancounty.net/383/Foreclosures',
    official_hosts: ['kaufmancounty.net'],
    city_names: ['Kaufman', 'Terrell', 'Forney', 'Crandall', 'Kemp', 'Mabank', 'Scurry', 'Combine', 'Talty', 'Oak Grove', 'Post Oak Bend'],
    search_hints: ['site:kaufmancounty.net foreclosure DocumentCenter', 'Kaufman County Texas notice of foreclosure sale filetype:pdf'],
    blocked_note: 'Open DocumentCenter, but monthly compilations are 10-45MB scans - too large for automated parsing; open the document links directly.'
  },
  {
    source_id: 'tx_parker_county_foreclosure_notices',
    source_name: 'Parker County Foreclosure Postings',
    county: 'Parker',
    state: 'TX',
    source_url: 'https://www.parkercountytx.gov/371/Foreclosures',
    human_portal_url: 'https://www.parkercountytx.gov/371/Foreclosures',
    official_hosts: ['parkercountytx.gov', 'parkercountytx.com'],
    city_names: ['Weatherford', 'Aledo', 'Springtown', 'Hudson Oaks', 'Willow Park', 'Azle', 'Reno', 'Peaster', 'Millsap', 'Poolville', 'Cool', 'Annetta'],
    search_hints: ['site:parkercountytx.gov foreclosure notice of trustee sale', 'Parker County Texas notice of trustee sale filetype:pdf'],
    blocked_note: 'Foreclosures page exposes administrative PDFs only; notice documents are not directly posted - public search may surface them.'
  },
  {
    source_id: 'tx_rockwall_county_foreclosure_notices',
    source_name: 'Rockwall County Foreclosure Notices',
    county: 'Rockwall',
    state: 'TX',
    source_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
    human_portal_url: 'https://www.rockwallcountytexas.com/792/Foreclosure-Notices',
    official_hosts: ['rockwallcountytexas.com'],
    city_names: ['Rockwall', 'Royse City', 'Heath', 'Fate', 'McLendon-Chisholm', 'Rowlett', 'Wylie', 'Mobile City'],
    excluded_address_pattern: 'yellow\\s?i?jacket',
    extra_document_pages: ['https://www.rockwallcountytexas.com/Archive.aspx?AMID=83'],
    search_hints: ['site:rockwallcountytexas.com foreclosure notices archive', 'Rockwall County Texas notice of trustee sale filetype:pdf'],
    blocked_note: 'Open CivicPlus monthly archives with per-notice documents; current scans lack a text layer - open the direct links (OCR is the future automation lever).'
  },
  {
    source_id: 'tx_fort_bend_county_foreclosure_notices',
    source_name: 'Fort Bend County Clerk Foreclosure Lists',
    county: 'Fort Bend',
    state: 'TX',
    market_group: 'houston',
    source_url: 'https://www.fortbendcountytx.gov/government/departments/county-clerk/search-for-foreclosures',
    human_portal_url: 'https://www.fortbendcountytx.gov/government/departments/county-clerk/search-for-foreclosures',
    official_hosts: ['fortbendcountytx.gov', 'fbctxdocs.fortbendcountytx.gov'],
    city_names: ['Richmond', 'Rosenberg', 'Sugar Land', 'Missouri City', 'Katy', 'Fulshear', 'Stafford', 'Needville', 'Arcola', 'Beasley', 'Meadows Place', 'Simonton', 'Orchard', 'Thompsons', 'Fairchilds', 'Houston', 'Rosharon', 'Fresno'],
    search_hints: [],
    blocked_note: 'Open Fort Bend County foreclosure list page exposes current monthly public PDFs, but current PDFs are oversized image scans under the safe server parsing cap; open document links manually or add a future OCR/large-scan lane.'
  },
  {
    source_id: 'tx_bexar_county_foreclosure_notices',
    source_name: 'Bexar County Clerk Current Foreclosures',
    county: 'Bexar',
    state: 'TX',
    market_group: 'san_antonio',
    source_url: 'https://www.bexar.org/DocumentCenter/View/505/Current-County-Clerk-Foreclosures',
    human_portal_url: 'https://maps.bexar.org/foreclosures/',
    official_hosts: ['bexar.org', 'maps.bexar.org'],
    city_names: ['San Antonio', 'Atascosa', 'Boerne', 'Helotes', 'Somerset', 'Von Ormy', 'Adkins', 'Converse', 'Elmendorf', 'Universal City', 'Saint Hedwig', 'Schertz', 'Kirby', 'Live Oak', 'Selma', 'Leon Valley', 'Alamo Heights', 'Balcones Heights', 'Castle Hills', 'Windcrest', 'Terrell Hills', 'Olmos Park', 'China Grove'],
    search_hints: [],
    blocked_note: 'Open Bexar County Foreclosure Map links a current text-layer PDF list with document number, type, source-visible street, city/town, and zip fields.'
  },
  {
    source_id: 'tx_johnson_county_foreclosure_notices',
    source_name: 'Johnson County Clerk Foreclosure Sales',
    county: 'Johnson',
    state: 'TX',
    source_url: 'https://www.johnsoncountytx.org/government/county-clerk/land-records-vitals/foreclosure-sales',
    human_portal_url: 'https://johnson.tx.publicsearch.us/',
    official_hosts: ['johnsoncountytx.org'],
    city_names: ['Cleburne', 'Burleson', 'Joshua', 'Alvarado', 'Keene', 'Godley', 'Grandview', 'Venus', 'Rio Vista', 'Crowley', 'Mansfield'],
    search_hints: ['site:johnsoncountytx.org ShowDocument notice of trustee sale', 'Johnson County Texas notice of trustee sale filetype:pdf'],
    blocked_note: 'Page renders document list client-side; direct ShowDocument PDFs are open and reachable via public search.'
  },
  {
    source_id: 'tx_denton_county_foreclosure_notices',
    source_name: 'Denton County Foreclosure Sale Notices',
    county: 'Denton',
    state: 'TX',
    source_url: 'https://www.dentoncounty.gov/293/Foreclosure-Information',
    human_portal_url: 'https://denton.tx.publicsearch.us/',
    official_hosts: ['dentoncounty.gov'],
    city_names: ['Denton', 'Lewisville', 'Flower Mound', 'Frisco', 'Little Elm', 'The Colony', 'Highland Village', 'Corinth', 'Lake Dallas', 'Aubrey', 'Pilot Point', 'Sanger', 'Krum', 'Justin', 'Roanoke', 'Trophy Club', 'Carrollton', 'Plano'],
    search_hints: ['site:dentoncounty.gov foreclosure sale notice pdf', 'Denton County Texas notice of substitute trustee sale filetype:pdf'],
    blocked_note: 'apps.dentoncounty.gov/PublicNotices is captcha-gated; notices also in the denton.tx.publicsearch.us portal (open manually).'
  }
];

function profileForSourceId(sourceId) {
  const id = String(sourceId == null ? '' : sourceId).trim();
  return PROFILES.find((profile) => profile.source_id === id) || null;
}

module.exports = {
  PROFILES,
  profileForSourceId
};
