'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { checkProductionAssets } = require('../modules/security/production-assets');
assert(checkProductionAssets().approved_assets > 0);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-public-inventory-'));
try {
  fs.writeFileSync(path.join(root, 'ask-demo.js'), '/* Recorded-data UI; not test data. */');
  const inventory = ['ask-demo.js'];
  assert.deepEqual(checkProductionAssets(root, inventory), { approved_assets: 1 });
  fs.writeFileSync(path.join(root, 'unreviewed.js'), '/* wos-test-only */');
  assert.throws(() => checkProductionAssets(root, inventory), /production_asset_inventory_invalid/);
  assert.throws(() => checkProductionAssets(root, [...inventory, 'unreviewed.js']), /production_asset_inventory_invalid/);
  fs.unlinkSync(path.join(root, 'unreviewed.js'));
  for (const flag of ['test_data', 'synthetic', 'fixture']) {
    fs.writeFileSync(path.join(root, 'records.json'), JSON.stringify({ rows: [{ [flag]: true }] }));
    assert.throws(() => checkProductionAssets(root, [...inventory, 'records.json']), /production_asset_inventory_invalid/);
  }
  fs.writeFileSync(path.join(root, 'records.json'), '{"name":"Synthetic Materials","fixture":"true"}');
  assert.equal(checkProductionAssets(root, [...inventory, 'records.json']).approved_assets, 2);
  assert.throws(() => checkProductionAssets(root, [...inventory, 'records.json', '../private']), /production_asset_inventory_invalid/);
  assert.throws(() => checkProductionAssets(root, [...inventory, ...inventory]), /production_asset_inventory_invalid/);
  assert.throws(() => checkProductionAssets(root, [...inventory, 'missing.js']), /production_asset_inventory_invalid/);
  // Renaming a fixture does not approve it for serving.
  fs.writeFileSync(path.join(root, 'innocent.js'), 'const rows = [];');
  assert.throws(() => checkProductionAssets(root, [...inventory, 'records.json']), /production_asset_inventory_invalid/);
} finally {
  assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'wos-public-inventory-'));
  fs.rmSync(root, { recursive: true, force: true });
}
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert(server.indexOf('checkProductionAssets()') < server.indexOf('express.static('));
assert(fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8').includes('RUN node scripts/check-production-assets.js'));
assert(fs.readFileSync(path.join(__dirname, '../.dockerignore'), 'utf8').split(/\r?\n/).includes('tests'));
console.log('production-assets: PASS');
