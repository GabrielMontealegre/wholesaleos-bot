'use strict';
const assert = require('assert'); const fs = require('fs'); const vm = require('vm');
const glossary = require('../dashboard/glossary.json');
for (const term of ['JV', 'ARV', 'MAO', 'Comps', 'Verified', 'Preliminary', 'Texas list-price', 'Assignment', 'Double close', 'EMD', 'Subject-to', 'Seller financing', 'Novation', 'Section 8 rent', 'Lane', 'Verdict', 'JV status', 'Approval', 'Buy box', 'Spread', 'Title company', 'Flood zone X', 'After the sale']) assert.ok(glossary[term]);
const ui = fs.readFileSync('dashboard/wos-todays-deals.js', 'utf8'); const terms = [...ui.matchAll(/tip\('([^']+)'\)/g)].map(m => m[1]); assert.ok(terms.every(k => glossary[k]));
assert.ok(fs.readFileSync('dashboard/index.html', 'utf8').includes('todays_deals: function() { return window.renderTodaysDeals(); }'));
const doc = { addEventListener() {}, getElementById() { return { querySelectorAll() { return []; } }; }, head: { appendChild() {} }, createElement() { return {}; } };
(async () => {
  const window = {}; const context = { window, document: doc, MutationObserver: class { observe() {} }, fetch: async () => ({ ok: true, json: async () => glossary }) };
  vm.runInNewContext(fs.readFileSync('dashboard/wos-help.js', 'utf8'), context); await new Promise(r => setImmediate(r));
  const markup = window.wosHelp('ARV'); assert.ok(markup.includes('aria-describedby=') && markup.includes('role="tooltip"')); assert.strictEqual(window.wosHelp('made-up'), '');
  assert.ok(window.renderGlossary().includes('After-repair value'));
  console.log('Shared glossary terms, tooltip IDs and glossary page passed; browser proof checks keyboard/tap behavior.');
})().catch(e => { console.error(e); process.exitCode = 1; });
