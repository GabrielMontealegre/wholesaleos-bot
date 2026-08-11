'use strict';

const assert = require('assert');
const discovery = require('../scripts/discover-public-parcel-apis');

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
    targets: [{ market: 'Example', service_url: 'https://example.gov/arcgis/rest/services/Parcels/MapServer', layer: 0 }],
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

  const blocked = await discovery.runDiscovery({
    targets: [{ market: 'Blocked', service_url: 'https://blocked.gov/arcgis/rest/services/Parcels/MapServer', layer: 0 }],
    fetch_impl: async () => response('verify you are human', 200)
  });
  assert.strictEqual(blocked.results[0].status, 'blocked');
  assert.strictEqual(blocked.results[0].blocked_reason, 'captcha_or_login_wall');

  console.log('public parcel API discovery tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
