'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const finds = require('../modules/buyers/assistant-finds');
const { registerAssistantFindRoutes, REQUESTS_PER_HOUR } = require('../modules/buyers/assistant-find-routes');
const pairing = require('../modules/security/dashboard-pairing');
const ui = require('../dashboard/wos-buyers-found');
const fits = require('../modules/buyers/buyer-fit');

const now = '2026-10-06T12:00:00.000Z';
const item = {
  name: 'Fixture Investor', platform: 'facebook', group_name: 'Synthetic Group', group_id: '123',
  profile_url: 'https://www.facebook.com/groups/123/user/456/',
  source_url: 'https://www.facebook.com/groups/123/search/?q=buy%20box',
  what_they_buy: 'Houses in the stated area.', deal_type: 'house', states: ['TX'], areas: ['Example metro'],
  email: 'fixture@example.test', phone: '555-010-1234', drafted_message: 'Synthetic draft only.', captured_at: now,
  classification: 'end_buyer', buy_box: { state: 'TX', areas: ['Example metro'], zips: ['75001'], types: ['house'], price_max: 200000, beds_min: 2, wants_sent: ['Comps', 'Photos'] }
};
const valid = finds.validateItems({ items: [item] }, now);
for (const changes of [
  { source_url: '' }, { source_url: 'https://evil.test/groups/123/search/?q=buy' },
  { profile_url: 'https://facebook.com.evil.test/groups/123/user/456/' },
  { profile_url: 'https://facebook.com/groups/999/user/456/' },
  { profile_url: 'javascript:alert(1)' }, { profile_url: 'https://x@facebook.com/groups/123/user/456/' },
  { source_url: 'https://facebook.com/groups/123/' }, { source_url: 'https://facebook.com/groups/123/search/?redirect=secret' },
  { what_they_buy: 'x'.repeat(501) }, { drafted_message: 'x'.repeat(601) },
  { verified: true }, { status: 'replied' }, { approval: 'approved' }, { captured_at: '2027-01-01T00:00:00Z' },
  { post_url: 'https://evil.test/groups/123/posts/45/' }, { buy_box: { price_max: '200000' } },
  { buy_box: { price_min: 200000, price_max: 100000 } }, { buy_box: { zips: ['partial'] } },
  { captured_at: '2026-02-30T00:00:00Z' }, { contact_published: { email: 'different@example.test' } }
]) assert.throws(() => finds.validateItems({ items: [{ ...item, ...changes }] }, now), /^Error: find_/);
assert.strictEqual(finds.validateItems({ items: Array(50).fill(item) }, now).length, 50);
assert.deepStrictEqual(finds.validateItems({ items: [{ ...item, buy_box: { types: ['2–4 units'] } }] }, now)[0].buy_box.types, ['2-4 units']);
assert.throws(() => finds.validateItems({ items: Array(51).fill(item) }, now), /find_item_limit/);
assert.throws(() => finds.validateItems({ items: [item], secret: 'x' }, now), /find_request_invalid/);
assert.throws(() => finds.validateItems({ items: [{ ...item, buy_box: { wants_sent: Array(50).fill('x'.repeat(100)), exclusions: Array(50).fill('y'.repeat(100)) } }] }, now), /find_item_too_large/);
assert.throws(() => finds.validateItems({ items: Array(50).fill({ ...item, buy_box: { wants_sent: Array(50).fill('x'.repeat(100)) } }) }, now), /find_request_too_large/);
const original = { leads: [{ id: 'keep-lead' }], buyers: [{ id: 'keep-buyer' }], settings: { keep: true } };
const before = JSON.stringify(original);
let sequence = 0;
const context = { now, operatorId: 'fixture-operator', createId: () => 'fixture-' + (++sequence) };
let result = finds.ingest(original, valid, context);
assert.strictEqual(JSON.stringify(original), before, 'pure merge leaves the input store untouched');
assert.deepStrictEqual(result.store.leads, original.leads);
assert.deepStrictEqual(result.results, [{ id: 'fixture-1', result: 'created' }]);
assert.strictEqual(result.store.buyers[1].verified, false);
assert.strictEqual(result.store.buyers[1].status, 'Unverified');
assert.strictEqual(result.store.buyers[1].assistant_find.approval, 'pending');
assert.strictEqual(fits.approvedForMatching(result.store.buyers[1]), false);
assert.throws(() => finds.update(result.store, 'fixture-1', { status: 'messaged' }, context), /find_approval_required/);
let updated = finds.update(result.store, 'fixture-1', { approval: 'approved', reason: 'Reviewed source' }, context);
updated = finds.update(updated, 'fixture-1', { status: 'messaged', drafted_message: 'Operator edit' }, context);
updated = finds.update(updated, 'fixture-1', { status: 'replied' }, context);
const repeat = finds.ingest(updated, [{ ...valid[0], drafted_message: 'Should not replace operator edit' }], { ...context, now: '2026-10-06T13:00:00.000Z' });
assert.strictEqual(repeat.store.buyers.length, 2);
assert.strictEqual(repeat.store.buyers[1].assistant_find.status, 'replied');
assert.strictEqual(repeat.store.buyers[1].assistant_find.drafted_message, 'Operator edit');
assert.strictEqual(repeat.store.buyers[1].assistant_find.history.length, 3);
assert.strictEqual(repeat.store.buyers[1].assistant_find.history[0].operator_id, 'fixture-operator');
assert.strictEqual(repeat.store.buyers[1].assistant_find.last_seen_at, '2026-10-06T13:00:00.000Z');
assert.strictEqual(repeat.store.buyers[1].verified, false, 'a workflow status does not verify a buyer');
assert.strictEqual(repeat.store.buyers[1].assistant_find.approval, 'approved');
assert.strictEqual(repeat.store.buyers[1].assistant_find.history[1].channel, 'facebook');
const rejected = finds.update(updated, 'fixture-1', { approval: 'rejected', reason: 'Not an end buyer' }, context);
assert.strictEqual(fits.approvedForMatching(rejected.buyers[1]), false);
assert.strictEqual(rejected.buyers.length, updated.buyers.length);
assert.strictEqual(rejected.buyers[1].assistant_find.history.at(-1).reason, 'Not an end buyer');
const contactRepeat = finds.ingest(updated, [{ ...valid[0], uid: 'another', platform: 'manual', email: ' FIXTURE@EXAMPLE.TEST ' }], context);
assert.strictEqual(contactRepeat.store.buyers.length, 2);
assert.strictEqual(contactRepeat.store.buyers[1].assistant_find.possible_duplicate_of, 'fixture-1');
assert.strictEqual(contactRepeat.store.buyers[1].assistant_find.approval, 'approved');
const phoneRepeat = finds.ingest(original, [{ ...valid[0], email: '', phone: '+1 (555) 010-1234' }], context);
const phoneDuplicate = finds.ingest(phoneRepeat.store, [{ ...valid[0], uid: 'different', email: '', phone: '5550101234' }], context);
assert.strictEqual(phoneDuplicate.store.buyers.length, phoneRepeat.store.buyers.length);
const legacyDuplicate = finds.ingest({ buyers: [{ id: 'legacy', email: item.email, notes: 'Keep this', status: 'Active' }] }, valid, context);
assert.strictEqual(legacyDuplicate.store.buyers.length, 1);
assert.strictEqual(legacyDuplicate.store.buyers[0].notes, 'Keep this');
assert.strictEqual(legacyDuplicate.store.buyers[0].assistant_find.approval, 'pending');
const lead = { state: 'TX', city: 'Example metro', zip: '75001', property_type: 'SFR', price: 150000,
  address: '100 Test St, Example metro, TX 75001', source_url: 'https://county.example.gov/notices/TEST.pdf',
  source_structured_address_verified: true, source_proof_text: 'Property address: 100 Test St, Example metro, TX 75001.',
  arv: 200000, offer: 100000 };
