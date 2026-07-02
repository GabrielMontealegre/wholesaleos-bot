#!/usr/bin/env node
'use strict';

// Local Deal Board Export V1.
// Runs the Free Public Deal Board preview on Gabriel's machine (where the
// official DCAD browser lookup works) and writes a call/action sheet as
// JSON + CSV + Markdown into the git-ignored exports/ directory.
//
// Preview-only: no DB writes, no saved leads, no production calls.
//
// Usage:
//   node scripts/export-free-public-deal-board.js
//   node scripts/export-free-public-deal-board.js --city Dallas --county Dallas --state TX --limit 25
//   node scripts/export-free-public-deal-board.js --no-lookup   (skip the Playwright official lookup)
//   node scripts/export-free-public-deal-board.js --out-dir C:\some\dir

const fs = require('fs');
const path = require('path');

const dealBoard = require('../modules/research/free-public-deal-board');

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function parseExportArgs(argv) {
  const input = {
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    limit: 25,
    enable_free_public_hunters: true,
    enable_official_browser_lookup: true
  };
  const options = { out_dir: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--city') { input.market.city = cleanText(next); i += 1; }
    else if (arg === '--county') { input.market.county = cleanText(next); i += 1; }
    else if (arg === '--state') { input.market.state = cleanText(next).toUpperCase(); i += 1; }
    else if (arg === '--limit') { input.limit = Math.max(1, Math.min(Number(next) || 25, 100)); i += 1; }
    else if (arg === '--out-dir') { options.out_dir = cleanText(next); i += 1; }
    else if (arg === '--no-lookup') input.enable_official_browser_lookup = false;
    else if (arg === '--no-hunters') input.enable_free_public_hunters = false;
  }
  return { input, options };
}

function bestContact(deal) {
  const route = (Array.isArray(deal.free_contact_routes) ? deal.free_contact_routes : [])
    .find((item) => item && cleanText(item.value));
  if (route) return `${cleanText(route.value)} (${cleanText(route.route_type)})`;
  return cleanText(deal.contact_route_if_visible);
}

function appraisedValue(deal) {
  const clue = (Array.isArray(deal.appraisal_clues) ? deal.appraisal_clues : [])[0];
  return clue ? `${cleanText(clue.value)} (appraisal clue only - not ARV)` : '';
}

function buildExportRows(result) {
  const deals = Array.isArray(result && result.free_public_deals) ? result.free_public_deals : [];
  const byAddress = new Map();
  const rows = [];
  for (const deal of deals) {
    const addressKey = cleanText(deal.normalized_address).toLowerCase();
    if (addressKey) {
      const existing = byAddress.get(addressKey);
      if (existing) {
        // Prefer the duplicate that carries the source document link.
        if (!cleanText(existing.source_document_url) && cleanText(deal.source_document_url)) {
          rows[rows.indexOf(existing)] = deal;
          byAddress.set(addressKey, deal);
        }
        continue;
      }
      byAddress.set(addressKey, deal);
    }
    rows.push(deal);
  }
  return rows.map((deal) => ({
    headline: cleanText(deal.headline),
    address: cleanText(deal.normalized_address),
    city: cleanText(deal.city),
    state: cleanText(deal.state),
    quality_bucket: cleanText(deal.quality_bucket),
    owner_record: deal.owner_record && cleanText(deal.owner_record.owner_name)
      ? `${cleanText(deal.owner_record.owner_name)}${deal.owner_record.is_entity ? ' [entity]' : ''}`
      : cleanText(((deal.owner_or_entity_clues || [])[0] || {}).value),
    official_lookup_status: cleanText(deal.official_lookup_status),
    source_document_url: cleanText(deal.source_document_url),
    best_link_to_click_first: cleanText(deal.best_link_to_click_first),
    maps_url: cleanText(deal.maps_url),
    zillow_url: cleanText(deal.zillow_url),
    contact_status: cleanText(deal.free_contact_status || (deal.call_prep && deal.call_prep.contact_status)),
    best_contact: bestContact(deal),
    appraised_value: appraisedValue(deal),
    arv_lock: cleanText(deal.call_prep && deal.call_prep.ARV_lock_state || deal.ARV_lock_state),
    mao_lock: cleanText(deal.MAO_lock_state || (deal.call_prep && deal.call_prep.MAO_lock_state)),
    next_action: cleanText(deal.next_best_action),
    missing_fields: (Array.isArray(deal.missing_fields) ? deal.missing_fields : []).join('; '),
    seller_questions: (deal.call_prep && Array.isArray(deal.call_prep.seller_questions) ? deal.call_prep.seller_questions : []).join(' | '),
    blocked_sources: [].concat(deal.blocked_sources || [], deal.browser_blocked_sources || [])
      .map((item) => `${cleanText(item && item.source)}: ${cleanText(item && item.reason)}`)
      .join('; ')
  }));
}

const CSV_COLUMNS = [
  'headline', 'address', 'city', 'state', 'quality_bucket', 'owner_record',
  'official_lookup_status', 'source_document_url', 'best_link_to_click_first',
  'maps_url', 'zillow_url', 'contact_status', 'best_contact', 'appraised_value',
  'arv_lock', 'mao_lock', 'next_action', 'missing_fields', 'seller_questions', 'blocked_sources'
];

