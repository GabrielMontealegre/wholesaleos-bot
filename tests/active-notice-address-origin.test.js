'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');

const fields = require('../modules/research/notice-field-evidence');
const extractor = require('../modules/research/tx-trustee-notice-text-extractor');
const fileParser = require('../modules/sources/dallas-real-file-parser');
const noticeAdapter = require('../modules/sources/dallas-foreclosure-notice-adapter');
const postSale = require('../modules/research/post-sale-candidate-store');
const orchestrator = require('../modules/research/source-acquisition-orchestrator');
const board = require('../modules/research/free-public-deal-board');
const frozenCorpus = require('./fixtures/cycle-18-notices.json');

const original = { fetch: global.fetch, httpGet: http.get, httpRequest: http.request,
  httpsGet: https.get, httpsRequest: https.request };
let requests = 0;
const noNetwork = () => { requests++; throw new Error('network forbidden'); };
global.fetch = http.get = http.request = https.get = https.request = noNetwork;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-address-origin-'));
const address = '4512 Oak Hollow Dr, Dallas, TX 75217';
const sourceUrl = 'https://www.dallascounty.org/notices/fixture.txt';
const profile = { county: 'Dallas', state: 'TX', city_names: ['Dallas'] };
const variants = [
  ['Property Address: ', 'property_address_label'],
  ['The real property located at ', 'subject_property_label'],
  ['Situs Address: ', 'subject_property_label'],
  ['Property: ', 'subject_property_label'],
  ['Lot 5, Block 2, Maple subdivision, also known as ', 'subject_property_label'],
  ['', 'unlabeled']
];

function notice(prefix, saleDate = 'November 3, 2026') {
  return `NOTICE OF SUBSTITUTE TRUSTEE SALE\n${prefix}${address}\nSale Date: ${saleDate}\nCase No: 12345`;
}

