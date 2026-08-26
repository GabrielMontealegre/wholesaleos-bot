'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const marketDemand = require('../modules/research/market-demand-index');
const dataSources = require('../modules/research/market-demand-data-sources');

const root = path.join(__dirname, '..');
const sourceDir = path.resolve(process.argv[2] || path.join(root, '.cache', 'market-demand-source'));
const outputFile = path.resolve(process.argv[3] || path.join(root, 'data', 'market-demand-index.json'));
const fullOutputFile = path.resolve(process.argv[4] || path.join(root, 'data', 'market-demand-index-full.json'));
const PUBLIC_COUNTY_LIMIT = 400;

function read(file) {
  return fs.readFileSync(path.join(sourceDir, file), 'utf8');
}

function workbookRows(file) {
  const workbook = XLSX.readFile(path.join(sourceDir, file));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

const input = {
  county_population: marketDemand.parsePepCountyCsv(read('co-est2025-alldata.csv')),
  county_gazetteer: marketDemand.parseGazetteerText(read(path.join('counties', '2025_Gaz_counties_national.txt'))),
  place_population: marketDemand.parsePepPlaceCsv(read('sub-est2025.csv')),
  place_gazetteer: marketDemand.parseGazetteerText(read(path.join('places', '2025_Gaz_place_national.txt'))),
  rucc: marketDemand.parseRuccCsv(read('rucc.csv')),
  cbsa: marketDemand.parseCbsaRows(workbookRows('list1_2023.xlsx')),
  readiness: dataSources.readinessRegistry()
};

const index = marketDemand.buildMarketDemandIndex(input);
const publicIndex = Object.assign({}, index, {
  artifact_scope: 'top_400_of_all_counties',
  generated_from_county_count: index.county_count,
  returned_count: Math.min(index.counties.length, PUBLIC_COUNTY_LIMIT),
  counties: index.counties.slice(0, PUBLIC_COUNTY_LIMIT)
});
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.mkdirSync(path.dirname(fullOutputFile), { recursive: true });
fs.writeFileSync(fullOutputFile, `${JSON.stringify(index)}\n`);
fs.writeFileSync(outputFile, `${JSON.stringify(publicIndex)}\n`);
console.log(JSON.stringify({
  output_file: outputFile,
  full_output_file: fullOutputFile,
  county_count: index.county_count,
  committed_county_count: publicIndex.returned_count,
  top_20: index.counties.slice(0, 20)
}, null, 2));
