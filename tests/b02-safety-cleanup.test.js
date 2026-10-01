'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const db = require('../db');
const buybox = require('../modules/buybox');
const outreach = require('../modules/outreach');

const original = { readDB: db.readDB, writeDB: db.writeDB, getBuyers: db.getBuyers, getLeads: db.getLeads };
const generated = { id: 'old-generated', name: 'Example Investor 1', state: 'TX', county: 'Example', active: true, source: 'Auto-generated for market', minARV: 0, maxPrice: 999999, minSpread: 0, maxRepairs: 999999 };
const real = { id: 'real-box', name: 'Operator-entered box', state: 'TX', county: 'Example', active: true, source: 'Manual', minARV: 0, maxPrice: 999999, minSpread: 0, maxRepairs: 999999 };
const stored = { buyboxes: [generated, real], tone_learning: Array.from({ length: 12 }, (_, id) => ({ id })) };

try {
  db.readDB = () => stored;
  db.writeDB = () => { throw new Error('test_must_not_write_db'); };
  db.getBuyers = () => [];
  db.getLeads = () => [{ id: 'lead-1', state: 'TX', county: 'Example', arv: 100000, offer: 50000, spread: 50000, repairs: 10000 }];

  assert.strictEqual(outreach.getAutoSendEnabled(), false, 'tone edits must never enable automatic sending');
  assert.strictEqual(typeof buybox.generateMarketBuyBoxes, 'undefined', 'invented market investor generator must not remain callable');
  assert.deepStrictEqual(buybox.getBuyBoxes().map(box => box.id), ['real-box'], 'legacy generated records remain stored but hidden from reads');
  assert.strictEqual(stored.buyboxes.length, 2, 'read filtering must not delete stored records');
  assert.strictEqual(buybox.addBuyBox({ ...generated, source: ' AUTO-GENERATED FOR MARKET ' }), null, 'new generated records must be rejected');
  assert.deepStrictEqual(buybox.matchBuyBoxesToLead(db.getLeads()[0]).map(box => box.id), ['real-box'], 'generated boxes must not match a lead');
  db.getBuyers = () => [
    { name: 'Generated buyer', contact: 'Placeholder', source: 'Auto-generated for market' },
    { name: 'No contact buyer', source: 'Manual' }
  ];
  assert.strictEqual(buybox.extractFromBuyers(), 0, 'invented or uncontactable buyer records must not create buy boxes');
  db.getBuyers = () => [];

  const routes = {};
  const app = {
    get: (route, handler) => { routes[`GET ${route}`] = handler; },
    post: (route, handler) => { routes[`POST ${route}`] = handler; }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
  const start = source.indexOf("app.get('/api/buyboxes'");
  const end = source.indexOf("app.get('/api/outreach/:leadId'", start);
  assert.ok(start >= 0 && end > start, 'buy-box endpoint block must be found');
  vm.runInNewContext(source.slice(start, end), {
    app,
    db,
    require: (name) => {
      assert.strictEqual(name, './modules/buybox');
      return buybox;
    }
  });
  const response = () => ({ json(value) { this.body = value; return this; }, status(code) { this.statusCode = code; return this; } });
  const listed = response();
  routes['GET /api/buyboxes']({}, listed);
  assert.deepStrictEqual(listed.body.buyboxes.map(box => box.id), ['real-box'], 'list endpoint must not return a generated buyer box');
  const matched = response();
  routes['POST /api/buyboxes/match/:leadId']({ params: { leadId: 'lead-1' } }, matched);
  assert.deepStrictEqual(matched.body.matches.map(box => box.id), ['real-box'], 'match endpoint must not return a generated buyer box');
  assert.ok(!source.includes('generateMarketBuyBoxes'), 'server must not retain a route to invented investors');
  assert.strictEqual((source.match(/auto_send: getAutoSendEnabled\(\)/g) || []).length, 1, 'tone-status has one disabled response');

  const outreachStart = source.indexOf("app.get('/api/outreach/tone-status'");
  const outreachEnd = source.indexOf("app.get('/api/contracts/templates'", outreachStart);
  assert.ok(outreachStart >= 0 && outreachEnd > outreachStart, 'outreach route block must be found');
  const outreachRoutes = [];
  vm.runInNewContext(source.slice(outreachStart, outreachEnd), {
    app: {
      get: (route, handler) => outreachRoutes.push({ method: 'GET', route, handler }),
      post: (route, handler) => outreachRoutes.push({ method: 'POST', route, handler })
    },
    require: (name) => {
      assert.strictEqual(name, './modules/outreach');
      return outreach;
    },
    db
  });
  const firstGet = (pathName) => outreachRoutes.find(({ method, route }) => method === 'GET' &&
    (route === pathName || (route.endsWith('/:leadId') && pathName.startsWith(route.slice(0, -7)))));
  const status = response();
  firstGet('/api/outreach/tone-status').handler({ params: {} }, status);
  assert.strictEqual(status.body.auto_send, false, 'the first matching live route must expose auto_send false');
  assert.strictEqual(status.body.edits, 12, 'tone-status must not be shadowed by lead history');
  const history = response();
  firstGet('/api/outreach/lead-1').handler({ params: { leadId: 'lead-1' } }, history);
  assert.deepStrictEqual(history.body.history, [], 'ordinary outreach history route must still work');

  console.log('B-02 safety cleanup tests passed');
} finally {
  Object.assign(db, original);
}