assert.strictEqual(fits.fitLead(updated.buyers[1], lead).fits, true);
assert.strictEqual(fits.fitLead(result.store.buyers[1], lead).fits, false);
assert.strictEqual(fits.fitLead(rejected.buyers[1], lead).fits, false);
for (const change of [{ state: 'FL' }, { zip: '75002' }, { property_type: 'land' }, { price: 210000 }]) {
  assert.strictEqual(fits.fitLead(updated.buyers[1], { ...lead, ...change }).fits, false);
}
const partial = fits.fitLead(updated.buyers[1], { ...lead, price: null });
assert.strictEqual(partial.fits, true);
assert.ok(partial.unknown.includes('Price not known'));
assert.strictEqual(fits.fitSummary(updated.buyers[1], [lead, { ...lead, price: 300000 }]).count, 1);
const partner = { ...updated.buyers[1], assistant_find: { ...updated.buyers[1].assistant_find, classification: 'middleman_jv' } };
assert.strictEqual(fits.fitLead(partner, lead).fits, false);
assert.strictEqual(fits.boxAllowed({ email: item.email }, [result.store.buyers[1]]), false);
assert.strictEqual(fits.boxAllowed({ phone: '+1 (555) 010-1234' }, [rejected.buyers[1]]), false);
assert.strictEqual(fits.boxAllowed({ email: item.email }, [updated.buyers[1]]), true);
assert.strictEqual(fits.boxAllowed({ buyer_id: 'fixture-1' }, [result.store.buyers[1]]), false);
assert.strictEqual(finds.validateItems({ items: [{ ...item, platform: 'craigslist', group_id: '', group_name: '', uid: 'post-1', profile_url: '', source_url: 'https://dallas.craigslist.org/reb/d/example/1234567890.html' }] }, now)[0].platform, 'craigslist');
assert.throws(() => finds.update(updated, 'fixture-1', { verified: true }, context), /find_update_invalid/);
assert.throws(() => finds.update(updated, 'missing', { status: 'new' }, context), /find_not_found/);
assert.deepStrictEqual(finds.listFinds(updated, { now }).counts, { total: 1, new_today: 1, messaged_this_week: 1 });
const html = ui.card({ ...finds.listFinds(updated, { now }).items[0], name: '<script>bad()</script>' });
assert.ok(!html.includes('<script>bad()'));
assert.ok(html.includes('&lt;script&gt;bad()'));
assert.ok(html.includes('published by them') && html.includes('not verified'));
assert.ok(ui.markup({ items: [], counts: { total: 0 } }).includes('No buyers found yet'));
assert.ok(ui.card(finds.listFinds(result.store, { now }).items[0]).includes('Pending approval'));
assert.ok(ui.card(finds.listFinds(updated, { now }).items[0]).includes('Leads that fit this buy box:'));
let unexpected = 0;
const savedFetch = global.fetch;
const savedNow = Date.now;
const savedWrite = fs.writeFileSync;
const denySideEffect = () => { unexpected++; throw new Error('Pure module attempted side effect'); };
try {
  global.fetch = denySideEffect; Date.now = denySideEffect; fs.writeFileSync = denySideEffect;
  finds.validateItems({ items: [item] }, now);
  finds.listFinds(updated, { now });
  finds.ingest(updated, valid, context);
  finds.update(updated, 'fixture-1', { approval: 'rejected' }, context);
  fits.fitSummary(updated.buyers[1], [lead]);
} finally { global.fetch = savedFetch; Date.now = savedNow; fs.writeFileSync = savedWrite; }
assert.strictEqual(unexpected, 0);
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.ok(serverSource.includes("method: 'POST', path: '/assistant/finds'"));
assert.ok(!/method: 'GET', path: '\/assistant\/finds'/.test(serverSource));

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-buyer-finds-test-'));
  process.env.DB_PATH = path.join(temporary, 'db.json');
  const database = require('../db');
  const fixtureStore = { leads: [lead], buyers: [original.buyers[0], updated.buyers[1],
    { ...result.store.buyers[1], id: 'pending' }, { ...rejected.buyers[1], id: 'rejected' }] };
  fs.writeFileSync(process.env.DB_PATH, JSON.stringify(fixtureStore));
  const storedBefore = fs.readFileSync(process.env.DB_PATH, 'utf8');
  assert.deepStrictEqual(database.getBuyers().map((buyer) => buyer.id), ['keep-buyer', 'fixture-1']);
  assert.deepStrictEqual(database.matchBuyersToLead(lead).map((buyer) => buyer.id), ['fixture-1']);
  assert.throws(() => database.addBuyer({ assistant_find: { approval: 'approved' } }), /buyer_find_requires_dropbox/);
  assert.strictEqual(require('../modules/buybox').extractFromBuyers(), 0);
  assert.strictEqual(fs.readFileSync(process.env.DB_PATH, 'utf8'), storedBefore);
  fs.writeFileSync(process.env.DB_PATH, '{bad');
  assert.throws(() => database.readDBStrict(), /database_unavailable/);
  assert.strictEqual(fs.readFileSync(process.env.DB_PATH, 'utf8'), '{bad');
  const pairingOptions = { state_path: path.join(temporary, 'pairing.json'), secret: crypto.randomBytes(48).toString('base64url'), now: Date.parse(now) };
  const createToken = () => pairing.exchangePairing(pairing.createPairing({ id: 'admin-fixture', role: 'admin' }, pairingOptions).pairing_token, pairingOptions).agent_token;
  const token = createToken();
  let store = JSON.parse(before);
  let writes = 0;
  const app = express();
  app.use(express.json());
  const admin = (req, res, next) => {
    if (req.headers['x-test-session'] !== 'fixture') return res.status(401).json({ code: 'session_required' });
    req.currentUser = { id: 'admin-fixture' }; next();
  };
  registerAssistantFindRoutes(app, {
    db: { readDBStrict: () => store, writeDB: (value) => { store = value; writes++; } },
    requireAdmin: admin, pairingOptions, now: () => now
  });
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(method, route, body, bearer = '', session = false) {
    const response = await fetch(base + route, { method, headers: {
      'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(session ? { 'x-test-session': 'fixture' } : {})
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  const logs = [];
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  for (const level of Object.keys(originalConsole)) console[level] = (...values) => logs.push(values.map(String).join(' '));
  try {
    const malformed = await fetch(base + '/api/assistant/finds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"private_contact":' });
    assert.strictEqual(malformed.status, 400);
    assert.deepStrictEqual(await malformed.json(), { code: 'find_request_invalid' });
    assert.strictEqual((await request('POST', '/api/assistant/finds', { items: [item] })).status, 401);
    assert.strictEqual((await request('POST', '/api/assistant/finds', { items: [item] }, 'wrong')).status, 401);
    assert.strictEqual(writes, 0);
    const created = await request('POST', '/api/assistant/finds', { items: [item] }, token);
    assert.strictEqual(created.status, 200);
    assert.deepStrictEqual(Object.keys(created.body), ['results']);
    assert.deepStrictEqual(Object.keys(created.body.results[0]), ['id', 'result']);
    const id = created.body.results[0].id;
    assert.strictEqual((await request('GET', '/api/assistant/finds', null, token)).status, 405);
    assert.strictEqual((await request('GET', '/api/dashboard/buyers-found', null, token)).status, 401);
    assert.strictEqual((await request('PATCH', '/api/dashboard/buyers-found/' + id, { status: 'messaged' }, token)).status, 401);
    assert.strictEqual((await request('PATCH', '/api/dashboard/buyers-found/' + id, { status: 'messaged' }, '', true)).status, 409);
    assert.strictEqual((await request('PATCH', '/api/dashboard/buyers-found/' + id, { approval: 'approved' }, token)).status, 401);
    assert.strictEqual((await request('PATCH', '/api/dashboard/buyers-found/' + id, { approval: 'approved', reason: 'Source reviewed' }, '', true)).status, 200);
    assert.strictEqual((await request('PATCH', '/api/dashboard/buyers-found/' + id, { status: 'messaged' }, '', true)).status, 200);
    assert.strictEqual((await request('POST', '/api/assistant/finds', { items: [item] }, token)).body.results[0].result, 'duplicate');
    const read = await request('GET', '/api/dashboard/buyers-found', null, '', true);
    assert.strictEqual(read.body.items[0].status, 'messaged');
    const invalid = await request('POST', '/api/assistant/finds', { items: [{ ...item, profile_url: 'https://secret.example.test/private' }] }, token);
    assert.strictEqual(invalid.status, 400);
    assert.ok(!JSON.stringify(invalid.body).includes('secret'));
    const limitedToken = createToken();
    for (let index = 0; index < REQUESTS_PER_HOUR; index++) assert.strictEqual((await request('POST', '/api/assistant/finds', { items: [item] }, limitedToken)).status, 200);
    assert.strictEqual((await request('POST', '/api/assistant/finds', { items: [item] }, limitedToken)).status, 429);
    assert.strictEqual(store.buyers.length, 2);
    assert.deepStrictEqual(store.leads, original.leads);
    assert.deepStrictEqual(logs, [], 'dropbox, parser and validation must not log personal input');
  } finally {
    Object.assign(console, originalConsole);
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  console.log('assistant buyer finds: validation, token auth, write-only dropbox, caps, dedupe, operator history and privacy passed');
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
