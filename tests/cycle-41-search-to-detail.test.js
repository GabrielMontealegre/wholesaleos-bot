'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const agent = require('../scripts/wos-local-comp-agent');
const canonical = require('../scripts/lib/address-canonical');
const gridConfig = require('../modules/research/strict-comp-grid-config');
const manualEvidence = require('../modules/research/manual-evidence-packet-service');

const ADDRESS = '3808 Kings Dr, Ennis, TX 75119';
const SEARCH = 'http://127.0.0.1:4141/address-search/zillow';
const DETAIL = 'http://127.0.0.1:4141/property-detail/3808-kings';
const SOLD = 'http://127.0.0.1:4141/sold/zillow';
const market = { city: 'Ennis', county: 'Ellis', state: 'TX' };
const row = {
  queue_key: 'cycle41-synthetic', address_state: 'complete_source_address', normalized_address: ADDRESS,
  city: 'Ennis', county: 'Ellis', state: 'TX', zillow_url: SEARCH,
  source_family: 'synthetic_public_notice', source_proof_text: `SYNTHETIC TEST ONLY property ${ADDRESS}`,
  source_document_url: 'https://county.example.invalid/synthetic.pdf', status_evidence_text: 'SYNTHETIC TEST ONLY',
  preview_only: true, should_ingest: false, not_a_saved_lead: true
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

class FakePage {
  constructor(fixtures, counters) { this.fixtures = fixtures; this.counters = counters; this.current = { url: '', body: '', cards: [], status: 200 }; }
  setDefaultTimeout() {}
  url() { return this.current.url; }
  context() { return { close: async () => {} }; }
  async goto(url) {
    this.counters.navigations.push(url);
    const fixture = this.fixtures[url];
    if (!fixture) throw Object.assign(new Error('missing fixture'), { code: 'ENOENT' });
    if (fixture.throw) throw new Error(fixture.throw);
    this.current = Object.assign({ url, body: '', cards: [], status: 200, main: true }, fixture);
    if (fixture.final_url) this.current.url = fixture.final_url;
    return { status: () => this.current.status };
  }
  locator(selector) {
    const page = this;
    const cardSelector = /property-card|article|ListItem|HomeCard|result-card/.test(selector);
    return {
      count: async () => selector === 'main' ? (page.current.main ? 1 : 0) : cardSelector ? page.current.cards.length : 0,
      innerText: async () => page.current.body,
      evaluateAll: async () => cardSelector ? page.current.cards : [],
      first() { return this; },
      nth(index) { this.index = index; return this; },
      waitFor: async () => {},
      screenshot: async () => { page.counters.screenshots += 1; return Buffer.from('synthetic-png'); }
    };
  }
}

function browserStub(page, counters) {
  return async () => ({ browser: {
    newContext: async () => ({ route: async () => {}, newPage: async () => page, close: async () => {} }),
    close: async () => { counters.closed += 1; }
  } });
}

function fixtureCards(values) { return async () => values; }

function fetchStub(captured) {
  return async (url, init = {}) => {
    const value = String(url);
    if (value.includes('/latest')) return response({ rows: [row], manual_evidence_packet: { items: [] } });
    if (value.includes('/manual-evidence/upload')) {
      const capturedAt = init.body.get('captured_at');
      const sourceName = init.body.get('source_name');
      const sourceUrl = init.body.get('source_url');
      const evidenceType = init.body.get('evidence_type');
      captured.uploads.push({ source_url: sourceUrl, evidence_type: evidenceType });
      return response({ ok: true, preview_only: true, should_ingest: false, no_global_mutation: true,
        manual_evidence_item: { packet: {
          screenshots: [{ screenshot_id: `shot-${captured.uploads.length}`, captured_at: capturedAt, source_name: sourceName }],
          evidence_items: [{ evidence_id: `evidence-${captured.uploads.length}`, screenshot_id: `shot-${captured.uploads.length}`, operator_confirmed: false }]
        } } });
    }
    if (value.includes('/manual-evidence/proposal')) {
      const body = JSON.parse(init.body);
      captured.proposals.push(body);
      return response({ ok: true, preview_only: true, should_ingest: false, no_global_mutation: true,
        manual_evidence_item: { packet: { evidence_items: [{ evidence_id: body.evidence_id, operator_confirmed: false }] } } });
    }
    throw new Error(`unexpected fetch ${value}`);
  };
}

function runOptions(tmp, fixtures, captured, overrides = {}) {
  const counters = { navigations: [], screenshots: 0, closed: 0 };
  const page = new FakePage(fixtures, counters);
  return {
    counters, options: Object.assign({
      allow_local_source: true, source_urls: { zillow: SOLD }, source_order: ['zillow'],
      log_dir: path.join(tmp, 'logs'), rate_state_path: path.join(tmp, `rate-${Math.random()}.json`),
      fetch_impl: fetchStub(captured), browser_resolver_impl: browserStub(page, counters),
      visible_card_reader_impl: fixtureCards(fixtures[SEARCH] && fixtures[SEARCH].cards || []),
      detail_address_reader_impl: async () => fixtures[DETAIL] && fixtures[DETAIL].displayed_addresses || [],
      ocr_impl: async (_buffer, meta) => meta.kind === 'subject_property'
        ? `${ADDRESS} Single family home 3 beds 2 baths 1,640 sqft Year built 2003 Lot size 7,200 sqft List price $320,000`
        : '$305,000 sold June 10, 2026 3812 Kings Dr, Ennis, TX 75119'
    }, overrides)
  };
}

async function directResolution(cards, status = 200) {
  const counters = { navigations: [], screenshots: 0 };
  const page = new FakePage({ [SEARCH]: { body: 'address results', cards, status } }, counters);
  const result = await agent.resolveDetailUrlFromSearch(page, ADDRESS, 'zillow', {
    allow_local_source: true, search_url: SEARCH, visible_card_reader_impl: fixtureCards(cards)
  });
  return { result, counters };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle41-'));
  const originalFetch = global.fetch;
  const originalHttpGet = http.get;
  const originalHttpRequest = http.request;
  const originalHttpsGet = https.get;
  const originalHttpsRequest = https.request;
  let unexpectedNetwork = 0;
  global.fetch = async () => { unexpectedNetwork += 1; throw new Error('unexpected global fetch'); };
  http.get = http.request = https.get = https.request = () => { unexpectedNetwork += 1; throw new Error('unexpected network'); };
  try {
    const forms = ['3808 Kings Dr, Ennis, TX 75119', '3808 KINGS DRIVE, Ennis, TX 75119', '3808 kings dr., Ennis, TX 75119'];
    assert.strictEqual(new Set(forms.map((value) => canonical.canonicalizeAddress(value).canonical_string)).size, 1);
    assert.strictEqual(canonical.addressesMatchExactly(ADDRESS, '3810 Kings Dr, Ennis, TX 75119'), false);
    assert.strictEqual(canonical.addressesMatchExactly(ADDRESS, '3808 Kings Ct, Ennis, TX 75119'), false);
    assert.strictEqual(canonical.addressesMatchExactly(ADDRESS, '3808 Kings Dr, Ennis, TX 75120'), false);
    assert.strictEqual(canonical.addressesMatchExactly(ADDRESS, '3808 Kings Dr Apt 2, Ennis, TX 75119'), false);
    assert.strictEqual(canonical.addressesMatchExactly(ADDRESS, '3808 Kingz Dr, Ennis, TX 75119'), false);
    assert.deepStrictEqual(Object.keys(canonical).filter((key) => /similar|score/i.test(key)), []);

    const exactCard = { index: 0, text: `${ADDRESS} For sale`, href: DETAIL, visible: true };
    const exact = await directResolution([exactCard]);
    assert.strictEqual(exact.result.detail_url, DETAIL);
    assert.deepStrictEqual(exact.counters.navigations, [SEARCH]);
    const zero = await directResolution([{ index: 0, text: '3810 Kings Dr, Ennis, TX 75119', href: DETAIL, visible: true }]);
    assert.strictEqual(zero.result.reason, 'no_exact_address_match_visible');
    assert.strictEqual(zero.counters.navigations.length, 1);
    const ambiguous = await directResolution([exactCard, { ...exactCard, index: 1, href: `${DETAIL}-duplicate` }]);
    assert.strictEqual(ambiguous.result.reason, 'ambiguous_address_match');
    const offsite = await directResolution([{ ...exactCard, href: 'https://evil.example/property-detail/1' }]);
    assert.strictEqual(offsite.result.reason, 'no_exact_address_match_visible');

    const directFixture = { [SEARCH]: { body: `${ADDRESS} Single family home 3 beds 2 baths 1,640 sqft Year built 2003 Zestimate $268,400`, final_url: DETAIL, status: 200 },
      [DETAIL]: { body: `${ADDRESS} Single family home 3 beds 2 baths 1,640 sqft Year built 2003 Zestimate $268,400`, displayed_addresses: [ADDRESS], status: 200 } };
    const directCaptured = { uploads: [], proposals: [] };
    const direct = runOptions(tmp, directFixture, directCaptured, {
      detail_address_reader_impl: async () => [ADDRESS],
      ocr_impl: async () => `${ADDRESS} Single family home 3 beds 2 baths 1,640 sqft Year built 2003 Zestimate $268,400`
    });
    const directRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, direct.options);
    assert.deepStrictEqual(direct.counters.navigations, [SEARCH]);
    assert.strictEqual(directRun.run.outcome, 'SUBJECT_FACT_PROPOSAL_CREATED');
    assert.strictEqual(directRun.run.pages_visited, 1);
    assert.strictEqual(directRun.run.resolution_chain.length, 1);
    assert.strictEqual(directRun.run.resolution_chain[0].requested_url, SEARCH);
    assert.strictEqual(directRun.run.resolution_chain[0].final_url, DETAIL);
    assert.strictEqual(directRun.run.resolution_chain[0].redirected, true);
    assert.strictEqual(directRun.run.resolution_chain[0].url_kind_requested, 'address_search');
    assert.strictEqual(directRun.run.resolution_chain[0].url_kind_final, 'property_detail');
    assert.strictEqual(directRun.run.resolution_chain[0].address_match, 'EXACT');
    assert.strictEqual(directCaptured.proposals[0].operator_confirmed, false);
    assert.strictEqual(directCaptured.proposals[0].fields.public_estimate, '$268,400');
    assert.strictEqual(directRun.run.proposals, 1);
    assert.ok(directCaptured.proposals.every((proposal) => proposal.operator_confirmed === false));

    const noMainCaptured = { uploads: [], proposals: [] };
    const noMain = runOptions(tmp, { ...directFixture, [SEARCH]: { ...directFixture[SEARCH], main: false } }, noMainCaptured);
    const noMainRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, noMain.options);
    assert.strictEqual(noMainRun.run.outcome, 'SUBJECT_FACT_PROPOSAL_CREATED');
    assert.strictEqual(noMainRun.run.resolution_chain[0].address_match, 'EXACT');
    assert.strictEqual(noMain.counters.screenshots, 1);
    assert.strictEqual(noMainCaptured.proposals[0].operator_confirmed, false);

    const zillowSummary = `${ADDRESS} 3 beds 2 baths 1,374 sqft Single Family Residence Built in 2023 4,791 Square Feet Lot $268,400 Zestimate`;
    const poisonedOcr = `${ADDRESS} 75119 beds 4,791 Square Feet Lot Single Family Residence Built in 2023`;
    const visibleCaptured = { uploads: [], proposals: [] };
    const visible = runOptions(tmp, { ...directFixture, [SEARCH]: { ...directFixture[SEARCH], body: zillowSummary, main: false } }, visibleCaptured, {
      ocr_impl: async () => poisonedOcr
    });
    const visibleRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, visible.options);
    assert.strictEqual(visibleRun.run.outcome, 'SUBJECT_FACT_PROPOSAL_CREATED');
    assert.deepStrictEqual(Object.assign({}, visibleCaptured.proposals[0].fields), {
      source_url: DETAIL, beds: '3', baths: '2', sqft: '1374', property_kind: 'single family residence',
      year_built: '2023', lot_size: '4,791 square feet', public_estimate: '$268,400'
    });
    const poisonedFields = agent.subjectFactsFromVisibleText(poisonedOcr, DETAIL);
    assert.strictEqual(poisonedFields.beds, undefined);
    assert.strictEqual(poisonedFields.sqft, undefined);
    assert.strictEqual(poisonedFields.lot_size, '4,791 square feet');
    assert.strictEqual(agent.subjectFactsFromVisibleText('Redfin Estimate $251,000', 'https://www.redfin.com/property-detail/synthetic').public_estimate, '$251,000');

    for (const source of [
      { site: 'redfin', search: 'https://www.redfin.com/search?q=3808%20Kings%20Dr', detail: 'https://www.redfin.com/TX/Ennis/3808-Kings-Dr-75119/home/12345' },
      { site: 'realtor', search: 'https://www.realtor.com/realestateandhomes-search/3808%20Kings%20Dr', detail: 'https://www.realtor.com/realestateandhomes-detail/3808-Kings-Dr_Ennis_TX_75119_M12345-12345' }
    ]) {
      const redirectPage = new FakePage({ [source.search]: { final_url: source.detail, status: 200 } }, { navigations: [], screenshots: 0 });
      const resolution = await agent.resolveDetailUrlFromSearch(redirectPage, ADDRESS, source.site, { search_url: source.search });
      assert.strictEqual(resolution.blocked, false, source.site);
      assert.strictEqual(resolution.direct_redirect, true, source.site);
      assert.strictEqual(resolution.detail_url, source.detail, source.site);
    }

    const mismatchDirectCapture = { uploads: [], proposals: [] };
    const mismatchDirect = runOptions(tmp, { ...directFixture, [SEARCH]: { ...directFixture[SEARCH], main: false }, [DETAIL]: { ...directFixture[DETAIL], displayed_addresses: ['3810 Kings Dr, Ennis, TX 75119'] } }, mismatchDirectCapture, {
      detail_address_reader_impl: async () => ['3810 Kings Dr, Ennis, TX 75119']
    });
    const mismatchDirectRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, mismatchDirect.options);
    assert.strictEqual(mismatchDirectRun.run.outcome, 'detail_page_address_mismatch');
    assert.strictEqual(mismatchDirect.counters.screenshots, 0);
    assert.strictEqual(mismatchDirectRun.run.proposals, 0);
    assert.deepStrictEqual(mismatchDirectCapture.uploads, []);

    for (const fixture of [
      { cards: [], expected: 'no_exact_address_match_visible' },
      { cards: [exactCard, { ...exactCard, index: 1, href: `${DETAIL}-duplicate` }], expected: 'ambiguous_address_match' }
    ]) {
      const noMatchCapture = { uploads: [], proposals: [] };
      const noMatch = runOptions(tmp, { [SEARCH]: { body: 'search results', cards: fixture.cards } }, noMatchCapture);
      const noMatchRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, noMatch.options);
      assert.strictEqual(noMatchRun.run.proposals, 0);
      assert.deepStrictEqual(noMatchCapture.uploads, []);
      assert.strictEqual(noMatchRun.run.outcome, fixture.expected);
    }

    const offHostCapture = { uploads: [], proposals: [] };
    const offHost = runOptions(tmp, { [SEARCH]: { body: 'redirected', final_url: 'https://example.invalid/property-detail/1', status: 200 } }, offHostCapture);
    const offHostRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, offHost.options);
    assert.strictEqual(offHostRun.run.outcome, 'subject_search_left_allowed_host');
    assert.strictEqual(offHostRun.run.proposals, 0);
    assert.strictEqual(offHost.counters.navigations.length, 1);
    assert.ok(offHost.counters.navigations.every((url) => !/redfin\.com|realtor\.com/i.test(url)));

    const soldRedirectCapture = { uploads: [], proposals: [] };
    const soldRedirect = runOptions(tmp, { [SEARCH]: { body: 'sold results', final_url: SOLD, status: 200 } }, soldRedirectCapture);
    const soldRedirectRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, soldRedirect.options);
    assert.strictEqual(soldRedirectRun.run.outcome, 'subject_search_redirected_or_wrong_type');
    assert.strictEqual(soldRedirectRun.run.proposals, 0);

    for (const status of [403, 429]) {
      const blockedCapture = { uploads: [], proposals: [] };
      const blockedFixture = runOptions(tmp, { [SEARCH]: { body: 'blocked', status } }, blockedCapture);
      const blockedResult = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, blockedFixture.options);
      assert.strictEqual(blockedResult.run.outcome, `http_${status}`);
      assert.strictEqual(blockedResult.run.block_events[0].reason, `http_${status}`);
      assert.strictEqual(blockedResult.run.proposals, 0);
    }

    const blockedTextCapture = { uploads: [], proposals: [] };
    const blockedText = runOptions(tmp, { [SEARCH]: { body: 'Access denied. CAPTCHA verification required.' } }, blockedTextCapture);
    const blockedTextRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, blockedText.options);
    assert.strictEqual(blockedTextRun.run.outcome, 'blocked_text_detected');
    assert.strictEqual(blockedTextRun.run.proposals, 0);

    const estimateEvaluation = manualEvidence.evaluatePacket({ evidence_items: [{
      evidence_type: 'subject_property', operator_confirmation: { confirmed: true, confirmed_by: 'operator', confirmed_at: '2026-09-22T12:00:00.000Z' },
      fields: { public_estimate: '$268,400', source_url: 'https://www.zillow.com/homedetails/synthetic/1_zpid/' }, screenshot_id: 'synthetic-estimate', source_name: 'Zillow'
    }] }, row, { today_iso: '2026-09-22' });
    assert.strictEqual(estimateEvaluation.arv_status, 'ARV_LOCKED_NEEDS_3_VERIFIED_SOLD_COMPS');
    assert.strictEqual(estimateEvaluation.arv_range, null);
    assert.strictEqual(estimateEvaluation.verified_sold_comp_count, 0);
    assert.strictEqual(estimateEvaluation.readiness.ready_to_offer.status, 'NO');
    assert.deepStrictEqual(estimateEvaluation.clue_values_not_arv.filter((entry) => entry.field === 'public_estimate').map((entry) => entry.source_url), ['https://www.zillow.com/homedetails/synthetic/1_zpid/']);

    const baseFixtures = {
      [SEARCH]: { body: 'address search', cards: [exactCard], status: 200 },
      [DETAIL]: { body: `${ADDRESS} List price $320,000`, displayed_addresses: [ADDRESS], status: 200 }
    };
    const mismatchCaptured = { uploads: [], proposals: [] };
    const mismatch = runOptions(tmp, { ...baseFixtures, [DETAIL]: { ...baseFixtures[DETAIL], displayed_addresses: ['3810 Kings Dr, Ennis, TX 75119'] } }, mismatchCaptured);
    const mismatchRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, mismatch.options);
    assert.strictEqual(mismatchRun.run.outcome, 'detail_page_address_mismatch');
    assert.strictEqual(mismatch.counters.screenshots, 0);
    assert.strictEqual(mismatchRun.run.proposals, 0);

    const captured = { uploads: [], proposals: [] };
    const happy = runOptions(tmp, baseFixtures, captured);
    const happyRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, happy.options);
    assert.deepStrictEqual(happy.counters.navigations, [SEARCH, DETAIL]);
    assert.ok(happy.counters.navigations.length <= 2);
    assert.strictEqual(happy.counters.screenshots, 1);
    assert.strictEqual(happyRun.run.proposals, 1);
    assert.deepStrictEqual(happyRun.run.url_kinds_visited.map((item) => item.url_kind), ['address_search', 'property_detail']);
    assert.strictEqual(captured.proposals[0].operator_confirmed, false);
    assert.strictEqual(happyRun.run.resolution_chain.at(-1).address_match, 'EXACT');
    assert.strictEqual(happyRun.run.resolution_chain[0].requested_url, SEARCH);
    assert.strictEqual(happyRun.run.resolution_chain[0].final_url, SEARCH);
    assert.strictEqual(happyRun.run.resolution_chain[0].redirected, false);
    assert.strictEqual(happyRun.run.resolution_chain.at(-1).url_kind_final, 'property_detail');

    const noYearCaptured = { uploads: [], proposals: [] };
    const noYear = runOptions(tmp, baseFixtures, noYearCaptured, { ocr_impl: async () => `${ADDRESS} Single family home 3 beds 2 baths 1,640 sqft Lot size 7,200 sqft` });
    await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, noYear.options);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(noYearCaptured.proposals[0].fields, 'year_built'), false);

    const blockedCaptured = { uploads: [], proposals: [] };
    const blocked = runOptions(tmp, { [SEARCH]: { body: 'rate limited', cards: [], status: 429 } }, blockedCaptured);
    const blockedRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'subject_facts' }, blocked.options);
    assert.strictEqual(blockedRun.run.block_events[0].reason, 'http_429');
    assert.strictEqual(blocked.counters.navigations.length, 1);
    assert.strictEqual(blockedRun.run.proposals, 0);

    const soldCardUrl = 'http://127.0.0.1:4141/property-detail/3812-kings';
    const soldCaptured = { uploads: [], proposals: [] };
    const soldFixtures = { [SOLD]: { body: 'Recently sold homes', cards: [{
      index: 0, text: '$305,000 sold June 10, 2026 3812 Kings Dr, Ennis, TX 75119', href: soldCardUrl, visible: true
    }], status: 200 } };
    const sold = runOptions(tmp, soldFixtures, soldCaptured, { minimum_proposals: 1, now_impl: () => 1790078400000 });
    const soldRun = await agent.runCapture({ market, queue_key: row.queue_key, dashboard_url: 'https://dashboard.example.test', agent_token: 'token', site: 'zillow', mode: 'sold_comps' }, sold.options);
    assert.strictEqual(soldRun.run.proposals, 1);
    assert.strictEqual(soldRun.run.captures_submitted, 1);
    assert.deepStrictEqual(soldCaptured.uploads, [{ source_url: soldCardUrl, evidence_type: 'sold_comp' }]);
    assert.deepStrictEqual(gridConfig, { max_distance_miles: 1, max_living_area_variance_ratio: 0.20, max_bedroom_difference: 1,
      max_bathroom_difference: 1, max_year_built_difference: 15, max_lot_size_variance_ratio: 0.30,
      rural_operator_max_distance_miles: 5, minimum_verified_comps: 3 });

    const soldParity = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cycle-41-sold-comp-run.json'), 'utf8'));
    assert.deepStrictEqual(Object.assign({}, soldRun.run, { helper_build: '<build>' }), soldParity);

    assert.throws(() => agent.cleanRunLog({ mode: 'subject_facts', requested_mode: 'subject_facts', effective_mode: 'subject_facts',
      proposals: 1, url_kinds_visited: [], resolution_chain: [] }), /subject_proposal_resolution_chain_incomplete/);
    assert.strictEqual(happyRun.run.resolution_chain.length, 2);
    assert.strictEqual(happyRun.run.screenshots, 1);
    assert.strictEqual(happyRun.run.proposals, 1);
    assert.ok([directRun, happyRun].every((result) => result.run.proposals > 0 && result.run.resolution_chain.at(-1).address_match === 'EXACT'));
    assert.ok(!happyRun.run.url_kinds_visited.some((item) => item.url_kind === 'sold_search'));
    assert.strictEqual(unexpectedNetwork, 0);
  } finally {
    global.fetch = originalFetch;
    http.get = originalHttpGet; http.request = originalHttpRequest;
    https.get = originalHttpsGet; https.request = originalHttpsRequest;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('cycle-41-search-to-detail: ok');
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
