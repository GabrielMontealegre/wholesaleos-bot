'use strict';

const fs = require('fs');
const path = require('path');
const discovery = require('../modules/research/government-catalog-discovery');

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function valuesAfter(args, name) {
  const values = [];
  args.forEach((arg, index) => {
    if (arg === name && args[index + 1]) values.push(args[index + 1]);
  });
  return values;
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const args = process.argv.slice(2);
  const county = valueAfter(args, '--county');
  const state = valueAfter(args, '--state');
  const city = valueAfter(args, '--city');
  const limit = valueAfter(args, '--limit');
  const write = args.includes('--write');
  const report = await discovery.discoverGovernmentCatalogs(
    { county, state, city },
    {
      limit_per_catalog: limit,
      data_json_urls: valuesAfter(args, '--data-json')
    }
  );
  if (!write) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  const outputDir = path.join(process.cwd(), 'exports', 'government-catalog-discovery');
  fs.mkdirSync(outputDir, { recursive: true });
  const file = path.join(outputDir, `${slug(county)}-${slug(state)}-${report.generated_at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${file}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}
