'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'pdf-parse') {
    return async (buffer) => ({ text: Buffer.from(buffer).toString('utf8') });
  }
  return originalLoad.call(this, request, parent, isMain);
};

const extractor = require('../modules/research/tx-trustee-notice-text-extractor');
const adapter = require('../modules/sources/tx-county-foreclosure-acquisition-adapter');
const profiles = require('../modules/sources/tx-county-foreclosure-source-profiles');
const sourceCatalog = require('../modules/sources/source-catalog');
const registry = require('../modules/sources/source-adapter-registry');

function makeResponse(body, contentType = 'text/html; charset=UTF-8', status = 200) {
  const buffer = Buffer.from(String(body || ''), 'utf8');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (/^content-type$/i.test(name) ? contentType : '') },
    async text() { return buffer.toString('utf8'); },
    async arrayBuffer() { return buffer; }
  };
}

const TARRANT_NOTICE_TEXT = [
  'NOTICE OF SUBSTITUTE TRUSTEE SALE',
  'Deed of Trust executed by PAT SAMPLE, grantor',
  'Property Address:',
  '4501 Ridgmar Blvd',
  'Fort Worth, TX 76116',
  'Sale Date: 08/04/2026',
  'Instrument Number: 2026-112233',
  'THE STATE OF TEXAS COUNTY OF TARRANT',
  'NOTICE OF SUBSTITUTE TRUSTEE SALE',
  'Property Address:',
  '210 Oak Hollow Ln',
  'Arlington, TX 76010',
  'Date of Sale: August 4, 2026',
  'The undersigned attorney for the mortgage servicer:',
  'Attorneys at Law, Suite 900',
  '14160 Dallas Parkway',
  'Dallas, TX 75254'
].join('\n');

