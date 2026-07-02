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
