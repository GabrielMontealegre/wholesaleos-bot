'use strict';

// B-23a: public distress list building blocks. Synthetic fixtures only (no real owners or
// addresses). Live network is refused for the whole file.
const assert = require('assert');
const http = require('http');
const https = require('https');
const { installRefuseLiveNetwork } = require('./helpers/refuse-live-network');

const liveNetwork = installRefuseLiveNetwork();
const originalGets = [http.get, https.get, http.request, https.request];
let rawSocketCalls = 0;
http.get = https.get = http.request = https.request = () => { rawSocketCalls += 1; throw new Error('network forbidden'); };
const RealDate = Date;
let clockReads = 0;
global.Date = class extends RealDate {
  constructor(...args) { if (!args.length) clockReads += 1; super(...args); }
  static now() { clockReads += 1; return RealDate.now(); }
};

const profiles = require('../modules/sources/distress-list-profiles');
const registry = require('../modules/sources/county-source-profile-registry');
const readers = require('../modules/sources/distress-list-readers');
const mapper = require('../modules/sources/distress-list-lead-mapper');
const { createPoliteFetcher } = require('../modules/sources/polite-public-fetcher');
const XLSX = require('xlsx');

const TODAY = '2026-11-16';
const CAPTURED = '2026-11-16T15:00:00Z';

function profile(overrides = {}) {
  return Object.freeze(Object.assign({
    source_id: 'zz_sample_tax_sale_records_example_gov', county: 'Sample', state: 'ZZ',
    source_kind: 'tax_sale', source_name: 'Sample tax sale list', source_url: 'https://records.example.gov/lists/tax-sale.csv',
    format: 'csv', reader: 'csv', hosts: ['records.example.gov'], shared_host: false, access: 'open',
    runnable: true, manual_reason: ''
  }, overrides));
}

