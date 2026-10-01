'use strict';

const assert = require('assert');
const http = require('http');
const https = require('https');
const { classifyPostSaleOutcome } = require('../modules/research/post-sale-outcome');

const originalFetch = global.fetch;
const originalHttpGet = http.get;
const originalHttpsGet = https.get;
let requests = 0;
global.fetch = http.get = https.get = () => { requests++; throw new Error('network forbidden'); };

const base = () => ({
  subject: {
    property_address: '101 Sample St, Dallas, TX 75201', parcel_or_account: 'P101',
    sale_date: '2026-04-01', sale_date_resolution: { status: 'RESOLVED', resolved_iso: '2026-04-01' },
    original_owner_name: 'Example Owner',
    mortgagee_or_beneficiary: 'Example Mortgage LLC'
  },
  official_hosts: ['www.dallascounty.org'],
  today: '2026-10-01'
});
const evidence = (overrides = {}) => ({
  source_kind: 'recorded_deed',
  source_url: 'https://www.dallascounty.org/record/123',
  evidence_text: 'Official deed for parcel P101: grantee Investor LLC',
  captured_at: '2026-10-01T12:00:00Z',
  record_date: '2026-05-01',
  parcel_or_account: 'P101',
  ...overrides
});
const result = (input) => classifyPostSaleOutcome({ ...base(), ...input });

try {
  assert.strictEqual(result({}).sale_outcome, 'OUTCOME_UNKNOWN');
  assert.strictEqual(result({ today: '', deeds: [evidence({ grantee: 'Investor LLC' })] }).sale_outcome, 'OUTCOME_UNKNOWN');
  assert.strictEqual(result({ subject: { ...base().subject, sale_date_resolution: { status: 'RESOLVED', resolved_iso: '2026-11-01' } },
    deeds: [evidence({ grantee: 'Investor LLC' })] }).sale_outcome, 'OUTCOME_UNKNOWN');
  assert.strictEqual(result({ subject: { ...base().subject, sale_date: '04/01/2026', sale_date_resolution: null },
    deeds: [evidence({ grantee: 'Investor LLC' })] }).sale_outcome, 'OUTCOME_UNKNOWN');
  assert.strictEqual(result({ subject: { ...base().subject, sale_date_resolution: null },
    deeds: [evidence({ grantee: 'Investor LLC' })] }).sale_outcome, 'OUTCOME_UNKNOWN');
  const newerNotice = evidence({ source_kind: 'trustee_sale_notice', status: 'postponed', sale_date_iso: '2026-06-01',
    evidence_text: 'Postponed sale date 2026-06-01 for parcel P101' });
  const ownerRecord = evidence({ source_kind: 'official_owner_record', owner_name: 'Example Owner',
    evidence_text: 'Owner of record Example Owner for parcel P101' });
  const deedSearch = evidence({ source_kind: 'official_deed_search', no_post_sale_deed: true,
    searched_through: '2026-09-30', evidence_text: 'No post-sale deed found through 2026-09-30 for parcel P101' });
  assert.strictEqual(result({ notices: [newerNotice] }).sale_outcome, 'POSTPONED_REPOSTED');
  assert.strictEqual(result({ ownership: [ownerRecord] }).sale_outcome, 'OUTCOME_UNKNOWN');
  const stillOwner = result({ ownership: [ownerRecord], deed_searches: [deedSearch] });
  assert.strictEqual(stillOwner.sale_outcome, 'STILL_OWNER_LIKELY');
  assert.strictEqual(stillOwner.evidence.length, 2);
  assert.strictEqual(result({ ownership: [{ ...ownerRecord, record_date: '2026-03-01' }], deed_searches: [deedSearch] }).sale_outcome, 'OUTCOME_UNKNOWN');
  assert.strictEqual(result({ deeds: [evidence({ grantee: 'Example Mortgage LLC', evidence_text: 'Grantee Example Mortgage LLC for parcel P101' })] }).sale_outcome, 'REVERTED_TO_LENDER');
  assert.strictEqual(result({ deeds: [evidence({ grantee: 'Fannie Mae', evidence_text: 'Grantee Fannie Mae for parcel P101' })] }).sale_outcome, 'REVERTED_TO_LENDER');
  assert.strictEqual(result({ deeds: [evidence({ grantee: 'Investor LLC' })] }).sale_outcome, 'SOLD_TO_THIRD_PARTY');
  assert.strictEqual(result({ deeds: [evidence({ grantee: 'Example Owner', evidence_text: 'Grantee Example Owner for parcel P101' })] }).sale_outcome, 'OUTCOME_UNKNOWN');
  const conflicting = result({ notices: [newerNotice],
    deeds: [evidence({ grantee: 'Investor LLC' })] });
  assert.strictEqual(conflicting.sale_outcome, 'OUTCOME_UNKNOWN');
  assert.deepStrictEqual(conflicting.conflicts, ['POSTPONED_REPOSTED', 'SOLD_TO_THIRD_PARTY']);
  assert.strictEqual(result({ notices: [{ ...newerNotice, evidence_text: 'Generic record for parcel P101' }] }).sale_outcome, 'OUTCOME_UNKNOWN');
  assert.strictEqual(result({ deeds: [evidence({ grantee: 'Unrelated LLC' })] }).sale_outcome, 'OUTCOME_UNKNOWN');
  assert.strictEqual(result({ subject: { ...base().subject, original_owner_name: '' },
    deeds: [evidence({ grantee: 'Investor LLC' })] }).sale_outcome, 'OUTCOME_UNKNOWN');
  assert.strictEqual(result({ deeds: [evidence({ source_kind: 'listing_page', grantee: 'Investor LLC' })] }).sale_outcome, 'OUTCOME_UNKNOWN');
  for (const forged of [
    { source_url: 'https://untrusted.example/record' },
    { source_url: 'http://www.dallascounty.org/record' },
    { evidence_text: '' },
    { captured_at: '' },
    { record_date: '2026-02-30' },
    { parcel_or_account: 'P999' }
  ]) {
    assert.strictEqual(result({ deeds: [evidence({ grantee: 'Investor LLC', ...forged })] }).sale_outcome, 'OUTCOME_UNKNOWN');
  }
  const classified = result({ deeds: [evidence({ grantee: 'Investor LLC' })] });
  assert.strictEqual(classified.can_contact_original_owner, false);
  assert.strictEqual(classified.evidence[0].source_url, 'https://www.dallascounty.org/record/123');
  assert.strictEqual(requests, 0);
  console.log('B-05b conservative outcome classifier passed');
} finally {
  global.fetch = originalFetch;
  http.get = originalHttpGet;
  https.get = originalHttpsGet;
}