(async () => {
  try {
    for (const [prefix, origin] of variants) {
      const text = notice(prefix);
      const extracted = extractor.extractTrusteeNoticeRows(text, profile);
      const adapted = noticeAdapter.extractForeclosureNoticeCandidatesFromText(text,
        { source_proof_url: sourceUrl, source_url: sourceUrl });
      const file = path.join(temp, 'fixture.txt');
      fs.writeFileSync(file, text);
      const parsed = await fileParser.runDallasRealFileParser({ input_file: file,
        source: { source_url: sourceUrl, source_name: 'Official notice' } });
      for (const [name, rows] of [['text extractor', extracted], ['file parser', parsed.candidates], ['notice adapter', adapted]]) {
        assert.strictEqual(rows.length, 1, `${name}: ${prefix}: ${JSON.stringify(rows)}`);
        assert.strictEqual(rows[0].address, address, `${name}: ${prefix}`);
        assert.strictEqual(rows[0].property_address_origin, origin, `${name}: ${prefix}`);
        if (origin === 'unlabeled') {
          assert(rows[0].missing_evidence.includes('property address label not found'));
          assert.notStrictEqual(rows[0].workflow_status, 'Research Ready');
        }
      }
    }
    const unlabeled = extractor.extractTrusteeNoticeRows(notice(''), profile)[0];
    assert.strictEqual(unlabeled.normalized_address, '');
    assert.strictEqual(unlabeled.source_structured_address_verified, false);
    assert.strictEqual(fields.PROPERTY_ADDRESS_ORIGINS.has('unlabeled'), false);
    assert.strictEqual(postSale.rejectionReason({ source_id: 'tx_dallas_county_clerk_foreclosure_notices',
      source_url: sourceUrl, source_document_url: sourceUrl, property_address: address,
      property_address_origin: 'unlabeled', sale_date: 'May 5, 2026',
      sale_date_origin: 'labeled_sale_date', source_proof_text: notice('', 'May 5, 2026'),
      sale_outcome: 'OUTCOME_UNKNOWN', can_contact_original_owner: false,
      preview_only: true, should_ingest: false }, 'tx_dallas_county_clerk_foreclosure_notices'),
    'address_not_property_field');
    const nonProperty = 'NOTICE OF SUBSTITUTE TRUSTEE SALE\nMortgage servicer whose address is 4512 Oak Hollow Dr, Dallas, TX 75217\nSale Date: November 3, 2026';
    assert.strictEqual(fields.activeNoticeAddress(nonProperty).address, '');
    const rejected = [];
    assert.strictEqual(extractor.extractTrusteeNoticeRows(nonProperty, profile,
      { source_proof_url: sourceUrl, rejected_candidates: rejected }).length, 0);
    assert.strictEqual(rejected[0].reason, 'address_not_property_field');
    assert.strictEqual(noticeAdapter.extractForeclosureNoticeCandidatesFromText(nonProperty).length, 0);
    const attorneyOffice = 'NOTICE OF SUBSTITUTE TRUSTEE SALE\nAttorney at law whose address is 4512 Oak Hollow Dr, Dallas, TX 75217\nDate of Sale: 11/03/2026';
    assert.strictEqual(fields.activeNoticeAddress(attorneyOffice).address, '');
    const attorneyRejected = [];
    assert.strictEqual(noticeAdapter.extractForeclosureNoticeCandidatesFromText(attorneyOffice,
      { source_proof_url: sourceUrl, rejected_candidates: attorneyRejected }).length, 0);
    assert(attorneyRejected.some((item) => item.reason === 'address_not_property_field'));
    assert.strictEqual(fields.activeNoticeAddress(
      'NOTICE OF SUBSTITUTE TRUSTEE SALE; Property Address: 19 16 APACHE ROAD QUINLAN, TEXAS 75474').address, '');
    assert.strictEqual(fields.activeNoticeAddress(
      'NOTICE OF SUBSTITUTE TRUSTEE SALE; Property: Lot 7; Time: 1:00 p.m. PLACE OF SALE').address, '');
    const frozenOffice = frozenCorpus.documents.find((item) => item.url.includes('foreclosure-17.pdf'));
    assert(frozenOffice);
    assert(!noticeAdapter.extractForeclosureNoticeCandidatesFromText(frozenOffice.text)
      .some((item) => /14160 Dallas Parkway/i.test(item.address)));
    const twoProperties = noticeAdapter.extractForeclosureNoticeCandidatesFromText(
      'NOTICE OF SUBSTITUTE TRUSTEE SALE\nProperty Address: 4512 Oak Hollow Dr, Dallas, TX 75217\n' +
      'Property Address: 4514 Oak Hollow Dr, Dallas, TX 75217\nSale Date: November 3, 2026');
    assert.strictEqual(new Set(twoProperties.map((item) => item.address)).size, 2,
      'a second property in one notice remains a review row');
    assert(twoProperties.find((item) => item.address.startsWith('4514')).missing_evidence
      .includes('property address label not found'));
    const file = path.join(temp, 'fixture.txt');
    fs.writeFileSync(file, nonProperty);
    const fileRejected = await fileParser.runDallasRealFileParser({ input_file: file,
      source: { source_url: sourceUrl, source_name: 'Official notice' } });
    assert.strictEqual(fileRejected.candidates.length, 0);
    assert(fileRejected.rejected_candidates.some((item) => item.reason === 'address_not_property_field'));
    const run = async (text) => orchestrator.runAcquisitionCore({ city: 'Dallas', county: 'Dallas', state: 'TX',
      source_ids: ['tx_dallas_county_clerk_foreclosure_notices'] }, { source_text: text,
      source_document_url: sourceUrl, enable_provider_search: false });
    const declined = await run(nonProperty);
    assert.strictEqual(declined.candidates.length, 0);
    assert(declined.adapter_results[0].source_preview.rejected_candidates
      .some((item) => item.reason === 'address_not_property_field'));
    const retained = await run(notice(''));
    assert.strictEqual(retained.candidates.length, 1);
    assert.strictEqual(retained.candidates[0].property_address_origin, 'unlabeled');
    assert.strictEqual(retained.candidates[0].normalized_address, '');
    const card = board.dealFromRecord({ property_address_origin: 'unlabeled',
      property_identity_source_only: true, source_structured_address_verified: false,
      property_address: address, source_url: sourceUrl, source_document_url: sourceUrl,
      source_family: 'preforeclosure_trustee_notice', preview_only: true, should_ingest: false },
    { market: { city: 'Dallas', county: 'Dallas', state: 'TX' } });
    assert.strictEqual(card.next_best_action, 'Confirm the property address from the notice');
    assert.strictEqual(retained.adapter_results[0].post_sale_candidates.length, 0);
    const past = await run(notice('', 'May 5, 2026'));
    assert.strictEqual(past.adapter_results[0].post_sale_candidates.length, 0);
    assert.strictEqual(requests, 0);
    console.log('active notice address origins passed');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
    global.fetch = original.fetch;
    http.get = original.httpGet;
    http.request = original.httpRequest;
    https.get = original.httpsGet;
    https.request = original.httpsRequest;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
