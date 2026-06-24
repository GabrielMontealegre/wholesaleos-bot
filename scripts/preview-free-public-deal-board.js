#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const dealBoard = require('../modules/research/free-public-deal-board');

function cleanText(value) {
  return String(value == null ? '' : value).trim();
}

function readJsonFile(filePath) {
  const resolved = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function parseArgs(argv) {
  const out = {
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    enable_provider_search: true,
    source_records: []
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--city') out.market.city = cleanText(next);
    else if (arg === '--county') out.market.county = cleanText(next);
    else if (arg === '--state') out.market.state = cleanText(next).toUpperCase();
    else if (arg === '--limit') out.caps = Object.assign({}, out.caps, { output_deals: Number(next) || 25 });
    else if (arg === '--input-json') {
      const data = readJsonFile(next);
      Object.assign(out, data);
    } else if (arg === '--no-provider') {
      out.enable_provider_search = false;
      i -= 1;
    } else {
      continue;
    }
    if (arg !== '--no-provider') i += 1;
  }
  return out;
}

(async () => {
  try {
    const input = parseArgs(process.argv.slice(2));
    const result = await dealBoard.runFreePublicDealBoardPreview(input, {
      env: process.env,
      fetch_impl: typeof fetch === 'function' ? fetch : null,
      enable_provider_search: input.enable_provider_search === true
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error && error.stack || error}\n`);
    process.exit(1);
  }
})();

