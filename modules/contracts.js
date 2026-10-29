'use strict';

const DRAFT_NOTICE = 'Unsigned working draft for human review. No automated legal review or signing evidence.';
const GABRIEL = Object.freeze({ name: '', company: '', address: '', email: '', buyer_clause: '' });

function ownValue(record, key) {
  if (!record || typeof record !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function text(value, limit = 2000) {
  return typeof value === 'string' && value.length <= limit ? value.trim() : '';
}

function suppliedOffer(value) {
  if (typeof value === 'string') {
    if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(value)) return '';
    value = Number(value);
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return '';
  return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// An address is not authority for the contract's governing jurisdiction.
function detectState() { return { abbr: '', name: '' }; }

async function fillContract(lead, sellerName = '', titleCompany = '', extraNotes = '') {
  const fields = {
    effective_date: '',
    seller_name: text(sellerName, 500),
    buyer_name: '',
    property_address: text(ownValue(lead, 'address')),
    purchase_price: suppliedOffer(ownValue(lead, 'offer')),
    earnest_money: '',
    title_company: text(titleCompany, 500),
    earnest_days: '',
    inspection_days: '',
    closing_date: '',
    governing_state: '',
    arbitration_state: ''
  };
  return {
    fields,
    aiReview: DRAFT_NOTICE,
    state: detectState(),
    emd: null,
    closeDate: '',
    unsigned: true,
    review_required: true,
    deposit_policy: 'Buyer-funded at assignment or blank for review. No deposit assigned to the operator.',
    notes: text(extraNotes, 5000)
  };
}

// This compatibility export is a field worksheet, not a contract or signature instrument.
function generateContractText(fields = {}) {
  const labels = {
    seller_name: 'Seller (supplied)', property_address: 'Property (record)',
    purchase_price: 'Offer (record)', title_company: 'Title company (supplied)'
  };
  return ['UNSIGNED WORKING DRAFT - FIELD REVIEW SHEET', DRAFT_NOTICE,
    ...Object.entries(labels).map(([key, label]) => label + ': ' + text(ownValue(fields, key))),
    'Buyer, dates, jurisdiction and deposit terms: blank for review.',
    'No deposit assigned to the operator. If required: buyer-funded at assignment or blank for review.'
  ].join('\n');
}

module.exports = { fillContract, generateContractText, GABRIEL, detectState };
