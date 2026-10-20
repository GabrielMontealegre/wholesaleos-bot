'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const componentsPath = path.join(__dirname, '../dashboard/workspace/components.js');
const text = fs.readFileSync(componentsPath, 'utf8');
let effects = 0;
const denied = () => { effects++; throw new Error('Unexpected side effect'); };
const context = { module: { exports: {} }, fetch: denied, Date: denied, require: denied,
  setTimeout: denied, localStorage: { setItem: denied }, window: undefined };
vm.runInNewContext(text, context);
const c = context.module.exports;

assert.equal(c.escape('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
for (const render of [() => c.card({ title: '<img onerror=attack()>', detail: '<script>attack()</script>' }),
  () => c.listRow({ key: '" onclick="attack()', title: '<svg onload=attack()>' }),
  () => c.badge('<script>'), () => c.empty('<script>', '<img>'), () => c.skeleton('<script>'),
  () => c.button({ label: '" onclick="attack()', help: '<script>' }),
  () => c.tabs('work', [{ key: 'first', label: '<script>' }], 'first')]) {
  const html = render();
  assert(!html.includes('<script>'));
  assert(!html.includes('<img onerror='));
  assert(!html.includes(' onclick="attack()'));
}
assert.throws(() => c.button({ icon: 'x' }), /label/);
assert.throws(() => c.icon('../x'), /Unknown icon/);
assert.throws(() => c.drawer('"bad', 'Title'), /Invalid component id/);
assert.throws(() => c.tabs('work', [{ key: 'a', label: 'A' }], 'missing'), /selected/);
assert.throws(() => c.tabs('work', [{ key: 'a' }, { key: 'a' }], 'a'), /Duplicate/);
assert(c.composer('message').includes(' disabled'));
assert(!c.composer('message').includes('type="submit"'));
assert(c.drawer('detail', 'Record').includes('Close Record'));
assert(!c.badge('Missing', 'forged" onclick="attack()').includes('forged'));
assert.equal(effects, 0, 'Rendering must not use network, clock, storage or imports');

const vendor = path.join(__dirname, '../dashboard/workspace/vendor/lucide-1.60.0');
for (const file of fs.readdirSync(vendor).filter(name => name.endsWith('.svg'))) {
  const svg = fs.readFileSync(path.join(vendor, file), 'utf8');
  assert(!/<script|<foreignObject|on\w+=|(?:href|src)=["'](?:https?:|data:|javascript:)/i.test(svg), file);
}
assert(fs.readFileSync(path.join(vendor, 'LICENSE'), 'utf8').includes('ISC License'));
console.log('workspace-components: escaped markup, invalid inputs, proposal-only composer, purity and local icon safety passed');
