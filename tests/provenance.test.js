'use strict';

const assert = require('assert');
const fieldProvenance = require('../modules/research/field-provenance');

(() => {
  assert.strictEqual(fieldProvenance.routeHasProvenance({
    route_kind: 'phone',
    value: '(313) 555-1212',
    source_kind: 'official_public_record',
    source_url: 'https://example.gov/record',
    evidence_text: 'Phone: (313) 555-1212'
  }), true);
  assert.strictEqual(fieldProvenance.routeHasProvenance({
    route_kind: 'phone',
    value: '(313) 555-1212',
    source_url: 'https://example.gov/record',
    evidence_text: 'Phone: (313) 555-1212'
  }), false, 'untagged route cannot count as call-ready');

  assert.strictEqual(fieldProvenance.compHasProvenance({
    comp_address: '14001 Sussex St, Detroit, MI 48227',
    sold_price: 210000,
    sold_date: '2026-01-15',
    source_kind: 'official_public_record',
    source_url: 'https://example.gov/query',
    evidence_text: 'Recorded sale price: $210000'
  }), true);
  assert.strictEqual(fieldProvenance.compHasProvenance({
    comp_address: '14001 Sussex St, Detroit, MI 48227',
    sold_price: 210000,
    sold_date: '2026-01-15',
    source_url: 'https://example.gov/query',
    evidence_text: 'Recorded sale price: $210000'
  }), false, 'untagged comp cannot count as verified comp');
  assert.strictEqual(fieldProvenance.sourceKind('paid_api'), 'paid_api');
  assert.strictEqual(fieldProvenance.compHasProvenance({
    comp_address: '14001 Sussex St, Detroit, MI 48227',
    sold_price: 210000,
    sold_date: '2026-01-15',
    source_kind: 'paid_api',
    source_url: 'https://vendor.example/quote',
    evidence_text: 'Paid API result is not part of free-first comp unlock in Cycle 15.'
  }), false, 'paid_api is recognized for future provenance but cannot count as a free verified comp');
  assert.strictEqual(fieldProvenance.sourceKind('stealth_scrape'), '');

  console.log('provenance tests passed');
})();
