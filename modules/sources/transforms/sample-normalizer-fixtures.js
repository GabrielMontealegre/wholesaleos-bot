'use strict';

const { normalizeSourcePayload } = require('./source-normalizer');

const courthousePdfPayload = {
  address: '123 Main St',
  city: 'Memphis',
  state: 'TN',
  county: 'Shelby',
  owner_name: 'Jane Owner',
  parcel: 'APN-12345',
  case_number: 'CH-2026-001',
  auction_date: '2026-06-15',
  opening_bid: '$42,500',
  lien_amount: '$8,100',
  source: 'courthouse',
  source_type: 'Foreclosure',
  source_url: 'https://county.example/foreclosures',
  pdf_source_url: 'https://county.example/notices/notice-001.pdf',
  pdf_confidence: 'high',
  violations: ['Foreclosure auction notice']
};

const socrataPayload = {
  address: '456 Oak Ave',
  city: 'Philadelphia',
  state: 'PA',
  county: 'Philadelphia',
  source: 'socrata_extra',
  source_details: 'Philadelphia PA L&I Violations',
  source_url: 'https://opendataphilly.org',
  violation_type: 'Unsafe structure',
  violations: 'Unsafe structure',
  motivation: 'code_violation',
  motivation_score: 65,
  owner_name: ''
};

const arcgisPayload = {
  Address: '789 Pine Rd',
  City: 'Nashville',
  State: 'TN',
  county: 'Davidson',
  source: 'Nashville TN Property Violations',
  source_platform: 'ArcGIS',
  source_details: { type: 'Property Standards', source_name: 'Nashville ArcGIS' },
  source_url: 'https://datanashvillegov-nashville.hub.arcgis.com/datasets/example',
  case_number: 'PV-7788',
  violations: ['Vacant property', 'Code violation'],
  owner_name: 'Sample Holdings LLC',
  owner_type: 'LLC'
};

function runSamples() {
  return {
    courthouse_pdf: normalizeSourcePayload(courthousePdfPayload, {
      source_id: 'sample-courthouse-pdf',
      source_kind: 'pdf',
      provider: 'Shelby County'
    }),
    socrata: normalizeSourcePayload(socrataPayload, {
      source_id: 'sample-socrata-code',
      source_kind: 'socrata',
      provider: 'Open Data Philly'
    }),
    arcgis: normalizeSourcePayload(arcgisPayload, {
      source_id: 'sample-arcgis-code',
      source_kind: 'arcgis',
      provider: 'Nashville Open Data'
    })
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runSamples(), null, 2));
}

module.exports = {
  courthousePdfPayload: courthousePdfPayload,
  socrataPayload: socrataPayload,
  arcgisPayload: arcgisPayload,
  runSamples: runSamples
};