(async () => {
  // 1) TX extractor: county-configured, reuses Dallas honesty guards.
  const rows = extractor.extractTrusteeNoticeRows(TARRANT_NOTICE_TEXT, {
    county: 'Tarrant',
    state: 'TX',
    city_names: ['Fort Worth', 'Arlington']
  }, {
    source_url: 'https://www.tarrantcountytx.gov/en/county-clerk/real-estate-records/foreclosures.html',
    source_proof_url: 'https://www.tarrantcountytx.gov/docs/foreclosure-aug.pdf'
  });
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].county, 'Tarrant');
  assert.ok(/4501 Ridgmar Blvd/.test(rows[0].address));
  assert.strictEqual(rows[0].sale_date, '08/04/2026');
  assert.strictEqual(rows[0].owner_name, 'PAT SAMPLE');
  assert.ok(/210 Oak Hollow Ln/.test(rows[1].address));
  assert.ok(!rows.some((row) => /14160 Dallas Parkway/i.test(row.address)), 'attorney office address must be rejected');
  assert.ok(rows.every((row) => row.source_document_url === 'https://www.tarrantcountytx.gov/docs/foreclosure-aug.pdf'));

  // 2) Adapter happy path: official page exposes a county-host PDF that parses into candidates.
  const pageHtml = `
    <html><body>
      <a href="/docs/foreclosure-aug.pdf">August Foreclosure Notice Postings</a>
      <a href="https://evil.example.com/fake.pdf">Foreclosure pdf offsite</a>
    </body></html>`;
  const happy = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_tarrant_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    mock_search_results: [],
    fetch_impl: async (url) => {
      if (/foreclosures\.html/.test(String(url))) return makeResponse(pageHtml);
      if (/foreclosure-aug\.pdf/.test(String(url))) return makeResponse(TARRANT_NOTICE_TEXT, 'application/pdf');
      throw new Error(`unexpected:${url}`);
    }
  });
  assert.strictEqual(happy.status, 'available');
  assert.strictEqual(happy.county, 'Tarrant');
  assert.strictEqual(happy.candidates.length, 2);
  assert.ok(happy.candidates.every((candidate) => candidate.preview_only === true && candidate.should_ingest === false));
  assert.ok(happy.candidates.some((candidate) => /4501 Ridgmar Blvd/i.test(candidate.normalized_address || candidate.property_address)));
  assert.ok(happy.document_urls_parsed.length === 1);
  assert.ok(!happy.document_urls_found.some((url) => /evil\.example/.test(url)), 'off-host documents must be rejected');
  assert.ok(happy.discovered_links.some((link) => link.link_type === 'portal_preview_only'), 'human portal link must be listed');
  assert.strictEqual(happy.cards.length, 2);

  // 2b) EasyDocs counties expose showdoc.asp wrappers whose HTML embeds the
  //     real PDF; the generic adapter must follow that public PDF object.
  const huntPage = `
    <html><body>
      <a href="showdoc.asp?year=2026&docName=2026-07-07-foreclosure-01.pdf">07/07/2026 foreclosure notice</a>
    </body></html>`;
  const huntWrapper = `
    <html><body>
      <object type="application/pdf" data="LinkedDir/2026/2026-07-07-foreclosure-01.pdf"></object>
    </body></html>`;
  const huntNotice = [
    'NOTICE OF SUBSTITUTE TRUSTEE SALE',
    'Property Address:',
    '1201 Washington St',
    'Greenville, TX 75401',
    'Date of Sale: August 4, 2026'
  ].join('\n');
  const viaEasyDocs = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_hunt_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    fetch_impl: async (url) => {
      const u = String(url);
      if (/listDocs-new\.asp\?year=2026/.test(u)) return makeResponse(huntPage);
      if (/showdoc\.asp\?year=2026&docName=2026-07-07-foreclosure-01\.pdf/.test(u)) return makeResponse(huntWrapper);
      if (/LinkedDir\/2026\/2026-07-07-foreclosure-01\.pdf/.test(u)) return makeResponse(huntNotice, 'application/pdf');
      throw new Error(`unexpected:${u}`);
    }
  });
  assert.strictEqual(viaEasyDocs.status, 'available');
  assert.strictEqual(viaEasyDocs.county, 'Hunt');
  assert.strictEqual(viaEasyDocs.candidates.length, 1);
  assert.ok(/1201 Washington St/i.test(viaEasyDocs.candidates[0].normalized_address || viaEasyDocs.candidates[0].property_address));
  assert.ok(viaEasyDocs.document_urls_found.some((url) => /showdoc\.asp/.test(url)), 'wrapper URL must be discovered');
  assert.ok(viaEasyDocs.document_urls_parsed.some((url) => /LinkedDir\/2026\/2026-07-07-foreclosure-01\.pdf/.test(url)), 'embedded PDF URL must be parsed');
  assert.ok(/LinkedDir\/2026\/2026-07-07-foreclosure-01\.pdf/.test(viaEasyDocs.candidates[0].source_document_url || ''), 'candidate proof must use the direct embedded PDF');

  // 3) Blocked portal/bot wall reported, never bypassed; source-proof links still exposed.
  const blocked = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_collin_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    mock_search_results: [],
    fetch_impl: async () => makeResponse('Request unsuccessful. Incapsula incident ID: 1-2', 'text/html', 200)
  });
  assert.strictEqual(blocked.status, 'needs_manual_review');
  assert.strictEqual(blocked.candidates.length, 0);
  assert.ok(blocked.blocked_notes.some((note) => note.reason === 'captcha_or_bot_wall'));
  assert.ok(/incapsula/i.test(blocked.message), 'message must carry the county blocked note');
  assert.ok(blocked.discovered_links.some((link) => /collincountytx\.gov/.test(link.url)), 'official links still listed for manual work');

  // 4) Search-discovered official PDFs are used (mock search results).
  const viaSearch = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_denton_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    mock_search_results: [
      { url: 'https://www.dentoncounty.gov/docs/notice-july.pdf' },
      { url: 'https://random.example.com/should-not-pass.pdf' }
    ],
    fetch_impl: async (url) => {
      if (/Foreclosure-Information/.test(String(url))) return makeResponse('<html><body>Foreclosure info</body></html>');
      if (/notice-july\.pdf/.test(String(url))) return makeResponse(
        'NOTICE OF SUBSTITUTE TRUSTEE SALE\nProperty Address:\n77 Lakeview Dr\nDenton, TX 76201\nSale Date: 08/04/2026', 'application/pdf');
      throw new Error(`unexpected:${url}`);
    }
  });
  assert.strictEqual(viaSearch.candidates.length, 1);
  assert.strictEqual(viaSearch.county, 'Denton');
  assert.ok(/77 Lakeview Dr/i.test(viaSearch.candidates[0].normalized_address || viaSearch.candidates[0].property_address));
  assert.ok(!viaSearch.document_urls_found.some((url) => /random\.example/.test(url)));

  // 4b) Archive month pages are followed and their documents parsed (Rockwall pattern);
  //     CivicPlus "Sign In" nav text must NOT trip the block heuristic.
  const archiveMain = `
    <html><body>
      <nav>Sign In | Website Sign In</nav>
      <a href="/Archive.aspx?AMID=83">Foreclosure Notices October</a>
    </body></html>`;
  const archiveMonth = `
    <html><body>
      <a href="/Archive.aspx?ADID=5000">Foreclosure Notice - 305 Lakeshore Dr</a>
    </body></html>`;
  const viaArchive = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_rockwall_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    mock_search_results: [],
    fetch_impl: async (url) => {
      const u = String(url);
      if (/792\/Foreclosure-Notices/.test(u)) return makeResponse(archiveMain);
      if (/Archive\.aspx\?AMID=83/.test(u)) return makeResponse(archiveMonth);
      if (/Archive\.aspx\?ADID=5000/.test(u)) return makeResponse(
        'NOTICE OF SUBSTITUTE TRUSTEE SALE\nProperty Address:\n305 Lakeshore Dr\nRockwall, TX 75087\nSale Date: 08/04/2026', 'application/pdf');
      throw new Error(`unexpected:${u}`);
    }
  });
  assert.strictEqual(viaArchive.status, 'available', 'Sign In nav must not block; archive docs must parse');
  assert.strictEqual(viaArchive.county, 'Rockwall');
  assert.strictEqual(viaArchive.candidates.length, 1);
  assert.ok(/305 Lakeshore Dr/i.test(viaArchive.candidates[0].normalized_address || viaArchive.candidates[0].property_address));

  // 4c) Oversized PDFs are skipped by declared content-length, honestly reported (Kaufman pattern).
  const oversized = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_kaufman_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    mock_search_results: [],
    fetch_impl: async (url) => {
      const u = String(url);
      if (/Foreclosures-2025/.test(u)) return makeResponse('<html><body><a href="/DocumentCenter/View/8074">October Foreclosure Postings</a></body></html>');
      if (/DocumentCenter\/View\/8074/.test(u)) {
        const response = makeResponse('big', 'application/pdf');
        response.headers = { get: (name) => (/content-type/i.test(name) ? 'application/pdf' : /content-length/i.test(name) ? String(45 * 1024 * 1024) : '') };
        return response;
      }
      throw new Error(`unexpected:${u}`);
    }
  });
  assert.strictEqual(oversized.candidates.length, 0);
  assert.ok(oversized.document_urls_skipped.some((item) => /pdf_too_large/.test(item.reason)), 'oversized docs must be skipped with an honest reason');
  assert.ok(oversized.document_urls_found.length === 1, 'oversized doc still listed as source proof');

  // 5) Catalog + registry wiring: DFW counties present for DFW markets, absent elsewhere.
  const dallasCatalog = sourceCatalog.buildSourceCatalog({ city: 'Dallas', county: 'Dallas', state: 'TX' });
  for (const profile of profiles.PROFILES) {
    assert.ok(dallasCatalog.some((source) => source.source_id === profile.source_id), `${profile.source_id} must be in the DFW catalog`);
    assert.ok(registry.listRegisteredSourceIds().includes(profile.source_id), `${profile.source_id} must be registered`);
  }
  assert.ok(profiles.profileForSourceId('tx_navarro_county_foreclosure_notices'), 'Navarro EasyDocs profile must be configured');
  const elsewhereCatalog = sourceCatalog.buildSourceCatalog({ city: 'Houston', county: 'Harris', state: 'TX' });
  assert.ok(!elsewhereCatalog.some((source) => /tarrant|collin|denton/.test(source.source_id)), 'DFW lanes only for DFW markets');

  console.log('tx county foreclosure adapter tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