function csvEscape(value) {
  const text = String(value == null ? '' : value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvEscape(row[column])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function markdownLink(label, url) {
  return cleanText(url) ? `[${label}](${cleanText(url)})` : '';
}

function toMarkdown(result, rows, generatedAt) {
  const market = result && result.market || {};
  const lines = [];
  lines.push(`# Free Public Deal Board Call Sheet - ${cleanText(market.city) || 'Market'}, ${cleanText(market.state) || ''}`);
  lines.push('');
  lines.push(`Generated ${generatedAt} - preview only, no data saved. All values come from public sources with links below; nothing is estimated or invented.`);
  lines.push('');
  const addressRows = rows.filter((row) => row.address);
  const proofRows = rows.filter((row) => !row.address);
  lines.push(`**${addressRows.length} property rows** with addresses, **${proofRows.length} source-proof rows** without addresses yet.`);
  lines.push('');
  addressRows.forEach((row, index) => {
    lines.push(`## ${index + 1}. ${row.address}`);
    lines.push('');
    if (row.owner_record) lines.push(`- **Owner clue:** ${row.owner_record}`);
    if (row.official_lookup_status) lines.push(`- **Official lookup:** ${row.official_lookup_status}`);
    const links = [
      markdownLink('Notice PDF', row.source_document_url),
      markdownLink('Maps', row.maps_url),
      markdownLink('Zillow', row.zillow_url),
      markdownLink('Best first click', row.best_link_to_click_first)
    ].filter(Boolean);
    if (links.length) lines.push(`- **Links:** ${links.join(' | ')}`);
    lines.push(`- **Contact:** ${row.contact_status || 'unknown'}${row.best_contact ? ` - ${row.best_contact}` : ''}`);
    if (row.appraised_value) lines.push(`- **County appraisal clue:** ${row.appraised_value}`);
    lines.push(`- **Locks:** ARV ${row.arv_lock || 'unknown'} / MAO ${row.mao_lock || 'unknown'}`);
    lines.push(`- **Next action:** ${row.next_action || 'review'}`);
    if (row.missing_fields) lines.push(`- **Missing:** ${row.missing_fields}`);
    if (row.blocked_sources) lines.push(`- **Blocked sources:** ${row.blocked_sources}`);
    if (row.seller_questions) {
      lines.push('- **Seller questions:**');
      for (const question of row.seller_questions.split(' | ')) lines.push(`  - ${question}`);
    }
    lines.push('');
  });
  if (proofRows.length) {
    lines.push('## Source-proof rows (no address yet)');
    lines.push('');
    for (const row of proofRows.slice(0, 12)) {
      lines.push(`- ${row.headline || 'Source proof'} - ${markdownLink('open source', row.best_link_to_click_first) || 'no link'} (${row.next_action || 'verify'})`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function timestampSlug(date) {
  return (date || new Date()).toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function runExport(input, options = {}) {
  const boardImpl = typeof options.board_impl === 'function' ? options.board_impl : dealBoard.runFreePublicDealBoardPreview;
  const result = await boardImpl(input, {
    env: options.env || process.env,
    fetch_impl: options.fetch_impl || (typeof fetch === 'function' ? fetch : null),
    enable_provider_search: true
  });
  const rows = buildExportRows(result);
  const generatedAt = new Date().toISOString();
  const outDir = cleanText(options.out_dir) || path.join(__dirname, '..', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const marketSlug = cleanText(input.market && input.market.city).toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'market';
  const base = `${marketSlug}-deal-board-${timestampSlug()}`;
  const paths = {
    json: path.join(outDir, `${base}.json`),
    csv: path.join(outDir, `${base}.csv`),
    markdown: path.join(outDir, `${base}.md`)
  };
  fs.writeFileSync(paths.json, JSON.stringify({ generated_at: generatedAt, preview_only: true, market: input.market, rows, full_result: result }, null, 2));
  fs.writeFileSync(paths.csv, toCsv(rows));
  fs.writeFileSync(paths.markdown, toMarkdown(result, rows, generatedAt));
  return {
    paths,
    rows,
    summary: {
      total_rows: rows.length,
      address_rows: rows.filter((row) => row.address).length,
      call_ready: rows.filter((row) => row.contact_status === 'CALL_READY').length,
      owner_records: rows.filter((row) => row.owner_record).length,
      official_lookup_blocked: rows.filter((row) => row.official_lookup_status === 'OFFICIAL_LOOKUP_BLOCKED').length,
      browser_runtime_available: !!(result && result.browser_runtime_available)
    }
  };
}

async function main() {
  const { input, options } = parseExportArgs(process.argv.slice(2));
  process.stdout.write(`Running local deal board export for ${input.market.city}, ${input.market.state} (official lookup: ${input.enable_official_browser_lookup ? 'on' : 'off'})...\n`);
  const out = await runExport(input, options);
  process.stdout.write(`\nSummary: ${JSON.stringify(out.summary, null, 2)}\n`);
  process.stdout.write('\nFiles written:\n');
  process.stdout.write(`  JSON:     ${out.paths.json}\n`);
  process.stdout.write(`  CSV:      ${out.paths.csv}\n`);
  process.stdout.write(`  Markdown: ${out.paths.markdown}\n`);
  process.stdout.write('\nOpen the Markdown file for the call sheet. Nothing was saved to the database.\n');
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack || error}\n`);
    process.exit(1);
  });
}

module.exports = {
  parseExportArgs,
  buildExportRows,
  csvEscape,
  toCsv,
  toMarkdown,
  runExport,
  CSV_COLUMNS
};
