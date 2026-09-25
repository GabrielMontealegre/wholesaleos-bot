'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');
const https = require('https');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-cycle-49-'));
const storePath = path.join(dir, 'deal-board-snapshots.json');
const dbPath = path.join(dir, 'db.json');
process.env.DB_PATH = dbPath;
process.env.DEAL_BOARD_SNAPSHOTS_PATH = storePath;
fs.writeFileSync(dbPath, JSON.stringify({ leads: [] }));

const discovery = require('../modules/research/discovery-layer');
const service = require('../modules/research/deal-board-queue-service');
const market = { city: 'Dallas', county: 'Dallas', state: 'TX' };
const sourceDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const row = (extra = {}) => Object.assign({
  queue_key: 'proof|alpha', normalized_address: '100 Oak St, Dallas, TX 75201',
  city: 'Dallas', county: 'Dallas', state: 'TX', source_family: 'tx_foreclosure_notice',
  source_document_url: 'https://county.example.gov/notices/alpha.pdf',
  source_date: sourceDate, source_proof_text: 'Property address: 100 Oak St, Dallas, TX 75201.',
  property_identity_source_only: true, source_structured_address_verified: true,
  preview_only: true, should_ingest: false, not_a_saved_lead: true,
  ready_to_offer: 'NO', arv_status: 'ARV_LOCKED', verified_sold_comp_count: 0
}, extra);

function uiHook() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');
  const context = { window: {}, document: { readyState: 'loading', addEventListener() {} },
    MutationObserver: function MutationObserver() {}, setInterval() {}, setTimeout() {},
    fetch() { throw new Error('fixture_network_forbidden'); } };
  vm.runInNewContext(source, context);
  return context.window.__wosPublicDealsTestHooks;
}

