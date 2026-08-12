'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const discovery = require('../scripts/discover-public-parcel-apis');
const countyCandidateRegistry = require('../modules/sources/county-candidate-registry');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); }
  };
}

(async () => {
  const map = new Map();
  map.set('https://example.gov/arcgis/rest/services/Parcels/MapServer/0?f=json', response({
    fields: [
      { name: 'OWNER_NAME' },
      { name: 'MAIL_ADDRESS' },
      { name: 'SITUS_ADDRESS' },
      { name: 'PARCEL_ID' },
      { name: 'SALE_PRICE' },
      { name: 'SALE_DATE' },
      { name: 'LAND_USE' },
      { name: 'YEAR_BUILT' }
    ]
  }));
  map.set('https://example.gov/arcgis/rest/services/Parcels/MapServer/0/query?f=json&where=1%3D1&returnCountOnly=true', response({ count: 123 }));

  const report = await discovery.runDiscovery({
    targets: [{
      market: 'Example',
      purpose: 'recorded_sales',
      service_url: 'https://example.gov/arcgis/rest/services/Parcels/MapServer',
      layer: 0,
      required_capabilities: ['sale_price', 'sale_date', 'comp_location_key']
    }],
    fetch_impl: async (url) => {
      const hit = map.get(String(url));
      if (!hit) throw new Error(`unexpected:${url}`);
      return hit;
    }
  });
  assert.strictEqual(report.results[0].status, 'open');
  assert.strictEqual(report.results[0].record_count, 123);
  assert.strictEqual(report.results[0].exposes_owner_name, true);
  assert.strictEqual(report.results[0].exposes_sale_price, true);
  assert.strictEqual(report.results[0].gate_status, 'open_usable');
  assert.deepStrictEqual(report.results[0].missing_required_capabilities, []);

  const insufficient = await discovery.runDiscovery({
    targets: [{
      market: 'No price',
      purpose: 'recorded_sales',
      service_url: 'https://example.gov/arcgis/rest/services/Parcels/MapServer',
      layer: 0,
      required_capabilities: ['sale_price', 'sale_date', 'comp_location_key']
    }],
    fetch_impl: async (url) => String(url).includes('/query?')
      ? response({ count: 1 })
      : response({ fields: [{ name: 'APN' }, { name: 'DOCDATE' }] })
  });
  assert.strictEqual(insufficient.results[0].gate_status, 'open_insufficient_fields');
  assert.deepStrictEqual(insufficient.results[0].missing_required_capabilities, ['sale_price', 'comp_location_key']);

  const blocked = await discovery.runDiscovery({
    targets: [{ market: 'Blocked', service_url: 'https://blocked.gov/arcgis/rest/services/Parcels/MapServer', layer: 0 }],
    fetch_impl: async () => response('verify you are human', 200)
  });
  assert.strictEqual(blocked.results[0].status, 'blocked');
  assert.strictEqual(blocked.results[0].blocked_reason, 'captcha_or_login_wall');

  const onboardingTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-county-onboarding-'));
  const htmlOnly = await discovery.runCountyOnboardingSweep({
    counties: [
      {
        county: 'Portal Only',
        state: 'XY',
        metro: 'Sample Metro',
        candidate_parcel_hosts: ['https://example.gov/parcel'],
        candidate_sales_hosts: ['https://example.gov/sales'],
        candidate_distress_sources: ['https://example.gov/notices'],
        notes: 'Example county note'
      }
    ],
    output_dir: onboardingTmpDir,
    fetch_impl: async (url) => {
      const text = String(url);
      if (text.includes('/parcel')) return response('<html><body>OWNER TAXPAYER PARCEL MAIL ADDRESS ZIP</body></html>');
      if (text.includes('/sales')) return response('<html><body>SALE DATE PRICE LAND USE APN</body></html>');
      if (text.includes('/notices')) return response('<html><body>FORECLOSURE NOTICE OWNER ADDRESS</body></html>');
      throw new Error(`unexpected:${url}`);
    }
  });
  assert.strictEqual(htmlOnly.preview_only, true);
  assert.strictEqual(htmlOnly.no_global_mutation, true);
  assert.strictEqual(htmlOnly.targets_checked, 1);
  assert.strictEqual(htmlOnly.counties[0].tier, 'BLOCKED');
  assert.strictEqual(htmlOnly.counties[0].status, 'blocked');
  assert.deepStrictEqual(htmlOnly.counties[0].open_legs, []);
  assert.deepStrictEqual(htmlOnly.counties[0].legs[0].results[0].field_map_proposal, {});
  assert.strictEqual(htmlOnly.counties[0].legs[0].results[0].blocked_reason, 'html_portal_no_machine_readable_schema');
  assert.strictEqual(htmlOnly.counties[0].profile_draft.verification_status, 'unverified_no_machine_readable_schema');
  assert.strictEqual(htmlOnly.counties[0].profile_draft.verified_at, null);

  const schemaFor = (url) => {
    const text = String(url);
    if (text.includes('/query?')) return response({ count: 42 });
    if (text.includes('/Sales/')) return response({ fields: [
      { name: 'PARCEL_ID' }, { name: 'SITUS_ADDRESS' }, { name: 'SALE_PRICE' }, { name: 'SALE_DATE' }
    ] });
    if (text.includes('/Notices/')) return response({ fields: [
      { name: 'PARCEL_ID' }, { name: 'SITUS_ADDRESS' }, { name: 'NOTICE_DATE' }
    ] });
    return response({ fields: [
      { name: 'OWNER_NAME' }, { name: 'MAIL_ADDRESS' }, { name: 'SITUS_ADDRESS' }, { name: 'PARCEL_ID' }
    ] });
  };
  const schemaOnboarding = await discovery.runCountyOnboardingSweep({
    counties: [{
      county: 'Wayne',
      state: 'MI',
      metro: 'Detroit',
      candidate_parcel_hosts: ['https://example.gov/arcgis/rest/services/Parcels/FeatureServer/0'],
      candidate_sales_hosts: ['https://example.gov/arcgis/rest/services/Sales/FeatureServer/0'],
      candidate_distress_sources: ['https://example.gov/arcgis/rest/services/Notices/FeatureServer/0'],
      notes: 'Schema fixture'
    }],
    output_dir: onboardingTmpDir,
    fetch_impl: async (url) => schemaFor(url)
  });
  const schemaCounty = schemaOnboarding.counties[0];
  assert.strictEqual(schemaCounty.tier, 'FULL');
  assert.strictEqual(schemaCounty.status, 'live');
  assert.deepStrictEqual(schemaCounty.open_legs, ['parcel', 'sales', 'distress']);
  assert.deepStrictEqual(schemaCounty.closed_legs, []);
  assert.deepStrictEqual(schemaCounty.legs[0].results[0].field_list, ['OWNER_NAME', 'MAIL_ADDRESS', 'SITUS_ADDRESS', 'PARCEL_ID']);
  assert.strictEqual(schemaCounty.legs[0].results[0].field_map_proposal.owner_name, 'OWNER_NAME');
  assert.ok(/^verified_machine_readable_schema_/.test(schemaCounty.profile_draft.verification_status));
  assert.ok(/^exports\/county-onboarding\//.test(schemaCounty.profile_draft.verification_evidence));
  assert.ok(!/^[A-Z]:\\/i.test(schemaCounty.profile_draft.verification_evidence));
  assert.throws(
    () => discovery.validateFieldMapProposal({ owner_name: 'INVENTED_OWNER_FIELD' }, ['OWNER_NAME']),
    /field_map_not_in_schema/
  );
  assert.strictEqual(countyCandidateRegistry.countyOnboardingTier({}, null), 'CANDIDATE');
  assert.strictEqual(countyCandidateRegistry.countyOnboardingStatus({}, null), 'candidate');
  assert.strictEqual(countyCandidateRegistry.countyOnboardingTier({}, schemaCounty), 'FULL');
  assert.strictEqual(countyCandidateRegistry.countyOnboardingStatus({}, schemaCounty), 'live');

  for (const state of ['TX', 'AZ']) {
    const policyResult = await discovery.inspectCountySchemaEndpoint(
      { county: state === 'TX' ? 'Harris' : 'Maricopa', state, metro: state === 'TX' ? 'Houston' : 'Phoenix' },
      { leg: 'sales', kind: 'sales' },
      `https://example.gov/arcgis/rest/services/${state}Sales/FeatureServer/0`,
      { fetch_impl: async (url) => String(url).includes('/query?') ? response({ count: 2 }) : response({ fields: [
        { name: 'PARCEL_ID' }, { name: 'SITUS_ADDRESS' }, { name: 'SALE_PRICE' }, { name: 'SALE_DATE' }
      ] }) }
    );
    assert.strictEqual(policyResult.status, 'closed');
    assert.strictEqual(policyResult.blocked_reason, 'market_comp_policy_disables_public_sales_lane');
  }
  assert.ok(schemaOnboarding.output_path.endsWith('.json'));
  assert.ok(fs.existsSync(schemaOnboarding.output_path), 'county onboarding sweep must write a JSON artifact');
  fs.rmSync(onboardingTmpDir, { recursive: true, force: true });

  console.log('public parcel API discovery tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
