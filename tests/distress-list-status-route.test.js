'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { installRefuseLiveNetwork } = require('./helpers/refuse-live-network');
const network = installRefuseLiveNetwork();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-distress-counts-'));
const previousDbPath = process.env.DB_PATH;
process.env.DB_PATH = path.join(temp, 'db.json');
const load = Module._load;
Module._load = function(request, parent, isMain) { return request === 'dotenv' ? { config: () => ({ parsed: {} }) } : load.call(this, request, parent, isMain); };
const { listDistressSourceOutcomes } = require('../modules/research/findme-scout-jobs');
Module._load = load;
const { registerDistressListStatusRoutes } = require('../modules/sources/distress-list-status-routes');

try {
  const store = path.join(temp, 'jobs.json');
  const marker = 'Synthetic private snapshot';
  fs.writeFileSync(store, JSON.stringify({ jobs: [{ job_id: 'synthetic-job', updated_at: '2026-11-17T12:00:00Z',
    cards: [{ owner: marker }], source_summary: { acquisition_core_adapter_results: [{
      source_id: 'tn_shelby_tax_sale_scgpublic_s3_amazonaws_com', status: 'available', message: marker,
      distress_summary: { source_id: 'tn_shelby_tax_sale_scgpublic_s3_amazonaws_com', source_kind: 'tax_sale', rows_found: 2, new_leads: 2, updated_leads: 0 }
    }] } }] }));
  const badJson = path.join(temp, 'bad.json'), badShape = path.join(temp, 'shape.json');
  fs.writeFileSync(badJson, '{'); fs.writeFileSync(badShape, '{"jobs":null}');
  const writes = ['writeFileSync', 'mkdirSync', 'renameSync', 'appendFileSync'];
  const originals = Object.fromEntries(writes.map(key => [key, fs[key]]));
  let snapshots;
  try {
    for (const key of writes) fs[key] = () => { throw Error('Read-only status must not write or create directories'); };
    snapshots = listDistressSourceOutcomes({ storePath: store });
    assert.equal(snapshots[0].rows_found, 2);
    assert(!JSON.stringify(snapshots).includes(marker));
    assert.deepEqual(listDistressSourceOutcomes({ storePath: path.join(temp, 'missing-parent', 'jobs.json') }), []);
    assert.throws(() => listDistressSourceOutcomes({ storePath: badJson }));
    assert.throws(() => listDistressSourceOutcomes({ storePath: badShape }));
  } finally { for (const key of writes) fs[key] = originals[key]; }
  assert(!fs.existsSync(path.join(temp, 'missing-parent')));

  let route, reads = 0;
  const app = { get: (url, ...handlers) => { assert.equal(url, '/api/dashboard/public-distress-sources'); route = handlers; } };
  const requireAdmin = (req, res, next) => !req.role ? res.status(401).json({ ok: false }) : req.role !== 'admin' ? res.status(403).json({ ok: false }) : next();
  registerDistressListStatusRoutes(app, { requireAdmin, listOutcomes: () => { reads++; return snapshots; } });
  function request(role) {
    const res = { code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    let index = 0;
    const next = () => route[index++]({ role, query: { refresh: 'true' } }, res, next);
    next(); return res;
  }
  assert.equal(request().code, 401); assert.equal(request('agent').code, 403); assert.equal(reads, 0);
  const success = request('admin');
  assert.equal(reads, 1); assert.equal(success.code, 200); assert.equal(success.headers['Cache-Control'], 'no-store');
  assert.equal(success.body.collection_enabled, false); assert.equal(success.body.should_ingest, false);
  assert(!JSON.stringify(success.body).includes(marker));
  registerDistressListStatusRoutes(app, { requireAdmin, listOutcomes: () => { throw Error(marker); } });
  const failed = request('admin');
  assert.equal(failed.code, 503); assert.deepEqual(failed.body, { ok: false, error: 'public_distress_status_unavailable' });
  assert.throws(() => registerDistressListStatusRoutes(app, {}), /dependencies_required/);
  assert.deepEqual(network.attempts, []);
  console.log('distress status: strict saved-store read/no mkdir/write, malformed store fails closed, admin/no-store/read-only route and generic errors PASS');
} finally {
  Module._load = load;
  if (previousDbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = previousDbPath;
  network.restore();
  assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
  assert(path.basename(temp).startsWith('wos-distress-counts-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
