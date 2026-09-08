'use strict';

// Local measurement only: the URL allowlist comes exclusively from the frozen ledger.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'exports/cycle-18-baseline');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const ledgerPath = path.join(root, 'data/deal-board-doc-ledger-dallas-dallas-tx.json');
const manifestPath = path.join(out, 'manifest.json');
const countyByHost = {
  'rockwallcountytexas.com': 'Rockwall', 'apps.huntcounty.net': 'Hunt',
  'co.ellis.tx.us': 'Ellis', 'navarro.easydocs.us': 'Navarro',
  'tarrantcountytx.gov': 'Tarrant', 'parkercountytx.gov': 'Parker',
  'vanzandtcounty.org': 'Van Zandt', 'kaufmancounty.net': 'Kaufman'
};
const hostKey = (url) => new URL(url).hostname.replace(/^www\./, '');
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

async function freeze() {
  fs.mkdirSync(path.join(out, 'bodies'), { recursive: true });
  let manifest;
  if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath));
  else {
    const ledgerBody = fs.readFileSync(ledgerPath);
    const ledger = JSON.parse(ledgerBody);
    fs.writeFileSync(path.join(out, 'ledger-input.json'), ledgerBody);
    const historicalName = 'dallas-deal-board-2026-07-02T15-42-00.json';
    const historical = fs.readFileSync(path.join(root, 'exports', historicalName));
    fs.writeFileSync(path.join(out, historicalName), historical);
    manifest = {
      kind: 'FROZEN_LOCAL_CORPUS_NOT_LIVE_INVENTORY', started_at: new Date().toISOString(),
      ledger_updated_at: ledger.updated_at, ledger_sha256: hash(ledgerBody),
      historical_reference: { file: historicalName, date: '2026-07-02', sha256: hash(historical), scope: 'HISTORICAL_REFERENCE_ONLY' },
      live_inventory: { status: 'UNREACHABLE', reason: 'No local snapshot; production access prohibited by Cycle 18 authorization.' },
      documents: Object.entries(ledger.documents).map(([key, entry]) => ({
        ledger_key: key, url: entry.document_url, county: countyByHost[hostKey(entry.document_url)] || 'UNKNOWN',
        market: 'Dallas', state: 'TX', ledger_status: entry.last_status,
        ledger_attempted_at: entry.last_attempt_at, posting_month: entry.posting_month,
        url_sha256: hash(entry.document_url)
      }))
    };
    save(manifestPath, manifest);
  }
  if (manifest.frozen_at) { console.log('Corpus already frozen; no requests made.'); return; }
  const allowedHosts = new Set(manifest.documents.map((doc) => hostKey(doc.url)));
  const accessFailures = new Map();
  for (const doc of manifest.documents) {
    if ([403, 429].includes(doc.http_status)) accessFailures.set(hostKey(doc.url), (accessFailures.get(hostKey(doc.url)) || 0) + 1);
  }
  for (const [i, doc] of manifest.documents.entries()) {
    if (doc.fetch_status) continue;
    const host = hostKey(doc.url);
    doc.captured_at = new Date().toISOString();
    if ((accessFailures.get(host) || 0) >= 2) {
      doc.fetch_status = 'UNREACHABLE'; doc.reason = 'host_stopped_after_repeated_403_or_429';
      save(manifestPath, manifest); continue;
    }
    try {
      let url = doc.url;
      let response;
      const signal = AbortSignal.timeout(20000);
      for (let redirects = 0; redirects <= 4; redirects++) {
        if (!allowedHosts.has(hostKey(url))) throw new Error('redirect_outside_frozen_ledger_hosts');
        response = await fetch(url, { redirect: 'manual', signal,
          headers: { 'User-Agent': 'WholesaleOS/1.0 public-document evidence review', Accept: 'application/pdf,text/html;q=0.8' } });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirects === 4) throw new Error('redirect_limit_or_missing_location');
        url = new URL(location, url).href;
      }
      doc.final_url = url; doc.http_status = response.status;
      doc.content_type = response.headers.get('content-type');
      if ([403, 429].includes(response.status)) accessFailures.set(host, (accessFailures.get(host) || 0) + 1);
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) throw new Error('document_over_16mb_local_capture_cap');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      doc.bytes = bytes; doc.content_sha256 = hash(body);
      const pdf = body.subarray(0, 1024).includes(Buffer.from('%PDF-'));
      doc.body_file = `bodies/${doc.url_sha256}-${doc.content_sha256}.${pdf ? 'pdf' : 'body'}`;
      fs.writeFileSync(path.join(out, doc.body_file), body);
      doc.fetch_status = response.ok && pdf ? 'PDF_CAPTURED' : 'UNREACHABLE';
      doc.reason = response.ok ? (pdf ? null : 'response_is_not_pdf') : `http_${response.status}`;
    } catch (error) {
      doc.fetch_status = 'UNREACHABLE';
      doc.reason = String(error.cause?.code || error.message || error).slice(0, 180);
    }
    save(manifestPath, manifest);
    console.log(`${i + 1}/${manifest.documents.length} ${doc.county} ${doc.fetch_status} ${doc.reason || doc.bytes}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  manifest.frozen_at = new Date().toISOString();
  save(manifestPath, manifest);
  console.log(JSON.stringify({ frozen_at: manifest.frozen_at, counts: manifest.documents.reduce((a, d) => { a[d.fetch_status] = (a[d.fetch_status] || 0) + 1; return a; }, {}) }));
}

async function captureEmbedded() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  const file = path.join(out, 'embedded-manifest.json');
  const entries = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
  for (const doc of manifest.documents) {
    if (doc.reason !== 'response_is_not_pdf' || !doc.body_file || entries.some((item) => item.parent_url === doc.url)) continue;
    const $ = require('cheerio').load(fs.readFileSync(path.join(out, doc.body_file), 'utf8'));
    const hrefs = $('object[data],embed[src],iframe[src]').map((i, el) => $(el).attr('data') || $(el).attr('src')).get();
    const urls = [...new Set(hrefs.map((href) => new URL(href, doc.url).href))].filter((url) => new URL(url).origin === new URL(doc.url).origin && /\.pdf$/i.test(new URL(url).pathname));
    if (urls.length !== 1) continue;
    const item = { parent_url: doc.url, url: urls[0], captured_at: new Date().toISOString() };
    try {
      const response = await fetch(item.url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'WholesaleOS/1.0 public-document evidence review' } });
      item.http_status = response.status;
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 16 * 1024 * 1024) throw new Error('document_over_16mb_local_capture_cap'); chunks.push(chunk); }
      const body = Buffer.concat(chunks);
      item.content_sha256 = hash(body); item.bytes = bytes;
      item.body_file = `bodies/${hash(item.url)}-${item.content_sha256}.pdf`;
      fs.writeFileSync(path.join(out, item.body_file), body);
      item.fetch_status = response.ok && body.subarray(0, 1024).includes(Buffer.from('%PDF-')) ? 'PDF_CAPTURED' : 'UNREACHABLE';
      item.reason = item.fetch_status === 'PDF_CAPTURED' ? null : `http_${response.status}_or_not_pdf`;
    } catch (error) { item.fetch_status = 'UNREACHABLE'; item.reason = String(error.cause?.code || error.message); }
    entries.push(item); save(file, entries);
    console.log(`embedded ${entries.length} ${item.fetch_status} ${item.reason || item.bytes}`);
    if ([403, 429].includes(item.http_status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

if (require.main === module) (process.argv.includes('--embedded') ? captureEmbedded() : freeze()).catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { hash, hostKey };
