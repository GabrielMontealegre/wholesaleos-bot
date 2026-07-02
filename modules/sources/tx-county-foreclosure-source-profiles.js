'use strict';

// TX county foreclosure source profiles (config, not code).
// Each profile drives the generic tx-county-foreclosure-acquisition-adapter.
// blocked_note documents what the county gates so rows and coverage can say
// it honestly instead of pretending the lane is empty.

const PROFILES = [
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
    extra_document_pages: ['https://www.rockwallcountytexas.com/Archive.aspx?AMID=83'],
    search_hints: ['site:rockwallcountytexas.com foreclosure notices archive', 'Rockwall County Texas notice of trustee sale filetype:pdf'],
    blocked_note: 'Open CivicPlus monthly archives with per-notice documents; current scans lack a text layer - open the direct links (OCR is the future automation lever).'
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
