'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const Module = require('node:module');
const network = require('./helpers/refuse-live-network').installRefuseLiveNetwork();
const load = Module._load;
Module._load = function(name, ...args) { return name === 'dotenv' ? { config: () => ({ parsed: {} }) } : load.call(this, name, ...args); };
const express = require('express');
const route = require('../modules/buyers/sourced-match-routes');
Module._load = load;
const NOW = '2026-11-18T02:00:00Z';

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const mounted = source.indexOf("app.use('/api/dashboard/sourced-matches'");
  assert(mounted > 0 && mounted < source.indexOf('app.use(express.json('), 'Private auth/method/body boundary precedes parsing');
  assert(source.includes("require('./modules/buyers/sourced-match-routes').register(app, { db, requireAdmin })"));
  let reads = 0, writes = 0, mode = 'ok';
  const db = { readDBStrict: () => {
    reads++;
    if (mode === 'throws') throw Error('SYNTHETIC PRIVATE SENTINEL');
    if (mode === 'malformed') return { buyers: [] };
    const empty = { users: [{ id: 'operator' }], buyers: [], reviewed_deals: [] };
    if (mode === 'empty') return empty;
    return { ...empty, buyers: [{ id: 'buyer1', record_ref: 'BUY-0001', name: 'Fixture Investor',
      assistant_find: { name: 'Fixture Investor', platform: 'manual', source_url: 'https://buyers.example.test/wants/1',
        what_they_buy: 'Reported houses in Tampa up to 200000', deal_type: 'house', states: ['FL'], areas: ['Tampa'],
        buy_box: { types: ['house'], price_max: 200000 }, captured_at: '2026-11-17T02:00:00Z', approval: 'approved', classification: 'end_buyer',
        history: [{ kind: 'approval', to: 'approved', at: NOW, operator_id: 'operator' }] } }],
      reviewed_deals: [{ id: 'deal1', record_ref: 'WOS-FL-1001', kind: 'deal', deal_kind: 'jv', platform: 'facebook-wholesaler',
        source_url: 'https://records.example.test/private-deal-sentinel', address: '100 Hidden Lane, Tampa, FL 33602',
        city: 'Tampa', state: 'FL', zip: '33602', property_type: 'house', asking_price: 150000,
        posted_at: '2026-11-17T02:00:00Z', captured_at: '2026-11-17T02:00:00Z', approval: 'pending', status: 'found', comps: [] }] };
  }, writeDB: () => { writes++; throw Error('No write allowed'); }, readDB: () => { throw Error('No permissive fallback'); } };
  const auth = (req, res, next) => req.headers['x-fixture-role'] === 'admin' ? next() : res.status(req.headers['x-fixture-role'] ? 403 : 401).json({ code: 'session_required' });
  const app = express();
  app.use(route.PATH, route.noStore, auth, route.requireReadPayload);
  app.use(express.json()); route.register(app, { db, requireAdmin: auth, now: () => NOW });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  async function request(method = 'GET', role = 'admin', body, query = '') {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: route.PATH + query, method,
        headers: { ...(role ? { 'x-fixture-role': role } : {}), ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}) } }, res => {
        let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => {
          try { assert.equal(res.headers['cache-control'], 'no-store'); resolve({ status: res.statusCode, data: JSON.parse(text) }); }
          catch (error) { reject(error); }
        });
      }); req.on('error', reject); req.end(body);
    });
  }
  try {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) for (const role of [null, 'agent']) {
      assert.equal((await request(method, role, '{"synthetic":')).status, role ? 403 : 401);
    }
    assert.equal(reads, 0);
    for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await request(method, 'admin', '{"synthetic":')).status, 405);
    assert.equal((await request('GET', 'admin', '{"synthetic":')).status, 400);
    for (const query of ['?now=2026-01-01', '?enabled=true', '?source=forged']) assert.equal((await request('GET', 'admin', undefined, query)).status, 400);
    assert.equal(reads, 0, 'Denied/malformed requests never reach private storage');
    const ok = await request(); assert.equal(ok.status, 200); assert.equal(ok.data.read_only, true);
    assert.equal(ok.data.generated_at, NOW); assert.equal(ok.data.by_deal[0].matches[0].buyer_ref, 'BUY-0001');
    assert.equal(ok.data.by_buyer[0].matches[0].deal_ref, 'WOS-FL-1001');
    assert.equal(ok.data.by_deal[0].value_label, 'Value not verified');
    assert(!JSON.stringify(ok).includes('100 Hidden Lane') && !JSON.stringify(ok).includes('private-deal-sentinel'), 'Unsigned JV street/source detail never enters index DTO');
    assert.equal(ok.data.coverage.deed_purchases, 'not_integrated'); assert.equal(reads, 1);
    mode = 'empty'; const empty = await request(); assert.equal(empty.status, 200);
    assert.deepEqual(empty.data.by_deal, []); assert.deepEqual(empty.data.by_buyer, []);
    for (const failure of ['throws', 'malformed']) {
      mode = failure; const result = await request();
      assert.deepEqual(result, { status: 503, data: { ok: false, code: 'sourced_matches_unavailable' } });
      assert(!JSON.stringify(result).includes('PRIVATE SENTINEL'));
    }
    assert.equal(writes, 0);
    assert.deepEqual(network.attempts, []);
    assert.throws(() => route.register(app, { db: { readDB() {} }, requireAdmin: auth }), /Strict read/);
    console.log('sourced match private GET: auth/no-store before parser, method/body/query rejection without reads, strict snapshot/coverage and generic failure, no writes/fallback/clock override PASS');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => network.restore());