function run() {
  let networkCalls = 0;
  const originalFetch = global.fetch;
  const originalHttp = http.get;
  const originalHttps = https.get;
  global.fetch = () => { networkCalls += 1; throw new Error('fixture_network_forbidden'); };
  http.get = https.get = () => { networkCalls += 1; throw new Error('fixture_network_forbidden'); };
  try {
    const basic = discovery.buildDiscovery(row());
    assert.strictEqual(basic.call_ready, true, 'H1: no phone, payoff or comps needed for discovery verdict');
    assert.strictEqual(basic.gap_ledger.find((entry) => entry.field === 'sold_comps').blocking_severity, 'BLOCKS_OFFER', 'H6');
    assert(!basic.gap_ledger.some((entry) => entry.blocking_severity === 'BLOCKS_CALL' && entry.field === 'current_payoff'));
    assert.strictEqual(discovery.buildDiscovery(row({ lifecycle_status: { quarantined: true }, sale_date_iso: '2020-01-01' })).call_ready, false, 'H2');
    assert(/quarantined/.test(discovery.buildDiscovery(row({ sale_date_iso: '2020-01-01' })).call_blocked_reason), 'H2 plain reason');
    assert.strictEqual(discovery.buildDiscovery(row({ normalized_address: '' })).call_ready, false, 'H3');
    const noPayoff = discovery.buildDiscovery(row({ original_principal_amount: '$300,000',
      assessed_value: 500000, public_estimate: 600000, mortgagee_name: 'BANK', servicer_name: 'SERVICER' }));
    const payoffGap = noPayoff.gap_ledger.find((entry) => entry.field === 'current_payoff');
    assert.strictEqual(payoffGap.source_class, 'SELLER_ONLY', 'H4');
    assert.strictEqual(payoffGap.current_status, 'UNKNOWN', 'H4');
    assert.strictEqual(payoffGap.resolution.kind, 'QUESTION', 'H4 never record work order');
    assert.strictEqual(noPayoff.equity_clue, null, 'H4 never derive a payoff from public values');
    const ownerGap = basic.gap_ledger.find((entry) => entry.field === 'owner_of_record');
    assert.strictEqual(ownerGap.source_class, 'ON_RECORD', 'H5');
    assert.strictEqual(ownerGap.resolution.source, 'county appraisal record', 'H5');
    assert.strictEqual(ownerGap.resolution.kind, 'WORK_ORDER', 'H5');
    const probate = discovery.buildDiscovery(row({ source_family: 'probate_public_notice' }));
    const code = discovery.buildDiscovery(row({ source_family: 'code_violation_public_notice' }));
    assert.notStrictEqual(probate.questions[0].field, code.questions[0].field, 'H7');
    for (const item of probate.questions.concat(code.questions)) {
      assert(!/\bprice\b|\boffer\b|\d/.test([item.wording, item.follow_up].join(' ')), 'H8: discovery questions contain no pricing, offer or number');
    }
    const answered = row({ discovery_answers: [{ field: 'current_payoff', value: '$100,000',
      source_kind: 'seller_stated', answered_at: '2026-09-24T12:00:00Z', answered_by: 'operator' }],
    verified_sold_comp_count: 3, confirmed_strict_comp_count: 3,
    leverage_dossier: { valuation: { verified_arv: { status: 'CLUE', value: 250000 } } } });
    const view = discovery.buildDiscovery(answered);
    assert.strictEqual(view.equity_clue.status, 'CLUE', 'H9');
    assert.strictEqual(discovery.buildDiscovery(row({ discovery_answers: [{ field: 'current_payoff', value: '$100,000', source_kind: 'unverified_import' }] }))
      .gap_ledger.find((entry) => entry.field === 'current_payoff').current_status, 'UNKNOWN', 'H9 only seller-stated answers count');
    assert.strictEqual(view.equity_clue.amount, 150000, 'H9');
    assert.strictEqual(view.gap_ledger.find((entry) => entry.field === 'current_payoff').current_status, 'CLUE', 'H9');
    assert.strictEqual(answered.ready_to_offer, 'NO', 'H9');
    assert.strictEqual(answered.arv_status, 'ARV_LOCKED', 'H9');
    assert.strictEqual(answered.verified_sold_comp_count, 3, 'H9 no comp mutation');

    const store = { version: 1, store_kind: 'deal_board_snapshots_not_saved_leads', markets: {
      'dallas|dallas|tx': { market, rows: [row({ current_payoff: '$90,000', current_payoff_source_kind: 'official_public_record' })], batches: [] }
    } };
    fs.writeFileSync(storePath, JSON.stringify(store));
    const dbBefore = fs.readFileSync(dbPath);
    const answer = (value) => service.recordDiscoveryAnswer({ market, queue_key: 'proof|alpha', field: 'current_payoff',
      value, channel: 'call', verbatim_note: 'Seller stated this.' }, { operator_id: 'admin-1', now_impl: () => '2026-09-24T12:00:00Z' });
    const first = answer('$100,000');
    answer('$110,000');
    const saved = JSON.parse(fs.readFileSync(storePath, 'utf8')).markets['dallas|dallas|tx'].rows[0];
    assert.strictEqual(saved.discovery_answers.length, 2, 'H10 append only');
    assert.strictEqual(saved.discovery_answers[0].value, '$100,000', 'H10 history retained');
    assert.strictEqual(saved.discovery_answers[1].source_kind, 'seller_stated', 'H9 provenance tier');
    assert.strictEqual(saved.current_payoff, '$90,000', 'H11 official field unchanged');
    assert.strictEqual(saved.discovery_answers[0].conflict.no_overwrite, true, 'H11 conflict visible');
    assert.strictEqual(first.should_ingest, false, 'H12/H14 snapshot only');
    assert.strictEqual(first.no_global_mutation, true, 'H12/H14');
    assert.deepStrictEqual(fs.readFileSync(dbPath), dbBefore, 'H14 saved leads unchanged');
    assert.strictEqual(networkCalls, 0, 'H12 no outreach, message, dial, batch or network request');
    assert.throws(() => service.recordDiscoveryAnswer({ market, queue_key: 'proof|alpha', field: 'assessed_value',
      value: 'bad', channel: 'call' }), /seller question/, 'H11 public field cannot be answered as seller field');
    const hooks = uiHook();
    const html = hooks.discoveryHtml(basic, 'proof|alpha');
    assert(html.includes('WHAT WE KNOW') && html.includes("WHAT WE'RE GUESSING") && html.includes('WHAT TO ASK THEM'), 'H15 sections');
    assert(html.includes('Call this lead') && html.includes('county appraisal record'), 'H15 plain verdict and work order');
    const leadCard = hooks.rowCard(Object.assign(row(), { discovery: basic }), false);
    assert(leadCard.includes('WHAT WE KNOW') && leadCard.includes('WHAT TO ASK THEM'), 'H15 every lead card renders discovery');
    const visible = html.replace(/<[^>]+>/g, ' ');
    assert(!/\bcurrent_payoff\b|\bowner_of_record\b|\bsource_kind\b|\bARV\b/.test(visible), 'H15 no internal names or acronyms');
    const data = { counts: {}, daily: {}, manual_evidence_packet: { items: [{ queue_key: 'proof|alpha', address: '100 Oak St, Dallas, TX 75201',
      discovery: basic, packet: { evaluation: { readiness: {} }, evidence_items: [] } }] },
    discovery_summary: discovery.summarize([row()]) };
    assert(hooks.panelsForPage('dashboard', data, [], '').includes('WHAT TO ASK THEM'), 'H15 actual dashboard render path');
    assert.strictEqual(networkCalls, 0, 'H12 no network including rendering');
    assert.strictEqual(service.latestDealBoardSnapshot({ market }).rows[0].ready_to_offer, 'NO', 'H13 offer gate unchanged');
    assert.strictEqual(service.latestDealBoardSnapshot({ market }).rows[0].verified_sold_comp_count, 0, 'H13 comp gate unchanged');
    assert.strictEqual(typeof service.latestDealBoardSnapshot({ market }).rows[0].discovery.call_ready, 'boolean', 'H15 snapshot carries per-row discovery');
    console.log('cycle-49 discovery layer H1-H15: PASS');
  } finally {
    global.fetch = originalFetch;
    http.get = originalHttp;
    https.get = originalHttps;
  }
}

run();
