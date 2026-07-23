'use strict';

const NOTICE_DOCUMENT_URL = 'https://www.sdttc.com/content/dam/ttc/docs/taxcollection/Notice-of-Impending-Power-to-Sell-Tax-Defaulted-Property-June-5-12-19-2026.pdf';
const PROPERTY_TAX_SALES_URL = 'https://www.sdttc.com/content/ttc/en/tax-collection/property-tax-sales.html';

const PROFILES = Object.freeze([
  Object.freeze({
    source_id: 'ca_san_diego_tax_default_power_to_sell',
    source_name: 'San Diego County Tax-Defaulted Property Power-to-Sell Notice',
    source_family: 'tax_default_power_to_sell',
    county: 'San Diego',
    state: 'CA',
    city: 'San Diego',
    source_url: PROPERTY_TAX_SALES_URL,
    api_url: NOTICE_DOCUMENT_URL,
    document_url: NOTICE_DOCUMENT_URL,
    human_portal_url: PROPERTY_TAX_SALES_URL,
    official_hosts: ['sdttc.com', 'sandiegocounty.gov'],
    city_names: [
      'San Diego', 'Fallbrook', 'Oceanside', 'Vista', 'Escondido', 'San Marcos',
      'Carlsbad', 'Encinitas', 'Del Mar', 'Solana Beach', 'Poway', 'Ramona',
      'Santee', 'El Cajon', 'La Mesa', 'Lemon Grove', 'Chula Vista', 'National City',
      'Imperial Beach', 'Coronado', 'Alpine', 'Julian', 'Borrego Springs'
    ],
    blocked_note: 'Official San Diego TTC notice shows APN, assessee, street address, and redemption amount. City is only usable when visible in source text; redemption amount is not price, ARV, or MAO.'
  })
]);

module.exports = {
  NOTICE_DOCUMENT_URL,
  PROPERTY_TAX_SALES_URL,
  PROFILES
};
