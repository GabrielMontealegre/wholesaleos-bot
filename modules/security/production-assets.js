'use strict';
const fs = require('node:fs');
const path = require('node:path');
const approved = require('./production-dashboard-assets.json');
const { hasExplicitTestData } = require('./production-data-boundary');

function checkProductionAssets(root = path.resolve(__dirname, '../../dashboard'), inventory = approved) {
  const fail = () => { throw Error('production_asset_inventory_invalid'); };
  if (!Array.isArray(inventory) || new Set(inventory).size !== inventory.length) fail();
  const expected = new Set(inventory);
  for (const name of expected) {
    if (typeof name !== 'string' || !name || name.split('/').some(part => !part || part === '.' || part === '..') || /[\\\x00-\x1f]/.test(name) || path.isAbsolute(name)) fail();
  }
  const actual = [];
  function walk(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      // No link may turn the public root into a route to test/private artifacts.
      if (entry.isSymbolicLink()) fail();
      const name = prefix + entry.name, file = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(file, name + '/'); continue; }
      if (!entry.isFile() || !expected.has(name)) fail();
      const source = fs.readFileSync(file, 'utf8');
      if (source.startsWith('/* wos-test-only */') || source.startsWith('<!-- wos-test-only -->')) fail();
      if (name.endsWith('.json') && hasExplicitTestData(JSON.parse(source))) fail();
      actual.push(name);
    }
  }
  walk(root, '');
  if (actual.length !== expected.size) fail();
  return { approved_assets: actual.length };
}
module.exports = { checkProductionAssets };
