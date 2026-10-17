'use strict';

const LABELS = Object.freeze({
  flipper: 'Flipper', landlord: 'Landlord / rental investor',
  institutional: 'Institutional / hedge fund', acquisitions: 'Acquisitions company',
  wholesaler: 'Wholesaler / middleman', builder: 'Builder', land_buyer: 'Land buyer'
});
const ALIASES = Object.freeze({
  'landlord/rental investor': 'landlord', 'landlord / rental investor': 'landlord',
  'landlord/rental': 'landlord', 'rental investor': 'landlord',
  'institutional/hedge fund': 'institutional', 'institutional / hedge fund': 'institutional',
  'hedge fund': 'institutional', 'acquisitions company': 'acquisitions',
  'acquisitions company (verify)': 'acquisitions', 'wholesaler/middleman': 'wholesaler',
  'wholesaler / middleman': 'wholesaler', 'land buyer': 'land_buyer'
});
function normalize(value) {
  if (value == null || value === '' || value === 'unknown') return 'unknown';
  if (typeof value !== 'string' || value.length > 80) return null;
  const key = value.trim().toLowerCase();
  if (!key || key === 'unknown') return 'unknown';
  return Object.hasOwn(LABELS, key) ? key : ALIASES[key] || null;
}
function view(find) {
  const kind = normalize(find?.buyer_type) || 'unknown';
  return { kind, label: LABELS[kind] || 'Type not stated',
    // Approval is not proof of a completed purchase.
    verify_purchase: ['institutional', 'acquisitions'].includes(kind),
    source: find?.buyer_type_source || null };
}
module.exports = { LABELS, normalize, view };
