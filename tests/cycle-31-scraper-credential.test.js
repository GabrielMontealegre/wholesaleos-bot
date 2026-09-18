'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const scraper = require('../modules/research/scraper-api-client');

function sourceFiles(folder) {
  const files = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.cache', '.tmp'].includes(entry.name)) continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(?:js|json|md|html|cmd|csv|txt|yml|yaml)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

(async () => {
  let calls = 0;
  const disabled = await scraper.scraperFetch('https://example.invalid/', {
    env: {},
    axios_impl: { async get() { calls += 1; throw new Error('network_not_allowed'); } }
  });
  assert.deepStrictEqual(disabled, { ok: false, data: '', reason_code: 'SCRAPING_DISABLED_NO_CREDENTIAL' });
  assert.strictEqual(calls, 0, 'missing credentials make zero provider requests');

  const runtimeCredential = require('crypto').randomBytes(24).toString('hex');
  let endpoint = '';
  const enabled = await scraper.scraperFetch('https://example.invalid/path', {
    env: { SCRAPERAPI_KEY: runtimeCredential },
    axios_impl: { async get(url) { calls += 1; endpoint = url; return { data: 'ok' }; } }
  });
  assert.strictEqual(enabled.ok, true);
  assert.ok(endpoint.startsWith('https://api.scraperapi.com?'));

  const root = path.resolve(__dirname, '..');
  let credentialLikeMatches = 0;
  for (const file of sourceFiles(root)) {
    let source;
    try { source = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    if (!/scraperapi|SCRAPERAPI_KEY/i.test(source)) continue;
    if (/SCRAPERAPI_KEY\s*\|\|\s*['"][0-9a-f]{32}['"]/i.test(source) || /api_key=['"][0-9a-f]{32}/i.test(source)) credentialLikeMatches += 1;
  }
  assert.strictEqual(credentialLikeMatches, 0, 'no tracked ScraperAPI source contains a literal fallback credential');

  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.ok(serverSource.includes('if (!scraped.ok)'), 'legacy callers handle the explicit disabled result without throwing');
  console.log('cycle-31-scraper-credential: ok');
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
