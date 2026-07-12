'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-tx-county-ledger-'));
process.env.DEAL_BOARD_DOCUMENT_LEDGER_PATH = path.join(tmpDir, 'deal-board-doc-ledger.json');

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

function isoDay(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return date.toISOString().slice(0, 10);
}

function usDateFromIso(value) {
  const parts = String(value).split('-');
  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function postingMonth(offset) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

  // 2b1) Rains is a separately verified open EasyDocs county. Its fixture
  // uses a relative sale date so the public-notice acceptance test cannot rot.
  const rainsNoticeDay = isoDay(28);
  const rainsYear = rainsNoticeDay.slice(0, 4);
  const rainsPage = `<html><body><a href="showdoc.asp?year=${rainsYear}&docName=${rainsNoticeDay}-foreclosures.pdf">Attachments</a></body></html>`;
  const viaRainsEasyDocs = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_rains_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    fetch_impl: async (url) => {
      const u = String(url);
      if (/listDocs-new\.asp\?year=2026/.test(u)) return makeResponse(rainsPage);
      if (u.includes(`${rainsNoticeDay}-foreclosures.pdf`) && /showdoc\.asp/.test(u)) {
        return makeResponse(`<object type="application/pdf" data="LinkedDir/${rainsYear}/${rainsNoticeDay}-foreclosures.pdf"></object>`);
      }
      if (u.includes(`${rainsNoticeDay}-foreclosures.pdf`) && /LinkedDir/.test(u)) {
        return makeResponse([
          'NOTICE OF SUBSTITUTE TRUSTEE SALE',
          'Property Address:',
          '301 Ravine St',
          'Emory, TX 75440',
          `Sale Date: ${usDateFromIso(rainsNoticeDay)}`
        ].join('\n'), 'application/pdf');
      }
      throw new Error(`unexpected:${u}`);
    }
  });
  assert.strictEqual(viaRainsEasyDocs.status, 'available');
  assert.strictEqual(viaRainsEasyDocs.county, 'Rains');
  assert.strictEqual(viaRainsEasyDocs.candidates.length, 1);
  assert.ok(/301 Ravine St/i.test(viaRainsEasyDocs.candidates[0].normalized_address || viaRainsEasyDocs.candidates[0].property_address));
  assert.ok(viaRainsEasyDocs.document_urls_found.some((url) => /showdoc\.asp/.test(url)));

  // 2c) EasyDocs yearly lists are often oldest-first; date ranking must spend
  //     the 5-document cap on current/future notice files, not stale January files.
  const oldDay = isoDay(-120);
  const futureDay = isoDay(35);
  const oldLinks = Array.from({ length: 5 }, (_, index) => {
    const n = String(index + 1).padStart(2, '0');
    return `<a href="showdoc.asp?year=${oldDay.slice(0, 4)}&docName=${oldDay}-foreclosure-${n}.pdf">${oldDay} foreclosure ${n}</a>`;
  }).join('\n');
  const rankedPage = `<html><body>${oldLinks}<a href="showdoc.asp?year=${futureDay.slice(0, 4)}&docName=${futureDay}-foreclosure-99.pdf">${futureDay} foreclosure 99</a></body></html>`;
  const viaRankedEasyDocs = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_hunt_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    fetch_impl: async (url) => {
      const u = String(url);
      if (/listDocs-new\.asp\?year=2026/.test(u)) return makeResponse(rankedPage);
      if (u.includes(`${futureDay}-foreclosure-99.pdf`) && /showdoc\.asp/.test(u)) {
        return makeResponse(`<object type="application/pdf" data="LinkedDir/${futureDay.slice(0, 4)}/${futureDay}-foreclosure-99.pdf"></object>`);
      }
      if (u.includes(`${futureDay}-foreclosure-99.pdf`) && /LinkedDir/.test(u)) {
        return makeResponse([
          'NOTICE OF SUBSTITUTE TRUSTEE SALE',
          'Property Address:',
          '4555 Traders Rd',
          'Greenville, TX 75402',
          `Sale Date: ${usDateFromIso(futureDay)}`
        ].join('\n'), 'application/pdf');
      }
      if (/showdoc\.asp/.test(u)) return makeResponse('<object type="application/pdf" data="LinkedDir/old/stale.pdf"></object>');
      if (/LinkedDir\/old\/stale\.pdf/.test(u)) return makeResponse('NOTICE OF SUBSTITUTE TRUSTEE SALE\nProperty Address:\n1 Old Rd\nGreenville, TX 75401\nSale Date: 01/01/2026', 'application/pdf');
      throw new Error(`unexpected:${u}`);
    }
  });
  assert.strictEqual(viaRankedEasyDocs.status, 'available');
  assert.ok(viaRankedEasyDocs.document_urls_parsed[0].includes(`${futureDay}-foreclosure-99.pdf`), 'future dated EasyDocs notice must be parsed first');
  assert.ok(viaRankedEasyDocs.candidates.some((candidate) => /4555 Traders Rd/i.test(candidate.normalized_address || candidate.property_address)));

  // 2d) Document ledger rotates through the month's docs instead of rereading
  //     the same first five forever; a new month reopens the lane.
  const rotationMonthA = '2026-07';
  const rotationMonthB = '2026-08';
  const rotationPage = (monthTag) => {
    const year = monthTag.slice(0, 4);
    return `<html><body>${Array.from({ length: 10 }, (_, index) => {
      const n = String(index + 1).padStart(2, '0');
      const day = String(32 - (index + 1)).padStart(2, '0');
      return `<a href="https://apps.huntcounty.net/foreclosures/LinkedDir/${year}/${monthTag}-${day}-foreclosure-${n}.pdf">${monthTag} foreclosure ${n}</a>`;
    }).join('\n')}</body></html>`;
  };
  const rotationPdf = (monthTag, index) => [
    'NOTICE OF SUBSTITUTE TRUSTEE SALE',
    'Property Address:',
    `${100 + index} Rotation Rd`,
    `Greenville, TX ${75400 + index}`,
    `Date of Sale: ${monthTag}-${String(32 - index).padStart(2, '0')}`
  ].join('\n');
  const rotationFetchFor = (monthTag) => async (url) => {
    const u = String(url);
    if (/listDocs-new\.asp\?year=2026/.test(u)) return makeResponse(rotationPage(monthTag));
    const monthMatch = /LinkedDir\/(\d{4})\/(\d{4}-\d{2})-(\d{2})-foreclosure-(\d{2})\.pdf/.exec(u);
    if (monthMatch) return makeResponse(rotationPdf(monthMatch[2], Number(monthMatch[4])), 'application/pdf');
    throw new Error(`unexpected:${u}`);
  };
  const rotationOne = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_hunt_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    fetch_impl: rotationFetchFor(rotationMonthA)
  });
  assert.strictEqual(rotationOne.status, 'available');
  assert.strictEqual(rotationOne.candidate_count, 5, 'first batch must only read five unprocessed docs');
  assert.strictEqual(rotationOne.diagnostics.docs_discovered, 10);
  assert.strictEqual(rotationOne.diagnostics.docs_processed, 5);
  assert.strictEqual(rotationOne.diagnostics.docs_ledger_skipped, 0);
  assert.ok(rotationOne.document_urls_parsed.some((url) => url.includes('2026-07-22-foreclosure-10.pdf')));
  assert.ok(rotationOne.candidates.every((candidate) => candidate.preview_only === true));

  const rotationTwo = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_hunt_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    fetch_impl: rotationFetchFor(rotationMonthA)
  });
  assert.strictEqual(rotationTwo.status, 'available');
  assert.strictEqual(rotationTwo.candidate_count, 5, 'second batch must advance to the next five docs');
  assert.strictEqual(rotationTwo.diagnostics.docs_discovered, 10);
  assert.strictEqual(rotationTwo.diagnostics.docs_processed, 5);
  assert.strictEqual(rotationTwo.diagnostics.docs_ledger_skipped, 5);
  assert.ok(rotationTwo.document_urls_parsed.some((url) => url.includes('2026-07-27-foreclosure-05.pdf')));

  const rotationThree = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_hunt_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    fetch_impl: rotationFetchFor(rotationMonthA)
  });
  assert.strictEqual(rotationThree.candidate_count, 0, 'exhausted month must not reprocess already-read docs');
  assert.strictEqual(rotationThree.diagnostics.docs_processed, 0);
  assert.strictEqual(rotationThree.diagnostics.docs_ledger_skipped, 10);

  const rotationFour = await adapter.runTxCountyForeclosureAcquisitionAdapter({
    source_id: 'tx_hunt_county_foreclosure_notices',
    env: { ENABLE_SEARCH_PROVIDER: 'false' },
    fetch_impl: rotationFetchFor(rotationMonthB)
  });
  assert.strictEqual(rotationFour.candidate_count, 5, 'new month must reopen the lane');
  assert.strictEqual(rotationFour.diagnostics.docs_discovered, 10);
  assert.strictEqual(rotationFour.diagnostics.docs_processed, 5);
  assert.ok(rotationFour.document_urls_parsed.some((url) => url.includes('2026-08-22-foreclosure-10.pdf')));

  // 2e) Ledger retention keeps current + previous posting month only. The
  // rotation runs above already exercise the write path after every batch.
  const currentPostingMonth = postingMonth(0);
  const previousPostingMonth = postingMonth(-1);
  const expiredPostingMonth = postingMonth(-2);
  const ledgerForRetention = {
    version: 1,
    documents: {
      [`${expiredPostingMonth}|https://county.example/expired.pdf`]: { posting_month: expiredPostingMonth },
      [`${previousPostingMonth}|https://county.example/previous.pdf`]: { posting_month: previousPostingMonth },
      [`${currentPostingMonth}|https://county.example/current.pdf`]: { posting_month: currentPostingMonth }
    }
  };
  adapter.pruneDocumentLedger(ledgerForRetention, new Date());
  assert.ok(!ledgerForRetention.documents[`${expiredPostingMonth}|https://county.example/expired.pdf`], 'entries older than the previous month must be pruned');
  assert.ok(ledgerForRetention.documents[`${previousPostingMonth}|https://county.example/previous.pdf`], 'previous month must remain');
  assert.ok(ledgerForRetention.documents[`${currentPostingMonth}|https://county.example/current.pdf`], 'current month must remain');

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
  assert.ok(profiles.profileForSourceId('tx_rains_county_foreclosure_notices'), 'Rains EasyDocs profile must be configured');
  const elsewhereCatalog = sourceCatalog.buildSourceCatalog({ city: 'Houston', county: 'Harris', state: 'TX' });
  assert.ok(!elsewhereCatalog.some((source) => /tarrant|collin|denton/.test(source.source_id)), 'DFW lanes only for DFW markets');

  console.log('tx county foreclosure adapter tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
