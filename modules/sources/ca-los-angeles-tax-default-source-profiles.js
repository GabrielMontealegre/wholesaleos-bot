'use strict';

const NOTICE_DOCUMENT_URL = 'https://ttc.lacounty.gov/wp-content/uploads/2026/03/2026A-Auction-Book.pdf';
const AUCTION_SCHEDULE_URL = 'https://ttc.lacounty.gov/schedule-of-upcoming-auctions/';
const GOVEASE_LIST_URL = 'https://liveauctions.govease.com/ca/calosangelesfollowup/1396/browsestandard';

const PROFILE = Object.freeze({
  source_id: 'ca_los_angeles_tax_default_auction_book',
  source_name: 'Los Angeles County 2026A Tax-Defaulted Auction Book',
  source_family: 'tax_default_auction_book',
  county: 'Los Angeles',
  state: 'CA',
  city: 'Los Angeles',
  source_url: AUCTION_SCHEDULE_URL,
  api_url: NOTICE_DOCUMENT_URL,
  document_url: NOTICE_DOCUMENT_URL,
  human_portal_url: AUCTION_SCHEDULE_URL,
  auction_portal_url: GOVEASE_LIST_URL,
  official_hosts: Object.freeze(['ttc.lacounty.gov']),
  city_names: Object.freeze([
    'Los Angeles', 'Agoura Hills', 'Calabasas', 'Hidden Hills', 'West Hills',
    'Encino', 'Tarzana', 'Van Nuys', 'Sherman Oaks', 'Burbank',
    'North Hills', 'Canoga Park', 'Reseda', 'Woodland Hills', 'Pacoima',
    'Sylmar', 'Lancaster', 'Palmdale', 'Pasadena', 'Glendale',
    'Long Beach', 'Compton', 'Norwalk', 'Whittier', 'Downey',
    'Inglewood', 'Gardena', 'Torrance', 'Bellflower', 'Culver City'
  ]),
  blocked_note: 'Official Los Angeles County Treasurer and Tax Collector auction book is a free public PDF. Many rows expose APN plus full street address; vacant/APN-only rows remain source proof only. The displayed minimum bid is not ARV or MAO.'
});

module.exports = {
  NOTICE_DOCUMENT_URL,
  AUCTION_SCHEDULE_URL,
  GOVEASE_LIST_URL,
  PROFILE,
  PROFILES: Object.freeze([PROFILE])
};