(async () => {
  // ---- Source kinds and profiles -------------------------------------------------------
  assert.deepStrictEqual(profiles.DISTRESS_SOURCE_KINDS,
    ['foreclosure_notice', 'trustee_sale', 'tax_sale', 'tax_delinquent', 'lis_pendens', 'probate', 'code_case', 'land_bank']);
  assert.strictEqual(profiles.canonicalDistressKind('trustee_sale_list'), 'trustee_sale', 'D-053 alias maps to trustee_sale');
  assert.strictEqual(profiles.canonicalDistressKind('invented_kind'), '');
  assert.deepStrictEqual(registry.DISTRESS_SOURCE_KINDS, profiles.DISTRESS_SOURCE_KINDS, 'kinds are in the source-kind registry');
  assert.deepStrictEqual(registry.SOURCE_KINDS,
    ['trustee_sale_notice', 'tax_sale', 'code_case', 'parcel', 'recorded_sale', 'public_inventory'], 'existing registry kinds unchanged');
  assert.strictEqual(profiles.PROFILES.length, 207, 'one profile per spec source');
  assert.strictEqual(new Set(profiles.PROFILES.map((p) => p.source_id)).size, 207, 'source ids are unique');
  for (const p of profiles.PROFILES) {
    if (p.runnable) {
      assert.strictEqual(p.access, 'open', `${p.source_id} runnable only when open`);
      assert.ok(p.source_url.startsWith('https://') && p.hosts.length === 1 && p.reader, `${p.source_id} runnable needs https, host and reader`);
    }
    if (['login', 'captcha', 'forbidden'].includes(p.access)) assert.strictEqual(p.runnable, false, `${p.source_id} stays manual`);
    if (!p.runnable) assert.ok(p.manual_reason, `${p.source_id} says why it is manual`);
    assert.ok(p.refresh_cadence === null || typeof p.refresh_cadence === 'string');
  }
  assert.strictEqual(profiles.FIRST_PROFILE_IDS.length, profiles.firstProfiles().length, 'every first-profile id exists in the spec');
  assert.ok(profiles.firstProfiles().filter((p) => p.runnable).length >= 15, 'at least 15 first profiles are runnable');
  const lockedDallasLisPendens = profiles.profileForSourceId('tx_dallas_lis_pendens_dallas_tx_publicsearch_us');
  assert.strictEqual(lockedDallasLisPendens.runnable, false, 'an unconfirmed source is not forced on');
  assert.strictEqual(profiles.profileForSourceId('missing'), null);
  // Spec rows that disagree with themselves are not runnable.
  const offHost = profiles.buildProfile({ source_id: 'x', source_kind: 'tax_sale', url: 'https://evil.example.com/a.csv', allowlisted_host: 'records.example.gov', format: 'csv', access: 'open', automatable: true });
  assert.strictEqual(offHost.runnable, false);
  const plainHttp = profiles.buildProfile({ source_id: 'y', source_kind: 'tax_sale', url: 'http://records.example.gov/a.csv', allowlisted_host: 'records.example.gov', format: 'csv', access: 'open', automatable: true });
  assert.strictEqual(plainHttp.runnable, false);
  const noReader = profiles.buildProfile({ source_id: 'z', source_kind: 'probate', url: 'https://records.example.gov/a', allowlisted_host: 'records.example.gov', format: 'other', access: 'open', automatable: true });
  assert.strictEqual(noReader.runnable, false);
  assert.match(noReader.manual_reason, /No generic reader/);
  // Generic code carries no county or state names.
  const fs = require('fs');
  for (const file of ['distress-list-readers.js', 'distress-list-lead-mapper.js', 'polite-public-fetcher.js']) {
    const source = fs.readFileSync(require.resolve(`../modules/sources/${file}`), 'utf8');
    assert.ok(!/\b(Dallas|Tarrant|Bexar|Mecklenburg|Texas|Georgia|Carolina|Tennessee)\b/.test(source), `${file} is generic`);
    assert.ok(!/require\(['"](https?|node-fetch|axios)['"]\)/.test(source), `${file} has no network client`);
  }

  // ---- Allowlist -----------------------------------------------------------------------
  const shared = profile({ source_url: 'https://services2.arcgis.com/AbC123/arcgis/rest/services/Code/FeatureServer/0/query', hosts: ['services2.arcgis.com'], shared_host: true });
  assert.strictEqual(profiles.urlAllowedForProfile(shared, 'https://services2.arcgis.com/AbC123/arcgis/rest/services/Code/FeatureServer/0/query?where=1%3D1'), true);
  assert.strictEqual(profiles.urlAllowedForProfile(shared, 'https://services2.arcgis.com/OtherTenant/arcgis/rest/services/X/FeatureServer/0/query'), false, 'shared host needs own path');
  assert.strictEqual(profiles.urlAllowedForProfile(profile(), 'https://records.example.gov.evil.com/x'), false, 'look-alike host refused');
  assert.strictEqual(profiles.urlAllowedForProfile(profile(), 'http://records.example.gov/x'), false, 'http refused');
  assert.strictEqual(profiles.urlAllowedForProfile(null, 'https://records.example.gov/x'), false);

  // ---- Readers: one fixture per format, row references kept ----------------------------
  const csv = readers.readCsv('Case Number,Property Address,Sale Date,Amount Due,Owner\nTS-1,100 Example St,2026-12-01,"$1,234.00",Sample Owner One\n,,,,\nTS-2,,2026-12-01,$50.00,Sample Owner Two\n');
  assert.strictEqual(csv.rows.length, 2);
  assert.strictEqual(csv.skipped_empty, 1, 'empty rows are counted, not silently lost');
  assert.strictEqual(csv.rows[0].row_reference, 'row 1 (line 2)');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Parcel ID', 'Situs Address', 'Total Due'], ['P-9', '200 Example Ave', '900.10']]), 'Delinquent');
  const xlsx = readers.readXlsx(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  assert.strictEqual(xlsx.rows[0].row_reference, 'sheet Delinquent row 2');
  assert.strictEqual(xlsx.rows[0].fields['Situs Address'], '200 Example Ave');
  // The xlsx library reads the clock inside its own parser (output does not depend on it).
  // Everything after this point is our code and must not read the clock at all.
  const clockReadsBeforeOwnCode = clockReads;
  const arcgis = readers.readArcgisJson(JSON.stringify({ objectIdFieldName: 'OBJECTID', exceededTransferLimit: true,
    features: [{ attributes: { OBJECTID: 7, SITE_ADDRESS: '300 Example Rd', SALE_DATE: RealDate.UTC(2026, 11, 3) } }] }));
  assert.strictEqual(arcgis.rows[0].row_reference, 'feature OBJECTID=7');
  assert.deepStrictEqual(arcgis.warnings, ['more_rows_than_one_page'], 'paging gap is reported');
  assert.deepStrictEqual(readers.readArcgisJson({ error: { code: 498 } }).warnings, ['arcgis_error:498']);
  const socrata = readers.readSocrataJson([{ ':id': 'row-abc', case_number: 'CC-5', address: '400 Example Blvd' }]);
  assert.strictEqual(socrata.rows[0].row_reference, ':id row-abc');
  const jsonRows = readers.readJsonRows({ data: [{ casenumber: 'SA-1', location: '500 Example Ln' }] });
  assert.strictEqual(jsonRows.rows[0].row_reference, 'record 1');
  const html = readers.readHtmlTable('<table><thead><tr><th>Doc Number</th><th>Address</th></tr></thead><tbody><tr><td><a href="/doc/9">D-9</a></td><td>600 Example Ct</td></tr></tbody></table>');
  assert.strictEqual(html.rows[0].row_reference, 'table 1 row 1');
  assert.strictEqual(html.rows[0].fields['Doc Number link'], '/doc/9');
  assert.deepStrictEqual(readers.readHtmlTable('<p>no table</p>').warnings, ['table_not_found']);
  const pdf = readers.readPdfText(['Header line\n2026-0001 700 Example Way Sale Date: December 1, 2026', 'junk\n2026-0002 800 Example Dr Sale Date: 12/01/2026'],
    { row_pattern: '^(?<document_number>\\d{4}-\\d{4})\\s+(?<address>.+?)\\s+Sale Date:\\s*(?<sale_date>.+)$' });
  assert.deepStrictEqual(pdf.rows.map((r) => r.row_reference), ['page 1 line 2', 'page 2 line 2']);
  assert.strictEqual(pdf.unmatched_lines, 2, 'lines that match nothing are counted');
  assert.deepStrictEqual(readers.readPdfText('x').warnings, ['row_pattern_missing'], 'no pattern means no invented rows');
  assert.deepStrictEqual(readers.readWithProfile({ reader: '' }, '').warnings, ['no_reader_for_format']);

  // ---- Mapper: provenance, origins, dates, lanes ---------------------------------------
  const p = profile();
  const lead = mapper.mapRowToLead(csv.rows[0], p, { today: TODAY, captured_at: CAPTURED });
  assert.strictEqual(lead.source_kind, 'tax_sale');
  assert.strictEqual(lead.source_row_reference, 'row 1 (line 2)');
  assert.strictEqual(lead.document_number, 'TS-1');
  assert.strictEqual(lead.address_as_written, '100 Example St');
  assert.strictEqual(lead.address_origin, 'Property Address', 'origin travels with the value');
  assert.strictEqual(lead.address_verified, false, 'a list address is not a verified address');
  assert.strictEqual(lead.sale_date, '2026-12-01');
  assert.strictEqual(lead.sale_date_origin, 'Sale Date');
  assert.strictEqual(lead.lane, 'working');
  assert.strictEqual(lead.amount_listed, '$1,234.00');
  assert.match(lead.amount_listed_label, /Not a price, value or loan payoff/);
  assert.ok(!lead.evidence_text.includes('Sample Owner'), 'owner names stay out of evidence text');
  assert.strictEqual(lead.owner_clue, 'Sample Owner One');
  assert.deepStrictEqual(Object.keys(lead.provenance).sort(), ['captured_at', 'evidence_text', 'row_reference', 'source_kind', 'source_url']);
  // Missing address: kept in needs data, never dropped.
  const noAddress = mapper.mapRowToLead(csv.rows[1], p, { today: TODAY, captured_at: CAPTURED });
  assert.strictEqual(noAddress.lane, 'needs_data');
  assert.strictEqual(noAddress.source_row_reference, 'row 3 (line 4)');
  // Past sale date: after the sale lane.
  const past = mapper.mapRowToLead({ fields: { address: '1 Example St', 'sale date': 'October 6, 2026' }, row_reference: 'row 9' }, p, { today: TODAY, captured_at: CAPTURED });
  assert.strictEqual(past.lane, 'after_sale');
  assert.strictEqual(past.lane_reason, 'Sale date passed. Confirm ownership first.');
  // Ambiguous numeric date: quarantined with raw kept, lead still kept with a caution.
  const ambiguous = mapper.mapRowToLead({ fields: { address: '2 Example St', 'sale date': '05/06/2026' }, row_reference: 'row 10' }, p, { today: TODAY, captured_at: CAPTURED });
  assert.strictEqual(ambiguous.sale_date, '', 'no blanket month-first parsing');
  assert.strictEqual(ambiguous.sale_date_status, 'AMBIGUOUS');
  assert.strictEqual(ambiguous.sale_date_raw, '05/06/2026');
  assert.strictEqual(ambiguous.lane_reason, 'Sale date not confirmed. Ask on the call.');
  // Single valid reading resolves (day > 12).
  const single = mapper.mapRowToLead({ fields: { address: '3 Example St', 'sale date': '12/31/2026' }, row_reference: 'row 11' }, p, { today: TODAY, captured_at: CAPTURED });
  assert.strictEqual(single.sale_date, '2026-12-31');
  // Two-digit year and impossible dates are not guessed.
  assert.strictEqual(mapper.mapRowToLead({ fields: { address: '4 Example St', 'sale date': '1/2/26' }, row_reference: 'r' }, p, { today: TODAY, captured_at: CAPTURED }).sale_date, '');
  assert.strictEqual(mapper.mapRowToLead({ fields: { address: '5 Example St', 'sale date': '2026-02-30' }, row_reference: 'r2' }, p, { today: TODAY, captured_at: CAPTURED }).sale_date_status, 'INVALID');
  // Epoch milliseconds from ArcGIS have one reading.
  const arcLead = mapper.mapRowToLead(arcgis.rows[0], p, { today: TODAY, captured_at: CAPTURED });
  assert.strictEqual(arcLead.sale_date, '2026-12-03');
  assert.strictEqual(arcLead.address_origin, 'SITE_ADDRESS');
  // Explicit field map wins and a wrong mapping yields missing, not a guess.
  const mapped = mapper.mapRowToLead(jsonRows.rows[0], p, { today: TODAY, captured_at: CAPTURED, field_map: { address: 'location', document_number: 'casenumber' } });
  assert.strictEqual(mapped.document_number, 'SA-1');
  const wrongMap = mapper.mapRowToLead(jsonRows.rows[0], p, { today: TODAY, captured_at: CAPTURED, field_map: { address: 'no_such_column' } });
  assert.strictEqual(wrongMap.address_as_written, '');
  assert.strictEqual(wrongMap.lane, 'needs_data');
  // A row that forges a "verified" flag cannot set it.
  const forged = mapper.mapRowToLead({ fields: { address: '6 Example St', address_verified: 'true' }, row_reference: 'row 12' }, p, { today: TODAY, captured_at: CAPTURED });
  assert.strictEqual(forged.address_verified, false);
  // Missing injected clock is refused, not filled from the system clock.
  assert.throws(() => mapper.mapRowToLead(csv.rows[0], p, { captured_at: CAPTURED }), /today/);
  assert.throws(() => mapper.mapRowToLead(csv.rows[0], p, { today: TODAY }), /captured_at/);
  assert.throws(() => mapper.mapRowToLead(csv.rows[0], null, { today: TODAY, captured_at: CAPTURED }));

  // ---- Duplicate merge with audit ------------------------------------------------------
  const first = mapper.mergeLeads([], [lead, noAddress]);
  assert.strictEqual(first.created, 2);
  const changedRow = { fields: Object.assign({}, csv.rows[0].fields, { 'Amount Due': '$1,500.00' }), row_reference: 'row 4 (line 5)' };
  const later = mapper.mapRowToLead(changedRow, p, { today: TODAY, captured_at: '2026-11-17T15:00:00Z' });
  const second = mapper.mergeLeads(first.leads, [later, noAddress]);
  assert.strictEqual(second.leads.length, 2, 'same document number merges even when the row moved');
  assert.strictEqual(second.updated, 1);
  assert.strictEqual(second.unchanged, 1, "an identical row is not an update");
  const audit = second.audit[0].changes;
  assert.ok(audit.some((c) => c.field === 'amount_listed' && c.old_value === '$1,234.00'), 'old value kept for audit');
  assert.ok(audit.some((c) => c.field === 'source_row_reference' && c.old_value === 'row 1 (line 2)'));
  const mergedLead = second.leads.find((l) => l.document_number === 'TS-1');
  assert.strictEqual(mergedLead.first_captured_at, CAPTURED, 'first capture date survives');
  assert.ok(Array.isArray(mergedLead.change_history) && mergedLead.change_history.length === 1);
  // Without a document number, identity is the row reference only.
  assert.notStrictEqual(mapper.mapRowToLead({ fields: { address: '7 Example St' }, row_reference: 'row 1' }, p, { today: TODAY, captured_at: CAPTURED }).lead_key,
    mapper.mapRowToLead({ fields: { address: '7 Example St' }, row_reference: 'row 2' }, p, { today: TODAY, captured_at: CAPTURED }).lead_key);

  // ---- Summary has counts only ---------------------------------------------------------
  const summary = mapper.summarizeSource(p, { status: 'ok', rows_found: 2, created: first.created, leads: first.leads });
  assert.deepStrictEqual(summary.lanes, { working: 1, needs_data: 1 });
  const summaryText = JSON.stringify(summary);
  assert.ok(!summaryText.includes('Sample Owner') && !summaryText.includes('Example St'), 'no owner names or addresses in summaries');

  // ---- Polite fetcher ------------------------------------------------------------------
  assert.throws(() => createPoliteFetcher({ fetch_impl: () => {} }), /injected/);
  let fakeNow = 1000;
  const sleeps = [];
  const calls = [];
  const responses = [];
  const fetcher = createPoliteFetcher({
    fetch_impl: async (url, init) => {
      calls.push({ url, init });
      const next = responses.shift() || { status: 200, body: 'a,b\n1,2\n' };
      return {
        status: next.status,
        headers: { get: (name) => (next.headers || {})[name.toLowerCase()] || '' },
        arrayBuffer: async () => Buffer.from(next.body || '')
      };
    },
    sleep: async (ms) => { sleeps.push(ms); fakeNow += ms; },
    now: () => fakeNow
  });
  const ok = await fetcher.fetchForProfile(p, p.source_url);
  assert.strictEqual(ok.status, 'ok');
  assert.strictEqual(ok.text(), 'a,b\n1,2\n');
  assert.strictEqual(calls[0].init.redirect, 'manual');
  await fetcher.fetchForProfile(p, p.source_url);
  assert.deepStrictEqual(sleeps, [1000], 'second request to the same host waits a full second');
  assert.strictEqual((await fetcher.fetchForProfile(p, 'https://elsewhere.example.com/x')).status, 'refused', 'wrong host rejected');
  assert.strictEqual((await fetcher.fetchForProfile(profile({ runnable: false, manual_reason: 'Needs a login. Operator only.' }), p.source_url)).status, 'manual');
  responses.push({ status: 302, headers: { location: 'https://evil.example.com/x' } });
  assert.strictEqual((await fetcher.fetchForProfile(p, p.source_url)).status, 'refused', 'redirect off the allowlist refused');
  responses.push({ status: 302, headers: { location: '/lists/moved.csv' } }, { status: 200, body: 'x\n1\n' });
  assert.strictEqual((await fetcher.fetchForProfile(p, p.source_url)).status, 'ok', 'same-host redirect followed once');
  responses.push({ status: 500 });
  assert.strictEqual((await fetcher.fetchForProfile(p, p.source_url)).status, 'failed');
  const callsBefore429 = calls.length;
  responses.push({ status: 429 });
  const limited = await fetcher.fetchForProfile(p, p.source_url);
  assert.strictEqual(limited.status, 'blocked');
  assert.strictEqual(limited.http_status, 429);
  const afterStop = await fetcher.fetchForProfile(p, p.source_url);
  assert.strictEqual(afterStop.status, 'blocked', '429 stops the run for this source');
  assert.strictEqual(calls.length, callsBefore429 + 1, 'no request after the stop');
  assert.deepStrictEqual(fetcher.unavailableSources(), [{ source_id: p.source_id, http_status: 429 }]);
  for (const code of [401, 403]) {
    const other = profile({ source_id: `zz_other_${code}` });
    responses.push({ status: code });
    assert.strictEqual((await fetcher.fetchForProfile(other, other.source_url)).status, 'blocked', `${code} stops the source`);
  }

  // ---- Purity --------------------------------------------------------------------------
  assert.strictEqual(liveNetwork.attempts.length, 0, 'no live fetch');
  assert.strictEqual(rawSocketCalls, 0, 'no raw http/https');
  assert.strictEqual(clockReads, clockReadsBeforeOwnCode, 'no system clock reads in readers, mapper or fetcher');

  liveNetwork.restore();
  [http.get, https.get, http.request, https.request] = originalGets;
  global.Date = RealDate;
  console.log('distress-list-importer: 8 generic kinds + alias, 207 spec profiles (manual reasons, no forced sources), allowlist/shared-host/http/look-alike refusal, csv/xlsx/arcgis/socrata/json/html/pdf readers with row references, provenance/origins, ambiguous/invalid/two-digit dates quarantined, needs-data/after-sale lanes, forged flag, duplicate merge audit, count-only summary, 1 rps pacing, 401/403/429 stop, redirect guard and purity passed');
})().catch((error) => {
  global.Date = RealDate;
  console.error(error);
  process.exit(1);
});
