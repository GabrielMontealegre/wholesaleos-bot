'use strict';

// Regression cover for the link-audit false positive that reported 132 of 356 rows as
// "mismatched address-link rows" when the links were correctly built.
//
// Two defects:
//   1. addressFromUrl had no cyberbackgroundchecks.com handler, so every CBC address link
//      returned '' and was counted as a mismatch.
//   2. addressesMatchExactly requires a ZIP on both sides. A CBC link encodes
//      street/city/state and no ZIP, so even a readable, correct link failed the test.
//
// A link we cannot read is UNVERIFIABLE. Only a link we can read whose components
// DISAGREE is a MISMATCH.

const assert = require('assert');
const links = require('../modules/research/address-derived-research-links');

const SUBJECT = '3808 Kings Dr, Ennis, TX 75119';

function rowWithLinks(researchLinks, overrides) {
  return Object.assign({
    normalized_address: SUBJECT,
    address_state: 'complete_source_address',
    source_document_url: 'https://co.ellis.tx.us/Archive.aspx?AMID=60',
    research_links: researchLinks
  }, overrides || {});
}

// --- addressFromUrl now reads CyberBackgroundChecks ---------------------------------

{
  const url = 'https://www.cyberbackgroundchecks.com/address/3808-kings-dr/ennis/tx';
  const parsed = links.addressFromUrl(url);
  assert.ok(parsed, 'CyberBackgroundChecks address links must be readable');
  assert.match(parsed, /3808/, 'street number must survive un-slugging');
  assert.match(parsed, /kings dr/i, 'street name must survive un-slugging');
  assert.match(parsed, /ennis/i);
  assert.match(parsed, /tx/i);
}

// --- classification: the three outcomes are distinct --------------------------------

{
  // A correct CBC link: no ZIP, but every component it does publish agrees.
  const verdict = links.classifyStoredAddressLink(
    'https://www.cyberbackgroundchecks.com/address/3808-kings-dr/ennis/tx', SUBJECT);
  assert.strictEqual(verdict.status, 'VERIFIED_MATCH',
    'a ZIP-less but agreeing link must not be reported as a mismatch');
}

{
  // The courthouse. A real mismatch: readable, and the components disagree.
  const verdict = links.classifyStoredAddressLink(
    'https://www.google.com/maps/search/?api=1&query=101%20W%20Main%20St%2C%20Waxahachie%2C%20TX%2075165',
    SUBJECT);
  assert.strictEqual(verdict.status, 'MISMATCH', 'a venue address must still be caught');
  assert.ok(verdict.differing_component, 'a mismatch must name the component that differs');
}

{
  // Unreadable shape: not wrong, just not checkable.
  const verdict = links.classifyStoredAddressLink('https://example.com/some/opaque/path', SUBJECT);
  assert.strictEqual(verdict.status, 'UNVERIFIABLE');
  assert.strictEqual(verdict.reason, 'no_address_encoded_in_url');
}

{
  const verdict = links.classifyStoredAddressLink(
    'https://www.zillow.com/homes/3808%20Kings%20Dr%2C%20Ennis%2C%20TX%2075119_rb/', SUBJECT);
  assert.strictEqual(verdict.status, 'VERIFIED_MATCH');
}

{
  // One digit different is a real mismatch, not a rounding allowance.
  const verdict = links.classifyStoredAddressLink(
    'https://www.zillow.com/homes/3809%20Kings%20Dr%2C%20Ennis%2C%20TX%2075119_rb/', SUBJECT);
  assert.strictEqual(verdict.status, 'MISMATCH');
  assert.strictEqual(verdict.differing_component, 'number');
}

{
  const verdict = links.classifyStoredAddressLink(
    'https://www.google.com/maps/search/?api=1&query=3808%20Kings%20Dr%2C%20Ennis%2C%20TX%2075119',
    SUBJECT);
  assert.strictEqual(verdict.status, 'VERIFIED_MATCH');
}

// --- the audit no longer flags rows for unreadable links ----------------------------

{
  // THE HEADLINE REGRESSION: a row whose links are all correctly built, including a CBC
  // link with no ZIP, must report zero mismatched rows.
  const built = links.buildAddressResearchLinks(rowWithLinks([], { city: 'Ennis', state: 'TX' }));
  assert.ok(built.some((entry) => /cyberbackgroundchecks address/i.test(entry.label)),
    'fixture must exercise the CBC link that caused the false positive');

  const audit = links.auditStoredAddressLinks([rowWithLinks(built, { city: 'Ennis', state: 'TX' })]);
  assert.strictEqual(audit.rows_with_mismatched_address_links, 0,
    'correctly built links must not be reported as mismatched');
  assert.strictEqual(audit.mismatched_link_count, 0);
}

{
  // A genuine venue link must still flag the row.
  const audit = links.auditStoredAddressLinks([rowWithLinks([
    { label: 'Google Maps', url: 'https://www.google.com/maps/search/?api=1&query=101%20W%20Main%20St%2C%20Waxahachie%2C%20TX%2075165' }
  ])]);
  assert.strictEqual(audit.rows_with_mismatched_address_links, 1,
    'a real wrong-property link must still be caught');
  assert.strictEqual(audit.mismatched_link_count, 1);
}

{
  // Unreadable links are counted separately and never as mismatches.
  const audit = links.auditStoredAddressLinks([rowWithLinks([
    { label: 'Street View', url: 'https://example.com/opaque' }
  ])]);
  assert.strictEqual(audit.rows_with_mismatched_address_links, 0);
  assert.strictEqual(audit.mismatched_link_count, 0);
  assert.strictEqual(audit.unverifiable_link_count, 1);
}

{
  // No verified subject address: nothing can be judged, so nothing is called wrong.
  const audit = links.auditStoredAddressLinks([{
    normalized_address: '',
    research_links: [{ label: 'Google Maps', url: 'https://www.google.com/maps/search/?api=1&query=anything' }]
  }]);
  assert.strictEqual(audit.rows_with_mismatched_address_links, 0);
  assert.strictEqual(audit.mismatched_link_count, 0);
}

// --- storedAddressLinkMatches keeps its original contract ---------------------------

{
  assert.strictEqual(links.storedAddressLinkMatches(
    'https://www.zillow.com/homes/3808%20Kings%20Dr%2C%20Ennis%2C%20TX%2075119_rb/', SUBJECT), true);
  assert.strictEqual(links.storedAddressLinkMatches(
    'https://www.google.com/maps/search/?api=1&query=101%20W%20Main%20St%2C%20Waxahachie%2C%20TX%2075165',
    SUBJECT), false);
  assert.strictEqual(links.storedAddressLinkMatches('https://example.com/opaque', SUBJECT), false);
}

console.log('address-link-audit-classification: all assertions passed');
