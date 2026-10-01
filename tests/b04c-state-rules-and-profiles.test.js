'use strict';

const assert = require('assert');
const { RULES, rulesForState } = require('../modules/research/state-rules');
const profiles = require('../modules/sources/county-source-profile-registry');
const { CHAPTER_51_TRUSTEE_SALE_ADAPTERS, resolveSourceSaleDate } = require('../modules/research/resolve-source-sale-date');

assert.strictEqual(rulesForState('tx'), RULES.TX);
assert.strictEqual(rulesForState('NC').post_sale.upset_bid.basis, 'report_of_sale_or_last_upset_bid');
assert.strictEqual(rulesForState('MI').post_sale.mortgage.verification_status, 'unverified');
assert.strictEqual(rulesForState('CA'), null);
assert.strictEqual(RULES.TX.post_sale.tax.basis, 'purchaser_deed_recording');
assert.strictEqual(RULES.TX.post_sale.hoa.basis, 'association_notice_mailed');
for (const state of ['TX', 'NC', 'MI']) {
  const rules = RULES[state];
  assert.ok(rules.disclosure.citation.startsWith('https://'));
  assert.ok(rules.business_search_url.startsWith('https://'));
}

const existing = require('../modules/sources/tx-county-foreclosure-source-profiles').PROFILES;
for (const source of existing) {
  const profile = profiles.profileForSourceId(source.source_id);
  assert.ok(profile, source.source_id);
  assert.strictEqual(profile.county, source.county);
  assert.strictEqual(profile.source_kind, 'trustee_sale_notice');
  assert.ok(profile.hosts.includes(source.official_hosts[0]));
  assert.ok(Object.hasOwn(CHAPTER_51_TRUSTEE_SALE_ADAPTERS, source.source_id));
}
assert.strictEqual(profiles.profileForSourceId('missing'), null);

const proof = (source_adapter_id, source_url, extra = {}) => ({
  raw_text: '10/06/2026', raw_field: 'sale_date', source_adapter_id, source_url,
  document_text: 'Date of Sale: 10/06/2026', ...extra
});
for (const [id, url] of [
  ['tx_dallas_county_clerk_foreclosure_notices', 'https://www.dallascounty.org/notice.pdf'],
  ['tx_ellis_county_foreclosure_notices', 'https://co.ellis.tx.us/notice.pdf']
]) {
  const result = resolveSourceSaleDate(proof(id, url));
  assert.deepStrictEqual({ status: result.status, resolved_iso: result.resolved_iso, rule_ids: result.rule_ids },
    { status: 'RESOLVED', resolved_iso: '2026-10-06', rule_ids: ['tx_prop_code_51_002_sale_day'] });
  assert.strictEqual(resolveSourceSaleDate(proof(id, 'https://example.org/notice.pdf')).status, 'AMBIGUOUS');
  assert.strictEqual(resolveSourceSaleDate(proof(id, url, { source_kind: 'tax_sale' })).status, 'AMBIGUOUS');
  assert.strictEqual(resolveSourceSaleDate(proof(id, url, { raw_field: 'filed_date' })).status, 'AMBIGUOUS');
  assert.strictEqual(resolveSourceSaleDate(proof(id, url, { document_text: 'Filed: 10/06/2026' })).status, 'AMBIGUOUS');
}
assert.strictEqual(resolveSourceSaleDate(proof('unregistered', 'https://www.dallascounty.org/notice.pdf')).status, 'AMBIGUOUS');
assert.strictEqual(resolveSourceSaleDate(proof('tx_ellis_county_foreclosure_notices', 'http://co.ellis.tx.us/notice.pdf')).status, 'AMBIGUOUS');
console.log('B-04c state rules and source profiles passed');
