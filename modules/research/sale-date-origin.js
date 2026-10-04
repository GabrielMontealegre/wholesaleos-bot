'use strict';

const { CHAPTER_51_TRUSTEE_SALE_ADAPTERS } = require('./resolve-source-sale-date');

const SALE_DATE_ORIGINS = Object.freeze([
  'sale_date', 'auction_date', 'date_of_sale', 'trustee_sale_date', 'foreclosure_sale_date'
]);
const GENERIC_DATE_FIELDS = Object.freeze(['sale_date_or_event_date', 'event_date']);

function isSaleDateOrigin(origin, sourceId) {
  const value = String(origin == null ? '' : origin).trim();
  if (SALE_DATE_ORIGINS.includes(value)) return true;
  return (!value || GENERIC_DATE_FIELDS.includes(value)) &&
    Object.hasOwn(CHAPTER_51_TRUSTEE_SALE_ADAPTERS, String(sourceId == null ? '' : sourceId).trim());
}

module.exports = { SALE_DATE_ORIGINS, GENERIC_DATE_FIELDS, isSaleDateOrigin };
