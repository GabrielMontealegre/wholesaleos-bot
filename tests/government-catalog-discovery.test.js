'use strict';

const assert = require('assert');
const discovery = require('../modules/research/government-catalog-discovery');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); }
  };
}

(async () => {
  const calls = [];
  const report = await discovery.discoverGovernmentCatalogs(
    { county: 'Dallas', state: 'TX', city: 'Dallas' },
    {
      now: '2026-09-10T00:00:00.000Z',
      limit_per_catalog: 3,
      data_json_urls: ['https://dallas.gov/data.json'],
      fetch_impl: async (url) => {
        calls.push(String(url));
        if (String(url).includes('arcgis.com/sharing/rest/search')) {
          return response({ results: [{
            id: 'arc-1',
            title: 'Dallas County parcel and tax sale records TX',
            description: 'Official parcel and tax sale layer',
            owner: 'Dallas County',
            tags: ['parcel', 'tax sale'],
            url: 'https://services.dallas.gov/arcgis/rest/services/TaxSale/FeatureServer/0',
            modified: Date.parse('2026-08-01T00:00:00Z')
          }] });
        }
        if (String(url).includes('api.us.socrata.com')) {
          return response({ results: [{ resource: {
            id: 'abcd-1234', domain: 'www.dallasopendata.com',
            name: 'Dallas TX Code Violations', description: 'Dallas County code enforcement records',
            tags: ['code violation'], updatedAt: '2026-08-02T00:00:00Z'
          }, metadata: { domain: 'www.dallasopendata.com' } }] });
        }
        if (String(url).includes('api.gsa.gov/technology/datagov/v4/search')) {
          return response({ results: [{
            slug: 'dallas-county-lien-records', title: 'Dallas County TX lien records',
            description: 'Property lien dataset', publisher: 'Dallas County',
            keyword: ['lien'], last_harvested_date: '2026-08-03T00:00:00Z',
            dcat: {
              modified: '2026-08-02T00:00:00Z',
              distribution: [{ mediaType: 'text/csv', downloadURL: 'https://dallas.gov/liens.csv' }]
            }
          }] });
        }
        if (String(url) === 'https://dallas.gov/data.json') {
          return response({ dataset: [{
            title: 'Dallas County TX probate estate filings', description: 'Probate court estate records',
            publisher: { name: 'Dallas County' }, keyword: ['probate'], modified: '2026-08-04',
            landingPage: 'https://dallas.gov/probate',
            distribution: [{ format: 'JSON', accessURL: 'https://dallas.gov/probate.json' }]
          }] });
        }
        throw new Error(`unexpected:${url}`);
      }
    }
  );

  assert.strictEqual(report.status, 'complete');
  assert.strictEqual(report.catalog_count, 4);
  assert.strictEqual(report.candidate_count, 4);
  assert.strictEqual(report.rejected_count, 0);
  assert.strictEqual(report.preview_only, true);
  assert.strictEqual(report.not_lead_evidence, true);
  assert.strictEqual(report.should_ingest, false);
  assert.strictEqual(report.source_activation_requires_separate_verification, true);
  assert.deepStrictEqual(report.candidates.map((item) => item.catalog_kind), ['arcgis', 'socrata', 'data_gov', 'data_json']);
  assert.ok(calls.some((url) => url.includes('api.gsa.gov/technology/datagov/v4/search')));
  assert.ok(calls.every((url) => !url.includes('catalog.data.gov/api/3/action')));
  assert.ok(report.candidates.every((item) => item.discovery_status === 'candidate_unverified'));
  assert.ok(calls.every((url) => /^https:\/\//.test(url)));

  const rejected = discovery.candidateBase('arcgis', report.market, {
    title: 'Unrelated state traffic counters',
    description: 'Transportation data',
    machine_url: 'https://example.gov/data.json'
  });
  assert.strictEqual(rejected.discovery_status, 'rejected');
  assert.strictEqual(rejected.blocked_reason, 'catalog_result_not_jurisdiction_relevant');

  const html = await discovery.queryDataJsonCatalog(
    report.market,
    'https://dallas.gov/data.json',
    { fetch_impl: async () => response('<html>portal</html>') }
  );
  assert.strictEqual(html.status, 'failed');
  assert.strictEqual(html.blocked_reason, 'html_not_machine_readable_catalog');

  const errorBody = await discovery.queryArcgisCatalog(report.market, {
    fetch_impl: async () => response({ error: { code: 400, message: 'Bad query' } })
  });
  assert.strictEqual(errorBody.status, 'failed');
  assert.strictEqual(errorBody.blocked_reason, 'catalog_error_400:Bad query');

  assert.throws(
    () => discovery.normalizedMarket({ county: 'Dallas', state: '' }),
    /county_and_two_letter_state_required/
  );

  console.log('government catalog discovery tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
