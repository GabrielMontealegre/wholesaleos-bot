'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { installRefuseLiveNetwork } = require('./helpers/refuse-live-network');
const network = installRefuseLiveNetwork();
const profiles = require('../modules/sources/tx-county-foreclosure-source-profiles');
const notice = require('../modules/research/official-notice-dossier');
const current = 'https://www.elliscountytx.gov/Archive.aspx?AMID=60';
const legacy = 'https://www.co.ellis.tx.us/Archive.aspx?ADID=5233';

async function main() {
  let temp;
  const load = Module._load;
  const previous = { DB_PATH: process.env.DB_PATH, DEAL_BOARD_SNAPSHOTS_PATH: process.env.DEAL_BOARD_SNAPSHOTS_PATH };
  try {
    const profile = profiles.profileForSourceId('tx_ellis_county_foreclosure_notices');
    assert.equal(profile.source_url, current, 'Current archive points to the independently observed official replacement host');
    assert.equal(profile.human_portal_url, current);
    assert.deepEqual(profile.official_hosts, ['co.ellis.tx.us', 'elliscountytx.gov'], 'No access allowlist is widened');
    const html = '<a href="Archive.aspx?ADID=5233">Sale Date: December 1, 2026</a>';
    assert.equal(notice.archiveDocumentForDate(html, '2026-12-01', current), 'https://www.elliscountytx.gov/Archive.aspx?ADID=5233');
    assert.equal(notice.archiveDocumentForDate(html, '2026-12-01'), legacy, 'Frozen two-argument callers retain legacy URL semantics');
    assert.equal(notice.archiveContainsDocument(html, legacy, current), true, 'Historical evidence is not discarded');
    assert.equal(notice.archiveDocumentForDate(html, '2026-12-01', 'https://example.invalid/'), '');
    assert.equal(notice.archiveContainsDocument(html, legacy, 'https://example.invalid/'), null);
    assert.equal(notice.archiveDocumentForDate(html + '<a href="Archive.aspx?ADID=5234">December 1, 2026</a>', '2026-12-01', current), '', 'Ambiguous dates still fail closed');
    assert.equal(notice.archiveDocumentForDate('<a href="https://www.elliscountytx.gov.evil.test/Archive.aspx?ADID=5233">December 1, 2026</a>', '2026-12-01', current), '');

    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-archive-host-'));
    process.env.DB_PATH = path.join(temp, 'db.json');
    process.env.DEAL_BOARD_SNAPSHOTS_PATH = path.join(temp, 'snapshots.json');
    const address = '100 Example St, Ennis, TX 75119';
    fs.writeFileSync(process.env.DB_PATH, '{"leads":[]}');
    fs.writeFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, JSON.stringify({ version: 1, markets: { 'dallas|dallas|tx': {
      market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, batches: [], rows: [{ queue_key: 'proof|synthetic',
        normalized_address: address, city: 'Ennis', county: 'Ellis', state: 'TX', source_document_url: legacy,
        source_structured_address_verified: true, property_identity_source_only: true,
        source_proof_text: 'Official synthetic notice names ' + address, preview_only: true, not_a_saved_lead: true, ready_to_offer: 'NO' }]
    } } }));
    Module._load = function(request, parent, isMain) { return request === 'dotenv' ? { config: () => ({ parsed: {} }) } : load.call(this, request, parent, isMain); };
    const service = require('../modules/research/deal-board-queue-service');
    Module._load = load;
    const calls = [], stop = Error('synthetic_stop_before_document_or_write');
    await assert.rejects(service.recordNoticeScan({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, queue_key: 'proof|synthetic' }, {
      client_impl: { get: async url => { calls.push(url); throw stop; } }, scan_impl: async () => { throw Error('No PDF/OCR work allowed'); }
    }), error => error === stop);
    assert.deepEqual(calls, [current], 'Actual review fetch uses the current county profile, not a hidden legacy URL');
    const before = fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8');
    await assert.rejects(service.recordNoticeScan({ market: { city: 'Dallas', county: 'Dallas', state: 'TX' }, queue_key: 'proof|synthetic' }, {
      client_impl: { get: async () => ({ url: 'https://example.invalid/', body: Buffer.from(html) }) },
      scan_impl: async () => { throw Error('Unsafe archive response must not reach PDF/OCR'); }
    }), error => error.code === 'notice_archive_source_invalid');
    assert.equal(fs.readFileSync(process.env.DEAL_BOARD_SNAPSHOTS_PATH, 'utf8'), before, 'Rejected archive response saves no proposals');
    assert.deepEqual(network.attempts, []);
    console.log('notice archive host: profile-backed current fetch, response-base relative links, legacy evidence, unchanged allowlist/ambiguity and no live fetch/PDF/OCR PASS');
  } finally {
    Module._load = load; network.restore();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    if (temp) { assert.equal(path.dirname(temp), path.resolve(os.tmpdir())); assert(path.basename(temp).startsWith('wos-archive-host-')); fs.rmSync(temp, { recursive: true, force: true }); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
