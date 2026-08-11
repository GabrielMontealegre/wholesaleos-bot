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

  const arcgisError = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [profile],
    fetch_impl: async () => response({ error: { code: 400, message: 'Invalid field' } })
  });
  assert.strictEqual(arcgisError.status, 'failed');
  assert.match(arcgisError.blocked_reason, /^arcgis_error_400: Invalid field/);
  const arcgisErrorRun = await ownerLookup.runPublicParcelOwnerLookup({
    rows: [row],
    market: { city: 'San Antonio', county: 'Bexar', state: 'TX' }
  }, {
    profiles: [profile],
    fetch_impl: async () => response({ error: { code: 400, message: 'Invalid field' } })
  });
  assert.strictEqual(arcgisErrorRun.attempt_records[0].outcome, 'FAILED');
  assert.match(arcgisErrorRun.attempt_records[0].reason_code, /^ARCGIS_ERROR_400/);

  const unverifiedFound = await ownerLookup.lookupOwnerForRow(row, {
    profiles: [Object.assign({}, profile, { verification_status: 'unverified_field_map_guess_discovery_timed_out' })],
    fetch_impl: async () => response({ features: [{ attributes: {
      OWNER: 'KILLER CAPITAL CONSULTANTS LLC',
      MAIL1: 'PO BOX 100',
      APN: '12345'
    } }] })
  });
  assert.strictEqual(unverifiedFound.status, 'owner_found');
  assert.strictEqual(unverifiedFound.owner_record.verification_status, 'unverified_field_map_guess_discovery_timed_out');
  assert.match(unverifiedFound.evidence_text, /Profile caveat: unverified_field_map_guess_discovery_timed_out/);

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

  const unverifiedRun = await ownerLookup.runPublicParcelOwnerLookup({
    rows: [row],
    market: { city: 'San Antonio', county: 'Bexar', state: 'TX' }
  }, {
    profiles: [Object.assign({}, profile, { verification_status: 'unverified_field_map_guess_discovery_timed_out' })],
    fetch_impl: async () => response({ features: [{ attributes: { OWNER: 'Jane Owner', MAIL1: '100 Mail St', APN: 'ABC' } }] })
  });
  assert.match(unverifiedRun.attempt_records[0].reason_text, /Profile caveat: unverified_field_map_guess_discovery_timed_out/);

  console.log('public parcel owner lookup tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
