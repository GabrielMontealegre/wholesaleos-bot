'use strict';

const assert = require('assert');
const ownerLookup = require('../modules/research/public-parcel-owner-lookup');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); }
  };
}

(async () => {
  const profile = {
    api_kind: 'arcgis',
    service_url: 'https://public.example.gov/arcgis/rest/services/Parcels/MapServer',
    layer: 0,
    field_map: {
      owner_name: 'OWNER',
      mailing_address: ['MAIL1', 'MAIL_CITY', 'MAIL_STATE', 'MAIL_ZIP'],
      situs_address: 'SITUS',
      parcel_id: 'APN',
      assessed_value: 'TOTAL_VALUE'
    }
  };
  const row = {
    normalized_address: '123 Main St, San Antonio, TX 78201',
    city: 'San Antonio',
    county: 'Bexar',
    state: 'TX'
  };

  const found = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [profile],
    fetch_impl: async (url) => {
      assert.ok(/SITUS/.test(decodeURIComponent(String(url))));
      return response({ features: [{ attributes: {
        OWNER: 'KILLER CAPITAL CONSULTANTS LLC',
        MAIL1: 'PO BOX 100',
        MAIL_CITY: 'SAN ANTONIO',
        MAIL_STATE: 'TX',
        MAIL_ZIP: '78201',
        SITUS: '123 Main St',
        APN: '12345',
        TOTAL_VALUE: 155000
      } }] });
    }
  });
  assert.strictEqual(found.status, 'owner_found');
  assert.strictEqual(found.owner_record.owner_name, 'KILLER CAPITAL CONSULTANTS LLC');
  assert.strictEqual(found.owner_record.is_entity, true);
  assert.strictEqual(found.owner_record.source_kind, 'official_public_record');
  assert.strictEqual(found.mailing_route.route_kind, 'mailing_address');
  assert.strictEqual(found.mailing_route.source_kind, 'official_public_record');

  const ambiguous = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [profile],
    fetch_impl: async () => response({ features: [
      { attributes: { OWNER: 'A', APN: '1' } },
      { attributes: { OWNER: 'B', APN: '2' } }
    ] })
  });
  assert.strictEqual(ambiguous.status, 'ambiguous');

  const noMatch = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [profile],
    fetch_impl: async () => response({ features: [] })
  });
  assert.strictEqual(noMatch.status, 'no_match');

  const blocked = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [profile],
    fetch_impl: async () => response({ error: 'forbidden' }, 403)
  });
  assert.strictEqual(blocked.status, 'blocked');

  const run = await ownerLookup.runPublicParcelOwnerLookup({
    rows: [row],
    market: { city: 'San Antonio', county: 'Bexar', state: 'TX' }
  }, {
    profiles: [profile],
    fetch_impl: async () => response({ features: [{ attributes: { OWNER: 'Jane Owner', MAIL1: '100 Mail St', APN: 'ABC' } }] })
  });
  assert.strictEqual(run.rows_hunted, 1);
  assert.strictEqual(run.attempt_records[0].lane, 'county_appraisal');
  assert.strictEqual(run.attempt_records[0].outcome, 'FOUND');
  assert.strictEqual(run.preview_only, true);

  console.log('public parcel owner lookup tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
